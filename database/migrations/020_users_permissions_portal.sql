-- ATIVELO - PACOTE 20
-- Usuarios, perfis de acesso e portal de autoatendimento.

begin;

create extension if not exists pgcrypto;

do $$
begin
  if to_regclass('public.organization_memberships') is null then
    raise exception 'Tabela public.organization_memberships nao encontrada.';
  end if;

  if to_regclass('public.profiles') is null then
    raise exception 'Tabela public.profiles nao encontrada.';
  end if;

  if to_regclass('public.assets') is null then
    raise exception 'Tabela public.assets nao encontrada.';
  end if;

  if to_regclass('public.support_tickets') is null then
    raise exception 'Tabela public.support_tickets nao encontrada.';
  end if;

  if to_regprocedure('public.organization_role(uuid)') is null then
    raise exception 'Funcao public.organization_role(uuid) nao encontrada.';
  end if;
end
$$;

alter table public.organization_memberships
  add column if not exists display_name text,
  add column if not exists employee_code text,
  add column if not exists job_title text,
  add column if not exists phone text,
  add column if not exists unit_id uuid
    references public.organization_units(id) on delete set null,
  add column if not exists department_id uuid
    references public.departments(id) on delete set null,
  add column if not exists notification_preference text
    not null default 'in_app',
  add column if not exists invited_by uuid
    references auth.users(id) on delete set null,
  add column if not exists invited_at timestamptz,
  add column if not exists last_access_at timestamptz;

alter table public.assets
  add column if not exists assigned_user_id uuid
    references auth.users(id) on delete set null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'organization_memberships_notification_preference_check'
      and conrelid = 'public.organization_memberships'::regclass
  ) then
    alter table public.organization_memberships
      add constraint organization_memberships_notification_preference_check
      check (
        notification_preference in (
          'in_app',
          'email',
          'whatsapp'
        )
      );
  end if;
end
$$;

create index if not exists idx_memberships_org_active_role
on public.organization_memberships (
  organization_id,
  is_active,
  role
);

create index if not exists idx_memberships_unit_department
on public.organization_memberships (
  organization_id,
  unit_id,
  department_id
);

create index if not exists idx_assets_assigned_user
on public.assets (
  organization_id,
  assigned_user_id
)
where assigned_user_id is not null;

update public.organization_memberships membership
set display_name = coalesce(
  nullif(btrim(membership.display_name), ''),
  nullif(btrim(profile.full_name), ''),
  profile.email,
  'Usuario'
)
from public.profiles profile
where profile.id = membership.user_id
  and (
    membership.display_name is null
    or btrim(membership.display_name) = ''
  );

create or replace function public.can_manage_organization_users(
  target_organization_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    public.organization_role(target_organization_id)
      in ('owner', 'admin'),
    false
  );
$$;

grant execute on function public.can_manage_organization_users(uuid)
to authenticated;

