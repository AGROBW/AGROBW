create table if not exists public.plan_alert_email_jobs (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.notifications(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  recipient_email text,
  recipient_name text,
  alert_kind text not null check (alert_kind in ('conversion', 'renewal')),
  notification_title text not null,
  notification_content text not null,
  link text,
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
  unique (notification_id)
);

create index if not exists idx_plan_alert_email_jobs_status_created_at
  on public.plan_alert_email_jobs (status, queued_at desc);

create index if not exists idx_plan_alert_email_jobs_user_id
  on public.plan_alert_email_jobs (user_id);

create table if not exists public.plan_alert_email_dispatch_logs (
  id uuid primary key default gen_random_uuid(),
  triggered_by text not null check (triggered_by in ('cron', 'admin')),
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

create index if not exists idx_plan_alert_email_dispatch_logs_started_at
  on public.plan_alert_email_dispatch_logs (started_at desc);

create or replace function public.touch_plan_alert_email_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trigger_touch_plan_alert_email_jobs_updated_at on public.plan_alert_email_jobs;
create trigger trigger_touch_plan_alert_email_jobs_updated_at
before update on public.plan_alert_email_jobs
for each row
execute function public.touch_plan_alert_email_updated_at();

drop trigger if exists trigger_touch_plan_alert_email_dispatch_logs_updated_at on public.plan_alert_email_dispatch_logs;
create trigger trigger_touch_plan_alert_email_dispatch_logs_updated_at
before update on public.plan_alert_email_dispatch_logs
for each row
execute function public.touch_plan_alert_email_updated_at();

alter table public.plan_alert_email_jobs enable row level security;
alter table public.plan_alert_email_dispatch_logs enable row level security;

drop policy if exists "Admins can manage plan alert email jobs" on public.plan_alert_email_jobs;
create policy "Admins can manage plan alert email jobs"
on public.plan_alert_email_jobs
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

drop policy if exists "Admins can manage plan alert email dispatch logs" on public.plan_alert_email_dispatch_logs;
create policy "Admins can manage plan alert email dispatch logs"
on public.plan_alert_email_dispatch_logs
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

drop trigger if exists on_plan_alert_queue_email on public.notifications;
drop function if exists public.queue_plan_alert_email_job();

create or replace function public.queue_plan_alert_email_job()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_name text;
  v_kind text;
  v_status text := 'pending';
  v_last_error text := null;
begin
  if coalesce(new.type, '') <> 'plan_alert' then
    return new;
  end if;

  if new.title like 'Oportunidade AGRO BW:%' then
    v_kind := 'conversion';
  elsif new.title like 'Renovacao AGRO BW:%' then
    v_kind := 'renewal';
  else
    return new;
  end if;

  select
    u.email,
    coalesce(nullif(trim(u.name), ''), split_part(coalesce(u.email, ''), '@', 1), 'Cliente')
  into
    v_email,
    v_name
  from public.users u
  where u.id = new.user_id;

  if coalesce(trim(v_email), '') = '' then
    v_status := 'skipped';
    v_last_error := 'Usuario sem e-mail valido';
  end if;

  insert into public.plan_alert_email_jobs (
    notification_id,
    user_id,
    recipient_email,
    recipient_name,
    alert_kind,
    notification_title,
    notification_content,
    link,
    status,
    last_error
  )
  values (
    new.id,
    new.user_id,
    v_email,
    v_name,
    v_kind,
    new.title,
    new.content,
    new.link,
    v_status,
    v_last_error
  )
  on conflict (notification_id) do nothing;

  return new;
end;
$$;

create trigger on_plan_alert_queue_email
after insert on public.notifications
for each row
execute function public.queue_plan_alert_email_job();
