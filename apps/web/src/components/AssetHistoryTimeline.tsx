import { useCallback, useEffect, useState } from "react";
import AppIcon from "./AppIcon";
import { supabase } from "../lib/supabase";
import { conditionLabels, lifecycleLabels, statusLabels } from "../types/assets";

type Props = {
  organizationId: string;
  assetId: string;
};

type TimelineItem = {
  id: string;
  type: "status" | "location";
  title: string;
  description: string;
  reason: string | null;
  occurredAt: string;
};

type StatusHistoryRow = {
  id: string;
  previous_lifecycle_stage: string | null;
  new_lifecycle_stage: string | null;
  previous_operational_status: string | null;
  new_operational_status: string | null;
  previous_physical_condition: string | null;
  new_physical_condition: string | null;
  reason: string | null;
  changed_at: string;
};

type LocationHistoryRow = {
  id: string;
  previous_unit_id: string | null;
  new_unit_id: string | null;
  previous_building_id: string | null;
  new_building_id: string | null;
  previous_floor_id: string | null;
  new_floor_id: string | null;
  previous_department_id: string | null;
  new_department_id: string | null;
  previous_room_id: string | null;
  new_room_id: string | null;
  previous_rack_id: string | null;
  new_rack_id: string | null;
  previous_workstation_id: string | null;
  new_workstation_id: string | null;
  reason: string | null;
  moved_at: string;
};

export default function AssetHistoryTimeline({
  organizationId,
  assetId,
}: Props) {
  const [items, setItems] = useState<TimelineItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadHistory = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);

    const [statusResult, locationResult] = await Promise.all([
      supabase
        .from("asset_status_history")
        .select(
          "id,previous_lifecycle_stage,new_lifecycle_stage,previous_operational_status,new_operational_status,previous_physical_condition,new_physical_condition,reason,changed_at",
        )
        .eq("organization_id", organizationId)
        .eq("asset_id", assetId)
        .order("changed_at", { ascending: false }),
      supabase
        .from("asset_location_history")
        .select(
          "id,previous_unit_id,new_unit_id,previous_building_id,new_building_id,previous_floor_id,new_floor_id,previous_department_id,new_department_id,previous_room_id,new_room_id,previous_rack_id,new_rack_id,previous_workstation_id,new_workstation_id,reason,moved_at",
        )
        .eq("organization_id", organizationId)
        .eq("asset_id", assetId)
        .order("moved_at", { ascending: false }),
    ]);

    const firstError = statusResult.error || locationResult.error;

    if (firstError) {
      setErrorMessage(firstError.message);
      setIsLoading(false);
      return;
    }

    const statusItems = ((statusResult.data ?? []) as StatusHistoryRow[]).map(
      (row): TimelineItem => ({
        id: `status-${row.id}`,
        type: "status",
        title: "Situação do ativo atualizada",
        description: describeStatusChange(row),
        reason: row.reason,
        occurredAt: row.changed_at,
      }),
    );

    const locationItems = (
      (locationResult.data ?? []) as LocationHistoryRow[]
    ).map(
      (row): TimelineItem => ({
        id: `location-${row.id}`,
        type: "location",
        title: "Localização do ativo alterada",
        description: describeLocationChange(row),
        reason: row.reason,
        occurredAt: row.moved_at,
      }),
    );

    setItems(
      [...statusItems, ...locationItems].sort(
        (first, second) =>
          new Date(second.occurredAt).getTime() -
          new Date(first.occurredAt).getTime(),
      ),
    );
    setIsLoading(false);
  }, [assetId, organizationId]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  return (
    <section className="ativelo-history-section">
      <div className="ativelo-detail-section-heading">
        <div>
          <span>RASTREABILIDADE</span>
          <h3>Histórico do equipamento</h3>
        </div>

        <button
          type="button"
          className="secondary"
          onClick={() => void loadHistory()}
        >
          <AppIcon name="refresh" size={17} />
          Atualizar
        </button>
      </div>

      {errorMessage && (
        <div className="ativelo-assets-feedback error">{errorMessage}</div>
      )}

      {isLoading ? (
        <div className="ativelo-inline-empty">Carregando histórico...</div>
      ) : items.length === 0 ? (
        <div className="ativelo-inline-empty">
          <AppIcon name="history" size={30} />
          <strong>Nenhum evento registrado</strong>
          <span>
            Alterações de status e movimentações aparecerão nesta linha do
            tempo.
          </span>
        </div>
      ) : (
        <div className="ativelo-history-list">
          {items.map((item) => (
            <article key={item.id}>
              <i className={item.type}>
                <AppIcon
                  name={item.type === "status" ? "history" : "locations"}
                  size={17}
                />
              </i>

              <div>
                <strong>{item.title}</strong>
                <span>{item.description}</span>
                {item.reason && <small>{item.reason}</small>}
              </div>

              <time dateTime={item.occurredAt}>
                {new Intl.DateTimeFormat("pt-BR", {
                  dateStyle: "short",
                  timeStyle: "short",
                }).format(new Date(item.occurredAt))}
              </time>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function describeStatusChange(row: StatusHistoryRow): string {
  const changes: string[] = [];

  if (
    row.previous_operational_status !== row.new_operational_status &&
    row.new_operational_status
  ) {
    changes.push(
      `Status: ${labelOrDash(
        statusLabels,
        row.previous_operational_status,
      )} → ${labelOrDash(statusLabels, row.new_operational_status)}`,
    );
  }

  if (
    row.previous_physical_condition !== row.new_physical_condition &&
    row.new_physical_condition
  ) {
    changes.push(
      `Condição: ${labelOrDash(
        conditionLabels,
        row.previous_physical_condition,
      )} → ${labelOrDash(conditionLabels, row.new_physical_condition)}`,
    );
  }

  if (
    row.previous_lifecycle_stage !== row.new_lifecycle_stage &&
    row.new_lifecycle_stage
  ) {
    changes.push(
      `Ciclo: ${labelOrDash(
        lifecycleLabels,
        row.previous_lifecycle_stage,
      )} → ${labelOrDash(lifecycleLabels, row.new_lifecycle_stage)}`,
    );
  }

  return changes.join(" · ") || "Cadastro inicial do equipamento.";
}

function describeLocationChange(row: LocationHistoryRow): string {
  const changedLevels = [
    ["unidade", row.previous_unit_id, row.new_unit_id],
    ["prédio", row.previous_building_id, row.new_building_id],
    ["andar", row.previous_floor_id, row.new_floor_id],
    ["setor", row.previous_department_id, row.new_department_id],
    ["sala", row.previous_room_id, row.new_room_id],
    ["rack", row.previous_rack_id, row.new_rack_id],
    ["estação", row.previous_workstation_id, row.new_workstation_id],
  ]
    .filter(([, previousValue, newValue]) => previousValue !== newValue)
    .map(([level]) => level);

  if (changedLevels.length === 0) {
    return "Localização inicial registrada.";
  }

  return `Níveis alterados: ${changedLevels.join(", ")}.`;
}

function labelOrDash(
  labels: Record<string, string>,
  value: string | null,
): string {
  if (!value) {
    return "não definido";
  }

  return labels[value] ?? value;
}
