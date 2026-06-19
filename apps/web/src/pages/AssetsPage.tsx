import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import type { OrganizationContext } from "../App";
import AppIcon from "../components/AppIcon";
import AssetHistoryTimeline from "../components/AssetHistoryTimeline";
import AssetPhotoGallery from "../components/AssetPhotoGallery";
import AssetQrModal from "../components/AssetQrModal";
import { supabase } from "../lib/supabase";
import type { AssetRecord } from "../types/assets";
import { conditionLabels, lifecycleLabels, statusLabels } from "../types/assets";

import AssetLabelBatchModal from "../components/AssetLabelBatchModal";
type Props = {
  organization: OrganizationContext;
  initialAssetId?: string | null;
  onBack: () => void;
  onOpenScanner: () => void;
};

type Option = { id: string; name: string };
type ModelOption = Option & { category_id: string; manufacturer_id: string | null };

const emptyForm = {
  assetNumber: "",
  name: "",
  serialNumber: "",
  serviceTag: "",
  categoryId: "",
  manufacturerId: "",
  modelId: "",
  operationalStatus: "available",
  physicalCondition: "good",
  lifecycleStage: "received",
  criticality: "medium",
  unitId: "",
  buildingId: "",
  floorId: "",
  departmentId: "",
  roomId: "",
  rackId: "",
  workstationId: "",
  assignedPersonName: "",
  assignedPersonEmail: "",
  hostname: "",
  ipAddress: "",
  macAddress: "",
  operatingSystem: "",
  purchaseDate: "",
  acquisitionValue: "",
  warrantyEndDate: "",
  notes: "",
};

