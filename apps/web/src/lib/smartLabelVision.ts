import {
  createVisionCanvases,
  readBarcodeFromBlob,
  type VisionStageReporter,
} from "./barcodeVision";

export type SmartLabelResult = {
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
  ocrConfidence: number;
  warnings: string[];
};

export const emptySmartLabelResult: SmartLabelResult = {
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
  ocrConfidence: 0,
  warnings: [],
};

type ManufacturerDefinition = {
  name: string;
  aliases: string[];
  modelFamilies: string[];
};

const manufacturers: ManufacturerDefinition[] = [
  {
    name: "Acer",
    aliases: ["acer"],
    modelFamilies: [
      "aspire",
      "travelmate",
      "predator",
      "nitro",
      "swift",
      "spin",
      "extensa",
    ],
  },
  {
    name: "Apple",
    aliases: ["apple"],
    modelFamilies: [
      "macbook",
      "mac mini",
      "imac",
      "mac pro",
    ],
  },
  {
    name: "Asus",
    aliases: ["asus", "asustek"],
    modelFamilies: [
      "vivobook",
      "zenbook",
      "expertbook",
      "tuf gaming",
      "rog",
    ],
  },
  {
    name: "Avell",
    aliases: ["avell"],
    modelFamilies: ["storm", "a52", "b.on", "hyb"],
  },
  {
    name: "Brother",
    aliases: ["brother"],
    modelFamilies: ["dcp", "mfc", "hl"],
  },
  {
    name: "Canon",
    aliases: ["canon"],
    modelFamilies: ["pixma", "imageclass"],
  },
  {
    name: "Cisco",
    aliases: ["cisco"],
    modelFamilies: ["catalyst", "meraki"],
  },
  {
    name: "Compaq",
    aliases: ["compaq"],
    modelFamilies: ["presario"],
  },
  {
    name: "Dell",
    aliases: ["dell"],
    modelFamilies: [
      "latitude",
      "inspiron",
      "vostro",
      "optiplex",
      "precision",
      "xps",
      "poweredge",
    ],
  },
  {
    name: "Epson",
    aliases: ["epson", "seiko epson"],
    modelFamilies: ["ecotank", "workforce", "surecolor"],
  },
  {
    name: "Fortinet",
    aliases: ["fortinet", "fortigate"],
    modelFamilies: ["fortigate", "fortiswitch"],
  },
  {
    name: "HP",
    aliases: [
      "hp",
      "hewlett packard",
      "hewlett-packard",
    ],
    modelFamilies: [
      "elitebook",
      "probook",
      "pavilion",
      "prodesk",
      "elitedesk",
      "zbook",
      "laserjet",
      "deskjet",
      "proliant",
    ],
  },
  {
    name: "Intelbras",
    aliases: ["intelbras"],
    modelFamilies: ["action", "wom", "sf", "sg"],
  },
  {
    name: "Lenovo",
    aliases: ["lenovo"],
    modelFamilies: [
      "thinkpad",
      "ideapad",
      "thinkcentre",
      "legion",
      "yoga",
      "loq",
    ],
  },
  {
    name: "LG",
    aliases: ["lg", "lge"],
    modelFamilies: ["gram", "ultragear"],
  },
  {
    name: "Mikrotik",
    aliases: ["mikrotik", "routerboard"],
    modelFamilies: ["routerboard", "cloud router"],
  },
  {
    name: "MSI",
    aliases: ["msi", "micro-star"],
    modelFamilies: ["modern", "katana", "stealth", "creator"],
  },
  {
    name: "Multilaser",
    aliases: [
      "multilaser",
      "multi laser",
      "multi",
      "multilaser industrial",
    ],
    modelFamilies: ["legacy", "ultra", "mpro", "pc"],
  },
  {
    name: "Positivo",
    aliases: ["positivo", "positivo tecnologia"],
    modelFamilies: ["motion", "master", "stilo", "union"],
  },
  {
    name: "Samsung",
    aliases: ["samsung", "sarnsung", "samsunq"],
    modelFamilies: [
      "galaxy book",
      "book e",
      "book x",
      "expert",
      "essentials",
      "odyssey",
    ],
  },
  {
    name: "Sony",
    aliases: ["sony"],
    modelFamilies: ["vaio"],
  },
  {
    name: "Toshiba",
    aliases: ["toshiba", "dynabook"],
    modelFamilies: ["satellite", "tecra", "portege"],
  },
  {
    name: "Vaio",
    aliases: ["vaio"],
    modelFamilies: ["fe", "fit", "pro", "sx"],
  },
];

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[|]/g, "i")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function cleanValue(value: string): string {
  return value
    .replace(/^[\s:;#=\-]+/, "")
    .replace(/[\s:;#=\-]+$/, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function extractFirst(
  text: string,
  patterns: RegExp[],
): string {
  for (const pattern of patterns) {
    const match = text.match(pattern);

    if (match?.[1]) {
      return cleanValue(match[1]);
    }
  }

  return "";
}

function levenshtein(
  left: string,
  right: string,
): number {
  if (left === right) {
    return 0;
  }

  if (!left.length) {
    return right.length;
  }

  if (!right.length) {
    return left.length;
  }

  const previous = Array.from(
    { length: right.length + 1 },
    (_, index) => index,
  );

  for (
    let leftIndex = 1;
    leftIndex <= left.length;
    leftIndex += 1
  ) {
    const current = [leftIndex];

    for (
      let rightIndex = 1;
      rightIndex <= right.length;
      rightIndex += 1
    ) {
      const substitution =
        previous[rightIndex - 1] +
        (
          left[leftIndex - 1] === right[rightIndex - 1]
            ? 0
            : 1
        );

      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        substitution,
      );
    }

    previous.splice(0, previous.length, ...current);
  }

  return previous[right.length];
}

function findManufacturer(text: string): string {
  const normalized = normalizeText(text);

  for (const definition of manufacturers) {
    if (
      definition.aliases.some((alias) =>
        normalized.includes(normalizeText(alias)),
      )
    ) {
      return definition.name;
    }
  }

  for (const definition of manufacturers) {
    if (
      definition.modelFamilies.some((family) =>
        normalized.includes(normalizeText(family)),
      )
    ) {
      return definition.name;
    }
  }

  const words = normalized
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length >= 4);

  for (const definition of manufacturers) {
    for (const alias of definition.aliases) {
      const normalizedAlias = normalizeText(alias);

      if (normalizedAlias.includes(" ")) {
        continue;
      }

      const tolerance =
        normalizedAlias.length >= 8 ? 2 : 1;

      if (
        words.some(
          (word) =>
            Math.abs(word.length - normalizedAlias.length) <=
              tolerance &&
            levenshtein(word, normalizedAlias) <= tolerance,
        )
      ) {
        return definition.name;
      }
    }
  }

  return "";
}

function inferCategory(text: string): string {
  const normalized = normalizeText(text);

  const rules = [
    {
      value: "Notebook",
      words: [
        "notebook",
        "laptop",
        "latitude",
        "thinkpad",
        "ideapad",
        "aspire",
        "vivobook",
        "zenbook",
        "galaxy book",
        "macbook",
        "elitebook",
        "probook",
      ],
    },
    {
      value: "Computador",
      words: [
        "desktop",
        "optiplex",
        "prodesk",
        "elitedesk",
        "thinkcentre",
        "computer",
        "all in one",
      ],
    },
    {
      value: "Monitor",
      words: [
        "monitor",
        "display",
        "lcd monitor",
        "led monitor",
      ],
    },
    {
      value: "Impressora",
      words: [
        "printer",
        "impressora",
        "ecotank",
        "laserjet",
        "deskjet",
        "imageclass",
      ],
    },
    {
      value: "Servidor",
      words: [
        "server",
        "servidor",
        "poweredge",
        "proliant",
      ],
    },
    {
      value: "No-break",
      words: [
        "ups",
        "nobreak",
        "no-break",
        "uninterruptible",
      ],
    },
    {
      value: "Switch",
      words: [
        "switch",
        "catalyst",
        "managed switch",
        "fortiswitch",
      ],
    },
    {
      value: "Roteador",
      words: [
        "router",
        "roteador",
        "mikrotik",
        "routerboard",
      ],
    },
    {
      value: "Projetor",
      words: ["projector", "projetor"],
    },
  ];

  return (
    rules.find((rule) =>
      rule.words.some((word) =>
        normalized.includes(normalizeText(word)),
      ),
    )?.value ?? ""
  );
}

function inferModel(
  text: string,
  manufacturer: string,
): string {
  const explicit = extractFirst(text, [
    /model\s*(?:name|number|no\.?|#)?\s*[:#=\-]?\s*([^\n]{2,80})/i,
    /product\s*name\s*[:#=\-]?\s*([^\n]{2,80})/i,
    /machine\s*type\s*model\s*[:#=\-]?\s*([^\n]{2,80})/i,
    /modelo\s*[:#=\-]?\s*([^\n]{2,80})/i,
  ]);

  if (explicit) {
    return explicit
      .replace(
        /\s+(?:serial|s\/n|sn|product|p\/n|part)\b.*$/i,
        "",
      )
      .trim();
  }

  const definition = manufacturers.find(
    (item) => item.name === manufacturer,
  );

  if (!definition) {
    return "";
  }

  const lines = text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (const family of definition.modelFamilies) {
    const normalizedFamily = normalizeText(family);
    const line = lines.find((candidate) =>
      normalizeText(candidate).includes(normalizedFamily),
    );

    if (line) {
      return cleanValue(
        line
          .replace(/^(?:product|model|modelo)\s*[:#=\-]?\s*/i, "")
          .slice(0, 80),
      );
    }
  }

  return "";
}

function mergeRecognizedTexts(
  values: string[],
): string {
  const seen = new Set<string>();
  const lines: string[] = [];

  for (const value of values) {
    for (const rawLine of value.split(/\n+/)) {
      const line = rawLine
        .replace(/[^\S\r\n]+/g, " ")
        .trim();

      if (!line) {
        continue;
      }

      const normalized = normalizeText(line);

      if (
        normalized.length < 2 ||
        seen.has(normalized)
      ) {
        continue;
      }

      seen.add(normalized);
      lines.push(line);
    }
  }

  return lines.join("\n");
}

function parseFactoryLabel(
  rawText: string,
  barcodeValue: string,
  ocrConfidence: number,
): SmartLabelResult {
  const compact = rawText.replace(/\r/g, "");
  const manufacturer = findManufacturer(compact);
  const model = inferModel(compact, manufacturer);

  const serviceTag = extractFirst(compact, [
    /service\s*tag\s*[:#=\-]?\s*([A-Z0-9._\-]{4,40})/i,
    /express\s*service\s*code\s*[:#=\-]?\s*([A-Z0-9._\-]{4,40})/i,
    /tag\s*de\s*servi[cç]o\s*[:#=\-]?\s*([A-Z0-9._\-]{4,40})/i,
  ]);

  const serialNumber = extractFirst(compact, [
    /serial\s*(?:number|no\.?|#)?\s*[:#=\-]?\s*([A-Z0-9._\-]{4,60})/i,
    /n[uú]mero\s*de\s*s[eé]rie\s*[:#=\-]?\s*([A-Z0-9._\-]{4,60})/i,
    /\bS\/N\s*[:#=\-]?\s*([A-Z0-9._\-]{4,60})/i,
    /\bSN\s*[:#=\-]?\s*([A-Z0-9._\-]{4,60})/i,
    /\bSER\s*[:#=\-]?\s*([A-Z0-9._\-]{4,60})/i,
  ]);

  const productNumber = extractFirst(compact, [
    /product\s*(?:number|no\.?|#)\s*[:#=\-]?\s*([A-Z0-9._\-\/]{3,70})/i,
    /part\s*(?:number|no\.?|#)\s*[:#=\-]?\s*([A-Z0-9._\-\/]{3,70})/i,
    /\bP\/N\s*[:#=\-]?\s*([A-Z0-9._\-\/]{3,70})/i,
    /\bPN\s*[:#=\-]?\s*([A-Z0-9._\-\/]{3,70})/i,
    /n[uú]mero\s*do\s*produto\s*[:#=\-]?\s*([A-Z0-9._\-\/]{3,70})/i,
  ]);

  const processor = extractFirst(compact, [
    /\b((?:Intel\s+)?Core\s+(?:Ultra\s+)?[3579i][-\s]?\d{3,5}[A-Z]{0,4})\b/i,
    /\b((?:AMD\s+)?Ryzen\s+[3579]\s+\d{4,5}[A-Z]{0,4})\b/i,
    /\b((?:Intel\s+)?Xeon\s+[A-Z0-9 \-]{4,35})\b/i,
    /\b((?:Intel\s+)?Celeron\s+[A-Z0-9 \-]{2,25})\b/i,
    /\b((?:Intel\s+)?Pentium\s+[A-Z0-9 \-]{2,25})\b/i,
  ]);

  const memory = extractFirst(compact, [
    /\b(\d{1,3}\s*GB\s*(?:DDR[345])?)\s*(?:RAM|MEMORY|MEM[ÓO]RIA)?\b/i,
    /(?:RAM|MEMORY|MEM[ÓO]RIA)\s*[:#=\-]?\s*(\d{1,3}\s*GB(?:\s*DDR[345])?)/i,
  ]);

  const storage = extractFirst(compact, [
    /\b(\d{2,4}\s*(?:GB|TB)\s*(?:SSD|HDD|NVME|EMMC))\b/i,
    /\b((?:SSD|HDD|NVME|EMMC)\s*\d{2,4}\s*(?:GB|TB))\b/i,
    /(?:STORAGE|ARMAZENAMENTO)\s*[:#=\-]?\s*(\d{2,4}\s*(?:GB|TB)(?:\s*(?:SSD|HDD|NVME|EMMC))?)/i,
  ]);

  const operatingSystem = extractFirst(compact, [
    /\b(Windows\s+(?:10|11)\s*(?:Home|Pro|Professional|Enterprise)?)\b/i,
    /\b(Ubuntu\s+\d{2}\.\d{2})\b/i,
    /\b(Chrome\s*OS)\b/i,
    /\b(macOS\s+[A-Za-z0-9 .\-]+)\b/i,
  ]);

  const warnings: string[] = [];

  if (!manufacturer) {
    warnings.push(
      "A marca não pôde ser confirmada automaticamente.",
    );
  }

  if (!model) {
    warnings.push(
      "O modelo não pôde ser confirmado automaticamente.",
    );
  }

  if (!serialNumber && !serviceTag) {
    warnings.push(
      "Serial e Service Tag precisam de revisão manual.",
    );
  }

  if (ocrConfidence < 55) {
    warnings.push(
      "A imagem apresentou baixa confiança de leitura.",
    );
  }

  return {
    manufacturer,
    model,
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
    ocrConfidence,
    warnings,
  };
}

export async function readSmartFactoryLabel(
  image: Blob,
  onStage?: VisionStageReporter,
): Promise<SmartLabelResult> {
  onStage?.("Procurando QR Code ou código de barras...");

  const barcodeValue = await readBarcodeFromBlob(
    image,
    onStage,
  );

  onStage?.("Preparando versões com mais contraste...");

  const canvases = await createVisionCanvases(image);
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("eng");
  const texts: string[] = [];
  const confidences: number[] = [];

  try {
    await worker.setParameters({
      preserve_interword_spaces: "1",
    });

    const primaryCanvases = canvases.slice(0, 3);

    for (
      let index = 0;
      index < primaryCanvases.length;
      index += 1
    ) {
      onStage?.(
        `Reconhecendo textos da etiqueta (${index + 1}/${primaryCanvases.length})...`,
      );

      const recognition = await worker.recognize(
        primaryCanvases[index],
      );

      const text = recognition.data.text.trim();

      if (text) {
        texts.push(text);
        confidences.push(
          Number(recognition.data.confidence) || 0,
        );
      }

      if (
        index === 0 &&
        recognition.data.confidence >= 82 &&
        text.length >= 40
      ) {
        break;
      }
    }
  } finally {
    await worker.terminate();
  }

  const rawText = mergeRecognizedTexts(texts);
  const ocrConfidence =
    confidences.length > 0
      ? Math.round(
          confidences.reduce(
            (total, value) => total + value,
            0,
          ) / confidences.length,
        )
      : 0;

  return parseFactoryLabel(
    rawText,
    barcodeValue,
    ocrConfidence,
  );
}