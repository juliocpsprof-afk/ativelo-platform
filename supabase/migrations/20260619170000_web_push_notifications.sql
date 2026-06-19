begin;

do $$
begin
  if to_regclass('public.app_notifications') is null then
    raise exception 'Tabela public.app_notifications nao encontrada.';
  end if;

  if to_regclass('public.support_tickets') is null then
    raise exception 'Tabela public.support_tickets nao encontrada.';
  end if;

  if to_regclass('public.preventive_maintenance_plans') is null then
    raise exception 'Tabela public.preventive_maintenance_plans nao encontrada.';
  end if;

  if to_regclass('public.asset_loans') is null then
    raise exception 'Tabela public.asset_loans nao encontrada.';
  end if;

  if to_regclass('public.assets') is null then
    raise exception 'Tabela public.assets nao encontrada.';
  end if;

  if to_regclass('public.inventory_agents') is null then
    raise exception 'Tabela public.inventory_agents nao encontrada. Publique primeiro o Pacote 40.';
  end if;

  if to_regprocedure('public.is_organization_member(uuid)') is null then
    raise exception 'Funcao public.is_organization_member(uuid) nao encontrada.';
  end if;

  if to_regprocedure('public.can_manage_organization(uuid)') is null then
    raise exception 'Funcao public.can_manage_organization(uuid) nao encontrada.';
  end if;
end
$$;

alter table public.app_notifications
  drop constraint if exists app_notifications_channel_check;

alter table public.app_notifications
  add constraint app_notifications_channel_check
  check (
    channel in (
      'in_app',
      'email',
      'whatsapp',
      'push'
    )
  );

alter table public.app_notifications
  add column if not exists source_key text,
  add column if not exists action_url text,
  add column if not exists delivery_attempts integer
    not null default 0,
  add column if not exists next_attempt_at timestamptz,
  add column if not exists last_attempt_at timestamptz,
  add column if not exists delivered_at timestamptz,
  add column if not exists failed_at timestamptz,
  add column if not exists provider_status text,
  add column if not exists provider_error_code text;

create unique index if not exists
  uq_push_notification_source
on public.app_notifications(
  organization_id,
  recipient_user_id,
  source_key
)
where
  channel = 'push'
  and source_key is not null;

create index if not exists
  idx_push_notification_dispatch
on public.app_notifications(
  delivery_status,
  coalesce(next_attempt_at, scheduled_for),
  created_at
)
where channel = 'push';

create table if not exists
  public.web_push_subscriptions (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null
      references public.organizations(id)
      on delete cascade,
    user_id uuid not null
      references auth.users(id)
      on delete cascade,
    endpoint text not null unique,
    p256dh text not null,
    auth_key text not null,
    content_encoding text not null
      default 'aes128gcm',
    device_name text,
    user_agent text,
    platform text,
    is_active boolean not null default true,
    last_seen_at timestamptz not null default now(),
    last_success_at timestamptz,
    failure_count integer not null default 0,
    last_error text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );

create index if not exists
  idx_web_push_subscriptions_user
on public.web_push_subscriptions(
  organization_id,
  user_id,
  is_active
);

create table if not exists
  public.push_notification_preferences (
    organization_id uuid not null
      references public.organizations(id)
      on delete cascade,
    user_id uuid not null
      references auth.users(id)
      on delete cascade,
    enabled boolean not null default true,
    ticket_created boolean not null default true,
    ticket_assigned boolean not null default true,
    maintenance_due boolean not null default true,
    loan_overdue boolean not null default true,
    agent_offline boolean not null default true,
    warranty_due boolean not null default true,
    system_update boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    primary key (
      organization_id,
      user_id
    )
  );

create table if not exists
  public.push_delivery_attempts (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null
      references public.organizations(id)
      on delete cascade,
    notification_id uuid not null
      references public.app_notifications(id)
      on delete cascade,
    subscription_id uuid
      references public.web_push_subscriptions(id)
      on delete set null,
    user_id uuid not null
      references auth.users(id)
      on delete cascade,
    status text not null
      check (
        status in (
          'sent',
          'failed',
          'expired'
        )
      ),
    response_status integer,
    error_message text,
    endpoint_origin text,
    created_at timestamptz not null default now()
  );

create index if not exists
  idx_push_delivery_attempts_user
on public.push_delivery_attempts(
  organization_id,
  user_id,
  created_at desc
);