export default function AssetsPage({
  organization,
  initialAssetId = null,
  onBack,
  onOpenScanner,
}: Props) {
  const [assets, setAssets] = useState<AssetRecord[]>([]);
  const [categories, setCategories] = useState<Option[]>([]);
  const [manufacturers, setManufacturers] = useState<Option[]>([]);
  const [models, setModels] = useState<ModelOption[]>([]);
  const [units, setUnits] = useState<Option[]>([]);
  const [buildings, setBuildings] = useState<(Option & { unit_id: string })[]>([]);
  const [floors, setFloors] = useState<(Option & { building_id: string })[]>([]);
  const [departments, setDepartments] = useState<(Option & { unit_id: string | null })[]>([]);
  const [rooms, setRooms] = useState<(Option & { floor_id: string })[]>([]);
  const [racks, setRacks] = useState<(Option & { room_id: string })[]>([]);
  const [workstations, setWorkstations] = useState<(Option & { room_id: string })[]>([]);

  const [form, setForm] = useState(emptyForm);
  const [selectedAsset, setSelectedAsset] = useState<AssetRecord | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isQrOpen, setIsQrOpen] = useState(false);
  const [isLabelBatchOpen, setIsLabelBatchOpen] =
    useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");

  const updateForm = (field: keyof typeof emptyForm, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const loadAll = useCallback(async () => {
    setIsLoading(true);
    setFeedback(null);
    const organizationId = organization.organizationId;

    const results = await Promise.all([
      supabase.from("assets").select("*").eq("organization_id", organizationId).order("created_at", { ascending: false }),
      supabase.from("asset_categories").select("id,name").eq("organization_id", organizationId).eq("is_active", true).order("name"),
      supabase.from("manufacturers").select("id,name").eq("organization_id", organizationId).eq("is_active", true).order("name"),
      supabase.from("asset_models").select("id,name,category_id,manufacturer_id").eq("organization_id", organizationId).eq("is_active", true).order("name"),
      supabase.from("organization_units").select("id,name").eq("organization_id", organizationId).eq("is_active", true).order("name"),
      supabase.from("buildings").select("id,name,unit_id").eq("organization_id", organizationId).eq("is_active", true).order("name"),
      supabase.from("floors").select("id,name,building_id").eq("organization_id", organizationId).eq("is_active", true).order("floor_order"),
      supabase.from("departments").select("id,name,unit_id").eq("organization_id", organizationId).eq("is_active", true).order("name"),
      supabase.from("rooms").select("id,name,floor_id").eq("organization_id", organizationId).eq("is_active", true).order("name"),
      supabase.from("racks").select("id,name,room_id").eq("organization_id", organizationId).eq("is_active", true).order("name"),
      supabase.from("workstations").select("id,name,room_id").eq("organization_id", organizationId).eq("is_active", true).order("name"),
    ]);

    const firstError = results.map((result) => result.error).find(Boolean);

    if (firstError) {
      setFeedback({ type: "error", text: firstError.message });
      setIsLoading(false);
      return;
    }

    setAssets((results[0].data ?? []) as AssetRecord[]);
    setCategories((results[1].data ?? []) as Option[]);
    setManufacturers((results[2].data ?? []) as Option[]);
    setModels((results[3].data ?? []) as ModelOption[]);
    setUnits((results[4].data ?? []) as Option[]);
    setBuildings((results[5].data ?? []) as (Option & { unit_id: string })[]);
    setFloors((results[6].data ?? []) as (Option & { building_id: string })[]);
    setDepartments((results[7].data ?? []) as (Option & { unit_id: string | null })[]);
    setRooms((results[8].data ?? []) as (Option & { floor_id: string })[]);
    setRacks((results[9].data ?? []) as (Option & { room_id: string })[]);
    setWorkstations((results[10].data ?? []) as (Option & { room_id: string })[]);
    setIsLoading(false);
  }, [organization.organizationId]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  useEffect(() => {
    if (!initialAssetId || assets.length === 0) {
      return;
    }

    const asset = assets.find((item) => item.id === initialAssetId);

    if (asset) {
      setSelectedAsset(asset);
      setIsDetailOpen(true);
    }
  }, [assets, initialAssetId]);

  const categoryName = (id: string) => categories.find((item) => item.id === id)?.name ?? "Sem categoria";
  const manufacturerName = (id: string | null) => manufacturers.find((item) => item.id === id)?.name ?? "Não definido";
  const modelName = (id: string | null) => models.find((item) => item.id === id)?.name ?? "Não definido";
  const optionName = (list: Option[], id: string | null) => list.find((item) => item.id === id)?.name ?? "Não definido";

  const filteredModels = models.filter((item) =>
    (!form.categoryId || item.category_id === form.categoryId) &&
    (!form.manufacturerId || !item.manufacturer_id || item.manufacturer_id === form.manufacturerId)
  );

  const filteredBuildings = buildings.filter((item) => !form.unitId || item.unit_id === form.unitId);
  const filteredFloors = floors.filter((item) => !form.buildingId || item.building_id === form.buildingId);
  const filteredRooms = rooms.filter((item) => !form.floorId || item.floor_id === form.floorId);
  const filteredRacks = racks.filter((item) => !form.roomId || item.room_id === form.roomId);
  const filteredWorkstations = workstations.filter((item) => !form.roomId || item.room_id === form.roomId);
  const filteredDepartments = departments.filter((item) => !form.unitId || !item.unit_id || item.unit_id === form.unitId);

  const filteredAssets = useMemo(() => {
    const normalized = search.trim().toLowerCase();

    return assets.filter((asset) => {
      const matchesSearch =
        !normalized ||
        [asset.asset_number, asset.name, asset.serial_number, asset.service_tag, asset.hostname]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(normalized));

      const matchesStatus = !statusFilter || asset.operational_status === statusFilter;
      const matchesCategory = !categoryFilter || asset.category_id === categoryFilter;

      return matchesSearch && matchesStatus && matchesCategory;
    });
  }, [assets, search, statusFilter, categoryFilter]);

  const openNewAsset = () => {
    setForm(emptyForm);
    setFeedback(null);
    setIsFormOpen(true);
  };

  const openAssetDetails = (asset: AssetRecord) => {
    setSelectedAsset(asset);
    setIsDetailOpen(true);
  };

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFeedback(null);

    if (!form.assetNumber.trim() || !form.name.trim() || !form.categoryId) {
      setFeedback({ type: "error", text: "Preencha patrimônio, nome e categoria." });
      return;
    }

    setIsSaving(true);

    const { error } = await supabase.from("assets").insert({
      organization_id: organization.organizationId,
      asset_number: form.assetNumber.trim(),
      name: form.name.trim(),
      serial_number: form.serialNumber.trim() || null,
      service_tag: form.serviceTag.trim() || null,
      category_id: form.categoryId,
      manufacturer_id: form.manufacturerId || null,
      model_id: form.modelId || null,
      operational_status: form.operationalStatus,
      physical_condition: form.physicalCondition,
      lifecycle_stage: form.lifecycleStage,
      criticality: form.criticality,
      unit_id: form.unitId || null,
      building_id: form.buildingId || null,
      floor_id: form.floorId || null,
      department_id: form.departmentId || null,
      room_id: form.roomId || null,
      rack_id: form.rackId || null,
      workstation_id: form.workstationId || null,
      assigned_person_name: form.assignedPersonName.trim() || null,
      assigned_person_email: form.assignedPersonEmail.trim() || null,
      assigned_at: form.assignedPersonName.trim() ? new Date().toISOString() : null,
      hostname: form.hostname.trim() || null,
      ip_address: form.ipAddress.trim() || null,
      mac_address: form.macAddress.trim() || null,
      operating_system: form.operatingSystem.trim() || null,
      purchase_date: form.purchaseDate || null,
      acquisition_value: form.acquisitionValue ? Number(form.acquisitionValue.replace(",", ".")) : null,
      warranty_end_date: form.warrantyEndDate || null,
      notes: form.notes.trim() || null,
    });

    if (error) {
      setFeedback({ type: "error", text: error.message });
      setIsSaving(false);
      return;
    }

    setIsSaving(false);
    setIsFormOpen(false);
    setFeedback({ type: "success", text: "Equipamento cadastrado com sucesso." });
    await loadAll();
  };

  const handleStatusUpdate = async (status: string) => {
    if (!selectedAsset) return;

    const { error } = await supabase
      .from("assets")
      .update({ operational_status: status })
      .eq("id", selectedAsset.id)
      .eq("organization_id", organization.organizationId);

    if (error) {
      setFeedback({ type: "error", text: error.message });
      return;
    }

    const updated = { ...selectedAsset, operational_status: status };
    setSelectedAsset(updated);
    setAssets((current) => current.map((item) => (item.id === updated.id ? updated : item)));
    setFeedback({ type: "success", text: "Status atualizado com sucesso." });
  };

  return (
    <main className="ativelo-assets-page">
      <header className="ativelo-assets-header">
        <div>
          <button type="button" onClick={onBack}>← Voltar ao painel</button>
          <p>INVENTÁRIO TECNOLÓGICO</p>
          <h1>Ativos</h1>
          <span>Cadastre, localize e acompanhe o ciclo de vida dos equipamentos.</span>
        </div>

        <div className="ativelo-assets-header-actions">
          <button
          type="button"
          className="secondary"
          onClick={() => setIsLabelBatchOpen(true)}
        >
          <AppIcon name="print" size={18} />
          Imprimir etiquetas
        </button>
<button type="button" className="secondary" onClick={onOpenScanner}><AppIcon name="scan" size={18}/>Ler QR Code</button>
          <button type="button" className="secondary" onClick={() => void loadAll()}><AppIcon name="refresh" size={18}/>Atualizar</button>
          <button type="button" className="primary" onClick={openNewAsset}><AppIcon name="plus" size={18}/>Novo ativo</button>
        </div>
      </header>

      <section className="ativelo-assets-toolbar">
        <label className="search">
          <AppIcon name="search" size={20}/>
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por patrimônio, nome, serial, Service Tag ou hostname"/>
        </label>

        <label>
          <AppIcon name="filter" size={18}/>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="">Todos os status</option>
            {Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>

        <label>
          <AppIcon name="catalog" size={18}/>
          <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
            <option value="">Todas as categorias</option>
            {categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
      </section>

      {feedback && <div className={`ativelo-assets-feedback ${feedback.type}`}>{feedback.text}</div>}

      <section className="ativelo-assets-summary">
        <article><span>Total exibido</span><strong>{filteredAssets.length}</strong></article>
        <article><span>Em uso</span><strong>{filteredAssets.filter((item) => item.operational_status === "in_use").length}</strong></article>
        <article><span>Manutenção</span><strong>{filteredAssets.filter((item) => ["in_maintenance", "awaiting_part"].includes(item.operational_status)).length}</strong></article>
        <article><span>Com defeito</span><strong>{filteredAssets.filter((item) => item.operational_status === "defective").length}</strong></article>
      </section>

      <section className="ativelo-assets-list-panel">
        <div className="ativelo-assets-list-heading">
          <div><span>INVENTÁRIO</span><h2>Equipamentos cadastrados</h2></div>
          <small>{filteredAssets.length} registro(s)</small>
        </div>

        {isLoading ? (
          <div className="ativelo-assets-empty">Carregando equipamentos...</div>
        ) : filteredAssets.length === 0 ? (
          <div className="ativelo-assets-empty">
            <AppIcon name="assets" size={44}/>
            <strong>Nenhum equipamento encontrado</strong>
            <span>Cadastre o primeiro ativo ou ajuste os filtros.</span>
            <button type="button" onClick={openNewAsset}>Cadastrar ativo</button>
          </div>
        ) : (
          <div className="ativelo-assets-table-wrapper">
            <table className="ativelo-assets-table">
              <thead>
                <tr>
                  <th>Patrimônio</th><th>Equipamento</th><th>Categoria</th><th>Modelo</th><th>Status</th><th>Localização</th><th></th>
                </tr>
              </thead>
              <tbody>
                {filteredAssets.map((asset) => (
                  <tr key={asset.id} onClick={() => openAssetDetails(asset)}>
                    <td><strong>{asset.asset_number}</strong><small>{asset.serial_number || "Sem serial"}</small></td>
                    <td><strong>{asset.name}</strong><small>{asset.hostname || manufacturerName(asset.manufacturer_id)}</small></td>
                    <td>{categoryName(asset.category_id)}</td>
                    <td>{modelName(asset.model_id)}</td>
                    <td><span className={`status ${asset.operational_status}`}>{statusLabels[asset.operational_status] ?? asset.operational_status}</span></td>
                    <td>{optionName(units, asset.unit_id)}<small>{optionName(rooms, asset.room_id)}</small></td>
                    <td><button type="button" aria-label="Abrir detalhes"><AppIcon name="chevron" size={18}/></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {isFormOpen && (
        <div className="ativelo-modal-backdrop" role="presentation">
          <section className="ativelo-modal large" role="dialog" aria-modal="true" aria-label="Cadastrar ativo">
            <header>
              <div><span>NOVO EQUIPAMENTO</span><h2>Cadastrar ativo</h2></div>
              <button type="button" onClick={() => setIsFormOpen(false)}><AppIcon name="close" size={21}/></button>
            </header>

            <form onSubmit={handleCreate}>
              <fieldset>
                <legend>Identificação</legend>
                <div className="grid three">
                  <label><span>Número patrimonial *</span><input value={form.assetNumber} onChange={(event) => updateForm("assetNumber", event.target.value)} placeholder="Ex.: TI-0001"/></label>
                  <label><span>Nome do equipamento *</span><input value={form.name} onChange={(event) => updateForm("name", event.target.value)} placeholder="Ex.: Computador Recepção"/></label>
                  <label><span>Categoria *</span><select value={form.categoryId} onChange={(event) => { updateForm("categoryId", event.target.value); updateForm("modelId", ""); }}><option value="">Selecione</option>{categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
                </div>
                <div className="grid three">
                  <label><span>Fabricante</span><select value={form.manufacturerId} onChange={(event) => { updateForm("manufacturerId", event.target.value); updateForm("modelId", ""); }}><option value="">Não definido</option>{manufacturers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
                  <label><span>Modelo</span><select value={form.modelId} onChange={(event) => updateForm("modelId", event.target.value)}><option value="">Não definido</option>{filteredModels.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
                  <label><span>Número de série</span><input value={form.serialNumber} onChange={(event) => updateForm("serialNumber", event.target.value)}/></label>
                </div>
                <div className="grid three">
                  <label><span>Service Tag</span><input value={form.serviceTag} onChange={(event) => updateForm("serviceTag", event.target.value)}/></label>
                  <label><span>Status</span><select value={form.operationalStatus} onChange={(event) => updateForm("operationalStatus", event.target.value)}>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                  <label><span>Condição física</span><select value={form.physicalCondition} onChange={(event) => updateForm("physicalCondition", event.target.value)}>{Object.entries(conditionLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                </div>
              </fieldset>

              <fieldset>
                <legend>Localização</legend>
                <div className="grid three">
                  <label><span>Unidade</span><select value={form.unitId} onChange={(event) => { updateForm("unitId", event.target.value); updateForm("buildingId", ""); updateForm("floorId", ""); updateForm("roomId", ""); }}><option value="">Não definida</option>{units.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
                  <label><span>Prédio</span><select value={form.buildingId} onChange={(event) => { updateForm("buildingId", event.target.value); updateForm("floorId", ""); updateForm("roomId", ""); }}><option value="">Não definido</option>{filteredBuildings.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
                  <label><span>Andar</span><select value={form.floorId} onChange={(event) => { updateForm("floorId", event.target.value); updateForm("roomId", ""); }}><option value="">Não definido</option>{filteredFloors.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
                </div>
                <div className="grid three">
                  <label><span>Setor</span><select value={form.departmentId} onChange={(event) => updateForm("departmentId", event.target.value)}><option value="">Não definido</option>{filteredDepartments.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
                  <label><span>Sala</span><select value={form.roomId} onChange={(event) => { updateForm("roomId", event.target.value); updateForm("rackId", ""); updateForm("workstationId", ""); }}><option value="">Não definida</option>{filteredRooms.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
                  <label><span>Rack</span><select value={form.rackId} onChange={(event) => updateForm("rackId", event.target.value)}><option value="">Não definido</option>{filteredRacks.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
                </div>
                <div className="grid three">
                  <label><span>Estação</span><select value={form.workstationId} onChange={(event) => updateForm("workstationId", event.target.value)}><option value="">Não definida</option>{filteredWorkstations.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
                </div>
              </fieldset>

              <fieldset>
                <legend>Dados técnicos e financeiros</legend>
                <div className="grid three">
                  <label><span>Hostname</span><input value={form.hostname} onChange={(event) => updateForm("hostname", event.target.value)}/></label>
                  <label><span>Endereço IP</span><input value={form.ipAddress} onChange={(event) => updateForm("ipAddress", event.target.value)} placeholder="192.168.0.10"/></label>
                  <label><span>Endereço MAC</span><input value={form.macAddress} onChange={(event) => updateForm("macAddress", event.target.value)} placeholder="00:11:22:33:44:55"/></label>
                </div>
                <div className="grid three">
                  <label><span>Sistema operacional</span><input value={form.operatingSystem} onChange={(event) => updateForm("operatingSystem", event.target.value)} placeholder="Windows 11 Pro"/></label>
                  <label><span>Data de compra</span><input type="date" value={form.purchaseDate} onChange={(event) => updateForm("purchaseDate", event.target.value)}/></label>
                  <label><span>Valor de aquisição</span><input value={form.acquisitionValue} onChange={(event) => updateForm("acquisitionValue", event.target.value)} placeholder="0,00"/></label>
                </div>
                <div className="grid three">
                  <label><span>Garantia até</span><input type="date" value={form.warrantyEndDate} onChange={(event) => updateForm("warrantyEndDate", event.target.value)}/></label>
                  <label><span>Responsável</span><input value={form.assignedPersonName} onChange={(event) => updateForm("assignedPersonName", event.target.value)}/></label>
                  <label><span>E-mail do responsável</span><input type="email" value={form.assignedPersonEmail} onChange={(event) => updateForm("assignedPersonEmail", event.target.value)}/></label>
                </div>
                <label className="full"><span>Observações</span><textarea rows={4} value={form.notes} onChange={(event) => updateForm("notes", event.target.value)}/></label>
              </fieldset>

              <footer>
                <button type="button" className="secondary" onClick={() => setIsFormOpen(false)}>Cancelar</button>
                <button type="submit" className="primary" disabled={isSaving}><AppIcon name="save" size={18}/>{isSaving ? "Salvando..." : "Salvar equipamento"}</button>
              </footer>
            </form>
          </section>
        </div>
      )}

      {isDetailOpen && selectedAsset && (
        <div className="ativelo-modal-backdrop" role="presentation">
          <section className="ativelo-modal detail" role="dialog" aria-modal="true" aria-label="Detalhes do ativo">
            <header>
              <div><span>{selectedAsset.asset_number}</span><h2>{selectedAsset.name}</h2></div>
              <div className="ativelo-detail-header-actions">
                <button type="button" className="ativelo-qr-action" onClick={() => setIsQrOpen(true)}>
                  <AppIcon name="print" size={18}/>
                  Etiqueta QR
                </button>
                <button type="button" onClick={() => setIsDetailOpen(false)} aria-label="Fechar">
                  <AppIcon name="close" size={21}/>
                </button>
              </div>
            </header>

            <div className="ativelo-asset-detail-grid">
              <article><AppIcon name="catalog" size={20}/><span><small>Categoria</small><strong>{categoryName(selectedAsset.category_id)}</strong></span></article>
              <article><AppIcon name="serial" size={20}/><span><small>Número de série</small><strong>{selectedAsset.serial_number || "Não informado"}</strong></span></article>
              <article><AppIcon name="building" size={20}/><span><small>Localização</small><strong>{optionName(units, selectedAsset.unit_id)} · {optionName(rooms, selectedAsset.room_id)}</strong></span></article>
              <article><AppIcon name="user" size={20}/><span><small>Responsável</small><strong>{selectedAsset.assigned_person_name || "Não atribuído"}</strong></span></article>
              <article><AppIcon name="database" size={20}/><span><small>Fabricante e modelo</small><strong>{manufacturerName(selectedAsset.manufacturer_id)} · {modelName(selectedAsset.model_id)}</strong></span></article>
              <article><AppIcon name="history" size={20}/><span><small>Condição</small><strong>{conditionLabels[selectedAsset.physical_condition] ?? selectedAsset.physical_condition}</strong></span></article>
            </div>

            <div className="ativelo-status-editor">
              <label>
                <span>Alterar status operacional</span>
                <select value={selectedAsset.operational_status} onChange={(event) => void handleStatusUpdate(event.target.value)}>
                  {Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
            </div>

            <div className="ativelo-asset-notes">
              <h3>Informações adicionais</h3>
              <p><strong>Ciclo de vida:</strong> {lifecycleLabels[selectedAsset.lifecycle_stage] ?? selectedAsset.lifecycle_stage}</p>
              <p><strong>Hostname:</strong> {selectedAsset.hostname || "Não informado"}</p>
              <p><strong>IP:</strong> {selectedAsset.ip_address || "Não informado"}</p>
              <p><strong>MAC:</strong> {selectedAsset.mac_address || "Não informado"}</p>
              <p><strong>Sistema:</strong> {selectedAsset.operating_system || "Não informado"}</p>
              <p><strong>Observações:</strong> {selectedAsset.notes || "Nenhuma observação registrada."}</p>
            </div>

            <AssetPhotoGallery
              organizationId={organization.organizationId}
              assetId={selectedAsset.id}
            />

            <AssetHistoryTimeline
              organizationId={organization.organizationId}
              assetId={selectedAsset.id}
            />
          </section>
        </div>
      )}

            {isLabelBatchOpen && (
        <AssetLabelBatchModal

          organizationId={
            organization.organizationId
          }assets={assets}
          categories={categories}
          units={units}
          buildings={buildings}
          floors={floors}
          departments={departments}
          rooms={rooms}
          organizationName={
            organization.tradeName ||
            organization.organizationName
          }
          organizationLogoUrl={
            organization.logoUrl
          }
          onClose={() =>
            setIsLabelBatchOpen(false)
          }
        />
      )}

      {isQrOpen && selectedAsset && (
        <AssetQrModal

          organizationId={
            organization.organizationId
          }asset={selectedAsset}
          organizationName={
          organization.tradeName ||
          organization.organizationName
        }
        organizationLogoUrl={organization.logoUrl}
        onClose={() => setIsQrOpen(false)}
        />
      )}
    </main>
  );
}
