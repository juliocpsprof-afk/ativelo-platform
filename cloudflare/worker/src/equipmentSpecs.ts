export interface AtiveloAiBinding {
  run(
    model: string,
    input: Record<string, unknown>,
  ): Promise<unknown>;
}

export interface EquipmentSpecsEnv {
  ENABLE_BRAVE_SEARCH?: string;
  BRAVE_SEARCH_API_KEY?: string;
  AI_MODEL?: string;
  AI?: AtiveloAiBinding;
}

export interface EquipmentResearchUser {
  id: string;
  email?: string;
}

type ResearchInput = {
  manufacturer: string;
  model: string;
  categoryHint: string;
  rawOcrText: string;
  sourceUrls: string[];
};

type BraveWebResult = {
  title?: string;
  url?: string;
  description?: string;
  profile?: {
    long_name?: string;
  };
  thumbnail?: {
    src?: string;
  };
};

type ResearchSource = {
  id: string;
  title: string;
  url: string;
  host: string;
  snippet: string;
  sourceType:
    | "official"
    | "support"
    | "manual"
    | "documentation"
    | "distributor"
    | "other";
  score: number;
  imageUrl: string | null;
  extractedText: string;
};

type Suggestion = {
  manufacturer: string;
  model: string;
  processor: string;
  memory: string;
  storage: string;
  categoryHint: string;
  operatingSystem: string;
  documentationUrl: string;
  imageUrl: string;
  confidence: number;
  fieldConfidence: Record<string, number>;
  warnings: string[];
};

const manufacturerDomains: Record<string, string[]> = {
  acer: ["acer.com"],
  apple: ["apple.com"],
  asus: ["asus.com"],
  avell: ["avell.com.br"],
  brother: ["brother.com"],
  canon: ["canon.com"],
  cisco: ["cisco.com"],
  compaq: ["compaq.com"],
  dell: ["dell.com"],
  epson: ["epson.com"],
  fortinet: ["fortinet.com"],
  hp: ["hp.com"],
  intelbras: ["intelbras.com"],
  lenovo: ["lenovo.com"],
  lg: ["lg.com"],
  mikrotik: ["mikrotik.com"],
  msi: ["msi.com"],
  multilaser: [
    "multilaser.com.br",
    "multi.com.br",
  ],
  positivo: ["positivo.com.br"],
  samsung: ["samsung.com"],
  sony: ["sony.com"],
  toshiba: ["toshiba.com"],
  vaio: ["br.vaio.com"],
};

const blockedHosts = [
  "amazon.",
  "aliexpress.",
  "ebay.",
  "facebook.",
  "instagram.",
  "mercadolivre.",
  "olx.",
  "pinterest.",
  "tiktok.",
  "youtube.",
];

function jsonResponse(
  body: unknown,
  status = 200,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type":
        "application/json; charset=utf-8",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function cleanText(
  value: unknown,
  maximum = 200,
): string {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maximum);
}

