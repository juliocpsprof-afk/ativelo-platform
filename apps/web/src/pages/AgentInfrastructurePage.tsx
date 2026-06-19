import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";

import type {
  OrganizationContext,
} from "../App";
import AppIcon from "../components/AppIcon";
import { supabase } from "../lib/supabase";

type Props = {
  organization: OrganizationContext;
  onBack: () => void;
};

type AgentPolicy = {
  id: string;
  heartbeat_minutes: number;
  inventory_hours: number;
  quick_scan_days: number;
  full_scan_days: number;
  credential_days: number;
  credential_grace_days: number;
  offline_minutes: number;
  jitter_minutes: number;
  max_hosts_per_scan: number;
  inventory_enabled: boolean;
  network_scan_enabled: boolean;
  allowed_cidrs: string[];
  minimum_agent_version: string | null;
};

type Agent = {
  id: string;
  hostname: string;
  agent_version: string | null;
  os_name: string | null;
  last_ip: string | null;
  last_seen_at: string;
  mode: string;
  service_status: string;
  credential_expires_at: string | null;
  last_inventory_at: string | null;
  last_quick_scan_at: string | null;
  last_full_scan_at: string | null;
  consecutive_failures: number;
  last_error: string | null;
  paused_at: string | null;
  revoked_at: string | null;
};

type Run = {
  id: string;
  agent_id: string;
  run_type: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  discovered_count: number;
  changes_count: number;
  error_message: string | null;
};

type Command = {
  id: string;
  agent_id: string;
  command_type: string;
  status: string;
  requested_at: string;
};

type CodeRecord = {
  id: string;
  label: string;
  expires_at: string;
  max_uses: number;
  used_count: number;
  is_active: boolean;
};

type GeneratedCode = {
  token: string;
  expiresAt: string;
};

type Tab =
  | "overview"
  | "agents"
  | "schedule"
  | "history"
  | "enrollment";

const API_URL =
  (
    import.meta.env
      .VITE_ATIVELO_API_URL ??
    "https://ativelo-api.ativeloapp.workers.dev"
  ).replace(/\/+$/, "");

function formatDate(
  value: string | null,
): string {
  if (!value) {
    return "Não registrado";
  }

  return new Intl.DateTimeFormat(
    "pt-BR",
    {
      dateStyle: "short",
      timeStyle: "short",
    },
  ).format(new Date(value));
}

function isOnline(
  value: string,
  minutes: number,
): boolean {
  return (
    Date.now() -
      new Date(value).getTime() <
    minutes * 60000
  );
}

