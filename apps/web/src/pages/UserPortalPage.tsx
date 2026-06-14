import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { BrowserQRCodeReader } from "@zxing/browser";
import type { OrganizationContext } from "../App";
import AppIcon from "../components/AppIcon";
import OrganizationBrand from "../components/OrganizationBrand";
import { useAuth } from "../contexts/AuthContext";
import { supabase } from "../lib/supabase";

type Props = {
  organization: OrganizationContext;
};

type ScannerControls = {
  stop: () => void;
};

type AssignedAsset = {
  id: string;
  asset_number: string;
  name: string;
  operational_status: string;
  physical_condition: string;
  category_id: string;
  unit_name: string | null;
  room_name: string | null;
  serial_number: string | null;
  public_id: string | null;
  qr_token: string | null;
};

type TicketRecord = {
  id: string;
  ticket_number: string;
  asset_id: string | null;
  title: string;
  description: string;
  category: string;
  priority: string;
  status: string;
  created_at: string;
  updated_at: string;
  resolution_summary: string | null;
};

type KnowledgeRecord = {
  id: string;
  asset_category_id: string | null;
  title: string;
  symptom_pattern: string;
  keywords: string[];
  user_steps: unknown;
  severity: string;
};

type ProfileRecord = {
  full_name: string;
  email: string | null;
};

type TicketForm = {
  assetId: string;
  title: string;
  description: string;
  category: string;
  priority: string;
};

const emptyTicketForm: TicketForm = {
  assetId: "",
  title: "",
  description: "",
  category: "hardware",
  priority: "medium",
};

const statusLabels: Record<string, string> = {
  open: "Aberto",
  triage: "Em triagem",
  in_progress: "Em atendimento",
  waiting_user: "Aguardando você",
  waiting_part: "Aguardando peça",
  resolved: "Resolvido",
  closed: "Encerrado",
  canceled: "Cancelado",
};

const assetStatusLabels: Record<string, string> = {
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

const conditionLabels: Record<string, string> = {
  new: "Novo",
  excellent: "Excelente",
  good: "Bom",
  fair: "Regular",
  poor: "Ruim",
  irrecoverable: "Irrecuperável",
};

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return value.filter(
    (item): item is string => typeof item === "string",
  );
}

function calculateDueAt(priority: string) {
  const hoursByPriority: Record<string, number> = {
    low: 72,
    medium: 24,
    high: 8,
    urgent: 4,
  };

  const date = new Date();
  date.setHours(
    date.getHours() + (hoursByPriority[priority] ?? 24),
  );

  return date.toISOString();
}

