type DashboardProps = {
  organizationName: string;
  onOpenLocations: () => void;
  onOpenCatalog: () => void;
};

const metrics = [
  {
    label: "Total de ativos",
    value: "0",
    description: "Equipamentos cadastrados",
    tone: "blue",
  },
  {
    label: "Em uso",
    value: "0",
    description: "Ativos atualmente atribuídos",
    tone: "green",
  },
  {
    label: "Em manutenção",
    value: "0",
    description: "Equipamentos indisponíveis",
    tone: "orange",
  },
  {
    label: "Chamados abertos",
    value: "0",
    description: "Solicitações aguardando atendimento",
    tone: "red",
  },
];

const quickActions = [
  {
    title: "Cadastrar ativo",
    description: "Adicione um equipamento ao inventário.",
    icon: "+",
  },
  {
    title: "Ler etiqueta",
    description: "Fotografe a etiqueta original do fabricante.",
    icon: "⌗",
  },
  {
    title: "Escanear QR Code",
    description: "Identifique rapidamente um patrimônio.",
    icon: "▦",
  },
  {
    title: "Abrir chamado",
    description: "Registre uma solicitação de suporte.",
    icon: "!",
  },
];

export default function Dashboard({
  organizationName,
  onOpenLocations,
  onOpenCatalog,
}: DashboardProps) {
  return (
    <div className="ativelo-dashboard">
      <aside className="ativelo-sidebar">
        <div className="ativelo-brand">
          <div className="ativelo-brand-mark">A</div>
          <div>
            <strong>Ativelo</strong>
            <span>Do patrimônio ao diagnóstico.</span>
          </div>
        </div>

        <nav className="ativelo-sidebar-nav">
          <button className="active" type="button">
            <span>⌂</span>
            Visão geral
          </button>
          <button type="button">
            <span>▣</span>
            Ativos
          </button>
          <button type="button" onClick={onOpenCatalog}>
            <span>◇</span>
            Catálogos
          </button>
          <button type="button">
            <span>◫</span>
            Chamados
          </button>
          <button type="button">
            <span>⚙</span>
            Manutenção
          </button>
          <button type="button">
            <span>↔</span>
            Empréstimos
          </button>
          <button type="button" onClick={onOpenLocations}>
            <span>⌖</span>
            Localizações
          </button>
          <button type="button">
            <span>✓</span>
            Auditorias
          </button>
          <button type="button">
            <span>⌁</span>
            Rede
          </button>
          <button type="button">
            <span>▥</span>
            Relatórios
          </button>
        </nav>

        <div className="ativelo-sidebar-footer">
          <div className="ativelo-user-avatar">AD</div>
          <div>
            <strong>Administrador</strong>
            <span>{organizationName}</span>
          </div>
        </div>
      </aside>

      <main className="ativelo-dashboard-main">
        <header className="ativelo-dashboard-topbar">
          <div>
            <p>PAINEL ADMINISTRATIVO</p>
            <h1>Visão geral</h1>
          </div>

          <div className="ativelo-dashboard-actions">
            <button
              className="ativelo-topbar-secondary"
              type="button"
              onClick={onOpenCatalog}
            >
              <span>◇</span>
              Catálogos
            </button>

            <button
              className="ativelo-topbar-secondary"
              type="button"
              onClick={onOpenLocations}
            >
              <span>⌖</span>
              Localizações
            </button>

            <button
              className="ativelo-topbar-icon"
              type="button"
              aria-label="Notificações"
            >
              ♢
              <i />
            </button>

            <button className="ativelo-topbar-primary" type="button">
              <span>+</span>
              Cadastrar ativo
            </button>
          </div>
        </header>

        <section className="ativelo-hero">
          <div>
            <span className="ativelo-hero-badge">GESTÃO INTELIGENTE DE TI</span>
            <h2>Controle todo o ciclo de vida dos seus equipamentos.</h2>
            <p>
              Inventário, chamados, manutenção, auditoria e diagnóstico reunidos
              em uma única plataforma.
            </p>
            <div className="ativelo-hero-actions">
              <button type="button">Cadastrar primeiro ativo</button>
              <button type="button">Escanear QR Code</button>
            </div>
          </div>

          <div className="ativelo-hero-visual" aria-hidden="true">
            <div className="ativelo-orbit large" />
            <div className="ativelo-orbit small" />
            <div className="ativelo-device">A</div>
            <span className="ativelo-chip chip-one">QR</span>
            <span className="ativelo-chip chip-two">TI</span>
            <span className="ativelo-chip chip-three">✓</span>
          </div>
        </section>

        <section className="ativelo-metrics">
          {metrics.map((metric) => (
            <article
              className={`ativelo-metric-card ${metric.tone}`}
              key={metric.label}
            >
              <div>
                <span>{metric.label}</span>
                <i />
              </div>
              <strong>{metric.value}</strong>
              <p>{metric.description}</p>
            </article>
          ))}
        </section>

        <section className="ativelo-dashboard-grid">
          <article className="ativelo-panel">
            <div className="ativelo-panel-heading">
              <div>
                <span>ATALHOS</span>
                <h3>Ações rápidas</h3>
              </div>
            </div>

            <div className="ativelo-quick-grid">
              {quickActions.map((action) => (
                <button type="button" key={action.title}>
                  <i>{action.icon}</i>
                  <span>
                    <strong>{action.title}</strong>
                    <small>{action.description}</small>
                  </span>
                  <b>›</b>
                </button>
              ))}
            </div>
          </article>

          <article className="ativelo-panel">
            <div className="ativelo-panel-heading">
              <div>
                <span>PREVENTIVAS</span>
                <h3>Próximas manutenções</h3>
              </div>
              <button type="button">Ver agenda</button>
            </div>

            <div className="ativelo-empty">
              <i>⚙</i>
              <strong>Nenhuma manutenção programada</strong>
              <p>
                Os próximos serviços preventivos aparecerão automaticamente
                aqui.
              </p>
              <button type="button">Criar plano preventivo</button>
            </div>
          </article>

          <article className="ativelo-panel">
            <div className="ativelo-panel-heading">
              <div>
                <span>HISTÓRICO</span>
                <h3>Atividades recentes</h3>
              </div>
              <button type="button">Ver histórico</button>
            </div>

            <div className="ativelo-empty">
              <i>◷</i>
              <strong>Nenhuma atividade registrada</strong>
              <p>
                Cadastros, movimentações, chamados e manutenções aparecerão
                nesta linha do tempo.
              </p>
            </div>
          </article>

          <article className="ativelo-panel">
            <div className="ativelo-panel-heading">
              <div>
                <span>AMBIENTE</span>
                <h3>Status do sistema</h3>
              </div>
            </div>

            <div className="ativelo-status-list">
              <div>
                <i className="online" />
                <span>
                  <strong>Aplicação web</strong>
                  <small>Funcionando normalmente</small>
                </span>
                <b>Online</b>
              </div>
              <div>
                <i className="online" />
                <span>
                  <strong>Banco de dados</strong>
                  <small>Conectado ao Supabase</small>
                </span>
                <b>Online</b>
              </div>
              <div>
                <i className="pending" />
                <span>
                  <strong>Coletor de rede</strong>
                  <small>Ainda não instalado</small>
                </span>
                <b>Pendente</b>
              </div>
            </div>
          </article>
        </section>
      </main>

      <nav className="ativelo-mobile-nav">
        <button className="active" type="button">
          <span>⌂</span>
          <small>Início</small>
        </button>
        <button type="button">
          <span>▣</span>
          <small>Ativos</small>
        </button>
        <button className="scan" type="button">
          ▦
        </button>
        <button type="button" onClick={onOpenCatalog}>
          <span>◇</span>
          <small>Catálogos</small>
        </button>
        <button type="button" onClick={onOpenLocations}>
          <span>⌖</span>
          <small>Locais</small>
        </button>
      </nav>
    </div>
  );
}
