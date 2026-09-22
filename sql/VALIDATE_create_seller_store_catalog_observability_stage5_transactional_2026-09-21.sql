begin;

do $$
declare
  v_worker uuid := gen_random_uuid();
  v_run uuid;
  v_allowed boolean;
  v_limit integer;
  v_reason text;
  v_finished boolean;
  v_settings public.seller_store_catalog_runtime_settings%rowtype;
begin
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);

  select result.run_id, result.allowed, result.effective_limit, result.reason
  into v_run, v_allowed, v_limit, v_reason
  from public.begin_seller_store_catalog_worker_run(v_worker, 2) result;
  if v_allowed or v_reason <> 'CATALOG_WORKER_DISABLED' or v_limit <> 1 then
    raise exception 'Worker deveria nascer desativado';
  end if;

  update public.seller_store_catalog_runtime_settings
  set processing_enabled = true, max_batch_size = 2, failure_threshold = 2,
    consecutive_failures = 0, paused_reason = null
  where singleton = true;

  select result.run_id, result.allowed, result.effective_limit
  into v_run, v_allowed, v_limit
  from public.begin_seller_store_catalog_worker_run(v_worker, 2) result;
  if not v_allowed or v_limit <> 2 then
    raise exception 'Worker ativo nao iniciou com lote esperado';
  end if;

  select public.finish_seller_store_catalog_worker_run(
    v_run, false, '{"claimed":0}'::jsonb, 'TEST_FAILURE', 25
  ) into v_finished;
  if not v_finished then
    raise exception 'Falha nao foi registrada';
  end if;

  select result.run_id into v_run
  from public.begin_seller_store_catalog_worker_run(v_worker, 1) result
  where result.allowed = true;
  select public.finish_seller_store_catalog_worker_run(
    v_run, false, '{"claimed":0}'::jsonb, 'TEST_FAILURE_2', 30
  ) into v_finished;

  select * into v_settings
  from public.seller_store_catalog_runtime_settings
  where singleton = true;
  if v_settings.processing_enabled or v_settings.consecutive_failures <> 2
    or v_settings.paused_reason <> 'CATALOG_WORKER_CIRCUIT_BREAKER' then
    raise exception 'Circuit breaker nao interrompeu o processamento';
  end if;

  update public.seller_store_catalog_runtime_settings
  set processing_enabled = true, consecutive_failures = 0, paused_reason = null
  where singleton = true;
  select result.run_id into v_run
  from public.begin_seller_store_catalog_worker_run(v_worker, 1) result
  where result.allowed = true;
  select public.finish_seller_store_catalog_worker_run(
    v_run, true, '{"claimed":1,"ready":1}'::jsonb, null, 40
  ) into v_finished;

  select * into v_settings
  from public.seller_store_catalog_runtime_settings
  where singleton = true;
  if not v_finished or v_settings.consecutive_failures <> 0 or v_settings.last_success_at is null then
    raise exception 'Sucesso nao restaurou a saude do worker';
  end if;
end;
$$;

rollback;
