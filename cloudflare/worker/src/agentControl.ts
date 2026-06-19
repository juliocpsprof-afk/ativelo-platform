export interface AtiveloAgentEnv {
  APP_ENV?: string;
  ALLOWED_ORIGIN?: string;
  SUPABASE_URL: string;
  SUPABASE_PUBLISHABLE_KEY: string;
}

type JsonRecord =
  Record<string, unknown>;

function headers(
  request: Request,
  env: AtiveloAgentEnv,
): HeadersInit {
  const origin =
    request.headers.get("Origin");

  const allowed =
    env.ALLOWED_ORIGIN?.trim();

  const result:
    Record<string, string> = {
      "Cache-Control": "no-store",
      "Content-Type":
        "application/json; charset=utf-8",
      "Referrer-Policy":
        "no-referrer",
      "X-Content-Type-Options":
        "nosniff",
    };

  if (
    origin &&
    allowed &&
    origin === allowed
  ) {
    result[
      "Access-Control-Allow-Origin"
    ] = allowed;

    result.Vary = "Origin";
  }

  return result;
}

function json(
  request: Request,
  env: AtiveloAgentEnv,
  body: unknown,
  status = 200,
): Response {
  return new Response(
    JSON.stringify(body),
    {
      status,
      headers:
        headers(request, env),
    },
  );
}

function text(
  value: unknown,
  maximum: number,
): string {
  return String(value ?? "")
    .trim()
    .slice(0, maximum);
}

function ip(
  request: Request,
): string {
  return (
    request.headers.get(
      "CF-Connecting-IP",
    ) ||
    request.headers.get(
      "X-Real-IP",
    ) ||
    ""
  );
}

async function body(
  request: Request,
): Promise<JsonRecord> {
  const value =
    await request.json();

  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    throw new Error(
      "Corpo da solicitação inválido.",
    );
  }

  return value as JsonRecord;
}

function hex(
  value: ArrayBuffer,
): string {
  return Array.from(
    new Uint8Array(value),
  )
    .map((byte) =>
      byte
        .toString(16)
        .padStart(2, "0"),
    )
    .join("");
}

async function sha256(
  value: string,
): Promise<string> {
  return hex(
    await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(value),
    ),
  );
}

function secret(): string {
  const bytes =
    new Uint8Array(32);

  crypto.getRandomValues(bytes);

  return Array.from(bytes)
    .map((byte) =>
      byte
        .toString(16)
        .padStart(2, "0"),
    )
    .join("");
}

