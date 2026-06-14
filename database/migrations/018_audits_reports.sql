-- ATIVELO - PACOTE 18
-- Auditorias fisicas e consolidacao de divergencias.

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

create table if not exists public.inventory_audits (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete cascade,
  name text not null,
  scope_type text not null default 'all'
    check (scope_type in ('all','unit')),
  scope_id uuid,
  status text not null default 'active'
    check (status in ('active','completed','canceled')),
  notes text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_by uuid
    references auth.users(id) on delete set null default auth.uid(),
  completed_by uuid
    references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (scope_type = 'all' and scope_id is null)
    or (scope_type = 'unit' and scope_id is not null)
  )
);

create table if not exists public.inventory_audit_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete cascade,
  audit_id uuid not null
    references public.inventory_audits(id) on delete cascade,
  asset_id uuid not null
    references public.assets(id) on delete restrict,
  expected boolean not null default true,
  status text not null default 'pending'
    check (
      status in (
        'pending',
        'found',
        'moved',
        'damaged',
        'missing',
        'unexpected'
      )
    ),
  expected_unit_id uuid
    references public.organization_units(id) on delete set null,
  observed_unit_id uuid
    references public.organization_units(id) on delete set null,
  expected_condition text,
  observed_condition text,
  scanned_by uuid
    references auth.users(id) on delete set null,
  scanned_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (audit_id, asset_id)
);

create index if not exists idx_inventory_audits_org
on public.inventory_audits(organization_id, status, created_at desc);

create index if not exists idx_inventory_audit_items_audit
on public.inventory_audit_items(audit_id, status);

create index if not exists idx_inventory_audit_items_asset
on public.inventory_audit_items(asset_id, created_at desc);

create or replace function public.ativelo_audit_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_inventory_audits_updated_at
on public.inventory_audits;
create trigger trg_inventory_audits_updated_at
before update on public.inventory_audits
for each row execute function public.ativelo_audit_updated_at();

drop trigger if exists trg_inventory_audit_items_updated_at
on public.inventory_audit_items;
create trigger trg_inventory_audit_items_updated_at
before update on public.inventory_audit_items
for each row execute function public.ativelo_audit_updated_at();

