-- Upsell contextual: configuracao, telemetria e fila de recuperacao segura.
-- A funcionalidade nasce desativada e a fila nao realiza qualquer envio externo.

begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $$
begin
  if to_regprocedure('public.is_admin()') is null then
    raise exception 'public.is_admin() nao existe';
  end if;
  if to_regclass('public.users') is null
    or to_regclass('public.plans') is null
    or to_regclass('public.user_subscriptions') is null
    or to_regclass('public.admin_audit_logs') is null then
    raise exception 'Dependencias do upsell contextual nao estao disponiveis';
  end if;
end;
$$;

create table if not exists public.contextual_upsell_settings (
  id uuid primary key default '00000000-0000-0000-0000-000000000041'::uuid,
  is_enabled boolean not null default false,
  recovery_enabled boolean not null default false,
  usage_threshold_percent smallint not null default 80
    check (usage_threshold_percent between 50 and 100),
  impression_cooldown_hours smallint not null default 72
    check (impression_cooldown_hours between 1 and 720),
  enabled_contexts text[] not null default '{}'::text[],
  canary_user_ids uuid[] not null default '{}'::uuid[],
  updated_by uuid null references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contextual_upsell_settings_singleton
    check (id = '00000000-0000-0000-0000-000000000041'::uuid),
  constraint contextual_upsell_settings_contexts
    check (enabled_contexts <@ array['ad_limit', 'lead_locked']::text[]),
  constraint contextual_upsell_settings_canary_limit
    check (cardinality(canary_user_ids) <= 50)
);

insert into public.contextual_upsell_settings (id)
values ('00000000-0000-0000-0000-000000000041'::uuid)
on conflict (id) do nothing;

create table if not exists public.contextual_upsell_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  context text not null check (context in ('ad_limit', 'lead_locked')),
  event_type text not null check (event_type in (
    'impression', 'click', 'dismiss', 'checkout_started', 'converted'
  )),
  offer_kind text not null check (offer_kind = 'plan'),
  target_plan_id uuid not null references public.plans(id) on delete cascade,
  source_event_id uuid null references public.contextual_upsell_events(id) on delete cascade,
  conversion_key text null,
  resource_type text null check (resource_type is null or resource_type in ('announcement', 'lead', 'radar')),
  resource_id uuid null,
  source_path text null check (
    source_path is null or (
      char_length(source_path) between 1 and 200
      and source_path ~ '^/[A-Za-z0-9_./%~-]*$'
    )
  ),
  created_at timestamptz not null default now(),
  constraint contextual_upsell_conversion_source check (
    (event_type = 'converted' and source_event_id is not null and conversion_key is not null)
    or (event_type <> 'converted' and source_event_id is null and conversion_key is null)
  ),
  constraint contextual_upsell_conversion_key_length check (
    conversion_key is null or char_length(conversion_key) between 1 and 200
  )
);

alter table public.contextual_upsell_events
  add column if not exists source_event_id uuid null
    references public.contextual_upsell_events(id) on delete cascade;
alter table public.contextual_upsell_events
  add column if not exists conversion_key text null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.contextual_upsell_events'::regclass
      and conname = 'contextual_upsell_conversion_source'
  ) then
    alter table public.contextual_upsell_events
      add constraint contextual_upsell_conversion_source check (
        (event_type = 'converted' and source_event_id is not null and conversion_key is not null)
        or (event_type <> 'converted' and source_event_id is null and conversion_key is null)
      ) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.contextual_upsell_events'::regclass
      and conname = 'contextual_upsell_conversion_key_length'
  ) then
    alter table public.contextual_upsell_events
      add constraint contextual_upsell_conversion_key_length check (
        conversion_key is null or char_length(conversion_key) between 1 and 200
      ) not valid;
  end if;
end;
$$;

alter table public.contextual_upsell_events
  alter column target_plan_id set not null;
alter table public.contextual_upsell_events
  drop constraint if exists contextual_upsell_events_target_plan_id_fkey;
alter table public.contextual_upsell_events
  add constraint contextual_upsell_events_target_plan_id_fkey
  foreign key (target_plan_id) references public.plans(id) on delete cascade;

