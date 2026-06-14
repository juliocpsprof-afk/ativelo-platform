import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const resendApiKey = Deno.env.get("RESEND_API_KEY") ?? "";
const resendFromEmail =
  Deno.env.get("RESEND_FROM_EMAIL") ?? "";
const configuredAppBaseUrl =
  Deno.env.get("APP_BASE_URL") ?? "";
const whatsappAccessToken =
  Deno.env.get("WHATSAPP_ACCESS_TOKEN") ?? "";
const whatsappPhoneNumberId =
  Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") ?? "";
const whatsappApiVersion =
  Deno.env.get("WHATSAPP_API_VERSION") ?? "v23.0";

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

const allowedRoles = new Set([
  "owner",
  "admin",
  "it_manager",
  "technician",
  "auditor",
  "user",
]);

const roleLabels: Record<string, string> = {
  owner: "Proprietário",
  admin: "Administrador",
  it_manager: "Gestor de TI",
  technician: "Técnico",
  auditor: "Auditor",
  user: "Usuário",
};

type CommunicationSettings = {
  organization_id: string;
  email_enabled: boolean;
  sender_name: string;
  email_subject_template: string;
  email_intro_text: string;
  email_button_label: string;
  email_footer_text: string;
  support_email: string | null;
  support_phone: string | null;
  primary_color: string;
  whatsapp_mode: "disabled" | "manual" | "automatic";
  default_country_code: string;
  whatsapp_template_name: string;
  whatsapp_language_code: string;
};

type OrganizationRecord = {
  id: string;
  name: string;
  trade_name: string | null;
  legal_name: string | null;
  cnpj: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  website: string | null;
  logo_url: string | null;
};

type InvitationInput = {
  organization_id: string;
  email: string;
  display_name: string;
  role: string;
  employee_code?: string | null;
  job_title?: string | null;
  phone?: string | null;
  unit_id?: string | null;
  department_id?: string | null;
  notification_preference?: string;
  redirect_to?: string;
};

const defaultSettings: Omit<
  CommunicationSettings,
  "organization_id"
> = {
  email_enabled: true,
  sender_name: "Equipe de TI",
  email_subject_template:
    "Você recebeu um convite da {empresa} para acessar o Ativelo",
  email_intro_text:
    "Você foi convidado para acessar o Ativelo, a plataforma de gestão de equipamentos e suporte de TI da {empresa}.",
  email_button_label: "Aceitar convite e criar acesso",
  email_footer_text:
    "Este convite foi enviado pela {empresa} por meio da plataforma Ativelo.",
  support_email: null,
  support_phone: null,
  primary_color: "#1971F5",
  whatsapp_mode: "manual",
  default_country_code: "55",
  whatsapp_template_name: "ativelo_invite",
  whatsapp_language_code: "pt_BR",
};

function jsonResponse(
  body: Record<string, unknown>,
  status = 200,
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

function cleanNullable(value: unknown) {
  const text = String(value ?? "").trim();
  return text || null;
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function sanitizeHeader(value: string) {
  return value.replace(/[\r\n]+/g, " ").trim();
}

function replaceVariables(
  template: string,
  values: {
    company: string;
    name: string;
    role: string;
    sender: string;
  },
) {
  return template
    .replaceAll("{empresa}", values.company)
    .replaceAll("{nome}", values.name)
    .replaceAll("{perfil}", values.role)
    .replaceAll("{remetente}", values.sender);
}

function getAppBaseUrl(redirectTo: unknown) {
  const candidates = [
    configuredAppBaseUrl,
    String(redirectTo ?? ""),
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;

    try {
      const parsed = new URL(candidate);

      if (["http:", "https:"].includes(parsed.protocol)) {
        return parsed.origin;
      }
    } catch {
      continue;
    }
  }

  return "";
}

function normalizePhone(
  rawPhone: string | null,
  countryCode: string,
) {
  const digits = String(rawPhone ?? "").replace(/\D/g, "");

  if (!digits) return "";

  const cleanCountry = countryCode.replace(/\D/g, "") || "55";

  if (digits.startsWith(cleanCountry)) {
    return digits;
  }

  return cleanCountry + digits;
}

async function findUserByEmail(email: string) {
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } =
      await admin.auth.admin.listUsers({
        page,
        perPage: 1000,
      });

    if (error) throw error;

    const found = data.users.find(
      (user) => user.email?.toLowerCase() === email,
    );

    if (found) return found;

    if (data.users.length < 1000) break;
  }

  return null;
}

