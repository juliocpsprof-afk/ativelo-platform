import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import type { OrganizationContext } from "../App";
import AppIcon from "../components/AppIcon";
import { supabase } from "../lib/supabase";

export type NetworkTab = "overview" | "agents" | "discovered" | "enrollment";

type Props = {
  organization: OrganizationContext;
  initialTab?: NetworkTab;
  onBack: () => void;
  onOpenAsset: (assetId: string) => void;
};

type AgentRecord = {
  id: string;
  asset_id: string | null;
  device_uid: string;
  hostname: string;
  agent_version: string | null;
  os_name: string | null;
  os_version: string | null;
  architecture: string | null;
  manufacturer: string | null;
  model: string | null;
  serial_number: string | null;
  last_ip: string | null;
  status: string;
  first_seen_at: string;
  last_seen_at: string;
};

type SnapshotRecord = {
  id: string;
  collected_at: string;
  hardware: Record<string, unknown>;
  software: Record<string, unknown>;
  network: Record<string, unknown>;
};

type DiscoveredDevice = {
  id: string;
  linked_asset_id: string | null;
  fingerprint: string;
  ip_address: string | null;
  mac_address: string | null;
  hostname: string | null;
  vendor: string | null;
  device_type: string | null;
  open_ports: number[];
  source: string;
  first_seen_at: string;
  last_seen_at: string;
};

type ScanRecord = {
  id: string;
  scanner_device_id: string | null;
  subnet: string | null;
  status: string;
  discovered_count: number;
  started_at: string;
  completed_at: string | null;
};

type TokenRecord = {
  id: string;
  label: string;
  expires_at: string;
  max_uses: number;
  used_count: number;
  is_active: boolean;
  created_at: string;
};

type AssetOption = {
  id: string;
  asset_number: string;
  name: string;
};

type CategoryOption = {
  id: string;
  name: string;
};

type GeneratedToken = {
  id: string;
  token: string;
  expires_at: string;
};

const projectUrl = import.meta.env.VITE_SUPABASE_URL ?? "";

const formatDate = (value: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));

const isOnline = (lastSeen: string) =>
  Date.now() - new Date(lastSeen).getTime() < 24 * 60 * 60 * 1000;