create or replace function public.create_inventory_audit(
  target_organization_id uuid,
  audit_name text,
  target_scope_type text default 'all',
  target_scope_id uuid default null,
  audit_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  new_audit_id uuid;
begin
  if not public.can_manage_organization(target_organization_id) then
    raise exception 'Acesso negado.';
  end if;

  if target_scope_type not in ('all','unit') then
    raise exception 'Abrangencia invalida.';
  end if;

  if target_scope_type = 'unit' and target_scope_id is null then
    raise exception 'Selecione a unidade.';
  end if;

  insert into public.inventory_audits (
    organization_id,
    name,
    scope_type,
    scope_id,
    notes
  )
  values (
    target_organization_id,
    btrim(audit_name),
    target_scope_type,
    target_scope_id,
    audit_notes
  )
  returning id into new_audit_id;

  insert into public.inventory_audit_items (
    organization_id,
    audit_id,
    asset_id,
    expected,
    status,
    expected_unit_id,
    expected_condition
  )
  select
    a.organization_id,
    new_audit_id,
    a.id,
    true,
    'pending',
    a.unit_id,
    a.physical_condition
  from public.assets a
  where a.organization_id = target_organization_id
    and a.is_active = true
    and (
      target_scope_type = 'all'
      or a.unit_id = target_scope_id
    );

  return new_audit_id;
end;
$$;

create or replace function public.scan_inventory_audit_asset(
  target_audit_id uuid,
  target_asset_id uuid,
  target_observed_unit_id uuid default null,
  target_observed_condition text default 'good',
  target_notes text default null
)
returns text
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  audit_record public.inventory_audits%rowtype;
  item_record public.inventory_audit_items%rowtype;
  asset_record public.assets%rowtype;
  resulting_status text;
begin
  select *
  into audit_record
  from public.inventory_audits
  where id = target_audit_id;

  if not found then
    raise exception 'Auditoria nao encontrada.';
  end if;

  if audit_record.status <> 'active' then
    raise exception 'A auditoria nao esta em andamento.';
  end if;

  if not public.is_organization_member(audit_record.organization_id) then
    raise exception 'Acesso negado.';
  end if;

  select *
  into asset_record
  from public.assets
  where id = target_asset_id
    and organization_id = audit_record.organization_id
    and is_active = true;

  if not found then
    raise exception 'Equipamento nao encontrado nesta empresa.';
  end if;

  select *
  into item_record
  from public.inventory_audit_items
  where audit_id = target_audit_id
    and asset_id = target_asset_id;

  if not found then
    insert into public.inventory_audit_items (
      organization_id,
      audit_id,
      asset_id,
      expected,
      status,
      expected_unit_id,
      observed_unit_id,
      expected_condition,
      observed_condition,
      scanned_by,
      scanned_at,
      notes
    )
    values (
      audit_record.organization_id,
      target_audit_id,
      target_asset_id,
      false,
      'unexpected',
      asset_record.unit_id,
      target_observed_unit_id,
      asset_record.physical_condition,
      target_observed_condition,
      auth.uid(),
      now(),
      target_notes
    );

    return 'unexpected';
  end if;

  if target_observed_condition in ('poor','irrecoverable')
    and item_record.expected_condition not in ('poor','irrecoverable')
  then
    resulting_status := 'damaged';
  elsif item_record.expected_unit_id is distinct from target_observed_unit_id
    and target_observed_unit_id is not null
  then
    resulting_status := 'moved';
  else
    resulting_status := 'found';
  end if;

  update public.inventory_audit_items
  set
    status = resulting_status,
    observed_unit_id = target_observed_unit_id,
    observed_condition = target_observed_condition,
    scanned_by = auth.uid(),
    scanned_at = now(),
    notes = target_notes
  where id = item_record.id;

  return resulting_status;
end;
$$;

create or replace function public.complete_inventory_audit(
  target_audit_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  audit_record public.inventory_audits%rowtype;
begin
  select *
  into audit_record
  from public.inventory_audits
  where id = target_audit_id;

  if not found then
    raise exception 'Auditoria nao encontrada.';
  end if;

  if not public.can_manage_organization(audit_record.organization_id) then
    raise exception 'Acesso negado.';
  end if;

  update public.inventory_audit_items
  set status = 'missing'
  where audit_id = target_audit_id
    and status = 'pending';

  update public.inventory_audits
  set
    status = 'completed',
    completed_at = now(),
    completed_by = auth.uid()
  where id = target_audit_id;
end;
$$;

grant execute on function public.create_inventory_audit(
  uuid,
  text,
  text,
  uuid,
  text
) to authenticated;

grant execute on function public.scan_inventory_audit_asset(
  uuid,
  uuid,
  uuid,
  text,
  text
) to authenticated;

grant execute on function public.complete_inventory_audit(uuid)
to authenticated;

alter table public.inventory_audits enable row level security;
alter table public.inventory_audit_items enable row level security;

drop policy if exists inventory_audits_select_member
on public.inventory_audits;
create policy inventory_audits_select_member
on public.inventory_audits
for select to authenticated
using (public.is_organization_member(organization_id));

drop policy if exists inventory_audits_manage_admin
on public.inventory_audits;
create policy inventory_audits_manage_admin
on public.inventory_audits
for all to authenticated
using (public.can_manage_organization(organization_id))
with check (public.can_manage_organization(organization_id));

drop policy if exists inventory_audit_items_select_member
on public.inventory_audit_items;
create policy inventory_audit_items_select_member
on public.inventory_audit_items
for select to authenticated
using (public.is_organization_member(organization_id));

drop policy if exists inventory_audit_items_manage_member
on public.inventory_audit_items;
create policy inventory_audit_items_manage_member
on public.inventory_audit_items
for all to authenticated
using (public.is_organization_member(organization_id))
with check (public.is_organization_member(organization_id));

grant select, insert, update, delete
on public.inventory_audits to authenticated;

grant select, insert, update, delete
on public.inventory_audit_items to authenticated;

create or replace view public.inventory_audit_summary
with (security_invoker = true)
as
select
  a.id as audit_id,
  a.organization_id,
  a.name,
  a.status,
  a.scope_type,
  a.scope_id,
  a.started_at,
  a.completed_at,
  count(i.id) as total_items,
  count(i.id) filter (where i.status = 'pending') as pending_items,
  count(i.id) filter (where i.status = 'found') as found_items,
  count(i.id) filter (where i.status = 'moved') as moved_items,
  count(i.id) filter (where i.status = 'damaged') as damaged_items,
  count(i.id) filter (where i.status = 'missing') as missing_items,
  count(i.id) filter (where i.status = 'unexpected') as unexpected_items
from public.inventory_audits a
left join public.inventory_audit_items i
  on i.audit_id = a.id
group by a.id;

grant select on public.inventory_audit_summary to authenticated;

commit;