function normalizeText(value: unknown): string {
  return cleanText(value, 500)
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

function uniqueStrings(
  values: string[],
): string[] {
  return Array.from(
    new Set(values.filter(Boolean)),
  );
}

function safeNumber(
  value: unknown,
  fallback = 0,
): number {
  const numeric = Number(value);

  if (!Number.isFinite(numeric)) {
    return fallback;
  }

  return Math.max(
    0,
    Math.min(100, Math.round(numeric)),
  );
}

function isPrivateIpv4(hostname: string): boolean {
  const match = hostname.match(
    /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/,
  );

  if (!match) {
    return false;
  }

  const parts = match
    .slice(1)
    .map((part) => Number(part));

  if (parts.some((part) => part > 255)) {
    return true;
  }

  return (
    parts[0] === 10 ||
    parts[0] === 127 ||
    (
      parts[0] === 169 &&
      parts[1] === 254
    ) ||
    (
      parts[0] === 172 &&
      parts[1] >= 16 &&
      parts[1] <= 31
    ) ||
    (
      parts[0] === 192 &&
      parts[1] === 168
    )
  );
}

function validateExternalUrl(
  rawUrl: string,
): URL | null {
  try {
    const url = new URL(rawUrl);

    if (
      url.protocol !== "https:" &&
      url.protocol !== "http:"
    ) {
      return null;
    }

    if (
      url.username ||
      url.password ||
      url.hostname === "localhost" ||
      url.hostname.endsWith(".local") ||
      url.hostname === "::1" ||
      isPrivateIpv4(url.hostname)
    ) {
      return null;
    }

    return url;
  } catch {
    return null;
  }
}

function decodeHtml(value: string): string {
  const entities: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: '"',
  };

  return value
    .replace(
      /&(#x?[0-9a-f]+|[a-z]+);/gi,
      (_, entity: string) => {
        const lower = entity.toLowerCase();

        if (lower.startsWith("#x")) {
          return String.fromCodePoint(
            Number.parseInt(lower.slice(2), 16),
          );
        }

        if (lower.startsWith("#")) {
          return String.fromCodePoint(
            Number.parseInt(lower.slice(1), 10),
          );
        }

        return entities[lower] ?? " ";
      },
    )
    .replace(/\s+/g, " ")
    .trim();
}

function htmlToText(html: string): string {
  return decodeHtml(
    html
      .replace(
        /<(script|style|noscript|svg|canvas)[^>]*>[\s\S]*?<\/\1>/gi,
        " ",
      )
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|li|tr|h[1-6])>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  ).slice(0, 18000);
}

function extractMetaContent(
  html: string,
  property: string,
): string {
  const escaped = property.replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&",
  );

  const patterns = [
    new RegExp(
      `<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["']`,
      "i",
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["']`,
      "i",
    ),
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);

    if (match?.[1]) {
      return decodeHtml(match[1]);
    }
  }

  return "";
}

function sourceTypeFor(
  url: URL,
  title: string,
  manufacturer: string,
): ResearchSource["sourceType"] {
  const host = url.hostname.toLowerCase();
  const normalizedTitle = normalizeText(title);
  const officialDomains =
    manufacturerDomains[
      normalizeText(manufacturer)
    ] ?? [];

  if (
    officialDomains.some(
      (domain) =>
        host === domain ||
        host.endsWith(`.${domain}`),
    )
  ) {
    if (
      url.pathname.toLowerCase().endsWith(".pdf") ||
      normalizedTitle.includes("manual") ||
      normalizedTitle.includes("datasheet")
    ) {
      return "manual";
    }

    if (
      normalizedTitle.includes("support") ||
      normalizedTitle.includes("suporte") ||
      url.pathname.toLowerCase().includes("support")
    ) {
      return "support";
    }

    return "official";
  }

  if (
    url.pathname.toLowerCase().endsWith(".pdf") ||
    normalizedTitle.includes("manual") ||
    normalizedTitle.includes("datasheet")
  ) {
    return "manual";
  }

  if (
    normalizedTitle.includes("documentation") ||
    normalizedTitle.includes("documentacao") ||
    normalizedTitle.includes("specification") ||
    normalizedTitle.includes("especificacoes")
  ) {
    return "documentation";
  }

  if (
    blockedHosts.some((fragment) =>
      host.includes(fragment),
    )
  ) {
    return "distributor";
  }

  return "other";
}

function scoreSource(
  source: Omit<ResearchSource, "score">,
  input: ResearchInput,
): number {
  let score = 20;

  const searchable = normalizeText(
    `${source.title} ${source.snippet} ${source.url}`,
  );
  const modelTokens = normalizeText(input.model)
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 2);

  const matchedTokens = modelTokens.filter(
    (token) => searchable.includes(token),
  ).length;

  score += Math.min(
    30,
    matchedTokens * 7,
  );

  if (
    normalizeText(input.manufacturer) &&
    searchable.includes(
      normalizeText(input.manufacturer),
    )
  ) {
    score += 12;
  }

  if (
    source.sourceType === "official" ||
    source.sourceType === "support"
  ) {
    score += 24;
  }

  if (
    source.sourceType === "manual" ||
    source.sourceType === "documentation"
  ) {
    score += 18;
  }

  if (source.sourceType === "distributor") {
    score -= 18;
  }

  return Math.max(0, score);
}

