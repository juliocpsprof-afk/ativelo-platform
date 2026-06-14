-- ATIVELO - PACOTE 14
-- Emprestimos, transferencias, alertas e fila de integracoes.

begin;

create extension if not exists pgcrypto;

do $$
begin
  if to_regclass('public.assets') is null then
    raise exception 'Tabela public.assets nao encontrada. Execute o Pacote 07.';
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

create table if not exists public.organization_notification_settings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references public.organizations(id) on delete cascade,
  email_enabled boolean not null default false,
  whatsapp_enabled boolean not null default false,
  sender_name text,
  sender_email text,
  default_country_code text not null default '55',
  loan_reminder_days integer[] not null default array[3,1,0],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.asset_loans (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  asset_id uuid not null references public.assets(id) on delete restrict,
  from_unit_id uuid references public.organization_units(id) on delete set null,
  to_unit_id uuid not null references public.organization_units(id) on delete restrict,

  borrower_name text not null,
  borrower_email text,
  borrower_phone text,

  checkout_at timestamptz not null default now(),
  due_at timestamptz not null,
  returned_at timestamptz,

  status text not null default 'planned'
    check (status in ('planned','active','overdue','returned','canceled')),

  condition_out text not null default 'good'
    check (condition_out in ('new','excellent','good','fair','poor','irrecoverable')),
  condition_in text
    check (condition_in is null or condition_in in ('new','excellent','good','fair','poor','irrecoverable')),

  notes text,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  returned_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  check (due_at > checkout_at),
  check (
    (status = 'returned' and returned_at is not null)
    or status <> 'returned'
  )
);

create unique index if not exists uq_asset_active_loan
on public.asset_loans(asset_id)
where status in ('planned','active','overdue');

create table if not exists public.asset_transfers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  asset_id uuid not null references public.assets(id) on delete restrict,
  from_unit_id uuid references public.organization_units(id) on delete set null,
  to_unit_id uuid not null references public.organization_units(id) on delete restrict,

  status text not null default 'requested'
    check (status in ('requested','approved','completed','canceled')),
  reason text not null,
  notes text,

  requested_by uuid references auth.users(id) on delete set null default auth.uid(),
  approved_by uuid references auth.users(id) on delete set null,
  completed_by uuid references auth.users(id) on delete set null,
  requested_at timestamptz not null default now(),
  approved_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),

  check (from_unit_id is null or from_unit_id <> to_unit_id)
);

create table if not exists public.app_notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  recipient_user_id uuid references auth.users(id) on delete set null,
  recipient_name text,
  recipient_email text,
  recipient_phone text,

  channel text not null default 'in_app'
    check (channel in ('in_app','email','whatsapp')),
  category text not null,
  severity text not null default 'info'
    check (severity in ('info','success','warning','high','critical')),

  title text not null,
  message text not null,
  entity_type text,
  entity_id uuid,

  scheduled_for timestamptz not null default now(),
  delivery_status text not null default 'pending'
    check (delivery_status in ('pending','processing','sent','failed','canceled')),
  sent_at timestamptz,
  read_at timestamptz,
  last_error text,
  metadata jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_asset_loans_organization
on public.asset_loans(organization_id, status, due_at);

create index if not exists idx_asset_loans_asset
on public.asset_loans(asset_id, created_at desc);

create index if not exists idx_asset_transfers_organization
on public.asset_transfers(organization_id, status, requested_at desc);

create index if not exists idx_asset_transfers_asset
on public.asset_transfers(asset_id, requested_at desc);

create index if not exists idx_app_notifications_queue
on public.app_notifications(channel, delivery_status, scheduled_for);

create index if not exists idx_app_notifications_organization
on public.app_notifications(organization_id, read_at, scheduled_for desc);

create or replace function public.ativelo_logistics_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_notification_settings_updated_at
on public.organization_notification_settings;
create trigger trg_notification_settings_updated_at
before update on public.organization_notification_settings
for each row execute function public.ativelo_logistics_updated_at();

drop trigger if exists trg_asset_loans_updated_at
on public.asset_loans;
create trigger trg_asset_loans_updated_at
before update on public.asset_loans
for each row execute function public.ativelo_logistics_updated_at();

