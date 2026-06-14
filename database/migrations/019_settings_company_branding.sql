-- ATIVELO - PACOTE 19
-- Central de configuracoes, identidade da empresa e marca.

begin;

create extension if not exists pgcrypto;

do $$
begin
  if to_regclass('public.organizations') is null then
    raise exception 'Tabela public.organizations nao encontrada.';
  end if;

  if to_regprocedure('public.is_organization_member(uuid)') is null then
    raise exception 'Funcao public.is_organization_member(uuid) nao encontrada.';
  end if;

  if to_regprocedure('public.can_manage_organization(uuid)') is null then
    raise exception 'Funcao public.can_manage_organization(uuid) nao encontrada.';
  end if;
end
$$;

alter table public.organizations
  add column if not exists trade_name text,
  add column if not exists legal_name text,
  add column if not exists cnpj text,
  add column if not exists state_registration text,
  add column if not exists municipal_registration text,
  add column if not exists phone text,
  add column if not exists whatsapp text,
  add column if not exists email text,
  add column if not exists website text,
  add column if not exists postal_code text,
  add column if not exists street text,
  add column if not exists street_number text,
  add column if not exists complement text,
  add column if not exists district text,
  add column if not exists city text,
  add column if not exists state text,
  add column if not exists country text not null default 'Brasil',
  add column if not exists logo_path text;

comment on column public.organizations.trade_name
is 'Nome fantasia usado na interface do Ativelo.';

comment on column public.organizations.legal_name
is 'Razao social da empresa.';

comment on column public.organizations.logo_path
is 'Caminho do PNG no bucket organization-branding.';

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'organization-branding',
  'organization-branding',
  true,
  2097152,
  array['image/png']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists organization_branding_select_member
on storage.objects;
create policy organization_branding_select_member
on storage.objects
for select
to authenticated
using (
  bucket_id = 'organization-branding'
  and public.is_organization_member(
    ((storage.foldername(name))[1])::uuid
  )
);

drop policy if exists organization_branding_insert_manager
on storage.objects;
create policy organization_branding_insert_manager
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'organization-branding'
  and public.can_manage_organization(
    ((storage.foldername(name))[1])::uuid
  )
);

drop policy if exists organization_branding_update_manager
on storage.objects;
create policy organization_branding_update_manager
on storage.objects
for update
to authenticated
using (
  bucket_id = 'organization-branding'
  and public.can_manage_organization(
    ((storage.foldername(name))[1])::uuid
  )
)
with check (
  bucket_id = 'organization-branding'
  and public.can_manage_organization(
    ((storage.foldername(name))[1])::uuid
  )
);

drop policy if exists organization_branding_delete_manager
on storage.objects;
create policy organization_branding_delete_manager
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'organization-branding'
  and public.can_manage_organization(
    ((storage.foldername(name))[1])::uuid
  )
);

commit;
