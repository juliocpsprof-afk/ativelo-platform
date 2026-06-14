import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { BrowserQRCodeReader } from "@zxing/browser";
import type { OrganizationContext } from "../App";
import AppIcon from "../components/AppIcon";
import { supabase } from "../lib/supabase";

export type AuditReportsTab = "audits" | "reports";

type Props = {
  organization: OrganizationContext;
  initialTab?: AuditReportsTab;
  onBack: () => void;
  onOpenAsset: (assetId: string) => void;
};

type ScannerControls = {
  stop: () => void;
};

type UnitOption = {
  id: string;
  name: string;
};

type CategoryOption = {
  id: string;
  name: string;
};

type AuditRecord = {
  id: string;
  name: string;
  scope_type: string;
  scope_id: string | null;
  status: string;
  notes: string | null;
  started_at: string;
  completed_at: string | null;
  created_at: string;
};

type AuditItem = {
  id: string;
  audit_id: string;
  asset_id: string;
  expected: boolean;
  status: string;
  expected_unit_id: string | null;
  observed_unit_id: string | null;
  expected_condition: string | null;
  observed_condition: string | null;
  scanned_at: string | null;
  notes: string | null;
  assets: {
    asset_number: string;
    name: string;
    serial_number: string | null;
  } | null;
};

type AssetReportRecord = {
  id: string;
  asset_number: string;
  name: string;
  operational_status: string;
  physical_condition: string;
  criticality: string;
  warranty_end_date: string | null;
  expected_replacement_date: string | null;
  category_id: string;
  manufacturer_id: string | null;
  unit_id: string | null;
  acquisition_value: number | null;
  created_at: string;
};

type TicketReportRecord = {
  id: string;
  status: string;
  priority: string;
  created_at: string;
  resolved_at: string | null;
};

type PreventiveReportRecord = {
  id: string;
  next_due_date: string;
  is_active: boolean;
};

type LoanReportRecord = {
  id: string;
  status: string;
  due_at: string;
};

type AuditSummary = {
  total: number;
  pending: number;
  found: number;
  moved: number;
  damaged: number;
  missing: number;
  unexpected: number;
};

const auditStatusLabels: Record<string, string> = {
  active: "Em andamento",
  completed: "Concluída",
  canceled: "Cancelada",
};

const itemStatusLabels: Record<string, string> = {
  pending: "Pendente",
  found: "Encontrado",
  moved: "Local divergente",
  damaged: "Condição divergente",
  missing: "Não localizado",
  unexpected: "Não previsto",
};

const conditionLabels: Record<string, string> = {
  new: "Novo",
  excellent: "Excelente",
  good: "Bom",
  fair: "Regular",
  poor: "Ruim",
  irrecoverable: "Irrecuperável",
};

const assetStatusLabels: Record<string, string> = {
  available: "Disponível",
  in_use: "Em uso",
  reserved: "Reservado",
  loaned: "Emprestado",
  in_maintenance: "Em manutenção",
  awaiting_part: "Aguardando peça",
  defective: "Com defeito",
  lost: "Perdido",
  stolen: "Furtado",
  not_found: "Não localizado",
  retired: "Retirado",
  disposed: "Descartado",
};

const emptyAuditSummary: AuditSummary = {
  total: 0,
  pending: 0,
  found: 0,
  moved: 0,
  damaged: 0,
  missing: 0,
  unexpected: 0,
};

function parseAssetCode(rawCode: string): {
  publicId: string | null;
  token: string | null;
  assetNumber: string | null;
} {
  const normalized = rawCode.trim();

  if (normalized.startsWith("ATV:")) {
    const [, publicId, token] = normalized.split(":");

    return {
      publicId: publicId || null,
      token: token || null,
      assetNumber: null,
    };
  }

  try {
    const url = new URL(normalized);

    return {
      publicId: url.searchParams.get("asset"),
      token: url.searchParams.get("token"),
      assetNumber: url.searchParams.get("number"),
    };
  } catch {
    return {
      publicId: null,
      token: /^[0-9a-f-]{36}$/i.test(normalized)
        ? normalized
        : null,
      assetNumber: normalized,
    };
  }
}

