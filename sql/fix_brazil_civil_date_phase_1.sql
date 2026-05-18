-- Fase 1: alinhar regras diarias com a data civil do Brasil (America/Sao_Paulo)
-- Sem alterar tipos de coluna nem regras de vencimento por instante.

alter table public.site_sponsor_impressions
  alter column impression_date
  set default ((now() AT TIME ZONE 'America/Sao_Paulo')::date);

update public.market_quotes
set reference_date = (now() AT TIME ZONE 'America/Sao_Paulo')::date
where code like 'cepea-%'
  and reference_date is null;

create or replace function public.get_site_analytics_summary(
  p_period_days integer default 7
)
returns table (
  total_page_views bigint,
  unique_visitors bigint,
  logged_in_visitors bigint,
  online_users bigint,
  online_logged_users bigint
)
language sql
security definer
set search_path = public
as $$
  with admin_gate as (
    select public.site_analytics_is_admin() as allowed
  ),
  bounds as (
    select
      ((now() AT TIME ZONE 'America/Sao_Paulo')::date - greatest(coalesce(p_period_days, 7), 1) + 1) as start_date,
      (now() AT TIME ZONE 'America/Sao_Paulo')::date as end_date
  ),
  filtered_views as (
    select spv.*
    from public.site_page_views spv, admin_gate ag, bounds b
    where ag.allowed
      and spv.is_admin_area = false
      and (spv.created_at AT TIME ZONE 'America/Sao_Paulo')::date between b.start_date and b.end_date
  ),
  online_presence as (
    select sp.*
    from public.site_presence sp, admin_gate ag
    where ag.allowed
      and sp.is_admin_area = false
      and sp.last_seen_at >= now() - interval '2 minutes'
  )
  select
    (select count(*) from filtered_views) as total_page_views,
    (select count(distinct session_id) from filtered_views) as unique_visitors,
    (select count(distinct user_id) from filtered_views where user_id is not null) as logged_in_visitors,
    (select count(distinct session_id) from online_presence) as online_users,
    (select count(distinct user_id) from online_presence where user_id is not null) as online_logged_users;
$$;

create or replace function public.get_site_analytics_time_series(
  p_period_days integer default 7
)
returns table (
  bucket_date date,
  page_views bigint,
  unique_visitors bigint
)
language sql
security definer
set search_path = public
as $$
  with bounds as (
    select
      ((now() AT TIME ZONE 'America/Sao_Paulo')::date - greatest(coalesce(p_period_days, 7), 1) + 1) as start_date,
      (now() AT TIME ZONE 'America/Sao_Paulo')::date as end_date
  ),
  days as (
    select generate_series(
      (select start_date from bounds),
      (select end_date from bounds),
      interval '1 day'
    )::date as bucket_date
  ),
  aggregated as (
    select
      (spv.created_at AT TIME ZONE 'America/Sao_Paulo')::date as bucket_date,
      count(*) as page_views,
      count(distinct spv.session_id) as unique_visitors
    from public.site_page_views spv, bounds b
    where public.site_analytics_is_admin()
      and spv.is_admin_area = false
      and (spv.created_at AT TIME ZONE 'America/Sao_Paulo')::date between b.start_date and b.end_date
    group by (spv.created_at AT TIME ZONE 'America/Sao_Paulo')::date
  )
  select
    d.bucket_date,
    coalesce(a.page_views, 0) as page_views,
    coalesce(a.unique_visitors, 0) as unique_visitors
  from days d
  left join aggregated a on a.bucket_date = d.bucket_date
  order by d.bucket_date asc;
$$;

create or replace function public.get_site_analytics_top_pages(
  p_period_days integer default 7,
  p_limit integer default 10
)
returns table (
  page_path text,
  page_label text,
  page_type text,
  views bigint,
  unique_visitors bigint
)
language sql
security definer
set search_path = public
as $$
  with bounds as (
    select
      ((now() AT TIME ZONE 'America/Sao_Paulo')::date - greatest(coalesce(p_period_days, 7), 1) + 1) as start_date,
      (now() AT TIME ZONE 'America/Sao_Paulo')::date as end_date
  )
  select
    spv.page_path,
    max(spv.page_label) as page_label,
    max(spv.page_type) as page_type,
    count(*) as views,
    count(distinct spv.session_id) as unique_visitors
  from public.site_page_views spv, bounds b
  where public.site_analytics_is_admin()
    and spv.is_admin_area = false
    and (spv.created_at AT TIME ZONE 'America/Sao_Paulo')::date between b.start_date and b.end_date
  group by spv.page_path
  order by views desc, unique_visitors desc, spv.page_path asc
  limit greatest(coalesce(p_limit, 10), 1);
