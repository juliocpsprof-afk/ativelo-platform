import {
  useCallback,
  useEffect,
  useMemo,
  useState,
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

type AuditEvent = {
  id: string;
  organization_id: string;
  actor_user_id: string | null;
  actor_name: string | null;
  actor_email: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  entity_label: string | null;
  changed_fields: string[];
  old_values:
    | Record<string, unknown>
    | null;
  new_values:
    | Record<string, unknown>
    | null;
  ip_address: string | null;
  user_agent: string | null;
  origin: string;
  request_id: string | null;
  metadata: Record<
    string,
    unknown
  >;
  created_at: string;
};

const actionLabels:
  Record<string, string> = {
    created: "Criado",
    updated: "Alterado",
    deleted: "Excluído",
    asset_location_changed:
      "Localização alterada",
    asset_responsible_changed:
      "Responsável alterado",
    asset_location_and_responsible_changed:
      "Local e responsável alterados",
    asset_status_changed:
      "Status alterado",
    access_changed:
      "Acesso alterado",
    label_printed:
      "Etiqueta impressa",
    label_reprinted:
      "Etiqueta reimpressa",
  };

const entityLabels:
  Record<string, string> = {
    assets: "Ativo",
    asset_photos: "Foto do ativo",
    asset_categories: "Categoria",
    manufacturers: "Fabricante",
    asset_models: "Modelo",
    organization_units: "Unidade",
    buildings: "Prédio",
    floors: "Andar",
    departments: "Setor",
    rooms: "Sala",
    racks: "Rack",
    workstations: "Estação",
    organization_memberships:
      "Usuário e acesso",
    organizations: "Empresa",
    support_tickets: "Chamado",
    support_ticket_comments:
      "Comentário do chamado",
    preventive_maintenance_plans:
      "Plano preventivo",
    maintenance_orders:
      "Ordem de manutenção",
    asset_loans: "Empréstimo",
    inventory_audits:
      "Auditoria física",
    inventory_audit_items:
      "Item da auditoria",
    inventory_agents:
      "Agente de inventário",
    discovered_devices:
      "Dispositivo encontrado",
  };

const fieldLabels:
  Record<string, string> = {
    asset_number: "Patrimônio",
    name: "Nome",
    serial_number:
      "Número de série",
    service_tag: "Service Tag",
    operational_status: "Status",
    physical_condition:
      "Condição física",
    lifecycle_stage:
      "Ciclo de vida",
    assigned_person_name:
      "Responsável",
    assigned_person_email:
      "E-mail do responsável",
    unit_id: "Unidade",
    building_id: "Prédio",
    floor_id: "Andar",
    department_id: "Setor",
    room_id: "Sala",
    rack_id: "Rack",
    workstation_id: "Estação",
    hostname: "Hostname",
    ip_address: "Endereço IP",
    mac_address: "Endereço MAC",
    operating_system:
      "Sistema operacional",
    notes: "Observações",
    role: "Perfil",
    is_active: "Ativo",
  };

function formatDate(
  value: string,
): string {
  return new Date(value)
    .toLocaleString("pt-BR");
}

function formatValue(
  value: unknown,
): string {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return "Não informado";
  }

  if (typeof value === "boolean") {
    return value ? "Sim" : "Não";
  }

  if (
    typeof value === "object"
  ) {
    return JSON.stringify(
      value,
      null,
      2,
    );
  }

  return String(value);
}

function csvEscape(
  value: unknown,
): string {
  return `"${String(value ?? "")
    .replaceAll('"', '""')}"`;
}

function downloadCsv(
  events: AuditEvent[],
): void {
  const headers = [
    "Data e hora",
    "Ação",
    "Tipo",
    "Registro",
    "Usuário",
    "E-mail",
    "IP",
    "Origem",
    "Campos alterados",
  ];

  const rows = events.map(
    (event) => [
      formatDate(event.created_at),
      actionLabels[event.action] ??
        event.action,
      entityLabels[
        event.entity_type
      ] ?? event.entity_type,
      event.entity_label ??
        event.entity_id ??
        "",
      event.actor_name ?? "",
      event.actor_email ?? "",
      event.ip_address ?? "",
      event.origin,
      event.changed_fields
        .map(
          (field) =>
            fieldLabels[field] ??
            field,
        )
        .join(", "),
    ],
  );

  const content = [
    headers.map(csvEscape).join(";"),
    ...rows.map((row) =>
      row.map(csvEscape).join(";"),
    ),
  ].join("\r\n");

  const blob = new Blob(
    ["\ufeff", content],
    {
      type:
        "text/csv;charset=utf-8",
    },
  );

  const url =
    URL.createObjectURL(blob);
  const anchor =
    document.createElement("a");

  anchor.href = url;
  anchor.download =
    "historico-auditoria-ativelo.csv";
  anchor.click();

  URL.revokeObjectURL(url);
}