create table if not exists
  public.system_announcements (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null
      references public.organizations(id)
      on delete cascade,
    version_label text,
    title text not null,
    message text not null,
    action_url text not null default '/',
    is_active boolean not null default true,
    published_at timestamptz not null default now(),
    created_by uuid
      references auth.users(id)
      on delete set null
      default auth.uid(),
    created_at timestamptz not null default now()
  );

create or replace function
  public.ativelo_push_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists
  trg_web_push_subscriptions_touch
on public.web_push_subscriptions;

create trigger
  trg_web_push_subscriptions_touch
before update
on public.web_push_subscriptions
for each row
execute function
  public.ativelo_push_touch();

drop trigger if exists
  trg_push_preferences_touch
on public.push_notification_preferences;

create trigger
  trg_push_preferences_touch
before update
on public.push_notification_preferences
for each row
execute function
  public.ativelo_push_touch();

create or replace function
  public.ensure_my_push_preferences_v1(
    p_organization_id uuid
  )
returns public.push_notification_preferences
language plpgsql
security definer
set search_path =
  public,
  auth,
  pg_catalog,
  pg_temp
as $$
declare
  preference_row
    public.push_notification_preferences%rowtype;
begin
  if not public.is_organization_member(
    p_organization_id
  ) then
    raise exception 'push_access_denied';
  end if;

  insert into public.push_notification_preferences (
    organization_id,
    user_id
  )
  values (
    p_organization_id,
    auth.uid()
  )
  on conflict (
    organization_id,
    user_id
  )
  do nothing;

  select *
  into preference_row
  from public.push_notification_preferences
  where
    organization_id =
      p_organization_id
    and user_id =
      auth.uid();

  return preference_row;
end;
$$;

create or replace function
  public.register_my_web_push_subscription_v1(
    p_organization_id uuid,
    p_endpoint text,
    p_p256dh text,
    p_auth_key text,
    p_device_name text,
    p_user_agent text,
    p_platform text
  )
returns uuid
language plpgsql
security definer
set search_path =
  public,
  auth,
  pg_catalog,
  pg_temp
as $$
declare
  subscription_id uuid;
begin
  if not public.is_organization_member(
    p_organization_id
  ) then
    raise exception 'push_access_denied';
  end if;

  if
    coalesce(length(btrim(p_endpoint)), 0) < 20
    or coalesce(length(btrim(p_p256dh)), 0) < 20
    or coalesce(length(btrim(p_auth_key)), 0) < 8
  then
    raise exception 'invalid_push_subscription';
  end if;

  insert into public.push_notification_preferences (
    organization_id,
    user_id
  )
  values (
    p_organization_id,
    auth.uid()
  )
  on conflict (
    organization_id,
    user_id
  )
  do nothing;

  insert into public.web_push_subscriptions (
    organization_id,
    user_id,
    endpoint,
    p256dh,
    auth_key,
    device_name,
    user_agent,
    platform,
    is_active,
    last_seen_at,
    failure_count,
    last_error
  )
  values (
    p_organization_id,
    auth.uid(),
    p_endpoint,
    p_p256dh,
    p_auth_key,
    left(p_device_name, 120),
    left(p_user_agent, 600),
    left(p_platform, 120),
    true,
    now(),
    0,
    null
  )
  on conflict (endpoint)
  do update set
    organization_id =
      excluded.organization_id,
    user_id =
      excluded.user_id,
    p256dh =
      excluded.p256dh,
    auth_key =
      excluded.auth_key,
    device_name =
      excluded.device_name,
    user_agent =
      excluded.user_agent,
    platform =
      excluded.platform,
    is_active = true,
    last_seen_at = now(),
    failure_count = 0,
    last_error = null,
    updated_at = now()
  returning id
  into subscription_id;

  return subscription_id;
end;
$$;

create or replace function
  public.disable_my_web_push_subscription_v1(
    p_endpoint text
  )
returns void
language plpgsql
security definer
set search_path =
  public,
  auth,
  pg_catalog,
  pg_temp
as $$
begin
  update public.web_push_subscriptions
  set
    is_active = false,
    updated_at = now()
  where
    endpoint = p_endpoint
    and user_id = auth.uid();
end;
$$;

create or replace function
  public.push_category_enabled_v1(
    p_organization_id uuid,
    p_user_id uuid,
    p_category text
  )
returns boolean
language sql
stable
security definer
set search_path =
  public,
  auth,
  pg_catalog,
  pg_temp