async function getRequester(
  request: Request,
  organizationId: string,
) {
  const authorization =
    request.headers.get("Authorization") ?? "";
  const token = authorization.replace(/^Bearer\s+/i, "");

  if (!token) {
    throw new Error("AUTHENTICATION_REQUIRED");
  }

  const {
    data: { user: requester },
    error: requesterError,
  } = await admin.auth.getUser(token);

  if (requesterError || !requester) {
    throw new Error("INVALID_AUTHENTICATION");
  }

  const { data: membership, error: membershipError } =
    await admin
      .from("organization_memberships")
      .select("role,is_active,display_name")
      .eq("organization_id", organizationId)
      .eq("user_id", requester.id)
      .maybeSingle();

  if (
    membershipError ||
    !membership ||
    !membership.is_active ||
    !["owner", "admin"].includes(membership.role)
  ) {
    throw new Error("USER_MANAGEMENT_FORBIDDEN");
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("full_name,email")
    .eq("id", requester.id)
    .maybeSingle();

  return {
    requester,
    requesterRole: membership.role,
    requesterName:
      membership.display_name ||
      profile?.full_name ||
      requester.email ||
      "Administrador",
  };
}

async function getOrganizationData(
  organizationId: string,
) {
  const [organizationResult, settingsResult] =
    await Promise.all([
      admin
        .from("organizations")
        .select(
          "id,name,trade_name,legal_name,cnpj,phone,whatsapp,email,website,logo_url",
        )
        .eq("id", organizationId)
        .single(),
      admin
        .from("organization_communication_settings")
        .select("*")
        .eq("organization_id", organizationId)
        .maybeSingle(),
    ]);

  if (organizationResult.error) {
    throw organizationResult.error;
  }

  const organization =
    organizationResult.data as OrganizationRecord;

  const settings: CommunicationSettings = {
    organization_id: organizationId,
    ...defaultSettings,
    ...((settingsResult.data ?? {}) as Partial<CommunicationSettings>),
  };

  return {
    organization,
    settings,
  };
}

function companyDisplayName(organization: OrganizationRecord) {
  return (
    organization.trade_name ||
    organization.name ||
    organization.legal_name ||
    "Empresa"
  );
}

function buildInvitationMessage(params: {
  organization: OrganizationRecord;
  settings: CommunicationSettings;
  displayName: string;
  role: string;
  requesterName: string;
  appBaseUrl: string;
  actionLink: string;
}) {
  const company = companyDisplayName(params.organization);
  const roleLabel =
    roleLabels[params.role] ?? params.role;
  const variables = {
    company,
    name: params.displayName,
    role: roleLabel,
    sender: params.requesterName,
  };

  return [
    `Olá, ${params.displayName}.`,
    "",
    replaceVariables(
      params.settings.email_intro_text,
      variables,
    ),
    "",
    `Empresa: ${company}`,
    `Perfil concedido: ${roleLabel}`,
    `Convite enviado por: ${params.requesterName}`,
    "",
    params.actionLink
      ? `Aceite o convite: ${params.actionLink}`
      : params.appBaseUrl
        ? `Acesso: ${params.appBaseUrl}`
        : "O link de acesso foi enviado para o seu e-mail.",
    "",
    "Caso não reconheça este convite, ignore a mensagem.",
    "",
    "Ativelo · Do patrimônio ao diagnóstico.",
  ].join("\n");
}

function buildWhatsappUrl(
  phone: string,
  message: string,
) {
  if (!phone) return "";

  return `https://wa.me/${phone}?text=${encodeURIComponent(
    message,
  )}`;
}

function buildEmailHtml(params: {
  organization: OrganizationRecord;
  settings: CommunicationSettings;
  displayName: string;
  role: string;
  requesterName: string;
  actionLink: string;
  appBaseUrl: string;
  existingUser: boolean;
  testMode?: boolean;
}) {
  const company = companyDisplayName(params.organization);
  const roleLabel =
    roleLabels[params.role] ?? params.role;
  const variables = {
    company,
    name: params.displayName,
    role: roleLabel,
    sender: params.requesterName,
  };
  const intro = replaceVariables(
    params.settings.email_intro_text,
    variables,
  );
  const footer = replaceVariables(
    params.settings.email_footer_text,
    variables,
  );
  const buttonLabel = params.testMode
    ? "Abrir Ativelo"
    : params.existingUser
      ? "Acessar Ativelo"
      : params.settings.email_button_label;
  const primaryColor =
    /^#[0-9A-Fa-f]{6}$/.test(params.settings.primary_color)
      ? params.settings.primary_color
      : "#1971F5";
  const companyLogo = params.organization.logo_url
    ? `<img src="${escapeHtml(
        params.organization.logo_url,
      )}" alt="${escapeHtml(
        company,
      )}" style="max-width:190px;max-height:82px;object-fit:contain;display:block;margin:0 auto 18px;" />`
    : `<div style="font-size:26px;font-weight:800;color:#15263e;text-align:center;margin-bottom:18px;">${escapeHtml(
        company,
      )}</div>`;
  const ativeloLogo = params.appBaseUrl
    ? `<img src="${escapeHtml(
        params.appBaseUrl,
      )}/assets/ativelo-logo.png" alt="Ativelo" style="width:110px;height:auto;object-fit:contain;" />`
    : `<strong style="font-size:18px;color:#1971F5;">Ativelo</strong>`;
  const contactItems = [
    params.settings.support_email ||
      params.organization.email,
    params.settings.support_phone ||
      params.organization.whatsapp ||
      params.organization.phone,
    params.organization.cnpj
      ? `CNPJ ${params.organization.cnpj}`
      : null,
  ].filter(Boolean);

  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width" />
  <title>Convite Ativelo</title>
</head>
<body style="margin:0;padding:0;background:#f3f6fa;font-family:Arial,Helvetica,sans-serif;color:#203047;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f6fa;padding:28px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 18px 50px rgba(26,45,77,.12);">
          <tr>
            <td style="height:8px;background:${primaryColor};font-size:0;">&nbsp;</td>
          </tr>
          <tr>
            <td style="padding:34px 34px 18px;text-align:center;">
              ${companyLogo}
              <div style="font-size:12px;font-weight:800;letter-spacing:1.4px;color:${primaryColor};text-transform:uppercase;">
                Convite de acesso
              </div>
              <h1 style="margin:10px 0 0;font-size:28px;line-height:1.25;color:#15263e;">
                ${params.testMode
                  ? "Seu modelo de e-mail está pronto"
                  : `Olá, ${escapeHtml(params.displayName)}.`}
              </h1>
            </td>
          </tr>
          <tr>
            <td style="padding:0 34px 10px;">
              <p style="margin:0;font-size:16px;line-height:1.7;color:#526075;">
                ${escapeHtml(intro)}
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:14px 34px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f6f9fd;border:1px solid #e2e9f2;border-radius:14px;">
                <tr>
                  <td style="padding:18px;">
                    <div style="font-size:12px;color:#7b899b;margin-bottom:5px;">Empresa</div>
                    <div style="font-size:15px;font-weight:700;color:#26364c;">${escapeHtml(company)}</div>
                  </td>
                  <td style="padding:18px;">
                    <div style="font-size:12px;color:#7b899b;margin-bottom:5px;">Perfil</div>
                    <div style="font-size:15px;font-weight:700;color:#26364c;">${escapeHtml(roleLabel)}</div>
                  </td>
                </tr>
                <tr>
                  <td colspan="2" style="padding:0 18px 18px;">
                    <div style="font-size:12px;color:#7b899b;margin-bottom:5px;">Convite enviado por</div>
                    <div style="font-size:15px;font-weight:700;color:#26364c;">${escapeHtml(params.requesterName)}</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:20px 34px 26px;">
              <a href="${escapeHtml(params.actionLink)}" style="display:inline-block;padding:15px 24px;border-radius:12px;background:${primaryColor};color:#ffffff;text-decoration:none;font-size:15px;font-weight:800;">
                ${escapeHtml(buttonLabel)}
              </a>
              <p style="margin:18px 0 0;font-size:12px;line-height:1.55;color:#8a96a6;">
                Se o botão não abrir, copie e cole este endereço no navegador:<br />
                <a href="${escapeHtml(params.actionLink)}" style="color:${primaryColor};word-break:break-all;">${escapeHtml(params.actionLink)}</a>
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 34px;background:#fff8e8;border-top:1px solid #f0e3bf;">
              <p style="margin:0;font-size:12px;line-height:1.6;color:#735616;">
                Por segurança, ignore esta mensagem caso não reconheça o convite. A equipe da empresa nunca solicitará sua senha por e-mail ou WhatsApp.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 34px;background:#f7f9fc;border-top:1px solid #e5eaf1;">
              <p style="margin:0 0 12px;font-size:12px;line-height:1.6;color:#66758a;">
                ${escapeHtml(footer)}
              </p>
              ${
                contactItems.length > 0
                  ? `<p style="margin:0 0 16px;font-size:11px;line-height:1.6;color:#8190a3;">${contactItems
                      .map(escapeHtml)
                      .join(" · ")}</p>`
                  : ""
              }
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td>
                    <span style="font-size:10px;color:#8795a7;">Tecnologia e segurança por</span>
                  </td>
                  <td align="right">
                    ${ativeloLogo}
                  </td>
                </tr>
              </table>
              <p style="margin:12px 0 0;font-size:10px;color:#9aa5b4;text-align:right;">
                Do patrimônio ao diagnóstico.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

async function sendEmail(params: {
  to: string;
  subject: string;
  html: string;
  senderName: string;
}) {
  if (!resendApiKey || !resendFromEmail) {
    return {
      status: "not_configured",
      providerId: null,
      error: null,
    };
  }

  const response = await fetch(
    "https://api.resend.com/emails",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `${sanitizeHeader(
          params.senderName || "Ativelo",
        )} <${resendFromEmail}>`,
        to: [params.to],
        subject: sanitizeHeader(params.subject),
        html: params.html,
      }),
    },
  );

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    return {
      status: "failed",
      providerId: null,
      error:
        payload?.message ||
        payload?.error ||
        `Resend returned HTTP ${response.status}.`,
    };
  }

  return {
    status: "sent",
    providerId: payload?.id ?? null,
    error: null,
  };
}