create or replace function public.list_organization_users(
  target_organization_id uuid
)
returns table (
  membership_id uuid,
  user_id uuid,
  email text,
  display_name text,
  role text,
  is_active boolean,
  joined_at timestamptz,
  employee_code text,
  job_title text,
  phone text,
  unit_id uuid,
  department_id uuid,
  notification_preference text,
  last_access_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
begin
  if not public.can_manage_organization_users(
    target_organization_id
  ) then
    raise exception 'Acesso negado.';
  end if;

  return query
  select
    membership.id,
    membership.user_id,
    profile.email,
    coalesce(
      nullif(btrim(membership.display_name), ''),
      nullif(btrim(profile.full_name), ''),
      profile.email,
      'Usuario'
    ),
    membership.role,
    membership.is_active,
    membership.joined_at,
    membership.employee_code,
    membership.job_title,
    membership.phone,
    membership.unit_id,
    membership.department_id,
    membership.notification_preference,
    membership.last_access_at
  from public.organization_memberships membership
  left join public.profiles profile
    on profile.id = membership.user_id
  where membership.organization_id =
    target_organization_id
  order by
    membership.is_active desc,
    coalesce(
      nullif(btrim(membership.display_name), ''),
      nullif(btrim(profile.full_name), ''),
      profile.email
    );
end;
$$;

grant execute on function public.list_organization_users(uuid)
to authenticated;

create or replace function public.get_my_assigned_assets(
  target_organization_id uuid
)
returns table (
  id uuid,
  asset_number text,
  name text,
  operational_status text,
  physical_condition text,
  category_id uuid,
  unit_name text,
  room_name text,
  serial_number text,
  public_id uuid,
  qr_token uuid
)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  current_email text;
begin
  if not public.is_organization_member(
    target_organization_id
  ) then
    raise exception 'Acesso negado.';
  end if;

  current_email := lower(
    coalesce(auth.jwt() ->> 'email', '')
  );

  return query
  select
    asset.id,
    asset.asset_number,
    asset.name,
    asset.operational_status,
    asset.physical_condition,
    asset.category_id,
    unit_record.name,
    room_record.name,
    asset.serial_number,
    asset.public_id,
    asset.qr_token
  from public.assets asset
  left join public.organization_units unit_record
    on unit_record.id = asset.unit_id
  left join public.rooms room_record
    on room_record.id = asset.room_id
  where asset.organization_id =
      target_organization_id
    and asset.is_active = true
    and (
      asset.assigned_user_id = auth.uid()
      or (
        current_email <> ''
        and lower(
          coalesce(asset.assigned_person_email, '')
        ) = current_email
      )
    )
  order by asset.asset_number;
end;
$$;

grant execute on function public.get_my_assigned_assets(uuid)
to authenticated;

create or replace function public.touch_my_organization_access(
  target_organization_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  update public.organization_memberships
  set last_access_at = now()
  where organization_id = target_organization_id
    and user_id = auth.uid()
    and is_active = true;

  if not found then
    raise exception 'Vinculo ativo nao encontrado.';
  end if;
end;
$$;

grant execute on function public.touch_my_organization_access(uuid)
to authenticated;

create or replace function public.protect_organization_owner()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  target_organization_id uuid;
  remaining_owners integer;
  requester_role text;
  jwt_role text;
begin
  target_organization_id := coalesce(
    new.organization_id,
    old.organization_id
  );

  jwt_role := coalesce(auth.role(), '');
  requester_role := public.organization_role(
    target_organization_id
  );

  if tg_op = 'INSERT' then
    if new.role = 'owner' and jwt_role <> 'service_role' then
      select count(*)
      into remaining_owners
      from public.organization_memberships
      where organization_id = target_organization_id
        and role = 'owner'
        and is_active = true;

      if not (
        remaining_owners = 0
        and new.user_id = auth.uid()
      ) and requester_role <> 'owner' then
        raise exception
          'Somente um proprietario pode conceder esse perfil.';
      end if;
    end if;

    return new;
  end if;

  if tg_op = 'UPDATE' then
    if (
      new.role = 'owner'
      and old.role is distinct from new.role
      and jwt_role <> 'service_role'
      and requester_role <> 'owner'
    ) then
      raise exception
        'Somente um proprietario pode conceder esse perfil.';
    end if;

    if (
      old.role = 'owner'
      and old.is_active = true
      and (
        new.role <> 'owner'
        or new.is_active = false
      )
    ) then
      select count(*)
      into remaining_owners
      from public.organization_memberships
      where organization_id = target_organization_id
        and role = 'owner'
        and is_active = true
        and id <> old.id;

      if remaining_owners = 0 then
        raise exception
          'A empresa precisa manter pelo menos um proprietario ativo.';
      end if;
    end if;

    return new;
  end if;

  if tg_op = 'DELETE' then
    if old.role = 'owner' and old.is_active = true then
      select count(*)
      into remaining_owners
      from public.organization_memberships
      where organization_id = target_organization_id
        and role = 'owner'
        and is_active = true
        and id <> old.id;

      if remaining_owners = 0 then
        raise exception
          'A empresa precisa manter pelo menos um proprietario ativo.';
      end if;
    end if;

    return old;
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_protect_organization_owner
on public.organization_memberships;

create trigger trg_protect_organization_owner
before insert or update or delete
on public.organization_memberships
for each row
execute function public.protect_organization_owner();


-- Perfis operacionais usados pelas politicas de seguranca.
create or replace function public.can_operate_support(
  target_organization_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    public.organization_role(target_organization_id)
      in ('owner', 'admin', 'it_manager', 'technician'),
    false
  );
$$;

create or replace function public.can_view_it_operations(
  target_organization_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    public.organization_role(target_organization_id)
      in (
        'owner',
        'admin',
        'it_manager',
        'technician',
        'auditor'
      ),
    false
  );
$$;

grant execute on function public.can_operate_support(uuid)
to authenticated;

grant execute on function public.can_view_it_operations(uuid)
to authenticated;

drop policy if exists support_tickets_select
on public.support_tickets;
create policy support_tickets_select
on public.support_tickets
for select to authenticated
using (
  public.can_view_it_operations(organization_id)
  or requester_user_id = auth.uid()
);

drop policy if exists support_tickets_insert
on public.support_tickets;
create policy support_tickets_insert
on public.support_tickets
for insert to authenticated
with check (
  public.is_organization_member(organization_id)
  and (
    public.can_operate_support(organization_id)
    or requester_user_id is null
    or requester_user_id = auth.uid()
  )
);

drop policy if exists support_tickets_update
on public.support_tickets;
create policy support_tickets_update
on public.support_tickets
for update to authenticated
using (
  public.can_operate_support(organization_id)
)
with check (
  public.can_operate_support(organization_id)
);

drop policy if exists support_tickets_delete
on public.support_tickets;
create policy support_tickets_delete
on public.support_tickets
for delete to authenticated
using (
  public.can_manage_organization(organization_id)
);

drop policy if exists self_service_sessions_select
on public.self_service_sessions;
create policy self_service_sessions_select
on public.self_service_sessions
for select to authenticated
using (
  public.can_view_it_operations(organization_id)
  or user_id = auth.uid()
);

drop policy if exists self_service_sessions_insert
on public.self_service_sessions;
create policy self_service_sessions_insert
on public.self_service_sessions
for insert to authenticated
with check (
  public.is_organization_member(organization_id)
  and (
    public.can_operate_support(organization_id)
    or user_id is null
    or user_id = auth.uid()
  )
);

drop policy if exists self_service_sessions_update
on public.self_service_sessions;
create policy self_service_sessions_update
on public.self_service_sessions
for update to authenticated
using (
  public.can_operate_support(organization_id)
  or user_id = auth.uid()
)
with check (
  public.can_operate_support(organization_id)
  or user_id = auth.uid()
);

drop policy if exists self_service_sessions_delete
on public.self_service_sessions;
create policy self_service_sessions_delete
on public.self_service_sessions
for delete to authenticated
using (
  public.can_manage_organization(organization_id)
);

drop policy if exists ticket_events_select
on public.ticket_events;
create policy ticket_events_select
on public.ticket_events
for select to authenticated
using (
  public.can_view_it_operations(organization_id)
  or exists (
    select 1
    from public.support_tickets ticket
    where ticket.id = ticket_events.ticket_id
      and ticket.requester_user_id = auth.uid()
  )
);

drop policy if exists ticket_events_insert
on public.ticket_events;
create policy ticket_events_insert
on public.ticket_events
for insert to authenticated
with check (
  public.can_operate_support(organization_id)
  or exists (
    select 1
    from public.support_tickets ticket
    where ticket.id = ticket_events.ticket_id
      and ticket.requester_user_id = auth.uid()
  )
);

drop policy if exists ticket_events_update
on public.ticket_events;
create policy ticket_events_update
on public.ticket_events
for update to authenticated
using (
  public.can_operate_support(organization_id)
)
with check (
  public.can_operate_support(organization_id)
);

drop policy if exists ticket_events_delete
on public.ticket_events;
create policy ticket_events_delete
on public.ticket_events
for delete to authenticated
using (
  public.can_manage_organization(organization_id)
);

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'maintenance_work_orders',
    'preventive_maintenance_plans',
    'preventive_maintenance_executions'
  ]
  loop
    execute format(
      'drop policy if exists %I on public.%I',
      table_name || '_select',
      table_name
    );

    execute format(
      'create policy %I on public.%I for select to authenticated using (public.can_view_it_operations(organization_id))',
      table_name || '_select',
      table_name
    );

    execute format(
      'drop policy if exists %I on public.%I',
      table_name || '_insert',
      table_name
    );

    execute format(
      'create policy %I on public.%I for insert to authenticated with check (public.can_operate_support(organization_id))',
      table_name || '_insert',
      table_name
    );

    execute format(
      'drop policy if exists %I on public.%I',
      table_name || '_update',
      table_name
    );

    execute format(
      'create policy %I on public.%I for update to authenticated using (public.can_operate_support(organization_id)) with check (public.can_operate_support(organization_id))',
      table_name || '_update',
      table_name
    );

    execute format(
      'drop policy if exists %I on public.%I',
      table_name || '_delete',
      table_name
    );

    execute format(
      'create policy %I on public.%I for delete to authenticated using (public.can_manage_organization(organization_id))',
      table_name || '_delete',
      table_name
    );
  end loop;
end
$$;

commit;
