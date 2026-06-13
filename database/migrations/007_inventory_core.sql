-- ATIVELO - PACOTE 07
-- Nucleo do inventario de ativos de TI
-- Execute no SQL Editor do Supabase.

begin;

create extension if not exists pgcrypto;

do $$
begin
  if to_regclass('public.organizations') is null then
    raise exception 'Tabela public.organizations nao encontrada. Execute o Pacote 02.';
  end if;

  if to_regclass('public.organization_units') is null then
    raise exception 'Tabela public.organization_units nao encontrada. Execute o Pacote 03.';
  end if;

  if to_regprocedure('public.is_organization_member(uuid)') is null then
    raise exception 'Funcao public.is_organization_member(uuid) nao encontrada.';
  end if;

  if to_regprocedure('public.can_manage_organization(uuid)') is null then
    raise exception 'Funcao public.can_manage_organization(uuid) nao encontrada.';
  end if;
end
$$;

create table if not exists public.asset_categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  code text,
  description text,
  icon_name text,
  specification_schema jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name)
);

create table if not exists public.manufacturers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  website text,
  support_url text,
  support_phone text,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name)
);

create table if not exists public.asset_models (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  category_id uuid not null references public.asset_categories(id) on delete restrict,
  manufacturer_id uuid references public.manufacturers(id) on delete set null,
  name text not null,
  model_number text,
  part_number text,
  description text,
  expected_life_months integer,
  default_warranty_months integer,
  default_specifications jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, category_id, name)
);

create table if not exists public.assets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  public_id uuid not null default gen_random_uuid(),
  qr_token uuid not null default gen_random_uuid(),

  asset_number text not null,
  legacy_asset_number text,
  barcode_value text,
  serial_number text,
  service_tag text,
  product_number text,
  sku text,

  category_id uuid not null references public.asset_categories(id) on delete restrict,
  manufacturer_id uuid references public.manufacturers(id) on delete set null,
  model_id uuid references public.asset_models(id) on delete set null,

  name text not null,
  description text,
  source text not null default 'manual'
    check (source in (
      'manual',
      'label_scan',
      'network_discovery',
      'agent',
      'spreadsheet_import',
      'api'
    )),

  lifecycle_stage text not null default 'received'
    check (lifecycle_stage in (
      'requested',
      'purchased',
      'received',
      'stock',
      'prepared',
      'deployed',
      'operational',
      'replacement',
      'withdrawn',
      'disposed'
    )),

  operational_status text not null default 'available'
    check (operational_status in (
      'available',
      'in_use',
      'reserved',
      'loaned',
      'in_maintenance',
      'awaiting_part',
      'defective',
      'lost',
      'stolen',
      'not_found',
      'retired',
      'disposed'
    )),

  physical_condition text not null default 'good'
    check (physical_condition in (
      'new',
      'excellent',
      'good',
      'fair',
      'poor',
      'irrecoverable'
    )),

  criticality text not null default 'medium'
    check (criticality in (
      'low',
      'medium',
      'high',
      'critical'
    )),

  unit_id uuid references public.organization_units(id) on delete set null,
  building_id uuid references public.buildings(id) on delete set null,
  floor_id uuid references public.floors(id) on delete set null,
  department_id uuid references public.departments(id) on delete set null,
  room_id uuid references public.rooms(id) on delete set null,
  rack_id uuid references public.racks(id) on delete set null,
  workstation_id uuid references public.workstations(id) on delete set null,

  assigned_user_id uuid references auth.users(id) on delete set null,
  assigned_person_name text,
  assigned_person_email text,
  assigned_at timestamptz,

  hostname text,
  ip_address inet,
  mac_address macaddr,
  operating_system text,

  specifications jsonb not null default '{}'::jsonb,

  supplier_name text,
  invoice_number text,
  purchase_order_number text,
  purchase_date date,
  acquisition_value numeric(14,2),
  currency_code char(3) not null default 'BRL',
  cost_center text,

  warranty_start_date date,
  warranty_end_date date,
  warranty_provider text,
  warranty_notes text,

  manufacture_date date,
  deployment_date date,
  expected_replacement_date date,
  retirement_date date,
  disposal_date date,
  disposal_reason text,

  notes text,
  is_active boolean not null default true,

  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (organization_id, asset_number),
  unique (public_id),
  unique (qr_token)
);

create unique index if not exists uq_assets_serial_per_organization
on public.assets (organization_id, lower(serial_number))
where serial_number is not null and btrim(serial_number) <> '';