as $$
  select
    membership.is_active
    and coalesce(preference.enabled, true)
    and case p_category
      when 'ticket_created'
        then coalesce(
          preference.ticket_created,
          true
        )
      when 'ticket_assigned'
        then coalesce(
          preference.ticket_assigned,
          true
        )
      when 'maintenance_due'
        then coalesce(
          preference.maintenance_due,
          true
        )
      when 'loan_overdue'
        then coalesce(
          preference.loan_overdue,
          true
        )
      when 'agent_offline'
        then coalesce(
          preference.agent_offline,
          true
        )
      when 'warranty_due'
        then coalesce(
          preference.warranty_due,
          true
        )
      when 'system_update'
        then coalesce(
          preference.system_update,
          true
        )
      when 'test'
        then true
      else false
    end
  from public.organization_memberships membership
  left join public.push_notification_preferences preference
    on preference.organization_id =
      membership.organization_id
    and preference.user_id =
      membership.user_id
  where
    membership.organization_id =
      p_organization_id
    and membership.user_id =
      p_user_id
  limit 1;
$$;

create or replace function
  public.queue_push_notification_v1(
    p_organization_id uuid,
    p_user_id uuid,
    p_category text,
    p_title text,
    p_message text,
    p_action_url text,
    p_source_key text,
    p_severity text default 'info',
    p_entity_type text default null,
    p_entity_id uuid default null,
    p_scheduled_for timestamptz default now()
  )
returns uuid
language plpgsql
security definer
set search_path =
  public,
  auth,
  pg_catalog,
  pg_temp
as $$
declare
  notification_id uuid;
begin
  if not coalesce(
    public.push_category_enabled_v1(
      p_organization_id,
      p_user_id,
      p_category
    ),
    false
  ) then
    return null;
  end if;

  if not exists (
    select 1
    from public.web_push_subscriptions subscription
    where
      subscription.organization_id =
        p_organization_id
      and subscription.user_id =
        p_user_id
      and subscription.is_active = true
  ) then
    return null;
  end if;

  insert into public.app_notifications (
    organization_id,
    recipient_user_id,
    channel,
    category,
    severity,
    title,
    message,
    entity_type,
    entity_id,
    scheduled_for,
    delivery_status,
    next_attempt_at,
    source_key,
    action_url,
    provider_status,
    metadata
  )
  values (
    p_organization_id,
    p_user_id,
    'push',
    p_category,
    case
      when p_severity in (
        'info',
        'success',
        'warning',
        'high',
        'critical'
      )
      then p_severity
      else 'info'
    end,
    left(p_title, 300),
    left(p_message, 3000),
    p_entity_type,
    p_entity_id,
    coalesce(p_scheduled_for, now()),
    'pending',
    coalesce(p_scheduled_for, now()),
    left(p_source_key, 500),
    left(coalesce(p_action_url, '/'), 1000),
    'queued',
    jsonb_build_object(
      'push_category',
      p_category
    )
  )
  on conflict (
    organization_id,
    recipient_user_id,
    source_key
  )
  where
    channel = 'push'
    and source_key is not null
  do nothing
  returning id
  into notification_id;

  return notification_id;
end;
$$;

create or replace function
  public.queue_push_for_roles_v1(
    p_organization_id uuid,
    p_roles text[],
    p_category text,
    p_title text,
    p_message text,
    p_action_url text,
    p_source_key text,
    p_severity text default 'info',
    p_entity_type text default null,
    p_entity_id uuid default null
  )
returns integer
language plpgsql
security definer
set search_path =
  public,
  auth,
  pg_catalog,
  pg_temp
as $$
declare
  membership_row record;
  queued_count integer := 0;
  queued_id uuid;
begin
  for membership_row in
    select membership.user_id
    from public.organization_memberships membership
    where
      membership.organization_id =
        p_organization_id
      and membership.is_active = true
      and membership.role =
        any(p_roles)
  loop
    queued_id :=
      public.queue_push_notification_v1(
        p_organization_id,
        membership_row.user_id,
        p_category,
        p_title,
        p_message,
        p_action_url,
        p_source_key,
        p_severity,
        p_entity_type,
        p_entity_id,
        now()
      );

    if queued_id is not null then
      queued_count :=
        queued_count + 1;
    end if;
  end loop;

  return queued_count;
end;
$$;

create or replace function
  public.queue_push_for_all_members_v1(
    p_organization_id uuid,
    p_category text,
    p_title text,
    p_message text,
    p_action_url text,
    p_source_key text,
    p_severity text default 'info'
  )
