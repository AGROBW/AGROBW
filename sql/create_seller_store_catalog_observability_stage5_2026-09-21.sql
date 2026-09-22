begin;

set local lock_timeout = '5s';

do $$
begin
  if to_regclass('public.seller_store_catalog_exports') is null then
    raise exception 'seller_store_catalog_exports nao existe; aplique as etapas anteriores primeiro';
  end if;
end;
$$;

create table if not exists public.seller_store_catalog_runtime_settings (
  singleton boolean primary key default true check (singleton = true),
  processing_enabled boolean not null default false,
  max_batch_size integer not null default 1 check (max_batch_size between 1 and 2),
  failure_threshold integer not null default 3 check (failure_threshold between 2 and 10),
  consecutive_failures integer not null default 0 check (consecutive_failures between 0 and 1000),
  paused_reason text check (paused_reason is null or char_length(paused_reason) between 1 and 120),
  last_started_at timestamptz,
  last_success_at timestamptz,
  last_failure_at timestamptz,
  updated_at timestamptz not null default now()
);

insert into public.seller_store_catalog_runtime_settings (singleton)
values (true)
on conflict (singleton) do nothing;

create table if not exists public.seller_store_catalog_worker_runs (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null,
  status text not null check (status in ('running', 'succeeded', 'failed', 'skipped')),
  requested_limit integer not null check (requested_limit between 1 and 2),
  effective_limit integer not null check (effective_limit between 1 and 2),
  summary jsonb not null default '{}'::jsonb check (jsonb_typeof(summary) = 'object'),
  error_code text check (error_code is null or char_length(error_code) between 1 and 80),
  duration_ms integer check (duration_ms is null or duration_ms between 0 and 600000),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint seller_store_catalog_worker_runs_completion check (
    (status = 'running' and completed_at is null)
    or (status <> 'running' and completed_at is not null)
  )
);

create index if not exists idx_seller_store_catalog_worker_runs_recent
  on public.seller_store_catalog_worker_runs (started_at desc);
create index if not exists idx_seller_store_catalog_worker_runs_status
  on public.seller_store_catalog_worker_runs (status, started_at desc);

alter table public.seller_store_catalog_runtime_settings enable row level security;
alter table public.seller_store_catalog_runtime_settings force row level security;
alter table public.seller_store_catalog_worker_runs enable row level security;
alter table public.seller_store_catalog_worker_runs force row level security;

revoke all on table public.seller_store_catalog_runtime_settings from public, anon, authenticated;
revoke all on table public.seller_store_catalog_worker_runs from public, anon, authenticated;
grant select, insert, update on table public.seller_store_catalog_runtime_settings to service_role;
grant select, insert, update on table public.seller_store_catalog_worker_runs to service_role;

create or replace function public.begin_seller_store_catalog_worker_run(
  p_worker_id uuid,
  p_requested_limit integer default 1
)
returns table (run_id uuid, allowed boolean, effective_limit integer, reason text)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_settings public.seller_store_catalog_runtime_settings%rowtype;
  v_run_id uuid;
  v_requested_limit integer := least(greatest(coalesce(p_requested_limit, 1), 1), 2);
  v_stale_runs integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;
  if p_worker_id is null then
    raise exception 'Worker obrigatorio' using errcode = '22023';
  end if;

  select * into v_settings
  from public.seller_store_catalog_runtime_settings settings
  where settings.singleton = true
  for update;

  update public.seller_store_catalog_worker_runs runs
  set
    status = 'failed',
    error_code = 'CATALOG_WORKER_STALE_RUN',
    duration_ms = least(
      600000::numeric,
      greatest(0::numeric, extract(epoch from (now() - runs.started_at)) * 1000)
    )::integer,
    completed_at = now()
  where runs.status = 'running'
    and runs.started_at < now() - interval '10 minutes';
  get diagnostics v_stale_runs = row_count;

  delete from public.seller_store_catalog_worker_runs runs
  where runs.id in (
    select expired.id
    from public.seller_store_catalog_worker_runs expired
    where expired.completed_at < now() - interval '90 days'
    order by expired.completed_at
    limit 500
  );

  if v_stale_runs > 0 then
    v_settings.consecutive_failures := least(1000, v_settings.consecutive_failures + v_stale_runs);
    v_settings.last_failure_at := now();
    if v_settings.consecutive_failures >= v_settings.failure_threshold then
      v_settings.processing_enabled := false;
      v_settings.paused_reason := 'CATALOG_WORKER_CIRCUIT_BREAKER';
    end if;
  end if;

  if not v_settings.processing_enabled then
    insert into public.seller_store_catalog_worker_runs (
      worker_id, status, requested_limit, effective_limit, summary, error_code, completed_at
    ) values (
      p_worker_id, 'skipped', v_requested_limit, least(v_requested_limit, v_settings.max_batch_size),
      jsonb_build_object('reason', coalesce(v_settings.paused_reason, 'CATALOG_WORKER_DISABLED')),
      coalesce(v_settings.paused_reason, 'CATALOG_WORKER_DISABLED'), now()
    ) returning id into v_run_id;

    update public.seller_store_catalog_runtime_settings
    set
      consecutive_failures = v_settings.consecutive_failures,
      last_failure_at = v_settings.last_failure_at,
      processing_enabled = v_settings.processing_enabled,
      paused_reason = v_settings.paused_reason,
      updated_at = now()
    where singleton = true;

    return query select v_run_id, false, least(v_requested_limit, v_settings.max_batch_size),
      coalesce(v_settings.paused_reason, 'CATALOG_WORKER_DISABLED');
    return;
  end if;

  insert into public.seller_store_catalog_worker_runs (
    worker_id, status, requested_limit, effective_limit
  ) values (
    p_worker_id, 'running', v_requested_limit, least(v_requested_limit, v_settings.max_batch_size)
  ) returning id into v_run_id;

  update public.seller_store_catalog_runtime_settings
  set
    consecutive_failures = v_settings.consecutive_failures,
    last_failure_at = v_settings.last_failure_at,
    last_started_at = now(),
    updated_at = now()
  where singleton = true;

  return query select v_run_id, true, least(v_requested_limit, v_settings.max_batch_size), null::text;