create unique index if not exists uq_assets_service_tag_per_organization
on public.assets (organization_id, lower(service_tag))
where service_tag is not null and btrim(service_tag) <> '';

create unique index if not exists uq_assets_mac_per_organization
on public.assets (organization_id, mac_address)
where mac_address is not null;

create table if not exists public.asset_status_history (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  asset_id uuid not null references public.assets(id) on delete cascade,

  previous_lifecycle_stage text,
  new_lifecycle_stage text,
  previous_operational_status text,
  new_operational_status text,
  previous_physical_condition text,
  new_physical_condition text,

  reason text,
  changed_by uuid references auth.users(id) on delete set null default auth.uid(),
  changed_at timestamptz not null default now()
);

create table if not exists public.asset_location_history (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  asset_id uuid not null references public.assets(id) on delete cascade,

  previous_unit_id uuid references public.organization_units(id) on delete set null,
  new_unit_id uuid references public.organization_units(id) on delete set null,
  previous_building_id uuid references public.buildings(id) on delete set null,
  new_building_id uuid references public.buildings(id) on delete set null,
  previous_floor_id uuid references public.floors(id) on delete set null,
  new_floor_id uuid references public.floors(id) on delete set null,
  previous_department_id uuid references public.departments(id) on delete set null,
  new_department_id uuid references public.departments(id) on delete set null,
  previous_room_id uuid references public.rooms(id) on delete set null,
  new_room_id uuid references public.rooms(id) on delete set null,
  previous_rack_id uuid references public.racks(id) on delete set null,
  new_rack_id uuid references public.racks(id) on delete set null,
  previous_workstation_id uuid references public.workstations(id) on delete set null,
  new_workstation_id uuid references public.workstations(id) on delete set null,

  reason text,
  moved_by uuid references auth.users(id) on delete set null default auth.uid(),
  moved_at timestamptz not null default now()
);

create index if not exists idx_asset_categories_organization
on public.asset_categories(organization_id);

create index if not exists idx_manufacturers_organization
on public.manufacturers(organization_id);

create index if not exists idx_asset_models_organization
on public.asset_models(organization_id);

create index if not exists idx_asset_models_category
on public.asset_models(category_id);

create index if not exists idx_assets_organization
on public.assets(organization_id);

create index if not exists idx_assets_category
on public.assets(category_id);

create index if not exists idx_assets_model
on public.assets(model_id);

create index if not exists idx_assets_status
on public.assets(organization_id, operational_status);

create index if not exists idx_assets_location
on public.assets(organization_id, unit_id, building_id, floor_id, room_id);

create index if not exists idx_asset_status_history_asset
on public.asset_status_history(asset_id, changed_at desc);

create index if not exists idx_asset_location_history_asset
on public.asset_location_history(asset_id, moved_at desc);

create or replace function public.ativelo_set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();

  if tg_table_name = 'assets' then
    new.updated_by = auth.uid();
  end if;

  return new;
end;
$$;

drop trigger if exists trg_asset_categories_updated_at on public.asset_categories;
create trigger trg_asset_categories_updated_at
before update on public.asset_categories
for each row execute function public.ativelo_set_updated_at();

drop trigger if exists trg_manufacturers_updated_at on public.manufacturers;
create trigger trg_manufacturers_updated_at
before update on public.manufacturers
for each row execute function public.ativelo_set_updated_at();

drop trigger if exists trg_asset_models_updated_at on public.asset_models;
create trigger trg_asset_models_updated_at
before update on public.asset_models
for each row execute function public.ativelo_set_updated_at();

drop trigger if exists trg_assets_updated_at on public.assets;
create trigger trg_assets_updated_at
before update on public.assets
for each row execute function public.ativelo_set_updated_at();

