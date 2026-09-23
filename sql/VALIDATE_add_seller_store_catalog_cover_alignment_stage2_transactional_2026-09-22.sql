begin;

do $$
declare
  v_user_id uuid;
  v_announcement_id uuid;
  v_export_id uuid;
  v_duplicate_id uuid;
  v_worker_id uuid := gen_random_uuid();
  v_alignment text;
  v_title text := 'Catalogo visual QA ' || txid_current()::text;
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

  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_user_id::text, 'role', 'authenticated')::text,
    true
  );

  if to_regclass('public.seller_store_catalog_runtime_settings') is not null then
    update public.seller_store_catalog_runtime_settings
    set processing_enabled = true, paused_reason = null
    where singleton = true;
  end if;

  v_export_id := public.request_seller_store_catalog_export_v2(
    array[v_announcement_id],
    v_title,
    'Validacao transacional com rollback',
    'consult',
    'left'
  );

  select exports.cover_alignment
  into strict v_alignment
  from public.seller_store_catalog_exports exports
  where exports.id = v_export_id;
  if v_alignment <> 'left' then
    raise exception 'Alinhamento novo nao foi persistido';
  end if;

  v_duplicate_id := public.request_seller_store_catalog_export_v2(
    array[v_announcement_id],
    v_title,
    'Validacao transacional com rollback',
    'consult',
    'left'
  );
  if v_duplicate_id <> v_export_id then
    raise exception 'Retry equivalente nao foi deduplicado';
  end if;

  begin
    perform public.request_seller_store_catalog_export_v2(
      array[v_announcement_id], v_title, 'Validacao transacional com rollback', 'consult', 'right'
    );
    raise exception 'VALIDATION_EXPECTED_ALIGNMENT_CONFLICT';
  exception
    when sqlstate '55000' then
      if sqlerrm not like '%CATALOG_EXPORT_ALIGNMENT_CONFLICT%' then
        raise;
      end if;
  end;

  select history.cover_alignment
  into strict v_alignment
  from public.list_my_seller_store_catalog_exports_v2(50) history
  where history.id = v_export_id;
  if v_alignment <> 'left' then
    raise exception 'Historico V2 nao retornou o alinhamento persistido';
  end if;

  update public.seller_store_catalog_exports
  set
    status = 'processing',
    attempts = attempts + 1,
    locked_at = now(),
    locked_by = v_worker_id,
    started_at = coalesce(started_at, now()),
    completed_at = null,
    error_code = null,
    error_message = null
  where id = v_export_id;

  begin
    perform public.request_seller_store_catalog_export_v2(
      array[v_announcement_id], v_title, 'Validacao transacional com rollback', 'consult', 'right'
    );
    raise exception 'VALIDATION_EXPECTED_PROCESSING_CONFLICT';
  exception
    when sqlstate '55000' then
      if sqlerrm not like '%CATALOG_EXPORT_ALREADY_PROCESSING%' then
        raise;
      end if;
  end;
end;
$$;

rollback;
