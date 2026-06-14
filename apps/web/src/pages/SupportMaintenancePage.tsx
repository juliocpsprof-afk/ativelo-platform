import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import type { OrganizationContext } from "../App";
import AppIcon from "../components/AppIcon";
import { supabase } from "../lib/supabase";

export type SupportTab = "tickets" | "preventive" | "knowledge" | "analytics";

type Props = {
  organization: OrganizationContext;
  initialTab?: SupportTab;
  onBack: () => void;
  onOpenAsset: (assetId: string) => void;
};

type Option = {
  id: string;
  name: string;
};

type AssetOption = Option & {
  asset_number: string;
  operational_status: string;
  category_id: string;
  model_id: string | null;
};

type KnowledgeRecord = {
  id: string;
  organization_id: string | null;
  asset_category_id: string | null;
  title: string;
  symptom_pattern: string;
  keywords: string[];
  user_steps: unknown;
  technician_diagnostics: unknown;
  severity: string;
  is_active: boolean;
  created_at: string;
};

type TicketRecord = {
  id: string;
  organization_id: string;
  ticket_number: string;
  asset_id: string | null;
  requester_name: string | null;
  requester_email: string | null;
  title: string;
  description: string;
  category: string;
  priority: string;
  status: string;
  channel: string;
  matched_knowledge_ids: string[];
  self_help_steps: unknown;
  self_help_result: string | null;
  assigned_to: string | null;
  due_at: string | null;
  first_response_at: string | null;
  resolved_at: string | null;
  closed_at: string | null;
  resolution_summary: string | null;
  created_at: string;
  updated_at: string;
};

type TicketEventRecord = {
  id: string;
  ticket_id: string;
  event_type: string;
  previous_value: string | null;
  new_value: string | null;
  message: string | null;
  metadata: unknown;
  created_at: string;
};

type WorkOrderRecord = {
  id: string;
  work_order_number: string;
  ticket_id: string | null;
  asset_id: string;
  maintenance_type: string;
  title: string;
  priority: string;
  status: string;
  scheduled_date: string | null;
  started_at: string | null;
  completed_at: string | null;
  diagnosis: string | null;
  probable_cause: string | null;
  solution: string | null;
  notes: string | null;
  created_at: string;
};

type PreventivePlanRecord = {
  id: string;
  name: string;
  asset_id: string | null;
  asset_category_id: string | null;
  asset_model_id: string | null;
  service_type: string;
  instructions: string | null;
  interval_days: number;
  alert_days: number;
  estimated_duration_minutes: number | null;
  last_completed_date: string | null;
  next_due_date: string;
  is_active: boolean;
  created_at: string;
};

const ticketStatusLabels: Record<string, string> = {
  open: "Aberto",
  triage: "Em triagem",
  in_progress: "Em atendimento",
  waiting_user: "Aguardando usuário",
  waiting_part: "Aguardando peça",
  resolved: "Resolvido",
  closed: "Fechado",
  canceled: "Cancelado",
};

const priorityLabels: Record<string, string> = {
  low: "Baixa",
  medium: "Média",
  high: "Alta",
  urgent: "Urgente",
};

const categoryLabels: Record<string, string> = {
  hardware: "Hardware",
  software: "Software",
  network: "Rede",
  printer: "Impressora",
  access: "Acesso",
  security: "Segurança",
  other: "Outro",
};

const workOrderStatusLabels: Record<string, string> = {
  scheduled: "Agendada",
  in_progress: "Em execução",
  waiting_part: "Aguardando peça",
  completed: "Concluída",
  canceled: "Cancelada",
};

const blankTicketForm = {
  assetId: "",
  requesterName: "",
  requesterEmail: "",
  title: "",
  description: "",
  category: "hardware",
  priority: "medium",
};

const blankPlanForm = {
  name: "",
  assetId: "",
  categoryId: "",
  modelId: "",
  serviceType: "",
  instructions: "",
  intervalDays: "90",
  alertDays: "7",
  estimatedDuration: "60",
  nextDueDate: "",
};

const blankKnowledgeForm = {
  title: "",
  categoryId: "",
  symptomPattern: "",
  keywords: "",
  userSteps: "",
  technicianDiagnostics: "",
  severity: "medium",
};

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string");
}

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "Não informado";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatDate(value: string | null) {
  if (!value) {
    return "Não informado";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
  }).format(new Date(`${value}T12:00:00`));
}

function calculateDueAt(priority: string) {
  const hoursByPriority: Record<string, number> = {
    low: 72,
    medium: 24,
    high: 8,
    urgent: 4,
  };

  const dueDate = new Date();
  dueDate.setHours(dueDate.getHours() + (hoursByPriority[priority] ?? 24));
  return dueDate.toISOString();
}

