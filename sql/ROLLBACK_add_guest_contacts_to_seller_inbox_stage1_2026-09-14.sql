-- Antes deste rollback, restaure e publique a versao anterior da Edge Function
-- sync-contact-notification-emails, pois ela deixa de encontrar content_locked.

begin;

drop function if exists public.list_my_guest_announcement_contacts(integer, integer, boolean);
drop function if exists public.get_my_guest_announcement_contact(uuid);
drop function if exists public.mark_my_guest_announcement_contact_read(uuid);
drop function if exists public.set_my_guest_announcement_contact_archived(uuid, boolean);
drop function if exists public.count_my_unread_guest_announcement_contacts();

drop trigger if exists trg_sync_guest_announcement_contact_access
  on public.guest_announcement_contacts;
drop function if exists public.sync_guest_announcement_contact_access();

create or replace function public.refresh_seller_lead_contact_windows(
  p_seller_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rows_updated integer := 0;
begin
  update public.leads leads
  set
    unlocked_once_at = case
      when coalesce(leads.received_with_active_access, false) then leads.unlocked_once_at
      when leads.unlocked_once_at is not null then leads.unlocked_once_at
      when public.seller_has_active_plan_contact_access(leads.seller_id, now()) then coalesce(leads.unlocked_once_at, now())
      else leads.unlocked_once_at
    end,
    contact_expires_at = case
      when coalesce(leads.received_with_active_access, false) then null
      when leads.unlocked_once_at is not null then null
      when public.seller_has_active_plan_contact_access(leads.seller_id, now()) then null
      else coalesce(leads.created_at, now()) - interval '1 second'
    end
  where leads.seller_id = p_seller_id;

  get diagnostics v_rows_updated = row_count;
  return v_rows_updated;
end;
$$;

grant execute on function public.refresh_seller_lead_contact_windows(uuid)
  to authenticated, service_role;

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
  from public.users users
  where users.id = new.seller_id;

  select announcements.title
  into v_announcement_title
  from public.announcements announcements
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

drop index if exists public.guest_announcement_contacts_seller_inbox_idx;

alter table public.contact_notification_email_jobs
  drop column if exists content_locked;

alter table public.guest_announcement_contacts
  drop column if exists archived_at,
  drop column if exists read_at,
  drop column if exists contact_expires_at,
  drop column if exists unlocked_once_at,
  drop column if exists received_with_active_access;

commit;

select
  to_regprocedure('public.list_my_guest_announcement_contacts(integer,integer,boolean)') is null as lista_removida,
  to_regprocedure('public.get_my_guest_announcement_contact(uuid)') is null as detalhe_removido,
  not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'guest_announcement_contacts'
      and column_name in (
        'received_with_active_access',
        'unlocked_once_at',
        'contact_expires_at',
        'read_at',
        'archived_at'
      )
  ) as colunas_removidas,
  not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'contact_notification_email_jobs'
      and column_name = 'content_locked'
  ) as coluna_email_removida;
