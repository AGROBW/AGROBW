create or replace function public.admin_set_announcement_status(
  p_announcement_id uuid,
  p_status text,
  p_reason text default null
)
returns table (
  announcement_id uuid,
  title text,
  status text,
  user_id uuid,
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
  v_recipient_email text;
  v_recipient_name text;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  if p_status not in ('PAUSED', 'ACTIVE') then
    raise exception 'Status inválido para operação administrativa: %', p_status;
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
    raise exception 'Acesso negado. Apenas administradores podem alterar o status do anúncio.';
  end if;

  if p_status = 'PAUSED' and v_reason is null then
    raise exception 'Informe o motivo da pausa do anúncio.';
  end if;

  update public.announcements
  set
    status = p_status,
    publication_review_admin_override = case when p_status = 'ACTIVE' then true else coalesce(publication_review_admin_override, false) end,
    publication_review_severity = case when p_status = 'ACTIVE' then null else publication_review_severity end,
    publication_review_reasons = case when p_status = 'ACTIVE' then '[]'::jsonb else publication_review_reasons end,
    publication_review_checked_at = case when p_status = 'ACTIVE' then now() else publication_review_checked_at end
  where id = p_announcement_id
  returning announcements.id, announcements.title, announcements.status, announcements.user_id
  into v_announcement;

  if v_announcement.id is null then
    raise exception 'Anúncio não encontrado ou sem permissão para atualização.';
  end if;

  v_notification_title := case
    when p_status = 'PAUSED' then 'Seu anúncio foi pausado pela equipe'
    else 'Seu anúncio foi reativado pela equipe'
  end;

  v_notification_content := case
    when p_status = 'PAUSED' then
      format(
        'O anúncio "%s" foi pausado temporariamente pela equipe AGRO BW. Motivo: %s',
        v_announcement.title,
        v_reason
      )
    else
      format(
        'O anúncio "%s" foi reativado pela equipe AGRO BW e voltou a ficar disponível na plataforma.',
        v_announcement.title
      )
  end;

  insert into public.notifications (
    user_id,
    type,
    title,
    content,
    link,
    is_read
  )
  values (
    v_announcement.user_id,
    'system',
    v_notification_title,
    v_notification_content,
    '/minha-conta/anuncios',
    false
  )
  returning id into v_notification_id;

  select
    nullif(trim(email), ''),
    coalesce(nullif(trim(name), ''), 'Cliente')
  into v_recipient_email, v_recipient_name
  from public.users
  where id = v_announcement.user_id;

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
    v_notification_id,
    v_announcement.user_id,
    v_recipient_email,
    v_recipient_name,
    case when p_status = 'PAUSED' then 'ad_paused' else 'ad_resumed' end,
    v_notification_title,
    v_notification_content,
    '/minha-conta/anuncios',
    case when v_recipient_email is not null then 'pending' else 'skipped' end,
    case when v_recipient_email is not null then null else 'Usuario sem e-mail valido' end
  );

  return query
  select
    v_announcement.id,
    v_announcement.title,
    v_announcement.status,
    v_announcement.user_id,
    v_notification_id;
end;
$$;

grant execute on function public.admin_set_announcement_status(uuid, text, text) to authenticated;
