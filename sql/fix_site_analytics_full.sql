create table if not exists public.site_page_views (
  id uuid primary key default gen_random_uuid(),
  session_id text not null,
  user_id uuid references public.users(id) on delete set null,
  page_path text not null,
  page_type text not null,
  page_label text,
  entity_id uuid,
  entity_key text,
  referrer text,
  user_agent text,
  device_type text,
  is_admin_area boolean not null default false,
  user_city text,
  user_state text,
  created_at timestamptz not null default now()
);

alter table public.site_page_views
  add column if not exists user_city text,
  add column if not exists user_state text;

create index if not exists idx_site_page_views_created_at
  on public.site_page_views (created_at desc);

create index if not exists idx_site_page_views_path_created_at
  on public.site_page_views (page_path, created_at desc);

create index if not exists idx_site_page_views_page_type_created_at
  on public.site_page_views (page_type, created_at desc);

create index if not exists idx_site_page_views_session_id
  on public.site_page_views (session_id);

create table if not exists public.site_presence (
  session_id text primary key,
  user_id uuid references public.users(id) on delete set null,
  current_path text not null,
  page_type text not null,
  page_label text,
  device_type text,
  is_admin_area boolean not null default false,
  user_city text,
  user_state text,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.site_presence
  add column if not exists user_city text,
  add column if not exists user_state text;

create index if not exists idx_site_presence_last_seen_at
  on public.site_presence (last_seen_at desc);

create table if not exists public.search_events (
  id uuid primary key default gen_random_uuid(),
  term text not null,
  normalized_term text not null,
  source text not null default 'hero_search',
  created_at timestamptz not null default now()
);

create index if not exists idx_search_events_created_at
  on public.search_events (created_at desc);

create index if not exists idx_search_events_normalized_term
  on public.search_events (normalized_term);

create or replace function public.site_analytics_is_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.users u
    where u.id = auth.uid()
      and (coalesce(u.is_admin, false) = true or u.role = 'admin')
  );
$$;

create or replace function public.touch_site_presence_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trigger_touch_site_presence_updated_at on public.site_presence;
create trigger trigger_touch_site_presence_updated_at
before update on public.site_presence
for each row
execute function public.touch_site_presence_updated_at();

alter table public.site_page_views enable row level security;
alter table public.site_presence enable row level security;
alter table public.search_events enable row level security;

drop policy if exists "Admins can read site page views" on public.site_page_views;
create policy "Admins can read site page views"
on public.site_page_views
for select
to authenticated
using (public.site_analytics_is_admin());

drop policy if exists "Admins can read site presence" on public.site_presence;
create policy "Admins can read site presence"
on public.site_presence
for select
to authenticated
using (public.site_analytics_is_admin());

drop policy if exists "Admins can manage search events" on public.search_events;
create policy "Admins can manage search events"
on public.search_events
for all
to authenticated
using (public.site_analytics_is_admin())
with check (public.site_analytics_is_admin());

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
declare
  v_user_id uuid := null;
begin
  if coalesce(trim(p_session_id), '') = '' then
    return;
  end if;

  if p_user_id is not null and auth.uid() = p_user_id then
    v_user_id := p_user_id;
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
    left(p_session_id, 160),
    v_user_id,
    left(coalesce(nullif(trim(p_page_path), ''), '/'), 300),
    left(coalesce(nullif(trim(p_page_type), ''), 'page'), 80),
    left(nullif(trim(coalesce(p_page_label, '')), ''), 160),
    p_entity_id,
    left(nullif(trim(coalesce(p_entity_key, '')), ''), 160),
    left(nullif(trim(coalesce(p_referrer, '')), ''), 600),
    left(nullif(trim(coalesce(p_user_agent, '')), ''), 700),
    left(nullif(trim(coalesce(p_device_type, '')), ''), 60),
    coalesce(p_is_admin_area, false),
    left(nullif(trim(coalesce(p_user_city, '')), ''), 120),
    left(upper(nullif(trim(coalesce(p_user_state, '')), '')), 2)
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
declare
  v_user_id uuid := null;
