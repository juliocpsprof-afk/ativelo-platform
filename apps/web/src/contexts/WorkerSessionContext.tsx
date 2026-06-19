import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";

import {
  ATIVELO_API_FAILURE_EVENT,
  AtiveloApiError,
  getWorkerAuthenticatedUser,
  type AtiveloApiFailureDetail,
  type WorkerAuthenticatedUser,
} from "../lib/ativeloApi";
import { supabase } from "../lib/supabase";
import { useAuth } from "./AuthContext";

export type WorkerSessionStatus =
  | "idle"
  | "checking"
  | "authenticated"
  | "offline"
  | "unauthorized"
  | "unavailable";

export type WorkerFailureKind =
  | "offline"
  | "session"
  | "timeout"
  | "worker"
  | "unknown";

export type WorkerApiNotice = {
  id: string;
  operation: string;
  kind: WorkerFailureKind;
  title: string;
  message: string;
  createdAt: string;
};

type PendingOperation = {
  operation: string;
  error: unknown;
  createdAt: string;
};

type WorkerSessionContextValue = {
  status: WorkerSessionStatus;
  workerUser: WorkerAuthenticatedUser | null;
  message: string | null;
  checkedAt: string | null;
  notice: WorkerApiNotice | null;
  refresh: () => void;
  dismissNotice: () => void;
};

const WorkerSessionContext =
  createContext<WorkerSessionContextValue | null>(
    null,
  );

const RETRY_DELAYS = [0, 1200, 3200] as const;
const REQUEST_TIMEOUT_MS = 7000;
const STALE_AFTER_MS = 5 * 60 * 1000;

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, milliseconds);
  });
}

function classifyFailure(
  error: unknown,
): WorkerFailureKind {
  if (
    typeof navigator !== "undefined" &&
    navigator.onLine === false
  ) {
    return "offline";
  }

  if (
    error instanceof DOMException &&
    error.name === "AbortError"
  ) {
    return "timeout";
  }

  if (error instanceof AtiveloApiError) {
    if (
      error.status === 401 ||
      error.status === 403
    ) {
      return "session";
    }

    if (
      error.status >= 500 ||
      error.status === 404
    ) {
      return "worker";
    }
  }

  if (error instanceof TypeError) {
    return "worker";
  }

  return "unknown";
}

function statusForFailure(
  kind: WorkerFailureKind,
): WorkerSessionStatus {
  if (kind === "offline") {
    return "offline";
  }

  if (kind === "session") {
    return "unauthorized";
  }

  return "unavailable";
}

function titleForFailure(
  kind: WorkerFailureKind,
): string {
  if (kind === "offline") {
    return "Sem conexão com a internet";
  }

  if (kind === "session") {
    return "Sua sessão precisa ser renovada";
  }

  if (kind === "timeout") {
    return "O serviço demorou para responder";
  }

  if (kind === "worker") {
    return "Serviço seguro temporariamente indisponível";
  }

  return "Não foi possível concluir a operação";
}

function messageForFailure(
  kind: WorkerFailureKind,
  error?: unknown,
): string {
  if (kind === "offline") {
    return "Verifique o Wi-Fi ou os dados móveis. O Ativelo tentará reconectar quando a internet voltar.";
  }

  if (kind === "session") {
    return "A sessão expirou ou não pôde ser renovada. Entre novamente caso a próxima tentativa não funcione.";
  }

  if (kind === "timeout") {
    return "A conexão está lenta ou o serviço está ocupado. Tente novamente em alguns instantes.";
  }

  if (kind === "worker") {
    return "O Cloudflare Worker não respondeu. As funções diretas do Supabase podem continuar disponíveis.";
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Tente novamente. Se o problema continuar, atualize o aplicativo.";
}

function passiveMessage(
  kind: WorkerFailureKind,
): string {
  if (kind === "offline") {
    return "Internet indisponível.";
  }

  if (kind === "session") {
    return "Sessão não confirmada.";
  }

  if (kind === "timeout") {
    return "A API demorou para responder.";
  }

  return "A API segura não respondeu.";
}

function noticeId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }

  return `notice-${Date.now()}`;
}

