import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import webpush from "npm:web-push@3.6.7";

type JsonRecord = Record<string, unknown>;

type NotificationRow = {
  id: string;
  organization_id: string;
  recipient_user_id: string;
  category: string;
  severity: string;
  title: string;
  message: string;
  action_url: string | null;
  entity_type: string | null;
  entity_id: string | null;
  delivery_attempts: number;
};

type SubscriptionRow = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth_key: string;
};

const supabaseUrl =
  Deno.env.get("SUPABASE_URL") ?? "";

const serviceRoleKey =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const vapidPublicKey =
  Deno.env.get("VAPID_PUBLIC_KEY") ?? "";

const vapidPrivateKey =
  Deno.env.get("VAPID_PRIVATE_KEY") ?? "";

const vapidSubject =
  Deno.env.get("VAPID_SUBJECT") ??
  "mailto:suporte@ativelo.local";

const dispatchSecret =
  Deno.env.get("PUSH_DISPATCH_SECRET") ?? "";

const appBaseUrl =
  (
    Deno.env.get("APP_BASE_URL") ??
    "https://ativelo-platform.pages.dev"
  ).replace(/\/+$/, "");

const supabase =
  createClient(
    supabaseUrl,
    serviceRoleKey,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, apikey, content-type, x-client-info, x-ativelo-push-secret",
  "Access-Control-Allow-Methods":
    "GET, POST, OPTIONS",
  "Cache-Control": "no-store",
  "Content-Type":
    "application/json; charset=utf-8",
};

function json(
  body: unknown,
  status = 200,
): Response {
  return new Response(
    JSON.stringify(body),
    {
      status,
      headers: corsHeaders,
    },
  );
}

function isConfigured(): boolean {
  return Boolean(
    supabaseUrl &&
    serviceRoleKey &&
    vapidPublicKey &&
    vapidPrivateKey &&
    vapidSubject,
  );
}

function cleanText(
  value: unknown,
  maximum: number,
): string {
  return String(value ?? "")
    .trim()
    .slice(0, maximum);
}

function bearerToken(
  request: Request,
): string {
  const authorization =
    request.headers.get(
      "Authorization",
    ) ?? "";

  const match =
    authorization.match(
      /^Bearer\s+(.+)$/i,
    );

  return match?.[1]?.trim() ?? "";
}

function dispatchAuthorized(
  request: Request,
): boolean {
  const received =
    request.headers.get(
      "X-Ativelo-Push-Secret",
    ) ?? "";

  return Boolean(
    dispatchSecret &&
    received &&
    received === dispatchSecret,
  );
}

async function readBody(
  request: Request,
): Promise<JsonRecord> {
  try {
    const data =
      await request.json();

    if (
      data &&
      typeof data === "object" &&
      !Array.isArray(data)
    ) {
      return data as JsonRecord;
    }
  } catch {
    // O corpo vazio usa a ação padrão.
  }

  return {};
}

async function authenticatedUser(
  request: Request,
): Promise<{
  id: string;
  email?: string;
}> {
  const token =
    bearerToken(request);

  if (!token) {
    throw new Error(
      "Sessão não informada.",
    );
  }

  const {
    data,
    error,
  } =
    await supabase.auth.getUser(
      token,
    );

  if (
    error ||
    !data.user
  ) {
    throw new Error(
      "Sessão inválida ou expirada.",
    );
  }

  return {
    id: data.user.id,
    email:
      data.user.email ??
      undefined,
  };
}

function absoluteUrl(
  value: string | null,
): string {
  const clean =
    cleanText(value, 1000);

  if (!clean) {
    return appBaseUrl;
  }

  try {
    return new URL(
      clean,
      `${appBaseUrl}/`,
    ).toString();
  } catch {
    return appBaseUrl;
  }
}

function urgency(
  severity: string,
): "very-low" | "low" | "normal" | "high" {
  if (
    severity === "critical" ||
    severity === "high"
  ) {
    return "high";
  }

  if (severity === "warning") {
    return "normal";
  }

  return "low";
}

function nextAttempt(
  attempts: number,
): string {
  const seconds =
    Math.min(
      6 * 60 * 60,
      Math.max(
        60,
        60 * 2 ** Math.min(
          attempts,
          8,
        ),
      ),
    );

  return new Date(
    Date.now() +
      seconds * 1000,
  ).toISOString();
}

