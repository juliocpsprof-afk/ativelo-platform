import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import type { OrganizationContext } from "../App";
import AppIcon from "../components/AppIcon";
import { supabase } from "../lib/supabase";

export type LogisticsTab = "loans" | "transfers" | "alerts" | "integrations";

type Props = {
  organization: OrganizationContext;
  initialTab?: LogisticsTab;
  onBack: () => void;
  onOpenAsset: (assetId: string) => void;
};

type AssetOption = {
  id: string;
  asset_number: string;
  name: string;
  unit_id: string | null;
  operational_status: string;
};

type UnitOption = {
  id: string;
  name: string;
};

type LoanRecord = {
  id: string;
  asset_id: string;
  from_unit_id: string | null;
  to_unit_id: string;
  borrower_name: string;
  borrower_email: string | null;
  borrower_phone: string | null;
  checkout_at: string;
  due_at: string;
  returned_at: string | null;
  status: string;
  condition_out: string;
  condition_in: string | null;
  notes: string | null;
  created_at: string;
};

type TransferRecord = {
  id: string;
  asset_id: string;
  from_unit_id: string | null;
  to_unit_id: string;
  status: string;
  reason: string;
  notes: string | null;
  requested_at: string;
  completed_at: string | null;
};

type NotificationRecord = {
  id: string;
  channel: string;
  category: string;
  severity: string;
  title: string;
  message: string;
  entity_type: string | null;
  entity_id: string | null;
  scheduled_for: string;
  delivery_status: string;
  read_at: string | null;
  recipient_email: string | null;
  recipient_phone: string | null;
  created_at: string;
};

type SettingsRecord = {
  id: string;
  organization_id: string;
  email_enabled: boolean;
  whatsapp_enabled: boolean;
  sender_name: string | null;
  sender_email: string | null;
  default_country_code: string;
  loan_reminder_days: number[];
};

const conditionLabels: Record<string, string> = {
  new: "Novo",
  excellent: "Excelente",
  good: "Bom",
  fair: "Regular",
  poor: "Ruim",
  irrecoverable: "Irrecuperável",
};

const loanStatusLabels: Record<string, string> = {
  planned: "Planejado",
  active: "Em andamento",
  overdue: "Atrasado",
  returned: "Devolvido",
  canceled: "Cancelado",
};

const transferStatusLabels: Record<string, string> = {
  requested: "Solicitada",
  approved: "Aprovada",
  completed: "Concluída",
  canceled: "Cancelada",
};

const emptyLoanForm = {
  assetId: "",
  fromUnitId: "",
  toUnitId: "",
  borrowerName: "",
  borrowerEmail: "",
  borrowerPhone: "",
  checkoutAt: new Date().toISOString().slice(0, 16),
  dueAt: "",
  conditionOut: "good",
  notes: "",
};

const emptyTransferForm = {
  assetId: "",
  fromUnitId: "",
  toUnitId: "",
  reason: "",
  notes: "",
};

