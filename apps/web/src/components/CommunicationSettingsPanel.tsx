import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";

import type { OrganizationContext } from "../App";
import AppIcon from "./AppIcon";
import OrganizationBrand from "./OrganizationBrand";
import { useAuth } from "../contexts/AuthContext";
import {
  buildManualInviteEmail,
  openManualInviteEmail,
} from "../lib/manualInviteEmail";
import { supabase } from "../lib/supabase";

import PushNotificationPanel from "./PushNotificationPanel";
type Props = {
  organization: OrganizationContext;
};

type CommunicationSettings = {
  organization_id: string;
  email_enabled: boolean;
  sender_name: string;
  email_subject_template: string;
  email_intro_text: string;
  email_button_label: string;
  email_footer_text: string;
  support_email: string;
  support_phone: string;
  primary_color: string;
  whatsapp_mode:
    | "disabled"
    | "manual"
    | "automatic";
  default_country_code: string;
  whatsapp_template_name: string;
  whatsapp_language_code: string;
};

type IntegrationStatus = {
  resend_configured?: boolean;
  whatsapp_configured?: boolean;
  app_base_url_configured?: boolean;
};

const defaultSettings: CommunicationSettings = {
  organization_id: "",
  email_enabled: true,
  sender_name: "Equipe de TI",
  email_subject_template:
    "Você recebeu um convite da {empresa} para acessar o Ativelo",
  email_intro_text:
    "Você foi convidado para acessar o Ativelo, a plataforma de gestão de equipamentos e suporte de TI da {empresa}.",
  email_button_label:
    "Aceitar convite e criar acesso",
  email_footer_text:
    "Este convite foi enviado pela {empresa} por meio da plataforma Ativelo.",
  support_email: "",
  support_phone: "",
  primary_color: "#1971F5",
  whatsapp_mode: "manual",
  default_country_code: "55",
  whatsapp_template_name: "ativelo_invite",
  whatsapp_language_code: "pt_BR",
};

