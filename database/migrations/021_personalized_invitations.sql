-- ATIVELO - PACOTE 21
-- Convites personalizados, historico e WhatsApp manual/automatico.

begin;

create extension if not exists pgcrypto;

do $$
begin
  if to_regclass('public.organizations') is null then
    raise exception 'Tabela public.organizations nao encontrada.';
  end if;

  if to_regclass('public.organization_memberships') is null then
    raise exception 'Tabela public.organization_memberships nao encontrada.';
  end if;

  if to_regprocedure('public.can_manage_organization_users(uuid)') is null then
    raise exception 'Execute o Pacote 20 antes deste pacote.';
  end if;
end
$$;

create table if not exists public.organization_communication_settings (
  organization_id uuid primary key
    references public.organizations(id) on delete cascade,

  email_enabled boolean not null default true,
  sender_name text not null default 'Equipe de TI',
  email_subject_template text not null default
    'Voce recebeu um convite da {empresa} para acessar o Ativelo',
  email_intro_text text not null default
    'Voce foi convidado para acessar o Ativelo, a plataforma de gestao de equipamentos e suporte de TI da {empresa}.',
  email_button_label text not null default
    'Aceitar convite e criar acesso',
  email_footer_text text not null default
    'Este convite foi enviado pela {empresa} por meio da plataforma Ativelo.',
  support_email text,
  support_phone text,
  primary_color text not null default '#1971F5',

  whatsapp_mode text not null default 'manual'
    check (
      whatsapp_mode in (
        'disabled',
        'manual',
        'automatic'
      )
    ),
  default_country_code text not null default '55',
  whatsapp_template_name text not null default
    'ativelo_invite',
  whatsapp_language_code text not null default 'pt_BR',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  check (primary_color ~ '^#[0-9A-Fa-f]{6}$')
);

create table if not exists public.organization_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete cascade,
  auth_user_id uuid
    references auth.users(id) on delete set null,

  email text not null,
  display_name text not null,
  phone text,
  role text not null,

  status text not null default 'pending'
    check (
      status in (
        'pending',
        'sent',
        'accepted',
        'failed',
        'canceled'
      )
    ),

  email_status text not null default 'pending'
    check (
      email_status in (
        'pending',
        'sent',
        'failed',
        'disabled',
        'not_configured'
      )
    ),

  whatsapp_status text not null default 'not_requested'
    check (
      whatsapp_status in (
        'not_requested',
        'manual_ready',
        'sent',
        'failed',
        'disabled',
        'not_configured'
      )
    ),

  email_provider_id text,
  whatsapp_provider_id text,
  last_error text,

  invited_by uuid
    references auth.users(id) on delete set null,
  invited_at timestamptz not null default now(),
  last_sent_at timestamptz,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_org_invites_organization
on public.organization_invitations (
  organization_id,
  created_at desc
);

create index if not exists idx_org_invites_email
on public.organization_invitations (
  organization_id,
  lower(email)
);

create index if not exists idx_org_invites_status
on public.organization_invitations (
  organization_id,
  status,
  last_sent_at desc
);

create or replace function public.ativelo_invitation_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_communication_settings_updated_at
on public.organization_communication_settings;

create trigger trg_communication_settings_updated_at
before update
on public.organization_communication_settings
for each row
execute function public.ativelo_invitation_updated_at();

drop trigger if exists trg_organization_invitations_updated_at
on public.organization_invitations;

create trigger trg_organization_invitations_updated_at
before update
on public.organization_invitations
for each row
execute function public.ativelo_invitation_updated_at();

insert into public.organization_communication_settings (
  organization_id,
  support_email,
  support_phone
)
select
  organization.id,
  organization.email,
  coalesce(
    organization.whatsapp,
    organization.phone
  )
from public.organizations organization
on conflict (organization_id) do nothing;

alter table public.organization_communication_settings
enable row level security;

alter table public.organization_invitations
enable row level security;

drop policy if exists communication_settings_select_member
on public.organization_communication_settings;

create policy communication_settings_select_member
on public.organization_communication_settings
for select
to authenticated
using (
  public.is_organization_member(organization_id)
);

drop policy if exists communication_settings_manage_admin
on public.organization_communication_settings;

create policy communication_settings_manage_admin
on public.organization_communication_settings
for all
to authenticated
using (
  public.can_manage_organization_users(
    organization_id
  )
)
with check (
  public.can_manage_organization_users(
    organization_id
  )
);

drop policy if exists organization_invitations_select_admin
on public.organization_invitations;

create policy organization_invitations_select_admin
on public.organization_invitations
for select
to authenticated
using (
  public.can_manage_organization_users(
    organization_id
  )
);

drop policy if exists organization_invitations_manage_admin
on public.organization_invitations;

create policy organization_invitations_manage_admin
on public.organization_invitations
for all
to authenticated
using (
  public.can_manage_organization_users(
    organization_id
  )
)
with check (
  public.can_manage_organization_users(
    organization_id
  )
);

grant select, insert, update, delete
on public.organization_communication_settings
to authenticated;

grant select, insert, update, delete
on public.organization_invitations
to authenticated;

create or replace function public.mark_my_invitation_accepted(
  target_organization_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  current_email text;
begin
  if not public.is_organization_member(
    target_organization_id
  ) then
    return;
  end if;

  current_email := lower(
    coalesce(auth.jwt() ->> 'email', '')
  );

  if current_email = '' then
    return;
  end if;

  update public.organization_invitations
  set
    status = 'accepted',
    accepted_at = coalesce(accepted_at, now()),
    auth_user_id = coalesce(
      auth_user_id,
      auth.uid()
    )
  where organization_id =
      target_organization_id
    and lower(email) = current_email
    and status in ('pending','sent','failed');
end;
$$;

grant execute on function public.mark_my_invitation_accepted(uuid)
to authenticated;

create or replace view public.organization_invitation_summary
with (security_invoker = true)
as
select
  organization_id,
  count(*) as total_invitations,
  count(*) filter (
    where status = 'accepted'
  ) as accepted_invitations,
  count(*) filter (
    where status = 'sent'
  ) as pending_invitations,
  count(*) filter (
    where status = 'failed'
  ) as failed_invitations,
  count(*) filter (
    where email_status = 'sent'
  ) as emails_sent,
  count(*) filter (
    where whatsapp_status = 'sent'
  ) as whatsapp_sent,
  count(*) filter (
    where whatsapp_status = 'manual_ready'
  ) as whatsapp_manual_ready
from public.organization_invitations
group by organization_id;

grant select on public.organization_invitation_summary
to authenticated;

commit;
