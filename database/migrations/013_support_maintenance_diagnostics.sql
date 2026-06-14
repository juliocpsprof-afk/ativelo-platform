-- ATIVELO - PACOTE 13
-- Central de chamados, autodiagnostico, manutencao preventiva e analise de recorrencia.

begin;

create extension if not exists pgcrypto;

do $$
begin
  if to_regclass('public.organizations') is null then
    raise exception 'Tabela public.organizations nao encontrada.';
  end if;

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

create sequence if not exists public.support_ticket_number_seq start 1;
create sequence if not exists public.maintenance_work_order_number_seq start 1;

create table if not exists public.defect_knowledge_base (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  asset_category_id uuid references public.asset_categories(id) on delete set null,
  title text not null,
  symptom_pattern text not null,
  keywords text[] not null default '{}'::text[],
  user_steps jsonb not null default '[]'::jsonb,
  technician_diagnostics jsonb not null default '[]'::jsonb,
  severity text not null default 'medium'
    check (severity in ('low', 'medium', 'high', 'critical')),
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_global_knowledge_title
on public.defect_knowledge_base(lower(title))
where organization_id is null;

create unique index if not exists uq_org_knowledge_title
on public.defect_knowledge_base(organization_id, lower(title))
where organization_id is not null;

create table if not exists public.self_service_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  asset_id uuid references public.assets(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null default auth.uid(),
  knowledge_id uuid references public.defect_knowledge_base(id) on delete set null,
  description text not null,
  completed_steps jsonb not null default '[]'::jsonb,
  resolved boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  ticket_number text not null unique,
  asset_id uuid references public.assets(id) on delete set null,

  requester_user_id uuid references auth.users(id) on delete set null default auth.uid(),
  requester_name text,
  requester_email text,

  title text not null,
  description text not null,
  category text not null default 'hardware'
    check (category in (
      'hardware',
      'software',
      'network',
      'printer',
      'access',
      'security',
      'other'
    )),
  priority text not null default 'medium'
    check (priority in ('low', 'medium', 'high', 'urgent')),
  status text not null default 'open'
    check (status in (
      'open',
      'triage',
      'in_progress',
      'waiting_user',
      'waiting_part',
      'resolved',
      'closed',
      'canceled'
    )),
  channel text not null default 'app'
    check (channel in ('app', 'email', 'whatsapp', 'phone', 'manual')),

  matched_knowledge_ids uuid[] not null default '{}'::uuid[],
  self_help_steps jsonb not null default '[]'::jsonb,
  self_help_result text
    check (self_help_result is null or self_help_result in (
      'not_attempted',
      'not_resolved',
      'partially_resolved',
      'resolved'
    )),

  assigned_to uuid references auth.users(id) on delete set null,
  due_at timestamptz,
  first_response_at timestamptz,
  resolved_at timestamptz,
  closed_at timestamptz,
  resolution_summary text,

  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ticket_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  event_type text not null
    check (event_type in (
      'created',
      'comment',
      'status',
      'priority',
      'assignment',
      'self_help',
      'diagnosis',
      'work_order',
      'resolution'
    )),
  previous_value text,
  new_value text,
  message text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

create table if not exists public.maintenance_work_orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  work_order_number text not null unique,
  ticket_id uuid references public.support_tickets(id) on delete set null,
  asset_id uuid not null references public.assets(id) on delete cascade,

  maintenance_type text not null default 'corrective'
    check (maintenance_type in ('corrective', 'preventive', 'inspection', 'installation')),
  title text not null,
  priority text not null default 'medium'
    check (priority in ('low', 'medium', 'high', 'urgent')),
  status text not null default 'scheduled'
    check (status in ('scheduled', 'in_progress', 'waiting_part', 'completed', 'canceled')),

  scheduled_date date,
  started_at timestamptz,
  completed_at timestamptz,
  technician_id uuid references auth.users(id) on delete set null,

  diagnosis text,
  probable_cause text,
  solution text,
  parts_used jsonb not null default '[]'::jsonb,
  labor_minutes integer,
  external_cost numeric(14,2),
  notes text,

  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.preventive_maintenance_plans (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  asset_id uuid references public.assets(id) on delete cascade,
  asset_category_id uuid references public.asset_categories(id) on delete set null,
  asset_model_id uuid references public.asset_models(id) on delete set null,

  service_type text not null,
  instructions text,
  interval_days integer not null check (interval_days > 0),
  alert_days integer not null default 7 check (alert_days >= 0),
  estimated_duration_minutes integer,
  last_completed_date date,
  next_due_date date not null,
  is_active boolean not null default true,

  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  check (
    asset_id is not null
    or asset_category_id is not null
    or asset_model_id is not null
  )
);

create table if not exists public.preventive_maintenance_executions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  plan_id uuid not null references public.preventive_maintenance_plans(id) on delete cascade,
  asset_id uuid references public.assets(id) on delete set null,
  work_order_id uuid references public.maintenance_work_orders(id) on delete set null,
  scheduled_date date not null,
  completed_date date,
  status text not null default 'pending'
    check (status in ('pending', 'completed', 'skipped', 'overdue')),
  notes text,
  technician_id uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

create index if not exists idx_knowledge_organization
on public.defect_knowledge_base(organization_id, is_active);

create index if not exists idx_self_service_organization
on public.self_service_sessions(organization_id, created_at desc);

create index if not exists idx_support_tickets_organization_status
on public.support_tickets(organization_id, status, created_at desc);

create index if not exists idx_support_tickets_asset
on public.support_tickets(asset_id, created_at desc);

create index if not exists idx_support_tickets_due
on public.support_tickets(organization_id, due_at)
where status not in ('resolved', 'closed', 'canceled');

create index if not exists idx_ticket_events_ticket
on public.ticket_events(ticket_id, created_at);

create index if not exists idx_work_orders_organization_status
on public.maintenance_work_orders(organization_id, status, created_at desc);

create index if not exists idx_work_orders_asset
on public.maintenance_work_orders(asset_id, created_at desc);

create index if not exists idx_preventive_plans_due
on public.preventive_maintenance_plans(organization_id, next_due_date)
where is_active = true;

create index if not exists idx_preventive_executions_plan
on public.preventive_maintenance_executions(plan_id, scheduled_date desc);

create or replace function public.ativelo_support_touch_record()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();

  if to_jsonb(new) ? 'updated_by' then
    new.updated_by = auth.uid();
  end if;

  return new;
end;
$$;

create or replace function public.ativelo_set_ticket_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.ticket_number is null or btrim(new.ticket_number) = '' then
    new.ticket_number :=
      'CH-' || to_char(current_date, 'YYYY') || '-' ||
      lpad(nextval('public.support_ticket_number_seq')::text, 6, '0');
  end if;

  return new;
end;
$$;

create or replace function public.ativelo_set_work_order_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.work_order_number is null or btrim(new.work_order_number) = '' then
    new.work_order_number :=
      'OS-' || to_char(current_date, 'YYYY') || '-' ||
      lpad(nextval('public.maintenance_work_order_number_seq')::text, 6, '0');
  end if;

  return new;
end;
$$;

create or replace function public.ativelo_log_ticket_changes()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.ticket_events (
      organization_id,
      ticket_id,
      event_type,
      new_value,
      message,
      created_by
    )
    values (
      new.organization_id,
      new.id,
      'created',
      new.status,
      'Chamado aberto',
      auth.uid()
    );

    return new;
  end if;

  if old.status is distinct from new.status then
    insert into public.ticket_events (
      organization_id,
      ticket_id,
      event_type,
      previous_value,
      new_value,
      message,
      created_by
    )
    values (
      new.organization_id,
      new.id,
      'status',
      old.status,
      new.status,
      'Status do chamado atualizado',
      auth.uid()
    );
  end if;

  if old.priority is distinct from new.priority then
    insert into public.ticket_events (
      organization_id,
      ticket_id,
      event_type,
      previous_value,
      new_value,
      message,
      created_by
    )
    values (
      new.organization_id,
      new.id,
      'priority',
      old.priority,
      new.priority,
      'Prioridade do chamado atualizada',
      auth.uid()
    );
  end if;

  if old.assigned_to is distinct from new.assigned_to then
    insert into public.ticket_events (
      organization_id,
      ticket_id,
      event_type,
      previous_value,
      new_value,
      message,
      created_by
    )
    values (
      new.organization_id,
      new.id,
      'assignment',
      old.assigned_to::text,
      new.assigned_to::text,
      'Responsavel tecnico atualizado',
      auth.uid()
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_knowledge_updated_at on public.defect_knowledge_base;
create trigger trg_knowledge_updated_at
before update on public.defect_knowledge_base
for each row execute function public.ativelo_support_touch_record();

drop trigger if exists trg_support_tickets_number on public.support_tickets;
create trigger trg_support_tickets_number
before insert on public.support_tickets
for each row execute function public.ativelo_set_ticket_number();

drop trigger if exists trg_support_tickets_updated_at on public.support_tickets;
create trigger trg_support_tickets_updated_at
before update on public.support_tickets
for each row execute function public.ativelo_support_touch_record();

drop trigger if exists trg_support_tickets_events on public.support_tickets;
create trigger trg_support_tickets_events
after insert or update on public.support_tickets
for each row execute function public.ativelo_log_ticket_changes();

drop trigger if exists trg_work_orders_number on public.maintenance_work_orders;
create trigger trg_work_orders_number
before insert on public.maintenance_work_orders
for each row execute function public.ativelo_set_work_order_number();

drop trigger if exists trg_work_orders_updated_at on public.maintenance_work_orders;
create trigger trg_work_orders_updated_at
before update on public.maintenance_work_orders
for each row execute function public.ativelo_support_touch_record();

drop trigger if exists trg_preventive_plans_updated_at on public.preventive_maintenance_plans;
create trigger trg_preventive_plans_updated_at
before update on public.preventive_maintenance_plans
for each row execute function public.ativelo_support_touch_record();

alter table public.defect_knowledge_base enable row level security;
alter table public.self_service_sessions enable row level security;
alter table public.support_tickets enable row level security;
alter table public.ticket_events enable row level security;
alter table public.maintenance_work_orders enable row level security;
alter table public.preventive_maintenance_plans enable row level security;
alter table public.preventive_maintenance_executions enable row level security;

drop policy if exists knowledge_select on public.defect_knowledge_base;
create policy knowledge_select
on public.defect_knowledge_base
for select
to authenticated
using (
  organization_id is null
  or public.is_organization_member(organization_id)
);

drop policy if exists knowledge_insert on public.defect_knowledge_base;
create policy knowledge_insert
on public.defect_knowledge_base
for insert
to authenticated
with check (
  organization_id is not null
  and public.can_manage_organization(organization_id)
);

drop policy if exists knowledge_update on public.defect_knowledge_base;
create policy knowledge_update
on public.defect_knowledge_base
for update
to authenticated
using (
  organization_id is not null
  and public.can_manage_organization(organization_id)
)
with check (
  organization_id is not null
  and public.can_manage_organization(organization_id)
);

drop policy if exists knowledge_delete on public.defect_knowledge_base;
create policy knowledge_delete
on public.defect_knowledge_base
for delete
to authenticated
using (
  organization_id is not null
  and public.can_manage_organization(organization_id)
);

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'self_service_sessions',
    'support_tickets',
    'ticket_events',
    'maintenance_work_orders',
    'preventive_maintenance_plans',
    'preventive_maintenance_executions'
  ]
  loop
    execute format('drop policy if exists %I on public.%I', table_name || '_select', table_name);
    execute format(
      'create policy %I on public.%I for select to authenticated using (public.is_organization_member(organization_id))',
      table_name || '_select',
      table_name
    );

    execute format('drop policy if exists %I on public.%I', table_name || '_insert', table_name);
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (public.is_organization_member(organization_id))',
      table_name || '_insert',
      table_name
    );

    execute format('drop policy if exists %I on public.%I', table_name || '_update', table_name);
    execute format(
      'create policy %I on public.%I for update to authenticated using (public.is_organization_member(organization_id)) with check (public.is_organization_member(organization_id))',
      table_name || '_update',
      table_name
    );

    execute format('drop policy if exists %I on public.%I', table_name || '_delete', table_name);
    execute format(
      'create policy %I on public.%I for delete to authenticated using (public.can_manage_organization(organization_id))',
      table_name || '_delete',
      table_name
    );
  end loop;
end
$$;

grant select, insert, update, delete on public.defect_knowledge_base to authenticated;
grant select, insert, update, delete on public.self_service_sessions to authenticated;
grant select, insert, update, delete on public.support_tickets to authenticated;
grant select, insert, update, delete on public.ticket_events to authenticated;
grant select, insert, update, delete on public.maintenance_work_orders to authenticated;
grant select, insert, update, delete on public.preventive_maintenance_plans to authenticated;
grant select, insert, update, delete on public.preventive_maintenance_executions to authenticated;

insert into public.defect_knowledge_base (
  organization_id,
  title,
  symptom_pattern,
  keywords,
  user_steps,
  technician_diagnostics,
  severity
)
select
  null,
  seed.title,
  seed.symptom_pattern,
  seed.keywords,
  seed.user_steps,
  seed.technician_diagnostics,
  seed.severity
from (
  values
    (
      'Monitor sem imagem',
      'Monitor ligado, mas a tela permanece preta ou informa ausencia de sinal.',
      array['monitor', 'sem video', 'sem imagem', 'tela preta', 'hdmi', 'vga', 'displayport'],
      '["Confirme se o monitor está ligado e se o LED de energia acende.","Verifique o cabo de energia do monitor.","Reconecte o cabo HDMI, VGA ou DisplayPort nas duas pontas.","Teste outra entrada de vídeo no monitor, se disponível.","Reinicie o computador e aguarde a inicialização completa."]'::jsonb,
      '["Testar o monitor em outro equipamento.","Testar outro cabo e outra porta de vídeo.","Validar memória RAM e placa de vídeo.","Verificar vídeo integrado e configuração de BIOS.","Analisar fonte e placa-mãe se não houver POST."]'::jsonb,
      'high'
    ),
    (
      'Computador não liga',
      'O equipamento não apresenta luzes, ventoinhas ou sinais de energia.',
      array['nao liga', 'não liga', 'sem energia', 'apagado', 'fonte', 'botao power'],
      '["Confirme se o cabo de energia está conectado.","Teste outra tomada ou filtro de linha.","Verifique se o interruptor da fonte está ligado.","Desconecte periféricos USB e tente ligar novamente."]'::jsonb,
      '["Testar cabo, tomada e fonte com equipamento apropriado.","Verificar botão power e conectores do painel frontal.","Realizar teste mínimo de bancada.","Inspecionar curto, placa-mãe e componentes."]'::jsonb,
      'critical'
    ),
    (
      'Computador lento',
      'O sistema demora para iniciar, abrir programas ou responder aos comandos.',
      array['lento', 'travando', 'demora', 'congelando', 'disco 100', 'memoria cheia'],
      '["Feche programas que não estão sendo usados.","Reinicie o computador.","Confirme se há espaço livre no disco.","Anote quais programas ficam lentos e em qual horário."]'::jsonb,
      '["Analisar uso de CPU, memória, disco e temperatura.","Verificar saúde do SSD ou HD.","Revisar inicialização, malware e atualizações.","Avaliar expansão de RAM ou substituição do armazenamento."]'::jsonb,
      'medium'
    ),
    (
      'Sem acesso à internet',
      'O equipamento está conectado, mas não abre sites ou sistemas online.',
      array['sem internet', 'internet caiu', 'nao conecta', 'não conecta', 'rede', 'wifi', 'wi-fi', 'dns'],
      '["Confirme se outros equipamentos estão sem internet.","Verifique se o cabo de rede está conectado ou se o Wi-Fi está ativo.","Desative e ative novamente a conexão.","Reinicie o equipamento de rede apenas se houver autorização."]'::jsonb,
      '["Validar endereço IP, gateway e DNS.","Testar conectividade local e externa.","Verificar porta do switch, VLAN e autenticação.","Analisar DHCP, roteador, firewall e provedor."]'::jsonb,
      'high'
    ),
    (
      'Impressora offline',
      'A impressora aparece indisponível, pausada ou offline no computador.',
      array['impressora offline', 'nao imprime', 'não imprime', 'fila', 'pausada', 'spooler'],
      '["Confirme se a impressora está ligada e sem mensagens de erro.","Verifique papel, tinta ou toner.","Confirme o cabo USB ou a conexão de rede.","Abra a fila de impressão e remova trabalhos travados."]'::jsonb,
      '["Validar IP e comunicação com a impressora.","Reiniciar spooler e revisar porta configurada.","Reinstalar ou atualizar o driver.","Verificar fila no servidor de impressão."]'::jsonb,
      'medium'
    ),
    (
      'Papel preso na impressora',
      'A impressora informa atolamento ou não movimenta o papel.',
      array['papel preso', 'atolamento', 'paper jam', 'papel amassado', 'nao puxa papel'],
      '["Desligue a impressora antes de abrir as tampas.","Retire o papel com cuidado no sentido do percurso.","Verifique se ficaram pequenos pedaços de papel.","Ajuste as guias da bandeja e use papel em boas condições."]'::jsonb,
      '["Inspecionar sensores de papel e roletes.","Limpar ou substituir roletes de tração.","Verificar unidade fusora e percurso do papel.","Executar testes pelo modo de manutenção."]'::jsonb,
      'medium'
    ),
    (
      'Impressão em branco ou falhada',
      'As páginas saem em branco, com riscos ou com partes ausentes.',
      array['impressao em branco', 'impressão em branco', 'falhando', 'riscos', 'tinta', 'toner', 'cabeca de impressao'],
      '["Verifique o nível de tinta ou toner.","Execute a verificação de jatos ou página de teste.","Confirme se as proteções do cartucho foram removidas.","Evite repetir limpezas muitas vezes seguidas."]'::jsonb,
      '["Executar limpeza e alinhamento controlados.","Verificar cartucho, toner, cilindro e unidade de imagem.","Analisar cabeça de impressão, fusor e alimentação.","Substituir consumível ou componente após diagnóstico."]'::jsonb,
      'medium'
    ),
    (
      'Teclado ou mouse não responde',
      'O teclado ou o mouse para de funcionar ou apresenta falhas intermitentes.',
      array['teclado', 'mouse', 'nao funciona', 'não funciona', 'usb', 'cursor', 'teclas'],
      '["Reconecte o dispositivo em outra porta USB.","Retire e recoloque as pilhas se for sem fio.","Teste o dispositivo em outro computador, se possível.","Reinicie o computador."]'::jsonb,
      '["Testar portas USB, drivers e gerenciamento de energia.","Validar receptor sem fio e interferências.","Substituir periférico para teste.","Analisar controladora USB e placa-mãe."]'::jsonb,
      'low'
    ),
    (
      'Equipamento superaquecendo',
      'O computador desliga, reinicia ou fica muito quente durante o uso.',
      array['esquentando', 'superaquecendo', 'muito quente', 'desliga sozinho', 'ventoinha', 'temperatura'],
      '["Desligue o equipamento se houver cheiro ou calor excessivo.","Não bloqueie as entradas e saídas de ar.","Evite usar o notebook sobre tecido ou superfícies macias.","Informe se o problema acontece em algum programa específico."]'::jsonb,
      '["Medir temperaturas e rotações das ventoinhas.","Realizar limpeza interna segura.","Verificar dissipador, pasta térmica e fluxo de ar.","Testar fonte, CPU, GPU e sensores térmicos."]'::jsonb,
      'high'
    ),
    (
      'No-break emitindo alarme',
      'O no-break apita continuamente, desliga ou indica falha de bateria.',
      array['nobreak', 'no-break', 'apitando', 'alarme', 'bateria', 'sobrecarga'],
      '["Confirme se houve falta de energia.","Verifique se muitos equipamentos estão conectados.","Desligue equipamentos não essenciais em caso de sobrecarga.","Não abra o no-break nem toque na bateria."]'::jsonb,
      '["Medir tensão de entrada, saída e bateria.","Verificar carga conectada e autonomia.","Executar autoteste conforme fabricante.","Substituir bateria ou encaminhar para assistência autorizada."]'::jsonb,
      'high'
    ),
    (
      'Sem áudio',
      'O computador não reproduz som nos alto-falantes ou fones.',
      array['sem som', 'sem audio', 'sem áudio', 'alto falante', 'fone', 'microfone'],
      '["Confira o volume e se o som está silenciado.","Selecione o dispositivo de saída correto.","Reconecte o fone ou caixa de som.","Teste outro áudio ou aplicativo."]'::jsonb,
      '["Revisar drivers e dispositivos de áudio.","Testar conectores frontais e traseiros.","Validar serviço de áudio do sistema.","Analisar hardware de áudio e periféricos."]'::jsonb,
      'low'
    ),
    (
      'Servidor ou sistema indisponível',
      'Usuários não conseguem acessar servidor, pasta compartilhada ou sistema interno.',
      array['servidor fora', 'sistema fora', 'indisponivel', 'indisponível', 'pasta compartilhada', 'erro de servidor'],
      '["Confirme se o problema acontece com outros usuários.","Anote a mensagem de erro completa.","Verifique se a rede local está funcionando.","Evite reiniciar servidores sem autorização técnica."]'::jsonb,
      '["Validar rede, DNS, autenticação e serviços.","Analisar recursos, logs e armazenamento do servidor.","Verificar dependências, banco de dados e certificados.","Aplicar plano de contingência e escalonamento."]'::jsonb,
      'critical'
    )
) as seed (
  title,
  symptom_pattern,
  keywords,
  user_steps,
  technician_diagnostics,
  severity
)
where not exists (
  select 1
  from public.defect_knowledge_base current_entry
  where current_entry.organization_id is null
    and lower(current_entry.title) = lower(seed.title)
);

create or replace view public.preventive_due_view
with (security_invoker = true)
as
select
  plan.*,
  case
    when plan.next_due_date < current_date then 'overdue'
    when plan.next_due_date <= current_date + plan.alert_days then 'due_soon'
    else 'scheduled'
  end as due_status,
  plan.next_due_date - current_date as days_until_due
from public.preventive_maintenance_plans plan
where plan.is_active = true;

grant select on public.preventive_due_view to authenticated;

create or replace view public.defect_recurrence_view
with (security_invoker = true)
as
select
  ticket.organization_id,
  ticket.asset_id,
  ticket.category,
  count(*) as occurrence_count,
  max(ticket.created_at) as last_occurrence,
  min(ticket.created_at) as first_occurrence
from public.support_tickets ticket
where ticket.created_at >= now() - interval '180 days'
group by ticket.organization_id, ticket.asset_id, ticket.category;

grant select on public.defect_recurrence_view to authenticated;

commit;