begin
  if coalesce(trim(p_session_id), '') = '' then
    return;
  end if;

  if p_user_id is not null and auth.uid() = p_user_id then
    v_user_id := p_user_id;
  end if;

  insert into public.site_presence (
    session_id,
    user_id,
    current_path,
    page_type,
    page_label,
    device_type,
    is_admin_area,
    user_city,
    user_state,
    last_seen_at
  )
  values (
    left(p_session_id, 160),
    v_user_id,
    left(coalesce(nullif(trim(p_current_path), ''), '/'), 300),
    left(coalesce(nullif(trim(p_page_type), ''), 'page'), 80),
    left(nullif(trim(coalesce(p_page_label, '')), ''), 160),
    left(nullif(trim(coalesce(p_device_type, '')), ''), 60),
    coalesce(p_is_admin_area, false),
    left(nullif(trim(coalesce(p_user_city, '')), ''), 120),
    left(upper(nullif(trim(coalesce(p_user_state, '')), '')), 2),
    now()
  )
  on conflict (session_id) do update
    set user_id = excluded.user_id,
        current_path = excluded.current_path,
        page_type = excluded.page_type,
        page_label = excluded.page_label,
        device_type = excluded.device_type,
        is_admin_area = excluded.is_admin_area,
        user_city = excluded.user_city,
        user_state = excluded.user_state,
        last_seen_at = now();
end;
$$;