drop trigger if exists trg_asset_transfers_updated_at
on public.asset_transfers;
create trigger trg_asset_transfers_updated_at
before update on public.asset_transfers
for each row execute function public.ativelo_logistics_updated_at();

drop trigger if exists trg_app_notifications_updated_at
on public.app_notifications;
create trigger trg_app_notifications_updated_at
before update on public.app_notifications
for each row execute function public.ativelo_logistics_updated_at();

create or replace function public.schedule_loan_notifications(
  target_loan_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  loan_record public.asset_loans%rowtype;
  settings_record public.organization_notification_settings%rowtype;
  asset_label text;
  reminder_day integer;
  reminder_time timestamptz;
  notification_title text;
  notification_message text;
begin
  select *
  into loan_record
  from public.asset_loans
  where id = target_loan_id;

  if not found or loan_record.status not in ('planned','active','overdue') then
    return;
  end if;

  insert into public.organization_notification_settings (organization_id)
  values (loan_record.organization_id)
  on conflict (organization_id) do nothing;

  select *
  into settings_record
  from public.organization_notification_settings
  where organization_id = loan_record.organization_id;

  select concat(asset_number, ' - ', name)
  into asset_label
  from public.assets
  where id = loan_record.asset_id;

  delete from public.app_notifications
  where metadata ->> 'loan_id' = loan_record.id::text
    and delivery_status in ('pending','failed');

  foreach reminder_day in array settings_record.loan_reminder_days
  loop
    reminder_time := loan_record.due_at - make_interval(days => reminder_day);

    if reminder_day > 1 then
      notification_title := 'Devolucao de equipamento em ' || reminder_day || ' dias';
    elsif reminder_day = 1 then
      notification_title := 'Devolucao de equipamento amanha';
    elsif reminder_day = 0 then
      notification_title := 'Devolucao de equipamento vence hoje';
    else
      notification_title := 'Devolucao de equipamento atrasada';
    end if;

    notification_message :=
      asset_label || ' deve ser devolvido por ' ||
      loan_record.borrower_name || ' ate ' ||
      to_char(loan_record.due_at at time zone 'America/Bahia', 'DD/MM/YYYY HH24:MI') || '.';

    insert into public.app_notifications (
      organization_id,
      channel,
      category,
      severity,
      title,
      message,
      entity_type,
      entity_id,
      scheduled_for,
      delivery_status,
      recipient_name,
      metadata
    )
    values (
      loan_record.organization_id,
      'in_app',
      'loan_due',
      case when reminder_day = 0 then 'high' else 'warning' end,
      notification_title,
      notification_message,
      'asset',
      loan_record.asset_id,
      greatest(reminder_time, now()),
      'pending',
      loan_record.borrower_name,
      jsonb_build_object(
        'loan_id', loan_record.id,
        'reminder_day', reminder_day
      )
    );

    if settings_record.email_enabled and loan_record.borrower_email is not null then
      insert into public.app_notifications (
        organization_id,
        channel,
        category,
        severity,
        title,
        message,
        entity_type,
        entity_id,
        scheduled_for,
        delivery_status,
        recipient_name,
        recipient_email,
        metadata
      )
      values (
        loan_record.organization_id,
        'email',
        'loan_due',
        case when reminder_day = 0 then 'high' else 'warning' end,
        notification_title,
        notification_message,
        'asset',
        loan_record.asset_id,
        greatest(reminder_time, now()),
        'pending',
        loan_record.borrower_name,
        loan_record.borrower_email,
        jsonb_build_object(
          'loan_id', loan_record.id,
          'reminder_day', reminder_day
        )
      );
    end if;

    if settings_record.whatsapp_enabled and loan_record.borrower_phone is not null then
      insert into public.app_notifications (
        organization_id,
        channel,
        category,
        severity,
        title,
        message,
        entity_type,
        entity_id,
        scheduled_for,
        delivery_status,
        recipient_name,
        recipient_phone,
        metadata
      )
      values (
        loan_record.organization_id,
        'whatsapp',
        'loan_due',
        case when reminder_day = 0 then 'high' else 'warning' end,
        notification_title,
        notification_message,
        'asset',
        loan_record.asset_id,
        greatest(reminder_time, now()),
        'pending',
        loan_record.borrower_name,
        regexp_replace(
          settings_record.default_country_code || loan_record.borrower_phone,
          '\D',
          '',
          'g'
        ),
        jsonb_build_object(
          'loan_id', loan_record.id,
          'reminder_day', reminder_day
        )
      );
    end if;
  end loop;
end;
$$;

create or replace function public.handle_asset_loan_change()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if tg_op = 'INSERT' then
    if new.status in ('planned','active') then
      update public.assets
      set
        operational_status = 'loaned',
        unit_id = new.to_unit_id,
        assigned_person_name = new.borrower_name,
        assigned_person_email = new.borrower_email,
        assigned_at = new.checkout_at
      where id = new.asset_id
        and organization_id = new.organization_id;

      perform public.schedule_loan_notifications(new.id);
    end if;

    return new;
  end if;

  if old.status is distinct from new.status
    or old.due_at is distinct from new.due_at
    or old.borrower_email is distinct from new.borrower_email
    or old.borrower_phone is distinct from new.borrower_phone
  then
    if new.status in ('planned','active','overdue') then
      update public.assets
      set
        operational_status = 'loaned',
        unit_id = new.to_unit_id,
        assigned_person_name = new.borrower_name,
        assigned_person_email = new.borrower_email,
        assigned_at = new.checkout_at
      where id = new.asset_id
        and organization_id = new.organization_id;

      perform public.schedule_loan_notifications(new.id);
    elsif new.status = 'returned' then
      update public.assets
      set
        operational_status = 'available',
        unit_id = new.from_unit_id,
        physical_condition = coalesce(new.condition_in, physical_condition),
        assigned_person_name = null,
        assigned_person_email = null,
        assigned_at = null
      where id = new.asset_id
        and organization_id = new.organization_id;

      update public.asset_loans
      set returned_by = auth.uid()
      where id = new.id
        and returned_by is null;

      update public.app_notifications
      set delivery_status = 'canceled'
      where metadata ->> 'loan_id' = new.id::text
        and delivery_status in ('pending','failed');

      insert into public.app_notifications (
        organization_id,
        channel,
        category,
        severity,
        title,
        message,
        entity_type,
        entity_id,
        delivery_status,
        recipient_name,
        metadata
      )
      values (
        new.organization_id,
        'in_app',
        'loan_returned',
        'success',
        'Equipamento devolvido',
        'O patrimonio foi devolvido e retornou para a unidade de origem.',
        'asset',
        new.asset_id,
        'pending',
        new.borrower_name,
        jsonb_build_object('loan_id', new.id)
      );
    elsif new.status = 'canceled' then
      update public.assets
      set
        operational_status = 'available',
        unit_id = new.from_unit_id,
        assigned_person_name = null,
        assigned_person_email = null,
        assigned_at = null
      where id = new.asset_id
        and organization_id = new.organization_id;

      update public.app_notifications
      set delivery_status = 'canceled'
      where metadata ->> 'loan_id' = new.id::text
        and delivery_status in ('pending','failed');
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_asset_loans_change
on public.asset_loans;
create trigger trg_asset_loans_change
after insert or update on public.asset_loans
for each row execute function public.handle_asset_loan_change();

create or replace function public.handle_asset_transfer_change()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if new.status = 'approved'
    and (tg_op = 'INSERT' or old.status is distinct from new.status)
  then
    update public.asset_transfers
    set approved_by = coalesce(approved_by, auth.uid())
    where id = new.id;
  end if;

  if new.status = 'completed'
    and (tg_op = 'INSERT' or old.status is distinct from new.status)
  then
    update public.assets
    set unit_id = new.to_unit_id
    where id = new.asset_id
      and organization_id = new.organization_id;

    update public.asset_transfers
    set completed_by = coalesce(completed_by, auth.uid())
    where id = new.id;

    insert into public.app_notifications (
      organization_id,
      channel,
      category,
      severity,
      title,
      message,
      entity_type,
      entity_id,
      delivery_status,
      metadata
    )
    values (
      new.organization_id,
      'in_app',
      'asset_transfer',
      'success',
      'Transferencia concluida',
      'O equipamento foi transferido para a nova unidade.',
      'asset',
      new.asset_id,
      'pending',
      jsonb_build_object('transfer_id', new.id)
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_asset_transfers_change
on public.asset_transfers;
create trigger trg_asset_transfers_change
after insert or update on public.asset_transfers
for each row execute function public.handle_asset_transfer_change();

create or replace function public.refresh_overdue_asset_loans(
  target_organization_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  affected_count integer;
begin
  if not public.is_organization_member(target_organization_id) then
    raise exception 'Acesso negado.';
  end if;

  update public.asset_loans
  set status = 'overdue'
  where organization_id = target_organization_id
    and status in ('planned','active')
    and due_at < now();

  get diagnostics affected_count = row_count;
  return affected_count;
end;
$$;

grant execute on function public.refresh_overdue_asset_loans(uuid)
to authenticated;

insert into public.organization_notification_settings (organization_id)
select id
from public.organizations
on conflict (organization_id) do nothing;

alter table public.organization_notification_settings enable row level security;
alter table public.asset_loans enable row level security;
alter table public.asset_transfers enable row level security;
alter table public.app_notifications enable row level security;

drop policy if exists notification_settings_select_member
on public.organization_notification_settings;
create policy notification_settings_select_member
on public.organization_notification_settings
for select to authenticated
using (public.is_organization_member(organization_id));

drop policy if exists notification_settings_manage_admin
on public.organization_notification_settings;
create policy notification_settings_manage_admin
on public.organization_notification_settings
for all to authenticated
using (public.can_manage_organization(organization_id))
with check (public.can_manage_organization(organization_id));

drop policy if exists asset_loans_select_member
on public.asset_loans;
create policy asset_loans_select_member
on public.asset_loans
for select to authenticated
using (public.is_organization_member(organization_id));

drop policy if exists asset_loans_manage_admin
on public.asset_loans;
create policy asset_loans_manage_admin
on public.asset_loans
for all to authenticated
using (public.can_manage_organization(organization_id))
with check (public.can_manage_organization(organization_id));

drop policy if exists asset_transfers_select_member
on public.asset_transfers;
create policy asset_transfers_select_member
on public.asset_transfers
for select to authenticated
using (public.is_organization_member(organization_id));

drop policy if exists asset_transfers_manage_admin
on public.asset_transfers;
create policy asset_transfers_manage_admin
on public.asset_transfers
for all to authenticated
using (public.can_manage_organization(organization_id))
with check (public.can_manage_organization(organization_id));

drop policy if exists app_notifications_select_member
on public.app_notifications;
create policy app_notifications_select_member
on public.app_notifications
for select to authenticated
using (public.is_organization_member(organization_id));

drop policy if exists app_notifications_update_member
on public.app_notifications;
create policy app_notifications_update_member
on public.app_notifications
for update to authenticated
using (public.is_organization_member(organization_id))
with check (public.is_organization_member(organization_id));

drop policy if exists app_notifications_insert_admin
on public.app_notifications;
create policy app_notifications_insert_admin
on public.app_notifications
for insert to authenticated
with check (public.can_manage_organization(organization_id));

drop policy if exists app_notifications_delete_admin
on public.app_notifications;
create policy app_notifications_delete_admin
on public.app_notifications
for delete to authenticated
using (public.can_manage_organization(organization_id));

grant select, insert, update, delete
on public.organization_notification_settings to authenticated;

grant select, insert, update, delete
on public.asset_loans to authenticated;

grant select, insert, update, delete
on public.asset_transfers to authenticated;

grant select, insert, update, delete
on public.app_notifications to authenticated;

create or replace view public.asset_logistics_summary
with (security_invoker = true)
as
select
  o.id as organization_id,
  count(l.id) filter (
    where l.status in ('planned','active','overdue')
  ) as active_loans,
  count(l.id) filter (
    where l.status = 'overdue'
  ) as overdue_loans,
  count(t.id) filter (
    where t.status in ('requested','approved')
  ) as pending_transfers,
  (
    select count(*)
    from public.app_notifications n
    where n.organization_id = o.id
      and n.channel = 'in_app'
      and n.read_at is null
  ) as unread_notifications
from public.organizations o
left join public.asset_loans l on l.organization_id = o.id
left join public.asset_transfers t on t.organization_id = o.id
group by o.id;

grant select on public.asset_logistics_summary to authenticated;

commit;
