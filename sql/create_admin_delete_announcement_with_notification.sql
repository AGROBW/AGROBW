do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'plan_alert_email_jobs_alert_kind_check'
      and conrelid = 'public.plan_alert_email_jobs'::regclass
  ) then
    alter table public.plan_alert_email_jobs
      drop constraint plan_alert_email_jobs_alert_kind_check;
  end if;
end $$;

alter table public.plan_alert_email_jobs
  add constraint plan_alert_email_jobs_alert_kind_check
  check (
    alert_kind in (
      'conversion',
      'renewal',
      'edit_rejected',
      'ad_paused',
      'ad_resumed',
      'ad_deleted',
      'announcement_reported_to_review'
    )
  );

create or replace function public.admin_delete_announcement_with_notification(
  p_announcement_id uuid,
  p_reason text
)
returns jsonb
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
  v_delete_result jsonb;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  if v_actor_id is null then
    raise exception 'Usuario nao autenticado';
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
    raise exception 'Acesso negado. Apenas administradores podem excluir anuncios por este fluxo.';
  end if;

  if v_reason is null then
    raise exception 'Informe o motivo da exclusao do anuncio.';
  end if;

  select
    a.id,
    a.title,
    a.user_id,
    nullif(trim(u.email), '') as recipient_email,
    coalesce(nullif(trim(u.name), ''), 'Cliente') as recipient_name
  into v_announcement
  from public.announcements a
  join public.users u
    on u.id = a.user_id
  where a.id = p_announcement_id
  limit 1;

  if v_announcement.id is null then
    raise exception 'Anuncio nao encontrado.';
  end if;

  v_delete_result := public.delete_announcement_with_relations(p_announcement_id);

  if coalesce(v_delete_result ->> 'success', 'false') <> 'true' then
    raise exception '%', coalesce(v_delete_result ->> 'error', 'Falha ao excluir anuncio');
  end if;

  v_notification_title := 'Seu anuncio foi removido pela equipe';
  v_notification_content := format(
    'O anuncio "%s" foi removido pela equipe AGRO BW. Motivo: %s',
    v_announcement.title,
    v_reason
  );

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

  v_recipient_email := v_announcement.recipient_email;
  v_recipient_name := v_announcement.recipient_name;

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
    'ad_deleted',
    v_notification_title,
    v_notification_content,
    '/minha-conta/anuncios',
    case when v_recipient_email is not null then 'pending' else 'skipped' end,
    case when v_recipient_email is not null then null else 'Usuario sem e-mail valido' end
  );

  return jsonb_build_object(
    'success', true,
    'announcement_id', v_announcement.id,
    'user_id', v_announcement.user_id,
    'notification_id', v_notification_id
  );
end;
$$;

grant execute on function public.admin_delete_announcement_with_notification(uuid, text) to authenticated;
