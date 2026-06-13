-- Ativelo - Pacote 02
-- FundaÃ§Ã£o de autenticaÃ§Ã£o, perfis e organizaÃ§Ãµes

create extension if not exists pgcrypto;

create table if not exists public.profiles (
    id uuid primary key references auth.users(id) on delete cascade,
    email text,
    full_name text not null default '',
    avatar_url text,
    is_active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.organizations (
    id uuid primary key default gen_random_uuid(),
    name text not null check (char_length(trim(name)) between 2 and 120),
    slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
    status text not null default 'active' check (status in ('active', 'suspended', 'archived')),
    logo_url text,
    created_by uuid not null references auth.users(id),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.organization_memberships (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references public.organizations(id) on delete cascade,
    user_id uuid not null references auth.users(id) on delete cascade,
    role text not null check (
        role in ('owner', 'admin', 'it_manager', 'technician', 'auditor', 'user')
    ),
    is_active boolean not null default true,
    joined_at timestamptz not null default now(),
    unique (organization_id, user_id)
);

create index if not exists organization_memberships_user_idx
    on public.organization_memberships(user_id);

create index if not exists organization_memberships_org_idx
    on public.organization_memberships(organization_id);

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

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    insert into public.profiles (id, email, full_name)
    values (
        new.id,
        new.email,
        coalesce(new.raw_user_meta_data ->> 'full_name', '')
    )
    on conflict (id) do update
    set email = excluded.email;

    return new;
end;
$$;

create or replace function public.is_organization_member(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select exists (
        select 1
        from public.organization_memberships membership
        where membership.organization_id = p_organization_id
          and membership.user_id = auth.uid()
          and membership.is_active = true
    );
$$;

create or replace function public.organization_role(p_organization_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
    select membership.role
    from public.organization_memberships membership
    where membership.organization_id = p_organization_id
      and membership.user_id = auth.uid()
      and membership.is_active = true
    limit 1;
$$;

create or replace function public.can_manage_organization(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select coalesce(
        public.organization_role(p_organization_id) in ('owner', 'admin'),
        false
    );
$$;

create or replace function public.create_organization_with_owner(
    p_name text,
    p_slug text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_user_id uuid;
    v_organization_id uuid;
    v_name text;
    v_slug text;
begin
    v_user_id := auth.uid();

    if v_user_id is null then
        raise exception 'UsuÃ¡rio nÃ£o autenticado.';
    end if;

    v_name := trim(p_name);
    v_slug := lower(trim(p_slug));

    if char_length(v_name) < 2 or char_length(v_name) > 120 then
        raise exception 'O nome da empresa deve possuir entre 2 e 120 caracteres.';
    end if;

    if v_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then
        raise exception 'O identificador da empresa Ã© invÃ¡lido.';
    end if;

    insert into public.organizations (name, slug, created_by)
    values (v_name, v_slug, v_user_id)
    returning id into v_organization_id;

    insert into public.organization_memberships (
        organization_id,
        user_id,
        role,
        is_active
    )
    values (
        v_organization_id,
        v_user_id,
        'owner',
        true
    );

    return v_organization_id;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute procedure public.set_updated_at();

drop trigger if exists organizations_set_updated_at on public.organizations;
create trigger organizations_set_updated_at
before update on public.organizations
for each row execute procedure public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_memberships enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
on public.profiles
for select
to authenticated
using (id = auth.uid());

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles
for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

drop policy if exists "organizations_select_member" on public.organizations;
create policy "organizations_select_member"
on public.organizations
for select
to authenticated
using (public.is_organization_member(id));

drop policy if exists "organizations_update_manager" on public.organizations;
create policy "organizations_update_manager"
on public.organizations
for update
to authenticated
using (public.can_manage_organization(id))
with check (public.can_manage_organization(id));

drop policy if exists "memberships_select_member" on public.organization_memberships;
create policy "memberships_select_member"
on public.organization_memberships
for select
to authenticated
using (public.is_organization_member(organization_id));

drop policy if exists "memberships_insert_manager" on public.organization_memberships;
create policy "memberships_insert_manager"
on public.organization_memberships
for insert
to authenticated
with check (public.can_manage_organization(organization_id));

drop policy if exists "memberships_update_manager" on public.organization_memberships;
create policy "memberships_update_manager"
on public.organization_memberships
for update
to authenticated
using (public.can_manage_organization(organization_id))
with check (public.can_manage_organization(organization_id));

drop policy if exists "memberships_delete_manager" on public.organization_memberships;
create policy "memberships_delete_manager"
on public.organization_memberships
for delete
to authenticated
using (public.can_manage_organization(organization_id));

revoke all on function public.create_organization_with_owner(text, text) from public;
grant execute on function public.create_organization_with_owner(text, text) to authenticated;

grant execute on function public.is_organization_member(uuid) to authenticated;
grant execute on function public.organization_role(uuid) to authenticated;
grant execute on function public.can_manage_organization(uuid) to authenticated;

grant select, update on public.profiles to authenticated;
grant select, update on public.organizations to authenticated;
grant select, insert, update, delete on public.organization_memberships to authenticated;

-- Garante perfis para usuÃ¡rios que jÃ¡ existiam antes desta migraÃ§Ã£o.
insert into public.profiles (id, email, full_name)
select
    user_record.id,
    user_record.email,
    coalesce(user_record.raw_user_meta_data ->> 'full_name', '')
from auth.users user_record
on conflict (id) do nothing;