export default function SystemAuditPage({
  organization,
  onBack,
}: Props) {
  const [events, setEvents] =
    useState<AuditEvent[]>([]);
  const [isLoading, setIsLoading] =
    useState(true);
  const [feedback, setFeedback] =
    useState<string | null>(null);
  const [actionFilter, setActionFilter] =
    useState("");
  const [entityFilter, setEntityFilter] =
    useState("");
  const [search, setSearch] =
    useState("");
  const [period, setPeriod] =
    useState("30");
  const [selected, setSelected] =
    useState<AuditEvent | null>(null);

  const allowed =
    [
      "owner",
      "admin",
      "it_manager",
      "auditor",
    ].includes(
      organization.role,
    );

  const loadEvents =
    useCallback(async () => {
      if (!allowed) {
        setFeedback(
          "Seu perfil não possui permissão para consultar a auditoria.",
        );
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setFeedback(null);

      let query = supabase
        .from("audit_events")
        .select("*")
        .eq(
          "organization_id",
          organization.organizationId,
        )
        .order("created_at", {
          ascending: false,
        })
        .limit(500);

      if (period !== "all") {
        const days =
          Number(period);

        const since =
          new Date(
            Date.now() -
              days *
                86400000,
          ).toISOString();

        query = query.gte(
          "created_at",
          since,
        );
      }

      const result = await query;

      if (result.error) {
        setFeedback(
          result.error.message,
        );
        setEvents([]);
        setIsLoading(false);
        return;
      }

      setEvents(
        (result.data ?? []) as
          AuditEvent[],
      );

      setIsLoading(false);
    }, [
      allowed,
      organization.organizationId,
      period,
    ]);

  useEffect(() => {
    void loadEvents();
  }, [loadEvents]);

  const filteredEvents =
    useMemo(() => {
      const normalized =
        search
          .trim()
          .toLowerCase();

      return events.filter(
        (event) => {
          const matchesAction =
            !actionFilter ||
            event.action ===
              actionFilter;

          const matchesEntity =
            !entityFilter ||
            event.entity_type ===
              entityFilter;

          const matchesSearch =
            !normalized ||
            [
              event.entity_label,
              event.entity_id,
              event.actor_name,
              event.actor_email,
              event.ip_address,
              event.origin,
              ...event.changed_fields,
            ]
              .filter(Boolean)
              .some((value) =>
                String(value)
                  .toLowerCase()
                  .includes(normalized),
              );

          return (
            matchesAction &&
            matchesEntity &&
            matchesSearch
          );
        },
      );
    }, [
      actionFilter,
      entityFilter,
      events,
      search,
    ]);

  const actionOptions =
    useMemo(
      () =>
        Array.from(
          new Set(
            events.map(
              (event) =>
                event.action,
            ),
          ),
        ).sort(),
      [events],
    );

  const entityOptions =
    useMemo(
      () =>
        Array.from(
          new Set(
            events.map(
              (event) =>
                event.entity_type,
            ),
          ),
        ).sort(),
      [events],
    );

  const todayCount =
    events.filter(
      (event) =>
        new Date(
          event.created_at,
        ).toDateString() ===
        new Date().toDateString(),
    ).length;

  const deletionCount =
    events.filter(
      (event) =>
        event.action === "deleted",
    ).length;

  const printCount =
    events.filter(
      (event) =>
        [
          "label_printed",
          "label_reprinted",
        ].includes(event.action),
    ).length;

  return (
    <main className="ativelo-system-audit-page">
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
            RASTREABILIDADE E SEGURANÇA
          </span>
          <h1>
            Histórico do sistema
          </h1>
          <p>
            Consulte quem realizou cada operação,
            o que mudou, quando aconteceu, a origem
            e o endereço IP registrado.
          </p>
        </div>

        <div className="ativelo-system-audit-actions">
          <button
            type="button"
            className="secondary"
            onClick={() =>
              void loadEvents()
            }
          >
            <AppIcon
              name="refresh"
              size={18}
            />
            Atualizar
          </button>

          <button
            type="button"
            className="secondary"
            disabled={
              filteredEvents.length === 0
            }
            onClick={() =>
              downloadCsv(
                filteredEvents,
              )
            }
          >
            <AppIcon
              name="download"
              size={18}
            />
            Exportar CSV
          </button>
        </div>
      </header>

      {!allowed ? (
        <section className="ativelo-system-audit-denied">
          <AppIcon
            name="alert"
            size={34}
          />
          <h2>
            Acesso restrito
          </h2>
          <p>
            Apenas proprietário, administrador,
            gestor de TI ou auditor pode consultar
            este histórico.
          </p>
        </section>
      ) : (
        <>
          {feedback && (
            <div className="ativelo-system-audit-feedback">
              {feedback}
            </div>
          )}

          <section className="ativelo-system-audit-summary">
            <article>
              <span>
                Eventos carregados
              </span>
              <strong>
                {events.length}
              </strong>
            </article>

            <article>
              <span>Hoje</span>
              <strong>
                {todayCount}
              </strong>
            </article>

            <article>
              <span>Exclusões</span>
              <strong>
                {deletionCount}
              </strong>
            </article>

            <article>
              <span>
                Impressões
              </span>
              <strong>
                {printCount}
              </strong>
            </article>
          </section>

          <section className="ativelo-system-audit-filters">
            <label className="search">
              <span>Buscar</span>
              <input
                value={search}
                onChange={(event) =>
                  setSearch(
                    event.target.value,
                  )
                }
                placeholder="Registro, usuário, IP, origem ou campo"
              />
            </label>

            <label>
              <span>Período</span>
              <select
                value={period}
                onChange={(event) =>
                  setPeriod(
                    event.target.value,
                  )
                }
              >
                <option value="7">
                  Últimos 7 dias
                </option>
                <option value="30">
                  Últimos 30 dias
                </option>
                <option value="90">
                  Últimos 90 dias
                </option>
                <option value="365">
                  Último ano
                </option>
                <option value="all">
                  Todo o histórico
                </option>
              </select>
            </label>

            <label>
              <span>Ação</span>
              <select
                value={actionFilter}
                onChange={(event) =>
                  setActionFilter(
                    event.target.value,
                  )
                }
              >
                <option value="">
                  Todas as ações
                </option>

                {actionOptions.map(
                  (action) => (
                    <option
                      key={action}
                      value={action}
                    >
                      {actionLabels[
                        action
                      ] ?? action}
                    </option>
                  ),
                )}
              </select>
            </label>

            <label>
              <span>Tipo</span>
              <select
                value={entityFilter}
                onChange={(event) =>
                  setEntityFilter(
                    event.target.value,
                  )
                }
              >
                <option value="">
                  Todos os tipos
                </option>

                {entityOptions.map(
                  (entity) => (
                    <option
                      key={entity}
                      value={entity}
                    >
                      {entityLabels[
                        entity
                      ] ?? entity}
                    </option>
                  ),
                )}
              </select>
            </label>
          </section>

          <section className="ativelo-system-audit-panel">
            <header>
              <div>
                <span>
                  REGISTRO CENTRAL
                </span>
                <h2>
                  Operações realizadas
                </h2>
              </div>

              <strong>
                {filteredEvents.length}
              </strong>
            </header>

            {isLoading ? (
              <div className="ativelo-system-audit-empty">
                Carregando histórico...
              </div>
            ) : filteredEvents.length ===
              0 ? (
              <div className="ativelo-system-audit-empty">
                Nenhum evento encontrado com os
                filtros selecionados.
              </div>
            ) : (
              <div className="ativelo-system-audit-table-wrap">
                <table className="ativelo-system-audit-table">
                  <thead>
                    <tr>
                      <th>
                        Data e hora
                      </th>
                      <th>Ação</th>
                      <th>Registro</th>
                      <th>Usuário</th>
                      <th>IP e origem</th>
                      <th></th>
                    </tr>
                  </thead>

                  <tbody>
                    {filteredEvents.map(
                      (event) => (
                        <tr key={event.id}>
                          <td>
                            <strong>
                              {formatDate(
                                event.created_at,
                              )}
                            </strong>
                          </td>

                          <td>
                            <span
                              className={`action ${event.action}`}
                            >
                              {actionLabels[
                                event.action
                              ] ??
                                event.action}
                            </span>
                          </td>

                          <td>
                            <strong>
                              {event.entity_label ??
                                event.entity_id ??
                                "Registro"}
                            </strong>
                            <small>
                              {entityLabels[
                                event.entity_type
                              ] ??
                                event.entity_type}
                            </small>
                          </td>

                          <td>
                            <strong>
                              {event.actor_name ??
                                event.actor_email ??
                                "Sistema"}
                            </strong>
                            <small>
                              {event.actor_email ??
                                "Operação automática"}
                            </small>
                          </td>

                          <td>
                            <strong>
                              {event.ip_address ??
                                "IP não disponível"}
                            </strong>
                            <small>
                              {event.origin}
                            </small>
                          </td>

                          <td>
                            <button
                              type="button"
                              aria-label="Abrir detalhes"
                              onClick={() =>
                                setSelected(
                                  event,
                                )
                              }
                            >
                              <AppIcon
                                name="chevron"
                                size={18}
                              />
                            </button>
                          </td>
                        </tr>
                      ),
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}

      {selected && (
        <div className="ativelo-modal-backdrop">
          <section
            className="ativelo-modal large ativelo-system-audit-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Detalhes da auditoria"
          >
            <header>
              <div>
                <span>
                  {entityLabels[
                    selected.entity_type
                  ] ??
                    selected.entity_type}
                </span>
                <h2>
                  {actionLabels[
                    selected.action
                  ] ??
                    selected.action}
                </h2>
              </div>

              <button
                type="button"
                aria-label="Fechar"
                onClick={() =>
                  setSelected(null)
                }
              >
                <AppIcon
                  name="close"
                  size={21}
                />
              </button>
            </header>

            <div className="ativelo-system-audit-modal-body">
              <section className="ativelo-system-audit-identity">
                <div>
                  <span>Registro</span>
                  <strong>
                    {selected.entity_label ??
                      selected.entity_id ??
                      "Não identificado"}
                  </strong>
                </div>

                <div>
                  <span>
                    Data e hora
                  </span>
                  <strong>
                    {formatDate(
                      selected.created_at,
                    )}
                  </strong>
                </div>

                <div>
                  <span>Usuário</span>
                  <strong>
                    {selected.actor_name ??
                      selected.actor_email ??
                      "Sistema"}
                  </strong>
                </div>

                <div>
                  <span>IP</span>
                  <strong>
                    {selected.ip_address ??
                      "Não disponível"}
                  </strong>
                </div>

                <div>
                  <span>Origem</span>
                  <strong>
                    {selected.origin}
                  </strong>
                </div>

                <div>
                  <span>
                    Request ID
                  </span>
                  <strong>
                    {selected.request_id ??
                      "Não disponível"}
                  </strong>
                </div>
              </section>

              {selected.changed_fields
                .length > 0 && (
                <section className="ativelo-system-audit-changes">
                  <header>
                    <span>Campo</span>
                    <span>Valor anterior</span>
                    <span>Valor novo</span>
                  </header>

                  {selected.changed_fields.map(
                    (field) => (
                      <article key={field}>
                        <strong>
                          {fieldLabels[
                            field
                          ] ?? field}
                        </strong>

                        <pre>
                          {formatValue(
                            selected.old_values?.[
                              field
                            ],
                          )}
                        </pre>

                        <pre>
                          {formatValue(
                            selected.new_values?.[
                              field
                            ],
                          )}
                        </pre>
                      </article>
                    ),
                  )}
                </section>
              )}

              {selected.action ===
                "deleted" && (
                <section className="ativelo-system-audit-payload">
                  <h3>
                    Dados anteriores à exclusão
                  </h3>
                  <pre>
                    {JSON.stringify(
                      selected.old_values,
                      null,
                      2,
                    )}
                  </pre>
                </section>
              )}

              {Object.keys(
                selected.metadata ?? {},
              ).length > 0 && (
                <section className="ativelo-system-audit-payload">
                  <h3>
                    Metadados da operação
                  </h3>
                  <pre>
                    {JSON.stringify(
                      selected.metadata,
                      null,
                      2,
                    )}
                  </pre>
                </section>
              )}
            </div>
          </section>
        </div>
      )}
    </main>
  );
}