async function searchBrave(
  query: string,
  apiKey: string,
): Promise<BraveWebResult[]> {
  const endpoint = new URL(
    "https://api.search.brave.com/res/v1/web/search",
  );

  endpoint.searchParams.set("q", query);
  endpoint.searchParams.set("count", "10");
  endpoint.searchParams.set("country", "BR");
  endpoint.searchParams.set("search_lang", "pt-br");
  endpoint.searchParams.set("safesearch", "strict");

  const response = await fetch(endpoint, {
    headers: {
      Accept: "application/json",
      "X-Subscription-Token": apiKey,
    },
  });

  if (!response.ok) {
    throw new Error(
      `Brave Search respondeu HTTP ${response.status}.`,
    );
  }

  const payload = (await response.json()) as {
    web?: {
      results?: BraveWebResult[];
    };
  };

  return payload.web?.results ?? [];
}

async function fetchWithSafeRedirects(
  initialUrl: URL,
): Promise<Response> {
  let current = initialUrl;

  for (let hop = 0; hop < 4; hop += 1) {
    const response = await fetch(current, {
      method: "GET",
      redirect: "manual",
      headers: {
        Accept:
          "text/html,application/xhtml+xml,application/pdf;q=0.8,*/*;q=0.4",
        "User-Agent":
          "Ativelo-Spec-Research/1.0",
      },
      signal: AbortSignal.timeout(7000),
    });

    if (
      response.status >= 300 &&
      response.status < 400
    ) {
      const location =
        response.headers.get("Location");

      if (!location) {
        return response;
      }

      const next = validateExternalUrl(
        new URL(location, current).toString(),
      );

      if (!next) {
        throw new Error(
          "Redirecionamento inseguro bloqueado.",
        );
      }

      current = next;
      continue;
    }

    return response;
  }

  throw new Error(
    "A fonte excedeu o limite de redirecionamentos.",
  );
}

async function enrichSource(
  source: ResearchSource,
): Promise<ResearchSource> {
  const url = validateExternalUrl(source.url);

  if (!url) {
    return source;
  }

  if (
    url.pathname.toLowerCase().endsWith(".pdf")
  ) {
    return source;
  }

  try {
    const response =
      await fetchWithSafeRedirects(url);

    if (!response.ok) {
      return source;
    }

    const contentType =
      response.headers.get("Content-Type") ?? "";

    if (
      !contentType.includes("text/html") &&
      !contentType.includes(
        "application/xhtml+xml",
      )
    ) {
      return source;
    }

    const html = (
      await response.text()
    ).slice(0, 350000);

    const metaDescription =
      extractMetaContent(
        html,
        "description",
      ) ||
      extractMetaContent(
        html,
        "og:description",
      );

    const ogImage =
      extractMetaContent(html, "og:image");

    return {
      ...source,
      snippet:
        metaDescription ||
        source.snippet,
      imageUrl:
        source.imageUrl ||
        (
          validateExternalUrl(ogImage)
            ? ogImage
            : null
        ),
      extractedText: htmlToText(html),
    };
  } catch {
    return source;
  }
}