create index if not exists idx_contextual_upsell_events_user_created
  on public.contextual_upsell_events (user_id, created_at desc);
create index if not exists idx_contextual_upsell_events_context_created
  on public.contextual_upsell_events (context, event_type, created_at desc);
drop index if exists public.idx_contextual_upsell_conversion_once;
create unique index idx_contextual_upsell_conversion_once
  on public.contextual_upsell_events (user_id, conversion_key)
  where event_type = 'converted' and conversion_key is not null;

delete from public.contextual_upsell_events duplicate
using public.contextual_upsell_events original
where duplicate.event_type = 'converted'
  and original.event_type = 'converted'
  and duplicate.source_event_id = original.source_event_id
  and duplicate.id > original.id;

create unique index if not exists idx_contextual_upsell_conversion_source_once
  on public.contextual_upsell_events (source_event_id)
  where event_type = 'converted' and source_event_id is not null;

create table if not exists public.contextual_upsell_recovery_queue (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  source_event_id uuid not null references public.contextual_upsell_events(id) on delete cascade,
  context text not null constraint contextual_upsell_recovery_context
    check (context in ('ad_limit', 'lead_locked')),
  offer_kind text not null constraint contextual_upsell_recovery_offer
    check (offer_kind = 'plan'),
  target_plan_id uuid not null references public.plans(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'cancelled', 'converted', 'expired')),
  available_at timestamptz not null default (now() + interval '2 hours'),
  expires_at timestamptz not null default (now() + interval '7 days'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_event_id)
);

alter table public.contextual_upsell_recovery_queue
  alter column target_plan_id set not null;
alter table public.contextual_upsell_recovery_queue
  drop constraint if exists contextual_upsell_recovery_queue_target_plan_id_fkey;
alter table public.contextual_upsell_recovery_queue
  add constraint contextual_upsell_recovery_queue_target_plan_id_fkey
  foreign key (target_plan_id) references public.plans(id) on delete cascade;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.contextual_upsell_recovery_queue'::regclass
      and conname = 'contextual_upsell_recovery_context'
  ) then
    alter table public.contextual_upsell_recovery_queue
      add constraint contextual_upsell_recovery_context
      check (context in ('ad_limit', 'lead_locked')) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.contextual_upsell_recovery_queue'::regclass
      and conname = 'contextual_upsell_recovery_offer'
  ) then
    alter table public.contextual_upsell_recovery_queue
      add constraint contextual_upsell_recovery_offer
      check (offer_kind = 'plan') not valid;
  end if;
end;
$$;

create index if not exists idx_contextual_upsell_recovery_pending
  on public.contextual_upsell_recovery_queue (available_at)
  where status = 'pending';
create unique index if not exists idx_contextual_upsell_recovery_one_pending_offer
  on public.contextual_upsell_recovery_queue (
    user_id, context, offer_kind, coalesce(target_plan_id, '00000000-0000-0000-0000-000000000000'::uuid)
  ) where status = 'pending';

alter table public.contextual_upsell_settings enable row level security;
alter table public.contextual_upsell_settings force row level security;
alter table public.contextual_upsell_events enable row level security;
alter table public.contextual_upsell_events force row level security;
alter table public.contextual_upsell_recovery_queue enable row level security;
alter table public.contextual_upsell_recovery_queue force row level security;

revoke all on table public.contextual_upsell_settings from public, anon, authenticated;
revoke all on table public.contextual_upsell_events from public, anon, authenticated;
revoke all on table public.contextual_upsell_recovery_queue from public, anon, authenticated;

create or replace function public.get_my_contextual_upsell_runtime()
returns table (
  enabled boolean,
  recovery_enabled boolean,
  usage_threshold_percent smallint,
  impression_cooldown_hours smallint,
  enabled_contexts text[]
)
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_settings public.contextual_upsell_settings%rowtype;
  v_available_contexts text[];
