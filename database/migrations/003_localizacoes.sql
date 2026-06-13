-- ATIVELO - PACOTE 03
-- Estrutura geogrÃ¡fica e localizaÃ§Ãµes
-- Execute este arquivo no SQL Editor do Supabase.

begin;

create extension if not exists pgcrypto;

create table if not exists public.organization_units (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  code text,
  description text,
  phone text,
  email text,
  postal_code text,
  street text,
  street_number text,
  complement text,
  district text,
  city text,
  state text,
  country text not null default 'Brasil',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name)
);

create table if not exists public.buildings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  unit_id uuid not null references public.organization_units(id) on delete cascade,
  name text not null,
  code text,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (unit_id, name)
);

create table if not exists public.floors (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  building_id uuid not null references public.buildings(id) on delete cascade,
  name text not null,
  floor_order integer not null default 0,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (building_id, name)
);

create table if not exists public.departments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  unit_id uuid references public.organization_units(id) on delete set null,
  name text not null,
  code text,
  description text,
  manager_user_id uuid references auth.users(id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name)
);

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  floor_id uuid not null references public.floors(id) on delete cascade,
  department_id uuid references public.departments(id) on delete set null,
  name text not null,
  code text,
  description text,
  capacity integer,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (floor_id, name)
);

create table if not exists public.racks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  room_id uuid not null references public.rooms(id) on delete cascade,
  name text not null,
  code text,
  rack_units integer,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (room_id, name)
);

create table if not exists public.workstations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  room_id uuid not null references public.rooms(id) on delete cascade,
  name text not null,
  code text,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (room_id, name)
);

create index if not exists idx_units_organization on public.organization_units(organization_id);
create index if not exists idx_buildings_unit on public.buildings(unit_id);
create index if not exists idx_floors_building on public.floors(building_id);
create index if not exists idx_departments_organization on public.departments(organization_id);
create index if not exists idx_rooms_floor on public.rooms(floor_id);
create index if not exists idx_rooms_department on public.rooms(department_id);
create index if not exists idx_racks_room on public.racks(room_id);
create index if not exists idx_workstations_room on public.workstations(room_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_units_updated_at on public.organization_units;
create trigger trg_units_updated_at
before update on public.organization_units
for each row execute function public.set_updated_at();

drop trigger if exists trg_buildings_updated_at on public.buildings;
create trigger trg_buildings_updated_at
before update on public.buildings
for each row execute function public.set_updated_at();

drop trigger if exists trg_floors_updated_at on public.floors;
create trigger trg_floors_updated_at
before update on public.floors
for each row execute function public.set_updated_at();

drop trigger if exists trg_departments_updated_at on public.departments;
create trigger trg_departments_updated_at
before update on public.departments
for each row execute function public.set_updated_at();

drop trigger if exists trg_rooms_updated_at on public.rooms;
create trigger trg_rooms_updated_at
before update on public.rooms
for each row execute function public.set_updated_at();

drop trigger if exists trg_racks_updated_at on public.racks;
create trigger trg_racks_updated_at
before update on public.racks
for each row execute function public.set_updated_at();

drop trigger if exists trg_workstations_updated_at on public.workstations;
create trigger trg_workstations_updated_at
before update on public.workstations
for each row execute function public.set_updated_at();

-- Retorna as organizaÃ§Ãµes Ã s quais o usuÃ¡rio autenticado pertence.
create or replace function public.current_user_organization_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select om.organization_id
  from public.organization_members om
  where om.user_id = auth.uid()
    and coalesce(om.is_active, true) = true;
$$;

grant execute on function public.current_user_organization_ids() to authenticated;

alter table public.organization_units enable row level security;
alter table public.buildings enable row level security;
alter table public.floors enable row level security;
alter table public.departments enable row level security;
alter table public.rooms enable row level security;
alter table public.racks enable row level security;
alter table public.workstations enable row level security;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'organization_units',
    'buildings',
    'floors',
    'departments',
    'rooms',
    'racks',
    'workstations'
  ]
  loop
    execute format('drop policy if exists "organization members can view %1$s" on public.%1$I', table_name);
    execute format(
      'create policy "organization members can view %1$s"
       on public.%1$I for select
       to authenticated
       using (organization_id in (select public.current_user_organization_ids()))',
      table_name
    );

    execute format('drop policy if exists "organization members can insert %1$s" on public.%1$I', table_name);
    execute format(
      'create policy "organization members can insert %1$s"
       on public.%1$I for insert
       to authenticated
       with check (organization_id in (select public.current_user_organization_ids()))',
      table_name
    );

    execute format('drop policy if exists "organization members can update %1$s" on public.%1$I', table_name);
    execute format(
      'create policy "organization members can update %1$s"
       on public.%1$I for update
       to authenticated
       using (organization_id in (select public.current_user_organization_ids()))
       with check (organization_id in (select public.current_user_organization_ids()))',
      table_name
    );

    execute format('drop policy if exists "organization members can delete %1$s" on public.%1$I', table_name);
    execute format(
      'create policy "organization members can delete %1$s"
       on public.%1$I for delete
       to authenticated
       using (organization_id in (select public.current_user_organization_ids()))',
      table_name
    );
  end loop;
end
$$;

create or replace view public.location_hierarchy as
select
  u.organization_id,
  u.id as unit_id,
  u.name as unit_name,
  b.id as building_id,
  b.name as building_name,
  f.id as floor_id,
  f.name as floor_name,
  r.id as room_id,
  r.name as room_name,
  d.id as department_id,
  d.name as department_name,
  concat_ws(
    ' > ',
    u.name,
    b.name,
    f.name,
    r.name
  ) as full_location
from public.organization_units u
left join public.buildings b on b.unit_id = u.id
left join public.floors f on f.building_id = b.id
left join public.rooms r on r.floor_id = f.id
left join public.departments d on d.id = r.department_id;

grant select on public.location_hierarchy to authenticated;

commit;