$$;

create or replace function public.get_site_analytics_top_announcements(
  p_period_days integer default 7,
  p_limit integer default 10
)
returns table (
  announcement_id uuid,
  announcement_title text,
  views bigint,
  unique_visitors bigint
)
language sql
security definer
set search_path = public
as $$
  with bounds as (
    select
      ((now() AT TIME ZONE 'America/Sao_Paulo')::date - greatest(coalesce(p_period_days, 7), 1) + 1) as start_date,
      (now() AT TIME ZONE 'America/Sao_Paulo')::date as end_date
  )
  select
    spv.entity_id as announcement_id,
    max(a.title) as announcement_title,
    count(*) as views,
    count(distinct spv.session_id) as unique_visitors
  from public.site_page_views spv
  left join public.announcements a on a.id = spv.entity_id
  cross join bounds b
  where public.site_analytics_is_admin()
    and spv.is_admin_area = false
    and spv.page_type = 'announcement'
    and spv.entity_id is not null
    and (spv.created_at AT TIME ZONE 'America/Sao_Paulo')::date between b.start_date and b.end_date
  group by spv.entity_id
  order by views desc, unique_visitors desc
  limit greatest(coalesce(p_limit, 10), 1);
$$;

create or replace function public.get_site_analytics_top_stores(
  p_period_days integer default 7,
  p_limit integer default 10
)
returns table (
  store_slug text,
  store_name text,
  views bigint,
  unique_visitors bigint
)
language sql
security definer
set search_path = public
as $$
  with bounds as (
    select
      ((now() AT TIME ZONE 'America/Sao_Paulo')::date - greatest(coalesce(p_period_days, 7), 1) + 1) as start_date,
      (now() AT TIME ZONE 'America/Sao_Paulo')::date as end_date
  )
  select
    spv.entity_key as store_slug,
    max(ss.store_name) as store_name,
    count(*) as views,
    count(distinct spv.session_id) as unique_visitors
  from public.site_page_views spv
  left join public.seller_stores ss on ss.slug = spv.entity_key
  cross join bounds b
  where public.site_analytics_is_admin()
    and spv.is_admin_area = false
    and spv.page_type = 'storefront'
    and spv.entity_key is not null
    and (spv.created_at AT TIME ZONE 'America/Sao_Paulo')::date between b.start_date and b.end_date
  group by spv.entity_key
  order by views desc, unique_visitors desc
  limit greatest(coalesce(p_limit, 10), 1);
$$;

create or replace function public.get_site_analytics_device_breakdown(
  p_period_days integer default 7
)
returns table (
  device_type text,
  views bigint,
  unique_visitors bigint
)
language sql
security definer
set search_path = public
as $$
  with bounds as (
    select
      ((now() AT TIME ZONE 'America/Sao_Paulo')::date - greatest(coalesce(p_period_days, 7), 1) + 1) as start_date,
      (now() AT TIME ZONE 'America/Sao_Paulo')::date as end_date
  )
  select
    coalesce(nullif(trim(spv.device_type), ''), 'unknown') as device_type,
    count(*) as views,
    count(distinct spv.session_id) as unique_visitors
  from public.site_page_views spv, bounds b
  where public.site_analytics_is_admin()
    and spv.is_admin_area = false
    and (spv.created_at AT TIME ZONE 'America/Sao_Paulo')::date between b.start_date and b.end_date
  group by coalesce(nullif(trim(spv.device_type), ''), 'unknown')
  order by views desc, unique_visitors desc, device_type asc;
$$;