function sourceFromResult(
  result: BraveWebResult,
  input: ResearchInput,
  index: number,
): ResearchSource | null {
  const url = validateExternalUrl(
    cleanText(result.url, 1600),
  );

  if (!url) {
    return null;
  }

  const title = cleanText(
    result.title ||
      result.profile?.long_name ||
      url.hostname,
    300,
  );

  const source: Omit<
    ResearchSource,
    "score"
  > = {
    id: `S${index + 1}`,
    title,
    url: url.toString(),
    host: url.hostname,
    snippet: cleanText(
      result.description,
      1200,
    ),
    sourceType: sourceTypeFor(
      url,
      title,
      input.manufacturer,
    ),
    imageUrl:
      validateExternalUrl(
        cleanText(
          result.thumbnail?.src,
          1600,
        ),
      )?.toString() ?? null,
    extractedText: "",
  };

  return {
    ...source,
    score: scoreSource(source, input),
  };
}

function sourceFromManualUrl(
  rawUrl: string,
  input: ResearchInput,
  index: number,
): ResearchSource | null {
  const url = validateExternalUrl(rawUrl);

  if (!url) {
    return null;
  }

  const title =
    url.pathname.split("/").filter(Boolean).pop() ||
    url.hostname;

  const source: Omit<
    ResearchSource,
    "score"
  > = {
    id: `M${index + 1}`,
    title: cleanText(title, 300),
    url: url.toString(),
    host: url.hostname,
    snippet:
      "Fonte informada manualmente pelo usuário.",
    sourceType: sourceTypeFor(
      url,
      title,
      input.manufacturer,
    ),
    imageUrl: null,
    extractedText: "",
  };

  return {
    ...source,
    score: scoreSource(source, input) + 12,
  };
}

function extractFirst(
  text: string,
  patterns: RegExp[],
): string {
  for (const pattern of patterns) {
    const match = text.match(pattern);

    if (match?.[1]) {
      return cleanText(match[1], 180);
    }
  }

  return "";
}

function inferCategory(text: string): string {
  const normalized = normalizeText(text);

  const rules = [
    {
      value: "Notebook",
      terms: [
        "notebook",
        "laptop",
        "latitude",
        "thinkpad",
        "ideapad",
        "aspire",
        "vivobook",
        "galaxy book",
        "macbook",
      ],
    },
    {
      value: "Computador",
      terms: [
        "desktop",
        "optiplex",
        "prodesk",
        "elitedesk",
        "thinkcentre",
        "all in one",
      ],
    },
    {
      value: "Monitor",
      terms: ["monitor", "display"],
    },
    {
      value: "Impressora",
      terms: [
        "printer",
        "impressora",
        "ecotank",
        "laserjet",
        "deskjet",
      ],
    },
    {
      value: "Servidor",
      terms: [
        "server",
        "servidor",
        "poweredge",
        "proliant",
      ],
    },
    {
      value: "Switch",
      terms: [
        "network switch",
        "managed switch",
        "catalyst",
      ],
    },
    {
      value: "Roteador",
      terms: ["router", "roteador"],
    },
  ];

  return (
    rules.find((rule) =>
      rule.terms.some((term) =>
        normalized.includes(term),
      ),
    )?.value ?? ""
  );
}

