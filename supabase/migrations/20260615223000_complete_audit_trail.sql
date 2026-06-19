begin;

create table if not exists public.audit_request_contexts (
  id uuid primary key default gen_random_uuid(),
  request_id text not null,
  actor_user_id uuid not null
    references auth.users(id)
    on delete cascade,
  ip_address inet,
  user_agent text,
  origin text,
  http_method text,
  resource text,
  created_at timestamptz not null default now(),
  unique (actor_user_id, request_id)
);

create index if not exists
  audit_request_contexts_created_at_idx
on public.audit_request_contexts(created_at);

alter table public.audit_request_contexts
  enable row level security;

revoke all
on public.audit_request_contexts
from anon, authenticated;

create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  actor_user_id uuid
    references auth.users(id)
    on delete set null,
  actor_name text,
  actor_email text,
  action text not null,
  entity_type text not null,
  entity_id text,
  entity_label text,
  changed_fields text[] not null default '{}',
  old_values jsonb,
  new_values jsonb,
  ip_address inet,
  user_agent text,
  origin text not null default 'database',
  request_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists
  audit_events_organization_created_idx
on public.audit_events(
  organization_id,
  created_at desc
);

create index if not exists
  audit_events_entity_idx
on public.audit_events(
  organization_id,
  entity_type,
  entity_id,
  created_at desc
);

create index if not exists
  audit_events_actor_idx
on public.audit_events(
  organization_id,
  actor_user_id,
  created_at desc
);

create index if not exists
  audit_events_action_idx
on public.audit_events(
  organization_id,
  action,
  created_at desc
);

alter table public.audit_events
  enable row level security;

revoke insert, update, delete
on public.audit_events
from anon, authenticated;

grant select
on public.audit_events
to authenticated;

drop policy if exists
  "audit viewers can read organization events"
on public.audit_events;

create policy
  "audit viewers can read organization events"
on public.audit_events
for select
to authenticated
using (
  exists (
    select 1
    from public.organization_memberships membership
    where
      membership.organization_id =
        audit_events.organization_id
      and membership.user_id =
        (select auth.uid())
      and membership.is_active = true
      and membership.role in (
        'owner',
        'admin',
        'it_manager',
        'auditor'
      )
  )
);

create or replace function
  public.audit_safe_uuid(value text)
returns uuid
language plpgsql
immutable
set search_path = pg_catalog
as $$
begin
  return nullif(value, '')::uuid;
exception
  when others then
    return null;
end;
$$;

create or replace function
  public.audit_safe_inet(value text)
returns inet
language plpgsql
immutable
set search_path = pg_catalog
as $$
begin
  return nullif(split_part(value, ',', 1), '')::inet;
exception
  when others then
    return null;
end;
$$;

create or replace function
  public.audit_request_headers()
returns jsonb
language plpgsql
stable
set search_path = pg_catalog
as $$
declare
  raw_headers text;
begin
  raw_headers :=
    current_setting(
      'request.headers',
      true
    );

  if
    raw_headers is null
    or btrim(raw_headers) = ''
  then
    return '{}'::jsonb;
  end if;

  return raw_headers::jsonb;
exception
  when others then
    return '{}'::jsonb;
end;
$$;

create or replace function
  public.audit_redact_payload(payload jsonb)
returns jsonb
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  result jsonb :=
    coalesce(payload, '{}'::jsonb);
  key_name text;
begin
  for key_name in
    select jsonb_object_keys(result)
  loop
    if lower(key_name) ~
      '(password|secret|token|authorization|api.?key|credential)'
    then
      result :=
        jsonb_set(
          result,
          array[key_name],
          to_jsonb('[REDACTED]'::text),
          true
        );
    end if;
  end loop;

  return result;
end;
$$;

create or replace function
  public.audit_changed_fields(
    old_payload jsonb,
    new_payload jsonb
  )
returns text[]
language sql
immutable
set search_path = pg_catalog
as $$
  select coalesce(
    array_agg(field_name order by field_name),
    '{}'::text[]
  )
  from (
    select key as field_name
    from (
      select jsonb_object_keys(
        coalesce(old_payload, '{}'::jsonb)
      ) as key
      union
      select jsonb_object_keys(
        coalesce(new_payload, '{}'::jsonb)
      ) as key
    ) fields
    where
      key not in (
        'created_at',
        'updated_at'
      )
      and
      coalesce(old_payload, '{}'::jsonb) -> key
        is distinct from
      coalesce(new_payload, '{}'::jsonb) -> key
  ) changed;
$$;

create or replace function
  public.audit_entity_label(
    table_name text,
    payload jsonb
  )
