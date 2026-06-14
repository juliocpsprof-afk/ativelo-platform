import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import type { OrganizationContext } from "../App";
import AppIcon from "../components/AppIcon";
import OrganizationBrand from "../components/OrganizationBrand";
import { useAuth } from "../contexts/AuthContext";
import { supabase } from "../lib/supabase";

type Props = {
  organization: OrganizationContext;
  onBack: () => void;
};

type DirectoryUser = {
  membership_id: string;
  user_id: string;
  email: string | null;
  display_name: string;
  role: string;
  is_active: boolean;
  joined_at: string;
  employee_code: string | null;
  job_title: string | null;
  phone: string | null;
  unit_id: string | null;
  department_id: string | null;
  notification_preference: string;
  last_access_at: string | null;
};

type UnitOption = {
  id: string;
  name: string;
};

type DepartmentOption = {
  id: string;
  name: string;
  unit_id: string | null;
};

type InvitationRecord = {
  id: string;
  email: string;
  display_name: string;
  phone: string | null;
  role: string;
  status: string;
  email_status: string;
  whatsapp_status: string;
  last_error: string | null;
  invited_at: string;
  last_sent_at: string | null;
  accepted_at: string | null;
};

type InvitationResult = {
  invitation_id: string;
  existing_user: boolean;
  email_status: string;
  whatsapp_status: string;
  invite_url: string;
  whatsapp_url: string;
  whatsapp_message: string;
  email_error?: string | null;
  whatsapp_error?: string | null;
};

type MemberForm = {
  email: string;
  displayName: string;
  role: string;
  employeeCode: string;
  jobTitle: string;
  phone: string;
  unitId: string;
  departmentId: string;
  notificationPreference: string;
  isActive: boolean;
};

const roleLabels: Record<string, string> = {
  owner: "Proprietário",
  admin: "Administrador",
  it_manager: "Gestor de TI",
  technician: "Técnico",
  auditor: "Auditor",
  user: "Usuário",
};

const roleDescriptions: Record<string, string> = {
  owner: "Controle total, inclusive proprietários e segurança.",
  admin: "Administra empresa, usuários, inventário e operação.",
  it_manager: "Coordena ativos, manutenção, rede e relatórios.",
  technician: "Atende chamados, diagnósticos e ordens de serviço.",
  auditor: "Consulta inventário, relatórios e realiza auditorias.",
  user: "Acessa o portal, seus equipamentos e próprios chamados.",
};

const invitationStatusLabels: Record<string, string> = {
  pending: "Pendente",
  sent: "Enviado",
  accepted: "Aceito",
  failed: "Falhou",
  canceled: "Cancelado",
};

const deliveryStatusLabels: Record<string, string> = {
  pending: "Pendente",
  sent: "Enviado",
  failed: "Falhou",
  disabled: "Desativado",
  not_configured: "Não configurado",
  not_requested: "Não solicitado",
  manual_ready: "Pronto para envio manual",
};

const emptyForm: MemberForm = {
  email: "",
  displayName: "",
  role: "user",
  employeeCode: "",
  jobTitle: "",
  phone: "",
  unitId: "",
  departmentId: "",
  notificationPreference: "in_app",
  isActive: true,
};

function formatPhone(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 11);

  if (digits.length <= 10) {
    return digits
      .replace(/^(\d{2})(\d)/, "($1) $2")
      .replace(/(\d{4})(\d)/, "$1-$2");
  }

  return digits
    .replace(/^(\d{2})(\d)/, "($1) $2")
    .replace(/(\d{5})(\d)/, "$1-$2");
}

