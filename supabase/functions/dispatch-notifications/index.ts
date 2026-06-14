import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type NotificationRow = {
  id: string;
  organization_id: string;
  channel: "in_app" | "email" | "whatsapp";
  title: string;
  message: string;
  recipient_email: string | null;
  recipient_phone: string | null;
  delivery_status: string;
  scheduled_for: string;
};

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const resendApiKey = Deno.env.get("RESEND_API_KEY") ?? "";
const resendFromEmail = Deno.env.get("RESEND_FROM_EMAIL") ?? "";
const whatsappAccessToken = Deno.env.get("WHATSAPP_ACCESS_TOKEN") ?? "";
const whatsappPhoneNumberId =
  Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") ?? "";
const whatsappTemplateName =
  Deno.env.get("WHATSAPP_TEMPLATE_NAME") ?? "ativelo_alert";
const whatsappLanguageCode =
  Deno.env.get("WHATSAPP_LANGUAGE_CODE") ?? "pt_BR";
const whatsappApiVersion =
  Deno.env.get("WHATSAPP_API_VERSION") ?? "v23.0";

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function sendEmail(notification: NotificationRow) {
  if (!resendApiKey || !resendFromEmail || !notification.recipient_email) {
    throw new Error("Credenciais ou destinatário de e-mail ausentes.");
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: resendFromEmail,
      to: [notification.recipient_email],
      subject: notification.title,
      html: `<div style="font-family:Arial,sans-serif;line-height:1.6">
        <h2>${notification.title}</h2>
        <p>${notification.message}</p>
        <p style="color:#64748b">Mensagem automática do Ativelo.</p>
      </div>`,
    }),
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }
}

async function sendWhatsapp(notification: NotificationRow) {
  if (
    !whatsappAccessToken ||
    !whatsappPhoneNumberId ||
    !notification.recipient_phone
  ) {
    throw new Error("Credenciais ou número do WhatsApp ausentes.");
  }

  const phone = notification.recipient_phone.replace(/\D/g, "");

  const response = await fetch(
    `https://graph.facebook.com/${whatsappApiVersion}/${whatsappPhoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${whatsappAccessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: phone,
        type: "template",
        template: {
          name: whatsappTemplateName,
          language: { code: whatsappLanguageCode },
          components: [
            {
              type: "body",
              parameters: [
                { type: "text", text: notification.title },
                { type: "text", text: notification.message },
              ],
            },
          ],
        },
      }),
    },
  );

  if (!response.ok) {
    throw new Error(await response.text());
  }
}

Deno.serve(async () => {
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("app_notifications")
    .select(
      "id,organization_id,channel,title,message,recipient_email,recipient_phone,delivery_status,scheduled_for",
    )
    .in("channel", ["email", "whatsapp"])
    .in("delivery_status", ["pending", "failed"])
    .lte("scheduled_for", now)
    .order("scheduled_for")
    .limit(50);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const results = [];

  for (const notification of (data ?? []) as NotificationRow[]) {
    try {
      await supabase
        .from("app_notifications")
        .update({ delivery_status: "processing", last_error: null })
        .eq("id", notification.id);

      if (notification.channel === "email") {
        await sendEmail(notification);
      } else {
        await sendWhatsapp(notification);
      }

      await supabase
        .from("app_notifications")
        .update({
          delivery_status: "sent",
          sent_at: new Date().toISOString(),
          last_error: null,
        })
        .eq("id", notification.id);

      results.push({ id: notification.id, status: "sent" });
    } catch (sendError) {
      const message =
        sendError instanceof Error ? sendError.message : String(sendError);

      await supabase
        .from("app_notifications")
        .update({
          delivery_status: "failed",
          last_error: message.slice(0, 2000),
        })
        .eq("id", notification.id);

      results.push({
        id: notification.id,
        status: "failed",
        error: message,
      });
    }
  }

  return new Response(
    JSON.stringify({ processed: results.length, results }),
    {
      headers: { "Content-Type": "application/json" },
    },
  );
});