returns text
language sql
immutable
set search_path = pg_catalog
as $$
  select nullif(
    coalesce(
      payload ->> 'asset_number',
      payload ->> 'ticket_number',
      payload ->> 'name',
      payload ->> 'title',
      payload ->> 'subject',
      payload ->> 'email',
      payload ->> 'user_id',
      payload ->> 'id'
    ),
    ''
  );
$$;

create or replace function
  public.audit_action_name(
    table_name text,
    operation text,
    changed text[]
  )
returns text
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  location_fields constant text[] :=
    array[
      'unit_id',
      'building_id',
      'floor_id',
      'department_id',
      'room_id',
      'rack_id',
      'workstation_id'
    ];

  responsible_fields constant text[] :=
    array[
      'assigned_person_name',
      'assigned_person_email',
      'assigned_at'
    ];

  location_changed boolean :=
    changed && location_fields;

  responsible_changed boolean :=
    changed && responsible_fields;
begin
  if operation = 'INSERT' then
    return 'created';
  end if;

  if operation = 'DELETE' then
    return 'deleted';
  end if;

  if table_name = 'assets' then
    if
      location_changed
      and responsible_changed
    then
      return
        'asset_location_and_responsible_changed';
    end if;

    if location_changed then
      return 'asset_location_changed';
    end if;

    if responsible_changed then
      return 'asset_responsible_changed';
    end if;

    if
      'operational_status' =
        any(changed)
    then
      return 'asset_status_changed';
    end if;
  end if;

  if
    table_name =
      'organization_memberships'
  then
    return 'access_changed';
  end if;

  return 'updated';
end;
$$;

create or replace function
  public.register_audit_request_context(
    p_request_id text,
    p_origin text,
    p_http_method text,
    p_resource text,
    p_ip text,
    p_user_agent text
  )
returns void
language plpgsql
security definer
set search_path =
  public,
  auth,
  pg_catalog,
  pg_temp
as $$
declare
  current_user_id uuid :=
    auth.uid();
begin
  if current_user_id is null then
    raise exception
      'authentication_required';
  end if;

  if
    p_request_id is null
    or length(p_request_id) < 8
    or length(p_request_id) > 120
    or p_request_id !~
      '^[A-Za-z0-9._:-]+$'
  then
    raise exception
      'invalid_request_id';
  end if;

  delete from
    public.audit_request_contexts
  where
    created_at <
      now() - interval '30 minutes';

  insert into
    public.audit_request_contexts (
      request_id,
      actor_user_id,
      ip_address,
      user_agent,
      origin,
      http_method,
      resource
    )
  values (
    p_request_id,
    current_user_id,
    public.audit_safe_inet(p_ip),
    left(nullif(p_user_agent, ''), 600),
    left(
      coalesce(
        nullif(p_origin, ''),
        'frontend'
      ),
      160
    ),
    left(
      upper(
        coalesce(
          nullif(p_http_method, ''),
          'UNKNOWN'
        )
      ),
      16
    ),
    left(nullif(p_resource, ''), 300)
  )
  on conflict (
    actor_user_id,
    request_id
  )
  do update set
    ip_address =
      excluded.ip_address,
    user_agent =
      excluded.user_agent,
    origin =
      excluded.origin,
    http_method =
      excluded.http_method,
    resource =
      excluded.resource,
    created_at = now();
end;
$$;

revoke all
on function
  public.register_audit_request_context(
    text,
    text,
    text,
    text,
    text,
    text
  )
from public, anon;

grant execute
on function
  public.register_audit_request_context(
    text,
    text,
    text,
    text,
    text,
    text
  )
to authenticated;

create or replace function
  public.capture_audit_event()
returns trigger
language plpgsql
security definer
set search_path =
  public,
  auth,
  pg_catalog,
  pg_temp
as $$
declare
  old_payload jsonb :=
    case
      when tg_op in (
        'UPDATE',
        'DELETE'
      )
      then to_jsonb(old)
      else null
    end;

  new_payload jsonb :=
    case
      when tg_op in (
        'INSERT',
        'UPDATE'
      )
      then to_jsonb(new)
      else null
    end;

  source_payload jsonb :=
    coalesce(
      new_payload,
      old_payload,
      '{}'::jsonb
    );

  organization_uuid uuid;
  current_user_id uuid :=
    auth.uid();
  jwt_payload jsonb :=
    coalesce(
      auth.jwt(),
      '{}'::jsonb
    );
  headers jsonb :=
    public.audit_request_headers();
  request_identifier text;
  context_row
    public.audit_request_contexts%rowtype;
  fields_changed text[];
  event_action text;
  client_info text;
  matched_request text[];
  derived_ip inet;
  derived_origin text;
  derived_user_agent text;
  event_metadata jsonb;
