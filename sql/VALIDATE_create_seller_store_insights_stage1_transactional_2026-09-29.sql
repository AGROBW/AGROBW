begin;

do $$
declare
  v_user_id uuid;
  v_store_id uuid;
  v_store_slug text;
  v_announcement_id uuid;
  v_subscription_id uuid;
  v_event_key uuid := gen_random_uuid();
  v_recorded boolean;
  v_available boolean;
  v_reason text;
  v_session_hash text;
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

  v_recorded := public.record_seller_store_insight_event(
    v_store_slug,
    'announcement_open',
    'stage1-validation-session',
    v_event_key,
    v_announcement_id,
    null,
    'internal'
  );

  if not v_recorded then
    raise exception 'PUBLIC_EVENT_WAS_NOT_RECORDED';
  end if;

  if public.record_seller_store_insight_event(
    v_store_slug,
    'announcement_open',
    'stage1-validation-session',
    v_event_key,
    v_announcement_id,
    null,
    'internal'
  ) then
    raise exception 'IDEMPOTENCY_KEY_DID_NOT_DEDUPLICATE';
  end if;

  select events.session_hash
  into strict v_session_hash
  from public.seller_store_insight_events events
  where events.event_key = v_event_key;

  if v_session_hash = 'stage1-validation-session'
     or v_session_hash <> md5(v_store_id::text || ':stage1-validation-session') then
    raise exception 'SESSION_WAS_NOT_STORE_SCOPED_AND_HASHED';
  end if;

  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_user_id::text, 'role', 'authenticated')::text,
    true
  );

  select availability.available, availability.reason
  into strict v_available, v_reason
  from public.get_my_seller_store_insights_availability() availability;

  if not v_available or v_reason <> 'AVAILABLE' then
    raise exception 'ELIGIBLE_OWNER_DID_NOT_RECEIVE_ACCESS';
  end if;

  if public.record_seller_store_insight_event(
    v_store_slug,
    'website_click',
    'stage1-owner-session',
    gen_random_uuid(),
    null,
    null,
    'internal'
  ) then
    raise exception 'OWNER_EVENT_WAS_NOT_IGNORED';
  end if;

  update public.user_subscriptions subscriptions
  set current_period_end = now() - interval '1 minute'
  where subscriptions.id = v_subscription_id;

  select availability.available, availability.reason
  into strict v_available, v_reason
  from public.get_my_seller_store_insights_availability() availability;

  if v_available or v_reason not in ('PLAN_REQUIRED', 'STORE_FEATURE_PAUSED') then
    raise exception 'EXPIRED_PLAN_STILL_HAS_ACCESS';
  end if;
end;
$$;

rollback;