returns integer
language plpgsql
security definer
set search_path =
  public,
  auth,
  pg_catalog,
  pg_temp
as $$
declare
  membership_row record;
  queued_count integer := 0;
  queued_id uuid;
begin
  for membership_row in
    select membership.user_id
    from public.organization_memberships membership
    where
      membership.organization_id =
        p_organization_id
      and membership.is_active = true
  loop
    queued_id :=
      public.queue_push_notification_v1(
        p_organization_id,
        membership_row.user_id,
        p_category,
        p_title,
        p_message,
        p_action_url,
        p_source_key,
        p_severity,
        null,
        null,
        now()
      );

    if queued_id is not null then
      queued_count :=
        queued_count + 1;
    end if;
  end loop;

  return queued_count;
end;
$$;

create or replace function
  public.handle_ticket_push_v1()
returns trigger
language plpgsql
security definer
set search_path =
  public,
  auth,
  pg_catalog,
  pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    perform public.queue_push_for_roles_v1(
      new.organization_id,
      array[
        'owner',
        'admin',
        'it_manager',
        'technician'
      ]::text[],
      'ticket_created',
      'Novo chamado ' || new.ticket_number,
      new.title || '. Prioridade: ' ||
        new.priority || '.',
      '/',
      'ticket_created:' || new.id::text,
      case
        when new.priority = 'urgent'
        then 'critical'
        when new.priority = 'high'
        then 'high'
        else 'info'
      end,
      'support_ticket',
      new.id
    );

    if new.assigned_to is not null then
      perform public.queue_push_notification_v1(
        new.organization_id,
        new.assigned_to,
        'ticket_assigned',
        'Chamado atribuído a você',
        new.ticket_number || ' - ' ||
          new.title,
        '/',
        'ticket_assigned:' ||
          new.id::text || ':' ||
          new.assigned_to::text || ':' ||
          extract(
            epoch from new.created_at
          )::bigint::text,
        'high',
        'support_ticket',
        new.id,
        now()
      );
    end if;

    return new;
  end if;

  if
    old.assigned_to is distinct from
      new.assigned_to
    and new.assigned_to is not null
  then
    perform public.queue_push_notification_v1(
      new.organization_id,
      new.assigned_to,
      'ticket_assigned',
      'Chamado atribuído a você',
      new.ticket_number || ' - ' ||
        new.title,
      '/',
      'ticket_assigned:' ||
        new.id::text || ':' ||
        new.assigned_to::text || ':' ||
        extract(
          epoch from new.updated_at
        )::bigint::text,
      'high',
      'support_ticket',
      new.id,
      now()
    );
  end if;

  return new;
end;
$$;

drop trigger if exists
  trg_ticket_push_v1
on public.support_tickets;

create trigger
  trg_ticket_push_v1
after insert or update
on public.support_tickets
for each row
execute function
  public.handle_ticket_push_v1();

create or replace function
  public.handle_system_announcement_push_v1()
returns trigger
language plpgsql
security definer
set search_path =
  public,
  auth,
  pg_catalog,
  pg_temp
as $$
begin
  if new.is_active then
    perform public.queue_push_for_all_members_v1(
      new.organization_id,
      'system_update',
      new.title,
      new.message,
      new.action_url,
      'system_update:' || new.id::text,
      'info'
    );
  end if;

  return new;
end;
$$;

drop trigger if exists
  trg_system_announcement_push_v1
on public.system_announcements;

create trigger
  trg_system_announcement_push_v1
after insert
on public.system_announcements
for each row
execute function
  public.handle_system_announcement_push_v1();

create or replace function
  public.prepare_scheduled_push_notifications_v1()
returns integer
language plpgsql
security definer
set search_path =
  public,
  auth,
  pg_catalog,
  pg_temp
as $$
declare
  item record;
  queued_total integer := 0;
  added integer := 0;
