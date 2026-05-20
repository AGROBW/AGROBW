create table if not exists public.site_sponsor_impressions (
  id uuid primary key default gen_random_uuid(),
  sponsor_id uuid not null references public.site_sponsors(id) on delete cascade,
  placement_key text not null default 'legacy',
  session_id text not null,
  user_id uuid null references public.users(id) on delete set null,
  page_path text not null default '/',
  slot_position integer null,
  user_city text null,
  user_state text null,
  device_type text null,
  impression_date date not null default ((now() AT TIME ZONE 'America/Sao_Paulo')::date),
  created_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists idx_site_sponsor_impressions_unique_daily
  on public.site_sponsor_impressions (sponsor_id, placement_key, session_id, page_path, impression_date, coalesce(slot_position, 0));

create index if not exists idx_site_sponsor_impressions_sponsor_created_at
  on public.site_sponsor_impressions (sponsor_id, created_at desc);

create table if not exists public.site_sponsor_clicks (
  id uuid primary key default gen_random_uuid(),
  sponsor_id uuid not null references public.site_sponsors(id) on delete cascade,
  placement_key text not null default 'legacy',
  session_id text not null,
  user_id uuid null references public.users(id) on delete set null,
  page_path text not null default '/',
  slot_position integer null,
  user_city text null,
  user_state text null,
  device_type text null,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_site_sponsor_clicks_sponsor_created_at
  on public.site_sponsor_clicks (sponsor_id, created_at desc);

create table if not exists public.sponsor_metric_email_jobs (
  id uuid primary key default gen_random_uuid(),
  sponsor_id uuid not null references public.site_sponsors(id) on delete cascade,
  sponsor_name text not null,
  period_start timestamptz not null,
  period_end timestamptz not null,
  recipient_email text not null,
  recipient_name text null,
  report_payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'sent', 'failed', 'skipped')),
  provider text not null default 'smtp',
  attempts integer not null default 0,
  last_error text null,
  queued_at timestamptz not null default timezone('utc', now()),
  processing_started_at timestamptz null,
  last_attempt_at timestamptz null,
  sent_at timestamptz null,
  requested_by uuid null references public.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_sponsor_metric_email_jobs_status_created_at
  on public.sponsor_metric_email_jobs (status, queued_at desc);

create index if not exists idx_sponsor_metric_email_jobs_sponsor_id
  on public.sponsor_metric_email_jobs (sponsor_id);

create table if not exists public.sponsor_metric_email_dispatch_logs (
  id uuid primary key default gen_random_uuid(),
  triggered_by text not null check (triggered_by in ('cron', 'admin')),
  status text not null check (status in ('processing', 'completed', 'failed')),
  requested_limit integer not null default 25,
  processed_count integer not null default 0,
  sent_count integer not null default 0,
  failed_count integer not null default 0,
  skipped_count integer not null default 0,
  notes text null,
  started_at timestamptz not null default timezone('utc', now()),
  finished_at timestamptz null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_sponsor_metric_email_dispatch_logs_started_at
  on public.sponsor_metric_email_dispatch_logs (started_at desc);

create or replace function public.touch_sponsor_metrics_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists trigger_touch_sponsor_metric_email_jobs_updated_at on public.sponsor_metric_email_jobs;
create trigger trigger_touch_sponsor_metric_email_jobs_updated_at
before update on public.sponsor_metric_email_jobs
for each row
execute function public.touch_sponsor_metrics_updated_at();

drop trigger if exists trigger_touch_sponsor_metric_email_dispatch_logs_updated_at on public.sponsor_metric_email_dispatch_logs;
create trigger trigger_touch_sponsor_metric_email_dispatch_logs_updated_at
before update on public.sponsor_metric_email_dispatch_logs
for each row
execute function public.touch_sponsor_metrics_updated_at();

create or replace function public.get_public_active_site_sponsors()
returns table (
  id uuid,
  company_name text,
  segment text,
  logo_url text,
  banner_url text,
  target_type text,
  target_url text,
  slot_position integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    s.id,
    s.company_name,
    s.segment,
    s.logo_url,
    s.banner_url,
    s.target_type,
    s.target_url,
    s.slot_position
  from public.site_sponsors s
  where s.status = 'active'
    and s.starts_on <= ((now() at time zone 'America/Sao_Paulo')::date)
    and (s.ends_on is null or s.ends_on >= ((now() at time zone 'America/Sao_Paulo')::date))
  order by s.slot_position asc nulls last, s.created_at asc;
$$;

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

alter table public.site_sponsor_impressions enable row level security;
alter table public.site_sponsor_clicks enable row level security;
alter table public.sponsor_metric_email_jobs enable row level security;
alter table public.sponsor_metric_email_dispatch_logs enable row level security;

drop policy if exists "Admins can read site sponsor impressions" on public.site_sponsor_impressions;
create policy "Admins can read site sponsor impressions"
on public.site_sponsor_impressions
for select
to authenticated
using (public.is_admin_user());

drop policy if exists "Admins can read site sponsor clicks" on public.site_sponsor_clicks;
create policy "Admins can read site sponsor clicks"
on public.site_sponsor_clicks
for select
to authenticated
using (public.is_admin_user());

drop policy if exists "Admins can manage sponsor metric email jobs" on public.sponsor_metric_email_jobs;
create policy "Admins can manage sponsor metric email jobs"
on public.sponsor_metric_email_jobs
for all
to authenticated
using (public.is_admin_user())
with check (public.is_admin_user());

drop policy if exists "Admins can manage sponsor metric email dispatch logs" on public.sponsor_metric_email_dispatch_logs;
create policy "Admins can manage sponsor metric email dispatch logs"
on public.sponsor_metric_email_dispatch_logs
for all
to authenticated
using (public.is_admin_user())
with check (public.is_admin_user());

grant execute on function public.get_public_active_site_sponsors() to anon, authenticated;
grant execute on function public.record_site_sponsor_impression(uuid, text, text, integer, uuid, text, text, text, text) to anon, authenticated;
grant execute on function public.record_site_sponsor_click(uuid, text, text, integer, uuid, text, text, text, text) to anon, authenticated;
grant execute on function public.get_site_sponsor_metrics_report(uuid, timestamptz, timestamptz) to authenticated;

comment on table public.site_sponsor_impressions is
'Eventos de impressao dos patrocinadores exibidos ao publico na Vitrine Premium.';

comment on table public.site_sponsor_clicks is
'Eventos de clique dos patrocinadores exibidos ao publico na Vitrine Premium.';

comment on table public.sponsor_metric_email_jobs is
'Fila de envio manual/automatico dos relatorios de metricas da Vitrine Premium.';