export default function AgentInfrastructurePage({
  organization,
  onBack,
}: Props) {
  const [tab, setTab] =
    useState<Tab>("overview");

  const [policy, setPolicy] =
    useState<AgentPolicy | null>(null);

  const [agents, setAgents] =
    useState<Agent[]>([]);

  const [runs, setRuns] =
    useState<Run[]>([]);

  const [commands, setCommands] =
    useState<Command[]>([]);

  const [codes, setCodes] =
    useState<CodeRecord[]>([]);

  const [isLoading, setIsLoading] =
    useState(true);

  const [isSaving, setIsSaving] =
    useState(false);

  const [feedback, setFeedback] =
    useState<{
      type: "success" | "error";
      text: string;
    } | null>(null);

  const [generatedCode, setGeneratedCode] =
    useState<GeneratedCode | null>(
      null,
    );

  const [policyForm, setPolicyForm] =
    useState({
      heartbeat: "15",
      inventory: "24",
      quick: "7",
      full: "30",
      credential: "90",
      grace: "7",
      offline: "60",
      jitter: "15",
      maxHosts: "1024",
      allowedCidrs: "",
      minimumVersion: "",
      inventoryEnabled: true,
      scanEnabled: true,
    });

  const [codeForm, setCodeForm] =
    useState({
      label: "Instalação da empresa",
      validHours: "24",
      maxUses: "10",
    });

  const canManage =
    [
      "owner",
      "admin",
      "it_manager",
    ].includes(
      organization.role,
    );

  const loadData =
    useCallback(async () => {
      setIsLoading(true);
      setFeedback(null);

      const organizationId =
        organization.organizationId;

      let policyResult =
        await supabase
          .from("agent_policies")
          .select("*")
          .eq(
            "organization_id",
            organizationId,
          )
          .eq("is_default", true)
          .maybeSingle();

      if (
        !policyResult.data &&
        !policyResult.error &&
        canManage
      ) {
        const created =
          await supabase.rpc(
            "ensure_default_agent_policy_v2",
            {
              p_organization_id:
                organizationId,
            },
          );

        if (!created.error) {
          policyResult =
            {
              ...policyResult,
              data: created.data,
              error: null,
            };
        }
      }

      const [
        agentsResult,
        runsResult,
        commandsResult,
        codesResult,
      ] = await Promise.all([
        supabase
          .from("inventory_agents")
          .select(
            "id,hostname,agent_version,os_name,last_ip,last_seen_at,mode,service_status,credential_expires_at,last_inventory_at,last_quick_scan_at,last_full_scan_at,consecutive_failures,last_error,paused_at,revoked_at",
          )
          .eq(
            "organization_id",
            organizationId,
          )
          .order("last_seen_at", {
            ascending: false,
          }),

        supabase
          .from("agent_runs")
          .select(
            "id,agent_id,run_type,status,started_at,completed_at,discovered_count,changes_count,error_message",
          )
          .eq(
            "organization_id",
            organizationId,
          )
          .order("started_at", {
            ascending: false,
          })
          .limit(100),

        supabase
          .from("agent_commands")
          .select(
            "id,agent_id,command_type,status,requested_at",
          )
          .eq(
            "organization_id",
            organizationId,
          )
          .order("requested_at", {
            ascending: false,
          })
          .limit(100),

        supabase
          .from("agent_pairing_codes")
          .select(
            "id,label,expires_at,max_uses,used_count,is_active",
          )
          .eq(
            "organization_id",
            organizationId,
          )
          .order("created_at", {
            ascending: false,
          })
          .limit(30),
      ]);

      const error =
        [
          policyResult.error,
          agentsResult.error,
          runsResult.error,
          commandsResult.error,
          codesResult.error,
        ].find(Boolean);

      if (error) {
        setFeedback({
          type: "error",
          text: error.message,
        });

        setIsLoading(false);
        return;
      }

      const loaded =
        policyResult.data as
          AgentPolicy | null;

      setPolicy(loaded);

      if (loaded) {
        setPolicyForm({
          heartbeat:
            String(
              loaded
                .heartbeat_minutes,
            ),
          inventory:
            String(
              loaded
                .inventory_hours,
            ),
          quick:
            String(
              loaded
                .quick_scan_days,
            ),
          full:
            String(
              loaded
                .full_scan_days,
            ),
          credential:
            String(
              loaded
                .credential_days,
            ),
          grace:
            String(
              loaded
                .credential_grace_days,
            ),
          offline:
            String(
              loaded
                .offline_minutes,
            ),
          jitter:
            String(
              loaded
                .jitter_minutes,
            ),
          maxHosts:
            String(
              loaded
                .max_hosts_per_scan,
            ),
          allowedCidrs:
            (
              loaded.allowed_cidrs ??
              []
            ).join("\n"),
          minimumVersion:
            loaded
              .minimum_agent_version ??
            "",
          inventoryEnabled:
            loaded
              .inventory_enabled,
          scanEnabled:
            loaded
              .network_scan_enabled,
        });
      }

      setAgents(
        (agentsResult.data ?? []) as
          Agent[],
      );

      setRuns(
        (runsResult.data ?? []) as
          Run[],
      );

      setCommands(
        (commandsResult.data ??
          []) as Command[],
      );

      setCodes(
        (codesResult.data ?? []) as
          CodeRecord[],
      );

      setIsLoading(false);
    }, [
      canManage,
      organization.organizationId,
    ]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const offlineMinutes =
    policy?.offline_minutes ?? 60;

  const onlineCount =
    useMemo(
      () =>
        agents.filter(
          (agent) =>
            !agent.revoked_at &&
            !agent.paused_at &&
            isOnline(
              agent.last_seen_at,
              offlineMinutes,
            ),
        ).length,
      [
        agents,
        offlineMinutes,
      ],
    );

  const attentionCount =
    agents.filter(
      (agent) =>
        Boolean(
          agent.last_error ||
          agent.consecutive_failures >
            0,
        ),
    ).length;

  const pendingCount =
    commands.filter((command) =>
      [
        "pending",
        "delivered",
        "running",
      ].includes(command.status),
    ).length;

  const savePolicy = async (
    event: FormEvent,
  ) => {
    event.preventDefault();

    if (
      !policy ||
      !canManage
    ) {
      return;
    }

    setIsSaving(true);
    setFeedback(null);

    const result =
      await supabase
        .from("agent_policies")
        .update({
          heartbeat_minutes:
            Number(
              policyForm.heartbeat,
            ),
          inventory_hours:
            Number(
              policyForm.inventory,
            ),
          quick_scan_days:
            Number(
              policyForm.quick,
            ),
          full_scan_days:
            Number(
              policyForm.full,
            ),
          credential_days:
            Number(
              policyForm.credential,
            ),
          credential_grace_days:
            Number(
              policyForm.grace,
            ),
          offline_minutes:
            Number(
              policyForm.offline,
            ),
          jitter_minutes:
            Number(
              policyForm.jitter,
            ),
          max_hosts_per_scan:
            Number(
              policyForm.maxHosts,
            ),
          allowed_cidrs:
            policyForm.allowedCidrs
              .split(/\r?\n|,/)
              .map((value) =>
                value.trim(),
              )
              .filter(Boolean),
          minimum_agent_version:
            policyForm
              .minimumVersion
              .trim() || null,
          inventory_enabled:
            policyForm
              .inventoryEnabled,
          network_scan_enabled:
            policyForm
              .scanEnabled,
          updated_at:
            new Date().toISOString(),
        })
        .eq("id", policy.id)
        .eq(
          "organization_id",
          organization.organizationId,
        );

    setFeedback(
      result.error
        ? {
            type: "error",
            text:
              result.error.message,
          }
        : {
            type: "success",
            text:
              "Programação salva. Os agentes receberão a alteração no próximo heartbeat.",
          },
    );

    setIsSaving(false);
    await loadData();
  };

  const createCode = async (
    event: FormEvent,
  ) => {
    event.preventDefault();

    if (!canManage) {
      return;
    }

    setIsSaving(true);
    setFeedback(null);

    const result =
      await supabase.rpc(
        "create_agent_pairing_code_v2",
        {
          p_organization_id:
            organization.organizationId,
          p_label:
            codeForm.label,
          p_valid_hours:
            Number(
              codeForm.validHours,
            ),
          p_max_uses:
            Number(
              codeForm.maxUses,
            ),
          p_allowed_modes: [
            "equipment",
            "scanner",
            "hybrid",
          ],
        },
      );

    if (result.error) {
      setFeedback({
        type: "error",
        text: result.error.message,
      });
    } else {
      setGeneratedCode(
        result.data as
          GeneratedCode,
      );

      setFeedback({
        type: "success",
        text:
          "Código criado. Ele será exibido somente nesta sessão.",
      });
    }

    setIsSaving(false);
    await loadData();
  };

  const requestCommand =
    async (
      agentId: string,
      commandType: string,
    ) => {
      const result =
        await supabase.rpc(
          "request_agent_command_v2",
          {
            p_organization_id:
              organization.organizationId,
            p_agent_id:
              agentId,
            p_command_type:
              commandType,
          },
        );

      setFeedback(
        result.error
          ? {
              type: "error",
              text:
                result.error.message,
            }
          : {
              type: "success",
              text:
                "Comando colocado na fila do agente.",
            },
      );

      await loadData();
    };

  const revoke = async (
    agent: Agent,
  ) => {
    if (
      !window.confirm(
        `Revogar o agente ${agent.hostname}?`,
      )
    ) {
      return;
    }

    const result =
      await supabase.rpc(
        "revoke_inventory_agent_v2",
        {
          p_organization_id:
            organization.organizationId,
          p_agent_id: agent.id,
          p_reason:
            "Revogado pelo painel",
        },
      );

    setFeedback(
      result.error
        ? {
            type: "error",
            text:
              result.error.message,
          }
        : {
            type: "success",
            text:
              "Agente revogado e credencial invalidada.",
          },
    );

    await loadData();
  };

  return (
    <main className="ativelo-agent-page">
      <header className="ativelo-page-heading">
        <button
          type="button"
          className="back"
          onClick={onBack}
        >
          ← Voltar ao painel
        </button>

        <div>
          <span>
            DESCOBERTA E MONITORAMENTO LOCAL
          </span>
          <h1>
            Central do agente
          </h1>
          <p>
            Controle vínculo, comunicação,
            programação, comandos e histórico dos
            agentes instalados na empresa.
          </p>
        </div>

        <button
          type="button"
          className="secondary"
          onClick={() =>
            void loadData()
          }
        >
          <AppIcon
            name="refresh"
            size={18}
          />
          Atualizar
        </button>
      </header>

      {feedback && (
        <div
          className={`ativelo-agent-feedback ${feedback.type}`}
        >
          {feedback.text}
        </div>
      )}

      <section className="ativelo-agent-summary">
        <article>
          <span>Cadastrados</span>
          <strong>
            {agents.length}
          </strong>
        </article>

        <article>
          <span>Em comunicação</span>
          <strong>
            {onlineCount}
          </strong>
        </article>

        <article>
          <span>Exigem atenção</span>
          <strong>
            {attentionCount}
          </strong>
        </article>

        <article>
          <span>Comandos pendentes</span>
          <strong>
            {pendingCount}
          </strong>
        </article>
      </section>

      <nav className="ativelo-agent-tabs">
        {[
          ["overview", "Visão geral"],
          ["agents", "Agentes"],
          ["schedule", "Programação"],
          ["history", "Histórico"],
          ["enrollment", "Vinculação"],
        ].map(([value, label]) => (
          <button
            key={value}
            type="button"
            className={
              tab === value
                ? "active"
                : ""
            }
            onClick={() =>
              setTab(value as Tab)
            }
          >
            {label}
          </button>
        ))}
      </nav>

      {isLoading ? (
        <section className="ativelo-agent-empty">
          Carregando...
        </section>
      ) : (
        <>
          {tab === "overview" && (
            <section className="ativelo-agent-cards">
              <article>
                <AppIcon
                  name="activity"
                  size={24}
                />
                <h2>Heartbeat</h2>
                <p>
                  A cada{" "}
                  {policy?.heartbeat_minutes ??
                    15}{" "}
                  minutos, sem abrir portas no
                  computador.
                </p>
              </article>

              <article>
                <AppIcon
                  name="clock"
                  size={24}
                />
                <h2>Programação</h2>
                <p>
                  Inventário a cada{" "}
                  {policy?.inventory_hours ??
                    24}{" "}
                  horas e varredura completa a cada{" "}
                  {policy?.full_scan_days ??
                    30}{" "}
                  dias.
                </p>
              </article>

              <article>
                <AppIcon
                  name="key"
                  size={24}
                />
                <h2>Credencial</h2>
                <p>
                  Validade de{" "}
                  {policy?.credential_days ??
                    90}{" "}
                  dias, com rotação e revogação.
                </p>
              </article>

              <article>
                <AppIcon
                  name="server"
                  size={24}
                />
                <h2>Próxima etapa</h2>
                <p>
                  O serviço Windows e o instalador
                  serão criados no Pacote 41.
                </p>
              </article>
            </section>
          )}

          {tab === "agents" && (
            <section className="ativelo-agent-panel">
              <header>
                <span>AGENTES VINCULADOS</span>
                <h2>
                  Computadores monitorados
                </h2>
              </header>

              {agents.length === 0 ? (
                <div className="ativelo-agent-empty">
                  Nenhum agente vinculado.
                </div>
              ) : (
                <div className="ativelo-agent-list">
                  {agents.map((agent) => (
                    <article key={agent.id}>
                      <div>
                        <strong>
                          {agent.hostname}
                        </strong>
                        <span>
                          {agent.os_name ||
                            "Sistema não informado"}
                          {" · "}
                          {agent.mode}
                        </span>
                      </div>

                      <dl>
                        <div>
                          <dt>Último contato</dt>
                          <dd>
                            {formatDate(
                              agent.last_seen_at,
                            )}
                          </dd>
                        </div>

                        <div>
                          <dt>Versão</dt>
                          <dd>
                            {agent.agent_version ||
                              "Não informada"}
                          </dd>
                        </div>

                        <div>
                          <dt>IP</dt>
                          <dd>
                            {agent.last_ip ||
                              "Não informado"}
                          </dd>
                        </div>

                        <div>
                          <dt>Credencial</dt>
                          <dd>
                            {formatDate(
                              agent
                                .credential_expires_at,
                            )}
                          </dd>
                        </div>
                      </dl>

                      {canManage &&
                        !agent.revoked_at && (
                        <footer>
                          <button
                            type="button"
                            onClick={() =>
                              void requestCommand(
                                agent.id,
                                "inventory_now",
                              )
                            }
                          >
                            Coletar agora
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              void requestCommand(
                                agent.id,
                                "quick_scan",
                              )
                            }
                          >
                            Varredura rápida
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              void requestCommand(
                                agent.id,
                                "full_scan",
                              )
                            }
                          >
                            Varredura completa
                          </button>

                          <button
                            type="button"
                            className="danger"
                            onClick={() =>
                              void revoke(
                                agent,
                              )
                            }
                          >
                            Revogar
                          </button>
                        </footer>
                      )}

                      {agent.last_error && (
                        <p className="ativelo-agent-error">
                          {agent.last_error}
                        </p>
                      )}
                    </article>
                  ))}
                </div>
              )}
            </section>
          )}

          {tab === "schedule" && (
            <form
              className="ativelo-agent-panel"
              onSubmit={(event) =>
                void savePolicy(event)
              }
            >
              <header>
                <span>POLÍTICA PADRÃO</span>
                <h2>
                  Frequências e limites
                </h2>
              </header>

              <div className="ativelo-agent-form">
                {[
                  [
                    "Heartbeat em minutos",
                    "heartbeat",
                    "5",
                    "1440",
                  ],
                  [
                    "Inventário em horas",
                    "inventory",
                    "1",
                    "720",
                  ],
                  [
                    "Varredura rápida em dias",
                    "quick",
                    "1",
                    "90",
                  ],
                  [
                    "Varredura completa em dias",
                    "full",
                    "1",
                    "365",
                  ],
                  [
                    "Credencial em dias",
                    "credential",
                    "7",
                    "365",
                  ],
                  [
                    "Tolerância em dias",
                    "grace",
                    "1",
                    "30",
                  ],
                  [
                    "Offline após minutos",
                    "offline",
                    "15",
                    "10080",
                  ],
                  [
                    "Atraso aleatório",
                    "jitter",
                    "0",
                    "120",
                  ],
                  [
                    "Máximo de IPs",
                    "maxHosts",
                    "1",
                    "4096",
                  ],
                ].map(
                  ([
                    label,
                    key,
                    min,
                    max,
                  ]) => (
                    <label key={key}>
                      <span>{label}</span>
                      <input
                        type="number"
                        min={min}
                        max={max}
                        value={
                          policyForm[
                            key as keyof typeof policyForm
                          ] as string
                        }
                        onChange={(event) =>
                          setPolicyForm({
                            ...policyForm,
                            [key]:
                              event.target
                                .value,
                          })
                        }
                      />
                    </label>
                  ),
                )}

                <label>
                  <span>Versão mínima</span>
                  <input
                    value={
                      policyForm
                        .minimumVersion
                    }
                    onChange={(event) =>
                      setPolicyForm({
                        ...policyForm,
                        minimumVersion:
                          event.target
                            .value,
                      })
                    }
                    placeholder="Ex.: 1.0.0"
                  />
                </label>

                <label className="wide">
                  <span>
                    Redes autorizadas
                  </span>
                  <textarea
                    value={
                      policyForm
                        .allowedCidrs
                    }
                    onChange={(event) =>
                      setPolicyForm({
                        ...policyForm,
                        allowedCidrs:
                          event.target
                            .value,
                      })
                    }
                    placeholder={
                      "192.168.0.0/24\n10.0.0.0/24"
                    }
                  />
                </label>
              </div>

              <div className="ativelo-agent-checks">
                <label>
                  <input
                    type="checkbox"
                    checked={
                      policyForm
                        .inventoryEnabled
                    }
                    onChange={(event) =>
                      setPolicyForm({
                        ...policyForm,
                        inventoryEnabled:
                          event.target
                            .checked,
                      })
                    }
                  />
                  Inventário ativado
                </label>

                <label>
                  <input
                    type="checkbox"
                    checked={
                      policyForm
                        .scanEnabled
                    }
                    onChange={(event) =>
                      setPolicyForm({
                        ...policyForm,
                        scanEnabled:
                          event.target
                            .checked,
                      })
                    }
                  />
                  Descoberta ativada
                </label>
              </div>

              <footer>
                <button
                  type="submit"
                  className="primary"
                  disabled={
                    !canManage ||
                    !policy ||
                    isSaving
                  }
                >
                  <AppIcon
                    name="save"
                    size={18}
                  />
                  Salvar programação
                </button>
              </footer>
            </form>
          )}

          {tab === "history" && (
            <section className="ativelo-agent-history">
              <article className="ativelo-agent-panel">
                <header>
                  <span>EXECUÇÕES</span>
                  <h2>
                    Últimas atividades
                  </h2>
                </header>

                {runs.length === 0 ? (
                  <div className="ativelo-agent-empty">
                    Nenhuma execução registrada.
                  </div>
                ) : (
                  runs.map((run) => (
                    <div
                      className="ativelo-agent-row"
                      key={run.id}
                    >
                      <strong>
                        {run.run_type}
                      </strong>
                      <span>
                        {run.status}
                      </span>
                      <small>
                        {formatDate(
                          run.started_at,
                        )}
                      </small>
                      <small>
                        {
                          run.discovered_count
                        }{" "}
                        descobertos ·{" "}
                        {run.changes_count}{" "}
                        mudanças
                      </small>
                    </div>
                  ))
                )}
              </article>

              <article className="ativelo-agent-panel">
                <header>
                  <span>COMANDOS</span>
                  <h2>
                    Fila recente
                  </h2>
                </header>

                {commands.length ===
                0 ? (
                  <div className="ativelo-agent-empty">
                    Nenhum comando solicitado.
                  </div>
                ) : (
                  commands.map(
                    (command) => (
                      <div
                        className="ativelo-agent-row"
                        key={command.id}
                      >
                        <strong>
                          {
                            command
                              .command_type
                          }
                        </strong>
                        <span>
                          {command.status}
                        </span>
                        <small>
                          {formatDate(
                            command
                              .requested_at,
                          )}
                        </small>
                      </div>
                    ),
                  )
                )}
              </article>
            </section>
          )}

          {tab === "enrollment" && (
            <section className="ativelo-agent-enrollment">
              <form
                className="ativelo-agent-panel"
                onSubmit={(event) =>
                  void createCode(event)
                }
              >
                <header>
                  <span>VINCULAÇÃO</span>
                  <h2>
                    Gerar código temporário
                  </h2>
                </header>

                <div className="ativelo-agent-form">
                  <label className="wide">
                    <span>Identificação</span>
                    <input
                      value={
                        codeForm.label
                      }
                      onChange={(event) =>
                        setCodeForm({
                          ...codeForm,
                          label:
                            event.target
                              .value,
                        })
                      }
                    />
                  </label>

                  <label>
                    <span>
                      Validade em horas
                    </span>
                    <input
                      type="number"
                      min="1"
                      max="168"
                      value={
                        codeForm.validHours
                      }
                      onChange={(event) =>
                        setCodeForm({
                          ...codeForm,
                          validHours:
                            event.target
                              .value,
                        })
                      }
                    />
                  </label>

                  <label>
                    <span>
                      Máximo de usos
                    </span>
                    <input
                      type="number"
                      min="1"
                      max="500"
                      value={
                        codeForm.maxUses
                      }
                      onChange={(event) =>
                        setCodeForm({
                          ...codeForm,
                          maxUses:
                            event.target
                              .value,
                        })
                      }
                    />
                  </label>
                </div>

                <footer>
                  <button
                    type="submit"
                    className="primary"
                    disabled={
                      !canManage ||
                      isSaving
                    }
                  >
                    <AppIcon
                      name="key"
                      size={18}
                    />
                    Gerar código
                  </button>
                </footer>
              </form>

              <section className="ativelo-agent-panel">
                <header>
                  <span>INSTALAÇÃO</span>
                  <h2>
                    Preparação para o Pacote 41
                  </h2>
                </header>

                {generatedCode ? (
                  <div className="ativelo-agent-code">
                    <span>
                      Código temporário
                    </span>
                    <code>
                      {generatedCode.token}
                    </code>
                    <p>
                      Expira em{" "}
                      {formatDate(
                        generatedCode
                          .expiresAt,
                      )}
                    </p>
                    <button
                      type="button"
                      className="secondary"
                      onClick={() =>
                        void navigator
                          .clipboard
                          .writeText(
                            generatedCode
                              .token,
                          )
                      }
                    >
                      Copiar código
                    </button>
                  </div>
                ) : (
                  <div className="ativelo-agent-empty">
                    Gere um código. O instalador
                    Windows será entregue no Pacote
                    41.
                  </div>
                )}

                <div className="ativelo-agent-endpoint">
                  <strong>
                    Endpoint de controle
                  </strong>
                  <code>
                    {API_URL}/agent/health
                  </code>
                </div>
              </section>

              <section className="ativelo-agent-panel wide">
                <header>
                  <span>CÓDIGOS</span>
                  <h2>
                    Histórico de vinculação
                  </h2>
                </header>

                {codes.length === 0 ? (
                  <div className="ativelo-agent-empty">
                    Nenhum código criado.
                  </div>
                ) : (
                  codes.map((code) => (
                    <div
                      className="ativelo-agent-row"
                      key={code.id}
                    >
                      <strong>
                        {code.label}
                      </strong>
                      <span>
                        {code.used_count}/
                        {code.max_uses} usos
                      </span>
                      <small>
                        {formatDate(
                          code.expires_at,
                        )}
                      </small>
                    </div>
                  ))
                )}
              </section>
            </section>
          )}
        </>
      )}
    </main>
  );
}