begin
  if v_user_id is null then
    raise exception 'Autenticacao obrigatoria' using errcode = '42501';
  end if;

  select * into strict v_settings
  from public.contextual_upsell_settings
  where id = '00000000-0000-0000-0000-000000000041'::uuid;

  select coalesce(array_agg(context_name order by context_name), '{}'::text[])
  into v_available_contexts
  from unnest(v_settings.enabled_contexts) as context_name
  where not exists (
    select 1
    from public.contextual_upsell_events events
    where events.user_id = v_user_id
      and events.context = context_name
      and events.event_type = 'impression'
      and events.created_at > now() - make_interval(hours => v_settings.impression_cooldown_hours)
  );

  return query select
    (v_settings.is_enabled or v_user_id = any(v_settings.canary_user_ids)),
    (v_settings.recovery_enabled and (v_settings.is_enabled or v_user_id = any(v_settings.canary_user_ids))),
    v_settings.usage_threshold_percent,
    v_settings.impression_cooldown_hours,
    v_available_contexts;
end;
$$;

create or replace function public.record_my_contextual_upsell_event(
  p_context text,
  p_event_type text,
  p_offer_kind text,
  p_target_plan_id uuid default null,
  p_resource_type text default null,
  p_resource_id uuid default null,
  p_source_path text default null
)
returns table (accepted boolean, event_id uuid, reason text)
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_settings public.contextual_upsell_settings%rowtype;
  v_event_id uuid;
begin
  if v_user_id is null then
    raise exception 'Autenticacao obrigatoria' using errcode = '42501';
  end if;

  select * into strict v_settings
  from public.contextual_upsell_settings
  where id = '00000000-0000-0000-0000-000000000041'::uuid;

  if not (v_settings.is_enabled or v_user_id = any(v_settings.canary_user_ids)) then
    return query select false, null::uuid, 'feature_disabled'::text;
    return;
  end if;

  if p_context is null or not (p_context = any(v_settings.enabled_contexts)) then
    return query select false, null::uuid, 'context_disabled'::text;
    return;
  end if;

  if p_event_type not in ('impression', 'click', 'dismiss', 'checkout_started')
    or p_offer_kind <> 'plan'
    or p_target_plan_id is null
    or (p_resource_type is not null and p_resource_type not in ('announcement', 'lead', 'radar'))
    or (p_source_path is not null and (
      char_length(p_source_path) not between 1 and 200
      or p_source_path !~ '^/[A-Za-z0-9_./%~-]*$'
    )) then
    raise exception 'Evento de upsell invalido' using errcode = '22023';
  end if;

  if p_target_plan_id is not null and not exists (
    select 1 from public.plans plans
    where plans.id = p_target_plan_id
      and plans.is_active
      and not plans.is_downgrade_plan
      and plans.show_in_public_pricing is true
  ) then
    raise exception 'Plano de destino invalido' using errcode = '22023';
  end if;

  -- Serializa cooldown e rate limit por usuario para impedir estouro por concorrencia.
  perform pg_advisory_xact_lock(
    hashtextextended('contextual-upsell:' || v_user_id::text, 0)
  );

  if p_event_type = 'impression' and exists (
    select 1
    from public.contextual_upsell_events events
    where events.user_id = v_user_id
      and events.context = p_context
      and events.event_type = 'impression'
      and events.created_at > now() - make_interval(hours => v_settings.impression_cooldown_hours)
  ) then
    return query select false, null::uuid, 'cooldown'::text;
    return;
  end if;

  if (select count(*) from public.contextual_upsell_events events
      where events.user_id = v_user_id and events.created_at > now() - interval '1 hour') >= 100 then
    return query select false, null::uuid, 'rate_limited'::text;
    return;
  end if;

  insert into public.contextual_upsell_events (
    user_id, context, event_type, offer_kind, target_plan_id,
    resource_type, resource_id, source_path
  ) values (
    v_user_id, p_context, p_event_type, p_offer_kind, p_target_plan_id,
    p_resource_type, p_resource_id, nullif(trim(p_source_path), '')
  ) returning id into v_event_id;

  if p_event_type = 'checkout_started' and v_settings.recovery_enabled then
    insert into public.contextual_upsell_recovery_queue (
      user_id, source_event_id, context, offer_kind, target_plan_id
    ) values (
      v_user_id, v_event_id, p_context, p_offer_kind, p_target_plan_id
    ) on conflict do nothing;
  end if;

  return query select true, v_event_id, 'accepted'::text;
end;
$$;

