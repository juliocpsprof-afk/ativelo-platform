import { useCallback, useEffect, useMemo, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import type { OrganizationContext } from "../App";
import AppIcon from "../components/AppIcon";
import OrganizationBrand from "../components/OrganizationBrand";
import CommunicationSettingsPanel from "../components/CommunicationSettingsPanel";
import { supabase } from "../lib/supabase";

type Props = {
  organization: OrganizationContext;
  onBack: () => void;
  onOrganizationUpdated: () => Promise<void>;
};

type SettingsSection =
  | "company"
  | "catalogs"
  | "structure"
  | "communication";

type CatalogKind =
  | "categories"
  | "manufacturers"
  | "models";

type StructureKind =
  | "units"
  | "buildings"
  | "floors"
  | "departments"
  | "rooms"
  | "racks"
  | "workstations";

type MasterKind = CatalogKind | StructureKind;

type BaseRecord = {
  id: string;
  name: string;
  code?: string | null;
  description?: string | null;
  is_active: boolean;
};

type CategoryRecord = BaseRecord & {
  icon_name?: string | null;
};

type ManufacturerRecord = BaseRecord & {
  website?: string | null;
  support_url?: string | null;
  support_phone?: string | null;
  notes?: string | null;
};

type ModelRecord = BaseRecord & {
  category_id: string;
  manufacturer_id: string | null;
  model_number?: string | null;
  part_number?: string | null;
  expected_life_months?: number | null;
  default_warranty_months?: number | null;
};

type UnitRecord = BaseRecord & {
  phone?: string | null;
  email?: string | null;
  postal_code?: string | null;
  street?: string | null;
  street_number?: string | null;
  complement?: string | null;
  district?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
};

type BuildingRecord = BaseRecord & {
  unit_id: string;
};

type FloorRecord = BaseRecord & {
  building_id: string;
  floor_order: number;
};

type DepartmentRecord = BaseRecord & {
  unit_id: string | null;
};

type RoomRecord = BaseRecord & {
  floor_id: string;
  department_id: string | null;
  capacity?: number | null;
};

type RackRecord = BaseRecord & {
  room_id: string;
  rack_units?: number | null;
};

type WorkstationRecord = BaseRecord & {
  room_id: string;
};

type CompanyForm = {
  name: string;
  tradeName: string;
  legalName: string;
  cnpj: string;
  stateRegistration: string;
  municipalRegistration: string;
  phone: string;
  whatsapp: string;
  email: string;
  website: string;
  postalCode: string;
  street: string;
  streetNumber: string;
  complement: string;
  district: string;
  city: string;
  state: string;
  country: string;
};

type MasterForm = {
  name: string;
  code: string;
  description: string;
  isActive: boolean;
  categoryId: string;
  manufacturerId: string;
  modelNumber: string;
  partNumber: string;
  expectedLifeMonths: string;
  defaultWarrantyMonths: string;
  website: string;
  supportUrl: string;
  supportPhone: string;
  notes: string;
  unitId: string;
  buildingId: string;
  floorId: string;
  departmentId: string;
  roomId: string;
  floorOrder: string;
  capacity: string;
  rackUnits: string;
  phone: string;
  email: string;
  postalCode: string;
  street: string;
  streetNumber: string;
  complement: string;
  district: string;
  city: string;
  state: string;
  country: string;
};

type EditorState = {
  kind: MasterKind;
  recordId: string | null;
};

const emptyCompanyForm: CompanyForm = {
  name: "",
  tradeName: "",
  legalName: "",
  cnpj: "",
  stateRegistration: "",
  municipalRegistration: "",
  phone: "",
  whatsapp: "",
  email: "",
  website: "",
  postalCode: "",
  street: "",
  streetNumber: "",
  complement: "",
  district: "",
  city: "",
  state: "",
  country: "Brasil",
};

const emptyMasterForm: MasterForm = {
  name: "",
  code: "",
  description: "",
  isActive: true,
  categoryId: "",
  manufacturerId: "",
  modelNumber: "",
  partNumber: "",
  expectedLifeMonths: "",
  defaultWarrantyMonths: "",
  website: "",
  supportUrl: "",
  supportPhone: "",
  notes: "",
  unitId: "",
  buildingId: "",
  floorId: "",
  departmentId: "",
  roomId: "",
  floorOrder: "0",
  capacity: "",
  rackUnits: "",
  phone: "",
  email: "",
  postalCode: "",
  street: "",
  streetNumber: "",
  complement: "",
  district: "",
  city: "",
  state: "",
  country: "Brasil",
};

const catalogLabels: Record<
  CatalogKind,
  {
    title: string;
    description: string;
    icon: "catalog" | "building" | "assets";
  }
> = {
  categories: {
    title: "Categorias",
    description: "Tipos de equipamentos usados nos formulários.",
    icon: "catalog",
  },
  manufacturers: {
    title: "Fabricantes",
    description: "Marcas, sites e contatos de suporte.",
    icon: "building",
  },
  models: {
    title: "Modelos",
    description: "Modelos vinculados à categoria e ao fabricante.",
    icon: "assets",
  },
};

const structureLabels: Record<
  StructureKind,
  {
    title: string;
    description: string;
    icon:
      | "building"
      | "locations"
      | "catalog"
      | "user"
      | "server"
      | "assets";
  }
> = {
  units: {
    title: "Unidades",
    description: "Filiais, sedes e seus endereços.",
    icon: "building",
  },
  buildings: {
    title: "Prédios",
    description: "Edificações pertencentes a cada unidade.",
    icon: "building",
  },
  floors: {
    title: "Andares",
    description: "Níveis existentes dentro dos prédios.",
    icon: "catalog",
  },
  departments: {
    title: "Setores",
    description: "Departamentos administrativos e operacionais.",
    icon: "user",
  },
  rooms: {
    title: "Salas",
    description: "Ambientes físicos vinculados aos andares.",
    icon: "locations",
  },
  racks: {
    title: "Racks",
    description: "Estruturas onde servidores e redes são instalados.",
    icon: "server",
  },
  workstations: {
    title: "Estações",
    description: "Posições de trabalho dentro das salas.",
    icon: "assets",
  },
};

function digitsOnly(value: string) {
  return value.replace(/\D/g, "");
}

function formatCnpj(value: string) {
  const digits = digitsOnly(value).slice(0, 14);

  return digits
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");
}

function formatPhone(value: string) {
  const digits = digitsOnly(value).slice(0, 11);

  if (digits.length <= 10) {
    return digits
      .replace(/^(\d{2})(\d)/, "($1) $2")
      .replace(/(\d{4})(\d)/, "$1-$2");
  }

  return digits
    .replace(/^(\d{2})(\d)/, "($1) $2")
    .replace(/(\d{5})(\d)/, "$1-$2");
}

function formatPostalCode(value: string) {
  return digitsOnly(value)
    .slice(0, 8)
    .replace(/(\d{5})(\d)/, "$1-$2");
}

function nullable(value: string) {
  const cleaned = value.trim();
  return cleaned || null;
}

function numberOrNull(value: string) {
  if (!value.trim()) return null;

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export default function SettingsPage({
  organization,
  onBack,
  onOrganizationUpdated,
}: Props) {
  const [section, setSection] =
    useState<SettingsSection>("company");
  const [catalogKind, setCatalogKind] =
    useState<CatalogKind>("categories");
  const [structureKind, setStructureKind] =
    useState<StructureKind>("units");

  const [companyForm, setCompanyForm] =
    useState<CompanyForm>(emptyCompanyForm);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState("");

  const [categories, setCategories] =
    useState<CategoryRecord[]>([]);
  const [manufacturers, setManufacturers] =
    useState<ManufacturerRecord[]>([]);
  const [models, setModels] = useState<ModelRecord[]>([]);
  const [units, setUnits] = useState<UnitRecord[]>([]);
  const [buildings, setBuildings] =
    useState<BuildingRecord[]>([]);
  const [floors, setFloors] = useState<FloorRecord[]>([]);
  const [departments, setDepartments] =
    useState<DepartmentRecord[]>([]);
  const [rooms, setRooms] = useState<RoomRecord[]>([]);
  const [racks, setRacks] = useState<RackRecord[]>([]);
  const [workstations, setWorkstations] =
    useState<WorkstationRecord[]>([]);

  const [editor, setEditor] = useState<EditorState | null>(
    null,
  );
  const [masterForm, setMasterForm] =
    useState<MasterForm>(emptyMasterForm);
  const [search, setSearch] = useState("");

  const [isLoading, setIsLoading] = useState(true);
  const [isSavingCompany, setIsSavingCompany] =
    useState(false);
  const [isSavingMaster, setIsSavingMaster] =
    useState(false);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error" | "warning";
    text: string;
  } | null>(null);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setFeedback(null);

    const organizationId = organization.organizationId;

    const [
      organizationResult,
      categoriesResult,
      manufacturersResult,
      modelsResult,
      unitsResult,
      buildingsResult,
      floorsResult,
      departmentsResult,
      roomsResult,
      racksResult,
      workstationsResult,
    ] = await Promise.all([
      supabase
        .from("organizations")
        .select(
          "id,name,trade_name,legal_name,cnpj,state_registration,municipal_registration,phone,whatsapp,email,website,postal_code,street,street_number,complement,district,city,state,country,logo_url,logo_path",
        )
        .eq("id", organizationId)
        .single(),
      supabase
        .from("asset_categories")
        .select(
          "id,name,code,description,icon_name,is_active",
        )
        .eq("organization_id", organizationId)
        .order("name"),
      supabase
        .from("manufacturers")
        .select(
          "id,name,website,support_url,support_phone,notes,is_active",
        )
        .eq("organization_id", organizationId)
        .order("name"),
      supabase
        .from("asset_models")
        .select(
          "id,name,category_id,manufacturer_id,model_number,part_number,description,expected_life_months,default_warranty_months,is_active",
        )
        .eq("organization_id", organizationId)
        .order("name"),
      supabase
        .from("organization_units")
        .select("*")
        .eq("organization_id", organizationId)
        .order("name"),
      supabase
        .from("buildings")
        .select("id,name,code,description,unit_id,is_active")
        .eq("organization_id", organizationId)
        .order("name"),
      supabase
        .from("floors")
        .select(
          "id,name,description,building_id,floor_order,is_active",
        )
        .eq("organization_id", organizationId)
        .order("floor_order"),
      supabase
        .from("departments")
        .select(
          "id,name,code,description,unit_id,is_active",
        )
        .eq("organization_id", organizationId)
        .order("name"),
      supabase
        .from("rooms")
        .select(
          "id,name,code,description,floor_id,department_id,capacity,is_active",
        )
        .eq("organization_id", organizationId)
        .order("name"),
      supabase
        .from("racks")
        .select(
          "id,name,code,description,room_id,rack_units,is_active",
        )
        .eq("organization_id", organizationId)
        .order("name"),
      supabase
        .from("workstations")
        .select(
          "id,name,code,description,room_id,is_active",
        )
        .eq("organization_id", organizationId)
        .order("name"),
    ]);

    const firstError = [
      organizationResult.error,
      categoriesResult.error,
      manufacturersResult.error,
      modelsResult.error,
      unitsResult.error,
      buildingsResult.error,
      floorsResult.error,
      departmentsResult.error,
      roomsResult.error,
      racksResult.error,
      workstationsResult.error,
    ].find(Boolean);

    if (firstError) {
      setFeedback({
        type: "error",
        text: firstError.message,
      });
      setIsLoading(false);
      return;
    }

    const company = organizationResult.data;

    if (!company) {
      setFeedback({
        type: "error",
        text: "Os dados da empresa não foram encontrados.",
      });
      setIsLoading(false);
      return;
    }

    setCompanyForm({
      name: company.name ?? "",
      tradeName: company.trade_name ?? "",
      legalName: company.legal_name ?? "",
      cnpj: company.cnpj ?? "",
      stateRegistration: company.state_registration ?? "",
      municipalRegistration:
        company.municipal_registration ?? "",
      phone: company.phone ?? "",
      whatsapp: company.whatsapp ?? "",
      email: company.email ?? "",
      website: company.website ?? "",
      postalCode: company.postal_code ?? "",
      street: company.street ?? "",
      streetNumber: company.street_number ?? "",
      complement: company.complement ?? "",
      district: company.district ?? "",
      city: company.city ?? "",
      state: company.state ?? "",
      country: company.country ?? "Brasil",
    });

    setLogoPreview(company.logo_url ?? "");
    setCategories(
      (categoriesResult.data ?? []) as CategoryRecord[],
    );
    setManufacturers(
      (manufacturersResult.data ?? []) as ManufacturerRecord[],
    );
    setModels((modelsResult.data ?? []) as ModelRecord[]);
    setUnits((unitsResult.data ?? []) as UnitRecord[]);
    setBuildings(
      (buildingsResult.data ?? []) as BuildingRecord[],
    );
    setFloors((floorsResult.data ?? []) as FloorRecord[]);
    setDepartments(
      (departmentsResult.data ?? []) as DepartmentRecord[],
    );
    setRooms((roomsResult.data ?? []) as RoomRecord[]);
    setRacks((racksResult.data ?? []) as RackRecord[]);
    setWorkstations(
      (workstationsResult.data ?? []) as WorkstationRecord[],
    );

    setIsLoading(false);
  }, [organization.organizationId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    return () => {
      if (logoFile && logoPreview.startsWith("blob:")) {
        URL.revokeObjectURL(logoPreview);
      }
    };
  }, [logoFile, logoPreview]);

  const activeKind: MasterKind =
    section === "catalogs" ? catalogKind : structureKind;

  const activeRecords = useMemo<BaseRecord[]>(() => {
    const map: Record<MasterKind, BaseRecord[]> = {
      categories,
      manufacturers,
      models,
      units,
      buildings,
      floors,
      departments,
      rooms,
      racks,
      workstations,
    };

    return map[activeKind];
  }, [
    activeKind,
    categories,
    manufacturers,
    models,
    units,
    buildings,
    floors,
    departments,
    rooms,
    racks,
    workstations,
  ]);

  const filteredRecords = useMemo(() => {
    const normalized = search.trim().toLowerCase();

    if (!normalized) return activeRecords;

    return activeRecords.filter((record) =>
      [
        record.name,
        record.code,
        record.description,
      ]
        .filter(Boolean)
        .some((value) =>
          String(value).toLowerCase().includes(normalized),
        ),
    );
  }, [activeRecords, search]);

  const unitName = (id: string | null | undefined) =>
    units.find((item) => item.id === id)?.name ??
    "Não definida";

  const buildingName = (id: string | null | undefined) =>
    buildings.find((item) => item.id === id)?.name ??
    "Não definido";

  const floorName = (id: string | null | undefined) =>
    floors.find((item) => item.id === id)?.name ??
    "Não definido";

  const roomName = (id: string | null | undefined) =>
    rooms.find((item) => item.id === id)?.name ??
    "Não definida";

  const categoryName = (id: string | null | undefined) =>
    categories.find((item) => item.id === id)?.name ??
    "Não definida";

  const manufacturerName = (
    id: string | null | undefined,
  ) =>
    manufacturers.find((item) => item.id === id)?.name ??
    "Não definido";

  const handleLogoSelection = (
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];

    if (!file) return;

    if (file.type !== "image/png") {
      setFeedback({
        type: "error",
        text: "A logomarca deve estar no formato PNG.",
      });
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      setFeedback({
        type: "error",
        text: "A logomarca deve ter no máximo 2 MB.",
      });
      return;
    }

    if (logoPreview.startsWith("blob:")) {
      URL.revokeObjectURL(logoPreview);
    }

    setLogoFile(file);
    setLogoPreview(URL.createObjectURL(file));
    setFeedback(null);
  };

  const saveCompany = async (
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();
    setFeedback(null);

    if (!companyForm.name.trim()) {
      setFeedback({
        type: "error",
        text: "Informe o nome principal da empresa.",
      });
      return;
    }

    setIsSavingCompany(true);

    try {
      let logoUrl = organization.logoUrl;
      let logoPath = organization.logoPath;

      if (logoFile) {
        const newPath = `${
          organization.organizationId
        }/company-logo-${Date.now()}.png`;

        const { error: uploadError } = await supabase.storage
          .from("organization-branding")
          .upload(newPath, logoFile, {
            contentType: "image/png",
            cacheControl: "3600",
            upsert: false,
          });

        if (uploadError) throw uploadError;

        const { data: publicData } = supabase.storage
          .from("organization-branding")
          .getPublicUrl(newPath);

        logoUrl = publicData.publicUrl;
        logoPath = newPath;
      }

      const { error } = await supabase
        .from("organizations")
        .update({
          name: companyForm.name.trim(),
          trade_name: nullable(companyForm.tradeName),
          legal_name: nullable(companyForm.legalName),
          cnpj: nullable(companyForm.cnpj),
          state_registration: nullable(
            companyForm.stateRegistration,
          ),
          municipal_registration: nullable(
            companyForm.municipalRegistration,
          ),
          phone: nullable(companyForm.phone),
          whatsapp: nullable(companyForm.whatsapp),
          email: nullable(companyForm.email),
          website: nullable(companyForm.website),
          postal_code: nullable(companyForm.postalCode),
          street: nullable(companyForm.street),
          street_number: nullable(companyForm.streetNumber),
          complement: nullable(companyForm.complement),
          district: nullable(companyForm.district),
          city: nullable(companyForm.city),
          state: nullable(companyForm.state),
          country: nullable(companyForm.country) ?? "Brasil",
          logo_url: logoUrl,
          logo_path: logoPath,
        })
        .eq("id", organization.organizationId);

      if (error) throw error;

      if (
        logoFile &&
        organization.logoPath &&
        organization.logoPath !== logoPath
      ) {
        await supabase.storage
          .from("organization-branding")
          .remove([organization.logoPath]);
      }

      setLogoFile(null);
      await onOrganizationUpdated();
      await loadData();

      setFeedback({
        type: "success",
        text: "Dados e identidade visual da empresa atualizados.",
      });
    } catch (error) {
      setFeedback({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "Não foi possível salvar a empresa.",
      });
    } finally {
      setIsSavingCompany(false);
    }
  };

  const removeCompanyLogo = async () => {
    if (!organization.logoPath) {
      setLogoPreview("");
      setLogoFile(null);
      return;
    }

    const confirmed = window.confirm(
      "Remover a logomarca da empresa?",
    );

    if (!confirmed) return;

    const { error: updateError } = await supabase
      .from("organizations")
      .update({
        logo_url: null,
        logo_path: null,
      })
      .eq("id", organization.organizationId);

    if (updateError) {
      setFeedback({
        type: "error",
        text: updateError.message,
      });
      return;
    }

    await supabase.storage
      .from("organization-branding")
      .remove([organization.logoPath]);

    setLogoPreview("");
    setLogoFile(null);
    await onOrganizationUpdated();

    setFeedback({
      type: "success",
      text: "Logomarca removida.",
    });
  };

  const openNewEditor = () => {
    setMasterForm(emptyMasterForm);
    setEditor({
      kind: activeKind,
      recordId: null,
    });
    setFeedback(null);
  };

  const openEditEditor = (
    kind: MasterKind,
    record: BaseRecord,
  ) => {
    const form = { ...emptyMasterForm };

    form.name = record.name;
    form.code = record.code ?? "";
    form.description = record.description ?? "";
    form.isActive = record.is_active;

    if (kind === "manufacturers") {
      const item = record as ManufacturerRecord;
      form.website = item.website ?? "";
      form.supportUrl = item.support_url ?? "";
      form.supportPhone = item.support_phone ?? "";
      form.notes = item.notes ?? "";
    }

    if (kind === "models") {
      const item = record as ModelRecord;
      form.categoryId = item.category_id;
      form.manufacturerId = item.manufacturer_id ?? "";
      form.modelNumber = item.model_number ?? "";
      form.partNumber = item.part_number ?? "";
      form.expectedLifeMonths =
        item.expected_life_months?.toString() ?? "";
      form.defaultWarrantyMonths =
        item.default_warranty_months?.toString() ?? "";
    }

    if (kind === "units") {
      const item = record as UnitRecord;
      form.phone = item.phone ?? "";
      form.email = item.email ?? "";
      form.postalCode = item.postal_code ?? "";
      form.street = item.street ?? "";
      form.streetNumber = item.street_number ?? "";
      form.complement = item.complement ?? "";
      form.district = item.district ?? "";
      form.city = item.city ?? "";
      form.state = item.state ?? "";
      form.country = item.country ?? "Brasil";
    }

    if (kind === "buildings") {
      form.unitId = (record as BuildingRecord).unit_id;
    }

    if (kind === "floors") {
      const item = record as FloorRecord;
      form.buildingId = item.building_id;
      form.floorOrder = item.floor_order.toString();
    }

    if (kind === "departments") {
      form.unitId =
        (record as DepartmentRecord).unit_id ?? "";
    }

    if (kind === "rooms") {
      const item = record as RoomRecord;
      form.floorId = item.floor_id;
      form.departmentId = item.department_id ?? "";
      form.capacity = item.capacity?.toString() ?? "";
    }

    if (kind === "racks") {
      const item = record as RackRecord;
      form.roomId = item.room_id;
      form.rackUnits = item.rack_units?.toString() ?? "";
    }

    if (kind === "workstations") {
      form.roomId =
        (record as WorkstationRecord).room_id;
    }

    setMasterForm(form);
    setEditor({
      kind,
      recordId: record.id,
    });
    setFeedback(null);
  };

  const getTableName = (kind: MasterKind) => {
    const tables: Record<MasterKind, string> = {
      categories: "asset_categories",
      manufacturers: "manufacturers",
      models: "asset_models",
      units: "organization_units",
      buildings: "buildings",
      floors: "floors",
      departments: "departments",
      rooms: "rooms",
      racks: "racks",
      workstations: "workstations",
    };

    return tables[kind];
  };

  const buildPayload = (kind: MasterKind) => {
    const common = {
      organization_id: organization.organizationId,
      name: masterForm.name.trim(),
      is_active: masterForm.isActive,
    };

    if (kind === "categories") {
      return {
        ...common,
        code: nullable(masterForm.code),
        description: nullable(masterForm.description),
      };
    }

    if (kind === "manufacturers") {
      return {
        ...common,
        website: nullable(masterForm.website),
        support_url: nullable(masterForm.supportUrl),
        support_phone: nullable(masterForm.supportPhone),
        notes: nullable(masterForm.notes),
      };
    }

    if (kind === "models") {
      return {
        ...common,
        category_id: masterForm.categoryId,
        manufacturer_id:
          nullable(masterForm.manufacturerId),
        model_number: nullable(masterForm.modelNumber),
        part_number: nullable(masterForm.partNumber),
        description: nullable(masterForm.description),
        expected_life_months: numberOrNull(
          masterForm.expectedLifeMonths,
        ),
        default_warranty_months: numberOrNull(
          masterForm.defaultWarrantyMonths,
        ),
      };
    }

    if (kind === "units") {
      return {
        ...common,
        code: nullable(masterForm.code),
        description: nullable(masterForm.description),
        phone: nullable(masterForm.phone),
        email: nullable(masterForm.email),
        postal_code: nullable(masterForm.postalCode),
        street: nullable(masterForm.street),
        street_number: nullable(masterForm.streetNumber),
        complement: nullable(masterForm.complement),
        district: nullable(masterForm.district),
        city: nullable(masterForm.city),
        state: nullable(masterForm.state),
        country: nullable(masterForm.country) ?? "Brasil",
      };
    }

    if (kind === "buildings") {
      return {
        ...common,
        unit_id: masterForm.unitId,
        code: nullable(masterForm.code),
        description: nullable(masterForm.description),
      };
    }

    if (kind === "floors") {
      return {
        ...common,
        building_id: masterForm.buildingId,
        floor_order: numberOrNull(masterForm.floorOrder) ?? 0,
        description: nullable(masterForm.description),
      };
    }

    if (kind === "departments") {
      return {
        ...common,
        unit_id: nullable(masterForm.unitId),
        code: nullable(masterForm.code),
        description: nullable(masterForm.description),
      };
    }

    if (kind === "rooms") {
      return {
        ...common,
        floor_id: masterForm.floorId,
        department_id:
          nullable(masterForm.departmentId),
        code: nullable(masterForm.code),
        capacity: numberOrNull(masterForm.capacity),
        description: nullable(masterForm.description),
      };
    }

    if (kind === "racks") {
      return {
        ...common,
        room_id: masterForm.roomId,
        code: nullable(masterForm.code),
        rack_units: numberOrNull(masterForm.rackUnits),
        description: nullable(masterForm.description),
      };
    }

    return {
      ...common,
      room_id: masterForm.roomId,
      code: nullable(masterForm.code),
      description: nullable(masterForm.description),
    };
  };

  const validateMasterForm = (kind: MasterKind) => {
    if (!masterForm.name.trim()) {
      return "Informe o nome do cadastro.";
    }

    if (kind === "models" && !masterForm.categoryId) {
      return "Selecione a categoria do modelo.";
    }

    if (kind === "buildings" && !masterForm.unitId) {
      return "Selecione a unidade do prédio.";
    }

    if (kind === "floors" && !masterForm.buildingId) {
      return "Selecione o prédio do andar.";
    }

    if (kind === "rooms" && !masterForm.floorId) {
      return "Selecione o andar da sala.";
    }

    if (
      ["racks", "workstations"].includes(kind) &&
      !masterForm.roomId
    ) {
      return "Selecione a sala.";
    }

    return null;
  };

  const saveMaster = async (
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();

    if (!editor) return;

    const validation = validateMasterForm(editor.kind);

    if (validation) {
      setFeedback({
        type: "error",
        text: validation,
      });
      return;
    }

    setIsSavingMaster(true);
    setFeedback(null);

    try {
      const tableName = getTableName(editor.kind);
      const payload = buildPayload(editor.kind);

      const query = editor.recordId
        ? supabase
            .from(tableName)
            .update(payload as never)
            .eq("id", editor.recordId)
            .eq(
              "organization_id",
              organization.organizationId,
            )
        : supabase
            .from(tableName)
            .insert(payload as never);

      const { error } = await query;

      if (error) throw error;

      setEditor(null);
      await loadData();

      setFeedback({
        type: "success",
        text: editor.recordId
          ? "Cadastro atualizado com sucesso."
          : "Cadastro criado com sucesso.",
      });
    } catch (error) {
      setFeedback({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "Não foi possível salvar o cadastro.",
      });
    } finally {
      setIsSavingMaster(false);
    }
  };

  const toggleActive = async (
    kind: MasterKind,
    record: BaseRecord,
  ) => {
    const tableName = getTableName(kind);

    const { error } = await supabase
      .from(tableName)
      .update({
        is_active: !record.is_active,
      })
      .eq("id", record.id)
      .eq(
        "organization_id",
        organization.organizationId,
      );

    if (error) {
      setFeedback({
        type: "error",
        text: error.message,
      });
      return;
    }

    await loadData();

    setFeedback({
      type: "success",
      text: record.is_active
        ? "Cadastro desativado."
        : "Cadastro reativado.",
    });
  };

  const recordSubtitle = (
    kind: MasterKind,
    record: BaseRecord,
  ) => {
    if (kind === "models") {
      const item = record as ModelRecord;
      return `${categoryName(
        item.category_id,
      )} · ${manufacturerName(item.manufacturer_id)}`;
    }

    if (kind === "buildings") {
      return unitName((record as BuildingRecord).unit_id);
    }

    if (kind === "floors") {
      return buildingName(
        (record as FloorRecord).building_id,
      );
    }

    if (kind === "departments") {
      return unitName(
        (record as DepartmentRecord).unit_id,
      );
    }

    if (kind === "rooms") {
      return floorName((record as RoomRecord).floor_id);
    }

    if (kind === "racks") {
      return roomName((record as RackRecord).room_id);
    }

    if (kind === "workstations") {
      return roomName(
        (record as WorkstationRecord).room_id,
      );
    }

    return record.code || record.description || "Sem detalhes";
  };

  const currentLabel =
    section === "catalogs"
      ? catalogLabels[catalogKind]
      : structureLabels[structureKind];

  const renderEditorFields = () => {
    if (!editor) return null;

    const kind = editor.kind;

    return (
      <>
        <label>
          <span>Nome *</span>
          <input
            value={masterForm.name}
            onChange={(event) =>
              setMasterForm({
                ...masterForm,
                name: event.target.value,
              })
            }
          />
        </label>

        {["categories", "units", "buildings", "departments", "rooms", "racks", "workstations"].includes(
          kind,
        ) && (
          <label>
            <span>Código</span>
            <input
              value={masterForm.code}
              onChange={(event) =>
                setMasterForm({
                  ...masterForm,
                  code: event.target.value,
                })
              }
            />
          </label>
        )}

        {kind === "manufacturers" && (
          <>
            <label>
              <span>Site</span>
              <input
                value={masterForm.website}
                onChange={(event) =>
                  setMasterForm({
                    ...masterForm,
                    website: event.target.value,
                  })
                }
                placeholder="https://"
              />
            </label>

            <label>
              <span>Portal de suporte</span>
              <input
                value={masterForm.supportUrl}
                onChange={(event) =>
                  setMasterForm({
                    ...masterForm,
                    supportUrl: event.target.value,
                  })
                }
                placeholder="https://"
              />
            </label>

            <label>
              <span>Telefone de suporte</span>
              <input
                value={masterForm.supportPhone}
                onChange={(event) =>
                  setMasterForm({
                    ...masterForm,
                    supportPhone: formatPhone(
                      event.target.value,
                    ),
                  })
                }
              />
            </label>
          </>
        )}

        {kind === "models" && (
          <>
            <label>
              <span>Categoria *</span>
              <select
                value={masterForm.categoryId}
                onChange={(event) =>
                  setMasterForm({
                    ...masterForm,
                    categoryId: event.target.value,
                  })
                }
              >
                <option value="">Selecione</option>
                {categories
                  .filter((item) => item.is_active)
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
              </select>
            </label>

            <label>
              <span>Fabricante</span>
              <select
                value={masterForm.manufacturerId}
                onChange={(event) =>
                  setMasterForm({
                    ...masterForm,
                    manufacturerId: event.target.value,
                  })
                }
              >
                <option value="">Não definido</option>
                {manufacturers
                  .filter((item) => item.is_active)
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
              </select>
            </label>

            <div className="two">
              <label>
                <span>Número do modelo</span>
                <input
                  value={masterForm.modelNumber}
                  onChange={(event) =>
                    setMasterForm({
                      ...masterForm,
                      modelNumber: event.target.value,
                    })
                  }
                />
              </label>

              <label>
                <span>Part Number</span>
                <input
                  value={masterForm.partNumber}
                  onChange={(event) =>
                    setMasterForm({
                      ...masterForm,
                      partNumber: event.target.value,
                    })
                  }
                />
              </label>
            </div>

            <div className="two">
              <label>
                <span>Vida útil em meses</span>
                <input
                  type="number"
                  min="0"
                  value={masterForm.expectedLifeMonths}
                  onChange={(event) =>
                    setMasterForm({
                      ...masterForm,
                      expectedLifeMonths:
                        event.target.value,
                    })
                  }
                />
              </label>

              <label>
                <span>Garantia padrão em meses</span>
                <input
                  type="number"
                  min="0"
                  value={
                    masterForm.defaultWarrantyMonths
                  }
                  onChange={(event) =>
                    setMasterForm({
                      ...masterForm,
                      defaultWarrantyMonths:
                        event.target.value,
                    })
                  }
                />
              </label>
            </div>
          </>
        )}

        {kind === "units" && (
          <>
            <div className="two">
              <label>
                <span>Telefone</span>
                <input
                  value={masterForm.phone}
                  onChange={(event) =>
                    setMasterForm({
                      ...masterForm,
                      phone: formatPhone(event.target.value),
                    })
                  }
                />
              </label>

              <label>
                <span>E-mail</span>
                <input
                  type="email"
                  value={masterForm.email}
                  onChange={(event) =>
                    setMasterForm({
                      ...masterForm,
                      email: event.target.value,
                    })
                  }
                />
              </label>
            </div>

            <div className="three">
              <label>
                <span>CEP</span>
                <input
                  value={masterForm.postalCode}
                  onChange={(event) =>
                    setMasterForm({
                      ...masterForm,
                      postalCode: formatPostalCode(
                        event.target.value,
                      ),
                    })
                  }
                />
              </label>

              <label className="grow">
                <span>Logradouro</span>
                <input
                  value={masterForm.street}
                  onChange={(event) =>
                    setMasterForm({
                      ...masterForm,
                      street: event.target.value,
                    })
                  }
                />
              </label>

              <label>
                <span>Número</span>
                <input
                  value={masterForm.streetNumber}
                  onChange={(event) =>
                    setMasterForm({
                      ...masterForm,
                      streetNumber: event.target.value,
                    })
                  }
                />
              </label>
            </div>

            <div className="three">
              <label>
                <span>Bairro</span>
                <input
                  value={masterForm.district}
                  onChange={(event) =>
                    setMasterForm({
                      ...masterForm,
                      district: event.target.value,
                    })
                  }
                />
              </label>

              <label>
                <span>Cidade</span>
                <input
                  value={masterForm.city}
                  onChange={(event) =>
                    setMasterForm({
                      ...masterForm,
                      city: event.target.value,
                    })
                  }
                />
              </label>

              <label>
                <span>Estado</span>
                <input
                  maxLength={2}
                  value={masterForm.state}
                  onChange={(event) =>
                    setMasterForm({
                      ...masterForm,
                      state: event.target.value.toUpperCase(),
                    })
                  }
                />
              </label>
            </div>

            <label>
              <span>Complemento</span>
              <input
                value={masterForm.complement}
                onChange={(event) =>
                  setMasterForm({
                    ...masterForm,
                    complement: event.target.value,
                  })
                }
              />
            </label>
          </>
        )}

        {kind === "buildings" && (
          <label>
            <span>Unidade *</span>
            <select
              value={masterForm.unitId}
              onChange={(event) =>
                setMasterForm({
                  ...masterForm,
                  unitId: event.target.value,
                })
              }
            >
              <option value="">Selecione</option>
              {units
                .filter((item) => item.is_active)
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
            </select>
          </label>
        )}

        {kind === "floors" && (
          <div className="two">
            <label>
              <span>Prédio *</span>
              <select
                value={masterForm.buildingId}
                onChange={(event) =>
                  setMasterForm({
                    ...masterForm,
                    buildingId: event.target.value,
                  })
                }
              >
                <option value="">Selecione</option>
                {buildings
                  .filter((item) => item.is_active)
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name} · {unitName(item.unit_id)}
                    </option>
                  ))}
              </select>
            </label>

            <label>
              <span>Ordem do andar</span>
              <input
                type="number"
                value={masterForm.floorOrder}
                onChange={(event) =>
                  setMasterForm({
                    ...masterForm,
                    floorOrder: event.target.value,
                  })
                }
              />
            </label>
          </div>
        )}

        {kind === "departments" && (
          <label>
            <span>Unidade</span>
            <select
              value={masterForm.unitId}
              onChange={(event) =>
                setMasterForm({
                  ...masterForm,
                  unitId: event.target.value,
                })
              }
            >
              <option value="">Todas ou não definida</option>
              {units
                .filter((item) => item.is_active)
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
            </select>
          </label>
        )}

        {kind === "rooms" && (
          <>
            <label>
              <span>Andar *</span>
              <select
                value={masterForm.floorId}
                onChange={(event) =>
                  setMasterForm({
                    ...masterForm,
                    floorId: event.target.value,
                  })
                }
              >
                <option value="">Selecione</option>
                {floors
                  .filter((item) => item.is_active)
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name} ·{" "}
                      {buildingName(item.building_id)}
                    </option>
                  ))}
              </select>
            </label>

            <div className="two">
              <label>
                <span>Setor</span>
                <select
                  value={masterForm.departmentId}
                  onChange={(event) =>
                    setMasterForm({
                      ...masterForm,
                      departmentId: event.target.value,
                    })
                  }
                >
                  <option value="">Não definido</option>
                  {departments
                    .filter((item) => item.is_active)
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                </select>
              </label>

              <label>
                <span>Capacidade</span>
                <input
                  type="number"
                  min="0"
                  value={masterForm.capacity}
                  onChange={(event) =>
                    setMasterForm({
                      ...masterForm,
                      capacity: event.target.value,
                    })
                  }
                />
              </label>
            </div>
          </>
        )}

        {["racks", "workstations"].includes(kind) && (
          <label>
            <span>Sala *</span>
            <select
              value={masterForm.roomId}
              onChange={(event) =>
                setMasterForm({
                  ...masterForm,
                  roomId: event.target.value,
                })
              }
            >
              <option value="">Selecione</option>
              {rooms
                .filter((item) => item.is_active)
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} · {floorName(item.floor_id)}
                  </option>
                ))}
            </select>
          </label>
        )}

        {kind === "racks" && (
          <label>
            <span>Quantidade de U</span>
            <input
              type="number"
              min="0"
              value={masterForm.rackUnits}
              onChange={(event) =>
                setMasterForm({
                  ...masterForm,
                  rackUnits: event.target.value,
                })
              }
            />
          </label>
        )}

        {!["manufacturers", "units"].includes(kind) && (
          <label>
            <span>Descrição</span>
            <textarea
              rows={4}
              value={masterForm.description}
              onChange={(event) =>
                setMasterForm({
                  ...masterForm,
                  description: event.target.value,
                })
              }
            />
          </label>
        )}

        {kind === "manufacturers" && (
          <label>
            <span>Observações</span>
            <textarea
              rows={4}
              value={masterForm.notes}
              onChange={(event) =>
                setMasterForm({
                  ...masterForm,
                  notes: event.target.value,
                })
              }
            />
          </label>
        )}

        <label className="settings-active-field">
          <input
            type="checkbox"
            checked={masterForm.isActive}
            onChange={(event) =>
              setMasterForm({
                ...masterForm,
                isActive: event.target.checked,
              })
            }
          />
          <span>Cadastro ativo e disponível nas listas</span>
        </label>
      </>
    );
  };

  return (
    <main className="ativelo-settings-page">
      <header className="ativelo-settings-header">
        <div>
          <button type="button" onClick={onBack}>
            ← Voltar ao painel
          </button>
          <p>CENTRAL DE CONFIGURAÇÃO</p>
          <h1>Empresa e cadastros</h1>
          <span>
            Um único ambiente para identidade, listas suspensas,
            catálogos e estrutura física.
          </span>
        </div>

        <OrganizationBrand
          organization={organization}
          compact
          showLegalName
        />
      </header>

      <nav className="ativelo-settings-sections">
        <button
          className={section === "company" ? "active" : ""}
          type="button"
          onClick={() => setSection("company")}
        >
          <AppIcon name="building" size={21} />
          <span>
            <strong>Empresa e marca</strong>
            <small>Dados institucionais e logomarca</small>
          </span>
        </button>

        <button
          className={section === "catalogs" ? "active" : ""}
          type="button"
          onClick={() => setSection("catalogs")}
        >
          <AppIcon name="catalog" size={21} />
          <span>
            <strong>Catálogos de TI</strong>
            <small>Categorias, fabricantes e modelos</small>
          </span>
        </button>

        <button
          className={section === "structure" ? "active" : ""}
          type="button"
          onClick={() => setSection("structure")}
        >
          <AppIcon name="locations" size={21} />
          <span>
            <strong>Estrutura da empresa</strong>
            <small>Unidades, setores e localizações</small>
          </span>
        </button>

        <button
          className={
            section === "communication" ? "active" : ""
          }
          type="button"
          onClick={() => setSection("communication")}
        >
          <AppIcon name="mail" size={21} />
          <span>
            <strong>Comunicação e convites</strong>
            <small>E-mail, WhatsApp e identidade</small>
          </span>
        </button>
      </nav>

      {feedback && (
        <div
          className={`ativelo-settings-feedback ${feedback.type}`}
        >
          {feedback.text}
        </div>
      )}

      {isLoading ? (
        <section className="ativelo-settings-loading">
          Carregando configurações...
        </section>
      ) : section === "communication" ? (
        <CommunicationSettingsPanel
          organization={organization}
        />
      ) : section === "company" ? (
        <form
          className="ativelo-company-settings"
          onSubmit={saveCompany}
        >
          <section className="ativelo-company-brand-card">
            <div className="ativelo-company-logo-preview">
              {logoPreview ? (
                <img
                  src={logoPreview}
                  alt="Prévia da logomarca"
                />
              ) : (
                <div>
                  <AppIcon name="image" size={36} />
                  <strong>Sem logomarca</strong>
                </div>
              )}
            </div>

            <div className="ativelo-company-logo-actions">
              <span>Logomarca da empresa</span>
              <p>
                Use PNG com fundo transparente ou branco. Limite de
                2 MB.
              </p>

              <label>
                <AppIcon name="image" size={18} />
                Selecionar PNG
                <input
                  type="file"
                  accept="image/png"
                  onChange={handleLogoSelection}
                />
              </label>

              {(logoPreview || organization.logoUrl) && (
                <button
                  type="button"
                  onClick={() => void removeCompanyLogo()}
                >
                  <AppIcon name="trash" size={17} />
                  Remover logo
                </button>
              )}
            </div>

            <div className="ativelo-brand-hierarchy-preview">
              <span>Prévia da hierarquia de marca</span>
              <OrganizationBrand
                organization={{
                  ...organization,
                  organizationName:
                    companyForm.name ||
                    organization.organizationName,
                  tradeName:
                    companyForm.tradeName || null,
                  legalName:
                    companyForm.legalName || null,
                  cnpj: companyForm.cnpj || null,
                  logoUrl:
                    logoPreview || organization.logoUrl,
                }}
                showLegalName
              />

              <div className="ativelo-platform-signature">
                <small>Plataforma de gestão</small>
                <img
                  src="/assets/ativelo-logo.png"
                  alt="Ativelo"
                />
              </div>
            </div>
          </section>

          <section className="ativelo-company-form-card">
            <div className="ativelo-settings-card-heading">
              <div>
                <span>IDENTIFICAÇÃO</span>
                <h2>Dados da empresa</h2>
              </div>
            </div>

            <div className="three">
              <label>
                <span>Nome principal *</span>
                <input
                  value={companyForm.name}
                  onChange={(event) =>
                    setCompanyForm({
                      ...companyForm,
                      name: event.target.value,
                    })
                  }
                />
              </label>

              <label>
                <span>Nome fantasia</span>
                <input
                  value={companyForm.tradeName}
                  onChange={(event) =>
                    setCompanyForm({
                      ...companyForm,
                      tradeName: event.target.value,
                    })
                  }
                />
              </label>

              <label>
                <span>Razão social</span>
                <input
                  value={companyForm.legalName}
                  onChange={(event) =>
                    setCompanyForm({
                      ...companyForm,
                      legalName: event.target.value,
                    })
                  }
                />
              </label>
            </div>

            <div className="three">
              <label>
                <span>CNPJ</span>
                <input
                  value={companyForm.cnpj}
                  onChange={(event) =>
                    setCompanyForm({
                      ...companyForm,
                      cnpj: formatCnpj(event.target.value),
                    })
                  }
                  placeholder="00.000.000/0000-00"
                />
              </label>

              <label>
                <span>Inscrição estadual</span>
                <input
                  value={companyForm.stateRegistration}
                  onChange={(event) =>
                    setCompanyForm({
                      ...companyForm,
                      stateRegistration: event.target.value,
                    })
                  }
                />
              </label>

              <label>
                <span>Inscrição municipal</span>
                <input
                  value={companyForm.municipalRegistration}
                  onChange={(event) =>
                    setCompanyForm({
                      ...companyForm,
                      municipalRegistration:
                        event.target.value,
                    })
                  }
                />
              </label>
            </div>

            <div className="three">
              <label>
                <span>Telefone</span>
                <input
                  value={companyForm.phone}
                  onChange={(event) =>
                    setCompanyForm({
                      ...companyForm,
                      phone: formatPhone(event.target.value),
                    })
                  }
                />
              </label>

              <label>
                <span>WhatsApp</span>
                <input
                  value={companyForm.whatsapp}
                  onChange={(event) =>
                    setCompanyForm({
                      ...companyForm,
                      whatsapp: formatPhone(
                        event.target.value,
                      ),
                    })
                  }
                />
              </label>

              <label>
                <span>E-mail institucional</span>
                <input
                  type="email"
                  value={companyForm.email}
                  onChange={(event) =>
                    setCompanyForm({
                      ...companyForm,
                      email: event.target.value,
                    })
                  }
                />
              </label>
            </div>

            <label>
              <span>Site</span>
              <input
                value={companyForm.website}
                onChange={(event) =>
                  setCompanyForm({
                    ...companyForm,
                    website: event.target.value,
                  })
                }
                placeholder="https://"
              />
            </label>
          </section>

          <section className="ativelo-company-form-card">
            <div className="ativelo-settings-card-heading">
              <div>
                <span>ENDEREÇO PRINCIPAL</span>
                <h2>Localização institucional</h2>
              </div>
            </div>

            <div className="three address">
              <label>
                <span>CEP</span>
                <input
                  value={companyForm.postalCode}
                  onChange={(event) =>
                    setCompanyForm({
                      ...companyForm,
                      postalCode: formatPostalCode(
                        event.target.value,
                      ),
                    })
                  }
                />
              </label>

              <label className="grow">
                <span>Logradouro</span>
                <input
                  value={companyForm.street}
                  onChange={(event) =>
                    setCompanyForm({
                      ...companyForm,
                      street: event.target.value,
                    })
                  }
                />
              </label>

              <label>
                <span>Número</span>
                <input
                  value={companyForm.streetNumber}
                  onChange={(event) =>
                    setCompanyForm({
                      ...companyForm,
                      streetNumber: event.target.value,
                    })
                  }
                />
              </label>
            </div>

            <div className="four">
              <label>
                <span>Complemento</span>
                <input
                  value={companyForm.complement}
                  onChange={(event) =>
                    setCompanyForm({
                      ...companyForm,
                      complement: event.target.value,
                    })
                  }
                />
              </label>

              <label>
                <span>Bairro</span>
                <input
                  value={companyForm.district}
                  onChange={(event) =>
                    setCompanyForm({
                      ...companyForm,
                      district: event.target.value,
                    })
                  }
                />
              </label>

              <label>
                <span>Cidade</span>
                <input
                  value={companyForm.city}
                  onChange={(event) =>
                    setCompanyForm({
                      ...companyForm,
                      city: event.target.value,
                    })
                  }
                />
              </label>

              <label>
                <span>Estado</span>
                <input
                  maxLength={2}
                  value={companyForm.state}
                  onChange={(event) =>
                    setCompanyForm({
                      ...companyForm,
                      state: event.target.value.toUpperCase(),
                    })
                  }
                />
              </label>
            </div>

            <footer>
              <button
                type="submit"
                className="primary"
                disabled={isSavingCompany}
              >
                <AppIcon name="save" size={18} />
                {isSavingCompany
                  ? "Salvando..."
                  : "Salvar empresa e marca"}
              </button>
            </footer>
          </section>
        </form>
      ) : (
        <section className="ativelo-master-layout">
          <aside className="ativelo-master-navigation">
            <span>
              {section === "catalogs"
                ? "CATÁLOGOS DE TI"
                : "ESTRUTURA FÍSICA"}
            </span>

            {(section === "catalogs"
              ? Object.entries(catalogLabels)
              : Object.entries(structureLabels)
            ).map(([key, item]) => (
              <button
                className={
                  activeKind === key ? "active" : ""
                }
                type="button"
                key={key}
                onClick={() => {
                  setSearch("");

                  if (section === "catalogs") {
                    setCatalogKind(key as CatalogKind);
                  } else {
                    setStructureKind(key as StructureKind);
                  }
                }}
              >
                <i>
                  <AppIcon
                    name={item.icon}
                    size={21}
                  />
                </i>
                <span>
                  <strong>{item.title}</strong>
                  <small>{item.description}</small>
                </span>
              </button>
            ))}
          </aside>

          <section className="ativelo-master-content">
            <header>
              <div>
                <span>
                  {section === "catalogs"
                    ? "LISTAS DO INVENTÁRIO"
                    : "HIERARQUIA DE LOCALIZAÇÕES"}
                </span>
                <h2>{currentLabel.title}</h2>
                <p>{currentLabel.description}</p>
              </div>

              <button
                type="button"
                className="primary"
                onClick={openNewEditor}
              >
                <AppIcon name="plus" size={18} />
                Novo cadastro
              </button>
            </header>

            <div className="ativelo-master-toolbar">
              <label>
                <AppIcon name="search" size={19} />
                <input
                  value={search}
                  onChange={(event) =>
                    setSearch(event.target.value)
                  }
                  placeholder={`Buscar em ${currentLabel.title.toLowerCase()}`}
                />
              </label>

              <b>{filteredRecords.length} registro(s)</b>
            </div>

            {filteredRecords.length === 0 ? (
              <div className="ativelo-master-empty">
                <AppIcon
                  name={currentLabel.icon}
                  size={42}
                />
                <strong>Nenhum cadastro encontrado</strong>
                <span>
                  Use o botão “Novo cadastro” para começar.
                </span>
              </div>
            ) : (
              <div className="ativelo-master-list">
                {filteredRecords.map((record) => (
                  <article
                    className={
                      record.is_active ? "" : "inactive"
                    }
                    key={record.id}
                  >
                    <i>
                      <AppIcon
                        name={currentLabel.icon}
                        size={22}
                      />
                    </i>

                    <div>
                      <strong>{record.name}</strong>
                      <span>
                        {recordSubtitle(activeKind, record)}
                      </span>
                    </div>

                    <b>
                      {record.is_active
                        ? "Ativo"
                        : "Inativo"}
                    </b>

                    <footer>
                      <button
                        type="button"
                        onClick={() =>
                          openEditEditor(
                            activeKind,
                            record,
                          )
                        }
                      >
                        <AppIcon name="edit" size={16} />
                        Editar
                      </button>

                      <button
                        type="button"
                        className={
                          record.is_active
                            ? "deactivate"
                            : "activate"
                        }
                        onClick={() =>
                          void toggleActive(
                            activeKind,
                            record,
                          )
                        }
                      >
                        {record.is_active
                          ? "Desativar"
                          : "Reativar"}
                      </button>
                    </footer>
                  </article>
                ))}
              </div>
            )}
          </section>
        </section>
      )}

      {editor && (
        <div className="ativelo-modal-backdrop">
          <section
            className="ativelo-modal ativelo-settings-modal"
            role="dialog"
            aria-modal="true"
          >
            <header>
              <div>
                <span>
                  {editor.recordId
                    ? "EDITAR CADASTRO"
                    : "NOVO CADASTRO"}
                </span>
                <h2>
                  {
                    (editor.kind in catalogLabels
                      ? catalogLabels[
                          editor.kind as CatalogKind
                        ]
                      : structureLabels[
                          editor.kind as StructureKind
                        ]
                    ).title
                  }
                </h2>
              </div>

              <button
                type="button"
                onClick={() => setEditor(null)}
              >
                <AppIcon name="close" size={21} />
              </button>
            </header>

            <form onSubmit={saveMaster}>
              {renderEditorFields()}

              <footer>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setEditor(null)}
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  className="primary"
                  disabled={isSavingMaster}
                >
                  <AppIcon name="save" size={18} />
                  {isSavingMaster
                    ? "Salvando..."
                    : "Salvar cadastro"}
                </button>
              </footer>
            </form>
          </section>
        </div>
      )}
    </main>
  );
}
