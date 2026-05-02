create table if not exists public.announcement_reports (
  id uuid primary key default gen_random_uuid(),
  announcement_id uuid not null references public.announcements(id) on delete cascade,
  reporter_user_id uuid not null references public.users(id) on delete cascade,
  reason text not null check (
    reason in (
      'inappropriate_content',
      'wrong_category',
      'fraud_or_scam',
      'false_information',
      'prohibited_item',
      'duplicate_or_spam',
      'other'
    )
  ),
  details text,
  status text not null default 'valid' check (status in ('valid', 'dismissed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists announcement_reports_unique_user_idx
  on public.announcement_reports (announcement_id, reporter_user_id);

create index if not exists announcement_reports_announcement_idx
  on public.announcement_reports (announcement_id, status, created_at desc);

create index if not exists announcement_reports_reporter_idx
  on public.announcement_reports (reporter_user_id, created_at desc);

alter table public.announcements
  add column if not exists community_reports_count integer not null default 0,
  add column if not exists community_reported_to_review_at timestamptz,
  add column if not exists community_last_reported_at timestamptz,
  add column if not exists community_report_reasons jsonb not null default '[]'::jsonb;

create or replace function public.touch_announcement_reports_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_touch_announcement_reports_updated_at on public.announcement_reports;
create trigger trg_touch_announcement_reports_updated_at
before update on public.announcement_reports
for each row
execute function public.touch_announcement_reports_updated_at();

create or replace function public.refresh_announcement_report_state(
  p_announcement_id uuid
)
returns table (
  report_count integer,
  threshold integer,
  sent_to_review boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_threshold integer := 10;
  v_count integer := 0;
  v_status text;
  v_existing_reported_to_review_at timestamptz;
  v_existing_review_reasons jsonb := '[]'::jsonb;
  v_reason_summary jsonb := '[]'::jsonb;
  v_reason_summary_text text := '';
  v_review_payload jsonb;
begin
  select
    a.status,
    a.community_reported_to_review_at,
    coalesce(a.publication_review_reasons, '[]'::jsonb)
  into
    v_status,
    v_existing_reported_to_review_at,
    v_existing_review_reasons
  from public.announcements a
  where a.id = p_announcement_id
  for update;

  if not found then
    raise exception 'Anuncio nao encontrado';
  end if;

  select count(*)
    into v_count
  from public.announcement_reports ar
  where ar.announcement_id = p_announcement_id
    and ar.status = 'valid';

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'reason', grouped.reason,
        'count', grouped.total
      )
      order by grouped.total desc, grouped.reason asc
    ),
    '[]'::jsonb
  )
  into v_reason_summary
  from (
    select ar.reason, count(*)::integer as total
    from public.announcement_reports ar
    where ar.announcement_id = p_announcement_id
      and ar.status = 'valid'
    group by ar.reason
  ) grouped;

  select coalesce(
    string_agg(format('%s (%s)', grouped.reason, grouped.total), ', ' order by grouped.total desc, grouped.reason asc),
    ''
  )
  into v_reason_summary_text
  from (
    select ar.reason, count(*)::integer as total
    from public.announcement_reports ar
    where ar.announcement_id = p_announcement_id
      and ar.status = 'valid'
    group by ar.reason
  ) grouped;

  update public.announcements
  set
    community_reports_count = v_count,
    community_last_reported_at = case when v_count > 0 then now() else community_last_reported_at end,
    community_report_reasons = v_reason_summary
  where id = p_announcement_id;

  sent_to_review := false;

  if v_count >= v_threshold and v_existing_reported_to_review_at is null then
    v_review_payload := jsonb_build_object(
      'rule_id', 'community_reports_threshold',
      'rule_name', 'Denuncias da comunidade',
      'rule_kind', 'community_report',
      'action', 'review',
      'message', format(
        'Anuncio enviado para analise apos %s denuncias de usuarios unicos. Motivos principais: %s',
        v_count,
        case when nullif(v_reason_summary_text, '') is null then 'sem detalhamento adicional' else v_reason_summary_text end
      ),
      'reported_count', v_count,
      'threshold', v_threshold,
      'reason_summary', v_reason_summary
    );

    update public.announcements
    set
      status = case when status = 'ACTIVE' then 'PENDING' else status end,
      community_reported_to_review_at = now(),
      publication_review_severity = coalesce(publication_review_severity, 'review'),
      publication_review_checked_at = now(),
      publication_review_reasons = coalesce(v_existing_review_reasons, '[]'::jsonb) || jsonb_build_array(v_review_payload)
    where id = p_announcement_id;

    sent_to_review := true;
  end if;

  report_count := v_count;
  threshold := v_threshold;
  return next;
end;
$$;

create or replace function public.get_announcement_report_snapshot(
  p_announcement_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_count integer := 0;
  v_threshold integer := 10;
  v_user_has_reported boolean := false;
begin
  if p_announcement_id is null then
    raise exception 'Anuncio obrigatorio';
  end if;

  select coalesce(a.community_reports_count, 0)
    into v_count
  from public.announcements a
  where a.id = p_announcement_id;

  if not found then
    raise exception 'Anuncio nao encontrado';
  end if;

  if v_user_id is not null then
    select exists (
      select 1
      from public.announcement_reports ar
      where ar.announcement_id = p_announcement_id
        and ar.reporter_user_id = v_user_id
        and ar.status = 'valid'
    ) into v_user_has_reported;
  end if;

  return jsonb_build_object(
    'report_count', v_count,
    'threshold', v_threshold,
    'user_has_reported', v_user_has_reported,
    'reports_remaining', greatest(v_threshold - v_count, 0)
  );
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
    a.status
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
    insert into public.notifications (
      user_id,
      type,
      title,
      content,
      link,
      is_read
    ) values (
      v_announcement.user_id,
      'announcement_reported_to_review',
      'Seu anuncio entrou em analise',
      format(
        'O anuncio "%s" recebeu %s denuncias de usuarios unicos e foi encaminhado para analise da equipe.',
        v_announcement.title,
        v_report_state.report_count
      ),
      '/minha-conta/anuncios',
      false
    )
    returning id into v_notification_id;

    select
      nullif(trim(coalesce(u.email, '')), ''),
      coalesce(nullif(trim(coalesce(u.name, '')), ''), 'Cliente')
    into
      v_recipient_email,
      v_recipient_name
    from public.users u
    where u.id = v_announcement.user_id;

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
  end if;

  return jsonb_build_object(
    'success', true,
    'report_count', coalesce(v_report_state.report_count, 0),
    'threshold', coalesce(v_report_state.threshold, 10),
    'sent_to_review', coalesce(v_report_state.sent_to_review, false)
  );
end;
$$;

grant execute on function public.refresh_announcement_report_state(uuid) to authenticated;
grant execute on function public.get_announcement_report_snapshot(uuid) to authenticated;
grant execute on function public.submit_announcement_report(uuid, text, text) to authenticated;
