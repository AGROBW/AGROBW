begin;

do $$
declare
  v_user_id uuid;
  v_store_id uuid;
  v_store_slug text;
  v_announcement_id uuid;
  v_subscription_id uuid;
  v_session_id text := 'stage3-validation-' || gen_random_uuid()::text;
  v_result jsonb;
  v_plan_denied boolean := false;
  v_invalid_period_denied boolean := false;
begin
  select
    stores.user_id,
    stores.id,
    stores.slug,
    announcements.id,
    subscriptions.id
  into
    v_user_id,
    v_store_id,
    v_store_slug,
    v_announcement_id,
    v_subscription_id
  from public.seller_stores stores
  join public.announcements announcements
    on announcements.user_id = stores.user_id
   and announcements.status = 'ACTIVE'
  join public.user_subscriptions subscriptions
    on subscriptions.user_id = stores.user_id
   and subscriptions.status = 'active'
   and subscriptions.current_period_end > now()
  join public.plans plans
    on plans.id = subscriptions.plan_id
   and coalesce(plans.has_seller_store, false) = true
  where stores.is_active = true
    and stores.is_store_feature_enabled = true
    and coalesce(stores.is_paused_due_to_plan, false) = false
  order by stores.created_at
  limit 1;

  if v_user_id is null then
    raise exception 'VALIDATION_REQUIRES_ELIGIBLE_STORE_WITH_ACTIVE_ANNOUNCEMENT';
  end if;

  perform set_config(
    'request.jwt.claims',
    json_build_object('role', 'anon')::text,
    true
  );

  if not public.record_seller_store_insight_event(
    v_store_slug,
    'store_visit_attribution',
    v_session_id,
    gen_random_uuid(),
    null,
    null,
    'google'
  ) then
    raise exception 'VISIT_ATTRIBUTION_WAS_NOT_RECORDED';
  end if;

  if not public.record_seller_store_insight_event(
    v_store_slug,
    'announcement_open',
    v_session_id,
    gen_random_uuid(),
    v_announcement_id,
    null,
    'google'
  ) then
    raise exception 'ANNOUNCEMENT_OPEN_WAS_NOT_RECORDED';
  end if;

  if not public.record_seller_store_insight_event(
    v_store_slug,
    'contact_platform',
    v_session_id,
    gen_random_uuid(),
    v_announcement_id,
    null,
    'google'
  ) then
    raise exception 'CONTACT_WAS_NOT_RECORDED';
  end if;

  for v_index in 1..5 loop
    if not public.record_seller_store_insight_event(
      '',
      'contact_platform',
      'stage3-direct-contact-' || v_index::text,
      gen_random_uuid(),
      v_announcement_id,
      null,
      'direct'
    ) then
      raise exception 'DIRECT_ANNOUNCEMENT_CONTACT_WAS_NOT_RECORDED';
    end if;
  end loop;

  insert into public.site_page_views (
    session_id,
    page_path,
    page_type,
    page_label,
    entity_key,
    device_type,
    is_admin_area,
    created_at
  ) values (
    v_session_id,
    '/loja/' || v_store_slug,
    'storefront',
    'Loja parceira',
    v_store_slug,
    'desktop',
    false,
    now()
  );

  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_user_id::text, 'role', 'authenticated')::text,
    true
  );

  v_result := public.get_my_seller_store_insights(7, 5);

  if (v_result #>> '{period,days}')::integer <> 7
     or v_result #>> '{period,timezone}' <> 'America/Sao_Paulo' then
    raise exception 'PERIOD_CONTRACT_INVALID';
  end if;

  if (v_result #>> '{summary,storeVisits}')::bigint < 1
     or (v_result #>> '{summary,announcementOpens}')::bigint < 1
     or (v_result #>> '{summary,contactActions}')::bigint < 6 then
    raise exception 'SUMMARY_DID_NOT_INCLUDE_VALIDATION_EVENTS';
  end if;

  if (v_result #>> '{summary,conversionRate}')::numeric > 100 then
    raise exception 'STORE_CONVERSION_EXCEEDED_100_PERCENT';
  end if;

  if jsonb_array_length(v_result -> 'daily') <> 7 then
    raise exception 'DAILY_SERIES_DOES_NOT_MATCH_PERIOD';
  end if;

  if not exists (
    select 1
    from jsonb_array_elements(v_result -> 'sources') source
    where source ->> 'sourceChannel' = 'google'
  ) then
    raise exception 'SOURCE_BREAKDOWN_MISSING_GOOGLE';
  end if;

  if not exists (
    select 1
    from jsonb_array_elements(v_result -> 'topAnnouncements') announcement
    where announcement ->> 'announcementId' = v_announcement_id::text
  ) then
    raise exception 'TOP_ANNOUNCEMENTS_MISSING_EVENT';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(v_result -> 'topAnnouncements') announcement
    where (announcement ->> 'conversionRate')::numeric > 100
  ) then
    raise exception 'ANNOUNCEMENT_CONVERSION_EXCEEDED_100_PERCENT';
  end if;

  begin
    perform public.get_my_seller_store_insights(14, 5);
  exception
    when sqlstate '22023' then
      v_invalid_period_denied := true;
  end;

  if not v_invalid_period_denied then
    raise exception 'INVALID_PERIOD_WAS_ACCEPTED';
  end if;

  update public.user_subscriptions subscriptions
  set current_period_end = now() - interval '1 minute'
  where subscriptions.id = v_subscription_id;

  begin
    perform public.get_my_seller_store_insights(7, 5);
  exception
    when sqlstate '42501' then
      v_plan_denied := true;
  end;

  if not v_plan_denied then
    raise exception 'EXPIRED_PLAN_RECEIVED_AGGREGATED_INSIGHTS';
  end if;
end;
$$;

rollback;
