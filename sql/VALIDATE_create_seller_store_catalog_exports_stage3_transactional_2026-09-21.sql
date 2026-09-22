begin;

do $$
declare
  v_user_id uuid;
  v_announcement_id uuid;
  v_export_id uuid;
  v_worker_id uuid := gen_random_uuid();
  v_claimed public.seller_store_catalog_exports%rowtype;
  v_status text;
  v_expired_count integer;
begin
  select stores.user_id, announcements.id
  into v_user_id, v_announcement_id
  from public.seller_stores stores
  join public.announcements announcements
    on announcements.user_id = stores.user_id
   and announcements.status = 'ACTIVE'
  where stores.is_active = true
    and stores.is_store_feature_enabled = true
    and coalesce(stores.is_paused_due_to_plan, false) = false
    and exists (
      select 1
      from public.user_subscriptions subscriptions
      join public.plans plans on plans.id = subscriptions.plan_id
      where subscriptions.user_id = stores.user_id
        and subscriptions.status = 'active'
        and subscriptions.current_period_end > now()
        and coalesce(plans.has_seller_store, false) = true
    )
  order by stores.created_at
  limit 1;

  if v_user_id is null then
    raise exception 'VALIDATION_REQUIRES_ELIGIBLE_STORE_WITH_ACTIVE_ANNOUNCEMENT';
  end if;

  perform set_config('request.jwt.claims', json_build_object(
    'sub', v_user_id::text,
    'role', 'authenticated'
  )::text, true);

  if to_regclass('public.seller_store_catalog_runtime_settings') is not null then
    update public.seller_store_catalog_runtime_settings
    set processing_enabled = true, paused_reason = null
    where singleton = true;
  end if;

  v_export_id := public.request_seller_store_catalog_export(
    array[v_announcement_id],
    'Catalogo transacional etapa 3',
    'Validacao integral com rollback automatico',
    'hide'
  );

  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  select * into strict v_claimed
  from public.claim_seller_store_catalog_exports(1, v_worker_id)
  where id = v_export_id;
  if v_claimed.status <> 'processing' or v_claimed.attempts <> 1 or v_claimed.locked_by <> v_worker_id then
    raise exception 'Claim inicial invalido';
  end if;

  v_status := public.fail_seller_store_catalog_export(
    v_export_id, v_worker_id, 'TEST_TRANSIENT', 'Falha transitoria controlada', true
  );
  if v_status <> 'queued' then
    raise exception 'Retry nao retornou para a fila';
  end if;

  update public.seller_store_catalog_exports set next_attempt_at = now() where id = v_export_id;
  select * into strict v_claimed
  from public.claim_seller_store_catalog_exports(1, v_worker_id)
  where id = v_export_id;
  if v_claimed.attempts <> 2 or v_claimed.id <> v_export_id then
    raise exception 'Retry alterou o evento ou a contagem de tentativas';
  end if;

  if not public.complete_seller_store_catalog_export(
    v_export_id,
    v_worker_id,
    v_user_id::text || '/' || v_export_id::text || '.pdf',
    2048,
    4
  ) then
    raise exception 'Conclusao do catalogo falhou';
  end if;
  if (select status from public.seller_store_catalog_exports where id = v_export_id) <> 'ready' then
    raise exception 'Catalogo nao ficou pronto';
  end if;

  update public.seller_store_catalog_exports
  set created_at = now() - interval '2 days', expires_at = now() - interval '1 day'
  where id = v_export_id;
  select count(*) into v_expired_count
  from public.expire_seller_store_catalog_exports(10)
  where id = v_export_id;
  if v_expired_count <> 1 then
    raise exception 'Catalogo expirado nao entrou na limpeza';
  end if;
  if public.mark_seller_store_catalog_storage_deleted(array[v_export_id]) <> 1 then
    raise exception 'Limpeza do storage nao foi registrada';
  end if;
end;
$$;

rollback;
