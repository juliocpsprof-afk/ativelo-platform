import {
  useEffect,
  useMemo,
  useState,
} from "react";

import { useAuth } from "../contexts/AuthContext";
import {
  useWorkerSession,
  type WorkerFailureKind,
} from "../contexts/WorkerSessionContext";

function formatCheckedAt(
  value: string | null,
): string | null {
  if (!value) {
    return null;
  }

  return new Intl.DateTimeFormat(
    "pt-BR",
    {
      hour: "2-digit",
      minute: "2-digit",
    },
  ).format(new Date(value));
}

function kindFromStatus(
  status: string,
): WorkerFailureKind {
  if (status === "offline") {
    return "offline";
  }

  if (status === "unauthorized") {
    return "session";
  }

  return "worker";
}

function fallbackPresentation(
  kind: WorkerFailureKind,
) {
  if (kind === "offline") {
    return {
      title:
        "Sem conexão com a internet",
      message:
        "O Ativelo tentará reconectar automaticamente quando a internet voltar.",
      retryLabel:
        "Verificar conexão",
    };
  }

  if (kind === "session") {
    return {
      title:
        "Sessão não confirmada",
      message:
        "O Ativelo tentou renovar a sessão. Entre novamente se o problema continuar.",
      retryLabel:
        "Renovar sessão",
    };
  }

  if (kind === "timeout") {
    return {
      title:
        "Resposta demorada",
      message:
        "O serviço está lento. Tente novamente em alguns instantes.",
      retryLabel:
        "Tentar novamente",
    };
  }

  return {
    title:
      "Serviço seguro indisponível",
    message:
      "A API não respondeu. As funções diretas do Supabase podem continuar disponíveis.",
    retryLabel:
      "Testar novamente",
  };
}

export default function WorkerSessionStatus() {
  const { session } = useAuth();

  const {
    status,
    message,
    checkedAt,
    notice,
    refresh,
    dismissNotice,
  } = useWorkerSession();

  const [isExpanded, setIsExpanded] =
    useState(false);

  useEffect(() => {
    if (notice) {
      setIsExpanded(true);
    }
  }, [notice]);

  const kind =
    notice?.kind ??
    kindFromStatus(status);

  const fallback =
    useMemo(
      () =>
        fallbackPresentation(kind),
      [kind],
    );

  if (
    !session ||
    status === "idle" ||
    status === "checking" ||
    status === "authenticated"
  ) {
    return null;
  }

  const checked =
    formatCheckedAt(checkedAt);

  const close = () => {
    setIsExpanded(false);
    dismissNotice();
  };

  const retry = () => {
    setIsExpanded(false);
    dismissNotice();
    refresh();
  };

  return (
    <aside
      className={[
        "ativelo-api-indicator",
        `ativelo-api-indicator--${kind}`,
        isExpanded
          ? "is-expanded"
          : "",
      ]
        .filter(Boolean)
        .join(" ")}
      aria-live={
        notice ? "assertive" : "polite"
      }
    >
      <button
        type="button"
        className="ativelo-api-indicator__dot"
        aria-label={
          notice?.title ??
          fallback.title
        }
        title={
          notice?.title ??
          fallback.title
        }
        onClick={() =>
          setIsExpanded(
            (current) => !current,
          )
        }
      >
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            d="M12 8v5m0 3.5v.1M10.3 3.9 2.4 17.5A2 2 0 0 0 4.1 20h15.8a2 2 0 0 0 1.7-2.5L13.7 3.9a2 2 0 0 0-3.4 0Z"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
          />
        </svg>
      </button>

      {isExpanded && (
        <section
          className="ativelo-api-indicator__panel"
          role={
            notice ? "alert" : "status"
          }
        >
          <header>
            <div>
              {notice?.operation && (
                <span>
                  {notice.operation}
                </span>
              )}

              <strong>
                {notice?.title ??
                  fallback.title}
              </strong>
            </div>

            <button
              type="button"
              className="ativelo-api-indicator__close"
              aria-label="Fechar aviso"
              onClick={close}
            >
              ×
            </button>
          </header>

          <p>
            {notice?.message ??
              message ??
              fallback.message}
          </p>

          {checked && (
            <small>
              Última verificação: {checked}
            </small>
          )}

          <footer>
            <button
              type="button"
              className="ativelo-api-indicator__retry"
              onClick={retry}
            >
              {fallback.retryLabel}
            </button>
          </footer>
        </section>
      )}
    </aside>
  );
}