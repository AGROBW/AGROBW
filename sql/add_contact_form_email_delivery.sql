create table if not exists public.contact_form_email_jobs (
  id uuid primary key default gen_random_uuid(),
  contact_message_id uuid not null unique references public.contact_messages(id) on delete cascade,
  recipient_email text,
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
  updated_at timestamptz not null default now()
);

create index if not exists idx_contact_form_email_jobs_status_queued_at
  on public.contact_form_email_jobs (status, queued_at desc);

create index if not exists idx_contact_form_email_jobs_contact_message_id
  on public.contact_form_email_jobs (contact_message_id);

create or replace function public.touch_contact_form_email_jobs_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trigger_touch_contact_form_email_jobs_updated_at on public.contact_form_email_jobs;
create trigger trigger_touch_contact_form_email_jobs_updated_at
before update on public.contact_form_email_jobs
for each row
execute function public.touch_contact_form_email_jobs_updated_at();

alter table public.contact_form_email_jobs enable row level security;

drop policy if exists "Admins can manage contact form email jobs" on public.contact_form_email_jobs;
create policy "Admins can manage contact form email jobs"
on public.contact_form_email_jobs
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

drop function if exists public.queue_contact_form_email_job();
create or replace function public.queue_contact_form_email_job()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text := 'pending';
  v_last_error text := null;
begin
  if coalesce(trim(new.recipient_email), '') = '' then
    v_status := 'skipped';
    v_last_error := 'Destinatario do formulario sem e-mail configurado';
  end if;

  insert into public.contact_form_email_jobs (
    contact_message_id,
    recipient_email,
    status,
    last_error
  )
  values (
    new.id,
    new.recipient_email,
    v_status,
    v_last_error
  )
  on conflict (contact_message_id) do update
    set recipient_email = excluded.recipient_email,
        status = excluded.status,
        last_error = excluded.last_error;

  return new;
end;
$$;

drop trigger if exists on_contact_message_queue_email on public.contact_messages;
create trigger on_contact_message_queue_email
after insert on public.contact_messages
for each row
execute function public.queue_contact_form_email_job();

insert into public.contact_form_email_jobs (
  contact_message_id,
  recipient_email,
  status,
  last_error
)
select
  cm.id,
  cm.recipient_email,
  case
    when coalesce(trim(cm.recipient_email), '') = '' then 'skipped'
    else 'pending'
  end,
  case
    when coalesce(trim(cm.recipient_email), '') = '' then 'Destinatario do formulario sem e-mail configurado'
    else null
  end
from public.contact_messages cm
left join public.contact_form_email_jobs jobs
  on jobs.contact_message_id = cm.id
where jobs.contact_message_id is null;

comment on table public.contact_form_email_jobs is
'Fila de envios por e-mail para mensagens recebidas no formulario publico Fale Conosco.';
