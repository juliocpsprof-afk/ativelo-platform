-- ATIVELO - PACOTE 15
-- Descoberta de rede, inventario por agente e pre-cadastro automatico.

begin;

create extension if not exists pgcrypto;

do $$
begin
  if to_regclass('public.assets') is null then
    raise exception 'Tabela public.assets nao encontrada. Execute o Pacote 07.';
  end if;

  if to_regprocedure('public.is_organization_member(uuid)') is null then
    raise exception 'Funcao public.is_organization_member(uuid) nao encontrada.';
  end if;

  if to_regprocedure('public.can_manage_organization(uuid)') is null then
    raise exception 'Funcao public.can_manage_organization(uuid) nao encontrada.';
  end if;
end
$$;

create table if not exists public.agent_enrollment_tokens (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  label text not null,
  token_hash text not null unique,
  expires_at timestamptz not null,
  max_uses integer not null default 100 check (max_uses > 0),
  used_count integer not null default 0 check (used_count >= 0),
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.inventory_agents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  asset_id uuid references public.assets(id) on delete set null,
  device_uid text not null,
  hostname text not null,
  agent_version text,
  os_name text,
  os_version text,
  architecture text,
  manufacturer text,
  model text,
  serial_number text,
  last_ip inet,
  status text not null default 'online'
    check (status in ('online','offline','disabled')),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, device_uid)
);

create table if not exists public.agent_inventory_snapshots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  agent_id uuid not null references public.inventory_agents(id) on delete cascade,
  collected_at timestamptz not null default now(),
  hardware jsonb not null default '{}'::jsonb,
  software jsonb not null default '{}'::jsonb,
  network jsonb not null default '{}'::jsonb,
  raw_payload jsonb not null default '{}'::jsonb
);

create table if not exists public.network_scans (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  scanner_device_id text,
  subnet text,
  status text not null default 'completed'
    check (status in ('running','completed','failed')),
  discovered_count integer not null default 0,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.discovered_devices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  linked_asset_id uuid references public.assets(id) on delete set null,
  last_scan_id uuid references public.network_scans(id) on delete set null,
  fingerprint text not null,
  ip_address inet,
  mac_address macaddr,
  hostname text,
  vendor text,
  device_type text,
  open_ports integer[] not null default '{}'::integer[],
  source text not null default 'network_scan'
    check (source in ('network_scan','agent','manual_import')),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, fingerprint)
);

create index if not exists idx_agent_tokens_organization
on public.agent_enrollment_tokens(organization_id, is_active, expires_at);

create index if not exists idx_inventory_agents_organization
on public.inventory_agents(organization_id, last_seen_at desc);

create index if not exists idx_inventory_agents_asset
on public.inventory_agents(asset_id);

create index if not exists idx_agent_snapshots_agent
on public.agent_inventory_snapshots(agent_id, collected_at desc);

create index if not exists idx_network_scans_organization
on public.network_scans(organization_id, started_at desc);

create index if not exists idx_discovered_devices_organization
on public.discovered_devices(organization_id, last_seen_at desc);

create index if not exists idx_discovered_devices_asset
on public.discovered_devices(linked_asset_id);

create or replace function public.ativelo_network_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_agent_tokens_updated_at
on public.agent_enrollment_tokens;
create trigger trg_agent_tokens_updated_at
before update on public.agent_enrollment_tokens
for each row execute function public.ativelo_network_updated_at();

drop trigger if exists trg_inventory_agents_updated_at
on public.inventory_agents;
create trigger trg_inventory_agents_updated_at
before update on public.inventory_agents
for each row execute function public.ativelo_network_updated_at();

drop trigger if exists trg_discovered_devices_updated_at
on public.discovered_devices;
create trigger trg_discovered_devices_updated_at
before update on public.discovered_devices
for each row execute function public.ativelo_network_updated_at();