begin
  for item in
    select
      plan.id,
      plan.organization_id,
      plan.name,
      plan.next_due_date,
      plan.alert_days
    from public.preventive_maintenance_plans plan
    where
      plan.is_active = true
      and plan.next_due_date <=
        current_date + plan.alert_days
      and plan.next_due_date >=
        current_date - 30
  loop
    added :=
      public.queue_push_for_roles_v1(
        item.organization_id,
        array[
          'owner',
          'admin',
          'it_manager',
          'technician'
        ]::text[],
        'maintenance_due',
        case
          when item.next_due_date <
            current_date
          then 'Manutenção preventiva vencida'
          else 'Manutenção preventiva próxima'
        end,
        item.name || ' - ' ||
          to_char(
            item.next_due_date,
            'DD/MM/YYYY'
          ),
        '/',
        'maintenance_due:' ||
          item.id::text || ':' ||
          item.next_due_date::text,
        case
          when item.next_due_date <
            current_date
          then 'critical'
          else 'warning'
        end,
        'preventive_maintenance_plan',
        item.id
      );

    queued_total :=
      queued_total + added;
  end loop;

  for item in
    select
      loan.id,
      loan.organization_id,
      loan.borrower_name,
      loan.due_at,
      asset.asset_number,
      asset.name as asset_name
    from public.asset_loans loan
    join public.assets asset
      on asset.id = loan.asset_id
    where
      loan.status in (
        'active',
        'overdue'
      )
      and loan.due_at < now()
  loop
    added :=
      public.queue_push_for_roles_v1(
        item.organization_id,
        array[
          'owner',
          'admin',
          'it_manager'
        ]::text[],
        'loan_overdue',
        'Empréstimo atrasado',
        item.asset_number || ' - ' ||
          item.asset_name ||
          ' deveria ter sido devolvido por ' ||
          item.borrower_name || ' em ' ||
          to_char(
            item.due_at at time zone
              'America/Bahia',
            'DD/MM/YYYY HH24:MI'
          ) || '.',
        '/',
        'loan_overdue:' ||
          item.id::text || ':' ||
          item.due_at::text,
        'high',
        'asset_loan',
        item.id
      );

    queued_total :=
      queued_total + added;
  end loop;

  for item in
    select
      agent.id,
      agent.organization_id,
      agent.hostname,
      agent.device_uid,
      agent.last_seen_at,
      coalesce(
        policy.offline_minutes,
        60
      ) as offline_minutes
    from public.inventory_agents agent
    left join public.agent_policies policy
      on policy.id = agent.policy_id
    where
      agent.revoked_at is null
      and agent.paused_at is null
      and agent.status not in (
        'disabled',
        'revoked',
        'paused'
      )
      and agent.last_seen_at is not null
      and agent.last_seen_at <
        now() -
        make_interval(
          mins =>
            coalesce(
              policy.offline_minutes,
              60
            )
        )
  loop
    added :=
      public.queue_push_for_roles_v1(
        item.organization_id,
        array[
          'owner',
          'admin',
          'it_manager',
          'technician'
        ]::text[],
        'agent_offline',
        'Equipamento sem comunicação',
        coalesce(
          nullif(item.hostname, ''),
          item.device_uid
        ) || ' não se comunica com o Ativelo desde ' ||
          to_char(
            item.last_seen_at at time zone
              'America/Bahia',
            'DD/MM/YYYY HH24:MI'
          ) || '.',
        '/',
        'agent_offline:' ||
          item.id::text || ':' ||
          extract(
            epoch from item.last_seen_at
          )::bigint::text,
        'high',
        'inventory_agent',
        item.id
      );

    queued_total :=
      queued_total + added;
  end loop;

  for item in
    select
      asset.id,
      asset.organization_id,
      asset.asset_number,
      asset.name,
      asset.warranty_end_date
    from public.assets asset
    where
      asset.is_active = true
      and asset.warranty_end_date is not null
      and asset.warranty_end_date >=
        current_date
      and asset.warranty_end_date <=
        current_date + 30
  loop
    added :=
      public.queue_push_for_roles_v1(
        item.organization_id,
        array[
          'owner',
          'admin',
          'it_manager'
        ]::text[],
        'warranty_due',
        'Garantia próxima do vencimento',
        item.asset_number || ' - ' ||
          item.name || ' vence em ' ||
          to_char(
            item.warranty_end_date,
            'DD/MM/YYYY'
          ) || '.',
        '/',
        'warranty_due:' ||
          item.id::text || ':' ||
          item.warranty_end_date::text,
        'warning',
        'asset',
        item.id
      );

    queued_total :=
      queued_total + added;
  end loop;

  return queued_total;
end;
$$;

alter table public.web_push_subscriptions
  enable row level security;

alter table public.push_notification_preferences
  enable row level security;

alter table public.push_delivery_attempts
  enable row level security;

alter table public.system_announcements
  enable row level security;

drop policy if exists
  web_push_subscriptions_select_own
on public.web_push_subscriptions;