begin
  if tg_table_name =
    'organizations'
  then
    organization_uuid :=
      public.audit_safe_uuid(
        source_payload ->> 'id'
      );
  else
    organization_uuid :=
      public.audit_safe_uuid(
        source_payload ->>
          'organization_id'
      );
  end if;

  if organization_uuid is null then
    if tg_op = 'DELETE' then
      return old;
    end if;

    return new;
  end if;

  fields_changed :=
    case
      when tg_op = 'UPDATE'
      then public.audit_changed_fields(
        old_payload,
        new_payload
      )
      else
        array[]::text[]
    end;

  if
    tg_op = 'UPDATE'
    and cardinality(fields_changed) = 0
  then
    return new;
  end if;

  client_info :=
    coalesce(
      headers ->> 'x-client-info',
      ''
    );

  matched_request :=
    regexp_match(
      client_info,
      'ativelo-rid/([A-Za-z0-9._:-]+)'
    );

  request_identifier :=
    coalesce(
      matched_request[1],
      headers ->> 'x-request-id'
    );

  if
    current_user_id is not null
    and request_identifier is not null
  then
    select *
    into context_row
    from public.audit_request_contexts
    where
      actor_user_id =
        current_user_id
      and request_id =
        request_identifier
      and created_at >
        now() - interval '30 minutes'
    order by created_at desc
    limit 1;
  end if;

  derived_ip :=
    coalesce(
      context_row.ip_address,
      public.audit_safe_inet(
        headers ->>
          'cf-connecting-ip'
      ),
      public.audit_safe_inet(
        headers ->>
          'x-forwarded-for'
      ),
      public.audit_safe_inet(
        headers ->> 'x-real-ip'
      )
    );

  derived_origin :=
    coalesce(
      context_row.origin,
      'data_api:' || tg_table_name
    );

  derived_user_agent :=
    coalesce(
      context_row.user_agent,
      headers ->> 'user-agent'
    );

  event_action :=
    public.audit_action_name(
      tg_table_name,
      tg_op,
      fields_changed
    );

  event_metadata :=
    jsonb_strip_nulls(
      jsonb_build_object(
        'database_operation',
          lower(tg_op),
        'table',
          tg_table_name,
        'schema',
          tg_table_schema,
        'http_method',
          context_row.http_method,
        'resource',
          context_row.resource
      )
    );

  insert into public.audit_events (
    organization_id,
    actor_user_id,
    actor_name,
    actor_email,
    action,
    entity_type,
    entity_id,
    entity_label,
    changed_fields,
    old_values,
    new_values,
    ip_address,
    user_agent,
    origin,
    request_id,
    metadata
  )
  values (
    organization_uuid,
    current_user_id,
    coalesce(
      jwt_payload ->
        'user_metadata' ->>
        'full_name',
      jwt_payload ->
        'user_metadata' ->>
        'name',
      jwt_payload ->> 'email'
    ),
    jwt_payload ->> 'email',
    event_action,
    tg_table_name,
    source_payload ->> 'id',
    public.audit_entity_label(
      tg_table_name,
      source_payload
    ),
    fields_changed,
    case
      when old_payload is null
      then null
      else
        public.audit_redact_payload(
          old_payload
        )
    end,
    case
      when new_payload is null
      then null
      else
        public.audit_redact_payload(
          new_payload
        )
    end,
    derived_ip,
    left(
      nullif(
        derived_user_agent,
        ''
      ),
      600
    ),
    left(derived_origin, 160),
    left(
      nullif(
        request_identifier,
        ''
      ),
      120
    ),
    event_metadata
  );

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

revoke all
on function
  public.capture_audit_event()
from public, anon, authenticated;

create or replace function
  public.record_client_audit_events(
    p_organization_id uuid,
    p_events jsonb,
    p_ip text,
    p_user_agent text,
    p_origin text,
    p_request_id text
  )
returns integer
language plpgsql
security definer
set search_path =
  public,
  auth,
  pg_catalog,
  pg_temp
as $$
declare
  current_user_id uuid :=
    auth.uid();
  jwt_payload jsonb :=
    coalesce(
      auth.jwt(),
      '{}'::jsonb
    );
  event_item jsonb;
  event_action text;
  event_count integer := 0;
  entity_type_value text;
  entity_id_value text;
  entity_label_value text;
  metadata_value jsonb;
