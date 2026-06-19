const DEFAULT_ATIVELO_API_URL =
  "https://ativelo-api.ativeloapp.workers.dev";

const configuredApiUrl =
  import.meta.env
    .VITE_ATIVELO_API_URL?.trim();

export const ativeloApiUrl = (
  configuredApiUrl ||
  DEFAULT_ATIVELO_API_URL
).replace(/\/+$/, "");

export type WorkerAuthenticatedUser = {
  id: string;
  email: string | null;
  phone: string | null;
  audience: string | null;
  role: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  lastSignInAt: string | null;
  appMetadata: Record<string, unknown>;
  userMetadata: Record<string, unknown>;
};

type ApiErrorBody = {
  error?: {
    code?: string;
    message?: string;
  };
};

type AuthenticatedUserResponse = {
  ok: true;
  user: WorkerAuthenticatedUser;
};

export type AtiveloApiFailureDetail = {
  operation: string;
  path: string;
  error: unknown;
  occurredAt: string;
};

export type AtiveloApiRequestOptions = {
  operation?: string;
  silent?: boolean;
};

export const ATIVELO_API_FAILURE_EVENT =
  "ativelo:api-required-failure";

export class AtiveloApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(
    status: number,
    code: string,
    message: string,
  ) {
    super(message);
    this.name = "AtiveloApiError";
    this.status = status;
    this.code = code;
  }
}

function createRequestId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }

  return `ativelo-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}`;
}

async function parseResponseBody(
  response: Response,
): Promise<unknown> {
  const contentType =
    response.headers.get("content-type") ?? "";

  if (!contentType.includes("application/json")) {
    return null;
  }

  try {
    return await response.json();
  } catch {
    return null;
  }
}

function isAbortError(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    error.name === "AbortError"
  );
}

export function notifyAtiveloApiRequiredFailure(
  detail: AtiveloApiFailureDetail,
): void {
  if (
    typeof window === "undefined" ||
    isAbortError(detail.error)
  ) {
    return;
  }

  window.dispatchEvent(
    new CustomEvent<AtiveloApiFailureDetail>(
      ATIVELO_API_FAILURE_EVENT,
      { detail },
    ),
  );
}

export async function requestAtiveloApi<T>(
  path: string,
  accessToken: string,
  signal?: AbortSignal,
  options: AtiveloApiRequestOptions = {},
): Promise<T> {
  const normalizedPath =
    path.startsWith("/") ? path : `/${path}`;

  const operation =
    options.operation ??
    "Conectar ao serviço seguro";

  let response: Response;

  try {
    response = await fetch(
      `${ativeloApiUrl}${normalizedPath}`,
      {
        method: "GET",
        headers: {
          Accept: "application/json",
          Authorization:
            `Bearer ${accessToken}`,
          "X-Request-Id": createRequestId(),
        },
        cache: "no-store",
        credentials: "omit",
        referrerPolicy: "no-referrer",
        signal,
      },
    );
  } catch (error) {
    if (!options.silent) {
      notifyAtiveloApiRequiredFailure({
        operation,
        path: normalizedPath,
        error,
        occurredAt: new Date().toISOString(),
      });
    }

    throw error;
  }

  const body = await parseResponseBody(response);

  if (!response.ok) {
    const errorBody =
      body as ApiErrorBody | null;

    const error =
      new AtiveloApiError(
        response.status,
        errorBody?.error?.code ??
          "api_request_failed",
        errorBody?.error?.message ??
          "A API segura do Ativelo não respondeu como esperado.",
      );

    if (!options.silent) {
      notifyAtiveloApiRequiredFailure({
        operation,
        path: normalizedPath,
        error,
        occurredAt: new Date().toISOString(),
      });
    }

    throw error;
  }

  return body as T;
}

export async function getWorkerAuthenticatedUser(
  accessToken: string,
  signal?: AbortSignal,
): Promise<WorkerAuthenticatedUser> {
  const response =
    await requestAtiveloApi<AuthenticatedUserResponse>(
      "/auth/me",
      accessToken,
      signal,
      {
        operation: "Validar a sessão",
        silent: true,
      },
    );

  return response.user;
}