async function recordAttempt(
  notification: NotificationRow,
  subscription: SubscriptionRow,
  status: "sent" | "failed" | "expired",
  responseStatus: number | null,
  errorMessage: string | null,
): Promise<void> {
  let origin: string | null = null;

  try {
    origin =
      new URL(
        subscription.endpoint,
      ).origin;
  } catch {
    origin = null;
  }

  await supabase
    .from("push_delivery_attempts")
    .insert({
      organization_id:
        notification.organization_id,
      notification_id:
        notification.id,
      subscription_id:
        subscription.id,
      user_id:
        notification.recipient_user_id,
      status,
      response_status:
        responseStatus,
      error_message:
        errorMessage?.slice(
          0,
          2000,
        ) ?? null,
      endpoint_origin: origin,
    });
}

async function sendNotification(
  notification: NotificationRow,
  subscription: SubscriptionRow,
): Promise<{
  ok: boolean;
  expired: boolean;
  statusCode: number | null;
  error: string | null;
}> {
  const payload =
    JSON.stringify({
      title:
        notification.title,
      body:
        notification.message,
      icon:
        "/icons/ativelo-192.png",
      badge:
        "/icons/ativelo-32.png",
      tag:
        `ativelo-${notification.category}-${notification.id}`,
      url:
        absoluteUrl(
          notification.action_url,
        ),
      requireInteraction:
        notification.severity ===
          "critical",
      data: {
        notificationId:
          notification.id,
        category:
          notification.category,
        entityType:
          notification.entity_type,
        entityId:
          notification.entity_id,
      },
    });

  try {
    const response =
      await webpush.sendNotification(
        {
          endpoint:
            subscription.endpoint,
          keys: {
            p256dh:
              subscription.p256dh,
            auth:
              subscription.auth_key,
          },
        },
        payload,
        {
          TTL: 60 * 60,
          urgency:
            urgency(
              notification.severity,
            ),
          topic:
            notification.category
              .replace(
                /[^A-Za-z0-9_-]/g,
                "-",
              )
              .slice(0, 32),
        },
      );

    const statusCode =
      Number(
        response.statusCode ??
          201,
      );

    await recordAttempt(
      notification,
      subscription,
      "sent",
      statusCode,
      null,
    );

    await supabase
      .from(
        "web_push_subscriptions",
      )
      .update({
        last_success_at:
          new Date().toISOString(),
        last_seen_at:
          new Date().toISOString(),
        failure_count: 0,
        last_error: null,
        is_active: true,
      })
      .eq(
        "id",
        subscription.id,
      );

    return {
      ok: true,
      expired: false,
      statusCode,
      error: null,
    };
  } catch (error) {
    const candidate =
      error as {
        statusCode?: number;
        body?: string;
        message?: string;
      };

    const statusCode =
      Number.isFinite(
        candidate.statusCode,
      )
        ? Number(
            candidate.statusCode,
          )
        : null;

    const message =
      cleanText(
        candidate.body ??
          candidate.message ??
          error,
        2000,
      );

    const expired =
      statusCode === 404 ||
      statusCode === 410;

    await recordAttempt(
      notification,
      subscription,
      expired
        ? "expired"
        : "failed",
      statusCode,
      message,
    );

    const {
      data: current,
    } =
      await supabase
        .from(
          "web_push_subscriptions",
        )
        .select(
          "failure_count",
        )
        .eq(
          "id",
          subscription.id,
        )
        .maybeSingle();

    await supabase
      .from(
        "web_push_subscriptions",
      )
      .update({
        is_active:
          expired
            ? false
            : true,
        failure_count:
          Number(
            current?.failure_count ??
              0,
          ) + 1,
        last_error: message,
      })
      .eq(
        "id",
        subscription.id,
      );

    return {
      ok: false,
      expired,
      statusCode,
      error: message,
    };
  }
}

async function claimNotification(
  notification: NotificationRow,
): Promise<boolean> {
  const {
    data,
    error,
  } =
    await supabase
      .from("app_notifications")
      .update({
        delivery_status:
          "processing",
        last_attempt_at:
          new Date().toISOString(),
        delivery_attempts:
          notification
            .delivery_attempts +
          1,
        provider_status:
          "processing",
        last_error: null,
      })
      .eq(
        "id",
        notification.id,
      )
      .in(
        "delivery_status",
        [
          "pending",
          "failed",
        ],
      )
      .select("id")
      .maybeSingle();

  return Boolean(
    !error &&
    data?.id,
  );
}