create or replace function public.ativelo_log_asset_changes()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.asset_status_history (
      organization_id,
      asset_id,
      previous_lifecycle_stage,
      new_lifecycle_stage,
      previous_operational_status,
      new_operational_status,
      previous_physical_condition,
      new_physical_condition,
      reason,
      changed_by
    )
    values (
      new.organization_id,
      new.id,
      null,
      new.lifecycle_stage,
      null,
      new.operational_status,
      null,
      new.physical_condition,
      'Cadastro inicial do ativo',
      auth.uid()
    );

    if
      new.unit_id is not null
      or new.building_id is not null
      or new.floor_id is not null
      or new.department_id is not null
      or new.room_id is not null
      or new.rack_id is not null
      or new.workstation_id is not null
    then
      insert into public.asset_location_history (
        organization_id,
        asset_id,
        new_unit_id,
        new_building_id,
        new_floor_id,
        new_department_id,
        new_room_id,
        new_rack_id,
        new_workstation_id,
        reason,
        moved_by
      )
      values (
        new.organization_id,
        new.id,
        new.unit_id,
        new.building_id,
        new.floor_id,
        new.department_id,
        new.room_id,
        new.rack_id,
        new.workstation_id,
        'Localizacao inicial do ativo',
        auth.uid()
      );
    end if;

    return new;
  end if;

  if
    old.lifecycle_stage is distinct from new.lifecycle_stage
    or old.operational_status is distinct from new.operational_status
    or old.physical_condition is distinct from new.physical_condition
  then
    insert into public.asset_status_history (
      organization_id,
      asset_id,
      previous_lifecycle_stage,
      new_lifecycle_stage,
      previous_operational_status,
      new_operational_status,
      previous_physical_condition,
      new_physical_condition,
      reason,
      changed_by
    )
    values (
      new.organization_id,
      new.id,
      old.lifecycle_stage,
      new.lifecycle_stage,
      old.operational_status,
      new.operational_status,
      old.physical_condition,
      new.physical_condition,
      'Alteracao registrada pelo sistema',
      auth.uid()
    );
  end if;

  if
    old.unit_id is distinct from new.unit_id
    or old.building_id is distinct from new.building_id
    or old.floor_id is distinct from new.floor_id
    or old.department_id is distinct from new.department_id
    or old.room_id is distinct from new.room_id
    or old.rack_id is distinct from new.rack_id
    or old.workstation_id is distinct from new.workstation_id
  then
    insert into public.asset_location_history (
      organization_id,
      asset_id,
      previous_unit_id,
      new_unit_id,
      previous_building_id,
      new_building_id,
      previous_floor_id,
      new_floor_id,
      previous_department_id,
      new_department_id,
      previous_room_id,
      new_room_id,
      previous_rack_id,
      new_rack_id,
      previous_workstation_id,
      new_workstation_id,
      reason,
      moved_by
    )
    values (
      new.organization_id,
      new.id,
      old.unit_id,
      new.unit_id,
      old.building_id,
      new.building_id,
      old.floor_id,
      new.floor_id,
      old.department_id,
      new.department_id,
      old.room_id,
      new.room_id,
      old.rack_id,
      new.rack_id,
      old.workstation_id,
      new.workstation_id,
      'Movimentacao registrada pelo sistema',
      auth.uid()
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_assets_log_changes on public.assets;
create trigger trg_assets_log_changes
after insert or update on public.assets
for each row execute function public.ativelo_log_asset_changes();

alter table public.asset_categories enable row level security;
alter table public.manufacturers enable row level security;
alter table public.asset_models enable row level security;
alter table public.assets enable row level security;
alter table public.asset_status_history enable row level security;
alter table public.asset_location_history enable row level security;

drop policy if exists asset_categories_select_member on public.asset_categories;
create policy asset_categories_select_member
on public.asset_categories
for select
to authenticated
using (public.is_organization_member(organization_id));

drop policy if exists asset_categories_insert_manager on public.asset_categories;
create policy asset_categories_insert_manager
on public.asset_categories
for insert
to authenticated
with check (public.can_manage_organization(organization_id));

drop policy if exists asset_categories_update_manager on public.asset_categories;
create policy asset_categories_update_manager
on public.asset_categories
for update
to authenticated
using (public.can_manage_organization(organization_id))
with check (public.can_manage_organization(organization_id));

drop policy if exists asset_categories_delete_manager on public.asset_categories;
create policy asset_categories_delete_manager
on public.asset_categories
for delete
to authenticated
using (public.can_manage_organization(organization_id));

drop policy if exists manufacturers_select_member on public.manufacturers;
create policy manufacturers_select_member
on public.manufacturers
for select
to authenticated
using (public.is_organization_member(organization_id));

drop policy if exists manufacturers_insert_manager on public.manufacturers;
create policy manufacturers_insert_manager
on public.manufacturers
for insert
to authenticated
with check (public.can_manage_organization(organization_id));

drop policy if exists manufacturers_update_manager on public.manufacturers;
create policy manufacturers_update_manager
on public.manufacturers
for update
to authenticated
using (public.can_manage_organization(organization_id))
with check (public.can_manage_organization(organization_id));

drop policy if exists manufacturers_delete_manager on public.manufacturers;
create policy manufacturers_delete_manager
on public.manufacturers
for delete
to authenticated
using (public.can_manage_organization(organization_id));

drop policy if exists asset_models_select_member on public.asset_models;
create policy asset_models_select_member
on public.asset_models
for select
to authenticated
using (public.is_organization_member(organization_id));

drop policy if exists asset_models_insert_manager on public.asset_models;
create policy asset_models_insert_manager
on public.asset_models
for insert
to authenticated
with check (public.can_manage_organization(organization_id));

drop policy if exists asset_models_update_manager on public.asset_models;
create policy asset_models_update_manager
on public.asset_models
for update
to authenticated
using (public.can_manage_organization(organization_id))
with check (public.can_manage_organization(organization_id));

drop policy if exists asset_models_delete_manager on public.asset_models;
create policy asset_models_delete_manager
on public.asset_models
for delete
to authenticated
using (public.can_manage_organization(organization_id));

drop policy if exists assets_select_member on public.assets;
create policy assets_select_member
on public.assets
for select
to authenticated
using (public.is_organization_member(organization_id));

drop policy if exists assets_insert_manager on public.assets;
create policy assets_insert_manager
on public.assets
for insert
to authenticated
with check (public.can_manage_organization(organization_id));

drop policy if exists assets_update_manager on public.assets;
create policy assets_update_manager
on public.assets
for update
to authenticated
using (public.can_manage_organization(organization_id))
with check (public.can_manage_organization(organization_id));

drop policy if exists assets_delete_manager on public.assets;
create policy assets_delete_manager
on public.assets
for delete
to authenticated
using (public.can_manage_organization(organization_id));

drop policy if exists asset_status_history_select_member on public.asset_status_history;
create policy asset_status_history_select_member
on public.asset_status_history
for select
to authenticated
using (public.is_organization_member(organization_id));

drop policy if exists asset_location_history_select_member on public.asset_location_history;
create policy asset_location_history_select_member
on public.asset_location_history
for select
to authenticated
using (public.is_organization_member(organization_id));

grant select, insert, update, delete on public.asset_categories to authenticated;
grant select, insert, update, delete on public.manufacturers to authenticated;
grant select, insert, update, delete on public.asset_models to authenticated;
grant select, insert, update, delete on public.assets to authenticated;
grant select on public.asset_status_history to authenticated;
grant select on public.asset_location_history to authenticated;

create or replace view public.asset_inventory_view
with (security_invoker = true)
as
select
  a.id,
  a.organization_id,
  a.public_id,
  a.qr_token,
  a.asset_number,
  a.serial_number,
  a.service_tag,
  a.name,
  a.lifecycle_stage,
  a.operational_status,
  a.physical_condition,
  a.criticality,
  a.hostname,
  a.ip_address,
  a.mac_address,
  a.purchase_date,
  a.acquisition_value,
  a.warranty_end_date,
  a.expected_replacement_date,
  a.created_at,
  c.id as category_id,
  c.name as category_name,
  m.id as manufacturer_id,
  m.name as manufacturer_name,
  mo.id as model_id,
  mo.name as model_name,
  u.id as unit_id,
  u.name as unit_name,
  b.id as building_id,
  b.name as building_name,
  f.id as floor_id,
  f.name as floor_name,
  d.id as department_id,
  d.name as department_name,
  r.id as room_id,
  r.name as room_name,
  rk.id as rack_id,
  rk.name as rack_name,
  w.id as workstation_id,
  w.name as workstation_name,
  concat_ws(
    ' > ',
    u.name,
    b.name,
    f.name,
    r.name,
    w.name
  ) as full_location
from public.assets a
join public.asset_categories c on c.id = a.category_id
left join public.manufacturers m on m.id = a.manufacturer_id
left join public.asset_models mo on mo.id = a.model_id
left join public.organization_units u on u.id = a.unit_id
left join public.buildings b on b.id = a.building_id
left join public.floors f on f.id = a.floor_id
left join public.departments d on d.id = a.department_id
left join public.rooms r on r.id = a.room_id
left join public.racks rk on rk.id = a.rack_id
left join public.workstations w on w.id = a.workstation_id;

grant select on public.asset_inventory_view to authenticated;

commit;
