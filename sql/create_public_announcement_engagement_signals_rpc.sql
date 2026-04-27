create index if not exists idx_site_page_views_entity_created_at
  on public.site_page_views (entity_id, created_at desc)
  where page_type = 'announcement' and is_admin_area = false;

create index if not exists idx_leads_announcement_created_at
  on public.leads (announcement_id, created_at desc);

create or replace function public.get_public_announcement_engagement_signals(
  p_announcement_ids uuid[],
  p_period_days integer default 14
)
returns table (
  announcement_id uuid,
  views_last_period bigint,
  unique_visitors_last_period bigint,
  leads_last_period bigint,
  last_viewed_at timestamptz,
  last_lead_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  with requested_ids as (
    select distinct unnest(coalesce(p_announcement_ids, array[]::uuid[])) as announcement_id
  ),
  safe_period as (
    select greatest(least(coalesce(p_period_days, 14), 30), 1) as period_days
  ),
  recent_views as (
    select
      spv.entity_id as announcement_id,
      count(*) as views_last_period,
      count(distinct spv.session_id) as unique_visitors_last_period,
      max(spv.created_at) as last_viewed_at
    from public.site_page_views spv
    cross join safe_period sp
    inner join requested_ids ids on ids.announcement_id = spv.entity_id
    where spv.is_admin_area = false
      and spv.page_type = 'announcement'
      and spv.entity_id is not null
      and spv.created_at >= now() - make_interval(days => sp.period_days)
    group by spv.entity_id
  ),
  recent_leads as (
    select
      l.announcement_id,
      count(*) as leads_last_period,
      max(l.created_at) as last_lead_at
    from public.leads l
    cross join safe_period sp
    inner join requested_ids ids on ids.announcement_id = l.announcement_id
    where l.created_at >= now() - make_interval(days => sp.period_days)
    group by l.announcement_id
  )
  select
    ids.announcement_id,
    coalesce(rv.views_last_period, 0) as views_last_period,
    coalesce(rv.unique_visitors_last_period, 0) as unique_visitors_last_period,
    coalesce(rl.leads_last_period, 0) as leads_last_period,
    rv.last_viewed_at,
    rl.last_lead_at
  from requested_ids ids
  left join recent_views rv on rv.announcement_id = ids.announcement_id
  left join recent_leads rl on rl.announcement_id = ids.announcement_id;
$$;

grant execute on function public.get_public_announcement_engagement_signals(uuid[], integer) to anon, authenticated;