function csvEscape(value: unknown) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function downloadCsv(
  filename: string,
  headers: string[],
  rows: Array<Array<string | number | null>>,
) {
  const content = [
    headers.map(csvEscape).join(";"),
    ...rows.map((row) => row.map(csvEscape).join(";")),
  ].join("\r\n");

  const blob = new Blob(["\ufeff", content], {
    type: "text/csv;charset=utf-8",
  });

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function AuditReportsPage({
  organization,
  initialTab = "audits",
  onBack,
  onOpenAsset,
}: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<ScannerControls | null>(null);
  const lastCodeRef = useRef("");

  const [activeTab, setActiveTab] =
    useState<AuditReportsTab>(initialTab);
  const [audits, setAudits] = useState<AuditRecord[]>([]);
  const [auditItems, setAuditItems] = useState<AuditItem[]>([]);
  const [units, setUnits] = useState<UnitOption[]>([]);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [assets, setAssets] = useState<AssetReportRecord[]>([]);
  const [tickets, setTickets] = useState<TicketReportRecord[]>([]);
  const [preventivePlans, setPreventivePlans] =
    useState<PreventiveReportRecord[]>([]);
  const [loans, setLoans] = useState<LoanReportRecord[]>([]);

  const [selectedAuditId, setSelectedAuditId] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [auditName, setAuditName] = useState("");
  const [auditScope, setAuditScope] = useState<"all" | "unit">("all");
  const [auditUnitId, setAuditUnitId] = useState("");
  const [auditNotes, setAuditNotes] = useState("");

  const [manualCode, setManualCode] = useState("");
  const [observedUnitId, setObservedUnitId] = useState("");
  const [observedCondition, setObservedCondition] = useState("good");
  const [scanNotes, setScanNotes] = useState("");
  const [itemFilter, setItemFilter] = useState("");

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error" | "warning";
    text: string;
  } | null>(null);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  const stopCamera = useCallback(() => {
    controlsRef.current?.stop();
    controlsRef.current = null;
    setIsCameraActive(false);

    const stream = videoRef.current?.srcObject;

    if (stream instanceof MediaStream) {
      stream.getTracks().forEach((track) => track.stop());
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  useEffect(() => stopCamera, [stopCamera]);

  const loadBaseData = useCallback(async () => {
    setIsLoading(true);
    setFeedback(null);

    const organizationId = organization.organizationId;

    const [
      auditsResult,
      unitsResult,
      categoriesResult,
      assetsResult,
      ticketsResult,
      preventiveResult,
      loansResult,
    ] = await Promise.all([
      supabase
        .from("inventory_audits")
        .select("id,name,scope_type,scope_id,status,notes,started_at,completed_at,created_at")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false }),
      supabase
        .from("organization_units")
        .select("id,name")
        .eq("organization_id", organizationId)
        .eq("is_active", true)
        .order("name"),
      supabase
        .from("asset_categories")
        .select("id,name")
        .eq("organization_id", organizationId)
        .order("name"),
      supabase
        .from("assets")
        .select(
          "id,asset_number,name,operational_status,physical_condition,criticality,warranty_end_date,expected_replacement_date,category_id,manufacturer_id,unit_id,acquisition_value,created_at",
        )
        .eq("organization_id", organizationId)
        .eq("is_active", true),
      supabase
        .from("support_tickets")
        .select("id,status,priority,created_at,resolved_at")
        .eq("organization_id", organizationId),
      supabase
        .from("preventive_maintenance_plans")
        .select("id,next_due_date,is_active")
        .eq("organization_id", organizationId),
      supabase
        .from("asset_loans")
        .select("id,status,due_at")
        .eq("organization_id", organizationId),
    ]);

    const firstError = [
      auditsResult.error,
      unitsResult.error,
      categoriesResult.error,
      assetsResult.error,
      ticketsResult.error,
      preventiveResult.error,
      loansResult.error,
    ].find(Boolean);

    if (firstError) {
      setFeedback({ type: "error", text: firstError.message });
      setIsLoading(false);
      return;
    }

    const loadedAudits = (auditsResult.data ?? []) as AuditRecord[];

    setAudits(loadedAudits);
    setUnits((unitsResult.data ?? []) as UnitOption[]);
    setCategories((categoriesResult.data ?? []) as CategoryOption[]);
    setAssets((assetsResult.data ?? []) as AssetReportRecord[]);
    setTickets((ticketsResult.data ?? []) as TicketReportRecord[]);
    setPreventivePlans(
      (preventiveResult.data ?? []) as PreventiveReportRecord[],
    );
    setLoans((loansResult.data ?? []) as LoanReportRecord[]);

    setSelectedAuditId((current) => {
      if (
        current &&
        loadedAudits.some((audit) => audit.id === current)
      ) {
        return current;
      }

      return (
        loadedAudits.find((audit) => audit.status === "active")?.id ??
        loadedAudits[0]?.id ??
        ""
      );
    });

    setIsLoading(false);
  }, [organization.organizationId]);

  useEffect(() => {
    void loadBaseData();
  }, [loadBaseData]);

  const loadAuditItems = useCallback(async () => {
    if (!selectedAuditId) {
      setAuditItems([]);
      return;
    }

    const { data, error } = await supabase
      .from("inventory_audit_items")
      .select(
        "id,audit_id,asset_id,expected,status,expected_unit_id,observed_unit_id,expected_condition,observed_condition,scanned_at,notes,assets(asset_number,name,serial_number)",
      )
      .eq("organization_id", organization.organizationId)
      .eq("audit_id", selectedAuditId)
      .order("status")
      .order("created_at");

    if (error) {
      setFeedback({ type: "error", text: error.message });
      return;
    }

    setAuditItems((data ?? []) as unknown as AuditItem[]);
  }, [organization.organizationId, selectedAuditId]);

  useEffect(() => {
    void loadAuditItems();
  }, [loadAuditItems]);

  const selectedAudit =
    audits.find((audit) => audit.id === selectedAuditId) ?? null;

  const auditSummary = useMemo<AuditSummary>(() => {
    if (auditItems.length === 0) return emptyAuditSummary;

    return auditItems.reduce<AuditSummary>(
      (summary, item) => ({
        ...summary,
        total: summary.total + 1,
        [item.status]:
          summary[item.status as keyof AuditSummary] + 1,
      }),
      { ...emptyAuditSummary },
    );
  }, [auditItems]);

  const filteredAuditItems = useMemo(() => {
    if (!itemFilter) return auditItems;

    return auditItems.filter((item) => item.status === itemFilter);
  }, [auditItems, itemFilter]);

  const categoryName = (categoryId: string) =>
    categories.find((item) => item.id === categoryId)?.name ??
    "Sem categoria";

  const unitName = (unitId: string | null) =>
    units.find((item) => item.id === unitId)?.name ??
    "Não definida";

  const createAudit = async (
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();
    setFeedback(null);

    if (!auditName.trim()) {
      setFeedback({
        type: "error",
        text: "Informe o nome da auditoria.",
      });
      return;
    }

    if (auditScope === "unit" && !auditUnitId) {
      setFeedback({
        type: "error",
        text: "Selecione a unidade da auditoria.",
      });
      return;
    }

    setIsSaving(true);

    const { data, error } = await supabase.rpc(
      "create_inventory_audit",
      {
        target_organization_id: organization.organizationId,
        audit_name: auditName.trim(),
        target_scope_type: auditScope,
        target_scope_id:
          auditScope === "unit" ? auditUnitId : null,
        audit_notes: auditNotes.trim() || null,
      },
    );

    if (error) {
      setFeedback({ type: "error", text: error.message });
      setIsSaving(false);
      return;
    }

    setAuditName("");
    setAuditScope("all");
    setAuditUnitId("");
    setAuditNotes("");
    setIsCreateOpen(false);
    setSelectedAuditId(String(data));
    setFeedback({
      type: "success",
      text: "Auditoria criada com a fotografia atual do inventário.",
    });
    setIsSaving(false);
    await loadBaseData();
  };

  const resolveAsset = async (rawCode: string) => {
    const parsed = parseAssetCode(rawCode);

    let query = supabase
      .from("assets")
      .select("id,asset_number,name")
      .eq("organization_id", organization.organizationId);

    if (parsed.publicId) {
      query = query.eq("public_id", parsed.publicId);
    } else if (parsed.token) {
      query = query.eq("qr_token", parsed.token);
    } else if (parsed.assetNumber) {
      query = query.or(
        `asset_number.eq.${parsed.assetNumber},barcode_value.eq.${parsed.assetNumber},serial_number.eq.${parsed.assetNumber},service_tag.eq.${parsed.assetNumber}`,
      );
    }

    const { data, error } = await query.limit(1).maybeSingle();

    if (error) throw error;

    if (!data) {
      throw new Error(
        "O equipamento não foi encontrado nesta empresa.",
      );
    }

    return data;
  };

  const registerScan = useCallback(
    async (rawCode: string) => {
      if (!selectedAudit || selectedAudit.status !== "active") {
        setFeedback({
          type: "warning",
          text: "Selecione uma auditoria em andamento.",
        });
        return;
      }

      const normalized = rawCode.trim();

      if (
        !normalized ||
        normalized === lastCodeRef.current ||
        isScanning
      ) {
        return;
      }

      lastCodeRef.current = normalized;
      setIsScanning(true);
      setFeedback(null);

      try {
        const asset = await resolveAsset(normalized);

        const { data, error } = await supabase.rpc(
          "scan_inventory_audit_asset",
          {
            target_audit_id: selectedAudit.id,
            target_asset_id: asset.id,
            target_observed_unit_id:
              observedUnitId || null,
            target_observed_condition:
              observedCondition,
            target_notes: scanNotes.trim() || null,
          },
        );

        if (error) throw error;

        setFeedback({
          type: "success",
          text:
            `${asset.asset_number} · ${asset.name} registrado como ` +
            `${itemStatusLabels[String(data)] ?? String(data)}.`,
        });

        setManualCode("");
        setScanNotes("");
        stopCamera();
        await loadAuditItems();
      } catch (error) {
        setFeedback({
          type: "error",
          text:
            error instanceof Error
              ? error.message
              : "Não foi possível registrar a leitura.",
        });
        lastCodeRef.current = "";
      } finally {
        setIsScanning(false);
      }
    },
    [
      selectedAudit,
      isScanning,
      observedUnitId,
      observedCondition,
      scanNotes,
      stopCamera,
      loadAuditItems,
    ],
  );

  const startCamera = async () => {
    setFeedback(null);
    lastCodeRef.current = "";
    stopCamera();

    if (!videoRef.current) {
      setFeedback({
        type: "error",
        text: "O leitor de câmera ainda não está pronto.",
      });
      return;
    }

    try {
      const reader = new BrowserQRCodeReader();

      const controls = await reader.decodeFromConstraints(
        {
          audio: false,
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        },
        videoRef.current,
        (result) => {
          if (result) {
            void registerScan(result.getText());
          }
        },
      );

      controlsRef.current = controls;
      setIsCameraActive(true);
    } catch (error) {
      setFeedback({
        type: "error",
        text:
          error instanceof Error
            ? `Não foi possível acessar a câmera: ${error.message}`
            : "Não foi possível acessar a câmera.",
      });
      stopCamera();
    }
  };

  const completeAudit = async () => {
    if (!selectedAudit) return;

    const confirmed = window.confirm(
      "Concluir a auditoria? Todos os itens ainda pendentes serão marcados como não localizados.",
    );

    if (!confirmed) return;

    const { error } = await supabase.rpc(
      "complete_inventory_audit",
      {
        target_audit_id: selectedAudit.id,
      },
    );

    if (error) {
      setFeedback({ type: "error", text: error.message });
      return;
    }

    setFeedback({
      type: "success",
      text: "Auditoria concluída e divergências consolidadas.",
    });
    await loadBaseData();
    await loadAuditItems();
  };

  const cancelAudit = async () => {
    if (!selectedAudit) return;

    const confirmed = window.confirm(
      "Cancelar esta auditoria?",
    );

    if (!confirmed) return;

    const { error } = await supabase
      .from("inventory_audits")
      .update({
        status: "canceled",
        completed_at: new Date().toISOString(),
      })
      .eq("id", selectedAudit.id)
      .eq("organization_id", organization.organizationId);

    if (error) {
      setFeedback({ type: "error", text: error.message });
      return;
    }

    setFeedback({
      type: "success",
      text: "Auditoria cancelada.",
    });
    await loadBaseData();
  };

  const today = new Date();
  const inNinetyDays = new Date(
    today.getTime() + 90 * 86400000,
  );

  const warrantyAssets = useMemo(
    () =>
      assets.filter((asset) => {
        if (!asset.warranty_end_date) return false;

        const date = new Date(
          `${asset.warranty_end_date}T12:00:00`,
        );

        return date >= today && date <= inNinetyDays;
      }),
    [assets],
  );

  const replacementAssets = useMemo(
    () =>
      assets.filter(
        (asset) =>
          asset.expected_replacement_date &&
          new Date(
            `${asset.expected_replacement_date}T12:00:00`,
          ) <= today,
      ),
    [assets],
  );

  const overduePreventive = preventivePlans.filter(
    (plan) =>
      plan.is_active &&
      new Date(`${plan.next_due_date}T12:00:00`) <= today,
  );

  const openTickets = tickets.filter(
    (ticket) =>
      !["resolved", "closed", "canceled"].includes(
        ticket.status,
      ),
  );

  const overdueLoans = loans.filter(
    (loan) =>
      loan.status === "overdue" ||
      (["planned", "active"].includes(loan.status) &&
        new Date(loan.due_at) < today),
  );

  const totalValue = assets.reduce(
    (sum, asset) => sum + (asset.acquisition_value ?? 0),
    0,
  );

  const assetsByStatus = useMemo(() => {
    const counts = new Map<string, number>();

    assets.forEach((asset) => {
      counts.set(
        asset.operational_status,
        (counts.get(asset.operational_status) ?? 0) + 1,
      );
    });

    return Array.from(counts.entries())
      .map(([key, value]) => ({
        key,
        label: assetStatusLabels[key] ?? key,
        value,
      }))
      .sort((a, b) => b.value - a.value);
  }, [assets]);

  const assetsByCategory = useMemo(() => {
    const counts = new Map<string, number>();

    assets.forEach((asset) => {
      counts.set(
        asset.category_id,
        (counts.get(asset.category_id) ?? 0) + 1,
      );
    });

    return Array.from(counts.entries())
      .map(([key, value]) => ({
        key,
        label: categoryName(key),
        value,
      }))
      .sort((a, b) => b.value - a.value);
  }, [assets, categories]);

  const exportInventory = () => {
    downloadCsv(
      "relatorio-inventario-ativelo.csv",
      [
        "Patrimônio",
        "Equipamento",
        "Categoria",
        "Status",
        "Condição",
        "Criticidade",
        "Unidade",
        "Garantia",
        "Substituição",
        "Valor",
      ],
      assets.map((asset) => [
        asset.asset_number,
        asset.name,
        categoryName(asset.category_id),
        assetStatusLabels[asset.operational_status] ??
          asset.operational_status,
        conditionLabels[asset.physical_condition] ??
          asset.physical_condition,
        asset.criticality,
        unitName(asset.unit_id),
        asset.warranty_end_date,
        asset.expected_replacement_date,
        asset.acquisition_value,
      ]),
    );
  };

  const exportAudit = () => {
    if (!selectedAudit) return;

    downloadCsv(
      `auditoria-${selectedAudit.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")}.csv`,
      [
        "Patrimônio",
        "Equipamento",
        "Status",
        "Previsto",
        "Unidade esperada",
        "Unidade observada",
        "Condição esperada",
        "Condição observada",
        "Leitura",
        "Observações",
      ],
      auditItems.map((item) => [
        item.assets?.asset_number ?? "",
        item.assets?.name ?? "",
        itemStatusLabels[item.status] ?? item.status,
        item.expected ? "Sim" : "Não",
        unitName(item.expected_unit_id),
        unitName(item.observed_unit_id),
        conditionLabels[item.expected_condition ?? ""] ??
          item.expected_condition,
        conditionLabels[item.observed_condition ?? ""] ??
          item.observed_condition,
        item.scanned_at
          ? new Date(item.scanned_at).toLocaleString("pt-BR")
          : "",
        item.notes,
      ]),
    );
  };

  const maximumStatusValue = Math.max(
    ...assetsByStatus.map((item) => item.value),
    1,
  );

  const maximumCategoryValue = Math.max(
    ...assetsByCategory.map((item) => item.value),
    1,
  );

  return (
    <main className="ativelo-audit-page">
      <header className="ativelo-audit-header">
        <div>
          <button type="button" onClick={onBack}>
            ← Voltar ao painel
          </button>
          <p>CONFERÊNCIA E INTELIGÊNCIA</p>
          <h1>Auditorias e relatórios</h1>
          <span>
            Confira fisicamente os patrimônios e transforme os dados do
            Ativelo em decisões práticas.
          </span>
        </div>

        <div className="ativelo-audit-header-actions">
          <button
            type="button"
            className="secondary"
            onClick={() => void loadBaseData()}
          >
            <AppIcon name="refresh" size={18} />
            Atualizar
          </button>

          {activeTab === "audits" ? (
            <button
              type="button"
              className="primary"
              onClick={() => setIsCreateOpen(true)}
            >
              <AppIcon name="plus" size={18} />
              Nova auditoria
            </button>
          ) : (
            <button
              type="button"
              className="primary"
              onClick={() => window.print()}
            >
              <AppIcon name="print" size={18} />
              Imprimir relatório
            </button>
          )}
        </div>
      </header>

      <nav className="ativelo-audit-tabs">
        <button
          className={activeTab === "audits" ? "active" : ""}
          type="button"
          onClick={() => setActiveTab("audits")}
        >
          <AppIcon name="audits" size={20} />
          Auditorias físicas
        </button>
        <button
          className={activeTab === "reports" ? "active" : ""}
          type="button"
          onClick={() => setActiveTab("reports")}
        >
          <AppIcon name="reports" size={20} />
          Central de relatórios
        </button>
      </nav>

      {feedback && (
        <div className={`ativelo-audit-feedback ${feedback.type}`}>
          {feedback.text}
        </div>
      )}

      {activeTab === "audits" && (
        <section className="ativelo-audit-layout">
          <aside className="ativelo-audit-list-panel">
            <div className="ativelo-audit-panel-heading">
              <div>
                <span>CAMPANHAS</span>
                <h2>Auditorias</h2>
              </div>
              <b>{audits.length}</b>
            </div>

            {isLoading ? (
              <div className="ativelo-audit-empty">
                Carregando auditorias...
              </div>
            ) : audits.length === 0 ? (
              <div className="ativelo-audit-empty">
                <AppIcon name="audits" size={42} />
                <strong>Nenhuma auditoria criada</strong>
                <span>
                  Crie uma campanha para fotografar o estado atual do
                  inventário.
                </span>
              </div>
            ) : (
              <div className="ativelo-audit-list">
                {audits.map((audit) => (
                  <button
                    className={
                      selectedAuditId === audit.id ? "active" : ""
                    }
                    type="button"
                    key={audit.id}
                    onClick={() => {
                      setSelectedAuditId(audit.id);
                      setObservedUnitId(
                        audit.scope_type === "unit"
                          ? audit.scope_id ?? ""
                          : "",
                      );
                    }}
                  >
                    <i>
                      <AppIcon name="audits" size={21} />
                    </i>
                    <span>
                      <strong>{audit.name}</strong>
                      <small>
                        {audit.scope_type === "unit"
                          ? unitName(audit.scope_id)
                          : "Toda a organização"}
                      </small>
                    </span>
                    <b className={audit.status}>
                      {auditStatusLabels[audit.status] ??
                        audit.status}
                    </b>
                  </button>
                ))}
              </div>
            )}
          </aside>

          <section className="ativelo-audit-workspace">
            {!selectedAudit ? (
              <div className="ativelo-audit-empty">
                <AppIcon name="scan" size={44} />
                <strong>Selecione ou crie uma auditoria</strong>
                <span>
                  O leitor e as divergências aparecerão nesta área.
                </span>
              </div>
            ) : (
              <>
                <div className="ativelo-audit-workspace-heading">
                  <div>
                    <span>
                      {auditStatusLabels[selectedAudit.status] ??
                        selectedAudit.status}
                    </span>
                    <h2>{selectedAudit.name}</h2>
                    <p>
                      {selectedAudit.scope_type === "unit"
                        ? unitName(selectedAudit.scope_id)
                        : "Toda a organização"}
                    </p>
                  </div>

                  <div>
                    <button
                      type="button"
                      onClick={exportAudit}
                    >
                      <AppIcon name="download" size={17} />
                      Exportar
                    </button>

                    {selectedAudit.status === "active" && (
                      <>
                        <button
                          type="button"
                          className="complete"
                          onClick={() => void completeAudit()}
                        >
                          <AppIcon name="check" size={17} />
                          Concluir
                        </button>
                        <button
                          type="button"
                          className="danger"
                          onClick={() => void cancelAudit()}
                        >
                          Cancelar
                        </button>
                      </>
                    )}
                  </div>
                </div>

                <div className="ativelo-audit-metrics">
                  <article>
                    <span>Previstos</span>
                    <strong>{auditSummary.total}</strong>
                  </article>
                  <article>
                    <span>Encontrados</span>
                    <strong>{auditSummary.found}</strong>
                  </article>
                  <article className="warning">
                    <span>Local divergente</span>
                    <strong>{auditSummary.moved}</strong>
                  </article>
                  <article className="warning">
                    <span>Condição divergente</span>
                    <strong>{auditSummary.damaged}</strong>
                  </article>
                  <article className="danger">
                    <span>Não localizados</span>
                    <strong>{auditSummary.missing}</strong>
                  </article>
                  <article>
                    <span>Não previstos</span>
                    <strong>{auditSummary.unexpected}</strong>
                  </article>
                </div>

                {selectedAudit.status === "active" && (
                  <div className="ativelo-audit-scanner">
                    <div className="ativelo-audit-video">
                      <video
                        ref={videoRef}
                        muted
                        playsInline
                        aria-label="Câmera de auditoria"
                      />
                      {!isCameraActive && (
                        <div>
                          <AppIcon name="scan" size={38} />
                          <strong>Leitor de patrimônio</strong>
                          <span>
                            Use a câmera ou informe o número abaixo.
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="ativelo-audit-scan-form">
                      <div className="two">
                        <label>
                          <span>Unidade observada</span>
                          <select
                            value={observedUnitId}
                            onChange={(event) =>
                              setObservedUnitId(event.target.value)
                            }
                          >
                            <option value="">Não definida</option>
                            {units.map((unit) => (
                              <option
                                key={unit.id}
                                value={unit.id}
                              >
                                {unit.name}
                              </option>
                            ))}
                          </select>
                        </label>

                        <label>
                          <span>Condição observada</span>
                          <select
                            value={observedCondition}
                            onChange={(event) =>
                              setObservedCondition(event.target.value)
                            }
                          >
                            {Object.entries(conditionLabels).map(
                              ([value, label]) => (
                                <option key={value} value={value}>
                                  {label}
                                </option>
                              ),
                            )}
                          </select>
                        </label>
                      </div>

                      <label>
                        <span>
                          Patrimônio, serial, Service Tag ou código
                        </span>
                        <input
                          value={manualCode}
                          onChange={(event) =>
                            setManualCode(event.target.value)
                          }
                          placeholder="Ex.: TI-0001"
                        />
                      </label>

                      <label>
                        <span>Observação da conferência</span>
                        <textarea
                          rows={3}
                          value={scanNotes}
                          onChange={(event) =>
                            setScanNotes(event.target.value)
                          }
                        />
                      </label>

                      <div className="ativelo-audit-scan-actions">
                        <button
                          type="button"
                          onClick={
                            isCameraActive
                              ? stopCamera
                              : () => void startCamera()
                          }
                        >
                          <AppIcon
                            name={
                              isCameraActive ? "close" : "camera"
                            }
                            size={18}
                          />
                          {isCameraActive
                            ? "Parar câmera"
                            : "Abrir câmera"}
                        </button>

                        <button
                          type="button"
                          className="primary"
                          disabled={
                            !manualCode.trim() || isScanning
                          }
                          onClick={() =>
                            void registerScan(manualCode)
                          }
                        >
                          <AppIcon name="check" size={18} />
                          {isScanning
                            ? "Registrando..."
                            : "Registrar conferência"}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                <div className="ativelo-audit-items-heading">
                  <div>
                    <span>RESULTADO DA CONFERÊNCIA</span>
                    <h3>Patrimônios da auditoria</h3>
                  </div>

                  <select
                    value={itemFilter}
                    onChange={(event) =>
                      setItemFilter(event.target.value)
                    }
                  >
                    <option value="">Todas as situações</option>
                    {Object.entries(itemStatusLabels).map(
                      ([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ),
                    )}
                  </select>
                </div>

                <div className="ativelo-audit-table-wrapper">
                  <table className="ativelo-audit-table">
                    <thead>
                      <tr>
                        <th>Patrimônio</th>
                        <th>Equipamento</th>
                        <th>Situação</th>
                        <th>Esperado</th>
                        <th>Observado</th>
                        <th>Condição</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredAuditItems.map((item) => (
                        <tr key={item.id}>
                          <td>
                            <strong>
                              {item.assets?.asset_number ?? "—"}
                            </strong>
                            <small>
                              {item.assets?.serial_number ??
                                "Sem serial"}
                            </small>
                          </td>
                          <td>{item.assets?.name ?? "Equipamento"}</td>
                          <td>
                            <span className={`state ${item.status}`}>
                              {itemStatusLabels[item.status] ??
                                item.status}
                            </span>
                          </td>
                          <td>{unitName(item.expected_unit_id)}</td>
                          <td>{unitName(item.observed_unit_id)}</td>
                          <td>
                            {conditionLabels[
                              item.observed_condition ?? ""
                            ] ??
                              item.observed_condition ??
                              "Não conferida"}
                          </td>
                          <td>
                            <button
                              type="button"
                              onClick={() =>
                                onOpenAsset(item.asset_id)
                              }
                            >
                              <AppIcon
                                name="chevron"
                                size={17}
                              />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>
        </section>
      )}

      {activeTab === "reports" && (
        <section className="ativelo-report-page">
          <div className="ativelo-report-summary">
            <article>
              <i>
                <AppIcon name="assets" size={23} />
              </i>
              <span>
                <small>Total de ativos</small>
                <strong>{assets.length}</strong>
              </span>
            </article>

            <article>
              <i>
                <AppIcon name="chart" size={23} />
              </i>
              <span>
                <small>Valor cadastrado</small>
                <strong>
                  {totalValue.toLocaleString("pt-BR", {
                    style: "currency",
                    currency: "BRL",
                  })}
                </strong>
              </span>
            </article>

            <article className={openTickets.length > 0 ? "warning" : ""}>
              <i>
                <AppIcon name="tickets" size={23} />
              </i>
              <span>
                <small>Chamados abertos</small>
                <strong>{openTickets.length}</strong>
              </span>
            </article>

            <article className={overduePreventive.length > 0 ? "warning" : ""}>
              <i>
                <AppIcon name="maintenance" size={23} />
              </i>
              <span>
                <small>Preventivas vencidas</small>
                <strong>{overduePreventive.length}</strong>
              </span>
            </article>

            <article className={overdueLoans.length > 0 ? "danger" : ""}>
              <i>
                <AppIcon name="loans" size={23} />
              </i>
              <span>
                <small>Empréstimos atrasados</small>
                <strong>{overdueLoans.length}</strong>
              </span>
            </article>

            <article className={warrantyAssets.length > 0 ? "warning" : ""}>
              <i>
                <AppIcon name="calendar" size={23} />
              </i>
              <span>
                <small>Garantias em 90 dias</small>
                <strong>{warrantyAssets.length}</strong>
              </span>
            </article>
          </div>

          <div className="ativelo-report-grid">
            <article className="ativelo-report-panel">
              <header>
                <div>
                  <span>DISTRIBUIÇÃO</span>
                  <h2>Ativos por status</h2>
                </div>
              </header>

              <div className="ativelo-report-bars">
                {assetsByStatus.map((item) => (
                  <div key={item.key}>
                    <span>
                      <strong>{item.label}</strong>
                      <b>{item.value}</b>
                    </span>
                    <i>
                      <u
                        style={{
                          width: `${Math.max(
                            6,
                            (item.value / maximumStatusValue) * 100,
                          )}%`,
                        }}
                      />
                    </i>
                  </div>
                ))}
              </div>
            </article>

            <article className="ativelo-report-panel">
              <header>
                <div>
                  <span>CATEGORIAS</span>
                  <h2>Composição do inventário</h2>
                </div>
              </header>

              <div className="ativelo-report-bars">
                {assetsByCategory.slice(0, 12).map((item) => (
                  <div key={item.key}>
                    <span>
                      <strong>{item.label}</strong>
                      <b>{item.value}</b>
                    </span>
                    <i>
                      <u
                        style={{
                          width: `${Math.max(
                            6,
                            (item.value / maximumCategoryValue) * 100,
                          )}%`,
                        }}
                      />
                    </i>
                  </div>
                ))}
              </div>
            </article>

            <article className="ativelo-report-panel wide">
              <header>
                <div>
                  <span>PLANEJAMENTO</span>
                  <h2>Garantias e substituições</h2>
                </div>
                <button
                  type="button"
                  onClick={exportInventory}
                >
                  <AppIcon name="download" size={17} />
                  Exportar inventário
                </button>
              </header>

              <div className="ativelo-report-risk-grid">
                <section>
                  <h3>
                    Garantias próximas
                    <b>{warrantyAssets.length}</b>
                  </h3>

                  {warrantyAssets.length === 0 ? (
                    <p>Nenhuma garantia vence nos próximos 90 dias.</p>
                  ) : (
                    warrantyAssets.slice(0, 12).map((asset) => (
                      <button
                        type="button"
                        key={asset.id}
                        onClick={() => onOpenAsset(asset.id)}
                      >
                        <span>
                          <strong>{asset.asset_number}</strong>
                          <small>{asset.name}</small>
                        </span>
                        <b>
                          {asset.warranty_end_date
                            ? new Date(
                                `${asset.warranty_end_date}T12:00:00`,
                              ).toLocaleDateString("pt-BR")
                            : "—"}
                        </b>
                      </button>
                    ))
                  )}
                </section>

                <section>
                  <h3>
                    Substituição vencida
                    <b>{replacementAssets.length}</b>
                  </h3>

                  {replacementAssets.length === 0 ? (
                    <p>Nenhum equipamento com substituição vencida.</p>
                  ) : (
                    replacementAssets.slice(0, 12).map((asset) => (
                      <button
                        type="button"
                        key={asset.id}
                        onClick={() => onOpenAsset(asset.id)}
                      >
                        <span>
                          <strong>{asset.asset_number}</strong>
                          <small>{asset.name}</small>
                        </span>
                        <b>
                          {asset.expected_replacement_date
                            ? new Date(
                                `${asset.expected_replacement_date}T12:00:00`,
                              ).toLocaleDateString("pt-BR")
                            : "—"}
                        </b>
                      </button>
                    ))
                  )}
                </section>
              </div>
            </article>
          </div>
        </section>
      )}

      {isCreateOpen && (
        <div className="ativelo-modal-backdrop">
          <section
            className="ativelo-modal ativelo-audit-modal"
            role="dialog"
            aria-modal="true"
          >
            <header>
              <div>
                <span>NOVA CAMPANHA</span>
                <h2>Criar auditoria física</h2>
              </div>
              <button
                type="button"
                onClick={() => setIsCreateOpen(false)}
              >
                <AppIcon name="close" size={21} />
              </button>
            </header>

            <form onSubmit={createAudit}>
              <label>
                <span>Nome da auditoria *</span>
                <input
                  value={auditName}
                  onChange={(event) =>
                    setAuditName(event.target.value)
                  }
                  placeholder="Ex.: Conferência anual 2026"
                />
              </label>

              <label>
                <span>Abrangência</span>
                <select
                  value={auditScope}
                  onChange={(event) =>
                    setAuditScope(
                      event.target.value as "all" | "unit",
                    )
                  }
                >
                  <option value="all">
                    Toda a organização
                  </option>
                  <option value="unit">
                    Uma unidade específica
                  </option>
                </select>
              </label>

              {auditScope === "unit" && (
                <label>
                  <span>Unidade *</span>
                  <select
                    value={auditUnitId}
                    onChange={(event) =>
                      setAuditUnitId(event.target.value)
                    }
                  >
                    <option value="">Selecione</option>
                    {units.map((unit) => (
                      <option key={unit.id} value={unit.id}>
                        {unit.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              <label>
                <span>Observações</span>
                <textarea
                  rows={4}
                  value={auditNotes}
                  onChange={(event) =>
                    setAuditNotes(event.target.value)
                  }
                />
              </label>

              <div className="ativelo-audit-modal-note">
                <AppIcon name="alert" size={19} />
                <p>
                  O Ativelo criará uma fotografia dos equipamentos atuais.
                  Mudanças posteriores não alteram a lista esperada desta
                  auditoria.
                </p>
              </div>

              <footer>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setIsCreateOpen(false)}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="primary"
                  disabled={isSaving}
                >
                  <AppIcon name="save" size={18} />
                  {isSaving
                    ? "Criando..."
                    : "Criar e iniciar"}
                </button>
              </footer>
            </form>
          </section>
        </div>
      )}
    </main>
  );
}
