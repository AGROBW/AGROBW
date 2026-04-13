alter table public.site_page_views
  add column if not exists user_city text,
  add column if not exists user_state text;

alter table public.site_presence
  add column if not exists user_city text,
  add column if not exists user_state text;

create or replace function public.record_site_page_view(
  p_session_id text,
  p_user_id uuid default null,
  p_page_path text default '/',
  p_page_type text default 'page',
  p_page_label text default null,
  p_entity_id uuid default null,
  p_entity_key text default null,
  p_referrer text default null,
  p_user_agent text default null,
  p_device_type text default null,
  p_is_admin_area boolean default false,
  p_user_city text default null,
  p_user_state text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(trim(p_session_id), '') = '' then
    return;
  end if;

  insert into public.site_page_views (
    session_id,
    user_id,
    page_path,
    page_type,
    page_label,
    entity_id,
    entity_key,
    referrer,
    user_agent,
    device_type,
    is_admin_area,
    user_city,
    user_state
  )
  values (
    p_session_id,
    p_user_id,
    coalesce(nullif(trim(p_page_path), ''), '/'),
    coalesce(nullif(trim(p_page_type), ''), 'page'),
    nullif(trim(coalesce(p_page_label, '')), ''),
    p_entity_id,
    nullif(trim(coalesce(p_entity_key, '')), ''),
    nullif(trim(coalesce(p_referrer, '')), ''),
    nullif(trim(coalesce(p_user_agent, '')), ''),
    nullif(trim(coalesce(p_device_type, '')), ''),
    coalesce(p_is_admin_area, false),
    nullif(trim(coalesce(p_user_city, '')), ''),
    upper(nullif(trim(coalesce(p_user_state, '')), ''))
  );
end;
$$;

create or replace function public.touch_site_presence(
  p_session_id text,
  p_user_id uuid default null,
  p_current_path text default '/',
  p_page_type text default 'page',
  p_page_label text default null,
  p_device_type text default null,
  p_is_admin_area boolean default false,
  p_user_city text default null,
  p_user_state text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(trim(p_session_id), '') = '' then
    return;
  end if;

  insert into public.site_presence (
    session_id,
    user_id,
    current_path,
    page_type,
    page_label,
    device_type,
    is_admin_area,
    last_seen_at,
    user_city,
    user_state
  )
  values (
    p_session_id,
    p_user_id,
    coalesce(nullif(trim(p_current_path), ''), '/'),
    coalesce(nullif(trim(p_page_type), ''), 'page'),
    nullif(trim(coalesce(p_page_label, '')), ''),
    nullif(trim(coalesce(p_device_type, '')), ''),
    coalesce(p_is_admin_area, false),
    now(),
    nullif(trim(coalesce(p_user_city, '')), ''),
    upper(nullif(trim(coalesce(p_user_state, '')), ''))
  )
  on conflict (session_id) do update
    set user_id = excluded.user_id,
        current_path = excluded.current_path,
        page_type = excluded.page_type,
        page_label = excluded.page_label,
        device_type = excluded.device_type,
        is_admin_area = excluded.is_admin_area,
        last_seen_at = now(),
        user_city = excluded.user_city,
        user_state = excluded.user_state;
end;
$$;

grant execute on function public.record_site_page_view(text, uuid, text, text, text, uuid, text, text, text, text, boolean, text, text) to anon, authenticated;
grant execute on function public.touch_site_presence(text, uuid, text, text, text, text, boolean, text, text) to anon, authenticated;

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
  select
    coalesce(nullif(trim(spv.device_type), ''), 'unknown') as device_type,
    count(*) as views,
    count(distinct spv.session_id) as unique_visitors
  from public.site_page_views spv
  where spv.is_admin_area = false
    and spv.created_at >= now() - make_interval(days => greatest(p_period_days, 1))
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
  with classified as (
    select
      case
        when spv.referrer is null or trim(spv.referrer) = '' then 'Direto'
        when spv.referrer ilike '%google.%' or spv.referrer ilike '%bing.%' or spv.referrer ilike '%yahoo.%' then 'Busca'
        when spv.referrer ilike '%instagram.%'
          or spv.referrer ilike '%facebook.%'
          or spv.referrer ilike '%linkedin.%'
          or spv.referrer ilike '%tiktok.%'
          or spv.referrer ilike '%youtube.%' then 'Redes sociais'
        when spv.referrer ilike '%agrobw%'
          or spv.referrer ilike '%127.0.0.1%'
          or spv.referrer ilike '%localhost%' then 'Interno'
        else 'Referência externa'
      end as source_label,
      spv.session_id
    from public.site_page_views spv
    where spv.is_admin_area = false
      and spv.created_at >= now() - make_interval(days => greatest(p_period_days, 1))
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
  with ranked as (
    select
      min(se.term) as term,
      se.normalized_term,
      count(*) as search_count
    from public.search_events se
    where se.created_at >= now() - make_interval(days => greatest(p_period_days, 1))
    group by se.normalized_term
  )
  select
    ranked.term,
    ranked.search_count
  from ranked
  where ranked.term is not null
  order by ranked.search_count desc, ranked.term asc
  limit greatest(p_limit, 1);
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
  select
    upper(coalesce(nullif(trim(spv.user_state), ''), 'Não informado')) as state,
    coalesce(nullif(trim(spv.user_city), ''), 'Não informado') as city,
    count(*) as views,
    count(distinct spv.session_id) as unique_visitors
  from public.site_page_views spv
  where spv.is_admin_area = false
    and spv.created_at >= now() - make_interval(days => greatest(p_period_days, 1))
  group by upper(coalesce(nullif(trim(spv.user_state), ''), 'Não informado')),
           coalesce(nullif(trim(spv.user_city), ''), 'Não informado')
  order by views desc, unique_visitors desc, state asc, city asc
  limit greatest(p_limit, 1);
$$;

grant execute on function public.get_site_analytics_device_breakdown(integer) to authenticated;
grant execute on function public.get_site_analytics_source_breakdown(integer) to authenticated;
grant execute on function public.get_site_analytics_top_searches(integer, integer) to authenticated;
grant execute on function public.get_site_analytics_geo_breakdown(integer, integer) to authenticated;
