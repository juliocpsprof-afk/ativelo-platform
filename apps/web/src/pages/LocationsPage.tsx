import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { supabase } from "../lib/supabase";

type OrganizationContext = {
  organizationId: string;
  organizationName: string;
  role: string;
};

type LocationType =
  | "unit"
  | "building"
  | "floor"
  | "department"
  | "room"
  | "rack"
  | "workstation";

type SimpleRecord = {
  id: string;
  name: string;
};

type UnitRecord = SimpleRecord & {
  code: string | null;
  city: string | null;
  state: string | null;
};

type BuildingRecord = SimpleRecord & {
  unit_id: string;
};

type FloorRecord = SimpleRecord & {
  building_id: string;
  floor_order: number;
};

type DepartmentRecord = SimpleRecord & {
  unit_id: string | null;
  code: string | null;
};

type RoomRecord = SimpleRecord & {
  floor_id: string;
  department_id: string | null;
  code: string | null;
};

type RackRecord = SimpleRecord & {
  room_id: string;
  rack_units: number | null;
};

type WorkstationRecord = SimpleRecord & {
  room_id: string;
  code: string | null;
};

type Props = {
  organization: OrganizationContext;
  onBack: () => void;
};

const labels: Record<LocationType, string> = {
  unit: "Unidade",
  building: "Prédio",
  floor: "Andar",
  department: "Setor",
  room: "Sala",
  rack: "Rack",
  workstation: "Estação",
};