create or replace function public.get_contextual_upsell_admin()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_settings jsonb;
  v_metrics jsonb;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Acesso administrativo obrigatorio' using errcode = '42501';
  end if;

  select to_jsonb(settings) - 'canary_user_ids' || jsonb_build_object(
    'canary_user_ids', coalesce(to_jsonb(settings.canary_user_ids), '[]'::jsonb)
  ) into v_settings
  from public.contextual_upsell_settings settings
  where settings.id = '00000000-0000-0000-0000-000000000041'::uuid;

  select jsonb_build_object(
    'impressions_30d', count(*) filter (where event_type = 'impression'),
    'clicks_30d', count(*) filter (where event_type = 'click'),
    'checkout_started_30d', count(*) filter (where event_type = 'checkout_started'),
    'converted_30d', count(*) filter (where event_type = 'converted'),
    'pending_recovery', (select count(*) from public.contextual_upsell_recovery_queue where status = 'pending')
  ) into v_metrics
  from public.contextual_upsell_events
  where created_at >= now() - interval '30 days';

  return jsonb_build_object('settings', v_settings, 'metrics', v_metrics);
end;
$$;

create or replace function public.update_contextual_upsell_admin(
  p_is_enabled boolean,
  p_recovery_enabled boolean,
  p_usage_threshold_percent smallint,
  p_impression_cooldown_hours smallint,
  p_enabled_contexts text[],
  p_canary_user_ids uuid[] default '{}'::uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_admin record;
  v_old jsonb;
  v_new jsonb;
  v_old_canary_user_ids uuid[];
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Acesso administrativo obrigatorio' using errcode = '42501';
  end if;

  if p_usage_threshold_percent not between 50 and 100
    or p_impression_cooldown_hours not between 1 and 720
    or not coalesce(p_enabled_contexts, '{}'::text[]) <@ array['ad_limit', 'lead_locked']::text[]
    or cardinality(coalesce(p_canary_user_ids, '{}'::uuid[])) > 50
    or exists (
      select 1
      from unnest(coalesce(p_canary_user_ids, '{}'::uuid[])) as candidate(user_id)
      where not exists (select 1 from public.users users where users.id = candidate.user_id)
    ) then
    raise exception 'Configuracao de upsell invalida' using errcode = '22023';
  end if;

  select to_jsonb(settings), settings.canary_user_ids into v_old, v_old_canary_user_ids
  from public.contextual_upsell_settings settings
  where settings.id = '00000000-0000-0000-0000-000000000041'::uuid
  for update;

  update public.contextual_upsell_settings
  set is_enabled = p_is_enabled,
      recovery_enabled = p_recovery_enabled,
      usage_threshold_percent = p_usage_threshold_percent,
      impression_cooldown_hours = p_impression_cooldown_hours,
      enabled_contexts = coalesce(p_enabled_contexts, '{}'::text[]),
      canary_user_ids = coalesce(p_canary_user_ids, '{}'::uuid[]),
      updated_by = auth.uid(),
      updated_at = now()
  where id = '00000000-0000-0000-0000-000000000041'::uuid
  returning to_jsonb(contextual_upsell_settings.*) into v_new;

  if not p_recovery_enabled then
    update public.contextual_upsell_recovery_queue
    set status = 'cancelled', updated_at = now()
    where status = 'pending';
  end if;

  select users.id, users.email, users.name into strict v_admin
  from public.users users where users.id = auth.uid();

  insert into public.admin_audit_logs (
    admin_id, admin_email, admin_name, action, resource_type, resource_id,
    old_value, new_value, reason, metadata
  ) values (
    v_admin.id, coalesce(v_admin.email, 'email-indisponivel'),
    coalesce(v_admin.name, v_admin.email, 'Administrador'),
    'UPDATE_CONTEXTUAL_UPSELL', 'contextual_upsell_settings',
    '00000000-0000-0000-0000-000000000041'::uuid,
    v_old - 'canary_user_ids', v_new - 'canary_user_ids',
    'Configuracao de upsell contextual atualizada',
    jsonb_build_object(
      'source', 'admin_settings',
      'old_canary_count', cardinality(coalesce(v_old_canary_user_ids, '{}'::uuid[])),
      'new_canary_count', cardinality(coalesce(p_canary_user_ids, '{}'::uuid[])),
      'old_canary_hash', md5(coalesce(array_to_string(v_old_canary_user_ids, ','), '')),
      'new_canary_hash', md5(coalesce(array_to_string(p_canary_user_ids, ','), ''))
    )
  );

  return jsonb_build_object('success', true);
end;
$$;

drop trigger if exists trg_attribute_contextual_upsell_conversion on public.user_subscriptions;
drop function if exists public.attribute_contextual_upsell_conversion();
drop function if exists public.attribute_contextual_upsell_conversion(uuid, uuid);

create or replace function public.attribute_contextual_upsell_conversion(
  p_user_id uuid,
  p_plan_id uuid,
  p_conversion_key text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_checkout public.contextual_upsell_events%rowtype;
  v_conversion_id uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role obrigatoria' using errcode = '42501';
  end if;

  if p_user_id is null or p_plan_id is null
    or nullif(trim(p_conversion_key), '') is null
    or char_length(p_conversion_key) > 200 then
    return false;
  end if;

  select * into v_checkout
  from public.contextual_upsell_events events
  where events.user_id = p_user_id
    and events.event_type = 'checkout_started'
    and events.target_plan_id = p_plan_id
    and events.created_at >= now() - interval '7 days'
  order by events.created_at desc, events.id desc
  limit 1;

  if not found then
    return false;
  end if;

  insert into public.contextual_upsell_events (
    user_id, context, event_type, offer_kind, target_plan_id,
    source_event_id, conversion_key, source_path
  ) values (
    p_user_id, v_checkout.context, 'converted', v_checkout.offer_kind,
    p_plan_id, v_checkout.id, trim(p_conversion_key), '/checkout'
  ) on conflict do nothing
  returning id into v_conversion_id;

  update public.contextual_upsell_recovery_queue
  set status = 'converted', updated_at = now()
  where user_id = p_user_id and target_plan_id = p_plan_id and status = 'pending';

  return true;
end;
$$;

create or replace function public.purge_contextual_upsell_data()
returns table (events_deleted bigint, recovery_deleted bigint)
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_events bigint;
  v_recovery bigint;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role obrigatoria' using errcode = '42501';
  end if;

  update public.contextual_upsell_recovery_queue
  set status = 'expired', updated_at = now()
  where status = 'pending' and expires_at < now();

  delete from public.contextual_upsell_recovery_queue
  where updated_at < now() - interval '90 days'
    and status in ('cancelled', 'converted', 'expired');
  get diagnostics v_recovery = row_count;

  delete from public.contextual_upsell_events
  where created_at < now() - interval '180 days';
  get diagnostics v_events = row_count;

  return query select v_events, v_recovery;
end;
$$;

revoke all on function public.get_my_contextual_upsell_runtime() from public, anon, authenticated;
revoke all on function public.record_my_contextual_upsell_event(text, text, text, uuid, text, uuid, text) from public, anon, authenticated;
revoke all on function public.get_contextual_upsell_admin() from public, anon, authenticated;
revoke all on function public.update_contextual_upsell_admin(boolean, boolean, smallint, smallint, text[], uuid[]) from public, anon, authenticated;
revoke all on function public.purge_contextual_upsell_data() from public, anon, authenticated;
revoke all on function public.attribute_contextual_upsell_conversion(uuid, uuid, text) from public, anon, authenticated;

grant execute on function public.get_my_contextual_upsell_runtime() to authenticated;
grant execute on function public.record_my_contextual_upsell_event(text, text, text, uuid, text, uuid, text) to authenticated;
grant execute on function public.get_contextual_upsell_admin() to authenticated;
grant execute on function public.update_contextual_upsell_admin(boolean, boolean, smallint, smallint, text[], uuid[]) to authenticated;
grant execute on function public.purge_contextual_upsell_data() to service_role;
grant execute on function public.attribute_contextual_upsell_conversion(uuid, uuid, text) to service_role;

comment on table public.contextual_upsell_recovery_queue is
  'Fila interna de intencoes abandonadas. Nao contem contato e nao realiza envios.';

commit;
