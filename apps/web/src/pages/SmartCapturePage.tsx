import { useCallback, useEffect, useMemo, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { createWorker } from "tesseract.js";
import * as XLSX from "xlsx";
import type { OrganizationContext } from "../App";
import AppIcon from "../components/AppIcon";
import { supabase } from "../lib/supabase";

type Props = {
  organization: OrganizationContext;
  onBack: () => void;
  onOpenAsset: (assetId: string) => void;
};

type CaptureTab = "label" | "import";

type Option = {
  id: string;
  name: string;
};

type ModelOption = Option & {
  category_id: string;
  manufacturer_id: string | null;
};

type ParsedLabel = {
  manufacturer: string;
  model: string;
  serialNumber: string;
  serviceTag: string;
  productNumber: string;
  barcodeValue: string;
  categoryHint: string;
  processor: string;
  memory: string;
  storage: string;
  operatingSystem: string;
  rawText: string;
};

type CaptureForm = {
  assetNumber: string;
  name: string;
  categoryId: string;
  manufacturerId: string;
  modelId: string;
  serialNumber: string;
  serviceTag: string;
  productNumber: string;
  barcodeValue: string;
  unitId: string;
  processor: string;
  memory: string;
  storage: string;
  operatingSystem: string;
  notes: string;
};

type ImportRow = {
  rowNumber: number;
  assetNumber: string;
  name: string;
  categoryName: string;
  manufacturerName: string;
  modelName: string;
  serialNumber: string;
  serviceTag: string;
  productNumber: string;
  barcodeValue: string;
  unitName: string;
  hostname: string;
  ipAddress: string;
  macAddress: string;
  operatingSystem: string;
  assignedPersonName: string;
  assignedPersonEmail: string;
  purchaseDate: string;
  acquisitionValue: string;
  warrantyEndDate: string;
  operationalStatus: string;
  physicalCondition: string;
  lifecycleStage: string;
  criticality: string;
  notes: string;
  status: "ready" | "duplicate" | "invalid" | "imported" | "failed";
  message: string;
  sourceData: Record<string, unknown>;
};

type ExistingAsset = {
  asset_number: string;
  serial_number: string | null;
  service_tag: string | null;
};

const emptyParsedLabel: ParsedLabel = {
  manufacturer: "",
  model: "",
  serialNumber: "",
  serviceTag: "",
  productNumber: "",
  barcodeValue: "",
  categoryHint: "",
  processor: "",
  memory: "",
  storage: "",
  operatingSystem: "",
  rawText: "",
};

const emptyCaptureForm: CaptureForm = {
  assetNumber: "",
  name: "",
  categoryId: "",
  manufacturerId: "",
  modelId: "",
  serialNumber: "",
  serviceTag: "",
  productNumber: "",
  barcodeValue: "",
  unitId: "",
  processor: "",
  memory: "",
  storage: "",
  operatingSystem: "",
  notes: "",
};

const headerAliases = {
  assetNumber: [
    "patrimonio",
    "patrimônio",
    "numero patrimonial",
    "número patrimonial",
    "asset number",
    "asset_number",
    "codigo",
    "código",
  ],
  name: ["nome", "equipamento", "descricao", "descrição", "name"],
  categoryName: ["categoria", "category"],
  manufacturerName: ["fabricante", "marca", "manufacturer", "brand"],
  modelName: ["modelo", "model"],
  serialNumber: [
    "serial",
    "numero de serie",
    "número de série",
    "serial number",
    "serial_number",
    "s/n",
  ],
  serviceTag: ["service tag", "service_tag", "tag de servico", "tag de serviço"],
  productNumber: [
    "product number",
    "product_number",
    "numero do produto",
    "número do produto",
    "part number",
    "p/n",
  ],
  barcodeValue: ["codigo de barras", "código de barras", "barcode"],
  unitName: ["unidade", "unit"],
  hostname: ["hostname", "nome do computador", "computador"],
  ipAddress: ["ip", "endereco ip", "endereço ip", "ip_address"],
  macAddress: ["mac", "mac address", "endereco mac", "endereço mac"],
  operatingSystem: ["sistema operacional", "operating system", "os"],
  assignedPersonName: ["responsavel", "responsável", "usuario", "usuário"],
  assignedPersonEmail: ["email", "e-mail", "email do responsavel"],
  purchaseDate: ["data de compra", "purchase date"],
  acquisitionValue: ["valor", "valor de aquisicao", "valor de aquisição"],
  warrantyEndDate: ["fim da garantia", "garantia ate", "garantia até"],
  operationalStatus: ["status", "status operacional"],
  physicalCondition: ["condicao", "condição", "condicao fisica", "condição física"],
  lifecycleStage: ["ciclo de vida", "lifecycle"],
  criticality: ["criticidade", "criticality"],
  notes: ["observacoes", "observações", "notas", "notes"],
} satisfies Record<string, string[]>;

const operationalStatusAliases: Record<string, string> = {
  disponivel: "available",
  disponível: "available",
  available: "available",
  "em uso": "in_use",
  in_use: "in_use",
  emprestado: "loaned",
  loaned: "loaned",
  manutencao: "in_maintenance",
  manutenção: "in_maintenance",
  "em manutencao": "in_maintenance",
  "em manutenção": "in_maintenance",
  in_maintenance: "in_maintenance",
  defeito: "defective",
  defeituoso: "defective",
  defective: "defective",
  reservado: "reserved",
  reserved: "reserved",
  retirado: "retired",
  retired: "retired",
};

const conditionAliases: Record<string, string> = {
  novo: "new",
  new: "new",
  excelente: "excellent",
  excellent: "excellent",
  bom: "good",
  good: "good",
  regular: "fair",
  fair: "fair",
  ruim: "poor",
  poor: "poor",
  irrecuperavel: "irrecoverable",
  irrecuperável: "irrecoverable",
  irrecoverable: "irrecoverable",
};

const lifecycleAliases: Record<string, string> = {
  solicitado: "requested",
  requested: "requested",
  comprado: "purchased",
  purchased: "purchased",
  recebido: "received",
  received: "received",
  estoque: "stock",
  "em estoque": "stock",
  stock: "stock",
  preparado: "prepared",
  prepared: "prepared",
  implantado: "deployed",
  deployed: "deployed",
  operacional: "operational",
  operational: "operational",
  substituicao: "replacement",
  substituição: "replacement",
  replacement: "replacement",
  retirado: "withdrawn",
  withdrawn: "withdrawn",
  descartado: "disposed",
  disposed: "disposed",
};

const criticalityAliases: Record<string, string> = {
  baixa: "low",
  low: "low",
  media: "medium",
  média: "medium",
  medium: "medium",
  alta: "high",
  high: "high",
  critica: "critical",
  crítica: "critical",
  critical: "critical",
};

function normalizeText(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLowerCase();
}

function cleanValue(value: string) {
  return value
    .replace(/^[\s:;#-]+/, "")
    .replace(/[\s:;#-]+$/, "")
    .trim();
}

function extractFirst(text: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = text.match(pattern);

    if (match?.[1]) {
      return cleanValue(match[1]);
    }
  }

  return "";
}

function inferCategory(text: string) {
  const normalized = normalizeText(text);

  const rules = [
    { value: "Notebook", words: ["notebook", "laptop", "latitude", "thinkpad", "ideapad"] },
    { value: "Computador", words: ["desktop", "optiplex", "prodesk", "thinkcentre", "computer"] },
    { value: "Monitor", words: ["monitor", "display", "lcd", "led monitor"] },
    { value: "Impressora", words: ["printer", "impressora", "ecotank", "laserjet", "deskjet"] },
    { value: "Servidor", words: ["server", "servidor", "poweredge", "proliant"] },
    { value: "No-break", words: ["ups", "nobreak", "no-break", "uninterruptible"] },
    { value: "Switch", words: ["switch", "catalyst", "managed switch"] },
    { value: "Roteador", words: ["router", "roteador", "mikrotik"] },
    { value: "Projetor", words: ["projector", "projetor"] },
  ];

  return rules.find((rule) =>
    rule.words.some((word) => normalized.includes(normalizeText(word))),
  )?.value ?? "";
}

function parseFactoryLabel(rawText: string, barcodeValue: string): ParsedLabel {
  const compact = rawText.replace(/\r/g, "");
  const normalized = normalizeText(compact);

  const manufacturerNames = [
    "Dell",
    "HP",
    "Hewlett Packard",
    "Lenovo",
    "Acer",
    "Asus",
    "Epson",
    "Brother",
    "Samsung",
    "Canon",
    "Intel",
    "Cisco",
    "Fortinet",
    "Mikrotik",
    "APC",
    "SMS",
    "Apple",
    "LG",
    "Positivo",
  ];

  const manufacturer =
    manufacturerNames.find((name) =>
      normalized.includes(normalizeText(name)),
    ) ?? "";

  const serviceTag = extractFirst(compact, [
    /service\s*tag\s*[:#-]?\s*([A-Z0-9-]{4,30})/i,
    /express\s*service\s*code\s*[:#-]?\s*([A-Z0-9-]{4,30})/i,
  ]);

  const serialNumber = extractFirst(compact, [
    /serial\s*(?:number|no\.?|#)?\s*[:#-]?\s*([A-Z0-9._-]{4,50})/i,
    /\bS\/N\s*[:#-]?\s*([A-Z0-9._-]{4,50})/i,
    /\bSN\s*[:#-]?\s*([A-Z0-9._-]{4,50})/i,
  ]);

  const productNumber = extractFirst(compact, [
    /product\s*(?:number|no\.?|#)\s*[:#-]?\s*([A-Z0-9._-]{3,60})/i,
    /part\s*(?:number|no\.?|#)\s*[:#-]?\s*([A-Z0-9._-]{3,60})/i,
    /\bP\/N\s*[:#-]?\s*([A-Z0-9._-]{3,60})/i,
  ]);

  const model = extractFirst(compact, [
    /model\s*(?:name|number|no\.?|#)?\s*[:#-]?\s*([^\n]{3,80})/i,
    /product\s*name\s*[:#-]?\s*([^\n]{3,80})/i,
    /machine\s*type\s*model\s*[:#-]?\s*([^\n]{3,80})/i,
  ]);

  const processor = extractFirst(compact, [
    /\b((?:Intel\s+)?Core\s+i[3579][-\s]?\d{4,5}[A-Z]{0,3})\b/i,
    /\b((?:AMD\s+)?Ryzen\s+[3579]\s+\d{4,5}[A-Z]{0,3})\b/i,
    /\b((?:Intel\s+)?Xeon\s+[A-Z0-9 -]{4,30})\b/i,
  ]);

  const memory = extractFirst(compact, [
    /\b(\d{1,3}\s*GB\s*(?:DDR[345])?)\s*(?:RAM|MEMORY)?\b/i,
  ]);

  const storage = extractFirst(compact, [
    /\b(\d{2,4}\s*(?:GB|TB)\s*(?:SSD|HDD|NVME))\b/i,
    /\b((?:SSD|HDD|NVME)\s*\d{2,4}\s*(?:GB|TB))\b/i,
  ]);

  const operatingSystem = extractFirst(compact, [
    /\b(Windows\s+(?:10|11)\s*(?:Home|Pro|Professional|Enterprise)?)\b/i,
    /\b(Ubuntu\s+\d{2}\.\d{2})\b/i,
  ]);

  return {
    manufacturer,
    model: model.replace(/\s{2,}/g, " ").trim(),
    serialNumber,
    serviceTag,
    productNumber,
    barcodeValue,
    categoryHint: inferCategory(compact),
    processor,
    memory,
    storage,
    operatingSystem,
    rawText,
  };
}

function findByName<T extends Option>(items: T[], value: string) {
  const normalized = normalizeText(value);

  if (!normalized) return null;

  return (
    items.find((item) => normalizeText(item.name) === normalized) ??
    items.find((item) => normalized.includes(normalizeText(item.name))) ??
    items.find((item) => normalizeText(item.name).includes(normalized)) ??
    null
  );
}

function cellValue(
  row: Record<string, unknown>,
  aliases: string[],
) {
  const entry = Object.entries(row).find(([header]) =>
    aliases.includes(normalizeText(header)),
  );

  if (!entry) return "";

  const value = entry[1];

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  return String(value ?? "").trim();
}

function normalizeDate(value: string) {
  if (!value) return "";

  const direct = new Date(value);

  if (!Number.isNaN(direct.getTime())) {
    return direct.toISOString().slice(0, 10);
  }

  const match = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);

  if (!match) return "";

  return `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
}

function normalizeMoney(value: string) {
  if (!value) return null;

  const normalized = value
    .replace(/[^\d,.-]/g, "")
    .replace(/\.(?=\d{3}(?:\D|$))/g, "")
    .replace(",", ".");

  const number = Number(normalized);

  return Number.isFinite(number) ? number : null;
}

function safeStatus(
  value: string,
  aliases: Record<string, string>,
  fallback: string,
) {
  return aliases[normalizeText(value)] ?? fallback;
}

function escapeCsv(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

export default function SmartCapturePage({
  organization,
  onBack,
  onOpenAsset,
}: Props) {
  const [activeTab, setActiveTab] = useState<CaptureTab>("label");
  const [categories, setCategories] = useState<Option[]>([]);
  const [manufacturers, setManufacturers] = useState<Option[]>([]);
  const [models, setModels] = useState<ModelOption[]>([]);
  const [units, setUnits] = useState<Option[]>([]);

  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState("");
  const [parsedLabel, setParsedLabel] =
    useState<ParsedLabel>(emptyParsedLabel);
  const [captureForm, setCaptureForm] =
    useState<CaptureForm>(emptyCaptureForm);
  const [isReadingLabel, setIsReadingLabel] = useState(false);
  const [ocrStage, setOcrStage] = useState("");

  const [importFilename, setImportFilename] = useState("");
  const [importRows, setImportRows] = useState<ImportRow[]>([]);
  const [isReadingSpreadsheet, setIsReadingSpreadsheet] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);

  const [feedback, setFeedback] = useState<{
    type: "success" | "error" | "warning";
    text: string;
  } | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const loadCatalogs = useCallback(async () => {
    const organizationId = organization.organizationId;

    const [
      categoriesResult,
      manufacturersResult,
      modelsResult,
      unitsResult,
    ] = await Promise.all([
      supabase
        .from("asset_categories")
        .select("id,name")
        .eq("organization_id", organizationId)
        .eq("is_active", true)
        .order("name"),
      supabase
        .from("manufacturers")
        .select("id,name")
        .eq("organization_id", organizationId)
        .eq("is_active", true)
        .order("name"),
      supabase
        .from("asset_models")
        .select("id,name,category_id,manufacturer_id")
        .eq("organization_id", organizationId)
        .eq("is_active", true)
        .order("name"),
      supabase
        .from("organization_units")
        .select("id,name")
        .eq("organization_id", organizationId)
        .eq("is_active", true)
        .order("name"),
    ]);

    const firstError = [
      categoriesResult.error,
      manufacturersResult.error,
      modelsResult.error,
      unitsResult.error,
    ].find(Boolean);

    if (firstError) {
      setFeedback({ type: "error", text: firstError.message });
      return;
    }

    setCategories((categoriesResult.data ?? []) as Option[]);
    setManufacturers((manufacturersResult.data ?? []) as Option[]);
    setModels((modelsResult.data ?? []) as ModelOption[]);
    setUnits((unitsResult.data ?? []) as Option[]);
  }, [organization.organizationId]);

  useEffect(() => {
    void loadCatalogs();
  }, [loadCatalogs]);

  useEffect(() => {
    return () => {
      if (imagePreview) {
        URL.revokeObjectURL(imagePreview);
      }
    };
  }, [imagePreview]);

  const filteredModels = useMemo(
    () =>
      models.filter(
        (item) =>
          (!captureForm.categoryId ||
            item.category_id === captureForm.categoryId) &&
          (!captureForm.manufacturerId ||
            !item.manufacturer_id ||
            item.manufacturer_id === captureForm.manufacturerId),
      ),
    [
      models,
      captureForm.categoryId,
      captureForm.manufacturerId,
    ],
  );

  const updateCaptureForm = (
    field: keyof CaptureForm,
    value: string,
  ) => {
    setCaptureForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const applyParsedLabel = (parsed: ParsedLabel) => {
    const category = findByName(categories, parsed.categoryHint);
    const manufacturer = findByName(
      manufacturers,
      parsed.manufacturer,
    );

    const compatibleModels = models.filter(
      (item) =>
        (!category || item.category_id === category.id) &&
        (!manufacturer ||
          !item.manufacturer_id ||
          item.manufacturer_id === manufacturer.id),
    );

    const model = findByName(compatibleModels, parsed.model);

    const suggestedName = [
      parsed.categoryHint || category?.name || "Equipamento",
      parsed.manufacturer || manufacturer?.name,
      parsed.model || model?.name,
    ]
      .filter(Boolean)
      .join(" ");

    setCaptureForm((current) => ({
      ...current,
      name: current.name || suggestedName,
      categoryId: category?.id ?? current.categoryId,
      manufacturerId:
        manufacturer?.id ?? current.manufacturerId,
      modelId: model?.id ?? current.modelId,
      serialNumber:
        parsed.serialNumber || current.serialNumber,
      serviceTag: parsed.serviceTag || current.serviceTag,
      productNumber:
        parsed.productNumber || current.productNumber,
      barcodeValue:
        parsed.barcodeValue || current.barcodeValue,
      processor: parsed.processor || current.processor,
      memory: parsed.memory || current.memory,
      storage: parsed.storage || current.storage,
      operatingSystem:
        parsed.operatingSystem || current.operatingSystem,
    }));
  };

  const readBarcode = async (imageUrl: string) => {
    try {
      const reader = new BrowserMultiFormatReader();
      const result = await reader.decodeFromImageUrl(imageUrl);
      return result.getText();
    } catch {
      return "";
    }
  };

  const handleImageSelection = (
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];

    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setFeedback({
        type: "error",
        text: "Selecione uma imagem válida.",
      });
      return;
    }

    if (file.size > 12 * 1024 * 1024) {
      setFeedback({
        type: "error",
        text: "A imagem deve ter no máximo 12 MB.",
      });
      return;
    }

    if (imagePreview) {
      URL.revokeObjectURL(imagePreview);
    }

    const preview = URL.createObjectURL(file);
    setSelectedImage(file);
    setImagePreview(preview);
    setParsedLabel(emptyParsedLabel);
    setFeedback(null);
  };

  const processFactoryLabel = async () => {
    if (!selectedImage || !imagePreview) {
      setFeedback({
        type: "error",
        text: "Fotografe ou selecione a etiqueta primeiro.",
      });
      return;
    }

    setIsReadingLabel(true);
    setFeedback(null);

    let worker: Awaited<ReturnType<typeof createWorker>> | null =
      null;

    try {
      setOcrStage("Procurando código de barras...");
      const barcodeValue = await readBarcode(imagePreview);

      setOcrStage("Carregando mecanismo de leitura...");
      worker = await createWorker("eng");

      setOcrStage("Reconhecendo os textos da etiqueta...");
      const recognition = await worker.recognize(imagePreview);
      const rawText = recognition.data.text.trim();

      const parsed = parseFactoryLabel(rawText, barcodeValue);
      setParsedLabel(parsed);
      applyParsedLabel(parsed);

      setFeedback({
        type: "success",
        text:
          "Leitura concluída. Revise os campos antes de criar o patrimônio.",
      });
    } catch (error) {
      setFeedback({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "Não foi possível ler a etiqueta.",
      });
    } finally {
      if (worker) {
        await worker.terminate();
      }

      setOcrStage("");
      setIsReadingLabel(false);
    }
  };

  const findDuplicateAsset = async () => {
    const organizationId = organization.organizationId;

    const checks = [
      supabase
        .from("assets")
        .select("id,asset_number,name")
        .eq("organization_id", organizationId)
        .eq("asset_number", captureForm.assetNumber.trim())
        .limit(1),
    ];

    if (captureForm.serialNumber.trim()) {
      checks.push(
        supabase
          .from("assets")
          .select("id,asset_number,name")
          .eq("organization_id", organizationId)
          .ilike(
            "serial_number",
            captureForm.serialNumber.trim(),
          )
          .limit(1),
      );
    }

    if (captureForm.serviceTag.trim()) {
      checks.push(
        supabase
          .from("assets")
          .select("id,asset_number,name")
          .eq("organization_id", organizationId)
          .ilike("service_tag", captureForm.serviceTag.trim())
          .limit(1),
      );
    }

    const results = await Promise.all(checks);

    return results
      .flatMap((result) => result.data ?? [])
      .find(Boolean);
  };

  const saveCapturedAsset = async (
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();
    setFeedback(null);

    if (
      !captureForm.assetNumber.trim() ||
      !captureForm.name.trim() ||
      !captureForm.categoryId
    ) {
      setFeedback({
        type: "error",
        text:
          "Informe o número patrimonial, o nome e a categoria.",
      });
      return;
    }

    setIsSaving(true);

    try {
      const duplicate = await findDuplicateAsset();

      if (duplicate) {
        setFeedback({
          type: "warning",
          text:
            `Possível duplicidade: ${duplicate.asset_number} · ` +
            `${duplicate.name}. Abra o cadastro existente antes de prosseguir.`,
        });
        return;
      }

      const specifications = {
        processor: captureForm.processor || null,
        memory: captureForm.memory || null,
        storage: captureForm.storage || null,
        ocr_raw_text: parsedLabel.rawText || null,
      };

      const { data, error } = await supabase
        .from("assets")
        .insert({
          organization_id: organization.organizationId,
          asset_number: captureForm.assetNumber.trim(),
          name: captureForm.name.trim(),
          category_id: captureForm.categoryId,
          manufacturer_id:
            captureForm.manufacturerId || null,
          model_id: captureForm.modelId || null,
          serial_number:
            captureForm.serialNumber.trim() || null,
          service_tag:
            captureForm.serviceTag.trim() || null,
          product_number:
            captureForm.productNumber.trim() || null,
          barcode_value:
            captureForm.barcodeValue.trim() || null,
          unit_id: captureForm.unitId || null,
          operating_system:
            captureForm.operatingSystem.trim() || null,
          specifications,
          notes: captureForm.notes.trim() || null,
          source: "label_scan",
          operational_status: "available",
          physical_condition: "good",
          lifecycle_stage: "received",
        })
        .select("id")
        .single();

      if (error) throw error;

      await supabase.from("asset_capture_sessions").insert({
        organization_id: organization.organizationId,
        asset_id: data.id,
        source: "factory_label",
        original_filename: selectedImage?.name ?? null,
        raw_text: parsedLabel.rawText || null,
        extracted_data: {
          ...parsedLabel,
          final_form: captureForm,
        },
        barcode_value:
          captureForm.barcodeValue.trim() || null,
      });

      setFeedback({
        type: "success",
        text: "Equipamento cadastrado pela leitura da etiqueta.",
      });

      onOpenAsset(data.id);
    } catch (error) {
      setFeedback({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "Não foi possível salvar o equipamento.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const parseSpreadsheet = async (
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];

    if (!file) return;

    setIsReadingSpreadsheet(true);
    setFeedback(null);
    setImportFilename(file.name);
    setImportRows([]);

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, {
        type: "array",
        cellDates: true,
      });

      const firstSheetName = workbook.SheetNames[0];

      if (!firstSheetName) {
        throw new Error("A planilha não possui abas.");
      }

      const worksheet = workbook.Sheets[firstSheetName];
      const sourceRows =
        XLSX.utils.sheet_to_json<Record<string, unknown>>(
          worksheet,
          { defval: "", raw: false },
        );

      if (sourceRows.length === 0) {
        throw new Error("A planilha não possui registros.");
      }

      if (sourceRows.length > 2000) {
        throw new Error(
          "A primeira versão aceita no máximo 2.000 registros por importação.",
        );
      }

      const { data: existingData, error: existingError } =
        await supabase
          .from("assets")
          .select("asset_number,serial_number,service_tag")
          .eq("organization_id", organization.organizationId);

      if (existingError) throw existingError;

      const existingAssets =
        (existingData ?? []) as ExistingAsset[];

      const assetNumbers = new Set(
        existingAssets.map((item) =>
          normalizeText(item.asset_number),
        ),
      );
      const serialNumbers = new Set(
        existingAssets
          .map((item) => normalizeText(item.serial_number))
          .filter(Boolean),
      );
      const serviceTags = new Set(
        existingAssets
          .map((item) => normalizeText(item.service_tag))
          .filter(Boolean),
      );

      const localAssetNumbers = new Set<string>();
      const localSerialNumbers = new Set<string>();
      const localServiceTags = new Set<string>();

      const normalizedRows = sourceRows.map((sourceData, index) => {
        const read = <K extends keyof typeof headerAliases>(
          key: K,
        ) => cellValue(sourceData, headerAliases[key]);

        const row: ImportRow = {
          rowNumber: index + 2,
          assetNumber: read("assetNumber"),
          name: read("name"),
          categoryName: read("categoryName"),
          manufacturerName: read("manufacturerName"),
          modelName: read("modelName"),
          serialNumber: read("serialNumber"),
          serviceTag: read("serviceTag"),
          productNumber: read("productNumber"),
          barcodeValue: read("barcodeValue"),
          unitName: read("unitName"),
          hostname: read("hostname"),
          ipAddress: read("ipAddress"),
          macAddress: read("macAddress"),
          operatingSystem: read("operatingSystem"),
          assignedPersonName: read("assignedPersonName"),
          assignedPersonEmail: read("assignedPersonEmail"),
          purchaseDate: normalizeDate(read("purchaseDate")),
          acquisitionValue: read("acquisitionValue"),
          warrantyEndDate: normalizeDate(
            read("warrantyEndDate"),
          ),
          operationalStatus: safeStatus(
            read("operationalStatus"),
            operationalStatusAliases,
            "available",
          ),
          physicalCondition: safeStatus(
            read("physicalCondition"),
            conditionAliases,
            "good",
          ),
          lifecycleStage: safeStatus(
            read("lifecycleStage"),
            lifecycleAliases,
            "received",
          ),
          criticality: safeStatus(
            read("criticality"),
            criticalityAliases,
            "medium",
          ),
          notes: read("notes"),
          status: "ready",
          message: "Pronto para importar",
          sourceData,
        };

        if (!row.assetNumber || !row.name) {
          row.status = "invalid";
          row.message =
            "Número patrimonial e nome são obrigatórios.";
          return row;
        }

        const assetKey = normalizeText(row.assetNumber);
        const serialKey = normalizeText(row.serialNumber);
        const serviceKey = normalizeText(row.serviceTag);

        const duplicate =
          assetNumbers.has(assetKey) ||
          localAssetNumbers.has(assetKey) ||
          (serialKey &&
            (serialNumbers.has(serialKey) ||
              localSerialNumbers.has(serialKey))) ||
          (serviceKey &&
            (serviceTags.has(serviceKey) ||
              localServiceTags.has(serviceKey)));

        if (duplicate) {
          row.status = "duplicate";
          row.message =
            "Possível duplicidade por patrimônio, serial ou Service Tag.";
          return row;
        }

        localAssetNumbers.add(assetKey);

        if (serialKey) localSerialNumbers.add(serialKey);
        if (serviceKey) localServiceTags.add(serviceKey);

        return row;
      });

      setImportRows(normalizedRows);
      setFeedback({
        type: "success",
        text:
          `${normalizedRows.length} linhas lidas. ` +
          "Revise a prévia antes de importar.",
      });
    } catch (error) {
      setFeedback({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "Não foi possível ler a planilha.",
      });
    } finally {
      setIsReadingSpreadsheet(false);
    }
  };

  const ensureCategory = async (
    name: string,
    categoryMap: Map<string, Option>,
  ) => {
    const effectiveName = name.trim() || "Outros";
    const key = normalizeText(effectiveName);
    const existing = categoryMap.get(key);

    if (existing) return existing.id;

    const { data, error } = await supabase
      .from("asset_categories")
      .insert({
        organization_id: organization.organizationId,
        name: effectiveName,
        code: key
          .replace(/[^a-z0-9]+/g, "_")
          .toUpperCase()
          .slice(0, 40),
      })
      .select("id,name")
      .single();

    if (error) throw error;

    categoryMap.set(key, data);
    setCategories((current) => [...current, data]);

    return data.id;
  };

  const ensureManufacturer = async (
    name: string,
    manufacturerMap: Map<string, Option>,
  ) => {
    if (!name.trim()) return null;

    const key = normalizeText(name);
    const existing = manufacturerMap.get(key);

    if (existing) return existing.id;

    const { data, error } = await supabase
      .from("manufacturers")
      .insert({
        organization_id: organization.organizationId,
        name: name.trim(),
      })
      .select("id,name")
      .single();

    if (error) throw error;

    manufacturerMap.set(key, data);
    setManufacturers((current) => [...current, data]);

    return data.id;
  };

  const ensureModel = async (
    name: string,
    categoryId: string,
    manufacturerId: string | null,
    modelMap: Map<string, ModelOption>,
  ) => {
    if (!name.trim()) return null;

    const key = [
      normalizeText(name),
      categoryId,
      manufacturerId ?? "",
    ].join("|");

    const existing = modelMap.get(key);

    if (existing) return existing.id;

    const { data, error } = await supabase
      .from("asset_models")
      .insert({
        organization_id: organization.organizationId,
        category_id: categoryId,
        manufacturer_id: manufacturerId,
        name: name.trim(),
      })
      .select("id,name,category_id,manufacturer_id")
      .single();

    if (error) throw error;

    modelMap.set(key, data);
    setModels((current) => [...current, data]);

    return data.id;
  };

  const importSpreadsheet = async () => {
    const readyRows = importRows.filter(
      (row) => row.status === "ready",
    );

    if (readyRows.length === 0) {
      setFeedback({
        type: "warning",
        text: "Não existem linhas válidas para importar.",
      });
      return;
    }

    setIsImporting(true);
    setImportProgress(0);
    setFeedback(null);

    const { data: batch, error: batchError } = await supabase
      .from("asset_import_batches")
      .insert({
        organization_id: organization.organizationId,
        filename: importFilename,
        status: "processing",
        total_rows: importRows.length,
        mapping: headerAliases,
      })
      .select("id")
      .single();

    if (batchError) {
      setFeedback({ type: "error", text: batchError.message });
      setIsImporting(false);
      return;
    }

    const categoryMap = new Map(
      categories.map((item) => [
        normalizeText(item.name),
        item,
      ]),
    );

    const manufacturerMap = new Map(
      manufacturers.map((item) => [
        normalizeText(item.name),
        item,
      ]),
    );

    const modelMap = new Map(
      models.map((item) => [
        [
          normalizeText(item.name),
          item.category_id,
          item.manufacturer_id ?? "",
        ].join("|"),
        item,
      ]),
    );

    const unitMap = new Map(
      units.map((item) => [
        normalizeText(item.name),
        item.id,
      ]),
    );

    let imported = 0;
    let failed = 0;
    const rowLogs: Array<Record<string, unknown>> = [];
    const updatedRows = [...importRows];

    for (let index = 0; index < updatedRows.length; index += 1) {
      const row = updatedRows[index];

      if (row.status !== "ready") {
        rowLogs.push({
          batch_id: batch.id,
          organization_id: organization.organizationId,
          row_number: row.rowNumber,
          source_data: row.sourceData,
          normalized_data: row,
          status:
            row.status === "duplicate" ? "skipped" : "failed",
          error_message: row.message,
        });
        continue;
      }

      try {
        const categoryId = await ensureCategory(
          row.categoryName,
          categoryMap,
        );

        const manufacturerId = await ensureManufacturer(
          row.manufacturerName,
          manufacturerMap,
        );

        const modelId = await ensureModel(
          row.modelName,
          categoryId,
          manufacturerId,
          modelMap,
        );

        const { data: asset, error: assetError } = await supabase
          .from("assets")
          .insert({
            organization_id: organization.organizationId,
            asset_number: row.assetNumber,
            name: row.name,
            category_id: categoryId,
            manufacturer_id: manufacturerId,
            model_id: modelId,
            serial_number: row.serialNumber || null,
            service_tag: row.serviceTag || null,
            product_number: row.productNumber || null,
            barcode_value: row.barcodeValue || null,
            unit_id:
              unitMap.get(normalizeText(row.unitName)) ?? null,
            hostname: row.hostname || null,
            ip_address: row.ipAddress || null,
            mac_address: row.macAddress || null,
            operating_system: row.operatingSystem || null,
            assigned_person_name:
              row.assignedPersonName || null,
            assigned_person_email:
              row.assignedPersonEmail || null,
            assigned_at: row.assignedPersonName
              ? new Date().toISOString()
              : null,
            purchase_date: row.purchaseDate || null,
            acquisition_value:
              normalizeMoney(row.acquisitionValue),
            warranty_end_date:
              row.warrantyEndDate || null,
            operational_status: row.operationalStatus,
            physical_condition: row.physicalCondition,
            lifecycle_stage: row.lifecycleStage,
            criticality: row.criticality,
            notes: row.notes || null,
            source: "spreadsheet_import",
          })
          .select("id")
          .single();

        if (assetError) throw assetError;

        updatedRows[index] = {
          ...row,
          status: "imported",
          message: "Importado com sucesso",
        };

        rowLogs.push({
          batch_id: batch.id,
          organization_id: organization.organizationId,
          row_number: row.rowNumber,
          source_data: row.sourceData,
          normalized_data: row,
          status: "imported",
          asset_id: asset.id,
        });

        imported += 1;
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Erro desconhecido";

        updatedRows[index] = {
          ...row,
          status: "failed",
          message,
        };

        rowLogs.push({
          batch_id: batch.id,
          organization_id: organization.organizationId,
          row_number: row.rowNumber,
          source_data: row.sourceData,
          normalized_data: row,
          status: "failed",
          error_message: message,
        });

        failed += 1;
      }

      setImportProgress(
        Math.round(((index + 1) / updatedRows.length) * 100),
      );
      setImportRows([...updatedRows]);
    }

    for (let index = 0; index < rowLogs.length; index += 100) {
      const chunk = rowLogs.slice(index, index + 100);
      await supabase.from("asset_import_rows").insert(chunk);
    }

    const skipped = updatedRows.filter(
      (row) => row.status === "duplicate",
    ).length;

    await supabase
      .from("asset_import_batches")
      .update({
        status: failed > 0 ? "completed_with_errors" : "completed",
        imported_rows: imported,
        skipped_rows: skipped,
        failed_rows: failed,
        completed_at: new Date().toISOString(),
      })
      .eq("id", batch.id);

    setFeedback({
      type: failed > 0 ? "warning" : "success",
      text:
        `Importação concluída: ${imported} importados, ` +
        `${skipped} ignorados e ${failed} com erro.`,
    });
    setIsImporting(false);
  };

  const downloadTemplate = () => {
    const headers = [
      "Patrimônio",
      "Nome",
      "Categoria",
      "Fabricante",
      "Modelo",
      "Número de Série",
      "Service Tag",
      "Número do Produto",
      "Código de Barras",
      "Unidade",
      "Hostname",
      "IP",
      "MAC",
      "Sistema Operacional",
      "Responsável",
      "E-mail",
      "Data de Compra",
      "Valor de Aquisição",
      "Garantia Até",
      "Status",
      "Condição",
      "Ciclo de Vida",
      "Criticidade",
      "Observações",
    ];

    const example = [
      "TI-0001",
      "Notebook Financeiro 01",
      "Notebook",
      "Dell",
      "Latitude 5420",
      "ABC123456",
      "9XY12Z3",
      "P12345",
      "",
      "Matriz",
      "FIN-NB-01",
      "192.168.0.20",
      "00:11:22:33:44:55",
      "Windows 11 Pro",
      "Maria Silva",
      "maria@empresa.com",
      "13/06/2026",
      "4500,00",
      "13/06/2027",
      "Em uso",
      "Bom",
      "Operacional",
      "Média",
      "Equipamento importado pelo modelo do Ativelo",
    ];

    const csv = [
      headers.map(escapeCsv).join(";"),
      example.map(escapeCsv).join(";"),
    ].join("\r\n");

    const blob = new Blob(["\ufeff", csv], {
      type: "text/csv;charset=utf-8",
    });

    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "modelo-importacao-ativelo.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const readyCount = importRows.filter(
    (row) => row.status === "ready",
  ).length;
  const duplicateCount = importRows.filter(
    (row) => row.status === "duplicate",
  ).length;
  const invalidCount = importRows.filter(
    (row) => row.status === "invalid",
  ).length;

  return (
    <main className="ativelo-capture-page">
      <header className="ativelo-capture-header">
        <div>
          <button type="button" onClick={onBack}>
            ← Voltar ao painel
          </button>
          <p>CADASTRO ACELERADO</p>
          <h1>Captura inteligente</h1>
          <span>
            Leia etiquetas de fábrica ou importe planilhas para reduzir o
            trabalho manual no inventário.
          </span>
        </div>

        <aside>
          <AppIcon name="camera" size={28} />
          <div>
            <strong>Processamento local</strong>
            <span>
              A foto não é enviada ao banco durante o reconhecimento.
            </span>
          </div>
        </aside>
      </header>

      <nav className="ativelo-capture-tabs">
        <button
          className={activeTab === "label" ? "active" : ""}
          type="button"
          onClick={() => setActiveTab("label")}
        >
          <AppIcon name="camera" size={20} />
          Ler etiqueta
        </button>
        <button
          className={activeTab === "import" ? "active" : ""}
          type="button"
          onClick={() => setActiveTab("import")}
        >
          <AppIcon name="download" size={20} />
          Importar planilha
        </button>
      </nav>

      {feedback && (
        <div className={`ativelo-capture-feedback ${feedback.type}`}>
          {feedback.text}
        </div>
      )}

      {activeTab === "label" && (
        <section className="ativelo-capture-grid">
          <article className="ativelo-capture-panel">
            <div className="ativelo-capture-panel-heading">
              <div>
                <span>ETIQUETA DO FABRICANTE</span>
                <h2>Fotografar e reconhecer</h2>
              </div>
            </div>

            <label className="ativelo-capture-dropzone">
              {imagePreview ? (
                <img src={imagePreview} alt="Etiqueta selecionada" />
              ) : (
                <>
                  <AppIcon name="camera" size={42} />
                  <strong>Fotografe ou selecione uma etiqueta</strong>
                  <span>
                    Prefira uma imagem nítida, reta, bem iluminada e sem
                    reflexos.
                  </span>
                </>
              )}

              <input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleImageSelection}
              />
            </label>

            <button
              className="ativelo-capture-primary"
              type="button"
              disabled={!selectedImage || isReadingLabel}
              onClick={() => void processFactoryLabel()}
            >
              <AppIcon name="scan" size={19} />
              {isReadingLabel
                ? ocrStage || "Processando..."
                : "Reconhecer informações"}
            </button>

            {parsedLabel.rawText && (
              <details className="ativelo-ocr-raw">
                <summary>Ver texto identificado</summary>
                <pre>{parsedLabel.rawText}</pre>
              </details>
            )}
          </article>

          <article className="ativelo-capture-panel">
            <div className="ativelo-capture-panel-heading">
              <div>
                <span>PRÉ-CADASTRO</span>
                <h2>Revisar equipamento</h2>
              </div>
            </div>

            <form
              className="ativelo-capture-form"
              onSubmit={saveCapturedAsset}
            >
              <div className="two">
                <label>
                  <span>Número patrimonial *</span>
                  <input
                    value={captureForm.assetNumber}
                    onChange={(event) =>
                      updateCaptureForm(
                        "assetNumber",
                        event.target.value,
                      )
                    }
                    placeholder="Ex.: TI-0001"
                  />
                </label>

                <label>
                  <span>Nome do equipamento *</span>
                  <input
                    value={captureForm.name}
                    onChange={(event) =>
                      updateCaptureForm("name", event.target.value)
                    }
                  />
                </label>
              </div>

              <div className="three">
                <label>
                  <span>Categoria *</span>
                  <select
                    value={captureForm.categoryId}
                    onChange={(event) => {
                      updateCaptureForm(
                        "categoryId",
                        event.target.value,
                      );
                      updateCaptureForm("modelId", "");
                    }}
                  >
                    <option value="">Selecione</option>
                    {categories.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  <span>Fabricante</span>
                  <select
                    value={captureForm.manufacturerId}
                    onChange={(event) => {
                      updateCaptureForm(
                        "manufacturerId",
                        event.target.value,
                      );
                      updateCaptureForm("modelId", "");
                    }}
                  >
                    <option value="">Não definido</option>
                    {manufacturers.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  <span>Modelo</span>
                  <select
                    value={captureForm.modelId}
                    onChange={(event) =>
                      updateCaptureForm(
                        "modelId",
                        event.target.value,
                      )
                    }
                  >
                    <option value="">Não definido</option>
                    {filteredModels.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="three">
                <label>
                  <span>Número de série</span>
                  <input
                    value={captureForm.serialNumber}
                    onChange={(event) =>
                      updateCaptureForm(
                        "serialNumber",
                        event.target.value,
                      )
                    }
                  />
                </label>

                <label>
                  <span>Service Tag</span>
                  <input
                    value={captureForm.serviceTag}
                    onChange={(event) =>
                      updateCaptureForm(
                        "serviceTag",
                        event.target.value,
                      )
                    }
                  />
                </label>

                <label>
                  <span>Número do produto</span>
                  <input
                    value={captureForm.productNumber}
                    onChange={(event) =>
                      updateCaptureForm(
                        "productNumber",
                        event.target.value,
                      )
                    }
                  />
                </label>
              </div>

              <div className="three">
                <label>
                  <span>Código de barras</span>
                  <input
                    value={captureForm.barcodeValue}
                    onChange={(event) =>
                      updateCaptureForm(
                        "barcodeValue",
                        event.target.value,
                      )
                    }
                  />
                </label>

                <label>
                  <span>Unidade</span>
                  <select
                    value={captureForm.unitId}
                    onChange={(event) =>
                      updateCaptureForm(
                        "unitId",
                        event.target.value,
                      )
                    }
                  >
                    <option value="">Não definida</option>
                    {units.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  <span>Sistema operacional</span>
                  <input
                    value={captureForm.operatingSystem}
                    onChange={(event) =>
                      updateCaptureForm(
                        "operatingSystem",
                        event.target.value,
                      )
                    }
                  />
                </label>
              </div>

              <div className="three">
                <label>
                  <span>Processador</span>
                  <input
                    value={captureForm.processor}
                    onChange={(event) =>
                      updateCaptureForm(
                        "processor",
                        event.target.value,
                      )
                    }
                  />
                </label>

                <label>
                  <span>Memória</span>
                  <input
                    value={captureForm.memory}
                    onChange={(event) =>
                      updateCaptureForm(
                        "memory",
                        event.target.value,
                      )
                    }
                  />
                </label>

                <label>
                  <span>Armazenamento</span>
                  <input
                    value={captureForm.storage}
                    onChange={(event) =>
                      updateCaptureForm(
                        "storage",
                        event.target.value,
                      )
                    }
                  />
                </label>
              </div>

              <label>
                <span>Observações</span>
                <textarea
                  rows={3}
                  value={captureForm.notes}
                  onChange={(event) =>
                    updateCaptureForm(
                      "notes",
                      event.target.value,
                    )
                  }
                />
              </label>

              <button
                className="ativelo-capture-primary"
                type="submit"
                disabled={isSaving}
              >
                <AppIcon name="save" size={19} />
                {isSaving
                  ? "Salvando..."
                  : "Criar patrimônio"}
              </button>
            </form>
          </article>
        </section>
      )}

      {activeTab === "import" && (
        <section className="ativelo-import-panel">
          <div className="ativelo-import-toolbar">
            <div>
              <span>IMPORTAÇÃO EM MASSA</span>
              <h2>CSV ou Excel</h2>
              <p>
                O Ativelo reconhece os principais nomes de colunas e cria
                categorias, fabricantes e modelos que ainda não existirem.
              </p>
            </div>

            <button
              type="button"
              className="secondary"
              onClick={downloadTemplate}
            >
              <AppIcon name="download" size={18} />
              Baixar modelo CSV
            </button>
          </div>

          <label className="ativelo-import-file">
            <AppIcon name="download" size={36} />
            <strong>
              {isReadingSpreadsheet
                ? "Lendo arquivo..."
                : importFilename || "Selecionar planilha"}
            </strong>
            <span>
              Formatos aceitos: CSV, XLS e XLSX. Limite de 2.000 linhas.
            </span>
            <input
              type="file"
              accept=".csv,.xls,.xlsx"
              disabled={isReadingSpreadsheet || isImporting}
              onChange={parseSpreadsheet}
            />
          </label>

          {importRows.length > 0 && (
            <>
              <div className="ativelo-import-metrics">
                <article>
                  <span>Total</span>
                  <strong>{importRows.length}</strong>
                </article>
                <article>
                  <span>Prontos</span>
                  <strong>{readyCount}</strong>
                </article>
                <article>
                  <span>Duplicados</span>
                  <strong>{duplicateCount}</strong>
                </article>
                <article>
                  <span>Inválidos</span>
                  <strong>{invalidCount}</strong>
                </article>
              </div>

              {isImporting && (
                <div className="ativelo-import-progress">
                  <div style={{ width: `${importProgress}%` }} />
                  <span>{importProgress}%</span>
                </div>
              )}

              <div className="ativelo-import-table-wrapper">
                <table className="ativelo-import-table">
                  <thead>
                    <tr>
                      <th>Linha</th>
                      <th>Patrimônio</th>
                      <th>Equipamento</th>
                      <th>Categoria</th>
                      <th>Fabricante</th>
                      <th>Serial</th>
                      <th>Situação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importRows.slice(0, 500).map((row) => (
                      <tr key={row.rowNumber}>
                        <td>{row.rowNumber}</td>
                        <td>{row.assetNumber || "—"}</td>
                        <td>{row.name || "—"}</td>
                        <td>{row.categoryName || "Outros"}</td>
                        <td>{row.manufacturerName || "—"}</td>
                        <td>{row.serialNumber || "—"}</td>
                        <td>
                          <span className={`state ${row.status}`}>
                            {row.message}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {importRows.length > 500 && (
                <p className="ativelo-import-note">
                  A prévia mostra as primeiras 500 linhas. Todas serão
                  processadas na importação.
                </p>
              )}

              <button
                className="ativelo-capture-primary import"
                type="button"
                disabled={readyCount === 0 || isImporting}
                onClick={() => void importSpreadsheet()}
              >
                <AppIcon name="save" size={19} />
                {isImporting
                  ? `Importando ${importProgress}%`
                  : `Importar ${readyCount} equipamentos`}
              </button>
            </>
          )}
        </section>
      )}
    </main>
  );
}