create or replace function public.create_agent_enrollment_token(
  target_organization_id uuid,
  token_label text,
  valid_days integer default 30,
  max_token_uses integer default 100
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  raw_token text;
  token_id uuid;
  token_expiration timestamptz;
begin
  if not public.can_manage_organization(target_organization_id) then
    raise exception 'Acesso negado.';
  end if;

  if valid_days < 1 or valid_days > 365 then
    raise exception 'A validade deve estar entre 1 e 365 dias.';
  end if;

  if max_token_uses < 1 or max_token_uses > 10000 then
    raise exception 'A quantidade maxima de usos e invalida.';
  end if;

  raw_token := 'atl_' || encode(gen_random_bytes(24), 'hex');
  token_expiration := now() + make_interval(days => valid_days);

  insert into public.agent_enrollment_tokens (
    organization_id,
    label,
    token_hash,
    expires_at,
    max_uses
  )
  values (
    target_organization_id,
    coalesce(nullif(btrim(token_label), ''), 'Agentes'),
    encode(digest(raw_token, 'sha256'), 'hex'),
    token_expiration,
    max_token_uses
  )
  returning id into token_id;

  return jsonb_build_object(
    'id', token_id,
    'token', raw_token,
    'expires_at', token_expiration
  );
end;
$$;

grant execute on function public.create_agent_enrollment_token(
  uuid,
  text,
  integer,
  integer
) to authenticated;

create or replace function public.resolve_agent_token(
  raw_token text
)
returns table (
  token_id uuid,
  organization_id uuid,
  max_uses integer,
  used_count integer
)
language sql
security definer
stable
set search_path = public, extensions
as $$
  select
    t.id,
    t.organization_id,
    t.max_uses,
    t.used_count
  from public.agent_enrollment_tokens t
  where t.token_hash = encode(digest(raw_token, 'sha256'), 'hex')
    and t.is_active = true
    and t.expires_at > now()
    and t.used_count < t.max_uses
  limit 1;
$$;

revoke all on function public.resolve_agent_token(text) from public;
revoke all on function public.resolve_agent_token(text) from authenticated;
grant execute on function public.resolve_agent_token(text) to service_role;

create or replace function public.ingest_agent_payload(
  raw_token text,
  payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  token_record record;
  existing_agent_id uuid;
  agent_record_id uuid;
  linked_asset_id uuid;
  device_uid_value text;
  hostname_value text;
  serial_value text;
  manufacturer_value text;
  model_value text;
  os_name_value text;
  os_version_value text;
  architecture_value text;
  ip_value text;
  mac_value text;
begin
  select *
  into token_record
  from public.resolve_agent_token(raw_token);

  if not found then
    raise exception 'Token de agente invalido, expirado ou esgotado.';
  end if;

  device_uid_value := nullif(btrim(payload ->> 'device_uid'), '');
  hostname_value := coalesce(
    nullif(btrim(payload #>> '{system,hostname}'), ''),
    nullif(btrim(payload ->> 'hostname'), '')
  );
  serial_value := nullif(btrim(payload #>> '{system,serial_number}'), '');
  manufacturer_value := nullif(btrim(payload #>> '{system,manufacturer}'), '');
  model_value := nullif(btrim(payload #>> '{system,model}'), '');
  os_name_value := nullif(btrim(payload #>> '{system,os_name}'), '');
  os_version_value := nullif(btrim(payload #>> '{system,os_version}'), '');
  architecture_value := nullif(btrim(payload #>> '{system,architecture}'), '');
  ip_value := nullif(btrim(payload #>> '{system,last_ip}'), '');
  mac_value := nullif(btrim(payload #>> '{network,primary_mac}'), '');

  if device_uid_value is null or hostname_value is null then
    raise exception 'Payload do agente incompleto.';
  end if;

  select a.id
  into existing_agent_id
  from public.inventory_agents a
  where a.organization_id = token_record.organization_id
    and a.device_uid = device_uid_value;

  if serial_value is not null then
    select a.id
    into linked_asset_id
    from public.assets a
    where a.organization_id = token_record.organization_id
      and (
        lower(a.serial_number) = lower(serial_value)
        or lower(a.service_tag) = lower(serial_value)
      )
    order by a.created_at
    limit 1;
  end if;

  if linked_asset_id is null and hostname_value is not null then
    select a.id
    into linked_asset_id
    from public.assets a
    where a.organization_id = token_record.organization_id
      and lower(a.hostname) = lower(hostname_value)
    order by a.created_at
    limit 1;
  end if;

  insert into public.inventory_agents (
    organization_id,
    asset_id,
    device_uid,
    hostname,
    agent_version,
    os_name,
    os_version,
    architecture,
    manufacturer,
    model,
    serial_number,
    last_ip,
    status,
    last_seen_at,
    metadata
  )
  values (
    token_record.organization_id,
    linked_asset_id,
    device_uid_value,
    hostname_value,
    nullif(btrim(payload ->> 'agent_version'), ''),
    os_name_value,
    os_version_value,
    architecture_value,
    manufacturer_value,
    model_value,
    serial_value,
    case
      when ip_value ~ '^[0-9a-fA-F:.]+$' then ip_value::inet
      else null
    end,
    'online',
    now(),
    coalesce(payload -> 'metadata', '{}'::jsonb)
  )
  on conflict (organization_id, device_uid)
  do update set
    asset_id = coalesce(public.inventory_agents.asset_id, excluded.asset_id),
    hostname = excluded.hostname,
    agent_version = excluded.agent_version,
    os_name = excluded.os_name,
    os_version = excluded.os_version,
    architecture = excluded.architecture,
    manufacturer = excluded.manufacturer,
    model = excluded.model,
    serial_number = excluded.serial_number,
    last_ip = excluded.last_ip,
    status = 'online',
    last_seen_at = now(),
    metadata = excluded.metadata
  returning id, asset_id
  into agent_record_id, linked_asset_id;

  if existing_agent_id is null then
    update public.agent_enrollment_tokens
    set used_count = used_count + 1
    where id = token_record.token_id;
  end if;

  insert into public.agent_inventory_snapshots (
    organization_id,
    agent_id,
    collected_at,
    hardware,
    software,
    network,
    raw_payload
  )
  values (
    token_record.organization_id,
    agent_record_id,
    coalesce(
      nullif(payload ->> 'collected_at', '')::timestamptz,
      now()
    ),
    coalesce(payload -> 'hardware', '{}'::jsonb),
    coalesce(payload -> 'software', '{}'::jsonb),
    coalesce(payload -> 'network', '{}'::jsonb),
    payload
  );

  if linked_asset_id is not null then
    update public.assets a
    set
      hostname = coalesce(hostname_value, a.hostname),
      ip_address = case
        when ip_value ~ '^[0-9a-fA-F:.]+$' then ip_value::inet
        else a.ip_address
      end,
      mac_address = case
        when mac_value ~ '^([0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}$'
          then replace(mac_value, '-', ':')::macaddr
        else a.mac_address
      end,
      operating_system = coalesce(
        nullif(concat_ws(' ', os_name_value, os_version_value), ''),
        a.operating_system
      ),
      specifications = coalesce(a.specifications, '{}'::jsonb)
        || jsonb_build_object(
          'agent_hardware', coalesce(payload -> 'hardware', '{}'::jsonb),
          'agent_software', coalesce(payload -> 'software', '{}'::jsonb),
          'agent_last_collection', now()
        )
    where a.id = linked_asset_id
      and a.organization_id = token_record.organization_id;
  end if;

  return jsonb_build_object(
    'agent_id', agent_record_id,
    'asset_id', linked_asset_id,
    'organization_id', token_record.organization_id
  );
end;
$$;

revoke all on function public.ingest_agent_payload(text, jsonb) from public;
revoke all on function public.ingest_agent_payload(text, jsonb) from authenticated;
grant execute on function public.ingest_agent_payload(text, jsonb) to service_role;

create or replace function public.ingest_network_scan(
  raw_token text,
  payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  token_record record;
  scan_id uuid;
  device jsonb;
  device_fingerprint text;
  device_ip text;
  device_mac text;
  device_hostname text;
  matched_asset_id uuid;
  inserted_count integer := 0;
begin
  select *
  into token_record
  from public.resolve_agent_token(raw_token);

  if not found then
    raise exception 'Token de scanner invalido, expirado ou esgotado.';
  end if;

  insert into public.network_scans (
    organization_id,
    scanner_device_id,
    subnet,
    status,
    discovered_count,
    started_at,
    completed_at,
    raw_payload
  )
  values (
    token_record.organization_id,
    nullif(payload ->> 'scanner_device_id', ''),
    nullif(payload ->> 'subnet', ''),
    'completed',
    jsonb_array_length(coalesce(payload -> 'devices', '[]'::jsonb)),
    coalesce(nullif(payload ->> 'started_at', '')::timestamptz, now()),
    coalesce(nullif(payload ->> 'completed_at', '')::timestamptz, now()),
    payload
  )
  returning id into scan_id;

  for device in
    select value
    from jsonb_array_elements(coalesce(payload -> 'devices', '[]'::jsonb))
  loop
    device_ip := nullif(btrim(device ->> 'ip_address'), '');
    device_mac := nullif(btrim(device ->> 'mac_address'), '');
    device_hostname := nullif(btrim(device ->> 'hostname'), '');
    device_fingerprint := coalesce(
      nullif(btrim(device ->> 'fingerprint'), ''),
      device_mac,
      device_hostname || ':' || device_ip,
      device_ip
    );

    if device_fingerprint is null then
      continue;
    end if;

    matched_asset_id := null;

    if device_mac is not null
      and device_mac ~ '^([0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}$'
    then
      select a.id
      into matched_asset_id
      from public.assets a
      where a.organization_id = token_record.organization_id
        and a.mac_address = replace(device_mac, '-', ':')::macaddr
      limit 1;
    end if;

    if matched_asset_id is null and device_hostname is not null then
      select a.id
      into matched_asset_id
      from public.assets a
      where a.organization_id = token_record.organization_id
        and lower(a.hostname) = lower(device_hostname)
      limit 1;
    end if;

    insert into public.discovered_devices (
      organization_id,
      linked_asset_id,
      last_scan_id,
      fingerprint,
      ip_address,
      mac_address,
      hostname,
      vendor,
      device_type,
      open_ports,
      source,
      first_seen_at,
      last_seen_at,
      metadata
    )
    values (
      token_record.organization_id,
      matched_asset_id,
      scan_id,
      device_fingerprint,
      case
        when device_ip ~ '^[0-9a-fA-F:.]+$' then device_ip::inet
        else null
      end,
      case
        when device_mac ~ '^([0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}$'
          then replace(device_mac, '-', ':')::macaddr
        else null
      end,
      device_hostname,
      nullif(btrim(device ->> 'vendor'), ''),
      nullif(btrim(device ->> 'device_type'), ''),
      coalesce(
        array(
          select jsonb_array_elements_text(
            coalesce(device -> 'open_ports', '[]'::jsonb)
          )::integer
        ),
        '{}'::integer[]
      ),
      'network_scan',
      now(),
      now(),
      coalesce(device -> 'metadata', '{}'::jsonb)
    )
    on conflict (organization_id, fingerprint)
    do update set
      linked_asset_id = coalesce(
        public.discovered_devices.linked_asset_id,
        excluded.linked_asset_id
      ),
      last_scan_id = excluded.last_scan_id,
      ip_address = excluded.ip_address,
      mac_address = excluded.mac_address,
      hostname = excluded.hostname,
      vendor = excluded.vendor,
      device_type = excluded.device_type,
      open_ports = excluded.open_ports,
      last_seen_at = now(),
      metadata = excluded.metadata;

    inserted_count := inserted_count + 1;
  end loop;

  return jsonb_build_object(
    'scan_id', scan_id,
    'discovered_count', inserted_count,
    'organization_id', token_record.organization_id
  );
end;
$$;

revoke all on function public.ingest_network_scan(text, jsonb) from public;
revoke all on function public.ingest_network_scan(text, jsonb) from authenticated;
grant execute on function public.ingest_network_scan(text, jsonb) to service_role;

create or replace function public.mark_offline_inventory_agents()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  affected_count integer;
begin
  update public.inventory_agents
  set status = 'offline'
  where status = 'online'
    and last_seen_at < now() - interval '24 hours';

  get diagnostics affected_count = row_count;
  return affected_count;
end;
$$;

revoke all on function public.mark_offline_inventory_agents() from public;
grant execute on function public.mark_offline_inventory_agents() to service_role;

alter table public.agent_enrollment_tokens enable row level security;
alter table public.inventory_agents enable row level security;
alter table public.agent_inventory_snapshots enable row level security;
alter table public.network_scans enable row level security;
alter table public.discovered_devices enable row level security;

drop policy if exists agent_tokens_select_manager
on public.agent_enrollment_tokens;
create policy agent_tokens_select_manager
on public.agent_enrollment_tokens
for select to authenticated
using (public.can_manage_organization(organization_id));

drop policy if exists agent_tokens_update_manager
on public.agent_enrollment_tokens;
create policy agent_tokens_update_manager
on public.agent_enrollment_tokens
for update to authenticated
using (public.can_manage_organization(organization_id))
with check (public.can_manage_organization(organization_id));

drop policy if exists inventory_agents_select_member
on public.inventory_agents;
create policy inventory_agents_select_member
on public.inventory_agents
for select to authenticated
using (public.is_organization_member(organization_id));

drop policy if exists inventory_agents_manage_admin
on public.inventory_agents;
create policy inventory_agents_manage_admin
on public.inventory_agents
for update to authenticated
using (public.can_manage_organization(organization_id))
with check (public.can_manage_organization(organization_id));

drop policy if exists agent_snapshots_select_member
on public.agent_inventory_snapshots;
create policy agent_snapshots_select_member
on public.agent_inventory_snapshots
for select to authenticated
using (public.is_organization_member(organization_id));

drop policy if exists network_scans_select_member
on public.network_scans;
create policy network_scans_select_member
on public.network_scans
for select to authenticated
using (public.is_organization_member(organization_id));

drop policy if exists discovered_devices_select_member
on public.discovered_devices;
create policy discovered_devices_select_member
on public.discovered_devices
for select to authenticated
using (public.is_organization_member(organization_id));

drop policy if exists discovered_devices_manage_admin
on public.discovered_devices;
create policy discovered_devices_manage_admin
on public.discovered_devices
for update to authenticated
using (public.can_manage_organization(organization_id))
with check (public.can_manage_organization(organization_id));

grant select, update on public.agent_enrollment_tokens to authenticated;
grant select, update on public.inventory_agents to authenticated;
grant select on public.agent_inventory_snapshots to authenticated;
grant select on public.network_scans to authenticated;
grant select, update on public.discovered_devices to authenticated;

create or replace view public.network_inventory_summary
with (security_invoker = true)
as
select
  o.id as organization_id,
  (
    select count(*)
    from public.inventory_agents a
    where a.organization_id = o.id
  ) as total_agents,
  (
    select count(*)
    from public.inventory_agents a
    where a.organization_id = o.id
      and a.last_seen_at >= now() - interval '24 hours'
  ) as online_agents,
  (
    select count(*)
    from public.inventory_agents a
    where a.organization_id = o.id
      and a.asset_id is null
  ) as unlinked_agents,
  (
    select count(*)
    from public.discovered_devices d
    where d.organization_id = o.id
      and d.linked_asset_id is null
  ) as unlinked_discovered_devices
from public.organizations o;

grant select on public.network_inventory_summary to authenticated;

commit;