function formatDate(value: string | null) {
  if (!value) return "Ainda não acessou";

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function getInitials(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export default function UserManagementPage({
  organization,
  onBack,
}: Props) {
  const { user } = useAuth();

  const [users, setUsers] = useState<DirectoryUser[]>([]);
  const [units, setUnits] = useState<UnitOption[]>([]);
  const [departments, setDepartments] =
    useState<DepartmentOption[]>([]);
  const [invitations, setInvitations] =
    useState<InvitationRecord[]>([]);
  const [invitationResult, setInvitationResult] =
    useState<InvitationResult | null>(null);
  const [isResendingId, setIsResendingId] =
    useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [editingUser, setEditingUser] =
    useState<DirectoryUser | null>(null);
  const [form, setForm] = useState<MemberForm>(emptyForm);

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error" | "warning";
    text: string;
  } | null>(null);

  const loadUsers = useCallback(async () => {
    setIsLoading(true);
    setFeedback(null);

    const organizationId = organization.organizationId;

    const [
      directoryResult,
      unitsResult,
      departmentsResult,
      invitationsResult,
    ] = await Promise.all([
      supabase.rpc("list_organization_users", {
        target_organization_id: organizationId,
      }),
      supabase
        .from("organization_units")
        .select("id,name")
        .eq("organization_id", organizationId)
        .order("name"),
      supabase
        .from("departments")
        .select("id,name,unit_id")
        .eq("organization_id", organizationId)
        .order("name"),
      (supabase as any)
        .from("organization_invitations")
        .select(
          "id,email,display_name,phone,role,status,email_status,whatsapp_status,last_error,invited_at,last_sent_at,accepted_at",
        )
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false })
        .limit(100),
    ]);

    const firstError = [
      directoryResult.error,
      unitsResult.error,
      departmentsResult.error,
      invitationsResult.error,
    ].find(Boolean);

    if (firstError) {
      setFeedback({
        type: "error",
        text: firstError.message,
      });
      setIsLoading(false);
      return;
    }

    setUsers(
      (directoryResult.data ?? []) as DirectoryUser[],
    );
    setUnits((unitsResult.data ?? []) as UnitOption[]);
    setDepartments(
      (departmentsResult.data ?? []) as DepartmentOption[],
    );
    setInvitations(
      (invitationsResult.data ?? []) as InvitationRecord[],
    );
    setIsLoading(false);
  }, [organization.organizationId]);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  const filteredUsers = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return users.filter((member) => {
      const matchesSearch =
        !normalizedSearch ||
        [
          member.display_name,
          member.email,
          member.employee_code,
          member.job_title,
        ]
          .filter(Boolean)
          .some((value) =>
            String(value)
              .toLowerCase()
              .includes(normalizedSearch),
          );

      const matchesRole =
        !roleFilter || member.role === roleFilter;

      const matchesStatus =
        !statusFilter ||
        (statusFilter === "active"
          ? member.is_active
          : !member.is_active);

      return matchesSearch && matchesRole && matchesStatus;
    });
  }, [users, search, roleFilter, statusFilter]);

  const counters = useMemo(
    () => ({
      total: users.length,
      active: users.filter((item) => item.is_active).length,
      technical: users.filter((item) =>
        ["owner", "admin", "it_manager", "technician"].includes(
          item.role,
        ),
      ).length,
      endUsers: users.filter((item) => item.role === "user")
        .length,
    }),
    [users],
  );

  const availableDepartments = useMemo(
    () =>
      departments.filter(
        (department) =>
          !form.unitId ||
          !department.unit_id ||
          department.unit_id === form.unitId,
      ),
    [departments, form.unitId],
  );

  const unitName = (unitId: string | null) =>
    units.find((item) => item.id === unitId)?.name ??
    "Não definida";

  const departmentName = (departmentId: string | null) =>
    departments.find((item) => item.id === departmentId)
      ?.name ?? "Não definido";

  const openInvite = () => {
    setEditingUser(null);
    setForm(emptyForm);
    setInvitationResult(null);
    setIsInviteOpen(true);
    setFeedback(null);
  };

  const openEdit = (member: DirectoryUser) => {
    if (
      member.role === "owner" &&
      organization.role !== "owner"
    ) {
      setFeedback({
        type: "warning",
        text:
          "Somente um proprietário pode alterar outro proprietário.",
      });
      return;
    }

    setEditingUser(member);
    setForm({
      email: member.email ?? "",
      displayName: member.display_name,
      role: member.role,
      employeeCode: member.employee_code ?? "",
      jobTitle: member.job_title ?? "",
      phone: member.phone ?? "",
      unitId: member.unit_id ?? "",
      departmentId: member.department_id ?? "",
      notificationPreference:
        member.notification_preference || "in_app",
      isActive: member.is_active,
    });
    setIsInviteOpen(true);
    setFeedback(null);
  };

  const closeEditor = () => {
    setIsInviteOpen(false);
    setEditingUser(null);
    setForm(emptyForm);
  };

  const saveMember = async (
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();
    setFeedback(null);

    if (
      !form.email.trim() ||
      !form.displayName.trim()
    ) {
      setFeedback({
        type: "error",
        text: "Informe o nome e o e-mail do usuário.",
      });
      return;
    }

    if (
      form.role === "owner" &&
      organization.role !== "owner"
    ) {
      setFeedback({
        type: "error",
        text:
          "Somente o proprietário pode conceder esse perfil.",
      });
      return;
    }

    setIsSaving(true);

    try {
      if (editingUser) {
        const { error } = await supabase
          .from("organization_memberships")
          .update({
            display_name: form.displayName.trim(),
            role: form.role,
            employee_code:
              form.employeeCode.trim() || null,
            job_title: form.jobTitle.trim() || null,
            phone: form.phone.trim() || null,
            unit_id: form.unitId || null,
            department_id: form.departmentId || null,
            notification_preference:
              form.notificationPreference,
            is_active: form.isActive,
          })
          .eq("id", editingUser.membership_id)
          .eq(
            "organization_id",
            organization.organizationId,
          );

        if (error) throw error;

        setFeedback({
          type: "success",
          text: "Usuário atualizado com sucesso.",
        });
      } else {
        const { data, error } =
          await supabase.functions.invoke(
            "invite-organization-user",
            {
              body: {
                organization_id:
                  organization.organizationId,
                email: form.email.trim().toLowerCase(),
                display_name: form.displayName.trim(),
                role: form.role,
                employee_code:
                  form.employeeCode.trim() || null,
                job_title: form.jobTitle.trim() || null,
                phone: form.phone.trim() || null,
                unit_id: form.unitId || null,
                department_id:
                  form.departmentId || null,
                notification_preference:
                  form.notificationPreference,
                redirect_to: window.location.origin,
              },
            },
          );

        if (error) throw error;

        const result = data as InvitationResult | null;

        if (!result) {
          throw new Error(
            "A função de convite não retornou os dados esperados.",
          );
        }

        setInvitationResult(result);

        const emailText =
          result.email_status === "sent"
            ? "E-mail personalizado enviado."
            : result.email_status === "not_configured"
              ? "Link criado, mas o Resend ainda não está configurado."
              : result.email_status === "disabled"
                ? "O envio por e-mail está desativado."
                : "O e-mail não pôde ser enviado.";

        setFeedback({
          type:
            result.email_status === "failed"
              ? "warning"
              : "success",
          text: result.existing_user
            ? `Usuário existente vinculado. ${emailText}`
            : `Convite criado. ${emailText}`,
        });
      }

      closeEditor();
      await loadUsers();
    } catch (error) {
      setFeedback({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "Não foi possível salvar o usuário.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const copyText = async (
    value: string,
    successMessage: string,
  ) => {
    try {
      await navigator.clipboard.writeText(value);
      setFeedback({
        type: "success",
        text: successMessage,
      });
    } catch {
      setFeedback({
        type: "error",
        text: "Não foi possível copiar o conteúdo.",
      });
    }
  };

  const openWhatsapp = (url: string) => {
    if (!url) {
      setFeedback({
        type: "warning",
        text:
          "Informe um telefone válido para preparar o WhatsApp.",
      });
      return;
    }

    window.open(url, "_blank", "noopener,noreferrer");
  };

  const resendInvitation = async (
    invitation: InvitationRecord,
  ) => {
    setIsResendingId(invitation.id);
    setFeedback(null);

    const { data, error } = await supabase.functions.invoke(
      "invite-organization-user",
      {
        body: {
          action: "resend",
          organization_id:
            organization.organizationId,
          invitation_id: invitation.id,
          redirect_to: window.location.origin,
        },
      },
    );

    setIsResendingId(null);

    if (error) {
      setFeedback({
        type: "error",
        text: error.message,
      });
      return;
    }

    const result = data as InvitationResult | null;

    if (!result) {
      setFeedback({
        type: "error",
        text:
          "A função de convite não retornou os dados esperados.",
      });
      return;
    }

    setInvitationResult(result);
    setFeedback({
      type:
        result.email_status === "failed"
          ? "warning"
          : "success",
      text:
        result.email_status === "sent"
          ? "Convite reenviado por e-mail."
          : "Novo link criado. Use o WhatsApp ou copie o link.",
    });

    await loadUsers();
  };

  const toggleMember = async (member: DirectoryUser) => {
    if (member.user_id === user?.id && member.is_active) {
      setFeedback({
        type: "warning",
        text:
          "Você não pode desativar o próprio acesso nesta tela.",
      });
      return;
    }

    if (
      member.role === "owner" &&
      organization.role !== "owner"
    ) {
      setFeedback({
        type: "warning",
        text:
          "Somente um proprietário pode alterar outro proprietário.",
      });
      return;
    }

    const { error } = await supabase
      .from("organization_memberships")
      .update({
        is_active: !member.is_active,
      })
      .eq("id", member.membership_id)
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

    setFeedback({
      type: "success",
      text: member.is_active
        ? "Acesso desativado."
        : "Acesso reativado.",
    });
    await loadUsers();
  };

  return (
    <main className="ativelo-users-page">
      <header className="ativelo-users-header">
        <div>
          <button type="button" onClick={onBack}>
            ← Voltar ao painel
          </button>
          <p>ACESSOS E RESPONSABILIDADES</p>
          <h1>Usuários e permissões</h1>
          <span>
            Convide pessoas, defina perfis e organize cada
            usuário por unidade e setor.
          </span>
        </div>

        <OrganizationBrand
          organization={organization}
          compact
        />
      </header>

      <section className="ativelo-users-metrics">
        <article>
          <span>Total de usuários</span>
          <strong>{counters.total}</strong>
        </article>
        <article>
          <span>Acessos ativos</span>
          <strong>{counters.active}</strong>
        </article>
        <article>
          <span>Equipe de TI</span>
          <strong>{counters.technical}</strong>
        </article>
        <article>
          <span>Usuários finais</span>
          <strong>{counters.endUsers}</strong>
        </article>
      </section>

      {feedback && (
        <div className={`ativelo-users-feedback ${feedback.type}`}>
          {feedback.text}
        </div>
      )}

      {invitationResult && (
        <section className="ativelo-invitation-result">
          <div>
            <span>CONVITE PREPARADO</span>
            <h2>
              {invitationResult.email_status === "sent"
                ? "E-mail personalizado enviado"
                : "Link de acesso criado"}
            </h2>
            <p>
              O convite contém a identidade da empresa, a marca do
              Ativelo, o perfil concedido e informações de segurança.
            </p>
          </div>

          <div className="ativelo-invitation-result-status">
            <article
              className={
                invitationResult.email_status === "sent"
                  ? "success"
                  : invitationResult.email_status === "failed"
                    ? "error"
                    : "warning"
              }
            >
              <AppIcon name="mail" size={20} />
              <span>
                <strong>E-mail</strong>
                <small>
                  {deliveryStatusLabels[
                    invitationResult.email_status
                  ] ?? invitationResult.email_status}
                </small>
              </span>
            </article>

            <article
              className={
                invitationResult.whatsapp_status === "sent"
                  ? "success"
                  : invitationResult.whatsapp_status === "failed"
                    ? "error"
                    : "manual"
              }
            >
              <AppIcon name="phone" size={20} />
              <span>
                <strong>WhatsApp</strong>
                <small>
                  {deliveryStatusLabels[
                    invitationResult.whatsapp_status
                  ] ?? invitationResult.whatsapp_status}
                </small>
              </span>
            </article>
          </div>

          <footer>
            {invitationResult.whatsapp_url && (
              <button
                type="button"
                className="whatsapp"
                onClick={() =>
                  openWhatsapp(
                    invitationResult.whatsapp_url,
                  )
                }
              >
                <AppIcon name="phone" size={18} />
                Abrir WhatsApp
              </button>
            )}

            <button
              type="button"
              onClick={() =>
                void copyText(
                  invitationResult.invite_url,
                  "Link do convite copiado.",
                )
              }
            >
              <AppIcon name="copy" size={18} />
              Copiar link
            </button>

            {invitationResult.whatsapp_message && (
              <button
                type="button"
                onClick={() =>
                  void copyText(
                    invitationResult.whatsapp_message,
                    "Mensagem do WhatsApp copiada.",
                  )
                }
              >
                <AppIcon name="message" size={18} />
                Copiar mensagem
              </button>
            )}

            <button
              type="button"
              className="close"
              onClick={() => setInvitationResult(null)}
            >
              Fechar
            </button>
          </footer>
        </section>
      )}

      <section className="ativelo-users-panel">
        <header>
          <div>
            <span>DIRETÓRIO DA EMPRESA</span>
            <h2>Pessoas cadastradas</h2>
          </div>

          <button type="button" onClick={openInvite}>
            <AppIcon name="mail" size={18} />
            Convidar usuário
          </button>
        </header>

        <div className="ativelo-users-toolbar">
          <label>
            <AppIcon name="search" size={19} />
            <input
              value={search}
              onChange={(event) =>
                setSearch(event.target.value)
              }
              placeholder="Buscar por nome, e-mail ou função"
            />
          </label>

          <select
            value={roleFilter}
            onChange={(event) =>
              setRoleFilter(event.target.value)
            }
          >
            <option value="">Todos os perfis</option>
            {Object.entries(roleLabels).map(
              ([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ),
            )}
          </select>

          <select
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(event.target.value)
            }
          >
            <option value="">Todos os status</option>
            <option value="active">Ativos</option>
            <option value="inactive">Inativos</option>
          </select>
        </div>

        {isLoading ? (
          <div className="ativelo-users-empty">
            Carregando usuários...
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="ativelo-users-empty">
            <AppIcon name="user" size={44} />
            <strong>Nenhum usuário encontrado</strong>
            <span>
              Convide a primeira pessoa ou altere os filtros.
            </span>
          </div>
        ) : (
          <div className="ativelo-users-list">
            {filteredUsers.map((member) => (
              <article
                className={member.is_active ? "" : "inactive"}
                key={member.membership_id}
              >
                <div className="ativelo-user-avatar-large">
                  {getInitials(
                    member.display_name ||
                      member.email ||
                      "US",
                  )}
                </div>

                <div className="ativelo-user-main">
                  <header>
                    <div>
                      <h3>{member.display_name}</h3>
                      <p>{member.email || "Sem e-mail"}</p>
                    </div>

                    <span className={`role ${member.role}`}>
                      {roleLabels[member.role] ?? member.role}
                    </span>
                  </header>

                  <dl>
                    <div>
                      <dt>Função</dt>
                      <dd>
                        {member.job_title || "Não informada"}
                      </dd>
                    </div>
                    <div>
                      <dt>Unidade</dt>
                      <dd>{unitName(member.unit_id)}</dd>
                    </div>
                    <div>
                      <dt>Setor</dt>
                      <dd>
                        {departmentName(
                          member.department_id,
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt>Último acesso</dt>
                      <dd>
                        {formatDate(member.last_access_at)}
                      </dd>
                    </div>
                  </dl>
                </div>

                <footer>
                  <span
                    className={
                      member.is_active ? "active" : "inactive"
                    }
                  >
                    {member.is_active ? "Ativo" : "Inativo"}
                  </span>

                  <button
                    type="button"
                    onClick={() => openEdit(member)}
                  >
                    <AppIcon name="edit" size={16} />
                    Editar
                  </button>

                  <button
                    type="button"
                    className={
                      member.is_active
                        ? "deactivate"
                        : "activate"
                    }
                    onClick={() => void toggleMember(member)}
                  >
                    {member.is_active
                      ? "Desativar"
                      : "Reativar"}
                  </button>
                </footer>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="ativelo-invitation-history">
        <header>
          <div>
            <span>HISTÓRICO DE CONVITES</span>
            <h2>Envios e aceitações</h2>
          </div>
          <b>{invitations.length}</b>
        </header>

        {invitations.length === 0 ? (
          <div className="ativelo-invitation-history-empty">
            Nenhum convite personalizado foi registrado.
          </div>
        ) : (
          <div className="ativelo-invitation-history-list">
            {invitations.map((invitation) => (
              <article key={invitation.id}>
                <i>
                  <AppIcon name="mail" size={20} />
                </i>

                <div className="main">
                  <strong>{invitation.display_name}</strong>
                  <span>{invitation.email}</span>
                  <small>
                    {roleLabels[invitation.role] ??
                      invitation.role}{" "}
                    ·{" "}
                    {new Date(
                      invitation.last_sent_at ??
                        invitation.invited_at,
                    ).toLocaleString("pt-BR")}
                  </small>
                </div>

                <div className="delivery">
                  <span
                    className={`state ${invitation.status}`}
                  >
                    {invitationStatusLabels[
                      invitation.status
                    ] ?? invitation.status}
                  </span>
                  <small>
                    E-mail:{" "}
                    {deliveryStatusLabels[
                      invitation.email_status
                    ] ?? invitation.email_status}
                  </small>
                  <small>
                    WhatsApp:{" "}
                    {deliveryStatusLabels[
                      invitation.whatsapp_status
                    ] ?? invitation.whatsapp_status}
                  </small>
                </div>

                <button
                  type="button"
                  disabled={
                    invitation.status === "accepted" ||
                    isResendingId === invitation.id
                  }
                  onClick={() =>
                    void resendInvitation(invitation)
                  }
                >
                  <AppIcon name="refresh" size={16} />
                  {isResendingId === invitation.id
                    ? "Reenviando..."
                    : invitation.status === "accepted"
                      ? "Aceito"
                      : "Reenviar"}
                </button>
              </article>
            ))}
          </div>
        )}
      </section>

      {isInviteOpen && (
        <div className="ativelo-modal-backdrop">
          <section
            className="ativelo-modal ativelo-user-modal"
            role="dialog"
            aria-modal="true"
          >
            <header>
              <div>
                <span>
                  {editingUser
                    ? "EDITAR ACESSO"
                    : "NOVO CONVITE"}
                </span>
                <h2>
                  {editingUser
                    ? editingUser.display_name
                    : "Convidar usuário"}
                </h2>
              </div>

              <button type="button" onClick={closeEditor}>
                <AppIcon name="close" size={21} />
              </button>
            </header>

            <form onSubmit={saveMember}>
              <div className="two">
                <label>
                  <span>Nome completo *</span>
                  <input
                    value={form.displayName}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        displayName: event.target.value,
                      })
                    }
                  />
                </label>

                <label>
                  <span>E-mail *</span>
                  <input
                    type="email"
                    value={form.email}
                    disabled={Boolean(editingUser)}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        email: event.target.value,
                      })
                    }
                  />
                </label>
              </div>

              <label>
                <span>Perfil de acesso *</span>
                <select
                  value={form.role}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      role: event.target.value,
                    })
                  }
                >
                  {Object.entries(roleLabels)
                    .filter(
                      ([value]) =>
                        value !== "owner" ||
                        organization.role === "owner",
                    )
                    .map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                </select>

                <small className="ativelo-role-help">
                  {roleDescriptions[form.role]}
                </small>
              </label>

              <div className="two">
                <label>
                  <span>Código do colaborador</span>
                  <input
                    value={form.employeeCode}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        employeeCode: event.target.value,
                      })
                    }
                  />
                </label>

                <label>
                  <span>Cargo ou função</span>
                  <input
                    value={form.jobTitle}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        jobTitle: event.target.value,
                      })
                    }
                  />
                </label>
              </div>

              <div className="two">
                <label>
                  <span>Unidade</span>
                  <select
                    value={form.unitId}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        unitId: event.target.value,
                        departmentId: "",
                      })
                    }
                  >
                    <option value="">Não definida</option>
                    {units.map((unit) => (
                      <option
                        key={unit.id}
                        value={unit.id}
                      >
                        {unit.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  <span>Setor</span>
                  <select
                    value={form.departmentId}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        departmentId: event.target.value,
                      })
                    }
                  >
                    <option value="">Não definido</option>
                    {availableDepartments.map(
                      (department) => (
                        <option
                          key={department.id}
                          value={department.id}
                        >
                          {department.name}
                        </option>
                      ),
                    )}
                  </select>
                </label>
              </div>

              <div className="two">
                <label>
                  <span>Telefone ou WhatsApp</span>
                  <input
                    value={form.phone}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        phone: formatPhone(
                          event.target.value,
                        ),
                      })
                    }
                  />
                </label>

                <label>
                  <span>Canal preferencial após o acesso</span>
                  <select
                    value={form.notificationPreference}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        notificationPreference:
                          event.target.value,
                      })
                    }
                  >
                    <option value="in_app">
                      Somente no aplicativo
                    </option>
                    <option value="email">E-mail</option>
                    <option value="whatsapp">
                      WhatsApp
                    </option>
                  </select>
                </label>
              </div>

              {!editingUser && (
                <div className="ativelo-invite-channel-note">
                  <AppIcon name="mail" size={19} />
                  <p>
                    O convite será personalizado com a marca da
                    empresa. Se houver telefone, o Ativelo também
                    preparará o WhatsApp ou fará o envio automático
                    quando a Cloud API estiver configurada.
                  </p>
                </div>
              )}

              {editingUser && (
                <label className="ativelo-user-active-field">
                  <input
                    type="checkbox"
                    checked={form.isActive}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        isActive: event.target.checked,
                      })
                    }
                  />
                  <span>
                    Usuário ativo e autorizado a acessar
                  </span>
                </label>
              )}

              <footer>
                <button
                  type="button"
                  className="secondary"
                  onClick={closeEditor}
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  className="primary"
                  disabled={isSaving}
                >
                  <AppIcon
                    name={editingUser ? "save" : "mail"}
                    size={18}
                  />
                  {isSaving
                    ? "Salvando..."
                    : editingUser
                      ? "Salvar alterações"
                      : "Enviar convite"}
                </button>
              </footer>
            </form>
          </section>
        </div>
      )}
    </main>
  );
}
