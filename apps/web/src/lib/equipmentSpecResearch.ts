import {
  AtiveloApiError,
  ativeloApiUrl,
} from "./ativeloApi";
import { supabase } from "./supabase";

export type EquipmentSpecSource = {
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
};

export type EquipmentSpecSuggestion = {
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

export type EquipmentSpecResearchResult = {
  ok: true;
  cached: boolean;
  query: string;
  suggestion: EquipmentSpecSuggestion;
  sources: EquipmentSpecSource[];
  provider: {
    search: "brave" | "manual_urls";
    extraction:
      | "workers_ai"
      | "heuristics";
  };
  researchedAt: string;
};

type ResearchInput = {
  manufacturer: string;
  model: string;
  categoryHint: string;
  rawOcrText: string;
  sourceUrls: string[];
};

type ErrorBody = {
  error?: {
    code?: string;
    message?: string;
  };
};

function requestId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }

  return `ativelo-spec-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}`;
}

async function parseJson(
  response: Response,
): Promise<unknown> {
  const contentType =
    response.headers.get("content-type") ?? "";

  if (
    !contentType.includes(
      "application/json",
    )
  ) {
    return null;
  }

  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function getAccessToken(): Promise<string> {
  const { data } =
    await supabase.auth.getSession();

  if (data.session?.access_token) {
    return data.session.access_token;
  }

  const refreshed =
    await supabase.auth.refreshSession();

  if (
    refreshed.error ||
    !refreshed.data.session?.access_token
  ) {
    throw new AtiveloApiError(
      401,
      "session_unavailable",
      "Sua sessão não está disponível. Entre novamente.",
    );
  }

  return refreshed.data.session.access_token;
}

async function sendResearch(
  input: ResearchInput,
  accessToken: string,
  signal?: AbortSignal,
): Promise<EquipmentSpecResearchResult> {
  const response = await fetch(
    `${ativeloApiUrl}/equipment-specs/research`,
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "X-Request-Id": requestId(),
      },
      body: JSON.stringify(input),
      cache: "no-store",
      credentials: "omit",
      referrerPolicy: "no-referrer",
      signal,
    },
  );

  const body = await parseJson(response);

  if (!response.ok) {
    const error = body as ErrorBody | null;

    throw new AtiveloApiError(
      response.status,
      error?.error?.code ??
        "spec_research_failed",
      error?.error?.message ??
        "A pesquisa de especificações não respondeu como esperado.",
    );
  }

  return body as EquipmentSpecResearchResult;
}

export async function researchEquipmentSpecs(
  input: ResearchInput,
  signal?: AbortSignal,
): Promise<EquipmentSpecResearchResult> {
  let accessToken = await getAccessToken();

  try {
    return await sendResearch(
      input,
      accessToken,
      signal,
    );
  } catch (error) {
    if (
      !(error instanceof AtiveloApiError) ||
      error.status !== 401
    ) {
      throw error;
    }

    const refreshed =
      await supabase.auth.refreshSession();

    if (
      refreshed.error ||
      !refreshed.data.session?.access_token
    ) {
      throw error;
    }

    accessToken =
      refreshed.data.session.access_token;

    return sendResearch(
      input,
      accessToken,
      signal,
    );
  }
}