export default function LogisticsPage({
  organization,
  initialTab = "loans",
  onBack,
  onOpenAsset,
}: Props) {
  const [activeTab, setActiveTab] = useState<LogisticsTab>(initialTab);
  const [assets, setAssets] = useState<AssetOption[]>([]);
  const [units, setUnits] = useState<UnitOption[]>([]);
  const [loans, setLoans] = useState<LoanRecord[]>([]);
  const [transfers, setTransfers] = useState<TransferRecord[]>([]);
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [settings, setSettings] = useState<SettingsRecord | null>(null);

  const [loanForm, setLoanForm] = useState(emptyLoanForm);
  const [transferForm, setTransferForm] = useState(emptyTransferForm);
  const [isLoanModalOpen, setIsLoanModalOpen] = useState(false);
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setFeedback(null);

    await supabase.rpc("refresh_overdue_asset_loans", {
      target_organization_id: organization.organizationId,
    });

    const organizationId = organization.organizationId;

    const [
      assetsResult,
      unitsResult,
      loansResult,
      transfersResult,
      notificationsResult,
      settingsResult,
    ] = await Promise.all([
      supabase
        .from("assets")
        .select("id,asset_number,name,unit_id,operational_status")
        .eq("organization_id", organizationId)
        .eq("is_active", true)
        .order("asset_number"),
      supabase
        .from("organization_units")
        .select("id,name")
        .eq("organization_id", organizationId)
        .eq("is_active", true)
        .order("name"),
      supabase
        .from("asset_loans")
        .select("*")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false }),
      supabase
        .from("asset_transfers")
        .select("*")
        .eq("organization_id", organizationId)
        .order("requested_at", { ascending: false }),
      supabase
        .from("app_notifications")
        .select("*")
        .eq("organization_id", organizationId)
        .order("scheduled_for", { ascending: false })
        .limit(200),
      supabase
        .from("organization_notification_settings")
        .select("*")
        .eq("organization_id", organizationId)
        .maybeSingle(),
    ]);

    const firstError = [
      assetsResult.error,
      unitsResult.error,
      loansResult.error,
      transfersResult.error,
      notificationsResult.error,
      settingsResult.error,
    ].find(Boolean);

    if (firstError) {
      setFeedback({ type: "error", text: firstError.message });
      setIsLoading(false);
      return;
    }

    setAssets((assetsResult.data ?? []) as AssetOption[]);
    setUnits((unitsResult.data ?? []) as UnitOption[]);
    setLoans((loansResult.data ?? []) as LoanRecord[]);
    setTransfers((transfersResult.data ?? []) as TransferRecord[]);
    setNotifications(
      (notificationsResult.data ?? []) as NotificationRecord[],
    );
    setSettings((settingsResult.data as SettingsRecord | null) ?? null);
    setIsLoading(false);
  }, [organization.organizationId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const assetLabel = (assetId: string) => {
    const asset = assets.find((item) => item.id === assetId);
    return asset
      ? `${asset.asset_number} · ${asset.name}`
      : "Equipamento não encontrado";
  };

  const unitName = (unitId: string | null) =>
    units.find((item) => item.id === unitId)?.name ?? "Não definida";

  const activeLoans = useMemo(
    () =>
      loans.filter((item) =>
        ["planned", "active", "overdue"].includes(item.status),
      ),
    [loans],
  );

  const overdueLoans = useMemo(
    () => loans.filter((item) => item.status === "overdue"),
    [loans],
  );

  const unreadNotifications = useMemo(
    () =>
      notifications.filter(
        (item) => item.channel === "in_app" && !item.read_at,
      ),
    [notifications],
  );

  const pendingDeliveries = useMemo(
    () =>
      notifications.filter(
        (item) =>
          ["email", "whatsapp"].includes(item.channel) &&
          ["pending", "failed"].includes(item.delivery_status),
      ),
    [notifications],
  );

  const openLoanModal = () => {
    setLoanForm(emptyLoanForm);
    setFeedback(null);
    setIsLoanModalOpen(true);
  };

  const openTransferModal = () => {
    setTransferForm(emptyTransferForm);
    setFeedback(null);
    setIsTransferModalOpen(true);
  };

  const handleLoanAssetChange = (assetId: string) => {
    const asset = assets.find((item) => item.id === assetId);

    setLoanForm((current) => ({
      ...current,
      assetId,
      fromUnitId: asset?.unit_id ?? "",
    }));
  };

  const handleTransferAssetChange = (assetId: string) => {
    const asset = assets.find((item) => item.id === assetId);

    setTransferForm((current) => ({
      ...current,
      assetId,
      fromUnitId: asset?.unit_id ?? "",
    }));
  };

  const createLoan = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFeedback(null);

    if (
      !loanForm.assetId ||
      !loanForm.toUnitId ||
      !loanForm.borrowerName.trim() ||
      !loanForm.dueAt
    ) {
      setFeedback({
        type: "error",
        text: "Preencha equipamento, unidade de destino, responsável e devolução.",
      });
      return;
    }

    if (new Date(loanForm.dueAt) <= new Date(loanForm.checkoutAt)) {
      setFeedback({
        type: "error",
        text: "A data de devolução deve ser posterior à retirada.",
      });
      return;
    }

    setIsSaving(true);

    const { error } = await supabase.from("asset_loans").insert({
      organization_id: organization.organizationId,
      asset_id: loanForm.assetId,
      from_unit_id: loanForm.fromUnitId || null,
      to_unit_id: loanForm.toUnitId,
      borrower_name: loanForm.borrowerName.trim(),
      borrower_email: loanForm.borrowerEmail.trim() || null,
      borrower_phone: loanForm.borrowerPhone.trim() || null,
      checkout_at: new Date(loanForm.checkoutAt).toISOString(),
      due_at: new Date(loanForm.dueAt).toISOString(),
      status: "active",
      condition_out: loanForm.conditionOut,
      notes: loanForm.notes.trim() || null,
    });

    if (error) {
      setFeedback({ type: "error", text: error.message });
      setIsSaving(false);
      return;
    }

    setIsSaving(false);
    setIsLoanModalOpen(false);
    setFeedback({
      type: "success",
      text: "Empréstimo registrado e alertas programados.",
    });
    await loadData();
  };

  const returnLoan = async (loan: LoanRecord) => {
    const condition = window.prompt(
      "Condição na devolução: new, excellent, good, fair, poor ou irrecoverable",
      loan.condition_out,
    );

    if (!condition || !Object.keys(conditionLabels).includes(condition)) {
      return;
    }

    const { error } = await supabase
      .from("asset_loans")
      .update({
        status: "returned",
        returned_at: new Date().toISOString(),
        condition_in: condition,
      })
      .eq("id", loan.id)
      .eq("organization_id", organization.organizationId);

    if (error) {
      setFeedback({ type: "error", text: error.message });
      return;
    }

    setFeedback({
      type: "success",
      text: "Devolução concluída e patrimônio retornado à unidade de origem.",
    });
    await loadData();
  };

  const cancelLoan = async (loan: LoanRecord) => {
    const { error } = await supabase
      .from("asset_loans")
      .update({ status: "canceled" })
      .eq("id", loan.id)
      .eq("organization_id", organization.organizationId);

    if (error) {
      setFeedback({ type: "error", text: error.message });
      return;
    }

    setFeedback({ type: "success", text: "Empréstimo cancelado." });
    await loadData();
  };

  const createTransfer = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFeedback(null);

    if (
      !transferForm.assetId ||
      !transferForm.toUnitId ||
      !transferForm.reason.trim()
    ) {
      setFeedback({
        type: "error",
        text: "Preencha equipamento, unidade de destino e motivo.",
      });
      return;
    }

    if (transferForm.fromUnitId === transferForm.toUnitId) {
      setFeedback({
        type: "error",
        text: "A unidade de destino deve ser diferente da unidade atual.",
      });
      return;
    }

    setIsSaving(true);

    const { error } = await supabase.from("asset_transfers").insert({
      organization_id: organization.organizationId,
      asset_id: transferForm.assetId,
      from_unit_id: transferForm.fromUnitId || null,
      to_unit_id: transferForm.toUnitId,
      status: "requested",
      reason: transferForm.reason.trim(),
      notes: transferForm.notes.trim() || null,
    });

    if (error) {
      setFeedback({ type: "error", text: error.message });
      setIsSaving(false);
      return;
    }

    setIsSaving(false);
    setIsTransferModalOpen(false);
    setFeedback({
      type: "success",
      text: "Transferência solicitada com sucesso.",
    });
    await loadData();
  };

  const updateTransferStatus = async (
    transfer: TransferRecord,
    status: "approved" | "completed" | "canceled",
  ) => {
    const payload: Record<string, string | null> = { status };

    if (status === "approved") {
      payload.approved_at = new Date().toISOString();
    }

    if (status === "completed") {
      payload.completed_at = new Date().toISOString();
    }

    const { error } = await supabase
      .from("asset_transfers")
      .update(payload)
      .eq("id", transfer.id)
      .eq("organization_id", organization.organizationId);

    if (error) {
      setFeedback({ type: "error", text: error.message });
      return;
    }

    setFeedback({
      type: "success",
      text:
        status === "completed"
          ? "Transferência concluída e localização atualizada."
          : "Transferência atualizada.",
    });
    await loadData();
  };

  const markNotificationRead = async (notificationId: string) => {
    const { error } = await supabase
      .from("app_notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", notificationId)
      .eq("organization_id", organization.organizationId);

    if (error) {
      setFeedback({ type: "error", text: error.message });
      return;
    }

    setNotifications((current) =>
      current.map((item) =>
        item.id === notificationId
          ? { ...item, read_at: new Date().toISOString() }
          : item,
      ),
    );
  };

  const saveSettings = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!settings) {
      return;
    }

    const { error } = await supabase
      .from("organization_notification_settings")
      .upsert(
        {
          ...settings,
          organization_id: organization.organizationId,
        },
        { onConflict: "organization_id" },
      );

    if (error) {
      setFeedback({ type: "error", text: error.message });
      return;
    }

    setFeedback({
      type: "success",
      text: "Preferências de integração salvas.",
    });
    await loadData();
  };

  const formatDate = (value: string) =>
    new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(value));

  const dueLabel = (loan: LoanRecord) => {
    const difference =
      new Date(loan.due_at).getTime() - new Date().getTime();
    const days = Math.ceil(difference / 86400000);

    if (loan.status === "returned") return "Devolvido";
    if (days < 0) return `${Math.abs(days)} dia(s) atrasado`;
    if (days === 0) return "Vence hoje";
    return `${days} dia(s) restante(s)`;
  };

  return (
    <main className="ativelo-logistics-page">
      <header className="ativelo-logistics-header">
        <div>
          <button type="button" onClick={onBack}>
            ← Voltar ao painel
          </button>
          <p>MOVIMENTAÇÃO E ALERTAS</p>
          <h1>Empréstimos e transferências</h1>
          <span>
            Controle prazos, devoluções, unidades e comunicações relacionadas
            aos equipamentos.
          </span>
        </div>

        <div className="ativelo-logistics-header-actions">
          <button
            type="button"
            className="secondary"
            onClick={() => void loadData()}
          >
            <AppIcon name="refresh" size={18} />
            Atualizar
          </button>
          <button type="button" className="primary" onClick={openLoanModal}>
            <AppIcon name="plus" size={18} />
            Novo empréstimo
          </button>
        </div>
      </header>

      <section className="ativelo-logistics-metrics">
        <article>
          <span>Empréstimos ativos</span>
          <strong>{activeLoans.length}</strong>
        </article>
        <article className={overdueLoans.length > 0 ? "danger" : ""}>
          <span>Devoluções atrasadas</span>
          <strong>{overdueLoans.length}</strong>
        </article>
        <article>
          <span>Alertas não lidos</span>
          <strong>{unreadNotifications.length}</strong>
        </article>
        <article>
          <span>Envios pendentes</span>
          <strong>{pendingDeliveries.length}</strong>
        </article>
      </section>

      <nav className="ativelo-logistics-tabs">
        <button
          className={activeTab === "loans" ? "active" : ""}
          type="button"
          onClick={() => setActiveTab("loans")}
        >
          <AppIcon name="loans" size={19} />
          Empréstimos
          <b>{loans.length}</b>
        </button>
        <button
          className={activeTab === "transfers" ? "active" : ""}
          type="button"
          onClick={() => setActiveTab("transfers")}
        >
          <AppIcon name="transfer" size={19} />
          Transferências
          <b>{transfers.length}</b>
        </button>
        <button
          className={activeTab === "alerts" ? "active" : ""}
          type="button"
          onClick={() => setActiveTab("alerts")}
        >
          <AppIcon name="bell" size={19} />
          Alertas
          <b>{unreadNotifications.length}</b>
        </button>
        <button
          className={activeTab === "integrations" ? "active" : ""}
          type="button"
          onClick={() => setActiveTab("integrations")}
        >
          <AppIcon name="settings" size={19} />
          Integrações
        </button>
      </nav>

      {feedback && (
        <div className={`ativelo-logistics-feedback ${feedback.type}`}>
          {feedback.text}
        </div>
      )}

      {activeTab === "loans" && (
        <section className="ativelo-logistics-panel">
          <div className="ativelo-logistics-panel-heading">
            <div>
              <span>CONTROLE DE PRAZOS</span>
              <h2>Empréstimos de equipamentos</h2>
            </div>
            <button type="button" onClick={openLoanModal}>
              <AppIcon name="plus" size={17} />
              Registrar
            </button>
          </div>

          {isLoading ? (
            <div className="ativelo-logistics-empty">
              Carregando empréstimos...
            </div>
          ) : loans.length === 0 ? (
            <div className="ativelo-logistics-empty">
              <AppIcon name="loans" size={44} />
              <strong>Nenhum empréstimo registrado</strong>
              <span>
                Registre retiradas temporárias entre pessoas ou unidades.
              </span>
            </div>
          ) : (
            <div className="ativelo-logistics-cards">
              {loans.map((loan) => (
                <article
                  className={`ativelo-loan-card ${loan.status}`}
                  key={loan.id}
                >
                  <header>
                    <div>
                      <span>{loanStatusLabels[loan.status] ?? loan.status}</span>
                      <h3>{assetLabel(loan.asset_id)}</h3>
                    </div>
                    <b>{dueLabel(loan)}</b>
                  </header>

                  <div className="ativelo-loan-route">
                    <div>
                      <small>Origem</small>
                      <strong>{unitName(loan.from_unit_id)}</strong>
                    </div>
                    <AppIcon name="transfer" size={22} />
                    <div>
                      <small>Destino</small>
                      <strong>{unitName(loan.to_unit_id)}</strong>
                    </div>
                  </div>

                  <dl>
                    <div>
                      <dt>Responsável</dt>
                      <dd>{loan.borrower_name}</dd>
                    </div>
                    <div>
                      <dt>Retirada</dt>
                      <dd>{formatDate(loan.checkout_at)}</dd>
                    </div>
                    <div>
                      <dt>Devolução</dt>
                      <dd>{formatDate(loan.due_at)}</dd>
                    </div>
                    <div>
                      <dt>Condição de saída</dt>
                      <dd>
                        {conditionLabels[loan.condition_out] ??
                          loan.condition_out}
                      </dd>
                    </div>
                  </dl>

                  <footer>
                    <button
                      type="button"
                      onClick={() => onOpenAsset(loan.asset_id)}
                    >
                      Ver ativo
                    </button>

                    {["planned", "active", "overdue"].includes(
                      loan.status,
                    ) && (
                      <>
                        <button
                          type="button"
                          className="return"
                          onClick={() => void returnLoan(loan)}
                        >
                          <AppIcon name="return" size={17} />
                          Devolver
                        </button>
                        <button
                          type="button"
                          className="danger"
                          onClick={() => void cancelLoan(loan)}
                        >
                          Cancelar
                        </button>
                      </>
                    )}
                  </footer>
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      {activeTab === "transfers" && (
        <section className="ativelo-logistics-panel">
          <div className="ativelo-logistics-panel-heading">
            <div>
              <span>MUDANÇA DEFINITIVA</span>
              <h2>Transferências entre unidades</h2>
            </div>
            <button type="button" onClick={openTransferModal}>
              <AppIcon name="plus" size={17} />
              Solicitar
            </button>
          </div>

          {transfers.length === 0 ? (
            <div className="ativelo-logistics-empty">
              <AppIcon name="transfer" size={44} />
              <strong>Nenhuma transferência registrada</strong>
              <span>
                Use esta área para mudanças definitivas de unidade.
              </span>
            </div>
          ) : (
            <div className="ativelo-transfer-list">
              {transfers.map((transfer) => (
                <article key={transfer.id}>
                  <i>
                    <AppIcon name="transfer" size={22} />
                  </i>
                  <div>
                    <span>
                      {transferStatusLabels[transfer.status] ??
                        transfer.status}
                    </span>
                    <h3>{assetLabel(transfer.asset_id)}</h3>
                    <p>
                      {unitName(transfer.from_unit_id)} →{" "}
                      {unitName(transfer.to_unit_id)}
                    </p>
                    <small>{transfer.reason}</small>
                  </div>
                  <footer>
                    <button
                      type="button"
                      onClick={() => onOpenAsset(transfer.asset_id)}
                    >
                      Ver ativo
                    </button>
                    {transfer.status === "requested" && (
                      <button
                        type="button"
                        onClick={() =>
                          void updateTransferStatus(transfer, "approved")
                        }
                      >
                        Aprovar
                      </button>
                    )}
                    {transfer.status === "approved" && (
                      <button
                        type="button"
                        className="primary"
                        onClick={() =>
                          void updateTransferStatus(transfer, "completed")
                        }
                      >
                        Concluir
                      </button>
                    )}
                    {!["completed", "canceled"].includes(
                      transfer.status,
                    ) && (
                      <button
                        type="button"
                        className="danger"
                        onClick={() =>
                          void updateTransferStatus(transfer, "canceled")
                        }
                      >
                        Cancelar
                      </button>
                    )}
                  </footer>
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      {activeTab === "alerts" && (
        <section className="ativelo-logistics-panel">
          <div className="ativelo-logistics-panel-heading">
            <div>
              <span>CENTRAL DE NOTIFICAÇÕES</span>
              <h2>Alertas e fila de comunicação</h2>
            </div>
          </div>

          {notifications.length === 0 ? (
            <div className="ativelo-logistics-empty">
              <AppIcon name="bell" size={44} />
              <strong>Nenhum alerta registrado</strong>
              <span>
                Os avisos de devolução e movimentação aparecerão aqui.
              </span>
            </div>
          ) : (
            <div className="ativelo-notification-list">
              {notifications.map((notification) => (
                <article
                  className={`${notification.severity} ${
                    notification.read_at ? "read" : ""
                  }`}
                  key={notification.id}
                >
                  <i>
                    <AppIcon
                      name={
                        notification.channel === "email"
                          ? "mail"
                          : notification.channel === "whatsapp"
                            ? "phone"
                            : "bell"
                      }
                      size={21}
                    />
                  </i>
                  <div>
                    <header>
                      <span>
                        {notification.channel} · {notification.category}
                      </span>
                      <b>{notification.delivery_status}</b>
                    </header>
                    <h3>{notification.title}</h3>
                    <p>{notification.message}</p>
                    <small>
                      Programado para {formatDate(notification.scheduled_for)}
                    </small>
                  </div>
                  <footer>
                    {notification.entity_type === "asset" &&
                      notification.entity_id && (
                        <button
                          type="button"
                          onClick={() =>
                            onOpenAsset(notification.entity_id as string)
                          }
                        >
                          Ver ativo
                        </button>
                      )}

                    {notification.channel === "in_app" &&
                      !notification.read_at && (
                        <button
                          type="button"
                          onClick={() =>
                            void markNotificationRead(notification.id)
                          }
                        >
                          Marcar como lido
                        </button>
                      )}
                  </footer>
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      {activeTab === "integrations" && (
        <section className="ativelo-logistics-panel">
          <div className="ativelo-logistics-panel-heading">
            <div>
              <span>COMUNICAÇÃO EXTERNA</span>
              <h2>E-mail e WhatsApp</h2>
            </div>
          </div>

          {settings ? (
            <form
              className="ativelo-integration-form"
              onSubmit={saveSettings}
            >
              <div className="ativelo-integration-cards">
                <label>
                  <i>
                    <AppIcon name="mail" size={24} />
                  </i>
                  <span>
                    <strong>Notificações por e-mail</strong>
                    <small>
                      Cria mensagens na fila de envio para responsáveis.
                    </small>
                  </span>
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
                </label>

                <label>
                  <i>
                    <AppIcon name="phone" size={24} />
                  </i>
                  <span>
                    <strong>Notificações por WhatsApp</strong>
                    <small>
                      Cria mensagens na fila para números informados.
                    </small>
                  </span>
                  <input
                    type="checkbox"
                    checked={settings.whatsapp_enabled}
                    onChange={(event) =>
                      setSettings({
                        ...settings,
                        whatsapp_enabled: event.target.checked,
                      })
                    }
                  />
                </label>
              </div>

              <div className="ativelo-integration-grid">
                <label>
                  <span>Nome do remetente</span>
                  <input
                    value={settings.sender_name ?? ""}
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
                  <span>E-mail do remetente</span>
                  <input
                    type="email"
                    value={settings.sender_email ?? ""}
                    onChange={(event) =>
                      setSettings({
                        ...settings,
                        sender_email: event.target.value,
                      })
                    }
                    placeholder="ti@empresa.com.br"
                  />
                </label>

                <label>
                  <span>Código padrão do país</span>
                  <input
                    value={settings.default_country_code}
                    onChange={(event) =>
                      setSettings({
                        ...settings,
                        default_country_code: event.target.value,
                      })
                    }
                    placeholder="55"
                  />
                </label>
              </div>

              <div className="ativelo-integration-note">
                <AppIcon name="alert" size={20} />
                <p>
                  Esta etapa já cria e organiza a fila real de mensagens. O
                  disparo externo usa a função preparada em
                  <code> supabase/functions/dispatch-notifications </code>
                  e exige as credenciais do provedor configuradas como segredos
                  no Supabase.
                </p>
              </div>

              <button type="submit" className="primary">
                <AppIcon name="save" size={18} />
                Salvar integrações
              </button>
            </form>
          ) : (
            <div className="ativelo-logistics-empty">
              Carregando configurações...
            </div>
          )}
        </section>
      )}

      {isLoanModalOpen && (
        <div className="ativelo-modal-backdrop">
          <section
            className="ativelo-modal ativelo-logistics-modal"
            role="dialog"
            aria-modal="true"
          >
            <header>
              <div>
                <span>NOVA MOVIMENTAÇÃO TEMPORÁRIA</span>
                <h2>Registrar empréstimo</h2>
              </div>
              <button
                type="button"
                onClick={() => setIsLoanModalOpen(false)}
              >
                <AppIcon name="close" size={21} />
              </button>
            </header>

            <form onSubmit={createLoan}>
              <div className="grid two">
                <label>
                  <span>Equipamento *</span>
                  <select
                    value={loanForm.assetId}
                    onChange={(event) =>
                      handleLoanAssetChange(event.target.value)
                    }
                  >
                    <option value="">Selecione</option>
                    {assets
                      .filter((item) => item.operational_status !== "loaned")
                      .map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.asset_number} · {item.name}
                        </option>
                      ))}
                  </select>
                </label>

                <label>
                  <span>Unidade de origem</span>
                  <select
                    value={loanForm.fromUnitId}
                    onChange={(event) =>
                      setLoanForm({
                        ...loanForm,
                        fromUnitId: event.target.value,
                      })
                    }
                  >
                    <option value="">Não definida</option>
                    {units.map((unit) => (
                      <option key={unit.id} value={unit.id}>
                        {unit.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="grid two">
                <label>
                  <span>Unidade de destino *</span>
                  <select
                    value={loanForm.toUnitId}
                    onChange={(event) =>
                      setLoanForm({
                        ...loanForm,
                        toUnitId: event.target.value,
                      })
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

                <label>
                  <span>Responsável pelo empréstimo *</span>
                  <input
                    value={loanForm.borrowerName}
                    onChange={(event) =>
                      setLoanForm({
                        ...loanForm,
                        borrowerName: event.target.value,
                      })
                    }
                  />
                </label>
              </div>

              <div className="grid two">
                <label>
                  <span>E-mail</span>
                  <input
                    type="email"
                    value={loanForm.borrowerEmail}
                    onChange={(event) =>
                      setLoanForm({
                        ...loanForm,
                        borrowerEmail: event.target.value,
                      })
                    }
                  />
                </label>

                <label>
                  <span>WhatsApp</span>
                  <input
                    value={loanForm.borrowerPhone}
                    onChange={(event) =>
                      setLoanForm({
                        ...loanForm,
                        borrowerPhone: event.target.value,
                      })
                    }
                    placeholder="71999999999"
                  />
                </label>
              </div>

              <div className="grid two">
                <label>
                  <span>Retirada *</span>
                  <input
                    type="datetime-local"
                    value={loanForm.checkoutAt}
                    onChange={(event) =>
                      setLoanForm({
                        ...loanForm,
                        checkoutAt: event.target.value,
                      })
                    }
                  />
                </label>

                <label>
                  <span>Devolução prevista *</span>
                  <input
                    type="datetime-local"
                    value={loanForm.dueAt}
                    onChange={(event) =>
                      setLoanForm({
                        ...loanForm,
                        dueAt: event.target.value,
                      })
                    }
                  />
                </label>
              </div>

              <label>
                <span>Condição de saída</span>
                <select
                  value={loanForm.conditionOut}
                  onChange={(event) =>
                    setLoanForm({
                      ...loanForm,
                      conditionOut: event.target.value,
                    })
                  }
                >
                  {Object.entries(conditionLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <span>Observações</span>
                <textarea
                  rows={4}
                  value={loanForm.notes}
                  onChange={(event) =>
                    setLoanForm({
                      ...loanForm,
                      notes: event.target.value,
                    })
                  }
                />
              </label>

              <footer>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setIsLoanModalOpen(false)}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="primary"
                  disabled={isSaving}
                >
                  <AppIcon name="save" size={18} />
                  {isSaving ? "Salvando..." : "Registrar empréstimo"}
                </button>
              </footer>
            </form>
          </section>
        </div>
      )}

      {isTransferModalOpen && (
        <div className="ativelo-modal-backdrop">
          <section
            className="ativelo-modal ativelo-logistics-modal"
            role="dialog"
            aria-modal="true"
          >
            <header>
              <div>
                <span>MUDANÇA DEFINITIVA</span>
                <h2>Solicitar transferência</h2>
              </div>
              <button
                type="button"
                onClick={() => setIsTransferModalOpen(false)}
              >
                <AppIcon name="close" size={21} />
              </button>
            </header>

            <form onSubmit={createTransfer}>
              <label>
                <span>Equipamento *</span>
                <select
                  value={transferForm.assetId}
                  onChange={(event) =>
                    handleTransferAssetChange(event.target.value)
                  }
                >
                  <option value="">Selecione</option>
                  {assets.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.asset_number} · {item.name}
                    </option>
                  ))}
                </select>
              </label>

              <div className="grid two">
                <label>
                  <span>Unidade atual</span>
                  <select
                    value={transferForm.fromUnitId}
                    onChange={(event) =>
                      setTransferForm({
                        ...transferForm,
                        fromUnitId: event.target.value,
                      })
                    }
                  >
                    <option value="">Não definida</option>
                    {units.map((unit) => (
                      <option key={unit.id} value={unit.id}>
                        {unit.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  <span>Nova unidade *</span>
                  <select
                    value={transferForm.toUnitId}
                    onChange={(event) =>
                      setTransferForm({
                        ...transferForm,
                        toUnitId: event.target.value,
                      })
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
              </div>

              <label>
                <span>Motivo *</span>
                <input
                  value={transferForm.reason}
                  onChange={(event) =>
                    setTransferForm({
                      ...transferForm,
                      reason: event.target.value,
                    })
                  }
                  placeholder="Ex.: realocação definitiva do setor"
                />
              </label>

              <label>
                <span>Observações</span>
                <textarea
                  rows={4}
                  value={transferForm.notes}
                  onChange={(event) =>
                    setTransferForm({
                      ...transferForm,
                      notes: event.target.value,
                    })
                  }
                />
              </label>

              <footer>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setIsTransferModalOpen(false)}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="primary"
                  disabled={isSaving}
                >
                  <AppIcon name="send" size={18} />
                  {isSaving ? "Salvando..." : "Solicitar transferência"}
                </button>
              </footer>
            </form>
          </section>
        </div>
      )}
    </main>
  );
}