end;
$$;

create or replace function public.finish_seller_store_catalog_worker_run(
  p_run_id uuid,
  p_succeeded boolean,
  p_summary jsonb,
  p_error_code text default null,
  p_duration_ms integer default null
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_updated integer;
  v_settings public.seller_store_catalog_runtime_settings%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;
  if p_run_id is null or jsonb_typeof(coalesce(p_summary, '{}'::jsonb)) <> 'object'
    or octet_length(coalesce(p_summary, '{}'::jsonb)::text) > 8192 then
    raise exception 'Resultado do worker invalido' using errcode = '22023';
  end if;

  update public.seller_store_catalog_worker_runs runs
  set
    status = case when coalesce(p_succeeded, false) then 'succeeded' else 'failed' end,
    summary = coalesce(p_summary, '{}'::jsonb),
    error_code = case when coalesce(p_succeeded, false) then null
      else left(coalesce(nullif(trim(p_error_code), ''), 'CATALOG_WORKER_BATCH_FAILED'), 80)
    end,
    duration_ms = least(600000, greatest(0, coalesce(p_duration_ms, 0))),
    completed_at = now()
  where runs.id = p_run_id
    and runs.status = 'running';
  get diagnostics v_updated = row_count;
  if v_updated <> 1 then
    return false;
  end if;

  select * into v_settings
  from public.seller_store_catalog_runtime_settings settings
  where settings.singleton = true
  for update;

  if coalesce(p_succeeded, false) then
    update public.seller_store_catalog_runtime_settings
    set consecutive_failures = 0, last_success_at = now(), updated_at = now()
    where singleton = true;
  else
    update public.seller_store_catalog_runtime_settings
    set
      consecutive_failures = least(1000, consecutive_failures + 1),
      last_failure_at = now(),
      processing_enabled = case
        when consecutive_failures + 1 >= failure_threshold then false
        else processing_enabled
      end,
      paused_reason = case
        when consecutive_failures + 1 >= failure_threshold then 'CATALOG_WORKER_CIRCUIT_BREAKER'
        else paused_reason
      end,
      updated_at = now()
    where singleton = true;
  end if;

  return true;
end;
$$;

create or replace function public.get_seller_store_catalog_health_admin()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_result jsonb;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'processing_enabled', settings.processing_enabled,
    'max_batch_size', settings.max_batch_size,
    'failure_threshold', settings.failure_threshold,
    'consecutive_failures', settings.consecutive_failures,
    'paused_reason', settings.paused_reason,
    'last_started_at', settings.last_started_at,
    'last_success_at', settings.last_success_at,
    'last_failure_at', settings.last_failure_at,
    'queued', count(*) filter (where exports.status = 'queued'),
    'processing', count(*) filter (where exports.status = 'processing'),
    'ready_24h', count(*) filter (where exports.status = 'ready' and exports.completed_at >= now() - interval '24 hours'),
    'failed_24h', count(*) filter (where exports.status = 'failed' and exports.completed_at >= now() - interval '24 hours'),
    'oldest_queued_at', min(exports.created_at) filter (where exports.status = 'queued')
  ) into v_result
  from public.seller_store_catalog_runtime_settings settings
  left join public.seller_store_catalog_exports exports on true
  where settings.singleton = true
  group by settings.singleton, settings.processing_enabled, settings.max_batch_size,
    settings.failure_threshold, settings.consecutive_failures, settings.paused_reason,
    settings.last_started_at, settings.last_success_at, settings.last_failure_at;

  return v_result;
