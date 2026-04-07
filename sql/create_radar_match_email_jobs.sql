create table if not exists public.radar_match_email_jobs (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.opportunity_matches(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  announcement_id uuid not null references public.announcements(id) on delete cascade,
  recipient_email text,
  recipient_name text,
  announcement_title text,
  alert_name text,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'sent', 'failed', 'skipped')),
  provider text not null default 'smtp',
  attempts integer not null default 0 check (attempts >= 0),
  last_error text,
  queued_at timestamptz not null default now(),
  processing_started_at timestamptz,
  last_attempt_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (match_id)
);

create index if not exists idx_radar_match_email_jobs_status_created_at
  on public.radar_match_email_jobs (status, queued_at desc);

create index if not exists idx_radar_match_email_jobs_user_id
  on public.radar_match_email_jobs (user_id);

create index if not exists idx_radar_match_email_jobs_sent_at
  on public.radar_match_email_jobs (sent_at desc);

create table if not exists public.radar_match_email_dispatch_logs (
  id uuid primary key default gen_random_uuid(),
  triggered_by text not null
    check (triggered_by in ('cron', 'admin')),
  status text not null default 'processing'
    check (status in ('processing', 'completed', 'failed')),
  requested_limit integer not null default 25 check (requested_limit >= 1),
  processed_count integer not null default 0,
  sent_count integer not null default 0,
  failed_count integer not null default 0,
  skipped_count integer not null default 0,
  notes text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_radar_match_email_dispatch_logs_started_at
  on public.radar_match_email_dispatch_logs (started_at desc);

create or replace function public.touch_radar_match_email_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trigger_touch_radar_match_email_jobs_updated_at on public.radar_match_email_jobs;
create trigger trigger_touch_radar_match_email_jobs_updated_at
before update on public.radar_match_email_jobs
for each row
execute function public.touch_radar_match_email_updated_at();

drop trigger if exists trigger_touch_radar_match_email_dispatch_logs_updated_at on public.radar_match_email_dispatch_logs;
create trigger trigger_touch_radar_match_email_dispatch_logs_updated_at
before update on public.radar_match_email_dispatch_logs
for each row
execute function public.touch_radar_match_email_updated_at();

alter table public.radar_match_email_jobs enable row level security;
alter table public.radar_match_email_dispatch_logs enable row level security;

drop policy if exists "Admins can manage radar match email jobs" on public.radar_match_email_jobs;
create policy "Admins can manage radar match email jobs"
on public.radar_match_email_jobs
for all
to authenticated
using (
  exists (
    select 1
    from public.users
    where users.id = auth.uid()
      and users.is_admin = true
  )
)
with check (
  exists (
    select 1
    from public.users
    where users.id = auth.uid()
      and users.is_admin = true
  )
);

drop policy if exists "Admins can manage radar match email dispatch logs" on public.radar_match_email_dispatch_logs;
create policy "Admins can manage radar match email dispatch logs"
on public.radar_match_email_dispatch_logs
for all
to authenticated
using (
  exists (
    select 1
    from public.users
    where users.id = auth.uid()
      and users.is_admin = true
  )
)
with check (
  exists (
    select 1
    from public.users
    where users.id = auth.uid()
      and users.is_admin = true
  )
);

drop trigger if exists on_radar_match_queue_email on public.opportunity_matches;
drop function if exists public.queue_radar_match_email_job();

create or replace function public.queue_radar_match_email_job()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_name text;
  v_announcement_title text;
  v_alert_name text;
  v_status text := 'pending';
  v_last_error text := null;
begin
  select
    u.email,
    coalesce(nullif(trim(u.name), ''), split_part(coalesce(u.email, ''), '@', 1), 'Cliente')
  into
    v_email,
    v_name
  from public.users u
  where u.id = new.user_id;

  select a.title
  into v_announcement_title
  from public.announcements a
  where a.id = new.announcement_id;

  select oa.name
  into v_alert_name
  from public.opportunity_alerts oa
  where oa.id = new.alert_id;

  if new.is_dismissed or new.is_viewed then
    v_status := 'skipped';
    v_last_error := 'Match ja visualizado ou dispensado';
  elsif coalesce(trim(v_email), '') = '' then
    v_status := 'skipped';
    v_last_error := 'Usuario sem e-mail valido';
  elsif coalesce(trim(v_announcement_title), '') = '' then
    v_status := 'skipped';
    v_last_error := 'Anuncio nao encontrado para composicao do e-mail';
  end if;

  insert into public.radar_match_email_jobs (
    match_id,
    user_id,
    announcement_id,
    recipient_email,
    recipient_name,
    announcement_title,
    alert_name,
    status,
    last_error
  )
  values (
    new.id,
    new.user_id,
    new.announcement_id,
    v_email,
    v_name,
    v_announcement_title,
    v_alert_name,
    v_status,
    v_last_error
  )
  on conflict (match_id) do nothing;

  return new;
end;
$$;

create trigger on_radar_match_queue_email
after insert on public.opportunity_matches
for each row
execute function public.queue_radar_match_email_job();

comment on table public.radar_match_email_jobs is
'Fila de envios por e-mail para matches do Radar de Oportunidades.';

comment on table public.radar_match_email_dispatch_logs is
'Log das execucoes de processamento dos e-mails do Radar.';
