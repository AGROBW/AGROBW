begin;

set local lock_timeout = '5s';

do $$
begin
  if to_regclass('public.seller_store_insight_events') is null
     or to_regclass('public.site_page_views') is null
     or to_regclass('public.seller_stores') is null
     or to_regclass('public.announcements') is null
     or to_regprocedure('public.seller_store_insights_has_active_plan(uuid)') is null then
    raise exception 'SELLER_STORE_INSIGHTS_STAGE3_PREREQUISITES_MISSING';
  end if;
end;
$$;

alter table public.seller_store_insight_events
  drop constraint if exists seller_store_insight_events_type_check;

alter table public.seller_store_insight_events
  add constraint seller_store_insight_events_type_check check (
    event_type in (
      'store_visit_attribution',
      'announcement_open',
      'contact_whatsapp',
      'contact_platform',
      'website_click',
      'store_share',
      'catalog_generated',
      'catalog_download',
      'catalog_qr_open'
    )
  );

create index if not exists idx_site_page_views_storefront_entity_created
  on public.site_page_views (entity_key, created_at desc, session_id)
  where page_type = 'storefront' and is_admin_area = false;

create or replace function public.record_seller_store_insight_event(
  p_store_slug text,
  p_event_type text,
  p_session_id text,
  p_event_key uuid,
  p_announcement_id uuid default null,
  p_catalog_export_id uuid default null,
  p_source_channel text default 'direct'
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_store public.seller_stores%rowtype;
  v_now timestamptz := now();
  v_session_hash text;
  v_source_channel text;
  v_dedupe_bucket timestamptz;
  v_inserted integer := 0;
begin
  if coalesce(trim(p_store_slug), '') = ''
     or coalesce(trim(p_session_id), '') = ''
     or p_event_key is null then
    return false;
  end if;

  if p_event_type is null or p_event_type not in (
    'store_visit_attribution',
    'announcement_open',
    'contact_whatsapp',
    'contact_platform',
    'website_click',
    'store_share',
    'catalog_qr_open'
  ) then
    return false;
  end if;

  select stores.*
  into v_store
  from public.seller_stores stores
  where stores.slug = left(trim(p_store_slug), 160)
    and stores.is_active = true
    and stores.is_store_feature_enabled = true
    and coalesce(stores.is_paused_due_to_plan, false) = false
    and public.seller_store_insights_has_active_plan(stores.user_id)
  limit 1;

  if not found or auth.uid() = v_store.user_id then
    return false;
  end if;

  if p_event_type in ('announcement_open', 'contact_platform', 'catalog_qr_open')
     and p_announcement_id is null then
    return false;
  end if;

  if p_announcement_id is not null and not exists (
    select 1
    from public.announcements announcements
    where announcements.id = p_announcement_id
      and announcements.user_id = v_store.user_id
      and announcements.status = 'ACTIVE'
  ) then
    return false;
  end if;

  if p_event_type = 'catalog_qr_open' then
    if p_catalog_export_id is null or not exists (
      select 1
      from public.seller_store_catalog_exports exports
      where exports.id = p_catalog_export_id
        and exports.store_id = v_store.id
        and p_announcement_id = any(exports.announcement_ids)
    ) then
      return false;
    end if;
    v_source_channel := 'catalog_pdf';
  elsif p_catalog_export_id is not null then
    return false;
  else
    v_source_channel := case
      when p_source_channel in (
        'direct', 'internal', 'google', 'whatsapp', 'social', 'catalog_pdf', 'other'
      ) then p_source_channel
      else 'other'
    end;
  end if;

  v_session_hash := md5(v_store.id::text || ':' || left(p_session_id, 160));
  v_dedupe_bucket := to_timestamp(floor(extract(epoch from v_now) / 300) * 300);

  if (
    select count(*)
    from public.seller_store_insight_events events
    where events.store_id = v_store.id
      and events.session_hash = v_session_hash
      and events.created_at >= v_now - interval '1 minute'
  ) >= 30 then
    return false;
  end if;

  insert into public.seller_store_insight_events (
    event_key,
    store_id,
    announcement_id,
    catalog_export_id,
    event_type,
    source_channel,
    session_hash,
    dedupe_bucket,
    occurred_at
  ) values (
    p_event_key,
    v_store.id,
    p_announcement_id,
    p_catalog_export_id,
    p_event_type,
    v_source_channel,
    v_session_hash,
    v_dedupe_bucket,
    v_now
  )
  on conflict do nothing;

  get diagnostics v_inserted = row_count;
  return v_inserted = 1;
end;
$$;

revoke all on function public.record_seller_store_insight_event(
  text, text, text, uuid, uuid, uuid, text
) from public, anon, authenticated;
grant execute on function public.record_seller_store_insight_event(
  text, text, text, uuid, uuid, uuid, text
) to anon, authenticated;

create or replace function public.get_my_seller_store_insights(
  p_period_days integer default 30,
  p_top_limit integer default 5
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_store public.seller_stores%rowtype;
  v_period_days integer;
  v_top_limit integer;
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_current_start_date date;
  v_previous_start_date date;
  v_current_start timestamptz;
  v_current_end timestamptz;
  v_previous_start timestamptz;
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception 'SELLER_STORE_INSIGHTS_AUTH_REQUIRED' using errcode = '42501';
  end if;

  if p_period_days is null or p_period_days not in (7, 30, 90) then
    raise exception 'SELLER_STORE_INSIGHTS_INVALID_PERIOD' using errcode = '22023';
  end if;

  v_period_days := p_period_days;
  v_top_limit := least(greatest(coalesce(p_top_limit, 5), 1), 10);
  v_current_start_date := v_today - (v_period_days - 1);
  v_previous_start_date := v_current_start_date - v_period_days;
  v_current_start := v_current_start_date::timestamp at time zone 'America/Sao_Paulo';
  v_current_end := (v_today + 1)::timestamp at time zone 'America/Sao_Paulo';
  v_previous_start := v_previous_start_date::timestamp at time zone 'America/Sao_Paulo';

  select stores.*
  into v_store
  from public.seller_stores stores
  where stores.user_id = v_user_id
  limit 1;

  if not found then
    raise exception 'SELLER_STORE_INSIGHTS_STORE_NOT_FOUND' using errcode = '42501';
  end if;

  if not public.seller_store_insights_has_active_plan(v_user_id) then
    raise exception 'SELLER_STORE_INSIGHTS_PLAN_REQUIRED' using errcode = '42501';
  end if;

  if not coalesce(v_store.is_store_feature_enabled, false)
     or coalesce(v_store.is_paused_due_to_plan, false) then
    raise exception 'SELLER_STORE_INSIGHTS_STORE_FEATURE_PAUSED' using errcode = '42501';
  end if;

  with visit_summary as (
    select
      count(distinct views.session_id) filter (
        where views.created_at >= v_current_start and views.created_at < v_current_end
      )::bigint as current_visits,
      count(distinct views.session_id) filter (
        where views.created_at >= v_previous_start and views.created_at < v_current_start
      )::bigint as previous_visits
    from public.site_page_views views
    where views.page_type = 'storefront'
      and views.entity_key = v_store.slug
      and views.is_admin_area = false
      and views.created_at >= v_previous_start
      and views.created_at < v_current_end
      and views.user_id is distinct from v_user_id
  ),
  event_summary as (
    select
      count(distinct events.session_hash) filter (
        where events.occurred_at >= v_current_start
          and events.event_type = 'announcement_open'
      )::bigint as current_opens,
      count(distinct events.session_hash) filter (
        where events.occurred_at >= v_previous_start and events.occurred_at < v_current_start
          and events.event_type = 'announcement_open'
      )::bigint as previous_opens,
      count(distinct events.session_hash) filter (
        where events.occurred_at >= v_current_start
          and events.event_type in ('contact_whatsapp', 'contact_platform')
      )::bigint as current_contacts,
      count(distinct events.session_hash) filter (
        where events.occurred_at >= v_previous_start and events.occurred_at < v_current_start
          and events.event_type in ('contact_whatsapp', 'contact_platform')
      )::bigint as previous_contacts,
      count(*) filter (
        where events.occurred_at >= v_current_start and events.event_type = 'contact_whatsapp'
      )::bigint as whatsapp_clicks,
      count(*) filter (
        where events.occurred_at >= v_current_start and events.event_type = 'contact_platform'
      )::bigint as platform_contacts,
      count(*) filter (
        where events.occurred_at >= v_current_start and events.event_type = 'website_click'
      )::bigint as website_clicks,
      count(*) filter (
        where events.occurred_at >= v_current_start and events.event_type = 'store_share'
      )::bigint as store_shares,
      count(*) filter (
        where events.occurred_at >= v_current_start and events.event_type = 'catalog_generated'
      )::bigint as catalogs_generated,
      count(*) filter (
        where events.occurred_at >= v_current_start and events.event_type = 'catalog_download'
      )::bigint as catalog_downloads,
      count(*) filter (
        where events.occurred_at >= v_current_start and events.event_type = 'catalog_qr_open'
      )::bigint as catalog_qr_opens
    from public.seller_store_insight_events events
    where events.store_id = v_store.id
      and events.occurred_at >= v_previous_start
      and events.occurred_at < v_current_end
  ),
  source_counts as (
    select
      events.source_channel,
      count(distinct events.session_hash)::bigint as visitors
    from public.seller_store_insight_events events
    where events.store_id = v_store.id
      and events.event_type = 'store_visit_attribution'
      and events.occurred_at >= v_current_start
      and events.occurred_at < v_current_end
    group by events.source_channel
  ),
  source_total as (
    select coalesce(sum(source_counts.visitors), 0)::bigint as attributed_visitors
    from source_counts
  ),
  source_payload as (
    select
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'sourceChannel', source_counts.source_channel,
              'visitors', source_counts.visitors,
              'percentage', case
                when source_total.attributed_visitors = 0 then 0
                else round(source_counts.visitors * 100.0 / source_total.attributed_visitors, 2)
              end
            ) order by source_counts.visitors desc, source_counts.source_channel
          )
          from source_counts
        ),
        '[]'::jsonb
      ) as sources,
      source_total.attributed_visitors
    from source_total
  ),
  announcement_counts as (
    select
      events.announcement_id,
      max(announcements.title) as title,
      count(distinct events.session_hash) filter (
        where events.event_type = 'announcement_open'
      )::bigint as opens,
      count(distinct events.session_hash) filter (
        where events.event_type in ('contact_platform', 'catalog_qr_open')
      )::bigint as contacts
    from public.seller_store_insight_events events
    join public.announcements announcements
      on announcements.id = events.announcement_id
     and announcements.user_id = v_user_id
    where events.store_id = v_store.id
      and events.announcement_id is not null
      and events.occurred_at >= v_current_start
      and events.occurred_at < v_current_end
    group by events.announcement_id
  ),
  top_payload as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'announcementId', ranked.announcement_id,
          'title', ranked.title,
          'opens', ranked.opens,
          'contacts', ranked.contacts,
          'conversionRate', case
            when ranked.opens = 0 then 0
            else round(ranked.contacts * 100.0 / ranked.opens, 2)
          end
        ) order by ranked.opens desc, ranked.contacts desc, ranked.title
      ),
      '[]'::jsonb
    ) as announcements
    from (
      select *
      from announcement_counts
      order by opens desc, contacts desc, title
      limit v_top_limit
    ) ranked
  ),
  days as (
    select generate_series(v_current_start_date, v_today, interval '1 day')::date as day
  ),
  daily_visits as (
    select
      (views.created_at at time zone 'America/Sao_Paulo')::date as day,
      count(distinct views.session_id)::bigint as visits
    from public.site_page_views views
    where views.page_type = 'storefront'
      and views.entity_key = v_store.slug
      and views.is_admin_area = false
      and views.created_at >= v_current_start
      and views.created_at < v_current_end
      and views.user_id is distinct from v_user_id
    group by (views.created_at at time zone 'America/Sao_Paulo')::date
  ),
  daily_events as (
    select
      (events.occurred_at at time zone 'America/Sao_Paulo')::date as day,
      count(distinct events.session_hash) filter (
        where events.event_type = 'announcement_open'
      )::bigint as opens,
      count(distinct events.session_hash) filter (
        where events.event_type in ('contact_whatsapp', 'contact_platform')
      )::bigint as contacts
    from public.seller_store_insight_events events
    where events.store_id = v_store.id
      and events.occurred_at >= v_current_start
      and events.occurred_at < v_current_end
    group by (events.occurred_at at time zone 'America/Sao_Paulo')::date
  ),
  daily_payload as (
    select jsonb_agg(
      jsonb_build_object(
        'date', to_char(days.day, 'YYYY-MM-DD'),
        'storeVisits', coalesce(daily_visits.visits, 0),
        'announcementOpens', coalesce(daily_events.opens, 0),
        'contactActions', coalesce(daily_events.contacts, 0)
      ) order by days.day
    ) as daily
    from days
    left join daily_visits using (day)
    left join daily_events using (day)
  )
  select jsonb_build_object(
    'storeId', v_store.id,
    'storeSlug', v_store.slug,
    'generatedAt', now(),
    'period', jsonb_build_object(
      'days', v_period_days,
      'timezone', 'America/Sao_Paulo',
      'currentStart', v_current_start_date,
      'currentEnd', v_today,
      'previousStart', v_previous_start_date,
      'previousEnd', v_current_start_date - 1
    ),
    'summary', jsonb_build_object(
      'storeVisits', visit_summary.current_visits,
      'announcementOpens', event_summary.current_opens,
      'contactActions', event_summary.current_contacts,
      'conversionRate', case
        when visit_summary.current_visits = 0 then 0
        else round(event_summary.current_contacts * 100.0 / visit_summary.current_visits, 2)
      end,
      'whatsappClicks', event_summary.whatsapp_clicks,
      'platformContacts', event_summary.platform_contacts,
      'websiteClicks', event_summary.website_clicks,
      'storeShares', event_summary.store_shares,
      'catalogsGenerated', event_summary.catalogs_generated,
      'catalogDownloads', event_summary.catalog_downloads,
      'catalogQrOpens', event_summary.catalog_qr_opens
    ),
    'comparison', jsonb_build_object(
      'storeVisits', jsonb_build_object(
        'current', visit_summary.current_visits,
        'previous', visit_summary.previous_visits,
        'changePercent', case
          when visit_summary.previous_visits = 0 then case when visit_summary.current_visits = 0 then 0 else 100 end
          else round((visit_summary.current_visits - visit_summary.previous_visits) * 100.0 / visit_summary.previous_visits, 2)
        end
      ),
      'announcementOpens', jsonb_build_object(
        'current', event_summary.current_opens,
        'previous', event_summary.previous_opens,
        'changePercent', case
          when event_summary.previous_opens = 0 then case when event_summary.current_opens = 0 then 0 else 100 end
          else round((event_summary.current_opens - event_summary.previous_opens) * 100.0 / event_summary.previous_opens, 2)
        end
      ),
      'contactActions', jsonb_build_object(
        'current', event_summary.current_contacts,
        'previous', event_summary.previous_contacts,
        'changePercent', case
          when event_summary.previous_contacts = 0 then case when event_summary.current_contacts = 0 then 0 else 100 end
          else round((event_summary.current_contacts - event_summary.previous_contacts) * 100.0 / event_summary.previous_contacts, 2)
        end
      ),
      'conversionRate', jsonb_build_object(
        'current', case
          when visit_summary.current_visits = 0 then 0
          else round(event_summary.current_contacts * 100.0 / visit_summary.current_visits, 2)
        end,
        'previous', case
          when visit_summary.previous_visits = 0 then 0
          else round(event_summary.previous_contacts * 100.0 / visit_summary.previous_visits, 2)
        end,
        'changePercentagePoints', round(
          (case when visit_summary.current_visits = 0 then 0 else event_summary.current_contacts * 100.0 / visit_summary.current_visits end)
          - (case when visit_summary.previous_visits = 0 then 0 else event_summary.previous_contacts * 100.0 / visit_summary.previous_visits end),
          2
        )
      )
    ),
    'sourceCoverage', jsonb_build_object(
      'attributedVisitors', source_payload.attributed_visitors,
      'totalVisitors', visit_summary.current_visits
    ),
    'sources', source_payload.sources,
    'topAnnouncements', top_payload.announcements,
    'daily', daily_payload.daily
  )
  into v_result
  from visit_summary
  cross join event_summary
  cross join source_payload
  cross join top_payload
  cross join daily_payload;

  return v_result;
end;
$$;

revoke all on function public.get_my_seller_store_insights(integer, integer)
  from public, anon, authenticated;
grant execute on function public.get_my_seller_store_insights(integer, integer)
  to authenticated;

comment on function public.get_my_seller_store_insights(integer, integer) is
  'Returns only aggregated Seller Store Insights for the authenticated eligible store owner.';

commit;