async function dispatchOne(
  notification: NotificationRow,
): Promise<{
  id: string;
  status: string;
  sent: number;
  failed: number;
}> {
  const claimed =
    await claimNotification(
      notification,
    );

  if (!claimed) {
    return {
      id: notification.id,
      status: "skipped",
      sent: 0,
      failed: 0,
    };
  }

  const {
    data: subscriptions,
    error: subscriptionsError,
  } =
    await supabase
      .from(
        "web_push_subscriptions",
      )
      .select(
        "id,endpoint,p256dh,auth_key",
      )
      .eq(
        "organization_id",
        notification.organization_id,
      )
      .eq(
        "user_id",
        notification.recipient_user_id,
      )
      .eq(
        "is_active",
        true,
      );

  if (subscriptionsError) {
    await supabase
      .from("app_notifications")
      .update({
        delivery_status:
          "failed",
        provider_status:
          "failed",
        next_attempt_at:
          nextAttempt(
            notification
              .delivery_attempts +
              1,
          ),
        last_error:
          subscriptionsError.message,
      })
      .eq(
        "id",
        notification.id,
      );

    return {
      id: notification.id,
      status: "failed",
      sent: 0,
      failed: 1,
    };
  }

  const activeSubscriptions =
    (subscriptions ?? []) as
      SubscriptionRow[];

  if (
    activeSubscriptions.length ===
      0
  ) {
    await supabase
      .from("app_notifications")
      .update({
        delivery_status:
          "failed",
        provider_status:
          "no_active_subscription",
        next_attempt_at:
          nextAttempt(
            notification
              .delivery_attempts +
              1,
          ),
        last_error:
          "Nenhuma assinatura push ativa para o usuário.",
      })
      .eq(
        "id",
        notification.id,
      );

    return {
      id: notification.id,
      status:
        "no_subscription",
      sent: 0,
      failed: 0,
    };
  }

  const results =
    await Promise.all(
      activeSubscriptions.map(
        (subscription) =>
          sendNotification(
            notification,
            subscription,
          ),
      ),
    );

  const sent =
    results.filter(
      (result) => result.ok,
    ).length;

  const failed =
    results.length - sent;

  if (sent > 0) {
    await supabase
      .from("app_notifications")
      .update({
        delivery_status: "sent",
        provider_status:
          failed > 0
            ? "partially_sent"
            : "sent",
        sent_at:
          new Date().toISOString(),
        next_attempt_at: null,
        last_error:
          failed > 0
            ? `${failed} dispositivo(s) não receberam a notificação.`
            : null,
      })
      .eq(
        "id",
        notification.id,
      );

    return {
      id: notification.id,
      status:
        failed > 0
          ? "partially_sent"
          : "sent",
      sent,
      failed,
    };
  }

  const errorMessage =
    results
      .map(
        (result) =>
          result.error,
      )
      .filter(Boolean)
      .join(" | ")
      .slice(0, 2000);

  const attempts =
    notification
      .delivery_attempts + 1;

  await supabase
    .from("app_notifications")
    .update({
      delivery_status:
        attempts >= 5
          ? "canceled"
          : "failed",
      provider_status:
        attempts >= 5
          ? "retry_limit_reached"
          : "failed",
      next_attempt_at:
        attempts >= 5
          ? null
          : nextAttempt(
              attempts,
            ),
      failed_at:
        new Date().toISOString(),
      last_error:
        errorMessage ||
        "Falha no envio push.",
    })
    .eq(
      "id",
      notification.id,
    );

  return {
    id: notification.id,
    status:
      attempts >= 5
        ? "canceled"
        : "failed",
    sent: 0,
    failed,
  };
}

