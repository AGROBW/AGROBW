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

create or replace function public.insert_notification_compat(
  p_user_id uuid,
  p_type text,
  p_title text,
  p_content text,
  p_link text default null,
  p_is_read boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_notification_id uuid;
  v_has_notification_content boolean := false;
  v_has_notification_message boolean := false;
begin
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
    using p_user_id, p_type, p_title, p_content, p_link, p_is_read;
  elsif v_has_notification_message then
    execute
      'insert into public.notifications (user_id, type, title, message, link, is_read)
       values ($1, $2, $3, $4, $5, $6)
       returning id'
    into v_notification_id
    using p_user_id, p_type, p_title, p_content, p_link, p_is_read;
  else
    raise exception 'Tabela notifications sem coluna content ou message para registrar a notificacao.';
  end if;

  return v_notification_id;
end;
$$;

create or replace function public.submit_announcement_report(
  p_announcement_id uuid,
  p_reason text,
  p_details text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_announcement record;
  v_report_state record;
  v_notification_id uuid;
  v_recipient_email text;
  v_recipient_name text;
begin
  if v_user_id is null then
    raise exception 'Usuario nao autenticado'
      using errcode = 'P0001';
  end if;

  if p_announcement_id is null then
    raise exception 'Anuncio obrigatorio'
      using errcode = 'P0001';
  end if;

  if coalesce(trim(p_reason), '') = '' then
    raise exception 'Motivo da denuncia obrigatorio'
      using errcode = 'P0001';
  end if;

  select
    a.id,
    a.title,
    a.user_id,
    a.status,
    a.community_reported_to_review_at
  into v_announcement
  from public.announcements a
  where a.id = p_announcement_id;

  if not found then
    raise exception 'Anuncio nao encontrado'
      using errcode = 'P0001';
  end if;

  if v_announcement.user_id = v_user_id then
    raise exception 'Voce nao pode denunciar o proprio anuncio.'
      using errcode = 'P0001';
  end if;

  if coalesce(v_announcement.status, '') <> 'ACTIVE' then
    if v_announcement.community_reported_to_review_at is not null then
      raise exception 'Este anuncio ja saiu de exibicao e esta em analise da equipe.'
        using errcode = 'P0001';
    end if;

    raise exception 'Somente anuncios ativos podem ser denunciados.'
      using errcode = 'P0001';
  end if;

  begin
    insert into public.announcement_reports (
      announcement_id,
      reporter_user_id,
      reason,
      details
    ) values (
      p_announcement_id,
      v_user_id,
      p_reason,
      nullif(trim(coalesce(p_details, '')), '')
    );
  exception
    when unique_violation then
      raise exception 'Voce ja denunciou este anuncio.'
        using errcode = 'P0001';
  end;

  select *
    into v_report_state
  from public.refresh_announcement_report_state(p_announcement_id);

  if coalesce(v_report_state.sent_to_review, false) then
    begin
      v_notification_id := public.insert_notification_compat(
        v_announcement.user_id,
        'system',
        'Seu anuncio entrou em analise',
        format(
          'O anuncio "%s" recebeu %s denuncias de usuarios unicos e foi encaminhado para analise da equipe.',
          v_announcement.title,
          v_report_state.report_count
        ),
        '/minha-conta/anuncios',
        false
      );
    exception
      when others then
        v_notification_id := null;
    end;

    select
      nullif(trim(coalesce(u.email, '')), ''),
      coalesce(nullif(trim(coalesce(u.name, '')), ''), 'Cliente')
    into
      v_recipient_email,
      v_recipient_name
    from public.users u
    where u.id = v_announcement.user_id;

    if v_notification_id is not null then
      begin
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
        ) values (
          v_notification_id,
          v_announcement.user_id,
          v_recipient_email,
          v_recipient_name,
          'announcement_reported_to_review',
          'Seu anuncio entrou em analise',
          format(
            'O anuncio "%s" recebeu %s denuncias de usuarios unicos e foi encaminhado para analise da equipe.',
            v_announcement.title,
            v_report_state.report_count
          ),
          '/minha-conta/anuncios',
          case when v_recipient_email is not null then 'pending' else 'skipped' end,
          case when v_recipient_email is not null then null else 'Usuario sem e-mail valido' end
        );
      exception
        when others then
          null;
      end;
    end if;
  end if;

  return jsonb_build_object(
    'success', true,
    'report_count', coalesce(v_report_state.report_count, 0),
    'threshold', coalesce(v_report_state.threshold, 10),
    'sent_to_review', coalesce(v_report_state.sent_to_review, false)
  );
end;
$$;

create or replace function public.admin_approve_reported_announcement(
  p_announcement_id uuid,
  p_note text default null
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
  v_remaining_reasons jsonb := '[]'::jsonb;
  v_notification_id uuid;
  v_note text := nullif(trim(coalesce(p_note, '')), '');
begin
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
    raise exception 'Acesso negado. Apenas administradores podem aprovar anuncios denunciados.';
  end if;

  select *
  into v_announcement
  from public.announcements
  where id = p_announcement_id
  for update;

  if not found then
    raise exception 'Anuncio nao encontrado.';
  end if;

  v_remaining_reasons := public.strip_community_report_review_reasons(v_announcement.publication_review_reasons);

  update public.announcement_reports
  set status = 'dismissed'
  where announcement_id = p_announcement_id
    and status = 'valid';

  update public.announcements
  set
    status = case
      when jsonb_array_length(v_remaining_reasons) = 0 then 'ACTIVE'
      else status
    end,
    community_reports_count = 0,
    community_reported_to_review_at = null,
    community_last_reported_at = null,
    community_report_reasons = '[]'::jsonb,
    publication_review_admin_override = case
      when jsonb_array_length(v_remaining_reasons) = 0 then true
      else coalesce(publication_review_admin_override, false)
    end,
    publication_review_severity = case
      when jsonb_array_length(v_remaining_reasons) = 0 then null
      else coalesce(publication_review_severity, 'review')
    end,
    publication_review_checked_at = now(),
    publication_review_reasons = v_remaining_reasons
  where id = p_announcement_id;

  v_notification_id := public.insert_notification_compat(
    v_announcement.user_id,
    'system',
    'Seu anuncio foi liberado pela equipe',
    format(
      'O anuncio "%s" foi revisado pela equipe AGRO BW e voltou a ficar visivel.%s',
      v_announcement.title,
      case when v_note is null then '' else ' Observacao: ' || v_note end
    ),
    '/minha-conta/anuncios',
    false
  );

  return jsonb_build_object(
    'success', true,
    'announcement_id', v_announcement.id,
    'notification_id', v_notification_id,
    'status', case when jsonb_array_length(v_remaining_reasons) = 0 then 'ACTIVE' else v_announcement.status end
  );
end;
$$;

grant execute on function public.insert_notification_compat(uuid, text, text, text, text, boolean) to authenticated, service_role;
grant execute on function public.submit_announcement_report(uuid, text, text) to authenticated;
grant execute on function public.admin_approve_reported_announcement(uuid, text) to authenticated;
