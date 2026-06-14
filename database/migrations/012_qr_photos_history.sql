-- ATIVELO - PACOTE 12
-- QR Code, etiquetas, fotos privadas e histórico visual de ativos.

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

create table if not exists public.asset_photos (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  asset_id uuid not null references public.assets(id) on delete cascade,
  storage_path text not null,
  original_filename text,
  mime_type text,
  size_bytes bigint,
  caption text,
  is_primary boolean not null default false,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (storage_path)
);

create index if not exists idx_asset_photos_asset
on public.asset_photos(asset_id, created_at desc);

create index if not exists idx_asset_photos_organization
on public.asset_photos(organization_id);

create unique index if not exists uq_asset_photos_primary
on public.asset_photos(asset_id)
where is_primary = true;

create or replace function public.ativelo_asset_photos_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_asset_photos_updated_at on public.asset_photos;
create trigger trg_asset_photos_updated_at
before update on public.asset_photos
for each row execute function public.ativelo_asset_photos_updated_at();

alter table public.asset_photos enable row level security;

drop policy if exists asset_photos_select_member on public.asset_photos;
create policy asset_photos_select_member
on public.asset_photos
for select
to authenticated
using (public.is_organization_member(organization_id));

drop policy if exists asset_photos_insert_manager on public.asset_photos;
create policy asset_photos_insert_manager
on public.asset_photos
for insert
to authenticated
with check (
  public.can_manage_organization(organization_id)
  and exists (
    select 1
    from public.assets a
    where a.id = asset_id
      and a.organization_id = organization_id
  )
);

drop policy if exists asset_photos_update_manager on public.asset_photos;
create policy asset_photos_update_manager
on public.asset_photos
for update
to authenticated
using (public.can_manage_organization(organization_id))
with check (public.can_manage_organization(organization_id));

drop policy if exists asset_photos_delete_manager on public.asset_photos;
create policy asset_photos_delete_manager
on public.asset_photos
for delete
to authenticated
using (public.can_manage_organization(organization_id));

grant select, insert, update, delete on public.asset_photos to authenticated;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'asset-photos',
  'asset-photos',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists asset_photos_storage_select on storage.objects;
create policy asset_photos_storage_select
on storage.objects
for select
to authenticated
using (
  bucket_id = 'asset-photos'
  and public.is_organization_member(
    ((storage.foldername(name))[1])::uuid
  )
);

drop policy if exists asset_photos_storage_insert on storage.objects;
create policy asset_photos_storage_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'asset-photos'
  and public.can_manage_organization(
    ((storage.foldername(name))[1])::uuid
  )
);

drop policy if exists asset_photos_storage_delete on storage.objects;
create policy asset_photos_storage_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'asset-photos'
  and public.can_manage_organization(
    ((storage.foldername(name))[1])::uuid
  )
);

commit;
