import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import type {
  OrganizationContext,
} from "../App";
import { useAuth } from "../contexts/AuthContext";
import {
  disablePushNotifications,
  enablePushNotifications,
  getPushSupport,
  sendPushTest,
  type PushSupport,
} from "../lib/pushNotifications";
import { supabase } from "../lib/supabase";
import AppIcon from "./AppIcon";

type Props = {
  organization: OrganizationContext;
};

type Preferences = {
  organization_id: string;
  user_id: string;
  enabled: boolean;
  ticket_created: boolean;
  ticket_assigned: boolean;
  maintenance_due: boolean;
  loan_overdue: boolean;
  agent_offline: boolean;
  warranty_due: boolean;
  system_update: boolean;
};

type DeliveryRow = {
  id: string;
  status: string;
  response_status: number | null;
  error_message: string | null;
  created_at: string;
  app_notifications?: {
    title?: string;
    category?: string;
  } | null;
};

const emptySupport: PushSupport = {
  supported: false,
  permission: "unsupported",
  active: false,
};

const eventOptions: Array<{
  key:
    | "ticket_created"
    | "ticket_assigned"
    | "maintenance_due"
    | "loan_overdue"
    | "agent_offline"
    | "warranty_due"
    | "system_update";
  title: string;
  description: string;
}> = [
  {
    key: "ticket_created",
    title: "Chamado criado",
    description:
      "Avisa a equipe técnica quando um novo chamado é aberto.",
  },
  {
    key: "ticket_assigned",
    title: "Chamado atribuído",
    description:
      "Avisa o técnico quando um chamado é direcionado a ele.",
  },
  {
    key: "maintenance_due",
    title: "Manutenção vencendo",
    description:
      "Alerta quando um plano preventivo se aproxima ou vence.",
  },
  {
    key: "loan_overdue",
    title: "Empréstimo atrasado",
    description:
      "Avisa responsáveis quando um equipamento não foi devolvido.",
  },
  {
    key: "agent_offline",
    title: "Equipamento sem comunicação",
    description:
      "Alerta quando um agente deixa de responder dentro do prazo.",
  },
  {
    key: "warranty_due",
    title: "Garantia vencendo",
    description:
      "Avisa sobre garantias que terminam nos próximos 30 dias.",
  },
  {
    key: "system_update",
    title: "Atualização do sistema",
    description:
      "Recebe novidades, correções e recursos publicados no Ativelo.",
  },
];

function formatDate(
  value: string,
): string {
  return new Intl.DateTimeFormat(
    "pt-BR",
    {
      dateStyle: "short",
      timeStyle: "short",
    },
  ).format(new Date(value));
}

