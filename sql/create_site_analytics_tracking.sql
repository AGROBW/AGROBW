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
  created_at timestamptz not null default now()
);

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
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_site_presence_last_seen_at
  on public.site_presence (last_seen_at desc);

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

drop policy if exists "Admins can read site page views" on public.site_page_views;
create policy "Admins can read site page views"
on public.site_page_views
for select
to authenticated
using (
  exists (
    select 1
    from public.users
    where users.id = auth.uid()
      and users.is_admin = true
  )
);

drop policy if exists "Admins can read site presence" on public.site_presence;
create policy "Admins can read site presence"
on public.site_presence
for select
to authenticated
using (
  exists (
    select 1
    from public.users
    where users.id = auth.uid()
      and users.is_admin = true
  )
);

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
  p_is_admin_area boolean default false
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
    is_admin_area
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
    coalesce(p_is_admin_area, false)
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
  p_is_admin_area boolean default false
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
    last_seen_at
  )
  values (
    p_session_id,
    p_user_id,
    coalesce(nullif(trim(p_current_path), ''), '/'),
    coalesce(nullif(trim(p_page_type), ''), 'page'),
    nullif(trim(coalesce(p_page_label, '')), ''),
    nullif(trim(coalesce(p_device_type, '')), ''),
    coalesce(p_is_admin_area, false),
    now()
  )
  on conflict (session_id) do update
    set user_id = excluded.user_id,
        current_path = excluded.current_path,
        page_type = excluded.page_type,
        page_label = excluded.page_label,
        device_type = excluded.device_type,
        is_admin_area = excluded.is_admin_area,
        last_seen_at = now();
end;
$$;

grant execute on function public.record_site_page_view(text, uuid, text, text, text, uuid, text, text, text, text, boolean) to anon, authenticated;
grant execute on function public.touch_site_presence(text, uuid, text, text, text, text, boolean) to anon, authenticated;

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
  with filtered_views as (
    select *
    from public.site_page_views
    where is_admin_area = false
      and created_at >= now() - make_interval(days => greatest(p_period_days, 1))
  ),
  online_presence as (
    select *
    from public.site_presence
    where is_admin_area = false
      and last_seen_at >= now() - interval '2 minutes'
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
      (current_date - greatest(p_period_days, 1) + 1) as start_date,
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
      created_at::date as bucket_date,
      count(*) as page_views,
      count(distinct session_id) as unique_visitors
    from public.site_page_views
    where is_admin_area = false
      and created_at >= now() - make_interval(days => greatest(p_period_days, 1))
    group by created_at::date
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
  where spv.is_admin_area = false
    and spv.created_at >= now() - make_interval(days => greatest(p_period_days, 1))
  group by spv.page_path
  order by views desc, unique_visitors desc, spv.page_path asc
  limit greatest(p_limit, 1);
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
  left join public.announcements a
    on a.id = spv.entity_id
  where spv.is_admin_area = false
    and spv.page_type = 'announcement'
    and spv.entity_id is not null
    and spv.created_at >= now() - make_interval(days => greatest(p_period_days, 1))
  group by spv.entity_id
  order by views desc, unique_visitors desc
  limit greatest(p_limit, 1);
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
  left join public.seller_stores ss
    on ss.slug = spv.entity_key
  where spv.is_admin_area = false
    and spv.page_type = 'storefront'
    and spv.entity_key is not null
    and spv.created_at >= now() - make_interval(days => greatest(p_period_days, 1))
  group by spv.entity_key
  order by views desc, unique_visitors desc
  limit greatest(p_limit, 1);
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
  left join public.users u
    on u.id = sp.user_id
  where sp.is_admin_area = false
    and sp.last_seen_at >= now() - interval '2 minutes'
  order by sp.last_seen_at desc
  limit greatest(p_limit, 1);
$$;

grant execute on function public.get_site_analytics_summary(integer) to authenticated;
grant execute on function public.get_site_analytics_time_series(integer) to authenticated;
grant execute on function public.get_site_analytics_top_pages(integer, integer) to authenticated;
grant execute on function public.get_site_analytics_top_announcements(integer, integer) to authenticated;
grant execute on function public.get_site_analytics_top_stores(integer, integer) to authenticated;
grant execute on function public.get_site_analytics_live_presence(integer) to authenticated;