create policy
  web_push_subscriptions_select_own
on public.web_push_subscriptions
for select
to authenticated
using (
  user_id = auth.uid()
);

drop policy if exists
  web_push_subscriptions_manage_own
on public.web_push_subscriptions;

create policy
  web_push_subscriptions_manage_own
on public.web_push_subscriptions
for all
to authenticated
using (
  user_id = auth.uid()
)
with check (
  user_id = auth.uid()
  and public.is_organization_member(
    organization_id
  )
);

drop policy if exists
  push_preferences_select_own
on public.push_notification_preferences;

create policy
  push_preferences_select_own
on public.push_notification_preferences
for select
to authenticated
using (
  user_id = auth.uid()
);

drop policy if exists
  push_preferences_manage_own
on public.push_notification_preferences;

create policy
  push_preferences_manage_own
on public.push_notification_preferences
for all
to authenticated
using (
  user_id = auth.uid()
)
with check (
  user_id = auth.uid()
  and public.is_organization_member(
    organization_id
  )
);

drop policy if exists
  push_delivery_attempts_select
on public.push_delivery_attempts;

create policy
  push_delivery_attempts_select
on public.push_delivery_attempts
for select
to authenticated
using (
  user_id = auth.uid()
  or public.can_manage_organization(
    organization_id
  )
);

drop policy if exists
  system_announcements_select
on public.system_announcements;

create policy
  system_announcements_select
on public.system_announcements
for select
to authenticated
using (
  public.is_organization_member(
    organization_id
  )
);

drop policy if exists
  system_announcements_manage
on public.system_announcements;

create policy
  system_announcements_manage
on public.system_announcements
for all
to authenticated
using (
  public.can_manage_organization(
    organization_id
  )
)
with check (
  public.can_manage_organization(
    organization_id
  )
);

grant select, insert, update, delete
on public.web_push_subscriptions,
   public.push_notification_preferences,
   public.system_announcements
to authenticated;

grant select
on public.push_delivery_attempts
to authenticated;

revoke all
on function
  public.ensure_my_push_preferences_v1(uuid),
  public.register_my_web_push_subscription_v1(
    uuid,
    text,
    text,
    text,
    text,
    text,
    text
  ),
  public.disable_my_web_push_subscription_v1(text),
  public.push_category_enabled_v1(
    uuid,
    uuid,
    text
  ),
  public.queue_push_notification_v1(
    uuid,
    uuid,
    text,
    text,
    text,
    text,
    text,
    text,
    text,
    uuid,
    timestamptz
  ),
  public.queue_push_for_roles_v1(
    uuid,
    text[],
    text,
    text,
    text,
    text,
    text,
    text,
    text,
    uuid
  ),
  public.queue_push_for_all_members_v1(
    uuid,
    text,
    text,
    text,
    text,
    text,
    text
  ),
  public.prepare_scheduled_push_notifications_v1()
from public, anon;

grant execute
on function
  public.ensure_my_push_preferences_v1(uuid),
  public.register_my_web_push_subscription_v1(
    uuid,
    text,
    text,
    text,
    text,
    text,
    text
  ),
  public.disable_my_web_push_subscription_v1(text)
to authenticated;

grant execute
on function
  public.queue_push_notification_v1(
    uuid,
    uuid,
    text,
    text,
    text,
    text,
    text,
    text,
    text,
    uuid,
    timestamptz
  )
to service_role;

grant execute
on function
  public.push_category_enabled_v1(
    uuid,
    uuid,
    text
  ),
  public.queue_push_for_roles_v1(
    uuid,
    text[],
    text,
    text,
    text,
    text,
    text,
    text,
    text,
    uuid
  ),
  public.queue_push_for_all_members_v1(
    uuid,
    text,
    text,
    text,
    text,
    text,
    text
  ),
  public.prepare_scheduled_push_notifications_v1()
to service_role;

do $$
declare
  table_name text;
begin
  if to_regprocedure(
    'public.capture_audit_event()'
  ) is not null then
    foreach table_name in
      array array[
        'web_push_subscriptions',
        'push_notification_preferences',
        'system_announcements'
      ]
    loop
      execute format(
        'drop trigger if exists ativelo_capture_audit_event on public.%I',
        table_name
      );

      execute format(
        'create trigger ativelo_capture_audit_event after insert or update or delete on public.%I for each row execute function public.capture_audit_event()',
        table_name
      );
    end loop;
  end if;
end
$$;

commit;
