alter table public.site_popups
  add column if not exists custom_path text,
  add column if not exists display_order integer not null default 0,
  add column if not exists starts_at timestamptz,
  add column if not exists ends_at timestamptz;

alter table public.site_popups
  drop constraint if exists site_popups_page_scope_check;

alter table public.site_popups
  add constraint site_popups_page_scope_check
  check (page_scope in ('site', 'home', 'plans', 'custom'));

create table if not exists public.site_popup_events (
  id uuid primary key default gen_random_uuid(),
  popup_id uuid not null references public.site_popups(id) on delete cascade,
  event_type text not null check (event_type in ('view', 'click', 'dismiss')),
  path text,
  session_key text,
  user_id uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_site_popup_events_popup_id on public.site_popup_events (popup_id);
create index if not exists idx_site_popup_events_event_type on public.site_popup_events (event_type);
create index if not exists idx_site_popup_events_created_at on public.site_popup_events (created_at desc);

alter table public.site_popup_events enable row level security;

drop policy if exists "Public can insert site popup events" on public.site_popup_events;
create policy "Public can insert site popup events"
  on public.site_popup_events
  for insert
  with check (true);

drop policy if exists "Admins can view site popup events" on public.site_popup_events;
create policy "Admins can view site popup events"
  on public.site_popup_events
  for select
  using (public.is_admin() = true);

create or replace view public.site_popup_metrics as
select
  popup_id,
  count(*) filter (where event_type = 'view')::integer as views,
  count(*) filter (where event_type = 'click')::integer as clicks,
  count(*) filter (where event_type = 'dismiss')::integer as dismissals
from public.site_popup_events
group by popup_id;

grant select on public.site_popup_metrics to authenticated;
grant select on public.site_popup_metrics to anon;