function heuristicSuggestion(
  input: ResearchInput,
  sources: ResearchSource[],
): Suggestion {
  const evidence = [
    input.rawOcrText,
    ...sources.flatMap((source) => [
      source.title,
      source.snippet,
      source.extractedText,
    ]),
  ].join("\n");

  const processor = extractFirst(evidence, [
    /\b((?:Intel\s+)?Core\s+(?:Ultra\s+)?[i3579][-\s]?\d{3,5}[A-Z]{0,4})\b/i,
    /\b((?:AMD\s+)?Ryzen\s+[3579]\s+\d{4,5}[A-Z]{0,4})\b/i,
    /\b((?:Intel\s+)?Xeon\s+[A-Z0-9 \-]{4,35})\b/i,
    /\b(Apple\s+M[1-9](?:\s+(?:Pro|Max|Ultra))?)\b/i,
  ]);

  const memory = extractFirst(evidence, [
    /(?:memory|memoria|ram)\s*[:\-]?\s*(\d{1,3}\s*GB(?:\s*DDR[345])?)/i,
    /\b(\d{1,3}\s*GB\s*(?:DDR[345])?)\s*(?:RAM|memory|memoria)\b/i,
  ]);

  const storage = extractFirst(evidence, [
    /(?:storage|armazenamento)\s*[:\-]?\s*(\d{2,4}\s*(?:GB|TB)(?:\s*(?:SSD|HDD|NVMe|eMMC))?)/i,
    /\b(\d{2,4}\s*(?:GB|TB)\s*(?:SSD|HDD|NVMe|eMMC))\b/i,
  ]);

  const operatingSystem = extractFirst(
    evidence,
    [
      /\b(Windows\s+(?:10|11)\s*(?:Home|Pro|Professional|Enterprise)?)\b/i,
      /\b(Ubuntu\s+\d{2}\.\d{2})\b/i,
      /\b(Chrome\s*OS)\b/i,
      /\b(macOS\s+[A-Za-z0-9 .\-]+)\b/i,
    ],
  );

  const documentation =
    sources.find(
      (source) =>
        source.sourceType === "manual",
    ) ??
    sources.find(
      (source) =>
        source.sourceType === "support" ||
        source.sourceType ===
          "documentation",
    );

  const image =
    sources.find(
      (source) => source.imageUrl,
    )?.imageUrl ?? "";

  const fieldConfidence: Record<
    string,
    number
  > = {
    manufacturer:
      input.manufacturer ? 82 : 0,
    model: input.model ? 82 : 0,
    processor: processor ? 48 : 0,
    memory: memory ? 40 : 0,
    storage: storage ? 40 : 0,
    categoryHint:
      input.categoryHint ||
      inferCategory(evidence)
        ? 65
        : 0,
    operatingSystem:
      operatingSystem ? 42 : 0,
  };

  const populated = Object.values(
    fieldConfidence,
  ).filter((value) => value > 0);

  return {
    manufacturer: input.manufacturer,
    model: input.model,
    processor,
    memory,
    storage,
    categoryHint:
      input.categoryHint ||
      inferCategory(evidence),
    operatingSystem,
    documentationUrl:
      documentation?.url ?? "",
    imageUrl: image,
    confidence:
      populated.length > 0
        ? Math.round(
            populated.reduce(
              (total, value) =>
                total + value,
              0,
            ) / populated.length,
          )
        : 0,
    fieldConfidence,
    warnings: [
      "Configurações como memória e armazenamento podem variar dentro do mesmo modelo.",
    ],
  };
}

function safeSuggestion(
  value: unknown,
  fallback: Suggestion,
  sources: ResearchSource[],
): Suggestion {
  const candidate =
    value &&
    typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};

  const knownUrls = new Set(
    sources.flatMap((source) => [
      source.url,
      source.imageUrl ?? "",
    ]),
  );

  const documentationUrl = cleanText(
    candidate.documentationUrl,
    1600,
  );
  const imageUrl = cleanText(
    candidate.imageUrl,
    1600,
  );

  const candidateConfidence =
    candidate.fieldConfidence &&
    typeof candidate.fieldConfidence ===
      "object"
      ? (
          candidate.fieldConfidence as Record<
            string,
            unknown
          >
        )
      : {};

  const fieldNames = [
    "manufacturer",
    "model",
    "processor",
    "memory",
    "storage",
    "categoryHint",
    "operatingSystem",
  ];

  const fieldConfidence =
    Object.fromEntries(
      fieldNames.map((field) => [
        field,
        safeNumber(
          candidateConfidence[field],
          fallback.fieldConfidence[field] ?? 0,
        ),
      ]),
    );

  const warnings = Array.isArray(
    candidate.warnings,
  )
    ? candidate.warnings
        .map((warning) =>
          cleanText(warning, 300),
        )
        .filter(Boolean)
        .slice(0, 8)
    : fallback.warnings;

  return {
    manufacturer:
      cleanText(
        candidate.manufacturer,
        120,
      ) || fallback.manufacturer,
    model:
      cleanText(candidate.model, 180) ||
      fallback.model,
    processor:
      cleanText(candidate.processor, 180) ||
      fallback.processor,
    memory:
      cleanText(candidate.memory, 120) ||
      fallback.memory,
    storage:
      cleanText(candidate.storage, 120) ||
      fallback.storage,
    categoryHint:
      cleanText(
        candidate.categoryHint,
        120,
      ) || fallback.categoryHint,
    operatingSystem:
      cleanText(
        candidate.operatingSystem,
        180,
      ) || fallback.operatingSystem,
    documentationUrl:
      knownUrls.has(documentationUrl)
        ? documentationUrl
        : fallback.documentationUrl,
    imageUrl:
      knownUrls.has(imageUrl)
        ? imageUrl
        : fallback.imageUrl,
    confidence: safeNumber(
      candidate.confidence,
      fallback.confidence,
    ),
    fieldConfidence,
    warnings: uniqueStrings([
      ...warnings,
      ...fallback.warnings,
    ]).slice(0, 8),
  };
}

