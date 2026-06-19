begin;

create extension if not exists pgcrypto
with schema extensions;

alter table public.inventory_agents
  add column if not exists unit_id uuid
    references public.organization_units(id)
    on delete set null,
  add column if not exists policy_id uuid,
  add column if not exists mode text
    not null default 'equipment',
  add column if not exists credential_hash text,
  add column if not exists credential_expires_at timestamptz,
  add column if not exists credential_rotated_at timestamptz,
  add column if not exists credential_grace_until timestamptz,
  add column if not exists service_status text
    not null default 'unknown',
  add column if not exists capabilities jsonb
    not null default '{}'::jsonb,
  add column if not exists last_heartbeat_at timestamptz,
  add column if not exists next_heartbeat_at timestamptz,
  add column if not exists last_inventory_at timestamptz,
  add column if not exists next_inventory_at timestamptz,
  add column if not exists last_quick_scan_at timestamptz,
  add column if not exists next_quick_scan_at timestamptz,
  add column if not exists last_full_scan_at timestamptz,
  add column if not exists next_full_scan_at timestamptz,
  add column if not exists consecutive_failures integer
    not null default 0,
  add column if not exists last_error text,
  add column if not exists paused_at timestamptz,
  add column if not exists revoked_at timestamptz,
  add column if not exists revocation_reason text,
  add column if not exists installed_at timestamptz
    not null default now(),
  add column if not exists updated_at timestamptz
    not null default now();

alter table public.inventory_agents
  drop constraint if exists
    inventory_agents_status_check;

alter table public.inventory_agents
  drop constraint if exists
    inventory_agents_status_check_v2;

alter table public.inventory_agents
  add constraint
    inventory_agents_status_check_v2
  check (
    status in (
      'online',
      'offline',
      'disabled',
      'paused',
      'revoked',
      'unknown'
    )
  );
create unique index if not exists
  inventory_agents_org_device_uid_unique
on public.inventory_agents(
  organization_id,
  device_uid
);

create table if not exists public.agent_policies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id)
    on delete cascade,
  name text not null default 'Política padrão',
  is_default boolean not null default true,
  heartbeat_minutes integer not null default 15
    check (heartbeat_minutes between 5 and 1440),
  inventory_hours integer not null default 24
    check (inventory_hours between 1 and 720),
  quick_scan_days integer not null default 7
    check (quick_scan_days between 1 and 90),
  full_scan_days integer not null default 30
    check (full_scan_days between 1 and 365),
  credential_days integer not null default 90
    check (credential_days between 7 and 365),
  credential_grace_days integer not null default 7
    check (credential_grace_days between 1 and 30),
  offline_minutes integer not null default 60
    check (offline_minutes between 15 and 10080),
  jitter_minutes integer not null default 15
    check (jitter_minutes between 0 and 120),
  max_hosts_per_scan integer not null default 1024
    check (max_hosts_per_scan between 1 and 4096),
  inventory_enabled boolean not null default true,
  network_scan_enabled boolean not null default true,
  allowed_cidrs cidr[] not null default '{}'::cidr[],
  minimum_agent_version text,
  created_by uuid
    references auth.users(id)
    on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists
  agent_policies_default_org_idx
on public.agent_policies(organization_id)
where is_default = true;

alter table public.inventory_agents
  drop constraint if exists inventory_agents_policy_id_fkey;

alter table public.inventory_agents
  add constraint inventory_agents_policy_id_fkey
  foreign key (policy_id)
  references public.agent_policies(id)
  on delete set null;

create table if not exists public.agent_pairing_codes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id)
    on delete cascade,
  policy_id uuid
    references public.agent_policies(id)
    on delete set null,
  label text not null,
  token_hash text not null unique,
  allowed_modes text[] not null
    default array['equipment','scanner','hybrid']::text[],
  expires_at timestamptz not null,
  max_uses integer not null default 1,
  used_count integer not null default 0,
  is_active boolean not null default true,
  created_by uuid
    references auth.users(id)
    on delete set null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

create table if not exists public.agent_commands (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id)
    on delete cascade,
  agent_id uuid not null
    references public.inventory_agents(id)
    on delete cascade,
  command_type text not null,
  status text not null default 'pending',
  payload jsonb not null default '{}'::jsonb,
  requested_by uuid
    references auth.users(id)
    on delete set null,
  requested_at timestamptz not null default now(),
  scheduled_at timestamptz not null default now(),
  expires_at timestamptz not null
    default (now() + interval '7 days'),
  delivered_at timestamptz,
  completed_at timestamptz,
  result_message text,
  error_message text
);

