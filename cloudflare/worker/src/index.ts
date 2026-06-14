interface AtiveloEnv {
  APP_ENV?: string;
  ALLOWED_ORIGIN?: string;
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

function getCorsHeaders(request: Request, env: AtiveloEnv): HeadersInit {
  const requestOrigin = request.headers.get("Origin");
  const configuredOrigin = env.ALLOWED_ORIGIN?.trim();

  let allowedOrigin = "";

  if (configuredOrigin && requestOrigin === configuredOrigin) {
    allowedOrigin = configuredOrigin;
  }

  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Request-Id",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Content-Type": "application/json; charset=utf-8",
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

export default {
  async fetch(request: Request, env: AtiveloEnv): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: getCorsHeaders(request, env),
      });
    }

    if (request.method === "GET" && url.pathname === "/") {
      return jsonResponse(request, env, {
        service: "ativelo-api",
        message: "API do Ativelo disponível.",
        status: "online",
        environment: env.APP_ENV ?? "development",
        endpoints: ["/health"],
      });
    }

    if (request.method === "GET" && url.pathname === "/health") {
      return jsonResponse(request, env, {
        ok: true,
        service: "ativelo-api",
        status: "online",
        environment: env.APP_ENV ?? "development",
        timestamp: new Date().toISOString(),
      });
    }

    return jsonResponse(
      request,
      env,
      {
        ok: false,
        error: "Rota não encontrada.",
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
            action: "Nenhuma rotina de negócio foi ativada neste pacote.",
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
            action: "Mensagem recebida pela fundação do Worker.",
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