async function aiSuggestion(
  env: EquipmentSpecsEnv,
  input: ResearchInput,
  sources: ResearchSource[],
  fallback: Suggestion,
): Promise<Suggestion> {
  if (!env.AI) {
    return fallback;
  }

  const evidence = sources
    .slice(0, 6)
    .map(
      (source) =>
        `[${source.id}]
Título: ${source.title}
URL: ${source.url}
Tipo: ${source.sourceType}
Resumo: ${source.snippet}
Conteúdo: ${source.extractedText.slice(0, 7000)}`,
    )
    .join("\n\n");

  const prompt = `
Extraia especificações técnicas usando SOMENTE as fontes fornecidas.

Produto pesquisado:
Fabricante informado: ${input.manufacturer || "não informado"}
Modelo informado: ${input.model || "não informado"}
Categoria sugerida: ${input.categoryHint || "não informada"}
OCR parcial: ${input.rawOcrText.slice(0, 1200)}

Regras obrigatórias:
1. Não invente dados.
2. Se uma informação não estiver explícita, retorne string vazia.
3. Memória e armazenamento podem variar por configuração. Só retorne quando a fonte associar claramente ao modelo.
4. Havendo conflito entre fontes, prefira fabricante ou manual oficial e registre um aviso.
5. documentationUrl e imageUrl devem usar SOMENTE URLs presentes nas fontes.
6. A resposta deve ser um objeto JSON, sem markdown.

Formato:
{
  "manufacturer": "",
  "model": "",
  "processor": "",
  "memory": "",
  "storage": "",
  "categoryHint": "",
  "operatingSystem": "",
  "documentationUrl": "",
  "imageUrl": "",
  "confidence": 0,
  "fieldConfidence": {
    "manufacturer": 0,
    "model": 0,
    "processor": 0,
    "memory": 0,
    "storage": 0,
    "categoryHint": 0,
    "operatingSystem": 0
  },
  "warnings": []
}

Fontes:
${evidence}
`.trim();

  try {
    const result = await env.AI.run(
      env.AI_MODEL ||
        "@cf/zai-org/glm-4.7-flash",
      {
        messages: [
          {
            role: "system",
            content:
              "Você é um extrator técnico conservador. Nunca preencha um campo sem evidência explícita.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0,
        max_tokens: 1300,
        response_format: {
          type: "json_object",
        },
      },
    );

    let raw: unknown = result;

    if (
      result &&
      typeof result === "object" &&
      "response" in result
    ) {
      raw = (
        result as {
          response?: unknown;
        }
      ).response;
    }

    const parsed =
      typeof raw === "string"
        ? JSON.parse(raw)
        : raw;

    return safeSuggestion(
      parsed,
      fallback,
      sources,
    );
  } catch {
    return {
      ...fallback,
      warnings: uniqueStrings([
        ...fallback.warnings,
        "A extração por IA não ficou disponível; foram usadas regras locais.",
      ]),
    };
  }
}

async function hashValue(
  value: string,
): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );

  return Array.from(
    new Uint8Array(digest),
  )
    .map((byte) =>
      byte.toString(16).padStart(2, "0"),
    )
    .join("");
}