async function sendWhatsappTemplate(params: {
  phone: string;
  templateName: string;
  languageCode: string;
  displayName: string;
  companyName: string;
  roleLabel: string;
  inviteLink: string;
}) {
  if (
    !whatsappAccessToken ||
    !whatsappPhoneNumberId
  ) {
    return {
      status: "not_configured",
      providerId: null,
      error: null,
    };
  }

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
        to: params.phone,
        type: "template",
        template: {
          name: params.templateName,
          language: {
            code: params.languageCode,
          },
          components: [
            {
              type: "body",
              parameters: [
                {
                  type: "text",
                  text: params.displayName,
                },
                {
                  type: "text",
                  text: params.companyName,
                },
                {
                  type: "text",
                  text: params.roleLabel,
                },
                {
                  type: "text",
                  text: params.inviteLink,
                },
              ],
            },
          ],
        },
      }),
    },
  );

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    return {
      status: "failed",
      providerId: null,
      error:
        payload?.error?.message ||
        `WhatsApp returned HTTP ${response.status}.`,
    };
  }

  return {
    status: "sent",
    providerId:
      payload?.messages?.[0]?.id ?? null,
    error: null,
  };
}

async function createAccessLink(params: {
  email: string;
  displayName: string;
  redirectTo: string;
  existingUser: boolean;
}) {
  const type = params.existingUser
    ? "magiclink"
    : "invite";

  const { data, error } =
    await admin.auth.admin.generateLink({
      type,
      email: params.email,
      options: {
        redirectTo: params.redirectTo || undefined,
        data: {
          full_name: params.displayName,
        },
      },
    });

  if (error) throw error;

  const actionLink =
    data.properties?.action_link ?? "";

  if (!actionLink) {
    throw new Error(
      "The access link could not be generated.",
    );
  }

  return {
    actionLink,
    user: data.user,
  };
}