async function dispatchPending(): Promise<JsonRecord> {
  if (!isConfigured()) {
    throw new Error(
      "As chaves VAPID ou as credenciais do Supabase não estão configuradas.",
    );
  }

  webpush.setVapidDetails(
    vapidSubject,
    vapidPublicKey,
    vapidPrivateKey,
  );

  const {
    data: prepared,
    error: prepareError,
  } =
    await supabase.rpc(
      "prepare_scheduled_push_notifications_v1",
    );

  if (prepareError) {
    throw new Error(
      `Falha ao preparar alertas: ${prepareError.message}`,
    );
  }

  const now =
    new Date().toISOString();

  const {
    data,
    error,
  } =
    await supabase
      .from("app_notifications")
      .select(
        "id,organization_id,recipient_user_id,category,severity,title,message,action_url,entity_type,entity_id,delivery_attempts",
      )
      .eq("channel", "push")
      .in(
        "delivery_status",
        [
          "pending",
          "failed",
        ],
      )
      .lte(
        "scheduled_for",
        now,
      )
      .or(
        `next_attempt_at.is.null,next_attempt_at.lte.${now}`,
      )
      .lt(
        "delivery_attempts",
        5,
      )
      .order(
        "scheduled_for",
        {
          ascending: true,
        },
      )
      .limit(50);

  if (error) {
    throw new Error(
      error.message,
    );
  }

  const rows =
    (data ?? []) as
      NotificationRow[];

  const results = [];

  for (const notification of rows) {
    results.push(
      await dispatchOne(
        notification,
      ),
    );
  }

  return {
    ok: true,
    prepared:
      Number(prepared ?? 0),
    processed:
      results.length,
    results,
  };
}

async function queueTest(
  request: Request,
  input: JsonRecord,
): Promise<JsonRecord> {
  if (!isConfigured()) {
    throw new Error(
      "Notificações push ainda não estão configuradas no servidor.",
    );
  }

  const user =
    await authenticatedUser(
      request,
    );

  const organizationId =
    cleanText(
      input.organizationId,
      80,
    );

  if (!organizationId) {
    throw new Error(
      "Empresa não informada.",
    );
  }

  const {
    data: membership,
    error: membershipError,
  } =
    await supabase
      .from(
        "organization_memberships",
      )
      .select("id")
      .eq(
        "organization_id",
        organizationId,
      )
      .eq(
        "user_id",
        user.id,
      )
      .eq(
        "is_active",
        true,
      )
      .maybeSingle();

  if (
    membershipError ||
    !membership
  ) {
    throw new Error(
      "Usuário sem vínculo ativo com a empresa.",
    );
  }

  const sourceKey =
    `test:${user.id}:${Date.now()}`;

  const {
    data: notificationId,
    error: queueError,
  } =
    await supabase.rpc(
      "queue_push_notification_v1",
      {
        p_organization_id:
          organizationId,
        p_user_id:
          user.id,
        p_category: "test",
        p_title:
          "Teste de notificação do Ativelo",
        p_message:
          "As notificações push estão funcionando neste dispositivo.",
        p_action_url:
          "/",
        p_source_key:
          sourceKey,
        p_severity:
          "success",
        p_entity_type:
          null,
        p_entity_id:
          null,
        p_scheduled_for:
          new Date().toISOString(),
      },
    );

  if (queueError) {
    throw new Error(
      queueError.message,
    );
  }

  const result =
    await dispatchPending();

  return {
    ok: true,
    notificationId,
    dispatch: result,
  };
}

Deno.serve(
  async (
    request: Request,
  ): Promise<Response> => {
    if (
      request.method ===
        "OPTIONS"
    ) {
      return new Response(
        null,
        {
          status: 204,
          headers: corsHeaders,
        },
      );
    }

    const input =
      await readBody(request);

    const action =
      cleanText(
        input.action,
        40,
      ) ||
      (
        request.method === "GET"
          ? "config"
          : "dispatch"
      );

    try {
      if (action === "config") {
        return json({
          ok: true,
          configured:
            isConfigured(),
          publicKey:
            vapidPublicKey ||
            null,
        });
      }

      if (action === "test") {
        return json(
          await queueTest(
            request,
            input,
          ),
        );
      }

      if (
        action === "dispatch"
      ) {
        if (
          !dispatchAuthorized(
            request,
          )
        ) {
          return json(
            {
              ok: false,
              error:
                "Chave de despacho inválida.",
            },
            401,
          );
        }

        return json(
          await dispatchPending(),
        );
      }

      return json(
        {
          ok: false,
          error:
            "Ação desconhecida.",
        },
        400,
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : String(error);

      console.error(
        JSON.stringify({
          event:
            "ativelo.push.error",
          action,
          message,
        }),
      );

      return json(
        {
          ok: false,
          error: message,
        },
        500,
      );
    }
  },
);