async function readInput(
  request: Request,
): Promise<ResearchInput> {
  const contentLength = Number(
    request.headers.get("Content-Length") ?? 0,
  );

  if (contentLength > 20000) {
    throw new Error(
      "A solicitação excede o tamanho permitido.",
    );
  }

  const body = (await request.json()) as
    | Record<string, unknown>
    | null;

  const sourceUrls = Array.isArray(
    body?.sourceUrls,
  )
    ? body.sourceUrls
        .map((value) =>
          cleanText(value, 1600),
        )
        .filter(Boolean)
        .slice(0, 3)
    : [];

  return {
    manufacturer: cleanText(
      body?.manufacturer,
      120,
    ),
    model: cleanText(body?.model, 180),
    categoryHint: cleanText(
      body?.categoryHint,
      120,
    ),
    rawOcrText: cleanText(
      body?.rawOcrText,
      1800,
    ),
    sourceUrls,
  };
}

export async function handleEquipmentSpecsRequest(
  request: Request,
  env: EquipmentSpecsEnv,
  user: EquipmentResearchUser,
): Promise<Response> {
  const url = new URL(request.url);

  if (
    request.method === "GET" &&
    url.pathname ===
      "/equipment-specs/status"
  ) {
    const automaticSearchConfigured =
      env.ENABLE_BRAVE_SEARCH === "true" &&
      Boolean(
        env.BRAVE_SEARCH_API_KEY?.trim(),
      );

    return jsonResponse({
      ok: true,
      freeGuidedSearchAvailable: true,
      automaticSearchConfigured,
      automaticSearchEnabled:
        env.ENABLE_BRAVE_SEARCH === "true",
      aiConfigured: Boolean(env.AI),
      manualUrlAnalysisAvailable: true,
      billingRequired: false,
      model:
        env.AI_MODEL ||
        "@cf/zai-org/glm-4.7-flash",
    });
  }

  if (
    request.method !== "POST" ||
    url.pathname !==
      "/equipment-specs/research"
  ) {
    return jsonResponse(
      {
        ok: false,
        error: {
          code: "route_not_found",
          message:
            "Rota de pesquisa não encontrada.",
        },
      },
      404,
    );
  }

  let input: ResearchInput;

  try {
    input = await readInput(request);
  } catch (error) {
    return jsonResponse(
      {
        ok: false,
        error: {
          code: "invalid_request",
          message:
            error instanceof Error
              ? error.message
              : "Solicitação inválida.",
        },
      },
      400,
    );
  }

  const automaticSearchConfigured =
    env.ENABLE_BRAVE_SEARCH === "true" &&
    Boolean(
      env.BRAVE_SEARCH_API_KEY?.trim(),
    );

  if (
    input.sourceUrls.length === 0 &&
    !automaticSearchConfigured
  ) {
    return jsonResponse(
      {
        ok: false,
        error: {
          code: "source_urls_required",
          message:
            "Abra uma das buscas gratuitas, encontre uma página oficial e cole de uma a três URLs antes de analisar.",
        },
      },
      400,
    );
  }

  const cacheHash = await hashValue(
    JSON.stringify(input),
  );
  const cacheKey = new Request(
    `https://ativelo.internal/spec-research/${cacheHash}`,
  );
  const cache = caches.default;
  const cached = await cache.match(cacheKey);

  if (cached) {
    const body = await cached.json();

    return jsonResponse({
      ...(body as Record<string, unknown>),
      cached: true,
    });
  }

  let braveResults: BraveWebResult[] = [];

  if (
    automaticSearchConfigured &&
    (
      input.model ||
      input.manufacturer
    )
  ) {
    const baseQuery = [
      input.manufacturer,
      input.model,
      "specifications",
      "manual",
      "datasheet",
      "processor memory storage operating system",
    ]
      .filter(Boolean)
      .join(" ");

    try {
      braveResults = await searchBrave(
        baseQuery,
        env.BRAVE_SEARCH_API_KEY!.trim(),
      );

      const officialDomains =
        manufacturerDomains[
          normalizeText(input.manufacturer)
        ] ?? [];

      if (
        officialDomains.length > 0 &&
        input.model
      ) {
        const officialQuery = [
          `"${input.model}"`,
          `site:${officialDomains[0]}`,
          "specifications OR manual",
        ].join(" ");

        const officialResults =
          await searchBrave(
            officialQuery,
            env.BRAVE_SEARCH_API_KEY!.trim(),
          );

        braveResults.push(
          ...officialResults,
        );
      }
    } catch (error) {
      if (input.sourceUrls.length === 0) {
        return jsonResponse(
          {
            ok: false,
            error: {
              code:
                "search_provider_unavailable",
              message:
                error instanceof Error
                  ? error.message
                  : "A pesquisa automática não respondeu.",
            },
          },
          502,
        );
      }
    }
  }

  const sourceCandidates = [
    ...braveResults
      .map((result, index) =>
        sourceFromResult(
          result,
          input,
          index,
        ),
      )
      .filter(
        (
          source,
        ): source is ResearchSource =>
          Boolean(source),
      ),
    ...input.sourceUrls
      .map((sourceUrl, index) =>
        sourceFromManualUrl(
          sourceUrl,
          input,
          index,
        ),
      )
      .filter(
        (
          source,
        ): source is ResearchSource =>
          Boolean(source),
      ),
  ];

  const deduplicated = Array.from(
    new Map(
      sourceCandidates.map((source) => [
        source.url,
        source,
      ]),
    ).values(),
  )
    .sort(
      (left, right) =>
        right.score - left.score,
    )
    .slice(0, 8)
    .map((source, index) => ({
      ...source,
      id: `S${index + 1}`,
    }));

  if (deduplicated.length === 0) {
    return jsonResponse(
      {
        ok: false,
        error: {
          code: "no_sources_found",
          message:
            "Nenhuma fonte válida foi encontrada para o modelo informado.",
        },
      },
      404,
    );
  }

  const enriched = await Promise.all(
    deduplicated
      .slice(0, 5)
      .map(enrichSource),
  );

  const sources = [
    ...enriched,
    ...deduplicated.slice(5),
  ];

  const fallback = heuristicSuggestion(
    input,
    sources,
  );

  const suggestion = await aiSuggestion(
    env,
    input,
    sources,
    fallback,
  );

  const responseBody = {
    ok: true,
    cached: false,
    query: [
      input.manufacturer,
      input.model,
    ]
      .filter(Boolean)
      .join(" ")
      .trim(),
    suggestion,
    sources: sources.map((source) => ({
      id: source.id,
      title: source.title,
      url: source.url,
      host: source.host,
      snippet: source.snippet,
      sourceType: source.sourceType,
      score: source.score,
      imageUrl: source.imageUrl,
    })),
    provider: {
      search:
        automaticSearchConfigured
          ? "brave"
          : "manual_urls",
      extraction: env.AI
        ? "workers_ai"
        : "heuristics",
    },
    researchedBy: user.id,
    researchedAt: new Date().toISOString(),
  };

  await cache.put(
    cacheKey,
    new Response(
      JSON.stringify(responseBody),
      {
        headers: {
          "Cache-Control":
            "public, max-age=21600",
          "Content-Type":
            "application/json; charset=utf-8",
        },
      },
    ),
  );

  return jsonResponse(responseBody);
}