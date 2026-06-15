import { useCallback, useEffect, useState } from "react";
import type { OrganizationContext } from "../App";
import AppIcon from "../components/AppIcon";
import OrganizationBrand from "../components/OrganizationBrand";
import { supabase } from "../lib/supabase";

type DashboardProps = {
  organization: OrganizationContext;
  onOpenSettings: () => void;
  onOpenUsers: () => void;
  onOpenAssets: () => void;
  onOpenScanner: () => void;
  onOpenSupport: (tab: "tickets" | "preventive") => void;
  onOpenLogistics: (tab: "loans" | "alerts") => void;
  onOpenNetwork: (tab: "overview" | "agents" | "discovered" | "enrollment") => void;
  onOpenCapture: () => void;
  onOpenAuditReports: (tab: "audits" | "reports") => void;
};

type DashboardCounts = {
  total: number;
  inUse: number;
  maintenance: number;
  defective: number;
  openTickets: number;
  preventiveAlerts: number;
  activeLoans: number;
  overdueLoans: number;
  unreadNotifications: number;
  onlineAgents: number;
  unlinkedDevices: number;
  activeAudits: number;
  activeUsers: number;
};

export default function Dashboard({
  organization,
  onOpenSettings,
  onOpenUsers,
  onOpenAssets,
  onOpenScanner,
  onOpenSupport,
  onOpenLogistics,
  onOpenNetwork,
  onOpenCapture,
  onOpenAuditReports,
}: DashboardProps) {
  const [counts, setCounts] = useState<DashboardCounts>({
    total: 0,
    inUse: 0,
    maintenance: 0,
    defective: 0,
    openTickets: 0,
    preventiveAlerts: 0,
    activeLoans: 0,
    overdueLoans: 0,
    unreadNotifications: 0,
    onlineAgents: 0,
    unlinkedDevices: 0,
    activeAudits: 0,
    activeUsers: 0,
  });

  const loadCounts = useCallback(async () => {
    const organizationId = organization.organizationId;

    const today = new Date().toISOString().slice(0, 10);

    const [
      total,
      inUse,
      maintenance,
      defective,
      openTickets,
      preventiveAlerts,
      activeLoans,
      overdueLoans,
      unreadNotifications,
      onlineAgents,
      unlinkedDevices,
      activeAudits,
      activeUsers,
    ] = await Promise.all([
      supabase.from("assets").select("id", { count: "exact", head: true }).eq("organization_id", organizationId),
      supabase.from("assets").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("operational_status", "in_use"),
      supabase.from("assets").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).in("operational_status", ["in_maintenance", "awaiting_part"]),
      supabase.from("assets").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("operational_status", "defective"),
      supabase.from("support_tickets").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).not("status", "in", '("resolved","closed","canceled")'),
      supabase.from("preventive_maintenance_plans").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("is_active", true).lte("next_due_date", today),
      supabase.from("asset_loans").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).in("status", ["planned", "active", "overdue"]),
      supabase.from("asset_loans").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("status", "overdue"),
      supabase.from("app_notifications").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("channel", "in_app").is("read_at", null),
      supabase.from("inventory_agents").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).gte("last_seen_at", new Date(Date.now() - 86400000).toISOString()),
      supabase.from("discovered_devices").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).is("linked_asset_id", null),
      supabase.from("inventory_audits").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("status", "active"),
      supabase.from("organization_memberships").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("is_active", true),
    ]);

    setCounts({
      total: total.count ?? 0,
      inUse: inUse.count ?? 0,
      maintenance: maintenance.count ?? 0,
      defective: defective.count ?? 0,
      openTickets: openTickets.count ?? 0,
      preventiveAlerts: preventiveAlerts.count ?? 0,
      activeLoans: activeLoans.count ?? 0,
      overdueLoans: overdueLoans.count ?? 0,
      unreadNotifications: unreadNotifications.count ?? 0,
      onlineAgents: onlineAgents.count ?? 0,
      unlinkedDevices: unlinkedDevices.count ?? 0,
      activeAudits: activeAudits.count ?? 0,
      activeUsers: activeUsers.count ?? 0,
    });
  }, [organization.organizationId]);

  useEffect(() => {
    void loadCounts();
  }, [loadCounts]);

  const metrics = [
    { label: "Total de ativos", value: counts.total, description: "Equipamentos cadastrados", tone: "blue" },
    { label: "Em uso", value: counts.inUse, description: "Ativos atualmente atribuídos", tone: "green" },
    { label: "Em manutenção", value: counts.maintenance, description: "Equipamentos indisponíveis", tone: "orange" },
    { label: "Com defeito", value: counts.defective, description: "Ativos aguardando diagnóstico", tone: "red" },
    { label: "Chamados abertos", value: counts.openTickets, description: "Solicitações aguardando atendimento", tone: "blue" },
    { label: "Preventivas vencidas", value: counts.preventiveAlerts, description: "Serviços que exigem atenção", tone: "orange" },
    { label: "Agentes online", value: counts.onlineAgents, description: "Computadores comunicando com o Ativelo", tone: "green" },
    { label: "Descobertas pendentes", value: counts.unlinkedDevices, description: "Dispositivos aguardando cadastro", tone: "blue" },
    { label: "Auditorias ativas", value: counts.activeAudits, description: "Campanhas de conferência em andamento", tone: "green" },
    { label: "Usuários ativos", value: counts.activeUsers, description: "Pessoas autorizadas na empresa", tone: "blue" },
  ];

  return (
    <div className="ativelo-dashboard">
      <aside className="ativelo-sidebar">
        <div className="ativelo-company-sidebar-brand">
          <OrganizationBrand
          organization={organization}
          logoOnly
        />

          <div className="ativelo-sidebar-app-signature">
            <span>Gestão tecnológica por</span>
            <img
              src="/assets/ativelo-logo.png"
              alt="Ativelo"
            />
          </div>
        </div>

        <nav className="ativelo-sidebar-nav" aria-label="Navegação principal">
          <button className="active" type="button"><span className="ativelo-menu-icon"><AppIcon name="dashboard" size={24}/></span><strong>Visão geral</strong></button>
          <button type="button" onClick={onOpenAssets}><span className="ativelo-menu-icon"><AppIcon name="assets" size={24}/></span><strong>Ativos</strong></button>
                    <button type="button" onClick={onOpenCapture}><span className="ativelo-menu-icon"><AppIcon name="camera" size={24}/></span><strong>Captura inteligente</strong></button>
          <button type="button" onClick={() => onOpenSupport("tickets")}><span className="ativelo-menu-icon"><AppIcon name="tickets" size={24}/></span><strong>Chamados</strong></button>
          <button type="button" onClick={() => onOpenSupport("preventive")}><span className="ativelo-menu-icon"><AppIcon name="maintenance" size={24}/></span><strong>Manutenção</strong></button>
          <button type="button" onClick={() => onOpenLogistics("loans")}><span className="ativelo-menu-icon"><AppIcon name="loans" size={24}/></span><strong>Empréstimos</strong></button>
                    <button type="button" onClick={() => onOpenAuditReports("audits")}><span className="ativelo-menu-icon"><AppIcon name="audits" size={24}/></span><strong>Auditorias</strong></button>
          <button type="button" onClick={() => onOpenNetwork("overview")}><span className="ativelo-menu-icon"><AppIcon name="network" size={24}/></span><strong>Rede</strong></button>
          <button type="button" onClick={() => onOpenAuditReports("reports")}><span className="ativelo-menu-icon"><AppIcon name="reports" size={24}/></span><strong>Relatórios</strong></button>
          <button type="button" onClick={onOpenSettings}><span className="ativelo-menu-icon"><AppIcon name="settings" size={24}/></span><strong>Configurações</strong></button>
          {["owner", "admin"].includes(organization.role) && (
            <button type="button" onClick={onOpenUsers}><span className="ativelo-menu-icon"><AppIcon name="user" size={24}/></span><strong>Usuários e acessos</strong></button>
          )}
        </nav>

        <div className="ativelo-sidebar-footer">
          <div className="ativelo-user-avatar">
            {organization.role === "owner" ? "PR" : organization.role === "admin" ? "AD" : "TI"}
          </div>
          <div>
            <strong>
              {organization.role === "owner"
                ? "Proprietário"
                : organization.role === "admin"
                  ? "Administrador"
                  : organization.role === "it_manager"
                    ? "Gestor de TI"
                    : organization.role === "technician"
                      ? "Técnico"
                      : "Auditor"}
            </strong>
            <span>{organization.organizationName}</span>
          </div>
        </div>
      </aside>

      <main className="ativelo-dashboard-main">
        <header className="ativelo-dashboard-topbar">
          <div className="ativelo-page-heading">
            <OrganizationBrand
              organization={organization}
              compact
            />
            <div><p>PAINEL ADMINISTRATIVO</p><h1>Visão geral</h1></div>
          </div>

          <div className="ativelo-dashboard-actions">
            <button className="ativelo-topbar-secondary" type="button" onClick={onOpenCapture}><AppIcon name="camera" size={19}/>Captura</button>
                        <button className="ativelo-topbar-secondary" type="button" onClick={onOpenSettings}><AppIcon name="settings" size={19}/>Configurações</button>
            {["owner", "admin"].includes(organization.role) && (
              <button className="ativelo-topbar-secondary" type="button" onClick={onOpenUsers}><AppIcon name="user" size={19}/>Usuários</button>
            )}
            <button className="ativelo-topbar-icon" type="button" aria-label="Notificações" onClick={() => onOpenLogistics("alerts")}><AppIcon name="bell" size={21}/>{counts.unreadNotifications > 0 && <i/>}</button>
            <button className="ativelo-topbar-primary" type="button" onClick={onOpenAssets}><AppIcon name="plus" size={19}/>Cadastrar ativo</button>
          </div>
        </header>

        <section className="ativelo-hero">
          <div>
            <span className="ativelo-hero-badge">GESTÃO INTELIGENTE DE TI</span>
            <h2>Controle todo o ciclo de vida dos seus equipamentos.</h2>
            <p>Inventário, chamados, manutenção, auditoria e diagnóstico reunidos em uma única plataforma.</p>
            <div className="ativelo-hero-actions">
              <button type="button" onClick={onOpenAssets}>Cadastrar primeiro ativo<AppIcon name="chevron" size={18}/></button>
              <button type="button" onClick={onOpenScanner}><AppIcon name="scan" size={19}/>Escanear QR Code</button>
            </div>
          </div>
          <div className="ativelo-hero-visual" aria-hidden="true">
            <div className="ativelo-orbit large"/><div className="ativelo-orbit small"/>
            <div className="ativelo-device"><AppIcon name="assets" size={54} strokeWidth={1.5}/></div>
            <span className="ativelo-chip chip-one">QR</span><span className="ativelo-chip chip-two">TI</span><span className="ativelo-chip chip-three">✓</span>
          </div>
        </section>

        <section className="ativelo-metrics">
          {metrics.map((metric) => (
            <article className={`ativelo-metric-card ${metric.tone}`} key={metric.label}>
              <div><span>{metric.label}</span><i/></div>
              <strong>{metric.value}</strong><p>{metric.description}</p>
            </article>
          ))}
        </section>

        <section className="ativelo-dashboard-grid">
          <article className="ativelo-panel">
            <div className="ativelo-panel-heading"><div><span>ATALHOS</span><h3>Ações rápidas</h3></div></div>
            <div className="ativelo-quick-grid">
              <button type="button" onClick={onOpenAssets}><i><AppIcon name="plus" size={23}/></i><span><strong>Cadastrar ativo</strong><small>Adicione um equipamento ao inventário.</small></span><b><AppIcon name="chevron" size={18}/></b></button>
              <button type="button" onClick={onOpenCapture}><i><AppIcon name="tag" size={23}/></i><span><strong>Ler etiqueta</strong><small>Fotografe a etiqueta original do fabricante.</small></span><b><AppIcon name="chevron" size={18}/></b></button>
              <button type="button" onClick={onOpenSettings}><i><AppIcon name="settings" size={23}/></i><span><strong>Configurar empresa</strong><small>Centralize marca, catálogos e localizações.</small></span><b><AppIcon name="chevron" size={18}/></b></button>
              {["owner", "admin"].includes(organization.role) && (
                <button type="button" onClick={onOpenUsers}><i><AppIcon name="user" size={23}/></i><span><strong>Gerenciar usuários</strong><small>Convide pessoas e defina permissões.</small></span><b><AppIcon name="chevron" size={18}/></b></button>
              )}
              <button type="button" onClick={() => onOpenNetwork("discovered")}><i><AppIcon name="network" size={23}/></i><span><strong>Descoberta de rede</strong><small>Veja dispositivos encontrados automaticamente.</small></span><b><AppIcon name="chevron" size={18}/></b></button>
              <button type="button" onClick={onOpenScanner}><i><AppIcon name="scan" size={23}/></i><span><strong>Escanear QR Code</strong><small>Identifique rapidamente um patrimônio.</small></span><b><AppIcon name="chevron" size={18}/></b></button>
              <button type="button" onClick={() => onOpenSupport("tickets")}><i><AppIcon name="tickets" size={23}/></i><span><strong>Abrir chamado</strong><small>Registre uma solicitação de suporte.</small></span><b><AppIcon name="chevron" size={18}/></b></button>
            </div>
          </article>

          <article className="ativelo-panel">
            <div className="ativelo-panel-heading"><div><span>OPERAÇÃO</span><h3>Suporte e manutenção</h3></div><button type="button" onClick={() => onOpenSupport("tickets")}>Abrir central</button></div>
            <div className="ativelo-status-list">
              <div><i className={counts.openTickets > 0 ? "pending" : "online"}/><span><strong>{counts.openTickets} chamados abertos</strong><small>Solicitações em triagem ou atendimento</small></span><b>Suporte</b></div>
              <div><i className={counts.preventiveAlerts > 0 ? "danger" : "online"}/><span><strong>{counts.preventiveAlerts} preventivas vencidas</strong><small>Serviços que precisam ser executados</small></span><b>Agenda</b></div>
              <div><i className={counts.defective > 0 ? "danger" : "online"}/><span><strong>{counts.defective} ativos com defeito</strong><small>Aguardando avaliação técnica</small></span><b>Diagnóstico</b></div>
              <div><i className={counts.overdueLoans > 0 ? "danger" : counts.activeLoans > 0 ? "pending" : "online"}/><span><strong>{counts.activeLoans} empréstimos ativos</strong><small>{counts.overdueLoans} devoluções atrasadas</small></span><b>Empréstimos</b></div>
              <div><i className={counts.unlinkedDevices > 0 ? "pending" : "online"}/><span><strong>{counts.onlineAgents} agentes online</strong><small>{counts.unlinkedDevices} dispositivos aguardando cadastro</small></span><b>Rede</b></div>
            </div>
          </article>
        </section>
      </main>

      <nav className="ativelo-mobile-nav">
        <button className="active" type="button"><AppIcon name="dashboard" size={21}/><small>Início</small></button>
        <button type="button" onClick={onOpenAssets}><AppIcon name="assets" size={21}/><small>Ativos</small></button>
        <button className="scan" type="button" aria-label="Escanear QR Code" onClick={onOpenScanner}><AppIcon name="scan" size={24}/></button>
        <button type="button" onClick={() => onOpenSupport("tickets")}><AppIcon name="tickets" size={21}/><small>Chamados</small></button>
        <button type="button" onClick={() => onOpenNetwork("overview")}><AppIcon name="network" size={21}/><small>Rede</small></button>
      </nav>
    </div>
  );
}
