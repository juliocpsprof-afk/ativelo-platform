import { ativeloApiUrl } from "./ativeloApi";

const MUTATION_METHODS =
  new Set([
    "POST",
    "PATCH",
    "PUT",
    "DELETE",
  ]);

function createRequestId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID ===
      "function"
  ) {
    return crypto.randomUUID();
  }

  return `ativelo-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}`;
}

function headersFrom(
  input:
    | RequestInfo
    | URL,
  init?: RequestInit,
): Headers {
  const headers =
    input instanceof Request
      ? new Headers(input.headers)
      : new Headers();

  new Headers(init?.headers).forEach(
    (value, name) => {
      headers.set(name, value);
    },
  );

  return headers;
}

function requestMethod(
  input:
    | RequestInfo
    | URL,
  init?: RequestInit,
): string {
  const method =
    init?.method ??
    (
      input instanceof Request
        ? input.method
        : "GET"
    );

  return method.toUpperCase();
}

function requestUrl(
  input:
    | RequestInfo
    | URL,
): URL | null {
  try {
    if (input instanceof Request) {
      return new URL(input.url);
    }

    return new URL(
      String(input),
    );
  } catch {
    return null;
  }
}

function operationOrigin(
  url: URL,
): {
  origin: string;
  resource: string;
} {
  const marker = "/rest/v1/";
  const index =
    url.pathname.indexOf(marker);
  const resource =
    index >= 0
      ? decodeURIComponent(
          url.pathname.slice(
            index + marker.length,
          ),
        )
      : url.pathname;

  const origin =
    resource.startsWith("rpc/")
      ? `frontend:rpc:${resource.slice(4)}`
      : `frontend:table:${resource}`;

  return {
    origin:
      origin.slice(0, 160),
    resource:
      resource.slice(0, 300),
  };
}

async function registerContext(
  accessToken: string,
  requestId: string,
  origin: string,
  method: string,
  resource: string,
): Promise<void> {
  const controller =
    new AbortController();

  const timeout =
    window.setTimeout(
      () => controller.abort(),
      1800,
    );

  try {
    await fetch(
      `${ativeloApiUrl}/audit/context`,
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          Authorization:
            `Bearer ${accessToken}`,
          "Content-Type":
            "application/json",
          "X-Request-Id":
            requestId,
        },
        body: JSON.stringify({
          requestId,
          origin,
          httpMethod: method,
          resource,
        }),
        cache: "no-store",
        credentials: "omit",
        referrerPolicy:
          "no-referrer",
        signal: controller.signal,
      },
    );
  } catch {
    // A auditoria nunca deve impedir a
    // operação principal do usuário.
  } finally {
    window.clearTimeout(timeout);
  }
}

export async function auditedSupabaseFetch(
  input:
    | RequestInfo
    | URL,
  init?: RequestInit,
): Promise<Response> {
  const url = requestUrl(input);
  const method =
    requestMethod(input, init);

  if (
    !url ||
    !MUTATION_METHODS.has(method) ||
    !url.pathname.includes(
      "/rest/v1/",
    )
  ) {
    return fetch(input, init);
  }

  const headers =
    headersFrom(input, init);

  const authorization =
    headers.get("Authorization");

  const tokenMatch =
    authorization?.match(
      /^Bearer\s+(.+)$/i,
    );

  const accessToken =
    tokenMatch?.[1]?.trim();

  if (!accessToken) {
    return fetch(input, {
      ...init,
      headers,
    });
  }

  const requestId =
    createRequestId();

  const clientInfo =
    headers.get(
      "X-Client-Info",
    ) ?? "";

  headers.set(
    "X-Client-Info",
    `${clientInfo} ativelo-rid/${requestId}`.trim(),
  );

  const operation =
    operationOrigin(url);

  await registerContext(
    accessToken,
    requestId,
    operation.origin,
    method,
    operation.resource,
  );

  return fetch(input, {
    ...init,
    headers,
  });
}