async function rpc(
  env: AtiveloAgentEnv,
  name: string,
  payload: JsonRecord,
): Promise<{
  ok: boolean;
  status: number;
  data: unknown;
}> {
  const base =
    env.SUPABASE_URL.replace(
      /\/+$/,
      "",
    );

  const response =
    await fetch(
      `${base}/rest/v1/rpc/${name}`,
      {
        method: "POST",
        headers: {
          apikey:
            env.SUPABASE_PUBLISHABLE_KEY,
          Accept: "application/json",
          "Content-Type":
            "application/json",
        },
        body: JSON.stringify(
          payload,
        ),
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

function rpcMessage(
  data: unknown,
): string {
  if (
    data &&
    typeof data === "object" &&
    "message" in data
  ) {
    return text(
      (
        data as {
          message?: unknown;
        }
      ).message,
      500,
    );
  }

  return "";
}

async function credentials(
  request: Request,
): Promise<{
  agentId: string;
  secretHash: string;
}> {
  const agentId =
    text(
      request.headers.get(
        "X-Ativelo-Agent-Id",
      ),
      80,
    );

  const key =
    text(
      request.headers.get(
        "X-Ativelo-Agent-Key",
      ),
      200,
    );

  if (
    !agentId ||
    key.length < 40
  ) {
    throw new Error(
      "Credencial do agente não informada.",
    );
  }

  return {
    agentId,
    secretHash:
      await sha256(key),
  };
}

async function enroll(
  request: Request,
  env: AtiveloAgentEnv,
): Promise<Response> {
  const input =
    await body(request);

  const pairingToken =
    text(input.token, 120);

  if (
    pairingToken.length < 20
  ) {
    return json(
      request,
      env,
      {
        ok: false,
        error: {
          code:
            "invalid_pairing_code",
          message:
            "Código de vinculação inválido.",
        },
      },
      400,
    );
  }

  const agentSecret =
    secret();

  const result =
    await rpc(
      env,
      "enroll_inventory_agent_v2",
      {
        p_token:
          pairingToken,
        p_secret_hash:
          await sha256(
            agentSecret,
          ),
        p_device_uid:
          text(
            input.deviceUid,
            200,
          ),
        p_hostname:
          text(
            input.hostname,
            200,
          ),
        p_agent_version:
          text(
            input.agentVersion,
            60,
          ),
        p_os_name:
          text(
            input.osName,
            160,
          ),
        p_os_version:
          text(
            input.osVersion,
            160,
          ),
        p_architecture:
          text(
            input.architecture,
            60,
          ),
        p_mode:
          text(
            input.mode,
            30,
          ) || "equipment",
        p_capabilities:
          (
            input.capabilities &&
            typeof input.capabilities ===
              "object"
          )
            ? input.capabilities
            : {},
        p_ip:
          ip(request),
      },
    );

  if (!result.ok) {
    return json(
      request,
      env,
      {
        ok: false,
        error: {
          code:
            "agent_enrollment_failed",
          message:
            rpcMessage(
              result.data,
            ) ||
            "Não foi possível vincular o agente.",
        },
      },
      result.status >= 500
        ? 502
        : 400,
    );
  }

  return json(
    request,
    env,
    {
      ok: true,
      agentSecret,
      ...(result.data as JsonRecord),
      endpoints: {
        heartbeat:
          "/agent/heartbeat",
      },
    },
    201,
  );
}

async function heartbeat(
  request: Request,
  env: AtiveloAgentEnv,
): Promise<Response> {
  const auth =
    await credentials(request);

  const input =
    await body(request);

  const result =
    await rpc(
      env,
      "agent_heartbeat_v2",
      {
        p_agent_id:
          auth.agentId,
        p_secret_hash:
          auth.secretHash,
        p_agent_version:
          text(
            input.agentVersion,
            60,
          ),
        p_service_status:
          text(
            input.serviceStatus,
            60,
          ),
        p_capabilities:
          (
            input.capabilities &&
            typeof input.capabilities ===
              "object"
          )
            ? input.capabilities
            : null,
        p_ip:
          ip(request),
        p_last_error:
          text(
            input.lastError,
            1000,
          ) || null,
      },
    );

  if (!result.ok) {
    return json(
      request,
      env,
      {
        ok: false,
        error: {
          code:
            "agent_authentication_failed",
          message:
            rpcMessage(
              result.data,
            ) ||
            "Agente não autorizado.",
        },
      },
      401,
    );
  }

  return json(
    request,
    env,
    {
      ok: true,
      ...(result.data as JsonRecord),
    },
  );
}

export async function handleAgentControlRequest(
  request: Request,
  env: AtiveloAgentEnv,
): Promise<Response | null> {
  const url =
    new URL(request.url);

  if (
    request.method === "GET" &&
    url.pathname ===
      "/agent/health"
  ) {
    return json(
      request,
      env,
      {
        ok: true,
        service:
          "ativelo-agent-control",
        status: "online",
        timestamp:
          new Date().toISOString(),
      },
    );
  }

  if (
    request.method !== "POST"
  ) {
    return null;
  }

  try {
    if (
      url.pathname ===
        "/agent/enroll"
    ) {
      return enroll(
        request,
        env,
      );
    }

    if (
      url.pathname ===
        "/agent/heartbeat"
    ) {
      return heartbeat(
        request,
        env,
      );
    }
  } catch (error) {
    return json(
      request,
      env,
      {
        ok: false,
        error: {
          code:
            "invalid_agent_request",
          message:
            error instanceof Error
              ? error.message
              : "Solicitação inválida.",
        },
      },
      400,
    );
  }

  return null;
}