begin;

create table if not exists public.guest_announcement_contacts (
  id uuid primary key default gen_random_uuid(),
  announcement_id uuid not null references public.announcements(id) on delete cascade,
  seller_id uuid not null references public.users(id) on delete cascade,
  visitor_name text not null check (char_length(visitor_name) between 2 and 120),
  visitor_email text not null check (char_length(visitor_email) between 5 and 254),
  visitor_phone text check (visitor_phone is null or char_length(visitor_phone) <= 30),
  message text not null check (char_length(message) between 10 and 2000),
  email_hash text not null,
  ip_hash text not null,
  dedupe_hash text not null,
  consent_documents jsonb not null,
  consent_user_agent text,
  consent_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists guest_announcement_contacts_seller_created_idx
  on public.guest_announcement_contacts (seller_id, created_at desc);

create index if not exists guest_announcement_contacts_ip_created_idx
  on public.guest_announcement_contacts (ip_hash, created_at desc);

create index if not exists guest_announcement_contacts_email_created_idx
  on public.guest_announcement_contacts (email_hash, created_at desc);

create index if not exists guest_announcement_contacts_dedupe_created_idx
  on public.guest_announcement_contacts (dedupe_hash, created_at desc);

alter table public.guest_announcement_contacts enable row level security;

drop policy if exists guest_announcement_contacts_admin_select
  on public.guest_announcement_contacts;
create policy guest_announcement_contacts_admin_select
on public.guest_announcement_contacts
for select
to authenticated
using (
  exists (
    select 1
    from public.users
    where users.id = auth.uid()
      and users.is_admin = true
  )
);

revoke all on table public.guest_announcement_contacts from public, anon, authenticated;
grant select on table public.guest_announcement_contacts to authenticated;

create or replace function public.create_guest_announcement_contact(
  p_announcement_id uuid,
  p_visitor_name text,
  p_visitor_email text,
  p_visitor_phone text,
  p_message text,
  p_email_hash text,
  p_ip_hash text,
  p_dedupe_hash text,
  p_user_agent text
)
returns table(contact_id uuid, created boolean)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_seller_id uuid;
  v_existing_id uuid;
  v_ip_count integer;
  v_email_count integer;
  v_terms_snapshot record;
  v_privacy_snapshot record;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_ip_hash || ':' || p_email_hash, 0));

  select announcements.user_id
  into v_seller_id
  from public.announcements
  where announcements.id = p_announcement_id
    and announcements.status::text = 'ACTIVE'
    and (announcements.expires_at is null or announcements.expires_at > now());

  if v_seller_id is null then
    raise exception 'GUEST_CONTACT_ANNOUNCEMENT_UNAVAILABLE';
  end if;

  select contacts.id
  into v_existing_id
  from public.guest_announcement_contacts contacts
  where contacts.dedupe_hash = p_dedupe_hash
    and contacts.created_at > now() - interval '15 minutes'
  order by contacts.created_at desc
  limit 1;

  if v_existing_id is not null then
    return query select v_existing_id, false;
    return;
  end if;

  select count(*) into v_ip_count
  from public.guest_announcement_contacts contacts
  where contacts.ip_hash = p_ip_hash
    and contacts.created_at > now() - interval '1 hour';

  select count(*) into v_email_count
  from public.guest_announcement_contacts contacts
  where contacts.email_hash = p_email_hash
    and contacts.created_at > now() - interval '1 hour';

  if v_ip_count >= 5 or v_email_count >= 3 then
    raise exception 'GUEST_CONTACT_RATE_LIMITED';
  end if;

  select * into v_terms_snapshot
  from public.resolve_legal_document_snapshot('terms_of_use');

  select * into v_privacy_snapshot
  from public.resolve_legal_document_snapshot('privacy_policy');

  insert into public.guest_announcement_contacts (
    announcement_id,
    seller_id,
    visitor_name,
    visitor_email,
    visitor_phone,
    message,
    email_hash,
    ip_hash,
    dedupe_hash,
    consent_documents,
    consent_user_agent
  ) values (
    p_announcement_id,
    v_seller_id,
    trim(p_visitor_name),
    lower(trim(p_visitor_email)),
    nullif(trim(coalesce(p_visitor_phone, '')), ''),
    trim(p_message),
    p_email_hash,
    p_ip_hash,
    p_dedupe_hash,
    jsonb_build_object(
      'terms_of_use', jsonb_build_object(
        'version', v_terms_snapshot.document_version,
        'title', v_terms_snapshot.document_title,
        'url', v_terms_snapshot.document_url
      ),
      'privacy_policy', jsonb_build_object(
        'version', v_privacy_snapshot.document_version,
        'title', v_privacy_snapshot.document_title,
        'url', v_privacy_snapshot.document_url
      )
    ),
    nullif(left(trim(coalesce(p_user_agent, '')), 500), '')
  )
  returning id into contact_id;

  created := true;
  return next;