async function upsertMember(params: {
  input: InvitationInput;
  userId: string;
  requesterId: string;
}) {
  const { error: profileError } = await admin
    .from("profiles")
    .upsert(
      {
        id: params.userId,
        email: params.input.email,
        full_name: params.input.display_name,
        is_active: true,
      },
      {
        onConflict: "id",
      },
    );

  if (profileError) throw profileError;

  const { error: membershipError } = await admin
    .from("organization_memberships")
    .upsert(
      {
        organization_id:
          params.input.organization_id,
        user_id: params.userId,
        role: params.input.role,
        is_active: true,
        display_name: params.input.display_name,
        employee_code: cleanNullable(
          params.input.employee_code,
        ),
        job_title: cleanNullable(
          params.input.job_title,
        ),
        phone: cleanNullable(params.input.phone),
        unit_id: cleanNullable(params.input.unit_id),
        department_id: cleanNullable(
          params.input.department_id,
        ),
        notification_preference:
          String(
            params.input.notification_preference ??
              "in_app",
          ) || "in_app",
        invited_by: params.requesterId,
        invited_at: new Date().toISOString(),
      },
      {
        onConflict: "organization_id,user_id",
      },
    );

  if (membershipError) throw membershipError;
}

async function sendInvitation(params: {
  input: InvitationInput;
  requesterId: string;
  requesterName: string;
  requesterRole: string;
  existingInvitationId?: string | null;
  preserveMembership?: boolean;
}) {
  if (
    !params.input.organization_id ||
    !params.input.email ||
    !params.input.display_name ||
    !allowedRoles.has(params.input.role)
  ) {
    throw new Error(
      "Required invitation data is invalid.",
    );
  }

  if (
    params.input.role === "owner" &&
    params.requesterRole !== "owner"
  ) {
    throw new Error(
      "Only an owner can grant the owner profile.",
    );
  }

  const {
    organization,
    settings,
  } = await getOrganizationData(
    params.input.organization_id,
  );

  const appBaseUrl = getAppBaseUrl(
    params.input.redirect_to,
  );
  const existingUser = await findUserByEmail(
    params.input.email,
  );

  const linkResult = await createAccessLink({
    email: params.input.email,
    displayName: params.input.display_name,
    redirectTo: appBaseUrl,
    existingUser: Boolean(existingUser),
  });

  const targetUser =
    existingUser ?? linkResult.user;

  if (!targetUser) {
    throw new Error(
      "The user could not be created or located.",
    );
  }

  if (!params.preserveMembership || !existingUser) {
    await upsertMember({
      input: params.input,
      userId: targetUser.id,
      requesterId: params.requesterId,
    });
  }

  const companyName = companyDisplayName(organization);
  const roleLabel =
    roleLabels[params.input.role] ?? params.input.role;
  const variables = {
    company: companyName,
    name: params.input.display_name,
    role: roleLabel,
    sender: params.requesterName,
  };
  const subject = replaceVariables(
    settings.email_subject_template,
    variables,
  );
  const html = buildEmailHtml({
    organization,
    settings,
    displayName: params.input.display_name,
    role: params.input.role,
    requesterName: params.requesterName,
    actionLink: linkResult.actionLink,
    appBaseUrl,
    existingUser: Boolean(existingUser),
  });

  let emailResult = {
    status: "disabled",
    providerId: null as string | null,
    error: null as string | null,
  };

  if (settings.email_enabled) {
    emailResult = await sendEmail({
      to: params.input.email,
      subject,
      html,
      senderName:
        `${settings.sender_name} · ${companyName}`,
    });
  }

  const normalizedPhone = normalizePhone(
    cleanNullable(params.input.phone),
    settings.default_country_code,
  );
  const whatsappMessage = buildInvitationMessage({
    organization,
    settings,
    displayName: params.input.display_name,
    role: params.input.role,
    requesterName: params.requesterName,
    appBaseUrl,
    actionLink: linkResult.actionLink,
  });
  const whatsappUrl = buildWhatsappUrl(
    normalizedPhone,
    whatsappMessage,
  );

  let whatsappResult = {
    status: normalizedPhone
      ? settings.whatsapp_mode === "disabled"
        ? "disabled"
        : "manual_ready"
      : "not_requested",
    providerId: null as string | null,
    error: null as string | null,
  };

  if (
    normalizedPhone &&
    settings.whatsapp_mode === "automatic"
  ) {
    whatsappResult = await sendWhatsappTemplate({
      phone: normalizedPhone,
      templateName:
        settings.whatsapp_template_name,
      languageCode:
        settings.whatsapp_language_code,
      displayName: params.input.display_name,
      companyName,
      roleLabel,
      inviteLink: linkResult.actionLink,
    });
  }

  const invitationPayload = {
    organization_id:
      params.input.organization_id,
    auth_user_id: targetUser.id,
    email: params.input.email,
    display_name: params.input.display_name,
    phone: cleanNullable(params.input.phone),
    role: params.input.role,
    status:
      emailResult.status === "failed" &&
      whatsappResult.status === "failed"
        ? "failed"
        : "sent",
    email_status: emailResult.status,
    whatsapp_status: whatsappResult.status,
    email_provider_id: emailResult.providerId,
    whatsapp_provider_id:
      whatsappResult.providerId,
    last_error:
      [emailResult.error, whatsappResult.error]
        .filter(Boolean)
        .join(" | ") || null,
    invited_by: params.requesterId,
    last_sent_at: new Date().toISOString(),
  };

  let invitationId =
    params.existingInvitationId ?? null;

  if (invitationId) {
    const { error } = await admin
      .from("organization_invitations")
      .update(invitationPayload)
      .eq("id", invitationId)
      .eq(
        "organization_id",
        params.input.organization_id,
      );

    if (error) throw error;
  } else {
    const { data, error } = await admin
      .from("organization_invitations")
      .insert(invitationPayload)
      .select("id")
      .single();

    if (error) throw error;

    invitationId = data.id;
  }

  return {
    ok: true,
    invitation_id: invitationId,
    existing_user: Boolean(existingUser),
    user_id: targetUser.id,
    email_status: emailResult.status,
    whatsapp_status: whatsappResult.status,
    invite_url: linkResult.actionLink,
    whatsapp_url: whatsappUrl,
    whatsapp_message: whatsappMessage,
    email_error: emailResult.error,
    whatsapp_error: whatsappResult.error,
  };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders,
    });
  }

  if (request.method !== "POST") {
    return jsonResponse(
      { error: "Method not allowed." },
      405,
    );
  }

  try {
    const body = await request.json();
    const action = String(body.action ?? "invite");
    const organizationId = String(
      body.organization_id ?? "",
    ).trim();

    if (!organizationId) {
      return jsonResponse(
        { error: "Organization is required." },
        400,
      );
    }

    const requesterData = await getRequester(
      request,
      organizationId,
    );

    if (action === "status") {
      return jsonResponse({
        resend_configured: Boolean(
          resendApiKey && resendFromEmail,
        ),
        whatsapp_configured: Boolean(
          whatsappAccessToken &&
            whatsappPhoneNumberId,
        ),
        app_base_url_configured: Boolean(
          configuredAppBaseUrl,
        ),
      });
    }

    if (action === "test_email") {
      const targetEmail = String(
        body.email ?? requesterData.requester.email ?? "",
      )
        .trim()
        .toLowerCase();

      if (!targetEmail) {
        return jsonResponse(
          { error: "Test e-mail is required." },
          400,
        );
      }

      const {
        organization,
        settings,
      } = await getOrganizationData(
        organizationId,
      );
      const appBaseUrl = getAppBaseUrl(
        body.redirect_to,
      );
      const companyName =
        companyDisplayName(organization);
      const subject =
        `Teste de convite personalizado · ${companyName}`;
      const actionLink = appBaseUrl || "https://ativelo.app";
      const html = buildEmailHtml({
        organization,
        settings,
        displayName:
          requesterData.requesterName,
        role: requesterData.requesterRole,
        requesterName:
          requesterData.requesterName,
        actionLink,
        appBaseUrl,
        existingUser: true,
        testMode: true,
      });

      const result = await sendEmail({
        to: targetEmail,
        subject,
        html,
        senderName:
          `${settings.sender_name} · ${companyName}`,
      });

      if (result.status !== "sent") {
        return jsonResponse(
          {
            ok: false,
            error:
              result.error ??
              "Resend is not configured.",
          },
          400,
        );
      }

      return jsonResponse({
        ok: true,
        provider_id: result.providerId,
      });
    }

    if (action === "resend") {
      const invitationId = String(
        body.invitation_id ?? "",
      ).trim();

      if (!invitationId) {
        return jsonResponse(
          { error: "Invitation is required." },
          400,
        );
      }

      const { data: invitation, error } =
        await admin
          .from("organization_invitations")
          .select(
            "id,organization_id,email,display_name,phone,role",
          )
          .eq("id", invitationId)
          .eq("organization_id", organizationId)
          .single();

      if (error) throw error;

      return jsonResponse(
        await sendInvitation({
          input: {
            organization_id:
              invitation.organization_id,
            email: invitation.email,
            display_name:
              invitation.display_name,
            phone: invitation.phone,
            role: invitation.role,
            notification_preference:
              "in_app",
            redirect_to: body.redirect_to,
          },
          requesterId:
            requesterData.requester.id,
          requesterName:
            requesterData.requesterName,
          requesterRole:
            requesterData.requesterRole,
          existingInvitationId:
            invitation.id,
          preserveMembership: true,
        }),
      );
    }

    const input: InvitationInput = {
      organization_id: organizationId,
      email: String(body.email ?? "")
        .trim()
        .toLowerCase(),
      display_name: String(
        body.display_name ?? "",
      ).trim(),
      role: String(body.role ?? "user").trim(),
      employee_code: cleanNullable(
        body.employee_code,
      ),
      job_title: cleanNullable(body.job_title),
      phone: cleanNullable(body.phone),
      unit_id: cleanNullable(body.unit_id),
      department_id: cleanNullable(
        body.department_id,
      ),
      notification_preference:
        String(
          body.notification_preference ?? "in_app",
        ) || "in_app",
      redirect_to: String(body.redirect_to ?? ""),
    };

    return jsonResponse(
      await sendInvitation({
        input,
        requesterId:
          requesterData.requester.id,
        requesterName:
          requesterData.requesterName,
        requesterRole:
          requesterData.requesterRole,
      }),
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unexpected error.";

    if (message === "AUTHENTICATION_REQUIRED") {
      return jsonResponse(
        { error: "Authentication is required." },
        401,
      );
    }

    if (message === "INVALID_AUTHENTICATION") {
      return jsonResponse(
        { error: "Invalid authentication." },
        401,
      );
    }

    if (message === "USER_MANAGEMENT_FORBIDDEN") {
      return jsonResponse(
        {
          error:
            "You cannot manage users in this company.",
        },
        403,
      );
    }

    return jsonResponse({ error: message }, 500);
  }
});
