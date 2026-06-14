export type AssetRecord = {
  id: string;
  public_id: string;
  qr_token: string;
  asset_number: string;
  name: string;
  serial_number: string | null;
  service_tag: string | null;
  operational_status: string;
  physical_condition: string;
  lifecycle_stage: string;
  criticality: string;
  assigned_person_name: string | null;
  category_id: string;
  manufacturer_id: string | null;
  model_id: string | null;
  unit_id: string | null;
  building_id: string | null;
  floor_id: string | null;
  department_id: string | null;
  room_id: string | null;
  rack_id: string | null;
  workstation_id: string | null;
  hostname: string | null;
  ip_address: string | null;
  mac_address: string | null;
  operating_system: string | null;
  purchase_date: string | null;
  acquisition_value: number | null;
  warranty_end_date: string | null;
  notes: string | null;
  created_at: string;
};

export type AssetPhotoRecord = {
  id: string;
  organization_id: string;
  asset_id: string;
  storage_path: string;
  original_filename: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  caption: string | null;
  is_primary: boolean;
  created_at: string;
  signed_url?: string;
};

export const statusLabels: Record<string, string> = {
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

export const conditionLabels: Record<string, string> = {
  new: "Novo",
  excellent: "Excelente",
  good: "Bom",
  fair: "Regular",
  poor: "Ruim",
  irrecoverable: "Irrecuperável",
};

export const lifecycleLabels: Record<string, string> = {
  requested: "Solicitado",
  purchased: "Comprado",
  received: "Recebido",
  stock: "Em estoque",
  prepared: "Preparado",
  deployed: "Implantado",
  operational: "Operacional",
  replacement: "Em substituição",
  withdrawn: "Retirado",
  disposed: "Descartado",
};