create or replace function public.get_site_analytics_source_breakdown(
  p_period_days integer default 7
)
returns table (
  source_label text,
  views bigint,
  unique_visitors bigint
)
language sql
security definer
set search_path = public
as $$
  with bounds as (
    select
      ((now() AT TIME ZONE 'America/Sao_Paulo')::date - greatest(coalesce(p_period_days, 7), 1) + 1) as start_date,
      (now() AT TIME ZONE 'America/Sao_Paulo')::date as end_date
  ),
  classified as (
    select
      case
        when spv.referrer is null or trim(spv.referrer) = '' then 'Direto'
        when spv.referrer ilike '%google.%'
          or spv.referrer ilike '%bing.%'
          or spv.referrer ilike '%yahoo.%'
          or spv.referrer ilike '%duckduckgo.%' then 'Busca'
        when spv.referrer ilike '%instagram.%'
          or spv.referrer ilike '%facebook.%'
          or spv.referrer ilike '%linkedin.%'
          or spv.referrer ilike '%tiktok.%'
          or spv.referrer ilike '%youtube.%'
          or spv.referrer ilike '%whatsapp.%' then 'Social'
        when spv.referrer ilike '%agrobw%'
          or spv.referrer ilike '%bwagro%'
          or spv.referrer ilike '%127.0.0.1%'
          or spv.referrer ilike '%localhost%' then 'Interno'
        else 'Referencia'
      end as source_label,
      spv.session_id
    from public.site_page_views spv, bounds b
    where public.site_analytics_is_admin()
      and spv.is_admin_area = false
      and (spv.created_at AT TIME ZONE 'America/Sao_Paulo')::date between b.start_date and b.end_date
  )
  select
    classified.source_label,
    count(*) as views,
    count(distinct classified.session_id) as unique_visitors
  from classified
  group by classified.source_label
  order by views desc, unique_visitors desc, source_label asc;
$$;

create or replace function public.get_site_analytics_top_searches(
  p_period_days integer default 7,
  p_limit integer default 10
)
returns table (
  term text,
  search_count bigint
)
language sql
security definer
set search_path = public
as $$
  with bounds as (
    select
      ((now() AT TIME ZONE 'America/Sao_Paulo')::date - greatest(coalesce(p_period_days, 7), 1) + 1) as start_date,
      (now() AT TIME ZONE 'America/Sao_Paulo')::date as end_date
  ),
  ranked as (
    select
      min(se.term) as term,
      se.normalized_term,
      count(*) as search_count
    from public.search_events se, bounds b
    where public.site_analytics_is_admin()
      and (se.created_at AT TIME ZONE 'America/Sao_Paulo')::date between b.start_date and b.end_date
    group by se.normalized_term
  )
  select
    ranked.term,
    ranked.search_count
  from ranked
  where ranked.term is not null
  order by ranked.search_count desc, ranked.term asc
  limit greatest(coalesce(p_limit, 10), 1);
$$;

create or replace function public.get_top_public_searches(
  p_limit integer default 5,
  p_days integer default 30
)
returns table (
  term text,
  search_count bigint
)
language sql
security definer
set search_path = public
as $$
  with bounds as (
    select
      ((now() AT TIME ZONE 'America/Sao_Paulo')::date - greatest(coalesce(p_days, 30), 1) + 1) as start_date,
      (now() AT TIME ZONE 'America/Sao_Paulo')::date as end_date
  ),
  ranked as (
    select
      min(se.term) as term,
      se.normalized_term,
      count(*) as search_count
    from public.search_events se, bounds b
    where (se.created_at AT TIME ZONE 'America/Sao_Paulo')::date between b.start_date and b.end_date
    group by se.normalized_term
  )
  select
    ranked.term,
    ranked.search_count
  from ranked
  where ranked.term is not null
  order by ranked.search_count desc, ranked.term asc
  limit greatest(coalesce(p_limit, 5), 1);
$$;

create or replace function public.get_site_analytics_geo_breakdown(
  p_period_days integer default 7,
  p_limit integer default 10
)
returns table (
  state text,
  city text,
  views bigint,
  unique_visitors bigint
)
language sql
security definer
set search_path = public
as $$
  with bounds as (
    select
      ((now() AT TIME ZONE 'America/Sao_Paulo')::date - greatest(coalesce(p_period_days, 7), 1) + 1) as start_date,
      (now() AT TIME ZONE 'America/Sao_Paulo')::date as end_date
  )
  select
    upper(coalesce(nullif(trim(spv.user_state), ''), 'NI')) as state,
    coalesce(nullif(trim(spv.user_city), ''), 'Nao informado') as city,
    count(*) as views,
    count(distinct spv.session_id) as unique_visitors
  from public.site_page_views spv, bounds b
  where public.site_analytics_is_admin()
    and spv.is_admin_area = false
    and (spv.created_at AT TIME ZONE 'America/Sao_Paulo')::date between b.start_date and b.end_date
  group by upper(coalesce(nullif(trim(spv.user_state), ''), 'NI')),
           coalesce(nullif(trim(spv.user_city), ''), 'Nao informado')
  order by views desc, unique_visitors desc, state asc, city asc
  limit greatest(coalesce(p_limit, 10), 1);
$$;
