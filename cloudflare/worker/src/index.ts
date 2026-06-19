import { handleAgentControlRequest } from "./agentControl";

interface AtiveloEnv {
  APP_ENV?: string;
  ALLOWED_ORIGIN?: string;
  SUPABASE_URL: string;
  SUPABASE_PUBLISHABLE_KEY: string;
}

interface AtiveloScheduledController {
  cron: string;
  scheduledTime: number;
}

interface AtiveloQueueMessage<T> {
  body: T;
  ack(): void;
  retry(): void;
}

interface AtiveloMessageBatch<T> {
  queue: string;
  messages: Array<AtiveloQueueMessage<T>>;
}

interface AtiveloExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
}

interface AtiveloJob {
  id?: string;
  type?: string;
  organizationId?: string;
  createdAt?: string;
  payload?: unknown;
}

interface SupabaseUser {
  id: string;
  email?: string;
  phone?: string;
  aud?: string;
  role?: string;
  created_at?: string;
  updated_at?: string;
  last_sign_in_at?: string;
  app_metadata?: Record<string, unknown>;
  user_metadata?: Record<string, unknown>;
}

type AuthenticationResult =
  | {
      ok: true;
      user: SupabaseUser;
      accessToken: string;
    }
  | {
      ok: false;
      status: number;
      code: string;
      message: string;
    };

function getAllowedOrigin(
  request: Request,
  env: AtiveloEnv,
): string | null {
  const requestOrigin =
    request.headers.get("Origin");
  const configuredOrigin =
    env.ALLOWED_ORIGIN?.trim();

  if (!requestOrigin) {
    return null;
  }

  if (
    configuredOrigin &&
    requestOrigin === configuredOrigin
  ) {
    return configuredOrigin;
  }

  return "";
}

function getCorsHeaders(
  request: Request,
  env: AtiveloEnv,
): HeadersInit {
  const allowedOrigin =
    getAllowedOrigin(request, env);

  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers":
      "Authorization, Content-Type, X-Request-Id, X-Ativelo-Agent-Id, X-Ativelo-Agent-Key",
    "Access-Control-Allow-Methods":
      "GET, POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Cache-Control": "no-store",
    "Content-Type":
      "application/json; charset=utf-8",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
  };

  if (allowedOrigin) {
    headers["Access-Control-Allow-Origin"] =
      allowedOrigin;
    headers.Vary = "Origin";
  }

  return headers;
}

function jsonResponse(
  request: Request,
  env: AtiveloEnv,
  body: unknown,
  status = 200,
): Response {
  return new Response(
    JSON.stringify(body),
    {
      status,
      headers:
        getCorsHeaders(request, env),
    },
  );
}

function getBearerToken(
  request: Request,
): string | null {
  const authorization =
    request.headers.get("Authorization");

  if (!authorization) {
    return null;
  }

  const match =
    authorization.match(
      /^Bearer\s+(.+)$/i,
    );

  return match?.[1]?.trim() || null;
}

function isSupabaseConfigured(
  env: AtiveloEnv,
): boolean {
  return Boolean(
    env.SUPABASE_URL?.trim() &&
      env.SUPABASE_PUBLISHABLE_KEY?.trim(),
  );
}

