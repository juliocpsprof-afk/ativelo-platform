import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import type { OrganizationContext } from "../App";
import AppIcon from "./AppIcon";
import OrganizationBrand from "./OrganizationBrand";
import { useAuth } from "../contexts/AuthContext";
import { supabase } from "../lib/supabase";

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
  whatsapp_mode: "disabled" | "manual" | "automatic";
  default_country_code: string;
  whatsapp_template_name: string;
  whatsapp_language_code: string;
};

type IntegrationStatus = {
  resend_configured: boolean;
  whatsapp_configured: boolean;
  app_base_url_configured: boolean;
};

const defaultSettings: CommunicationSettings = {
  organization_id: "",
  email_enabled: true,
  sender_name: "Equipe de TI",
  email_subject_template:
    "Você recebeu um convite da {empresa} para acessar o Ativelo",
  email_intro_text:
    "Você foi convidado para acessar o Ativelo, a plataforma de gestão de equipamentos e suporte de TI da {empresa}.",
  email_button_label: "Aceitar convite e criar acesso",
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
    useState<IntegrationStatus>({
      resend_configured: false,
      whatsapp_configured: false,
      app_base_url_configured: false,
    });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error" | "warning";
    text: string;
  } | null>(null);

  const loadSettings = useCallback(async () => {
    setIsLoading(true);
    setFeedback(null);

    const [settingsResult, statusResult] = await Promise.all([
      (supabase as any)
        .from("organization_communication_settings")
        .select("*")
        .eq("organization_id", organization.organizationId)
        .maybeSingle(),
      supabase.functions.invoke("invite-organization-user", {
        body: {
          action: "status",
          organization_id: organization.organizationId,
        },
      }),
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
          organization_id: organization.organizationId,
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
      text: "Preferências de comunicação salvas.",
    });
    await loadSettings();
  };

  const sendTestEmail = async () => {
    if (!user?.email) {
      setFeedback({
        type: "error",
        text: "Seu usuário não possui e-mail para o teste.",
      });
      return;
    }

    setIsTesting(true);
    setFeedback(null);

    const { data, error } = await supabase.functions.invoke(
      "invite-organization-user",
      {
        body: {
          action: "test_email",
          organization_id: organization.organizationId,
          email: user.email,
        },
      },
    );

    setIsTesting(false);

    if (error) {
      setFeedback({
        type: "error",
        text: error.message,
      });
      return;
    }

    const result = data as {
      ok?: boolean;
      error?: string;
    } | null;

    if (!result?.ok) {
      setFeedback({
        type: "error",
        text:
          result?.error ??
          "Não foi possível enviar o e-mail de teste.",
      });
      return;
    }

    setFeedback({
      type: "success",
      text: `E-mail de teste enviado para ${user.email}.`,
    });
  };

  if (isLoading) {
    return (
      <section className="ativelo-communication-settings loading">
        Carregando comunicação e convites...
      </section>
    );
  }

  return (
    <form
      className="ativelo-communication-settings"
      onSubmit={saveSettings}
    >
      <section className="ativelo-communication-hero">
        <div>
          <span>CONVITES PERSONALIZADOS</span>
          <h2>Comunicação com a identidade da empresa</h2>
          <p>
            Os convites exibem a marca da empresa, a assinatura do
            Ativelo e dados claros sobre quem está concedendo o acesso.
          </p>
        </div>

        <OrganizationBrand
          organization={organization}
          compact
          showLegalName
        />
      </section>

      {feedback && (
        <div
          className={`ativelo-communication-feedback ${feedback.type}`}
        >
          {feedback.text}
        </div>
      )}

      <section className="ativelo-integration-status-grid">
        <article
          className={
            integrationStatus.resend_configured
              ? "connected"
              : "pending"
          }
        >
          <i>
            <AppIcon name="mail" size={23} />
          </i>
          <div>
            <strong>E-mail personalizado</strong>
            <span>
              {integrationStatus.resend_configured
                ? "Resend configurado no Supabase"
                : "Configuração pendente: adicione RESEND_API_KEY e RESEND_FROM_EMAIL nos Secrets do Supabase"}
            </span>
          </div>
          <b>
            {integrationStatus.resend_configured
              ? "Ativo"
              : "Pendente"}
          </b>
        </article>

        <article
          className={
            integrationStatus.whatsapp_configured
              ? "connected"
              : "manual"
          }
        >
          <i>
            <AppIcon name="phone" size={23} />
          </i>
          <div>
            <strong>WhatsApp</strong>
            <span>
              {integrationStatus.whatsapp_configured
                ? "Cloud API configurada para envio automático"
                : "Modo manual disponível sem API"}
            </span>
          </div>
          <b>
            {integrationStatus.whatsapp_configured
              ? "Automático"
              : "Manual"}
          </b>
        </article>

        <article
          className={
            integrationStatus.app_base_url_configured
              ? "connected"
              : "pending"
          }
        >
          <i>
            <AppIcon name="link" size={23} />
          </i>
          <div>
            <strong>Endereço do aplicativo</strong>
            <span>
              {integrationStatus.app_base_url_configured
                ? "APP_BASE_URL configurada"
                : "Configure APP_BASE_URL com https://ativelo-platform.pages.dev"}
            </span>
          </div>
          <b>
            {integrationStatus.app_base_url_configured
              ? "Definido"
              : "Dinâmico"}
          </b>
        </article>
      </section>

      <section className="ativelo-communication-card">
        <header>
          <div>
            <span>E-MAIL</span>
            <h3>Conteúdo do convite</h3>
          </div>

          <label className="ativelo-communication-switch">
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
            <span>Enviar e-mail personalizado</span>
          </label>
        </header>

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
          <span>Assunto do e-mail</span>
          <input
            value={settings.email_subject_template}
            onChange={(event) =>
              setSettings({
                ...settings,
                email_subject_template: event.target.value,
              })
            }
          />
          <small>
            Variáveis: {"{empresa}"}, {"{nome}"}, {"{perfil}"} e
            {" {remetente}"}.
          </small>
        </label>

        <label>
          <span>Texto de apresentação</span>
          <textarea
            rows={4}
            value={settings.email_intro_text}
            onChange={(event) =>
              setSettings({
                ...settings,
                email_intro_text: event.target.value,
              })
            }
          />
        </label>

        <div className="two">
          <label>
            <span>Texto do botão</span>
            <input
              value={settings.email_button_label}
              onChange={(event) =>
                setSettings({
                  ...settings,
                  email_button_label: event.target.value,
                })
              }
            />
          </label>

          <label>
            <span>Texto do rodapé</span>
            <input
              value={settings.email_footer_text}
              onChange={(event) =>
                setSettings({
                  ...settings,
                  email_footer_text: event.target.value,
                })
              }
            />
          </label>
        </div>

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
          <h4>
            {settings.email_subject_template
              .replaceAll(
                "{empresa}",
                organization.tradeName ||
                  organization.organizationName,
              )
              .replaceAll("{nome}", "Nome do convidado")
              .replaceAll("{perfil}", "Usuário")
              .replaceAll(
                "{remetente}",
                settings.sender_name || "Equipe de TI",
              )}
          </h4>
          <p>
            {settings.email_intro_text
              .replaceAll(
                "{empresa}",
                organization.tradeName ||
                  organization.organizationName,
              )
              .replaceAll("{nome}", "Nome do convidado")
              .replaceAll("{perfil}", "Usuário")
              .replaceAll(
                "{remetente}",
                settings.sender_name || "Equipe de TI",
              )}
          </p>
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
          disabled={
            isTesting ||
            !integrationStatus.resend_configured
          }
          onClick={() => void sendTestEmail()}
        >
          <AppIcon name="send" size={18} />
          {isTesting
            ? "Enviando teste..."
            : "Enviar teste para meu e-mail"}
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
                  whatsapp_mode: event.target
                    .value as CommunicationSettings["whatsapp_mode"],
                })
              }
            >
              <option value="disabled">Desativado</option>
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
                    event.target.value.replace(/\D/g, ""),
                })
              }
              placeholder="55"
            />
          </label>

          <label>
            <span>Idioma do modelo</span>
            <input
              value={settings.whatsapp_language_code}
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

        <label>
          <span>Nome do modelo aprovado na Meta</span>
          <input
            value={settings.whatsapp_template_name}
            onChange={(event) =>
              setSettings({
                ...settings,
                whatsapp_template_name:
                  event.target.value,
              })
            }
            placeholder="ativelo_invite"
          />
          <small>
            O modo manual funciona imediatamente. O automático exige
            Cloud API, credenciais no Supabase e um modelo aprovado.
          </small>
        </label>

        <div className="ativelo-whatsapp-mode-note">
          <AppIcon name="phone" size={20} />
          <p>
            No modo manual, o Ativelo abre o WhatsApp com a mensagem
            preenchida e o administrador confirma o envio. Esse modo
            não exige API nem cobrança da plataforma.
          </p>
        </div>
      </section>

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
