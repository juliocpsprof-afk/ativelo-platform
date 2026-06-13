-- ATIVELO - PACOTE 03 CORRIGIDO
-- Estrutura geogrÃ¡fica e localizaÃ§Ãµes
-- CompatÃ­vel com organization_memberships criada no Pacote 02.

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
set search_path = ''
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

alter table public.organization_units enable row level security;
alter table public.buildings enable row level security;
alter table public.floors enable row level security;
alter table public.departments enable row level security;
alter table public.rooms enable row level security;
alter table public.racks enable row level security;
alter table public.workstations enable row level security;

drop policy if exists units_select_member on public.organization_units;
create policy units_select_member
on public.organization_units
for select
to authenticated
using (public.is_organization_member(organization_id));

drop policy if exists units_insert_manager on public.organization_units;
create policy units_insert_manager
on public.organization_units
for insert
to authenticated
with check (public.can_manage_organization(organization_id));

drop policy if exists units_update_manager on public.organization_units;
create policy units_update_manager
on public.organization_units
for update
to authenticated
using (public.can_manage_organization(organization_id))
with check (public.can_manage_organization(organization_id));

drop policy if exists units_delete_manager on public.organization_units;
create policy units_delete_manager
on public.organization_units
for delete
to authenticated
using (public.can_manage_organization(organization_id));

drop policy if exists buildings_select_member on public.buildings;
create policy buildings_select_member
on public.buildings
for select
to authenticated
using (public.is_organization_member(organization_id));

drop policy if exists buildings_insert_manager on public.buildings;
create policy buildings_insert_manager
on public.buildings
for insert
to authenticated
with check (public.can_manage_organization(organization_id));

drop policy if exists buildings_update_manager on public.buildings;
create policy buildings_update_manager
on public.buildings
for update
to authenticated
using (public.can_manage_organization(organization_id))
with check (public.can_manage_organization(organization_id));

drop policy if exists buildings_delete_manager on public.buildings;
create policy buildings_delete_manager
on public.buildings
for delete
to authenticated
using (public.can_manage_organization(organization_id));

drop policy if exists floors_select_member on public.floors;
create policy floors_select_member
on public.floors
for select
to authenticated
using (public.is_organization_member(organization_id));

drop policy if exists floors_insert_manager on public.floors;
create policy floors_insert_manager
on public.floors
for insert
to authenticated
with check (public.can_manage_organization(organization_id));

drop policy if exists floors_update_manager on public.floors;
create policy floors_update_manager
on public.floors
for update
to authenticated
using (public.can_manage_organization(organization_id))
with check (public.can_manage_organization(organization_id));

drop policy if exists floors_delete_manager on public.floors;
create policy floors_delete_manager
on public.floors
for delete
to authenticated
using (public.can_manage_organization(organization_id));

drop policy if exists departments_select_member on public.departments;
create policy departments_select_member
on public.departments
for select
to authenticated
using (public.is_organization_member(organization_id));

drop policy if exists departments_insert_manager on public.departments;
create policy departments_insert_manager
on public.departments
for insert
to authenticated
with check (public.can_manage_organization(organization_id));

drop policy if exists departments_update_manager on public.departments;
create policy departments_update_manager
on public.departments
for update
to authenticated
using (public.can_manage_organization(organization_id))
with check (public.can_manage_organization(organization_id));

drop policy if exists departments_delete_manager on public.departments;
create policy departments_delete_manager
on public.departments
for delete
to authenticated
using (public.can_manage_organization(organization_id));

drop policy if exists rooms_select_member on public.rooms;
create policy rooms_select_member
on public.rooms
for select
to authenticated
using (public.is_organization_member(organization_id));

drop policy if exists rooms_insert_manager on public.rooms;
create policy rooms_insert_manager
on public.rooms
for insert
to authenticated
with check (public.can_manage_organization(organization_id));

drop policy if exists rooms_update_manager on public.rooms;
create policy rooms_update_manager
on public.rooms
for update
to authenticated
using (public.can_manage_organization(organization_id))
with check (public.can_manage_organization(organization_id));

drop policy if exists rooms_delete_manager on public.rooms;
create policy rooms_delete_manager
on public.rooms
for delete
to authenticated
using (public.can_manage_organization(organization_id));

drop policy if exists racks_select_member on public.racks;
create policy racks_select_member
on public.racks
for select
to authenticated
using (public.is_organization_member(organization_id));

drop policy if exists racks_insert_manager on public.racks;
create policy racks_insert_manager
on public.racks
for insert
to authenticated
with check (public.can_manage_organization(organization_id));

drop policy if exists racks_update_manager on public.racks;
create policy racks_update_manager
on public.racks
for update
to authenticated
using (public.can_manage_organization(organization_id))
with check (public.can_manage_organization(organization_id));

drop policy if exists racks_delete_manager on public.racks;
create policy racks_delete_manager
on public.racks
for delete
to authenticated
using (public.can_manage_organization(organization_id));

drop policy if exists workstations_select_member on public.workstations;
create policy workstations_select_member
on public.workstations
for select
to authenticated
using (public.is_organization_member(organization_id));

drop policy if exists workstations_insert_manager on public.workstations;
create policy workstations_insert_manager
on public.workstations
for insert
to authenticated
with check (public.can_manage_organization(organization_id));

drop policy if exists workstations_update_manager on public.workstations;
create policy workstations_update_manager
on public.workstations
for update
to authenticated
using (public.can_manage_organization(organization_id))
with check (public.can_manage_organization(organization_id));

drop policy if exists workstations_delete_manager on public.workstations;
create policy workstations_delete_manager
on public.workstations
for delete
to authenticated
using (public.can_manage_organization(organization_id));

grant select, insert, update, delete on public.organization_units to authenticated;
grant select, insert, update, delete on public.buildings to authenticated;
grant select, insert, update, delete on public.floors to authenticated;
grant select, insert, update, delete on public.departments to authenticated;
grant select, insert, update, delete on public.rooms to authenticated;
grant select, insert, update, delete on public.racks to authenticated;
grant select, insert, update, delete on public.workstations to authenticated;

create or replace view public.location_hierarchy
with (security_invoker = true)
as
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
  concat_ws(' > ', u.name, b.name, f.name, r.name) as full_location
from public.organization_units u
left join public.buildings b on b.unit_id = u.id
left join public.floors f on f.building_id = b.id
left join public.rooms r on r.floor_id = f.id
left join public.departments d on d.id = r.department_id;

grant select on public.location_hierarchy to authenticated;

commit;