export function WorkerSessionProvider({
  children,
}: PropsWithChildren) {
  const { session } = useAuth();

  const [status, setStatus] =
    useState<WorkerSessionStatus>("idle");

  const [workerUser, setWorkerUser] =
    useState<WorkerAuthenticatedUser | null>(
      null,
    );

  const [message, setMessage] =
    useState<string | null>(null);

  const [checkedAt, setCheckedAt] =
    useState<string | null>(null);

  const [notice, setNotice] =
    useState<WorkerApiNotice | null>(null);

  const [refreshVersion, setRefreshVersion] =
    useState(0);

  const checkedAtRef =
    useRef<string | null>(null);

  const pendingOperationRef =
    useRef<PendingOperation | null>(null);

  const refresh = useCallback(() => {
    setNotice(null);
    setRefreshVersion((current) => current + 1);
  }, []);

  const dismissNotice = useCallback(() => {
    setNotice(null);
    pendingOperationRef.current = null;
  }, []);

  useEffect(() => {
    checkedAtRef.current = checkedAt;
  }, [checkedAt]);

  useEffect(() => {
    const handleRequiredFailure = (
      event: Event,
    ) => {
      const detail =
        (
          event as CustomEvent<
            AtiveloApiFailureDetail
          >
        ).detail;

      pendingOperationRef.current = {
        operation: detail.operation,
        error: detail.error,
        createdAt: detail.occurredAt,
      };

      setNotice(null);
      setRefreshVersion(
        (current) => current + 1,
      );
    };

    window.addEventListener(
      ATIVELO_API_FAILURE_EVENT,
      handleRequiredFailure,
    );

    return () => {
      window.removeEventListener(
        ATIVELO_API_FAILURE_EVENT,
        handleRequiredFailure,
      );
    };
  }, []);

  useEffect(() => {
    const accessToken = session?.access_token;

    if (!accessToken) {
      setStatus("idle");
      setWorkerUser(null);
      setMessage(null);
      setCheckedAt(null);
      setNotice(null);
      pendingOperationRef.current = null;
      return;
    }

    let disposed = false;
    let activeController:
      | AbortController
      | null = null;

    const requestUser = async (
      token: string,
    ): Promise<WorkerAuthenticatedUser> => {
      activeController =
        new AbortController();

      const timeout =
        window.setTimeout(
          () => activeController?.abort(),
          REQUEST_TIMEOUT_MS,
        );

      try {
        return await getWorkerAuthenticatedUser(
          token,
          activeController.signal,
        );
      } finally {
        window.clearTimeout(timeout);
      }
    };

    const validateSession = async () => {
      setStatus("checking");
      setMessage(null);

      let currentToken = accessToken;
      let sessionRefreshed = false;
      let lastError: unknown =
        new Error("A API segura não respondeu.");

      for (
        let attempt = 0;
        attempt < RETRY_DELAYS.length;
        attempt += 1
      ) {
        const wait = RETRY_DELAYS[attempt];

        if (wait > 0) {
          await delay(wait);
        }

        if (disposed) {
          return;
        }

        try {
          const user =
            await requestUser(currentToken);

          if (disposed) {
            return;
          }

          setWorkerUser(user);
          setStatus("authenticated");
          setMessage(null);

          const now =
            new Date().toISOString();

          setCheckedAt(now);
          pendingOperationRef.current = null;
          setNotice(null);
          return;
        } catch (error) {
          lastError = error;

          if (
            error instanceof AtiveloApiError &&
            error.status === 401 &&
            !sessionRefreshed
          ) {
            const {
              data,
              error: refreshError,
            } =
              await supabase.auth
                .refreshSession();

            if (
              !refreshError &&
              data.session?.access_token
            ) {
              currentToken =
                data.session.access_token;

              sessionRefreshed = true;
              continue;
            }

            lastError =
              new AtiveloApiError(
                401,
                "session_refresh_failed",
                "Sua sessão não pôde ser renovada.",
              );

            break;
          }

          if (
            classifyFailure(error) ===
              "session"
          ) {
            break;
          }
        }
      }

      if (disposed) {
        return;
      }

      const kind =
        classifyFailure(lastError);

      const now =
        new Date().toISOString();

      setWorkerUser(null);
      setCheckedAt(now);
      setStatus(statusForFailure(kind));
      setMessage(passiveMessage(kind));

      const pending =
        pendingOperationRef.current;

      if (pending) {
        setNotice({
          id: noticeId(),
          operation: pending.operation,
          kind,
          title: titleForFailure(kind),
          message: messageForFailure(
            kind,
            pending.error,
          ),
          createdAt: pending.createdAt,
        });
      }
    };

    void validateSession();

    return () => {
      disposed = true;
      activeController?.abort();
    };
  }, [
    refreshVersion,
    session?.access_token,
  ]);

  useEffect(() => {
    if (!session?.access_token) {
      return;
    }

    const reconnect = () => {
      setRefreshVersion(
        (current) => current + 1,
      );
    };

    const handleVisible = () => {
      if (
        document.visibilityState !==
          "visible"
      ) {
        return;
      }

      const lastCheck =
        checkedAtRef.current
          ? new Date(
              checkedAtRef.current,
            ).getTime()
          : 0;

      if (
        Date.now() - lastCheck >
        STALE_AFTER_MS
      ) {
        reconnect();
      }
    };

    window.addEventListener(
      "online",
      reconnect,
    );

    window.addEventListener(
      "focus",
      handleVisible,
    );

    document.addEventListener(
      "visibilitychange",
      handleVisible,
    );

    return () => {
      window.removeEventListener(
        "online",
        reconnect,
      );

      window.removeEventListener(
        "focus",
        handleVisible,
      );

      document.removeEventListener(
        "visibilitychange",
        handleVisible,
      );
    };
  }, [session?.access_token]);

  const value =
    useMemo<WorkerSessionContextValue>(
      () => ({
        status,
        workerUser,
        message,
        checkedAt,
        notice,
        refresh,
        dismissNotice,
      }),
      [
        checkedAt,
        dismissNotice,
        message,
        notice,
        refresh,
        status,
        workerUser,
      ],
    );

  return (
    <WorkerSessionContext.Provider
      value={value}
    >
      {children}
    </WorkerSessionContext.Provider>
  );
}

export function useWorkerSession() {
  const context =
    useContext(WorkerSessionContext);

  if (!context) {
    throw new Error(
      "useWorkerSession precisa ser utilizado dentro de WorkerSessionProvider.",
    );
  }

  return context;
}