export default function CommunicationSettingsPanel({
  organization,
}: Props) {
  const { user } = useAuth();

  const [settings, setSettings] =
    useState<CommunicationSettings>({
      ...defaultSettings,
      organization_id: organization.organizationId,
    });

  const [integrationStatus, setIntegrationStatus] =
    useState<IntegrationStatus>({});

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error" | "warning";
    text: string;
  } | null>(null);

  const companyName =
    organization.tradeName ||
    organization.organizationName;

  const loadSettings = useCallback(async () => {
    setIsLoading(true);
    setFeedback(null);

    const [settingsResult, statusResult] =
      await Promise.all([
        (supabase as any)
          .from("organization_communication_settings")
          .select("*")
          .eq(
            "organization_id",
            organization.organizationId,
          )
          .maybeSingle(),
        supabase.functions.invoke(
          "invite-organization-user",
          {
            body: {
              action: "status",
              organization_id:
                organization.organizationId,
            },
          },
        ),
      ]);

    if (settingsResult.error) {
      setFeedback({
        type: "error",
        text: settingsResult.error.message,
      });
      setIsLoading(false);
      return;
    }

    if (settingsResult.data) {
      setSettings({
        ...defaultSettings,
        ...(settingsResult.data as CommunicationSettings),
      });
    }

    if (!statusResult.error && statusResult.data) {
      setIntegrationStatus(
        statusResult.data as IntegrationStatus,
      );
    }

    setIsLoading(false);
  }, [organization.organizationId]);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const previewSubject = useMemo(
    () =>
      settings.email_subject_template
        .replaceAll("{empresa}", companyName)
        .replaceAll("{nome}", "Nome do convidado")
        .replaceAll("{perfil}", "Usuário")
        .replaceAll(
          "{remetente}",
          settings.sender_name || "Equipe de TI",
        ),
    [
      companyName,
      settings.email_subject_template,
      settings.sender_name,
    ],
  );

  const previewIntro = useMemo(
    () =>
      settings.email_intro_text
        .replaceAll("{empresa}", companyName)
        .replaceAll("{nome}", "Nome do convidado")
        .replaceAll("{perfil}", "Usuário")
        .replaceAll(
          "{remetente}",
          settings.sender_name || "Equipe de TI",
        ),
    [
      companyName,
      settings.email_intro_text,
      settings.sender_name,
    ],
  );

  const saveSettings = async (
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();
    setFeedback(null);
    setIsSaving(true);

    const { error } = await (supabase as any)
      .from("organization_communication_settings")
      .upsert(
        {
          ...settings,
          organization_id:
            organization.organizationId,
        },
        {
          onConflict: "organization_id",
        },
      );

    setIsSaving(false);

    if (error) {
      setFeedback({
        type: "error",
        text: error.message,
      });
      return;
    }

    setFeedback({
      type: "success",
      text:
        "Preferências de comunicação salvas.",
    });
  };

  const testManualEmail = () => {
    if (!user?.email) {
      setFeedback({
        type: "error",
        text:
          "Seu usuário não possui e-mail para o teste.",
      });
      return;
    }

    const message = buildManualInviteEmail({
      recipientEmail: user.email,
      recipientName:
        String(
          user.user_metadata?.full_name ??
            user.email,
        ),
      companyName,
      roleLabel: "Administrador",
      inviterName:
        settings.sender_name || "Equipe de TI",
      inviteUrl: window.location.origin,
      supportEmail: settings.support_email,
      supportPhone: settings.support_phone,
    });

    openManualInviteEmail(message);

    setFeedback({
      type: "success",
      text:
        "O aplicativo de e-mail foi aberto com a mensagem preenchida. Revise e envie.",
    });
  };

  if (isLoading) {
    return (
      <div className="ativelo-settings-loading">
        Carregando comunicação e convites...
      </div>
    );
  }

  return (
    <form
      className="ativelo-communication-settings"
      onSubmit={saveSettings}
    >
      <header className="ativelo-communication-hero">
        <div>
          <span>CONVITES SEM DOMÍNIO</span>
          <h2>Comunicação simples e acessível</h2>
          <p>
            O Ativelo prepara o convite e abre o aplicativo
            de e-mail ou WhatsApp já preenchido. Não exige
            domínio, API, SMTP nem configuração técnica.
          </p>
        </div>

        <OrganizationBrand
          organization={organization}
          compact
        />
      </header>

      {feedback && (
        <div
          className={`ativelo-settings-feedback ${feedback.type}`}
        >
          {feedback.text}
        </div>
      )}

      <section className="ativelo-channel-grid">
        <article className="active">
          <AppIcon name="mail" size={24} />
          <div>
            <strong>E-mail pelo seu aplicativo</strong>
            <span>
              Abre Gmail, Outlook ou outro aplicativo com
              destinatário e mensagem preenchidos.
            </span>
          </div>
          <b>Ativo</b>
        </article>

        <article className="active">
          <AppIcon name="phone" size={24} />
          <div>
            <strong>WhatsApp manual</strong>
            <span>
              Abre a conversa com a mensagem pronta para
              confirmação do envio.
            </span>
          </div>
          <b>Ativo</b>
        </article>

        <article>
          <AppIcon name="settings" size={24} />
          <div>
            <strong>Envio automático</strong>
            <span>
              Gmail API, SMTP ou provedor próprio poderão ser
              conectados futuramente.
            </span>
          </div>
          <b>Opcional</b>
        </article>
      </section>

      <section className="ativelo-communication-card">
        <header>
          <div>
            <span>E-MAIL MANUAL</span>
            <h3>Mensagem preparada pelo Ativelo</h3>
          </div>
        </header>

        <label className="ativelo-switch-row">
          <input
            type="checkbox"
            checked={settings.email_enabled}
            onChange={(event) =>
              setSettings({
                ...settings,
                email_enabled: event.target.checked,
              })
            }
          />
          Preparar opção de envio por e-mail
        </label>

        <div className="two">
          <label>
            <span>Nome do remetente</span>
            <input
              value={settings.sender_name}
              onChange={(event) =>
                setSettings({
                  ...settings,
                  sender_name: event.target.value,
                })
              }
              placeholder="Equipe de TI"
            />
          </label>

          <label>
            <span>Cor principal</span>
            <input
              type="color"
              value={settings.primary_color}
              onChange={(event) =>
                setSettings({
                  ...settings,
                  primary_color: event.target.value,
                })
              }
            />
          </label>
        </div>

        <label>
          <span>Assunto sugerido</span>
          <input
            value={settings.email_subject_template}
            onChange={(event) =>
              setSettings({
                ...settings,
                email_subject_template:
                  event.target.value,
              })
            }
          />
          <small>
            Variáveis: {"{empresa}"}, {"{nome}"},{" "}
            {"{perfil}"} e {"{remetente}"}.
          </small>
        </label>

        <label>
          <span>Texto de apresentação</span>
          <textarea
            rows={5}
            value={settings.email_intro_text}
            onChange={(event) =>
              setSettings({
                ...settings,
                email_intro_text:
                  event.target.value,
              })
            }
          />
        </label>

        <div className="two">
          <label>
            <span>E-mail de suporte</span>
            <input
              type="email"
              value={settings.support_email}
              onChange={(event) =>
                setSettings({
                  ...settings,
                  support_email: event.target.value,
                })
              }
            />
          </label>

          <label>
            <span>Telefone ou WhatsApp de suporte</span>
            <input
              value={settings.support_phone}
              onChange={(event) =>
                setSettings({
                  ...settings,
                  support_phone: event.target.value,
                })
              }
            />
          </label>
        </div>

        <div className="ativelo-email-preview">
          <div
            className="ativelo-email-preview-bar"
            style={{
              background: settings.primary_color,
            }}
          />

          <OrganizationBrand
            organization={organization}
            compact
          />

          <h4>{previewSubject}</h4>
          <p>{previewIntro}</p>

          <button
            type="button"
            style={{
              background: settings.primary_color,
            }}
          >
            {settings.email_button_label}
          </button>

          <footer>
            <span>{settings.email_footer_text}</span>
            <img
              src="/assets/ativelo-logo.png"
              alt="Ativelo"
            />
          </footer>
        </div>

        <button
          type="button"
          className="secondary"
          onClick={testManualEmail}
        >
          <AppIcon name="mail" size={18} />
          Testar abertura do aplicativo de e-mail
        </button>
      </section>

      <section className="ativelo-communication-card">
        <header>
          <div>
            <span>WHATSAPP</span>
            <h3>Modo de envio do convite</h3>
          </div>
        </header>

        <div className="three">
          <label>
            <span>Modo</span>
            <select
              value={settings.whatsapp_mode}
              onChange={(event) =>
                setSettings({
                  ...settings,
                  whatsapp_mode:
                    event.target
                      .value as CommunicationSettings["whatsapp_mode"],
                })
              }
            >
              <option value="disabled">
                Desativado
              </option>
              <option value="manual">
                Manual, abrindo o WhatsApp
              </option>
              <option value="automatic">
                Automático pela Cloud API
              </option>
            </select>
          </label>

          <label>
            <span>Código do país</span>
            <input
              value={settings.default_country_code}
              onChange={(event) =>
                setSettings({
                  ...settings,
                  default_country_code:
                    event.target.value.replace(
                      /\D/g,
                      "",
                    ),
                })
              }
              placeholder="55"
            />
          </label>

          <label>
            <span>Idioma do modelo</span>
            <input
              value={
                settings.whatsapp_language_code
              }
              onChange={(event) =>
                setSettings({
                  ...settings,
                  whatsapp_language_code:
                    event.target.value,
                })
              }
              placeholder="pt_BR"
            />
          </label>
        </div>

        <div className="ativelo-whatsapp-mode-note">
          <AppIcon name="phone" size={20} />
          <p>
            O modo manual funciona imediatamente e não exige
            API. O administrador revisa a mensagem e confirma
            o envio no WhatsApp.
          </p>
        </div>
      </section>

      <section className="ativelo-communication-card">
        <header>
          <div>
            <span>TUTORIAL</span>
            <h3>Como enviar um convite</h3>
          </div>
        </header>

        <ol className="ativelo-invite-tutorial">
          <li>
            Cadastre o usuário em “Usuários e permissões”.
          </li>
          <li>
            O Ativelo cria um link seguro e mostra as opções
            de compartilhamento.
          </li>
          <li>
            Clique em “Abrir e-mail” para usar Gmail,
            Outlook ou outro aplicativo instalado.
          </li>
          <li>
            Revise a mensagem e confirme o envio.
          </li>
          <li>
            O convidado abre o link e cria a própria senha.
          </li>
        </ol>

        <details>
          <summary>
            Por que o Ativelo não envia automaticamente sem
            configuração?
          </summary>

          <p>
            Serviços automáticos precisam de domínio, SMTP ou
            autorização OAuth. O modo manual evita custos e
            configurações complexas, mas mantém a mensagem e
            o link preparados pelo Ativelo.
          </p>
        </details>

        <details>
          <summary>
            Limitação do e-mail interno do Supabase
          </summary>

          <p>
            Sem SMTP próprio, o Supabase limita os envios a
            endereços previamente autorizados na equipe do
            projeto. Por isso ele não é usado como canal
            principal para clientes externos.
          </p>
        </details>

        <details>
          <summary>
            Envio automático futuro pelo Gmail
          </summary>

          <p>
            Será possível conectar uma conta Google. Essa
            opção exigirá autorização OAuth e será
            implementada como recurso avançado, sem bloquear
            o modo gratuito atual.
          </p>
        </details>

        {integrationStatus.resend_configured && (
          <div className="ativelo-advanced-provider-note">
            Um provedor automático já está configurado no
            projeto e poderá continuar sendo usado.
          </div>
        )}
      </section>

            <PushNotificationPanel
        organization={organization}
      />
<footer className="ativelo-communication-actions">
        <button
          type="submit"
          className="primary"
          disabled={isSaving}
        >
          <AppIcon name="save" size={18} />
          {isSaving
            ? "Salvando..."
            : "Salvar comunicação e convites"}
        </button>
      </footer>
    </form>
  );
}