create index if not exists
  agent_commands_delivery_idx
on public.agent_commands(
  agent_id,
  status,
  scheduled_at
);

create table if not exists public.agent_runs (
  id uuid primary key,
  organization_id uuid not null
    references public.organizations(id)
    on delete cascade,
  agent_id uuid not null
    references public.inventory_agents(id)
    on delete cascade,
  command_id uuid
    references public.agent_commands(id)
    on delete set null,
  run_type text not null,
  status text not null default 'running',
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  duration_ms bigint,
  discovered_count integer not null default 0,
  changes_count integer not null default 0,
  summary jsonb not null default '{}'::jsonb,
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists
  agent_runs_org_started_idx
on public.agent_runs(
  organization_id,
  started_at desc
);

alter table public.agent_policies enable row level security;
alter table public.agent_pairing_codes enable row level security;
alter table public.agent_commands enable row level security;
alter table public.agent_runs enable row level security;

revoke all
on public.agent_policies,
   public.agent_pairing_codes,
   public.agent_commands,
   public.agent_runs
from anon;

grant select
on public.agent_policies,
   public.agent_pairing_codes,
   public.agent_commands,
   public.agent_runs
to authenticated;

grant insert, update
on public.agent_policies
to authenticated;

create or replace function public.agent_has_membership(
  p_organization_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, auth, pg_catalog, pg_temp
as $$
  select exists (
    select 1
    from public.organization_memberships membership
    where
      membership.organization_id = p_organization_id
      and membership.user_id = (select auth.uid())
      and membership.is_active = true
  );
$$;

create or replace function public.agent_can_manage(
  p_organization_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, auth, pg_catalog, pg_temp
as $$
  select exists (
    select 1
    from public.organization_memberships membership
    where
      membership.organization_id = p_organization_id
      and membership.user_id = (select auth.uid())
      and membership.is_active = true
      and membership.role in ('owner','admin','it_manager')
  );
$$;

revoke all
on function public.agent_has_membership(uuid),
   public.agent_can_manage(uuid)
from public, anon;

grant execute
on function public.agent_has_membership(uuid),
   public.agent_can_manage(uuid)
to authenticated;

drop policy if exists "members read agent policies"
on public.agent_policies;

create policy "members read agent policies"
on public.agent_policies
for select
to authenticated
using (public.agent_has_membership(organization_id));

drop policy if exists "managers write agent policies"
on public.agent_policies;

create policy "managers write agent policies"
on public.agent_policies
for all
to authenticated
using (public.agent_can_manage(organization_id))
with check (public.agent_can_manage(organization_id));

drop policy if exists "members read pairing codes"
on public.agent_pairing_codes;

create policy "members read pairing codes"
on public.agent_pairing_codes
for select
to authenticated
using (public.agent_has_membership(organization_id));

drop policy if exists "members read commands"
on public.agent_commands;

create policy "members read commands"
on public.agent_commands
for select
to authenticated
using (public.agent_has_membership(organization_id));

drop policy if exists "members read runs"
on public.agent_runs;

create policy "members read runs"
on public.agent_runs
for select
to authenticated
using (public.agent_has_membership(organization_id));

create or replace function public.ensure_default_agent_policy_v2(
  p_organization_id uuid
)
returns public.agent_policies
language plpgsql
security definer
set search_path = public, auth, extensions, pg_catalog, pg_temp
as $$
declare
  policy_row public.agent_policies%rowtype;
begin
  if not public.agent_can_manage(p_organization_id) then
    raise exception 'agent_policy_access_denied';
  end if;

  select *
  into policy_row
  from public.agent_policies
  where
    organization_id = p_organization_id
    and is_default = true
  limit 1;

  if policy_row.id is null then
    insert into public.agent_policies(
      organization_id,
      created_by
    )
    values(
      p_organization_id,
      auth.uid()
    )
    returning *
    into policy_row;
  end if;

  return policy_row;
end;
$$;

create or replace function public.create_agent_pairing_code_v2(
  p_organization_id uuid,
  p_label text,
  p_valid_hours integer,
  p_max_uses integer,
  p_allowed_modes text[]
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, extensions, pg_catalog, pg_temp
as $$
declare
  plain_token text;
  policy_row public.agent_policies%rowtype;
  code_row public.agent_pairing_codes%rowtype;
begin
  if not public.agent_can_manage(p_organization_id) then
    raise exception 'agent_pairing_access_denied';
  end if;

  select *
  into policy_row
  from public.ensure_default_agent_policy_v2(p_organization_id);

  plain_token :=
    'ATV-' ||
    upper(
      encode(
        extensions.gen_random_bytes(18),
        'hex'
      )
    );

  insert into public.agent_pairing_codes(
    organization_id,
    policy_id,
    label,
    token_hash,
    allowed_modes,
    expires_at,
    max_uses,
    created_by
  )
  values(
    p_organization_id,
    policy_row.id,
    left(coalesce(nullif(btrim(p_label),''),'Instalação'),120),
    encode(
      extensions.digest(plain_token,'sha256'),
      'hex'
    ),
    coalesce(
      p_allowed_modes,
      array['equipment','scanner','hybrid']::text[]
    ),
    now() + make_interval(
      hours => greatest(1, least(coalesce(p_valid_hours,24),168))
    ),
    greatest(1, least(coalesce(p_max_uses,1),500)),
    auth.uid()
  )
  returning *
  into code_row;

  return jsonb_build_object(
    'id', code_row.id,
    'token', plain_token,
    'expiresAt', code_row.expires_at,
    'maxUses', code_row.max_uses,
    'allowedModes', code_row.allowed_modes,
    'policyId', code_row.policy_id
  );
end;
$$;

create or replace function public.agent_configuration_v2(
  p_agent_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = public, auth, pg_catalog, pg_temp
as $$
  select jsonb_build_object(
    'heartbeatMinutes', coalesce(policy.heartbeat_minutes,15),
    'inventoryHours', coalesce(policy.inventory_hours,24),
    'quickScanDays', coalesce(policy.quick_scan_days,7),
    'fullScanDays', coalesce(policy.full_scan_days,30),
    'credentialDays', coalesce(policy.credential_days,90),
    'credentialGraceDays', coalesce(policy.credential_grace_days,7),
    'offlineMinutes', coalesce(policy.offline_minutes,60),
    'jitterMinutes', coalesce(policy.jitter_minutes,15),
    'maxHostsPerScan', coalesce(policy.max_hosts_per_scan,1024),
    'inventoryEnabled', coalesce(policy.inventory_enabled,true),
    'networkScanEnabled', coalesce(policy.network_scan_enabled,true),
    'allowedCidrs', coalesce(to_jsonb(policy.allowed_cidrs),'[]'::jsonb),
    'minimumAgentVersion', policy.minimum_agent_version
  )
  from public.inventory_agents agent
  left join public.agent_policies policy
    on policy.id = agent.policy_id
  where agent.id = p_agent_id;
$$;

create or replace function public.enroll_inventory_agent_v2(
  p_token text,
  p_secret_hash text,
  p_device_uid text,
  p_hostname text,
  p_agent_version text,
  p_os_name text,
  p_os_version text,
  p_architecture text,
  p_mode text,
  p_capabilities jsonb,
  p_ip text
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, extensions, pg_catalog, pg_temp
as $$
declare
  code_row public.agent_pairing_codes%rowtype;
  policy_row public.agent_policies%rowtype;
  agent_row public.inventory_agents%rowtype;
begin
  if
    p_secret_hash !~ '^[0-9a-f]{64}$'
    or length(coalesce(p_device_uid,'')) < 6
  then
    raise exception 'invalid_agent_enrollment';
  end if;

  select *
  into code_row
  from public.agent_pairing_codes
  where
    token_hash = encode(
      extensions.digest(p_token,'sha256'),
      'hex'
    )
    and is_active = true
    and expires_at > now()
    and used_count < max_uses
  for update;

  if code_row.id is null then
    raise exception 'invalid_or_expired_pairing_code';
  end if;

  select *
  into policy_row
  from public.agent_policies
  where id = code_row.policy_id;

  select *
  into agent_row
  from public.inventory_agents
  where
    organization_id = code_row.organization_id
    and device_uid = left(btrim(p_device_uid),200)
  for update;

  if agent_row.id is null then
    insert into public.inventory_agents(
      organization_id,
      policy_id,
      device_uid,
      hostname,
      agent_version,
      os_name,
      os_version,
      architecture,
      last_ip,
      status,
      mode,
      credential_hash,
      credential_expires_at,
      credential_grace_until,
      service_status,
      capabilities,
      first_seen_at,
      last_seen_at,
      last_heartbeat_at,
      next_inventory_at,
      next_quick_scan_at,
      next_full_scan_at
    )
    values(
      code_row.organization_id,
      code_row.policy_id,
      left(btrim(p_device_uid),200),
      left(coalesce(nullif(btrim(p_hostname),''),'Computador sem nome'),200),
      left(p_agent_version,60),
      left(p_os_name,160),
      left(p_os_version,160),
      left(p_architecture,60),
      nullif(p_ip,'')::inet,
      'online',
      case
        when p_mode = any(code_row.allowed_modes)
        then p_mode
        else code_row.allowed_modes[1]
      end,
      p_secret_hash,
      now() + make_interval(days => coalesce(policy_row.credential_days,90)),
      now() + make_interval(days =>
        coalesce(policy_row.credential_days,90) +
        coalesce(policy_row.credential_grace_days,7)
      ),
      'installed',
      coalesce(p_capabilities,'{}'::jsonb),
      now(),
      now(),
      now(),
      now(),
      now(),
      now()
    )
    returning *
    into agent_row;
  else
    update public.inventory_agents
    set
      policy_id = code_row.policy_id,
      hostname = left(coalesce(nullif(btrim(p_hostname),''),hostname),200),
      agent_version = left(p_agent_version,60),
      os_name = left(p_os_name,160),
      os_version = left(p_os_version,160),
      architecture = left(p_architecture,60),
      last_ip = nullif(p_ip,'')::inet,
      status = 'online',
      credential_hash = p_secret_hash,
      credential_expires_at =
        now() + make_interval(days => coalesce(policy_row.credential_days,90)),
      credential_grace_until =
        now() + make_interval(days =>
          coalesce(policy_row.credential_days,90) +
          coalesce(policy_row.credential_grace_days,7)
        ),
      service_status = 'installed',
      capabilities = coalesce(p_capabilities,'{}'::jsonb),
      last_seen_at = now(),
      last_heartbeat_at = now(),
      paused_at = null,
      revoked_at = null,
      revocation_reason = null,
      consecutive_failures = 0,
      last_error = null,
      next_inventory_at = now(),
      next_quick_scan_at = now(),
      next_full_scan_at = now(),
      updated_at = now()
    where id = agent_row.id
    returning *
    into agent_row;
  end if;

  update public.agent_pairing_codes
  set
    used_count = used_count + 1,
    last_used_at = now(),
    is_active = case
      when used_count + 1 >= max_uses
      then false
      else is_active
    end
  where id = code_row.id;

  insert into public.agent_commands(
    organization_id,
    agent_id,
    command_type
  )
  values(
    agent_row.organization_id,
    agent_row.id,
    'initial_inventory'
  );

  return jsonb_build_object(
    'agentId', agent_row.id,
    'organizationId', agent_row.organization_id,
    'credentialExpiresAt', agent_row.credential_expires_at,
    'configuration', public.agent_configuration_v2(agent_row.id)
  );
end;
$$;

create or replace function public.authenticate_inventory_agent_v2(
  p_agent_id uuid,
  p_secret_hash text
)
returns public.inventory_agents
language plpgsql
stable
security definer
set search_path = public, auth, pg_catalog, pg_temp
as $$
declare
  agent_row public.inventory_agents%rowtype;
begin
  select *
  into agent_row
  from public.inventory_agents
  where
    id = p_agent_id
    and credential_hash = p_secret_hash
    and revoked_at is null
    and (
      credential_grace_until is null
      or credential_grace_until > now()
    );

  if agent_row.id is null then
    raise exception 'agent_authentication_failed';
  end if;

  return agent_row;
end;
$$;

create or replace function public.agent_heartbeat_v2(
  p_agent_id uuid,
  p_secret_hash text,
  p_agent_version text,
  p_service_status text,
  p_capabilities jsonb,
  p_ip text,
  p_last_error text
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_catalog, pg_temp
as $$
declare
  agent_row public.inventory_agents%rowtype;
  configuration jsonb;
  commands jsonb;
  heartbeat_minutes integer;
begin
  select *
  into agent_row
  from public.authenticate_inventory_agent_v2(
    p_agent_id,
    p_secret_hash
  );

  configuration := public.agent_configuration_v2(agent_row.id);
  heartbeat_minutes :=
    coalesce((configuration->>'heartbeatMinutes')::integer,15);

  update public.inventory_agents
  set
    agent_version = left(coalesce(nullif(p_agent_version,''),agent_version),60),
    service_status = left(coalesce(nullif(p_service_status,''),service_status),60),
    capabilities = coalesce(p_capabilities,capabilities),
    last_ip = coalesce(nullif(p_ip,'')::inet,last_ip),
    status = case when paused_at is null then 'online' else 'paused' end,
    last_seen_at = now(),
    last_heartbeat_at = now(),
    next_heartbeat_at = now() + make_interval(mins => heartbeat_minutes),
    consecutive_failures =
      case when p_last_error is null then 0 else consecutive_failures + 1 end,
    last_error = left(p_last_error,1000),
    updated_at = now()
  where id = agent_row.id
  returning *
  into agent_row;

  with picked as (
    select id
    from public.agent_commands
    where
      agent_id = agent_row.id
      and status = 'pending'
      and scheduled_at <= now()
      and expires_at > now()
    order by requested_at
    limit 20
    for update skip locked
  ),
  delivered as (
    update public.agent_commands command
    set
      status = 'delivered',
      delivered_at = now()
    where command.id in (select id from picked)
    returning
      command.id,
      command.command_type,
      command.payload,
      command.requested_at,
      command.expires_at
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id',id,
        'type',command_type,
        'payload',payload,
        'requestedAt',requested_at,
        'expiresAt',expires_at
      )
      order by requested_at
    ),
    '[]'::jsonb
  )
  into commands
  from delivered;

  return jsonb_build_object(
    'agentId', agent_row.id,
    'serverTime', now(),
    'status', agent_row.status,
    'credentialExpiresAt', agent_row.credential_expires_at,
    'rotateCredential',
      agent_row.credential_expires_at is null
      or agent_row.credential_expires_at < now() + interval '7 days',
    'configuration', configuration,
    'commands', commands
  );
end;
$$;

create or replace function public.request_agent_command_v2(
  p_organization_id uuid,
  p_agent_id uuid,
  p_command_type text
)
returns uuid
language plpgsql
security definer
set search_path = public, auth, pg_catalog, pg_temp
as $$
declare
  command_id uuid;
begin
  if not public.agent_can_manage(p_organization_id) then
    raise exception 'agent_command_access_denied';
  end if;

  if p_command_type not in (
    'initial_inventory',
    'inventory_now',
    'quick_scan',
    'full_scan',
    'refresh_configuration',
    'rotate_credential',
    'update_agent',
    'pause_agent',
    'resume_agent',
    'uninstall_agent'
  ) then
    raise exception 'invalid_agent_command';
  end if;

  insert into public.agent_commands(
    organization_id,
    agent_id,
    command_type,
    requested_by
  )
  select
    p_organization_id,
    id,
    p_command_type,
    auth.uid()
  from public.inventory_agents
  where
    id = p_agent_id
    and organization_id = p_organization_id
    and revoked_at is null
  returning id
  into command_id;

  if command_id is null then
    raise exception 'agent_not_found';
  end if;

  return command_id;
end;
$$;

create or replace function public.revoke_inventory_agent_v2(
  p_organization_id uuid,
  p_agent_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public, auth, pg_catalog, pg_temp
as $$
begin
  if not public.agent_can_manage(p_organization_id) then
    raise exception 'agent_revoke_access_denied';
  end if;

  update public.inventory_agents
  set
    status = 'revoked',
    revoked_at = now(),
    revocation_reason =
      left(coalesce(nullif(btrim(p_reason),''),'Revogado pelo painel'),500),
    credential_hash = null,
    credential_expires_at = null,
    credential_grace_until = null,
    updated_at = now()
  where
    id = p_agent_id
    and organization_id = p_organization_id;

  update public.agent_commands
  set status = 'canceled'
  where
    agent_id = p_agent_id
    and status in ('pending','delivered','running');
end;
$$;

revoke all
on function
  public.ensure_default_agent_policy_v2(uuid),
  public.create_agent_pairing_code_v2(uuid,text,integer,integer,text[]),
  public.agent_configuration_v2(uuid),
  public.enroll_inventory_agent_v2(
    text,text,text,text,text,text,text,text,text,jsonb,text
  ),
  public.authenticate_inventory_agent_v2(uuid,text),
  public.agent_heartbeat_v2(uuid,text,text,text,jsonb,text,text),
  public.request_agent_command_v2(uuid,uuid,text),
  public.revoke_inventory_agent_v2(uuid,uuid,text)
from public;

grant execute
on function
  public.ensure_default_agent_policy_v2(uuid),
  public.create_agent_pairing_code_v2(uuid,text,integer,integer,text[]),
  public.request_agent_command_v2(uuid,uuid,text),
  public.revoke_inventory_agent_v2(uuid,uuid,text)
to authenticated;

grant execute
on function
  public.enroll_inventory_agent_v2(
    text,text,text,text,text,text,text,text,text,jsonb,text
  ),
  public.agent_heartbeat_v2(uuid,text,text,text,jsonb,text,text)
to anon;

do $$
declare
  table_name text;
begin
  if to_regprocedure('public.capture_audit_event()') is not null then
    foreach table_name in
      array array[
        'agent_policies',
        'agent_pairing_codes',
        'agent_commands',
        'agent_runs'
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
end;
$$;

commit;