function addDays(dateValue: string, days: number) {
  const date = new Date(`${dateValue}T12:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function getPlanDueState(plan: PreventivePlanRecord) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const dueDate = new Date(`${plan.next_due_date}T00:00:00`);
  const alertDate = new Date(dueDate);
  alertDate.setDate(alertDate.getDate() - plan.alert_days);

  if (dueDate.getTime() < today.getTime()) {
    return "overdue";
  }

  if (alertDate.getTime() <= today.getTime()) {
    return "due_soon";
  }

  return "scheduled";
}

export default function SupportMaintenancePage({
  organization,
  initialTab = "tickets",
  onBack,
  onOpenAsset,
}: Props) {
  const [activeTab, setActiveTab] = useState<SupportTab>(initialTab);
  const [assets, setAssets] = useState<AssetOption[]>([]);
  const [categories, setCategories] = useState<Option[]>([]);
  const [models, setModels] = useState<(Option & { category_id: string })[]>([]);
  const [knowledge, setKnowledge] = useState<KnowledgeRecord[]>([]);
  const [tickets, setTickets] = useState<TicketRecord[]>([]);
  const [events, setEvents] = useState<TicketEventRecord[]>([]);
  const [workOrders, setWorkOrders] = useState<WorkOrderRecord[]>([]);
  const [plans, setPlans] = useState<PreventivePlanRecord[]>([]);
  const [selfServiceCount, setSelfServiceCount] = useState(0);

  const [ticketForm, setTicketForm] = useState(blankTicketForm);
  const [planForm, setPlanForm] = useState(blankPlanForm);
  const [knowledgeForm, setKnowledgeForm] = useState(blankKnowledgeForm);
  const [completedSelfHelp, setCompletedSelfHelp] = useState<Record<string, boolean>>({});

  const [selectedTicket, setSelectedTicket] = useState<TicketRecord | null>(null);
  const [ticketNote, setTicketNote] = useState("");
  const [diagnosis, setDiagnosis] = useState("");
  const [probableCause, setProbableCause] = useState("");
  const [solution, setSolution] = useState("");

  const [isTicketModalOpen, setIsTicketModalOpen] = useState(false);
  const [isPlanModalOpen, setIsPlanModalOpen] = useState(false);
  const [isKnowledgeModalOpen, setIsKnowledgeModalOpen] = useState(false);
  const [isTicketDetailOpen, setIsTicketDetailOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const [ticketSearch, setTicketSearch] = useState("");
  const [ticketStatusFilter, setTicketStatusFilter] = useState("");

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  const loadAll = useCallback(async () => {
    setIsLoading(true);
    setFeedback(null);

    const organizationId = organization.organizationId;

    const results = await Promise.all([
      supabase
        .from("assets")
        .select("id,name,asset_number,operational_status,category_id,model_id")
        .eq("organization_id", organizationId)
        .order("asset_number"),
      supabase
        .from("asset_categories")
        .select("id,name")
        .eq("organization_id", organizationId)
        .eq("is_active", true)
        .order("name"),
      supabase
        .from("asset_models")
        .select("id,name,category_id")
        .eq("organization_id", organizationId)
        .eq("is_active", true)
        .order("name"),
      supabase
        .from("defect_knowledge_base")
        .select("*")
        .eq("is_active", true)
        .order("title"),
      supabase
        .from("support_tickets")
        .select("*")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false }),
      supabase
        .from("ticket_events")
        .select("*")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false }),
      supabase
        .from("maintenance_work_orders")
        .select("*")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false }),
      supabase
        .from("preventive_maintenance_plans")
        .select("*")
        .eq("organization_id", organizationId)
        .order("next_due_date"),
      supabase
        .from("self_service_sessions")
        .select("id", { count: "exact" })
        .eq("organization_id", organizationId)
        .eq("resolved", true),
    ]);

    const firstError = results.map((result) => result.error).find(Boolean);

    if (firstError) {
      setFeedback({ type: "error", text: firstError.message });
      setIsLoading(false);
      return;
    }

    setAssets((results[0].data ?? []) as AssetOption[]);
    setCategories((results[1].data ?? []) as Option[]);
    setModels((results[2].data ?? []) as (Option & { category_id: string })[]);
    setKnowledge((results[3].data ?? []) as KnowledgeRecord[]);
    setTickets((results[4].data ?? []) as TicketRecord[]);
    setEvents((results[5].data ?? []) as TicketEventRecord[]);
    setWorkOrders((results[6].data ?? []) as WorkOrderRecord[]);
    setPlans((results[7].data ?? []) as PreventivePlanRecord[]);
    setSelfServiceCount(results[8].count ?? 0);
    setIsLoading(false);
  }, [organization.organizationId]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const assetName = (assetId: string | null) => {
    if (!assetId) {
      return "Equipamento não informado";
    }

    const asset = assets.find((item) => item.id === assetId);
    return asset ? `${asset.asset_number} · ${asset.name}` : "Equipamento não encontrado";
  };

  const categoryName = (categoryId: string | null) =>
    categories.find((item) => item.id === categoryId)?.name ?? "Não definida";

  const modelName = (modelId: string | null) =>
    models.find((item) => item.id === modelId)?.name ?? "Não definido";

  const ticketKnowledgeMatches = useMemo(() => {
    const source = normalizeText(
      `${ticketForm.title} ${ticketForm.description}`,
    );

    if (source.trim().length < 4) {
      return [];
    }

    return knowledge
      .map((entry) => {
        const keywords = Array.isArray(entry.keywords) ? entry.keywords : [];
        const keywordScore = keywords.reduce(
          (total, keyword) =>
            source.includes(normalizeText(keyword)) ? total + 4 : total,
          0,
        );

        const patternWords = normalizeText(entry.symptom_pattern)
          .split(/\s+/)
          .filter((word) => word.length >= 5);

        const patternScore = patternWords.reduce(
          (total, word) => (source.includes(word) ? total + 1 : total),
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
  }, [knowledge, ticketForm.description, ticketForm.title]);

  const suggestedUserSteps = useMemo(() => {
    const steps = ticketKnowledgeMatches.flatMap((match) =>
      toStringArray(match.entry.user_steps),
    );

    return Array.from(new Set(steps)).slice(0, 8);
  }, [ticketKnowledgeMatches]);

  useEffect(() => {
    setCompletedSelfHelp({});
  }, [ticketForm.description, ticketForm.title]);

  const filteredTickets = useMemo(() => {
    const normalizedSearch = normalizeText(ticketSearch.trim());

    return tickets.filter((ticket) => {
      const matchesSearch =
        !normalizedSearch ||
        normalizeText(
          `${ticket.ticket_number} ${ticket.title} ${ticket.description} ${assetName(ticket.asset_id)}`,
        ).includes(normalizedSearch);

      const matchesStatus =
        !ticketStatusFilter || ticket.status === ticketStatusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [ticketSearch, ticketStatusFilter, tickets, assets]);

  const selectedTicketEvents = useMemo(
    () =>
      selectedTicket
        ? events
            .filter((event) => event.ticket_id === selectedTicket.id)
            .sort(
              (left, right) =>
                new Date(left.created_at).getTime() -
                new Date(right.created_at).getTime(),
            )
        : [],
    [events, selectedTicket],
  );

  const selectedTicketKnowledge = useMemo(() => {
    if (!selectedTicket) {
      return [];
    }

    return knowledge.filter((entry) =>
      selectedTicket.matched_knowledge_ids?.includes(entry.id),
    );
  }, [knowledge, selectedTicket]);

  const selectedTicketOrders = useMemo(
    () =>
      selectedTicket
        ? workOrders.filter((order) => order.ticket_id === selectedTicket.id)
        : [],
    [selectedTicket, workOrders],
  );

  const planCounters = useMemo(
    () => ({
      overdue: plans.filter((plan) => getPlanDueState(plan) === "overdue").length,
      dueSoon: plans.filter((plan) => getPlanDueState(plan) === "due_soon").length,
      scheduled: plans.filter((plan) => getPlanDueState(plan) === "scheduled").length,
    }),
    [plans],
  );

  const openTicketCount = tickets.filter(
    (ticket) => !["resolved", "closed", "canceled"].includes(ticket.status),
  ).length;

  const overdueTicketCount = tickets.filter(
    (ticket) =>
      ticket.due_at &&
      new Date(ticket.due_at).getTime() < Date.now() &&
      !["resolved", "closed", "canceled"].includes(ticket.status),
  ).length;

  const recurrenceRows = useMemo(() => {
    const grouped = new Map<
      string,
      {
        key: string;
        assetId: string | null;
        assetLabel: string;
        category: string;
        count: number;
        lastOccurrence: string;
      }
    >();

    for (const ticket of tickets) {
      const key = `${ticket.asset_id ?? "none"}:${ticket.category}`;
      const current = grouped.get(key);

      if (current) {
        current.count += 1;

        if (
          new Date(ticket.created_at).getTime() >
          new Date(current.lastOccurrence).getTime()
        ) {
          current.lastOccurrence = ticket.created_at;
        }
      } else {
        grouped.set(key, {
          key,
          assetId: ticket.asset_id,
          assetLabel: assetName(ticket.asset_id),
          category: ticket.category,
          count: 1,
          lastOccurrence: ticket.created_at,
        });
      }
    }

    return Array.from(grouped.values())
      .filter((item) => item.count >= 2)
      .sort((left, right) => right.count - left.count)
      .slice(0, 12);
  }, [tickets, assets]);

  const causeRows = useMemo(() => {
    const grouped = new Map<string, number>();

    for (const order of workOrders) {
      const cause = order.probable_cause?.trim();

      if (!cause) {
        continue;
      }

      const normalized = cause.toLocaleLowerCase("pt-BR");
      grouped.set(normalized, (grouped.get(normalized) ?? 0) + 1);
    }

    return Array.from(grouped.entries())
      .map(([cause, count]) => ({ cause, count }))
      .sort((left, right) => right.count - left.count)
      .slice(0, 10);
  }, [workOrders]);

  const openTicketModal = () => {
    setTicketForm(blankTicketForm);
    setCompletedSelfHelp({});
    setFeedback(null);
    setIsTicketModalOpen(true);
  };

  const openTicketDetail = (ticket: TicketRecord) => {
    setSelectedTicket(ticket);
    setTicketNote("");
    setDiagnosis("");
    setProbableCause("");
    setSolution("");
    setIsTicketDetailOpen(true);
  };

  const recordSelfServiceResolution = async () => {
    if (!ticketForm.description.trim() || ticketKnowledgeMatches.length === 0) {
      setFeedback({
        type: "error",
        text: "Descreva o problema para receber uma orientação compatível.",
      });
      return;
    }

    const completedSteps = suggestedUserSteps.filter(
      (step) => completedSelfHelp[step],
    );

    const { error } = await supabase.from("self_service_sessions").insert({
      organization_id: organization.organizationId,
      asset_id: ticketForm.assetId || null,
      knowledge_id: ticketKnowledgeMatches[0]?.entry.id ?? null,
      description: `${ticketForm.title}\n${ticketForm.description}`.trim(),
      completed_steps: completedSteps,
      resolved: true,
    });

    if (error) {
      setFeedback({ type: "error", text: error.message });
      return;
    }

    setIsTicketModalOpen(false);
    setFeedback({
      type: "success",
      text: "Solução registrada. O chamado não foi enviado ao técnico.",
    });
  };

  const createTicket = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFeedback(null);

    if (!ticketForm.title.trim() || !ticketForm.description.trim()) {
      setFeedback({
        type: "error",
        text: "Informe o título e descreva o problema.",
      });
      return;
    }

    setIsSaving(true);

    const selfHelpSteps = suggestedUserSteps.map((step) => ({
      step,
      completed: Boolean(completedSelfHelp[step]),
    }));

    const { error } = await supabase.from("support_tickets").insert({
      organization_id: organization.organizationId,
      ticket_number: "",
      asset_id: ticketForm.assetId || null,
      requester_name: ticketForm.requesterName.trim() || null,
      requester_email: ticketForm.requesterEmail.trim() || null,
      title: ticketForm.title.trim(),
      description: ticketForm.description.trim(),
      category: ticketForm.category,
      priority: ticketForm.priority,
      channel: "app",
      due_at: calculateDueAt(ticketForm.priority),
      matched_knowledge_ids: ticketKnowledgeMatches.map(
        (match) => match.entry.id,
      ),
      self_help_steps: selfHelpSteps,
      self_help_result:
        selfHelpSteps.length === 0 ? "not_attempted" : "not_resolved",
    });

    if (error) {
      setFeedback({ type: "error", text: error.message });
      setIsSaving(false);
      return;
    }

    setIsSaving(false);
    setIsTicketModalOpen(false);
    setFeedback({
      type: "success",
      text: "Chamado aberto e encaminhado para a equipe técnica.",
    });
    await loadAll();
  };

  const updateTicket = async (
    fields: Partial<Pick<TicketRecord, "status" | "priority">> & {
      first_response_at?: string | null;
      resolved_at?: string | null;
      closed_at?: string | null;
    },
  ) => {
    if (!selectedTicket) {
      return;
    }

    const { data, error } = await supabase
      .from("support_tickets")
      .update(fields)
      .eq("organization_id", organization.organizationId)
      .eq("id", selectedTicket.id)
      .select("*")
      .single();

    if (error) {
      setFeedback({ type: "error", text: error.message });
      return;
    }

    const updated = data as TicketRecord;
    setSelectedTicket(updated);
    setTickets((current) =>
      current.map((ticket) => (ticket.id === updated.id ? updated : ticket)),
    );
    setFeedback({ type: "success", text: "Chamado atualizado." });
    await loadAll();
  };

  const changeTicketStatus = async (status: string) => {
    const now = new Date().toISOString();

    await updateTicket({
      status,
      first_response_at:
        status === "in_progress" && !selectedTicket?.first_response_at
          ? now
          : selectedTicket?.first_response_at ?? null,
      resolved_at:
        status === "resolved"
          ? now
          : status === "open" || status === "in_progress"
            ? null
            : selectedTicket?.resolved_at ?? null,
      closed_at:
        status === "closed"
          ? now
          : status === "open" || status === "in_progress"
            ? null
            : selectedTicket?.closed_at ?? null,
    });
  };

  const addTicketNote = async () => {
    if (!selectedTicket || !ticketNote.trim()) {
      return;
    }

    const { error } = await supabase.from("ticket_events").insert({
      organization_id: organization.organizationId,
      ticket_id: selectedTicket.id,
      event_type: "comment",
      message: ticketNote.trim(),
    });

    if (error) {
      setFeedback({ type: "error", text: error.message });
      return;
    }

    setTicketNote("");
    setFeedback({ type: "success", text: "Comentário registrado." });
    await loadAll();
  };

  const createWorkOrder = async () => {
    if (!selectedTicket?.asset_id) {
      setFeedback({
        type: "error",
        text: "Associe um equipamento ao chamado antes de criar a ordem de serviço.",
      });
      return;
    }

    const { error } = await supabase.from("maintenance_work_orders").insert({
      organization_id: organization.organizationId,
      work_order_number: "",
      ticket_id: selectedTicket.id,
      asset_id: selectedTicket.asset_id,
      maintenance_type: "corrective",
      title: selectedTicket.title,
      priority: selectedTicket.priority,
      status: "in_progress",
      started_at: new Date().toISOString(),
    });

    if (error) {
      setFeedback({ type: "error", text: error.message });
      return;
    }

    await supabase
      .from("assets")
      .update({ operational_status: "in_maintenance" })
      .eq("organization_id", organization.organizationId)
      .eq("id", selectedTicket.asset_id);

    await changeTicketStatus("in_progress");
    setFeedback({
      type: "success",
      text: "Ordem de serviço criada e equipamento marcado em manutenção.",
    });
    await loadAll();
  };

  const completeWorkOrder = async (order: WorkOrderRecord) => {
    if (!diagnosis.trim() || !solution.trim()) {
      setFeedback({
        type: "error",
        text: "Informe o diagnóstico e a solução aplicada.",
      });
      return;
    }

    const { error } = await supabase
      .from("maintenance_work_orders")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        diagnosis: diagnosis.trim(),
        probable_cause: probableCause.trim() || null,
        solution: solution.trim(),
      })
      .eq("organization_id", organization.organizationId)
      .eq("id", order.id);

    if (error) {
      setFeedback({ type: "error", text: error.message });
      return;
    }

    await supabase
      .from("assets")
      .update({ operational_status: "available" })
      .eq("organization_id", organization.organizationId)
      .eq("id", order.asset_id);

    await updateTicket({
      status: "resolved",
      resolved_at: new Date().toISOString(),
    });

    setDiagnosis("");
    setProbableCause("");
    setSolution("");
    setFeedback({
      type: "success",
      text: "Ordem de serviço concluída e chamado resolvido.",
    });
    await loadAll();
  };

  const createPreventivePlan = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFeedback(null);

    if (
      !planForm.name.trim() ||
      !planForm.serviceType.trim() ||
      !planForm.nextDueDate ||
      (!planForm.assetId && !planForm.categoryId && !planForm.modelId)
    ) {
      setFeedback({
        type: "error",
        text: "Informe nome, serviço, próxima data e ao menos um alvo.",
      });
      return;
    }

    setIsSaving(true);

    const { error } = await supabase
      .from("preventive_maintenance_plans")
      .insert({
        organization_id: organization.organizationId,
        name: planForm.name.trim(),
        asset_id: planForm.assetId || null,
        asset_category_id: planForm.categoryId || null,
        asset_model_id: planForm.modelId || null,
        service_type: planForm.serviceType.trim(),
        instructions: planForm.instructions.trim() || null,
        interval_days: Number.parseInt(planForm.intervalDays, 10),
        alert_days: Number.parseInt(planForm.alertDays, 10),
        estimated_duration_minutes: planForm.estimatedDuration
          ? Number.parseInt(planForm.estimatedDuration, 10)
          : null,
        next_due_date: planForm.nextDueDate,
      });

    if (error) {
      setFeedback({ type: "error", text: error.message });
      setIsSaving(false);
      return;
    }

    setIsSaving(false);
    setIsPlanModalOpen(false);
    setPlanForm(blankPlanForm);
    setFeedback({
      type: "success",
      text: "Plano de manutenção preventiva criado.",
    });
    await loadAll();
  };

  const completePreventivePlan = async (plan: PreventivePlanRecord) => {
    const completionDate = new Date().toISOString().slice(0, 10);
    const nextDate = addDays(completionDate, plan.interval_days);

    const { error: executionError } = await supabase
      .from("preventive_maintenance_executions")
      .insert({
        organization_id: organization.organizationId,
        plan_id: plan.id,
        asset_id: plan.asset_id,
        scheduled_date: plan.next_due_date,
        completed_date: completionDate,
        status: "completed",
        notes: "Execução registrada pelo painel preventivo.",
      });

    if (executionError) {
      setFeedback({ type: "error", text: executionError.message });
      return;
    }

    const { error: planError } = await supabase
      .from("preventive_maintenance_plans")
      .update({
        last_completed_date: completionDate,
        next_due_date: nextDate,
      })
      .eq("organization_id", organization.organizationId)
      .eq("id", plan.id);

    if (planError) {
      setFeedback({ type: "error", text: planError.message });
      return;
    }

    setFeedback({
      type: "success",
      text: `Preventiva concluída. Próxima execução: ${formatDate(nextDate)}.`,
    });
    await loadAll();
  };

  const createKnowledgeEntry = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFeedback(null);

    if (
      !knowledgeForm.title.trim() ||
      !knowledgeForm.symptomPattern.trim() ||
      !knowledgeForm.keywords.trim()
    ) {
      setFeedback({
        type: "error",
        text: "Informe título, padrão do sintoma e palavras-chave.",
      });
      return;
    }

    setIsSaving(true);

    const { error } = await supabase.from("defect_knowledge_base").insert({
      organization_id: organization.organizationId,
      asset_category_id: knowledgeForm.categoryId || null,
      title: knowledgeForm.title.trim(),
      symptom_pattern: knowledgeForm.symptomPattern.trim(),
      keywords: knowledgeForm.keywords
        .split(",")
        .map((keyword) => keyword.trim())
        .filter(Boolean),
      user_steps: knowledgeForm.userSteps
        .split("\n")
        .map((step) => step.trim())
        .filter(Boolean),
      technician_diagnostics: knowledgeForm.technicianDiagnostics
        .split("\n")
        .map((step) => step.trim())
        .filter(Boolean),
      severity: knowledgeForm.severity,
    });

    if (error) {
      setFeedback({ type: "error", text: error.message });
      setIsSaving(false);
      return;
    }

    setIsSaving(false);
    setIsKnowledgeModalOpen(false);
    setKnowledgeForm(blankKnowledgeForm);
    setFeedback({
      type: "success",
      text: "Conhecimento técnico adicionado à base.",
    });
    await loadAll();
  };

  const renderTicketTab = () => (
    <>
      <section className="ativelo-support-toolbar">
        <label className="search">
          <AppIcon name="search" size={20} />
          <input
            value={ticketSearch}
            onChange={(event) => setTicketSearch(event.target.value)}
            placeholder="Buscar chamado, equipamento ou descrição"
          />
        </label>

        <label>
          <AppIcon name="filter" size={18} />
          <select
            value={ticketStatusFilter}
            onChange={(event) => setTicketStatusFilter(event.target.value)}
          >
            <option value="">Todos os status</option>
            {Object.entries(ticketStatusLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <button type="button" className="primary" onClick={openTicketModal}>
          <AppIcon name="plus" size={18} />
          Abrir chamado
        </button>
      </section>

      <section className="ativelo-support-summary">
        <article>
          <span>Chamados abertos</span>
          <strong>{openTicketCount}</strong>
        </article>
        <article>
          <span>Fora do prazo</span>
          <strong>{overdueTicketCount}</strong>
        </article>
        <article>
          <span>Em atendimento</span>
          <strong>
            {tickets.filter((ticket) => ticket.status === "in_progress").length}
          </strong>
        </article>
        <article>
          <span>Resolvidos</span>
          <strong>
            {
              tickets.filter((ticket) =>
                ["resolved", "closed"].includes(ticket.status),
              ).length
            }
          </strong>
        </article>
      </section>

      <section className="ativelo-support-panel">
        <div className="ativelo-support-panel-heading">
          <div>
            <span>CENTRAL DE ATENDIMENTO</span>
            <h2>Chamados registrados</h2>
          </div>
          <small>{filteredTickets.length} registro(s)</small>
        </div>

        {isLoading ? (
          <div className="ativelo-support-empty">Carregando chamados...</div>
        ) : filteredTickets.length === 0 ? (
          <div className="ativelo-support-empty">
            <AppIcon name="tickets" size={42} />
            <strong>Nenhum chamado encontrado</strong>
            <span>Abra o primeiro chamado ou altere os filtros.</span>
          </div>
        ) : (
          <div className="ativelo-ticket-list">
            {filteredTickets.map((ticket) => {
              const isOverdue =
                ticket.due_at &&
                new Date(ticket.due_at).getTime() < Date.now() &&
                !["resolved", "closed", "canceled"].includes(ticket.status);

              return (
                <button
                  type="button"
                  key={ticket.id}
                  onClick={() => openTicketDetail(ticket)}
                >
                  <i className={`priority ${ticket.priority}`} />
                  <span className="main">
                    <small>{ticket.ticket_number}</small>
                    <strong>{ticket.title}</strong>
                    <em>{assetName(ticket.asset_id)}</em>
                  </span>
                  <span className={`ticket-status ${ticket.status}`}>
                    {ticketStatusLabels[ticket.status] ?? ticket.status}
                  </span>
                  <span className={isOverdue ? "due overdue" : "due"}>
                    {isOverdue ? "Prazo vencido" : formatDateTime(ticket.due_at)}
                  </span>
                  <AppIcon name="chevron" size={18} />
                </button>
              );
            })}
          </div>
        )}
      </section>
    </>
  );

  const renderPreventiveTab = () => (
    <>
      <section className="ativelo-support-toolbar preventive">
        <div>
          <strong>Agenda preventiva</strong>
          <span>
            Limpezas, inspeções, trocas e recargas com alertas antecipados.
          </span>
        </div>
        <button
          type="button"
          className="primary"
          onClick={() => {
            setPlanForm(blankPlanForm);
            setIsPlanModalOpen(true);
          }}
        >
          <AppIcon name="plus" size={18} />
          Novo plano
        </button>
      </section>

      <section className="ativelo-support-summary">
        <article className="danger">
          <span>Atrasadas</span>
          <strong>{planCounters.overdue}</strong>
        </article>
        <article className="warning">
          <span>Próximas do prazo</span>
          <strong>{planCounters.dueSoon}</strong>
        </article>
        <article>
          <span>Programadas</span>
          <strong>{planCounters.scheduled}</strong>
        </article>
        <article>
          <span>Total de planos</span>
          <strong>{plans.length}</strong>
        </article>
      </section>

      <section className="ativelo-support-panel">
        <div className="ativelo-support-panel-heading">
          <div>
            <span>MANUTENÇÃO PREVENTIVA</span>
            <h2>Planos e próximos serviços</h2>
          </div>
        </div>

        {isLoading ? (
          <div className="ativelo-support-empty">Carregando planos...</div>
        ) : plans.length === 0 ? (
          <div className="ativelo-support-empty">
            <AppIcon name="calendar" size={42} />
            <strong>Nenhum plano preventivo</strong>
            <span>Cadastre o primeiro plano para receber alertas.</span>
          </div>
        ) : (
          <div className="ativelo-plan-grid">
            {plans.map((plan) => {
              const dueState = getPlanDueState(plan);

              return (
                <article key={plan.id} className={dueState}>
                  <header>
                    <span className={`due-badge ${dueState}`}>
                      {dueState === "overdue"
                        ? "Atrasada"
                        : dueState === "due_soon"
                          ? "Próxima"
                          : "Programada"}
                    </span>
                    <small>{formatDate(plan.next_due_date)}</small>
                  </header>
                  <h3>{plan.name}</h3>
                  <p>{plan.service_type}</p>
                  <dl>
                    <div>
                      <dt>Alvo</dt>
                      <dd>
                        {plan.asset_id
                          ? assetName(plan.asset_id)
                          : plan.asset_model_id
                            ? modelName(plan.asset_model_id)
                            : categoryName(plan.asset_category_id)}
                      </dd>
                    </div>
                    <div>
                      <dt>Intervalo</dt>
                      <dd>{plan.interval_days} dias</dd>
                    </div>
                    <div>
                      <dt>Alerta</dt>
                      <dd>{plan.alert_days} dias antes</dd>
                    </div>
                  </dl>
                  {plan.instructions && <p className="instructions">{plan.instructions}</p>}
                  <button
                    type="button"
                    onClick={() => void completePreventivePlan(plan)}
                  >
                    <AppIcon name="check" size={18} />
                    Concluir agora
                  </button>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </>
  );

  const renderKnowledgeTab = () => (
    <>
      <section className="ativelo-support-toolbar preventive">
        <div>
          <strong>Base de diagnóstico</strong>
          <span>
            Orientações para usuários e hipóteses técnicas baseadas em palavras-chave.
          </span>
        </div>
        <button
          type="button"
          className="primary"
          onClick={() => {
            setKnowledgeForm(blankKnowledgeForm);
            setIsKnowledgeModalOpen(true);
          }}
        >
          <AppIcon name="plus" size={18} />
          Novo diagnóstico
        </button>
      </section>

      <section className="ativelo-support-panel">
        <div className="ativelo-support-panel-heading">
          <div>
            <span>CONHECIMENTO TÉCNICO</span>
            <h2>Procedimentos cadastrados</h2>
          </div>
          <small>{knowledge.length} registro(s)</small>
        </div>

        <div className="ativelo-knowledge-grid">
          {knowledge.map((entry) => (
            <article key={entry.id}>
              <header>
                <span className={`severity ${entry.severity}`}>
                  {priorityLabels[entry.severity] ?? entry.severity}
                </span>
                <small>
                  {entry.organization_id ? "Personalizado" : "Base Ativelo"}
                </small>
              </header>
              <h3>{entry.title}</h3>
              <p>{entry.symptom_pattern}</p>
              <div className="keywords">
                {(entry.keywords ?? []).slice(0, 6).map((keyword) => (
                  <span key={keyword}>{keyword}</span>
                ))}
              </div>
              <details>
                <summary>Orientação ao usuário</summary>
                <ol>
                  {toStringArray(entry.user_steps).map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
              </details>
              <details>
                <summary>Diagnóstico técnico</summary>
                <ol>
                  {toStringArray(entry.technician_diagnostics).map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
              </details>
            </article>
          ))}
        </div>
      </section>
    </>
  );

  const renderAnalyticsTab = () => (
    <>
      <section className="ativelo-support-summary analytics">
        <article>
          <span>Chamados totais</span>
          <strong>{tickets.length}</strong>
        </article>
        <article>
          <span>Recorrências detectadas</span>
          <strong>{recurrenceRows.length}</strong>
        </article>
        <article>
          <span>Ordens concluídas</span>
          <strong>
            {workOrders.filter((order) => order.status === "completed").length}
          </strong>
        </article>
        <article>
          <span>Autossoluções registradas</span>
          <strong>{selfServiceCount}</strong>
        </article>
      </section>

      <section className="ativelo-analytics-grid">
        <article className="ativelo-support-panel">
          <div className="ativelo-support-panel-heading">
            <div>
              <span>RECORRÊNCIA</span>
              <h2>Equipamentos e categorias repetidos</h2>
            </div>
          </div>

          {recurrenceRows.length === 0 ? (
            <div className="ativelo-support-empty compact">
              Ainda não há recorrência suficiente para análise.
            </div>
          ) : (
            <div className="ativelo-recurrence-list">
              {recurrenceRows.map((row) => (
                <button
                  type="button"
                  key={row.key}
                  onClick={() => row.assetId && onOpenAsset(row.assetId)}
                  disabled={!row.assetId}
                >
                  <span>
                    <strong>{row.assetLabel}</strong>
                    <small>
                      {categoryLabels[row.category] ?? row.category} · última em{" "}
                      {formatDateTime(row.lastOccurrence)}
                    </small>
                  </span>
                  <b>{row.count} ocorrências</b>
                </button>
              ))}
            </div>
          )}
        </article>

        <article className="ativelo-support-panel">
          <div className="ativelo-support-panel-heading">
            <div>
              <span>CAUSAS REGISTRADAS</span>
              <h2>Principais causas prováveis</h2>
            </div>
          </div>

          {causeRows.length === 0 ? (
            <div className="ativelo-support-empty compact">
              Conclua ordens de serviço para formar esta análise.
            </div>
          ) : (
            <div className="ativelo-cause-list">
              {causeRows.map((row, index) => (
                <div key={row.cause}>
                  <span>{index + 1}</span>
                  <strong>{row.cause}</strong>
                  <b>{row.count}</b>
                </div>
              ))}
            </div>
          )}
        </article>
      </section>
    </>
  );

  return (
    <main className="ativelo-support-page">
      <header className="ativelo-support-header">
        <div>
          <button type="button" onClick={onBack}>
            ← Voltar ao painel
          </button>
          <p>OPERAÇÃO E SUPORTE</p>
          <h1>Chamados e manutenção</h1>
          <span>
            Do relato do usuário ao diagnóstico, execução e prevenção.
          </span>
        </div>

        <aside>
          <small>Empresa atual</small>
          <strong>{organization.organizationName}</strong>
          <span>{organization.role}</span>
        </aside>
      </header>

      <nav className="ativelo-support-tabs">
        <button
          type="button"
          className={activeTab === "tickets" ? "active" : ""}
          onClick={() => setActiveTab("tickets")}
        >
          <AppIcon name="tickets" size={20} />
          Chamados
          <b>{openTicketCount}</b>
        </button>
        <button
          type="button"
          className={activeTab === "preventive" ? "active" : ""}
          onClick={() => setActiveTab("preventive")}
        >
          <AppIcon name="calendar" size={20} />
          Preventivas
          <b>{planCounters.overdue + planCounters.dueSoon}</b>
        </button>
        <button
          type="button"
          className={activeTab === "knowledge" ? "active" : ""}
          onClick={() => setActiveTab("knowledge")}
        >
          <AppIcon name="book" size={20} />
          Diagnósticos
          <b>{knowledge.length}</b>
        </button>
        <button
          type="button"
          className={activeTab === "analytics" ? "active" : ""}
          onClick={() => setActiveTab("analytics")}
        >
          <AppIcon name="chart" size={20} />
          Análises
          <b>{recurrenceRows.length}</b>
        </button>
      </nav>

      {feedback && (
        <div className={`ativelo-support-feedback ${feedback.type}`}>
          {feedback.text}
        </div>
      )}

      {activeTab === "tickets" && renderTicketTab()}
      {activeTab === "preventive" && renderPreventiveTab()}
      {activeTab === "knowledge" && renderKnowledgeTab()}
      {activeTab === "analytics" && renderAnalyticsTab()}

      {isTicketModalOpen && (
        <div className="ativelo-modal-backdrop">
          <section
            className="ativelo-support-modal ticket"
            role="dialog"
            aria-modal="true"
          >
            <header>
              <div>
                <span>NOVO CHAMADO</span>
                <h2>Relate o problema</h2>
              </div>
              <button type="button" onClick={() => setIsTicketModalOpen(false)}>
                <AppIcon name="close" size={21} />
              </button>
            </header>

            <form onSubmit={createTicket}>
              <div className="grid two">
                <label>
                  <span>Equipamento</span>
                  <select
                    value={ticketForm.assetId}
                    onChange={(event) =>
                      setTicketForm((current) => ({
                        ...current,
                        assetId: event.target.value,
                      }))
                    }
                  >
                    <option value="">Não identificado</option>
                    {assets.map((asset) => (
                      <option key={asset.id} value={asset.id}>
                        {asset.asset_number} · {asset.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  <span>Categoria</span>
                  <select
                    value={ticketForm.category}
                    onChange={(event) =>
                      setTicketForm((current) => ({
                        ...current,
                        category: event.target.value,
                      }))
                    }
                  >
                    {Object.entries(categoryLabels).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="grid two">
                <label>
                  <span>Nome do solicitante</span>
                  <input
                    value={ticketForm.requesterName}
                    onChange={(event) =>
                      setTicketForm((current) => ({
                        ...current,
                        requesterName: event.target.value,
                      }))
                    }
                  />
                </label>

                <label>
                  <span>E-mail</span>
                  <input
                    type="email"
                    value={ticketForm.requesterEmail}
                    onChange={(event) =>
                      setTicketForm((current) => ({
                        ...current,
                        requesterEmail: event.target.value,
                      }))
                    }
                  />
                </label>
              </div>

              <div className="grid two">
                <label>
                  <span>Título *</span>
                  <input
                    value={ticketForm.title}
                    onChange={(event) =>
                      setTicketForm((current) => ({
                        ...current,
                        title: event.target.value,
                      }))
                    }
                    placeholder="Ex.: Monitor sem imagem"
                  />
                </label>

                <label>
                  <span>Prioridade</span>
                  <select
                    value={ticketForm.priority}
                    onChange={(event) =>
                      setTicketForm((current) => ({
                        ...current,
                        priority: event.target.value,
                      }))
                    }
                  >
                    {Object.entries(priorityLabels).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <label>
                <span>Descrição detalhada *</span>
                <textarea
                  rows={5}
                  value={ticketForm.description}
                  onChange={(event) =>
                    setTicketForm((current) => ({
                      ...current,
                      description: event.target.value,
                    }))
                  }
                  placeholder="Conte o que aconteceu, mensagens exibidas e quando o problema começou."
                />
              </label>

              {ticketKnowledgeMatches.length > 0 && (
                <section className="ativelo-self-help">
                  <header>
                    <AppIcon name="book" size={22} />
                    <div>
                      <strong>Antes de enviar ao técnico</strong>
                      <span>
                        Encontramos procedimentos seguros relacionados ao relato.
                      </span>
                    </div>
                  </header>

                  <div className="matched-topics">
                    {ticketKnowledgeMatches.map((match) => (
                      <span key={match.entry.id}>{match.entry.title}</span>
                    ))}
                  </div>

                  <div className="self-help-steps">
                    {suggestedUserSteps.map((step) => (
                      <label key={step}>
                        <input
                          type="checkbox"
                          checked={Boolean(completedSelfHelp[step])}
                          onChange={(event) =>
                            setCompletedSelfHelp((current) => ({
                              ...current,
                              [step]: event.target.checked,
                            }))
                          }
                        />
                        <span>{step}</span>
                      </label>
                    ))}
                  </div>

                  <button
                    type="button"
                    className="resolved-button"
                    onClick={() => void recordSelfServiceResolution()}
                  >
                    <AppIcon name="check" size={18} />
                    O problema foi resolvido
                  </button>
                </section>
              )}

              <footer>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setIsTicketModalOpen(false)}
                >
                  Cancelar
                </button>
                <button type="submit" className="primary" disabled={isSaving}>
                  <AppIcon name="send" size={18} />
                  {isSaving ? "Enviando..." : "Enviar chamado"}
                </button>
              </footer>
            </form>
          </section>
        </div>
      )}

      {isPlanModalOpen && (
        <div className="ativelo-modal-backdrop">
          <section className="ativelo-support-modal" role="dialog" aria-modal="true">
            <header>
              <div>
                <span>PLANO PREVENTIVO</span>
                <h2>Programar manutenção</h2>
              </div>
              <button type="button" onClick={() => setIsPlanModalOpen(false)}>
                <AppIcon name="close" size={21} />
              </button>
            </header>

            <form onSubmit={createPreventivePlan}>
              <label>
                <span>Nome do plano *</span>
                <input
                  value={planForm.name}
                  onChange={(event) =>
                    setPlanForm((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                  placeholder="Ex.: Limpeza trimestral dos computadores"
                />
              </label>

              <div className="grid three">
                <label>
                  <span>Equipamento específico</span>
                  <select
                    value={planForm.assetId}
                    onChange={(event) =>
                      setPlanForm((current) => ({
                        ...current,
                        assetId: event.target.value,
                      }))
                    }
                  >
                    <option value="">Não definido</option>
                    {assets.map((asset) => (
                      <option key={asset.id} value={asset.id}>
                        {asset.asset_number} · {asset.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  <span>Categoria</span>
                  <select
                    value={planForm.categoryId}
                    onChange={(event) =>
                      setPlanForm((current) => ({
                        ...current,
                        categoryId: event.target.value,
                        modelId: "",
                      }))
                    }
                  >
                    <option value="">Não definida</option>
                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  <span>Modelo</span>
                  <select
                    value={planForm.modelId}
                    onChange={(event) =>
                      setPlanForm((current) => ({
                        ...current,
                        modelId: event.target.value,
                      }))
                    }
                  >
                    <option value="">Não definido</option>
                    {models
                      .filter(
                        (model) =>
                          !planForm.categoryId ||
                          model.category_id === planForm.categoryId,
                      )
                      .map((model) => (
                        <option key={model.id} value={model.id}>
                          {model.name}
                        </option>
                      ))}
                  </select>
                </label>
              </div>

              <label>
                <span>Tipo de serviço *</span>
                <input
                  value={planForm.serviceType}
                  onChange={(event) =>
                    setPlanForm((current) => ({
                      ...current,
                      serviceType: event.target.value,
                    }))
                  }
                  placeholder="Ex.: Limpeza interna, troca de filtro, recarga de tinta"
                />
              </label>

              <div className="grid four">
                <label>
                  <span>Intervalo em dias</span>
                  <input
                    type="number"
                    min="1"
                    value={planForm.intervalDays}
                    onChange={(event) =>
                      setPlanForm((current) => ({
                        ...current,
                        intervalDays: event.target.value,
                      }))
                    }
                  />
                </label>
                <label>
                  <span>Alertar antes</span>
                  <input
                    type="number"
                    min="0"
                    value={planForm.alertDays}
                    onChange={(event) =>
                      setPlanForm((current) => ({
                        ...current,
                        alertDays: event.target.value,
                      }))
                    }
                  />
                </label>
                <label>
                  <span>Duração estimada</span>
                  <input
                    type="number"
                    min="1"
                    value={planForm.estimatedDuration}
                    onChange={(event) =>
                      setPlanForm((current) => ({
                        ...current,
                        estimatedDuration: event.target.value,
                      }))
                    }
                  />
                </label>
                <label>
                  <span>Próxima execução *</span>
                  <input
                    type="date"
                    value={planForm.nextDueDate}
                    onChange={(event) =>
                      setPlanForm((current) => ({
                        ...current,
                        nextDueDate: event.target.value,
                      }))
                    }
                  />
                </label>
              </div>

              <label>
                <span>Instruções</span>
                <textarea
                  rows={5}
                  value={planForm.instructions}
                  onChange={(event) =>
                    setPlanForm((current) => ({
                      ...current,
                      instructions: event.target.value,
                    }))
                  }
                />
              </label>

              <footer>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setIsPlanModalOpen(false)}
                >
                  Cancelar
                </button>
                <button type="submit" className="primary" disabled={isSaving}>
                  <AppIcon name="save" size={18} />
                  {isSaving ? "Salvando..." : "Salvar plano"}
                </button>
              </footer>
            </form>
          </section>
        </div>
      )}

      {isKnowledgeModalOpen && (
        <div className="ativelo-modal-backdrop">
          <section className="ativelo-support-modal" role="dialog" aria-modal="true">
            <header>
              <div>
                <span>BASE DE DIAGNÓSTICO</span>
                <h2>Novo conhecimento</h2>
              </div>
              <button
                type="button"
                onClick={() => setIsKnowledgeModalOpen(false)}
              >
                <AppIcon name="close" size={21} />
              </button>
            </header>

            <form onSubmit={createKnowledgeEntry}>
              <div className="grid two">
                <label>
                  <span>Título *</span>
                  <input
                    value={knowledgeForm.title}
                    onChange={(event) =>
                      setKnowledgeForm((current) => ({
                        ...current,
                        title: event.target.value,
                      }))
                    }
                  />
                </label>
                <label>
                  <span>Categoria de equipamento</span>
                  <select
                    value={knowledgeForm.categoryId}
                    onChange={(event) =>
                      setKnowledgeForm((current) => ({
                        ...current,
                        categoryId: event.target.value,
                      }))
                    }
                  >
                    <option value="">Todas as categorias</option>
                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <label>
                <span>Padrão do sintoma *</span>
                <textarea
                  rows={3}
                  value={knowledgeForm.symptomPattern}
                  onChange={(event) =>
                    setKnowledgeForm((current) => ({
                      ...current,
                      symptomPattern: event.target.value,
                    }))
                  }
                />
              </label>

              <div className="grid two">
                <label>
                  <span>Palavras-chave separadas por vírgula *</span>
                  <textarea
                    rows={5}
                    value={knowledgeForm.keywords}
                    onChange={(event) =>
                      setKnowledgeForm((current) => ({
                        ...current,
                        keywords: event.target.value,
                      }))
                    }
                  />
                </label>
                <label>
                  <span>Gravidade</span>
                  <select
                    value={knowledgeForm.severity}
                    onChange={(event) =>
                      setKnowledgeForm((current) => ({
                        ...current,
                        severity: event.target.value,
                      }))
                    }
                  >
                    {Object.entries(priorityLabels).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="grid two">
                <label>
                  <span>Passos seguros para o usuário, um por linha</span>
                  <textarea
                    rows={8}
                    value={knowledgeForm.userSteps}
                    onChange={(event) =>
                      setKnowledgeForm((current) => ({
                        ...current,
                        userSteps: event.target.value,
                      }))
                    }
                  />
                </label>
                <label>
                  <span>Hipóteses e testes técnicos, um por linha</span>
                  <textarea
                    rows={8}
                    value={knowledgeForm.technicianDiagnostics}
                    onChange={(event) =>
                      setKnowledgeForm((current) => ({
                        ...current,
                        technicianDiagnostics: event.target.value,
                      }))
                    }
                  />
                </label>
              </div>

              <footer>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setIsKnowledgeModalOpen(false)}
                >
                  Cancelar
                </button>
                <button type="submit" className="primary" disabled={isSaving}>
                  <AppIcon name="save" size={18} />
                  {isSaving ? "Salvando..." : "Salvar diagnóstico"}
                </button>
              </footer>
            </form>
          </section>
        </div>
      )}

      {isTicketDetailOpen && selectedTicket && (
        <div className="ativelo-modal-backdrop">
          <section
            className="ativelo-support-modal ticket-detail"
            role="dialog"
            aria-modal="true"
          >
            <header>
              <div>
                <span>{selectedTicket.ticket_number}</span>
                <h2>{selectedTicket.title}</h2>
              </div>
              <button
                type="button"
                onClick={() => setIsTicketDetailOpen(false)}
              >
                <AppIcon name="close" size={21} />
              </button>
            </header>

            <div className="ticket-detail-body">
              <section className="ticket-detail-summary">
                <article>
                  <small>Equipamento</small>
                  <strong>{assetName(selectedTicket.asset_id)}</strong>
                  {selectedTicket.asset_id && (
                    <button
                      type="button"
                      onClick={() => onOpenAsset(selectedTicket.asset_id as string)}
                    >
                      Abrir ficha
                    </button>
                  )}
                </article>
                <article>
                  <small>Solicitante</small>
                  <strong>
                    {selectedTicket.requester_name || "Não informado"}
                  </strong>
                  <span>{selectedTicket.requester_email}</span>
                </article>
                <article>
                  <small>Prazo</small>
                  <strong>{formatDateTime(selectedTicket.due_at)}</strong>
                  <span>
                    {priorityLabels[selectedTicket.priority] ??
                      selectedTicket.priority}
                  </span>
                </article>
              </section>

              <section className="ticket-description">
                <h3>Relato</h3>
                <p>{selectedTicket.description}</p>
              </section>

              <div className="grid two controls">
                <label>
                  <span>Status</span>
                  <select
                    value={selectedTicket.status}
                    onChange={(event) =>
                      void changeTicketStatus(event.target.value)
                    }
                  >
                    {Object.entries(ticketStatusLabels).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Prioridade</span>
                  <select
                    value={selectedTicket.priority}
                    onChange={(event) =>
                      void updateTicket({ priority: event.target.value })
                    }
                  >
                    {Object.entries(priorityLabels).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {selectedTicketKnowledge.length > 0 && (
                <section className="technician-suggestions">
                  <h3>Possíveis causas e testes técnicos</h3>
                  {selectedTicketKnowledge.map((entry) => (
                    <article key={entry.id}>
                      <strong>{entry.title}</strong>
                      <ol>
                        {toStringArray(entry.technician_diagnostics).map(
                          (step) => (
                            <li key={step}>{step}</li>
                          ),
                        )}
                      </ol>
                    </article>
                  ))}
                </section>
              )}

              <section className="work-order-section">
                <div className="section-title">
                  <div>
                    <span>MANUTENÇÃO CORRETIVA</span>
                    <h3>Ordens de serviço</h3>
                  </div>
                  {selectedTicketOrders.length === 0 && (
                    <button
                      type="button"
                      className="primary"
                      onClick={() => void createWorkOrder()}
                    >
                      <AppIcon name="maintenance" size={18} />
                      Criar O.S.
                    </button>
                  )}
                </div>

                {selectedTicketOrders.map((order) => (
                  <article className="work-order-card" key={order.id}>
                    <header>
                      <strong>{order.work_order_number}</strong>
                      <span className={`order-status ${order.status}`}>
                        {workOrderStatusLabels[order.status] ?? order.status}
                      </span>
                    </header>
                    <p>{order.title}</p>

                    {order.status !== "completed" ? (
                      <>
                        <label>
                          <span>Diagnóstico técnico *</span>
                          <textarea
                            rows={3}
                            value={diagnosis}
                            onChange={(event) => setDiagnosis(event.target.value)}
                          />
                        </label>
                        <label>
                          <span>Causa provável</span>
                          <textarea
                            rows={2}
                            value={probableCause}
                            onChange={(event) =>
                              setProbableCause(event.target.value)
                            }
                          />
                        </label>
                        <label>
                          <span>Solução aplicada *</span>
                          <textarea
                            rows={3}
                            value={solution}
                            onChange={(event) => setSolution(event.target.value)}
                          />
                        </label>
                        <button
                          type="button"
                          className="primary"
                          onClick={() => void completeWorkOrder(order)}
                        >
                          <AppIcon name="check" size={18} />
                          Concluir ordem
                        </button>
                      </>
                    ) : (
                      <dl>
                        <div>
                          <dt>Diagnóstico</dt>
                          <dd>{order.diagnosis}</dd>
                        </div>
                        <div>
                          <dt>Causa</dt>
                          <dd>{order.probable_cause || "Não informada"}</dd>
                        </div>
                        <div>
                          <dt>Solução</dt>
                          <dd>{order.solution}</dd>
                        </div>
                      </dl>
                    )}
                  </article>
                ))}
              </section>

              <section className="ticket-note-section">
                <h3>Adicionar comentário</h3>
                <textarea
                  rows={3}
                  value={ticketNote}
                  onChange={(event) => setTicketNote(event.target.value)}
                />
                <button
                  type="button"
                  className="secondary"
                  onClick={() => void addTicketNote()}
                >
                  <AppIcon name="message" size={18} />
                  Registrar comentário
                </button>
              </section>

              <section className="ticket-timeline">
                <h3>Histórico do chamado</h3>
                {selectedTicketEvents.length === 0 ? (
                  <p>Nenhum evento registrado.</p>
                ) : (
                  <div>
                    {selectedTicketEvents.map((event) => (
                      <article key={event.id}>
                        <i />
                        <span>
                          <strong>
                            {event.message || event.event_type}
                          </strong>
                          {(event.previous_value || event.new_value) && (
                            <small>
                              {event.previous_value || "—"} →{" "}
                              {event.new_value || "—"}
                            </small>
                          )}
                          <time>{formatDateTime(event.created_at)}</time>
                        </span>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
