alter table public.site_sponsor_impressions
  add column if not exists placement_key text not null default 'legacy';

alter table public.site_sponsor_clicks
  add column if not exists placement_key text not null default 'legacy';

drop index if exists public.idx_site_sponsor_impressions_unique_daily;
create unique index if not exists idx_site_sponsor_impressions_unique_daily
  on public.site_sponsor_impressions (
    sponsor_id,
    placement_key,
    session_id,
    page_path,
    impression_date,
    coalesce(slot_position, 0)
  );

create or replace function public.record_site_sponsor_impression(
  p_sponsor_id uuid,
  p_session_id text,
  p_page_path text default '/',
  p_slot_position integer default null,
  p_user_id uuid default null,
  p_user_city text default null,
  p_user_state text default null,
  p_device_type text default null,
  p_placement_key text default 'legacy'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_sponsor_id is null or coalesce(trim(p_session_id), '') = '' then
    return;
  end if;

  insert into public.site_sponsor_impressions (
    sponsor_id,
    placement_key,
    session_id,
    user_id,
    page_path,
    slot_position,
    user_city,
    user_state,
    device_type
  )
  values (
    p_sponsor_id,
    coalesce(nullif(trim(coalesce(p_placement_key, '')), ''), 'legacy'),
    trim(p_session_id),
    p_user_id,
    coalesce(nullif(trim(coalesce(p_page_path, '')), ''), '/'),
    p_slot_position,
    nullif(trim(coalesce(p_user_city, '')), ''),
    upper(nullif(trim(coalesce(p_user_state, '')), '')),
    nullif(trim(coalesce(p_device_type, '')), '')
  )
  on conflict do nothing;
end;
$$;

create or replace function public.record_site_sponsor_click(
  p_sponsor_id uuid,
  p_session_id text,
  p_page_path text default '/',
  p_slot_position integer default null,
  p_user_id uuid default null,
  p_user_city text default null,
  p_user_state text default null,
  p_device_type text default null,
  p_placement_key text default 'legacy'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_sponsor_id is null or coalesce(trim(p_session_id), '') = '' then
    return;
  end if;

  insert into public.site_sponsor_clicks (
    sponsor_id,
    placement_key,
    session_id,
    user_id,
    page_path,
    slot_position,
    user_city,
    user_state,
    device_type
  )
  values (
    p_sponsor_id,
    coalesce(nullif(trim(coalesce(p_placement_key, '')), ''), 'legacy'),
    trim(p_session_id),
    p_user_id,
    coalesce(nullif(trim(coalesce(p_page_path, '')), ''), '/'),
    p_slot_position,
    nullif(trim(coalesce(p_user_city, '')), ''),
    upper(nullif(trim(coalesce(p_user_state, '')), '')),
    nullif(trim(coalesce(p_device_type, '')), '')
  );
end;
$$;

create or replace function public.get_site_sponsor_metrics_report(
  p_sponsor_id uuid,
  p_period_start timestamptz,
  p_period_end timestamptz
)
returns table (
  sponsor_id uuid,
  sponsor_name text,
  period_start timestamptz,
  period_end timestamptz,
  impressions integer,
  clicks integer,
  ctr numeric,
  primary_region text,
  top_regions jsonb
)
language sql
security definer
set search_path = public
as $$
  with sponsor_row as (
    select s.id, s.company_name
    from public.site_sponsors s
    where s.id = p_sponsor_id
  ),
  impression_count as (
    select count(*)::integer as total
    from public.site_sponsor_impressions i
    where i.sponsor_id = p_sponsor_id
      and i.placement_key = 'home_carousel'
      and i.created_at >= p_period_start
      and i.created_at <= p_period_end
  ),
  click_count as (
    select count(*)::integer as total
    from public.site_sponsor_clicks c
    where c.sponsor_id = p_sponsor_id
      and c.placement_key = 'home_carousel'
      and c.created_at >= p_period_start
      and c.created_at <= p_period_end
  ),
  regions as (
    select
      case
        when coalesce(nullif(trim(c.user_city), ''), '') <> '' and coalesce(nullif(trim(c.user_state), ''), '') <> ''
          then trim(c.user_city) || ' - ' || upper(trim(c.user_state))
        when coalesce(nullif(trim(c.user_state), ''), '') <> ''
          then upper(trim(c.user_state))
        else 'Região não identificada'
      end as region_label,
      count(*)::integer as clicks
    from public.site_sponsor_clicks c
    where c.sponsor_id = p_sponsor_id
      and c.placement_key = 'home_carousel'
      and c.created_at >= p_period_start
      and c.created_at <= p_period_end
    group by 1
  ),
  top_region as (
    select region_label
    from regions
    order by clicks desc, region_label asc
    limit 1
  ),
  top_regions_payload as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object('region', region_label, 'clicks', clicks)
        order by clicks desc, region_label asc
      ),
      '[]'::jsonb
    ) as payload
    from (
      select region_label, clicks
      from regions
      order by clicks desc, region_label asc
      limit 5
    ) ranked_regions
  )
  select
    sponsor_row.id as sponsor_id,
    sponsor_row.company_name as sponsor_name,
    p_period_start as period_start,
    p_period_end as period_end,
    coalesce(impression_count.total, 0) as impressions,
    coalesce(click_count.total, 0) as clicks,
    case
      when coalesce(impression_count.total, 0) > 0
        then round((coalesce(click_count.total, 0)::numeric / impression_count.total::numeric) * 100, 2)
      else 0
    end as ctr,
    coalesce((select region_label from top_region), 'Região não identificada') as primary_region,
    (select payload from top_regions_payload) as top_regions
  from sponsor_row
  cross join impression_count
  cross join click_count;
$$;

grant execute on function public.record_site_sponsor_impression(uuid, text, text, integer, uuid, text, text, text, text) to anon, authenticated;
grant execute on function public.record_site_sponsor_click(uuid, text, text, integer, uuid, text, text, text, text) to anon, authenticated;
grant execute on function public.get_site_sponsor_metrics_report(uuid, timestamptz, timestamptz) to authenticated;
