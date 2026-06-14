-- ATIVELO - PACOTE 17
-- Captura inteligente de etiquetas e importacao em massa.

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

create table if not exists public.asset_capture_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete cascade,
  asset_id uuid
    references public.assets(id) on delete set null,
  source text not null default 'factory_label'
    check (source in ('factory_label','barcode','manual_review')),
  original_filename text,
  raw_text text,
  extracted_data jsonb not null default '{}'::jsonb,
  barcode_value text,
  ocr_confidence numeric(5,2),
  created_by uuid
    references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

create table if not exists public.asset_import_batches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete cascade,
  filename text not null,
  status text not null default 'pending'
    check (
      status in (
        'pending',
        'processing',
        'completed',
        'completed_with_errors',
        'failed',
        'canceled'
      )
    ),
  total_rows integer not null default 0,
  imported_rows integer not null default 0,
  skipped_rows integer not null default 0,
  failed_rows integer not null default 0,
  mapping jsonb not null default '{}'::jsonb,
  created_by uuid
    references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.asset_import_rows (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null
    references public.asset_import_batches(id) on delete cascade,
  organization_id uuid not null
    references public.organizations(id) on delete cascade,
  row_number integer not null,
  source_data jsonb not null default '{}'::jsonb,
  normalized_data jsonb not null default '{}'::jsonb,
  status text not null
    check (status in ('imported','skipped','failed')),
  error_message text,
  asset_id uuid
    references public.assets(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (batch_id, row_number)
);

create index if not exists idx_asset_capture_sessions_org
on public.asset_capture_sessions(organization_id, created_at desc);

create index if not exists idx_asset_capture_sessions_asset
on public.asset_capture_sessions(asset_id, created_at desc);

create index if not exists idx_asset_import_batches_org
on public.asset_import_batches(organization_id, created_at desc);

create index if not exists idx_asset_import_rows_batch
on public.asset_import_rows(batch_id, row_number);

alter table public.asset_capture_sessions enable row level security;
alter table public.asset_import_batches enable row level security;
alter table public.asset_import_rows enable row level security;

drop policy if exists capture_sessions_select_member
on public.asset_capture_sessions;
create policy capture_sessions_select_member
on public.asset_capture_sessions
for select to authenticated
using (public.is_organization_member(organization_id));

drop policy if exists capture_sessions_manage_admin
on public.asset_capture_sessions;
create policy capture_sessions_manage_admin
on public.asset_capture_sessions
for all to authenticated
using (public.can_manage_organization(organization_id))
with check (public.can_manage_organization(organization_id));

drop policy if exists import_batches_select_member
on public.asset_import_batches;
create policy import_batches_select_member
on public.asset_import_batches
for select to authenticated
using (public.is_organization_member(organization_id));

drop policy if exists import_batches_manage_admin
on public.asset_import_batches;
create policy import_batches_manage_admin
on public.asset_import_batches
for all to authenticated
using (public.can_manage_organization(organization_id))
with check (public.can_manage_organization(organization_id));

drop policy if exists import_rows_select_member
on public.asset_import_rows;
create policy import_rows_select_member
on public.asset_import_rows
for select to authenticated
using (public.is_organization_member(organization_id));

drop policy if exists import_rows_manage_admin
on public.asset_import_rows;
create policy import_rows_manage_admin
on public.asset_import_rows
for all to authenticated
using (public.can_manage_organization(organization_id))
with check (public.can_manage_organization(organization_id));

grant select, insert, update, delete
on public.asset_capture_sessions to authenticated;

grant select, insert, update, delete
on public.asset_import_batches to authenticated;

grant select, insert, update, delete
on public.asset_import_rows to authenticated;

commit;
