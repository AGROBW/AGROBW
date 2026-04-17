create table if not exists public.newsletter_campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  subject text not null,
  preview_text text null,
  html_content text not null,
  audience_type text not null check (audience_type in ('newsletter', 'platform_users', 'imported')),
  imported_emails jsonb not null default '[]'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'queued', 'sending', 'completed', 'failed', 'paused')),
  total_recipients integer not null default 0,
  sent_count integer not null default 0,
  failed_count integer not null default 0,
  skipped_count integer not null default 0,
  queued_at timestamptz null,
  last_sent_at timestamptz null,
  created_by uuid null references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_newsletter_campaigns_status_created_at
  on public.newsletter_campaigns (status, created_at desc);

create table if not exists public.newsletter_campaign_email_jobs (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.newsletter_campaigns(id) on delete cascade,
  recipient_email text not null,
  recipient_name text null,
  source text not null check (source in ('newsletter', 'platform_user', 'imported')),
  status text not null default 'pending' check (status in ('pending', 'processing', 'sent', 'failed', 'skipped')),
  provider text not null default 'smtp',
  attempts integer not null default 0,
  last_error text null,
  queued_at timestamptz not null default now(),
  processing_started_at timestamptz null,
  last_attempt_at timestamptz null,
  sent_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint newsletter_campaign_email_jobs_campaign_email_unique unique (campaign_id, recipient_email)
);

create index if not exists idx_newsletter_campaign_email_jobs_status_created_at
  on public.newsletter_campaign_email_jobs (status, queued_at desc);

create index if not exists idx_newsletter_campaign_email_jobs_campaign_id
  on public.newsletter_campaign_email_jobs (campaign_id);

create table if not exists public.newsletter_campaign_email_dispatch_logs (
  id uuid primary key default gen_random_uuid(),
  triggered_by text not null default 'admin',
  status text not null default 'processing' check (status in ('processing', 'completed', 'failed')),
  requested_limit integer not null default 25,
  processed_count integer not null default 0,
  sent_count integer not null default 0,
  failed_count integer not null default 0,
  skipped_count integer not null default 0,
  notes text null,
  started_at timestamptz not null default now(),
  finished_at timestamptz null
);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trigger_touch_newsletter_campaigns_updated_at on public.newsletter_campaigns;
create trigger trigger_touch_newsletter_campaigns_updated_at
before update on public.newsletter_campaigns
for each row
execute function public.touch_updated_at();

drop trigger if exists trigger_touch_newsletter_campaign_email_jobs_updated_at on public.newsletter_campaign_email_jobs;
create trigger trigger_touch_newsletter_campaign_email_jobs_updated_at
before update on public.newsletter_campaign_email_jobs
for each row
execute function public.touch_updated_at();

alter table public.newsletter_campaigns enable row level security;
alter table public.newsletter_campaign_email_jobs enable row level security;
alter table public.newsletter_campaign_email_dispatch_logs enable row level security;

drop policy if exists "Admins can manage newsletter campaigns" on public.newsletter_campaigns;
create policy "Admins can manage newsletter campaigns"
on public.newsletter_campaigns
for all
to authenticated
using (
  exists (
    select 1
    from public.users
    where users.id = auth.uid()
      and (coalesce(users.is_admin, false) = true or lower(coalesce(users.role, '')) = 'admin')
  )
)
with check (
  exists (
    select 1
    from public.users
    where users.id = auth.uid()
      and (coalesce(users.is_admin, false) = true or lower(coalesce(users.role, '')) = 'admin')
  )
);

drop policy if exists "Admins can manage newsletter campaign email jobs" on public.newsletter_campaign_email_jobs;
create policy "Admins can manage newsletter campaign email jobs"
on public.newsletter_campaign_email_jobs
for all
to authenticated
using (
  exists (
    select 1
    from public.users
    where users.id = auth.uid()
      and (coalesce(users.is_admin, false) = true or lower(coalesce(users.role, '')) = 'admin')
  )
)
with check (
  exists (
    select 1
    from public.users
    where users.id = auth.uid()
      and (coalesce(users.is_admin, false) = true or lower(coalesce(users.role, '')) = 'admin')
  )
);

