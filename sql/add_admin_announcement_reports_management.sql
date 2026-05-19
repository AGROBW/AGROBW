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

create index if not exists idx_announcements_community_report_queue
  on public.announcements (community_reported_to_review_at desc)
  where community_reported_to_review_at is not null;

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

create or replace function public.enforce_announcement_publication_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
  v_reason_text text;
  v_content_changed boolean := false;
begin
  if tg_op = 'UPDATE'
    and old.community_reported_to_review_at is not null
    and upper(coalesce(old.status, '')) in ('PENDING', 'UNDER_REVIEW', 'PAUSED')
    and upper(coalesce(new.status, '')) = 'ACTIVE'
    and coalesce(new.publication_review_admin_override, false) = false
    and not public.is_admin() then
    raise exception 'Este anuncio esta em analise por denuncias da comunidade e so pode ser reativado pela equipe administrativa.';
  end if;

  if tg_op = 'UPDATE' then
    v_content_changed :=
      coalesce(new.title, '') is distinct from coalesce(old.title, '')
      or coalesce(new.description, '') is distinct from coalesce(old.description, '')
      or coalesce(new.category_slug, '') is distinct from coalesce(old.category_slug, '')
      or coalesce(new.images, array[]::text[]) is distinct from coalesce(old.images, array[]::text[]);
  end if;

  if tg_op = 'UPDATE'
    and upper(coalesce(new.status, '')) = 'ACTIVE'
    and coalesce(new.publication_review_admin_override, false) = true
    and not v_content_changed then
    new.publication_review_checked_at := now();
    new.publication_review_severity := null;
    new.publication_review_reasons := '[]'::jsonb;
    return new;
  end if;

  if v_content_changed then
    new.publication_review_admin_override := false;
  end if;

  if upper(coalesce(new.status, '')) not in ('ACTIVE') then
    return new;
  end if;

  v_result := public.evaluate_announcement_publication_rules(
    new.title,
    new.description,
    new.category_slug,
    to_jsonb(coalesce(new.images, array[]::text[]))
  );

  new.publication_review_checked_at := now();
  new.publication_review_reasons := coalesce(v_result->'reasons', '[]'::jsonb);

  if coalesce((v_result->>'blocked')::boolean, false)
    or coalesce((v_result->>'review_required')::boolean, false) then
    new.status := 'PENDING';
    new.publication_review_severity := 'review';
    new.publication_review_admin_override := false;
  else
    new.publication_review_severity := null;
    new.publication_review_reasons := '[]'::jsonb;
  end if;

  return new;
end;
$$;

drop function if exists public.admin_list_moderation_queue_announcements();

