export interface PushSchedulerEnv {
  APP_ENV?: string;
  SUPABASE_URL: string;
  PUSH_DISPATCH_SECRET?: string;
}

export interface PushScheduledEvent {
  cron: string;
  scheduledTime: number;
}

export async function dispatchPushNotifications(
  env: PushSchedulerEnv,
  event: PushScheduledEvent,
): Promise<void> {
  const secret =
    env.PUSH_DISPATCH_SECRET?.trim();

  const supabaseUrl =
    env.SUPABASE_URL?.trim()
      .replace(/\/+$/, "");

  if (!secret || !supabaseUrl) {
    console.warn(
      JSON.stringify({
        event:
          "ativelo.push.scheduler_skipped",
        reason:
          "PUSH_DISPATCH_SECRET ou SUPABASE_URL ausente.",
        cron: event.cron,
        scheduledTime:
          event.scheduledTime,
        environment:
          env.APP_ENV ??
          "development",
      }),
    );

    return;
  }

  try {
    const response =
      await fetch(
        `${supabaseUrl}/functions/v1/dispatch-web-push`,
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
            "X-Ativelo-Push-Secret":
              secret,
          },
          body: JSON.stringify({
            action: "dispatch",
            source:
              "cloudflare_cron",
            cron: event.cron,
            scheduledTime:
              event.scheduledTime,
          }),
        },
      );

    const responseText =
      await response.text();

    if (!response.ok) {
      throw new Error(
        `HTTP ${response.status}: ${responseText.slice(0, 1000)}`,
      );
    }

    console.log(
      JSON.stringify({
        event:
          "ativelo.push.scheduler_completed",
        cron: event.cron,
        scheduledTime:
          event.scheduledTime,
        response:
          responseText.slice(
            0,
            2000,
          ),
      }),
    );
  } catch (error) {
    console.error(
      JSON.stringify({
        event:
          "ativelo.push.scheduler_failed",
        cron: event.cron,
        scheduledTime:
          event.scheduledTime,
        message:
          error instanceof Error
            ? error.message
            : String(error),
      }),
    );
  }
}