async function authenticateUser(
  request: Request,
  env: AtiveloEnv,
): Promise<AuthenticationResult> {
  if (!isSupabaseConfigured(env)) {
    console.error(
      "Supabase secrets are not configured.",
    );

    return {
      ok: false,
      status: 503,
      code:
        "auth_configuration_unavailable",
      message:
        "O serviço de autenticação está temporariamente indisponível.",
    };
  }

  const accessToken =
    getBearerToken(request);

  if (!accessToken) {
    return {
      ok: false,
      status: 401,
      code: "missing_bearer_token",
      message:
        "Token de acesso não informado.",
    };
  }

  const supabaseUrl =
    env.SUPABASE_URL.replace(/\/+$/, "");

  const response = await fetch(
    `${supabaseUrl}/auth/v1/user`,
    {
      method: "GET",
      headers: {
        apikey:
          env.SUPABASE_PUBLISHABLE_KEY,
        Authorization:
          `Bearer ${accessToken}`,
        Accept: "application/json",
      },
    },
  );

  if (!response.ok) {
    if (response.status >= 500) {
      console.error(
        JSON.stringify({
          event:
            "ativelo.auth.provider_error",
          status: response.status,
        }),
      );

      return {
        ok: false,
        status: 503,
        code:
          "auth_provider_unavailable",
        message:
          "O serviço de autenticação está temporariamente indisponível.",
      };
    }

    return {
      ok: false,
      status: 401,
      code:
        "invalid_or_expired_token",
      message:
        "Token inválido ou expirado.",
    };
  }

  const user =
    (await response.json()) as SupabaseUser;

  if (!user?.id) {
    return {
      ok: false,
      status: 401,
      code: "invalid_user",
      message:
        "Não foi possível identificar o usuário.",
    };
  }

  return {
    ok: true,
    user,
    accessToken,
  };
}

function getSafeUser(
  user: SupabaseUser,
): Record<string, unknown> {
  return {
    id: user.id,
    email: user.email ?? null,
    phone: user.phone ?? null,
    audience: user.aud ?? null,
    role: user.role ?? null,
    createdAt: user.created_at ?? null,
    updatedAt: user.updated_at ?? null,
    lastSignInAt:
      user.last_sign_in_at ?? null,
    appMetadata:
      user.app_metadata ?? {},
    userMetadata:
      user.user_metadata ?? {},
  };
}

function cleanText(
  value: unknown,
  maximum: number,
): string {
  return String(value ?? "")
    .trim()
    .slice(0, maximum);
}

function getClientIp(
  request: Request,
): string {
  return (
    request.headers.get(
      "CF-Connecting-IP",
    ) ||
    request.headers.get("X-Real-IP") ||
    ""
  );
}

async function readJsonBody(
  request: Request,
  maximumBytes = 60000,
): Promise<Record<string, unknown>> {
  const contentLength = Number(
    request.headers.get(
      "Content-Length",
    ) ?? 0,
  );

  if (contentLength > maximumBytes) {
    throw new Error(
      "A solicitação excede o tamanho permitido.",
    );
  }

  const body =
    await request.json();

  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body)
  ) {
    throw new Error(
      "Corpo da solicitação inválido.",
    );
  }

  return body as Record<
    string,
    unknown
  >;
}

async function callAuthenticatedRpc(
  env: AtiveloEnv,
  accessToken: string,
  functionName: string,
  body: Record<string, unknown>,
): Promise<{
  ok: boolean;
  status: number;
  data: unknown;
}> {
  const supabaseUrl =
    env.SUPABASE_URL.replace(/\/+$/, "");

  const response = await fetch(
    `${supabaseUrl}/rest/v1/rpc/${functionName}`,
    {
      method: "POST",
      headers: {
        apikey:
          env.SUPABASE_PUBLISHABLE_KEY,
        Authorization:
          `Bearer ${accessToken}`,
        Accept: "application/json",
        "Content-Type":
          "application/json",
      },
      body: JSON.stringify(body),
    },
  );

  let data: unknown = null;

  try {
    data = await response.json();
  } catch {
    data = null;
  }

  return {
    ok: response.ok,
    status: response.status,
    data,
  };
}