drop policy if exists "Admins can manage newsletter campaign dispatch logs" on public.newsletter_campaign_email_dispatch_logs;
create policy "Admins can manage newsletter campaign dispatch logs"
on public.newsletter_campaign_email_dispatch_logs
for all
to authenticated
using (
  exists (
    select 1
    from public.users
    where users.id = auth.uid()
      and (coalesce(users.is_admin, false) = true or lower(coalesce(users.role, '')) = 'admin')
  )
)
with check (
  exists (
    select 1
    from public.users
    where users.id = auth.uid()
      and (coalesce(users.is_admin, false) = true or lower(coalesce(users.role, '')) = 'admin')
  )
);

create or replace function public.admin_queue_newsletter_campaign(p_campaign_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_is_admin boolean := false;
  v_campaign public.newsletter_campaigns%rowtype;
  v_inserted_count integer := 0;
begin
  select
    coalesce(users.is_admin, false) = true
    or lower(coalesce(users.role, '')) = 'admin'
  into v_is_admin
  from public.users
  where users.id = v_actor_id;

  if not coalesce(v_is_admin, false) then
    raise exception 'Acesso administrativo necessario';
  end if;

  select *
  into v_campaign
  from public.newsletter_campaigns
  where newsletter_campaigns.id = p_campaign_id;

  if v_campaign.id is null then
    raise exception 'Campanha nao encontrada';
  end if;

  if v_campaign.audience_type = 'newsletter' then
    insert into public.newsletter_campaign_email_jobs (
      campaign_id,
      recipient_email,
      recipient_name,
      source
    )
    select
      v_campaign.id,
      lower(trim(ns.email)),
      null,
      'newsletter'
    from public.newsletter_subscriptions ns
    where ns.status = 'active'
      and ns.email is not null
      and trim(ns.email) <> ''
    on conflict (campaign_id, recipient_email) do nothing;

  elsif v_campaign.audience_type = 'platform_users' then
    insert into public.newsletter_campaign_email_jobs (
      campaign_id,
      recipient_email,
      recipient_name,
      source
    )
    select
      v_campaign.id,
      lower(trim(u.email)),
      nullif(trim(u.name), ''),
      'platform_user'
    from public.users u
    where u.email is not null
      and trim(u.email) <> ''
      and coalesce(u.is_suspended, false) = false
    on conflict (campaign_id, recipient_email) do nothing;

  elsif v_campaign.audience_type = 'imported' then
    insert into public.newsletter_campaign_email_jobs (
      campaign_id,
      recipient_email,
      recipient_name,
      source
    )
    select
      v_campaign.id,
      lower(trim(imported.email)),
      null,
      'imported'
    from (
      select distinct jsonb_array_elements_text(v_campaign.imported_emails) as email
    ) imported
    where imported.email is not null
      and trim(imported.email) <> ''
    on conflict (campaign_id, recipient_email) do nothing;
  else
    raise exception 'Tipo de publico alvo invalido';
  end if;

  get diagnostics v_inserted_count = row_count;

  update public.newsletter_campaigns
  set
    status = case when exists (
      select 1
      from public.newsletter_campaign_email_jobs jobs
      where jobs.campaign_id = v_campaign.id
    ) then 'queued' else 'failed' end,
    queued_at = now(),
    total_recipients = (
      select count(*)
      from public.newsletter_campaign_email_jobs jobs
      where jobs.campaign_id = v_campaign.id
    ),
    updated_at = now()
  where public.newsletter_campaigns.id = v_campaign.id;

  return jsonb_build_object(
    'success', true,
    'campaign_id', v_campaign.id,
    'queued_now', v_inserted_count,
    'total_recipients', (
      select count(*)
      from public.newsletter_campaign_email_jobs jobs
      where jobs.campaign_id = v_campaign.id
    )
  );
end;
$$;

revoke all on function public.admin_queue_newsletter_campaign(uuid) from public;
grant execute on function public.admin_queue_newsletter_campaign(uuid) to authenticated;
