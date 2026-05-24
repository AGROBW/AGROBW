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

alter table public.announcement_reports enable row level security;

drop policy if exists "announcement_reports_admin_select" on public.announcement_reports;
create policy "announcement_reports_admin_select"
on public.announcement_reports
for select
to authenticated
using (public.is_admin() = true);

drop policy if exists "announcement_reports_admin_update" on public.announcement_reports;
create policy "announcement_reports_admin_update"
on public.announcement_reports
for update
to authenticated
using (public.is_admin() = true)
with check (public.is_admin() = true);

alter table public.announcements
  add column if not exists community_reports_count integer not null default 0,
  add column if not exists community_reported_to_review_at timestamptz,
  add column if not exists community_last_reported_at timestamptz,
  add column if not exists community_report_reasons jsonb not null default '[]'::jsonb;

create index if not exists idx_announcements_community_report_queue
  on public.announcements (community_reported_to_review_at desc)
  where community_reported_to_review_at is not null;

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

create or replace function public.strip_community_report_review_reasons(p_reasons jsonb)
returns jsonb
language sql
immutable
as $$
  with expanded as (
    select value
    from jsonb_array_elements(
      case
        when jsonb_typeof(coalesce(p_reasons, '[]'::jsonb)) = 'array'
          then coalesce(p_reasons, '[]'::jsonb)
        else '[]'::jsonb
      end
    )
  )
  select coalesce(
    jsonb_agg(value) filter (where coalesce(value->>'rule_id', '') <> 'community_reports_threshold'),
    '[]'::jsonb
  )
  from expanded;
$$;

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
      publication_review_admin_override = false,
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

create or replace function public.admin_list_reported_announcements()
returns table (
  id uuid,
  title text,
  description text,
  category_slug text,
  price numeric,
  status text,
  created_at timestamptz,
  user_id uuid,
  owner_name text,
  owner_email text,
  images text[],
  community_reports_count integer,
  community_report_reasons jsonb,
  community_reported_to_review_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_is_admin boolean := false;
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
    raise exception 'Acesso negado. Apenas administradores podem listar denuncias de anuncios.';
  end if;

  return query
  select
    a.id,
    a.title,
    a.description,
    a.category_slug,
    a.price,
    a.status,
    a.created_at,
    a.user_id,
    coalesce(nullif(trim(u.name), ''), 'Anunciante') as owner_name,
    nullif(trim(u.email), '') as owner_email,
    coalesce(a.images, array[]::text[]) as images,
    coalesce(a.community_reports_count, 0) as community_reports_count,
    coalesce(a.community_report_reasons, '[]'::jsonb) as community_report_reasons,
    a.community_reported_to_review_at
  from public.announcements a
  join public.users u
    on u.id = a.user_id
  where a.community_reported_to_review_at is not null
  order by a.community_reported_to_review_at desc, a.created_at desc;
end;
$$;

create or replace function public.admin_get_reported_announcement_details(
  p_announcement_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_is_admin boolean := false;
  v_announcement jsonb;
  v_reports jsonb := '[]'::jsonb;
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
    raise exception 'Acesso negado. Apenas administradores podem visualizar denuncias de anuncios.';
  end if;

  if p_announcement_id is null then
    raise exception 'Anuncio obrigatorio.';
  end if;

  select jsonb_build_object(
    'id', a.id,
    'title', a.title,
    'description', a.description,
    'price', a.price,
    'status', a.status,
    'category_slug', a.category_slug,
    'created_at', a.created_at,
    'images', coalesce(to_jsonb(a.images), '[]'::jsonb),
    'community_reports_count', coalesce(a.community_reports_count, 0),
    'community_report_reasons', coalesce(a.community_report_reasons, '[]'::jsonb),
    'community_reported_to_review_at', a.community_reported_to_review_at,
    'publication_review_reasons', coalesce(a.publication_review_reasons, '[]'::jsonb),
    'owner', jsonb_build_object(
      'id', u.id,
      'name', coalesce(nullif(trim(u.name), ''), 'Anunciante'),
      'email', nullif(trim(u.email), ''),
      'phone', nullif(trim(u.phone), '')
    )
  )
  into v_announcement
  from public.announcements a
  join public.users u
    on u.id = a.user_id
  where a.id = p_announcement_id
  limit 1;

  if v_announcement is null then
    raise exception 'Anuncio nao encontrado.';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', ar.id,
        'reason', ar.reason,
        'details', ar.details,
        'status', ar.status,
        'created_at', ar.created_at,
        'reporter', jsonb_build_object(
          'id', reporter.id,
          'name', coalesce(nullif(trim(reporter.name), ''), 'Usuario'),
          'email', nullif(trim(reporter.email), '')
        )
      )
      order by ar.created_at desc
    ),
    '[]'::jsonb
  )
  into v_reports
  from public.announcement_reports ar
  join public.users reporter
    on reporter.id = ar.reporter_user_id
  where ar.announcement_id = p_announcement_id
    and ar.status = 'valid';

  return jsonb_build_object(
    'announcement', v_announcement,
    'reports', v_reports
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

grant execute on function public.refresh_announcement_report_state(uuid) to authenticated;
grant execute on function public.get_announcement_report_snapshot(uuid) to authenticated;
grant execute on function public.submit_announcement_report(uuid, text, text) to authenticated;
grant execute on function public.insert_notification_compat(uuid, text, text, text, text, boolean) to authenticated, service_role;
grant execute on function public.strip_community_report_review_reasons(jsonb) to authenticated, service_role;
grant execute on function public.admin_list_reported_announcements() to authenticated;
grant execute on function public.admin_get_reported_announcement_details(uuid) to authenticated;
grant execute on function public.admin_approve_reported_announcement(uuid, text) to authenticated;
