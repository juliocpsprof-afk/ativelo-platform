var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/index.ts
function getCorsHeaders(request, env) {
  const requestOrigin = request.headers.get("Origin");
  const configuredOrigin = env.ALLOWED_ORIGIN?.trim();
  let allowedOrigin = "";
  if (configuredOrigin && requestOrigin === configuredOrigin) {
    allowedOrigin = configuredOrigin;
  }
  const headers = {
    "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Request-Id",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Content-Type": "application/json; charset=utf-8"
  };
  if (allowedOrigin) {
    headers["Access-Control-Allow-Origin"] = allowedOrigin;
    headers["Vary"] = "Origin";
  }
  return headers;
}
__name(getCorsHeaders, "getCorsHeaders");
function jsonResponse(request, env, body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: getCorsHeaders(request, env)
  });
}
__name(jsonResponse, "jsonResponse");
var index_default = {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: getCorsHeaders(request, env)
      });
    }
    if (request.method === "GET" && url.pathname === "/") {
      return jsonResponse(request, env, {
        service: "ativelo-api",
        message: "API do Ativelo dispon\xEDvel.",
        status: "online",
        environment: env.APP_ENV ?? "development",
        endpoints: ["/health"]
      });
    }
    if (request.method === "GET" && url.pathname === "/health") {
      return jsonResponse(request, env, {
        ok: true,
        service: "ativelo-api",
        status: "online",
        environment: env.APP_ENV ?? "development",
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      });
    }
    return jsonResponse(
      request,
      env,
      {
        ok: false,
        error: "Rota n\xE3o encontrada."
      },
      404
    );
  },
  async scheduled(controller, env, context) {
    context.waitUntil(
      Promise.resolve().then(() => {
        console.log(
          JSON.stringify({
            event: "ativelo.cron.received",
            cron: controller.cron,
            scheduledTime: controller.scheduledTime,
            environment: env.APP_ENV ?? "development",
            action: "Nenhuma rotina de neg\xF3cio foi ativada neste pacote."
          })
        );
      })
    );
  },
  async queue(batch, env) {
    for (const message of batch.messages) {
      try {
        console.log(
          JSON.stringify({
            event: "ativelo.queue.received",
            queue: batch.queue,
            environment: env.APP_ENV ?? "development",
            job: message.body,
            action: "Mensagem recebida pela funda\xE7\xE3o do Worker."
          })
        );
        message.ack();
      } catch (error) {
        console.error("Falha ao processar mensagem da fila.", error);
        message.retry();
      }
    }
  }
};
export {
  index_default as default
};
//# sourceMappingURL=index.js.map