create or replace function public.log_public_search(
  p_term text,
  p_source text default 'hero_search'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_term text;
  v_normalized_term text;
begin
  v_term := trim(coalesce(p_term, ''));

  if length(v_term) < 2 then
    return;
  end if;

  if length(v_term) > 80 then
    v_term := left(v_term, 80);
  end if;

  v_normalized_term := lower(regexp_replace(v_term, '[^[:alnum:]]+', ' ', 'g'));
  v_normalized_term := trim(regexp_replace(v_normalized_term, '\s+', ' ', 'g'));

  if v_normalized_term = '' then
    return;
  end if;

  insert into public.search_events (term, normalized_term, source)
  values (v_term, v_normalized_term, left(coalesce(nullif(trim(p_source), ''), 'hero_search'), 80));
end;
$$;

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
  filtered_views as (
    select spv.*
    from public.site_page_views spv, admin_gate ag
    where ag.allowed
      and spv.is_admin_area = false
      and spv.created_at >= now() - make_interval(days => greatest(coalesce(p_period_days, 7), 1))
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
    select (current_date - greatest(coalesce(p_period_days, 7), 1) + 1) as start_date,
           current_date as end_date
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
      spv.created_at::date as bucket_date,
      count(*) as page_views,
      count(distinct spv.session_id) as unique_visitors
    from public.site_page_views spv
    where public.site_analytics_is_admin()
      and spv.is_admin_area = false
      and spv.created_at >= now() - make_interval(days => greatest(coalesce(p_period_days, 7), 1))
    group by spv.created_at::date
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
  select
    spv.page_path,
    max(spv.page_label) as page_label,
    max(spv.page_type) as page_type,
    count(*) as views,
    count(distinct spv.session_id) as unique_visitors
  from public.site_page_views spv
  where public.site_analytics_is_admin()
    and spv.is_admin_area = false
    and spv.created_at >= now() - make_interval(days => greatest(coalesce(p_period_days, 7), 1))
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
  select
    spv.entity_id as announcement_id,
    max(a.title) as announcement_title,
    count(*) as views,
    count(distinct spv.session_id) as unique_visitors
  from public.site_page_views spv
  left join public.announcements a on a.id = spv.entity_id
  where public.site_analytics_is_admin()
    and spv.is_admin_area = false
    and spv.page_type = 'announcement'
    and spv.entity_id is not null
    and spv.created_at >= now() - make_interval(days => greatest(coalesce(p_period_days, 7), 1))
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
  select
    spv.entity_key as store_slug,
    max(ss.store_name) as store_name,
    count(*) as views,
    count(distinct spv.session_id) as unique_visitors
  from public.site_page_views spv
  left join public.seller_stores ss on ss.slug = spv.entity_key
  where public.site_analytics_is_admin()
    and spv.is_admin_area = false
    and spv.page_type = 'storefront'
    and spv.entity_key is not null
    and spv.created_at >= now() - make_interval(days => greatest(coalesce(p_period_days, 7), 1))
  group by spv.entity_key
  order by views desc, unique_visitors desc
  limit greatest(coalesce(p_limit, 10), 1);
$$;

create or replace function public.get_site_analytics_live_presence(
  p_limit integer default 20
)
returns table (
  session_id text,
  user_id uuid,
  user_name text,
  current_path text,
  page_label text,
  page_type text,
  device_type text,
  last_seen_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    sp.session_id,
    sp.user_id,
    u.name as user_name,
    sp.current_path,
    sp.page_label,
    sp.page_type,
    sp.device_type,
    sp.last_seen_at
  from public.site_presence sp
  left join public.users u on u.id = sp.user_id
  where public.site_analytics_is_admin()
    and sp.is_admin_area = false
    and sp.last_seen_at >= now() - interval '2 minutes'
  order by sp.last_seen_at desc
  limit greatest(coalesce(p_limit, 20), 1);
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
  select
    coalesce(nullif(trim(spv.device_type), ''), 'unknown') as device_type,
    count(*) as views,
    count(distinct spv.session_id) as unique_visitors
  from public.site_page_views spv
  where public.site_analytics_is_admin()
    and spv.is_admin_area = false
    and spv.created_at >= now() - make_interval(days => greatest(coalesce(p_period_days, 7), 1))
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
    from public.site_page_views spv
    where public.site_analytics_is_admin()
      and spv.is_admin_area = false
      and spv.created_at >= now() - make_interval(days => greatest(coalesce(p_period_days, 7), 1))
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
    where public.site_analytics_is_admin()
      and se.created_at >= now() - make_interval(days => greatest(coalesce(p_period_days, 7), 1))
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
  with ranked as (
    select
      min(se.term) as term,
      se.normalized_term,
      count(*) as search_count
    from public.search_events se
    where se.created_at >= now() - make_interval(days => greatest(coalesce(p_days, 30), 1))
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
  select
    upper(coalesce(nullif(trim(spv.user_state), ''), 'NI')) as state,
    coalesce(nullif(trim(spv.user_city), ''), 'Nao informado') as city,
    count(*) as views,
    count(distinct spv.session_id) as unique_visitors
  from public.site_page_views spv
  where public.site_analytics_is_admin()
    and spv.is_admin_area = false
    and spv.created_at >= now() - make_interval(days => greatest(coalesce(p_period_days, 7), 1))
  group by upper(coalesce(nullif(trim(spv.user_state), ''), 'NI')),
           coalesce(nullif(trim(spv.user_city), ''), 'Nao informado')
  order by views desc, unique_visitors desc, state asc, city asc
  limit greatest(coalesce(p_limit, 10), 1);
$$;

revoke all on public.site_page_views from anon, authenticated;
revoke all on public.site_presence from anon, authenticated;
revoke all on public.search_events from anon, authenticated;

grant execute on function public.record_site_page_view(text, uuid, text, text, text, uuid, text, text, text, text, boolean, text, text) to anon, authenticated;
grant execute on function public.touch_site_presence(text, uuid, text, text, text, text, boolean, text, text) to anon, authenticated;
grant execute on function public.log_public_search(text, text) to anon, authenticated;
grant execute on function public.get_top_public_searches(integer, integer) to anon, authenticated;

grant execute on function public.get_site_analytics_summary(integer) to authenticated;
grant execute on function public.get_site_analytics_time_series(integer) to authenticated;
grant execute on function public.get_site_analytics_top_pages(integer, integer) to authenticated;
grant execute on function public.get_site_analytics_top_announcements(integer, integer) to authenticated;
grant execute on function public.get_site_analytics_top_stores(integer, integer) to authenticated;
grant execute on function public.get_site_analytics_live_presence(integer) to authenticated;
grant execute on function public.get_site_analytics_device_breakdown(integer) to authenticated;
grant execute on function public.get_site_analytics_source_breakdown(integer) to authenticated;
grant execute on function public.get_site_analytics_top_searches(integer, integer) to authenticated;
grant execute on function public.get_site_analytics_geo_breakdown(integer, integer) to authenticated;
grant execute on function public.site_analytics_is_admin() to authenticated;
