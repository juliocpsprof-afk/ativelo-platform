import { useMemo } from "react";

import { useAuth } from "../contexts/AuthContext";
import { useWorkerSession } from "../contexts/WorkerSessionContext";

function formatCheckedAt(value: string | null): string | null {
  if (!value) {
    return null;
  }

  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export default function WorkerSessionStatus() {
  const { session } = useAuth();
  const {
    status,
    message,
    checkedAt,
    refresh,
  } = useWorkerSession();

  const presentation = useMemo(() => {
    if (status === "checking") {
      return {
        label: "Validando API segura",
        detail: "Confirmando sua sessão...",
        tone: "checking",
      };
    }

    if (status === "authenticated") {
      return {
        label: "API segura conectada",
        detail: "Sessão confirmada pelo Worker.",
        tone: "authenticated",
      };
    }

    if (status === "unauthorized") {
      return {
        label: "Sessão não confirmada",
        detail:
          message ??
          "Atualize a sessão ou entre novamente.",
        tone: "warning",
      };
    }

    return {
      label: "API segura indisponível",
      detail:
        message ??
        "A conexão poderá ser testada novamente.",
      tone: "unavailable",
    };
  }, [message, status]);

  if (!session || status === "idle") {
    return null;
  }

  const formattedCheckedAt = formatCheckedAt(checkedAt);
  const canRetry =
    status === "unauthorized" ||
    status === "unavailable";

  return (
    <aside
      className={`ativelo-worker-status ativelo-worker-status--${presentation.tone}`}
      aria-live="polite"
      aria-atomic="true"
    >
      <span
        className="ativelo-worker-status__signal"
        aria-hidden="true"
      />

      <div className="ativelo-worker-status__content">
        <strong>{presentation.label}</strong>
        <span>{presentation.detail}</span>

        {formattedCheckedAt && (
          <small>
            Verificado às {formattedCheckedAt}
          </small>
        )}
      </div>

      {canRetry && (
        <button
          type="button"
          onClick={refresh}
        >
          Testar novamente
        </button>
      )}
    </aside>
  );
}