export default function NetworkInventoryPage({
  organization,
  initialTab = "overview",
  onBack,
  onOpenAsset,
}: Props) {
  const [activeTab, setActiveTab] = useState<NetworkTab>(initialTab);
  const [agents, setAgents] = useState<AgentRecord[]>([]);
  const [devices, setDevices] = useState<DiscoveredDevice[]>([]);
  const [scans, setScans] = useState<ScanRecord[]>([]);
  const [tokens, setTokens] = useState<TokenRecord[]>([]);
  const [assets, setAssets] = useState<AssetOption[]>([]);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [agentLinks, setAgentLinks] = useState<Record<string, string>>({});
  const [selectedAgent, setSelectedAgent] = useState<AgentRecord | null>(null);
  const [latestSnapshot, setLatestSnapshot] = useState<SnapshotRecord | null>(
    null,
  );
  const [selectedDevice, setSelectedDevice] =
    useState<DiscoveredDevice | null>(null);
  const [assetDraft, setAssetDraft] = useState({
    assetNumber: "",
    name: "",
    categoryId: "",
  });
  const [tokenLabel, setTokenLabel] = useState("Agentes da empresa");
  const [tokenDays, setTokenDays] = useState("30");
  const [tokenMaxUses, setTokenMaxUses] = useState("100");
  const [subnetPrefix, setSubnetPrefix] = useState("192.168.0");
  const [generatedToken, setGeneratedToken] =
    useState<GeneratedToken | null>(null);
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
    const organizationId = organization.organizationId;

    const [
      agentsResult,
      devicesResult,
      scansResult,
      tokensResult,
      assetsResult,
      categoriesResult,
    ] = await Promise.all([
      supabase
        .from("inventory_agents")
        .select("*")
        .eq("organization_id", organizationId)
        .order("last_seen_at", { ascending: false }),
      supabase
        .from("discovered_devices")
        .select("*")
        .eq("organization_id", organizationId)
        .order("last_seen_at", { ascending: false }),
      supabase
        .from("network_scans")
        .select(
          "id,scanner_device_id,subnet,status,discovered_count,started_at,completed_at",
        )
        .eq("organization_id", organizationId)
        .order("started_at", { ascending: false })
        .limit(30),
      supabase
        .from("agent_enrollment_tokens")
        .select(
          "id,label,expires_at,max_uses,used_count,is_active,created_at",
        )
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false }),
      supabase
        .from("assets")
        .select("id,asset_number,name")
        .eq("organization_id", organizationId)
        .eq("is_active", true)
        .order("asset_number"),
      supabase
        .from("asset_categories")
        .select("id,name")
        .eq("organization_id", organizationId)
        .eq("is_active", true)
        .order("name"),
    ]);

    const firstError = [
      agentsResult.error,
      devicesResult.error,
      scansResult.error,
      tokensResult.error,
      assetsResult.error,
      categoriesResult.error,
    ].find(Boolean);

    if (firstError) {
      setFeedback({ type: "error", text: firstError.message });
      setIsLoading(false);
      return;
    }

    const loadedAgents = (agentsResult.data ?? []) as AgentRecord[];

    setAgents(loadedAgents);
    setDevices((devicesResult.data ?? []) as DiscoveredDevice[]);
    setScans((scansResult.data ?? []) as ScanRecord[]);
    setTokens((tokensResult.data ?? []) as TokenRecord[]);
    setAssets((assetsResult.data ?? []) as AssetOption[]);
    setCategories((categoriesResult.data ?? []) as CategoryOption[]);
    setAgentLinks(
      Object.fromEntries(
        loadedAgents.map((agent) => [agent.id, agent.asset_id ?? ""]),
      ),
    );
    setIsLoading(false);
  }, [organization.organizationId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const onlineAgents = useMemo(
    () => agents.filter((agent) => isOnline(agent.last_seen_at)),
    [agents],
  );

  const unlinkedAgents = useMemo(
    () => agents.filter((agent) => !agent.asset_id),
    [agents],
  );

  const unlinkedDevices = useMemo(
    () => devices.filter((device) => !device.linked_asset_id),
    [devices],
  );

  const lastScan = scans[0] ?? null;

  const copyText = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setFeedback({
      type: "success",
      text: "Comando copiado para a área de transferência.",
    });
  };

  const createToken = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFeedback(null);
    setIsSaving(true);

    const { data, error } = await supabase.rpc(
      "create_agent_enrollment_token",
      {
        target_organization_id: organization.organizationId,
        token_label: tokenLabel.trim() || "Agentes",
        valid_days: Number.parseInt(tokenDays || "30", 10),
        max_token_uses: Number.parseInt(tokenMaxUses || "100", 10),
      },
    );

    if (error) {
      setFeedback({ type: "error", text: error.message });
      setIsSaving(false);
      return;
    }

    const result = data as GeneratedToken;
    setGeneratedToken(result);
    setFeedback({
      type: "success",
      text: "Token criado. Ele será exibido apenas nesta sessão.",
    });
    setIsSaving(false);
    await loadData();
  };

  const revokeToken = async (tokenId: string) => {
    const { error } = await supabase
      .from("agent_enrollment_tokens")
      .update({ is_active: false })
      .eq("id", tokenId)
      .eq("organization_id", organization.organizationId);

    if (error) {
      setFeedback({ type: "error", text: error.message });
      return;
    }

    setFeedback({ type: "success", text: "Token revogado." });
    await loadData();
  };

  const linkAgent = async (agentId: string) => {
    const assetId = agentLinks[agentId] || null;

    const { error } = await supabase
      .from("inventory_agents")
      .update({ asset_id: assetId })
      .eq("id", agentId)
      .eq("organization_id", organization.organizationId);

    if (error) {
      setFeedback({ type: "error", text: error.message });
      return;
    }

    setFeedback({
      type: "success",
      text: assetId
        ? "Agente vinculado ao patrimônio."
        : "Vínculo do agente removido.",
    });
    await loadData();
  };

  const openAgentDetails = async (agent: AgentRecord) => {
    setSelectedAgent(agent);
    setLatestSnapshot(null);

    const { data, error } = await supabase
      .from("agent_inventory_snapshots")
      .select("id,collected_at,hardware,software,network")
      .eq("agent_id", agent.id)
      .order("collected_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      setFeedback({ type: "error", text: error.message });
      return;
    }

    setLatestSnapshot((data as SnapshotRecord | null) ?? null);
  };

  const openDeviceDraft = (device: DiscoveredDevice) => {
    setSelectedDevice(device);
    setAssetDraft({
      assetNumber: "",
      name:
        device.hostname ||
        `${device.device_type || "Equipamento"} ${device.ip_address || ""}`.trim(),
      categoryId: "",
    });
  };

  const createAssetFromDevice = async (
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();

    if (
      !selectedDevice ||
      !assetDraft.assetNumber.trim() ||
      !assetDraft.name.trim() ||
      !assetDraft.categoryId
    ) {
      setFeedback({
        type: "error",
        text: "Preencha patrimônio, nome e categoria.",
      });
      return;
    }

    setIsSaving(true);

    const { data, error } = await supabase
      .from("assets")
      .insert({
        organization_id: organization.organizationId,
        asset_number: assetDraft.assetNumber.trim(),
        name: assetDraft.name.trim(),
        category_id: assetDraft.categoryId,
        source: "network_discovery",
        operational_status: "available",
        lifecycle_stage: "received",
        physical_condition: "good",
        hostname: selectedDevice.hostname,
        ip_address: selectedDevice.ip_address,
        mac_address: selectedDevice.mac_address,
        notes: `Pré-cadastro criado pela descoberta de rede. Origem: ${selectedDevice.source}.`,
      })
      .select("id")
      .single();

    if (error) {
      setFeedback({ type: "error", text: error.message });
      setIsSaving(false);
      return;
    }

    const { error: linkError } = await supabase
      .from("discovered_devices")
      .update({ linked_asset_id: data.id })
      .eq("id", selectedDevice.id)
      .eq("organization_id", organization.organizationId);

    if (linkError) {
      setFeedback({ type: "error", text: linkError.message });
      setIsSaving(false);
      return;
    }

    setIsSaving(false);
    setSelectedDevice(null);
    setFeedback({
      type: "success",
      text: "Equipamento pré-cadastrado e vinculado à descoberta.",
    });
    await loadData();
  };

  const bootstrapUrl =
    `${projectUrl.replace(/\/$/, "")}/functions/v1/agent-bootstrap`;

  const agentInstallCommand = generatedToken
    ? `$h=@{'x-ativelo-token'='${generatedToken.token}'};$s=Invoke-RestMethod -Method Post -Uri '${bootstrapUrl}' -Headers $h -ContentType 'application/json' -Body '{"action":"install"}';& ([scriptblock]::Create([string]$s))`
    : "";

  const scannerCommand = generatedToken
    ? `$h=@{'x-ativelo-token'='${generatedToken.token}'};$s=Invoke-RestMethod -Method Post -Uri '${bootstrapUrl}' -Headers $h -ContentType 'application/json' -Body '{"action":"scanner","subnet":"${subnetPrefix}"}';& ([scriptblock]::Create([string]$s))`
    : "";

  const agentStatusCommand =
    `powershell -NoProfile -ExecutionPolicy Bypass -File "$env:ProgramData\\AtiveloAgent\\AtiveloAgent.ps1" -Action Status`;

  const agentUpdateCommand =
    `powershell -NoProfile -ExecutionPolicy Bypass -File "$env:ProgramData\\AtiveloAgent\\AtiveloAgent.ps1" -Action Update`;

  const agentUninstallCommand =
    `powershell -NoProfile -ExecutionPolicy Bypass -File "$env:ProgramData\\AtiveloAgent\\AtiveloAgent.ps1" -Action Uninstall`;

  return (
    <main className="ativelo-network-page">
      <header className="ativelo-network-header">
        <div>
          <button type="button" onClick={onBack}>
            ← Voltar ao painel
          </button>
          <p>DESCOBERTA E INVENTÁRIO AUTOMÁTICO</p>
          <h1>Rede e agentes</h1>
          <span>
            Descubra dispositivos, receba inventário dos computadores e
            transforme dados técnicos em patrimônios organizados.
          </span>
        </div>

        <div className="ativelo-network-header-actions">
          <button
            type="button"
            className="secondary"
            onClick={() => void loadData()}
          >
            <AppIcon name="refresh" size={18} />
            Atualizar
          </button>
          <button
            type="button"
            className="primary"
            onClick={() => setActiveTab("enrollment")}
          >
            <AppIcon name="key" size={18} />
            Instalar agente
          </button>
        </div>
      </header>

      <section className="ativelo-network-metrics">
        <article>
          <span>Agentes instalados</span>
          <strong>{agents.length}</strong>
        </article>
        <article>
          <span>Agentes online</span>
          <strong>{onlineAgents.length}</strong>
        </article>
        <article className={unlinkedDevices.length > 0 ? "warning" : ""}>
          <span>Descobertas sem cadastro</span>
          <strong>{unlinkedDevices.length}</strong>
        </article>
        <article className={unlinkedAgents.length > 0 ? "warning" : ""}>
          <span>Agentes sem patrimônio</span>
          <strong>{unlinkedAgents.length}</strong>
        </article>
      </section>

      <nav className="ativelo-network-tabs">
        <button
          className={activeTab === "overview" ? "active" : ""}
          type="button"
          onClick={() => setActiveTab("overview")}
        >
          <AppIcon name="dashboard" size={19} />
          Visão geral
        </button>
        <button
          className={activeTab === "agents" ? "active" : ""}
          type="button"
          onClick={() => setActiveTab("agents")}
        >
          <AppIcon name="cpu" size={19} />
          Agentes
          <b>{agents.length}</b>
        </button>
        <button
          className={activeTab === "discovered" ? "active" : ""}
          type="button"
          onClick={() => setActiveTab("discovered")}
        >
          <AppIcon name="wifi" size={19} />
          Descobertos
          <b>{devices.length}</b>
        </button>
        <button
          className={activeTab === "enrollment" ? "active" : ""}
          type="button"
          onClick={() => setActiveTab("enrollment")}
        >
          <AppIcon name="key" size={19} />
          Instalação
        </button>
      </nav>

      {feedback && (
        <div className={`ativelo-network-feedback ${feedback.type}`}>
          {feedback.text}
        </div>
      )}

      {activeTab === "overview" && (
        <section className="ativelo-network-overview">
          <article className="ativelo-network-panel">
            <div className="ativelo-network-panel-heading">
              <div>
                <span>ÚLTIMA VARREDURA</span>
                <h2>Descoberta da rede</h2>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab("enrollment")}
              >
                Abrir instaladores
              </button>
            </div>

            {lastScan ? (
              <div className="ativelo-last-scan">
                <i>
                  <AppIcon name="network" size={30} />
                </i>
                <div>
                  <strong>
                    {lastScan.subnet || "Sub-rede não informada"}
                  </strong>
                  <span>
                    {lastScan.discovered_count} dispositivo(s) encontrados
                  </span>
                  <small>
                    Iniciada em {formatDate(lastScan.started_at)}
                  </small>
                </div>
                <b>{lastScan.status}</b>
              </div>
            ) : (
              <div className="ativelo-network-empty">
                <AppIcon name="network" size={42} />
                <strong>Nenhuma varredura recebida</strong>
                <span>
                  Execute o scanner em um computador conectado à rede.
                </span>
              </div>
            )}
          </article>

          <article className="ativelo-network-panel">
            <div className="ativelo-network-panel-heading">
              <div>
                <span>SAÚDE DOS AGENTES</span>
                <h2>Computadores monitorados</h2>
              </div>
              <button type="button" onClick={() => setActiveTab("agents")}>
                Ver agentes
              </button>
            </div>

            <div className="ativelo-network-health">
              <div>
                <i className="online" />
                <span>
                  <strong>{onlineAgents.length} online</strong>
                  <small>Enviaram dados nas últimas 24 horas</small>
                </span>
              </div>
              <div>
                <i className="offline" />
                <span>
                  <strong>{agents.length - onlineAgents.length} offline</strong>
                  <small>Sem comunicação recente</small>
                </span>
              </div>
              <div>
                <i className="pending" />
                <span>
                  <strong>{unlinkedAgents.length} sem vínculo</strong>
                  <small>Precisam ser associados a um patrimônio</small>
                </span>
              </div>
            </div>
          </article>

          <article className="ativelo-network-panel wide">
            <div className="ativelo-network-panel-heading">
              <div>
                <span>DESCOBERTAS RECENTES</span>
                <h2>Equipamentos encontrados</h2>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab("discovered")}
              >
                Ver todos
              </button>
            </div>

            {devices.length === 0 ? (
              <div className="ativelo-network-empty compact">
                Nenhum equipamento descoberto.
              </div>
            ) : (
              <div className="ativelo-network-preview-list">
                {devices.slice(0, 6).map((device) => (
                  <div key={device.id}>
                    <i>
                      <AppIcon
                        name={
                          device.device_type === "server"
                            ? "server"
                            : "wifi"
                        }
                        size={21}
                      />
                    </i>
                    <span>
                      <strong>
                        {device.hostname ||
                          device.ip_address ||
                          "Dispositivo"}
                      </strong>
                      <small>
                        {device.mac_address || "MAC não identificado"}
                      </small>
                    </span>
                    <b>
                      {device.linked_asset_id ? "Vinculado" : "Novo"}
                    </b>
                  </div>
                ))}
              </div>
            )}
          </article>
        </section>
      )}

      {activeTab === "agents" && (
        <section className="ativelo-network-panel">
          <div className="ativelo-network-panel-heading">
            <div>
              <span>INVENTÁRIO POR AGENTE</span>
              <h2>Computadores monitorados</h2>
            </div>
          </div>

          {isLoading ? (
            <div className="ativelo-network-empty">Carregando agentes...</div>
          ) : agents.length === 0 ? (
            <div className="ativelo-network-empty">
              <AppIcon name="cpu" size={44} />
              <strong>Nenhum agente conectado</strong>
              <span>
                Gere um token e instale o agente nos computadores.
              </span>
            </div>
          ) : (
            <div className="ativelo-agent-list">
              {agents.map((agent) => (
                <article key={agent.id}>
                  <i className={isOnline(agent.last_seen_at) ? "online" : ""}>
                    <AppIcon name="cpu" size={23} />
                  </i>
                  <div className="ativelo-agent-main">
                    <header>
                      <div>
                        <h3>{agent.hostname}</h3>
                        <span>
                          {agent.manufacturer || "Fabricante não informado"} ·{" "}
                          {agent.model || "Modelo não informado"}
                        </span>
                      </div>
                      <b>
                        {isOnline(agent.last_seen_at) ? "Online" : "Offline"}
                      </b>
                    </header>
                    <dl>
                      <div>
                        <dt>Serial</dt>
                        <dd>{agent.serial_number || "Não informado"}</dd>
                      </div>
                      <div>
                        <dt>Sistema</dt>
                        <dd>
                          {[agent.os_name, agent.os_version]
                            .filter(Boolean)
                            .join(" ") || "Não informado"}
                        </dd>
                      </div>
                      <div>
                        <dt>IP</dt>
                        <dd>{agent.last_ip || "Não informado"}</dd>
                      </div>
                      <div>
                        <dt>Última comunicação</dt>
                        <dd>{formatDate(agent.last_seen_at)}</dd>
                      </div>
                    </dl>
                    <footer>
                      <select
                        value={agentLinks[agent.id] ?? ""}
                        onChange={(event) =>
                          setAgentLinks({
                            ...agentLinks,
                            [agent.id]: event.target.value,
                          })
                        }
                      >
                        <option value="">Sem patrimônio vinculado</option>
                        {assets.map((asset) => (
                          <option key={asset.id} value={asset.id}>
                            {asset.asset_number} · {asset.name}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => void linkAgent(agent.id)}
                      >
                        <AppIcon name="link" size={16} />
                        Salvar vínculo
                      </button>
                      <button
                        type="button"
                        onClick={() => void openAgentDetails(agent)}
                      >
                        Detalhes técnicos
                      </button>
                      {agent.asset_id && (
                        <button
                          type="button"
                          onClick={() => onOpenAsset(agent.asset_id as string)}
                        >
                          Abrir ativo
                        </button>
                      )}
                    </footer>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      {activeTab === "discovered" && (
        <section className="ativelo-network-panel">
          <div className="ativelo-network-panel-heading">
            <div>
              <span>VARREDURA LOCAL</span>
              <h2>Dispositivos descobertos</h2>
            </div>
          </div>

          {devices.length === 0 ? (
            <div className="ativelo-network-empty">
              <AppIcon name="wifi" size={44} />
              <strong>Nenhum dispositivo encontrado</strong>
              <span>
                Execute o scanner de rede para preencher esta lista.
              </span>
            </div>
          ) : (
            <div className="ativelo-discovery-table-wrapper">
              <table className="ativelo-discovery-table">
                <thead>
                  <tr>
                    <th>Dispositivo</th>
                    <th>Endereço</th>
                    <th>Tipo</th>
                    <th>Portas</th>
                    <th>Última detecção</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {devices.map((device) => (
                    <tr key={device.id}>
                      <td>
                        <strong>
                          {device.hostname || "Hostname não identificado"}
                        </strong>
                        <small>{device.vendor || "Fabricante desconhecido"}</small>
                      </td>
                      <td>
                        <strong>{device.ip_address || "Sem IP"}</strong>
                        <small>{device.mac_address || "Sem MAC"}</small>
                      </td>
                      <td>{device.device_type || "desconhecido"}</td>
                      <td>
                        {device.open_ports.length > 0
                          ? device.open_ports.join(", ")
                          : "Nenhuma"}
                      </td>
                      <td>{formatDate(device.last_seen_at)}</td>
                      <td>
                        {device.linked_asset_id ? (
                          <button
                            type="button"
                            onClick={() =>
                              onOpenAsset(device.linked_asset_id as string)
                            }
                          >
                            Abrir ativo
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => openDeviceDraft(device)}
                          >
                            Pré-cadastrar
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {activeTab === "enrollment" && (
        <section className="ativelo-enrollment-grid">
          <article className="ativelo-network-panel">
            <div className="ativelo-network-panel-heading">
              <div>
                <span>CHAVE DE INSTALAÇÃO</span>
                <h2>Gerar token temporário</h2>
              </div>
            </div>

            <form className="ativelo-token-form" onSubmit={createToken}>
              <label>
                <span>Identificação do token</span>
                <input
                  value={tokenLabel}
                  onChange={(event) => setTokenLabel(event.target.value)}
                  maxLength={100}
                />
              </label>
              <div>
                <label>
                  <span>Validade em dias</span>
                  <input
                    type="number"
                    min="1"
                    max="365"
                    value={tokenDays}
                    onChange={(event) => setTokenDays(event.target.value)}
                  />
                </label>
                <label>
                  <span>Quantidade máxima de agentes</span>
                  <input
                    type="number"
                    min="1"
                    max="10000"
                    value={tokenMaxUses}
                    onChange={(event) => setTokenMaxUses(event.target.value)}
                  />
                </label>
              </div>
              <button type="submit" className="primary" disabled={isSaving}>
                <AppIcon name="key" size={18} />
                {isSaving ? "Gerando..." : "Gerar token"}
              </button>
            </form>

            {generatedToken && (
              <div className="ativelo-generated-token">
                <strong>Token gerado</strong>
                <code>{generatedToken.token}</code>
                <small>
                  Válido até {formatDate(generatedToken.expires_at)}. Guarde-o
                  agora, pois o valor não será exibido novamente.
                </small>
                <button
                  type="button"
                  onClick={() => void copyText(generatedToken.token)}
                >
                  <AppIcon name="copy" size={17} />
                  Copiar token
                </button>
              </div>
            )}
          </article>

          <article className="ativelo-network-panel">
            <div className="ativelo-network-panel-heading">
              <div>
                <span>WINDOWS</span>
                <h2>Comandos de instalação</h2>
              </div>
            </div>

            {generatedToken ? (
              <div className="ativelo-command-list">
                <div className="ativelo-one-line-notice">
                  <AppIcon name="check" size={20} />
                  <div>
                    <strong>Instalação em uma única linha</strong>
                    <span>
                      Não é necessário copiar o projeto ou os scripts para o
                      computador. Execute o comando no PowerShell como
                      administrador.
                    </span>
                  </div>
                </div>

                <section className="featured">
                  <header>
                    <AppIcon name="cpu" size={21} />
                    <strong>Instalar agente automaticamente</strong>
                  </header>
                  <p>
                    Baixa o agente oficial, verifica a integridade, instala a
                    tarefa agendada e envia a primeira coleta.
                  </p>
                  <code>{agentInstallCommand}</code>
                  <button
                    type="button"
                    onClick={() => void copyText(agentInstallCommand)}
                  >
                    <AppIcon name="copy" size={16} />
                    Copiar instalação
                  </button>
                </section>

                <section>
                  <header>
                    <AppIcon name="network" size={21} />
                    <strong>Executar descoberta da rede</strong>
                  </header>
                  <p>
                    Informe os três primeiros blocos da rede. Exemplo:
                    192.168.0.
                  </p>
                  <label className="ativelo-subnet-field">
                    <span>Prefixo da rede</span>
                    <input
                      value={subnetPrefix}
                      onChange={(event) =>
                        setSubnetPrefix(event.target.value)
                      }
                      placeholder="192.168.0"
                    />
                  </label>
                  <code>{scannerCommand}</code>
                  <button
                    type="button"
                    onClick={() => void copyText(scannerCommand)}
                  >
                    <AppIcon name="copy" size={16} />
                    Copiar scanner
                  </button>
                </section>

                <section className="management">
                  <header>
                    <AppIcon name="settings" size={21} />
                    <strong>Gerenciar agente instalado</strong>
                  </header>
                  <p>
                    Comandos locais para diagnóstico, atualização e remoção.
                  </p>
                  <div className="ativelo-agent-command-buttons">
                    <button
                      type="button"
                      onClick={() => void copyText(agentStatusCommand)}
                    >
                      Copiar status
                    </button>
                    <button
                      type="button"
                      onClick={() => void copyText(agentUpdateCommand)}
                    >
                      Copiar atualização
                    </button>
                    <button
                      type="button"
                      className="danger"
                      onClick={() => void copyText(agentUninstallCommand)}
                    >
                      Copiar remoção
                    </button>
                  </div>
                </section>
              </div>
            ) : (
              <div className="ativelo-network-empty compact">
                Gere um token ativo para liberar os instaladores de uma linha.
              </div>
            )}
          </article>

          <article className="ativelo-network-panel wide">
            <div className="ativelo-network-panel-heading">
              <div>
                <span>TOKENS EXISTENTES</span>
                <h2>Controle de credenciais</h2>
              </div>
            </div>

            <div className="ativelo-token-list">
              {tokens.length === 0 ? (
                <div className="ativelo-network-empty compact">
                  Nenhum token criado.
                </div>
              ) : (
                tokens.map((token) => (
                  <div key={token.id}>
                    <i>
                      <AppIcon name="key" size={20} />
                    </i>
                    <span>
                      <strong>{token.label}</strong>
                      <small>
                        {token.used_count}/{token.max_uses} usos · expira em{" "}
                        {formatDate(token.expires_at)}
                      </small>
                    </span>
                    <b>{token.is_active ? "Ativo" : "Revogado"}</b>
                    {token.is_active && (
                      <button
                        type="button"
                        onClick={() => void revokeToken(token.id)}
                      >
                        Revogar
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          </article>
        </section>
      )}

      {selectedAgent && (
        <div className="ativelo-modal-backdrop">
          <section className="ativelo-modal ativelo-agent-detail-modal">
            <header>
              <div>
                <span>INVENTÁRIO AUTOMÁTICO</span>
                <h2>{selectedAgent.hostname}</h2>
              </div>
              <button type="button" onClick={() => setSelectedAgent(null)}>
                <AppIcon name="close" size={21} />
              </button>
            </header>

            <div className="ativelo-agent-detail-summary">
              <article>
                <small>Fabricante</small>
                <strong>{selectedAgent.manufacturer || "Não informado"}</strong>
              </article>
              <article>
                <small>Modelo</small>
                <strong>{selectedAgent.model || "Não informado"}</strong>
              </article>
              <article>
                <small>Serial</small>
                <strong>{selectedAgent.serial_number || "Não informado"}</strong>
              </article>
              <article>
                <small>Última coleta</small>
                <strong>{formatDate(selectedAgent.last_seen_at)}</strong>
              </article>
            </div>

            {latestSnapshot ? (
              <div className="ativelo-json-grid">
                <section>
                  <h3>Hardware</h3>
                  <pre>{JSON.stringify(latestSnapshot.hardware, null, 2)}</pre>
                </section>
                <section>
                  <h3>Software</h3>
                  <pre>{JSON.stringify(latestSnapshot.software, null, 2)}</pre>
                </section>
                <section>
                  <h3>Rede</h3>
                  <pre>{JSON.stringify(latestSnapshot.network, null, 2)}</pre>
                </section>
              </div>
            ) : (
              <div className="ativelo-network-empty compact">
                Nenhuma coleta técnica registrada.
              </div>
            )}
          </section>
        </div>
      )}

      {selectedDevice && (
        <div className="ativelo-modal-backdrop">
          <section className="ativelo-modal ativelo-discovery-modal">
            <header>
              <div>
                <span>PRÉ-CADASTRO</span>
                <h2>Transformar descoberta em ativo</h2>
              </div>
              <button type="button" onClick={() => setSelectedDevice(null)}>
                <AppIcon name="close" size={21} />
              </button>
            </header>

            <form onSubmit={createAssetFromDevice}>
              <label>
                <span>Número patrimonial *</span>
                <input
                  value={assetDraft.assetNumber}
                  onChange={(event) =>
                    setAssetDraft({
                      ...assetDraft,
                      assetNumber: event.target.value,
                    })
                  }
                  placeholder="Ex.: TI-0001"
                />
              </label>
              <label>
                <span>Nome do equipamento *</span>
                <input
                  value={assetDraft.name}
                  onChange={(event) =>
                    setAssetDraft({
                      ...assetDraft,
                      name: event.target.value,
                    })
                  }
                />
              </label>
              <label>
                <span>Categoria *</span>
                <select
                  value={assetDraft.categoryId}
                  onChange={(event) =>
                    setAssetDraft({
                      ...assetDraft,
                      categoryId: event.target.value,
                    })
                  }
                >
                  <option value="">Selecione</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </label>

              <div className="ativelo-discovery-data">
                <span>IP: {selectedDevice.ip_address || "Não identificado"}</span>
                <span>
                  MAC: {selectedDevice.mac_address || "Não identificado"}
                </span>
                <span>
                  Portas:{" "}
                  {selectedDevice.open_ports.length > 0
                    ? selectedDevice.open_ports.join(", ")
                    : "nenhuma"}
                </span>
              </div>

              <footer>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setSelectedDevice(null)}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="primary"
                  disabled={isSaving}
                >
                  <AppIcon name="save" size={18} />
                  {isSaving ? "Salvando..." : "Criar ativo"}
                </button>
              </footer>
            </form>
          </section>
        </div>
      )}
    </main>
  );
}
