begin;

set local lock_timeout = '5s';

do $$
begin
  if to_regclass('public.guest_announcement_contacts') is null then
    raise exception 'guest_announcement_contacts nao existe';
  end if;

  if to_regprocedure('public.seller_has_active_plan_contact_access(uuid,timestamptz)') is null then
    raise exception 'seller_has_active_plan_contact_access(uuid,timestamptz) nao existe';
  end if;
end;
$$;

do $$
declare
  v_first_install boolean;
begin
  select not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'guest_announcement_contacts'
      and column_name = 'unlocked_once_at'
  ) into v_first_install;

  alter table public.guest_announcement_contacts
    add column if not exists received_with_active_access boolean not null default false,
    add column if not exists unlocked_once_at timestamptz,
    add column if not exists contact_expires_at timestamptz,
    add column if not exists read_at timestamptz,
    add column if not exists archived_at timestamptz;

  if v_first_install then
    -- Preserve only records with evidence that release 1 queued their PII for delivery.
    update public.guest_announcement_contacts contacts
    set
      unlocked_once_at = coalesce(unlocked_once_at, created_at, now()),
      contact_expires_at = null
    where exists (
      select 1
      from public.contact_notification_email_jobs jobs
      where jobs.guest_contact_id = contacts.id
        and jobs.reply_to_email is not null
    );

    update public.guest_announcement_contacts contacts
    set
      received_with_active_access = public.seller_has_active_plan_contact_access(
        contacts.seller_id,
        contacts.created_at
      ),
      contact_expires_at = case
        when public.seller_has_active_plan_contact_access(contacts.seller_id, contacts.created_at)
          then null
        else contacts.created_at - interval '1 second'
      end
    where contacts.unlocked_once_at is null;
  end if;
end;
$$;

create index if not exists guest_announcement_contacts_seller_inbox_idx
  on public.guest_announcement_contacts (seller_id, archived_at, created_at desc);

create or replace function public.sync_guest_announcement_contact_access()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.created_at is null then
    new.created_at := now();
  end if;

  if tg_op = 'UPDATE'
    and new.seller_id = old.seller_id
    and (old.received_with_active_access or old.unlocked_once_at is not null) then
    new.received_with_active_access := old.received_with_active_access;
    new.unlocked_once_at := old.unlocked_once_at;
    new.contact_expires_at := null;
    return new;
  end if;

  if tg_op = 'UPDATE' and new.seller_id <> old.seller_id then
    new.unlocked_once_at := null;
  end if;

  new.received_with_active_access := public.seller_has_active_plan_contact_access(
    new.seller_id,
    new.created_at
  );

  new.contact_expires_at := case
    when new.received_with_active_access then null
    else new.created_at - interval '1 second'
  end;

  return new;
end;
$$;

drop trigger if exists trg_sync_guest_announcement_contact_access
  on public.guest_announcement_contacts;
create trigger trg_sync_guest_announcement_contact_access
before insert or update of seller_id, created_at
on public.guest_announcement_contacts
for each row
execute function public.sync_guest_announcement_contact_access();

update public.guest_announcement_contacts contacts
set
  unlocked_once_at = coalesce(contacts.unlocked_once_at, now()),
  contact_expires_at = null
where not contacts.received_with_active_access
  and contacts.unlocked_once_at is null
  and public.seller_has_active_plan_contact_access(contacts.seller_id, now());

