import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";

import {
  AtiveloApiError,
  getWorkerAuthenticatedUser,
  type WorkerAuthenticatedUser,
} from "../lib/ativeloApi";
import { supabase } from "../lib/supabase";
import { useAuth } from "./AuthContext";

export type WorkerSessionStatus =
  | "idle"
  | "checking"
  | "authenticated"
  | "unauthorized"
  | "unavailable";

type WorkerSessionContextValue = {
  status: WorkerSessionStatus;
  workerUser: WorkerAuthenticatedUser | null;
  message: string | null;
  checkedAt: string | null;
  refresh: () => void;
};

const WorkerSessionContext =
  createContext<WorkerSessionContextValue | null>(null);

function getErrorMessage(error: unknown): string {
  if (error instanceof AtiveloApiError) {
    return error.message;
  }

  if (error instanceof DOMException && error.name === "AbortError") {
    return "A verificação da sessão foi interrompida.";
  }

  if (error instanceof TypeError) {
    return "A API segura está temporariamente indisponível.";
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Não foi possível confirmar a sessão na API segura.";
}

export function WorkerSessionProvider({
  children,
}: PropsWithChildren) {
  const { session } = useAuth();

  const [status, setStatus] =
    useState<WorkerSessionStatus>("idle");
  const [workerUser, setWorkerUser] =
    useState<WorkerAuthenticatedUser | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);
  const [refreshVersion, setRefreshVersion] = useState(0);

  const refresh = useCallback(() => {
    setRefreshVersion((current) => current + 1);
  }, []);

  useEffect(() => {
    const accessToken = session?.access_token;

    if (!accessToken) {
      setStatus("idle");
      setWorkerUser(null);
      setMessage(null);
      setCheckedAt(null);
      return;
    }

    const controller = new AbortController();
    let isMounted = true;

    const validateSession = async () => {
      setStatus("checking");
      setMessage(null);

      try {
        let currentAccessToken = accessToken;
        let authenticatedUser: WorkerAuthenticatedUser;

        try {
          authenticatedUser =
            await getWorkerAuthenticatedUser(
              currentAccessToken,
              controller.signal,
            );
        } catch (error) {
          if (
            !(error instanceof AtiveloApiError) ||
            error.status !== 401
          ) {
            throw error;
          }

          const {
            data: refreshedData,
            error: refreshError,
          } = await supabase.auth.refreshSession();

          if (
            refreshError ||
            !refreshedData.session?.access_token
          ) {
            throw new AtiveloApiError(
              401,
              "session_refresh_failed",
              "Sua sessão não pôde ser renovada. Entre novamente.",
            );
          }

          currentAccessToken =
            refreshedData.session.access_token;

          authenticatedUser =
            await getWorkerAuthenticatedUser(
              currentAccessToken,
              controller.signal,
            );
        }

        if (!isMounted || controller.signal.aborted) {
          return;
        }

        setWorkerUser(authenticatedUser);
        setStatus("authenticated");
        setMessage("Sessão confirmada pela API segura.");
        setCheckedAt(new Date().toISOString());
      } catch (error) {
        if (!isMounted || controller.signal.aborted) {
          return;
        }

        setWorkerUser(null);
        setCheckedAt(new Date().toISOString());
        setMessage(getErrorMessage(error));

        if (
          error instanceof AtiveloApiError &&
          error.status === 401
        ) {
          setStatus("unauthorized");
          return;
        }

        setStatus("unavailable");
      }
    };

    void validateSession();

    return () => {
      isMounted = false;
      controller.abort();
    };
  }, [refreshVersion, session?.access_token]);

  const value = useMemo<WorkerSessionContextValue>(
    () => ({
      status,
      workerUser,
      message,
      checkedAt,
      refresh,
    }),
    [
      checkedAt,
      message,
      refresh,
      status,
      workerUser,
    ],
  );

  return (
    <WorkerSessionContext.Provider value={value}>
      {children}
    </WorkerSessionContext.Provider>
  );
}

export function useWorkerSession() {
  const context = useContext(WorkerSessionContext);

  if (!context) {
    throw new Error(
      "useWorkerSession precisa ser utilizado dentro de WorkerSessionProvider.",
    );
  }

  return context;
}