end;
$$;

create or replace function public.get_seller_store_catalog_availability()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_enabled boolean;
begin
  if v_user_id is null then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;

  select settings.processing_enabled into v_enabled
  from public.seller_store_catalog_runtime_settings settings
  where settings.singleton = true;

  return jsonb_build_object('processing_enabled', coalesce(v_enabled, false));
end;
$$;

create or replace function public.update_seller_store_catalog_runtime_admin(
  p_processing_enabled boolean,
  p_max_batch_size integer default 1,
  p_failure_threshold integer default 3
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_result jsonb;
  v_current public.seller_store_catalog_runtime_settings%rowtype;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;
  if p_processing_enabled is null or p_max_batch_size not between 1 and 2
    or p_failure_threshold not between 2 and 10 then
    raise exception 'Configuracao invalida' using errcode = '22023';
  end if;

  select * into v_current
  from public.seller_store_catalog_runtime_settings settings
  where settings.singleton = true
  for update;

  if v_current.processing_enabled and p_processing_enabled
    and (v_current.max_batch_size <> p_max_batch_size
      or v_current.failure_threshold <> p_failure_threshold) then
    raise exception 'Pause o processamento antes de alterar lote ou limite de falhas'
      using errcode = '55000';
  end if;

  update public.seller_store_catalog_runtime_settings
  set
    processing_enabled = p_processing_enabled,
    max_batch_size = p_max_batch_size,
    failure_threshold = p_failure_threshold,
    consecutive_failures = case when p_processing_enabled then 0 else consecutive_failures end,
    paused_reason = case when p_processing_enabled then null else 'CATALOG_WORKER_MANUALLY_DISABLED' end,
    updated_at = now()
  where singleton = true
  returning jsonb_build_object(
    'processing_enabled', processing_enabled,
    'max_batch_size', max_batch_size,
    'failure_threshold', failure_threshold,
    'consecutive_failures', consecutive_failures,
    'paused_reason', paused_reason,
    'updated_at', updated_at
  ) into v_result;

  return v_result;
end;
$$;

create or replace function public.list_seller_store_catalog_worker_runs_admin(p_limit integer default 25)
returns table (
  id uuid,
  status text,
  requested_limit integer,
  effective_limit integer,
  summary jsonb,
  error_code text,
  duration_ms integer,
  started_at timestamptz,
  completed_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;

  return query
  select runs.id, runs.status, runs.requested_limit, runs.effective_limit,
    runs.summary, runs.error_code, runs.duration_ms, runs.started_at, runs.completed_at
  from public.seller_store_catalog_worker_runs runs
  order by runs.started_at desc
  limit least(greatest(coalesce(p_limit, 25), 1), 100);
end;
$$;

revoke all on function public.begin_seller_store_catalog_worker_run(uuid, integer) from public, anon, authenticated;
revoke all on function public.finish_seller_store_catalog_worker_run(uuid, boolean, jsonb, text, integer) from public, anon, authenticated;
grant execute on function public.begin_seller_store_catalog_worker_run(uuid, integer) to service_role;
grant execute on function public.finish_seller_store_catalog_worker_run(uuid, boolean, jsonb, text, integer) to service_role;

revoke all on function public.get_seller_store_catalog_health_admin() from public, anon, authenticated;
revoke all on function public.get_seller_store_catalog_availability() from public, anon, authenticated;
revoke all on function public.update_seller_store_catalog_runtime_admin(boolean, integer, integer) from public, anon, authenticated;
revoke all on function public.list_seller_store_catalog_worker_runs_admin(integer) from public, anon, authenticated;
grant execute on function public.get_seller_store_catalog_health_admin() to authenticated;
grant execute on function public.get_seller_store_catalog_availability() to authenticated;
grant execute on function public.update_seller_store_catalog_runtime_admin(boolean, integer, integer) to authenticated;
grant execute on function public.list_seller_store_catalog_worker_runs_admin(integer) to authenticated;

commit;
