import {
  ativeloApiUrl,
  AtiveloApiError,
} from "./ativeloApi";
import { supabase } from "./supabase";

export type AuditClientEvent = {
  action: string;
  entityType: string;
  entityId?: string | null;
  entityLabel?: string | null;
  metadata?: Record<
    string,
    unknown
  >;
};

type AuditResponse = {
  ok: true;
  recorded: number;
};

function requestId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID ===
      "function"
  ) {
    return crypto.randomUUID();
  }

  return `ativelo-audit-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}`;
}

async function accessToken(): Promise<string> {
  const session =
    await supabase.auth.getSession();

  if (
    session.data.session
      ?.access_token
  ) {
    return session.data.session
      .access_token;
  }

  const refreshed =
    await supabase.auth
      .refreshSession();

  if (
    refreshed.error ||
    !refreshed.data.session
      ?.access_token
  ) {
    throw new AtiveloApiError(
      401,
      "session_unavailable",
      "Sua sessão não está disponível.",
    );
  }

  return refreshed.data.session
    .access_token;
}

export async function recordAuditEvents(
  organizationId: string,
  events: AuditClientEvent[],
  origin: string,
): Promise<number> {
  if (events.length === 0) {
    return 0;
  }

  const token =
    await accessToken();

  const response = await fetch(
    `${ativeloApiUrl}/audit/events`,
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization:
          `Bearer ${token}`,
        "Content-Type":
          "application/json",
        "X-Request-Id":
          requestId(),
      },
      body: JSON.stringify({
        organizationId,
        events:
          events.slice(0, 100),
        origin,
      }),
      cache: "no-store",
      credentials: "omit",
      referrerPolicy:
        "no-referrer",
    },
  );

  let body:
    | AuditResponse
    | {
        error?: {
          code?: string;
          message?: string;
        };
      }
    | null = null;

  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (!response.ok) {
    throw new AtiveloApiError(
      response.status,
      body &&
        "error" in body
        ? body.error?.code ??
            "audit_failed"
        : "audit_failed",
      body &&
        "error" in body
        ? body.error?.message ??
            "Não foi possível registrar a auditoria."
        : "Não foi possível registrar a auditoria.",
    );
  }

  return (
    body &&
    "recorded" in body
      ? body.recorded
      : events.length
  );
}