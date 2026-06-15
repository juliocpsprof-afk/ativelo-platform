export type ManualInviteEmailInput = {
  recipientEmail: string;
  recipientName: string;
  companyName: string;
  roleLabel: string;
  inviterName?: string | null;
  inviteUrl: string;
  supportEmail?: string | null;
  supportPhone?: string | null;
};

export type ManualInviteEmail = {
  recipient: string;
  subject: string;
  body: string;
  mailtoUrl: string;
};

function clean(value: string | null | undefined): string {
  return String(value ?? "").trim();
}

export function buildManualInviteEmail(
  input: ManualInviteEmailInput,
): ManualInviteEmail {
  const recipient = clean(input.recipientEmail);
  const recipientName =
    clean(input.recipientName) || "Olá";
  const companyName =
    clean(input.companyName) || "sua empresa";
  const roleLabel =
    clean(input.roleLabel) || "Usuário";
  const inviterName = clean(input.inviterName);
  const supportEmail = clean(input.supportEmail);
  const supportPhone = clean(input.supportPhone);

  const subject =
    `Convite para acessar ${companyName} no Ativelo`;

  const lines = [
    `Olá, ${recipientName}.`,
    "",
    `Você foi convidado para acessar a empresa ${companyName} no Ativelo.`,
    "",
    `Perfil concedido: ${roleLabel}`,
    inviterName
      ? `Convite enviado por: ${inviterName}`
      : "",
    "",
    "Use o link abaixo para aceitar o convite e concluir seu acesso:",
    input.inviteUrl,
    "",
    "No primeiro acesso, o Ativelo solicitará a criação de uma senha.",
    "",
    supportEmail
      ? `E-mail de suporte: ${supportEmail}`
      : "",
    supportPhone
      ? `Telefone ou WhatsApp de suporte: ${supportPhone}`
      : "",
    "",
    "Caso não reconheça este convite, ignore esta mensagem.",
    "",
    "Ativelo · Do patrimônio ao diagnóstico.",
  ].filter((line, index, values) => {
    if (line !== "") {
      return true;
    }

    return index === 0 || values[index - 1] !== "";
  });

  const body = lines.join("\n");

  const mailtoUrl =
    `mailto:${encodeURIComponent(recipient)}` +
    `?subject=${encodeURIComponent(subject)}` +
    `&body=${encodeURIComponent(body)}`;

  return {
    recipient,
    subject,
    body,
    mailtoUrl,
  };
}

export function openManualInviteEmail(
  message: ManualInviteEmail,
): void {
  window.location.href = message.mailtoUrl;
}

export async function shareManualInvite(
  message: ManualInviteEmail,
): Promise<boolean> {
  if (!navigator.share) {
    return false;
  }

  await navigator.share({
    title: message.subject,
    text: message.body,
  });

  return true;
}