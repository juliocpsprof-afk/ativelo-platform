import { supabase } from "./supabase";

export type PushSupport = {
  supported: boolean;
  permission:
    | NotificationPermission
    | "unsupported";
  active: boolean;
};

type PushConfigResponse = {
  ok?: boolean;
  configured?: boolean;
  publicKey?: string | null;
  error?: string;
};

function urlBase64ToArrayBuffer(
  base64String: string,
): ArrayBuffer {
  const padding =
    "=".repeat(
      (
        4 -
        (
          base64String.length %
          4
        )
      ) %
        4,
    );

  const base64 =
    (
      base64String +
      padding
    )
      .replace(/-/g, "+")
      .replace(/_/g, "/");

  const rawData =
    window.atob(base64);

  const bytes =
    new Uint8Array(
      rawData.length,
    );

  for (
    let index = 0;
    index < rawData.length;
    index += 1
  ) {
    bytes[index] =
      rawData.charCodeAt(index);
  }

  return bytes.buffer;
}

async function getRegistration(): Promise<ServiceWorkerRegistration> {
  if (
    !("serviceWorker" in navigator)
  ) {
    throw new Error(
      "Este navegador não oferece suporte a service worker.",
    );
  }

  let registration =
    await navigator.serviceWorker
      .getRegistration("/");

  if (!registration) {
    registration =
      await navigator.serviceWorker
        .register(
          "/sw.js",
          {
            scope: "/",
            updateViaCache:
              "none",
          },
        );
  }

  return navigator.serviceWorker.ready;
}

async function getConfig(): Promise<{
  configured: boolean;
  publicKey: string;
}> {
  const {
    data,
    error,
  } =
    await supabase.functions.invoke<
      PushConfigResponse
    >(
      "dispatch-web-push",
      {
        body: {
          action: "config",
        },
      },
    );

  if (error) {
    throw new Error(
      error.message,
    );
  }

  if (
    !data?.configured ||
    !data.publicKey
  ) {
    throw new Error(
      "As chaves de notificação ainda não foram configuradas no servidor.",
    );
  }

  return {
    configured: true,
    publicKey:
      data.publicKey,
  };
}

export async function getPushSupport(): Promise<PushSupport> {
  if (
    !("Notification" in window) ||
    !("PushManager" in window) ||
    !("serviceWorker" in navigator)
  ) {
    return {
      supported: false,
      permission:
        "unsupported",
      active: false,
    };
  }

  const registration =
    await navigator.serviceWorker
      .getRegistration("/");

  const subscription =
    await registration?.pushManager
      .getSubscription();

  return {
    supported: true,
    permission:
      Notification.permission,
    active:
      Boolean(subscription),
  };
}

export async function enablePushNotifications(
  organizationId: string,
  deviceName: string,
): Promise<void> {
  if (
    !("Notification" in window) ||
    !("PushManager" in window)
  ) {
    throw new Error(
      "Este navegador não oferece suporte a notificações push.",
    );
  }

  const permission =
    await Notification
      .requestPermission();

  if (permission !== "granted") {
    throw new Error(
      permission === "denied"
        ? "A permissão foi bloqueada no navegador. Libere as notificações nas configurações do site."
        : "A permissão para notificações não foi concedida.",
    );
  }

  const [
    registration,
    config,
  ] =
    await Promise.all([
      getRegistration(),
      getConfig(),
    ]);

  let subscription =
    await registration.pushManager
      .getSubscription();

  if (!subscription) {
    subscription =
      await registration.pushManager
        .subscribe({
          userVisibleOnly: true,
          applicationServerKey:
            urlBase64ToArrayBuffer(
              config.publicKey,
            ),
        });
  }

  const serialized =
    subscription.toJSON();

  const p256dh =
    serialized.keys?.p256dh;

  const auth =
    serialized.keys?.auth;

  if (!p256dh || !auth) {
    throw new Error(
      "O navegador não forneceu as chaves da assinatura push.",
    );
  }

  const {
    error,
  } =
    await (
      supabase as any
    ).rpc(
      "register_my_web_push_subscription_v1",
      {
        p_organization_id:
          organizationId,
        p_endpoint:
          subscription.endpoint,
        p_p256dh: p256dh,
        p_auth_key: auth,
        p_device_name:
          deviceName.trim() ||
          "Dispositivo atual",
        p_user_agent:
          navigator.userAgent,
        p_platform:
          navigator.platform ||
          "web",
      },
    );

  if (error) {
    throw new Error(
      error.message,
    );
  }
}

export async function disablePushNotifications(): Promise<void> {
  const registration =
    await navigator.serviceWorker
      .getRegistration("/");

  const subscription =
    await registration?.pushManager
      .getSubscription();

  if (!subscription) {
    return;
  }

  const {
    error,
  } =
    await (
      supabase as any
    ).rpc(
      "disable_my_web_push_subscription_v1",
      {
        p_endpoint:
          subscription.endpoint,
      },
    );

  if (error) {
    throw new Error(
      error.message,
    );
  }

  await subscription.unsubscribe();
}

export async function sendPushTest(
  organizationId: string,
): Promise<void> {
  const {
    data,
    error,
  } =
    await supabase.functions.invoke<
      {
        ok?: boolean;
        error?: string;
      }
    >(
      "dispatch-web-push",
      {
        body: {
          action: "test",
          organizationId,
        },
      },
    );

  if (error) {
    throw new Error(
      error.message,
    );
  }

  if (!data?.ok) {
    throw new Error(
      data?.error ||
      "O teste não foi enviado.",
    );
  }
}