async function handleAuditContext(
  request: Request,
  env: AtiveloEnv,
  authentication: Extract<
    AuthenticationResult,
    { ok: true }
  >,
): Promise<Response> {
  let body: Record<string, unknown>;

  try {
    body = await readJsonBody(
      request,
      12000,
    );
  } catch (error) {
    return jsonResponse(
      request,
      env,
      {
        ok: false,
        error: {
          code: "invalid_request",
          message:
            error instanceof Error
              ? error.message
              : "Solicitação inválida.",
        },
      },
      400,
    );
  }

  const requestId =
    cleanText(body.requestId, 120);

  if (!requestId) {
    return jsonResponse(
      request,
      env,
      {
        ok: false,
        error: {
          code:
            "missing_request_id",
          message:
            "Identificador da operação não informado.",
        },
      },
      400,
    );
  }

  const rpc =
    await callAuthenticatedRpc(
      env,
      authentication.accessToken,
      "register_audit_request_context",
      {
        p_request_id: requestId,
        p_origin:
          cleanText(body.origin, 160),
        p_http_method:
          cleanText(
            body.httpMethod,
            16,
          ),
        p_resource:
          cleanText(body.resource, 300),
        p_ip:
          getClientIp(request),
        p_user_agent:
          cleanText(
            request.headers.get(
              "User-Agent",
            ),
            600,
          ),
      },
    );

  if (!rpc.ok) {
    console.error(
      JSON.stringify({
        event:
          "ativelo.audit.context_failed",
        status: rpc.status,
        details: rpc.data,
      }),
    );

    return jsonResponse(
      request,
      env,
      {
        ok: false,
        error: {
          code:
            "audit_context_failed",
          message:
            "Não foi possível registrar o contexto da auditoria.",
        },
      },
      502,
    );
  }

  return jsonResponse(
    request,
    env,
    {
      ok: true,
      requestId,
    },
  );
}

async function handleAuditEvents(
  request: Request,
  env: AtiveloEnv,
  authentication: Extract<
    AuthenticationResult,
    { ok: true }
  >,
): Promise<Response> {
  let body: Record<string, unknown>;

  try {
    body = await readJsonBody(
      request,
      60000,
    );
  } catch (error) {
    return jsonResponse(
      request,
      env,
      {
        ok: false,
        error: {
          code: "invalid_request",
          message:
            error instanceof Error
              ? error.message
              : "Solicitação inválida.",
        },
      },
      400,
    );
  }

  const organizationId =
    cleanText(
      body.organizationId,
      80,
    );

  const events =
    Array.isArray(body.events)
      ? body.events.slice(0, 100)
      : [];

  if (
    !organizationId ||
    events.length === 0
  ) {
    return jsonResponse(
      request,
      env,
      {
        ok: false,
        error: {
          code:
            "invalid_audit_events",
          message:
            "Empresa ou eventos de auditoria não informados.",
        },
      },
      400,
    );
  }

  const requestId =
    cleanText(
      request.headers.get(
        "X-Request-Id",
      ),
      120,
    );

  const rpc =
    await callAuthenticatedRpc(
      env,
      authentication.accessToken,
      "record_client_audit_events",
      {
        p_organization_id:
          organizationId,
        p_events: events,
        p_ip:
          getClientIp(request),
        p_user_agent:
          cleanText(
            request.headers.get(
              "User-Agent",
            ),
            600,
          ),
        p_origin:
          cleanText(
            body.origin,
            160,
          ) || "frontend",
        p_request_id:
          requestId || null,
      },
    );

  if (!rpc.ok) {
    console.error(
      JSON.stringify({
        event:
          "ativelo.audit.events_failed",
        status: rpc.status,
        details: rpc.data,
      }),
    );

    return jsonResponse(
      request,
      env,
      {
        ok: false,
        error: {
          code:
            "audit_events_failed",
          message:
            "Não foi possível registrar os eventos de auditoria.",
        },
      },
      502,
    );
  }

  return jsonResponse(
    request,
    env,
    {
      ok: true,
      recorded:
        typeof rpc.data === "number"
          ? rpc.data
          : events.length,
    },
  );
}

export default {
  async fetch(
    request: Request,
    env: AtiveloEnv,
  ): Promise<Response> {
    const url = new URL(request.url);
    const requestOrigin =
      request.headers.get("Origin");
    const allowedOrigin =
      getAllowedOrigin(request, env);

    if (
      requestOrigin &&
      allowedOrigin === ""
    ) {
      return jsonResponse(
        request,
        env,
        {
          ok: false,
          error: {
            code:
              "origin_not_allowed",
            message:
              "Origem não autorizada.",
          },
        },
        403,
      );
    }

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers:
          getCorsHeaders(request, env),
      });
    }

        const agentControlResponse =
      await handleAgentControlRequest(
        request,
        env,
      );

    if (agentControlResponse) {
      return agentControlResponse;
    }