function parseAssetCode(rawCode: string) {
  const normalized = rawCode.trim();

  if (normalized.startsWith("ATV:")) {
    const [, publicId, token] = normalized.split(":");

    return {
      publicId: publicId || null,
      token: token || null,
      literal: null,
    };
  }

  try {
    const url = new URL(normalized);

    return {
      publicId: url.searchParams.get("asset"),
      token: url.searchParams.get("token"),
      literal:
        url.searchParams.get("number") ||
        url.searchParams.get("code"),
    };
  } catch {
    return {
      publicId: null,
      token: /^[0-9a-f-]{36}$/i.test(normalized)
        ? normalized
        : null,
      literal: normalized,
    };
  }
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function UserPortalPage({
  organization,
}: Props) {
  const { user, signOut } = useAuth();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const scannerControlsRef =
    useRef<ScannerControls | null>(null);
  const lastCodeRef = useRef("");

  const [profile, setProfile] =
    useState<ProfileRecord | null>(null);
  const [assets, setAssets] = useState<AssignedAsset[]>([]);
  const [tickets, setTickets] = useState<TicketRecord[]>([]);
  const [knowledge, setKnowledge] =
    useState<KnowledgeRecord[]>([]);

  const [ticketForm, setTicketForm] =
    useState<TicketForm>(emptyTicketForm);
  const [completedSteps, setCompletedSteps] =
    useState<Record<string, boolean>>({});
  const [isTicketOpen, setIsTicketOpen] = useState(false);
  const [isCameraActive, setIsCameraActive] =
    useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error" | "warning";
    text: string;
  } | null>(null);

  const stopCamera = useCallback(() => {
    scannerControlsRef.current?.stop();
    scannerControlsRef.current = null;
    setIsCameraActive(false);

    const stream = videoRef.current?.srcObject;

    if (stream instanceof MediaStream) {
      stream.getTracks().forEach((track) => track.stop());
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  useEffect(() => stopCamera, [stopCamera]);

  const loadPortal = useCallback(async () => {
    if (!user) return;

    setIsLoading(true);
    setFeedback(null);

    const organizationId = organization.organizationId;

    const [
      profileResult,
      assetsResult,
      ticketsResult,
      knowledgeResult,
    ] = await Promise.all([
      supabase
        .from("profiles")
        .select("full_name,email")
        .eq("id", user.id)
        .maybeSingle(),
      supabase.rpc("get_my_assigned_assets", {
        target_organization_id: organizationId,
      }),
      supabase
        .from("support_tickets")
        .select(
          "id,ticket_number,asset_id,title,description,category,priority,status,created_at,updated_at,resolution_summary",
        )
        .eq("organization_id", organizationId)
        .eq("requester_user_id", user.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("defect_knowledge_base")
        .select(
          "id,asset_category_id,title,symptom_pattern,keywords,user_steps,severity",
        )
        .eq("is_active", true),
    ]);

    const firstError = [
      profileResult.error,
      assetsResult.error,
      ticketsResult.error,
      knowledgeResult.error,
    ].find(Boolean);

    if (firstError) {
      setFeedback({
        type: "error",
        text: firstError.message,
      });
      setIsLoading(false);
      return;
    }

    setProfile(
      (profileResult.data as ProfileRecord | null) ?? null,
    );
    setAssets(
      (assetsResult.data ?? []) as AssignedAsset[],
    );
    setTickets(
      (ticketsResult.data ?? []) as TicketRecord[],
    );
    setKnowledge(
      (knowledgeResult.data ?? []) as KnowledgeRecord[],
    );

    await supabase.rpc("touch_my_organization_access", {
      target_organization_id: organizationId,
    });

    setIsLoading(false);
  }, [organization.organizationId, user]);

  useEffect(() => {
    void loadPortal();
  }, [loadPortal]);

  const selectedAsset =
    assets.find((asset) => asset.id === ticketForm.assetId) ??
    null;

  const knowledgeMatches = useMemo(() => {
    const source = normalizeText(
      `${ticketForm.title} ${ticketForm.description}`,
    );

    if (source.trim().length < 4) return [];

    return knowledge
      .filter(
        (entry) =>
          !entry.asset_category_id ||
          !selectedAsset ||
          entry.asset_category_id ===
            selectedAsset.category_id,
      )
      .map((entry) => {
        const keywordScore = (entry.keywords ?? []).reduce(
          (total, keyword) =>
            source.includes(normalizeText(keyword))
              ? total + 4
              : total,
          0,
        );

        const patternScore = normalizeText(
          entry.symptom_pattern,
        )
          .split(/\s+/)
          .filter((word) => word.length >= 5)
          .reduce(
            (total, word) =>
              source.includes(word) ? total + 1 : total,
            0,
          );

        return {
          entry,
          score: keywordScore + patternScore,
        };
      })
      .filter((match) => match.score > 0)
      .sort((left, right) => right.score - left.score)
      .slice(0, 3);
  }, [
    knowledge,
    selectedAsset,
    ticketForm.description,
    ticketForm.title,
  ]);

  const suggestedSteps = useMemo(() => {
    const steps = knowledgeMatches.flatMap((match) =>
      toStringArray(match.entry.user_steps),
    );

    return Array.from(new Set(steps)).slice(0, 8);
  }, [knowledgeMatches]);

  useEffect(() => {
    setCompletedSteps({});
  }, [ticketForm.title, ticketForm.description]);

  const openTickets = tickets.filter(
    (ticket) =>
      !["resolved", "closed", "canceled"].includes(
        ticket.status,
      ),
  );

  const resolvedTickets = tickets.filter((ticket) =>
    ["resolved", "closed"].includes(ticket.status),
  );

  const resetTicket = () => {
    stopCamera();
    setTicketForm(emptyTicketForm);
    setCompletedSteps({});
    setIsTicketOpen(false);
  };

  const resolveAssetCode = async (rawCode: string) => {
    const parsed = parseAssetCode(rawCode);

    const baseQuery = () =>
      supabase
        .from("assets")
        .select(
          "id,asset_number,name,operational_status,physical_condition,category_id,serial_number,public_id,qr_token,organization_units(name),rooms(name)",
        )
        .eq("organization_id", organization.organizationId)
        .eq("is_active", true);

    let data: Record<string, unknown> | null = null;

    if (parsed.publicId) {
      const result = await baseQuery()
        .eq("public_id", parsed.publicId)
        .limit(1)
        .maybeSingle();

      if (result.error) throw result.error;
      data = result.data;
    } else if (parsed.token) {
      const result = await baseQuery()
        .eq("qr_token", parsed.token)
        .limit(1)
        .maybeSingle();

      if (result.error) throw result.error;
      data = result.data;
    } else if (parsed.literal) {
      const assetNumberResult = await baseQuery()
        .eq("asset_number", parsed.literal)
        .limit(1)
        .maybeSingle();

      if (assetNumberResult.error) {
        throw assetNumberResult.error;
      }

      data = assetNumberResult.data;

      if (!data) {
        const barcodeResult = await baseQuery()
          .eq("barcode_value", parsed.literal)
          .limit(1)
          .maybeSingle();

        if (barcodeResult.error) {
          throw barcodeResult.error;
        }

        data = barcodeResult.data;
      }

      if (!data) {
        const serialResult = await baseQuery()
          .eq("serial_number", parsed.literal)
          .limit(1)
          .maybeSingle();

        if (serialResult.error) {
          throw serialResult.error;
        }

        data = serialResult.data;
      }

      if (!data) {
        const serviceTagResult = await baseQuery()
          .eq("service_tag", parsed.literal)
          .limit(1)
          .maybeSingle();

        if (serviceTagResult.error) {
          throw serviceTagResult.error;
        }

        data = serviceTagResult.data;
      }
    }

    if (!data) {
      throw new Error(
        "O equipamento não foi encontrado nesta empresa.",
      );
    }

    const unitRelation = data.organization_units;
    const roomRelation = data.rooms;

    const normalizedAsset: AssignedAsset = {
      id: String(data.id),
      asset_number: String(data.asset_number ?? ""),
      name: String(data.name ?? "Equipamento"),
      operational_status: String(
        data.operational_status ?? "available",
      ),
      physical_condition: String(
        data.physical_condition ?? "good",
      ),
      category_id: String(data.category_id ?? ""),
      serial_number: data.serial_number
        ? String(data.serial_number)
        : null,
      public_id: data.public_id
        ? String(data.public_id)
        : null,
      qr_token: data.qr_token
        ? String(data.qr_token)
        : null,
      unit_name: Array.isArray(unitRelation)
        ? String(unitRelation[0]?.name ?? "")
        : unitRelation &&
            typeof unitRelation === "object" &&
            "name" in unitRelation
          ? String(unitRelation.name ?? "")
          : null,
      room_name: Array.isArray(roomRelation)
        ? String(roomRelation[0]?.name ?? "")
        : roomRelation &&
            typeof roomRelation === "object" &&
            "name" in roomRelation
          ? String(roomRelation.name ?? "")
          : null,
    };

    setAssets((current) =>
      current.some((asset) => asset.id === normalizedAsset.id)
        ? current
        : [...current, normalizedAsset],
    );

    setTicketForm((current) => ({
      ...current,
      assetId: normalizedAsset.id,
    }));

    return normalizedAsset;
  };

  const registerScannedCode = useCallback(
    async (rawCode: string) => {
      const normalized = rawCode.trim();

      if (
        !normalized ||
        normalized === lastCodeRef.current ||
        isScanning
      ) {
        return;
      }

      lastCodeRef.current = normalized;
      setIsScanning(true);

      try {
        const asset = await resolveAssetCode(normalized);

        setFeedback({
          type: "success",
          text:
            `${asset.asset_number} · ${asset.name} selecionado para o chamado.`,
        });
        stopCamera();
      } catch (error) {
        lastCodeRef.current = "";
        setFeedback({
          type: "error",
          text:
            error instanceof Error
              ? error.message
              : "Não foi possível ler o equipamento.",
        });
      } finally {
        setIsScanning(false);
      }
    },
    [isScanning, stopCamera],
  );

  const startCamera = async () => {
    setFeedback(null);
    lastCodeRef.current = "";
    stopCamera();

    if (!videoRef.current) return;

    try {
      const reader = new BrowserQRCodeReader();

      const controls = await reader.decodeFromConstraints(
        {
          audio: false,
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        },
        videoRef.current,
        (result) => {
          if (result) {
            void registerScannedCode(result.getText());
          }
        },
      );

      scannerControlsRef.current = controls;
      setIsCameraActive(true);
    } catch (error) {
      setFeedback({
        type: "error",
        text:
          error instanceof Error
            ? `Não foi possível acessar a câmera: ${error.message}`
            : "Não foi possível acessar a câmera.",
      });
      stopCamera();
    }
  };

  const markSelfHelpResolved = async () => {
    if (!ticketForm.description.trim()) {
      setFeedback({
        type: "warning",
        text: "Descreva o problema antes de concluir.",
      });
      return;
    }

    const completed = suggestedSteps.filter(
      (step) => completedSteps[step],
    );

    const { error } = await supabase
      .from("self_service_sessions")
      .insert({
        organization_id: organization.organizationId,
        asset_id: ticketForm.assetId || null,
        knowledge_id:
          knowledgeMatches[0]?.entry.id ?? null,
        description:
          `${ticketForm.title}\n${ticketForm.description}`.trim(),
        completed_steps: completed,
        resolved: true,
      });

    if (error) {
      setFeedback({
        type: "error",
        text: error.message,
      });
      return;
    }

    resetTicket();
    setFeedback({
      type: "success",
      text:
        "Solução registrada. O chamado não precisou ser enviado.",
    });
  };

  const createTicket = async (
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();
    setFeedback(null);

    if (
      !ticketForm.title.trim() ||
      !ticketForm.description.trim()
    ) {
      setFeedback({
        type: "error",
        text: "Informe o título e descreva o problema.",
      });
      return;
    }

    setIsSaving(true);

    const selfHelpSteps = suggestedSteps.map((step) => ({
      step,
      completed: Boolean(completedSteps[step]),
    }));

    const { error } = await supabase
      .from("support_tickets")
      .insert({
        organization_id: organization.organizationId,
        ticket_number: "",
        asset_id: ticketForm.assetId || null,
        requester_user_id: user?.id ?? null,
        requester_name:
          profile?.full_name ||
          user?.user_metadata?.full_name ||
          user?.email ||
          "Usuário",
        requester_email: user?.email ?? null,
        title: ticketForm.title.trim(),
        description: ticketForm.description.trim(),
        category: ticketForm.category,
        priority: ticketForm.priority,
        channel: "app",
        due_at: calculateDueAt(ticketForm.priority),
        matched_knowledge_ids: knowledgeMatches.map(
          (match) => match.entry.id,
        ),
        self_help_steps: selfHelpSteps,
        self_help_result:
          selfHelpSteps.length === 0
            ? "not_attempted"
            : "not_resolved",
      });

    if (error) {
      setFeedback({
        type: "error",
        text: error.message,
      });
      setIsSaving(false);
      return;
    }

    resetTicket();
    setFeedback({
      type: "success",
      text:
        "Chamado aberto e enviado para a equipe de TI.",
    });
    setIsSaving(false);
    await loadPortal();
  };

  const displayName =
    profile?.full_name ||
    user?.user_metadata?.full_name ||
    user?.email?.split("@")[0] ||
    "Usuário";

  return (
    <main className="ativelo-portal-page">
      <header className="ativelo-portal-header">
        <OrganizationBrand
          organization={organization}
          showLegalName
        />

        <div className="ativelo-portal-header-actions">
          <span>
            <small>Olá,</small>
            <strong>{displayName}</strong>
          </span>

          <button
            type="button"
            onClick={() => void signOut()}
          >
            Sair
          </button>
        </div>
      </header>

      {feedback && (
        <div className={`ativelo-portal-feedback ${feedback.type}`}>
          {feedback.text}
        </div>
      )}

      <section className="ativelo-portal-hero">
        <div>
          <span>PORTAL DE SUPORTE</span>
          <h1>Seu equipamento precisa de ajuda?</h1>
          <p>
            Abra um chamado, acompanhe o atendimento ou tente uma
            solução guiada antes de enviar para a equipe técnica.
          </p>

          <button
            type="button"
            onClick={() => {
              setFeedback(null);
              setIsTicketOpen(true);
            }}
          >
            <AppIcon name="plus" size={19} />
            Abrir chamado
          </button>
        </div>

        <div className="ativelo-portal-hero-visual">
          <AppIcon name="message" size={58} />
          <span>TI</span>
        </div>
      </section>

      <section className="ativelo-portal-metrics">
        <article>
          <i>
            <AppIcon name="assets" size={22} />
          </i>
          <span>
            <small>Meus equipamentos</small>
            <strong>{assets.length}</strong>
          </span>
        </article>

        <article>
          <i>
            <AppIcon name="tickets" size={22} />
          </i>
          <span>
            <small>Chamados em andamento</small>
            <strong>{openTickets.length}</strong>
          </span>
        </article>

        <article>
          <i>
            <AppIcon name="check" size={22} />
          </i>
          <span>
            <small>Chamados resolvidos</small>
            <strong>{resolvedTickets.length}</strong>
          </span>
        </article>
      </section>

      {isLoading ? (
        <section className="ativelo-portal-loading">
          Carregando seu portal...
        </section>
      ) : (
        <section className="ativelo-portal-grid">
          <article className="ativelo-portal-panel">
            <header>
              <div>
                <span>PATRIMÔNIOS VINCULADOS</span>
                <h2>Meus equipamentos</h2>
              </div>
            </header>

            {assets.length === 0 ? (
              <div className="ativelo-portal-empty">
                <AppIcon name="assets" size={40} />
                <strong>Nenhum equipamento vinculado</strong>
                <span>
                  Você ainda pode abrir um chamado e ler a
                  etiqueta do equipamento.
                </span>
              </div>
            ) : (
              <div className="ativelo-portal-assets">
                {assets.map((asset) => (
                  <article key={asset.id}>
                    <i>
                      <AppIcon name="assets" size={24} />
                    </i>

                    <div>
                      <span>{asset.asset_number}</span>
                      <h3>{asset.name}</h3>
                      <p>
                        {[asset.unit_name, asset.room_name]
                          .filter(Boolean)
                          .join(" · ") || "Local não informado"}
                      </p>
                    </div>

                    <footer>
                      <b>
                        {assetStatusLabels[
                          asset.operational_status
                        ] ?? asset.operational_status}
                      </b>
                      <small>
                        {conditionLabels[
                          asset.physical_condition
                        ] ?? asset.physical_condition}
                      </small>
                      <button
                        type="button"
                        onClick={() => {
                          setTicketForm({
                            ...emptyTicketForm,
                            assetId: asset.id,
                          });
                          setIsTicketOpen(true);
                        }}
                      >
                        Relatar problema
                      </button>
                    </footer>
                  </article>
                ))}
              </div>
            )}
          </article>

          <article className="ativelo-portal-panel">
            <header>
              <div>
                <span>ACOMPANHAMENTO</span>
                <h2>Meus chamados</h2>
              </div>

              <button
                type="button"
                onClick={() => void loadPortal()}
              >
                <AppIcon name="refresh" size={17} />
                Atualizar
              </button>
            </header>

            {tickets.length === 0 ? (
              <div className="ativelo-portal-empty">
                <AppIcon name="tickets" size={40} />
                <strong>Nenhum chamado aberto</strong>
                <span>
                  Quando precisar, use o botão “Abrir chamado”.
                </span>
              </div>
            ) : (
              <div className="ativelo-portal-tickets">
                {tickets.slice(0, 12).map((ticket) => {
                  const asset = assets.find(
                    (item) => item.id === ticket.asset_id,
                  );

                  return (
                    <article key={ticket.id}>
                      <header>
                        <span>{ticket.ticket_number}</span>
                        <b className={ticket.status}>
                          {statusLabels[ticket.status] ??
                            ticket.status}
                        </b>
                      </header>

                      <h3>{ticket.title}</h3>
                      <p>{ticket.description}</p>

                      <footer>
                        <span>
                          {asset
                            ? `${asset.asset_number} · ${asset.name}`
                            : "Sem equipamento vinculado"}
                        </span>
                        <time>{formatDate(ticket.created_at)}</time>
                      </footer>

                      {ticket.resolution_summary && (
                        <div className="ativelo-portal-resolution">
                          <strong>Solução registrada</strong>
                          <span>
                            {ticket.resolution_summary}
                          </span>
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </article>
        </section>
      )}

      <footer className="ativelo-portal-signature">
        <span>Portal protegido e gerenciado por</span>
        <img
          src="/assets/ativelo-logo.png"
          alt="Ativelo"
        />
      </footer>

      {isTicketOpen && (
        <div className="ativelo-modal-backdrop">
          <section
            className="ativelo-modal ativelo-portal-ticket-modal"
            role="dialog"
            aria-modal="true"
          >
            <header>
              <div>
                <span>NOVA SOLICITAÇÃO</span>
                <h2>Abrir chamado de suporte</h2>
              </div>

              <button type="button" onClick={resetTicket}>
                <AppIcon name="close" size={21} />
              </button>
            </header>

            <form onSubmit={createTicket}>
              <section className="ativelo-portal-scanner">
                <div className="ativelo-portal-video">
                  <video
                    ref={videoRef}
                    muted
                    playsInline
                  />

                  {!isCameraActive && (
                    <div>
                      <AppIcon name="scan" size={34} />
                      <strong>Leia a etiqueta QR</strong>
                      <span>
                        O equipamento será selecionado
                        automaticamente.
                      </span>
                    </div>
                  )}
                </div>

                <div>
                  <button
                    type="button"
                    onClick={
                      isCameraActive
                        ? stopCamera
                        : () => void startCamera()
                    }
                  >
                    <AppIcon
                      name={
                        isCameraActive ? "close" : "camera"
                      }
                      size={18}
                    />
                    {isCameraActive
                      ? "Parar câmera"
                      : "Ler QR Code"}
                  </button>

                  <p>
                    Também é possível selecionar um dos seus
                    equipamentos abaixo.
                  </p>
                </div>
              </section>

              <label>
                <span>Equipamento</span>
                <select
                  value={ticketForm.assetId}
                  onChange={(event) =>
                    setTicketForm({
                      ...ticketForm,
                      assetId: event.target.value,
                    })
                  }
                >
                  <option value="">
                    Problema sem equipamento específico
                  </option>
                  {assets.map((asset) => (
                    <option key={asset.id} value={asset.id}>
                      {asset.asset_number} · {asset.name}
                    </option>
                  ))}
                </select>
              </label>

              <div className="two">
                <label>
                  <span>Tipo do problema</span>
                  <select
                    value={ticketForm.category}
                    onChange={(event) =>
                      setTicketForm({
                        ...ticketForm,
                        category: event.target.value,
                      })
                    }
                  >
                    <option value="hardware">Hardware</option>
                    <option value="software">Programa</option>
                    <option value="network">
                      Rede ou internet
                    </option>
                    <option value="printer">
                      Impressora
                    </option>
                    <option value="access">Acesso ou senha</option>
                    <option value="security">Segurança</option>
                    <option value="other">Outro</option>
                  </select>
                </label>

                <label>
                  <span>Prioridade</span>
                  <select
                    value={ticketForm.priority}
                    onChange={(event) =>
                      setTicketForm({
                        ...ticketForm,
                        priority: event.target.value,
                      })
                    }
                  >
                    <option value="low">Baixa</option>
                    <option value="medium">Normal</option>
                    <option value="high">Alta</option>
                    <option value="urgent">Urgente</option>
                  </select>
                </label>
              </div>

              <label>
                <span>Título *</span>
                <input
                  value={ticketForm.title}
                  onChange={(event) =>
                    setTicketForm({
                      ...ticketForm,
                      title: event.target.value,
                    })
                  }
                  placeholder="Ex.: Monitor sem imagem"
                />
              </label>

              <label>
                <span>Descreva o problema *</span>
                <textarea
                  rows={5}
                  value={ticketForm.description}
                  onChange={(event) =>
                    setTicketForm({
                      ...ticketForm,
                      description: event.target.value,
                    })
                  }
                  placeholder="Conte o que aconteceu e o que aparece na tela."
                />
              </label>

              {suggestedSteps.length > 0 && (
                <section className="ativelo-portal-self-help">
                  <header>
                    <AppIcon name="book" size={21} />
                    <div>
                      <strong>
                        Antes de enviar, teste estes passos
                      </strong>
                      <span>
                        Marque apenas os procedimentos que você
                        realizou.
                      </span>
                    </div>
                  </header>

                  <div>
                    {suggestedSteps.map((step) => (
                      <label key={step}>
                        <input
                          type="checkbox"
                          checked={Boolean(
                            completedSteps[step],
                          )}
                          onChange={(event) =>
                            setCompletedSteps({
                              ...completedSteps,
                              [step]: event.target.checked,
                            })
                          }
                        />
                        <span>{step}</span>
                      </label>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      void markSelfHelpResolved()
                    }
                  >
                    <AppIcon name="check" size={17} />
                    O problema foi resolvido
                  </button>
                </section>
              )}

              <footer>
                <button
                  type="button"
                  className="secondary"
                  onClick={resetTicket}
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  className="primary"
                  disabled={isSaving}
                >
                  <AppIcon name="send" size={18} />
                  {isSaving
                    ? "Enviando..."
                    : "Enviar chamado"}
                </button>
              </footer>
            </form>
          </section>
        </div>
      )}
    </main>
  );
}