create or replace function public.admin_list_moderation_queue_announcements()
returns table (
  id uuid,
  title text,
  description text,
  category text,
  category_id uuid,
  category_slug text,
  sub_category_id text,
  sub_category_label text,
  price numeric,
  unit_price numeric,
  quantity numeric,
  unit text,
  currency text,
  status text,
  created_at timestamptz,
  user_id uuid,
  city text,
  state text,
  cep text,
  product_condition text,
  availability text,
  accepts_trade boolean,
  has_warranty boolean,
  warranty_details text,
  has_invoice boolean,
  video_url text,
  video_storage_path text,
  video_thumbnail_url text,
  video_thumbnail_storage_path text,
  video_duration_seconds integer,
  video_size_bytes bigint,
  is_premium boolean,
  whatsapp text,
  publication_review_reasons jsonb,
  publication_review_severity text,
  community_reports_count integer,
  community_report_reasons jsonb,
  community_reported_to_review_at timestamptz,
  images text[]
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
    where users.id = v_actor_id
      and (
        users.is_admin = true
        or upper(coalesce(users.role, '')) = 'ADMIN'
      )
  ) into v_is_admin;

  if not v_is_admin then
    raise exception 'Acesso negado. Apenas administradores podem listar a fila de moderacao.';
  end if;

  return query
  select
    a.id,
    a.title,
    a.description,
    null::text as category,
    a.category_id,
    a.category_slug,
    a.sub_category_id,
    a.sub_category_label,
    a.price,
    a.unit_price,
    a.quantity,
    a.unit,
    a.currency,
    a.status,
    a.created_at,
    a.user_id,
    a.city,
    a.state,
    a.cep,
    a.product_condition,
    a.availability,
    coalesce(a.accepts_trade, false) as accepts_trade,
    coalesce(a.has_warranty, false) as has_warranty,
    a.warranty_details,
    coalesce(a.has_invoice, false) as has_invoice,
    a.video_url,
    a.video_storage_path,
    a.video_thumbnail_url,
    a.video_thumbnail_storage_path,
    a.video_duration_seconds,
    a.video_size_bytes,
    coalesce(a.is_premium, false) as is_premium,
    a.whatsapp,
    coalesce(a.publication_review_reasons, '[]'::jsonb) as publication_review_reasons,
    a.publication_review_severity,
    coalesce(a.community_reports_count, 0) as community_reports_count,
    coalesce(a.community_report_reasons, '[]'::jsonb) as community_report_reasons,
    a.community_reported_to_review_at,
    coalesce(a.images, array[]::text[]) as images
  from public.announcements a
  where a.status in ('PENDING', 'UNDER_REVIEW')
    and a.community_reported_to_review_at is null
    and not exists (
      select 1
      from public.announcement_edit_requests aer
      where aer.announcement_id = a.id
        and aer.status = 'pending'
    )
  order by a.created_at desc;
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
    and coalesce(a.community_reports_count, 0) >= 10
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

  insert into public.notifications (
    user_id,
    type,
    title,
    content,
    link,
    is_read
  ) values (
    v_announcement.user_id,
    'announcement_reports_reviewed',
    'Seu anuncio foi liberado pela equipe',
    format(
      'O anuncio "%s" foi revisado pela equipe AGRO BW e voltou a ficar visivel.%s',
      v_announcement.title,
      case when v_note is null then '' else ' Observacao: ' || v_note end
    ),
    '/minha-conta/anuncios',
    false
  )
  returning id into v_notification_id;

  return jsonb_build_object(
    'success', true,
    'announcement_id', v_announcement.id,
    'notification_id', v_notification_id,
    'status', case when jsonb_array_length(v_remaining_reasons) = 0 then 'ACTIVE' else v_announcement.status end
  );
end;
$$;

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
    raise exception 'Status invalido para operacao administrativa: %', p_status;
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
    raise exception 'Acesso negado. Apenas administradores podem alterar o status do anuncio.';
  end if;

  if p_status = 'PAUSED' and v_reason is null then
    raise exception 'Informe o motivo da pausa do anuncio.';
  end if;

  select
    a.id,
    a.title,
    a.status,
    a.user_id,
    a.community_reported_to_review_at
  into v_announcement
  from public.announcements a
  where a.id = p_announcement_id
  limit 1;

  if v_announcement.id is null then
    raise exception 'Anuncio nao encontrado ou sem permissao para atualizacao.';
  end if;

  if p_status = 'ACTIVE' and v_announcement.community_reported_to_review_at is not null then
    raise exception 'Use a fila de denuncias para aprovar este anuncio antes de reativa-lo.';
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

  v_notification_title := case
    when p_status = 'PAUSED' then 'Seu anuncio foi pausado pela equipe'
    else 'Seu anuncio foi reativado pela equipe'
  end;

  v_notification_content := case
    when p_status = 'PAUSED' then
      format(
        'O anuncio "%s" foi pausado temporariamente pela equipe AGRO BW. Motivo: %s',
        v_announcement.title,
        v_reason
      )
    else
      format(
        'O anuncio "%s" foi reativado pela equipe AGRO BW e voltou a ficar disponivel na plataforma.',
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

grant execute on function public.strip_community_report_review_reasons(jsonb) to authenticated, service_role;
grant execute on function public.refresh_announcement_report_state(uuid) to authenticated;
grant execute on function public.admin_list_moderation_queue_announcements() to authenticated;
grant execute on function public.admin_list_reported_announcements() to authenticated;
grant execute on function public.admin_get_reported_announcement_details(uuid) to authenticated;
grant execute on function public.admin_approve_reported_announcement(uuid, text) to authenticated;
grant execute on function public.admin_set_announcement_status(uuid, text, text) to authenticated;