export default function PushNotificationPanel({
  organization,
}: Props) {
  const { user } = useAuth();

  const [support, setSupport] =
    useState<PushSupport>(
      emptySupport,
    );

  const [preferences, setPreferences] =
    useState<Preferences | null>(
      null,
    );

  const [history, setHistory] =
    useState<DeliveryRow[]>([]);

  const [deviceName, setDeviceName] =
    useState(
      "Meu dispositivo",
    );

  const [isLoading, setIsLoading] =
    useState(true);

  const [isWorking, setIsWorking] =
    useState(false);

  const [feedback, setFeedback] =
    useState<{
      type:
        | "success"
        | "error"
        | "warning";
      text: string;
    } | null>(null);

  const [announcement, setAnnouncement] =
    useState({
      version: "",
      title: "",
      message: "",
      actionUrl: "/",
    });

  const canPublishUpdates =
    [
      "owner",
      "admin",
    ].includes(
      organization.role,
    );

  const loadData =
    useCallback(async () => {
      setIsLoading(true);
      setFeedback(null);

      try {
        const pushSupport =
          await getPushSupport();

        setSupport(
          pushSupport,
        );

        const [
          preferenceResult,
          historyResult,
        ] =
          await Promise.all([
            (
              supabase as any
            ).rpc(
              "ensure_my_push_preferences_v1",
              {
                p_organization_id:
                  organization.organizationId,
              },
            ),
            (
              supabase as any
            )
              .from(
                "push_delivery_attempts",
              )
              .select(
                "id,status,response_status,error_message,created_at,app_notifications(title,category)",
              )
              .eq(
                "organization_id",
                organization.organizationId,
              )
              .order(
                "created_at",
                {
                  ascending: false,
                },
              )
              .limit(12),
          ]);

        if (
          preferenceResult.error
        ) {
          throw new Error(
            preferenceResult
              .error.message,
          );
        }

        if (historyResult.error) {
          throw new Error(
            historyResult
              .error.message,
          );
        }

        setPreferences(
          preferenceResult.data as
            Preferences,
        );

        setHistory(
          (
            historyResult.data ??
            []
          ) as DeliveryRow[],
        );
      } catch (error) {
        setFeedback({
          type: "error",
          text:
            error instanceof Error
              ? error.message
              : String(error),
        });
      } finally {
        setIsLoading(false);
      }
    }, [
      organization.organizationId,
    ]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const statusLabel =
    useMemo(() => {
      if (!support.supported) {
        return "Não suportado";
      }

      if (
        support.permission ===
          "denied"
      ) {
        return "Bloqueado";
      }

      if (support.active) {
        return "Ativo neste dispositivo";
      }

      return "Desativado";
    }, [support]);

  const activate = async () => {
    setIsWorking(true);
    setFeedback(null);

    try {
      await enablePushNotifications(
        organization.organizationId,
        deviceName,
      );

      setFeedback({
        type: "success",
        text:
          "Notificações ativadas neste dispositivo.",
      });

      await loadData();
    } catch (error) {
      setFeedback({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : String(error),
      });
    } finally {
      setIsWorking(false);
    }
  };

  const deactivate = async () => {
    setIsWorking(true);
    setFeedback(null);

    try {
      await disablePushNotifications();

      setFeedback({
        type: "success",
        text:
          "Notificações desativadas neste dispositivo.",
      });

      await loadData();
    } catch (error) {
      setFeedback({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : String(error),
      });
    } finally {
      setIsWorking(false);
    }
  };

  const savePreferences =
    async () => {

      if (
        !preferences ||
        !user
      ) {
        return;
      }

      setIsWorking(true);
      setFeedback(null);

      const {
        error,
      } =
        await (
          supabase as any
        )
          .from(
            "push_notification_preferences",
          )
          .upsert(
            {
              ...preferences,
              organization_id:
                organization.organizationId,
              user_id: user.id,
            },
            {
              onConflict:
                "organization_id,user_id",
            },
          );

      setIsWorking(false);

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
          "Preferências de notificação salvas.",
      });
    };

  const testPush = async () => {
    setIsWorking(true);
    setFeedback(null);

    try {
      await sendPushTest(
        organization.organizationId,
      );

      setFeedback({
        type: "success",
        text:
          "Teste enviado. A notificação deve aparecer em alguns segundos.",
      });

      window.setTimeout(
        () => {
          void loadData();
        },
        1800,
      );
    } catch (error) {
      setFeedback({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : String(error),
      });
    } finally {
      setIsWorking(false);
    }
  };

  const publishUpdate =
    async () => {

      if (!canPublishUpdates) {
        return;
      }

      setIsWorking(true);
      setFeedback(null);

      const {
        error,
      } =
        await (
          supabase as any
        )
          .from(
            "system_announcements",
          )
          .insert({
            organization_id:
              organization.organizationId,
            version_label:
              announcement.version
                .trim() || null,
            title:
              announcement.title.trim(),
            message:
              announcement.message.trim(),
            action_url:
              announcement.actionUrl
                .trim() || "/",
          });

      setIsWorking(false);

      if (error) {
        setFeedback({
          type: "error",
          text: error.message,
        });
        return;
      }

      setAnnouncement({
        version: "",
        title: "",
        message: "",
        actionUrl: "/",
      });

      setFeedback({
        type: "success",
        text:
          "Atualização publicada e colocada na fila de notificações.",
      });
    };

  if (isLoading) {
    return (
      <section className="ativelo-push-panel">
        Carregando notificações push...
      </section>
    );
  }

  return (
    <section className="ativelo-push-panel">
      <header>
        <div>
          <span>
            NOTIFICAÇÕES PUSH
          </span>
          <h3>
            Alertas no navegador e celular
          </h3>
          <p>
            O usuário escolhe se deseja receber
            notificações. A autorização é individual
            para cada navegador ou aparelho.
          </p>
        </div>

        <div
          className={`ativelo-push-status ${
            support.active
              ? "active"
              : support.permission ===
                  "denied"
                ? "blocked"
                : ""
          }`}
        >
          <AppIcon
            name="bell"
            size={18}
          />
          {statusLabel}
        </div>
      </header>

      {feedback && (
        <div
          className={`ativelo-push-feedback ${feedback.type}`}
        >
          {feedback.text}
        </div>
      )}

      <div className="ativelo-push-device">
        <label>
          <span>
            Nome deste dispositivo
          </span>
          <input
            value={deviceName}
            onChange={(event) =>
              setDeviceName(
                event.target.value,
              )
            }
            placeholder="Ex.: Notebook da manutenção"
          />
        </label>

        <div>
          {!support.active ? (
            <button
              type="button"
              className="primary"
              disabled={
                isWorking ||
                !support.supported ||
                support.permission ===
                  "denied"
              }
              onClick={() =>
                void activate()
              }
            >
              <AppIcon
                name="bell"
                size={18}
              />
              Ativar neste dispositivo
            </button>
          ) : (
            <>
              <button
                type="button"
                className="secondary"
                disabled={isWorking}
                onClick={() =>
                  void testPush()
                }
              >
                <AppIcon
                  name="send"
                  size={18}
                />
                Enviar teste
              </button>

              <button
                type="button"
                className="danger"
                disabled={isWorking}
                onClick={() =>
                  void deactivate()
                }
              >
                Desativar
              </button>
            </>
          )}
        </div>
      </div>

      {support.permission ===
        "denied" && (
        <div className="ativelo-push-help">
          As notificações foram bloqueadas. Abra as
          configurações do site no navegador, permita
          notificações e atualize a página.
        </div>
      )}

      {preferences && (
        <section className="ativelo-push-preferences">
          <div className="ativelo-push-master">
            <label>
              <input
                type="checkbox"
                checked={
                  preferences.enabled
                }
                onChange={(event) =>
                  setPreferences({
                    ...preferences,
                    enabled:
                      event.target
                        .checked,
                  })
                }
              />
              <span>
                Receber notificações push
              </span>
            </label>
          </div>

          <div className="ativelo-push-options">
            {eventOptions.map(
              (option) => (
                <label
                  key={option.key}
                >
                  <input
                    type="checkbox"
                    checked={
                      preferences[
                        option.key
                      ]
                    }
                    disabled={
                      !preferences.enabled
                    }
                    onChange={(event) =>
                      setPreferences({
                        ...preferences,
                        [option.key]:
                          event.target
                            .checked,
                      })
                    }
                  />

                  <span>
                    <strong>
                      {option.title}
                    </strong>
                    <small>
                      {
                        option.description
                      }
                    </small>
                  </span>
                </label>
              ),
            )}
          </div>

          <footer>
            <button
              type="button"
              className="primary"
              disabled={isWorking}
              onClick={() =>
                void savePreferences()
              }
            >
              <AppIcon
                name="save"
                size={18}
              />
              Salvar preferências
            </button>
          </footer>
        </section>
      )}

      {canPublishUpdates && (
        <section className="ativelo-push-announcement">
          <header>
            <span>
              ATUALIZAÇÃO DO SISTEMA
            </span>
            <h4>
              Publicar aviso para os usuários
            </h4>
          </header>

          <div>
            <label>
              <span>Versão</span>
              <input
                value={
                  announcement.version
                }
                onChange={(event) =>
                  setAnnouncement({
                    ...announcement,
                    version:
                      event.target.value,
                  })
                }
                placeholder="Ex.: 1.4.0"
              />
            </label>

            <label>
              <span>Título</span>
              <input
                required
                value={
                  announcement.title
                }
                onChange={(event) =>
                  setAnnouncement({
                    ...announcement,
                    title:
                      event.target.value,
                  })
                }
              />
            </label>

            <label className="wide">
              <span>Mensagem</span>
              <textarea
                required
                value={
                  announcement.message
                }
                onChange={(event) =>
                  setAnnouncement({
                    ...announcement,
                    message:
                      event.target.value,
                  })
                }
              />
            </label>

            <label className="wide">
              <span>
                Página aberta ao tocar
              </span>
              <input
                value={
                  announcement.actionUrl
                }
                onChange={(event) =>
                  setAnnouncement({
                    ...announcement,
                    actionUrl:
                      event.target.value,
                  })
                }
                placeholder="/"
              />
            </label>
          </div>

          <footer>
            <button
              type="button"
              className="secondary"
              disabled={
                isWorking ||
                !announcement.title
                  .trim() ||
                !announcement.message
                  .trim()
              }
              onClick={() =>
                void publishUpdate()
              }
            >
              <AppIcon
                name="send"
                size={18}
              />
              Publicar atualização
            </button>
          </footer>
        </section>
      )}

      <section className="ativelo-push-history">
        <header>
          <span>
            HISTÓRICO DE ENTREGA
          </span>
          <h4>
            Últimas tentativas
          </h4>
        </header>

        {history.length === 0 ? (
          <div>
            Nenhuma tentativa registrada neste
            dispositivo.
          </div>
        ) : (
          history.map((row) => (
            <article key={row.id}>
              <div>
                <strong>
                  {row.app_notifications
                    ?.title ??
                    "Notificação push"}
                </strong>
                <span>
                  {formatDate(
                    row.created_at,
                  )}
                </span>
              </div>

              <div>
                <span>
                  {row.status}
                </span>

                {row.response_status && (
                  <small>
                    HTTP{" "}
                    {
                      row.response_status
                    }
                  </small>
                )}
              </div>

              {row.error_message && (
                <p>
                  {row.error_message}
                </p>
              )}
            </article>
          ))
        )}
      </section>
    </section>
  );
}
