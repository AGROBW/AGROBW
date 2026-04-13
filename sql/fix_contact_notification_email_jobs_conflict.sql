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
