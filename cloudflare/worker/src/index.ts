import {
  handleEquipmentSpecsRequest,
  type EquipmentSpecsEnv,
} from "./equipmentSpecs";
interface AtiveloEnv extends EquipmentSpecsEnv {
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

function getAllowedOrigin(request: Request, env: AtiveloEnv): string | null {
  const requestOrigin = request.headers.get("Origin");
  const configuredOrigin = env.ALLOWED_ORIGIN?.trim();

  if (!requestOrigin) {
    return null;
  }

  if (configuredOrigin && requestOrigin === configuredOrigin) {
    return configuredOrigin;
  }

  return "";
}

function getCorsHeaders(request: Request, env: AtiveloEnv): HeadersInit {
  const allowedOrigin = getAllowedOrigin(request, env);

  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Request-Id",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
  };

  if (allowedOrigin) {
    headers["Access-Control-Allow-Origin"] = allowedOrigin;
    headers["Vary"] = "Origin";
  }

  return headers;
}

function jsonResponse(
  request: Request,
  env: AtiveloEnv,
  body: unknown,
  status = 200,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: getCorsHeaders(request, env),
  });
}

function getBearerToken(request: Request): string | null {
  const authorization = request.headers.get("Authorization");

  if (!authorization) {
    return null;
  }

  const match = authorization.match(/^Bearer\s+(.+)$/i);
  const token = match?.[1]?.trim();

  return token || null;
}

function isSupabaseConfigured(env: AtiveloEnv): boolean {
  return Boolean(
    env.SUPABASE_URL?.trim() &&
      env.SUPABASE_PUBLISHABLE_KEY?.trim(),
  );
}

async function authenticateUser(
  request: Request,
  env: AtiveloEnv,
): Promise<
  | { ok: true; user: SupabaseUser }
  | { ok: false; status: number; code: string; message: string }
> {
  if (!isSupabaseConfigured(env)) {
    console.error("Supabase secrets are not configured.");

    return {
      ok: false,
      status: 503,
      code: "auth_configuration_unavailable",
      message: "O servico de autenticacao esta temporariamente indisponivel.",
    };
  }

  const accessToken = getBearerToken(request);

  if (!accessToken) {
    return {
      ok: false,
      status: 401,
      code: "missing_bearer_token",
      message: "Token de acesso nao informado.",
    };
  }

  const supabaseUrl = env.SUPABASE_URL.replace(/\/+$/, "");
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    method: "GET",
    headers: {
      apikey: env.SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    if (response.status >= 500) {
      console.error(
        JSON.stringify({
          event: "ativelo.auth.provider_error",
          status: response.status,
        }),
      );

      return {
        ok: false,
        status: 503,
        code: "auth_provider_unavailable",
        message: "O servico de autenticacao esta temporariamente indisponivel.",
      };
    }

    return {
      ok: false,
      status: 401,
      code: "invalid_or_expired_token",
      message: "Token invalido ou expirado.",
    };
  }

  const user = (await response.json()) as SupabaseUser;

  if (!user?.id) {
    return {
      ok: false,
      status: 401,
      code: "invalid_user",
      message: "Nao foi possivel identificar o usuario.",
    };
  }

  return {
    ok: true,
    user,
  };
}

function getSafeUser(user: SupabaseUser): Record<string, unknown> {
  return {
    id: user.id,
    email: user.email ?? null,
    phone: user.phone ?? null,
    audience: user.aud ?? null,
    role: user.role ?? null,
    createdAt: user.created_at ?? null,
    updatedAt: user.updated_at ?? null,
    lastSignInAt: user.last_sign_in_at ?? null,
    appMetadata: user.app_metadata ?? {},
    userMetadata: user.user_metadata ?? {},
  };
}

export default {
  async fetch(request: Request, env: AtiveloEnv): Promise<Response> {
    const url = new URL(request.url);
    const requestOrigin = request.headers.get("Origin");
    const allowedOrigin = getAllowedOrigin(request, env);

    if (requestOrigin && allowedOrigin === "") {
      return jsonResponse(
        request,
        env,
        {
          ok: false,
          error: {
            code: "origin_not_allowed",
            message: "Origem nao autorizada.",
          },
        },
        403,
      );
    }

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: getCorsHeaders(request, env),
      });
    }

    if (request.method === "GET" && url.pathname === "/") {
      return jsonResponse(request, env, {
        service: "ativelo-api",
        message: "API do Ativelo disponivel.",
        status: "online",
        environment: env.APP_ENV ?? "development",
        endpoints: [
            "/health",
            "/auth/me",
            "/equipment-specs/status",
            "/equipment-specs/research",
          ],
      });
    }

    if (request.method === "GET" && url.pathname === "/health") {
      return jsonResponse(request, env, {
        ok: true,
        service: "ativelo-api",
        status: "online",
        environment: env.APP_ENV ?? "development",
        authenticationConfigured: isSupabaseConfigured(env),
        timestamp: new Date().toISOString(),
      });
    }

    if (request.method === "GET" && url.pathname === "/auth/me") {
      const authentication = await authenticateUser(request, env);

      if (!authentication.ok) {
        return jsonResponse(
          request,
          env,
          {
            ok: false,
            error: {
              code: authentication.code,
              message: authentication.message,
            },
          },
          authentication.status,
        );
      }

      return jsonResponse(request, env, {
        ok: true,
        user: getSafeUser(authentication.user),
      });
    }
    if (
      url.pathname.startsWith("/equipment-specs/")
    ) {
      const authentication =
        await authenticateUser(request, env);

      if (!authentication.ok) {
        return jsonResponse(
          request,
          env,
          {
            ok: false,
            error: {
              code: authentication.code,
              message:
                authentication.message,
            },
          },
          authentication.status,
        );
      }

      const response =
        await handleEquipmentSpecsRequest(
          request,
          env,
          authentication.user,
        );

      const headers = new Headers(
        response.headers,
      );

      const corsHeaders = getCorsHeaders(
        request,
        env,
      );

      Object.entries(corsHeaders).forEach(
        ([name, value]) => {
          headers.set(
            name,
            String(value),
          );
        },
      );

      return new Response(response.body, {
        status: response.status,
        headers,
      });
    }

    return jsonResponse(

      request,

      env,

      {

        ok: false,

        error: {

          code: "route_not_found",
          message: "Rota nao encontrada.",
        },
      },
      404,
    );
  },

  async scheduled(
    controller: AtiveloScheduledController,
    env: AtiveloEnv,
    context: AtiveloExecutionContext,
  ): Promise<void> {
    context.waitUntil(
      Promise.resolve().then(() => {
        console.log(
          JSON.stringify({
            event: "ativelo.cron.received",
            cron: controller.cron,
            scheduledTime: controller.scheduledTime,
            environment: env.APP_ENV ?? "development",
            action: "Nenhuma rotina de negocio foi ativada.",
          }),
        );
      }),
    );
  },

  async queue(
    batch: AtiveloMessageBatch<AtiveloJob>,
    env: AtiveloEnv,
  ): Promise<void> {
    for (const message of batch.messages) {
      try {
        console.log(
          JSON.stringify({
            event: "ativelo.queue.received",
            queue: batch.queue,
            environment: env.APP_ENV ?? "development",
            job: message.body,
            action: "Nenhuma fila foi ativada neste pacote.",
          }),
        );

        message.ack();
      } catch (error) {
        console.error("Falha ao processar mensagem da fila.", error);
        message.retry();
      }
    }
  },
};