export default function LocationsPage({ organization, onBack }: Props) {
  const [units, setUnits] = useState<UnitRecord[]>([]);
  const [buildings, setBuildings] = useState<BuildingRecord[]>([]);
  const [floors, setFloors] = useState<FloorRecord[]>([]);
  const [departments, setDepartments] = useState<DepartmentRecord[]>([]);
  const [rooms, setRooms] = useState<RoomRecord[]>([]);
  const [racks, setRacks] = useState<RackRecord[]>([]);
  const [workstations, setWorkstations] = useState<WorkstationRecord[]>([]);

  const [selectedType, setSelectedType] = useState<LocationType>("unit");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [parentId, setParentId] = useState("");
  const [secondaryParentId, setSecondaryParentId] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [numericValue, setNumericValue] = useState("");

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setFeedback(null);

    const organizationId = organization.organizationId;

    const results = await Promise.all([
      supabase
        .from("organization_units")
        .select("id,name,code,city,state")
        .eq("organization_id", organizationId)
        .order("name"),
      supabase
        .from("buildings")
        .select("id,name,unit_id")
        .eq("organization_id", organizationId)
        .order("name"),
      supabase
        .from("floors")
        .select("id,name,building_id,floor_order")
        .eq("organization_id", organizationId)
        .order("floor_order"),
      supabase
        .from("departments")
        .select("id,name,unit_id,code")
        .eq("organization_id", organizationId)
        .order("name"),
      supabase
        .from("rooms")
        .select("id,name,floor_id,department_id,code")
        .eq("organization_id", organizationId)
        .order("name"),
      supabase
        .from("racks")
        .select("id,name,room_id,rack_units")
        .eq("organization_id", organizationId)
        .order("name"),
      supabase
        .from("workstations")
        .select("id,name,room_id,code")
        .eq("organization_id", organizationId)
        .order("name"),
    ]);

    const firstError = results.map((result) => result.error).find(Boolean);

    if (firstError) {
      setFeedback({ type: "error", text: firstError.message });
      setIsLoading(false);
      return;
    }

    setUnits((results[0].data ?? []) as UnitRecord[]);
    setBuildings((results[1].data ?? []) as BuildingRecord[]);
    setFloors((results[2].data ?? []) as FloorRecord[]);
    setDepartments((results[3].data ?? []) as DepartmentRecord[]);
    setRooms((results[4].data ?? []) as RoomRecord[]);
    setRacks((results[5].data ?? []) as RackRecord[]);
    setWorkstations((results[6].data ?? []) as WorkstationRecord[]);
    setIsLoading(false);
  }, [organization.organizationId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    setName("");
    setCode("");
    setParentId("");
    setSecondaryParentId("");
    setCity("");
    setState("");
    setNumericValue("");
    setFeedback(null);
  }, [selectedType]);

  const counts = useMemo(
    () => ({
      unit: units.length,
      building: buildings.length,
      floor: floors.length,
      department: departments.length,
      room: rooms.length,
      rack: racks.length,
      workstation: workstations.length,
    }),
    [units, buildings, floors, departments, rooms, racks, workstations],
  );

  const unitName = (id: string) =>
    units.find((item) => item.id === id)?.name ?? "Unidade não encontrada";

  const buildingName = (id: string) =>
    buildings.find((item) => item.id === id)?.name ??
    "Prédio não encontrado";

  const floorName = (id: string) =>
    floors.find((item) => item.id === id)?.name ?? "Andar não encontrado";

  const roomName = (id: string) =>
    rooms.find((item) => item.id === id)?.name ?? "Sala não encontrada";

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFeedback(null);

    if (!name.trim()) {
      setFeedback({ type: "error", text: "Informe o nome." });
      return;
    }

    if (
      ["building", "floor", "room", "rack", "workstation"].includes(
        selectedType,
      ) &&
      !parentId
    ) {
      setFeedback({
        type: "error",
        text: "Selecione a localização superior.",
      });
      return;
    }

    setIsSaving(true);

    const organization_id = organization.organizationId;
    let result: { error: { message: string } | null };

    switch (selectedType) {
      case "unit":
        result = await supabase.from("organization_units").insert({
          organization_id,
          name: name.trim(),
          code: code.trim() || null,
          city: city.trim() || null,
          state: state.trim().toUpperCase() || null,
        });
        break;

      case "building":
        result = await supabase.from("buildings").insert({
          organization_id,
          unit_id: parentId,
          name: name.trim(),
          code: code.trim() || null,
        });
        break;

      case "floor":
        result = await supabase.from("floors").insert({
          organization_id,
          building_id: parentId,
          name: name.trim(),
          floor_order: Number.parseInt(numericValue || "0", 10),
        });
        break;

      case "department":
        result = await supabase.from("departments").insert({
          organization_id,
          unit_id: parentId || null,
          name: name.trim(),
          code: code.trim() || null,
        });
        break;

      case "room":
        result = await supabase.from("rooms").insert({
          organization_id,
          floor_id: parentId,
          department_id: secondaryParentId || null,
          name: name.trim(),
          code: code.trim() || null,
        });
        break;

      case "rack":
        result = await supabase.from("racks").insert({
          organization_id,
          room_id: parentId,
          name: name.trim(),
          code: code.trim() || null,
          rack_units: numericValue
            ? Number.parseInt(numericValue, 10)
            : null,
        });
        break;

      case "workstation":
        result = await supabase.from("workstations").insert({
          organization_id,
          room_id: parentId,
          name: name.trim(),
          code: code.trim() || null,
        });
        break;
    }

    if (result.error) {
      setFeedback({ type: "error", text: result.error.message });
      setIsSaving(false);
      return;
    }

    setFeedback({
      type: "success",
      text: `${labels[selectedType]} cadastrada com sucesso.`,
    });

    setName("");
    setCode("");
    setCity("");
    setState("");
    setNumericValue("");
    setIsSaving(false);
    await loadData();
  };

  const records = useMemo(() => {
    switch (selectedType) {
      case "unit":
        return units.map((item) => ({
          id: item.id,
          title: item.name,
          subtitle:
            [item.city, item.state].filter(Boolean).join(" - ") ||
            "Endereço não informado",
          code: item.code,
        }));

      case "building":
        return buildings.map((item) => ({
          id: item.id,
          title: item.name,
          subtitle: unitName(item.unit_id),
          code: null,
        }));

      case "floor":
        return floors.map((item) => ({
          id: item.id,
          title: item.name,
          subtitle: buildingName(item.building_id),
          code: `Ordem ${item.floor_order}`,
        }));

      case "department":
        return departments.map((item) => ({
          id: item.id,
          title: item.name,
          subtitle: item.unit_id
            ? unitName(item.unit_id)
            : "Abrangência geral",
          code: item.code,
        }));

      case "room":
        return rooms.map((item) => ({
          id: item.id,
          title: item.name,
          subtitle: floorName(item.floor_id),
          code: item.code,
        }));

      case "rack":
        return racks.map((item) => ({
          id: item.id,
          title: item.name,
          subtitle: roomName(item.room_id),
          code: item.rack_units ? `${item.rack_units}U` : null,
        }));

      case "workstation":
        return workstations.map((item) => ({
          id: item.id,
          title: item.name,
          subtitle: roomName(item.room_id),
          code: item.code,
        }));
    }
  }, [
    selectedType,
    units,
    buildings,
    floors,
    departments,
    rooms,
    racks,
    workstations,
  ]);

  const renderParentFields = () => {
    if (selectedType === "building") {
      return (
        <label className="ativelo-location-field">
          <span>Unidade *</span>
          <select
            value={parentId}
            onChange={(event) => setParentId(event.target.value)}
          >
            <option value="">Selecione uma unidade</option>
            {units.map((unit) => (
              <option key={unit.id} value={unit.id}>
                {unit.name}
              </option>
            ))}
          </select>
        </label>
      );
    }

    if (selectedType === "floor") {
      return (
        <label className="ativelo-location-field">
          <span>Prédio *</span>
          <select
            value={parentId}
            onChange={(event) => setParentId(event.target.value)}
          >
            <option value="">Selecione um prédio</option>
            {buildings.map((building) => (
              <option key={building.id} value={building.id}>
                {building.name} · {unitName(building.unit_id)}
              </option>
            ))}
          </select>
        </label>
      );
    }

    if (selectedType === "department") {
      return (
        <label className="ativelo-location-field">
          <span>Unidade</span>
          <select
            value={parentId}
            onChange={(event) => setParentId(event.target.value)}
          >
            <option value="">Todas ou não definida</option>
            {units.map((unit) => (
              <option key={unit.id} value={unit.id}>
                {unit.name}
              </option>
            ))}
          </select>
        </label>
      );
    }

    if (selectedType === "room") {
      return (
        <>
          <label className="ativelo-location-field">
            <span>Andar *</span>
            <select
              value={parentId}
              onChange={(event) => setParentId(event.target.value)}
            >
              <option value="">Selecione um andar</option>
              {floors.map((floor) => (
                <option key={floor.id} value={floor.id}>
                  {floor.name} · {buildingName(floor.building_id)}
                </option>
              ))}
            </select>
          </label>

          <label className="ativelo-location-field">
            <span>Setor responsável</span>
            <select
              value={secondaryParentId}
              onChange={(event) => setSecondaryParentId(event.target.value)}
            >
              <option value="">Não definido</option>
              {departments.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}
            </select>
          </label>
        </>
      );
    }

    if (selectedType === "rack" || selectedType === "workstation") {
      return (
        <label className="ativelo-location-field">
          <span>Sala *</span>
          <select
            value={parentId}
            onChange={(event) => setParentId(event.target.value)}
          >
            <option value="">Selecione uma sala</option>
            {rooms.map((room) => (
              <option key={room.id} value={room.id}>
                {room.name} · {floorName(room.floor_id)}
              </option>
            ))}
          </select>
        </label>
      );
    }

    return null;
  };

  return (
    <main className="ativelo-locations-page">
      <header className="ativelo-locations-header">
        <div>
          <button type="button" onClick={onBack}>
            ← Voltar ao painel
          </button>
          <p>ORGANIZAÇÃO FÍSICA</p>
          <h1>Localizações</h1>
          <span>
            Organize onde cada equipamento está, do prédio até a estação de
            trabalho.
          </span>
        </div>

        <aside>
          <small>Empresa atual</small>
          <strong>{organization.organizationName}</strong>
          <span>{organization.role}</span>
        </aside>
      </header>

      <section className="ativelo-location-tabs">
        {(Object.keys(labels) as LocationType[]).map((type) => (
          <button
            className={selectedType === type ? "active" : ""}
            key={type}
            type="button"
            onClick={() => setSelectedType(type)}
          >
            <span>{labels[type]}</span>
            <strong>{counts[type]}</strong>
          </button>
        ))}
      </section>

      <section className="ativelo-locations-content">
        <article className="ativelo-location-panel">
          <div className="ativelo-location-panel-heading">
            <div>
              <span>NOVO CADASTRO</span>
              <h2>{labels[selectedType]}</h2>
            </div>
          </div>

          <form className="ativelo-location-form" onSubmit={handleSubmit}>
            <label className="ativelo-location-field">
              <span>Nome *</span>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={`Nome da ${labels[selectedType].toLowerCase()}`}
                maxLength={120}
              />
            </label>

            {renderParentFields()}

            {selectedType === "unit" && (
              <div className="ativelo-location-row">
                <label className="ativelo-location-field">
                  <span>Cidade</span>
                  <input
                    value={city}
                    onChange={(event) => setCity(event.target.value)}
                    placeholder="Salvador"
                    maxLength={100}
                  />
                </label>

                <label className="ativelo-location-field uf">
                  <span>UF</span>
                  <input
                    value={state}
                    onChange={(event) => setState(event.target.value)}
                    placeholder="BA"
                    maxLength={2}
                  />
                </label>
              </div>
            )}

            {selectedType === "floor" && (
              <label className="ativelo-location-field">
                <span>Ordem do andar</span>
                <input
                  type="number"
                  value={numericValue}
                  onChange={(event) => setNumericValue(event.target.value)}
                  placeholder="0 para térreo, 1 para primeiro andar"
                />
              </label>
            )}

            {selectedType === "rack" && (
              <label className="ativelo-location-field">
                <span>Quantidade de unidades do rack</span>
                <input
                  type="number"
                  min="1"
                  value={numericValue}
                  onChange={(event) => setNumericValue(event.target.value)}
                  placeholder="Ex.: 42"
                />
              </label>
            )}

            {selectedType !== "floor" && (
              <label className="ativelo-location-field">
                <span>Código interno</span>
                <input
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  placeholder="Ex.: SALA-01"
                  maxLength={40}
                />
              </label>
            )}

            {feedback && (
              <div className={`ativelo-location-feedback ${feedback.type}`}>
                {feedback.text}
              </div>
            )}

            <button type="submit" disabled={isSaving}>
              {isSaving
                ? "Salvando..."
                : `Cadastrar ${labels[selectedType].toLowerCase()}`}
            </button>
          </form>
        </article>

        <article className="ativelo-location-panel list">
          <div className="ativelo-location-panel-heading">
            <div>
              <span>ESTRUTURA CADASTRADA</span>
              <h2>{labels[selectedType]}s</h2>
            </div>

            <button type="button" onClick={() => void loadData()}>
              Atualizar
            </button>
          </div>

          {isLoading ? (
            <div className="ativelo-location-empty">
              Carregando estrutura...
            </div>
          ) : records.length === 0 ? (
            <div className="ativelo-location-empty">
              <strong>Nenhum cadastro encontrado</strong>
              <span>
                Use o formulário ao lado para começar a estrutura da empresa.
              </span>
            </div>
          ) : (
            <div className="ativelo-location-records">
              {records.map((record) => (
                <div key={record.id}>
                  <i>{labels[selectedType].slice(0, 1)}</i>
                  <span>
                    <strong>{record.title}</strong>
                    <small>{record.subtitle}</small>
                  </span>
                  {record.code && <b>{record.code}</b>}
                </div>
              ))}
            </div>
          )}
        </article>
      </section>
    </main>
  );
}
