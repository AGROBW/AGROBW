-- Rollback do contato visitante - release 1
-- Baseline medido em producao em 2026-09-10:
--   14 jobs (7 new_message, 7 new_lead), 0 referencias invalidas.
-- NAO executar durante a implantacao normal.
-- Antes de executar: voltar o site, retirar a nova Edge Function e republicar
-- a versao anterior de sync-contact-notification-emails.

begin;

do $$
declare
  v_errors text[] := array[]::text[];
  v_columns integer;
  v_undelivered bigint;
begin
  if to_regclass('public.guest_announcement_contacts') is null then
    v_errors := array_append(v_errors, 'guest_announcement_contacts ausente');
  end if;

  if to_regprocedure(
    'public.create_guest_announcement_contact(uuid,text,text,text,text,text,text,text,text)'
  ) is null then
    v_errors := array_append(v_errors, 'RPC create_guest_announcement_contact ausente');
  end if;

  select count(*)
  into v_columns
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'contact_notification_email_jobs'
    and column_name in ('guest_contact_id', 'reply_to_email', 'sender_phone');

  if v_columns <> 3 then
    v_errors := array_append(v_errors, 'as tres colunas do release nao estao presentes');
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.contact_notification_email_jobs'::regclass
      and conname = 'contact_notification_email_jobs_reference_check'
  ) then
    v_errors := array_append(v_errors, 'constraint de tres referencias ausente');
  end if;

  select count(*)
  into v_undelivered
  from public.contact_notification_email_jobs
  where source_kind = 'guest_lead'
    and status not in ('sent', 'skipped');

  if v_undelivered > 0 then
    v_errors := array_append(
      v_errors,
      format('%s job(s) guest_lead ainda nao entregue(s)', v_undelivered)
    );
  end if;

  if cardinality(v_errors) > 0 then
    raise exception 'ROLLBACK ABORTADO: %', array_to_string(v_errors, '; ');
  end if;
end;
$$;

drop trigger if exists on_guest_announcement_contact_queue_email
  on public.guest_announcement_contacts;
drop function if exists public.queue_guest_announcement_contact_email();

delete from public.contact_notification_email_jobs
where source_kind = 'guest_lead';

drop index if exists public.contact_notification_email_jobs_guest_unique;

alter table public.contact_notification_email_jobs
  drop constraint if exists contact_notification_email_jobs_reference_check;
alter table public.contact_notification_email_jobs
  drop constraint if exists contact_notification_email_jobs_check;
alter table public.contact_notification_email_jobs
  add constraint contact_notification_email_jobs_check
  check (
    (message_id is not null and lead_id is null)
    or (message_id is null and lead_id is not null)
  );

alter table public.contact_notification_email_jobs
  drop constraint if exists contact_notification_email_jobs_source_kind_check;
alter table public.contact_notification_email_jobs
  add constraint contact_notification_email_jobs_source_kind_check
  check (source_kind in ('new_message', 'new_lead'));

alter table public.contact_notification_email_jobs
  drop column if exists guest_contact_id,
  drop column if exists reply_to_email,
  drop column if exists sender_phone;

drop function if exists public.create_guest_announcement_contact(
  uuid, text, text, text, text, text, text, text, text
);
drop table if exists public.guest_announcement_contacts;

do $$
declare
  v_errors text[] := array[]::text[];
begin
  if to_regclass('public.guest_announcement_contacts') is not null then
    v_errors := array_append(v_errors, 'tabela visitante ainda existe');
  end if;

  if to_regprocedure(
    'public.create_guest_announcement_contact(uuid,text,text,text,text,text,text,text,text)'
  ) is not null then
    v_errors := array_append(v_errors, 'RPC visitante ainda existe');
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'contact_notification_email_jobs'
      and column_name in ('guest_contact_id', 'reply_to_email', 'sender_phone')
  ) then
    v_errors := array_append(v_errors, 'colunas visitantes ainda existem');
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.contact_notification_email_jobs'::regclass
      and conname = 'contact_notification_email_jobs_check'
      and pg_get_constraintdef(oid) ilike '%message_id%'
      and pg_get_constraintdef(oid) ilike '%lead_id%'
  ) then
    v_errors := array_append(v_errors, 'constraint original de referencia nao foi restaurada');
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.contact_notification_email_jobs'::regclass
      and conname = 'contact_notification_email_jobs_source_kind_check'
      and pg_get_constraintdef(oid) not ilike '%guest_lead%'
  ) then
    v_errors := array_append(v_errors, 'constraint original de source_kind nao foi restaurada');
  end if;

  if cardinality(v_errors) > 0 then
    raise exception 'ROLLBACK ABORTADO: %', array_to_string(v_errors, '; ');
  end if;
end;
$$;

commit;

select
  to_regclass('public.guest_announcement_contacts') is null as tabela_removida,
  to_regprocedure(
    'public.create_guest_announcement_contact(uuid,text,text,text,text,text,text,text,text)'
  ) is null as rpc_removida,
  (
    select count(*)
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'contact_notification_email_jobs'
      and column_name in ('guest_contact_id', 'reply_to_email', 'sender_phone')
  ) as colunas_visitante_restantes,
  (
    select count(*)
    from public.contact_notification_email_jobs
    where source_kind = 'guest_lead'
  ) as jobs_visitante_restantes;
