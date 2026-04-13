create table if not exists public.contact_notification_email_jobs (
  id uuid primary key default gen_random_uuid(),
  source_kind text not null check (source_kind in ('new_message', 'new_lead')),
  message_id uuid references public.messages(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete cascade,
  recipient_user_id uuid not null references public.users(id) on delete cascade,
  recipient_email text,
  recipient_name text,
  sender_name text,
  announcement_title text,
  message_preview text,
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
  check (
    (message_id is not null and lead_id is null)
    or (message_id is null and lead_id is not null)
  )
);

create unique index if not exists idx_contact_notification_email_jobs_message_unique
  on public.contact_notification_email_jobs (message_id)
  where message_id is not null;

create unique index if not exists idx_contact_notification_email_jobs_lead_unique
  on public.contact_notification_email_jobs (lead_id)
  where lead_id is not null;

create index if not exists idx_contact_notification_email_jobs_status_created_at
  on public.contact_notification_email_jobs (status, queued_at desc);

create index if not exists idx_contact_notification_email_jobs_recipient_user_id
  on public.contact_notification_email_jobs (recipient_user_id);

create table if not exists public.contact_notification_email_dispatch_logs (
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

create index if not exists idx_contact_notification_email_dispatch_logs_started_at
  on public.contact_notification_email_dispatch_logs (started_at desc);

create or replace function public.touch_contact_notification_email_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trigger_touch_contact_notification_email_jobs_updated_at on public.contact_notification_email_jobs;
create trigger trigger_touch_contact_notification_email_jobs_updated_at
before update on public.contact_notification_email_jobs
for each row
execute function public.touch_contact_notification_email_updated_at();

drop trigger if exists trigger_touch_contact_notification_email_dispatch_logs_updated_at on public.contact_notification_email_dispatch_logs;
create trigger trigger_touch_contact_notification_email_dispatch_logs_updated_at
before update on public.contact_notification_email_dispatch_logs
for each row
execute function public.touch_contact_notification_email_updated_at();

alter table public.contact_notification_email_jobs enable row level security;
alter table public.contact_notification_email_dispatch_logs enable row level security;

drop policy if exists "Admins can manage contact notification email jobs" on public.contact_notification_email_jobs;
create policy "Admins can manage contact notification email jobs"
on public.contact_notification_email_jobs
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

drop policy if exists "Admins can manage contact notification email dispatch logs" on public.contact_notification_email_dispatch_logs;
create policy "Admins can manage contact notification email dispatch logs"
on public.contact_notification_email_dispatch_logs
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

drop trigger if exists on_message_queue_contact_email on public.messages;
drop trigger if exists on_lead_queue_contact_email on public.leads;
drop function if exists public.queue_contact_message_email_job();
drop function if exists public.queue_contact_lead_email_job();

create or replace function public.queue_contact_message_email_job()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recipient_user_id uuid;
  v_recipient_email text;
  v_recipient_name text;
  v_sender_name text;
  v_announcement_title text;
  v_link text;
  v_status text := 'pending';
  v_last_error text := null;
  v_message_count integer := 0;
begin
  select
    case
      when new.sender_id = c.buyer_id then c.seller_id
      else c.buyer_id
    end,
    a.title,
    '/minha-conta/mensagens?chat=' || c.id::text
  into
    v_recipient_user_id,
    v_announcement_title,
    v_link
  from public.chats c
  left join public.announcements a on a.id = c.announcement_id
  where c.id = new.chat_id;

  select count(*)
  into v_message_count
  from public.messages m
  where m.chat_id = new.chat_id;

  select
    coalesce(nullif(trim(u.name), ''), split_part(coalesce(u.email, ''), '@', 1), 'Usuario')
  into v_sender_name
  from public.users u
  where u.id = new.sender_id;

  select
    u.email,
    coalesce(nullif(trim(u.name), ''), split_part(coalesce(u.email, ''), '@', 1), 'Cliente')
  into
    v_recipient_email,
    v_recipient_name
  from public.users u
  where u.id = v_recipient_user_id;

  if v_message_count = 1 then
    v_status := 'skipped';
    v_last_error := 'Primeira mensagem coberta pelo e-mail de lead';
  elsif v_recipient_user_id is null then
    v_status := 'skipped';
    v_last_error := 'Destinatario nao encontrado para a mensagem';
  elsif coalesce(trim(v_recipient_email), '') = '' then
    v_status := 'skipped';
    v_last_error := 'Destinatario sem e-mail valido';
  end if;

  insert into public.contact_notification_email_jobs (
    source_kind,
    message_id,
    recipient_user_id,
    recipient_email,
    recipient_name,
    sender_name,
    announcement_title,
    message_preview,
    link,
    status,
    last_error
  )
  values (
    'new_message',
    new.id,
    coalesce(v_recipient_user_id, new.sender_id),
    v_recipient_email,
    v_recipient_name,
    v_sender_name,
    v_announcement_title,
    left(new.content, 160),
    v_link,
    v_status,
    v_last_error
  )
  on conflict do nothing;

  return new;
end;
$$;

create or replace function public.queue_contact_lead_email_job()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recipient_email text;
  v_recipient_name text;
  v_announcement_title text;
  v_status text := 'pending';
  v_last_error text := null;
begin
  select a.title
  into v_announcement_title
  from public.announcements a
  where a.id = new.announcement_id;

  select
    u.email,
    coalesce(nullif(trim(u.name), ''), split_part(coalesce(u.email, ''), '@', 1), 'Vendedor')
  into
    v_recipient_email,
    v_recipient_name
  from public.users u
  where u.id = new.seller_id;

  if coalesce(trim(v_recipient_email), '') = '' then
    v_status := 'skipped';
    v_last_error := 'Vendedor sem e-mail valido';
  elsif coalesce(trim(v_announcement_title), '') = '' then
    v_status := 'skipped';
    v_last_error := 'Anuncio nao encontrado para composicao do e-mail';
  end if;

  insert into public.contact_notification_email_jobs (
    source_kind,
    lead_id,
    recipient_user_id,
    recipient_email,
    recipient_name,
    sender_name,
    announcement_title,
    message_preview,
    link,
    status,
    last_error
  )
  values (
    'new_lead',
    new.id,
    new.seller_id,
    v_recipient_email,
    v_recipient_name,
    coalesce(nullif(trim(new.buyer_name), ''), split_part(coalesce(new.buyer_email, ''), '@', 1), 'Comprador'),
    v_announcement_title,
    left(new.initial_message, 160),
    '/minha-conta/leads?lead=' || new.id::text,
    v_status,
    v_last_error
  )
  on conflict do nothing;

  return new;
end;
$$;

create trigger on_message_queue_contact_email
after insert on public.messages
for each row
execute function public.queue_contact_message_email_job();

create trigger on_lead_queue_contact_email
after insert on public.leads
for each row
execute function public.queue_contact_lead_email_job();

comment on table public.contact_notification_email_jobs is
'Fila de envios por e-mail para notificacoes de novos leads e novas mensagens.';

comment on table public.contact_notification_email_dispatch_logs is
'Log das execucoes de processamento dos e-mails de leads e mensagens.';
