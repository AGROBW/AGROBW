-- =====================================================================
-- LOTE A (hardening aal2) — alinhar guarda admin INLINE -> public.is_admin()
-- Data: 2026-06-10 | 17 RPCs admin (todas client-only; admins logam em aal2).
-- =====================================================================
-- Troca MÍNIMA por função: o bloco
--     select exists (... users ... is_admin/role ...) into v_is_admin;
--     if not v_is_admin then raise exception '<MSG>'; end if;
-- (e variantes `if not exists(...)`) passa a ser:
--     if not public.is_admin() then raise exception '<MSG>'; end if;
-- public.is_admin() exige aal2/MFA. Corpos preservados (inclui fixes 42702/42804).
-- Variáveis v_is_admin/v_actor_id permanecem declaradas (inócuas se não usadas).
-- ROLLBACK: re-aplicar as definições vivas capturadas (saída do string_agg).
-- =====================================================================

begin;

-- ===== admin_apply_announcement_edit_request(uuid) =====
CREATE OR REPLACE FUNCTION public.admin_apply_announcement_edit_request(p_request_id uuid)
 RETURNS TABLE(announcement_id uuid, title text, status text, video_url text, video_thumbnail_url text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_actor_id uuid := auth.uid();
  v_is_admin boolean := false;
  v_request public.announcement_edit_requests%rowtype;
  v_original_status text;
  v_updated public.announcements%rowtype;
  v_images text[];
begin
  if not public.is_admin() then
    raise exception 'Acesso negado. Apenas administradores podem aprovar edicoes de anuncios.';
  end if;

  select aer.*
  into v_request
  from public.announcement_edit_requests aer
  where aer.id = p_request_id
    and aer.status = 'pending'
  limit 1;

  if v_request.id is null then
    raise exception 'Solicitacao de edicao pendente nao encontrada.';
  end if;

  v_original_status := upper(
    coalesce(nullif(trim(v_request.payload->>'__original_announcement_status'), ''), 'ACTIVE')
  );

  if jsonb_typeof(coalesce(v_request.payload->'images', 'null'::jsonb)) = 'array' then
    select coalesce(array_agg(value), array[]::text[])
    into v_images
    from jsonb_array_elements_text(v_request.payload->'images') as value;
  else
    v_images := null;
  end if;

  update public.announcements a
  set
    title = case
      when v_request.payload ? 'title' then coalesce(nullif(trim(v_request.payload->>'title'), ''), a.title)
      else a.title
    end,
    description = case
      when v_request.payload ? 'description' then coalesce(nullif(trim(v_request.payload->>'description'), ''), a.description)
      else a.description
    end,
    price = case
      when v_request.payload ? 'price' and nullif(v_request.payload->>'price', '') is not null
        then (v_request.payload->>'price')::numeric
      else a.price
    end,
    unit_price = case
      when v_request.payload ? 'unit_price' and nullif(v_request.payload->>'unit_price', '') is not null
        then (v_request.payload->>'unit_price')::numeric
      else a.unit_price
    end,
    quantity = case
      when v_request.payload ? 'quantity' and nullif(v_request.payload->>'quantity', '') is not null
        then (v_request.payload->>'quantity')::integer
      else a.quantity
    end,
    unit = case
      when v_request.payload ? 'unit' then nullif(trim(v_request.payload->>'unit'), '')
      else a.unit
    end,
    currency = case
      when v_request.payload ? 'currency' then nullif(trim(v_request.payload->>'currency'), '')
      else a.currency
    end,
    category_slug = case
      when v_request.payload ? 'category_slug' then nullif(trim(v_request.payload->>'category_slug'), '')
      else a.category_slug
    end,
    sub_category_label = case
      when v_request.payload ? 'sub_category_label' then nullif(trim(v_request.payload->>'sub_category_label'), '')
      else a.sub_category_label
    end,
    city = case
      when v_request.payload ? 'city' then nullif(trim(v_request.payload->>'city'), '')
      else a.city
    end,
    state = case
      when v_request.payload ? 'state' then nullif(trim(v_request.payload->>'state'), '')
      else a.state
    end,
    cep = case
      when v_request.payload ? 'cep' then nullif(trim(v_request.payload->>'cep'), '')
      else a.cep
    end,
    product_condition = case
      when v_request.payload ? 'product_condition' then nullif(trim(v_request.payload->>'product_condition'), '')
      else a.product_condition
    end,
    availability = case
      when v_request.payload ? 'availability' then nullif(trim(v_request.payload->>'availability'), '')
      else a.availability
    end,
    accepts_trade = case
      when v_request.payload ? 'accepts_trade' and nullif(v_request.payload->>'accepts_trade', '') is not null
        then (v_request.payload->>'accepts_trade')::boolean
      else a.accepts_trade
    end,
    has_warranty = case
      when v_request.payload ? 'has_warranty' and nullif(v_request.payload->>'has_warranty', '') is not null
        then (v_request.payload->>'has_warranty')::boolean
      else a.has_warranty
    end,
    warranty_details = case
      when v_request.payload ? 'warranty_details' then nullif(trim(v_request.payload->>'warranty_details'), '')
      else a.warranty_details
    end,
    has_invoice = case
      when v_request.payload ? 'has_invoice' and nullif(v_request.payload->>'has_invoice', '') is not null
        then (v_request.payload->>'has_invoice')::boolean
      else a.has_invoice
    end,
    images = case
      when v_request.payload ? 'images' and v_images is not null then v_images
      else a.images
    end,
    video_url = case
      when v_request.payload ? 'video_url' then nullif(trim(v_request.payload->>'video_url'), '')
      else a.video_url
    end,
    video_storage_path = case
      when v_request.payload ? 'video_storage_path' then nullif(trim(v_request.payload->>'video_storage_path'), '')
      else a.video_storage_path
    end,
    video_thumbnail_url = case
      when v_request.payload ? 'video_thumbnail_url' then nullif(trim(v_request.payload->>'video_thumbnail_url'), '')
      else a.video_thumbnail_url
    end,
    video_thumbnail_storage_path = case
      when v_request.payload ? 'video_thumbnail_storage_path' then nullif(trim(v_request.payload->>'video_thumbnail_storage_path'), '')
      else a.video_thumbnail_storage_path
    end,
    video_duration_seconds = case
      when v_request.payload ? 'video_duration_seconds' and nullif(v_request.payload->>'video_duration_seconds', '') is not null
        then (v_request.payload->>'video_duration_seconds')::integer
      else a.video_duration_seconds
    end,
    video_size_bytes = case
      when v_request.payload ? 'video_size_bytes' and nullif(v_request.payload->>'video_size_bytes', '') is not null
        then (v_request.payload->>'video_size_bytes')::bigint
      else a.video_size_bytes
    end,
    is_premium = case
      when v_request.payload ? 'is_premium' and nullif(v_request.payload->>'is_premium', '') is not null
        then (v_request.payload->>'is_premium')::boolean
      else a.is_premium
    end
  where a.id = v_request.announcement_id
  returning a.*
  into v_updated;

  if v_request.payload ? 'category_id' then
    update public.announcements a
    set category_id = nullif(trim(v_request.payload->>'category_id'), '')::uuid
    where a.id = v_request.announcement_id
    returning a.* into v_updated;
  end if;

  if v_request.payload ? 'sub_category_id' then
    update public.announcements a
    set sub_category_id = nullif(trim(v_request.payload->>'sub_category_id'), '')::uuid
    where a.id = v_request.announcement_id
    returning a.* into v_updated;
  end if;

  if v_updated.id is null then
    raise exception 'Anuncio original nao encontrado ou sem permissao para atualizacao.';
  end if;

  update public.announcements a
  set
    status = case when v_original_status = 'REJECTED' then 'ACTIVE' else v_original_status end,
    publication_review_admin_override = case when v_original_status in ('ACTIVE', 'REJECTED') then true else false end,
    publication_review_severity = null,
    publication_review_reasons = '[]'::jsonb,
    publication_review_checked_at = now(),
    rejection_reason = case when v_original_status = 'REJECTED' then null else a.rejection_reason end,
    rejected_at = case when v_original_status = 'REJECTED' then null else a.rejected_at end,
    reanalysis_available_at = case when v_original_status = 'REJECTED' then null else a.reanalysis_available_at end
  where a.id = v_request.announcement_id
  returning a.* into v_updated;

  delete from public.announcement_technical_details atd
  where atd.announcement_id = v_request.announcement_id;

  if jsonb_typeof(coalesce(v_request.technical_details, '[]'::jsonb)) = 'array'
    and jsonb_array_length(coalesce(v_request.technical_details, '[]'::jsonb)) > 0 then
    insert into public.announcement_technical_details (
      announcement_id,
      label,
      value,
      icon_name
    )
    select
      v_request.announcement_id,
      coalesce(nullif(trim(item->>'label'), ''), 'Detalhe'),
      coalesce(item->>'value', ''),
      coalesce(nullif(trim(item->>'icon_name'), ''), 'Circle')
    from jsonb_array_elements(v_request.technical_details) as item
    where coalesce(nullif(trim(item->>'value'), ''), '') <> '';
  end if;

  update public.announcement_edit_requests aer
  set
    status = 'approved',
    reviewed_at = now(),
    reviewed_by = v_actor_id,
    rejection_reason = null,
    reanalysis_available_at = null
  where aer.id = v_request.id;

  return query
  select
    v_updated.id,
    v_updated.title,
    v_updated.status,
    v_updated.video_url,
    v_updated.video_thumbnail_url;
end;
$function$;

-- ===== admin_approve_reported_announcement(uuid,text) =====
CREATE OR REPLACE FUNCTION public.admin_approve_reported_announcement(p_announcement_id uuid, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_actor_id uuid := auth.uid();
  v_is_admin boolean := false;
  v_announcement record;
  v_remaining_reasons jsonb := '[]'::jsonb;
  v_notification_id uuid;
  v_note text := nullif(trim(coalesce(p_note, '')), '');
begin
  if not public.is_admin() then
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
$function$;

-- ===== admin_clear_announcement_highlight(uuid,text) =====
CREATE OR REPLACE FUNCTION public.admin_clear_announcement_highlight(p_announcement_id uuid, p_highlight_type text)
 RETURNS TABLE(announcement_id uuid, highlight_home boolean, highlight_home_until timestamp with time zone, highlight_category boolean, highlight_category_until timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_actor_id uuid := auth.uid();
  v_is_admin boolean := false;
  v_announcement public.announcements%rowtype;
  v_history_highlight_type text;
begin
  if p_highlight_type not in ('home', 'category') then
    raise exception 'Tipo de destaque inválido: %. Use "home" ou "category".', p_highlight_type;
  end if;

  if not public.is_admin() then
    raise exception 'Acesso negado. Apenas administradores podem encerrar destaques.';
  end if;

  select *
  into v_announcement
  from public.announcements
  where id = p_announcement_id
  limit 1;

  if v_announcement.id is null then
    raise exception 'Anúncio não encontrado.';
  end if;

  if p_highlight_type = 'home' and not coalesce(v_announcement.highlight_home, false) then
    raise exception 'Este anúncio não possui destaque Home ativo.';
  end if;

  if p_highlight_type = 'category' and not coalesce(v_announcement.highlight_category, false) then
    raise exception 'Este anúncio não possui destaque Categoria ativo.';
  end if;

  v_history_highlight_type := case
    when p_highlight_type = 'home' then 'home'
    else 'category'
  end;

  update public.announcements
  set
    highlight_home = case when p_highlight_type = 'home' then false else highlight_home end,
    highlight_home_until = case when p_highlight_type = 'home' then null else highlight_home_until end,
    highlight_category = case when p_highlight_type = 'category' then false else highlight_category end,
    highlight_category_until = case when p_highlight_type = 'category' then null else highlight_category_until end,
    updated_at = now()
  where id = p_announcement_id
  returning *
  into v_announcement;

  update public.announcement_highlights_history ahh
  set expires_at = now()
  where ahh.id = (
    select history.id
    from public.announcement_highlights_history history
    where history.announcement_id = p_announcement_id
      and history.highlight_type = v_history_highlight_type
    order by coalesce(history.expires_at, history.applied_at) desc, history.applied_at desc
    limit 1
  );

  return query
  select
    v_announcement.id,
    coalesce(v_announcement.highlight_home, false),
    v_announcement.highlight_home_until,
    coalesce(v_announcement.highlight_category, false),
    v_announcement.highlight_category_until;
end;
$function$;

-- ===== admin_delete_announcement_with_notification(uuid,text) =====
CREATE OR REPLACE FUNCTION public.admin_delete_announcement_with_notification(p_announcement_id uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  if not public.is_admin() then
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
$function$;

-- ===== admin_export_newsletter_subscriptions(text,text) =====
CREATE OR REPLACE FUNCTION public.admin_export_newsletter_subscriptions(p_search text DEFAULT NULL::text, p_status text DEFAULT NULL::text)
 RETURNS TABLE(email text, source text, status text, created_at timestamp with time zone, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.is_admin() then
    raise exception 'Acesso negado';
  end if;

  return query
  select
    ns.email,
    ns.source,
    ns.status,
    ns.created_at,
    ns.updated_at
  from public.newsletter_subscriptions ns
  where (p_status is null or ns.status = p_status)
    and (
      p_search is null
      or trim(p_search) = ''
      or ns.email ilike '%' || trim(p_search) || '%'
    )
  order by ns.created_at desc;
end;
$function$;

-- ===== admin_export_user_legal_consents(text,text,text,timestamptz,timestamptz) =====
CREATE OR REPLACE FUNCTION public.admin_export_user_legal_consents(p_search text DEFAULT NULL::text, p_consent_type text DEFAULT NULL::text, p_source text DEFAULT NULL::text, p_date_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_date_to timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS TABLE(user_name text, user_email text, user_document text, consent_type text, document_version text, document_title text, document_url text, accepted_at timestamp with time zone, revoked_at timestamp with time zone, source text, ip_address text, user_agent text, metadata jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_search text := nullif(trim(p_search), '');
begin
  if not public.is_admin() then
    raise exception 'Acesso negado';
  end if;

  return query
  select
    u.name as user_name,
    u.email as user_email,
    u.document::text as user_document,
    ulc.consent_type,
    ulc.document_version,
    ulc.document_title,
    ulc.document_url,
    ulc.accepted_at,
    ulc.revoked_at,
    ulc.source,
    ulc.ip_address::text as ip_address,
    ulc.user_agent,
    ulc.metadata
  from public.user_legal_consents ulc
  join public.users u on u.id = ulc.user_id
  where (
    p_consent_type is null
    or trim(p_consent_type) = ''
    or ulc.consent_type = p_consent_type
  )
    and (
      p_source is null
      or trim(p_source) = ''
      or ulc.source = p_source
    )
    and (p_date_from is null or ulc.accepted_at >= p_date_from)
    and (p_date_to is null or ulc.accepted_at <= p_date_to)
    and (
      v_search is null
      or u.name ilike '%' || v_search || '%'
      or u.email ilike '%' || v_search || '%'
      or coalesce(u.document, '') ilike '%' || v_search || '%'
      or ulc.document_version ilike '%' || v_search || '%'
      or ulc.document_title ilike '%' || v_search || '%'
    )
  order by ulc.accepted_at desc;
end;
$function$;
-- NOTA: incluído u.document::text (alinhado ao fix 42804 do list); export já usava
--   u.document direto no vivo, mas o RETURNS é text -> manter cast por consistência/segurança.

-- ===== admin_get_reported_announcement_details(uuid) =====
CREATE OR REPLACE FUNCTION public.admin_get_reported_announcement_details(p_announcement_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_actor_id uuid := auth.uid();
  v_is_admin boolean := false;
  v_announcement jsonb;
  v_reports jsonb := '[]'::jsonb;
begin
  if not public.is_admin() then
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
$function$;

-- ===== admin_list_announcements_monitoring() =====
CREATE OR REPLACE FUNCTION public.admin_list_announcements_monitoring()
 RETURNS TABLE(id uuid, title text, description text, status text, created_at timestamp with time zone, expires_at timestamp with time zone, views bigint, price numeric, images text[], category_id uuid, category_slug text, user_id uuid, highlight_home boolean, highlight_home_until timestamp with time zone, highlight_category boolean, highlight_category_until timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_actor_id uuid := auth.uid();
  v_is_admin boolean := false;
begin
  if not public.is_admin() then
    raise exception 'Acesso negado. Apenas administradores podem listar anúncios do monitoramento.';
  end if;

  return query
  select
    a.id as id,
    a.title as title,
    a.description as description,
    a.status as status,
    a.created_at as created_at,
    a.expires_at as expires_at,
    coalesce(a.views, 0)::bigint as views,
    a.price as price,
    a.images as images,
    a.category_id as category_id,
    a.category_slug as category_slug,
    a.user_id as user_id,
    coalesce(a.highlight_home, false) as highlight_home,
    a.highlight_home_until as highlight_home_until,
    coalesce(a.highlight_category, false) as highlight_category,
    a.highlight_category_until as highlight_category_until
  from public.announcements a
  order by a.created_at desc;
end;
$function$;

-- ===== admin_list_moderation_queue_announcements() =====
CREATE OR REPLACE FUNCTION public.admin_list_moderation_queue_announcements()
 RETURNS TABLE(id uuid, title text, description text, category text, category_id uuid, category_slug text, sub_category_id text, sub_category_label text, price numeric, unit_price numeric, quantity numeric, unit text, currency text, status text, created_at timestamp with time zone, user_id uuid, city text, state text, cep text, product_condition text, availability text, accepts_trade boolean, has_warranty boolean, warranty_details text, has_invoice boolean, video_url text, video_storage_path text, video_thumbnail_url text, video_thumbnail_storage_path text, video_duration_seconds integer, video_size_bytes bigint, is_premium boolean, whatsapp text, publication_review_reasons jsonb, publication_review_severity text, community_reports_count integer, community_report_reasons jsonb, community_reported_to_review_at timestamp with time zone, images text[])
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_actor_id uuid := auth.uid();
  v_is_admin boolean := false;
begin
  if not public.is_admin() then
    raise exception 'Acesso negado. Apenas administradores podem listar a fila de moderacao.';
  end if;

  return query
  select
    a.id, a.title, a.description, null::text as category, a.category_id, a.category_slug,
    a.sub_category_id, a.sub_category_label, a.price, a.unit_price, a.quantity, a.unit, a.currency,
    a.status, a.created_at, a.user_id, a.city, a.state, a.cep, a.product_condition, a.availability,
    coalesce(a.accepts_trade, false), coalesce(a.has_warranty, false), a.warranty_details,
    coalesce(a.has_invoice, false), a.video_url, a.video_storage_path, a.video_thumbnail_url,
    a.video_thumbnail_storage_path, a.video_duration_seconds, a.video_size_bytes,
    coalesce(a.is_premium, false),
    (select c.whatsapp from public.announcement_contacts c where c.announcement_id = a.id) as whatsapp,
    coalesce(a.publication_review_reasons, '[]'::jsonb), a.publication_review_severity,
    coalesce(a.community_reports_count, 0), coalesce(a.community_report_reasons, '[]'::jsonb),
    a.community_reported_to_review_at, coalesce(a.images, array[]::text[])
  from public.announcements a
  where a.status in ('PENDING', 'UNDER_REVIEW')
    and a.community_reported_to_review_at is null
    and not exists (
      select 1 from public.announcement_edit_requests aer
      where aer.announcement_id = a.id and aer.status = 'pending'
    )
  order by a.created_at desc;
end;
$function$;

-- ===== admin_list_newsletter_subscriptions(text,text,integer,integer) =====
CREATE OR REPLACE FUNCTION public.admin_list_newsletter_subscriptions(p_search text DEFAULT NULL::text, p_status text DEFAULT NULL::text, p_page integer DEFAULT 0, p_page_size integer DEFAULT 20)
 RETURNS TABLE(id uuid, email text, source text, status text, created_at timestamp with time zone, updated_at timestamp with time zone, total_count bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_offset integer := greatest(coalesce(p_page, 0), 0) * greatest(coalesce(p_page_size, 20), 1);
  v_limit integer := greatest(coalesce(p_page_size, 20), 1);
begin
  if not public.is_admin() then
    raise exception 'Acesso negado';
  end if;

  return query
  with filtered as (
    select ns.*
    from public.newsletter_subscriptions ns
    where (p_status is null or ns.status = p_status)
      and (
        p_search is null
        or trim(p_search) = ''
        or ns.email ilike '%' || trim(p_search) || '%'
      )
  )
  select
    filtered.id,
    filtered.email,
    filtered.source,
    filtered.status,
    filtered.created_at,
    filtered.updated_at,
    count(*) over() as total_count
  from filtered
  order by filtered.created_at desc
  offset v_offset
  limit v_limit;
end;
$function$;

-- ===== admin_list_reported_announcements()  (mantém resolução do 42702) =====
CREATE OR REPLACE FUNCTION public.admin_list_reported_announcements()
 RETURNS TABLE(id uuid, title text, description text, category_slug text, price numeric, status text, created_at timestamp with time zone, user_id uuid, owner_name text, owner_email text, images text[], community_reports_count integer, community_report_reasons jsonb, community_reported_to_review_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_actor_id uuid := auth.uid();
  v_is_admin boolean := false;
begin
  -- guarda alinhada a public.is_admin() (aal2); elimina inerentemente a ambiguidade 42702
  if not public.is_admin() then
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
$function$;

-- ===== admin_list_user_legal_consents(...)  (mantém fix 42804: u.document::text) =====
CREATE OR REPLACE FUNCTION public.admin_list_user_legal_consents(p_search text DEFAULT NULL::text, p_consent_type text DEFAULT NULL::text, p_source text DEFAULT NULL::text, p_date_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_date_to timestamp with time zone DEFAULT NULL::timestamp with time zone, p_page integer DEFAULT 0, p_page_size integer DEFAULT 20)
 RETURNS TABLE(id uuid, user_id uuid, user_name text, user_email text, user_document text, consent_type text, document_version text, document_title text, document_url text, accepted_at timestamp with time zone, revoked_at timestamp with time zone, source text, user_agent text, ip_address text, metadata jsonb, total_count bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_offset integer := greatest(coalesce(p_page, 0), 0) * greatest(coalesce(p_page_size, 20), 1);
  v_limit integer := greatest(coalesce(p_page_size, 20), 1);
  v_search text := nullif(trim(p_search), '');
begin
  if not public.is_admin() then
    raise exception 'Acesso negado';
  end if;

  return query
  with filtered as (
    select
      ulc.id,
      ulc.user_id,
      u.name as user_name,
      u.email as user_email,
      u.document::text as user_document,      -- FIX 42804 preservado
      ulc.consent_type,
      ulc.document_version,
      ulc.document_title,
      ulc.document_url,
      ulc.accepted_at,
      ulc.revoked_at,
      ulc.source,
      ulc.user_agent,
      ulc.ip_address::text as ip_address,
      ulc.metadata
    from public.user_legal_consents ulc
    join public.users u on u.id = ulc.user_id
    where (
      p_consent_type is null
      or trim(p_consent_type) = ''
      or ulc.consent_type = p_consent_type
    )
      and (
        p_source is null
        or trim(p_source) = ''
        or ulc.source = p_source
      )
      and (p_date_from is null or ulc.accepted_at >= p_date_from)
      and (p_date_to is null or ulc.accepted_at <= p_date_to)
      and (
        v_search is null
        or u.name ilike '%' || v_search || '%'
        or u.email ilike '%' || v_search || '%'
        or coalesce(u.document, '') ilike '%' || v_search || '%'
        or ulc.document_version ilike '%' || v_search || '%'
        or ulc.document_title ilike '%' || v_search || '%'
      )
  )
  select
    filtered.id,
    filtered.user_id,
    filtered.user_name,
    filtered.user_email,
    filtered.user_document,
    filtered.consent_type,
    filtered.document_version,
    filtered.document_title,
    filtered.document_url,
    filtered.accepted_at,
    filtered.revoked_at,
    filtered.source,
    filtered.user_agent,
    filtered.ip_address,
    filtered.metadata,
    count(*) over() as total_count
  from filtered
  order by filtered.accepted_at desc
  offset v_offset
  limit v_limit;
end;
$function$;

-- ===== admin_queue_newsletter_campaign(uuid) =====
CREATE OR REPLACE FUNCTION public.admin_queue_newsletter_campaign(p_campaign_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_actor_id uuid := auth.uid();
  v_is_admin boolean := false;
  v_campaign public.newsletter_campaigns%rowtype;
  v_inserted_count integer := 0;
begin
  if not public.is_admin() then
    raise exception 'Acesso administrativo necessario';
  end if;

  select *
  into v_campaign
  from public.newsletter_campaigns
  where newsletter_campaigns.id = p_campaign_id;

  if v_campaign.id is null then
    raise exception 'Campanha nao encontrada';
  end if;

  if v_campaign.audience_type = 'newsletter' then
    insert into public.newsletter_campaign_email_jobs (
      campaign_id,
      recipient_email,
      recipient_name,
      source
    )
    select
      v_campaign.id,
      lower(trim(ns.email)),
      null,
      'newsletter'
    from public.newsletter_subscriptions ns
    where ns.status = 'active'
      and ns.email is not null
      and trim(ns.email) <> ''
    on conflict (campaign_id, recipient_email) do nothing;

  elsif v_campaign.audience_type = 'platform_users' then
    insert into public.newsletter_campaign_email_jobs (
      campaign_id,
      recipient_email,
      recipient_name,
      source
    )
    select
      v_campaign.id,
      lower(trim(u.email)),
      nullif(trim(u.name), ''),
      'platform_user'
    from public.users u
    where u.email is not null
      and trim(u.email) <> ''
      and coalesce(u.is_suspended, false) = false
    on conflict (campaign_id, recipient_email) do nothing;

  elsif v_campaign.audience_type = 'imported' then
    insert into public.newsletter_campaign_email_jobs (
      campaign_id,
      recipient_email,
      recipient_name,
      source
    )
    select
      v_campaign.id,
      lower(trim(imported.email)),
      null,
      'imported'
    from (
      select distinct jsonb_array_elements_text(v_campaign.imported_emails) as email
    ) imported
    where imported.email is not null
      and trim(imported.email) <> ''
    on conflict (campaign_id, recipient_email) do nothing;
  else
    raise exception 'Tipo de publico alvo invalido';
  end if;

  get diagnostics v_inserted_count = row_count;

  update public.newsletter_campaigns
  set
    status = case when exists (
      select 1
      from public.newsletter_campaign_email_jobs jobs
      where jobs.campaign_id = v_campaign.id
    ) then 'queued' else 'failed' end,
    queued_at = now(),
    total_recipients = (
      select count(*)
      from public.newsletter_campaign_email_jobs jobs
      where jobs.campaign_id = v_campaign.id
    ),
    updated_at = now()
  where public.newsletter_campaigns.id = v_campaign.id;

  return jsonb_build_object(
    'success', true,
    'campaign_id', v_campaign.id,
    'queued_now', v_inserted_count,
    'total_recipients', (
      select count(*)
      from public.newsletter_campaign_email_jobs jobs
      where jobs.campaign_id = v_campaign.id
    )
  );
end;
$function$;

-- ===== admin_reject_announcement(uuid,text) =====
CREATE OR REPLACE FUNCTION public.admin_reject_announcement(p_announcement_id uuid, p_reason text)
 RETURNS TABLE(announcement_id uuid, title text, status text, user_id uuid, rejection_reason text, rejected_at timestamp with time zone, reanalysis_available_at timestamp with time zone, notification_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  if not public.is_admin() then
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
$function$;

-- ===== admin_set_announcement_status(uuid,text,text) =====
CREATE OR REPLACE FUNCTION public.admin_set_announcement_status(p_announcement_id uuid, p_status text, p_reason text DEFAULT NULL::text)
 RETURNS TABLE(announcement_id uuid, title text, status text, user_id uuid, notification_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  if not public.is_admin() then
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
$function$;

-- ===== admin_update_announcement_highlight_expiration(uuid,text,timestamptz) =====
CREATE OR REPLACE FUNCTION public.admin_update_announcement_highlight_expiration(p_announcement_id uuid, p_highlight_type text, p_expires_at timestamp with time zone)
 RETURNS TABLE(announcement_id uuid, highlight_home boolean, highlight_home_until timestamp with time zone, highlight_category boolean, highlight_category_until timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_actor_id uuid := auth.uid();
  v_is_admin boolean := false;
  v_announcement public.announcements%rowtype;
  v_history_highlight_type text;
begin
  if p_highlight_type not in ('home', 'category') then
    raise exception 'Tipo de destaque inválido: %. Use "home" ou "category".', p_highlight_type;
  end if;

  if p_expires_at is null then
    raise exception 'Informe a data de expiração do destaque.';
  end if;

  if not public.is_admin() then
    raise exception 'Acesso negado. Apenas administradores podem editar a expiração do destaque.';
  end if;

  select *
  into v_announcement
  from public.announcements
  where id = p_announcement_id
  limit 1;

  if v_announcement.id is null then
    raise exception 'Anúncio não encontrado.';
  end if;

  if p_highlight_type = 'home' and not coalesce(v_announcement.highlight_home, false) then
    raise exception 'Este anúncio não possui destaque Home ativo para edição.';
  end if;

  if p_highlight_type = 'category' and not coalesce(v_announcement.highlight_category, false) then
    raise exception 'Este anúncio não possui destaque Categoria ativo para edição.';
  end if;

  v_history_highlight_type := case
    when p_highlight_type = 'home' then 'home'
    else 'category'
  end;

  update public.announcements
  set
    highlight_home_until = case when p_highlight_type = 'home' then p_expires_at else public.announcements.highlight_home_until end,
    highlight_category_until = case when p_highlight_type = 'category' then p_expires_at else public.announcements.highlight_category_until end,
    updated_at = now()
  where id = p_announcement_id
  returning *
  into v_announcement;

  update public.announcement_highlights_history ahh
  set expires_at = p_expires_at
  where ahh.id = (
    select history.id
    from public.announcement_highlights_history history
    where history.announcement_id = p_announcement_id
      and history.highlight_type = v_history_highlight_type
    order by coalesce(history.expires_at, history.applied_at) desc, history.applied_at desc
    limit 1
  );

  return query
  select
    v_announcement.id,
    coalesce(v_announcement.highlight_home, false),
    v_announcement.highlight_home_until,
    coalesce(v_announcement.highlight_category, false),
    v_announcement.highlight_category_until;
end;
$function$;

-- ===== admin_update_user_plan_period(uuid,uuid,timestamptz,timestamptz,text) =====
CREATE OR REPLACE FUNCTION public.admin_update_user_plan_period(p_user_id uuid, p_plan_id uuid, p_period_start timestamp with time zone, p_period_end timestamp with time zone, p_billing_cycle text DEFAULT 'monthly'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_admin_id uuid := auth.uid();
  v_is_admin boolean := false;
  v_plan public.plans%rowtype;
  v_previous_subscription_id uuid;
  v_previous_plan_id uuid;
  v_new_subscription_id uuid;
  v_billing_cycle text := coalesce(nullif(p_billing_cycle, ''), 'monthly');
  has_current_period_end boolean;
  has_cancel_at_period_end boolean;
  has_updated_at boolean;
  has_billing_cycle boolean;
  has_amount_paid boolean;
  has_currency boolean;
  has_current_period_start boolean;
  has_trial_end_date boolean;
  has_created_at boolean;
  update_set_clause text := 'status = ''expired''';
  insert_columns text := 'user_id, plan_id, status';
  insert_values text := '$1, $2, ''active''';
begin
  if v_admin_id is null then
    raise exception 'Usuario nao autenticado';
  end if;

  if not public.is_admin() then
    raise exception 'Apenas administradores podem alterar periodo de plano';
  end if;

  if p_user_id is null or p_plan_id is null then
    raise exception 'Usuario e plano sao obrigatorios';
  end if;

  if p_period_start is null or p_period_end is null or p_period_end <= p_period_start then
    raise exception 'Periodo do plano invalido';
  end if;

  if v_billing_cycle not in ('monthly', 'yearly') then
    v_billing_cycle := 'monthly';
  end if;

  select *
    into v_plan
  from public.plans
  where id = p_plan_id
    and coalesce(is_active, true) = true;

  if v_plan.id is null then
    raise exception 'Plano selecionado nao foi encontrado ou esta inativo';
  end if;

  if not exists (select 1 from public.users where id = p_user_id) then
    raise exception 'Usuario selecionado nao foi encontrado';
  end if;

  select us.id, us.plan_id
    into v_previous_subscription_id, v_previous_plan_id
  from public.user_subscriptions us
  where us.user_id = p_user_id
    and us.status = 'active'
  order by
    coalesce(us.current_period_end, us.created_at) desc nulls last,
    us.created_at desc
  limit 1;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'user_subscriptions' and column_name = 'current_period_end'
  ) into has_current_period_end;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'user_subscriptions' and column_name = 'cancel_at_period_end'
  ) into has_cancel_at_period_end;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'user_subscriptions' and column_name = 'updated_at'
  ) into has_updated_at;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'user_subscriptions' and column_name = 'billing_cycle'
  ) into has_billing_cycle;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'user_subscriptions' and column_name = 'amount_paid'
  ) into has_amount_paid;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'user_subscriptions' and column_name = 'currency'
  ) into has_currency;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'user_subscriptions' and column_name = 'current_period_start'
  ) into has_current_period_start;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'user_subscriptions' and column_name = 'trial_end_date'
  ) into has_trial_end_date;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'user_subscriptions' and column_name = 'created_at'
  ) into has_created_at;

  if has_current_period_end then
    update_set_clause := update_set_clause || ', current_period_end = least(coalesce(current_period_end, now()), now())';
  end if;

  if has_cancel_at_period_end then
    update_set_clause := update_set_clause || ', cancel_at_period_end = true';
  end if;

  if has_updated_at then
    update_set_clause := update_set_clause || ', updated_at = now()';
  end if;

  execute format(
    'update public.user_subscriptions set %s where user_id = $1 and status = ''active''',
    update_set_clause
  )
  using p_user_id;

  if has_billing_cycle then
    insert_columns := insert_columns || ', billing_cycle';
    insert_values := insert_values || ', $3';
  end if;

  if has_amount_paid then
    insert_columns := insert_columns || ', amount_paid';
    insert_values := insert_values || ', $4';
  end if;

  if has_currency then
    insert_columns := insert_columns || ', currency';
    insert_values := insert_values || ', ''BRL''';
  end if;

  if has_current_period_start then
    insert_columns := insert_columns || ', current_period_start';
    insert_values := insert_values || ', $5';
  end if;

  if has_current_period_end then
    insert_columns := insert_columns || ', current_period_end';
    insert_values := insert_values || ', $6';
  end if;

  if has_cancel_at_period_end then
    insert_columns := insert_columns || ', cancel_at_period_end';
    insert_values := insert_values || ', false';
  end if;

  if has_trial_end_date then
    insert_columns := insert_columns || ', trial_end_date';
    if coalesce(v_plan.monthly_price, 0) > 0 then
      insert_values := insert_values || ', null';
    else
      insert_values := insert_values || ', $6';
    end if;
  end if;

  if has_created_at then
    insert_columns := insert_columns || ', created_at';
    insert_values := insert_values || ', now()';
  end if;

  if has_updated_at then
    insert_columns := insert_columns || ', updated_at';
    insert_values := insert_values || ', now()';
  end if;

  execute format(
    'insert into public.user_subscriptions (%s) values (%s) returning id',
    insert_columns,
    insert_values
  )
  into v_new_subscription_id
  using
    p_user_id,
    p_plan_id,
    v_billing_cycle,
    coalesce(v_plan.monthly_price, 0),
    p_period_start,
    p_period_end;

  return jsonb_build_object(
    'success', true,
    'subscription_id', v_new_subscription_id,
    'previous_subscription_id', v_previous_subscription_id,
    'previous_plan_id', v_previous_plan_id,
    'new_plan_id', p_plan_id,
    'period_start', p_period_start,
    'period_end', p_period_end
  );
end;
$function$;

commit;

-- =====================================================================
-- VALIDAÇÃO (por função):
--   admin COM aal2: cada tela admin que chama a RPC opera normalmente
--     (moderação/fila, denúncias aprovar/rejeitar/detalhe, destaques clear/expire,
--      excluir anúncio, status pausar/ativar, newsletter listar/exportar/enfileirar,
--      consentimentos listar/exportar, monitoramento, editar período de plano).
--   admin SEM aal2 (aal1): cada RPC -> 'Acesso negado'/'Acesso administrativo necessario'/
--     'Apenas administradores...' (antes era permitido).
--   não-admin/anon: negado.
--   admin_list_reported_announcements: sem 42702; admin_list_user_legal_consents: sem 42804.
-- ROLLBACK: re-aplicar as 17 definições vivas capturadas (saída do string_agg de origem).
-- =====================================================================
