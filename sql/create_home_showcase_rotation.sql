create table if not exists public.home_showcase_impressions (
  id uuid primary key default gen_random_uuid(),
  announcement_id uuid not null references public.announcements(id) on delete cascade,
  viewed_at timestamptz not null default now()
);

create index if not exists idx_home_showcase_impressions_announcement
  on public.home_showcase_impressions(announcement_id, viewed_at desc);

alter table public.home_showcase_impressions enable row level security;

drop policy if exists "Public can insert home showcase impressions" on public.home_showcase_impressions;
create policy "Public can insert home showcase impressions"
  on public.home_showcase_impressions
  for insert
  with check (true);

drop policy if exists "Admins can view home showcase impressions" on public.home_showcase_impressions;
create policy "Admins can view home showcase impressions"
  on public.home_showcase_impressions
  for select
  to authenticated
  using (public.is_admin() = true);

create or replace function public.get_home_showcase_impression_stats(
  p_announcement_ids uuid[]
)
returns table (
  announcement_id uuid,
  impressions_last_7_days bigint,
  last_seen_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    requested.announcement_id,
    coalesce(stats.impressions_last_7_days, 0) as impressions_last_7_days,
    stats.last_seen_at
  from unnest(coalesce(p_announcement_ids, array[]::uuid[])) as requested(announcement_id)
  left join (
    select
      hsi.announcement_id,
      count(*) filter (where hsi.viewed_at >= (now() - interval '7 days')) as impressions_last_7_days,
      max(hsi.viewed_at) as last_seen_at
    from public.home_showcase_impressions hsi
    where hsi.announcement_id = any(coalesce(p_announcement_ids, array[]::uuid[]))
    group by hsi.announcement_id
  ) stats on stats.announcement_id = requested.announcement_id;
$$;

grant execute on function public.get_home_showcase_impression_stats(uuid[]) to anon, authenticated;