create or replace function public.refresh_seller_lead_contact_windows(
  p_seller_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_leads_updated integer := 0;
  v_guest_contacts_updated integer := 0;
begin
  if p_seller_id is null then
    return 0;
  end if;

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

  get diagnostics v_leads_updated = row_count;

  update public.guest_announcement_contacts contacts
  set
    unlocked_once_at = case
      when contacts.received_with_active_access then contacts.unlocked_once_at
      when contacts.unlocked_once_at is not null then contacts.unlocked_once_at
      when public.seller_has_active_plan_contact_access(contacts.seller_id, now()) then coalesce(contacts.unlocked_once_at, now())
      else contacts.unlocked_once_at
    end,
    contact_expires_at = case
      when contacts.received_with_active_access then null
      when contacts.unlocked_once_at is not null then null
      when public.seller_has_active_plan_contact_access(contacts.seller_id, now()) then null
      else contacts.created_at - interval '1 second'
    end
  where contacts.seller_id = p_seller_id;

  get diagnostics v_guest_contacts_updated = row_count;

  return v_leads_updated + v_guest_contacts_updated;
end;
$$;

create or replace function public.list_my_guest_announcement_contacts(
  p_limit integer default 50,
  p_offset integer default 0,
  p_include_archived boolean default false
)
returns table (
  contact_id uuid,
  announcement_id uuid,
  announcement_title text,
  announcement_slug text,
  announcement_image text,
  visitor_name text,
  visitor_email text,
  visitor_phone text,
  message_preview text,
  created_at timestamptz,
  contact_expires_at timestamptz,
  is_locked boolean,
  is_read boolean,
  is_archived boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor_id uuid := auth.uid();
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 100);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
begin
  if v_actor_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  return query
  select
    contacts.id,
    contacts.announcement_id,
    coalesce(nullif(trim(announcements.title), ''), 'Anuncio indisponivel')::text,
    announcements.slug::text,
    announcements.images[1]::text,
    case when access_state.locked then 'Contato bloqueado' else contacts.visitor_name end,
    case when access_state.locked then null else contacts.visitor_email end,
    case when access_state.locked then null else contacts.visitor_phone end,
    case when access_state.locked then null else left(contacts.message, 180) end,
    contacts.created_at,
    contacts.contact_expires_at,
    access_state.locked,
    contacts.read_at is not null,
    contacts.archived_at is not null
  from public.guest_announcement_contacts contacts
  left join public.announcements announcements on announcements.id = contacts.announcement_id
  cross join lateral (
    select contacts.contact_expires_at is not null
      and contacts.contact_expires_at <= now() as locked
  ) access_state
  where contacts.seller_id = v_actor_id
    and (coalesce(p_include_archived, false) or contacts.archived_at is null)
  order by contacts.created_at desc
  limit v_limit
  offset v_offset;
end;
$$;

create or replace function public.get_my_guest_announcement_contact(
  p_contact_id uuid
)
returns table (
  contact_id uuid,
  announcement_id uuid,
  announcement_title text,
  announcement_slug text,
  announcement_image text,
  visitor_name text,
  visitor_email text,
  visitor_phone text,
  message text,
  created_at timestamptz,
  contact_expires_at timestamptz,
  is_locked boolean,
  is_read boolean,
  is_archived boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor_id uuid := auth.uid();
begin
  if v_actor_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  return query
  select
    contacts.id,
    contacts.announcement_id,
    coalesce(nullif(trim(announcements.title), ''), 'Anuncio indisponivel')::text,
    announcements.slug::text,
    announcements.images[1]::text,
    case when access_state.locked then 'Contato bloqueado' else contacts.visitor_name end,
    case when access_state.locked then null else contacts.visitor_email end,
    case when access_state.locked then null else contacts.visitor_phone end,
    case when access_state.locked then null else contacts.message end,
    contacts.created_at,
    contacts.contact_expires_at,
    access_state.locked,
    contacts.read_at is not null,
    contacts.archived_at is not null
  from public.guest_announcement_contacts contacts
  left join public.announcements announcements on announcements.id = contacts.announcement_id
  cross join lateral (
    select contacts.contact_expires_at is not null
      and contacts.contact_expires_at <= now() as locked
  ) access_state
  where contacts.id = p_contact_id
    and contacts.seller_id = v_actor_id;
end;
$$;

create or replace function public.mark_my_guest_announcement_contact_read(
  p_contact_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor_id uuid := auth.uid();
  v_updated integer := 0;
begin
  if v_actor_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  update public.guest_announcement_contacts contacts
  set read_at = coalesce(contacts.read_at, now())
  where contacts.id = p_contact_id
    and contacts.seller_id = v_actor_id;

  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$$;

create or replace function public.set_my_guest_announcement_contact_archived(
  p_contact_id uuid,
  p_archived boolean
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor_id uuid := auth.uid();
  v_updated integer := 0;
begin
  if v_actor_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  update public.guest_announcement_contacts contacts
  set archived_at = case when coalesce(p_archived, false) then now() else null end
  where contacts.id = p_contact_id
    and contacts.seller_id = v_actor_id;

  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$$;

create or replace function public.count_my_unread_guest_announcement_contacts()
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor_id uuid := auth.uid();
  v_count bigint := 0;
begin
  if v_actor_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  select count(*)
  into v_count
  from public.guest_announcement_contacts contacts
  where contacts.seller_id = v_actor_id
    and contacts.read_at is null
    and contacts.archived_at is null;

  return v_count;
end;
$$;

alter table public.contact_notification_email_jobs
  add column if not exists content_locked boolean not null default false;

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
  v_content_locked boolean := new.contact_expires_at is not null
    and new.contact_expires_at <= now();
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
    content_locked,
    status,
    last_error
  ) values (
    'guest_lead',
    new.id,
    new.seller_id,
    v_recipient_email,
    v_recipient_name,
    case when v_content_locked then 'Contato bloqueado' else new.visitor_name end,
    v_announcement_title,
    case when v_content_locked then null else new.message end,
    '/minha-conta/mensagens?guest=' || new.id::text,
    case when v_content_locked then null else new.visitor_email end,
    case when v_content_locked then null else new.visitor_phone end,
    v_content_locked,
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

revoke all on function public.sync_guest_announcement_contact_access()
  from public, anon, authenticated;
revoke all on function public.queue_guest_announcement_contact_email()
  from public, anon, authenticated;
revoke all on function public.list_my_guest_announcement_contacts(integer, integer, boolean)
  from public, anon, authenticated;
revoke all on function public.get_my_guest_announcement_contact(uuid)
  from public, anon, authenticated;
revoke all on function public.mark_my_guest_announcement_contact_read(uuid)
  from public, anon, authenticated;
revoke all on function public.set_my_guest_announcement_contact_archived(uuid, boolean)
  from public, anon, authenticated;
revoke all on function public.count_my_unread_guest_announcement_contacts()
  from public, anon, authenticated;
revoke all on function public.refresh_seller_lead_contact_windows(uuid)
  from public, anon, authenticated;

grant execute on function public.list_my_guest_announcement_contacts(integer, integer, boolean)
  to authenticated;
grant execute on function public.get_my_guest_announcement_contact(uuid)
  to authenticated;
grant execute on function public.mark_my_guest_announcement_contact_read(uuid)
  to authenticated;
grant execute on function public.set_my_guest_announcement_contact_archived(uuid, boolean)
  to authenticated;
grant execute on function public.count_my_unread_guest_announcement_contacts()
  to authenticated;
grant execute on function public.refresh_seller_lead_contact_windows(uuid)
  to service_role;

comment on column public.guest_announcement_contacts.received_with_active_access is
  'Snapshot que registra se o vendedor tinha plano elegivel quando o contato visitante chegou.';
comment on column public.guest_announcement_contacts.contact_expires_at is
  'Bloqueia dados pessoais e mensagem quando a conta nao possui acesso vigente.';
comment on column public.guest_announcement_contacts.unlocked_once_at is
  'Preserva o acesso depois que um contato bloqueado foi liberado por upgrade.';
comment on column public.guest_announcement_contacts.read_at is
  'Instante em que o vendedor abriu o contato visitante.';
comment on column public.guest_announcement_contacts.archived_at is
  'Instante de arquivamento do contato pelo vendedor.';
comment on column public.contact_notification_email_jobs.content_locked is
  'Indica que o e-mail deve ocultar dados pessoais e mensagem por bloqueio do plano.';

commit;

select
  to_regprocedure('public.list_my_guest_announcement_contacts(integer,integer,boolean)') is not null as lista_criada,
  to_regprocedure('public.get_my_guest_announcement_contact(uuid)') is not null as detalhe_criado,
  to_regprocedure('public.mark_my_guest_announcement_contact_read(uuid)') is not null as leitura_criada,
  to_regprocedure('public.set_my_guest_announcement_contact_archived(uuid,boolean)') is not null as arquivo_criado,
  to_regprocedure('public.count_my_unread_guest_announcement_contacts()') is not null as contador_criado,
  (
    select count(*) = 5
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
  ) as colunas_criadas,
  exists (
    select 1
    from pg_trigger
    where tgrelid = 'public.guest_announcement_contacts'::regclass
      and tgname = 'trg_sync_guest_announcement_contact_access'
      and not tgisinternal
  ) as trigger_criado,
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'contact_notification_email_jobs'
      and column_name = 'content_locked'
  ) as email_protegido,
  has_function_privilege('anon', 'public.list_my_guest_announcement_contacts(integer,integer,boolean)', 'EXECUTE') as anon_lista,
  has_function_privilege('authenticated', 'public.list_my_guest_announcement_contacts(integer,integer,boolean)', 'EXECUTE') as authenticated_lista,
  has_table_privilege('authenticated', 'public.guest_announcement_contacts', 'INSERT')
    or has_table_privilege('authenticated', 'public.guest_announcement_contacts', 'UPDATE')
    or has_table_privilege('authenticated', 'public.guest_announcement_contacts', 'DELETE')
    as escrita_direta_authenticated;