end;
$$;

revoke all on function public.create_guest_announcement_contact(
  uuid, text, text, text, text, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.create_guest_announcement_contact(
  uuid, text, text, text, text, text, text, text, text
) to service_role;

alter table public.contact_notification_email_jobs
  add column if not exists guest_contact_id uuid
    references public.guest_announcement_contacts(id) on delete cascade,
  add column if not exists reply_to_email text,
  add column if not exists sender_phone text;

alter table public.contact_notification_email_jobs
  drop constraint if exists contact_notification_email_jobs_source_kind_check;
alter table public.contact_notification_email_jobs
  add constraint contact_notification_email_jobs_source_kind_check
  check (source_kind in ('new_message', 'new_lead', 'guest_lead'));

alter table public.contact_notification_email_jobs
  drop constraint if exists contact_notification_email_jobs_check;
alter table public.contact_notification_email_jobs
  drop constraint if exists contact_notification_email_jobs_reference_check;
alter table public.contact_notification_email_jobs
  add constraint contact_notification_email_jobs_reference_check
  check (
    ((message_id is not null)::integer
      + (lead_id is not null)::integer
      + (guest_contact_id is not null)::integer) = 1
  );

create unique index if not exists contact_notification_email_jobs_guest_unique
  on public.contact_notification_email_jobs (guest_contact_id)
  where guest_contact_id is not null;

create or replace function public.queue_guest_announcement_contact_email()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_recipient_email text;
  v_recipient_name text;
  v_announcement_title text;
  v_status text := 'pending';
  v_last_error text := null;
begin
  select
    users.email,
    coalesce(nullif(trim(users.name), ''), split_part(coalesce(users.email, ''), '@', 1), 'Vendedor')
  into v_recipient_email, v_recipient_name
  from public.users
  where users.id = new.seller_id;

  select announcements.title
  into v_announcement_title
  from public.announcements
  where announcements.id = new.announcement_id;

  if coalesce(trim(v_recipient_email), '') = '' then
    v_status := 'skipped';
    v_last_error := 'Vendedor sem e-mail valido';
  elsif coalesce(trim(v_announcement_title), '') = '' then
    v_status := 'skipped';
    v_last_error := 'Anuncio nao encontrado para composicao do e-mail';
  end if;

  insert into public.contact_notification_email_jobs (
    source_kind,
    guest_contact_id,
    recipient_user_id,
    recipient_email,
    recipient_name,
    sender_name,
    announcement_title,
    message_preview,
    link,
    reply_to_email,
    sender_phone,
    status,
    last_error
  ) values (
    'guest_lead',
    new.id,
    new.seller_id,
    v_recipient_email,
    v_recipient_name,
    new.visitor_name,
    v_announcement_title,
    new.message,
    '/anuncio/' || new.announcement_id::text,
    new.visitor_email,
    new.visitor_phone,
    v_status,
    v_last_error
  )
  on conflict do nothing;

  return new;
end;
$$;

drop trigger if exists on_guest_announcement_contact_queue_email
  on public.guest_announcement_contacts;
create trigger on_guest_announcement_contact_queue_email
after insert on public.guest_announcement_contacts
for each row
execute function public.queue_guest_announcement_contact_email();

revoke all on function public.queue_guest_announcement_contact_email()
  from public, anon, authenticated;

comment on table public.guest_announcement_contacts is
'Contatos iniciais enviados por visitantes nao autenticados. Acesso direto e bloqueado; a Edge Function faz a gravacao.';

commit;