if (
      request.method === "GET" &&
      url.pathname === "/"
    ) {
      return jsonResponse(
        request,
        env,
        {
          service: "ativelo-api",
          message:
            "API do Ativelo disponível.",
          status: "online",
          environment:
            env.APP_ENV ??
            "development",
          endpoints: [
            "/health",
            "/auth/me",
            "/audit/context",
            "/audit/events",
            "/agent/health",
            "/agent/enroll",
            "/agent/heartbeat",
          ],
        },
      );
    }

    if (
      request.method === "GET" &&
      url.pathname === "/health"
    ) {
      return jsonResponse(
        request,
        env,
        {
          ok: true,
          service: "ativelo-api",
          status: "online",
          environment:
            env.APP_ENV ??
            "development",
          authenticationConfigured:
            isSupabaseConfigured(env),
          auditConfigured:
            isSupabaseConfigured(env),
          agentControlConfigured:
            isSupabaseConfigured(env),
          timestamp:
            new Date().toISOString(),
        },
      );
    }

    if (
      request.method === "GET" &&
      url.pathname === "/auth/me"
    ) {
      const authentication =
        await authenticateUser(
          request,
          env,
        );

      if (!authentication.ok) {
        return jsonResponse(
          request,
          env,
          {
            ok: false,
            error: {
              code:
                authentication.code,
              message:
                authentication.message,
            },
          },
          authentication.status,
        );
      }

      return jsonResponse(
        request,
        env,
        {
          ok: true,
          user:
            getSafeUser(
              authentication.user,
            ),
        },
      );
    }

    if (
      request.method === "POST" &&
      (
        url.pathname ===
          "/audit/context" ||
        url.pathname ===
          "/audit/events"
      )
    ) {
      const authentication =
        await authenticateUser(
          request,
          env,
        );

      if (!authentication.ok) {
        return jsonResponse(
          request,
          env,
          {
            ok: false,
            error: {
              code:
                authentication.code,
              message:
                authentication.message,
            },
          },
          authentication.status,
        );
      }

      if (
        url.pathname ===
          "/audit/context"
      ) {
        return handleAuditContext(
          request,
          env,
          authentication,
        );
      }

      return handleAuditEvents(
        request,
        env,
        authentication,
      );
    }

    return jsonResponse(
      request,
      env,
      {
        ok: false,
        error: {
          code: "route_not_found",
          message:
            "Rota não encontrada.",
        },
      },
      404,
    );
  },

  async scheduled(
    controller:
      AtiveloScheduledController,
    env: AtiveloEnv,
    context:
      AtiveloExecutionContext,
  ): Promise<void> {
    context.waitUntil(
      Promise.resolve().then(() => {
        console.log(
          JSON.stringify({
            event:
              "ativelo.cron.received",
            cron: controller.cron,
            scheduledTime:
              controller.scheduledTime,
            environment:
              env.APP_ENV ??
              "development",
            action:
              "Nenhuma rotina de negócio foi ativada.",
          }),
        );
      }),
    );
  },

  async queue(
    batch:
      AtiveloMessageBatch<AtiveloJob>,
    env: AtiveloEnv,
  ): Promise<void> {
    for (
      const message of batch.messages
    ) {
      try {
        console.log(
          JSON.stringify({
            event:
              "ativelo.queue.received",
            queue: batch.queue,
            environment:
              env.APP_ENV ??
              "development",
            job: message.body,
            action:
              "Nenhuma fila foi ativada neste pacote.",
          }),
        );

        message.ack();
      } catch (error) {
        console.error(
          "Falha ao processar mensagem da fila.",
          error,
        );

        message.retry();
      }
    }
  },
};