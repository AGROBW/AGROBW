alter table public.announcements
  add column if not exists rejection_reason text,
  add column if not exists rejected_at timestamptz,
  add column if not exists reanalysis_available_at timestamptz;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'announcements_status_check'
      and conrelid = 'public.announcements'::regclass
  ) then
    alter table public.announcements
      drop constraint announcements_status_check;
  end if;
end $$;

alter table public.announcements
  add constraint announcements_status_check
  check (status in ('DRAFT', 'PENDING', 'UNDER_REVIEW', 'ACTIVE', 'PAUSED', 'EXPIRED', 'REJECTED'));

create index if not exists idx_announcements_reanalysis_available_at
  on public.announcements (reanalysis_available_at)
  where reanalysis_available_at is not null;

create or replace function public.admin_reject_announcement(
  p_announcement_id uuid,
  p_reason text
)
returns table (
  announcement_id uuid,
  title text,
  status text,
  user_id uuid,
  rejection_reason text,
  rejected_at timestamptz,
  reanalysis_available_at timestamptz,
  notification_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_is_admin boolean := false;
  v_announcement record;
  v_notification_id uuid;
  v_notification_title text;
  v_notification_content text;
  v_has_notification_content boolean := false;
  v_has_notification_message boolean := false;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_rejected_at timestamptz := now();
  v_reanalysis_available_at timestamptz := now() + interval '24 hours';
begin
  if v_reason is null then
    raise exception 'Informe o motivo da rejeicao do anuncio.';
  end if;

  select exists (
    select 1
    from public.users
    where id = v_actor_id
      and (
        is_admin = true
        or upper(coalesce(role, '')) = 'ADMIN'
      )
  ) into v_is_admin;

  if not v_is_admin then
    raise exception 'Acesso negado. Apenas administradores podem rejeitar anuncios.';
  end if;

  update public.announcements
  set
    status = 'REJECTED',
    rejection_reason = v_reason,
    rejected_at = v_rejected_at,
    reanalysis_available_at = v_reanalysis_available_at,
    publication_review_admin_override = false,
    publication_review_severity = null,
    publication_review_reasons = '[]'::jsonb,
    publication_review_checked_at = now()
  where id = p_announcement_id
  returning
    announcements.id,
    announcements.title,
    announcements.status,
    announcements.user_id,
    announcements.rejection_reason,
    announcements.rejected_at,
    announcements.reanalysis_available_at
  into v_announcement;

  if v_announcement.id is null then
    raise exception 'Anuncio nao encontrado ou sem permissao administrativa para rejeicao.';
  end if;

  v_notification_title := 'Seu anuncio nao foi aprovado';
  v_notification_content := format(
    'O anuncio "%s" foi rejeitado pela equipe AGRO BW. Motivo: %s',
    v_announcement.title,
    v_reason
  );

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'notifications'
      and column_name = 'content'
  ) into v_has_notification_content;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'notifications'
      and column_name = 'message'
  ) into v_has_notification_message;

  if v_has_notification_content then
    execute
      'insert into public.notifications (user_id, type, title, content, link, is_read)
       values ($1, $2, $3, $4, $5, $6)
       returning id'
    into v_notification_id
    using
      v_announcement.user_id,
      'system',
      v_notification_title,
      v_notification_content,
      '/minha-conta/anuncios',
      false;
  elsif v_has_notification_message then
    execute
      'insert into public.notifications (user_id, type, title, message, link, is_read)
       values ($1, $2, $3, $4, $5, $6)
       returning id'
    into v_notification_id
    using
      v_announcement.user_id,
      'system',
      v_notification_title,
      v_notification_content,
      '/minha-conta/anuncios',
      false;
  else
    raise exception 'Tabela notifications sem coluna content ou message para registrar a notificacao.';
  end if;

  return query
  select
    v_announcement.id,
    v_announcement.title,
    v_announcement.status,
    v_announcement.user_id,
    v_announcement.rejection_reason,
    v_announcement.rejected_at,
    v_announcement.reanalysis_available_at,
    v_notification_id;
end;
$$;

grant execute on function public.admin_reject_announcement(uuid, text) to authenticated;