begin
  if current_user_id is null then
    raise exception
      'authentication_required';
  end if;

  if not exists (
    select 1
    from public.organization_memberships membership
    where
      membership.organization_id =
        p_organization_id
      and membership.user_id =
        current_user_id
      and membership.is_active = true
  ) then
    raise exception
      'organization_access_denied';
  end if;

  if
    jsonb_typeof(p_events) <>
      'array'
    or jsonb_array_length(p_events) = 0
    or jsonb_array_length(p_events) > 100
  then
    raise exception
      'invalid_audit_events';
  end if;

  for event_item in
    select value
    from jsonb_array_elements(
      p_events
    )
  loop
    entity_type_value :=
      left(
        coalesce(
          nullif(
            event_item ->>
              'entityType',
            ''
          ),
          'unknown'
        ),
        120
      );

    entity_id_value :=
      left(
        nullif(
          event_item ->> 'entityId',
          ''
        ),
        180
      );

    entity_label_value :=
      left(
        nullif(
          event_item ->>
            'entityLabel',
          ''
        ),
        300
      );

    event_action :=
      left(
        coalesce(
          nullif(
            event_item ->> 'action',
            ''
          ),
          'client_event'
        ),
        120
      );

    metadata_value :=
      case
        when
          jsonb_typeof(
            event_item -> 'metadata'
          ) = 'object'
        then
          event_item -> 'metadata'
        else
          '{}'::jsonb
      end;

    if
      entity_type_value = 'assets'
      and event_action =
        'label_printed'
      and exists (
        select 1
        from public.audit_events history
        where
          history.organization_id =
            p_organization_id
          and history.entity_type =
            'assets'
          and history.entity_id =
            entity_id_value
          and history.action in (
            'label_printed',
            'label_reprinted'
          )
      )
    then
      event_action :=
        'label_reprinted';
    end if;

    insert into public.audit_events (
      organization_id,
      actor_user_id,
      actor_name,
      actor_email,
      action,
      entity_type,
      entity_id,
      entity_label,
      changed_fields,
      old_values,
      new_values,
      ip_address,
      user_agent,
      origin,
      request_id,
      metadata
    )
    values (
      p_organization_id,
      current_user_id,
      coalesce(
        jwt_payload ->
          'user_metadata' ->>
          'full_name',
        jwt_payload ->
          'user_metadata' ->>
          'name',
        jwt_payload ->> 'email'
      ),
      jwt_payload ->> 'email',
      event_action,
      entity_type_value,
      entity_id_value,
      entity_label_value,
      array[]::text[],
      null,
      null,
      public.audit_safe_inet(p_ip),
      left(
        nullif(p_user_agent, ''),
        600
      ),
      left(
        coalesce(
          nullif(p_origin, ''),
          'frontend'
        ),
        160
      ),
      left(
        nullif(p_request_id, ''),
        120
      ),
      metadata_value
    );

    event_count :=
      event_count + 1;
  end loop;

  return event_count;
end;
$$;

revoke all
on function
  public.record_client_audit_events(
    uuid,
    jsonb,
    text,
    text,
    text,
    text
  )
from public, anon;

grant execute
on function
  public.record_client_audit_events(
    uuid,
    jsonb,
    text,
    text,
    text,
    text
  )
to authenticated;

do $$
declare
  target_table text;
  monitored_tables constant text[] :=
    array[
      'organizations',
      'organization_memberships',
      'organization_units',
      'buildings',
      'floors',
      'departments',
      'rooms',
      'racks',
      'workstations',
      'asset_categories',
      'manufacturers',
      'asset_models',
      'assets',
      'asset_photos',
      'support_tickets',
      'support_ticket_comments',
      'preventive_maintenance_plans',
      'maintenance_orders',
      'maintenance_order_items',
      'asset_loans',
      'loan_items',
      'inventory_audits',
      'inventory_audit_items',
      'inventory_agents',
      'discovered_devices'
    ];
  can_monitor boolean;
begin
  foreach target_table in
    array monitored_tables
  loop
    can_monitor := false;

    if
      to_regclass(
        'public.' || target_table
      ) is not null
    then
      if target_table =
        'organizations'
      then
        can_monitor := true;
      else
        select exists (
          select 1
          from information_schema.columns
          where
            table_schema = 'public'
            and table_name =
              target_table
            and column_name =
              'organization_id'
        )
        into can_monitor;
      end if;
    end if;

    if can_monitor then
      execute format(
        'drop trigger if exists ativelo_capture_audit_event on public.%I',
        target_table
      );

      execute format(
        'create trigger ativelo_capture_audit_event after insert or update or delete on public.%I for each row execute function public.capture_audit_event()',
        target_table
      );
    end if;
  end loop;
end;
$$;

comment on table public.audit_events is
  'Registro imutavel e centralizado das operacoes do Ativelo.';

comment on table public.audit_request_contexts is
  'Contexto temporario para relacionar operacoes do Data API com IP e origem capturados pelo Worker.';

commit;