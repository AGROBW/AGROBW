


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE EXTENSION IF NOT EXISTS "pg_cron" WITH SCHEMA "pg_catalog";






COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "unaccent" WITH SCHEMA "public";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE TYPE "public"."severity_level" AS ENUM (
    'info',
    'warning',
    'critical',
    'blocked'
);


ALTER TYPE "public"."severity_level" OWNER TO "postgres";


CREATE TYPE "public"."user_role" AS ENUM (
    'user',
    'editor',
    'admin'
);


ALTER TYPE "public"."user_role" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."accept_my_pending_legal_consents"("p_user_agent" "text" DEFAULT NULL::"text") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_user_id uuid := auth.uid();
  v_headers jsonb := coalesce(nullif(current_setting('request.headers', true), ''), '{}')::jsonb;
  v_forwarded_for text;
  v_real_ip text;
  v_ip_text text;
  v_ip inet;
  v_row record;
  v_inserted_count integer := 0;
begin
  if v_user_id is null then
    raise exception 'Usuario autenticado obrigatorio para registrar reaceite.';
  end if;

  v_forwarded_for := nullif(split_part(coalesce(v_headers ->> 'x-forwarded-for', ''), ',', 1), '');
  v_real_ip := nullif(v_headers ->> 'x-real-ip', '');
  v_ip_text := coalesce(v_forwarded_for, v_real_ip);

  if v_ip_text is not null then
    begin
      v_ip := trim(v_ip_text)::inet;
    exception
      when others then
        v_ip := null;
    end;
  end if;

  for v_row in
    select *
    from public.list_my_pending_legal_consents()
  loop
    insert into public.user_legal_consents (
      user_id,
      consent_type,
      document_version,
      document_title,
      document_url,
      accepted_at,
      source,
      user_agent,
      ip_address,
      metadata
    ) values (
      v_user_id,
      v_row.consent_type,
      v_row.document_version,
      v_row.document_title,
      v_row.document_url,
      now(),
      'profile',
      p_user_agent,
      v_ip,
      jsonb_build_object('captured_from', 'reaccept_gate')
    )
    on conflict do nothing;

    if found then
      v_inserted_count := v_inserted_count + 1;
    end if;
  end loop;

  return v_inserted_count;
end;
$$;


ALTER FUNCTION "public"."accept_my_pending_legal_consents"("p_user_agent" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."accept_my_pending_legal_consents"("p_user_agent" "text") IS 'Registra o reaceite das versoes atuais de Termos e Privacidade para o usuario autenticado.';



CREATE OR REPLACE FUNCTION "public"."add_subscription_history_entry"("p_user_id" "uuid", "p_subscription_id" "uuid", "p_plan_id" "uuid", "p_event_type" "text", "p_status" "text", "p_period_start" timestamp with time zone, "p_period_end" timestamp with time zone, "p_previous_plan_id" "uuid" DEFAULT NULL::"uuid", "p_cancellation_reason" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_history_id UUID;
  v_plan_name TEXT;
  v_plan_price NUMERIC(10,2);
  v_mrr NUMERIC(10,2);
BEGIN
  -- Buscar informações do plano
  SELECT name, monthly_price INTO v_plan_name, v_plan_price
  FROM plans
  WHERE id = p_plan_id;

  -- Calcular MRR contribution
  v_mrr := CASE 
    WHEN p_status IN ('canceled', 'expired') THEN 0
    ELSE v_plan_price
  END;

  -- Inserir no histórico
  INSERT INTO subscription_history (
    user_id,
    subscription_id,
    plan_id,
    plan_name,
    plan_monthly_price,
    event_type,
    status,
    period_start,
    period_end,
    mrr_contribution,
    previous_plan_id,
    cancellation_reason
  ) VALUES (
    p_user_id,
    p_subscription_id,
    p_plan_id,
    v_plan_name,
    v_plan_price,
    p_event_type,
    p_status,
    p_period_start,
    p_period_end,
    v_mrr,
    p_previous_plan_id,
    p_cancellation_reason
  )
  RETURNING id INTO v_history_id;

  RETURN v_history_id;
END;
$$;


ALTER FUNCTION "public"."add_subscription_history_entry"("p_user_id" "uuid", "p_subscription_id" "uuid", "p_plan_id" "uuid", "p_event_type" "text", "p_status" "text", "p_period_start" timestamp with time zone, "p_period_end" timestamp with time zone, "p_previous_plan_id" "uuid", "p_cancellation_reason" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."add_subscription_history_entry"("p_user_id" "uuid", "p_subscription_id" "uuid", "p_plan_id" "uuid", "p_event_type" "text", "p_status" "text", "p_period_start" timestamp with time zone, "p_period_end" timestamp with time zone, "p_previous_plan_id" "uuid", "p_cancellation_reason" "text") IS 'Adiciona entrada no histórico de assinaturas automaticamente';



CREATE OR REPLACE FUNCTION "public"."admin_apply_announcement_edit_request"("p_request_id" "uuid") RETURNS TABLE("announcement_id" "uuid", "title" "text", "status" "text", "video_url" "text", "video_thumbnail_url" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_actor_id uuid := auth.uid();
  v_is_admin boolean := false;
  v_request public.announcement_edit_requests%rowtype;
  v_original_status text;
  v_updated public.announcements%rowtype;
  v_images text[];
begin
  select exists (
    select 1
    from public.users u
    where u.id = v_actor_id
      and (u.is_admin = true or upper(coalesce(u.role, '')) = 'ADMIN')
  )
  into v_is_admin;

  if not v_is_admin then
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
    end,
    whatsapp = case
      when v_request.payload ? 'whatsapp' then nullif(trim(v_request.payload->>'whatsapp'), '')
      else a.whatsapp
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
$$;


ALTER FUNCTION "public"."admin_apply_announcement_edit_request"("p_request_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_approve_reported_announcement"("p_announcement_id" "uuid", "p_note" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."admin_approve_reported_announcement"("p_announcement_id" "uuid", "p_note" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_clear_announcement_highlight"("p_announcement_id" "uuid", "p_highlight_type" "text") RETURNS TABLE("announcement_id" "uuid", "highlight_home" boolean, "highlight_home_until" timestamp with time zone, "highlight_category" boolean, "highlight_category_until" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_actor_id uuid := auth.uid();
  v_is_admin boolean := false;
  v_announcement public.announcements%rowtype;
  v_history_highlight_type text;
begin
  if p_highlight_type not in ('home', 'category') then
    raise exception 'Tipo de destaque inválido: %. Use "home" ou "category".', p_highlight_type;
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
$$;


ALTER FUNCTION "public"."admin_clear_announcement_highlight"("p_announcement_id" "uuid", "p_highlight_type" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_delete_announcement_with_notification"("p_announcement_id" "uuid", "p_reason" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."admin_delete_announcement_with_notification"("p_announcement_id" "uuid", "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_export_newsletter_subscriptions"("p_search" "text" DEFAULT NULL::"text", "p_status" "text" DEFAULT NULL::"text") RETURNS TABLE("email" "text", "source" "text", "status" "text", "created_at" timestamp with time zone, "updated_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if not exists (
    select 1
    from public.users
    where users.id = auth.uid()
      and users.is_admin = true
  ) then
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
$$;


ALTER FUNCTION "public"."admin_export_newsletter_subscriptions"("p_search" "text", "p_status" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_export_user_legal_consents"("p_search" "text" DEFAULT NULL::"text", "p_consent_type" "text" DEFAULT NULL::"text", "p_source" "text" DEFAULT NULL::"text", "p_date_from" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_date_to" timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS TABLE("user_name" "text", "user_email" "text", "user_document" "text", "consent_type" "text", "document_version" "text", "document_title" "text", "document_url" "text", "accepted_at" timestamp with time zone, "revoked_at" timestamp with time zone, "source" "text", "ip_address" "text", "user_agent" "text", "metadata" "jsonb")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_search text := nullif(trim(p_search), '');
begin
  if not exists (
    select 1
    from public.users
    where users.id = auth.uid()
      and users.is_admin = true
  ) then
    raise exception 'Acesso negado';
  end if;

  return query
  select
    u.name as user_name,
    u.email as user_email,
    u.document as user_document,
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
$$;


ALTER FUNCTION "public"."admin_export_user_legal_consents"("p_search" "text", "p_consent_type" "text", "p_source" "text", "p_date_from" timestamp with time zone, "p_date_to" timestamp with time zone) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."admin_export_user_legal_consents"("p_search" "text", "p_consent_type" "text", "p_source" "text", "p_date_from" timestamp with time zone, "p_date_to" timestamp with time zone) IS 'Exporta os consentimentos legais filtrados para uso administrativo e jurídico.';



CREATE OR REPLACE FUNCTION "public"."admin_get_reported_announcement_details"("p_announcement_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."admin_get_reported_announcement_details"("p_announcement_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_list_announcements_monitoring"() RETURNS TABLE("id" "uuid", "title" "text", "description" "text", "status" "text", "created_at" timestamp with time zone, "expires_at" timestamp with time zone, "views" bigint, "price" numeric, "images" "text"[], "category_id" "uuid", "category_slug" "text", "user_id" "uuid", "highlight_home" boolean, "highlight_home_until" timestamp with time zone, "highlight_category" boolean, "highlight_category_until" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
$$;


ALTER FUNCTION "public"."admin_list_announcements_monitoring"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_list_invite_campaigns"() RETURNS TABLE("id" "uuid", "code" "text", "captor_name" "text", "captor_email" "text", "notes" "text", "status" "text", "created_by" "uuid", "created_at" timestamp with time zone, "updated_at" timestamp with time zone, "visits_count" bigint, "registrations_count" bigint)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if not public.is_admin() then
    raise exception 'Acesso negado.';
  end if;

  return query
  select
    ic.id,
    ic.code,
    ic.captor_name,
    ic.captor_email,
    ic.notes,
    ic.status,
    ic.created_by,
    ic.created_at,
    ic.updated_at,
    coalesce(iv.visits_count, 0) as visits_count,
    coalesce(u.registrations_count, 0) as registrations_count
  from public.invite_campaigns ic
  left join (
    select invite_campaign_id, count(*)::bigint as visits_count
    from public.invite_visits
    group by invite_campaign_id
  ) iv
    on iv.invite_campaign_id = ic.id
  left join (
    select invite_campaign_id, count(*)::bigint as registrations_count
    from public.users
    where invite_campaign_id is not null
    group by invite_campaign_id
  ) u
    on u.invite_campaign_id = ic.id
  order by ic.created_at desc;
end;
$$;


ALTER FUNCTION "public"."admin_list_invite_campaigns"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_list_moderation_queue_announcements"() RETURNS TABLE("id" "uuid", "title" "text", "description" "text", "category" "text", "category_id" "uuid", "category_slug" "text", "sub_category_id" "text", "sub_category_label" "text", "price" numeric, "unit_price" numeric, "quantity" numeric, "unit" "text", "currency" "text", "status" "text", "created_at" timestamp with time zone, "user_id" "uuid", "city" "text", "state" "text", "cep" "text", "product_condition" "text", "availability" "text", "accepts_trade" boolean, "has_warranty" boolean, "warranty_details" "text", "has_invoice" boolean, "video_url" "text", "video_storage_path" "text", "video_thumbnail_url" "text", "video_thumbnail_storage_path" "text", "video_duration_seconds" integer, "video_size_bytes" bigint, "is_premium" boolean, "whatsapp" "text", "publication_review_reasons" "jsonb", "publication_review_severity" "text", "community_reports_count" integer, "community_report_reasons" "jsonb", "community_reported_to_review_at" timestamp with time zone, "images" "text"[])
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."admin_list_moderation_queue_announcements"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_list_newsletter_subscriptions"("p_search" "text" DEFAULT NULL::"text", "p_status" "text" DEFAULT NULL::"text", "p_page" integer DEFAULT 0, "p_page_size" integer DEFAULT 20) RETURNS TABLE("id" "uuid", "email" "text", "source" "text", "status" "text", "created_at" timestamp with time zone, "updated_at" timestamp with time zone, "total_count" bigint)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_offset integer := greatest(coalesce(p_page, 0), 0) * greatest(coalesce(p_page_size, 20), 1);
  v_limit integer := greatest(coalesce(p_page_size, 20), 1);
begin
  if not exists (
    select 1
    from public.users
    where users.id = auth.uid()
      and users.is_admin = true
  ) then
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
$$;


ALTER FUNCTION "public"."admin_list_newsletter_subscriptions"("p_search" "text", "p_status" "text", "p_page" integer, "p_page_size" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_list_reported_announcements"() RETURNS TABLE("id" "uuid", "title" "text", "description" "text", "category_slug" "text", "price" numeric, "status" "text", "created_at" timestamp with time zone, "user_id" "uuid", "owner_name" "text", "owner_email" "text", "images" "text"[], "community_reports_count" integer, "community_report_reasons" "jsonb", "community_reported_to_review_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."admin_list_reported_announcements"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_list_user_legal_consents"("p_search" "text" DEFAULT NULL::"text", "p_consent_type" "text" DEFAULT NULL::"text", "p_source" "text" DEFAULT NULL::"text", "p_date_from" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_date_to" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_page" integer DEFAULT 0, "p_page_size" integer DEFAULT 20) RETURNS TABLE("id" "uuid", "user_id" "uuid", "user_name" "text", "user_email" "text", "user_document" "text", "consent_type" "text", "document_version" "text", "document_title" "text", "document_url" "text", "accepted_at" timestamp with time zone, "revoked_at" timestamp with time zone, "source" "text", "user_agent" "text", "ip_address" "text", "metadata" "jsonb", "total_count" bigint)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_offset integer := greatest(coalesce(p_page, 0), 0) * greatest(coalesce(p_page_size, 20), 1);
  v_limit integer := greatest(coalesce(p_page_size, 20), 1);
  v_search text := nullif(trim(p_search), '');
begin
  if not exists (
    select 1
    from public.users
    where users.id = auth.uid()
      and users.is_admin = true
  ) then
    raise exception 'Acesso negado';
  end if;

  return query
  with filtered as (
    select
      ulc.id,
      ulc.user_id,
      u.name as user_name,
      u.email as user_email,
      u.document as user_document,
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
$$;


ALTER FUNCTION "public"."admin_list_user_legal_consents"("p_search" "text", "p_consent_type" "text", "p_source" "text", "p_date_from" timestamp with time zone, "p_date_to" timestamp with time zone, "p_page" integer, "p_page_size" integer) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."admin_list_user_legal_consents"("p_search" "text", "p_consent_type" "text", "p_source" "text", "p_date_from" timestamp with time zone, "p_date_to" timestamp with time zone, "p_page" integer, "p_page_size" integer) IS 'Lista consentimentos legais para consulta administrativa com busca, filtros e paginação.';



CREATE OR REPLACE FUNCTION "public"."admin_queue_newsletter_campaign"("p_campaign_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_actor_id uuid := auth.uid();
  v_is_admin boolean := false;
  v_campaign public.newsletter_campaigns%rowtype;
  v_inserted_count integer := 0;
begin
  select
    coalesce(users.is_admin, false) = true
    or lower(coalesce(users.role, '')) = 'admin'
  into v_is_admin
  from public.users
  where users.id = v_actor_id;

  if not coalesce(v_is_admin, false) then
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
$$;


ALTER FUNCTION "public"."admin_queue_newsletter_campaign"("p_campaign_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_reject_announcement"("p_announcement_id" "uuid", "p_reason" "text") RETURNS TABLE("announcement_id" "uuid", "title" "text", "status" "text", "user_id" "uuid", "rejection_reason" "text", "rejected_at" timestamp with time zone, "reanalysis_available_at" timestamp with time zone, "notification_id" "uuid")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
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
$_$;


ALTER FUNCTION "public"."admin_reject_announcement"("p_announcement_id" "uuid", "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_set_announcement_status"("p_announcement_id" "uuid", "p_status" "text", "p_reason" "text" DEFAULT NULL::"text") RETURNS TABLE("announcement_id" "uuid", "title" "text", "status" "text", "user_id" "uuid", "notification_id" "uuid")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."admin_set_announcement_status"("p_announcement_id" "uuid", "p_status" "text", "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_update_announcement_highlight_expiration"("p_announcement_id" "uuid", "p_highlight_type" "text", "p_expires_at" timestamp with time zone) RETURNS TABLE("announcement_id" "uuid", "highlight_home" boolean, "highlight_home_until" timestamp with time zone, "highlight_category" boolean, "highlight_category_until" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
$$;


ALTER FUNCTION "public"."admin_update_announcement_highlight_expiration"("p_announcement_id" "uuid", "p_highlight_type" "text", "p_expires_at" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_update_user_plan_period"("p_user_id" "uuid", "p_plan_id" "uuid", "p_period_start" timestamp with time zone, "p_period_end" timestamp with time zone, "p_billing_cycle" "text" DEFAULT 'monthly'::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
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

  select coalesce(u.is_admin, false) or u.role = 'admin'
    into v_is_admin
  from public.users u
  where u.id = v_admin_id;

  if not coalesce(v_is_admin, false) then
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
$_$;


ALTER FUNCTION "public"."admin_update_user_plan_period"("p_user_id" "uuid", "p_plan_id" "uuid", "p_period_start" timestamp with time zone, "p_period_end" timestamp with time zone, "p_billing_cycle" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."append_query_param"("p_link" "text", "p_key" "text", "p_value" "text") RETURNS "text"
    LANGUAGE "plpgsql" IMMUTABLE
    AS $$
declare
  v_link text := coalesce(nullif(trim(p_link), ''), '/minha-conta/meu-plano');
begin
  if position((p_key || '=') in v_link) > 0 then
    return v_link;
  end if;

  if position('?' in v_link) > 0 then
    return v_link || '&' || p_key || '=' || p_value;
  end if;

  return v_link || '?' || p_key || '=' || p_value;
end;
$$;


ALTER FUNCTION "public"."append_query_param"("p_link" "text", "p_key" "text", "p_value" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."apply_announcement_highlight"("p_announcement_id" "uuid", "p_highlight_type" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_user_id uuid;
  v_announcement_record record;
  v_subscription_record record;
  v_plan_record record;
  v_usage_window record;
  v_has_subscription boolean := false;
  v_has_plan boolean := false;
  v_last_highlight record;
  v_highlights_used int;
  v_highlights_limit int;
  v_category_highlight_days int := 7;
  v_home_highlight_days int := 7;
  v_booster_category_highlight_days int := 30;
  v_booster_home_highlight_days int := 15;
  v_booster_remaining int := 0;
  v_expires_at timestamptz;
  v_available_after timestamptz;
  v_credit_source text := 'plan';
  v_booster_purchase_id uuid := null;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    return jsonb_build_object('success', false, 'error', 'Usuario nao autenticado');
  end if;

  select *
  into v_announcement_record
  from public.announcements
  where id = p_announcement_id
    and user_id = v_user_id
  limit 1;

  if v_announcement_record is null then
    return jsonb_build_object('success', false, 'error', 'Anuncio nao encontrado ou nao pertence ao usuario');
  end if;

  if p_highlight_type not in ('category', 'home') then
    return jsonb_build_object('success', false, 'error', 'Tipo de destaque invalido. Use "category" ou "home"');
  end if;

  if p_highlight_type = 'category'
     and coalesce(v_announcement_record.highlight_home, false)
     and (v_announcement_record.highlight_home_until is null or v_announcement_record.highlight_home_until > now()) then
    return jsonb_build_object(
      'success', false,
      'error', 'Este anuncio ja possui destaque na home ativo. Aguarde o termino ou remova o destaque atual para usar destaque em categoria.'
    );
  end if;

  if p_highlight_type = 'home'
     and coalesce(v_announcement_record.highlight_category, false)
     and (v_announcement_record.highlight_category_until is null or v_announcement_record.highlight_category_until > now()) then
    return jsonb_build_object(
      'success', false,
      'error', 'Este anuncio ja possui destaque em categoria ativo. Aguarde o termino ou remova o destaque atual para usar destaque na home.'
    );
  end if;

  select *
  into v_subscription_record
  from public.user_subscriptions
  where user_id = v_user_id
    and status = 'active'
    and now() between current_period_start and current_period_end
  order by current_period_end desc
  limit 1;

  v_has_subscription := found;

  if v_has_subscription then
    select *
    into v_plan_record
    from public.plans
    where id = v_subscription_record.plan_id;

    v_has_plan := found;

    if v_has_plan then
      v_category_highlight_days := coalesce(v_plan_record.category_highlight_days, 7);
      v_home_highlight_days := coalesce(v_plan_record.home_highlight_days, 7);
    end if;

    select *
    into v_usage_window
    from public.calculate_subscription_usage_window(
      v_subscription_record.current_period_start,
      v_subscription_record.current_period_end,
      now()
    );
  end if;

  if p_highlight_type = 'category' then
    v_highlights_limit := case
      when v_has_subscription and v_has_plan
        then coalesce(v_plan_record.category_highlights_count, 0) + coalesce(v_subscription_record.category_highlights_carryover, 0)
      else 0
    end;
  else
    v_highlights_limit := case
      when v_has_subscription and v_has_plan
        then coalesce(v_plan_record.home_highlight_count, 0) + coalesce(v_subscription_record.home_highlights_carryover, 0)
      else 0
    end;
  end if;

  if v_has_subscription then
    select count(*)
    into v_highlights_used
    from public.announcement_highlights_history
    where user_id = v_user_id
      and highlight_type = p_highlight_type
      and credit_source = 'plan'
      and applied_at between v_usage_window.usage_period_start and v_usage_window.usage_period_end;
  else
    v_highlights_used := 0;
  end if;

  select
    coalesce(sum(
      case
        when p_highlight_type = 'category' then category_credits_remaining
        else home_credits_remaining
      end
    ), 0)
  into v_booster_remaining
  from public.user_highlight_booster_purchases
  where user_id = v_user_id
    and status = 'credited';

  select *
  into v_last_highlight
  from public.announcement_highlights_history
  where announcement_id = p_announcement_id
    and highlight_type = p_highlight_type
  order by coalesce(expires_at, applied_at) desc
  limit 1;

  if v_last_highlight is not null then
    v_available_after := coalesce(v_last_highlight.expires_at, v_last_highlight.applied_at) + interval '15 days';

    if now() < v_available_after then
      return jsonb_build_object(
        'success', false,
        'error', 'Este anuncio ainda esta em cooldown para este tipo de destaque. O novo prazo de 15 dias comeca apos o vencimento do destaque anterior.',
        'last_highlight_date', v_last_highlight.applied_at,
        'last_highlight_expires_at', v_last_highlight.expires_at,
        'available_after', v_available_after
      );
    end if;
  end if;

  if v_highlights_used >= v_highlights_limit then
    if v_booster_remaining <= 0 then
      if v_highlights_limit <= 0 then
        return jsonb_build_object(
          'success', false,
          'error', format(
            'Seu plano atual nao inclui destaques de %s e voce nao possui creditos extras disponiveis.',
            case when p_highlight_type = 'category' then 'categoria' else 'home' end
          )
        );
      end if;

      return jsonb_build_object(
        'success', false,
        'error', format(
          'Voce ja usou todos os %s creditos de destaque de %s deste ciclo e nao possui booster disponivel.',
          v_highlights_limit,
          case when p_highlight_type = 'category' then 'categoria' else 'home' end
        ),
        'used', v_highlights_used,
        'limit', v_highlights_limit
      );
    end if;

    v_credit_source := 'booster';

    if p_highlight_type = 'category' then
      update public.user_highlight_booster_purchases
      set
        category_credits_remaining = category_credits_remaining - 1,
        updated_at = now()
      where id = (
        select id
        from public.user_highlight_booster_purchases
        where user_id = v_user_id
          and status = 'credited'
          and category_credits_remaining > 0
        order by created_at asc
        limit 1
      )
      returning id into v_booster_purchase_id;
    else
      update public.user_highlight_booster_purchases
      set
        home_credits_remaining = home_credits_remaining - 1,
        updated_at = now()
      where id = (
        select id
        from public.user_highlight_booster_purchases
        where user_id = v_user_id
          and status = 'credited'
          and home_credits_remaining > 0
        order by created_at asc
        limit 1
      )
      returning id into v_booster_purchase_id;
    end if;

    if v_booster_purchase_id is null then
      return jsonb_build_object('success', false, 'error', 'Nao foi possivel consumir o saldo extra do booster.');
    end if;

    select
      coalesce(hb.category_highlight_days, 30),
      coalesce(hb.home_highlight_days, 15)
    into v_booster_category_highlight_days, v_booster_home_highlight_days
    from public.user_highlight_booster_purchases ubp
    join public.highlight_boosters hb on hb.id = ubp.booster_id
    where ubp.id = v_booster_purchase_id;
  end if;

  if p_highlight_type = 'category' then
    v_expires_at := now() + (
      case
        when v_credit_source = 'booster' then v_booster_category_highlight_days
        else v_category_highlight_days
      end || ' days'
    )::interval;
    update public.announcements
    set
      highlight_category = true,
      highlight_category_until = v_expires_at,
      updated_at = now()
    where id = p_announcement_id;
  else
    v_expires_at := now() + (
      case
        when v_credit_source = 'booster' then v_booster_home_highlight_days
        else v_home_highlight_days
      end || ' days'
    )::interval;
    update public.announcements
    set
      highlight_home = true,
      highlight_home_until = v_expires_at,
      updated_at = now()
    where id = p_announcement_id;
  end if;

  insert into public.announcement_highlights_history (
    announcement_id,
    user_id,
    highlight_type,
    applied_at,
    expires_at,
    subscription_period_start,
    subscription_period_end,
    credit_source,
    booster_purchase_id
  ) values (
    p_announcement_id,
    v_user_id,
    p_highlight_type,
    now(),
    v_expires_at,
    case when v_has_subscription then v_usage_window.usage_period_start else now() end,
    case when v_has_subscription then v_usage_window.usage_period_end else now() end,
    v_credit_source,
    v_booster_purchase_id
  );

  select
    coalesce(sum(
      case
        when p_highlight_type = 'category' then category_credits_remaining
        else home_credits_remaining
      end
    ), 0)
  into v_booster_remaining
  from public.user_highlight_booster_purchases
  where user_id = v_user_id
    and status = 'credited';

  return jsonb_build_object(
    'success', true,
    'message', format(
      'Destaque de %s aplicado com sucesso!',
      case when p_highlight_type = 'category' then 'categoria' else 'home' end
    ),
    'expires_at', v_expires_at,
    'available_after', v_expires_at + interval '15 days',
    'used', case when v_credit_source = 'plan' then v_highlights_used + 1 else v_highlights_used end,
    'limit', v_highlights_limit,
    'remaining', greatest(v_highlights_limit - (case when v_credit_source = 'plan' then v_highlights_used + 1 else v_highlights_used end), 0),
    'credit_source', v_credit_source,
    'booster_remaining', v_booster_remaining
  );
exception
  when others then
    return jsonb_build_object(
      'success', false,
      'error', format('Erro ao aplicar destaque: %s', sqlerrm)
    );
end;
$$;


ALTER FUNCTION "public"."apply_announcement_highlight"("p_announcement_id" "uuid", "p_highlight_type" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."apply_censorship_to_existing_announcements"() RETURNS TABLE("id" "uuid", "old_title" "text", "new_title" "text", "old_description" "text", "new_description" "text", "was_modified" boolean)
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  replacement_text TEXT := '[CONTATO PROTEGIDO]';
  announcement_record RECORD;
  new_title_value TEXT;
  new_description_value TEXT;
  was_changed BOOLEAN;
BEGIN
  FOR announcement_record IN 
    SELECT a.id, a.title, a.description 
    FROM announcements a
    ORDER BY a.created_at DESC
  LOOP
    -- Aplicar censura
    new_title_value := announcement_record.title;
    new_description_value := announcement_record.description;
    
    -- Telefones
    new_title_value := regexp_replace(new_title_value, '\(?\d{2,3}\)?\s*\d{4,5}[-\s]?\d{4}', replacement_text, 'gi');
    new_description_value := regexp_replace(new_description_value, '\(?\d{2,3}\)?\s*\d{4,5}[-\s]?\d{4}', replacement_text, 'gi');
    
    new_title_value := regexp_replace(new_title_value, '\y\d{10,11}\y', replacement_text, 'gi');
    new_description_value := regexp_replace(new_description_value, '\y\d{10,11}\y', replacement_text, 'gi');
    
    -- E-mails
    new_title_value := regexp_replace(new_title_value, '[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}', replacement_text, 'gi');
    new_description_value := regexp_replace(new_description_value, '[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}', replacement_text, 'gi');
    
    -- Links
    new_title_value := regexp_replace(new_title_value, 'https?://[^\s]+', replacement_text, 'gi');
    new_description_value := regexp_replace(new_description_value, 'https?://[^\s]+', replacement_text, 'gi');
    
    new_title_value := regexp_replace(new_title_value, 'www\.[^\s]+', replacement_text, 'gi');
    new_description_value := regexp_replace(new_description_value, 'www\.[^\s]+', replacement_text, 'gi');
    
    new_title_value := regexp_replace(new_title_value, '\y[a-zA-Z0-9-]+\.(com|net|org|br|gov\.br|edu\.br|app|io|co|xyz|online|site|store|shop|blog|com\.br)\y', replacement_text, 'gi');
    new_description_value := regexp_replace(new_description_value, '\y[a-zA-Z0-9-]+\.(com|net|org|br|gov\.br|edu\.br|app|io|co|xyz|online|site|store|shop|blog|com\.br)\y', replacement_text, 'gi');
    
    -- Redes sociais
    new_title_value := regexp_replace(new_title_value, '@[a-zA-Z0-9._]+', replacement_text, 'gi');
    new_description_value := regexp_replace(new_description_value, '@[a-zA-Z0-9._]+', replacement_text, 'gi');
    
    new_title_value := regexp_replace(new_title_value, '\y(instagram|insta|facebook|face|whatsapp|whats|zap|telegram|tele|discord|twitter|tiktok|linkedin)\y', replacement_text, 'gi');
    new_description_value := regexp_replace(new_description_value, '\y(instagram|insta|facebook|face|whatsapp|whats|zap|telegram|tele|discord|twitter|tiktok|linkedin)\y', replacement_text, 'gi');
    
    -- Verificar se houve mudança
    was_changed := (new_title_value != announcement_record.title OR new_description_value != announcement_record.description);
    
    -- Retornar resultado
    id := announcement_record.id;
    old_title := announcement_record.title;
    new_title := new_title_value;
    old_description := announcement_record.description;
    new_description := new_description_value;
    was_modified := was_changed;
    
    RETURN NEXT;
    
    -- Aplicar mudança se necessário (descomente para executar)
    -- IF was_changed THEN
    --   UPDATE announcements
    --   SET title = new_title_value, description = new_description_value
    --   WHERE announcements.id = announcement_record.id;
    -- END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."apply_censorship_to_existing_announcements"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."assign_start_agro_plan"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  start_plan_id uuid;
  start_lead_days int;
  start_plan_validity_days int;
begin
  select
    id,
    coalesce(lead_contact_limit_days_monthly, lead_contact_limit_days),
    public.resolve_plan_validity_days('monthly', plan_validity_days_monthly, plan_validity_days_yearly)
  into start_plan_id, start_lead_days, start_plan_validity_days
  from public.plans
  where is_active = true
    and (
      is_default_signup_plan = true
      or lower(trim(coalesce(name, ''))) in ('start', 'start agro', 'safra')
    )
  order by is_default_signup_plan desc, position asc
  limit 1;

  if start_plan_id is null then
    return new;
  end if;

  insert into public.user_subscriptions (
    user_id,
    plan_id,
    status,
    current_period_start,
    current_period_end,
    cancel_at_period_end,
    trial_end_date
  ) values (
    new.id,
    start_plan_id,
    'active',
    now(),
    now() + (
      coalesce(start_plan_validity_days, 30) || ' days'
    )::interval,
    false,
    case
      when start_lead_days is not null
        then now() + (start_lead_days || ' days')::interval
      else null
    end
  );

  return new;
end;
$$;


ALTER FUNCTION "public"."assign_start_agro_plan"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."block_messages_for_expired_announcements"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
declare
  target_status text;
  target_contact_expires_at timestamptz;
  target_seller_id uuid;
begin
  select
    a.status,
    l.contact_expires_at,
    c.seller_id
  into target_status, target_contact_expires_at, target_seller_id
  from public.chats c
  join public.announcements a on a.id = c.announcement_id
  left join public.leads l on l.chat_id = c.id
  where c.id = new.chat_id
  limit 1;

  if target_status = 'EXPIRED' then
    raise exception 'Anuncio expirado';
  end if;

  if target_contact_expires_at is not null
     and target_contact_expires_at <= now()
     and new.sender_id = target_seller_id then
    raise exception 'Novo contato bloqueado por vigencia inativa';
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."block_messages_for_expired_announcements"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."business_description_has_contact_reference"("input_text" "text") RETURNS boolean
    LANGUAGE "plpgsql" IMMUTABLE
    AS $$
declare
  normalized text;
  compacted text;
begin
  if input_text is null or btrim(input_text) = '' then
    return false;
  end if;

  normalized := lower(unaccent(input_text));
  compacted := regexp_replace(normalized, '[^a-z0-9]+', '', 'g');

  return
    length(btrim(input_text)) > 500
    or input_text ~* '[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}'
    or input_text ~* 'https?://'
    or input_text ~* 'www\.'
    or input_text ~* '\m[a-z0-9\-]+\.(com|com\.br|net|org|br|gov\.br|edu\.br|app|io|co|xyz|online|site|store|shop|blog)\M'
    or input_text ~* '@[a-z0-9._-]+'
    or input_text ~* '\+?55\s*\(?\d{2,3}\)?\s*\d{4,5}[-\s]?\d{4}'
    or input_text ~* '\(?\d{2,3}\)?\s*\d{4,5}[-\s]?\d{4}'
    or input_text ~* '\m\d{10,13}\M'
    or normalized ~* '\m(whatsapp|whats|zap|telegram|instagram|insta|facebook|linkedin|twitter|tiktok|discord|gmail|hotmail|outlook|yahoo|email|e-mail|arroba|telefone|celular|fone|contato|ligue|chama|direct|dm|site|link)\M'
    or compacted ~ '(whatsapp|whats|zap|telegram|instagram|insta|facebook|linkedin|twitter|tiktok|discord|gmail|hotmail|outlook|yahoo|email|arroba|telefone|celular|fone|contato|ligue|chama|direct|site|link|wame)';
end;
$$;


ALTER FUNCTION "public"."business_description_has_contact_reference"("input_text" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."calculate_announcement_deletion_scheduled_at"("p_user_id" "uuid", "p_reference" timestamp with time zone DEFAULT "now"()) RETURNS timestamp with time zone
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_expired_deletion_days integer;
begin
  select p.expired_deletion_days
    into v_expired_deletion_days
  from public.user_subscriptions us
  join public.plans p on p.id = us.plan_id
  where us.user_id = p_user_id
    and us.status = 'active'
  order by us.current_period_end desc nulls last
  limit 1;

  if v_expired_deletion_days is null or v_expired_deletion_days <= 0 then
    v_expired_deletion_days := 90;
  end if;

  return p_reference + make_interval(days => v_expired_deletion_days);
end;
$$;


ALTER FUNCTION "public"."calculate_announcement_deletion_scheduled_at"("p_user_id" "uuid", "p_reference" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."calculate_announcement_expires_at"("p_user_id" "uuid", "p_reference" timestamp with time zone DEFAULT "now"()) RETURNS timestamp with time zone
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_ad_duration_days integer;
begin
  select p.ad_duration_days
    into v_ad_duration_days
  from public.user_subscriptions us
  join public.plans p on p.id = us.plan_id
  where us.user_id = p_user_id
    and us.status = 'active'
  order by us.current_period_end desc nulls last
  limit 1;

  if v_ad_duration_days is null or v_ad_duration_days <= 0 then
    return null;
  end if;

  return p_reference + make_interval(days => v_ad_duration_days);
end;
$$;


ALTER FUNCTION "public"."calculate_announcement_expires_at"("p_user_id" "uuid", "p_reference" timestamp with time zone) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."calculate_announcement_expires_at"("p_user_id" "uuid", "p_reference" timestamp with time zone) IS 'Calcula expires_at do anúncio com base no plano ativo do usuário.';



CREATE OR REPLACE FUNCTION "public"."calculate_distance_km"("lat1" numeric, "lon1" numeric, "lat2" numeric, "lon2" numeric) RETURNS numeric
    LANGUAGE "plpgsql" IMMUTABLE
    AS $$
DECLARE
  earth_radius CONSTANT DECIMAL := 6371.0; -- Raio da Terra em km
  dlat DECIMAL;
  dlon DECIMAL;
  a DECIMAL;
  c DECIMAL;
BEGIN
  -- Validação de entrada
  IF lat1 IS NULL OR lon1 IS NULL OR lat2 IS NULL OR lon2 IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- Fórmula de Haversine
  dlat := RADIANS(lat2 - lat1);
  dlon := RADIANS(lon2 - lon1);
  
  a := SIN(dlat/2) * SIN(dlat/2) + 
       COS(RADIANS(lat1)) * COS(RADIANS(lat2)) * 
       SIN(dlon/2) * SIN(dlon/2);
  
  c := 2 * ATAN2(SQRT(a), SQRT(1-a));
  
  RETURN earth_radius * c;
END;
$$;


ALTER FUNCTION "public"."calculate_distance_km"("lat1" numeric, "lon1" numeric, "lat2" numeric, "lon2" numeric) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."calculate_distance_km"("lat1" numeric, "lon1" numeric, "lat2" numeric, "lon2" numeric) IS 'Calcula distância em km entre dois pontos usando fórmula de Haversine';



CREATE OR REPLACE FUNCTION "public"."calculate_lead_contact_expires_at"("p_seller_id" "uuid", "p_announcement_id" "uuid") RETURNS timestamp with time zone
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_announcement_created_at timestamptz;
  v_subscription record;
  v_limit_days integer;
begin
  select a.created_at
    into v_announcement_created_at
  from public.announcements a
  where a.id = p_announcement_id
  limit 1;

  if v_announcement_created_at is null then
    return null;
  end if;

  select
    us.current_period_start,
    us.current_period_end,
    us.source,
    us.promotion_code_id,
    p.lead_contact_limit_days_monthly,
    p.lead_contact_limit_days_yearly,
    p.lead_contact_limit_days
    into v_subscription
  from public.user_subscriptions us
  join public.plans p on p.id = us.plan_id
  where us.user_id = p_seller_id
  order by
    case
      when us.status = 'active' and now() between us.current_period_start and us.current_period_end then 0
      else 1
    end,
    us.current_period_end desc nulls last,
    us.created_at desc nulls last
  limit 1;

  if v_subscription is null then
    return null;
  end if;

  v_limit_days := public.resolve_lead_contact_limit_days(
    v_subscription.current_period_start,
    v_subscription.current_period_end,
    v_subscription.lead_contact_limit_days_monthly,
    v_subscription.lead_contact_limit_days_yearly,
    v_subscription.lead_contact_limit_days,
    v_subscription.source = 'promotion' or v_subscription.promotion_code_id is not null
  );

  if v_limit_days is null then
    return null;
  end if;

  if v_limit_days <= 0 then
    return v_announcement_created_at;
  end if;

  return least(
    v_announcement_created_at + make_interval(days => v_limit_days),
    v_subscription.current_period_end
  );
end;
$$;


ALTER FUNCTION "public"."calculate_lead_contact_expires_at"("p_seller_id" "uuid", "p_announcement_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."calculate_subscription_usage_window"("p_period_start" timestamp with time zone, "p_period_end" timestamp with time zone, "p_reference" timestamp with time zone DEFAULT "now"()) RETURNS TABLE("usage_period_start" timestamp with time zone, "usage_period_end" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_total_days numeric;
begin
  v_total_days := extract(epoch from (p_period_end - p_period_start)) / 86400;

  if v_total_days <= 45 then
    usage_period_start := p_period_start;
    usage_period_end := p_period_end;
    return next;
    return;
  end if;

  usage_period_start := p_period_start;
  usage_period_end := least(p_period_start + interval '1 month', p_period_end);

  while p_reference >= usage_period_end and usage_period_end < p_period_end loop
    usage_period_start := usage_period_end;
    usage_period_end := least(usage_period_end + interval '1 month', p_period_end);
  end loop;

  return next;
end;
$$;


ALTER FUNCTION "public"."calculate_subscription_usage_window"("p_period_start" timestamp with time zone, "p_period_end" timestamp with time zone, "p_reference" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cancel_subscription"("p_subscription_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_user_id UUID;
BEGIN
  -- Buscar user_id da assinatura
  SELECT user_id INTO v_user_id
  FROM user_subscriptions
  WHERE id = p_subscription_id;

  -- Verificar se o usuário pode cancelar (próprio ou admin)
  IF auth.uid() != v_user_id AND NOT EXISTS (
    SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Unauthorized to cancel this subscription';
  END IF;

  -- Atualizar assinatura
  UPDATE user_subscriptions
  SET 
    status = 'cancelled',
    cancelled_at = NOW()
  WHERE id = p_subscription_id;

  RETURN true;
END;
$$;


ALTER FUNCTION "public"."cancel_subscription"("p_subscription_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."cancel_subscription"("p_subscription_id" "uuid") IS 'Cancela uma assinatura (usuário ou admin)';



CREATE OR REPLACE FUNCTION "public"."capture_signup_invite_attribution"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_raw_meta jsonb;
  v_invite_code text;
  v_invite_session_id text;
  v_campaign_id uuid;
  v_campaign_code text;
begin
  select a.raw_user_meta_data
    into v_raw_meta
  from auth.users a
  where a.id = new.id;

  if v_raw_meta is null then
    return new;
  end if;

  v_invite_code := upper(trim(coalesce(v_raw_meta ->> 'invite_code', '')));
  v_invite_session_id := trim(coalesce(v_raw_meta ->> 'invite_session_id', ''));

  if v_invite_code = '' then
    return new;
  end if;

  select ic.id, ic.code
    into v_campaign_id, v_campaign_code
  from public.invite_campaigns ic
  where ic.status = 'active'
    and ic.code = v_invite_code
  limit 1;

  if v_campaign_id is null then
    return new;
  end if;

  update public.users
     set invite_campaign_id = v_campaign_id,
         invite_code = v_campaign_code,
         invite_attribution_at = coalesce(new.created_at, now())
   where id = new.id
     and invite_campaign_id is null;

  if v_invite_session_id is not null and v_invite_session_id <> '' then
    update public.invite_visits
       set registered_user_id = new.id,
           updated_at = now()
     where invite_campaign_id = v_campaign_id
       and session_id = v_invite_session_id;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."capture_signup_invite_attribution"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."capture_signup_legal_consents"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_raw_meta jsonb;
  v_accepted_terms boolean := false;
  v_accepted_privacy boolean := false;
  v_user_agent text;
  v_source text := 'register';
  v_terms_snapshot record;
  v_privacy_snapshot record;
begin
  select a.raw_user_meta_data
    into v_raw_meta
  from auth.users a
  where a.id = new.id;

  if v_raw_meta is null then
    return new;
  end if;

  v_accepted_terms := coalesce((v_raw_meta ->> 'accepted_terms_of_use')::boolean, false);
  v_accepted_privacy := coalesce((v_raw_meta ->> 'accepted_privacy_policy')::boolean, false);
  v_user_agent := nullif(v_raw_meta ->> 'legal_consent_user_agent', '');
  v_source := coalesce(nullif(v_raw_meta ->> 'legal_consent_source', ''), 'register');

  if v_accepted_terms then
    select *
      into v_terms_snapshot
    from public.resolve_legal_document_snapshot('terms_of_use');

    insert into public.user_legal_consents (
      user_id,
      consent_type,
      document_version,
      document_title,
      document_url,
      accepted_at,
      source,
      user_agent,
      metadata
    ) values (
      new.id,
      'terms_of_use',
      v_terms_snapshot.document_version,
      v_terms_snapshot.document_title,
      v_terms_snapshot.document_url,
      coalesce(new.created_at, now()),
      v_source,
      v_user_agent,
      jsonb_build_object('captured_from', 'signup')
    )
    on conflict do nothing;
  end if;

  if v_accepted_privacy then
    select *
      into v_privacy_snapshot
    from public.resolve_legal_document_snapshot('privacy_policy');

    insert into public.user_legal_consents (
      user_id,
      consent_type,
      document_version,
      document_title,
      document_url,
      accepted_at,
      source,
      user_agent,
      metadata
    ) values (
      new.id,
      'privacy_policy',
      v_privacy_snapshot.document_version,
      v_privacy_snapshot.document_title,
      v_privacy_snapshot.document_url,
      coalesce(new.created_at, now()),
      v_source,
      v_user_agent,
      jsonb_build_object('captured_from', 'signup')
    )
    on conflict do nothing;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."capture_signup_legal_consents"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."capture_signup_legal_consents"() IS 'Captura os aceites jurídicos informados no cadastro inicial e os transforma em histórico auditável.';



CREATE OR REPLACE FUNCTION "public"."censor_contact_data"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  replacement_text TEXT := '[CONTATO PROTEGIDO]';
  original_title TEXT;
  original_description TEXT;
BEGIN
  -- Armazenar valores originais
  original_title := NEW.title;
  original_description := NEW.description;
  
  -- ============================================
  -- CENSURA DE TELEFONES
  -- ============================================
  
  -- Formato: (XX) XXXXX-XXXX ou (XX) XXXX-XXXX
  NEW.title := regexp_replace(NEW.title, '\(?\d{2,3}\)?\s*\d{4,5}[-\s]?\d{4}', replacement_text, 'gi');
  NEW.description := regexp_replace(NEW.description, '\(?\d{2,3}\)?\s*\d{4,5}[-\s]?\d{4}', replacement_text, 'gi');
  
  -- Formato: XX XXXXX-XXXX ou XX XXXX-XXXX (com espaços)
  NEW.title := regexp_replace(NEW.title, '\y\d{2,3}\s+\d{4,5}[-\s]?\d{4}\y', replacement_text, 'gi');
  NEW.description := regexp_replace(NEW.description, '\y\d{2,3}\s+\d{4,5}[-\s]?\d{4}\y', replacement_text, 'gi');
  
  -- Formato: XXXXXXXXXXX (11 dígitos) ou XXXXXXXXXX (10 dígitos)
  NEW.title := regexp_replace(NEW.title, '\y\d{10,11}\y', replacement_text, 'gi');
  NEW.description := regexp_replace(NEW.description, '\y\d{10,11}\y', replacement_text, 'gi');
  
  -- Formato internacional: +55 XX XXXXX-XXXX
  NEW.title := regexp_replace(NEW.title, '\+55\s*\(?\d{2,3}\)?\s*\d{4,5}[-\s]?\d{4}', replacement_text, 'gi');
  NEW.description := regexp_replace(NEW.description, '\+55\s*\(?\d{2,3}\)?\s*\d{4,5}[-\s]?\d{4}', replacement_text, 'gi');
  
  -- Formato com zero na frente: 0XX XXXXX-XXXX
  NEW.title := regexp_replace(NEW.title, '\y0\d{2,3}\s*\d{4,5}[-\s]?\d{4}\y', replacement_text, 'gi');
  NEW.description := regexp_replace(NEW.description, '\y0\d{2,3}\s*\d{4,5}[-\s]?\d{4}\y', replacement_text, 'gi');
  
  -- ============================================
  -- CENSURA DE E-MAILS
  -- ============================================
  
  -- Formato: usuario@provedor.com.br
  NEW.title := regexp_replace(NEW.title, '[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}', replacement_text, 'gi');
  NEW.description := regexp_replace(NEW.description, '[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}', replacement_text, 'gi');
  
  -- ============================================
  -- CENSURA DE LINKS E URLs
  -- ============================================
  
  -- URLs com protocolo (http:// ou https://)
  NEW.title := regexp_replace(NEW.title, 'https?://[^\s]+', replacement_text, 'gi');
  NEW.description := regexp_replace(NEW.description, 'https?://[^\s]+', replacement_text, 'gi');
  
  -- URLs iniciando com www
  NEW.title := regexp_replace(NEW.title, 'www\.[^\s]+', replacement_text, 'gi');
  NEW.description := regexp_replace(NEW.description, 'www\.[^\s]+', replacement_text, 'gi');
  
  -- Domínios genéricos (site.com, site.com.br)
  NEW.title := regexp_replace(NEW.title, '\y[a-zA-Z0-9-]+\.(com|net|org|br|gov\.br|edu\.br|app|io|co|xyz|online|site|store|shop|blog|com\.br)\y', replacement_text, 'gi');
  NEW.description := regexp_replace(NEW.description, '\y[a-zA-Z0-9-]+\.(com|net|org|br|gov\.br|edu\.br|app|io|co|xyz|online|site|store|shop|blog|com\.br)\y', replacement_text, 'gi');
  
  -- ============================================
  -- CENSURA DE REDES SOCIAIS
  -- ============================================
  
  -- Menções com @ (ex: @usuario)
  NEW.title := regexp_replace(NEW.title, '@[a-zA-Z0-9._]+', replacement_text, 'gi');
  NEW.description := regexp_replace(NEW.description, '@[a-zA-Z0-9._]+', replacement_text, 'gi');
  
  -- Nomes de redes sociais (menções diretas)
  NEW.title := regexp_replace(NEW.title, '\y(instagram|insta|facebook|face|whatsapp|whats|zap|telegram|tele|discord|twitter|tiktok|linkedin)\y', replacement_text, 'gi');
  NEW.description := regexp_replace(NEW.description, '\y(instagram|insta|facebook|face|whatsapp|whats|zap|telegram|tele|discord|twitter|tiktok|linkedin)\y', replacement_text, 'gi');
  
  -- URLs de redes sociais específicas
  NEW.title := regexp_replace(NEW.title, '(instagram\.com|facebook\.com|fb\.com|wa\.me|t\.me|discord\.gg|twitter\.com|tiktok\.com|linkedin\.com)/[^\s]*', replacement_text, 'gi');
  NEW.description := regexp_replace(NEW.description, '(instagram\.com|facebook\.com|fb\.com|wa\.me|t\.me|discord\.gg|twitter\.com|tiktok\.com|linkedin\.com)/[^\s]*', replacement_text, 'gi');
  
  -- ============================================
  -- LOG (opcional): Registrar se houve censura
  -- ============================================
  
  IF NEW.title != original_title OR NEW.description != original_description THEN
    RAISE NOTICE 'Censura aplicada no anúncio ID: % (user: %)', NEW.id, NEW.user_id;
  END IF;
  
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."censor_contact_data"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."censor_contact_data"() IS 'Censura automática de telefones, e-mails e links em title e description de announcements. Gatilho executado BEFORE INSERT OR UPDATE para garantir proteção mesmo sem JavaScript.';



CREATE OR REPLACE FUNCTION "public"."check_and_clean_highlights_before_select"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  -- Verificar se o anúncio tem destaque home expirado
  IF NEW.highlight_home = true 
     AND NEW.highlight_home_until IS NOT NULL 
     AND NEW.highlight_home_until < NOW() THEN
    NEW.highlight_home := false;
  END IF;

  -- Verificar se o anúncio tem destaque categoria expirado
  IF NEW.highlight_category = true 
     AND NEW.highlight_category_until IS NOT NULL 
     AND NEW.highlight_category_until < NOW() THEN
    NEW.highlight_category := false;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."check_and_clean_highlights_before_select"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_rate_limit"("p_user_id" "uuid", "p_action" "text", "p_max_requests" integer, "p_window_seconds" integer) RETURNS TABLE("allowed" boolean, "remaining" integer, "reset_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_window_start  timestamptz;
  v_count         integer;
  v_reset_at      timestamptz;
BEGIN
  v_window_start := now() - (p_window_seconds || ' seconds')::interval;

  -- Upsert atômico: incrementar contador ou resetar se janela expirou
  INSERT INTO public.rate_limit_counters (user_id, action, request_count, window_start, updated_at)
  VALUES (p_user_id, p_action, 1, now(), now())
  ON CONFLICT (user_id, action) DO UPDATE
  SET
    request_count = CASE
      WHEN rate_limit_counters.window_start < v_window_start THEN 1  -- Janela expirou, reiniciar
      ELSE rate_limit_counters.request_count + 1
    END,
    window_start = CASE
      WHEN rate_limit_counters.window_start < v_window_start THEN now()
      ELSE rate_limit_counters.window_start
    END,
    updated_at = now()
  RETURNING request_count, window_start
  INTO v_count, v_reset_at;

  v_reset_at := v_reset_at + (p_window_seconds || ' seconds')::interval;

  RETURN QUERY SELECT
    v_count <= p_max_requests,                    -- allowed
    GREATEST(0, p_max_requests - v_count),        -- remaining
    v_reset_at;                                   -- reset_at
END;
$$;


ALTER FUNCTION "public"."check_rate_limit"("p_user_id" "uuid", "p_action" "text", "p_max_requests" integer, "p_window_seconds" integer) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."check_rate_limit"("p_user_id" "uuid", "p_action" "text", "p_max_requests" integer, "p_window_seconds" integer) IS 'Verifica e incrementa contador de rate limit de forma atômica';



CREATE OR REPLACE FUNCTION "public"."check_user_plan_active"("user_uuid" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  is_active boolean := false;
begin
  perform public.ensure_user_current_subscription(user_uuid);

  select exists (
    select 1
    from public.user_subscriptions us
    where us.user_id = user_uuid
      and us.status = 'active'
      and now() < us.current_period_end
  ) into is_active;

  return is_active;
end;
$$;


ALTER FUNCTION "public"."check_user_plan_active"("user_uuid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."clean_expired_highlights"() RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  -- Limpar highlight_home expirados
  UPDATE announcements
  SET highlight_home = false
  WHERE highlight_home = true
    AND highlight_home_until IS NOT NULL
    AND highlight_home_until < NOW();

  -- Limpar highlight_category expirados
  UPDATE announcements
  SET highlight_category = false
  WHERE highlight_category = true
    AND highlight_category_until IS NOT NULL
    AND highlight_category_until < NOW();

  RAISE NOTICE 'Destaques expirados limpos com sucesso';
END;
$$;


ALTER FUNCTION "public"."clean_expired_highlights"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."clean_expired_highlights"() IS 'Limpa automaticamente os destaques expirados (highlight_home e highlight_category) baseado nas colunas highlight_home_until e highlight_category_until. Pode ser executado manualmente ou via cron job.';



CREATE OR REPLACE FUNCTION "public"."cleanup_expired_highlights"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  -- Limpar destaques de categoria expirados
  UPDATE public.announcements
  SET 
    highlight_category = FALSE,
    highlight_category_until = NULL,
    updated_at = NOW()
  WHERE highlight_category = TRUE
    AND highlight_category_until IS NOT NULL
    AND highlight_category_until < NOW();

  -- Limpar destaques de home expirados
  UPDATE public.announcements
  SET 
    highlight_home = FALSE,
    highlight_home_until = NULL,
    updated_at = NOW()
  WHERE highlight_home = TRUE
    AND highlight_home_until IS NOT NULL
    AND highlight_home_until < NOW();
END;
$$;


ALTER FUNCTION "public"."cleanup_expired_highlights"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cleanup_expired_opportunities"() RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  DELETE FROM opportunities WHERE expires_at < NOW();
END;
$$;


ALTER FUNCTION "public"."cleanup_expired_opportunities"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cleanup_old_security_events"("p_days_to_keep" integer DEFAULT 90) RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_deleted_count INTEGER;
BEGIN
  -- Deletar eventos mais antigos que X dias
  DELETE FROM security_events
  WHERE created_at < NOW() - (p_days_to_keep || ' days')::INTERVAL;
  
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  
  RAISE NOTICE 'Cleanup: % eventos de segurança antigos removidos', v_deleted_count;
  
  RETURN v_deleted_count;
END;
$$;


ALTER FUNCTION "public"."cleanup_old_security_events"("p_days_to_keep" integer) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."cleanup_old_security_events"("p_days_to_keep" integer) IS 'Remove eventos de segurança mais antigos que N dias (padrão: 90). Deve ser executado periodicamente.';



CREATE OR REPLACE FUNCTION "public"."complete_my_document_verification_upload"("p_document_path" "text", "p_result" "text", "p_failure_reason" "text" DEFAULT NULL::"text") RETURNS TABLE("success" boolean, "document_review_status" "text", "document_verified" boolean, "document_retry_available_at" timestamp with time zone, "document_last_failure_reason" "text", "notification_created" boolean, "message" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_user_id uuid := auth.uid();
  v_now timestamptz := now();
  v_retry_until timestamptz;
  v_name text;
  v_failure_reason text := nullif(trim(coalesce(p_failure_reason, '')), '');
  v_notification_created boolean := false;
begin
  if v_user_id is null then
    raise exception 'Usuario nao autenticado.';
  end if;

  if nullif(trim(coalesce(p_document_path, '')), '') is null then
    raise exception 'Caminho do documento nao informado.';
  end if;

  if p_result not in ('approved', 'rejected', 'pending') then
    raise exception 'Resultado de verificacao invalido.';
  end if;

  select
    u.document_retry_available_at,
    u.name
  into
    v_retry_until,
    v_name
  from public.users u
  where u.id = v_user_id
  for update;

  if v_retry_until is not null and v_retry_until > v_now then
    raise exception 'Nova tentativa disponivel somente em %.', to_char(v_retry_until at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI');
  end if;

  if p_result = 'approved' then
    update public.users
    set
      document_path = p_document_path,
      document_verified = true,
      document_review_status = 'approved',
      document_review_notes = null,
      document_reviewed_at = v_now,
      document_reviewed_by = null,
      document_last_attempt_at = v_now,
      document_retry_available_at = null,
      document_last_failure_reason = null
    where id = v_user_id;

    return query
    select true, 'approved', true, null::timestamptz, null::text, false, 'Documento validado com sucesso.';
    return;
  end if;

  if p_result = 'pending' then
    update public.users
    set
      document_path = p_document_path,
      document_verified = null,
      document_review_status = 'pending',
      document_review_notes = null,
      document_reviewed_at = null,
      document_reviewed_by = null,
      document_last_attempt_at = v_now,
      document_retry_available_at = null,
      document_last_failure_reason = null
    where id = v_user_id;

    return query
    select true, 'pending', null::boolean, null::timestamptz, null::text, false, 'Documento enviado para analise manual.';
    return;
  end if;

  v_retry_until := v_now + interval '24 hours';

  update public.users
  set
    document_path = p_document_path,
    document_verified = false,
    document_review_status = 'rejected',
    document_review_notes = coalesce(v_failure_reason, 'Nao foi possivel validar o documento automaticamente.'),
    document_reviewed_at = v_now,
    document_reviewed_by = null,
    document_last_attempt_at = v_now,
    document_retry_available_at = v_retry_until,
    document_last_failure_reason = coalesce(v_failure_reason, 'Nao foi possivel validar o documento automaticamente.')
  where id = v_user_id;

  insert into public.notifications (
    user_id,
    type,
    title,
    content,
    link,
    is_read
  ) values (
    v_user_id,
    'account_verification',
    'Nao foi possivel validar seu documento',
    format(
      '%s Voce podera enviar uma nova tentativa apos %s.',
      coalesce(v_failure_reason, 'Nao foi possivel validar o documento automaticamente.'),
      to_char(v_retry_until at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI')
    ),
    '/minha-conta/perfil',
    false
  );

  v_notification_created := true;

  return query
  select
    true,
    'rejected',
    false,
    v_retry_until,
    coalesce(v_failure_reason, 'Nao foi possivel validar o documento automaticamente.'),
    v_notification_created,
    'Documento reprovado automaticamente. Nova tentativa liberada em 24 horas.';
end;
$$;


ALTER FUNCTION "public"."complete_my_document_verification_upload"("p_document_path" "text", "p_result" "text", "p_failure_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."count_shared_announcement_title_tokens"("p_first" "text", "p_second" "text") RETURNS integer
    LANGUAGE "sql" IMMUTABLE
    AS $$
  select count(*)
  from (
    select distinct token
    from unnest(public.normalize_announcement_similarity_words(p_first)) as token
    intersect
    select distinct token
    from unnest(public.normalize_announcement_similarity_words(p_second)) as token
  ) shared_tokens;
$$;


ALTER FUNCTION "public"."count_shared_announcement_title_tokens"("p_first" "text", "p_second" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_lead_notification"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  INSERT INTO notifications (user_id, type, title, content, link)
  VALUES (
    NEW.seller_id,
    'new_lead',
    'Novo interesse no seu anúncio',
    NEW.buyer_name || ' está interessado em um anúncio.',
    '/minha-conta/leads?lead=' || NEW.id::text
  );
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."create_lead_notification"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_message_notification"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  recipient_id UUID;
  sender_name TEXT;
BEGIN
  SELECT 
    CASE WHEN NEW.sender_id = chats.buyer_id THEN chats.seller_id ELSE chats.buyer_id END
  INTO recipient_id
  FROM chats WHERE id = NEW.chat_id;
  
  SELECT name INTO sender_name FROM users WHERE id = NEW.sender_id;
  
  INSERT INTO notifications (user_id, type, title, content, link)
  VALUES (
    recipient_id,
    'new_message',
    'Nova mensagem de ' || COALESCE(sender_name, 'Usuário'),
    LEFT(NEW.content, 100),
    '/minha-conta/mensagens?chat=' || NEW.chat_id::text
  );
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."create_message_notification"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_radar_match_notification"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_announcement_title TEXT;
  v_announcement_category TEXT;
  v_alert_name TEXT;
  v_match_score INTEGER;
BEGIN
  -- Apenas criar notificação se:
  -- 1. Match não foi dismissed
  -- 2. Match não foi viewed (evitar duplicatas se usuário já viu)
  IF NEW.is_dismissed OR NEW.is_viewed THEN
    RETURN NEW;
  END IF;

  -- Buscar dados do anúncio e categoria
  SELECT 
    a.title, 
    COALESCE(c.name, 'Produtos Agro')
  INTO 
    v_announcement_title, 
    v_announcement_category
  FROM announcements a
  LEFT JOIN categories c ON c.id = a.category_id
  WHERE a.id = NEW.announcement_id;

  -- Se anúncio não encontrado, não criar notificação
  IF v_announcement_title IS NULL THEN
    RETURN NEW;
  END IF;

  -- Buscar nome do alerta (se disponível)
  SELECT name INTO v_alert_name
  FROM opportunity_alerts
  WHERE id = NEW.alert_id;

  -- Valor do score (arredondado)
  v_match_score := NEW.match_score;

  -- Criar notificação
  INSERT INTO notifications (
    user_id,
    type,
    title,
    content,
    link,
    is_read,
    created_at
  ) VALUES (
    NEW.user_id,
    'radar_match',
    '🎯 Nova oportunidade: ' || SUBSTRING(v_announcement_title, 1, 50),
    'O Radar de Oportunidades encontrou um anúncio de ' || 
    v_announcement_category || 
    ' que corresponde aos critérios do seu alerta' ||
    CASE 
      WHEN v_alert_name IS NOT NULL THEN ' "' || v_alert_name || '"'
      ELSE ''
    END ||
    '. Score de compatibilidade: ' || v_match_score || '/100.',
    '/anuncio/' || NEW.announcement_id::text,
    false,
    NOW()
  )
  ON CONFLICT DO NOTHING; -- Evitar duplicatas se trigger rodar múltiplas vezes

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."create_radar_match_notification"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."create_radar_match_notification"() IS 'Cria notificação automática quando radar match é criado (não dismissed, não viewed)';



CREATE OR REPLACE FUNCTION "public"."deduct_credits_on_unlock"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF NEW.status = 'unlocked' AND OLD.status = 'pending' THEN
    UPDATE users 
    SET credits = credits - COALESCE(NEW.cost_in_credits, 5)
    WHERE id = NEW.seller_id;
    
    NEW.unlocked_at = NOW();
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."deduct_credits_on_unlock"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_announcement_with_relations"("p_announcement_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  current_user_id uuid := auth.uid();
  announcement_owner_id uuid;
  requester_role text;
  chat_ids uuid[];
begin
  if current_user_id is null then
    return jsonb_build_object('success', false, 'error', 'Usuario nao autenticado');
  end if;

  select a.user_id
    into announcement_owner_id
  from public.announcements a
  where a.id = p_announcement_id
  limit 1;

  if announcement_owner_id is null then
    return jsonb_build_object('success', false, 'error', 'Anuncio nao encontrado');
  end if;

  select lower(coalesce(u.role, ''))
    into requester_role
  from public.users u
  where u.id = current_user_id
  limit 1;

  if requester_role <> 'admin' and announcement_owner_id <> current_user_id then
    return jsonb_build_object('success', false, 'error', 'Sem permissao para excluir este anuncio');
  end if;

  update public.announcement_highlights_history
  set announcement_id = null
  where announcement_id = p_announcement_id;

  select array_agg(c.id)
    into chat_ids
  from public.chats c
  where c.announcement_id = p_announcement_id;

  delete from public.announcement_clicks_by_state
  where announcement_id = p_announcement_id;

  delete from public.announcement_technical_details
  where announcement_id = p_announcement_id;

  delete from public.favorites
  where announcement_id = p_announcement_id;

  delete from public.leads
  where announcement_id = p_announcement_id;

  delete from public.announcement_metrics
  where announcement_id = p_announcement_id;

  delete from public.lead_conversions
  where announcement_id = p_announcement_id;

  delete from public.opportunities
  where announcement_id = p_announcement_id;

  delete from public.opportunity_matches
  where announcement_id = p_announcement_id;

  delete from public.price_drop_notifications
  where announcement_id = p_announcement_id;

  delete from public.announcement_reports
  where announcement_id = p_announcement_id;

  delete from public.announcement_edit_requests
  where announcement_id = p_announcement_id;

  if chat_ids is not null and array_length(chat_ids, 1) > 0 then
    delete from public.messages
    where chat_id = any(chat_ids);

    delete from public.leads
    where chat_id = any(chat_ids);

    delete from public.chats
    where id = any(chat_ids);
  end if;

  delete from public.announcements
  where id = p_announcement_id;

  return jsonb_build_object(
    'success', true,
    'announcementId', p_announcement_id
  );
end;
$$;


ALTER FUNCTION "public"."delete_announcement_with_relations"("p_announcement_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."dispatch_commercial_intelligence_outreach"("p_category_slug" "text", "p_subcategory_slug" "text" DEFAULT NULL::"text", "p_message" "text" DEFAULT NULL::"text") RETURNS TABLE("campaign_id" "uuid", "recipients_count" integer, "delivered_count" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_user_id uuid := auth.uid();
  v_plan_limit integer := 0;
  v_outreachs_used integer := 0;
  v_campaign_id uuid;
  v_message text;
  v_seller_label text;
begin
  if v_user_id is null then
    raise exception 'Usuario nao autenticado';
  end if;

  if coalesce(trim(p_category_slug), '') = '' then
    raise exception 'Selecione uma categoria para enviar a abordagem mediada.';
  end if;

  v_message := trim(coalesce(p_message, ''));
  if char_length(v_message) < 40 then
    raise exception 'Escreva uma mensagem com pelo menos 40 caracteres.';
  end if;

  if char_length(v_message) > 1200 then
    raise exception 'A mensagem pode ter no maximo 1200 caracteres.';
  end if;

  select
    coalesce(p.commercial_intelligence_requests_per_month, 0)
  into v_plan_limit
  from public.user_subscriptions us
  join public.plans p on p.id = us.plan_id
  where us.user_id = v_user_id
    and us.status in ('active', 'trialing', 'past_due')
    and coalesce(p.has_commercial_intelligence, false) = true
  order by
    us.current_period_end desc nulls last,
    us.created_at desc nulls last
  limit 1;

  if coalesce(v_plan_limit, 0) <= 0 then
    raise exception 'Seu plano atual nao inclui o envio mediado da inteligencia comercial.';
  end if;

  select count(*)
  into v_outreachs_used
  from public.commercial_intelligence_outreach_campaigns campaigns
  where campaigns.seller_user_id = v_user_id
    and campaigns.created_at >= date_trunc('month', now())
    and campaigns.created_at < date_trunc('month', now()) + interval '1 month';

  if v_outreachs_used >= 1 then
    raise exception 'Este MVP permite uma campanha mediada por mes para cada conta elegivel.';
  end if;

  select
    coalesce(nullif(store.store_name, ''), nullif(seller.name, ''), 'uma loja parceira da AGRO BW')
  into v_seller_label
  from public.users seller
  left join public.seller_stores store on store.user_id = seller.id
  where seller.id = v_user_id
  limit 1;

  insert into public.commercial_intelligence_outreach_campaigns (
    seller_user_id,
    category_slug,
    subcategory_slug,
    message_template
  )
  values (
    v_user_id,
    trim(p_category_slug),
    nullif(trim(coalesce(p_subcategory_slug, '')), ''),
    v_message
  )
  returning id into v_campaign_id;

  with filtered_announcements as (
    select
      a.id,
      a.category_slug,
      a.sub_category_id,
      a.sub_category_label
    from public.announcements a
    where a.category_slug = trim(p_category_slug)
      and (
        coalesce(trim(p_subcategory_slug), '') = ''
        or lower(coalesce(a.sub_category_label, '')) = lower(trim(p_subcategory_slug))
        or lower(coalesce(a.sub_category_id::text, '')) = lower(trim(p_subcategory_slug))
      )
  ),
  announcement_views as (
    select
      spv.user_id,
      count(*)::integer as announcement_views,
      0::integer as favorites_count,
      0::integer as lead_actions,
      max(spv.created_at) as last_activity_at
    from public.site_page_views spv
    join filtered_announcements fa on fa.id = spv.entity_id
    where spv.page_type = 'announcement'
      and spv.is_admin_area = false
      and spv.user_id is not null
      and spv.user_id <> v_user_id
      and spv.created_at >= now() - interval '30 days'
    group by spv.user_id
  ),
  favorite_signals as (
    select
      f.user_id,
      0::integer as announcement_views,
      count(*)::integer as favorites_count,
      0::integer as lead_actions,
      max(f.created_at) as last_activity_at
    from public.favorites f
    join filtered_announcements fa on fa.id = f.announcement_id
    where f.user_id <> v_user_id
      and f.created_at >= now() - interval '30 days'
    group by f.user_id
  ),
  lead_signals as (
    select
      l.buyer_id as user_id,
      0::integer as announcement_views,
      0::integer as favorites_count,
      count(*)::integer as lead_actions,
      max(l.created_at) as last_activity_at
    from public.leads l
    join filtered_announcements fa on fa.id = l.announcement_id
    where l.buyer_id <> v_user_id
      and l.created_at >= now() - interval '30 days'
    group by l.buyer_id
  ),
  consolidated_signals as (
    select * from announcement_views
    union all
    select * from favorite_signals
    union all
    select * from lead_signals
  ),
  buyer_interest as (
    select
      cs.user_id,
      sum(cs.announcement_views)::integer as announcement_views,
      sum(cs.favorites_count)::integer as favorites_count,
      sum(cs.lead_actions)::integer as lead_actions,
      max(cs.last_activity_at) as last_activity_at,
      case
        when (sum(cs.lead_actions) * 6 + sum(cs.favorites_count) * 4 + sum(cs.announcement_views)) >= 10 then 3
        when (sum(cs.lead_actions) * 6 + sum(cs.favorites_count) * 4 + sum(cs.announcement_views)) >= 4 then 2
        else 1
      end as score_order
    from consolidated_signals cs
    group by cs.user_id
  ),
  eligible_optins as (
    select
      bi.user_id,
      bi.score_order,
      bi.last_activity_at
    from buyer_interest bi
    join public.commercial_lead_preferences clp on clp.user_id = bi.user_id
    where clp.allow_commercial_contact = true
      and clp.consent_granted_at is not null
      and clp.consent_revoked_at is null
      and coalesce(array_length(clp.allowed_category_slugs, 1), 0) >= 0
      and (
        coalesce(array_length(clp.allowed_category_slugs, 1), 0) = 0
        or trim(p_category_slug) = any(clp.allowed_category_slugs)
      )
      and 'platform' = any(clp.preferred_channels)
    order by bi.score_order desc, bi.last_activity_at desc nulls last
    limit 50
  ),
  inserted_notifications as (
    insert into public.notifications (
      user_id,
      type,
      title,
      content,
      link
    )
    select
      optins.user_id,
      'SYSTEM',
      'Nova oportunidade comercial no seu segmento',
      format(
        '%s enviou uma proposta mediada pela AGRO BW para compradores com interesse em %s%s. Abra a central para avaliar a oportunidade e iniciar contato somente se desejar. Mensagem: %s',
        coalesce(v_seller_label, 'Uma loja parceira da AGRO BW'),
        trim(p_category_slug),
        case
          when coalesce(trim(p_subcategory_slug), '') = '' then ''
          else ' / ' || trim(p_subcategory_slug)
        end,
        v_message
      ),
      '/minha-conta/inteligencia-comercial'
    from eligible_optins optins
    returning id, user_id
  ),
  inserted_deliveries as (
    insert into public.commercial_intelligence_outreach_deliveries (
      campaign_id,
      recipient_user_id,
      notification_id,
      status,
      channel
    )
    select
      v_campaign_id,
      notifications.user_id,
      notifications.id,
      'delivered',
      'platform'
    from inserted_notifications notifications
    returning id
  )
  update public.commercial_intelligence_outreach_campaigns campaigns
  set
    recipients_count = (
      select count(*) from eligible_optins
    ),
    delivered_count = (
      select count(*) from inserted_deliveries
    )
  where campaigns.id = v_campaign_id;

  return query
  select
    campaigns.id,
    campaigns.recipients_count,
    campaigns.delivered_count
  from public.commercial_intelligence_outreach_campaigns campaigns
  where campaigns.id = v_campaign_id;
end;
$$;


ALTER FUNCTION "public"."dispatch_commercial_intelligence_outreach"("p_category_slug" "text", "p_subcategory_slug" "text", "p_message" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."downgrade_expired_subscriptions_to_basic"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_user record;
  v_count integer := 0;
  v_had_active_subscription boolean;
  v_new_subscription_id uuid;
begin
  for v_user in
    select distinct us.user_id
    from public.user_subscriptions us
    where us.current_period_end <= now()
  loop
    select exists (
      select 1
      from public.user_subscriptions us
      where us.user_id = v_user.user_id
        and us.status = 'active'
        and us.current_period_end > now()
    )
    into v_had_active_subscription;

    v_new_subscription_id := public.ensure_user_current_subscription(v_user.user_id);

    if not v_had_active_subscription and v_new_subscription_id is not null then
      v_count := v_count + 1;
    end if;
  end loop;

  return v_count;
end;
$$;


ALTER FUNCTION "public"."downgrade_expired_subscriptions_to_basic"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_announcement_edit_request_publication_rules"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_result jsonb;
  v_original_status text;
  v_announcement_reanalysis_available_at timestamptz;
  v_edit_reanalysis_available_at timestamptz;
  v_images jsonb := case
    when jsonb_typeof(coalesce(new.payload->'images', '[]'::jsonb)) = 'array' then coalesce(new.payload->'images', '[]'::jsonb)
    else '[]'::jsonb
  end;
begin
  select
    upper(coalesce(status, '')),
    reanalysis_available_at
    into v_original_status, v_announcement_reanalysis_available_at
  from public.announcements
  where id = new.announcement_id;

  if coalesce(nullif(trim(coalesce(new.payload->>'__original_announcement_status', '')), ''), '') = '' and coalesce(v_original_status, '') <> '' then
    new.payload := jsonb_set(
      coalesce(new.payload, '{}'::jsonb),
      '{__original_announcement_status}',
      to_jsonb(v_original_status),
      true
    );
  end if;

  if new.status <> 'pending' then
    return new;
  end if;

  if v_original_status = 'REJECTED'
    and v_announcement_reanalysis_available_at is not null
    and v_announcement_reanalysis_available_at > now() then
    raise exception 'Este anúncio foi reprovado e só poderá ser reenviado para análise após %.',
      to_char(v_announcement_reanalysis_available_at at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI');
  end if;

  select aer.reanalysis_available_at
    into v_edit_reanalysis_available_at
  from public.announcement_edit_requests aer
  where aer.announcement_id = new.announcement_id
    and aer.status = 'rejected'
    and aer.reanalysis_available_at is not null
    and aer.reanalysis_available_at > now()
    and (tg_op <> 'UPDATE' or aer.id <> new.id)
  order by aer.reanalysis_available_at desc
  limit 1;

  if v_edit_reanalysis_available_at is not null and v_edit_reanalysis_available_at > now() then
    raise exception 'A última alteração deste anúncio foi rejeitada e só poderá ser reenviada para análise após %.',
      to_char(v_edit_reanalysis_available_at at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI');
  end if;

  v_result := public.evaluate_announcement_publication_rules(
    coalesce(new.payload->>'title', ''),
    coalesce(new.payload->>'description', ''),
    coalesce(new.payload->>'category_slug', ''),
    v_images
  );

  if coalesce((v_result->>'blocked')::boolean, false)
    or coalesce((v_result->>'review_required')::boolean, false) then
    new.payload := jsonb_set(
      coalesce(new.payload, '{}'::jsonb),
      '{__publication_review_reasons}',
      coalesce(v_result->'reasons', '[]'::jsonb),
      true
    );
    new.payload := jsonb_set(
      coalesce(new.payload, '{}'::jsonb),
      '{__review_required}',
      'true'::jsonb,
      true
    );
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."enforce_announcement_edit_request_publication_rules"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_announcement_publication_rules"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."enforce_announcement_publication_rules"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_announcement_similarity_review"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
declare
  review_signal record;
begin
  if coalesce(new.status, '') not in ('ACTIVE', 'active') then
    return new;
  end if;

  if new.user_id is null then
    return new;
  end if;

  select *
    into review_signal
  from public.get_announcement_similarity_review_signal(
    new.user_id,
    new.title,
    new.category_id,
    new.city,
    new.state,
    new.price,
    case when tg_op = 'UPDATE' then new.id else null end
  )
  limit 1;

  if coalesce(review_signal.suspicious, false) then
    new.status := 'PENDING';
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."enforce_announcement_similarity_review"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_default_signup_plan_integrity"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_other_default_exists boolean;
  v_switch_in_progress boolean := coalesce(current_setting('app.allow_default_signup_switch', true), '') = 'on';
begin
  if tg_op in ('INSERT', 'UPDATE') then
    if coalesce(new.is_default_signup_plan, false) and coalesce(new.is_downgrade_plan, false) then
      raise exception 'O plano padrao do cadastro nao pode ser o plano de downgrade.';
    end if;

    if coalesce(new.is_default_signup_plan, false) and not coalesce(new.is_active, true) then
      raise exception 'O plano padrao do cadastro precisa permanecer ativo.';
    end if;
  end if;

  if tg_op = 'UPDATE' then
    if coalesce(old.is_default_signup_plan, false)
       and (
         coalesce(new.is_default_signup_plan, false) = false
         or coalesce(new.is_active, true) = false
       ) then
      if v_switch_in_progress and coalesce(new.is_default_signup_plan, false) = false then
        return new;
      end if;

      select exists (
        select 1
        from public.plans p
        where p.id <> old.id
          and p.is_default_signup_plan = true
      ) into v_other_default_exists;

      if not v_other_default_exists then
        raise exception 'Precisa existir ao menos um plano padrao no cadastro.';
      end if;
    end if;
  end if;

  if tg_op = 'DELETE' and coalesce(old.is_default_signup_plan, false) then
    select exists (
      select 1
      from public.plans p
      where p.id <> old.id
        and p.is_default_signup_plan = true
    ) into v_other_default_exists;

    if not v_other_default_exists then
      raise exception 'Nao e possivel excluir o unico plano padrao do cadastro.';
    end if;
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;


ALTER FUNCTION "public"."enforce_default_signup_plan_integrity"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_no_duplicate_active_announcements"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
declare
  conflicting_announcement record;
  new_title_normalized text;
  old_title_normalized text;
begin
  if coalesce(new.status, '') not in ('ACTIVE', 'active') then
    return new;
  end if;

  if new.user_id is null then
    return new;
  end if;

  new_title_normalized := public.normalize_announcement_similarity_text(new.title);
  old_title_normalized := public.normalize_announcement_similarity_text(old.title);

  if tg_op = 'UPDATE'
    and coalesce(old.status, '') in ('ACTIVE', 'active')
    and new_title_normalized = old_title_normalized
    and new.category_id is not distinct from old.category_id
    and lower(coalesce(new.city, '')) = lower(coalesce(old.city, ''))
    and upper(coalesce(new.state, '')) = upper(coalesce(old.state, ''))
    and coalesce(new.price, 0) = coalesce(old.price, 0)
  then
    return new;
  end if;

  select a.id, a.title
    into conflicting_announcement
  from public.announcements a
  where a.user_id = new.user_id
    and a.status in ('ACTIVE', 'active')
    and (a.expires_at is null or a.expires_at > now())
    and (tg_op <> 'UPDATE' or a.id <> new.id)
    and public.normalize_announcement_similarity_text(a.title) = new_title_normalized
    and a.category_id is not distinct from new.category_id
    and lower(coalesce(a.city, '')) = lower(coalesce(new.city, ''))
    and upper(coalesce(a.state, '')) = upper(coalesce(new.state, ''))
    and coalesce(a.price, 0) = coalesce(new.price, 0)
  limit 1;

  if found then
    raise exception '%',
      format(
        'Ja existe um anuncio ativo muito parecido com este em sua conta (%s). Edite o anuncio existente ou desative-o antes de publicar outro igual.',
        coalesce(conflicting_announcement.title, 'anuncio existente')
      );
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."enforce_no_duplicate_active_announcements"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_simultaneous_active_ad_limit"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  active_subscription record;
  current_active_ads integer := 0;
begin
  if coalesce(new.status, '') not in ('ACTIVE', 'active') then
    return new;
  end if;

  if tg_op = 'UPDATE' and coalesce(old.status, '') in ('ACTIVE', 'active') then
    return new;
  end if;

  if new.user_id is null then
    raise exception 'Usuario do anuncio nao informado';
  end if;

  select
    us.*,
    p.max_ads,
    p.name as plan_name
    into active_subscription
  from public.user_subscriptions us
  join public.plans p on p.id = us.plan_id
  where us.user_id = new.user_id
    and us.status = 'active'
    and us.current_period_end >= now()
  order by us.current_period_end desc
  limit 1;

  if not found then
    raise exception 'Nao existe plano ativo para publicar este anuncio';
  end if;

  if active_subscription.max_ads is null then
    return new;
  end if;

  select count(*)
    into current_active_ads
  from public.announcements a
  where a.user_id = new.user_id
    and a.status in ('ACTIVE', 'active')
    and (a.expires_at is null or a.expires_at > now())
    and (tg_op <> 'UPDATE' or a.id <> new.id);

  if current_active_ads >= active_subscription.max_ads then
    raise exception '%',
      format(
        'Voce atingiu o limite de anuncios ativos do plano %s. Desative outro anuncio ativo ou faca upgrade para liberar mais vagas.',
        coalesce(active_subscription.plan_name, 'atual')
      );
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."enforce_simultaneous_active_ad_limit"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ensure_user_current_subscription"("p_user_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_active_subscription_id uuid;
  v_downgrade_plan record;
  v_previous_subscription record;
  v_user_profile record;
  v_period_days integer;
begin
  if p_user_id is null then
    return null;
  end if;

  update public.user_subscriptions
  set status = 'expired',
      updated_at = now()
  where user_id = p_user_id
    and status = 'active'
    and current_period_end <= now();

  update public.user_subscriptions
  set status = 'expired',
      updated_at = now()
  where id in (
    select id
    from (
      select
        us.id,
        row_number() over (
          order by
            us.current_period_end desc nulls last,
            us.created_at desc
        ) as rn
      from public.user_subscriptions us
      where us.user_id = p_user_id
        and us.status = 'active'
        and us.current_period_end > now()
    ) ranked
    where ranked.rn > 1
  );

  select us.id
  into v_active_subscription_id
  from public.user_subscriptions us
  where us.user_id = p_user_id
    and us.status = 'active'
    and us.current_period_end > now()
  order by us.current_period_end desc
  limit 1;

  if v_active_subscription_id is not null then
    return v_active_subscription_id;
  end if;

  select
    us.id,
    us.plan_id,
    p.name as plan_name,
    us.current_period_end
  into v_previous_subscription
  from public.user_subscriptions us
  join public.plans p on p.id = us.plan_id
  where us.user_id = p_user_id
  order by us.current_period_end desc nulls last, us.created_at desc
  limit 1;

  select
    p.id,
    p.name,
    p.plan_validity_days_monthly,
    p.plan_validity_days_yearly
  into v_downgrade_plan
  from public.plans p
  where p.is_active = true
    and p.is_downgrade_plan = true
  order by p.position asc, p.created_at asc
  limit 1;

  if v_downgrade_plan.id is null then
    return null;
  end if;

  v_period_days := public.resolve_plan_validity_days(
    'monthly',
    v_downgrade_plan.plan_validity_days_monthly,
    v_downgrade_plan.plan_validity_days_yearly
  );

  insert into public.user_subscriptions (
    user_id,
    plan_id,
    status,
    current_period_start,
    current_period_end,
    cancel_at_period_end,
    trial_end_date
  ) values (
    p_user_id,
    v_downgrade_plan.id,
    'active',
    now(),
    now() + (coalesce(v_period_days, 30) || ' days')::interval,
    false,
    null
  )
  returning id into v_active_subscription_id;

  select
    u.email,
    coalesce(u.name, u.email, 'Sistema') as name
  into v_user_profile
  from public.users u
  where u.id = p_user_id;

  insert into public.notifications (
    user_id,
    type,
    title,
    content,
    link
  ) values (
    p_user_id,
    'SYSTEM',
    'Plano ajustado automaticamente',
    format(
      'Sua assinatura anterior expirou e sua conta foi movida para o plano %s. As mensagens enviadas continuam liberadas, mas os contatos recebidos seguem as regras do novo plano.',
      coalesce(v_downgrade_plan.name, 'Básico')
    ),
    '/#/minha-conta/meu-plano'
  );

  insert into public.admin_audit_logs (
    admin_id,
    admin_email,
    admin_name,
    action,
    resource_type,
    resource_id,
    old_value,
    new_value,
    reason,
    metadata
  ) values (
    p_user_id,
    coalesce(v_user_profile.email, 'sistema@bwagro.local'),
    coalesce(v_user_profile.name, 'Sistema'),
    'SUBSCRIPTION_AUTO_DOWNGRADED',
    'SUBSCRIPTION',
    v_active_subscription_id,
    jsonb_build_object(
      'previous_plan_id', v_previous_subscription.plan_id,
      'previous_plan_name', v_previous_subscription.plan_name,
      'previous_period_end', v_previous_subscription.current_period_end
    ),
    jsonb_build_object(
      'new_plan_id', v_downgrade_plan.id,
      'new_plan_name', v_downgrade_plan.name
    ),
    'Downgrade automático por expiração da assinatura',
    jsonb_build_object(
      'trigger', 'ensure_user_current_subscription'
    )
  );

  return v_active_subscription_id;
end;
$$;


ALTER FUNCTION "public"."ensure_user_current_subscription"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."evaluate_announcement_publication_rules"("p_title" "text", "p_description" "text", "p_category_slug" "text", "p_images" "jsonb" DEFAULT '[]'::"jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO 'public'
    AS $$
declare
  v_rule record;
  v_text_title text := lower(coalesce(p_title, ''));
  v_text_description text := lower(coalesce(p_description, ''));
  v_category text := lower(coalesce(p_category_slug, ''));
  v_reasons jsonb := '[]'::jsonb;
  v_blocked boolean := false;
  v_matched boolean;
  v_min_length integer;
  v_description_length integer := length(trim(coalesce(p_description, '')));
  v_images_count integer := 0;
  v_patterns text[] := array[]::text[];
  i integer;
begin
  if jsonb_typeof(coalesce(p_images, '[]'::jsonb)) = 'array' then
    v_images_count := jsonb_array_length(coalesce(p_images, '[]'::jsonb));
  end if;

  for v_rule in
    select *
    from public.publication_moderation_rules
    where is_active = true
    order by created_at asc
  loop
    v_matched := false;
    v_patterns := public.parse_publication_rule_patterns(v_rule.pattern);

    if v_rule.rule_kind = 'keyword' and coalesce(trim(v_rule.pattern), '') <> '' then
      v_matched := (
        (v_rule.target in ('title', 'both') and exists (
          select 1
          from unnest(v_patterns) as pattern
          where v_text_title like '%' || pattern || '%'
        ))
        or
        (v_rule.target in ('description', 'both') and exists (
          select 1
          from unnest(v_patterns) as pattern
          where v_text_description like '%' || pattern || '%'
        ))
      );
    elsif v_rule.rule_kind = 'regex' and coalesce(trim(v_rule.pattern), '') <> '' then
      for i in 1 .. coalesce(array_length(v_patterns, 1), 0) loop
        begin
          if (
            (v_rule.target in ('title', 'both') and coalesce(p_title, '') ~* v_patterns[i])
            or
            (v_rule.target in ('description', 'both') and coalesce(p_description, '') ~* v_patterns[i])
          ) then
            v_matched := true;
            exit;
          end if;
        exception when invalid_regular_expression then
          continue;
        end;
      end loop;
    elsif v_rule.rule_kind = 'category' and coalesce(trim(v_rule.pattern), '') <> '' then
      v_matched := v_category = any(v_patterns);
    elsif v_rule.rule_kind = 'min_description_length' then
      v_min_length := greatest(0, coalesce(nullif(regexp_replace(coalesce(v_rule.pattern, ''), '\D', '', 'g'), '')::integer, 0));
      v_matched := v_min_length > 0 and v_description_length < v_min_length;
    elsif v_rule.rule_kind = 'contact_info' then
      v_matched := (
        coalesce(p_title, '') ~* '(\+?\d[\d\s().-]{7,}\d|[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})'
        or coalesce(p_description, '') ~* '(\+?\d[\d\s().-]{7,}\d|[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})'
      );
    elsif v_rule.rule_kind = 'external_link' then
      v_matched := (
        coalesce(p_title, '') ~* '(https?://|www\.|\.com\b|\.com\.br\b|\.net\b|\.br\b)'
        or coalesce(p_description, '') ~* '(https?://|www\.|\.com\b|\.com\.br\b|\.net\b|\.br\b)'
      );
    elsif v_rule.rule_kind = 'require_image' then
      v_matched := v_images_count = 0;
    end if;

    if v_matched then
      if v_rule.action = 'block' then
        v_blocked := true;
      end if;

      v_reasons := v_reasons || jsonb_build_array(jsonb_build_object(
        'rule_id', v_rule.id,
        'rule_name', v_rule.name,
        'rule_kind', v_rule.rule_kind,
        'action', v_rule.action,
        'message', coalesce(v_rule.description, v_rule.name)
      ));
    end if;
  end loop;

  return jsonb_build_object(
    'blocked', v_blocked,
    'review_required', jsonb_array_length(v_reasons) > 0,
    'reasons', v_reasons
  );
end;
$$;


ALTER FUNCTION "public"."evaluate_announcement_publication_rules"("p_title" "text", "p_description" "text", "p_category_slug" "text", "p_images" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."expire_elapsed_announcements"() RETURNS TABLE("pre_expiration_notified" integer, "expired_count" integer, "deleted_count" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  notified_total integer := 0;
  expired_total integer := 0;
  deleted_total integer := 0;
  expired_ids uuid[];
  deletable_ids uuid[];
begin
  with candidates as (
    select a.id, a.user_id, a.title, a.expires_at
    from public.announcements a
    where a.status = 'ACTIVE'
      and a.expires_at is not null
      and a.expires_at > now()
      and a.expires_at <= now() + interval '5 days'
      and a.pre_expiration_notified_at is null
  ), updated_candidates as (
    update public.announcements a
    set pre_expiration_notified_at = now()
    from candidates c
    where a.id = c.id
    returning c.user_id, c.title, c.expires_at
  )
  insert into public.notifications (user_id, type, title, content, link)
  select
    c.user_id,
    'SYSTEM',
    'Seu anuncio expira em 5 dias',
    format(
      'O anuncio "%s" expira em %s. Se quiser mantelo na vitrine depois do vencimento, sera necessario ter vaga disponivel no plano atual para reativa-lo.',
      c.title,
      to_char(c.expires_at at time zone 'America/Sao_Paulo', 'DD/MM/YYYY')
    ),
    '/#/minha-conta/anuncios'
  from updated_candidates c;

  get diagnostics notified_total = row_count;

  with expiring as (
    update public.announcements a
    set
      status = 'EXPIRED',
      expired_at = coalesce(a.expired_at, now()),
      deletion_scheduled_at = coalesce(
        a.deletion_scheduled_at,
        public.calculate_announcement_deletion_scheduled_at(a.user_id, now())
      ),
      expiration_notified_at = now(),
      highlight_category = false,
      highlight_category_until = null,
      highlight_home = false,
      highlight_home_until = null
    where a.status = 'ACTIVE'
      and a.expires_at is not null
      and a.expires_at <= now()
    returning a.id
  )
  select array_agg(id), count(*)
    into expired_ids, expired_total
  from expiring;

  if expired_ids is not null and array_length(expired_ids, 1) > 0 then
    insert into public.notifications (user_id, type, title, content, link)
    select
      a.user_id,
      'SYSTEM',
      'Seu anuncio expirou',
      format(
        'O anuncio "%s" expirou. Ele foi movido para a aba Vencidos e podera ser reativado apenas se houver vaga disponivel no plano atual. Caso contrario, seguira para exclusao automatica em %s.',
        a.title,
        to_char(a.deletion_scheduled_at at time zone 'America/Sao_Paulo', 'DD/MM/YYYY')
      ),
      '/#/minha-conta/anuncios'
    from public.announcements a
    where a.id = any(expired_ids);
  end if;

  select array_agg(a.id)
    into deletable_ids
  from public.announcements a
  where a.status = 'EXPIRED'
    and a.deletion_scheduled_at is not null
    and a.deletion_scheduled_at <= now();

  if deletable_ids is not null and array_length(deletable_ids, 1) > 0 then
    delete from public.announcement_clicks_by_state
    where announcement_id = any(deletable_ids);

    delete from public.announcement_technical_details
    where announcement_id = any(deletable_ids);

    delete from public.favorites
    where announcement_id = any(deletable_ids);

    delete from public.messages
    where chat_id in (
      select id from public.chats where announcement_id = any(deletable_ids)
    );

    delete from public.leads
    where announcement_id = any(deletable_ids)
       or chat_id in (
         select id from public.chats where announcement_id = any(deletable_ids)
       );

    delete from public.chats
    where announcement_id = any(deletable_ids);

    delete from public.announcement_metrics
    where announcement_id = any(deletable_ids);

    delete from public.lead_conversions
    where announcement_id = any(deletable_ids);

    delete from public.opportunities
    where announcement_id = any(deletable_ids);

    delete from public.opportunity_matches
    where announcement_id = any(deletable_ids);

    delete from public.price_drop_notifications
    where announcement_id = any(deletable_ids);

    delete from public.announcements
    where id = any(deletable_ids);

    get diagnostics deleted_total = row_count;
  end if;

  return query
  select notified_total, expired_total, deleted_total;
end;
$$;


ALTER FUNCTION "public"."expire_elapsed_announcements"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."expire_old_subscriptions"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_expired_count INTEGER;
BEGIN
  WITH expired AS (
    UPDATE user_subscriptions
    SET status = 'expired'
    WHERE status = 'active'
      AND expires_at < NOW()
    RETURNING id
  )
  SELECT COUNT(*) INTO v_expired_count FROM expired;

  RAISE NOTICE 'Expired % subscriptions', v_expired_count;
  RETURN v_expired_count;
END;
$$;


ALTER FUNCTION "public"."expire_old_subscriptions"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."expire_old_subscriptions"() IS 'Job para expirar assinaturas vencidas';



CREATE OR REPLACE FUNCTION "public"."generate_commercial_intelligence_report"("p_category_slug" "text", "p_subcategory_slug" "text" DEFAULT NULL::"text") RETURNS TABLE("state" "text", "city" "text", "score_band" "text", "interested_buyers" bigint, "consenting_buyers" bigint, "announcement_views" bigint, "favorites_count" bigint, "lead_actions" bigint, "price_min" numeric, "price_max" numeric, "last_activity_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_user_id uuid := auth.uid();
  v_plan_limit integer := 0;
  v_requests_used integer := 0;
  v_request_id uuid;
  v_rows_generated integer := 0;
begin
  if v_user_id is null then
    raise exception 'Usuario nao autenticado';
  end if;

  if coalesce(trim(p_category_slug), '') = '' then
    raise exception 'Selecione uma categoria para gerar a inteligencia comercial.';
  end if;

  select
    coalesce(p.commercial_intelligence_requests_per_month, 0)
  into v_plan_limit
  from public.user_subscriptions us
  join public.plans p on p.id = us.plan_id
  where us.user_id = v_user_id
    and us.status in ('active', 'trialing', 'past_due')
    and coalesce(p.has_commercial_intelligence, false) = true
  order by
    us.current_period_end desc nulls last,
    us.created_at desc nulls last
  limit 1;

  if coalesce(v_plan_limit, 0) <= 0 then
    raise exception 'Seu plano atual nao inclui inteligencia comercial.';
  end if;

  select count(*)
  into v_requests_used
  from public.commercial_intelligence_requests cir
  where cir.seller_user_id = v_user_id
    and cir.created_at >= date_trunc('month', now())
    and cir.created_at < date_trunc('month', now()) + interval '1 month';

  if v_requests_used >= v_plan_limit then
    raise exception 'Voce atingiu o limite mensal de consultas de inteligencia comercial do seu plano.';
  end if;

  insert into public.commercial_intelligence_requests (
    seller_user_id,
    category_slug,
    subcategory_slug
  )
  values (
    v_user_id,
    trim(p_category_slug),
    nullif(trim(coalesce(p_subcategory_slug, '')), '')
  )
  returning id into v_request_id;

  return query
  with filtered_announcements as (
    select
      a.id,
      a.category_slug,
      a.sub_category_id,
      a.sub_category_label,
      nullif(a.city, '') as city,
      nullif(a.state, '') as state,
      case
        when a.price is null then null
        else a.price::numeric
      end as price
    from public.announcements a
    where a.category_slug = trim(p_category_slug)
      and (
        coalesce(trim(p_subcategory_slug), '') = ''
        or lower(coalesce(a.sub_category_label, '')) = lower(trim(p_subcategory_slug))
        or lower(coalesce(a.sub_category_id::text, '')) = lower(trim(p_subcategory_slug))
      )
  ),
  announcement_views as (
    select
      spv.user_id,
      count(*)::bigint as announcement_views,
      0::bigint as favorites_count,
      0::bigint as lead_actions,
      min(fa.price) as price_min,
      max(fa.price) as price_max,
      max(spv.created_at) as last_activity_at
    from public.site_page_views spv
    join filtered_announcements fa on fa.id = spv.entity_id
    where spv.page_type = 'announcement'
      and spv.is_admin_area = false
      and spv.user_id is not null
      and spv.user_id <> v_user_id
      and spv.created_at >= now() - interval '30 days'
    group by spv.user_id
  ),
  favorite_signals as (
    select
      f.user_id,
      0::bigint as announcement_views,
      count(*)::bigint as favorites_count,
      0::bigint as lead_actions,
      min(fa.price) as price_min,
      max(fa.price) as price_max,
      max(f.created_at) as last_activity_at
    from public.favorites f
    join filtered_announcements fa on fa.id = f.announcement_id
    where f.user_id <> v_user_id
      and f.created_at >= now() - interval '30 days'
    group by f.user_id
  ),
  lead_signals as (
    select
      l.buyer_id as user_id,
      0::bigint as announcement_views,
      0::bigint as favorites_count,
      count(*)::bigint as lead_actions,
      min(fa.price) as price_min,
      max(fa.price) as price_max,
      max(l.created_at) as last_activity_at
    from public.leads l
    join filtered_announcements fa on fa.id = l.announcement_id
    where l.buyer_id <> v_user_id
      and l.created_at >= now() - interval '30 days'
    group by l.buyer_id
  ),
  consolidated_signals as (
    select * from announcement_views
    union all
    select * from favorite_signals
    union all
    select * from lead_signals
  ),
  buyer_interest as (
    select
      cs.user_id,
      nullif(u.estado, '') as state,
      nullif(u.cidade, '') as city,
      sum(cs.announcement_views)::bigint as announcement_views,
      sum(cs.favorites_count)::bigint as favorites_count,
      sum(cs.lead_actions)::bigint as lead_actions,
      min(cs.price_min) as price_min,
      max(cs.price_max) as price_max,
      max(cs.last_activity_at) as last_activity_at,
      case
        when (sum(cs.lead_actions) * 6 + sum(cs.favorites_count) * 4 + sum(cs.announcement_views)) >= 10 then 'high'
        when (sum(cs.lead_actions) * 6 + sum(cs.favorites_count) * 4 + sum(cs.announcement_views)) >= 4 then 'medium'
        else 'low'
      end as score_band,
      case
        when clp.allow_commercial_contact = true
         and clp.consent_granted_at is not null
         and clp.consent_revoked_at is null
         and (
           coalesce(array_length(clp.allowed_category_slugs, 1), 0) = 0
           or trim(p_category_slug) = any(clp.allowed_category_slugs)
         )
        then true
        else false
      end as has_opt_in
    from consolidated_signals cs
    join public.users u on u.id = cs.user_id
    left join public.commercial_lead_preferences clp on clp.user_id = cs.user_id
    group by
      cs.user_id,
      u.estado,
      u.cidade,
      clp.allow_commercial_contact,
      clp.consent_granted_at,
      clp.consent_revoked_at,
      clp.allowed_category_slugs
  )
  select
    coalesce(bi.state, 'Nao informado') as state,
    bi.city,
    bi.score_band,
    count(*)::bigint as interested_buyers,
    count(*) filter (where bi.has_opt_in)::bigint as consenting_buyers,
    sum(bi.announcement_views)::bigint as announcement_views,
    sum(bi.favorites_count)::bigint as favorites_count,
    sum(bi.lead_actions)::bigint as lead_actions,
    min(bi.price_min) as price_min,
    max(bi.price_max) as price_max,
    max(bi.last_activity_at) as last_activity_at
  from buyer_interest bi
  group by
    coalesce(bi.state, 'Nao informado'),
    bi.city,
    bi.score_band
  order by
    case bi.score_band
      when 'high' then 1
      when 'medium' then 2
      else 3
    end asc,
    consenting_buyers desc,
    interested_buyers desc,
    announcement_views desc,
    last_activity_at desc nulls last;

  get diagnostics v_rows_generated = row_count;

  update public.commercial_intelligence_requests
  set generated_rows = coalesce(v_rows_generated, 0)
  where id = v_request_id;
end;
$$;


ALTER FUNCTION "public"."generate_commercial_intelligence_report"("p_category_slug" "text", "p_subcategory_slug" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_growth_conversion_notification_for_user"("p_user_id" "uuid" DEFAULT "auth"."uid"()) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_settings public.growth_conversion_settings%rowtype;
  v_plan record;
  v_notifications_today integer := 0;
  v_candidate record;
  v_template jsonb;
  v_title text;
  v_content_main text;
  v_content_support text;
  v_content text;
  v_subject text;
  v_cta text;
  v_link text;
  v_notification_id uuid;
  v_days_left integer;
  v_user_name text := 'Usuario';
  v_values jsonb;
begin
  if p_user_id is null then
    return jsonb_build_object(
      'success', false,
      'error', 'Usuario nao autenticado'
    );
  end if;

  select *
  into v_settings
  from public.growth_conversion_settings
  limit 1;

  if not found then
    insert into public.growth_conversion_settings default values
    returning * into v_settings;
  end if;

  if not coalesce(v_settings.is_enabled, true) then
    return jsonb_build_object(
      'success', true,
      'created', false,
      'reason', 'disabled'
    );
  end if;

  select coalesce(name, 'Usuario')
  into v_user_name
  from public.users
  where id = p_user_id;

  select
    p.name,
    coalesce(p.category_highlights_count, 0) as category_highlights_count,
    coalesce(p.home_highlight_count, 0) as home_highlight_count
  into v_plan
  from public.user_subscriptions us
  join public.plans p
    on p.id = us.plan_id
  where us.user_id = p_user_id
    and us.status = 'active'
    and us.current_period_end > now()
  order by us.current_period_end desc
  limit 1;

  if not found then
    return jsonb_build_object(
      'success', true,
      'created', false,
      'reason', 'no_active_plan'
    );
  end if;

  if not (
    lower(coalesce(v_plan.name, '')) in ('start', 'básico', 'basico')
    or (
      coalesce(v_plan.category_highlights_count, 0) = 0
      and coalesce(v_plan.home_highlight_count, 0) = 0
    )
  ) then
    return jsonb_build_object(
      'success', true,
      'created', false,
      'reason', 'plan_not_eligible'
    );
  end if;

  select count(*)
  into v_notifications_today
  from public.notifications n
  where n.user_id = p_user_id
    and n.type = 'plan_alert'
    and coalesce(n.link, '') like '%source=growth%'
    and n.created_at >= date_trunc('day', now());

  if v_notifications_today >= greatest(coalesce(v_settings.daily_user_limit, 1), 0) then
    return jsonb_build_object(
      'success', true,
      'created', false,
      'reason', 'daily_limit_reached'
    );
  end if;

  with chat_counts as (
    select
      c.announcement_id,
      count(*)::integer as chats_count
    from public.chats c
    where c.announcement_id is not null
    group by c.announcement_id
  ),
  lead_counts as (
    select
      l.announcement_id,
      count(*)::integer as leads_count
    from public.leads l
    where l.announcement_id is not null
    group by l.announcement_id
  ),
  all_active_ads as (
    select
      a.id,
      a.user_id,
      a.title,
      coalesce(a.views, 0) as views,
      a.created_at,
      a.expires_at,
      a.category_slug,
      coalesce(cc.chats_count, 0) as chats_count,
      coalesce(lc.leads_count, 0) as leads_count,
      dense_rank() over (
        partition by a.category_slug
        order by coalesce(a.views, 0) desc, a.created_at asc
      ) as category_rank
    from public.announcements a
    left join chat_counts cc
      on cc.announcement_id = a.id
    left join lead_counts lc
      on lc.announcement_id = a.id
    where upper(coalesce(a.status, '')) = 'ACTIVE'
      and (a.expires_at is null or a.expires_at > now())
  ),
  eligible as (
    select
      aa.*,
      case
        when coalesce(v_settings.trigger_no_leads_enabled, true)
          and aa.views >= coalesce(v_settings.min_views_for_no_leads, 50)
          and aa.leads_count = 0
          and aa.chats_count = 0
          then 'no_leads'
        when coalesce(v_settings.trigger_top_category_enabled, true)
          and aa.views >= coalesce(v_settings.min_views_for_high_views, 20)
          and aa.category_rank <= 3
          then 'top_category'
        when coalesce(v_settings.trigger_expiring_enabled, true)
          and aa.expires_at is not null
          and aa.expires_at <= now() + make_interval(days => coalesce(v_settings.expire_soon_days, 7))
          and aa.views >= coalesce(v_settings.min_views_for_expiring, 15)
          then 'expiring'
        when coalesce(v_settings.trigger_plan_limit_enabled, true)
          and (aa.leads_count > 0 or aa.chats_count > 0)
          then 'plan_limit'
        when coalesce(v_settings.trigger_high_views_enabled, true)
          and aa.views >= coalesce(v_settings.min_views_for_high_views, 20)
          then 'high_views'
        else null
      end as trigger_kind,
      case
        when coalesce(v_settings.trigger_no_leads_enabled, true)
          and aa.views >= coalesce(v_settings.min_views_for_no_leads, 50)
          and aa.leads_count = 0
          and aa.chats_count = 0
          then 1
        when coalesce(v_settings.trigger_top_category_enabled, true)
          and aa.views >= coalesce(v_settings.min_views_for_high_views, 20)
          and aa.category_rank <= 3
          then 2
        when coalesce(v_settings.trigger_expiring_enabled, true)
          and aa.expires_at is not null
          and aa.expires_at <= now() + make_interval(days => coalesce(v_settings.expire_soon_days, 7))
          and aa.views >= coalesce(v_settings.min_views_for_expiring, 15)
          then 3
        when coalesce(v_settings.trigger_plan_limit_enabled, true)
          and (aa.leads_count > 0 or aa.chats_count > 0)
          then 4
        when coalesce(v_settings.trigger_high_views_enabled, true)
          and aa.views >= coalesce(v_settings.min_views_for_high_views, 20)
          then 5
        else 99
      end as trigger_priority
    from all_active_ads aa
    where aa.user_id = p_user_id
  )
  select *
  into v_candidate
  from eligible
  where trigger_kind is not null
  order by trigger_priority asc, views desc, created_at desc
  limit 1;

  if not found then
    return jsonb_build_object(
      'success', true,
      'created', false,
      'reason', 'no_trigger_matched'
    );
  end if;

  if v_candidate.trigger_kind = 'expiring' then
    v_days_left := greatest(1, ceil(extract(epoch from (v_candidate.expires_at - now())) / 86400.0)::integer);
  else
    v_days_left := 0;
  end if;

  v_template := coalesce(v_settings.templates -> v_candidate.trigger_kind, '{}'::jsonb);

  v_values := jsonb_build_object(
    'nome_usuario', coalesce(v_user_name, 'Usuario'),
    'nome_plano', coalesce(v_plan.name, 'Seu plano'),
    'data_vencimento', coalesce(to_char(v_candidate.expires_at at time zone 'America/Sao_Paulo', 'DD/MM/YYYY'), ''),
    'dias_restantes', v_days_left::text,
    'link_upgrade', '/minha-conta/meu-plano?source=growth',
    'titulo_anuncio', coalesce(v_candidate.title, 'Seu anuncio'),
    'visualizacoes', coalesce(v_candidate.views, 0)::text,
    'categoria_rank', coalesce(v_candidate.category_rank, 0)::text,
    'tipo_recurso', 'destaques Home/Categoria'
  );

  v_subject := public.replace_template_placeholders(coalesce(v_template ->> 'subject', ''), v_values);
  v_title := public.replace_template_placeholders(coalesce(v_template ->> 'title', ''), v_values);
  v_content_main := public.replace_template_placeholders(coalesce(v_template ->> 'message', ''), v_values);
  v_content_support := public.replace_template_placeholders(coalesce(v_template ->> 'supportText', ''), v_values);
  v_cta := public.replace_template_placeholders(coalesce(v_template ->> 'cta', ''), v_values);
  v_link := public.append_query_param(
    public.replace_template_placeholders(coalesce(v_template ->> 'link', '/minha-conta/meu-plano'), v_values),
    'source',
    'growth'
  );
  v_content := trim(
    both
    from concat(
      coalesce(v_content_main, ''),
      case
        when nullif(trim(coalesce(v_content_support, '')), '') is not null
          then E'\n\n' || v_content_support
        else ''
      end
    )
  );

  insert into public.notifications (
    user_id,
    type,
    title,
    content,
    link
  )
  values (
    p_user_id,
    'plan_alert',
    v_title,
    v_content,
    v_link
  )
  returning id into v_notification_id;

  return jsonb_build_object(
    'success', true,
    'created', true,
    'notification_id', v_notification_id,
    'title', v_title,
    'content', v_content,
    'subject', v_subject,
    'supportText', v_content_support,
    'cta', v_cta,
    'link', v_link,
    'trigger', v_candidate.trigger_kind
  );
end;
$$;


ALTER FUNCTION "public"."generate_growth_conversion_notification_for_user"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_growth_conversion_notifications_batch"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_user_id uuid;
  v_result jsonb;
  v_created_count integer := 0;
begin
  for v_user_id in
    select distinct us.user_id
    from public.user_subscriptions us
    join public.plans p
      on p.id = us.plan_id
    where us.status = 'active'
      and us.current_period_end > now()
      and (
        lower(coalesce(p.name, '')) in ('start', 'básico', 'basico')
        or (
          coalesce(p.category_highlights_count, 0) = 0
          and coalesce(p.home_highlight_count, 0) = 0
        )
      )
  loop
    v_result := public.generate_growth_conversion_notification_for_user(v_user_id);

    if coalesce((v_result ->> 'created')::boolean, false) then
      v_created_count := v_created_count + 1;
    end if;
  end loop;

  return v_created_count;
end;
$$;


ALTER FUNCTION "public"."generate_growth_conversion_notifications_batch"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_invite_campaign_code"("p_captor_name" "text" DEFAULT NULL::"text") RETURNS "text"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
declare
  v_base text;
  v_code text;
begin
  v_base := upper(regexp_replace(coalesce(p_captor_name, ''), '[^A-Za-z0-9]+', '', 'g'));
  v_base := nullif(v_base, '');

  if v_base is null then
    v_base := 'CAPTACAO';
  end if;

  v_base := left(v_base, 10);

  loop
    v_code := v_base || '-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
    exit when not exists (
      select 1
      from public.invite_campaigns ic
      where ic.code = v_code
    );
  end loop;

  return v_code;
end;
$$;


ALTER FUNCTION "public"."generate_invite_campaign_code"("p_captor_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_renewal_notification_for_user"("p_user_id" "uuid" DEFAULT "auth"."uid"()) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_settings public.renewal_notification_settings%rowtype;
  v_subscription record;
  v_notifications_today integer := 0;
  v_template jsonb;
  v_title text;
  v_content_main text;
  v_content_support text;
  v_content text;
  v_subject text;
  v_cta text;
  v_link text;
  v_notification_id uuid;
  v_stage text;
  v_days_until_expiration integer;
  v_plan_name text;
  v_user_name text := 'Usuario';
  v_values jsonb;
begin
  if p_user_id is null then
    return jsonb_build_object(
      'success', false,
      'error', 'Usuario nao autenticado'
    );
  end if;

  select *
  into v_settings
  from public.renewal_notification_settings
  limit 1;

  if not found then
    insert into public.renewal_notification_settings default values
    returning * into v_settings;
  end if;

  if not coalesce(v_settings.is_enabled, true) then
    return jsonb_build_object(
      'success', true,
      'created', false,
      'reason', 'disabled'
    );
  end if;

  select coalesce(name, 'Usuario')
  into v_user_name
  from public.users
  where id = p_user_id;

  select count(*)
  into v_notifications_today
  from public.notifications n
  where n.user_id = p_user_id
    and n.type = 'plan_alert'
    and coalesce(n.link, '') like '%source=renewal%'
    and n.created_at >= date_trunc('day', now());

  if v_notifications_today >= greatest(coalesce(v_settings.daily_user_limit, 1), 0) then
    return jsonb_build_object(
      'success', true,
      'created', false,
      'reason', 'daily_limit_reached'
    );
  end if;

  select
    us.id,
    us.current_period_end,
    us.status,
    p.name as plan_name
  into v_subscription
  from public.user_subscriptions us
  join public.plans p
    on p.id = us.plan_id
  where us.user_id = p_user_id
    and lower(coalesce(p.name, '')) not in ('start', 'básico', 'basico')
  order by
    case when us.status = 'active' then 0 else 1 end,
    us.current_period_end desc nulls last
  limit 1;

  if not found then
    return jsonb_build_object(
      'success', true,
      'created', false,
      'reason', 'no_paid_plan_found'
    );
  end if;

  v_plan_name := coalesce(v_subscription.plan_name, 'seu plano');

  if v_subscription.current_period_end is null then
    return jsonb_build_object(
      'success', true,
      'created', false,
      'reason', 'missing_current_period_end'
    );
  end if;

  v_days_until_expiration := floor(extract(epoch from (v_subscription.current_period_end - now())) / 86400.0)::integer;

  if v_subscription.current_period_end > now() then
    if coalesce(v_settings.notify_seven_days_before, true) and v_days_until_expiration = 7 then
      v_stage := 'seven_days';
    elsif coalesce(v_settings.notify_three_days_before, true) and v_days_until_expiration = 3 then
      v_stage := 'three_days';
    elsif coalesce(v_settings.notify_one_day_before, true) and v_days_until_expiration = 1 then
      v_stage := 'one_day';
    elsif coalesce(v_settings.notify_on_expiration_day, true) and v_days_until_expiration = 0 then
      v_stage := 'expiration_day';
    end if;
  elsif coalesce(v_settings.notify_after_expiration, true) then
    if floor(extract(epoch from (now() - v_subscription.current_period_end)) / 86400.0)::integer >= coalesce(v_settings.days_after_expiration, 1) then
      v_stage := 'expired';
    end if;
  end if;

  if v_stage is null then
    return jsonb_build_object(
      'success', true,
      'created', false,
      'reason', 'no_stage_matched'
    );
  end if;

  v_template := coalesce(v_settings.templates -> v_stage, '{}'::jsonb);

  v_values := jsonb_build_object(
    'nome_usuario', coalesce(v_user_name, 'Usuario'),
    'nome_plano', coalesce(v_plan_name, 'Seu plano'),
    'data_vencimento', coalesce(to_char(v_subscription.current_period_end at time zone 'America/Sao_Paulo', 'DD/MM/YYYY'), ''),
    'dias_restantes', greatest(v_days_until_expiration, 0)::text,
    'link_upgrade', '/minha-conta/meu-plano?source=renewal',
    'titulo_anuncio', '',
    'visualizacoes', '0',
    'categoria_rank', '0',
    'tipo_recurso', 'recursos premium'
  );

  v_subject := public.replace_template_placeholders(coalesce(v_template ->> 'subject', ''), v_values);
  v_title := public.replace_template_placeholders(coalesce(v_template ->> 'title', ''), v_values);
  v_content_main := public.replace_template_placeholders(coalesce(v_template ->> 'message', ''), v_values);
  v_content_support := public.replace_template_placeholders(coalesce(v_template ->> 'supportText', ''), v_values);
  v_cta := public.replace_template_placeholders(coalesce(v_template ->> 'cta', ''), v_values);
  v_link := public.append_query_param(
    public.replace_template_placeholders(coalesce(v_template ->> 'link', '/minha-conta/meu-plano'), v_values),
    'source',
    'renewal'
  );
  v_content := trim(
    both
    from concat(
      coalesce(v_content_main, ''),
      case
        when nullif(trim(coalesce(v_content_support, '')), '') is not null
          then E'\n\n' || v_content_support
        else ''
      end
    )
  );

  insert into public.notifications (
    user_id,
    type,
    title,
    content,
    link
  )
  values (
    p_user_id,
    'plan_alert',
    v_title,
    v_content,
    v_link
  )
  returning id into v_notification_id;

  return jsonb_build_object(
    'success', true,
    'created', true,
    'notification_id', v_notification_id,
    'title', v_title,
    'content', v_content,
    'subject', v_subject,
    'supportText', v_content_support,
    'cta', v_cta,
    'link', v_link,
    'stage', v_stage,
    'planName', v_plan_name,
    'showToast', coalesce(v_settings.show_dashboard_toast, true)
  );
end;
$$;


ALTER FUNCTION "public"."generate_renewal_notification_for_user"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_renewal_notifications_batch"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_user_id uuid;
  v_result jsonb;
  v_created_count integer := 0;
begin
  for v_user_id in
    select distinct us.user_id
    from public.user_subscriptions us
    join public.plans p
      on p.id = us.plan_id
    where lower(coalesce(p.name, '')) not in ('start', 'básico', 'basico')
  loop
    v_result := public.generate_renewal_notification_for_user(v_user_id);

    if coalesce((v_result ->> 'created')::boolean, false) then
      v_created_count := v_created_count + 1;
    end if;
  end loop;

  return v_created_count;
end;
$$;


ALTER FUNCTION "public"."generate_renewal_notifications_batch"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_active_subscription"("p_user_id" "uuid") RETURNS TABLE("id" "uuid", "plan_id" "uuid", "plan_name" character varying, "billing_cycle" character varying, "status" character varying, "starts_at" timestamp with time zone, "expires_at" timestamp with time zone, "amount_paid" numeric)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  RETURN QUERY
  SELECT 
    s.id,
    s.plan_id,
    p.name AS plan_name,
    s.billing_cycle,
    s.status,
    s.starts_at,
    s.expires_at,
    s.amount_paid
  FROM user_subscriptions s
  JOIN plans p ON s.plan_id = p.id
  WHERE s.user_id = p_user_id
    AND s.status = 'active'
    AND s.expires_at > NOW()
  ORDER BY s.expires_at DESC
  LIMIT 1;
END;
$$;


ALTER FUNCTION "public"."get_active_subscription"("p_user_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_active_subscription"("p_user_id" "uuid") IS 'Retorna assinatura ativa do usuário';



CREATE OR REPLACE FUNCTION "public"."get_admin_login_rate_limit_status"("p_email" "text") RETURNS TABLE("attempts_used" integer, "remaining_attempts" integer, "is_blocked" boolean, "blocked_until" timestamp with time zone, "time_until_unblock_seconds" integer, "should_show_captcha" boolean, "server_now" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_server_now timestamptz := now();
  v_last_success_at timestamptz;
  v_attempts_used integer := 0;
  v_last_failure_at timestamptz;
  v_blocked_until timestamptz;
begin
  if v_email = '' then
    return query
    select
      0,
      5,
      false,
      null::timestamptz,
      0,
      false,
      v_server_now;
    return;
  end if;

  select max(se.created_at)
    into v_last_success_at
  from public.security_events se
  where lower(trim(coalesce(se.email, ''))) = v_email
    and se.attempted_route = '/admin/login'
    and se.attempted_action = 'admin_login_success';

  select
    count(*)::integer,
    max(se.created_at)
  into
    v_attempts_used,
    v_last_failure_at
  from public.security_events se
  where lower(trim(coalesce(se.email, ''))) = v_email
    and se.attempted_route = '/admin/login'
    and se.attempted_action = 'admin_login_failed'
    and se.created_at >= greatest(
      coalesce(v_last_success_at, '-infinity'::timestamptz),
      v_server_now - interval '15 minutes'
    );

  if v_attempts_used >= 5 and v_last_failure_at is not null then
    v_blocked_until := v_last_failure_at + interval '30 minutes';
  end if;

  return query
  select
    v_attempts_used,
    greatest(0, 5 - v_attempts_used),
    coalesce(v_blocked_until > v_server_now, false),
    case when v_blocked_until > v_server_now then v_blocked_until else null end,
    case
      when v_blocked_until > v_server_now
        then greatest(0, floor(extract(epoch from (v_blocked_until - v_server_now)))::integer)
      else 0
    end,
    v_attempts_used >= 2,
    v_server_now;
end;
$$;


ALTER FUNCTION "public"."get_admin_login_rate_limit_status"("p_email" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_admin_security_overview"("p_days" integer DEFAULT 1) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_days integer := greatest(1, least(coalesce(p_days, 1), 90));
  v_since timestamptz := now() - make_interval(days => v_days);
  v_step interval := case when v_days <= 2 then interval '1 hour' else interval '1 day' end;
  v_series_start timestamptz := case
    when v_days <= 2 then date_trunc('hour', now() - interval '23 hours')
    else date_trunc('day', now() - make_interval(days => v_days - 1))
  end;
  v_series_end timestamptz := case
    when v_days <= 2 then date_trunc('hour', now())
    else date_trunc('day', now())
  end;
begin
  if not public.is_admin() then
    raise exception 'Acesso negado.';
  end if;

  return jsonb_build_object(
    'windowDays', v_days,
    'generatedAt', now(),
    'summary',
      (
        select jsonb_build_object(
          'totalEvents', count(*),
          'blockedEvents', count(*) filter (where se.severity = 'blocked'),
          'criticalEvents', count(*) filter (where se.severity = 'critical'),
          'warningEvents', count(*) filter (where se.severity = 'warning'),
          'adminLoginFailures', count(*) filter (
            where se.attempted_action in ('admin_login_invalid_credentials', 'admin_login_failed')
          ),
          'captchaFailures', count(*) filter (
            where se.attempted_action = 'admin_login_captcha_failed'
          ),
          'mfaFailures', count(*) filter (
            where se.attempted_action in (
              'admin_mfa_verify_failed',
              'admin_mfa_challenge_failed',
              'admin_mfa_enrollment_failed',
              'admin_mfa_ticket_validate_failed',
              'admin_mfa_ticket_consume_failed'
            )
          ),
          'rateLimitedEvents', count(*) filter (
            where se.attempted_action like '%rate_limited'
              or se.attempted_action = 'admin_login_blocked'
          ),
          'unauthorizedAccessEvents', count(*) filter (
            where se.attempted_action like '%forbidden'
              or se.attempted_action = 'unauthorized_access'
              or se.attempted_action = 'admin_login_non_admin_or_suspended'
          ),
          'suspiciousIps', count(distinct se.ip_address),
          'targetedEmails', count(distinct lower(trim(coalesce(se.email, '')))) filter (
            where trim(coalesce(se.email, '')) <> ''
          ),
          'uniqueRoutes', count(distinct se.attempted_route),
          'lastEventAt', max(se.created_at)
        )
        from public.security_events se
        where se.created_at >= v_since
      ),
    'topIps',
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'ip', t.ip_address,
              'events', t.event_count,
              'blocked', t.blocked_count,
              'lastSeenAt', t.last_seen_at
            )
            order by t.event_count desc, t.last_seen_at desc
          )
          from (
            select
              coalesce(se.ip_address::text, 'desconhecido') as ip_address,
              count(*)::integer as event_count,
              count(*) filter (where se.severity = 'blocked')::integer as blocked_count,
              max(se.created_at) as last_seen_at
            from public.security_events se
            where se.created_at >= v_since
            group by coalesce(se.ip_address::text, 'desconhecido')
            order by event_count desc, last_seen_at desc
            limit 5
          ) t
        ),
        '[]'::jsonb
      ),
    'topRoutes',
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'route', t.attempted_route,
              'events', t.event_count,
              'blocked', t.blocked_count
            )
            order by t.event_count desc
          )
          from (
            select
              se.attempted_route,
              count(*)::integer as event_count,
              count(*) filter (where se.severity = 'blocked')::integer as blocked_count
            from public.security_events se
            where se.created_at >= v_since
            group by se.attempted_route
            order by event_count desc
            limit 5
          ) t
        ),
        '[]'::jsonb
      ),
    'topActions',
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'action', t.attempted_action,
              'events', t.event_count,
              'criticalOrBlocked', t.high_severity_count
            )
            order by t.event_count desc
          )
          from (
            select
              coalesce(se.attempted_action, 'sem_acao') as attempted_action,
              count(*)::integer as event_count,
              count(*) filter (where se.severity in ('critical', 'blocked'))::integer as high_severity_count
            from public.security_events se
            where se.created_at >= v_since
            group by coalesce(se.attempted_action, 'sem_acao')
            order by event_count desc
            limit 8
          ) t
        ),
        '[]'::jsonb
      ),
    'topTargetedEmails',
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'email', t.email,
              'events', t.event_count,
              'blocked', t.blocked_count
            )
            order by t.event_count desc
          )
          from (
            select
              lower(trim(se.email)) as email,
              count(*)::integer as event_count,
              count(*) filter (where se.severity = 'blocked')::integer as blocked_count
            from public.security_events se
            where se.created_at >= v_since
              and trim(coalesce(se.email, '')) <> ''
            group by lower(trim(se.email))
            order by event_count desc
            limit 5
          ) t
        ),
        '[]'::jsonb
      ),
    'trend',
      coalesce(
        (
          with series as (
            select generate_series(v_series_start, v_series_end, v_step) as bucket_start
          ),
          bucketed as (
            select
              s.bucket_start,
              count(se.id)::integer as total_events,
              count(*) filter (where se.severity = 'blocked')::integer as blocked_events,
              count(*) filter (where se.severity = 'critical')::integer as critical_events
            from series s
            left join public.security_events se
              on se.created_at >= s.bucket_start
             and se.created_at < s.bucket_start + v_step
             and se.created_at >= v_since
            group by s.bucket_start
            order by s.bucket_start
          )
          select jsonb_agg(
            jsonb_build_object(
              'bucket', case
                when v_days <= 2 then to_char(bucket_start at time zone 'America/Sao_Paulo', 'DD/MM HH24:00')
                else to_char(bucket_start at time zone 'America/Sao_Paulo', 'DD/MM')
              end,
              'events', total_events,
              'blocked', blocked_events,
              'critical', critical_events
            )
            order by bucket_start
          )
          from bucketed
        ),
        '[]'::jsonb
      )
  );
end;
$$;


ALTER FUNCTION "public"."get_admin_security_overview"("p_days" integer) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_admin_security_overview"("p_days" integer) IS 'Retorna um resumo agregado do Centro de Seguranca administrativo para a janela solicitada.';



CREATE OR REPLACE FUNCTION "public"."get_announcement_report_snapshot"("p_announcement_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."get_announcement_report_snapshot"("p_announcement_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_announcement_similarity_cooldown"("p_user_id" "uuid", "p_title" "text", "p_category_id" "uuid", "p_city" "text", "p_state" "text", "p_price" numeric, "p_ignore_announcement_id" "uuid" DEFAULT NULL::"uuid") RETURNS TABLE("matched_announcement_id" "uuid", "matched_title" "text", "source_status" "text", "cooldown_until" timestamp with time zone)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select
    c.announcement_id,
    a.title,
    c.source_status,
    c.cooldown_until
  from public.announcement_similarity_cooldowns c
  left join public.announcements a on a.id = c.announcement_id
  where c.user_id = p_user_id
    and c.cooldown_until > now()
    and (p_ignore_announcement_id is null or c.announcement_id is distinct from p_ignore_announcement_id)
    and c.title_normalized = public.normalize_announcement_similarity_text(p_title)
    and c.category_id is not distinct from p_category_id
    and c.city = lower(coalesce(p_city, ''))
    and c.state = upper(coalesce(p_state, ''))
    and c.price is not distinct from round(coalesce(p_price, 0)::numeric, 2)
  order by c.cooldown_until desc
  limit 1;
$$;


ALTER FUNCTION "public"."get_announcement_similarity_cooldown"("p_user_id" "uuid", "p_title" "text", "p_category_id" "uuid", "p_city" "text", "p_state" "text", "p_price" numeric, "p_ignore_announcement_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_announcement_similarity_review_signal"("p_user_id" "uuid", "p_title" "text", "p_category_id" "uuid", "p_city" "text", "p_state" "text", "p_price" numeric, "p_ignore_announcement_id" "uuid" DEFAULT NULL::"uuid") RETURNS TABLE("suspicious" boolean, "similarity_score" integer, "matched_announcement_id" "uuid", "matched_title" "text", "review_reason" "text")
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  with candidates as (
    select
      a.id,
      a.title,
      (
        case
          when public.normalize_announcement_similarity_text(a.title) = public.normalize_announcement_similarity_text(p_title)
            then 5
          when public.normalize_announcement_similarity_text(a.title) like '%' || public.normalize_announcement_similarity_text(p_title) || '%'
            and char_length(public.normalize_announcement_similarity_text(p_title)) >= 10
            then 4
          when public.normalize_announcement_similarity_text(p_title) like '%' || public.normalize_announcement_similarity_text(a.title) || '%'
            and char_length(public.normalize_announcement_similarity_text(a.title)) >= 10
            then 4
          else 0
        end
        + case
          when public.count_shared_announcement_title_tokens(a.title, p_title) >= 2 then 3
          when public.count_shared_announcement_title_tokens(a.title, p_title) = 1 then 1
          else 0
        end
        + case when a.category_id is not distinct from p_category_id then 2 else 0 end
        + case when lower(coalesce(a.city, '')) = lower(coalesce(p_city, '')) then 1 else 0 end
        + case when upper(coalesce(a.state, '')) = upper(coalesce(p_state, '')) then 1 else 0 end
        + case when public.is_announcement_price_close(a.price, p_price) then 1 else 0 end
      )::integer as score
    from public.announcements a
    where a.user_id = p_user_id
      and (p_ignore_announcement_id is null or a.id <> p_ignore_announcement_id)
      and a.status in ('ACTIVE', 'active', 'PAUSED', 'paused', 'EXPIRED', 'expired', 'PENDING', 'pending')
      and a.created_at >= now() - interval '90 days'
  ),
  best_match as (
    select *
    from candidates
    where score >= 5
    order by score desc, id desc
    limit 1
  )
  select
    true as suspicious,
    score as similarity_score,
    id as matched_announcement_id,
    title as matched_title,
    format(
      'Este anuncio esta muito parecido com "%s" e foi enviado automaticamente para analise antes da publicacao.',
      coalesce(title, 'outro anuncio da sua conta')
    ) as review_reason
  from best_match
  union all
  select
    false as suspicious,
    0 as similarity_score,
    null::uuid as matched_announcement_id,
    null::text as matched_title,
    null::text as review_reason
  where not exists (select 1 from best_match);
$$;


ALTER FUNCTION "public"."get_announcement_similarity_review_signal"("p_user_id" "uuid", "p_title" "text", "p_category_id" "uuid", "p_city" "text", "p_state" "text", "p_price" numeric, "p_ignore_announcement_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_category_showcase_impression_stats"("p_announcement_ids" "uuid"[]) RETURNS TABLE("announcement_id" "uuid", "impressions_last_7_days" bigint, "last_seen_at" timestamp with time zone)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select
    requested.announcement_id,
    coalesce(stats.impressions_last_7_days, 0) as impressions_last_7_days,
    stats.last_seen_at
  from unnest(coalesce(p_announcement_ids, array[]::uuid[])) as requested(announcement_id)
  left join (
    select
      csi.announcement_id,
      count(*) filter (where csi.viewed_at >= (now() - interval '7 days')) as impressions_last_7_days,
      max(csi.viewed_at) as last_seen_at
    from public.category_showcase_impressions csi
    where csi.announcement_id = any(coalesce(p_announcement_ids, array[]::uuid[]))
    group by csi.announcement_id
  ) stats on stats.announcement_id = requested.announcement_id;
$$;


ALTER FUNCTION "public"."get_category_showcase_impression_stats"("p_announcement_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_checkout_gateway_public_safe"() RETURNS TABLE("preferred_checkout_provider" "text", "asaas_enabled" boolean, "checkout_reason" "text", "is_production" boolean)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select
    'asaas'::text,
    coalesce(nullif(trim(ps.asaas_api_key), '') is not null, false),
    case
      when not coalesce(nullif(trim(ps.asaas_api_key), '') is not null, false) then 'asaas_not_configured'
      else 'ok'
    end,
    ps.is_production
  from public.payment_settings ps
  where ps.id = '00000000-0000-0000-0000-000000000005';
$$;


ALTER FUNCTION "public"."get_checkout_gateway_public_safe"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_current_user_role"() RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT COALESCE(
    (
      SELECT role::text
      FROM users 
      WHERE id = auth.uid() 
      LIMIT 1
    ),
    'user'
  );
$$;


ALTER FUNCTION "public"."get_current_user_role"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_current_user_role"() IS 'Retorna role do usuário logado (user/editor/admin)';



CREATE OR REPLACE FUNCTION "public"."get_dashboard_stats"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_user_id UUID;
  v_total_ads INT;
  v_total_views BIGINT;
  v_total_leads INT;
  v_clicks_by_state JSONB;
  v_price_analysis JSONB;
  v_latest_ad_id UUID;
  v_user_price DECIMAL;
  v_market_avg DECIMAL;
  v_price_position TEXT;
  v_percentage DECIMAL;
BEGIN
  -- 1. Identificar usuário autenticado
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado';
  END IF;

  -- 2. Total de anúncios ativos (case-insensitive)
  SELECT COUNT(*)
  INTO v_total_ads
  FROM announcements
  WHERE user_id = v_user_id 
    AND UPPER(status) = 'ACTIVE';

  -- 3. Total de visualizações (soma do campo views)
  SELECT COALESCE(SUM(views), 0)
  INTO v_total_views
  FROM announcements
  WHERE user_id = v_user_id;

  -- 4. Total de Leads gerados
  SELECT COUNT(*)
  INTO v_total_leads
  FROM leads
  WHERE seller_id = v_user_id;

  -- 5. Top 5 estados com mais cliques
  -- Somando cliques de todos os anúncios do usuário, agrupando por estado
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'state', state,
        'clicks', total_clicks
      )
      ORDER BY total_clicks DESC
    ),
    '[]'::jsonb
  )
  INTO v_clicks_by_state
  FROM (
    SELECT 
      acs.state,
      SUM(acs.count) as total_clicks
    FROM announcement_clicks_by_state acs
    INNER JOIN announcements a ON a.id = acs.announcement_id
    WHERE a.user_id = v_user_id
    GROUP BY acs.state
    ORDER BY total_clicks DESC
    LIMIT 5
  ) top_states;

  -- 6. Análise de Preço (anúncio mais recente COM métricas)
  -- Buscar o anúncio mais recente do usuário que possua métricas de mercado
  SELECT 
    a.id, 
    a.price,
    am.market_avg_price,
    am.price_position
  INTO v_latest_ad_id, v_user_price, v_market_avg, v_price_position
  FROM announcements a
  INNER JOIN announcement_metrics am ON am.announcement_id = a.id
  WHERE a.user_id = v_user_id 
    AND a.price IS NOT NULL 
    AND a.price > 0
    AND am.market_avg_price IS NOT NULL
    AND am.market_avg_price > 0
  ORDER BY a.created_at DESC
  LIMIT 1;

  -- Se encontrou anúncio com métricas, calcular análise
  IF v_latest_ad_id IS NOT NULL THEN
    -- Calcular percentual de posicionamento
    v_percentage := (v_user_price / v_market_avg) * 100;

    -- Montar objeto de análise de preço
    v_price_analysis := jsonb_build_object(
      'announcement_id', v_latest_ad_id,
      'user_price', v_user_price,
      'market_avg_price', v_market_avg,
      'price_position', v_price_position,
      'percentage', ROUND(v_percentage, 1),
      'has_market_data', true
    );
  ELSE
    -- Nenhum anúncio com métricas encontrado
    -- Buscar anúncio mais recente apenas com preço (para exibir mensagem de aguardo)
    SELECT id, price
    INTO v_latest_ad_id, v_user_price
    FROM announcements
    WHERE user_id = v_user_id 
      AND price IS NOT NULL 
      AND price > 0
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_latest_ad_id IS NOT NULL THEN
      -- Tem anúncio com preço mas sem métricas
      v_price_analysis := jsonb_build_object(
        'announcement_id', v_latest_ad_id,
        'user_price', v_user_price,
        'market_avg_price', NULL,
        'price_position', NULL,
        'percentage', NULL,
        'has_market_data', false
      );
    ELSE
      -- Nenhum anúncio com preço
      v_price_analysis := NULL;
    END IF;
  END IF;

  -- 7. Montar e retornar objeto final
  RETURN jsonb_build_object(
    'total_ads', v_total_ads,
    'total_views', v_total_views,
    'total_leads', v_total_leads,
    'clicks_by_state', COALESCE(v_clicks_by_state, '[]'::jsonb),
    'price_analysis', v_price_analysis,
    'home_highlights', (
      SELECT COUNT(*)
      FROM announcements
      WHERE user_id = v_user_id
        AND highlight_home = true
        AND UPPER(status) = 'ACTIVE'
    )
  );

EXCEPTION
  WHEN OTHERS THEN
    -- Em caso de erro, retornar estrutura vazia
    RETURN jsonb_build_object(
      'total_ads', 0,
      'total_views', 0,
      'total_leads', 0,
      'clicks_by_state', '[]'::jsonb,
      'price_analysis', NULL,
      'error', SQLERRM
    );
END;
$$;


ALTER FUNCTION "public"."get_dashboard_stats"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_dashboard_stats"() IS 'Retorna estatísticas agregadas do dashboard incluindo: total de anúncios ativos, visualizações, leads, cliques por estado e análise de preço comparativa';



CREATE OR REPLACE FUNCTION "public"."get_dashboard_stats"("p_announcement_id" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_user_id UUID;
  v_total_ads INT;
  v_total_views BIGINT;
  v_total_leads INT;
  v_total_favorites INT;
  v_conversion_rate NUMERIC;
  v_clicks_by_state JSONB;
  v_price_analysis JSONB;
  v_top_ads_by_views JSONB;
  v_top_ads_by_leads JSONB;
  v_attention_ads JSONB;
  v_latest_ad_id UUID;
  v_user_price DECIMAL;
  v_market_avg DECIMAL;
  v_price_position TEXT;
  v_percentage DECIMAL;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuario nao autenticado';
  END IF;

  SELECT COUNT(*)
  INTO v_total_ads
  FROM announcements
  WHERE user_id = v_user_id
    AND UPPER(status) = 'ACTIVE';

  IF p_announcement_id IS NOT NULL THEN
    SELECT COALESCE(views, 0)
    INTO v_total_views
    FROM announcements
    WHERE id = p_announcement_id
      AND user_id = v_user_id;
  ELSE
    SELECT COALESCE(SUM(views), 0)
    INTO v_total_views
    FROM announcements
    WHERE user_id = v_user_id;
  END IF;

  SELECT COUNT(*)
  INTO v_total_leads
  FROM leads
  WHERE seller_id = v_user_id;

  SELECT COUNT(*)
  INTO v_total_favorites
  FROM favorites f
  INNER JOIN announcements a ON a.id = f.announcement_id
  WHERE a.user_id = v_user_id;

  v_conversion_rate := CASE
    WHEN COALESCE(v_total_views, 0) > 0
      THEN ROUND((v_total_leads::NUMERIC / v_total_views::NUMERIC) * 100, 1)
    ELSE 0
  END;

  IF p_announcement_id IS NOT NULL THEN
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'state', state,
          'clicks', total_clicks
        )
        ORDER BY total_clicks DESC
      ),
      '[]'::jsonb
    )
    INTO v_clicks_by_state
    FROM (
      SELECT
        acs.state,
        SUM(acs.count) AS total_clicks
      FROM announcement_clicks_by_state acs
      WHERE acs.announcement_id = p_announcement_id
      GROUP BY acs.state
      ORDER BY total_clicks DESC
      LIMIT 5
    ) top_states;
  ELSE
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'state', state,
          'clicks', total_clicks
        )
        ORDER BY total_clicks DESC
      ),
      '[]'::jsonb
    )
    INTO v_clicks_by_state
    FROM (
      SELECT
        acs.state,
        SUM(acs.count) AS total_clicks
      FROM announcement_clicks_by_state acs
      INNER JOIN announcements a ON a.id = acs.announcement_id
      WHERE a.user_id = v_user_id
      GROUP BY acs.state
      ORDER BY total_clicks DESC
      LIMIT 5
    ) top_states;
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'announcement_id', ranked.announcement_id,
        'title', ranked.title,
        'status', ranked.status,
        'views', ranked.views,
        'leads', ranked.leads,
        'favorites_count', ranked.favorites_count,
        'conversion_rate', ranked.conversion_rate
      )
      ORDER BY ranked.views DESC, ranked.leads DESC, ranked.favorites_count DESC, ranked.created_at DESC
    ),
    '[]'::jsonb
  )
  INTO v_top_ads_by_views
  FROM (
    SELECT
      a.id AS announcement_id,
      a.title,
      a.status,
      a.created_at,
      COALESCE(a.views, 0) AS views,
      COALESCE(l.leads_count, 0) AS leads,
      COALESCE(f.favorites_count, 0) AS favorites_count,
      CASE
        WHEN COALESCE(a.views, 0) > 0
          THEN ROUND((COALESCE(l.leads_count, 0)::NUMERIC / COALESCE(a.views, 0)::NUMERIC) * 100, 1)
        ELSE 0
      END AS conversion_rate
    FROM announcements a
    LEFT JOIN (
      SELECT announcement_id, COUNT(*) AS leads_count
      FROM leads
      GROUP BY announcement_id
    ) l ON l.announcement_id = a.id
    LEFT JOIN (
      SELECT announcement_id, COUNT(*) AS favorites_count
      FROM favorites
      GROUP BY announcement_id
    ) f ON f.announcement_id = a.id
    WHERE a.user_id = v_user_id
    ORDER BY COALESCE(a.views, 0) DESC, COALESCE(l.leads_count, 0) DESC, a.created_at DESC
    LIMIT 5
  ) ranked;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'announcement_id', ranked.announcement_id,
        'title', ranked.title,
        'status', ranked.status,
        'views', ranked.views,
        'leads', ranked.leads,
        'favorites_count', ranked.favorites_count,
        'conversion_rate', ranked.conversion_rate
      )
      ORDER BY ranked.leads DESC, ranked.views DESC, ranked.favorites_count DESC, ranked.created_at DESC
    ),
    '[]'::jsonb
  )
  INTO v_top_ads_by_leads
  FROM (
    SELECT
      a.id AS announcement_id,
      a.title,
      a.status,
      a.created_at,
      COALESCE(a.views, 0) AS views,
      COALESCE(l.leads_count, 0) AS leads,
      COALESCE(f.favorites_count, 0) AS favorites_count,
      CASE
        WHEN COALESCE(a.views, 0) > 0
          THEN ROUND((COALESCE(l.leads_count, 0)::NUMERIC / COALESCE(a.views, 0)::NUMERIC) * 100, 1)
        ELSE 0
      END AS conversion_rate
    FROM announcements a
    LEFT JOIN (
      SELECT announcement_id, COUNT(*) AS leads_count
      FROM leads
      GROUP BY announcement_id
    ) l ON l.announcement_id = a.id
    LEFT JOIN (
      SELECT announcement_id, COUNT(*) AS favorites_count
      FROM favorites
      GROUP BY announcement_id
    ) f ON f.announcement_id = a.id
    WHERE a.user_id = v_user_id
    ORDER BY COALESCE(l.leads_count, 0) DESC, COALESCE(a.views, 0) DESC, a.created_at DESC
    LIMIT 5
  ) ranked;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'announcement_id', attention.announcement_id,
        'title', attention.title,
        'status', attention.status,
        'views', attention.views,
        'leads', attention.leads,
        'favorites_count', attention.favorites_count,
        'reason', attention.reason
      )
      ORDER BY attention.priority DESC, attention.views DESC, attention.favorites_count DESC, attention.created_at DESC
    ),
    '[]'::jsonb
  )
  INTO v_attention_ads
  FROM (
    SELECT *
    FROM (
      SELECT
        a.id AS announcement_id,
        a.title,
        a.status,
        a.created_at,
        COALESCE(a.views, 0) AS views,
        COALESCE(l.leads_count, 0) AS leads,
        COALESCE(f.favorites_count, 0) AS favorites_count,
        CASE
          WHEN COALESCE(a.views, 0) >= 20 AND COALESCE(l.leads_count, 0) = 0
            THEN 'Muitas visualizacoes e nenhum lead. Vale revisar preco, imagens ou descricao.'
          WHEN UPPER(a.status) = 'ACTIVE' AND COALESCE(a.views, 0) = 0
            THEN 'Anuncio ativo sem visualizacoes. Considere melhorar titulo, categoria ou exposicao.'
          WHEN COALESCE(f.favorites_count, 0) >= 3 AND COALESCE(l.leads_count, 0) = 0
            THEN 'Recebeu favoritos, mas ainda nao gerou contato. Pode haver resistencia de preco ou confianca.'
          ELSE NULL
        END AS reason,
        CASE
          WHEN COALESCE(a.views, 0) >= 20 AND COALESCE(l.leads_count, 0) = 0 THEN 3
          WHEN COALESCE(f.favorites_count, 0) >= 3 AND COALESCE(l.leads_count, 0) = 0 THEN 2
          WHEN UPPER(a.status) = 'ACTIVE' AND COALESCE(a.views, 0) = 0 THEN 1
          ELSE 0
        END AS priority
      FROM announcements a
      LEFT JOIN (
        SELECT announcement_id, COUNT(*) AS leads_count
        FROM leads
        GROUP BY announcement_id
      ) l ON l.announcement_id = a.id
      LEFT JOIN (
        SELECT announcement_id, COUNT(*) AS favorites_count
        FROM favorites
        GROUP BY announcement_id
      ) f ON f.announcement_id = a.id
      WHERE a.user_id = v_user_id
    ) base_attention
    WHERE base_attention.reason IS NOT NULL
    LIMIT 5
  ) attention;

  IF p_announcement_id IS NOT NULL THEN
    SELECT
      a.id,
      a.price,
      am.market_avg_price,
      am.price_position
    INTO v_latest_ad_id, v_user_price, v_market_avg, v_price_position
    FROM announcements a
    LEFT JOIN announcement_metrics am ON am.announcement_id = a.id
    WHERE a.id = p_announcement_id
      AND a.user_id = v_user_id;
  ELSE
    SELECT
      a.id,
      a.price,
      am.market_avg_price,
      am.price_position
    INTO v_latest_ad_id, v_user_price, v_market_avg, v_price_position
    FROM announcements a
    INNER JOIN announcement_metrics am ON am.announcement_id = a.id
    WHERE a.user_id = v_user_id
      AND a.price IS NOT NULL
      AND a.price > 0
      AND am.market_avg_price IS NOT NULL
      AND am.market_avg_price > 0
    ORDER BY a.created_at DESC
    LIMIT 1;
  END IF;

  IF v_latest_ad_id IS NOT NULL THEN
    v_percentage := (v_user_price / v_market_avg) * 100;

    v_price_analysis := jsonb_build_object(
      'announcement_id', v_latest_ad_id,
      'user_price', v_user_price,
      'market_avg_price', v_market_avg,
      'price_position', v_price_position,
      'percentage', ROUND(v_percentage, 1),
      'has_market_data', true
    );
  ELSE
    SELECT id, price
    INTO v_latest_ad_id, v_user_price
    FROM announcements
    WHERE user_id = v_user_id
      AND price IS NOT NULL
      AND price > 0
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_latest_ad_id IS NOT NULL THEN
      v_price_analysis := jsonb_build_object(
        'announcement_id', v_latest_ad_id,
        'user_price', v_user_price,
        'market_avg_price', NULL,
        'price_position', NULL,
        'percentage', NULL,
        'has_market_data', false
      );
    ELSE
      v_price_analysis := NULL;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'total_ads', v_total_ads,
    'total_views', v_total_views,
    'total_leads', v_total_leads,
    'total_favorites', COALESCE(v_total_favorites, 0),
    'conversion_rate', COALESCE(v_conversion_rate, 0),
    'clicks_by_state', COALESCE(v_clicks_by_state, '[]'::jsonb),
    'price_analysis', v_price_analysis,
    'top_ads_by_views', COALESCE(v_top_ads_by_views, '[]'::jsonb),
    'top_ads_by_leads', COALESCE(v_top_ads_by_leads, '[]'::jsonb),
    'attention_ads', COALESCE(v_attention_ads, '[]'::jsonb),
    'home_highlights', (
      SELECT COUNT(*)
      FROM announcements
      WHERE user_id = v_user_id
        AND highlight_home = true
        AND UPPER(status) = 'ACTIVE'
    )
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'total_ads', 0,
      'total_views', 0,
      'total_leads', 0,
      'total_favorites', 0,
      'conversion_rate', 0,
      'clicks_by_state', '[]'::jsonb,
      'price_analysis', NULL,
      'top_ads_by_views', '[]'::jsonb,
      'top_ads_by_leads', '[]'::jsonb,
      'attention_ads', '[]'::jsonb,
      'error', SQLERRM
    );
END;
$$;


ALTER FUNCTION "public"."get_dashboard_stats"("p_announcement_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_dashboard_stats"("p_announcement_id" "uuid") IS 'Retorna estatisticas agregadas do painel incluindo total de anuncios ativos, visualizacoes, leads, favoritos, taxa de conversao, cliques por estado, ranking de anuncios e analise de preco comparativa. Aceita parametro opcional p_announcement_id para filtrar metricas de um anuncio especifico.';



CREATE OR REPLACE FUNCTION "public"."get_home_showcase_impression_stats"("p_announcement_ids" "uuid"[]) RETURNS TABLE("announcement_id" "uuid", "impressions_last_7_days" bigint, "last_seen_at" timestamp with time zone)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select
    requested.announcement_id,
    coalesce(stats.impressions_last_7_days, 0) as impressions_last_7_days,
    stats.last_seen_at
  from unnest(coalesce(p_announcement_ids, array[]::uuid[])) as requested(announcement_id)
  left join (
    select
      hsi.announcement_id,
      count(*) filter (where hsi.viewed_at >= (now() - interval '7 days')) as impressions_last_7_days,
      max(hsi.viewed_at) as last_seen_at
    from public.home_showcase_impressions hsi
    where hsi.announcement_id = any(coalesce(p_announcement_ids, array[]::uuid[]))
    group by hsi.announcement_id
  ) stats on stats.announcement_id = requested.announcement_id;
$$;


ALTER FUNCTION "public"."get_home_showcase_impression_stats"("p_announcement_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_my_active_ad_capacity_status"() RETURNS TABLE("plan_name" "text", "active_ads_count" integer, "max_ads" integer, "available_slots" integer, "is_over_limit" boolean, "can_publish_new" boolean, "can_reactivate" boolean)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  current_user_id uuid := auth.uid();
  active_subscription record;
  current_active_ads integer := 0;
  current_max_ads integer := 0;
begin
  if current_user_id is null then
    raise exception 'Usuario nao autenticado';
  end if;

  select count(*)
    into current_active_ads
  from public.announcements a
  where a.user_id = current_user_id
    and a.status in ('ACTIVE', 'active')
    and (a.expires_at is null or a.expires_at > now());

  select
    p.name,
    p.max_ads
    into active_subscription
  from public.user_subscriptions us
  join public.plans p on p.id = us.plan_id
  where us.user_id = current_user_id
    and us.status = 'active'
    and us.current_period_end >= now()
  order by us.current_period_end desc
  limit 1;

  if not found then
    plan_name := null;
    active_ads_count := current_active_ads;
    max_ads := 0;
    available_slots := 0;
    is_over_limit := current_active_ads > 0;
    can_publish_new := false;
    can_reactivate := false;
    return next;
    return;
  end if;

  current_max_ads := coalesce(active_subscription.max_ads, 0);

  plan_name := active_subscription.name;
  active_ads_count := current_active_ads;
  max_ads := current_max_ads;
  available_slots := greatest(current_max_ads - current_active_ads, 0);
  is_over_limit := current_active_ads > current_max_ads;
  can_publish_new := active_subscription.max_ads is null or current_active_ads < current_max_ads;
  can_reactivate := can_publish_new;

  return next;
end;
$$;


ALTER FUNCTION "public"."get_my_active_ad_capacity_status"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_my_document_verification_retry_status"() RETURNS TABLE("document_review_status" "text", "document_verified" boolean, "document_retry_available_at" timestamp with time zone, "document_last_attempt_at" timestamp with time zone, "document_last_failure_reason" "text", "can_retry" boolean)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Usuario nao autenticado.';
  end if;

  return query
  select
    u.document_review_status,
    u.document_verified,
    u.document_retry_available_at,
    u.document_last_attempt_at,
    u.document_last_failure_reason,
    coalesce(u.document_retry_available_at <= now(), true) as can_retry
  from public.users u
  where u.id = v_user_id;
end;
$$;


ALTER FUNCTION "public"."get_my_document_verification_retry_status"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_my_highlight_booster_summary"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_user_id uuid := auth.uid();
  v_category_remaining integer := 0;
  v_home_remaining integer := 0;
  v_recent_purchases integer := 0;
begin
  if v_user_id is null then
    return jsonb_build_object(
      'success', false,
      'error', 'Usuario nao autenticado'
    );
  end if;

  select
    coalesce(sum(category_credits_remaining), 0),
    coalesce(sum(home_credits_remaining), 0)
  into v_category_remaining, v_home_remaining
  from public.user_highlight_booster_purchases
  where user_id = v_user_id
    and status = 'credited';

  select count(*)
  into v_recent_purchases
  from public.user_highlight_booster_purchases
  where user_id = v_user_id
    and status = 'credited'
    and created_at >= (now() - interval '30 days');

  return jsonb_build_object(
    'success', true,
    'category_remaining', v_category_remaining,
    'home_remaining', v_home_remaining,
    'purchases_last_30_days', v_recent_purchases
  );
end;
$$;


ALTER FUNCTION "public"."get_my_highlight_booster_summary"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_payment_settings_admin_safe"() RETURNS TABLE("id" "uuid", "asaas_api_key_configured" boolean, "asaas_webhook_token_configured" boolean, "preferred_checkout_provider" "text", "is_production" boolean, "last_updated_by" "uuid", "created_at" timestamp with time zone, "updated_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if not public.is_admin() then
    raise exception 'Unauthorized';
  end if;

  return query
  select
    ps.id,
    coalesce(nullif(trim(ps.asaas_api_key), '') is not null, false),
    coalesce(nullif(trim(ps.asaas_webhook_token), '') is not null, false),
    'asaas'::text,
    ps.is_production,
    ps.last_updated_by,
    ps.created_at,
    ps.updated_at
  from public.payment_settings ps
  where ps.id = '00000000-0000-0000-0000-000000000005';
end;
$$;


ALTER FUNCTION "public"."get_payment_settings_admin_safe"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_public_about_stats"() RETURNS TABLE("active_users" bigint, "created_ads" bigint, "generated_deals" bigint)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  return query
  select
    (
      select count(*)
      from public.users u
      where coalesce(u.is_suspended, false) = false
    ) as active_users,
    (
      select count(*)
      from public.announcements a
    ) as created_ads,
    (
      select count(*)
      from public.leads l
    ) as generated_deals;
end;
$$;


ALTER FUNCTION "public"."get_public_about_stats"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_public_active_plan_signals"("p_user_ids" "uuid"[]) RETURNS TABLE("user_id" "uuid", "plan_id" "uuid", "plan_name" "text", "plan_position" integer, "monthly_price" numeric, "current_period_end" timestamp with time zone)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select distinct on (us.user_id)
    us.user_id,
    us.plan_id,
    p.name as plan_name,
    coalesce(p.position, 9999) as plan_position,
    coalesce(p.monthly_price, 0) as monthly_price,
    us.current_period_end
  from public.user_subscriptions us
  join public.plans p
    on p.id = us.plan_id
  where p_user_ids is not null
    and cardinality(p_user_ids) > 0
    and us.user_id = any(p_user_ids)
    and us.status = 'active'
    and us.current_period_end > now()
  order by
    us.user_id,
    coalesce(p.monthly_price, 0) desc,
    coalesce(p.position, 9999) asc,
    us.current_period_end desc;
$$;


ALTER FUNCTION "public"."get_public_active_plan_signals"("p_user_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_public_active_site_sponsors"() RETURNS TABLE("id" "uuid", "company_name" "text", "segment" "text", "logo_url" "text", "banner_url" "text", "target_type" "text", "target_url" "text", "slot_position" integer)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select
    s.id,
    s.company_name,
    s.segment,
    s.logo_url,
    s.banner_url,
    s.target_type,
    s.target_url,
    s.slot_position
  from public.site_sponsors s
  where s.status = 'active'
    and s.starts_on <= ((now() at time zone 'America/Sao_Paulo')::date)
    and (s.ends_on is null or s.ends_on >= ((now() at time zone 'America/Sao_Paulo')::date))
  order by s.slot_position asc nulls last, s.created_at asc;
$$;


ALTER FUNCTION "public"."get_public_active_site_sponsors"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_public_announcement_engagement_signals"("p_announcement_ids" "uuid"[], "p_period_days" integer DEFAULT 14) RETURNS TABLE("announcement_id" "uuid", "views_last_period" bigint, "unique_visitors_last_period" bigint, "leads_last_period" bigint, "last_viewed_at" timestamp with time zone, "last_lead_at" timestamp with time zone)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  with requested_ids as (
    select distinct unnest(coalesce(p_announcement_ids, array[]::uuid[])) as announcement_id
  ),
  safe_period as (
    select greatest(least(coalesce(p_period_days, 14), 30), 1) as period_days
  ),
  recent_views as (
    select
      spv.entity_id as announcement_id,
      count(*) as views_last_period,
      count(distinct spv.session_id) as unique_visitors_last_period,
      max(spv.created_at) as last_viewed_at
    from public.site_page_views spv
    cross join safe_period sp
    inner join requested_ids ids on ids.announcement_id = spv.entity_id
    where spv.is_admin_area = false
      and spv.page_type = 'announcement'
      and spv.entity_id is not null
      and spv.created_at >= now() - make_interval(days => sp.period_days)
    group by spv.entity_id
  ),
  recent_leads as (
    select
      l.announcement_id,
      count(*) as leads_last_period,
      max(l.created_at) as last_lead_at
    from public.leads l
    cross join safe_period sp
    inner join requested_ids ids on ids.announcement_id = l.announcement_id
    where l.created_at >= now() - make_interval(days => sp.period_days)
    group by l.announcement_id
  )
  select
    ids.announcement_id,
    coalesce(rv.views_last_period, 0) as views_last_period,
    coalesce(rv.unique_visitors_last_period, 0) as unique_visitors_last_period,
    coalesce(rl.leads_last_period, 0) as leads_last_period,
    rv.last_viewed_at,
    rl.last_lead_at
  from requested_ids ids
  left join recent_views rv on rv.announcement_id = ids.announcement_id
  left join recent_leads rl on rl.announcement_id = ids.announcement_id;
$$;


ALTER FUNCTION "public"."get_public_announcement_engagement_signals"("p_announcement_ids" "uuid"[], "p_period_days" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_public_category_ranking_settings"() RETURNS TABLE("novelty_boost_48h" integer, "novelty_boost_7d" integer, "freshness_multiplier" numeric, "quality_multiplier" numeric, "engagement_multiplier" numeric, "verification_weight" integer, "home_highlight_weight" integer, "active_plan_base_weight" integer, "active_plan_price_multiplier" numeric, "active_plan_price_cap" integer, "stale_penalty_7d" integer, "stale_penalty_14d" integer, "stale_penalty_30d" integer, "seller_rotation_limit" integer)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select
    novelty_boost_48h,
    novelty_boost_7d,
    freshness_multiplier,
    quality_multiplier,
    engagement_multiplier,
    verification_weight,
    home_highlight_weight,
    active_plan_base_weight,
    active_plan_price_multiplier,
    active_plan_price_cap,
    stale_penalty_7d,
    stale_penalty_14d,
    stale_penalty_30d,
    seller_rotation_limit
  from public.category_ranking_settings
  limit 1;
$$;


ALTER FUNCTION "public"."get_public_category_ranking_settings"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_public_home_carousel_sponsors"() RETURNS TABLE("id" "uuid", "company_name" "text", "segment" "text", "banner_url" "text", "target_type" "text", "target_url" "text", "home_badge_text" "text", "home_title" "text", "home_subtitle" "text", "home_button_text" "text", "home_carousel_sort_order" integer)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select
    s.id,
    s.company_name,
    s.segment,
    s.banner_url,
    s.target_type,
    s.target_url,
    coalesce(nullif(trim(s.home_badge_text), ''), 'Patrocinador AGRO BW') as home_badge_text,
    coalesce(nullif(trim(s.home_title), ''), s.company_name) as home_title,
    coalesce(
      nullif(trim(s.home_subtitle), ''),
      format('%s em destaque na home da AGRO BW.', s.segment)
    ) as home_subtitle,
    coalesce(nullif(trim(s.home_button_text), ''), 'Conhecer patrocinador') as home_button_text,
    coalesce(s.home_carousel_sort_order, 999) as home_carousel_sort_order
  from public.site_sponsors s
  where s.show_on_home_carousel = true
    and s.banner_url is not null
    and nullif(trim(s.banner_url), '') is not null
    and s.target_url is not null
    and nullif(trim(s.target_url), '') is not null
    and s.status = 'active'
    and s.starts_on <= ((now() at time zone 'America/Sao_Paulo')::date)
    and (s.ends_on is null or s.ends_on >= ((now() at time zone 'America/Sao_Paulo')::date))
  order by coalesce(s.home_carousel_sort_order, 999) asc, s.created_at desc;
$$;


ALTER FUNCTION "public"."get_public_home_carousel_sponsors"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_public_sponsor_landing_stats"() RETURNS TABLE("total_slots" integer, "occupied_slots" integer, "available_slots" integer, "active_sponsors" integer, "registered_users" integer, "active_announcements" integer, "active_stores" integer, "generated_leads" integer)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  with sponsor_counts as (
    select count(*)::integer as active_count
    from public.site_sponsors s
    where s.status = 'active'
      and s.starts_on <= ((now() at time zone 'America/Sao_Paulo')::date)
      and (s.ends_on is null or s.ends_on >= ((now() at time zone 'America/Sao_Paulo')::date))
  ),
  announcement_counts as (
    select count(*)::integer as active_count
    from public.announcements a
    where a.status = 'ACTIVE'
  ),
  user_counts as (
    select count(*)::integer as total_count
    from public.users u
    where u.email is not null
  ),
  store_counts as (
    select count(*)::integer as active_count
    from public.seller_stores st
    where st.is_active = true
      and st.is_store_feature_enabled = true
      and coalesce(st.is_paused_due_to_plan, false) = false
  ),
  lead_counts as (
    select count(*)::integer as total_count
    from public.leads l
  )
  select
    6::integer as total_slots,
    least(sc.active_count, 6)::integer as occupied_slots,
    greatest(6 - sc.active_count, 0)::integer as available_slots,
    sc.active_count::integer as active_sponsors,
    uc.total_count::integer as registered_users,
    ac.active_count::integer as active_announcements,
    stc.active_count::integer as active_stores,
    lc.total_count::integer as generated_leads
  from sponsor_counts sc
  cross join announcement_counts ac
  cross join user_counts uc
  cross join store_counts stc
  cross join lead_counts lc;
$$;


ALTER FUNCTION "public"."get_public_sponsor_landing_stats"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_radar_stats"() RETURNS TABLE("user_id" "uuid", "total_alerts" bigint, "active_alerts" bigint, "total_matches" bigint, "unviewed_matches" bigint, "last_match_date" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN QUERY
  SELECT 
    oa.user_id,
    COUNT(DISTINCT oa.id)::BIGINT as total_alerts,
    COUNT(DISTINCT CASE WHEN oa.status = 'ativo' THEN oa.id END)::BIGINT as active_alerts,
    COUNT(DISTINCT om.id)::BIGINT as total_matches,
    COUNT(DISTINCT CASE WHEN om.is_viewed = false THEN om.id END)::BIGINT as unviewed_matches,
    MAX(om.created_at) as last_match_date
  FROM opportunity_alerts oa
  LEFT JOIN opportunity_matches om ON om.alert_id = oa.id
  WHERE oa.user_id = auth.uid()  -- Filtro automático pelo usuário autenticado
  GROUP BY oa.user_id;
END;
$$;


ALTER FUNCTION "public"."get_radar_stats"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_radar_stats"() IS 'Retorna estatísticas de alertas e matches do usuário autenticado (via RPC)';



CREATE OR REPLACE FUNCTION "public"."get_server_now"() RETURNS TABLE("server_now" timestamp with time zone)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select now() as server_now;
$$;


ALTER FUNCTION "public"."get_server_now"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_site_analytics_device_breakdown"("p_period_days" integer DEFAULT 7) RETURNS TABLE("device_type" "text", "views" bigint, "unique_visitors" bigint)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  with bounds as (
    select
      ((now() AT TIME ZONE 'America/Sao_Paulo')::date - greatest(coalesce(p_period_days, 7), 1) + 1) as start_date,
      (now() AT TIME ZONE 'America/Sao_Paulo')::date as end_date
  )
  select
    coalesce(nullif(trim(spv.device_type), ''), 'unknown') as device_type,
    count(*) as views,
    count(distinct spv.session_id) as unique_visitors
  from public.site_page_views spv, bounds b
  where public.site_analytics_is_admin()
    and spv.is_admin_area = false
    and (spv.created_at AT TIME ZONE 'America/Sao_Paulo')::date between b.start_date and b.end_date
  group by coalesce(nullif(trim(spv.device_type), ''), 'unknown')
  order by views desc, unique_visitors desc, device_type asc;
$$;


ALTER FUNCTION "public"."get_site_analytics_device_breakdown"("p_period_days" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_site_analytics_geo_breakdown"("p_period_days" integer DEFAULT 7, "p_limit" integer DEFAULT 10) RETURNS TABLE("state" "text", "city" "text", "views" bigint, "unique_visitors" bigint)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  with bounds as (
    select
      ((now() AT TIME ZONE 'America/Sao_Paulo')::date - greatest(coalesce(p_period_days, 7), 1) + 1) as start_date,
      (now() AT TIME ZONE 'America/Sao_Paulo')::date as end_date
  )
  select
    upper(coalesce(nullif(trim(spv.user_state), ''), 'NI')) as state,
    coalesce(nullif(trim(spv.user_city), ''), 'Nao informado') as city,
    count(*) as views,
    count(distinct spv.session_id) as unique_visitors
  from public.site_page_views spv, bounds b
  where public.site_analytics_is_admin()
    and spv.is_admin_area = false
    and (spv.created_at AT TIME ZONE 'America/Sao_Paulo')::date between b.start_date and b.end_date
  group by upper(coalesce(nullif(trim(spv.user_state), ''), 'NI')),
           coalesce(nullif(trim(spv.user_city), ''), 'Nao informado')
  order by views desc, unique_visitors desc, state asc, city asc
  limit greatest(coalesce(p_limit, 10), 1);
$$;


ALTER FUNCTION "public"."get_site_analytics_geo_breakdown"("p_period_days" integer, "p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_site_analytics_live_presence"("p_limit" integer DEFAULT 20) RETURNS TABLE("session_id" "text", "user_id" "uuid", "user_name" "text", "current_path" "text", "page_label" "text", "page_type" "text", "device_type" "text", "last_seen_at" timestamp with time zone)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select
    sp.session_id,
    sp.user_id,
    u.name as user_name,
    sp.current_path,
    sp.page_label,
    sp.page_type,
    sp.device_type,
    sp.last_seen_at
  from public.site_presence sp
  left join public.users u on u.id = sp.user_id
  where public.site_analytics_is_admin()
    and sp.is_admin_area = false
    and sp.last_seen_at >= now() - interval '2 minutes'
  order by sp.last_seen_at desc
  limit greatest(coalesce(p_limit, 20), 1);
$$;


ALTER FUNCTION "public"."get_site_analytics_live_presence"("p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_site_analytics_source_breakdown"("p_period_days" integer DEFAULT 7) RETURNS TABLE("source_label" "text", "views" bigint, "unique_visitors" bigint)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  with bounds as (
    select
      ((now() AT TIME ZONE 'America/Sao_Paulo')::date - greatest(coalesce(p_period_days, 7), 1) + 1) as start_date,
      (now() AT TIME ZONE 'America/Sao_Paulo')::date as end_date
  ),
  classified as (
    select
      case
        when spv.referrer is null or trim(spv.referrer) = '' then 'Direto'
        when spv.referrer ilike '%google.%'
          or spv.referrer ilike '%bing.%'
          or spv.referrer ilike '%yahoo.%'
          or spv.referrer ilike '%duckduckgo.%' then 'Busca'
        when spv.referrer ilike '%instagram.%'
          or spv.referrer ilike '%facebook.%'
          or spv.referrer ilike '%linkedin.%'
          or spv.referrer ilike '%tiktok.%'
          or spv.referrer ilike '%youtube.%'
          or spv.referrer ilike '%whatsapp.%' then 'Social'
        when spv.referrer ilike '%agrobw%'
          or spv.referrer ilike '%bwagro%'
          or spv.referrer ilike '%127.0.0.1%'
          or spv.referrer ilike '%localhost%' then 'Interno'
        else 'Referencia'
      end as source_label,
      spv.session_id
    from public.site_page_views spv, bounds b
    where public.site_analytics_is_admin()
      and spv.is_admin_area = false
      and (spv.created_at AT TIME ZONE 'America/Sao_Paulo')::date between b.start_date and b.end_date
  )
  select
    classified.source_label,
    count(*) as views,
    count(distinct classified.session_id) as unique_visitors
  from classified
  group by classified.source_label
  order by views desc, unique_visitors desc, source_label asc;
$$;


ALTER FUNCTION "public"."get_site_analytics_source_breakdown"("p_period_days" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_site_analytics_summary"("p_period_days" integer DEFAULT 7) RETURNS TABLE("total_page_views" bigint, "unique_visitors" bigint, "logged_in_visitors" bigint, "online_users" bigint, "online_logged_users" bigint)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  with admin_gate as (
    select public.site_analytics_is_admin() as allowed
  ),
  bounds as (
    select
      ((now() AT TIME ZONE 'America/Sao_Paulo')::date - greatest(coalesce(p_period_days, 7), 1) + 1) as start_date,
      (now() AT TIME ZONE 'America/Sao_Paulo')::date as end_date
  ),
  filtered_views as (
    select spv.*
    from public.site_page_views spv, admin_gate ag, bounds b
    where ag.allowed
      and spv.is_admin_area = false
      and (spv.created_at AT TIME ZONE 'America/Sao_Paulo')::date between b.start_date and b.end_date
  ),
  online_presence as (
    select sp.*
    from public.site_presence sp, admin_gate ag
    where ag.allowed
      and sp.is_admin_area = false
      and sp.last_seen_at >= now() - interval '2 minutes'
  )
  select
    (select count(*) from filtered_views) as total_page_views,
    (select count(distinct session_id) from filtered_views) as unique_visitors,
    (select count(distinct user_id) from filtered_views where user_id is not null) as logged_in_visitors,
    (select count(distinct session_id) from online_presence) as online_users,
    (select count(distinct user_id) from online_presence where user_id is not null) as online_logged_users;
$$;


ALTER FUNCTION "public"."get_site_analytics_summary"("p_period_days" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_site_analytics_time_series"("p_period_days" integer DEFAULT 7) RETURNS TABLE("bucket_date" "date", "page_views" bigint, "unique_visitors" bigint)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  with bounds as (
    select
      ((now() AT TIME ZONE 'America/Sao_Paulo')::date - greatest(coalesce(p_period_days, 7), 1) + 1) as start_date,
      (now() AT TIME ZONE 'America/Sao_Paulo')::date as end_date
  ),
  days as (
    select generate_series(
      (select start_date from bounds),
      (select end_date from bounds),
      interval '1 day'
    )::date as bucket_date
  ),
  aggregated as (
    select
      (spv.created_at AT TIME ZONE 'America/Sao_Paulo')::date as bucket_date,
      count(*) as page_views,
      count(distinct spv.session_id) as unique_visitors
    from public.site_page_views spv, bounds b
    where public.site_analytics_is_admin()
      and spv.is_admin_area = false
      and (spv.created_at AT TIME ZONE 'America/Sao_Paulo')::date between b.start_date and b.end_date
    group by (spv.created_at AT TIME ZONE 'America/Sao_Paulo')::date
  )
  select
    d.bucket_date,
    coalesce(a.page_views, 0) as page_views,
    coalesce(a.unique_visitors, 0) as unique_visitors
  from days d
  left join aggregated a on a.bucket_date = d.bucket_date
  order by d.bucket_date asc;
$$;


ALTER FUNCTION "public"."get_site_analytics_time_series"("p_period_days" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_site_analytics_top_announcements"("p_period_days" integer DEFAULT 7, "p_limit" integer DEFAULT 10) RETURNS TABLE("announcement_id" "uuid", "announcement_title" "text", "views" bigint, "unique_visitors" bigint)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  with bounds as (
    select
      ((now() AT TIME ZONE 'America/Sao_Paulo')::date - greatest(coalesce(p_period_days, 7), 1) + 1) as start_date,
      (now() AT TIME ZONE 'America/Sao_Paulo')::date as end_date
  )
  select
    spv.entity_id as announcement_id,
    max(a.title) as announcement_title,
    count(*) as views,
    count(distinct spv.session_id) as unique_visitors
  from public.site_page_views spv
  left join public.announcements a on a.id = spv.entity_id
  cross join bounds b
  where public.site_analytics_is_admin()
    and spv.is_admin_area = false
    and spv.page_type = 'announcement'
    and spv.entity_id is not null
    and (spv.created_at AT TIME ZONE 'America/Sao_Paulo')::date between b.start_date and b.end_date
  group by spv.entity_id
  order by views desc, unique_visitors desc
  limit greatest(coalesce(p_limit, 10), 1);
$$;


ALTER FUNCTION "public"."get_site_analytics_top_announcements"("p_period_days" integer, "p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_site_analytics_top_pages"("p_period_days" integer DEFAULT 7, "p_limit" integer DEFAULT 10) RETURNS TABLE("page_path" "text", "page_label" "text", "page_type" "text", "views" bigint, "unique_visitors" bigint)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  with bounds as (
    select
      ((now() AT TIME ZONE 'America/Sao_Paulo')::date - greatest(coalesce(p_period_days, 7), 1) + 1) as start_date,
      (now() AT TIME ZONE 'America/Sao_Paulo')::date as end_date
  )
  select
    spv.page_path,
    max(spv.page_label) as page_label,
    max(spv.page_type) as page_type,
    count(*) as views,
    count(distinct spv.session_id) as unique_visitors
  from public.site_page_views spv, bounds b
  where public.site_analytics_is_admin()
    and spv.is_admin_area = false
    and (spv.created_at AT TIME ZONE 'America/Sao_Paulo')::date between b.start_date and b.end_date
  group by spv.page_path
  order by views desc, unique_visitors desc, spv.page_path asc
  limit greatest(coalesce(p_limit, 10), 1);
$$;


ALTER FUNCTION "public"."get_site_analytics_top_pages"("p_period_days" integer, "p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_site_analytics_top_searches"("p_period_days" integer DEFAULT 7, "p_limit" integer DEFAULT 10) RETURNS TABLE("term" "text", "search_count" bigint)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  with bounds as (
    select
      ((now() AT TIME ZONE 'America/Sao_Paulo')::date - greatest(coalesce(p_period_days, 7), 1) + 1) as start_date,
      (now() AT TIME ZONE 'America/Sao_Paulo')::date as end_date
  ),
  ranked as (
    select
      min(se.term) as term,
      se.normalized_term,
      count(*) as search_count
    from public.search_events se, bounds b
    where public.site_analytics_is_admin()
      and (se.created_at AT TIME ZONE 'America/Sao_Paulo')::date between b.start_date and b.end_date
    group by se.normalized_term
  )
  select
    ranked.term,
    ranked.search_count
  from ranked
  where ranked.term is not null
  order by ranked.search_count desc, ranked.term asc
  limit greatest(coalesce(p_limit, 10), 1);
$$;


ALTER FUNCTION "public"."get_site_analytics_top_searches"("p_period_days" integer, "p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_site_analytics_top_stores"("p_period_days" integer DEFAULT 7, "p_limit" integer DEFAULT 10) RETURNS TABLE("store_slug" "text", "store_name" "text", "views" bigint, "unique_visitors" bigint)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  with bounds as (
    select
      ((now() AT TIME ZONE 'America/Sao_Paulo')::date - greatest(coalesce(p_period_days, 7), 1) + 1) as start_date,
      (now() AT TIME ZONE 'America/Sao_Paulo')::date as end_date
  )
  select
    spv.entity_key as store_slug,
    max(ss.store_name) as store_name,
    count(*) as views,
    count(distinct spv.session_id) as unique_visitors
  from public.site_page_views spv
  left join public.seller_stores ss on ss.slug = spv.entity_key
  cross join bounds b
  where public.site_analytics_is_admin()
    and spv.is_admin_area = false
    and spv.page_type = 'storefront'
    and spv.entity_key is not null
    and (spv.created_at AT TIME ZONE 'America/Sao_Paulo')::date between b.start_date and b.end_date
  group by spv.entity_key
  order by views desc, unique_visitors desc
  limit greatest(coalesce(p_limit, 10), 1);
$$;


ALTER FUNCTION "public"."get_site_analytics_top_stores"("p_period_days" integer, "p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_site_sponsor_metrics_report"("p_sponsor_id" "uuid", "p_period_start" timestamp with time zone, "p_period_end" timestamp with time zone) RETURNS TABLE("sponsor_id" "uuid", "sponsor_name" "text", "period_start" timestamp with time zone, "period_end" timestamp with time zone, "impressions" integer, "clicks" integer, "ctr" numeric, "primary_region" "text", "top_regions" "jsonb")
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  with sponsor_row as (
    select s.id, s.company_name
    from public.site_sponsors s
    where s.id = p_sponsor_id
  ),
  impression_count as (
    select count(*)::integer as total
    from public.site_sponsor_impressions i
    where i.sponsor_id = p_sponsor_id
      and i.placement_key = 'home_carousel'
      and i.created_at >= p_period_start
      and i.created_at <= p_period_end
  ),
  click_count as (
    select count(*)::integer as total
    from public.site_sponsor_clicks c
    where c.sponsor_id = p_sponsor_id
      and c.placement_key = 'home_carousel'
      and c.created_at >= p_period_start
      and c.created_at <= p_period_end
  ),
  regions as (
    select
      case
        when coalesce(nullif(trim(c.user_city), ''), '') <> '' and coalesce(nullif(trim(c.user_state), ''), '') <> ''
          then trim(c.user_city) || ' - ' || upper(trim(c.user_state))
        when coalesce(nullif(trim(c.user_state), ''), '') <> ''
          then upper(trim(c.user_state))
        else 'Região não identificada'
      end as region_label,
      count(*)::integer as clicks
    from public.site_sponsor_clicks c
    where c.sponsor_id = p_sponsor_id
      and c.placement_key = 'home_carousel'
      and c.created_at >= p_period_start
      and c.created_at <= p_period_end
    group by 1
  ),
  top_region as (
    select region_label
    from regions
    order by clicks desc, region_label asc
    limit 1
  ),
  top_regions_payload as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object('region', region_label, 'clicks', clicks)
        order by clicks desc, region_label asc
      ),
      '[]'::jsonb
    ) as payload
    from (
      select region_label, clicks
      from regions
      order by clicks desc, region_label asc
      limit 5
    ) ranked_regions
  )
  select
    sponsor_row.id as sponsor_id,
    sponsor_row.company_name as sponsor_name,
    p_period_start as period_start,
    p_period_end as period_end,
    coalesce(impression_count.total, 0) as impressions,
    coalesce(click_count.total, 0) as clicks,
    case
      when coalesce(impression_count.total, 0) > 0
        then round((coalesce(click_count.total, 0)::numeric / impression_count.total::numeric) * 100, 2)
      else 0
    end as ctr,
    coalesce((select region_label from top_region), 'Região não identificada') as primary_region,
    (select payload from top_regions_payload) as top_regions
  from sponsor_row
  cross join impression_count
  cross join click_count;
$$;


ALTER FUNCTION "public"."get_site_sponsor_metrics_report"("p_sponsor_id" "uuid", "p_period_start" timestamp with time zone, "p_period_end" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_top_public_searches"("p_limit" integer DEFAULT 5, "p_days" integer DEFAULT 30) RETURNS TABLE("term" "text", "search_count" bigint)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  with bounds as (
    select
      ((now() AT TIME ZONE 'America/Sao_Paulo')::date - greatest(coalesce(p_days, 30), 1) + 1) as start_date,
      (now() AT TIME ZONE 'America/Sao_Paulo')::date as end_date
  ),
  ranked as (
    select
      min(se.term) as term,
      se.normalized_term,
      count(*) as search_count
    from public.search_events se, bounds b
    where (se.created_at AT TIME ZONE 'America/Sao_Paulo')::date between b.start_date and b.end_date
    group by se.normalized_term
  )
  select
    ranked.term,
    ranked.search_count
  from ranked
  where ranked.term is not null
  order by ranked.search_count desc, ranked.term asc
  limit greatest(coalesce(p_limit, 5), 1);
$$;


ALTER FUNCTION "public"."get_top_public_searches"("p_limit" integer, "p_days" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_stats"("user_uuid" "uuid") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_user_record RECORD;
BEGIN
  -- Buscar dados do usuário
  SELECT * INTO v_user_record
  FROM users
  WHERE id = user_uuid;
  
  -- Se usuário não existir, retorna defaults
  IF v_user_record IS NULL THEN
    RETURN json_build_object(
      'total_ads', 0,
      'active_ads', 0,
      'total_views', 0,
      'unread_messages', 0,
      'favorites_count', 0,
      'opportunities_count', 0,
      'is_seller', false,
      'first_ad_at', null
    );
  END IF;
  
  -- Retornar dados do usuário (usando first_ad_at da tabela users)
  RETURN json_build_object(
    'total_ads', 0,
    'active_ads', 0,
    'total_views', 0,
    'unread_messages', 0,
    'favorites_count', 0,
    'opportunities_count', 0,
    'is_seller', (v_user_record.first_ad_at IS NOT NULL),
    'first_ad_at', v_user_record.first_ad_at
  );
END;
$$;


ALTER FUNCTION "public"."get_user_stats"("user_uuid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."grant_commercial_intelligence_contact_share"("p_conversation_id" "uuid", "p_share_email" boolean DEFAULT false, "p_share_whatsapp" boolean DEFAULT false, "p_buyer_note" "text" DEFAULT NULL::"text") RETURNS TABLE("share_id" "uuid", "seller_notification_id" "uuid")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_user_id uuid := auth.uid();
  v_seller_user_id uuid;
  v_buyer_user_id uuid;
  v_status text;
  v_email text;
  v_whatsapp text;
  v_share_id uuid;
  v_notification_id uuid;
begin
  if v_user_id is null then
    raise exception 'Usuario nao autenticado';
  end if;

  if coalesce(p_share_email, false) = false and coalesce(p_share_whatsapp, false) = false then
    raise exception 'Selecione pelo menos um canal para compartilhar.';
  end if;

  select
    conversations.seller_user_id,
    conversations.buyer_user_id,
    conversations.status
  into
    v_seller_user_id,
    v_buyer_user_id,
    v_status
  from public.commercial_intelligence_conversations conversations
  where conversations.id = p_conversation_id
  limit 1;

  if v_buyer_user_id is null or v_buyer_user_id <> v_user_id then
    raise exception 'Conversa mediada nao encontrada para este comprador.';
  end if;

  if v_status <> 'open' then
    raise exception 'A conversa precisa estar aberta para compartilhar contato.';
  end if;

  if exists (
    select 1
    from public.commercial_intelligence_contact_shares shares
    where shares.conversation_id = p_conversation_id
  ) then
    raise exception 'Os contatos ja foram compartilhados para esta conversa.';
  end if;

  select
    nullif(trim(coalesce(users.email, '')), ''),
    nullif(trim(coalesce(users.whatsapp, '')), '')
  into
    v_email,
    v_whatsapp
  from public.users
  where users.id = v_user_id
  limit 1;

  if coalesce(p_share_email, false) = true and v_email is null then
    raise exception 'Seu perfil nao possui e-mail disponivel para compartilhamento.';
  end if;

  if coalesce(p_share_whatsapp, false) = true and v_whatsapp is null then
    raise exception 'Seu perfil nao possui WhatsApp disponivel para compartilhamento.';
  end if;

  insert into public.commercial_intelligence_contact_shares (
    conversation_id,
    seller_user_id,
    buyer_user_id,
    share_email,
    share_whatsapp,
    shared_email,
    shared_whatsapp,
    buyer_note
  )
  values (
    p_conversation_id,
    v_seller_user_id,
    v_user_id,
    coalesce(p_share_email, false),
    coalesce(p_share_whatsapp, false),
    case when coalesce(p_share_email, false) then v_email else null end,
    case when coalesce(p_share_whatsapp, false) then v_whatsapp else null end,
    nullif(trim(coalesce(p_buyer_note, '')), '')
  )
  returning id into v_share_id;

  insert into public.notifications (
    user_id,
    type,
    title,
    content,
    link
  )
  values (
    v_seller_user_id,
    'SYSTEM',
    'Comprador autorizou compartilhamento de contato',
    'Um comprador autorizou o compartilhamento de contato nesta conversa mediada. Abra a Inteligencia Comercial para visualizar os canais liberados.',
    '/minha-conta/inteligencia-comercial'
  )
  returning id into v_notification_id;

  return query
  select v_share_id, v_notification_id;
end;
$$;


ALTER FUNCTION "public"."grant_commercial_intelligence_contact_share"("p_conversation_id" "uuid", "p_share_email" boolean, "p_share_whatsapp" boolean, "p_buyer_note" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_auth_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  insert into public.users (
    id,
    email,
    name,
    phone,
    document,
    birth_date,
    website,
    cep,
    logradouro,
    numero,
    complemento,
    bairro,
    cidade,
    estado,
    role,
    is_admin,
    credits
  )
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'name', 'Usuário'),
    new.raw_user_meta_data->>'phone',
    new.raw_user_meta_data->>'document',
    nullif(new.raw_user_meta_data->>'birth_date','')::date,
    new.raw_user_meta_data->>'website',
    new.raw_user_meta_data->>'cep',
    new.raw_user_meta_data->>'logradouro',
    new.raw_user_meta_data->>'numero',
    new.raw_user_meta_data->>'complemento',
    new.raw_user_meta_data->>'bairro',
    new.raw_user_meta_data->>'cidade',
    new.raw_user_meta_data->>'estado',
    'USER',
    false,
    0
  )
  on conflict (id) do update set
    email = excluded.email,
    name = excluded.name,
    phone = excluded.phone,
    document = excluded.document,
    birth_date = excluded.birth_date,
    website = excluded.website,
    cep = excluded.cep,
    logradouro = excluded.logradouro,
    numero = excluded.numero,
    complemento = excluded.complemento,
    bairro = excluded.bairro,
    cidade = excluded.cidade,
    estado = excluded.estado;

  return new;
end;
$$;


ALTER FUNCTION "public"."handle_new_auth_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_seller_store_feature_sync"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  perform public.sync_seller_store_feature_status(coalesce(new.user_id, old.user_id));
  return coalesce(new, old);
end;
$$;


ALTER FUNCTION "public"."handle_seller_store_feature_sync"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_seller_store_initial_feature_sync"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_has_store_feature boolean := false;
begin
  select exists (
    select 1
    from public.user_subscriptions us
    join public.plans p on p.id = us.plan_id
    where us.user_id = new.user_id
      and us.status = 'active'
      and us.current_period_end > now()
      and coalesce(p.has_seller_store, false) = true
  ) into v_has_store_feature;

  new.is_store_feature_enabled := v_has_store_feature;
  new.is_paused_due_to_plan := not v_has_store_feature;
  return new;
end;
$$;


ALTER FUNCTION "public"."handle_seller_store_initial_feature_sync"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."has_active_subscription"("p_user_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_has_active BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM user_subscriptions
    WHERE user_id = p_user_id
      AND status = 'active'
      AND expires_at > NOW()
  ) INTO v_has_active;

  RETURN v_has_active;
END;
$$;


ALTER FUNCTION "public"."has_active_subscription"("p_user_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."has_active_subscription"("p_user_id" "uuid") IS 'Verifica se usuário tem assinatura ativa';



CREATE OR REPLACE FUNCTION "public"."increment_ad_views"("ad_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  -- Incrementar o contador de views
  UPDATE announcements
  SET views = COALESCE(views, 0) + 1
  WHERE id = ad_id;
  
  -- Log opcional para debug (remover em produção)
  RAISE NOTICE 'Views incrementado para anúncio: %', ad_id;
END;
$$;


ALTER FUNCTION "public"."increment_ad_views"("ad_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."insert_notification_compat"("p_user_id" "uuid", "p_type" "text", "p_title" "text", "p_content" "text", "p_link" "text" DEFAULT NULL::"text", "p_is_read" boolean DEFAULT false) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
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
$_$;


ALTER FUNCTION "public"."insert_notification_compat"("p_user_id" "uuid", "p_type" "text", "p_title" "text", "p_content" "text", "p_link" "text", "p_is_read" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_admin"() RETURNS boolean
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.users u
    where u.id = auth.uid()
      and (coalesce(u.is_admin, false) = true or lower(coalesce(u.role, '')) = 'admin')
      and coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
  );
$$;


ALTER FUNCTION "public"."is_admin"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."is_admin"() IS 'Permite acesso administrativo somente para usuarios admin autenticados com MFA em AAL2.';



CREATE OR REPLACE FUNCTION "public"."is_admin_user"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.users u
    where u.id = auth.uid()
      and (
        coalesce(u.is_admin, false) = true
        or u.role = 'admin'
      )
  );
$$;


ALTER FUNCTION "public"."is_admin_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_announcement_price_close"("p_first" numeric, "p_second" numeric) RETURNS boolean
    LANGUAGE "sql" IMMUTABLE
    AS $$
  select
    case
      when coalesce(p_first, 0) = 0 and coalesce(p_second, 0) = 0 then true
      else abs(coalesce(p_first, 0) - coalesce(p_second, 0))
        <= greatest(abs(greatest(coalesce(p_first, 0), coalesce(p_second, 0))) * 0.15, 100)
    end;
$$;


ALTER FUNCTION "public"."is_announcement_price_close"("p_first" numeric, "p_second" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_current_user_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT COALESCE(
    (
      SELECT is_admin 
      FROM users 
      WHERE id = auth.uid() 
      LIMIT 1
    ),
    false
  );
$$;


ALTER FUNCTION "public"."is_current_user_admin"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."is_current_user_admin"() IS 'Verifica se usuário logado é admin - SECURITY DEFINER evita recursão';



CREATE OR REPLACE FUNCTION "public"."is_current_user_moderator"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT COALESCE(
    (
      SELECT (role IN ('admin', 'editor') OR is_admin = true)
      FROM users 
      WHERE id = auth.uid() 
      LIMIT 1
    ),
    false
  );
$$;


ALTER FUNCTION "public"."is_current_user_moderator"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."is_current_user_moderator"() IS 'Verifica se usuário logado é moderador (admin ou editor)';



CREATE OR REPLACE FUNCTION "public"."is_document_available"("p_document" "text", "p_ignore_user_id" "uuid" DEFAULT NULL::"uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select not exists (
    select 1
    from public.users u
    where u.document_normalized = public.normalize_user_document(p_document)
      and public.normalize_user_document(p_document) is not null
      and (p_ignore_user_id is null or u.id <> p_ignore_user_id)
  );
$$;


ALTER FUNCTION "public"."is_document_available"("p_document" "text", "p_ignore_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_moderator"() RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_is_moderator BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM users 
    WHERE id = auth.uid() 
    AND role IN ('admin', 'editor')
  ) INTO v_is_moderator;
  
  RETURN COALESCE(v_is_moderator, false);
END;
$$;


ALTER FUNCTION "public"."is_moderator"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."is_moderator"() IS 'Verifica se usuário autenticado é moderador (editor ou admin)';



CREATE OR REPLACE FUNCTION "public"."is_start_signup_plan"("p_plan_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.plans p
    where p.id = p_plan_id
      and (
        p.is_default_signup_plan = true
        or (
          not exists (
            select 1
            from public.plans configured_default
            where configured_default.is_default_signup_plan = true
          )
          and lower(trim(coalesce(p.name, ''))) in ('start', 'start agro', 'safra')
        )
      )
  );
$$;


ALTER FUNCTION "public"."is_start_signup_plan"("p_plan_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."list_commercial_intelligence_conversation_messages"("p_conversation_id" "uuid") RETURNS TABLE("message_id" "uuid", "sender_user_id" "uuid", "sender_name" "text", "content" "text", "created_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_user_id uuid := auth.uid();
  v_allowed boolean := false;
begin
  if v_user_id is null then
    raise exception 'Usuario nao autenticado';
  end if;

  select exists (
    select 1
    from public.commercial_intelligence_conversations conversations
    where conversations.id = p_conversation_id
      and (
        conversations.seller_user_id = v_user_id
        or conversations.buyer_user_id = v_user_id
      )
  )
  into v_allowed;

  if not v_allowed then
    raise exception 'Conversa mediada nao encontrada para este usuario.';
  end if;

  return query
  select
    messages.id as message_id,
    messages.sender_user_id,
    case
      when messages.sender_user_id = conversations.seller_user_id then coalesce(nullif(store.store_name, ''), nullif(seller.name, ''), 'Loja parceira da AGRO BW')
      else coalesce(nullif(buyer.name, ''), 'Comprador interessado')
    end as sender_name,
    messages.content,
    messages.created_at
  from public.commercial_intelligence_conversation_messages messages
  join public.commercial_intelligence_conversations conversations on conversations.id = messages.conversation_id
  join public.users seller on seller.id = conversations.seller_user_id
  join public.users buyer on buyer.id = conversations.buyer_user_id
  left join public.seller_stores store on store.user_id = seller.id
  where messages.conversation_id = p_conversation_id
  order by messages.created_at asc;
end;
$$;


ALTER FUNCTION "public"."list_commercial_intelligence_conversation_messages"("p_conversation_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."list_my_commercial_intelligence_contact_shares"() RETURNS TABLE("share_id" "uuid", "conversation_id" "uuid", "seller_user_id" "uuid", "buyer_user_id" "uuid", "share_email" boolean, "share_whatsapp" boolean, "shared_email" "text", "shared_whatsapp" "text", "buyer_note" "text", "granted_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Usuario nao autenticado';
  end if;

  return query
  select
    shares.id as share_id,
    shares.conversation_id,
    shares.seller_user_id,
    shares.buyer_user_id,
    shares.share_email,
    shares.share_whatsapp,
    shares.shared_email,
    shares.shared_whatsapp,
    shares.buyer_note,
    shares.granted_at
  from public.commercial_intelligence_contact_shares shares
  where shares.seller_user_id = v_user_id
     or shares.buyer_user_id = v_user_id
  order by shares.granted_at desc;
end;
$$;


ALTER FUNCTION "public"."list_my_commercial_intelligence_contact_shares"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."list_my_commercial_intelligence_conversations"() RETURNS TABLE("conversation_id" "uuid", "response_id" "uuid", "campaign_id" "uuid", "category_slug" "text", "subcategory_slug" "text", "role" "text", "counterpart_name" "text", "counterpart_city" "text", "counterpart_state" "text", "status" "text", "created_at" timestamp with time zone, "updated_at" timestamp with time zone, "last_message_preview" "text", "last_message_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Usuario nao autenticado';
  end if;

  return query
  with latest_messages as (
    select distinct on (messages.conversation_id)
      messages.conversation_id,
      messages.content,
      messages.created_at
    from public.commercial_intelligence_conversation_messages messages
    order by messages.conversation_id, messages.created_at desc
  )
  select
    conversations.id as conversation_id,
    conversations.response_id,
    conversations.campaign_id,
    campaigns.category_slug,
    campaigns.subcategory_slug,
    case
      when conversations.seller_user_id = v_user_id then 'seller'
      else 'buyer'
    end as role,
    case
      when conversations.seller_user_id = v_user_id then coalesce(nullif(buyer.name, ''), 'Comprador interessado')
      else coalesce(nullif(store.store_name, ''), nullif(seller.name, ''), 'Loja parceira da AGRO BW')
    end as counterpart_name,
    case
      when conversations.seller_user_id = v_user_id then nullif(buyer.cidade, '')
      else nullif(seller.cidade, '')
    end as counterpart_city,
    case
      when conversations.seller_user_id = v_user_id then nullif(buyer.estado, '')
      else nullif(seller.estado, '')
    end as counterpart_state,
    conversations.status,
    conversations.created_at,
    conversations.updated_at,
    latest.content as last_message_preview,
    latest.created_at as last_message_at
  from public.commercial_intelligence_conversations conversations
  join public.commercial_intelligence_outreach_campaigns campaigns on campaigns.id = conversations.campaign_id
  join public.users seller on seller.id = conversations.seller_user_id
  join public.users buyer on buyer.id = conversations.buyer_user_id
  left join public.seller_stores store on store.user_id = seller.id
  left join latest_messages latest on latest.conversation_id = conversations.id
  where conversations.seller_user_id = v_user_id
     or conversations.buyer_user_id = v_user_id
  order by coalesce(latest.created_at, conversations.updated_at) desc;
end;
$$;


ALTER FUNCTION "public"."list_my_commercial_intelligence_conversations"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."list_my_pending_legal_consents"() RETURNS TABLE("consent_type" "text", "document_version" "text", "document_title" "text", "document_url" "text", "accepted_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Usuario autenticado obrigatorio para consultar pendencias de reaceite.';
  end if;

  return query
  with latest_documents as (
    select *
    from public.resolve_legal_document_snapshot('terms_of_use')
    union all
    select *
    from public.resolve_legal_document_snapshot('privacy_policy')
  ),
  normalized_latest as (
    select
      case
        when ld.document_title = 'Termos de Uso' then 'terms_of_use'
        when ld.document_title = 'Política de Privacidade' then 'privacy_policy'
        else lower(replace(ld.document_title, ' ', '_'))
      end as consent_type,
      ld.document_version,
      ld.document_title,
      ld.document_url
    from latest_documents ld
  ),
  latest_acceptances as (
    select distinct on (ulc.consent_type)
      ulc.consent_type,
      ulc.document_version,
      ulc.accepted_at
    from public.user_legal_consents ulc
    where ulc.user_id = v_user_id
      and ulc.revoked_at is null
      and ulc.consent_type in ('terms_of_use', 'privacy_policy')
    order by ulc.consent_type, ulc.accepted_at desc
  )
  select
    nl.consent_type,
    nl.document_version,
    nl.document_title,
    nl.document_url,
    la.accepted_at
  from normalized_latest nl
  left join latest_acceptances la
    on la.consent_type = nl.consent_type
   and la.document_version = nl.document_version
  where la.accepted_at is null
  order by nl.consent_type;
end;
$$;


ALTER FUNCTION "public"."list_my_pending_legal_consents"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."list_my_pending_legal_consents"() IS 'Lista os documentos legais atuais que o usuario autenticado ainda precisa reaceitar.';



CREATE OR REPLACE FUNCTION "public"."list_received_commercial_intelligence_opportunities"() RETURNS TABLE("delivery_id" "uuid", "campaign_id" "uuid", "category_slug" "text", "subcategory_slug" "text", "seller_label" "text", "message_template" "text", "received_at" timestamp with time zone, "has_response" boolean, "responded_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Usuario nao autenticado';
  end if;

  return query
  select
    deliveries.id as delivery_id,
    campaigns.id as campaign_id,
    campaigns.category_slug,
    campaigns.subcategory_slug,
    coalesce(nullif(store.store_name, ''), nullif(seller.name, ''), 'Loja parceira da AGRO BW') as seller_label,
    campaigns.message_template,
    deliveries.created_at as received_at,
    responses.id is not null as has_response,
    responses.created_at as responded_at
  from public.commercial_intelligence_outreach_deliveries deliveries
  join public.commercial_intelligence_outreach_campaigns campaigns on campaigns.id = deliveries.campaign_id
  join public.users seller on seller.id = campaigns.seller_user_id
  left join public.seller_stores store on store.user_id = seller.id
  left join public.commercial_intelligence_interest_responses responses on responses.delivery_id = deliveries.id
  where deliveries.recipient_user_id = v_user_id
  order by deliveries.created_at desc;
end;
$$;


ALTER FUNCTION "public"."list_received_commercial_intelligence_opportunities"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."list_sent_commercial_intelligence_interest_responses"() RETURNS TABLE("response_id" "uuid", "campaign_id" "uuid", "category_slug" "text", "subcategory_slug" "text", "buyer_name" "text", "buyer_city" "text", "buyer_state" "text", "buyer_note" "text", "responded_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Usuario nao autenticado';
  end if;

  return query
  select
    responses.id as response_id,
    responses.campaign_id,
    campaigns.category_slug,
    campaigns.subcategory_slug,
    coalesce(nullif(buyer.name, ''), 'Comprador interessado') as buyer_name,
    nullif(buyer.cidade, '') as buyer_city,
    nullif(buyer.estado, '') as buyer_state,
    responses.buyer_note,
    responses.created_at as responded_at
  from public.commercial_intelligence_interest_responses responses
  join public.commercial_intelligence_outreach_campaigns campaigns on campaigns.id = responses.campaign_id
  join public.users buyer on buyer.id = responses.buyer_user_id
  where responses.seller_user_id = v_user_id
  order by responses.created_at desc;
end;
$$;


ALTER FUNCTION "public"."list_sent_commercial_intelligence_interest_responses"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_admin_action"("p_action" "text", "p_resource_type" "text", "p_resource_id" "uuid", "p_old_value" "jsonb" DEFAULT NULL::"jsonb", "p_new_value" "jsonb" DEFAULT NULL::"jsonb", "p_reason" "text" DEFAULT NULL::"text", "p_ip_address" "text" DEFAULT NULL::"text", "p_user_agent" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_admin_id uuid := auth.uid();
  v_admin_email text;
  v_admin_name text;
  v_admin_role public.user_role;
  v_log_id uuid;
begin
  if v_admin_id is null then
    raise exception 'Usuário não autenticado';
  end if;

  select u.email, u.name, u.role
    into v_admin_email, v_admin_name, v_admin_role
  from public.users u
  where u.id = v_admin_id;

  if not found then
    raise exception 'Usuário não encontrado';
  end if;

  if v_admin_role <> 'admin' then
    raise exception 'Apenas administradores podem registrar auditoria';
  end if;

  insert into public.admin_audit_logs (
    admin_id,
    admin_email,
    admin_name,
    action,
    resource_type,
    resource_id,
    old_value,
    new_value,
    reason,
    ip_address,
    user_agent,
    metadata,
    created_at
  ) values (
    v_admin_id,
    v_admin_email,
    coalesce(v_admin_name, v_admin_email, 'Administrador'),
    p_action,
    p_resource_type,
    p_resource_id,
    p_old_value,
    p_new_value,
    p_reason,
    nullif(trim(coalesce(p_ip_address, '')), '')::inet,
    p_user_agent,
    jsonb_build_object(
      'timestamp', now(),
      'request_info', jsonb_build_object(
        'ip', p_ip_address,
        'user_agent', p_user_agent
      )
    ),
    now()
  )
  returning id into v_log_id;

  return v_log_id;
end;
$$;


ALTER FUNCTION "public"."log_admin_action"("p_action" "text", "p_resource_type" "text", "p_resource_id" "uuid", "p_old_value" "jsonb", "p_new_value" "jsonb", "p_reason" "text", "p_ip_address" "text", "p_user_agent" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."log_admin_action"("p_action" "text", "p_resource_type" "text", "p_resource_id" "uuid", "p_old_value" "jsonb", "p_new_value" "jsonb", "p_reason" "text", "p_ip_address" "text", "p_user_agent" "text") IS 'Registra ação administrativa no log de auditoria com detalhes completos';



CREATE OR REPLACE FUNCTION "public"."log_checkout_attempt"("p_plan_id" "uuid", "p_billing_cycle" "text", "p_amount" numeric) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_log_id UUID;
BEGIN
  -- Verificar se usuário está autenticado
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthenticated';
  END IF;

  -- Criar log na tabela de auditoria (se existir)
  -- Ajuste conforme sua estrutura de logs
  INSERT INTO admin_audit_logs (
    admin_id,
    action,
    resource_type,
    resource_id,
    new_value,
    reason
  ) VALUES (
    auth.uid(),
    'CHECKOUT_ATTEMPT',
    'PLAN',
    p_plan_id,
    jsonb_build_object(
      'billing_cycle', p_billing_cycle,
      'amount', p_amount,
      'timestamp', NOW()
    ),
    'Tentativa de checkout via Mercado Pago'
  )
  RETURNING id INTO v_log_id;

  RETURN v_log_id;
EXCEPTION
  WHEN OTHERS THEN
    -- Se a tabela não existir ou houver erro, apenas retornar UUID aleatório
    RETURN gen_random_uuid();
END;
$$;


ALTER FUNCTION "public"."log_checkout_attempt"("p_plan_id" "uuid", "p_billing_cycle" "text", "p_amount" numeric) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."log_checkout_attempt"("p_plan_id" "uuid", "p_billing_cycle" "text", "p_amount" numeric) IS 'Registra tentativa de checkout de um plano de assinatura';



CREATE OR REPLACE FUNCTION "public"."log_lead_conversion"("p_announcement_id" "uuid", "p_viewer_id" "uuid", "p_conversion_type" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_conversion_id UUID;
BEGIN
  INSERT INTO lead_conversions (
    announcement_id,
    viewer_id,
    conversion_type
  ) VALUES (
    p_announcement_id,
    p_viewer_id,
    p_conversion_type
  )
  RETURNING id INTO v_conversion_id;

  RETURN v_conversion_id;
END;
$$;


ALTER FUNCTION "public"."log_lead_conversion"("p_announcement_id" "uuid", "p_viewer_id" "uuid", "p_conversion_type" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."log_lead_conversion"("p_announcement_id" "uuid", "p_viewer_id" "uuid", "p_conversion_type" "text") IS 'Registra conversão de lead (clique em contato)';



CREATE OR REPLACE FUNCTION "public"."log_public_search"("p_term" "text", "p_source" "text" DEFAULT 'hero_search'::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_term text;
  v_normalized_term text;
begin
  v_term := trim(coalesce(p_term, ''));

  if length(v_term) < 2 then
    return;
  end if;

  if length(v_term) > 80 then
    v_term := left(v_term, 80);
  end if;

  v_normalized_term := lower(regexp_replace(v_term, '[^[:alnum:]]+', ' ', 'g'));
  v_normalized_term := trim(regexp_replace(v_normalized_term, '\s+', ' ', 'g'));

  if v_normalized_term = '' then
    return;
  end if;

  insert into public.search_events (term, normalized_term, source)
  values (v_term, v_normalized_term, left(coalesce(nullif(trim(p_source), ''), 'hero_search'), 80));
end;
$$;


ALTER FUNCTION "public"."log_public_search"("p_term" "text", "p_source" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_security_event"("p_user_id" "uuid", "p_email" "text", "p_attempted_route" "text", "p_attempted_action" "text" DEFAULT NULL::"text", "p_ip_address" "text" DEFAULT NULL::"text", "p_user_agent" "text" DEFAULT NULL::"text", "p_severity" "text" DEFAULT 'warning'::"text", "p_reason" "text" DEFAULT NULL::"text", "p_metadata" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_event_id uuid;
  v_ip_inet inet;
begin
  begin
    v_ip_inet := nullif(trim(coalesce(p_ip_address, '')), '')::inet;
  exception
    when others then
      v_ip_inet := null;
  end;

  insert into public.security_events (
    user_id,
    email,
    attempted_route,
    attempted_action,
    ip_address,
    user_agent,
    severity,
    reason,
    metadata
  )
  values (
    p_user_id,
    nullif(trim(coalesce(p_email, '')), ''),
    left(trim(coalesce(p_attempted_route, '')), 300),
    nullif(left(trim(coalesce(p_attempted_action, '')), 120), ''),
    v_ip_inet,
    left(trim(coalesce(p_user_agent, '')), 700),
    case
      when lower(coalesce(p_severity, 'warning')) in ('info', 'warning', 'critical', 'blocked')
        then lower(coalesce(p_severity, 'warning'))::public.severity_level
      else 'warning'::public.severity_level
    end,
    nullif(left(trim(coalesce(p_reason, '')), 500), ''),
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning id into v_event_id;

  return v_event_id;
end;
$$;


ALTER FUNCTION "public"."log_security_event"("p_user_id" "uuid", "p_email" "text", "p_attempted_route" "text", "p_attempted_action" "text", "p_ip_address" "text", "p_user_agent" "text", "p_severity" "text", "p_reason" "text", "p_metadata" "jsonb") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."log_security_event"("p_user_id" "uuid", "p_email" "text", "p_attempted_route" "text", "p_attempted_action" "text", "p_ip_address" "text", "p_user_agent" "text", "p_severity" "text", "p_reason" "text", "p_metadata" "jsonb") IS 'Registra evento de seguranca de forma centralizada para login admin, MFA, rate limiting e abuso de rotas.';



CREATE OR REPLACE FUNCTION "public"."log_unauthorized_access"("p_attempted_route" "text", "p_reason" "text" DEFAULT 'Acesso nao autorizado'::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_current_user_id uuid;
  v_current_email text;
begin
  select u.id, u.email
    into v_current_user_id, v_current_email
  from public.users u
  where u.id = auth.uid()
  limit 1;

  return public.log_security_event(
    p_user_id := v_current_user_id,
    p_email := v_current_email,
    p_attempted_route := p_attempted_route,
    p_attempted_action := 'unauthorized_access',
    p_severity := 'blocked',
    p_reason := p_reason
  );
end;
$$;


ALTER FUNCTION "public"."log_unauthorized_access"("p_attempted_route" "text", "p_reason" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."log_unauthorized_access"("p_attempted_route" "text", "p_reason" "text") IS 'Versão simplificada para uso no client-side. Detecta usuário automaticamente.';



CREATE OR REPLACE FUNCTION "public"."mark_start_plan_consumed"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if public.is_start_signup_plan(new.plan_id) then
    update public.users
    set start_plan_consumed_at = coalesce(start_plan_consumed_at, now())
    where id = new.user_id;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."mark_start_plan_consumed"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."match_announcements_to_alerts"("p_announcement_id" "uuid") RETURNS integer
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_announcement RECORD;
  v_alert RECORD;
  v_match_score INTEGER;
  v_match_reason JSONB;
  v_distance DECIMAL;
  v_matches_created INTEGER := 0;
BEGIN
  -- Buscar anúncio
  SELECT * INTO v_announcement
  FROM announcements
  WHERE id = p_announcement_id;

  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  -- Loop através dos alertas ativos
  FOR v_alert IN
    SELECT oa.*, u.latitude as user_lat, u.longitude as user_lon
    FROM opportunity_alerts oa
    JOIN users u ON u.id = oa.user_id
    WHERE oa.status = 'ativo'
  LOOP
    v_match_score := 0;
    v_match_reason := '{}'::jsonb;

    -- Verificar categoria
    IF v_alert.category_id IS NOT NULL THEN
      IF v_announcement.category_id = v_alert.category_id THEN
        v_match_score := v_match_score + 30;
        v_match_reason := v_match_reason || '{"category": true}'::jsonb;
      ELSE
        CONTINUE; -- Não faz match
      END IF;
    ELSE
      v_match_score := v_match_score + 10;
    END IF;

    -- Verificar estado
    IF v_alert.state IS NOT NULL THEN
      IF v_announcement.state = v_alert.state THEN
        v_match_score := v_match_score + 20;
        v_match_reason := v_match_reason || '{"state": true}'::jsonb;
      ELSE
        CONTINUE;
      END IF;
    ELSE
      v_match_score := v_match_score + 5;
    END IF;

    -- Verificar raio
    IF v_alert.radius_km > 0 AND v_alert.user_lat IS NOT NULL AND v_announcement.latitude IS NOT NULL THEN
      v_distance := calculate_distance_km(
        v_alert.user_lat, v_alert.user_lon,
        v_announcement.latitude, v_announcement.longitude
      );

      IF v_distance <= v_alert.radius_km THEN
        v_match_score := v_match_score + 25;
        v_match_reason := v_match_reason || jsonb_build_object('distance_km', ROUND(v_distance));
      ELSE
        CONTINUE;
      END IF;
    END IF;

    -- Verificar preço
    IF v_alert.min_price IS NOT NULL OR v_alert.max_price IS NOT NULL THEN
      IF v_alert.min_price IS NOT NULL AND v_announcement.price < v_alert.min_price THEN
        CONTINUE;
      END IF;
      IF v_alert.max_price IS NOT NULL AND v_announcement.price > v_alert.max_price THEN
        CONTINUE;
      END IF;
      v_match_score := v_match_score + 15;
      v_match_reason := v_match_reason || '{"price": true}'::jsonb;
    END IF;

    -- Verificar keywords
    IF v_alert.keywords IS NOT NULL AND array_length(v_alert.keywords, 1) > 0 THEN
      DECLARE
        v_text TEXT;
        v_keyword TEXT;
        v_matched_keywords TEXT[] := ARRAY[]::TEXT[];
      BEGIN
        v_text := LOWER(v_announcement.title || ' ' || v_announcement.description);
        
        FOREACH v_keyword IN ARRAY v_alert.keywords LOOP
          IF v_text LIKE '%' || LOWER(v_keyword) || '%' THEN
            v_matched_keywords := array_append(v_matched_keywords, v_keyword);
          END IF;
        END LOOP;

        IF array_length(v_matched_keywords, 1) > 0 THEN
          v_match_score := v_match_score + (10 * array_length(v_matched_keywords, 1));
          v_match_reason := v_match_reason || jsonb_build_object('keywords', v_matched_keywords);
        ELSE
          CONTINUE; -- Tem keywords mas nenhuma bateu
        END IF;
      END;
    END IF;

    -- Se score >= 50, criar match
    IF v_match_score >= 50 THEN
      INSERT INTO opportunity_matches (
        alert_id,
        announcement_id,
        user_id,
        match_score,
        match_reason,
        is_viewed,
        is_dismissed
      ) VALUES (
        v_alert.id,
        p_announcement_id,
        v_alert.user_id,
        LEAST(v_match_score, 100),
        v_match_reason,
        false,
        false
      )
      ON CONFLICT (alert_id, announcement_id) DO NOTHING;

      v_matches_created := v_matches_created + 1;

      -- Atualizar last_match_at
      UPDATE opportunity_alerts
      SET last_match_at = NOW()
      WHERE id = v_alert.id;
    END IF;
  END LOOP;

  RETURN v_matches_created;
END;
$$;


ALTER FUNCTION "public"."match_announcements_to_alerts"("p_announcement_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."match_announcements_to_alerts"("p_announcement_id" "uuid") IS 'Faz matching de anuncio contra alertas ativos, respeitando os filtros configurados no alerta.';



CREATE OR REPLACE FUNCTION "public"."match_existing_announcements_to_alert"("p_alert_id" "uuid") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_alert RECORD;
  v_announcement RECORD;
  v_match_score INTEGER;
  v_match_reason JSONB;
  v_distance DECIMAL;
  v_matches_created INTEGER := 0;
  v_keyword_matched BOOLEAN;
  i INTEGER;
BEGIN
  SELECT
    oa.*,
    u.latitude AS user_lat,
    u.longitude AS user_lon
  INTO v_alert
  FROM public.opportunity_alerts oa
  JOIN public.users u ON u.id = oa.user_id
  WHERE oa.id = p_alert_id;

  IF NOT FOUND OR v_alert.status <> 'ativo' THEN
    RETURN 0;
  END IF;

  DELETE FROM public.opportunity_matches
  WHERE alert_id = v_alert.id;

  FOR v_announcement IN
    SELECT *
    FROM public.announcements
    WHERE status = 'ACTIVE'
  LOOP
    v_match_score := 0;
    v_match_reason := '{}'::jsonb;
    v_keyword_matched := false;

    IF v_alert.category_id IS NOT NULL THEN
      IF v_announcement.category_id = v_alert.category_id THEN
        v_match_score := v_match_score + 30;
        v_match_reason := v_match_reason || jsonb_build_object('category', true);
      ELSE
        CONTINUE;
      END IF;
    ELSIF v_alert.category_group_id IS NOT NULL THEN
      IF v_announcement.category_group_id = v_alert.category_group_id THEN
        v_match_score := v_match_score + 20;
        v_match_reason := v_match_reason || jsonb_build_object('category_group', true);
      ELSE
        CONTINUE;
      END IF;
    END IF;

    IF v_alert.subcategory_id IS NOT NULL THEN
      IF COALESCE(v_announcement.sub_category_id::text, '') = v_alert.subcategory_id::text THEN
        v_match_score := v_match_score + 20;
        v_match_reason := v_match_reason || jsonb_build_object('subcategory', true);
      ELSE
        CONTINUE;
      END IF;
    END IF;

    IF v_alert.state IS NOT NULL THEN
      IF v_announcement.state = v_alert.state THEN
        v_match_score := v_match_score + 20;
        v_match_reason := v_match_reason || jsonb_build_object('state', true);
      ELSE
        CONTINUE;
      END IF;
    END IF;

    IF v_alert.min_price IS NOT NULL OR v_alert.max_price IS NOT NULL THEN
      IF v_alert.min_price IS NOT NULL
         AND COALESCE(v_announcement.unit_price, v_announcement.price) < v_alert.min_price THEN
        CONTINUE;
      END IF;

      IF v_alert.max_price IS NOT NULL
         AND COALESCE(v_announcement.unit_price, v_announcement.price) > v_alert.max_price THEN
        CONTINUE;
      END IF;

      v_match_score := v_match_score + 25;
      v_match_reason := v_match_reason || jsonb_build_object('price', true);
    END IF;

    IF v_alert.keywords IS NOT NULL AND array_length(v_alert.keywords, 1) > 0 THEN
      FOR i IN 1..array_length(v_alert.keywords, 1) LOOP
        IF v_announcement.title ILIKE '%' || v_alert.keywords[i] || '%'
           OR COALESCE(v_announcement.description, '') ILIKE '%' || v_alert.keywords[i] || '%' THEN
          v_match_score := v_match_score + 15;
          v_match_reason := v_match_reason || jsonb_build_object('keywords', v_alert.keywords);
          v_keyword_matched := true;
          EXIT;
        END IF;
      END LOOP;

      IF NOT v_keyword_matched THEN
        CONTINUE;
      END IF;
    END IF;

    IF v_alert.radius_km IS NOT NULL AND v_alert.radius_km > 0 THEN
      IF v_announcement.latitude IS NOT NULL
         AND v_announcement.longitude IS NOT NULL
         AND v_alert.user_lat IS NOT NULL
         AND v_alert.user_lon IS NOT NULL THEN
        v_distance := 6371 * acos(
          cos(radians(v_alert.user_lat)) *
          cos(radians(v_announcement.latitude)) *
          cos(radians(v_announcement.longitude) - radians(v_alert.user_lon)) +
          sin(radians(v_alert.user_lat)) *
          sin(radians(v_announcement.latitude))
        );

        IF v_distance <= v_alert.radius_km THEN
          v_match_score := v_match_score + 10;
          v_match_reason := v_match_reason || jsonb_build_object('distance_km', ROUND(v_distance, 1));
        ELSE
          CONTINUE;
        END IF;
      ELSE
        CONTINUE;
      END IF;
    END IF;

    IF v_match_score > 0 THEN
      INSERT INTO public.opportunity_matches (
        alert_id,
        announcement_id,
        user_id,
        match_score,
        match_reason,
        is_viewed,
        is_dismissed
      ) VALUES (
        v_alert.id,
        v_announcement.id,
        v_alert.user_id,
        LEAST(v_match_score, 100),
        v_match_reason,
        false,
        false
      )
      ON CONFLICT (alert_id, announcement_id) DO NOTHING;

      v_matches_created := v_matches_created + 1;
    END IF;
  END LOOP;

  UPDATE public.opportunity_alerts
  SET last_match_at = NOW()
  WHERE id = v_alert.id;

  RETURN v_matches_created;
END;
$$;


ALTER FUNCTION "public"."match_existing_announcements_to_alert"("p_alert_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."match_existing_announcements_to_alert"("p_alert_id" "uuid") IS 'Processa anuncios ativos ja existentes para um alerta especifico, respeitando todos os filtros configurados.';



CREATE OR REPLACE FUNCTION "public"."normalize_announcement_similarity_text"("p_value" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    AS $$
  select regexp_replace(
    lower(
      translate(
        coalesce(p_value, ''),
        'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
        'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC'
      )
    ),
    '[^a-z0-9]+',
    '',
    'g'
  );
$$;


ALTER FUNCTION "public"."normalize_announcement_similarity_text"("p_value" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."normalize_announcement_similarity_words"("p_value" "text") RETURNS "text"[]
    LANGUAGE "sql" IMMUTABLE
    AS $$
  select coalesce(
    array(
      select distinct token
      from unnest(
        regexp_split_to_array(
          regexp_replace(
            lower(
              translate(
                coalesce(p_value, ''),
                'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
                'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC'
              )
            ),
            '[^a-z0-9]+',
            ' ',
            'g'
          ),
          '\s+'
        )
      ) as token
      where token <> ''
        and char_length(token) >= 4
    ),
    '{}'::text[]
  );
$$;


ALTER FUNCTION "public"."normalize_announcement_similarity_words"("p_value" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."normalize_user_document"("p_document" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO 'public'
    AS $$
  select nullif(regexp_replace(coalesce(p_document, ''), '\D', '', 'g'), '');
$$;


ALTER FUNCTION "public"."normalize_user_document"("p_document" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_critical_security_event"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  -- Se evento é crítico, notificar via PostgreSQL NOTIFY
  IF NEW.severity IN ('critical', 'blocked') THEN
    PERFORM pg_notify(
      'critical_security_alert',
      json_build_object(
        'event_id', NEW.id,
        'user_id', NEW.user_id,
        'email', NEW.email,
        'route', NEW.attempted_route,
        'ip', NEW.ip_address,
        'severity', NEW.severity,
        'timestamp', NEW.created_at
      )::text
    );
  END IF;
  
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."notify_critical_security_event"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_partner_store_paused_due_to_plan"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if new.is_paused_due_to_plan = true
     and coalesce(old.is_paused_due_to_plan, false) = false then
    insert into public.notifications (
      user_id,
      type,
      title,
      content,
      link
    )
    values (
      new.user_id,
      'plan_alert',
      'Sua Loja Parceira foi pausada',
      'Seu plano com recurso de loja expirou. A página pública e o selo premium foram pausados, mas todos os dados da sua loja continuam salvos para reativação após a renovação.',
      '/minha-conta/minha-loja'
    );
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."notify_partner_store_paused_due_to_plan"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."parse_publication_rule_patterns"("p_value" "text") RETURNS "text"[]
    LANGUAGE "sql" IMMUTABLE
    AS $$
  select coalesce(
    array_agg(distinct lower(trim(token))) filter (where trim(token) <> ''),
    array[]::text[]
  )
  from regexp_split_to_table(coalesce(p_value, ''), E'[\\n,;]+') as token;
$$;


ALTER FUNCTION "public"."parse_publication_rule_patterns"("p_value" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prevent_start_plan_reuse"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_start_consumed_at timestamptz;
begin
  if not public.is_start_signup_plan(new.plan_id) then
    return new;
  end if;

  -- Atualizacoes da propria assinatura Start continuam permitidas
  -- para expiracao, auditoria e manutencao. O bloqueio e somente para
  -- criar uma nova assinatura Start ou trocar outro plano para Start.
  if tg_op = 'UPDATE' and old.plan_id = new.plan_id then
    return new;
  end if;

  select u.start_plan_consumed_at
    into v_start_consumed_at
  from public.users u
  where u.id = new.user_id;

  if v_start_consumed_at is not null then
    raise exception 'Plano Start disponivel apenas uma vez por usuario.'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."prevent_start_plan_reuse"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."queue_contact_form_email_job"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_status text := 'pending';
  v_last_error text := null;
begin
  if coalesce(trim(new.recipient_email), '') = '' then
    v_status := 'skipped';
    v_last_error := 'Destinatario do formulario sem e-mail configurado';
  end if;

  insert into public.contact_form_email_jobs (
    contact_message_id,
    recipient_email,
    status,
    last_error
  )
  values (
    new.id,
    new.recipient_email,
    v_status,
    v_last_error
  )
  on conflict (contact_message_id) do update
    set recipient_email = excluded.recipient_email,
        status = excluded.status,
        last_error = excluded.last_error;

  return new;
end;
$$;


ALTER FUNCTION "public"."queue_contact_form_email_job"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."queue_contact_lead_email_job"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_recipient_email text;
  v_recipient_name text;
  v_announcement_title text;
  v_status text := 'pending';
  v_last_error text := null;
begin
  select a.title
  into v_announcement_title
  from public.announcements a
  where a.id = new.announcement_id;

  select
    u.email,
    coalesce(nullif(trim(u.name), ''), split_part(coalesce(u.email, ''), '@', 1), 'Vendedor')
  into
    v_recipient_email,
    v_recipient_name
  from public.users u
  where u.id = new.seller_id;

  if coalesce(trim(v_recipient_email), '') = '' then
    v_status := 'skipped';
    v_last_error := 'Vendedor sem e-mail valido';
  elsif coalesce(trim(v_announcement_title), '') = '' then
    v_status := 'skipped';
    v_last_error := 'Anuncio nao encontrado para composicao do e-mail';
  end if;

  insert into public.contact_notification_email_jobs (
    source_kind,
    lead_id,
    recipient_user_id,
    recipient_email,
    recipient_name,
    sender_name,
    announcement_title,
    message_preview,
    link,
    status,
    last_error
  )
  values (
    'new_lead',
    new.id,
    new.seller_id,
    v_recipient_email,
    v_recipient_name,
    coalesce(nullif(trim(new.buyer_name), ''), split_part(coalesce(new.buyer_email, ''), '@', 1), 'Comprador'),
    v_announcement_title,
    left(new.initial_message, 160),
    '/minha-conta/leads?lead=' || new.id::text,
    v_status,
    v_last_error
  )
  on conflict do nothing;

  return new;
end;
$$;


ALTER FUNCTION "public"."queue_contact_lead_email_job"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."queue_contact_message_email_job"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_recipient_user_id uuid;
  v_recipient_email text;
  v_recipient_name text;
  v_sender_name text;
  v_announcement_title text;
  v_link text;
  v_status text := 'pending';
  v_last_error text := null;
  v_message_count integer := 0;
  v_has_lead boolean := false;
begin
  select
    case
      when new.sender_id = c.buyer_id then c.seller_id
      else c.buyer_id
    end,
    a.title,
    '/minha-conta/mensagens?chat=' || c.id::text
  into
    v_recipient_user_id,
    v_announcement_title,
    v_link
  from public.chats c
  left join public.announcements a on a.id = c.announcement_id
  where c.id = new.chat_id;

  select count(*)
  into v_message_count
  from public.messages m
  where m.chat_id = new.chat_id;

  select exists (
    select 1
    from public.leads l
    where l.chat_id = new.chat_id
  )
  into v_has_lead;

  select
    coalesce(nullif(trim(u.name), ''), split_part(coalesce(u.email, ''), '@', 1), 'Usuario')
  into v_sender_name
  from public.users u
  where u.id = new.sender_id;

  select
    u.email,
    coalesce(nullif(trim(u.name), ''), split_part(coalesce(u.email, ''), '@', 1), 'Cliente')
  into
    v_recipient_email,
    v_recipient_name
  from public.users u
  where u.id = v_recipient_user_id;

  if v_message_count = 1 and v_has_lead then
    v_status := 'skipped';
    v_last_error := 'Primeira mensagem coberta pelo e-mail de lead';
  elsif v_recipient_user_id is null then
    v_status := 'skipped';
    v_last_error := 'Destinatario nao encontrado para a mensagem';
  elsif coalesce(trim(v_recipient_email), '') = '' then
    v_status := 'skipped';
    v_last_error := 'Destinatario sem e-mail valido';
  end if;

  insert into public.contact_notification_email_jobs (
    source_kind,
    message_id,
    recipient_user_id,
    recipient_email,
    recipient_name,
    sender_name,
    announcement_title,
    message_preview,
    link,
    status,
    last_error
  )
  values (
    'new_message',
    new.id,
    coalesce(v_recipient_user_id, new.sender_id),
    v_recipient_email,
    v_recipient_name,
    v_sender_name,
    v_announcement_title,
    left(new.content, 160),
    v_link,
    v_status,
    v_last_error
  )
  on conflict do nothing;

  return new;
end;
$$;


ALTER FUNCTION "public"."queue_contact_message_email_job"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."queue_plan_alert_email_job"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_email text;
  v_name text;
  v_kind text;
  v_status text := 'pending';
  v_last_error text := null;
begin
  if coalesce(new.type, '') <> 'plan_alert' then
    return new;
  end if;

  if new.title like 'Oportunidade AGRO BW:%' then
    v_kind := 'conversion';
  elsif new.title like 'Renovacao AGRO BW:%' then
    v_kind := 'renewal';
  else
    return new;
  end if;

  select
    u.email,
    coalesce(nullif(trim(u.name), ''), split_part(coalesce(u.email, ''), '@', 1), 'Cliente')
  into
    v_email,
    v_name
  from public.users u
  where u.id = new.user_id;

  if coalesce(trim(v_email), '') = '' then
    v_status := 'skipped';
    v_last_error := 'Usuario sem e-mail valido';
  end if;

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
    new.id,
    new.user_id,
    v_email,
    v_name,
    v_kind,
    new.title,
    new.content,
    new.link,
    v_status,
    v_last_error
  )
  on conflict (notification_id) do nothing;

  return new;
end;
$$;


ALTER FUNCTION "public"."queue_plan_alert_email_job"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."queue_radar_match_email_job"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_email text;
  v_name text;
  v_announcement_title text;
  v_alert_name text;
  v_status text := 'pending';
  v_last_error text := null;
begin
  select
    u.email,
    coalesce(nullif(trim(u.name), ''), split_part(coalesce(u.email, ''), '@', 1), 'Cliente')
  into
    v_email,
    v_name
  from public.users u
  where u.id = new.user_id;

  select a.title
  into v_announcement_title
  from public.announcements a
  where a.id = new.announcement_id;

  select oa.name
  into v_alert_name
  from public.opportunity_alerts oa
  where oa.id = new.alert_id;

  if new.is_dismissed or new.is_viewed then
    v_status := 'skipped';
    v_last_error := 'Match ja visualizado ou dispensado';
  elsif coalesce(trim(v_email), '') = '' then
    v_status := 'skipped';
    v_last_error := 'Usuario sem e-mail valido';
  elsif coalesce(trim(v_announcement_title), '') = '' then
    v_status := 'skipped';
    v_last_error := 'Anuncio nao encontrado para composicao do e-mail';
  end if;

  insert into public.radar_match_email_jobs (
    match_id,
    user_id,
    announcement_id,
    recipient_email,
    recipient_name,
    announcement_title,
    alert_name,
    status,
    last_error
  )
  values (
    new.id,
    new.user_id,
    new.announcement_id,
    v_email,
    v_name,
    v_announcement_title,
    v_alert_name,
    v_status,
    v_last_error
  )
  on conflict (match_id) do nothing;

  return new;
end;
$$;


ALTER FUNCTION "public"."queue_radar_match_email_job"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reactivate_expired_announcement"("p_announcement_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  current_user_id uuid := auth.uid();
  target_announcement record;
  active_subscription record;
  current_active_ads integer := 0;
begin
  if current_user_id is null then
    return jsonb_build_object('success', false, 'error', 'Usuario nao autenticado');
  end if;

  select *
    into target_announcement
  from public.announcements
  where id = p_announcement_id
    and user_id = current_user_id
  limit 1;

  if not found then
    return jsonb_build_object('success', false, 'error', 'Anuncio nao encontrado');
  end if;

  if target_announcement.status <> 'EXPIRED' then
    return jsonb_build_object('success', false, 'error', 'Apenas anuncios vencidos podem ser reativados');
  end if;

  select
    us.*,
    p.max_ads,
    p.name as plan_name
    into active_subscription
  from public.user_subscriptions us
  join public.plans p on p.id = us.plan_id
  where us.user_id = current_user_id
    and us.status = 'active'
    and us.current_period_end >= now()
  order by us.current_period_end desc
  limit 1;

  if not found then
    return jsonb_build_object('success', false, 'error', 'Nao existe assinatura ativa para reativar este anuncio');
  end if;

  select count(*)
    into current_active_ads
  from public.announcements a
  where a.user_id = current_user_id
    and a.status in ('ACTIVE', 'active')
    and (a.expires_at is null or a.expires_at > now());

  if active_subscription.max_ads is not null and current_active_ads >= active_subscription.max_ads then
    return jsonb_build_object(
      'success', false,
      'error', 'Nao ha espaco disponivel no seu plano atual para reativar este anuncio. Desative outro anuncio ativo ou faca upgrade para liberar mais vagas.'
    );
  end if;

  update public.announcements
  set
    status = 'ACTIVE',
    updated_at = now(),
    expires_at = public.calculate_announcement_expires_at(current_user_id, now()),
    expired_at = null,
    deletion_scheduled_at = null,
    pre_expiration_notified_at = null,
    expiration_notified_at = null,
    highlight_category = false,
    highlight_category_until = null,
    highlight_home = false,
    highlight_home_until = null
  where id = p_announcement_id;

  insert into public.notifications (user_id, type, title, content, link)
  values (
    current_user_id,
    'SYSTEM',
    'Anuncio reativado',
    'Seu anuncio voltou a ficar ativo com sucesso e agora ocupa uma vaga do seu plano atual.',
    '/#/minha-conta/anuncios'
  );

  return jsonb_build_object('success', true, 'message', 'Anuncio reativado com sucesso');
end;
$$;


ALTER FUNCTION "public"."reactivate_expired_announcement"("p_announcement_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_my_contact_legal_consents"("p_user_agent" "text" DEFAULT NULL::"text", "p_metadata" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_user_id uuid := auth.uid();
  v_headers jsonb := coalesce(nullif(current_setting('request.headers', true), ''), '{}')::jsonb;
  v_forwarded_for text;
  v_real_ip text;
  v_ip_text text;
  v_ip inet;
  v_terms_snapshot record;
  v_privacy_snapshot record;
begin
  if v_user_id is null then
    raise exception 'Usuario autenticado obrigatorio para registrar consentimentos de contato.';
  end if;

  v_forwarded_for := nullif(split_part(coalesce(v_headers ->> 'x-forwarded-for', ''), ',', 1), '');
  v_real_ip := nullif(v_headers ->> 'x-real-ip', '');
  v_ip_text := coalesce(v_forwarded_for, v_real_ip);

  if v_ip_text is not null then
    begin
      v_ip := trim(v_ip_text)::inet;
    exception
      when others then
        v_ip := null;
    end;
  end if;

  select *
    into v_terms_snapshot
  from public.resolve_legal_document_snapshot('terms_of_use');

  insert into public.user_legal_consents (
    user_id,
    consent_type,
    document_version,
    document_title,
    document_url,
    accepted_at,
    source,
    user_agent,
    ip_address,
    metadata
  ) values (
    v_user_id,
    'terms_of_use',
    v_terms_snapshot.document_version,
    v_terms_snapshot.document_title,
    v_terms_snapshot.document_url,
    now(),
    'contact_modal',
    p_user_agent,
    v_ip,
    coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object('captured_from', 'contact_modal')
  )
  on conflict do nothing;

  select *
    into v_privacy_snapshot
  from public.resolve_legal_document_snapshot('privacy_policy');

  insert into public.user_legal_consents (
    user_id,
    consent_type,
    document_version,
    document_title,
    document_url,
    accepted_at,
    source,
    user_agent,
    ip_address,
    metadata
  ) values (
    v_user_id,
    'privacy_policy',
    v_privacy_snapshot.document_version,
    v_privacy_snapshot.document_title,
    v_privacy_snapshot.document_url,
    now(),
    'contact_modal',
    p_user_agent,
    v_ip,
    coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object('captured_from', 'contact_modal')
  )
  on conflict do nothing;
end;
$$;


ALTER FUNCTION "public"."record_my_contact_legal_consents"("p_user_agent" "text", "p_metadata" "jsonb") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."record_my_contact_legal_consents"("p_user_agent" "text", "p_metadata" "jsonb") IS 'Registra, com IP e user-agent derivados da requisicao, o aceite de Termos e Privacidade ao iniciar contato com vendedor.';



CREATE OR REPLACE FUNCTION "public"."record_site_page_view"("p_session_id" "text", "p_user_id" "uuid" DEFAULT NULL::"uuid", "p_page_path" "text" DEFAULT '/'::"text", "p_page_type" "text" DEFAULT 'page'::"text", "p_page_label" "text" DEFAULT NULL::"text", "p_entity_id" "uuid" DEFAULT NULL::"uuid", "p_entity_key" "text" DEFAULT NULL::"text", "p_referrer" "text" DEFAULT NULL::"text", "p_user_agent" "text" DEFAULT NULL::"text", "p_device_type" "text" DEFAULT NULL::"text", "p_is_admin_area" boolean DEFAULT false) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if coalesce(trim(p_session_id), '') = '' then
    return;
  end if;

  insert into public.site_page_views (
    session_id,
    user_id,
    page_path,
    page_type,
    page_label,
    entity_id,
    entity_key,
    referrer,
    user_agent,
    device_type,
    is_admin_area
  )
  values (
    p_session_id,
    p_user_id,
    coalesce(nullif(trim(p_page_path), ''), '/'),
    coalesce(nullif(trim(p_page_type), ''), 'page'),
    nullif(trim(coalesce(p_page_label, '')), ''),
    p_entity_id,
    nullif(trim(coalesce(p_entity_key, '')), ''),
    nullif(trim(coalesce(p_referrer, '')), ''),
    nullif(trim(coalesce(p_user_agent, '')), ''),
    nullif(trim(coalesce(p_device_type, '')), ''),
    coalesce(p_is_admin_area, false)
  );
end;
$$;


ALTER FUNCTION "public"."record_site_page_view"("p_session_id" "text", "p_user_id" "uuid", "p_page_path" "text", "p_page_type" "text", "p_page_label" "text", "p_entity_id" "uuid", "p_entity_key" "text", "p_referrer" "text", "p_user_agent" "text", "p_device_type" "text", "p_is_admin_area" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_site_page_view"("p_session_id" "text", "p_user_id" "uuid" DEFAULT NULL::"uuid", "p_page_path" "text" DEFAULT '/'::"text", "p_page_type" "text" DEFAULT 'page'::"text", "p_page_label" "text" DEFAULT NULL::"text", "p_entity_id" "uuid" DEFAULT NULL::"uuid", "p_entity_key" "text" DEFAULT NULL::"text", "p_referrer" "text" DEFAULT NULL::"text", "p_user_agent" "text" DEFAULT NULL::"text", "p_device_type" "text" DEFAULT NULL::"text", "p_is_admin_area" boolean DEFAULT false, "p_user_city" "text" DEFAULT NULL::"text", "p_user_state" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_user_id uuid := null;
begin
  if coalesce(trim(p_session_id), '') = '' then
    return;
  end if;

  if p_user_id is not null and auth.uid() = p_user_id then
    v_user_id := p_user_id;
  end if;

  insert into public.site_page_views (
    session_id,
    user_id,
    page_path,
    page_type,
    page_label,
    entity_id,
    entity_key,
    referrer,
    user_agent,
    device_type,
    is_admin_area,
    user_city,
    user_state
  )
  values (
    left(p_session_id, 160),
    v_user_id,
    left(coalesce(nullif(trim(p_page_path), ''), '/'), 300),
    left(coalesce(nullif(trim(p_page_type), ''), 'page'), 80),
    left(nullif(trim(coalesce(p_page_label, '')), ''), 160),
    p_entity_id,
    left(nullif(trim(coalesce(p_entity_key, '')), ''), 160),
    left(nullif(trim(coalesce(p_referrer, '')), ''), 600),
    left(nullif(trim(coalesce(p_user_agent, '')), ''), 700),
    left(nullif(trim(coalesce(p_device_type, '')), ''), 60),
    coalesce(p_is_admin_area, false),
    left(nullif(trim(coalesce(p_user_city, '')), ''), 120),
    left(upper(nullif(trim(coalesce(p_user_state, '')), '')), 2)
  );
end;
$$;


ALTER FUNCTION "public"."record_site_page_view"("p_session_id" "text", "p_user_id" "uuid", "p_page_path" "text", "p_page_type" "text", "p_page_label" "text", "p_entity_id" "uuid", "p_entity_key" "text", "p_referrer" "text", "p_user_agent" "text", "p_device_type" "text", "p_is_admin_area" boolean, "p_user_city" "text", "p_user_state" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_site_sponsor_click"("p_sponsor_id" "uuid", "p_session_id" "text", "p_page_path" "text" DEFAULT '/'::"text", "p_slot_position" integer DEFAULT NULL::integer, "p_user_id" "uuid" DEFAULT NULL::"uuid", "p_user_city" "text" DEFAULT NULL::"text", "p_user_state" "text" DEFAULT NULL::"text", "p_device_type" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if p_sponsor_id is null or coalesce(trim(p_session_id), '') = '' then
    return;
  end if;

  insert into public.site_sponsor_clicks (
    sponsor_id,
    session_id,
    user_id,
    page_path,
    slot_position,
    user_city,
    user_state,
    device_type
  )
  values (
    p_sponsor_id,
    trim(p_session_id),
    p_user_id,
    coalesce(nullif(trim(coalesce(p_page_path, '')), ''), '/'),
    p_slot_position,
    nullif(trim(coalesce(p_user_city, '')), ''),
    upper(nullif(trim(coalesce(p_user_state, '')), '')),
    nullif(trim(coalesce(p_device_type, '')), '')
  );
end;
$$;


ALTER FUNCTION "public"."record_site_sponsor_click"("p_sponsor_id" "uuid", "p_session_id" "text", "p_page_path" "text", "p_slot_position" integer, "p_user_id" "uuid", "p_user_city" "text", "p_user_state" "text", "p_device_type" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_site_sponsor_click"("p_sponsor_id" "uuid", "p_session_id" "text", "p_page_path" "text" DEFAULT '/'::"text", "p_slot_position" integer DEFAULT NULL::integer, "p_user_id" "uuid" DEFAULT NULL::"uuid", "p_user_city" "text" DEFAULT NULL::"text", "p_user_state" "text" DEFAULT NULL::"text", "p_device_type" "text" DEFAULT NULL::"text", "p_placement_key" "text" DEFAULT 'legacy'::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if p_sponsor_id is null or coalesce(trim(p_session_id), '') = '' then
    return;
  end if;

  insert into public.site_sponsor_clicks (
    sponsor_id,
    placement_key,
    session_id,
    user_id,
    page_path,
    slot_position,
    user_city,
    user_state,
    device_type
  )
  values (
    p_sponsor_id,
    coalesce(nullif(trim(coalesce(p_placement_key, '')), ''), 'legacy'),
    trim(p_session_id),
    p_user_id,
    coalesce(nullif(trim(coalesce(p_page_path, '')), ''), '/'),
    p_slot_position,
    nullif(trim(coalesce(p_user_city, '')), ''),
    upper(nullif(trim(coalesce(p_user_state, '')), '')),
    nullif(trim(coalesce(p_device_type, '')), '')
  );
end;
$$;


ALTER FUNCTION "public"."record_site_sponsor_click"("p_sponsor_id" "uuid", "p_session_id" "text", "p_page_path" "text", "p_slot_position" integer, "p_user_id" "uuid", "p_user_city" "text", "p_user_state" "text", "p_device_type" "text", "p_placement_key" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_site_sponsor_impression"("p_sponsor_id" "uuid", "p_session_id" "text", "p_page_path" "text" DEFAULT '/'::"text", "p_slot_position" integer DEFAULT NULL::integer, "p_user_id" "uuid" DEFAULT NULL::"uuid", "p_user_city" "text" DEFAULT NULL::"text", "p_user_state" "text" DEFAULT NULL::"text", "p_device_type" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if p_sponsor_id is null or coalesce(trim(p_session_id), '') = '' then
    return;
  end if;

  insert into public.site_sponsor_impressions (
    sponsor_id,
    session_id,
    user_id,
    page_path,
    slot_position,
    user_city,
    user_state,
    device_type
  )
  values (
    p_sponsor_id,
    trim(p_session_id),
    p_user_id,
    coalesce(nullif(trim(coalesce(p_page_path, '')), ''), '/'),
    p_slot_position,
    nullif(trim(coalesce(p_user_city, '')), ''),
    upper(nullif(trim(coalesce(p_user_state, '')), '')),
    nullif(trim(coalesce(p_device_type, '')), '')
  )
  on conflict do nothing;
end;
$$;


ALTER FUNCTION "public"."record_site_sponsor_impression"("p_sponsor_id" "uuid", "p_session_id" "text", "p_page_path" "text", "p_slot_position" integer, "p_user_id" "uuid", "p_user_city" "text", "p_user_state" "text", "p_device_type" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_site_sponsor_impression"("p_sponsor_id" "uuid", "p_session_id" "text", "p_page_path" "text" DEFAULT '/'::"text", "p_slot_position" integer DEFAULT NULL::integer, "p_user_id" "uuid" DEFAULT NULL::"uuid", "p_user_city" "text" DEFAULT NULL::"text", "p_user_state" "text" DEFAULT NULL::"text", "p_device_type" "text" DEFAULT NULL::"text", "p_placement_key" "text" DEFAULT 'legacy'::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if p_sponsor_id is null or coalesce(trim(p_session_id), '') = '' then
    return;
  end if;

  insert into public.site_sponsor_impressions (
    sponsor_id,
    placement_key,
    session_id,
    user_id,
    page_path,
    slot_position,
    user_city,
    user_state,
    device_type
  )
  values (
    p_sponsor_id,
    coalesce(nullif(trim(coalesce(p_placement_key, '')), ''), 'legacy'),
    trim(p_session_id),
    p_user_id,
    coalesce(nullif(trim(coalesce(p_page_path, '')), ''), '/'),
    p_slot_position,
    nullif(trim(coalesce(p_user_city, '')), ''),
    upper(nullif(trim(coalesce(p_user_state, '')), '')),
    nullif(trim(coalesce(p_device_type, '')), '')
  )
  on conflict do nothing;
end;
$$;


ALTER FUNCTION "public"."record_site_sponsor_impression"("p_sponsor_id" "uuid", "p_session_id" "text", "p_page_path" "text", "p_slot_position" integer, "p_user_id" "uuid", "p_user_city" "text", "p_user_state" "text", "p_device_type" "text", "p_placement_key" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."redeem_promotion_plan_code"("p_code" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_user_id uuid := auth.uid();
  v_code text := upper(trim(coalesce(p_code, '')));
  v_code_record public.promotion_plan_codes%rowtype;
  v_plan public.plans%rowtype;
  v_user_redemptions integer := 0;
  v_current_subscription public.user_subscriptions%rowtype;
  v_subscription_id uuid;
  v_redemption_id uuid;
  v_period_start timestamptz := now();
  v_period_end timestamptz;
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if v_user_id is null then
    raise exception 'Usuario nao autenticado';
  end if;

  if v_code = '' then
    raise exception 'Informe um codigo promocional';
  end if;

  select *
    into v_code_record
  from public.promotion_plan_codes
  where upper(code) = v_code
  for update;

  if v_code_record.id is null then
    raise exception 'Codigo promocional nao encontrado';
  end if;

  if v_code_record.status <> 'active' then
    raise exception 'Codigo promocional indisponivel';
  end if;

  if v_code_record.starts_on is not null and v_today < v_code_record.starts_on then
    raise exception 'Codigo promocional ainda nao esta disponivel';
  end if;

  if v_code_record.expires_on is not null and v_today > v_code_record.expires_on then
    update public.promotion_plan_codes
    set status = 'expired'
    where id = v_code_record.id;

    raise exception 'Codigo promocional expirado';
  end if;

  if v_code_record.max_redemptions is not null
    and v_code_record.redeemed_count >= v_code_record.max_redemptions then
    raise exception 'Limite de resgates atingido';
  end if;

  select count(*)
    into v_user_redemptions
  from public.promotion_plan_redemptions
  where code_id = v_code_record.id
    and user_id = v_user_id
    and status = 'redeemed';

  if v_user_redemptions >= v_code_record.max_redemptions_per_user then
    raise exception 'Voce ja resgatou este codigo';
  end if;

  select *
    into v_plan
  from public.plans
  where id = v_code_record.plan_id
    and coalesce(is_active, true) = true;

  if v_plan.id is null then
    raise exception 'Plano promocional indisponivel';
  end if;

  select *
    into v_current_subscription
  from public.user_subscriptions
  where user_id = v_user_id
    and status = 'active'
  order by current_period_end desc nulls last, created_at desc
  limit 1
  for update;

  if v_code_record.grant_mode = 'extend_same_plan'
    and v_current_subscription.id is not null
    and v_current_subscription.plan_id = v_code_record.plan_id
    and coalesce(v_current_subscription.current_period_end, now()) > now()
  then
    v_subscription_id := v_current_subscription.id;
    v_period_start := coalesce(v_current_subscription.current_period_end, now());
  elsif v_current_subscription.id is not null then
    v_subscription_id := v_current_subscription.id;
    v_period_start := now();
  else
    update public.user_subscriptions
    set
      status = 'expired',
      current_period_end = least(coalesce(current_period_end, now()), now()),
      cancel_at_period_end = true,
      updated_at = now()
    where user_id = v_user_id
      and status = 'active';
  end if;

  if v_code_record.duration_unit = 'days' then
    v_period_end := v_period_start + make_interval(days => v_code_record.duration_amount);
  elsif v_code_record.duration_unit = 'years' then
    v_period_end := v_period_start + make_interval(years => v_code_record.duration_amount);
  else
    v_period_end := v_period_start + make_interval(months => v_code_record.duration_amount);
  end if;

  if v_subscription_id is null then
    insert into public.user_subscriptions (
      user_id,
      plan_id,
      status,
      current_period_start,
      current_period_end,
      cancel_at_period_end,
      source,
      promotion_code_id,
      created_at,
      updated_at
    )
    values (
      v_user_id,
      v_code_record.plan_id,
      'active',
      v_period_start,
      v_period_end,
      false,
      'promotion_code',
      v_code_record.id,
      now(),
      now()
    )
    returning id into v_subscription_id;
  else
    update public.user_subscriptions
    set
      plan_id = v_code_record.plan_id,
      status = 'active',
      current_period_start = v_period_start,
      current_period_end = v_period_end,
      cancel_at_period_end = false,
      source = 'promotion_code',
      promotion_code_id = v_code_record.id,
      updated_at = now()
    where id = v_subscription_id;
  end if;

  insert into public.promotion_plan_redemptions (
    code_id,
    user_id,
    plan_id,
    subscription_id,
    status,
    period_start,
    period_end,
    redeemed_at,
    metadata,
    created_at
  )
  values (
    v_code_record.id,
    v_user_id,
    v_code_record.plan_id,
    v_subscription_id,
    'redeemed',
    v_period_start,
    v_period_end,
    now(),
    jsonb_build_object(
      'grant_mode', v_code_record.grant_mode,
      'duration_amount', v_code_record.duration_amount,
      'duration_unit', v_code_record.duration_unit
    ),
    now()
  )
  returning id into v_redemption_id;

  update public.user_subscriptions
  set promotion_redemption_id = v_redemption_id
  where id = v_subscription_id;

  update public.promotion_plan_codes
  set redeemed_count = redeemed_count + 1,
      status = case
        when max_redemptions is not null and redeemed_count + 1 >= max_redemptions then 'expired'
        else status
      end,
      updated_at = now()
  where id = v_code_record.id;

  return jsonb_build_object(
    'success', true,
    'code_id', v_code_record.id,
    'subscription_id', v_subscription_id,
    'redemption_id', v_redemption_id,
    'period_start', v_period_start,
    'period_end', v_period_end,
    'plan_name', v_plan.name
  );
end;
$$;


ALTER FUNCTION "public"."redeem_promotion_plan_code"("p_code" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."refresh_announcement_report_state"("p_announcement_id" "uuid") RETURNS TABLE("report_count" integer, "threshold" integer, "sent_to_review" boolean)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."refresh_announcement_report_state"("p_announcement_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."refresh_seller_lead_contact_windows"("p_seller_id" "uuid") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_rows_updated integer := 0;
begin
  update public.leads l
  set
    unlocked_once_at = case
      when coalesce(l.received_with_active_access, false) then l.unlocked_once_at
      when l.unlocked_once_at is not null then l.unlocked_once_at
      when public.seller_has_active_plan_contact_access(l.seller_id, now()) then coalesce(l.unlocked_once_at, now())
      else l.unlocked_once_at
    end,
    contact_expires_at = case
      when coalesce(l.received_with_active_access, false) then null
      when l.unlocked_once_at is not null then null
      when public.seller_has_active_plan_contact_access(l.seller_id, now()) then null
      else coalesce(l.created_at, now()) - interval '1 second'
    end
  where l.seller_id = p_seller_id;

  get diagnostics v_rows_updated = row_count;
  return v_rows_updated;
end;
$$;


ALTER FUNCTION "public"."refresh_seller_lead_contact_windows"("p_seller_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."register_admin_login_attempt"("p_email" "text", "p_success" boolean, "p_reason" "text" DEFAULT NULL::"text", "p_user_agent" "text" DEFAULT NULL::"text") RETURNS TABLE("attempts_used" integer, "remaining_attempts" integer, "is_blocked" boolean, "blocked_until" timestamp with time zone, "time_until_unblock_seconds" integer, "should_show_captcha" boolean, "server_now" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_status record;
begin
  if v_email = '' then
    return query
    select *
    from public.get_admin_login_rate_limit_status(v_email);
    return;
  end if;

  select *
    into v_status
  from public.get_admin_login_rate_limit_status(v_email)
  limit 1;

  if coalesce(v_status.is_blocked, false) and not p_success then
    perform public.log_security_event(
      p_user_id := null,
      p_email := v_email,
      p_attempted_route := '/admin/login',
      p_attempted_action := 'admin_login_blocked',
      p_user_agent := p_user_agent,
      p_severity := 'blocked',
      p_reason := coalesce(p_reason, 'Tentativa bloqueada por excesso de falhas consecutivas.'),
      p_metadata := jsonb_build_object(
        'blocked_until', v_status.blocked_until,
        'attempts_used', v_status.attempts_used
      )
    );

    return query
    select
      v_status.attempts_used,
      v_status.remaining_attempts,
      v_status.is_blocked,
      v_status.blocked_until,
      v_status.time_until_unblock_seconds,
      v_status.should_show_captcha,
      v_status.server_now;
    return;
  end if;

  perform public.log_security_event(
    p_user_id := null,
    p_email := v_email,
    p_attempted_route := '/admin/login',
    p_attempted_action := case when p_success then 'admin_login_success' else 'admin_login_failed' end,
    p_user_agent := p_user_agent,
    p_severity := case when p_success then 'info' else 'warning' end,
    p_reason := p_reason,
    p_metadata := jsonb_build_object(
      'email', v_email,
      'success', p_success
    )
  );

  return query
  select *
  from public.get_admin_login_rate_limit_status(v_email);
end;
$$;


ALTER FUNCTION "public"."register_admin_login_attempt"("p_email" "text", "p_success" boolean, "p_reason" "text", "p_user_agent" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."register_announcement_similarity_cooldown"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  should_register boolean := false;
  reference_row public.announcements%rowtype;
begin
  if tg_op = 'DELETE' then
    reference_row := old;
    should_register := coalesce(old.status, '') in ('ACTIVE', 'active', 'PAUSED', 'paused', 'EXPIRED', 'expired');
  elsif tg_op = 'UPDATE' then
    reference_row := old;
    should_register :=
      coalesce(old.status, '') in ('ACTIVE', 'active')
      and coalesce(new.status, '') not in ('ACTIVE', 'active');
  end if;

  if not should_register then
    return coalesce(new, old);
  end if;

  insert into public.announcement_similarity_cooldowns (
    user_id,
    announcement_id,
    title_normalized,
    category_id,
    city,
    state,
    price,
    source_status,
    cooldown_until
  )
  values (
    reference_row.user_id,
    reference_row.id,
    public.normalize_announcement_similarity_text(reference_row.title),
    reference_row.category_id,
    lower(coalesce(reference_row.city, '')),
    upper(coalesce(reference_row.state, '')),
    round(coalesce(reference_row.price, 0)::numeric, 2),
    coalesce(reference_row.status, 'unknown'),
    now() + interval '72 hours'
  );

  return coalesce(new, old);
end;
$$;


ALTER FUNCTION "public"."register_announcement_similarity_cooldown"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."register_click_by_state"("p_announcement_id" "uuid", "p_state" character varying) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  -- Validar estado (sigla de 2 letras)
  IF p_state IS NULL OR LENGTH(p_state) != 2 THEN
    RAISE EXCEPTION 'Estado inválido: deve ter exatamente 2 caracteres';
  END IF;

  -- Inserir novo registro ou incrementar count se já existir
  INSERT INTO announcement_clicks_by_state (
    announcement_id, 
    state, 
    count
  )
  VALUES (
    p_announcement_id, 
    UPPER(p_state), -- Garantir uppercase
    1
  )
  ON CONFLICT (announcement_id, state)
  DO UPDATE SET 
    count = announcement_clicks_by_state.count + 1;
END;
$$;


ALTER FUNCTION "public"."register_click_by_state"("p_announcement_id" "uuid", "p_state" character varying) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."register_click_by_state"("p_announcement_id" "uuid", "p_state" character varying) IS 'Registra ou incrementa o contador de cliques de um anúncio para um estado específico. Permite rastreamento anônimo para analytics.';



CREATE OR REPLACE FUNCTION "public"."register_highlight_booster_purchase"("p_user_id" "uuid", "p_booster_id" "uuid", "p_payment_id" "uuid" DEFAULT NULL::"uuid", "p_provider_payment_id" "text" DEFAULT NULL::"text", "p_amount" numeric DEFAULT 0) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_recent_purchases_count integer := 0;
  v_booster record;
  v_purchase_id uuid;
begin
  select *
  into v_booster
  from public.highlight_boosters
  where id = p_booster_id
    and is_active = true
  limit 1;

  if v_booster is null then
    return jsonb_build_object(
      'success', false,
      'error', 'Booster nao encontrado ou inativo'
    );
  end if;

  select count(*)
  into v_recent_purchases_count
  from public.user_highlight_booster_purchases
  where user_id = p_user_id
    and booster_id = p_booster_id
    and status = 'credited'
    and created_at >= (now() - interval '30 days');

  if v_recent_purchases_count >= coalesce(v_booster.max_purchases_per_30_days, 2) then
    return jsonb_build_object(
      'success', false,
      'error', format('Limite de %s booster(s) a cada 30 dias atingido.', coalesce(v_booster.max_purchases_per_30_days, 2))
    );
  end if;

  insert into public.user_highlight_booster_purchases (
    user_id,
    booster_id,
    payment_id,
    provider_payment_id,
    status,
    booster_name,
    amount,
    category_credits_total,
    category_credits_remaining,
    home_credits_total,
    home_credits_remaining
  ) values (
    p_user_id,
    p_booster_id,
    p_payment_id,
    p_provider_payment_id,
    'credited',
    v_booster.name,
    coalesce(p_amount, v_booster.monthly_price, 0),
    coalesce(v_booster.category_credits, 0),
    coalesce(v_booster.category_credits, 0),
    coalesce(v_booster.home_credits, 0),
    coalesce(v_booster.home_credits, 0)
  )
  returning id into v_purchase_id;

  return jsonb_build_object(
    'success', true,
    'purchase_id', v_purchase_id,
    'booster_name', v_booster.name,
    'category_credits', coalesce(v_booster.category_credits, 0),
    'home_credits', coalesce(v_booster.home_credits, 0)
  );
end;
$$;


ALTER FUNCTION "public"."register_highlight_booster_purchase"("p_user_id" "uuid", "p_booster_id" "uuid", "p_payment_id" "uuid", "p_provider_payment_id" "text", "p_amount" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."register_invite_visit"("p_code" "text", "p_session_id" "text", "p_landing_path" "text" DEFAULT '/cadastro'::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_campaign_id uuid;
  v_visit_id uuid;
begin
  if nullif(trim(coalesce(p_code, '')), '') is null or nullif(trim(coalesce(p_session_id, '')), '') is null then
    return null;
  end if;

  select ic.id
    into v_campaign_id
  from public.invite_campaigns ic
  where ic.status = 'active'
    and ic.code = upper(trim(p_code))
  limit 1;

  if v_campaign_id is null then
    return null;
  end if;

  insert into public.invite_visits (
    invite_campaign_id,
    session_id,
    landing_path
  ) values (
    v_campaign_id,
    trim(p_session_id),
    coalesce(nullif(trim(p_landing_path), ''), '/cadastro')
  )
  on conflict (invite_campaign_id, session_id)
  do update set
    landing_path = excluded.landing_path,
    updated_at = now()
  returning id into v_visit_id;

  return v_visit_id;
end;
$$;


ALTER FUNCTION "public"."register_invite_visit"("p_code" "text", "p_session_id" "text", "p_landing_path" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."replace_template_placeholders"("p_template" "text", "p_values" "jsonb") RETURNS "text"
    LANGUAGE "plpgsql" IMMUTABLE
    AS $$
declare
  v_result text := coalesce(p_template, '');
  v_key text;
  v_value text;
begin
  if p_values is null then
    return v_result;
  end if;

  for v_key, v_value in
    select key, value
    from jsonb_each_text(p_values)
  loop
    v_result := replace(v_result, '{' || v_key || '}', coalesce(v_value, ''));
  end loop;

  return v_result;
end;
$$;


ALTER FUNCTION "public"."replace_template_placeholders"("p_template" "text", "p_values" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reset_unread_count"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  IF NEW.is_read = true AND OLD.is_read = false THEN
    UPDATE chats
    SET 
      unread_count_buyer = CASE 
        WHEN NEW.sender_id != chats.buyer_id AND auth.uid() = chats.buyer_id THEN GREATEST(unread_count_buyer - 1, 0)
        ELSE unread_count_buyer
      END,
      unread_count_seller = CASE 
        WHEN NEW.sender_id != chats.seller_id AND auth.uid() = chats.seller_id THEN GREATEST(unread_count_seller - 1, 0)
        ELSE unread_count_seller
      END
    WHERE id = NEW.chat_id;
  END IF;
  
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."reset_unread_count"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."resolve_lead_contact_limit_days"("p_period_start" timestamp with time zone, "p_period_end" timestamp with time zone, "p_monthly_limit" integer, "p_yearly_limit" integer, "p_legacy_limit" integer DEFAULT NULL::integer) RETURNS integer
    LANGUAGE "plpgsql" IMMUTABLE
    AS $$
declare
  v_total_days numeric;
begin
  if p_period_start is null or p_period_end is null then
    return coalesce(p_monthly_limit, p_yearly_limit, p_legacy_limit);
  end if;

  v_total_days := extract(epoch from (p_period_end - p_period_start)) / 86400.0;

  if v_total_days > 45 then
    return coalesce(p_yearly_limit, p_legacy_limit, p_monthly_limit);
  end if;

  return coalesce(p_monthly_limit, p_legacy_limit, p_yearly_limit);
end;
$$;


ALTER FUNCTION "public"."resolve_lead_contact_limit_days"("p_period_start" timestamp with time zone, "p_period_end" timestamp with time zone, "p_monthly_limit" integer, "p_yearly_limit" integer, "p_legacy_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."resolve_lead_contact_limit_days"("p_period_start" timestamp with time zone, "p_period_end" timestamp with time zone, "p_monthly_limit" integer, "p_yearly_limit" integer, "p_legacy_limit" integer DEFAULT NULL::integer, "p_is_promotion" boolean DEFAULT false) RETURNS integer
    LANGUAGE "plpgsql" IMMUTABLE
    AS $$
declare
  v_total_days numeric;
  v_monthly_limit integer;
begin
  if p_period_start is null or p_period_end is null then
    return coalesce(p_monthly_limit, p_yearly_limit, p_legacy_limit);
  end if;

  v_total_days := extract(epoch from (p_period_end - p_period_start)) / 86400.0;

  if p_is_promotion then
    v_monthly_limit := coalesce(p_monthly_limit, p_legacy_limit, p_yearly_limit);

    if v_monthly_limit is null then
      return null;
    end if;

    return least(
      ceil(v_total_days)::integer,
      greatest(v_monthly_limit, ceil(v_monthly_limit * (v_total_days / 30.0))::integer)
    );
  end if;

  if v_total_days > 45 then
    return coalesce(p_yearly_limit, p_legacy_limit, p_monthly_limit);
  end if;

  return coalesce(p_monthly_limit, p_legacy_limit, p_yearly_limit);
end;
$$;


ALTER FUNCTION "public"."resolve_lead_contact_limit_days"("p_period_start" timestamp with time zone, "p_period_end" timestamp with time zone, "p_monthly_limit" integer, "p_yearly_limit" integer, "p_legacy_limit" integer, "p_is_promotion" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."resolve_legal_document_snapshot"("p_consent_type" "text") RETURNS TABLE("document_version" "text", "document_title" "text", "document_url" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_terms_updated_at timestamptz;
  v_privacy_updated_at timestamptz;
begin
  if p_consent_type = 'terms_of_use' then
    select updated_at
      into v_terms_updated_at
    from public.terms_page_content
    limit 1;

    return query
    select
      'terms-of-use:' || coalesce(to_char(v_terms_updated_at at time zone 'UTC', 'YYYYMMDDHH24MISS'), 'initial'),
      'Termos de Uso'::text,
      '/termos-de-uso'::text;
    return;
  end if;

  if p_consent_type = 'privacy_policy' then
    select updated_at
      into v_privacy_updated_at
    from public.privacy_page_content
    limit 1;

    return query
    select
      'privacy-policy:' || coalesce(to_char(v_privacy_updated_at at time zone 'UTC', 'YYYYMMDDHH24MISS'), 'initial'),
      'Política de Privacidade'::text,
      '/privacidade'::text;
    return;
  end if;

  raise exception 'Consent type nao suportado para snapshot juridico: %', p_consent_type;
end;
$$;


ALTER FUNCTION "public"."resolve_legal_document_snapshot"("p_consent_type" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."resolve_plan_validity_days"("p_billing_cycle" "text", "p_monthly_days" integer, "p_yearly_days" integer) RETURNS integer
    LANGUAGE "sql" IMMUTABLE
    AS $$
  select case
    when lower(coalesce(p_billing_cycle, 'monthly')) = 'yearly' then coalesce(p_yearly_days, 365)
    else coalesce(p_monthly_days, 30)
  end;
$$;


ALTER FUNCTION "public"."resolve_plan_validity_days"("p_billing_cycle" "text", "p_monthly_days" integer, "p_yearly_days" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."resolve_public_invite_campaign"("p_code" "text") RETURNS TABLE("id" "uuid", "code" "text", "captor_name" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  return query
  select ic.id, ic.code, ic.captor_name
  from public.invite_campaigns ic
  where ic.status = 'active'
    and ic.code = upper(trim(coalesce(p_code, '')))
  limit 1;
end;
$$;


ALTER FUNCTION "public"."resolve_public_invite_campaign"("p_code" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."respond_to_commercial_intelligence_outreach"("p_delivery_id" "uuid", "p_buyer_note" "text" DEFAULT NULL::"text") RETURNS TABLE("response_id" "uuid", "seller_notification_id" "uuid")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_user_id uuid := auth.uid();
  v_campaign_id uuid;
  v_seller_user_id uuid;
  v_category_slug text;
  v_subcategory_slug text;
  v_response_id uuid;
  v_notification_id uuid;
  v_buyer_name text;
begin
  if v_user_id is null then
    raise exception 'Usuario nao autenticado';
  end if;

  select
    deliveries.campaign_id,
    campaigns.seller_user_id,
    campaigns.category_slug,
    campaigns.subcategory_slug
  into
    v_campaign_id,
    v_seller_user_id,
    v_category_slug,
    v_subcategory_slug
  from public.commercial_intelligence_outreach_deliveries deliveries
  join public.commercial_intelligence_outreach_campaigns campaigns on campaigns.id = deliveries.campaign_id
  where deliveries.id = p_delivery_id
    and deliveries.recipient_user_id = v_user_id
  limit 1;

  if v_campaign_id is null then
    raise exception 'Oportunidade mediada nao encontrada para este usuario.';
  end if;

  if exists (
    select 1
    from public.commercial_intelligence_interest_responses responses
    where responses.delivery_id = p_delivery_id
  ) then
    raise exception 'Esta oportunidade ja recebeu uma resposta de interesse.';
  end if;

  select coalesce(nullif(name, ''), 'Comprador interessado')
  into v_buyer_name
  from public.users
  where id = v_user_id;

  insert into public.commercial_intelligence_interest_responses (
    delivery_id,
    campaign_id,
    seller_user_id,
    buyer_user_id,
    buyer_note
  )
  values (
    p_delivery_id,
    v_campaign_id,
    v_seller_user_id,
    v_user_id,
    nullif(trim(coalesce(p_buyer_note, '')), '')
  )
  returning id into v_response_id;

  insert into public.notifications (
    user_id,
    type,
    title,
    content,
    link
  )
  values (
    v_seller_user_id,
    'SYSTEM',
    'Novo interesse confirmado na Inteligencia Comercial',
    format(
      '%s confirmou interesse em uma abordagem mediada para %s%s. A resposta foi registrada na AGRO BW para acompanhamento seguro.',
      split_part(v_buyer_name, ' ', 1),
      v_category_slug,
      case
        when coalesce(trim(v_subcategory_slug), '') = '' then ''
        else ' / ' || v_subcategory_slug
      end
    ),
    '/minha-conta/inteligencia-comercial'
  )
  returning id into v_notification_id;

  return query
  select v_response_id, v_notification_id;
end;
$$;


ALTER FUNCTION "public"."respond_to_commercial_intelligence_outreach"("p_delivery_id" "uuid", "p_buyer_note" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."scheduled_highlights_cleanup"() RETURNS TABLE("home_highlights_cleaned" integer, "category_highlights_cleaned" integer, "total_cleaned" integer)
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  home_count INTEGER;
  category_count INTEGER;
BEGIN
  -- Contar e limpar highlight_home expirados
  WITH cleaned_home AS (
    UPDATE announcements
    SET highlight_home = false
    WHERE highlight_home = true
      AND highlight_home_until IS NOT NULL
      AND highlight_home_until < NOW()
    RETURNING id
  )
  SELECT COUNT(*) INTO home_count FROM cleaned_home;

  -- Contar e limpar highlight_category expirados
  WITH cleaned_category AS (
    UPDATE announcements
    SET highlight_category = false
    WHERE highlight_category = true
      AND highlight_category_until IS NOT NULL
      AND highlight_category_until < NOW()
    RETURNING id
  )
  SELECT COUNT(*) INTO category_count FROM cleaned_category;

  -- Retornar estatísticas
  home_highlights_cleaned := home_count;
  category_highlights_cleaned := category_count;
  total_cleaned := home_count + category_count;

  RAISE NOTICE 'Limpeza executada: % destaques home, % destaques categoria, % total', 
    home_count, category_count, (home_count + category_count);

  RETURN NEXT;
END;
$$;


ALTER FUNCTION "public"."scheduled_highlights_cleanup"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."scheduled_highlights_cleanup"() IS 'Função para execução periódica (cron) que limpa destaques expirados e retorna estatísticas de quantos foram limpos.';


SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."announcements" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "title" "text" NOT NULL,
    "description" "text" NOT NULL,
    "price" numeric(12,2) NOT NULL,
    "city" "text" NOT NULL,
    "state" "text" NOT NULL,
    "cep" "text",
    "category_id" "uuid" NOT NULL,
    "images" "text"[] DEFAULT '{}'::"text"[],
    "user_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'PENDING'::"text" NOT NULL,
    "views" integer DEFAULT 0,
    "is_premium" boolean DEFAULT false,
    "whatsapp" "text",
    "health_score" integer,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "expires_at" timestamp with time zone,
    "sold_at" timestamp with time zone,
    "category_slug" "text",
    "sub_category_id" "text",
    "quantity" numeric DEFAULT 1,
    "unit" "text" DEFAULT 'Unidade'::"text",
    "unit_price" numeric DEFAULT 0,
    "currency" "text" DEFAULT 'BRL'::"text",
    "sub_category_label" "text",
    "highlight_category" boolean DEFAULT false NOT NULL,
    "highlight_category_until" timestamp with time zone,
    "highlight_home" boolean DEFAULT false NOT NULL,
    "highlight_home_until" timestamp with time zone,
    "latitude" numeric(10,8),
    "longitude" numeric(11,8),
    "geo_updated_at" timestamp with time zone,
    "expired_at" timestamp with time zone,
    "deletion_scheduled_at" timestamp with time zone,
    "pre_expiration_notified_at" timestamp with time zone,
    "expiration_notified_at" timestamp with time zone,
    "category_group_id" "uuid",
    "product_condition" "text",
    "availability" "text",
    "accepts_trade" boolean DEFAULT false NOT NULL,
    "has_warranty" boolean DEFAULT false NOT NULL,
    "warranty_details" "text",
    "has_invoice" boolean DEFAULT false NOT NULL,
    "video_url" "text",
    "video_storage_path" "text",
    "video_duration_seconds" integer,
    "video_size_bytes" bigint,
    "store_display_order" integer,
    "publication_review_reasons" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "publication_review_severity" "text",
    "publication_review_checked_at" timestamp with time zone,
    "community_reports_count" integer DEFAULT 0 NOT NULL,
    "community_reported_to_review_at" timestamp with time zone,
    "community_last_reported_at" timestamp with time zone,
    "community_report_reasons" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "publication_review_admin_override" boolean DEFAULT false NOT NULL,
    "price_negotiable" boolean DEFAULT false NOT NULL,
    "rejection_reason" "text",
    "rejected_at" timestamp with time zone,
    "reanalysis_available_at" timestamp with time zone,
    "video_thumbnail_url" "text",
    "video_thumbnail_storage_path" "text",
    CONSTRAINT "announcements_availability_check" CHECK ((("availability" IS NULL) OR ("availability" = ANY (ARRAY['pronta_entrega'::"text", 'sob_encomenda'::"text", 'consultar_estoque'::"text"])))),
    CONSTRAINT "announcements_health_score_check" CHECK ((("health_score" >= 0) AND ("health_score" <= 100))),
    CONSTRAINT "announcements_product_condition_check" CHECK ((("product_condition" IS NULL) OR ("product_condition" = ANY (ARRAY['novo'::"text", 'seminovo'::"text", 'usado'::"text"])))),
    CONSTRAINT "announcements_status_check" CHECK (("status" = ANY (ARRAY['DRAFT'::"text", 'PENDING'::"text", 'UNDER_REVIEW'::"text", 'ACTIVE'::"text", 'PAUSED'::"text", 'EXPIRED'::"text", 'REJECTED'::"text"])))
);


ALTER TABLE "public"."announcements" OWNER TO "postgres";


COMMENT ON TABLE "public"."announcements" IS 'Tabela de anúncios do marketplace. Renomeada de "ads" para evitar bloqueios de AdBlock.';



COMMENT ON COLUMN "public"."announcements"."latitude" IS 'Latitude obtida do CEP do anúncio';



COMMENT ON COLUMN "public"."announcements"."longitude" IS 'Longitude obtida do CEP do anúncio';



COMMENT ON COLUMN "public"."announcements"."geo_updated_at" IS 'Última atualização das coordenadas geográficas';



COMMENT ON COLUMN "public"."announcements"."category_group_id" IS 'Grupo principal do anuncio, preenchido a partir da categoria atual para suportar filtros e migracao futura.';



COMMENT ON COLUMN "public"."announcements"."video_url" IS 'URL publica do video otimizado do anuncio.';



COMMENT ON COLUMN "public"."announcements"."video_storage_path" IS 'Caminho interno no storage para remocao/substituicao do video do anuncio.';



COMMENT ON COLUMN "public"."announcements"."video_duration_seconds" IS 'Duracao do video do anuncio em segundos.';



COMMENT ON COLUMN "public"."announcements"."video_size_bytes" IS 'Tamanho final do video otimizado em bytes.';



COMMENT ON COLUMN "public"."announcements"."video_thumbnail_url" IS 'URL publica da capa automatica gerada a partir do video do anuncio.';



COMMENT ON COLUMN "public"."announcements"."video_thumbnail_storage_path" IS 'Caminho interno no storage da capa automatica gerada para o video do anuncio.';



CREATE OR REPLACE FUNCTION "public"."search_ads"("search_query" "text" DEFAULT NULL::"text", "category_slug_filter" "text" DEFAULT NULL::"text", "min_price" numeric DEFAULT NULL::numeric, "max_price" numeric DEFAULT NULL::numeric, "state_filter" "text" DEFAULT NULL::"text", "status_filter" "text" DEFAULT 'ACTIVE'::"text") RETURNS SETOF "public"."announcements"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  RETURN QUERY
  SELECT a.* FROM ads a
  LEFT JOIN categories c ON a.category_id = c.id
  WHERE 
    (status_filter IS NULL OR a.status = status_filter)
    AND (search_query IS NULL OR a.title ILIKE '%' || search_query || '%' OR a.description ILIKE '%' || search_query || '%')
    AND (category_slug_filter IS NULL OR c.slug = category_slug_filter)
    AND (min_price IS NULL OR a.price >= min_price)
    AND (max_price IS NULL OR a.price <= max_price)
    AND (state_filter IS NULL OR a.state = state_filter)
  ORDER BY a.created_at DESC;
END;
$$;


ALTER FUNCTION "public"."search_ads"("search_query" "text", "category_slug_filter" "text", "min_price" numeric, "max_price" numeric, "state_filter" "text", "status_filter" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."seller_has_active_plan_contact_access"("p_seller_id" "uuid", "p_reference" timestamp with time zone DEFAULT "now"()) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_effective_is_downgrade boolean := true;
  v_effective_exists boolean := false;
begin
  select
    true,
    coalesce(p.is_downgrade_plan, false)
  into v_effective_exists, v_effective_is_downgrade
  from public.user_subscriptions us
  join public.plans p on p.id = us.plan_id
  where us.user_id = p_seller_id
    and us.status = 'active'
    and p_reference >= us.current_period_start
    and p_reference <= us.current_period_end
    and coalesce(p.is_active, true) = true
  order by
    coalesce(us.current_period_start, us.created_at, now()) desc,
    coalesce(us.created_at, us.current_period_end, now()) desc
  limit 1;

  if not v_effective_exists then
    return false;
  end if;

  if v_effective_is_downgrade then
    return false;
  end if;

  return true;
end;
$$;


ALTER FUNCTION "public"."seller_has_active_plan_contact_access"("p_seller_id" "uuid", "p_reference" timestamp with time zone) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."seller_has_active_plan_contact_access"("p_seller_id" "uuid", "p_reference" timestamp with time zone) IS 'Retorna true apenas quando a assinatura efetiva no momento for um plano ativo elegivel para liberar novos contatos. O plano Basico de downgrade nunca libera novos contatos, independentemente da duracao do ciclo.';



CREATE OR REPLACE FUNCTION "public"."send_commercial_intelligence_conversation_message"("p_conversation_id" "uuid", "p_message" "text") RETURNS TABLE("message_id" "uuid")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_user_id uuid := auth.uid();
  v_message_id uuid;
  v_recipient_user_id uuid;
  v_status text;
begin
  if v_user_id is null then
    raise exception 'Usuario nao autenticado';
  end if;

  if char_length(trim(coalesce(p_message, ''))) < 1 then
    raise exception 'Escreva uma mensagem para enviar.';
  end if;

  select
    conversations.status,
    case
      when conversations.seller_user_id = v_user_id then conversations.buyer_user_id
      when conversations.buyer_user_id = v_user_id then conversations.seller_user_id
      else null
    end
  into
    v_status,
    v_recipient_user_id
  from public.commercial_intelligence_conversations conversations
  where conversations.id = p_conversation_id
  limit 1;

  if v_recipient_user_id is null then
    raise exception 'Conversa mediada nao encontrada para este usuario.';
  end if;

  if v_status <> 'open' then
    raise exception 'Esta conversa mediada esta encerrada.';
  end if;

  insert into public.commercial_intelligence_conversation_messages (
    conversation_id,
    sender_user_id,
    content
  )
  values (
    p_conversation_id,
    v_user_id,
    trim(p_message)
  )
  returning id into v_message_id;

  update public.commercial_intelligence_conversations
  set updated_at = now()
  where id = p_conversation_id;

  insert into public.notifications (
    user_id,
    type,
    title,
    content,
    link
  )
  values (
    v_recipient_user_id,
    'SYSTEM',
    'Nova mensagem na conversa mediada',
    'Ha uma nova mensagem na sua conversa mediada de Inteligencia Comercial. Abra a AGRO BW para continuar o atendimento com seguranca.',
    '/minha-conta/inteligencia-comercial'
  );

  return query
  select v_message_id;
end;
$$;


ALTER FUNCTION "public"."send_commercial_intelligence_conversation_message"("p_conversation_id" "uuid", "p_message" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."send_email_notification"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  seller_email TEXT;
  seller_name TEXT;
  buyer_name TEXT;
  announcement_title TEXT;
  announcement_price NUMERIC;
  announcement_id UUID;
BEGIN
  -- Buscar dados do vendedor
  SELECT email, name INTO seller_email, seller_name
  FROM users
  WHERE id = NEW.seller_id;
  
  -- Buscar dados do comprador
  SELECT name INTO buyer_name
  FROM users
  WHERE id = NEW.buyer_id;
  
  -- Buscar dados do anúncio
  SELECT title, price, id INTO announcement_title, announcement_price, announcement_id
  FROM announcements
  WHERE id = NEW.announcement_id;
  
  -- Chamar Edge Function via HTTP (Supabase fará isso automaticamente)
  -- A Edge Function será invocada pelo trigger create_lead_notification
  -- que já existe em create_chat_triggers.sql
  
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."send_email_notification"() OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."plans" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "monthly_price" numeric(10,2) DEFAULT 0 NOT NULL,
    "yearly_price" numeric(10,2) DEFAULT 0 NOT NULL,
    "features" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "display_features" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "is_popular" boolean DEFAULT false NOT NULL,
    "button_text" "text" DEFAULT 'Escolher Plano'::"text" NOT NULL,
    "comparison" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "max_ads" integer,
    "ad_duration_days" integer,
    "lead_contact_limit_days" integer,
    "category_highlights_count" integer DEFAULT 0,
    "category_highlight_days" integer,
    "home_highlight_count" integer DEFAULT 0,
    "home_highlight_days" integer,
    "has_verification_badge" boolean DEFAULT false NOT NULL,
    "has_seller_store" boolean DEFAULT false NOT NULL,
    "has_email_marketing" boolean DEFAULT false NOT NULL,
    "social_campaigns_per_month" integer,
    "notes" "text",
    "position" integer DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "radar_max_alerts" integer DEFAULT 0,
    "radar_has_radius" boolean DEFAULT false,
    "radar_has_keywords" boolean DEFAULT false,
    "radar_has_price_filter" boolean DEFAULT false,
    "card_eyebrow" "text" DEFAULT 'Plano BWAGRO'::"text" NOT NULL,
    "price_caption" "text",
    "footer_caption" "text",
    "expired_deletion_days" integer DEFAULT 90,
    "lead_contact_limit_days_monthly" integer,
    "lead_contact_limit_days_yearly" integer,
    "show_footer_card" boolean DEFAULT true NOT NULL,
    "plan_validity_days_monthly" integer,
    "plan_validity_days_yearly" integer,
    "show_in_public_pricing" boolean DEFAULT true NOT NULL,
    "is_default_signup_plan" boolean DEFAULT false NOT NULL,
    "is_downgrade_plan" boolean DEFAULT false NOT NULL,
    "has_commercial_intelligence" boolean DEFAULT false NOT NULL,
    "commercial_intelligence_requests_per_month" integer DEFAULT 0 NOT NULL,
    "billing_model" "text" DEFAULT 'one_time'::"text" NOT NULL,
    CONSTRAINT "plans_billing_model_check" CHECK (("billing_model" = ANY (ARRAY['one_time'::"text", 'recurring'::"text"])))
);


ALTER TABLE "public"."plans" OWNER TO "postgres";


COMMENT ON COLUMN "public"."plans"."lead_contact_limit_days" IS 'LEGADO: mantido apenas por compatibilidade. A vigencia do plano e a referencia operacional para novos contatos.';



COMMENT ON COLUMN "public"."plans"."radar_max_alerts" IS 'Número máximo de alertas do Radar de Oportunidades (0 = sem acesso, 999 = ilimitado)';



COMMENT ON COLUMN "public"."plans"."radar_has_radius" IS 'Permite filtro por raio geográfico (km)';



COMMENT ON COLUMN "public"."plans"."radar_has_keywords" IS 'Permite filtro por palavras-chave';



COMMENT ON COLUMN "public"."plans"."radar_has_price_filter" IS 'Permite filtro por faixa de preço';



COMMENT ON COLUMN "public"."plans"."card_eyebrow" IS 'Texto pequeno acima do nome do plano no card da tela de planos';



COMMENT ON COLUMN "public"."plans"."price_caption" IS 'Texto exibido dentro da caixa escura de preco do card do plano';



COMMENT ON COLUMN "public"."plans"."footer_caption" IS 'Frase de destaque exibida no rodape do card do plano';



COMMENT ON COLUMN "public"."plans"."expired_deletion_days" IS 'Quantidade de dias que um anuncio vencido permanece disponivel para republicacao antes da exclusao automatica.';



COMMENT ON COLUMN "public"."plans"."lead_contact_limit_days_monthly" IS 'LEGADO: sincronizado com plan_validity_days_monthly para compatibilidade.';



COMMENT ON COLUMN "public"."plans"."lead_contact_limit_days_yearly" IS 'LEGADO: sincronizado com plan_validity_days_yearly para compatibilidade.';



CREATE OR REPLACE FUNCTION "public"."set_default_signup_plan"("p_plan_id" "uuid") RETURNS "public"."plans"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_plan public.plans%rowtype;
begin
  if p_plan_id is null then
    raise exception 'Plano padrao do cadastro nao informado.';
  end if;

  select *
    into v_plan
  from public.plans
  where id = p_plan_id;

  if v_plan.id is null then
    raise exception 'Plano selecionado nao foi encontrado.';
  end if;

  if coalesce(v_plan.is_downgrade_plan, false) then
    raise exception 'O plano padrao do cadastro nao pode ser o plano de downgrade.';
  end if;

  if not coalesce(v_plan.is_active, true) then
    raise exception 'O plano padrao do cadastro precisa permanecer ativo.';
  end if;

  perform set_config('app.allow_default_signup_switch', 'on', true);

  update public.plans
  set is_default_signup_plan = false
  where id <> p_plan_id
    and is_default_signup_plan = true;

  update public.plans
  set is_default_signup_plan = true
  where id = p_plan_id;

  select *
    into v_plan
  from public.plans
  where id = p_plan_id;

  return v_plan;
end;
$$;


ALTER FUNCTION "public"."set_default_signup_plan"("p_plan_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_first_ad_timestamp"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  -- Verificar se é o primeiro anúncio do usuário na nova tabela
  IF NOT EXISTS (SELECT 1 FROM public.announcements WHERE user_id = NEW.user_id AND id != NEW.id) THEN
    UPDATE public.users 
    SET first_ad_at = NOW() 
    WHERE id = NEW.user_id AND first_ad_at IS NULL;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_first_ad_timestamp"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."set_first_ad_timestamp"() IS 'Marca automaticamente a data do primeiro anúncio do usuário (início da jornada como vendedor)';



CREATE OR REPLACE FUNCTION "public"."set_highlight_settings_updated_by"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;


ALTER FUNCTION "public"."set_highlight_settings_updated_by"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_market_quote_sources_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."set_market_quote_sources_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_market_quotes_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."set_market_quotes_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_support_settings_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."set_support_settings_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_support_ticket_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."set_support_ticket_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at_plans"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."set_updated_at_plans"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at_user_subscriptions"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."set_updated_at_user_subscriptions"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."site_analytics_is_admin"() RETURNS boolean
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.users u
    where u.id = auth.uid()
      and (coalesce(u.is_admin, false) = true or lower(coalesce(u.role, '')) = 'admin')
      and coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
  );
$$;


ALTER FUNCTION "public"."site_analytics_is_admin"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."site_analytics_is_admin"() IS 'Permite acesso ao analytics administrativo somente para sessoes admin com MFA em AAL2.';



CREATE OR REPLACE FUNCTION "public"."slugify"("input" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    AS $$
  select trim(both '-' from regexp_replace(lower(unaccent(input)), '[^a-z0-9]+', '-', 'g'));
$$;


ALTER FUNCTION "public"."slugify"("input" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."start_commercial_intelligence_conversation"("p_response_id" "uuid", "p_initial_message" "text") RETURNS TABLE("conversation_id" "uuid", "message_id" "uuid")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_user_id uuid := auth.uid();
  v_conversation_id uuid;
  v_message_id uuid;
  v_buyer_user_id uuid;
  v_campaign_id uuid;
begin
  if v_user_id is null then
    raise exception 'Usuario nao autenticado';
  end if;

  if char_length(trim(coalesce(p_initial_message, ''))) < 10 then
    raise exception 'Escreva uma mensagem inicial com pelo menos 10 caracteres.';
  end if;

  select
    responses.buyer_user_id,
    responses.campaign_id
  into
    v_buyer_user_id,
    v_campaign_id
  from public.commercial_intelligence_interest_responses responses
  where responses.id = p_response_id
    and responses.seller_user_id = v_user_id
  limit 1;

  if v_buyer_user_id is null then
    raise exception 'Resposta de interesse nao encontrada para esta loja.';
  end if;

  if exists (
    select 1
    from public.commercial_intelligence_conversations conversations
    where conversations.response_id = p_response_id
  ) then
    raise exception 'Esta resposta ja possui uma conversa mediada em andamento.';
  end if;

  insert into public.commercial_intelligence_conversations (
    response_id,
    campaign_id,
    seller_user_id,
    buyer_user_id
  )
  values (
    p_response_id,
    v_campaign_id,
    v_user_id,
    v_buyer_user_id
  )
  returning id into v_conversation_id;

  insert into public.commercial_intelligence_conversation_messages (
    conversation_id,
    sender_user_id,
    content
  )
  values (
    v_conversation_id,
    v_user_id,
    trim(p_initial_message)
  )
  returning id into v_message_id;

  update public.commercial_intelligence_conversations
  set updated_at = now()
  where id = v_conversation_id;

  insert into public.notifications (
    user_id,
    type,
    title,
    content,
    link
  )
  values (
    v_buyer_user_id,
    'SYSTEM',
    'Loja iniciou uma conversa mediada com voce',
    'Uma loja parceira abriu um canal seguro de conversa na Inteligencia Comercial. Voce pode responder dentro da AGRO BW sem compartilhar seus contatos diretos.',
    '/minha-conta/inteligencia-comercial'
  );

  return query
  select v_conversation_id, v_message_id;
end;
$$;


ALTER FUNCTION "public"."start_commercial_intelligence_conversation"("p_response_id" "uuid", "p_initial_message" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."strip_community_report_review_reasons"("p_reasons" "jsonb") RETURNS "jsonb"
    LANGUAGE "sql" IMMUTABLE
    AS $$
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


ALTER FUNCTION "public"."strip_community_report_review_reasons"("p_reasons" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."submit_announcement_report"("p_announcement_id" "uuid", "p_reason" "text", "p_details" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."submit_announcement_report"("p_announcement_id" "uuid", "p_reason" "text", "p_details" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."submit_contact_message"("p_name" "text", "p_email" "text", "p_phone" "text" DEFAULT NULL::"text", "p_subject" "text" DEFAULT NULL::"text", "p_message" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_id uuid;
  v_recipient_email text;
  v_requester_user_id uuid := auth.uid();
begin
  if coalesce(nullif(trim(p_name), ''), '') = '' then
    raise exception 'Informe seu nome.';
  end if;

  if coalesce(nullif(trim(p_email), ''), '') = '' then
    raise exception 'Informe seu e-mail.';
  end if;

  if position('@' in trim(p_email)) = 0 then
    raise exception 'Informe um e-mail valido.';
  end if;

  if coalesce(nullif(trim(p_message), ''), '') = '' then
    raise exception 'Informe sua mensagem.';
  end if;

  select c.form_recipient_email
  into v_recipient_email
  from public.contact_page_content c
  where c.id = '00000000-0000-0000-0000-000000000004';

  insert into public.contact_messages (
    requester_user_id,
    name,
    email,
    phone,
    subject,
    message,
    recipient_email
  )
  values (
    v_requester_user_id,
    trim(p_name),
    trim(lower(p_email)),
    nullif(trim(coalesce(p_phone, '')), ''),
    nullif(trim(coalesce(p_subject, '')), ''),
    trim(p_message),
    nullif(trim(coalesce(v_recipient_email, '')), '')
  )
  returning id into v_id;

  return v_id;
end;
$$;


ALTER FUNCTION "public"."submit_contact_message"("p_name" "text", "p_email" "text", "p_phone" "text", "p_subject" "text", "p_message" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."submit_contact_message"("p_name" "text", "p_email" "text", "p_phone" "text", "p_subject" "text", "p_message" "text") IS 'Recebe uma mensagem publica da pagina Fale Conosco e registra na caixa de entrada administrativa.';



CREATE OR REPLACE FUNCTION "public"."subscribe_newsletter"("p_email" "text", "p_source" "text" DEFAULT 'footer'::"text") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
declare
  v_email text;
  v_normalized_email text;
begin
  v_email := trim(coalesce(p_email, ''));

  if v_email = '' then
    raise exception 'E-mail obrigatório';
  end if;

  if length(v_email) > 254 then
    raise exception 'E-mail inválido';
  end if;

  if v_email !~* '^[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}$' then
    raise exception 'E-mail inválido';
  end if;

  v_normalized_email := lower(v_email);

  insert into public.newsletter_subscriptions (
    email,
    normalized_email,
    source,
    status
  )
  values (
    v_email,
    v_normalized_email,
    coalesce(nullif(trim(p_source), ''), 'footer'),
    'active'
  )
  on conflict (normalized_email) do nothing;

  if found then
    return 'created';
  end if;

  update public.newsletter_subscriptions
  set
    email = v_email,
    source = coalesce(nullif(trim(p_source), ''), 'footer'),
    status = 'active',
    updated_at = now()
  where normalized_email = v_normalized_email;

  return 'existing';
end;
$_$;


ALTER FUNCTION "public"."subscribe_newsletter"("p_email" "text", "p_source" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_announcement_expires_at"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if upper(coalesce(new.status, '')) = 'ACTIVE' then
    if tg_op = 'INSERT'
       or upper(coalesce(old.status, '')) <> 'ACTIVE'
       or new.expires_at is null then
      new.expires_at := public.calculate_announcement_expires_at(
        new.user_id,
        coalesce(new.created_at, now())
      );
    end if;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."sync_announcement_expires_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_category_group_id_from_category"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_group_id UUID;
BEGIN
  IF NEW.category_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT cgc.group_id
  INTO v_group_id
  FROM public.category_group_categories cgc
  WHERE cgc.category_id = NEW.category_id
  LIMIT 1;

  IF v_group_id IS NOT NULL THEN
    NEW.category_group_id := v_group_id;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."sync_category_group_id_from_category"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."sync_category_group_id_from_category"() IS 'Mantem category_group_id sincronizado a partir da category_id em anuncios e alertas.';



CREATE OR REPLACE FUNCTION "public"."sync_lead_chat_status"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  UPDATE chats SET status = NEW.status WHERE id = NEW.chat_id;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."sync_lead_chat_status"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_lead_contact_expires_at"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if new.created_at is null then
    new.created_at := now();
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


ALTER FUNCTION "public"."sync_lead_contact_expires_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_lead_windows_after_subscription_change"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if new.user_id is not null then
    perform public.refresh_seller_lead_contact_windows(new.user_id);
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."sync_lead_windows_after_subscription_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_payments_invoice_issued_on"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  if tg_op = 'INSERT' then
    if new.invoice_issued_at is not null then
      new.invoice_issued_on := (new.invoice_issued_at at time zone 'America/Sao_Paulo')::date;
    elsif new.invoice_issued_on is not null then
      new.invoice_issued_at := (new.invoice_issued_on::timestamp at time zone 'America/Sao_Paulo');
    else
      new.invoice_issued_at := null;
      new.invoice_issued_on := null;
    end if;
  elsif new.invoice_issued_at is distinct from old.invoice_issued_at then
    new.invoice_issued_on := case
      when new.invoice_issued_at is null then null
      else (new.invoice_issued_at at time zone 'America/Sao_Paulo')::date
    end;
  elsif new.invoice_issued_on is distinct from old.invoice_issued_on then
    new.invoice_issued_at := case
      when new.invoice_issued_on is null then null
      else (new.invoice_issued_on::timestamp at time zone 'America/Sao_Paulo')
    end;
  elsif new.invoice_issued_at is not null then
    new.invoice_issued_on := (new.invoice_issued_at at time zone 'America/Sao_Paulo')::date;
  elsif new.invoice_issued_on is not null then
    new.invoice_issued_at := (new.invoice_issued_on::timestamp at time zone 'America/Sao_Paulo');
  else
    new.invoice_issued_at := null;
    new.invoice_issued_on := null;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."sync_payments_invoice_issued_on"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_seller_store_feature_status"("p_user_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_has_store_feature boolean := false;
begin
  if p_user_id is null then
    return;
  end if;

  select exists (
    select 1
    from public.user_subscriptions us
    join public.plans p on p.id = us.plan_id
    where us.user_id = p_user_id
      and us.status = 'active'
      and us.current_period_end > now()
      and coalesce(p.has_seller_store, false) = true
  ) into v_has_store_feature;

  update public.seller_stores
  set
    is_store_feature_enabled = v_has_store_feature,
    is_paused_due_to_plan = not v_has_store_feature,
    updated_at = timezone('utc'::text, now())
  where user_id = p_user_id;
end;
$$;


ALTER FUNCTION "public"."sync_seller_store_feature_status"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_support_ticket_last_message_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  update public.support_tickets
  set
    last_message_at = new.created_at,
    updated_at = now()
  where id = new.ticket_id;

  return new;
end;
$$;


ALTER FUNCTION "public"."sync_support_ticket_last_message_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_user_document_normalized"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  new.document_normalized := public.normalize_user_document(new.document);
  return new;
end;
$$;


ALTER FUNCTION "public"."sync_user_document_normalized"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."touch_announcement_edit_requests_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;


ALTER FUNCTION "public"."touch_announcement_edit_requests_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."touch_announcement_reports_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  new.updated_at := now();
  return new;
end;
$$;


ALTER FUNCTION "public"."touch_announcement_reports_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."touch_category_ranking_settings_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."touch_category_ranking_settings_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."touch_commercial_intelligence_contact_shares_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."touch_commercial_intelligence_contact_shares_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."touch_commercial_intelligence_conversations_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."touch_commercial_intelligence_conversations_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."touch_commercial_intelligence_interest_responses_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."touch_commercial_intelligence_interest_responses_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."touch_commercial_intelligence_outreach_campaigns_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."touch_commercial_intelligence_outreach_campaigns_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."touch_commercial_lead_preferences_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."touch_commercial_lead_preferences_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."touch_contact_form_email_jobs_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."touch_contact_form_email_jobs_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."touch_contact_messages_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."touch_contact_messages_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."touch_contact_notification_email_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."touch_contact_notification_email_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."touch_invite_campaigns_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at := now();

  if new.code is null or btrim(new.code) = '' then
    new.code := public.generate_invite_campaign_code(new.captor_name);
  else
    new.code := upper(trim(new.code));
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."touch_invite_campaigns_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."touch_invite_visits_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at := now();
  return new;
end;
$$;


ALTER FUNCTION "public"."touch_invite_visits_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."touch_plan_alert_email_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."touch_plan_alert_email_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."touch_promotion_plan_codes_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  new.code = upper(trim(new.code));
  return new;
end;
$$;


ALTER FUNCTION "public"."touch_promotion_plan_codes_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."touch_publication_moderation_rules_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."touch_publication_moderation_rules_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."touch_radar_match_email_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."touch_radar_match_email_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."touch_site_presence"("p_session_id" "text", "p_user_id" "uuid" DEFAULT NULL::"uuid", "p_current_path" "text" DEFAULT '/'::"text", "p_page_type" "text" DEFAULT 'page'::"text", "p_page_label" "text" DEFAULT NULL::"text", "p_device_type" "text" DEFAULT NULL::"text", "p_is_admin_area" boolean DEFAULT false) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if coalesce(trim(p_session_id), '') = '' then
    return;
  end if;

  insert into public.site_presence (
    session_id,
    user_id,
    current_path,
    page_type,
    page_label,
    device_type,
    is_admin_area,
    last_seen_at
  )
  values (
    p_session_id,
    p_user_id,
    coalesce(nullif(trim(p_current_path), ''), '/'),
    coalesce(nullif(trim(p_page_type), ''), 'page'),
    nullif(trim(coalesce(p_page_label, '')), ''),
    nullif(trim(coalesce(p_device_type, '')), ''),
    coalesce(p_is_admin_area, false),
    now()
  )
  on conflict (session_id) do update
    set user_id = excluded.user_id,
        current_path = excluded.current_path,
        page_type = excluded.page_type,
        page_label = excluded.page_label,
        device_type = excluded.device_type,
        is_admin_area = excluded.is_admin_area,
        last_seen_at = now();
end;
$$;


ALTER FUNCTION "public"."touch_site_presence"("p_session_id" "text", "p_user_id" "uuid", "p_current_path" "text", "p_page_type" "text", "p_page_label" "text", "p_device_type" "text", "p_is_admin_area" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."touch_site_presence"("p_session_id" "text", "p_user_id" "uuid" DEFAULT NULL::"uuid", "p_current_path" "text" DEFAULT '/'::"text", "p_page_type" "text" DEFAULT 'page'::"text", "p_page_label" "text" DEFAULT NULL::"text", "p_device_type" "text" DEFAULT NULL::"text", "p_is_admin_area" boolean DEFAULT false, "p_user_city" "text" DEFAULT NULL::"text", "p_user_state" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_user_id uuid := null;
begin
  if coalesce(trim(p_session_id), '') = '' then
    return;
  end if;

  if p_user_id is not null and auth.uid() = p_user_id then
    v_user_id := p_user_id;
  end if;

  insert into public.site_presence (
    session_id,
    user_id,
    current_path,
    page_type,
    page_label,
    device_type,
    is_admin_area,
    user_city,
    user_state,
    last_seen_at
  )
  values (
    left(p_session_id, 160),
    v_user_id,
    left(coalesce(nullif(trim(p_current_path), ''), '/'), 300),
    left(coalesce(nullif(trim(p_page_type), ''), 'page'), 80),
    left(nullif(trim(coalesce(p_page_label, '')), ''), 160),
    left(nullif(trim(coalesce(p_device_type, '')), ''), 60),
    coalesce(p_is_admin_area, false),
    left(nullif(trim(coalesce(p_user_city, '')), ''), 120),
    left(upper(nullif(trim(coalesce(p_user_state, '')), '')), 2),
    now()
  )
  on conflict (session_id) do update
    set user_id = excluded.user_id,
        current_path = excluded.current_path,
        page_type = excluded.page_type,
        page_label = excluded.page_label,
        device_type = excluded.device_type,
        is_admin_area = excluded.is_admin_area,
        user_city = excluded.user_city,
        user_state = excluded.user_state,
        last_seen_at = now();
end;
$$;


ALTER FUNCTION "public"."touch_site_presence"("p_session_id" "text", "p_user_id" "uuid", "p_current_path" "text", "p_page_type" "text", "p_page_label" "text", "p_device_type" "text", "p_is_admin_area" boolean, "p_user_city" "text", "p_user_state" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."touch_site_presence_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."touch_site_presence_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."touch_site_sponsors_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;


ALTER FUNCTION "public"."touch_site_sponsors_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."touch_smtp_settings_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."touch_smtp_settings_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."touch_sponsor_interest_leads_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;


ALTER FUNCTION "public"."touch_sponsor_interest_leads_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."touch_sponsor_metrics_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;


ALTER FUNCTION "public"."touch_sponsor_metrics_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."touch_sponsor_testimonials_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;


ALTER FUNCTION "public"."touch_sponsor_testimonials_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."touch_subscription_change_requests_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at := now();
  return new;
end;
$$;


ALTER FUNCTION "public"."touch_subscription_change_requests_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."touch_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."touch_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trigger_create_subscription_history"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  -- Adicionar entrada no histórico
  PERFORM add_subscription_history_entry(
    p_user_id := NEW.user_id,
    p_subscription_id := NEW.id,
    p_plan_id := NEW.plan_id,
    p_event_type := CASE 
      WHEN NEW.status = 'trialing' THEN 'trial_started'
      ELSE 'created'
    END,
    p_status := NEW.status,
    p_period_start := NEW.current_period_start,
    p_period_end := NEW.current_period_end
  );

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."trigger_create_subscription_history"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trigger_match_existing_announcements_to_alert"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NEW.status = 'ativo' THEN
    PERFORM public.match_existing_announcements_to_alert(NEW.id);
  ELSE
    DELETE FROM public.opportunity_matches
    WHERE alert_id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."trigger_match_existing_announcements_to_alert"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trigger_radar_matcher"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
declare
  function_url text;
  payload jsonb;
  has_pg_net boolean := to_regnamespace('net') is not null;
  has_sql_matcher boolean := to_regprocedure('public.match_announcements_to_alerts(uuid)') is not null;
begin
  if new.status = 'ACTIVE' then
    function_url := current_setting('app.settings.edge_function_url', true) || '/radar-matcher';
    payload := jsonb_build_object('announcement_id', new.id);

    if has_pg_net and function_url is not null and function_url <> '' then
      perform net.http_post(
        url := function_url,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
        ),
        body := payload
      );
    elsif has_sql_matcher then
      perform public.match_announcements_to_alerts(new.id);
    end if;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."trigger_radar_matcher"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trigger_radar_matcher_price_drop"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
declare
  price_reduction_pct decimal;
  function_url text;
  payload jsonb;
  has_pg_net boolean := to_regnamespace('net') is not null;
  has_sql_matcher boolean := to_regprocedure('public.match_announcements_to_alerts(uuid)') is not null;
begin
  if old.price > 0 and new.price > 0 then
    price_reduction_pct := ((old.price - new.price) / old.price) * 100;

    if price_reduction_pct >= 20 then
      function_url := current_setting('app.settings.edge_function_url', true) || '/radar-matcher';
      payload := jsonb_build_object('announcement_id', new.id, 'event', 'price_drop');

      if has_pg_net and function_url is not null and function_url <> '' then
        perform net.http_post(
          url := function_url,
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
          ),
          body := payload
        );
      elsif has_sql_matcher then
        perform public.match_announcements_to_alerts(new.id);
      end if;
    end if;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."trigger_radar_matcher_price_drop"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trigger_radar_matcher_sql"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF NEW.status = 'ACTIVE' THEN
    PERFORM match_announcements_to_alerts(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."trigger_radar_matcher_sql"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trigger_update_subscription_history"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_event_type TEXT;
  v_cancellation_reason TEXT;
BEGIN
  -- Determinar tipo de evento
  IF OLD.status = 'trialing' AND NEW.status = 'active' THEN
    v_event_type := 'trial_converted';
  ELSIF OLD.plan_id != NEW.plan_id THEN
    -- Verificar se é upgrade ou downgrade
    DECLARE
      v_old_price NUMERIC(10,2);
      v_new_price NUMERIC(10,2);
    BEGIN
      SELECT monthly_price INTO v_old_price FROM plans WHERE id = OLD.plan_id;
      SELECT monthly_price INTO v_new_price FROM plans WHERE id = NEW.plan_id;
      
      v_event_type := CASE 
        WHEN v_new_price > v_old_price THEN 'upgraded'
        ELSE 'downgraded'
      END;
    END;
  ELSIF NEW.status = 'canceled' THEN
    v_event_type := 'canceled';
    v_cancellation_reason := 'Cancelado pelo usuário';
  ELSIF NEW.status = 'expired' THEN
    v_event_type := 'expired';
  ELSE
    v_event_type := 'renewed';
  END IF;

  -- Adicionar entrada no histórico
  PERFORM add_subscription_history_entry(
    p_user_id := NEW.user_id,
    p_subscription_id := NEW.id,
    p_plan_id := NEW.plan_id,
    p_event_type := v_event_type,
    p_status := NEW.status,
    p_period_start := NEW.current_period_start,
    p_period_end := NEW.current_period_end,
    p_previous_plan_id := CASE WHEN OLD.plan_id != NEW.plan_id THEN OLD.plan_id ELSE NULL END,
    p_cancellation_reason := v_cancellation_reason
  );

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."trigger_update_subscription_history"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_category_count"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE categories SET count = count + 1 WHERE id = NEW.category_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE categories SET count = count - 1 WHERE id = OLD.category_id;
  ELSIF TG_OP = 'UPDATE' AND OLD.category_id != NEW.category_id THEN
    UPDATE categories SET count = count - 1 WHERE id = OLD.category_id;
    UPDATE categories SET count = count + 1 WHERE id = NEW.category_id;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_category_count"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_chat_last_message"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  UPDATE chats
  SET 
    last_message = NEW.content,
    last_message_time = NEW.created_at,
    updated_at = now(),
    unread_count_buyer = CASE 
      WHEN NEW.sender_id != chats.buyer_id THEN unread_count_buyer + 1
      ELSE unread_count_buyer
    END,
    unread_count_seller = CASE 
      WHEN NEW.sender_id != chats.seller_id THEN unread_count_seller + 1
      ELSE unread_count_seller
    END
  WHERE id = NEW.chat_id;
  
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_chat_last_message"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_opportunity_alerts_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_opportunity_alerts_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_payment_settings_admin_safe"("p_asaas_api_key" "text" DEFAULT NULL::"text", "p_asaas_webhook_token" "text" DEFAULT NULL::"text", "p_is_production" boolean DEFAULT NULL::boolean) RETURNS TABLE("id" "uuid", "asaas_api_key_configured" boolean, "asaas_webhook_token_configured" boolean, "preferred_checkout_provider" "text", "is_production" boolean, "last_updated_by" "uuid", "created_at" timestamp with time zone, "updated_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_user_id uuid := auth.uid();
begin
  if not public.is_admin() then
    raise exception 'Unauthorized';
  end if;

  update public.payment_settings ps
  set
    asaas_api_key = case
      when p_asaas_api_key is null or trim(p_asaas_api_key) = '' then ps.asaas_api_key
      else trim(p_asaas_api_key)
    end,
    asaas_webhook_token = case
      when p_asaas_webhook_token is null or trim(p_asaas_webhook_token) = '' then ps.asaas_webhook_token
      else trim(p_asaas_webhook_token)
    end,
    preferred_checkout_provider = 'asaas',
    is_production = coalesce(p_is_production, ps.is_production),
    last_updated_by = v_user_id,
    updated_at = now()
  where ps.id = '00000000-0000-0000-0000-000000000005';

  return query
  select
    ps.id,
    coalesce(nullif(trim(ps.asaas_api_key), '') is not null, false),
    coalesce(nullif(trim(ps.asaas_webhook_token), '') is not null, false),
    'asaas'::text,
    ps.is_production,
    ps.last_updated_by,
    ps.created_at,
    ps.updated_at
  from public.payment_settings ps
  where ps.id = '00000000-0000-0000-0000-000000000005';
end;
$$;


ALTER FUNCTION "public"."update_payment_settings_admin_safe"("p_asaas_api_key" "text", "p_asaas_webhook_token" "text", "p_is_production" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_payment_settings_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_payment_settings_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_stripe_rollout_overrides_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."update_stripe_rollout_overrides_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_user_subscriptions_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_user_subscriptions_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_page_slug"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $_$
BEGIN
  -- Converter para minúsculas
  NEW.slug := LOWER(NEW.slug);
  
  -- Validar formato (apenas a-z, 0-9, hífen)
  IF NEW.slug !~ '^[a-z0-9-]+$' THEN
    RAISE EXCEPTION 'Slug inválido. Use apenas letras minúsculas, números e hífens.';
  END IF;
  
  -- Não permitir slugs reservados
  IF NEW.slug IN ('admin', 'api', 'auth', 'dashboard', 'login', 'register', 'settings', 'p', 'pages') THEN
    RAISE EXCEPTION 'Este slug está reservado pelo sistema.';
  END IF;
  
  RETURN NEW;
END;
$_$;


ALTER FUNCTION "public"."validate_page_slug"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_site_sponsor_capacity"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
declare
  v_active_count integer := 0;
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if new.status = 'active'
     and new.starts_on <= v_today
     and (new.ends_on is null or new.ends_on >= v_today) then
    select count(*)
      into v_active_count
    from public.site_sponsors s
    where s.status = 'active'
      and s.starts_on <= v_today
      and (s.ends_on is null or s.ends_on >= v_today)
      and s.id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid);

    if v_active_count >= 6 then
      raise exception 'Limite de 6 patrocinadores ativos atingido.';
    end if;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."validate_site_sponsor_capacity"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_user_business_description"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  if new.business_description is not null then
    new.business_description := btrim(new.business_description);

    if public.business_description_has_contact_reference(new.business_description) then
      raise exception using
        errcode = '22023',
        message = 'A descrição do negócio não pode conter telefone, e-mail, links, redes sociais ou qualquer outra forma de contato.';
    end if;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."validate_user_business_description"() OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."about_page_content" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "stat_users_value" character varying(10) DEFAULT '10k+'::character varying,
    "stat_users_label" character varying(50) DEFAULT 'USUÁRIOS ATIVOS'::character varying,
    "stat_ads_value" character varying(10) DEFAULT '50k+'::character varying,
    "stat_ads_label" character varying(50) DEFAULT 'ANÚNCIOS CRIADOS'::character varying,
    "stat_revenue_value" character varying(20) DEFAULT '850 Mi'::character varying,
    "stat_revenue_label" character varying(50) DEFAULT 'NEGÓCIOS GERADOS'::character varying,
    "history_title" character varying(200) DEFAULT 'Nossa História'::character varying,
    "history_text" "text" NOT NULL,
    "history_image_url" "text",
    "mission_title" character varying(100) DEFAULT 'Missão'::character varying,
    "mission_text" "text" NOT NULL,
    "vision_title" character varying(100) DEFAULT 'Visão'::character varying,
    "vision_text" "text" NOT NULL,
    "values_title" character varying(100) DEFAULT 'Valores'::character varying,
    "values_text" "text" NOT NULL,
    "diff1_title" character varying(100) DEFAULT 'Tecnologia de Ponta'::character varying,
    "diff1_text" "text" NOT NULL,
    "diff2_title" character varying(100) DEFAULT 'Facilidade de Uso'::character varying,
    "diff2_text" "text" NOT NULL,
    "diff3_title" character varying(100) DEFAULT 'Suporte Especializado'::character varying,
    "diff3_text" "text" NOT NULL,
    "last_updated_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "single_row" CHECK (("id" = '00000000-0000-0000-0000-000000000001'::"uuid"))
);


ALTER TABLE "public"."about_page_content" OWNER TO "postgres";


COMMENT ON TABLE "public"."about_page_content" IS 'Conteúdo estruturado da página Quem Somos (singleton)';



COMMENT ON COLUMN "public"."about_page_content"."history_image_url" IS 'URL da imagem da seção História (opcional)';



CREATE TABLE IF NOT EXISTS "public"."admin_audit_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "admin_id" "uuid" NOT NULL,
    "admin_email" "text" NOT NULL,
    "admin_name" "text" NOT NULL,
    "action" "text" NOT NULL,
    "resource_type" "text" NOT NULL,
    "resource_id" "uuid",
    "old_value" "jsonb",
    "new_value" "jsonb",
    "reason" "text",
    "metadata" "jsonb",
    "ip_address" "inet",
    "user_agent" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."admin_audit_logs" OWNER TO "postgres";


COMMENT ON TABLE "public"."admin_audit_logs" IS 'Registro completo de todas as ações administrativas para auditoria e rastreabilidade';



CREATE TABLE IF NOT EXISTS "public"."admin_mfa_login_tickets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "token_hash" "text" NOT NULL,
    "issued_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "consumed_at" timestamp with time zone,
    "user_agent" "text",
    "ip_address" "text"
);


ALTER TABLE "public"."admin_mfa_login_tickets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."announcement_technical_details" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "announcement_id" "uuid" NOT NULL,
    "label" "text" NOT NULL,
    "value" "text" NOT NULL,
    "icon_name" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."announcement_technical_details" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."categories" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "name" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "count" integer DEFAULT 0,
    "subcategories" "text"[],
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "icon" "text",
    "technical_fields_schema" "jsonb" DEFAULT '[]'::"jsonb",
    "icon_name" "text",
    "sort_order" integer DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "parent_group_slug" "text"
);


ALTER TABLE "public"."categories" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."favorites" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "announcement_id" "uuid" NOT NULL,
    "price_at_favorite" numeric(12,2) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."favorites" OWNER TO "postgres";


COMMENT ON TABLE "public"."favorites" IS 'Tabela de favoritos dos usuários - controla quais anúncios foram salvos';



COMMENT ON COLUMN "public"."favorites"."price_at_favorite" IS 'Preço do anúncio no momento em que foi favoritado - usado para detectar oportunidades';



CREATE TABLE IF NOT EXISTS "public"."users" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "email" "text" NOT NULL,
    "name" "text" NOT NULL,
    "phone" "text",
    "role" "text" DEFAULT 'USER'::"text",
    "is_admin" boolean DEFAULT false,
    "location" "text",
    "avatar" "text",
    "plan" "text",
    "two_factor_enabled" boolean DEFAULT false,
    "credits" integer DEFAULT 0,
    "first_ad_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "birth_date" "date",
    "website" character varying(255),
    "cep" character varying(8),
    "logradouro" character varying(255),
    "numero" character varying(20),
    "complemento" character varying(255),
    "bairro" character varying(100),
    "cidade" character varying(100),
    "estado" character varying(2),
    "document" character varying(20),
    "document_path" "text",
    "document_verified" boolean DEFAULT false,
    "latitude" numeric(10,8),
    "longitude" numeric(11,8),
    "geo_updated_at" timestamp with time zone,
    "is_suspended" boolean DEFAULT false NOT NULL,
    "suspension_reason" "text",
    "suspended_at" timestamp with time zone,
    "last_login" timestamp with time zone,
    "business_description" "text",
    "document_review_status" "text" DEFAULT 'not_submitted'::"text",
    "document_review_notes" "text",
    "document_reviewed_at" timestamp with time zone,
    "document_reviewed_by" "uuid",
    "start_plan_consumed_at" timestamp with time zone,
    "document_normalized" "text",
    "document_last_attempt_at" timestamp with time zone,
    "document_retry_available_at" timestamp with time zone,
    "document_last_failure_reason" "text",
    "invite_campaign_id" "uuid",
    "invite_code" "text",
    "invite_attribution_at" timestamp with time zone,
    CONSTRAINT "check_admin_role" CHECK (((("is_admin" = true) AND ("role" = 'admin'::"text")) OR ("is_admin" = false))),
    CONSTRAINT "users_document_review_status_check" CHECK (("document_review_status" = ANY (ARRAY['not_submitted'::"text", 'pending'::"text", 'approved'::"text", 'rejected'::"text"]))),
    CONSTRAINT "users_plan_check" CHECK (("plan" = ANY (ARRAY['seed'::"text", 'boost'::"text", 'harvest'::"text"])))
);


ALTER TABLE "public"."users" OWNER TO "postgres";


COMMENT ON TABLE "public"."users" IS 'Usuários do sistema - Modelo híbrido: todos entram como USER, is_seller determinado dinamicamente por anúncios cadastrados';



COMMENT ON COLUMN "public"."users"."role" IS 'Role do usuário: user (padrão), editor (moderador), admin (administrador)';



COMMENT ON COLUMN "public"."users"."avatar" IS 'URL pública do avatar do usuário (storage: avatars/{username}/perfil.jpg)';



COMMENT ON COLUMN "public"."users"."birth_date" IS 'Data de nascimento do usuário (apenas para perfil individual)';



COMMENT ON COLUMN "public"."users"."website" IS 'Site ou URL do perfil do usuário';



COMMENT ON COLUMN "public"."users"."cep" IS 'Código de Endereçamento Postal (8 dígitos)';



COMMENT ON COLUMN "public"."users"."logradouro" IS 'Rua, avenida, praça, etc.';



COMMENT ON COLUMN "public"."users"."numero" IS 'Número do imóvel';



COMMENT ON COLUMN "public"."users"."complemento" IS 'Complemento do endereço (apto, bloco, etc.)';



COMMENT ON COLUMN "public"."users"."bairro" IS 'Bairro do imóvel';



COMMENT ON COLUMN "public"."users"."cidade" IS 'Cidade';



COMMENT ON COLUMN "public"."users"."estado" IS 'Estado (UF) - 2 caracteres';



COMMENT ON COLUMN "public"."users"."document" IS 'CPF ou CNPJ apenas com números';



COMMENT ON COLUMN "public"."users"."document_path" IS 'Caminho do documento de verificação no storage';



COMMENT ON COLUMN "public"."users"."document_verified" IS 'Status de validação do documento por OCR. TRUE = validado automaticamente, FALSE = pendente ou reprovado, NULL = não enviado';



COMMENT ON COLUMN "public"."users"."latitude" IS 'Latitude obtida do CEP do usuário';



COMMENT ON COLUMN "public"."users"."longitude" IS 'Longitude obtida do CEP do usuário';



COMMENT ON COLUMN "public"."users"."geo_updated_at" IS 'Última atualização das coordenadas geográficas';



COMMENT ON COLUMN "public"."users"."is_suspended" IS 'Indica se o usuário está suspenso (bloqueado)';



COMMENT ON COLUMN "public"."users"."suspension_reason" IS 'Motivo da suspensão do usuário';



COMMENT ON COLUMN "public"."users"."suspended_at" IS 'Data e hora em que o usuário foi suspenso';



COMMENT ON COLUMN "public"."users"."last_login" IS 'Timestamp do último login do usuário. Atualizado pelo frontend após autenticação bem-sucedida.';



COMMENT ON COLUMN "public"."users"."business_description" IS 'Descrição institucional curta do vendedor para exibição no perfil e na página do anúncio. Não pode conter telefone, e-mail, links ou redes sociais.';



COMMENT ON COLUMN "public"."users"."invite_campaign_id" IS 'Convite/campanha responsavel pela atribuicao do cadastro.';



COMMENT ON COLUMN "public"."users"."invite_code" IS 'Codigo do convite usado no momento do cadastro.';



COMMENT ON COLUMN "public"."users"."invite_attribution_at" IS 'Instante em que o cadastro foi atribuido ao convite.';



CREATE OR REPLACE VIEW "public"."ads_full" AS
 SELECT "a"."id",
    "a"."title",
    "a"."description",
    "a"."price",
    "a"."city",
    "a"."state",
    "a"."cep",
    "a"."category_id",
    "a"."images",
    "a"."user_id",
    "a"."status",
    "a"."views",
    "a"."is_premium",
    "a"."whatsapp",
    "a"."health_score",
    "a"."created_at",
    "a"."updated_at",
    "a"."expires_at",
    "a"."sold_at",
    "c"."name" AS "category_name",
    "c"."slug" AS "category_slug",
    "u"."name" AS "user_name",
    "u"."avatar" AS "user_avatar",
    "u"."phone" AS "user_phone",
    ( SELECT "count"(*) AS "count"
           FROM "public"."favorites"
          WHERE ("favorites"."announcement_id" = "a"."id")) AS "favorites_count",
    ( SELECT "json_agg"("json_build_object"('label', "announcement_technical_details"."label", 'value', "announcement_technical_details"."value", 'icon_name', "announcement_technical_details"."icon_name")) AS "json_agg"
           FROM "public"."announcement_technical_details"
          WHERE ("announcement_technical_details"."announcement_id" = "a"."id")) AS "technical_details"
   FROM (("public"."announcements" "a"
     LEFT JOIN "public"."categories" "c" ON (("a"."category_id" = "c"."id")))
     LEFT JOIN "public"."users" "u" ON (("a"."user_id" = "u"."id")));


ALTER VIEW "public"."ads_full" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."announcement_clicks_by_state" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "announcement_id" "uuid" NOT NULL,
    "state" "text" NOT NULL,
    "count" integer DEFAULT 1,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."announcement_clicks_by_state" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."announcement_edit_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "announcement_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "technical_details" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "rejection_reason" "text",
    "reviewed_at" timestamp with time zone,
    "reviewed_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "reanalysis_available_at" timestamp with time zone,
    CONSTRAINT "announcement_edit_requests_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'rejected'::"text"])))
);


ALTER TABLE "public"."announcement_edit_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."announcement_highlights_history" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "announcement_id" "uuid",
    "user_id" "uuid" NOT NULL,
    "highlight_type" "text",
    "applied_at" timestamp with time zone DEFAULT "now"(),
    "expires_at" timestamp with time zone NOT NULL,
    "subscription_period_start" timestamp with time zone NOT NULL,
    "subscription_period_end" timestamp with time zone NOT NULL,
    "credit_source" "text" DEFAULT 'plan'::"text" NOT NULL,
    "booster_purchase_id" "uuid",
    CONSTRAINT "announcement_highlights_history_credit_source_check" CHECK (("credit_source" = ANY (ARRAY['plan'::"text", 'booster'::"text"]))),
    CONSTRAINT "announcement_highlights_history_highlight_type_check" CHECK (("highlight_type" = ANY (ARRAY['category'::"text", 'home'::"text"])))
);


ALTER TABLE "public"."announcement_highlights_history" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."announcement_metrics" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "announcement_id" "uuid" NOT NULL,
    "market_avg_price" numeric(12,2),
    "price_position" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "ad_metrics_price_position_check" CHECK (("price_position" = ANY (ARRAY['LOW'::"text", 'MED'::"text", 'HIGH'::"text"])))
);


ALTER TABLE "public"."announcement_metrics" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."announcement_reports" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "announcement_id" "uuid" NOT NULL,
    "reporter_user_id" "uuid" NOT NULL,
    "reason" "text" NOT NULL,
    "details" "text",
    "status" "text" DEFAULT 'valid'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "announcement_reports_reason_check" CHECK (("reason" = ANY (ARRAY['inappropriate_content'::"text", 'wrong_category'::"text", 'fraud_or_scam'::"text", 'false_information'::"text", 'prohibited_item'::"text", 'duplicate_or_spam'::"text", 'other'::"text"]))),
    CONSTRAINT "announcement_reports_status_check" CHECK (("status" = ANY (ARRAY['valid'::"text", 'dismissed'::"text"])))
);


ALTER TABLE "public"."announcement_reports" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."announcement_similarity_cooldowns" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "announcement_id" "uuid",
    "title_normalized" "text" NOT NULL,
    "category_id" "uuid",
    "city" "text",
    "state" "text",
    "price" numeric(12,2),
    "source_status" "text" NOT NULL,
    "cooldown_until" timestamp with time zone NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."announcement_similarity_cooldowns" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."announcements_with_active_highlights" AS
 SELECT "id",
    "title",
    "description",
    "price",
    "city",
    "state",
    "cep",
    "category_id",
    "images",
    "user_id",
    "status",
    "views",
    "is_premium",
    "whatsapp",
    "health_score",
    "created_at",
    "updated_at",
    "expires_at",
    "sold_at",
    "category_slug",
    "sub_category_id",
    "quantity",
    "unit",
    "unit_price",
    "currency",
    "sub_category_label",
    "highlight_category",
    "highlight_category_until",
    "highlight_home",
    "highlight_home_until",
        CASE
            WHEN (("highlight_home" = true) AND (("highlight_home_until" IS NULL) OR ("highlight_home_until" > "now"()))) THEN true
            ELSE false
        END AS "is_home_highlight_active",
        CASE
            WHEN (("highlight_category" = true) AND (("highlight_category_until" IS NULL) OR ("highlight_category_until" > "now"()))) THEN true
            ELSE false
        END AS "is_category_highlight_active"
   FROM "public"."announcements";


ALTER VIEW "public"."announcements_with_active_highlights" OWNER TO "postgres";


COMMENT ON VIEW "public"."announcements_with_active_highlights" IS 'View que adiciona colunas calculadas indicando se os destaques estão ativos. Útil para queries que precisam verificar status de destaque sem lógica complexa.';



CREATE TABLE IF NOT EXISTS "public"."banners" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "image" "text" NOT NULL,
    "title" "text" NOT NULL,
    "subtitle" "text",
    "button_text" "text",
    "button_link" "text",
    "order_position" integer DEFAULT 0,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."banners" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."category_group_categories" (
    "group_id" "uuid" NOT NULL,
    "category_id" "uuid" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."category_group_categories" OWNER TO "postgres";


COMMENT ON TABLE "public"."category_group_categories" IS 'Mapa entre grupos principais e categorias atuais do banco, permitindo migracao gradual sem quebrar anuncios existentes.';



CREATE TABLE IF NOT EXISTS "public"."category_group_images" (
    "slug" "text" NOT NULL,
    "image_url" "text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."category_group_images" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."category_groups" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "name" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."category_groups" OWNER TO "postgres";


COMMENT ON TABLE "public"."category_groups" IS 'Categorias principais oficiais do produto, usadas para agrupar categorias legadas e preparar a hierarquia futura.';



CREATE OR REPLACE VIEW "public"."category_group_resolved" AS
 SELECT "cg"."id" AS "group_id",
    "cg"."name" AS "group_name",
    "cg"."slug" AS "group_slug",
    "cg"."sort_order" AS "group_sort_order",
    "c"."id" AS "category_id",
    "c"."name" AS "category_name",
    "c"."slug" AS "category_slug",
    "cgc"."sort_order" AS "category_sort_order"
   FROM (("public"."category_groups" "cg"
     LEFT JOIN "public"."category_group_categories" "cgc" ON (("cgc"."group_id" = "cg"."id")))
     LEFT JOIN "public"."categories" "c" ON (("c"."id" = "cgc"."category_id")));


ALTER VIEW "public"."category_group_resolved" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."category_ranking_settings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "novelty_boost_48h" integer DEFAULT 10 NOT NULL,
    "novelty_boost_7d" integer DEFAULT 5 NOT NULL,
    "freshness_multiplier" numeric(6,2) DEFAULT 1.00 NOT NULL,
    "quality_multiplier" numeric(6,2) DEFAULT 1.00 NOT NULL,
    "engagement_multiplier" numeric(6,2) DEFAULT 1.00 NOT NULL,
    "verification_weight" integer DEFAULT 16 NOT NULL,
    "home_highlight_weight" integer DEFAULT 220 NOT NULL,
    "active_plan_base_weight" integer DEFAULT 300 NOT NULL,
    "active_plan_price_multiplier" numeric(6,2) DEFAULT 100.00 NOT NULL,
    "active_plan_price_cap" integer DEFAULT 120 NOT NULL,
    "stale_penalty_7d" integer DEFAULT 4 NOT NULL,
    "stale_penalty_14d" integer DEFAULT 10 NOT NULL,
    "stale_penalty_30d" integer DEFAULT 18 NOT NULL,
    "seller_rotation_limit" integer DEFAULT 2 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."category_ranking_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."category_showcase_impressions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "announcement_id" "uuid" NOT NULL,
    "category_slug" "text" NOT NULL,
    "viewed_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."category_showcase_impressions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."category_subcategories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "category_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."category_subcategories" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."chats" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "announcement_id" "uuid" NOT NULL,
    "seller_id" "uuid" NOT NULL,
    "buyer_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "last_message" "text",
    "last_message_time" timestamp with time zone,
    "unread_count" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "unread_count_buyer" integer DEFAULT 0,
    "unread_count_seller" integer DEFAULT 0,
    CONSTRAINT "chats_status_check" CHECK (("status" = ANY (ARRAY['novo'::"text", 'contatado'::"text", 'negociando'::"text", 'fechado'::"text", 'perdido'::"text"])))
);


ALTER TABLE "public"."chats" OWNER TO "postgres";


COMMENT ON TABLE "public"."chats" IS 'Conversas entre vendedores e compradores';



COMMENT ON COLUMN "public"."chats"."status" IS 'Status do chat/lead: novo, contatado, negociando, fechado, perdido';



CREATE TABLE IF NOT EXISTS "public"."leads" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "chat_id" "uuid" NOT NULL,
    "announcement_id" "uuid" NOT NULL,
    "seller_id" "uuid" NOT NULL,
    "buyer_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "cost_in_credits" integer DEFAULT 5,
    "unlocked_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "buyer_cep" "text",
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "buyer_name" "text",
    "buyer_email" "text",
    "buyer_phone" "text",
    "initial_message" "text",
    "contact_expires_at" timestamp with time zone,
    "received_with_active_access" boolean DEFAULT false NOT NULL,
    "unlocked_once_at" timestamp with time zone,
    CONSTRAINT "leads_status_check" CHECK (("status" = ANY (ARRAY['novo'::"text", 'contatado'::"text", 'negociando'::"text", 'fechado'::"text", 'perdido'::"text"])))
);


ALTER TABLE "public"."leads" OWNER TO "postgres";


COMMENT ON TABLE "public"."leads" IS 'Sistema de leads com gatekeeper de créditos';



CREATE OR REPLACE VIEW "public"."chats_full" AS
 SELECT "c"."id",
    "c"."announcement_id",
    "c"."seller_id",
    "c"."buyer_id",
    "c"."status",
    "c"."created_at",
    "c"."last_message",
    "c"."last_message_time",
    "c"."unread_count_buyer",
    "c"."unread_count_seller",
        CASE
            WHEN ("auth"."uid"() = "c"."buyer_id") THEN "c"."unread_count_buyer"
            WHEN ("auth"."uid"() = "c"."seller_id") THEN "c"."unread_count_seller"
            ELSE 0
        END AS "unread_count",
    "a"."title" AS "ad_title",
    "a"."price" AS "ad_price",
    "a"."images"[1] AS "ad_image",
    "a"."status" AS "announcement_status",
    "a"."expires_at" AS "announcement_expires_at",
    "a"."expired_at" AS "announcement_expired_at",
    "a"."deletion_scheduled_at" AS "announcement_deletion_scheduled_at",
    "l"."contact_expires_at" AS "lead_contact_expires_at",
    "seller"."name" AS "seller_name",
    "buyer"."name" AS "buyer_name"
   FROM (((("public"."chats" "c"
     LEFT JOIN "public"."announcements" "a" ON (("c"."announcement_id" = "a"."id")))
     LEFT JOIN "public"."leads" "l" ON (("l"."chat_id" = "c"."id")))
     LEFT JOIN "public"."users" "seller" ON (("c"."seller_id" = "seller"."id")))
     LEFT JOIN "public"."users" "buyer" ON (("c"."buyer_id" = "buyer"."id")));


ALTER VIEW "public"."chats_full" OWNER TO "postgres";


COMMENT ON VIEW "public"."chats_full" IS 'View consolidada dos chats com contadores de nao lidas por usuario e metadados do anuncio.';



CREATE TABLE IF NOT EXISTS "public"."commercial_intelligence_contact_shares" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "conversation_id" "uuid" NOT NULL,
    "seller_user_id" "uuid" NOT NULL,
    "buyer_user_id" "uuid" NOT NULL,
    "share_email" boolean DEFAULT false NOT NULL,
    "share_whatsapp" boolean DEFAULT false NOT NULL,
    "shared_email" "text",
    "shared_whatsapp" "text",
    "buyer_note" "text",
    "granted_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."commercial_intelligence_contact_shares" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."commercial_intelligence_conversation_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "conversation_id" "uuid" NOT NULL,
    "sender_user_id" "uuid" NOT NULL,
    "content" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "commercial_intelligence_conversation_messages_content_check" CHECK ((("char_length"(TRIM(BOTH FROM "content")) >= 1) AND ("char_length"(TRIM(BOTH FROM "content")) <= 2000)))
);


ALTER TABLE "public"."commercial_intelligence_conversation_messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."commercial_intelligence_conversations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "response_id" "uuid" NOT NULL,
    "campaign_id" "uuid" NOT NULL,
    "seller_user_id" "uuid" NOT NULL,
    "buyer_user_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "commercial_intelligence_conversations_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'closed'::"text"])))
);


ALTER TABLE "public"."commercial_intelligence_conversations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."commercial_intelligence_interest_responses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "delivery_id" "uuid" NOT NULL,
    "campaign_id" "uuid" NOT NULL,
    "seller_user_id" "uuid" NOT NULL,
    "buyer_user_id" "uuid" NOT NULL,
    "buyer_note" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."commercial_intelligence_interest_responses" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."commercial_intelligence_outreach_campaigns" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "seller_user_id" "uuid" NOT NULL,
    "category_slug" "text" NOT NULL,
    "subcategory_slug" "text",
    "message_template" "text" NOT NULL,
    "recipients_count" integer DEFAULT 0 NOT NULL,
    "delivered_count" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."commercial_intelligence_outreach_campaigns" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."commercial_intelligence_outreach_deliveries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "campaign_id" "uuid" NOT NULL,
    "recipient_user_id" "uuid" NOT NULL,
    "notification_id" "uuid",
    "status" "text" DEFAULT 'delivered'::"text" NOT NULL,
    "channel" "text" DEFAULT 'platform'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "commercial_intelligence_outreach_deliveries_channel_check" CHECK (("channel" = 'platform'::"text")),
    CONSTRAINT "commercial_intelligence_outreach_deliveries_status_check" CHECK (("status" = ANY (ARRAY['delivered'::"text", 'skipped'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."commercial_intelligence_outreach_deliveries" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."commercial_intelligence_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "seller_user_id" "uuid" NOT NULL,
    "category_slug" "text" NOT NULL,
    "subcategory_slug" "text",
    "generated_rows" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."commercial_intelligence_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."commercial_lead_preferences" (
    "user_id" "uuid" NOT NULL,
    "allow_commercial_contact" boolean DEFAULT false NOT NULL,
    "allowed_category_slugs" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "preferred_channels" "text"[] DEFAULT ARRAY['platform'::"text"] NOT NULL,
    "consent_text_version" "text" DEFAULT 'commercial-intelligence-v1'::"text" NOT NULL,
    "consent_granted_at" timestamp with time zone,
    "consent_revoked_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."commercial_lead_preferences" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."contact_form_email_jobs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "contact_message_id" "uuid" NOT NULL,
    "recipient_email" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "provider" "text" DEFAULT 'smtp'::"text" NOT NULL,
    "attempts" integer DEFAULT 0 NOT NULL,
    "last_error" "text",
    "queued_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "processing_started_at" timestamp with time zone,
    "last_attempt_at" timestamp with time zone,
    "sent_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "contact_form_email_jobs_attempts_check" CHECK (("attempts" >= 0)),
    CONSTRAINT "contact_form_email_jobs_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'processing'::"text", 'sent'::"text", 'failed'::"text", 'skipped'::"text"])))
);


ALTER TABLE "public"."contact_form_email_jobs" OWNER TO "postgres";


COMMENT ON TABLE "public"."contact_form_email_jobs" IS 'Fila de envios por e-mail para mensagens recebidas no formulario publico Fale Conosco.';



CREATE TABLE IF NOT EXISTS "public"."contact_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "requester_user_id" "uuid",
    "name" "text" NOT NULL,
    "email" "text" NOT NULL,
    "phone" "text",
    "subject" "text",
    "message" "text" NOT NULL,
    "recipient_email" "text",
    "source_page" "text" DEFAULT 'contact_page'::"text" NOT NULL,
    "status" "text" DEFAULT 'new'::"text" NOT NULL,
    "admin_notes" "text",
    "handled_by" "uuid",
    "resolved_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "contact_messages_status_check" CHECK (("status" = ANY (ARRAY['new'::"text", 'in_progress'::"text", 'resolved'::"text", 'archived'::"text"])))
);


ALTER TABLE "public"."contact_messages" OWNER TO "postgres";


COMMENT ON TABLE "public"."contact_messages" IS 'Mensagens enviadas pelo formulario publico da pagina Fale Conosco.';



CREATE TABLE IF NOT EXISTS "public"."contact_notification_email_dispatch_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "triggered_by" "text" NOT NULL,
    "status" "text" DEFAULT 'processing'::"text" NOT NULL,
    "requested_limit" integer DEFAULT 25 NOT NULL,
    "processed_count" integer DEFAULT 0 NOT NULL,
    "sent_count" integer DEFAULT 0 NOT NULL,
    "failed_count" integer DEFAULT 0 NOT NULL,
    "skipped_count" integer DEFAULT 0 NOT NULL,
    "notes" "text",
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "finished_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "contact_notification_email_dispatch_logs_requested_limit_check" CHECK (("requested_limit" >= 1)),
    CONSTRAINT "contact_notification_email_dispatch_logs_status_check" CHECK (("status" = ANY (ARRAY['processing'::"text", 'completed'::"text", 'failed'::"text"]))),
    CONSTRAINT "contact_notification_email_dispatch_logs_triggered_by_check" CHECK (("triggered_by" = ANY (ARRAY['cron'::"text", 'admin'::"text"])))
);


ALTER TABLE "public"."contact_notification_email_dispatch_logs" OWNER TO "postgres";


COMMENT ON TABLE "public"."contact_notification_email_dispatch_logs" IS 'Log das execucoes de processamento dos e-mails de leads e mensagens.';



CREATE TABLE IF NOT EXISTS "public"."contact_notification_email_jobs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "source_kind" "text" NOT NULL,
    "message_id" "uuid",
    "lead_id" "uuid",
    "recipient_user_id" "uuid" NOT NULL,
    "recipient_email" "text",
    "recipient_name" "text",
    "sender_name" "text",
    "announcement_title" "text",
    "message_preview" "text",
    "link" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "provider" "text" DEFAULT 'smtp'::"text" NOT NULL,
    "attempts" integer DEFAULT 0 NOT NULL,
    "last_error" "text",
    "queued_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "processing_started_at" timestamp with time zone,
    "last_attempt_at" timestamp with time zone,
    "sent_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "contact_notification_email_jobs_attempts_check" CHECK (("attempts" >= 0)),
    CONSTRAINT "contact_notification_email_jobs_check" CHECK (((("message_id" IS NOT NULL) AND ("lead_id" IS NULL)) OR (("message_id" IS NULL) AND ("lead_id" IS NOT NULL)))),
    CONSTRAINT "contact_notification_email_jobs_source_kind_check" CHECK (("source_kind" = ANY (ARRAY['new_message'::"text", 'new_lead'::"text"]))),
    CONSTRAINT "contact_notification_email_jobs_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'processing'::"text", 'sent'::"text", 'failed'::"text", 'skipped'::"text"])))
);


ALTER TABLE "public"."contact_notification_email_jobs" OWNER TO "postgres";


COMMENT ON TABLE "public"."contact_notification_email_jobs" IS 'Fila de envios por e-mail para notificacoes de novos leads e novas mensagens.';



CREATE TABLE IF NOT EXISTS "public"."contact_page_content" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "page_title" character varying(100) DEFAULT 'Fale Conosco'::character varying,
    "page_subtitle" "text" DEFAULT 'Estamos aqui para ajudar você a colher os melhores resultados. Entre em contato pelos nossos canais oficiais ou envie uma mensagem.'::"text",
    "whatsapp_label" character varying(50) DEFAULT 'WHATSAPP'::character varying,
    "whatsapp_number" character varying(20) DEFAULT '(11) 99999-9999'::character varying,
    "email_label" character varying(50) DEFAULT 'E-MAIL'::character varying,
    "email_address" character varying(100) DEFAULT 'suporte@bwagro.com.br'::character varying,
    "address_label" character varying(50) DEFAULT 'ENDEREÇO SEDE'::character varying,
    "address_full" "text" DEFAULT 'Av. Paulista, 1000 - Bela Vista, São Paulo - SP'::"text",
    "schedule_text" character varying(100) DEFAULT 'Segunda a Sexta, das 08h às 18h'::character varying,
    "maps_embed_url" "text" DEFAULT 'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3657.0977!2d-46.6564!3d-23.5629!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x0%3A0x0!2zMjPCsDMzJzQ2LjQiUyA0NsKwMzknMjMuMCJX!5e0!3m2!1spt-BR!2sbr!4v1234567890'::"text",
    "form_title" character varying(100) DEFAULT 'Envie sua Mensagem'::character varying,
    "form_name_placeholder" character varying(50) DEFAULT 'Seu nome'::character varying,
    "form_email_placeholder" character varying(50) DEFAULT 'seu@email.com'::character varying,
    "form_phone_placeholder" character varying(50) DEFAULT '(00) 00000-0000'::character varying,
    "form_subject_placeholder" character varying(50) DEFAULT 'Suporte Técnico'::character varying,
    "form_message_placeholder" "text" DEFAULT 'Como podemos ajudar?'::"text",
    "form_button_text" character varying(50) DEFAULT 'Enviar Mensagem'::character varying,
    "last_updated_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "form_subject_options" "text" DEFAULT 'Suporte Técnico
Dúvidas sobre Planos
Parcerias Comerciais
Sugestões e Elogios
Denunciar Anúncio'::"text",
    "form_recipient_email" character varying(100) DEFAULT 'contato@bwagro.com.br'::character varying,
    CONSTRAINT "single_row" CHECK (("id" = '00000000-0000-0000-0000-000000000004'::"uuid"))
);


ALTER TABLE "public"."contact_page_content" OWNER TO "postgres";


COMMENT ON TABLE "public"."contact_page_content" IS 'Conteúdo estruturado da página Fale Conosco (singleton)';



CREATE TABLE IF NOT EXISTS "public"."fiscal_document_jobs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "payment_id" "uuid" NOT NULL,
    "provider" "text" DEFAULT 'NFEIO'::"text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "attempts" integer DEFAULT 0 NOT NULL,
    "provider_request_id" "text",
    "provider_document_id" "text",
    "request_payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "response_payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "last_error" "text",
    "requested_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_attempt_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "fiscal_document_jobs_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'processing'::"text", 'awaiting_webhook'::"text", 'completed'::"text", 'failed'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."fiscal_document_jobs" OWNER TO "postgres";


COMMENT ON TABLE "public"."fiscal_document_jobs" IS 'Fila e auditoria da automacao de emissao fiscal';



CREATE TABLE IF NOT EXISTS "public"."fiscal_settings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "provider" "text" DEFAULT 'FOCUSNFE'::"text" NOT NULL,
    "environment" "text" DEFAULT 'sandbox'::"text" NOT NULL,
    "auto_issue_enabled" boolean DEFAULT false NOT NULL,
    "legal_name" "text" DEFAULT ''::"text" NOT NULL,
    "trade_name" "text",
    "cnpj" "text" DEFAULT ''::"text" NOT NULL,
    "municipal_registration" "text",
    "tax_regime" "text",
    "service_code" "text",
    "service_description" "text",
    "service_city_code" "text",
    "cnae_code" "text",
    "issuer_email" "text",
    "provider_api_base_url" "text" DEFAULT 'https://homologacao.focusnfe.com.br'::"text" NOT NULL,
    "provider_company_id" "text",
    "provider_invoice_endpoint_path" "text" DEFAULT '/v2/nfse?ref={reference}'::"text" NOT NULL,
    "provider_webhook_secret" "text",
    "invoice_series" "text",
    "next_rps_number" bigint,
    "additional_information" "text",
    "last_updated_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "focus_nfse_reference_prefix" "text" DEFAULT 'BWAGRO'::"text",
    "focus_natureza_operacao" "text" DEFAULT '1'::"text",
    "focus_special_tax_regime" "text",
    "focus_simple_national" boolean DEFAULT false,
    "focus_service_list_item" "text",
    "focus_municipal_tax_code" "text",
    "focus_iss_withheld" boolean DEFAULT false,
    "focus_iss_taxation_type" "text",
    "focus_iss_rate" numeric(6,4),
    CONSTRAINT "fiscal_settings_environment_check" CHECK (("environment" = ANY (ARRAY['sandbox'::"text", 'production'::"text"]))),
    CONSTRAINT "fiscal_settings_provider_check" CHECK (("provider" = 'NFEIO'::"text"))
);


ALTER TABLE "public"."fiscal_settings" OWNER TO "postgres";


COMMENT ON TABLE "public"."fiscal_settings" IS 'Configuracao operacional e tributaria para emissao automatica de NFS-e';



COMMENT ON COLUMN "public"."fiscal_settings"."focus_nfse_reference_prefix" IS 'Prefixo usado para gerar a referencia unica enviada ao Focus NFe';



COMMENT ON COLUMN "public"."fiscal_settings"."focus_natureza_operacao" IS 'Campo natureza_operacao da NFSe Focus';



COMMENT ON COLUMN "public"."fiscal_settings"."focus_special_tax_regime" IS 'Campo regime_especial_tributacao da NFSe Focus';



COMMENT ON COLUMN "public"."fiscal_settings"."focus_simple_national" IS 'Indica se o prestador e optante pelo Simples Nacional';



COMMENT ON COLUMN "public"."fiscal_settings"."focus_service_list_item" IS 'Campo item_lista_servico da NFSe Focus';



COMMENT ON COLUMN "public"."fiscal_settings"."focus_municipal_tax_code" IS 'Campo codigo_tributario_municipio da NFSe Focus';



CREATE TABLE IF NOT EXISTS "public"."growth_conversion_settings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "is_enabled" boolean DEFAULT true NOT NULL,
    "daily_user_limit" integer DEFAULT 1 NOT NULL,
    "min_views_for_high_views" integer DEFAULT 20 NOT NULL,
    "min_views_for_no_leads" integer DEFAULT 50 NOT NULL,
    "min_views_for_expiring" integer DEFAULT 15 NOT NULL,
    "expire_soon_days" integer DEFAULT 7 NOT NULL,
    "trigger_high_views_enabled" boolean DEFAULT true NOT NULL,
    "trigger_top_category_enabled" boolean DEFAULT true NOT NULL,
    "trigger_no_leads_enabled" boolean DEFAULT true NOT NULL,
    "trigger_expiring_enabled" boolean DEFAULT true NOT NULL,
    "trigger_plan_limit_enabled" boolean DEFAULT true NOT NULL,
    "updated_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "templates" "jsonb" DEFAULT '{"expiring": {"cta": "Renovar estrategia do anuncio", "link": "/minha-conta/meu-plano?source=growth", "title": "Oportunidade AGRO BW: anuncio perto do vencimento", "message": "Seu anuncio \"{titulo_anuncio}\" expira em {dias_restantes} dia(s) e ja chamou atencao de compradores. Aproveite o momento para reforcar a exposicao.", "subject": "Seu anuncio esta perto do vencimento", "supportText": "Se o anuncio perder ritmo agora, voce pode desperdicar um bom momento de interesse do mercado."}, "no_leads": {"cta": "Ver planos com mais alcance", "link": "/minha-conta/meu-plano?source=growth", "title": "Oportunidade AGRO BW: alta audiencia sem conversao", "message": "Seu anuncio \"{titulo_anuncio}\" ja acumulou {visualizacoes} visualizacoes e ainda nao recebeu contatos. Um plano com destaque pode aumentar suas chances de conversao.", "subject": "Seu anuncio esta atraindo publico, mas ainda sem conversao", "supportText": "Ajustar seu plano neste momento pode ajudar a transformar interesse em oportunidade comercial concreta."}, "high_views": {"cta": "Ver planos e impulsionar", "link": "/minha-conta/meu-plano?source=growth", "title": "Oportunidade AGRO BW: anuncio com boa tracao", "message": "Seu anuncio \"{titulo_anuncio}\" ja acumulou {visualizacoes} visualizacoes. Destaca-lo agora pode ajudar a transformar audiencia em contatos.", "subject": "Seu anuncio esta ganhando tracao na AGRO BW", "supportText": "Seu plano atual pode estar limitando a exposicao maxima desse resultado. Avalie um upgrade para aproveitar melhor o momento."}, "plan_limit": {"cta": "Fazer upgrade agora", "link": "/minha-conta/meu-plano?source=growth", "title": "Oportunidade AGRO BW: seu plano limita a exposicao", "message": "Seu anuncio \"{titulo_anuncio}\" ja esta gerando interesse, mas o plano atual nao libera {tipo_recurso}. Fazer upgrade agora pode ampliar o alcance.", "subject": "Seu plano atual esta limitando seu potencial de exposicao", "supportText": "Voce ja tem sinais reais de interesse. O ajuste de plano pode destravar mais exposicao e acelerar conversoes."}, "top_category": {"cta": "Comprar destaque", "link": "/minha-conta/meu-plano?source=growth", "title": "Oportunidade AGRO BW: anuncio em evidencia na categoria", "message": "Seu anuncio \"{titulo_anuncio}\" esta entre os mais vistos da categoria. Um destaque pode acelerar contatos e ampliar a exposicao.", "subject": "Seu anuncio esta em evidencia na categoria", "supportText": "Aparecer entre os primeiros do ranking e um bom sinal para reforcar sua estrategia comercial agora."}}'::"jsonb" NOT NULL,
    CONSTRAINT "growth_conversion_settings_daily_limit_check" CHECK (("daily_user_limit" >= 0)),
    CONSTRAINT "growth_conversion_settings_expire_days_check" CHECK (("expire_soon_days" >= 1)),
    CONSTRAINT "growth_conversion_settings_expiring_views_check" CHECK (("min_views_for_expiring" >= 0)),
    CONSTRAINT "growth_conversion_settings_high_views_check" CHECK (("min_views_for_high_views" >= 0)),
    CONSTRAINT "growth_conversion_settings_no_leads_check" CHECK (("min_views_for_no_leads" >= 0))
);


ALTER TABLE "public"."growth_conversion_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."highlight_boosters" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "monthly_price" numeric(10,2) DEFAULT 0 NOT NULL,
    "category_credits" integer DEFAULT 0 NOT NULL,
    "home_credits" integer DEFAULT 0 NOT NULL,
    "max_purchases_per_30_days" integer DEFAULT 2 NOT NULL,
    "button_text" "text" DEFAULT 'Comprar booster'::"text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "position" integer DEFAULT 1 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "category_highlight_days" integer DEFAULT 30 NOT NULL,
    "home_highlight_days" integer DEFAULT 15 NOT NULL
);


ALTER TABLE "public"."highlight_boosters" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."highlight_settings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "highlight_cooldown_days" integer DEFAULT 15 NOT NULL,
    "updated_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "highlight_settings_cooldown_days_check" CHECK (("highlight_cooldown_days" >= 0))
);


ALTER TABLE "public"."highlight_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."home_banners" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "badge_text" character varying(50) DEFAULT 'Destaque BWAGRO'::character varying,
    "title" character varying(200) NOT NULL,
    "subtitle" "text",
    "button_text" character varying(50) DEFAULT 'Ver Mais'::character varying NOT NULL,
    "button_link" character varying(500) NOT NULL,
    "image_url" "text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."home_banners" OWNER TO "postgres";


COMMENT ON TABLE "public"."home_banners" IS 'Banners dinâmicos exibidos no slider da Home';



COMMENT ON COLUMN "public"."home_banners"."badge_text" IS 'Texto do badge (ex: "Destaque BWAGRO")';



COMMENT ON COLUMN "public"."home_banners"."title" IS 'Título principal do banner';



COMMENT ON COLUMN "public"."home_banners"."subtitle" IS 'Subtítulo/descrição do banner';



COMMENT ON COLUMN "public"."home_banners"."button_text" IS 'Texto do botão (ex: "Explorar Agora")';



COMMENT ON COLUMN "public"."home_banners"."button_link" IS 'Link de destino do botão';



COMMENT ON COLUMN "public"."home_banners"."image_url" IS 'URL da imagem do banner (Supabase Storage)';



COMMENT ON COLUMN "public"."home_banners"."sort_order" IS 'Ordem de exibição (menor = primeiro)';



COMMENT ON COLUMN "public"."home_banners"."is_active" IS 'Se o banner está ativo';



CREATE TABLE IF NOT EXISTS "public"."home_showcase_impressions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "announcement_id" "uuid" NOT NULL,
    "viewed_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."home_showcase_impressions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."institutional_pages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" character varying(200) NOT NULL,
    "slug" character varying(200) NOT NULL,
    "content" "text" NOT NULL,
    "meta_title" character varying(200),
    "meta_description" character varying(300),
    "is_published" boolean DEFAULT false,
    "last_updated_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."institutional_pages" OWNER TO "postgres";


COMMENT ON TABLE "public"."institutional_pages" IS 'Páginas institucionais gerenciadas via CMS';



COMMENT ON COLUMN "public"."institutional_pages"."title" IS 'Título da página';



COMMENT ON COLUMN "public"."institutional_pages"."slug" IS 'URL amigável (ex: termos-de-uso)';



COMMENT ON COLUMN "public"."institutional_pages"."content" IS 'Conteúdo HTML da página';



COMMENT ON COLUMN "public"."institutional_pages"."meta_title" IS 'Título SEO (meta tag)';



COMMENT ON COLUMN "public"."institutional_pages"."meta_description" IS 'Descrição SEO (meta tag)';



COMMENT ON COLUMN "public"."institutional_pages"."is_published" IS 'Se a página está publicada';



COMMENT ON COLUMN "public"."institutional_pages"."last_updated_by" IS 'Último admin que editou';



CREATE TABLE IF NOT EXISTS "public"."invite_campaigns" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "code" "text" NOT NULL,
    "captor_name" "text" NOT NULL,
    "captor_email" "text",
    "notes" "text",
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "invite_campaigns_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'inactive'::"text"])))
);


ALTER TABLE "public"."invite_campaigns" OWNER TO "postgres";


COMMENT ON TABLE "public"."invite_campaigns" IS 'Convites de captacao gerenciados pelo painel admin para rastrear visitas e cadastros por link.';



CREATE TABLE IF NOT EXISTS "public"."invite_visits" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "invite_campaign_id" "uuid" NOT NULL,
    "session_id" "text" NOT NULL,
    "landing_path" "text" DEFAULT '/cadastro'::"text" NOT NULL,
    "registered_user_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."invite_visits" OWNER TO "postgres";


COMMENT ON TABLE "public"."invite_visits" IS 'Visitas registradas por sessao em links de convite/captacao.';



CREATE TABLE IF NOT EXISTS "public"."invoices" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "amount" numeric(10,2) NOT NULL,
    "status" "text" NOT NULL,
    "plan_name" "text" NOT NULL,
    "pdf_url" "text",
    "due_date" timestamp with time zone,
    "paid_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "invoices_status_check" CHECK (("status" = ANY (ARRAY['PAID'::"text", 'PENDING'::"text", 'OVERDUE'::"text"])))
);


ALTER TABLE "public"."invoices" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."layout_settings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "site_name" "text" DEFAULT 'BWAGRO'::"text" NOT NULL,
    "site_short_name" "text",
    "site_tagline" "text",
    "header_brand_text" "text",
    "footer_brand_text" "text",
    "login_brand_text" "text",
    "seo_title" "text",
    "seo_description" "text",
    "logo_url" "text",
    "logo_light_url" "text",
    "logo_dark_url" "text",
    "favicon_url" "text",
    "primary_color" "text" DEFAULT '#16a34a'::"text" NOT NULL,
    "secondary_color" "text" DEFAULT '#0f172a'::"text" NOT NULL,
    "accent_color" "text" DEFAULT '#f59e0b'::"text" NOT NULL,
    "background_color" "text" DEFAULT '#f8fafc'::"text" NOT NULL,
    "surface_color" "text" DEFAULT '#ffffff'::"text" NOT NULL,
    "text_color" "text" DEFAULT '#0f172a'::"text" NOT NULL,
    "muted_text_color" "text" DEFAULT '#64748b'::"text" NOT NULL,
    "success_color" "text" DEFAULT '#16a34a'::"text" NOT NULL,
    "warning_color" "text" DEFAULT '#f59e0b'::"text" NOT NULL,
    "error_color" "text" DEFAULT '#dc2626'::"text" NOT NULL,
    "last_updated_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "facebook_url" "text",
    "instagram_url" "text",
    "youtube_url" "text",
    "linkedin_url" "text",
    "whatsapp_url" "text",
    "tiktok_url" "text",
    "default_ad_image_url" "text",
    "pricing_hero_image_url" "text",
    "pricing_store_image_url" "text",
    "pricing_field_image_url" "text",
    "sponsor_hero_image_url" "text",
    "sponsor_harvest_image_url" "text",
    "sponsor_field_image_url" "text",
    "commercial_whatsapp_number" "text",
    "sponsor_final_cta_image_url" "text",
    "commercial_intelligence_enabled" boolean DEFAULT false NOT NULL,
    "login_hero_image_url" "text",
    "register_hero_image_url" "text"
);


ALTER TABLE "public"."layout_settings" OWNER TO "postgres";


COMMENT ON COLUMN "public"."layout_settings"."login_hero_image_url" IS 'Imagem lateral principal da tela de login.';



COMMENT ON COLUMN "public"."layout_settings"."register_hero_image_url" IS 'Imagem lateral principal da tela de cadastro.';



CREATE TABLE IF NOT EXISTS "public"."lead_conversions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "announcement_id" "uuid" NOT NULL,
    "viewer_id" "uuid",
    "conversion_type" "text" NOT NULL,
    "ip_address" "inet",
    "user_agent" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "lead_conversions_conversion_type_check" CHECK (("conversion_type" = ANY (ARRAY['whatsapp_click'::"text", 'phone_click'::"text", 'email_click'::"text", 'message_sent'::"text"])))
);


ALTER TABLE "public"."lead_conversions" OWNER TO "postgres";


COMMENT ON TABLE "public"."lead_conversions" IS 'Rastreamento de conversões de leads (cliques em contato)';



COMMENT ON COLUMN "public"."lead_conversions"."conversion_type" IS 'Tipo: whatsapp_click, phone_click, email_click, message_sent';



CREATE TABLE IF NOT EXISTS "public"."market_quote_source_previews" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "source_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "extracted_quotes" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "raw_payload" "jsonb",
    "previewed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "approved_at" timestamp with time zone,
    "approved_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."market_quote_source_previews" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."market_quote_sources" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "source_url" "text" NOT NULL,
    "provider_label" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "refresh_interval_minutes" integer DEFAULT 60 NOT NULL,
    "last_validation_at" timestamp with time zone,
    "last_sync_at" timestamp with time zone,
    "last_status" "text",
    "last_error" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "commodity_target" "text" NOT NULL,
    "provider" "text" DEFAULT 'cepea'::"text" NOT NULL,
    "cepea_indicator_id" integer,
    "generated_url" "text",
    "auto_approve_enabled" boolean DEFAULT false NOT NULL,
    CONSTRAINT "market_quote_sources_commodity_target_check" CHECK (("commodity_target" = ANY (ARRAY['soja'::"text", 'milho'::"text", 'boi'::"text", 'cafe'::"text"]))),
    CONSTRAINT "market_quote_sources_provider_check" CHECK (("provider" = ANY (ARRAY['cepea'::"text", 'custom'::"text"])))
);


ALTER TABLE "public"."market_quote_sources" OWNER TO "postgres";


COMMENT ON COLUMN "public"."market_quote_sources"."auto_approve_enabled" IS 'Quando true, a coleta válida desta fonte é aprovada e publicada automaticamente no ticker.';



CREATE TABLE IF NOT EXISTS "public"."market_quotes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "code" "text" NOT NULL,
    "name" "text" NOT NULL,
    "unit" "text",
    "price" numeric(14,4),
    "change_percent" numeric(8,2) DEFAULT 0 NOT NULL,
    "source" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "is_placeholder" boolean DEFAULT false NOT NULL,
    "placeholder_text" "text",
    "sort_order" integer DEFAULT 0 NOT NULL,
    "last_update" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "commodity" "text",
    "product_name" "text",
    "source_id" "uuid",
    "reference_date" "date",
    "source_label" "text",
    CONSTRAINT "market_quotes_price_or_placeholder_check" CHECK (((("is_placeholder" = true) AND ("placeholder_text" IS NOT NULL)) OR (("is_placeholder" = false) AND ("price" IS NOT NULL))))
);


ALTER TABLE "public"."market_quotes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."market_quotes_temp" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "source_id" "uuid" NOT NULL,
    "commodity" "text" NOT NULL,
    "produto" "text" NOT NULL,
    "preco" numeric(14,4) NOT NULL,
    "unidade" "text" DEFAULT 'R$'::"text" NOT NULL,
    "data_referencia" "date" NOT NULL,
    "fonte" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "raw_payload" "jsonb",
    "error_message" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "approved_at" timestamp with time zone,
    "approved_by" "uuid",
    CONSTRAINT "market_quotes_temp_commodity_check" CHECK (("commodity" = ANY (ARRAY['soja'::"text", 'milho'::"text", 'boi'::"text", 'cafe'::"text"]))),
    CONSTRAINT "market_quotes_temp_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'rejected'::"text"])))
);


ALTER TABLE "public"."market_quotes_temp" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."marketing_costs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "month_year" "date" NOT NULL,
    "total_cost" numeric(10,2) DEFAULT 0 NOT NULL,
    "ad_spend" numeric(10,2) DEFAULT 0,
    "influencer_cost" numeric(10,2) DEFAULT 0,
    "content_cost" numeric(10,2) DEFAULT 0,
    "other_costs" numeric(10,2) DEFAULT 0,
    "notes" "text",
    "updated_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."marketing_costs" OWNER TO "postgres";


COMMENT ON TABLE "public"."marketing_costs" IS 'Custos de marketing mensais para cálculo de CAC';



COMMENT ON COLUMN "public"."marketing_costs"."month_year" IS 'Primeiro dia do mês (ex: 2026-03-01)';



CREATE TABLE IF NOT EXISTS "public"."messages" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "chat_id" "uuid" NOT NULL,
    "sender_id" "uuid" NOT NULL,
    "content" "text" NOT NULL,
    "is_read" boolean DEFAULT false,
    "is_filtered" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."news" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "category" "text" NOT NULL,
    "title" "text" NOT NULL,
    "summary" "text",
    "image_url" "text",
    "link" "text",
    "published_at" timestamp with time zone DEFAULT "now"(),
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."news" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."news_article_sources" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "article_id" "uuid" NOT NULL,
    "source_id" "uuid",
    "source_url" "text" NOT NULL,
    "portal_name" "text",
    "original_title" "text",
    "original_published_at" timestamp with time zone,
    "display_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."news_article_sources" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."news_articles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "ingestion_id" "uuid",
    "legacy_news_id" "uuid",
    "title" "text" NOT NULL,
    "subtitle" "text",
    "summary" "text",
    "content" "text",
    "agro_impact" "text",
    "references_block" "text",
    "slug" "text" NOT NULL,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "featured_image_url" "text",
    "featured_image_path" "text",
    "published_at" timestamp with time zone,
    "created_by" "uuid",
    "updated_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "editorial_category" "text" DEFAULT 'Mercado'::"text",
    CONSTRAINT "news_articles_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'in_review'::"text", 'published'::"text", 'archived'::"text"])))
);


ALTER TABLE "public"."news_articles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."news_generation_jobs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "article_id" "uuid",
    "ingestion_id" "uuid",
    "status" "text" DEFAULT 'queued'::"text" NOT NULL,
    "prompt_snapshot" "text",
    "model" "text",
    "response_payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "error_message" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "news_generation_jobs_status_check" CHECK (("status" = ANY (ARRAY['queued'::"text", 'processing'::"text", 'completed'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."news_generation_jobs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."news_ingestions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "source_id" "uuid",
    "source_url" "text" NOT NULL,
    "original_title" "text",
    "original_portal_name" "text",
    "original_published_at" timestamp with time zone,
    "original_author" "text",
    "featured_image_url" "text",
    "extracted_text" "text",
    "extracted_metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "capture_status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "capture_error" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "news_ingestions_capture_status_check" CHECK (("capture_status" = ANY (ARRAY['pending'::"text", 'captured'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."news_ingestions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."news_settings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "default_prompt" "text" DEFAULT 'Reescreva a materia com foco no agronegocio brasileiro, tom jornalistico profissional e sem copiar frases da fonte.'::"text" NOT NULL,
    "max_extracted_characters" integer DEFAULT 12000 NOT NULL,
    "summary_rule" "text" DEFAULT 'Gerar resumo em ate 320 caracteres.'::"text" NOT NULL,
    "show_agro_impact" boolean DEFAULT true NOT NULL,
    "references_template" "text" DEFAULT 'Fonte original consultada: {{portal_name}} | {{source_url}} | Publicado em {{original_published_at}}'::"text" NOT NULL,
    "default_generated_status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "openai_model" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "news_settings_default_generated_status_check" CHECK (("default_generated_status" = ANY (ARRAY['draft'::"text", 'in_review'::"text", 'published'::"text", 'archived'::"text"])))
);


ALTER TABLE "public"."news_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."news_social_publications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "article_id" "uuid" NOT NULL,
    "platform" "text" NOT NULL,
    "publication_type" "text" NOT NULL,
    "status" "text" DEFAULT 'queued'::"text" NOT NULL,
    "target_label" "text",
    "article_title" "text",
    "article_slug" "text",
    "external_publication_id" "text",
    "external_publication_url" "text",
    "caption" "text",
    "request_payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "response_payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "error_message" "text",
    "published_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "news_social_publications_platform_check" CHECK (("platform" = ANY (ARRAY['instagram'::"text", 'linkedin'::"text"]))),
    CONSTRAINT "news_social_publications_publication_type_check" CHECK (("publication_type" = ANY (ARRAY['story'::"text", 'post'::"text"]))),
    CONSTRAINT "news_social_publications_status_check" CHECK (("status" = ANY (ARRAY['queued'::"text", 'processing'::"text", 'published'::"text", 'failed'::"text", 'disabled'::"text"])))
);


ALTER TABLE "public"."news_social_publications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."news_social_settings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "instagram_enabled" boolean DEFAULT false NOT NULL,
    "instagram_username" "text",
    "instagram_business_account_id" "text",
    "instagram_access_token" "text",
    "linkedin_enabled" boolean DEFAULT false NOT NULL,
    "linkedin_profile_type" "text" DEFAULT 'organization'::"text" NOT NULL,
    "linkedin_profile_label" "text",
    "linkedin_author_urn" "text",
    "linkedin_access_token" "text",
    "auto_publish_instagram_story" boolean DEFAULT false NOT NULL,
    "auto_publish_linkedin_post" boolean DEFAULT true NOT NULL,
    "instagram_story_template" "text",
    "linkedin_post_template" "text",
    "article_url_base" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "default_instagram_story_image_url" "text",
    "default_instagram_story_image_path" "text",
    "default_linkedin_image_url" "text",
    "default_linkedin_image_path" "text",
    "meta_user_access_token" "text",
    "facebook_page_id" "text",
    "facebook_page_name" "text",
    "facebook_page_access_token" "text",
    "instagram_connection_status" "text" DEFAULT 'disconnected'::"text",
    "instagram_connected_at" timestamp with time zone,
    "instagram_token_expires_at" timestamp with time zone,
    "instagram_token_last_validated_at" timestamp with time zone,
    CONSTRAINT "news_social_settings_instagram_connection_status_check" CHECK (("instagram_connection_status" = ANY (ARRAY['disconnected'::"text", 'connected'::"text", 'expiring_soon'::"text", 'expired'::"text", 'error'::"text"]))),
    CONSTRAINT "news_social_settings_linkedin_profile_type_check" CHECK (("linkedin_profile_type" = ANY (ARRAY['member'::"text", 'organization'::"text"])))
);


ALTER TABLE "public"."news_social_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."news_sources" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "domain" "text" NOT NULL,
    "notes" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "capture_type" "text" DEFAULT 'manual_url'::"text" NOT NULL,
    "usage_count" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "news_sources_capture_type_check" CHECK (("capture_type" = ANY (ARRAY['manual_url'::"text", 'scraping'::"text", 'api'::"text", 'rss'::"text"])))
);


ALTER TABLE "public"."news_sources" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."newsletter_campaign_email_dispatch_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "triggered_by" "text" DEFAULT 'admin'::"text" NOT NULL,
    "status" "text" DEFAULT 'processing'::"text" NOT NULL,
    "requested_limit" integer DEFAULT 25 NOT NULL,
    "processed_count" integer DEFAULT 0 NOT NULL,
    "sent_count" integer DEFAULT 0 NOT NULL,
    "failed_count" integer DEFAULT 0 NOT NULL,
    "skipped_count" integer DEFAULT 0 NOT NULL,
    "notes" "text",
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "finished_at" timestamp with time zone,
    CONSTRAINT "newsletter_campaign_email_dispatch_logs_status_check" CHECK (("status" = ANY (ARRAY['processing'::"text", 'completed'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."newsletter_campaign_email_dispatch_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."newsletter_campaign_email_jobs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "campaign_id" "uuid" NOT NULL,
    "recipient_email" "text" NOT NULL,
    "recipient_name" "text",
    "source" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "provider" "text" DEFAULT 'smtp'::"text" NOT NULL,
    "attempts" integer DEFAULT 0 NOT NULL,
    "last_error" "text",
    "queued_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "processing_started_at" timestamp with time zone,
    "last_attempt_at" timestamp with time zone,
    "sent_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "newsletter_campaign_email_jobs_source_check" CHECK (("source" = ANY (ARRAY['newsletter'::"text", 'platform_user'::"text", 'imported'::"text"]))),
    CONSTRAINT "newsletter_campaign_email_jobs_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'processing'::"text", 'sent'::"text", 'failed'::"text", 'skipped'::"text"])))
);


ALTER TABLE "public"."newsletter_campaign_email_jobs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."newsletter_campaigns" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "subject" "text" NOT NULL,
    "preview_text" "text",
    "html_content" "text" NOT NULL,
    "audience_type" "text" NOT NULL,
    "imported_emails" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "total_recipients" integer DEFAULT 0 NOT NULL,
    "sent_count" integer DEFAULT 0 NOT NULL,
    "failed_count" integer DEFAULT 0 NOT NULL,
    "skipped_count" integer DEFAULT 0 NOT NULL,
    "queued_at" timestamp with time zone,
    "last_sent_at" timestamp with time zone,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "newsletter_campaigns_audience_type_check" CHECK (("audience_type" = ANY (ARRAY['newsletter'::"text", 'platform_users'::"text", 'imported'::"text"]))),
    CONSTRAINT "newsletter_campaigns_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'queued'::"text", 'sending'::"text", 'completed'::"text", 'failed'::"text", 'paused'::"text"])))
);


ALTER TABLE "public"."newsletter_campaigns" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."newsletter_subscriptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "email" "text" NOT NULL,
    "normalized_email" "text" NOT NULL,
    "source" "text" DEFAULT 'footer'::"text" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."newsletter_subscriptions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notifications" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "type" "text" NOT NULL,
    "title" "text" NOT NULL,
    "content" "text" NOT NULL,
    "is_read" boolean DEFAULT false,
    "link" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "notifications_type_check" CHECK (("type" = ANY (ARRAY['new_message'::"text", 'new_lead'::"text", 'radar_match'::"text", 'system'::"text", 'plan_alert'::"text", 'account_verification'::"text", 'ad_edit_rejected'::"text", 'SYSTEM'::"text", 'SECURITY'::"text", 'PROMO'::"text", 'AD_STATUS'::"text", 'NEW_MESSAGE'::"text"])))
);


ALTER TABLE "public"."notifications" OWNER TO "postgres";


COMMENT ON CONSTRAINT "notifications_type_check" ON "public"."notifications" IS 'Tipos de notificacao permitidos pelo app, incluindo radar, verificacao documental e tipos legados.';



CREATE TABLE IF NOT EXISTS "public"."opportunities" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "announcement_id" "uuid" NOT NULL,
    "marked_at" timestamp with time zone DEFAULT "now"(),
    "expires_at" timestamp with time zone NOT NULL
);


ALTER TABLE "public"."opportunities" OWNER TO "postgres";


COMMENT ON TABLE "public"."opportunities" IS 'Oportunidades (selo de 7 dias após queda de preço)';



CREATE OR REPLACE VIEW "public"."opportunities_view" AS
 SELECT "o"."id",
    "o"."user_id",
    "o"."announcement_id",
    "o"."expires_at",
    "a"."title" AS "announcement_title",
    "a"."price" AS "announcement_price"
   FROM ("public"."opportunities" "o"
     LEFT JOIN "public"."announcements" "a" ON (("o"."announcement_id" = "a"."id")));


ALTER VIEW "public"."opportunities_view" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."opportunity_alerts" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "name" character varying(255) NOT NULL,
    "category_id" "uuid",
    "subcategory_id" "uuid",
    "state" character varying(2),
    "radius_km" integer DEFAULT 0,
    "min_price" numeric(15,2),
    "max_price" numeric(15,2),
    "keywords" "text"[],
    "status" character varying(20) DEFAULT 'ativo'::character varying,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "last_match_at" timestamp with time zone,
    "category_group_id" "uuid",
    CONSTRAINT "opportunity_alerts_status_check" CHECK ((("status")::"text" = ANY ((ARRAY['ativo'::character varying, 'pausado'::character varying])::"text"[])))
);


ALTER TABLE "public"."opportunity_alerts" OWNER TO "postgres";


COMMENT ON TABLE "public"."opportunity_alerts" IS 'Alertas configurados pelos usuários para receber notificações de novas oportunidades';



COMMENT ON COLUMN "public"."opportunity_alerts"."radius_km" IS 'Raio em km para busca geolocalizada (0 = desabilitado, busca apenas por estado)';



COMMENT ON COLUMN "public"."opportunity_alerts"."keywords" IS 'Array de palavras-chave para buscar em título e descrição dos anúncios';



COMMENT ON COLUMN "public"."opportunity_alerts"."category_group_id" IS 'Grupo principal do alerta de oportunidade, preenchido a partir da categoria atual para suportar a futura hierarquia oficial.';



CREATE TABLE IF NOT EXISTS "public"."opportunity_matches" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "alert_id" "uuid" NOT NULL,
    "announcement_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "is_viewed" boolean DEFAULT false,
    "is_dismissed" boolean DEFAULT false,
    "viewed_at" timestamp with time zone,
    "match_score" integer DEFAULT 100,
    "match_reason" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."opportunity_matches" OWNER TO "postgres";


COMMENT ON TABLE "public"."opportunity_matches" IS 'Registro de anúncios que deram match com alertas configurados';



COMMENT ON COLUMN "public"."opportunity_matches"."match_score" IS 'Score de 0-100 indicando relevância do match';



COMMENT ON COLUMN "public"."opportunity_matches"."match_reason" IS 'JSON com detalhes: {category: true, price: true, keywords: ["trator", "john deere"], distance_km: 45}';



CREATE TABLE IF NOT EXISTS "public"."payment_settings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "is_production" boolean DEFAULT false NOT NULL,
    "last_updated_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "preferred_checkout_provider" "text" DEFAULT 'asaas'::"text" NOT NULL,
    "asaas_api_key" "text",
    "asaas_webhook_token" "text",
    CONSTRAINT "payment_settings_preferred_checkout_provider_check" CHECK (("preferred_checkout_provider" = 'asaas'::"text")),
    CONSTRAINT "single_row" CHECK (("id" = '00000000-0000-0000-0000-000000000005'::"uuid"))
);


ALTER TABLE "public"."payment_settings" OWNER TO "postgres";


COMMENT ON TABLE "public"."payment_settings" IS 'Configurações de integração com Mercado Pago (singleton)';



COMMENT ON COLUMN "public"."payment_settings"."is_production" IS 'false = Sandbox, true = Produção';



COMMENT ON COLUMN "public"."payment_settings"."preferred_checkout_provider" IS 'Provedor planejado para o checkout principal';



CREATE TABLE IF NOT EXISTS "public"."payments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "subscription_id" "uuid",
    "plan_id" "uuid",
    "provider" "text" DEFAULT 'asaas'::"text" NOT NULL,
    "provider_payment_id" "text" NOT NULL,
    "provider_preference_id" "text",
    "external_reference" "text",
    "billing_cycle" "text",
    "description" "text",
    "amount" numeric(12,2) NOT NULL,
    "currency" "text" DEFAULT 'BRL'::"text" NOT NULL,
    "status" "text" NOT NULL,
    "status_detail" "text",
    "payment_method" "text",
    "receipt_url" "text",
    "invoice_number" "text",
    "invoice_pdf_url" "text",
    "invoice_status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "paid_at" timestamp with time zone,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "invoice_storage_path" "text",
    "invoice_issued_at" timestamp with time zone,
    "invoice_notes" "text",
    "fiscal_provider" "text",
    "fiscal_external_id" "text",
    "fiscal_status" "text" DEFAULT 'not_requested'::"text" NOT NULL,
    "fiscal_last_attempt_at" timestamp with time zone,
    "fiscal_error_message" "text",
    "invoice_xml_url" "text",
    "invoice_xml_storage_path" "text",
    "booster_id" "uuid",
    "invoice_issued_on" "date",
    "provider_customer_id" "text",
    "provider_subscription_id" "text",
    "provider_invoice_id" "text",
    "provider_checkout_session_id" "text",
    "billing_model" "text",
    CONSTRAINT "payments_billing_cycle_check" CHECK (("billing_cycle" = ANY (ARRAY['monthly'::"text", 'yearly'::"text"]))),
    CONSTRAINT "payments_billing_model_check" CHECK (("billing_model" = ANY (ARRAY['one_time'::"text", 'recurring'::"text"]))),
    CONSTRAINT "payments_fiscal_status_check" CHECK (("fiscal_status" = ANY (ARRAY['not_requested'::"text", 'queued'::"text", 'processing'::"text", 'issued'::"text", 'failed'::"text", 'manual'::"text"]))),
    CONSTRAINT "payments_invoice_status_check" CHECK (("invoice_status" = ANY (ARRAY['pending'::"text", 'available'::"text", 'failed'::"text", 'not_applicable'::"text"]))),
    CONSTRAINT "payments_provider_check" CHECK (("provider" = ANY (ARRAY['asaas'::"text", 'legacy'::"text"]))),
    CONSTRAINT "payments_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'rejected'::"text", 'cancelled'::"text", 'refunded'::"text", 'in_process'::"text", 'charged_back'::"text"])))
);


ALTER TABLE "public"."payments" OWNER TO "postgres";


COMMENT ON COLUMN "public"."payments"."fiscal_status" IS 'Status interno da automacao fiscal do pagamento';



CREATE TABLE IF NOT EXISTS "public"."plan_alert_email_dispatch_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "triggered_by" "text" NOT NULL,
    "status" "text" DEFAULT 'processing'::"text" NOT NULL,
    "requested_limit" integer DEFAULT 25 NOT NULL,
    "processed_count" integer DEFAULT 0 NOT NULL,
    "sent_count" integer DEFAULT 0 NOT NULL,
    "failed_count" integer DEFAULT 0 NOT NULL,
    "skipped_count" integer DEFAULT 0 NOT NULL,
    "notes" "text",
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "finished_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "plan_alert_email_dispatch_logs_requested_limit_check" CHECK (("requested_limit" >= 1)),
    CONSTRAINT "plan_alert_email_dispatch_logs_status_check" CHECK (("status" = ANY (ARRAY['processing'::"text", 'completed'::"text", 'failed'::"text"]))),
    CONSTRAINT "plan_alert_email_dispatch_logs_triggered_by_check" CHECK (("triggered_by" = ANY (ARRAY['cron'::"text", 'admin'::"text"])))
);


ALTER TABLE "public"."plan_alert_email_dispatch_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."plan_alert_email_jobs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "notification_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "recipient_email" "text",
    "recipient_name" "text",
    "alert_kind" "text" NOT NULL,
    "notification_title" "text" NOT NULL,
    "notification_content" "text" NOT NULL,
    "link" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "provider" "text" DEFAULT 'smtp'::"text" NOT NULL,
    "attempts" integer DEFAULT 0 NOT NULL,
    "last_error" "text",
    "queued_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "processing_started_at" timestamp with time zone,
    "last_attempt_at" timestamp with time zone,
    "sent_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "plan_alert_email_jobs_alert_kind_check" CHECK (("alert_kind" = ANY (ARRAY['conversion'::"text", 'renewal'::"text", 'edit_rejected'::"text", 'ad_paused'::"text", 'ad_resumed'::"text", 'ad_deleted'::"text", 'announcement_reported_to_review'::"text"]))),
    CONSTRAINT "plan_alert_email_jobs_attempts_check" CHECK (("attempts" >= 0)),
    CONSTRAINT "plan_alert_email_jobs_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'processing'::"text", 'sent'::"text", 'failed'::"text", 'skipped'::"text"])))
);


ALTER TABLE "public"."plan_alert_email_jobs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."price_drop_notifications" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "announcement_id" "uuid" NOT NULL,
    "old_price" numeric(12,2) NOT NULL,
    "new_price" numeric(12,2) NOT NULL,
    "percent_drop" numeric(5,2) NOT NULL,
    "channels" "text"[] DEFAULT '{}'::"text"[],
    "email_sent" boolean DEFAULT false,
    "push_sent" boolean DEFAULT false,
    "notified_at" timestamp with time zone DEFAULT "now"(),
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."price_drop_notifications" OWNER TO "postgres";


COMMENT ON TABLE "public"."price_drop_notifications" IS 'Notificações de queda de preço enviadas';



CREATE OR REPLACE VIEW "public"."pricing_plans_view" AS
 SELECT "id",
    "name",
    "description",
    "position",
    "is_active",
    "is_popular",
    "monthly_price",
    "yearly_price",
    "button_text",
    "display_features",
    "comparison",
    "max_ads",
    "ad_duration_days",
    "has_verification_badge",
    "has_seller_store"
   FROM "public"."plans"
  WHERE ("is_active" = true)
  ORDER BY "position";


ALTER VIEW "public"."pricing_plans_view" OWNER TO "postgres";


COMMENT ON VIEW "public"."pricing_plans_view" IS 'View otimizada de planos ativos para página de pricing';



CREATE TABLE IF NOT EXISTS "public"."privacy_page_content" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "last_updated_date" character varying(50) DEFAULT '15 de Agosto de 2024'::character varying,
    "section1_title" character varying(200) DEFAULT '1. Dados que Coletamos'::character varying,
    "section1_content" "text" NOT NULL,
    "section2_title" character varying(200) DEFAULT '2. Como Usamos Seus Dados'::character varying,
    "section2_content" "text" NOT NULL,
    "section3_title" character varying(200) DEFAULT '3. Compartilhamento com Terceiros'::character varying,
    "section3_content" "text" NOT NULL,
    "section4_title" character varying(200) DEFAULT '4. Seus Direitos (LGPD)'::character varying,
    "section4_content" "text" NOT NULL,
    "section5_title" character varying(200) DEFAULT '5. Retenção e Segurança'::character varying,
    "section5_content" "text" NOT NULL,
    "section6_title" character varying(200) DEFAULT '6. Encarregado de Dados (DPO)'::character varying,
    "section6_content" "text" NOT NULL,
    "last_updated_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "single_row" CHECK (("id" = '00000000-0000-0000-0000-000000000003'::"uuid"))
);


ALTER TABLE "public"."privacy_page_content" OWNER TO "postgres";


COMMENT ON TABLE "public"."privacy_page_content" IS 'Conteúdo estruturado da página Política de Privacidade (singleton)';



CREATE TABLE IF NOT EXISTS "public"."promotion_plan_codes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "code" "text" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "plan_id" "uuid" NOT NULL,
    "duration_amount" integer DEFAULT 1 NOT NULL,
    "duration_unit" "text" DEFAULT 'months'::"text" NOT NULL,
    "max_redemptions" integer,
    "max_redemptions_per_user" integer DEFAULT 1 NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "grant_mode" "text" DEFAULT 'replace_active'::"text" NOT NULL,
    "redeemed_count" integer DEFAULT 0 NOT NULL,
    "internal_notes" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "starts_on" "date",
    "expires_on" "date",
    CONSTRAINT "promotion_plan_codes_duration_amount_check" CHECK (("duration_amount" > 0)),
    CONSTRAINT "promotion_plan_codes_duration_unit_check" CHECK (("duration_unit" = ANY (ARRAY['days'::"text", 'months'::"text", 'years'::"text"]))),
    CONSTRAINT "promotion_plan_codes_grant_mode_check" CHECK (("grant_mode" = ANY (ARRAY['replace_active'::"text", 'extend_same_plan'::"text"]))),
    CONSTRAINT "promotion_plan_codes_max_redemptions_per_user_check" CHECK (("max_redemptions_per_user" > 0)),
    CONSTRAINT "promotion_plan_codes_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'paused'::"text", 'expired'::"text"])))
);


ALTER TABLE "public"."promotion_plan_codes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."promotion_plan_redemptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "code_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "plan_id" "uuid" NOT NULL,
    "subscription_id" "uuid",
    "status" "text" DEFAULT 'redeemed'::"text" NOT NULL,
    "period_start" timestamp with time zone NOT NULL,
    "period_end" timestamp with time zone NOT NULL,
    "redeemed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "promotion_plan_redemptions_status_check" CHECK (("status" = ANY (ARRAY['redeemed'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."promotion_plan_redemptions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."publication_moderation_rules" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "rule_kind" "text" NOT NULL,
    "action" "text" DEFAULT 'review'::"text" NOT NULL,
    "target" "text" DEFAULT 'both'::"text" NOT NULL,
    "pattern" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "publication_moderation_rules_action_check" CHECK (("action" = ANY (ARRAY['review'::"text", 'block'::"text"]))),
    CONSTRAINT "publication_moderation_rules_rule_kind_check" CHECK (("rule_kind" = ANY (ARRAY['keyword'::"text", 'regex'::"text", 'category'::"text", 'min_description_length'::"text", 'contact_info'::"text", 'external_link'::"text", 'require_image'::"text"]))),
    CONSTRAINT "publication_moderation_rules_target_check" CHECK (("target" = ANY (ARRAY['title'::"text", 'description'::"text", 'both'::"text", 'category'::"text", 'images'::"text"])))
);


ALTER TABLE "public"."publication_moderation_rules" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."quotations" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "name" "text" NOT NULL,
    "value" "text" NOT NULL,
    "unit" "text" NOT NULL,
    "change" numeric(5,2) DEFAULT 0,
    "trend" "text",
    "last_update" timestamp with time zone DEFAULT "now"(),
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "quotations_trend_check" CHECK (("trend" = ANY (ARRAY['up'::"text", 'down'::"text", 'stable'::"text"])))
);


ALTER TABLE "public"."quotations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."radar_match_email_dispatch_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "triggered_by" "text" NOT NULL,
    "status" "text" DEFAULT 'processing'::"text" NOT NULL,
    "requested_limit" integer DEFAULT 25 NOT NULL,
    "processed_count" integer DEFAULT 0 NOT NULL,
    "sent_count" integer DEFAULT 0 NOT NULL,
    "failed_count" integer DEFAULT 0 NOT NULL,
    "skipped_count" integer DEFAULT 0 NOT NULL,
    "notes" "text",
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "finished_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "radar_match_email_dispatch_logs_requested_limit_check" CHECK (("requested_limit" >= 1)),
    CONSTRAINT "radar_match_email_dispatch_logs_status_check" CHECK (("status" = ANY (ARRAY['processing'::"text", 'completed'::"text", 'failed'::"text"]))),
    CONSTRAINT "radar_match_email_dispatch_logs_triggered_by_check" CHECK (("triggered_by" = ANY (ARRAY['cron'::"text", 'admin'::"text"])))
);


ALTER TABLE "public"."radar_match_email_dispatch_logs" OWNER TO "postgres";


COMMENT ON TABLE "public"."radar_match_email_dispatch_logs" IS 'Log das execucoes de processamento dos e-mails do Radar.';



CREATE TABLE IF NOT EXISTS "public"."radar_match_email_jobs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "match_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "announcement_id" "uuid" NOT NULL,
    "recipient_email" "text",
    "recipient_name" "text",
    "announcement_title" "text",
    "alert_name" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "provider" "text" DEFAULT 'smtp'::"text" NOT NULL,
    "attempts" integer DEFAULT 0 NOT NULL,
    "last_error" "text",
    "queued_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "processing_started_at" timestamp with time zone,
    "last_attempt_at" timestamp with time zone,
    "sent_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "radar_match_email_jobs_attempts_check" CHECK (("attempts" >= 0)),
    CONSTRAINT "radar_match_email_jobs_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'processing'::"text", 'sent'::"text", 'failed'::"text", 'skipped'::"text"])))
);


ALTER TABLE "public"."radar_match_email_jobs" OWNER TO "postgres";


COMMENT ON TABLE "public"."radar_match_email_jobs" IS 'Fila de envios por e-mail para matches do Radar de Oportunidades.';



CREATE TABLE IF NOT EXISTS "public"."rate_limit_counters" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "action" "text" NOT NULL,
    "request_count" integer DEFAULT 1 NOT NULL,
    "window_start" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."rate_limit_counters" OWNER TO "postgres";


COMMENT ON TABLE "public"."rate_limit_counters" IS 'Contadores de rate limiting por usuário e ação — VULN-007';



CREATE TABLE IF NOT EXISTS "public"."renewal_notification_settings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "is_enabled" boolean DEFAULT true NOT NULL,
    "daily_user_limit" integer DEFAULT 1 NOT NULL,
    "notify_seven_days_before" boolean DEFAULT true NOT NULL,
    "notify_three_days_before" boolean DEFAULT true NOT NULL,
    "notify_one_day_before" boolean DEFAULT true NOT NULL,
    "notify_on_expiration_day" boolean DEFAULT true NOT NULL,
    "notify_after_expiration" boolean DEFAULT true NOT NULL,
    "days_after_expiration" integer DEFAULT 1 NOT NULL,
    "show_dashboard_toast" boolean DEFAULT true NOT NULL,
    "updated_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "templates" "jsonb" DEFAULT '{"expired": {"cta": "Reativar assinatura", "link": "/minha-conta/meu-plano?source=renewal", "title": "Renovacao AGRO BW: seu plano expirou", "message": "Seu plano \"{nome_plano}\" ja expirou em {data_vencimento}. Reative a assinatura para recuperar recursos pagos, exposicao e continuidade operacional.", "subject": "Seu plano expirou", "supportText": "Enquanto o plano permanecer vencido, voce pode perder alcance, recursos premium e novas oportunidades de conversao."}, "one_day": {"cta": "Renovar hoje", "link": "/minha-conta/meu-plano?source=renewal", "title": "Renovacao AGRO BW: seu plano expira amanha", "message": "Seu plano \"{nome_plano}\" vence amanha, em {data_vencimento}. Garanta a renovacao para continuar com acesso aos recursos pagos sem pausa.", "subject": "Seu plano vence amanha", "supportText": "Se voce renovar hoje, evita qualquer interrupcao nos beneficios e no acompanhamento dos seus resultados."}, "seven_days": {"cta": "Renovar com antecedencia", "link": "/minha-conta/meu-plano?source=renewal", "title": "Renovacao AGRO BW: seu plano expira em 7 dias", "message": "Seu plano \"{nome_plano}\" expira em {dias_restantes} dias, em {data_vencimento}. Renove com antecedencia para manter anuncios, destaques e beneficios ativos sem interrupcao.", "subject": "Seu plano expira em 7 dias", "supportText": "Organizar a renovacao agora ajuda a manter sua operacao e sua exposicao comercial sem pausa."}, "three_days": {"cta": "Revisar renovacao", "link": "/minha-conta/meu-plano?source=renewal", "title": "Renovacao AGRO BW: seu plano expira em 3 dias", "message": "Seu plano \"{nome_plano}\" expira em {dias_restantes} dias, em {data_vencimento}. Vale revisar a renovacao agora para nao perder sua exposicao na plataforma.", "subject": "Seu plano expira em 3 dias", "supportText": "Esse e um bom momento para confirmar a renovacao e evitar perda de ritmo nos seus anuncios."}, "expiration_day": {"cta": "Renovar agora", "link": "/minha-conta/meu-plano?source=renewal", "title": "Renovacao AGRO BW: seu plano vence hoje", "message": "Seu plano \"{nome_plano}\" vence hoje. Renove agora para nao interromper seus beneficios e a exposicao dos seus anuncios.", "subject": "Seu plano vence hoje", "supportText": "Uma renovacao ainda hoje ajuda a preservar continuidade operacional e acesso aos recursos do plano."}}'::"jsonb" NOT NULL,
    CONSTRAINT "renewal_notification_settings_daily_limit_check" CHECK (("daily_user_limit" >= 0)),
    CONSTRAINT "renewal_notification_settings_days_after_expiration_check" CHECK (("days_after_expiration" >= 1))
);


ALTER TABLE "public"."renewal_notification_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."search_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "term" "text" NOT NULL,
    "normalized_term" "text" NOT NULL,
    "source" "text" DEFAULT 'hero_search'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."search_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."security_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "email" "text",
    "attempted_route" "text" NOT NULL,
    "attempted_action" "text",
    "ip_address" "inet",
    "user_agent" "text",
    "severity" "public"."severity_level" DEFAULT 'warning'::"public"."severity_level",
    "reason" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "valid_severity" CHECK (("severity" = ANY (ARRAY['info'::"public"."severity_level", 'warning'::"public"."severity_level", 'critical'::"public"."severity_level", 'blocked'::"public"."severity_level"])))
);


ALTER TABLE "public"."security_events" OWNER TO "postgres";


COMMENT ON TABLE "public"."security_events" IS 'Auditoria de tentativas de acesso não autorizado';



COMMENT ON COLUMN "public"."security_events"."user_id" IS 'ID do usuário que tentou acessar (null se anônimo)';



COMMENT ON COLUMN "public"."security_events"."email" IS 'Email do usuário (cache para análise)';



COMMENT ON COLUMN "public"."security_events"."attempted_route" IS 'Rota que foi bloqueada';



COMMENT ON COLUMN "public"."security_events"."ip_address" IS 'Endereço IP da tentativa';



COMMENT ON COLUMN "public"."security_events"."severity" IS 'Nível de criticidade: info, warning, critical, blocked';



COMMENT ON COLUMN "public"."security_events"."metadata" IS 'Dados adicionais em formato JSON';



CREATE TABLE IF NOT EXISTS "public"."seller_stores" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "slug" "text" NOT NULL,
    "store_name" "text" NOT NULL,
    "description" "text",
    "logo_url" "text",
    "cover_url" "text",
    "whatsapp" "text",
    "email" "text",
    "instagram_url" "text",
    "website_url" "text",
    "city" "text",
    "state" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "is_verified" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "facebook_url" "text",
    "linkedin_url" "text",
    "is_store_feature_enabled" boolean DEFAULT false NOT NULL,
    "is_paused_due_to_plan" boolean DEFAULT false NOT NULL,
    "cover_position_y" integer DEFAULT 50 NOT NULL,
    "cover_position_x" integer DEFAULT 50 NOT NULL,
    CONSTRAINT "seller_stores_cover_position_x_check" CHECK ((("cover_position_x" >= 0) AND ("cover_position_x" <= 100))),
    CONSTRAINT "seller_stores_cover_position_y_check" CHECK ((("cover_position_y" >= 0) AND ("cover_position_y" <= 100)))
);


ALTER TABLE "public"."seller_stores" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."site_page_views" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "session_id" "text" NOT NULL,
    "user_id" "uuid",
    "page_path" "text" NOT NULL,
    "page_type" "text" NOT NULL,
    "page_label" "text",
    "entity_id" "uuid",
    "entity_key" "text",
    "referrer" "text",
    "user_agent" "text",
    "device_type" "text",
    "is_admin_area" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "user_city" "text",
    "user_state" "text"
);


ALTER TABLE "public"."site_page_views" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."site_popup_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "popup_id" "uuid" NOT NULL,
    "event_type" "text" NOT NULL,
    "path" "text",
    "session_key" "text",
    "user_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "site_popup_events_event_type_check" CHECK (("event_type" = ANY (ARRAY['view'::"text", 'click'::"text", 'dismiss'::"text"])))
);


ALTER TABLE "public"."site_popup_events" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."site_popup_metrics" AS
 SELECT "popup_id",
    ("count"(*) FILTER (WHERE ("event_type" = 'view'::"text")))::integer AS "views",
    ("count"(*) FILTER (WHERE ("event_type" = 'click'::"text")))::integer AS "clicks",
    ("count"(*) FILTER (WHERE ("event_type" = 'dismiss'::"text")))::integer AS "dismissals"
   FROM "public"."site_popup_events"
  GROUP BY "popup_id";


ALTER VIEW "public"."site_popup_metrics" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."site_popup_user_states" (
    "popup_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "first_seen_at" timestamp with time zone,
    "last_seen_at" timestamp with time zone,
    "dismissed_at" timestamp with time zone,
    "clicked_at" timestamp with time zone,
    "seen_count" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."site_popup_user_states" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."site_popups" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "title" "text" NOT NULL,
    "message" "text" NOT NULL,
    "support_text" "text",
    "primary_button_label" "text" DEFAULT 'Criar minha conta'::"text" NOT NULL,
    "primary_button_link" "text" DEFAULT '/cadastro'::"text" NOT NULL,
    "delay_seconds" integer DEFAULT 5 NOT NULL,
    "is_active" boolean DEFAULT false NOT NULL,
    "show_once" boolean DEFAULT true NOT NULL,
    "audience" "text" DEFAULT 'visitors'::"text" NOT NULL,
    "page_scope" "text" DEFAULT 'site'::"text" NOT NULL,
    "updated_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "custom_path" "text",
    "display_order" integer DEFAULT 0 NOT NULL,
    "starts_at" timestamp with time zone,
    "ends_at" timestamp with time zone,
    CONSTRAINT "site_popups_audience_check" CHECK (("audience" = ANY (ARRAY['visitors'::"text", 'authenticated'::"text", 'all'::"text"]))),
    CONSTRAINT "site_popups_delay_seconds_check" CHECK ((("delay_seconds" >= 0) AND ("delay_seconds" <= 120))),
    CONSTRAINT "site_popups_page_scope_check" CHECK (("page_scope" = ANY (ARRAY['site'::"text", 'home'::"text", 'plans'::"text", 'custom'::"text"])))
);


ALTER TABLE "public"."site_popups" OWNER TO "postgres";


COMMENT ON TABLE "public"."site_popups" IS 'Campanhas de pop-up exibidas no site, controladas pelo painel administrativo.';



CREATE TABLE IF NOT EXISTS "public"."site_presence" (
    "session_id" "text" NOT NULL,
    "user_id" "uuid",
    "current_path" "text" NOT NULL,
    "page_type" "text" NOT NULL,
    "page_label" "text",
    "device_type" "text",
    "is_admin_area" boolean DEFAULT false NOT NULL,
    "last_seen_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "user_city" "text",
    "user_state" "text"
);


ALTER TABLE "public"."site_presence" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."site_sponsor_clicks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "sponsor_id" "uuid" NOT NULL,
    "session_id" "text" NOT NULL,
    "user_id" "uuid",
    "page_path" "text" DEFAULT '/'::"text" NOT NULL,
    "slot_position" integer,
    "user_city" "text",
    "user_state" "text",
    "device_type" "text",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "placement_key" "text" DEFAULT 'legacy'::"text" NOT NULL
);


ALTER TABLE "public"."site_sponsor_clicks" OWNER TO "postgres";


COMMENT ON TABLE "public"."site_sponsor_clicks" IS 'Eventos de clique dos patrocinadores exibidos ao publico na Vitrine Premium.';



CREATE TABLE IF NOT EXISTS "public"."site_sponsor_impressions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "sponsor_id" "uuid" NOT NULL,
    "session_id" "text" NOT NULL,
    "user_id" "uuid",
    "page_path" "text" DEFAULT '/'::"text" NOT NULL,
    "slot_position" integer,
    "user_city" "text",
    "user_state" "text",
    "device_type" "text",
    "impression_date" "date" DEFAULT (("now"() AT TIME ZONE 'America/Sao_Paulo'::"text"))::"date" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "placement_key" "text" DEFAULT 'legacy'::"text" NOT NULL
);


ALTER TABLE "public"."site_sponsor_impressions" OWNER TO "postgres";


COMMENT ON TABLE "public"."site_sponsor_impressions" IS 'Eventos de impressao dos patrocinadores exibidos ao publico na Vitrine Premium.';



CREATE TABLE IF NOT EXISTS "public"."site_sponsors" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_name" "text" NOT NULL,
    "contact_name" "text",
    "email" "text",
    "phone" "text",
    "segment" "text" NOT NULL,
    "logo_url" "text",
    "banner_url" "text",
    "target_type" "text" DEFAULT 'site'::"text" NOT NULL,
    "target_url" "text",
    "slot_position" integer,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "notes" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "metric_recipient_emails" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "metric_auto_send_enabled" boolean DEFAULT false NOT NULL,
    "metric_auto_send_frequency" "text" DEFAULT 'weekly'::"text" NOT NULL,
    "metric_auto_send_day" integer DEFAULT 1 NOT NULL,
    "metric_auto_last_queued_at" timestamp with time zone,
    "starts_on" "date" DEFAULT (("now"() AT TIME ZONE 'America/Sao_Paulo'::"text"))::"date" NOT NULL,
    "ends_on" "date",
    "show_on_home_carousel" boolean DEFAULT false NOT NULL,
    "home_badge_text" "text",
    "home_title" "text",
    "home_subtitle" "text",
    "home_button_text" "text",
    "home_carousel_sort_order" integer,
    CONSTRAINT "site_sponsors_metric_auto_send_day_check" CHECK ((("metric_auto_send_day" >= 1) AND ("metric_auto_send_day" <= 28))),
    CONSTRAINT "site_sponsors_metric_auto_send_frequency_check" CHECK (("metric_auto_send_frequency" = ANY (ARRAY['weekly'::"text", 'monthly'::"text"]))),
    CONSTRAINT "site_sponsors_slot_position_check" CHECK ((("slot_position" >= 1) AND ("slot_position" <= 6))),
    CONSTRAINT "site_sponsors_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'paused'::"text", 'expired'::"text"]))),
    CONSTRAINT "site_sponsors_target_type_check" CHECK (("target_type" = ANY (ARRAY['site'::"text", 'whatsapp'::"text"])))
);


ALTER TABLE "public"."site_sponsors" OWNER TO "postgres";


COMMENT ON COLUMN "public"."site_sponsors"."metric_recipient_emails" IS 'Lista de e-mails salvos pelo admin para receber relatórios de métricas da Vitrine Premium.';



COMMENT ON COLUMN "public"."site_sponsors"."metric_auto_send_enabled" IS 'Define se o patrocinador participa da automação de envio de relatórios de métricas.';



COMMENT ON COLUMN "public"."site_sponsors"."metric_auto_send_frequency" IS 'Frequência da automação dos relatórios: semanal ou mensal.';



COMMENT ON COLUMN "public"."site_sponsors"."metric_auto_send_day" IS 'Dia da automação. Para semanal usa 1-7 (segunda-domingo). Para mensal usa 1-28.';



COMMENT ON COLUMN "public"."site_sponsors"."metric_auto_last_queued_at" IS 'Última vez em que a automação enfileirou relatórios para este patrocinador.';



CREATE TABLE IF NOT EXISTS "public"."smtp_config" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "host" "text" NOT NULL,
    "port" integer NOT NULL,
    "user_email" "text" NOT NULL,
    "password_encrypted" "text" NOT NULL,
    "encryption" "text" NOT NULL,
    "from_email" "text" NOT NULL,
    "from_name" "text" NOT NULL,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "smtp_config_encryption_check" CHECK (("encryption" = ANY (ARRAY['SSL'::"text", 'TLS'::"text", 'NONE'::"text"])))
);


ALTER TABLE "public"."smtp_config" OWNER TO "postgres";


COMMENT ON TABLE "public"."smtp_config" IS 'Configuração dinâmica do servidor SMTP para e-mails';



CREATE TABLE IF NOT EXISTS "public"."smtp_settings" (
    "id" "text" DEFAULT 'smtp_config_1'::"text" NOT NULL,
    "host" "text" DEFAULT ''::"text" NOT NULL,
    "port" integer DEFAULT 587 NOT NULL,
    "user_name" "text" DEFAULT ''::"text" NOT NULL,
    "password" "text" DEFAULT ''::"text" NOT NULL,
    "encryption" "text" DEFAULT 'TLS'::"text" NOT NULL,
    "from_email" "text" DEFAULT ''::"text" NOT NULL,
    "from_name" "text" DEFAULT 'AGRO BW'::"text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "smtp_settings_encryption_check" CHECK (("encryption" = ANY (ARRAY['SSL'::"text", 'TLS'::"text", 'NONE'::"text"])))
);


ALTER TABLE "public"."smtp_settings" OWNER TO "postgres";


COMMENT ON TABLE "public"."smtp_settings" IS 'Configuracao SMTP centralizada do painel administrativo, usada pelas edge functions de e-mail.';



CREATE TABLE IF NOT EXISTS "public"."sponsor_interest_leads" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_name" "text" NOT NULL,
    "contact_name" "text" NOT NULL,
    "email" "text" NOT NULL,
    "phone" "text",
    "segment" "text" NOT NULL,
    "message" "text",
    "preferred_channel" "text" DEFAULT 'whatsapp'::"text" NOT NULL,
    "source" "text" DEFAULT 'sponsor_landing'::"text" NOT NULL,
    "status" "text" DEFAULT 'new'::"text" NOT NULL,
    "notes" "text",
    "contacted_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "sponsor_interest_leads_preferred_channel_check" CHECK (("preferred_channel" = ANY (ARRAY['whatsapp'::"text", 'email'::"text"]))),
    CONSTRAINT "sponsor_interest_leads_status_check" CHECK (("status" = ANY (ARRAY['new'::"text", 'contacted'::"text", 'qualified'::"text", 'closed'::"text", 'archived'::"text"])))
);


ALTER TABLE "public"."sponsor_interest_leads" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sponsor_metric_email_dispatch_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "triggered_by" "text" NOT NULL,
    "status" "text" NOT NULL,
    "requested_limit" integer DEFAULT 25 NOT NULL,
    "processed_count" integer DEFAULT 0 NOT NULL,
    "sent_count" integer DEFAULT 0 NOT NULL,
    "failed_count" integer DEFAULT 0 NOT NULL,
    "skipped_count" integer DEFAULT 0 NOT NULL,
    "notes" "text",
    "started_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "finished_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "sponsor_metric_email_dispatch_logs_status_check" CHECK (("status" = ANY (ARRAY['processing'::"text", 'completed'::"text", 'failed'::"text"]))),
    CONSTRAINT "sponsor_metric_email_dispatch_logs_triggered_by_check" CHECK (("triggered_by" = ANY (ARRAY['cron'::"text", 'admin'::"text"])))
);


ALTER TABLE "public"."sponsor_metric_email_dispatch_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sponsor_metric_email_jobs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "sponsor_id" "uuid" NOT NULL,
    "sponsor_name" "text" NOT NULL,
    "period_start" timestamp with time zone NOT NULL,
    "period_end" timestamp with time zone NOT NULL,
    "recipient_email" "text" NOT NULL,
    "recipient_name" "text",
    "report_payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "provider" "text" DEFAULT 'smtp'::"text" NOT NULL,
    "attempts" integer DEFAULT 0 NOT NULL,
    "last_error" "text",
    "queued_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "processing_started_at" timestamp with time zone,
    "last_attempt_at" timestamp with time zone,
    "sent_at" timestamp with time zone,
    "requested_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "sponsor_metric_email_jobs_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'processing'::"text", 'sent'::"text", 'failed'::"text", 'skipped'::"text"])))
);


ALTER TABLE "public"."sponsor_metric_email_jobs" OWNER TO "postgres";


COMMENT ON TABLE "public"."sponsor_metric_email_jobs" IS 'Fila de envio manual/automatico dos relatorios de metricas da Vitrine Premium.';



CREATE TABLE IF NOT EXISTS "public"."sponsor_testimonials" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_name" "text" NOT NULL,
    "contact_name" "text" NOT NULL,
    "role_title" "text",
    "segment" "text",
    "location_label" "text",
    "testimonial" "text" NOT NULL,
    "avatar_url" "text",
    "highlight_metric" "text",
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "display_order" integer DEFAULT 0 NOT NULL,
    "is_featured" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "sponsor_testimonials_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'published'::"text"])))
);


ALTER TABLE "public"."sponsor_testimonials" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."subcategories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "category_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."subcategories" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."subscription_history" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "subscription_id" "uuid",
    "plan_id" "uuid" NOT NULL,
    "plan_name" "text" NOT NULL,
    "plan_monthly_price" numeric(10,2) NOT NULL,
    "event_type" "text" NOT NULL,
    "status" "text" NOT NULL,
    "period_start" timestamp with time zone NOT NULL,
    "period_end" timestamp with time zone NOT NULL,
    "mrr_contribution" numeric(10,2) NOT NULL,
    "was_paid" boolean DEFAULT false,
    "previous_plan_id" "uuid",
    "cancellation_reason" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "subscription_history_event_type_check" CHECK (("event_type" = ANY (ARRAY['created'::"text", 'upgraded'::"text", 'downgraded'::"text", 'renewed'::"text", 'canceled'::"text", 'expired'::"text", 'trial_started'::"text", 'trial_converted'::"text"]))),
    CONSTRAINT "subscription_history_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'trialing'::"text", 'past_due'::"text", 'canceled'::"text", 'expired'::"text"])))
);


ALTER TABLE "public"."subscription_history" OWNER TO "postgres";


COMMENT ON TABLE "public"."subscription_history" IS 'Histórico de todas as mudanças de assinaturas para cálculos precisos de MRR e Churn';



COMMENT ON COLUMN "public"."subscription_history"."event_type" IS 'Tipo de evento: created, upgraded, downgraded, renewed, canceled, expired';



COMMENT ON COLUMN "public"."subscription_history"."mrr_contribution" IS 'Valor mensal que este período contribui para o MRR';



CREATE TABLE IF NOT EXISTS "public"."support_settings" (
    "id" "text" DEFAULT 'default'::"text" NOT NULL,
    "card_title" "text" DEFAULT 'Atendimento'::"text" NOT NULL,
    "average_response_label" "text" DEFAULT 'Resposta média'::"text" NOT NULL,
    "average_response_value" "text" DEFAULT '< 24h'::"text" NOT NULL,
    "schedule_label" "text" DEFAULT 'Horário'::"text" NOT NULL,
    "schedule_days" "text" DEFAULT 'Seg-Sex'::"text" NOT NULL,
    "schedule_time_label" "text" DEFAULT 'Das'::"text" NOT NULL,
    "schedule_time" "text" DEFAULT '08h às 18h'::"text" NOT NULL,
    "is_online" boolean DEFAULT true NOT NULL,
    "online_status_text" "text" DEFAULT 'Suporte online agora'::"text" NOT NULL,
    "offline_status_text" "text" DEFAULT 'Suporte offline no momento'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."support_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."support_ticket_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "ticket_id" "uuid" NOT NULL,
    "sender_type" "text" NOT NULL,
    "sender_user_id" "uuid",
    "sender_admin_id" "uuid",
    "sender_name" "text" NOT NULL,
    "message" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "support_ticket_messages_sender_type_check" CHECK (("sender_type" = ANY (ARRAY['user'::"text", 'admin'::"text"])))
);


ALTER TABLE "public"."support_ticket_messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."support_tickets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "subject" "text" NOT NULL,
    "category" "text" NOT NULL,
    "priority" "text" DEFAULT 'medium'::"text" NOT NULL,
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "description" "text",
    "assigned_admin_id" "uuid",
    "last_message_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "support_tickets_category_check" CHECK (("category" = ANY (ARRAY['announcements'::"text", 'billing'::"text", 'plans'::"text", 'messages'::"text", 'technical'::"text", 'other'::"text"]))),
    CONSTRAINT "support_tickets_priority_check" CHECK (("priority" = ANY (ARRAY['low'::"text", 'medium'::"text", 'high'::"text", 'urgent'::"text"]))),
    CONSTRAINT "support_tickets_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'in_progress'::"text", 'waiting_user'::"text", 'resolved'::"text", 'closed'::"text"])))
);


ALTER TABLE "public"."support_tickets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."terms_page_content" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "last_updated_date" character varying(50) DEFAULT '20 de Maio de 2024'::character varying,
    "section1_title" character varying(200) DEFAULT '1. Aceitação dos Termos'::character varying,
    "section1_content" "text" NOT NULL,
    "section2_title" character varying(200) DEFAULT '2. Cadastro e Segurança da Conta'::character varying,
    "section2_content" "text" NOT NULL,
    "section3_title" character varying(200) DEFAULT '3. Regras para Publicação de Anúncios'::character varying,
    "section3_content" "text" NOT NULL,
    "section4_title" character varying(200) DEFAULT '4. Planos de Assinatura e Reembolso'::character varying,
    "section4_content" "text" NOT NULL,
    "section5_title" character varying(200) DEFAULT '5. Propriedade Intelectual'::character varying,
    "section5_content" "text" NOT NULL,
    "section6_title" character varying(200) DEFAULT '6. Limitação de Responsabilidade'::character varying,
    "section6_content" "text" NOT NULL,
    "last_updated_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "single_row" CHECK (("id" = '00000000-0000-0000-0000-000000000002'::"uuid"))
);


ALTER TABLE "public"."terms_page_content" OWNER TO "postgres";


COMMENT ON TABLE "public"."terms_page_content" IS 'Conteúdo estruturado da página Termos de Uso (singleton)';



CREATE TABLE IF NOT EXISTS "public"."user_highlight_booster_purchases" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "booster_id" "uuid" NOT NULL,
    "payment_id" "uuid",
    "provider_payment_id" "text",
    "status" "text" DEFAULT 'credited'::"text" NOT NULL,
    "booster_name" "text" NOT NULL,
    "amount" numeric(10,2) DEFAULT 0 NOT NULL,
    "category_credits_total" integer DEFAULT 0 NOT NULL,
    "category_credits_remaining" integer DEFAULT 0 NOT NULL,
    "home_credits_total" integer DEFAULT 0 NOT NULL,
    "home_credits_remaining" integer DEFAULT 0 NOT NULL,
    "credited_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "user_highlight_booster_purchases_status_check" CHECK (("status" = ANY (ARRAY['credited'::"text", 'cancelled'::"text", 'refunded'::"text"])))
);


ALTER TABLE "public"."user_highlight_booster_purchases" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_legal_consents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "consent_type" "text" NOT NULL,
    "document_version" "text" NOT NULL,
    "document_title" "text" NOT NULL,
    "document_url" "text" NOT NULL,
    "accepted_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "revoked_at" timestamp with time zone,
    "source" "text" DEFAULT 'register'::"text" NOT NULL,
    "user_agent" "text",
    "ip_address" "inet",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "user_legal_consents_source_check" CHECK (("source" = ANY (ARRAY['register'::"text", 'contact_modal'::"text", 'profile'::"text", 'admin'::"text"]))),
    CONSTRAINT "user_legal_consents_type_check" CHECK (("consent_type" = ANY (ARRAY['terms_of_use'::"text", 'privacy_policy'::"text", 'marketing_opt_in'::"text", 'contact_terms'::"text"])))
);


ALTER TABLE "public"."user_legal_consents" OWNER TO "postgres";


COMMENT ON TABLE "public"."user_legal_consents" IS 'Histórico jurídico de consentimentos e aceite de documentos legais do usuário.';



COMMENT ON COLUMN "public"."user_legal_consents"."document_version" IS 'Versão resolvida do documento legal no momento do aceite.';



CREATE TABLE IF NOT EXISTS "public"."user_subscriptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "plan_id" "uuid" NOT NULL,
    "status" "text" NOT NULL,
    "current_period_start" timestamp with time zone DEFAULT "now"() NOT NULL,
    "current_period_end" timestamp with time zone NOT NULL,
    "cancel_at_period_end" boolean DEFAULT false NOT NULL,
    "trial_end_date" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "source" "text",
    "promotion_code_id" "uuid",
    "promotion_redemption_id" "uuid",
    "billing_cycle" "text" DEFAULT 'monthly'::"text" NOT NULL,
    "amount_paid" numeric(10,2) DEFAULT 0 NOT NULL,
    "currency" "text" DEFAULT 'BRL'::"text",
    "provider" "text" DEFAULT 'asaas'::"text" NOT NULL,
    "provider_customer_id" "text",
    "provider_subscription_id" "text",
    "provider_price_id" "text",
    "provider_checkout_session_id" "text",
    "billing_model" "text" DEFAULT 'one_time'::"text" NOT NULL,
    "category_highlights_carryover" integer DEFAULT 0 NOT NULL,
    "home_highlights_carryover" integer DEFAULT 0 NOT NULL,
    CONSTRAINT "user_subscriptions_billing_cycle_check" CHECK (("billing_cycle" = ANY (ARRAY['monthly'::"text", 'yearly'::"text"]))),
    CONSTRAINT "user_subscriptions_billing_model_check" CHECK (("billing_model" = ANY (ARRAY['one_time'::"text", 'recurring'::"text"]))),
    CONSTRAINT "user_subscriptions_category_highlights_carryover_check" CHECK (("category_highlights_carryover" >= 0)),
    CONSTRAINT "user_subscriptions_home_highlights_carryover_check" CHECK (("home_highlights_carryover" >= 0)),
    CONSTRAINT "user_subscriptions_provider_check" CHECK (("provider" = ANY (ARRAY['asaas'::"text", 'legacy'::"text"]))),
    CONSTRAINT "user_subscriptions_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'active'::"text", 'trialing'::"text", 'past_due'::"text", 'canceled'::"text", 'cancelled'::"text", 'expired'::"text"])))
);


ALTER TABLE "public"."user_subscriptions" OWNER TO "postgres";


COMMENT ON TABLE "public"."user_subscriptions" IS 'Assinaturas de usuários dos planos de pagamento';



CREATE OR REPLACE VIEW "public"."v_admin_action_stats" AS
 SELECT "action",
    "count"(*) AS "action_count",
    "max"("created_at") AS "last_action_at"
   FROM "public"."admin_audit_logs"
  GROUP BY "action";


ALTER VIEW "public"."v_admin_action_stats" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."v_cac_monthly" AS
 WITH "new_paid_customers" AS (
         SELECT ("date_trunc"('month'::"text", "subscription_history"."created_at"))::"date" AS "month_year",
            "count"(DISTINCT "subscription_history"."user_id") AS "new_customers"
           FROM "public"."subscription_history"
          WHERE (("subscription_history"."event_type" = ANY (ARRAY['created'::"text", 'trial_converted'::"text"])) AND ("subscription_history"."plan_monthly_price" > (0)::numeric))
          GROUP BY ("date_trunc"('month'::"text", "subscription_history"."created_at"))
        )
 SELECT "mc"."month_year",
    "mc"."total_cost" AS "marketing_cost",
    COALESCE("npc"."new_customers", (0)::bigint) AS "new_paid_customers",
        CASE
            WHEN (COALESCE("npc"."new_customers", (0)::bigint) > 0) THEN "round"(("mc"."total_cost" / ("npc"."new_customers")::numeric), 2)
            ELSE (0)::numeric
        END AS "cac"
   FROM ("public"."marketing_costs" "mc"
     LEFT JOIN "new_paid_customers" "npc" ON (("mc"."month_year" = "npc"."month_year")))
  ORDER BY "mc"."month_year" DESC;


ALTER VIEW "public"."v_cac_monthly" OWNER TO "postgres";


COMMENT ON VIEW "public"."v_cac_monthly" IS 'CAC (Custo de Marketing / Novos Clientes Pagantes)';



CREATE OR REPLACE VIEW "public"."v_churn_monthly" AS
 WITH "monthly_mrr" AS (
         SELECT ("date_trunc"('month'::"text", "subscription_history"."period_start"))::"date" AS "month_year",
            "sum"("subscription_history"."mrr_contribution") AS "mrr"
           FROM "public"."subscription_history"
          WHERE ("subscription_history"."status" = 'active'::"text")
          GROUP BY ("date_trunc"('month'::"text", "subscription_history"."period_start"))
        ), "churned_mrr" AS (
         SELECT ("date_trunc"('month'::"text", "subscription_history"."created_at"))::"date" AS "month_year",
            "sum"("subscription_history"."mrr_contribution") AS "churned_amount"
           FROM "public"."subscription_history"
          WHERE ("subscription_history"."event_type" = ANY (ARRAY['canceled'::"text", 'expired'::"text"]))
          GROUP BY ("date_trunc"('month'::"text", "subscription_history"."created_at"))
        )
 SELECT "m"."month_year",
    "m"."mrr" AS "starting_mrr",
    COALESCE("c"."churned_amount", (0)::numeric) AS "churned_mrr",
    "round"(((COALESCE("c"."churned_amount", (0)::numeric) * 100.0) / NULLIF("m"."mrr", (0)::numeric)), 2) AS "churn_rate_percentage"
   FROM ("monthly_mrr" "m"
     LEFT JOIN "churned_mrr" "c" ON (("m"."month_year" = "c"."month_year")))
  ORDER BY "m"."month_year" DESC;


ALTER VIEW "public"."v_churn_monthly" OWNER TO "postgres";


COMMENT ON VIEW "public"."v_churn_monthly" IS 'Taxa de churn financeiro mensal (MRR Perdida / MRR Inicial * 100)';



CREATE OR REPLACE VIEW "public"."v_critical_security_events" AS
 SELECT "se"."id",
    "se"."user_id",
    "u"."name" AS "user_name",
    "se"."email",
    "se"."attempted_route",
    "se"."attempted_action",
    "se"."ip_address",
    "se"."severity",
    "se"."reason",
    "se"."created_at",
    "count"(*) OVER (PARTITION BY "se"."user_id" ORDER BY "se"."created_at" ROWS BETWEEN 6 PRECEDING AND CURRENT ROW) AS "recent_attempts"
   FROM ("public"."security_events" "se"
     LEFT JOIN "public"."users" "u" ON (("se"."user_id" = "u"."id")))
  WHERE (("se"."severity" = ANY (ARRAY['critical'::"public"."severity_level", 'blocked'::"public"."severity_level"])) AND ("se"."created_at" >= ("now"() - '30 days'::interval)))
  ORDER BY "se"."created_at" DESC;


ALTER VIEW "public"."v_critical_security_events" OWNER TO "postgres";


COMMENT ON VIEW "public"."v_critical_security_events" IS 'Eventos críticos dos últimos 30 dias com contador de tentativas repetidas';



CREATE OR REPLACE VIEW "public"."v_customer_churn_30d" AS
 WITH "params" AS (
         SELECT ("now"() - '30 days'::interval) AS "period_start"
        ), "starting_base" AS (
         SELECT "count"(DISTINCT "sh"."user_id") AS "active_customers_at_period_start"
           FROM ("public"."subscription_history" "sh"
             CROSS JOIN "params" "p")
          WHERE ((COALESCE("sh"."plan_monthly_price", (0)::numeric) > (0)::numeric) AND ("sh"."period_start" <= "p"."period_start") AND ("sh"."period_end" >= "p"."period_start") AND ("sh"."status" = ANY (ARRAY['active'::"text", 'trialing'::"text", 'past_due'::"text"])))
        ), "churned_customers" AS (
         SELECT "count"(DISTINCT "sh"."user_id") AS "churned_customers_30d"
           FROM ("public"."subscription_history" "sh"
             CROSS JOIN "params" "p")
          WHERE (("sh"."event_type" = ANY (ARRAY['canceled'::"text", 'expired'::"text"])) AND (COALESCE("sh"."plan_monthly_price", (0)::numeric) > (0)::numeric) AND ("sh"."created_at" >= "p"."period_start"))
        )
 SELECT "sb"."active_customers_at_period_start",
    "cc"."churned_customers_30d",
    "round"(((("cc"."churned_customers_30d")::numeric * 100.0) / (NULLIF("sb"."active_customers_at_period_start", 0))::numeric), 2) AS "customer_churn_percentage"
   FROM ("starting_base" "sb"
     CROSS JOIN "churned_customers" "cc");


ALTER VIEW "public"."v_customer_churn_30d" OWNER TO "postgres";


COMMENT ON VIEW "public"."v_customer_churn_30d" IS 'Taxa de churn de clientes dos ultimos 30 dias (clientes perdidos / base paga no inicio do periodo)';



CREATE OR REPLACE VIEW "public"."v_free_to_paid_conversion" AS
 WITH "free_users" AS (
         SELECT "count"(DISTINCT "us"."user_id") AS "total_free"
           FROM ("public"."user_subscriptions" "us"
             JOIN "public"."plans" "p" ON (("us"."plan_id" = "p"."id")))
          WHERE (("p"."monthly_price" = (0)::numeric) AND ("us"."status" = 'active'::"text"))
        ), "upgraded_users" AS (
         SELECT "count"(DISTINCT "subscription_history"."user_id") AS "total_upgraded"
           FROM "public"."subscription_history"
          WHERE (("subscription_history"."event_type" = 'upgraded'::"text") AND ("subscription_history"."created_at" >= ("now"() - '30 days'::interval)))
        )
 SELECT "f"."total_free",
    "u"."total_upgraded",
    "round"(((("u"."total_upgraded")::numeric * 100.0) / (NULLIF("f"."total_free", 0))::numeric), 2) AS "conversion_rate_percentage"
   FROM "free_users" "f",
    "upgraded_users" "u";


ALTER VIEW "public"."v_free_to_paid_conversion" OWNER TO "postgres";


COMMENT ON VIEW "public"."v_free_to_paid_conversion" IS 'Taxa de conversão de usuários gratuitos para pagos';



CREATE OR REPLACE VIEW "public"."v_lead_conversion_rate" AS
 WITH "announcement_stats" AS (
         SELECT "a"."id",
            "a"."views" AS "total_views",
            "count"("lc"."id") AS "total_leads"
           FROM ("public"."announcements" "a"
             LEFT JOIN "public"."lead_conversions" "lc" ON (("a"."id" = "lc"."announcement_id")))
          WHERE ("a"."status" = 'ACTIVE'::"text")
          GROUP BY "a"."id", "a"."views"
        )
 SELECT "sum"("total_views") AS "total_views",
    "sum"("total_leads") AS "total_leads",
    "round"((("sum"("total_leads") * 100.0) / (NULLIF("sum"("total_views"), 0))::numeric), 2) AS "conversion_rate_percentage"
   FROM "announcement_stats";


ALTER VIEW "public"."v_lead_conversion_rate" OWNER TO "postgres";


COMMENT ON VIEW "public"."v_lead_conversion_rate" IS 'Taxa de conversão de visualizações para leads';



CREATE OR REPLACE VIEW "public"."v_mrr_monthly" AS
 SELECT ("date_trunc"('month'::"text", "period_start"))::"date" AS "month_year",
    "sum"("mrr_contribution") AS "total_mrr",
    "count"(DISTINCT "user_id") AS "active_subscribers",
    "sum"(
        CASE
            WHEN ("event_type" = 'created'::"text") THEN "mrr_contribution"
            ELSE (0)::numeric
        END) AS "new_mrr",
    "sum"(
        CASE
            WHEN ("event_type" = 'upgraded'::"text") THEN "mrr_contribution"
            ELSE (0)::numeric
        END) AS "expansion_mrr",
    "sum"(
        CASE
            WHEN ("event_type" = ANY (ARRAY['downgraded'::"text", 'canceled'::"text"])) THEN "mrr_contribution"
            ELSE (0)::numeric
        END) AS "churn_mrr"
   FROM "public"."subscription_history"
  WHERE (("status" = 'active'::"text") AND ("period_start" >= ("now"() - '1 year'::interval)))
  GROUP BY ("date_trunc"('month'::"text", "period_start"))
  ORDER BY (("date_trunc"('month'::"text", "period_start"))::"date") DESC;


ALTER VIEW "public"."v_mrr_monthly" OWNER TO "postgres";


COMMENT ON VIEW "public"."v_mrr_monthly" IS 'MRR mensal com detalhamento de novos, expansão e churn';



CREATE OR REPLACE VIEW "public"."v_paid_conversion_30d" AS
 WITH "recent_signups" AS (
         SELECT "count"(*) AS "new_users_30d"
           FROM "public"."users"
          WHERE ("users"."created_at" >= ("now"() - '30 days'::interval))
        ), "recent_paid_customers" AS (
         SELECT "count"(DISTINCT "sh"."user_id") AS "new_paid_customers_30d"
           FROM "public"."subscription_history" "sh"
          WHERE (("sh"."event_type" = ANY (ARRAY['created'::"text", 'trial_converted'::"text"])) AND (COALESCE("sh"."plan_monthly_price", (0)::numeric) > (0)::numeric) AND ("sh"."created_at" >= ("now"() - '30 days'::interval)))
        )
 SELECT "rs"."new_users_30d",
    "rpc"."new_paid_customers_30d",
    "round"(((("rpc"."new_paid_customers_30d")::numeric * 100.0) / (NULLIF("rs"."new_users_30d", 0))::numeric), 2) AS "conversion_rate_percentage"
   FROM ("recent_signups" "rs"
     CROSS JOIN "recent_paid_customers" "rpc");


ALTER VIEW "public"."v_paid_conversion_30d" OWNER TO "postgres";


COMMENT ON VIEW "public"."v_paid_conversion_30d" IS 'Taxa de conversao de usuario para cliente pago nos ultimos 30 dias';



CREATE OR REPLACE VIEW "public"."v_radar_stats" WITH ("security_invoker"='on', "security_barrier"='false') AS
 SELECT "oa"."user_id",
    "count"(DISTINCT "oa"."id") AS "total_alerts",
    "count"(DISTINCT
        CASE
            WHEN (("oa"."status")::"text" = 'ativo'::"text") THEN "oa"."id"
            ELSE NULL::"uuid"
        END) AS "active_alerts",
    "count"(DISTINCT "om"."id") AS "total_matches",
    "count"(DISTINCT
        CASE
            WHEN ("om"."is_viewed" = false) THEN "om"."id"
            ELSE NULL::"uuid"
        END) AS "unviewed_matches",
    "max"("om"."created_at") AS "last_match_date"
   FROM ("public"."opportunity_alerts" "oa"
     LEFT JOIN "public"."opportunity_matches" "om" ON (("om"."alert_id" = "oa"."id")))
  GROUP BY "oa"."user_id";


ALTER VIEW "public"."v_radar_stats" OWNER TO "postgres";


COMMENT ON VIEW "public"."v_radar_stats" IS 'Estatísticas agregadas de alertas e matches por usuário';



CREATE OR REPLACE VIEW "public"."v_recent_admin_actions" AS
 SELECT "id",
    "admin_email",
    "admin_name",
    "action",
    "resource_type",
    "resource_id",
    "reason",
    "ip_address",
    "created_at",
        CASE
            WHEN ("action" ~~ '%DELETE%'::"text") THEN 'danger'::"text"
            WHEN ("action" ~~ '%UPDATE%'::"text") THEN 'warning'::"text"
            WHEN ("action" ~~ '%APPROVE%'::"text") THEN 'success'::"text"
            ELSE 'info'::"text"
        END AS "severity"
   FROM "public"."admin_audit_logs" "aal"
  ORDER BY "created_at" DESC
 LIMIT 100;


ALTER VIEW "public"."v_recent_admin_actions" OWNER TO "postgres";


COMMENT ON VIEW "public"."v_recent_admin_actions" IS 'Visualização das 100 ações administrativas mais recentes';



CREATE TABLE IF NOT EXISTS "public"."website_visits" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "visit_date" "date" NOT NULL,
    "total_visits" integer DEFAULT 0,
    "unique_visitors" integer DEFAULT 0,
    "page_views" integer DEFAULT 0,
    "avg_session_duration" integer DEFAULT 0,
    "bounce_rate" numeric(5,2) DEFAULT 0,
    "organic_visits" integer DEFAULT 0,
    "direct_visits" integer DEFAULT 0,
    "social_visits" integer DEFAULT 0,
    "referral_visits" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."website_visits" OWNER TO "postgres";


COMMENT ON TABLE "public"."website_visits" IS 'Rastreamento diário de visitas ao site';



COMMENT ON COLUMN "public"."website_visits"."total_visits" IS 'Total de sessões iniciadas no dia';



CREATE OR REPLACE VIEW "public"."v_registration_conversion_30d" AS
 WITH "recent_signups" AS (
         SELECT "count"(*) AS "new_users_30d"
           FROM "public"."users"
          WHERE ("users"."created_at" >= ("now"() - '30 days'::interval))
        ), "recent_visitors" AS (
         SELECT COALESCE("sum"("website_visits"."unique_visitors"), (0)::bigint) AS "unique_visitors_30d"
           FROM "public"."website_visits"
          WHERE ("website_visits"."visit_date" >= ((CURRENT_DATE - '29 days'::interval))::"date")
        )
 SELECT "rs"."new_users_30d",
    "rv"."unique_visitors_30d",
    "round"(((("rs"."new_users_30d")::numeric * 100.0) / (NULLIF("rv"."unique_visitors_30d", 0))::numeric), 2) AS "registration_rate_percentage"
   FROM ("recent_signups" "rs"
     CROSS JOIN "recent_visitors" "rv");


ALTER VIEW "public"."v_registration_conversion_30d" OWNER TO "postgres";


COMMENT ON VIEW "public"."v_registration_conversion_30d" IS 'Taxa de cadastro dos ultimos 30 dias (usuarios cadastrados / visitantes unicos)';



CREATE OR REPLACE VIEW "public"."v_revenue_by_plan" AS
 SELECT "p"."name" AS "plan_name",
    "count"(DISTINCT "sh"."user_id") AS "active_users",
    "sum"("sh"."mrr_contribution") AS "total_mrr",
    "round"((("sum"("sh"."mrr_contribution") * 100.0) / NULLIF(( SELECT "sum"("subscription_history"."mrr_contribution") AS "sum"
           FROM "public"."subscription_history"
          WHERE ("subscription_history"."status" = 'active'::"text")), (0)::numeric)), 2) AS "mrr_percentage"
   FROM ("public"."subscription_history" "sh"
     JOIN "public"."plans" "p" ON (("sh"."plan_id" = "p"."id")))
  WHERE (("sh"."status" = 'active'::"text") AND ("sh"."period_start" <= "now"()) AND ("sh"."period_end" >= "now"()))
  GROUP BY "p"."name"
  ORDER BY ("sum"("sh"."mrr_contribution")) DESC;


ALTER VIEW "public"."v_revenue_by_plan" OWNER TO "postgres";


COMMENT ON VIEW "public"."v_revenue_by_plan" IS 'Distribuição de MRR por plano';



CREATE OR REPLACE VIEW "public"."v_security_stats" AS
 SELECT "count"(*) FILTER (WHERE ("severity" = 'critical'::"public"."severity_level")) AS "critical_count",
    "count"(*) FILTER (WHERE ("severity" = 'blocked'::"public"."severity_level")) AS "blocked_count",
    "count"(*) FILTER (WHERE ("severity" = 'warning'::"public"."severity_level")) AS "warning_count",
    "count"(*) FILTER (WHERE ("severity" = 'info'::"public"."severity_level")) AS "info_count",
    "count"(*) AS "total_events",
    ( SELECT "jsonb_agg"("row_to_json"("t".*)) AS "jsonb_agg"
           FROM ( SELECT ("security_events_1"."ip_address")::"text" AS "ip_address",
                    "count"(*) AS "attempts"
                   FROM "public"."security_events" "security_events_1"
                  WHERE ("security_events_1"."ip_address" IS NOT NULL)
                  GROUP BY "security_events_1"."ip_address"
                  ORDER BY ("count"(*)) DESC
                 LIMIT 5) "t") AS "top_ips",
    ( SELECT "jsonb_agg"("row_to_json"("t".*)) AS "jsonb_agg"
           FROM ( SELECT "security_events_1"."attempted_route",
                    "count"(*) AS "attempts"
                   FROM "public"."security_events" "security_events_1"
                  GROUP BY "security_events_1"."attempted_route"
                  ORDER BY ("count"(*)) DESC
                 LIMIT 5) "t") AS "top_routes",
    "min"("created_at") AS "first_event",
    "max"("created_at") AS "last_event"
   FROM "public"."security_events"
  WHERE ("created_at" >= ("now"() - '30 days'::interval));


ALTER VIEW "public"."v_security_stats" OWNER TO "postgres";


COMMENT ON VIEW "public"."v_security_stats" IS 'Estatísticas agregadas de segurança (últimos 30 dias)';



CREATE OR REPLACE VIEW "public"."v_user_usage" AS
 WITH "latest_sub" AS (
         SELECT DISTINCT ON ("us"."user_id") "us"."user_id",
            "us"."plan_id",
            "us"."status",
            "us"."current_period_start",
            "us"."current_period_end"
           FROM "public"."user_subscriptions" "us"
          ORDER BY "us"."user_id", "us"."current_period_end" DESC
        )
 SELECT "u"."id" AS "user_id",
    "p"."id" AS "plan_id",
    "p"."name" AS "plan_name",
    "p"."max_ads",
    "public"."resolve_lead_contact_limit_days"("ls"."current_period_start", "ls"."current_period_end", "p"."lead_contact_limit_days_monthly", "p"."lead_contact_limit_days_yearly", "p"."lead_contact_limit_days") AS "lead_contact_limit_days",
    ( SELECT "count"(*) AS "count"
           FROM "public"."announcements" "a"
          WHERE ("a"."user_id" = "u"."id")) AS "ads_count",
    GREATEST(("p"."max_ads" - ( SELECT "count"(*) AS "count"
           FROM "public"."announcements" "a"
          WHERE ("a"."user_id" = "u"."id"))), (0)::bigint) AS "ads_remaining",
    GREATEST(("public"."resolve_lead_contact_limit_days"("ls"."current_period_start", "ls"."current_period_end", "p"."lead_contact_limit_days_monthly", "p"."lead_contact_limit_days_yearly", "p"."lead_contact_limit_days") - (EXTRACT(day FROM ("now"() - "ls"."current_period_start")))::integer), 0) AS "lead_days_remaining",
    GREATEST((EXTRACT(day FROM ("ls"."current_period_end" - "now"())))::integer, 0) AS "period_days_remaining"
   FROM (("public"."users" "u"
     JOIN "latest_sub" "ls" ON (("ls"."user_id" = "u"."id")))
     JOIN "public"."plans" "p" ON (("p"."id" = "ls"."plan_id")));


ALTER VIEW "public"."v_user_usage" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."vendedores_publicos" AS
 SELECT "id",
    "name",
    "avatar",
    "document_verified",
    "business_description",
    "cidade",
    "estado"
   FROM "public"."users" "u";


ALTER VIEW "public"."vendedores_publicos" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."vw_user_status" AS
 SELECT "id",
    "email",
    "name",
    "phone",
    "role",
    "is_admin",
    "location",
    "avatar",
    "plan",
    "two_factor_enabled",
    "credits",
    "first_ad_at",
    "created_at",
    "updated_at"
   FROM "public"."users" "u";


ALTER VIEW "public"."vw_user_status" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."webhook_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "provider" character varying(50) DEFAULT 'mercadopago'::character varying NOT NULL,
    "event_type" character varying(100),
    "payload" "jsonb" NOT NULL,
    "status_code" integer,
    "processed" boolean DEFAULT false NOT NULL,
    "error_message" "text",
    "received_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "processed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."webhook_logs" OWNER TO "postgres";


COMMENT ON TABLE "public"."webhook_logs" IS 'Logs de webhooks recebidos (debug e auditoria)';



COMMENT ON COLUMN "public"."webhook_logs"."provider" IS 'Provedor do webhook (mercadopago, stripe, etc)';



COMMENT ON COLUMN "public"."webhook_logs"."event_type" IS 'Tipo de evento do webhook';



COMMENT ON COLUMN "public"."webhook_logs"."payload" IS 'Payload completo do webhook';



COMMENT ON COLUMN "public"."webhook_logs"."processed" IS 'Se o webhook foi processado com sucesso';



CREATE TABLE IF NOT EXISTS "public"."webhook_request_registry" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "provider" "text" NOT NULL,
    "request_id" "text" NOT NULL,
    "signature_ts_ms" bigint,
    "event_type" "text",
    "payment_id" "text",
    "webhook_log_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "processed_at" timestamp with time zone
);


ALTER TABLE "public"."webhook_request_registry" OWNER TO "postgres";


ALTER TABLE ONLY "public"."about_page_content"
    ADD CONSTRAINT "about_page_content_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."announcement_clicks_by_state"
    ADD CONSTRAINT "ad_clicks_by_state_ad_id_state_key" UNIQUE ("announcement_id", "state");



ALTER TABLE ONLY "public"."announcement_clicks_by_state"
    ADD CONSTRAINT "ad_clicks_by_state_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."announcement_metrics"
    ADD CONSTRAINT "ad_metrics_ad_id_key" UNIQUE ("announcement_id");



ALTER TABLE ONLY "public"."announcement_metrics"
    ADD CONSTRAINT "ad_metrics_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."announcement_technical_details"
    ADD CONSTRAINT "ad_technical_details_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."admin_audit_logs"
    ADD CONSTRAINT "admin_audit_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."admin_mfa_login_tickets"
    ADD CONSTRAINT "admin_mfa_login_tickets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."admin_mfa_login_tickets"
    ADD CONSTRAINT "admin_mfa_login_tickets_token_hash_key" UNIQUE ("token_hash");



ALTER TABLE ONLY "public"."announcement_edit_requests"
    ADD CONSTRAINT "announcement_edit_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."announcement_highlights_history"
    ADD CONSTRAINT "announcement_highlights_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."announcement_reports"
    ADD CONSTRAINT "announcement_reports_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."announcement_similarity_cooldowns"
    ADD CONSTRAINT "announcement_similarity_cooldowns_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."announcements"
    ADD CONSTRAINT "announcements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."banners"
    ADD CONSTRAINT "banners_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."categories"
    ADD CONSTRAINT "categories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."categories"
    ADD CONSTRAINT "categories_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."category_group_categories"
    ADD CONSTRAINT "category_group_categories_pkey" PRIMARY KEY ("group_id", "category_id");



ALTER TABLE ONLY "public"."category_group_images"
    ADD CONSTRAINT "category_group_images_pkey" PRIMARY KEY ("slug");



ALTER TABLE ONLY "public"."category_groups"
    ADD CONSTRAINT "category_groups_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."category_groups"
    ADD CONSTRAINT "category_groups_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."category_ranking_settings"
    ADD CONSTRAINT "category_ranking_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."category_showcase_impressions"
    ADD CONSTRAINT "category_showcase_impressions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."category_subcategories"
    ADD CONSTRAINT "category_subcategories_category_id_slug_key" UNIQUE ("category_id", "slug");



ALTER TABLE ONLY "public"."category_subcategories"
    ADD CONSTRAINT "category_subcategories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."chats"
    ADD CONSTRAINT "chats_ad_id_seller_id_buyer_id_key" UNIQUE ("announcement_id", "seller_id", "buyer_id");



ALTER TABLE ONLY "public"."chats"
    ADD CONSTRAINT "chats_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."commercial_intelligence_contact_shares"
    ADD CONSTRAINT "commercial_intelligence_contact_shares_conversation_id_key" UNIQUE ("conversation_id");



ALTER TABLE ONLY "public"."commercial_intelligence_contact_shares"
    ADD CONSTRAINT "commercial_intelligence_contact_shares_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."commercial_intelligence_conversation_messages"
    ADD CONSTRAINT "commercial_intelligence_conversation_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."commercial_intelligence_conversations"
    ADD CONSTRAINT "commercial_intelligence_conversations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."commercial_intelligence_conversations"
    ADD CONSTRAINT "commercial_intelligence_conversations_response_id_key" UNIQUE ("response_id");



ALTER TABLE ONLY "public"."commercial_intelligence_interest_responses"
    ADD CONSTRAINT "commercial_intelligence_interest_responses_delivery_id_key" UNIQUE ("delivery_id");



ALTER TABLE ONLY "public"."commercial_intelligence_interest_responses"
    ADD CONSTRAINT "commercial_intelligence_interest_responses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."commercial_intelligence_outreach_deliveries"
    ADD CONSTRAINT "commercial_intelligence_outre_campaign_id_recipient_user_id_key" UNIQUE ("campaign_id", "recipient_user_id");



ALTER TABLE ONLY "public"."commercial_intelligence_outreach_campaigns"
    ADD CONSTRAINT "commercial_intelligence_outreach_campaigns_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."commercial_intelligence_outreach_deliveries"
    ADD CONSTRAINT "commercial_intelligence_outreach_deliveries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."commercial_intelligence_requests"
    ADD CONSTRAINT "commercial_intelligence_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."commercial_lead_preferences"
    ADD CONSTRAINT "commercial_lead_preferences_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."contact_form_email_jobs"
    ADD CONSTRAINT "contact_form_email_jobs_contact_message_id_key" UNIQUE ("contact_message_id");



ALTER TABLE ONLY "public"."contact_form_email_jobs"
    ADD CONSTRAINT "contact_form_email_jobs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."contact_messages"
    ADD CONSTRAINT "contact_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."contact_notification_email_dispatch_logs"
    ADD CONSTRAINT "contact_notification_email_dispatch_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."contact_notification_email_jobs"
    ADD CONSTRAINT "contact_notification_email_jobs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."contact_page_content"
    ADD CONSTRAINT "contact_page_content_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."favorites"
    ADD CONSTRAINT "favorites_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."favorites"
    ADD CONSTRAINT "favorites_user_id_ad_id_key" UNIQUE ("user_id", "announcement_id");



ALTER TABLE ONLY "public"."fiscal_document_jobs"
    ADD CONSTRAINT "fiscal_document_jobs_payment_id_key" UNIQUE ("payment_id");



ALTER TABLE ONLY "public"."fiscal_document_jobs"
    ADD CONSTRAINT "fiscal_document_jobs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."fiscal_settings"
    ADD CONSTRAINT "fiscal_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."growth_conversion_settings"
    ADD CONSTRAINT "growth_conversion_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."highlight_boosters"
    ADD CONSTRAINT "highlight_boosters_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."highlight_settings"
    ADD CONSTRAINT "highlight_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."home_banners"
    ADD CONSTRAINT "home_banners_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."home_showcase_impressions"
    ADD CONSTRAINT "home_showcase_impressions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."institutional_pages"
    ADD CONSTRAINT "institutional_pages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."institutional_pages"
    ADD CONSTRAINT "institutional_pages_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."invite_campaigns"
    ADD CONSTRAINT "invite_campaigns_code_key" UNIQUE ("code");



ALTER TABLE ONLY "public"."invite_campaigns"
    ADD CONSTRAINT "invite_campaigns_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."invite_visits"
    ADD CONSTRAINT "invite_visits_campaign_session_unique" UNIQUE ("invite_campaign_id", "session_id");



ALTER TABLE ONLY "public"."invite_visits"
    ADD CONSTRAINT "invite_visits_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."layout_settings"
    ADD CONSTRAINT "layout_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."lead_conversions"
    ADD CONSTRAINT "lead_conversions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."leads"
    ADD CONSTRAINT "leads_chat_id_key" UNIQUE ("chat_id");



ALTER TABLE ONLY "public"."leads"
    ADD CONSTRAINT "leads_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."market_quote_source_previews"
    ADD CONSTRAINT "market_quote_source_previews_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."market_quote_sources"
    ADD CONSTRAINT "market_quote_sources_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."market_quotes"
    ADD CONSTRAINT "market_quotes_code_key" UNIQUE ("code");



ALTER TABLE ONLY "public"."market_quotes"
    ADD CONSTRAINT "market_quotes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."market_quotes_temp"
    ADD CONSTRAINT "market_quotes_temp_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."marketing_costs"
    ADD CONSTRAINT "marketing_costs_month_year_key" UNIQUE ("month_year");



ALTER TABLE ONLY "public"."marketing_costs"
    ADD CONSTRAINT "marketing_costs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."news_article_sources"
    ADD CONSTRAINT "news_article_sources_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."news_articles"
    ADD CONSTRAINT "news_articles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."news_articles"
    ADD CONSTRAINT "news_articles_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."news_generation_jobs"
    ADD CONSTRAINT "news_generation_jobs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."news_ingestions"
    ADD CONSTRAINT "news_ingestions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."news"
    ADD CONSTRAINT "news_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."news_settings"
    ADD CONSTRAINT "news_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."news_social_publications"
    ADD CONSTRAINT "news_social_publications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."news_social_settings"
    ADD CONSTRAINT "news_social_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."news_sources"
    ADD CONSTRAINT "news_sources_domain_key" UNIQUE ("domain");



ALTER TABLE ONLY "public"."news_sources"
    ADD CONSTRAINT "news_sources_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."newsletter_campaign_email_dispatch_logs"
    ADD CONSTRAINT "newsletter_campaign_email_dispatch_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."newsletter_campaign_email_jobs"
    ADD CONSTRAINT "newsletter_campaign_email_jobs_campaign_email_unique" UNIQUE ("campaign_id", "recipient_email");



ALTER TABLE ONLY "public"."newsletter_campaign_email_jobs"
    ADD CONSTRAINT "newsletter_campaign_email_jobs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."newsletter_campaigns"
    ADD CONSTRAINT "newsletter_campaigns_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."newsletter_subscriptions"
    ADD CONSTRAINT "newsletter_subscriptions_normalized_email_key" UNIQUE ("normalized_email");



ALTER TABLE ONLY "public"."newsletter_subscriptions"
    ADD CONSTRAINT "newsletter_subscriptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."opportunities"
    ADD CONSTRAINT "opportunities_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."opportunities"
    ADD CONSTRAINT "opportunities_user_id_ad_id_key" UNIQUE ("user_id", "announcement_id");



ALTER TABLE ONLY "public"."opportunity_alerts"
    ADD CONSTRAINT "opportunity_alerts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."opportunity_matches"
    ADD CONSTRAINT "opportunity_matches_alert_id_announcement_id_key" UNIQUE ("alert_id", "announcement_id");



ALTER TABLE ONLY "public"."opportunity_matches"
    ADD CONSTRAINT "opportunity_matches_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payment_settings"
    ADD CONSTRAINT "payment_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_provider_payment_id_key" UNIQUE ("provider_payment_id");



ALTER TABLE ONLY "public"."plan_alert_email_dispatch_logs"
    ADD CONSTRAINT "plan_alert_email_dispatch_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."plan_alert_email_jobs"
    ADD CONSTRAINT "plan_alert_email_jobs_notification_id_key" UNIQUE ("notification_id");



ALTER TABLE ONLY "public"."plan_alert_email_jobs"
    ADD CONSTRAINT "plan_alert_email_jobs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."plans"
    ADD CONSTRAINT "plans_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."plans"
    ADD CONSTRAINT "plans_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."price_drop_notifications"
    ADD CONSTRAINT "price_drop_notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."privacy_page_content"
    ADD CONSTRAINT "privacy_page_content_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."promotion_plan_codes"
    ADD CONSTRAINT "promotion_plan_codes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."promotion_plan_redemptions"
    ADD CONSTRAINT "promotion_plan_redemptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."publication_moderation_rules"
    ADD CONSTRAINT "publication_moderation_rules_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."quotations"
    ADD CONSTRAINT "quotations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."radar_match_email_dispatch_logs"
    ADD CONSTRAINT "radar_match_email_dispatch_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."radar_match_email_jobs"
    ADD CONSTRAINT "radar_match_email_jobs_match_id_key" UNIQUE ("match_id");



ALTER TABLE ONLY "public"."radar_match_email_jobs"
    ADD CONSTRAINT "radar_match_email_jobs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rate_limit_counters"
    ADD CONSTRAINT "rate_limit_counters_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rate_limit_counters"
    ADD CONSTRAINT "rate_limit_counters_user_id_action_key" UNIQUE ("user_id", "action");



ALTER TABLE ONLY "public"."renewal_notification_settings"
    ADD CONSTRAINT "renewal_notification_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."search_events"
    ADD CONSTRAINT "search_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."security_events"
    ADD CONSTRAINT "security_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."seller_stores"
    ADD CONSTRAINT "seller_stores_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."seller_stores"
    ADD CONSTRAINT "seller_stores_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."seller_stores"
    ADD CONSTRAINT "seller_stores_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."site_page_views"
    ADD CONSTRAINT "site_page_views_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."site_popup_events"
    ADD CONSTRAINT "site_popup_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."site_popup_user_states"
    ADD CONSTRAINT "site_popup_user_states_pkey" PRIMARY KEY ("popup_id", "user_id");



ALTER TABLE ONLY "public"."site_popups"
    ADD CONSTRAINT "site_popups_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."site_presence"
    ADD CONSTRAINT "site_presence_pkey" PRIMARY KEY ("session_id");



ALTER TABLE ONLY "public"."site_sponsor_clicks"
    ADD CONSTRAINT "site_sponsor_clicks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."site_sponsor_impressions"
    ADD CONSTRAINT "site_sponsor_impressions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."site_sponsors"
    ADD CONSTRAINT "site_sponsors_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."smtp_config"
    ADD CONSTRAINT "smtp_config_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."smtp_settings"
    ADD CONSTRAINT "smtp_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sponsor_interest_leads"
    ADD CONSTRAINT "sponsor_interest_leads_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sponsor_metric_email_dispatch_logs"
    ADD CONSTRAINT "sponsor_metric_email_dispatch_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sponsor_metric_email_jobs"
    ADD CONSTRAINT "sponsor_metric_email_jobs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sponsor_testimonials"
    ADD CONSTRAINT "sponsor_testimonials_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."subcategories"
    ADD CONSTRAINT "subcategories_category_id_slug_key" UNIQUE ("category_id", "slug");



ALTER TABLE ONLY "public"."subcategories"
    ADD CONSTRAINT "subcategories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."subscription_history"
    ADD CONSTRAINT "subscription_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."support_settings"
    ADD CONSTRAINT "support_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."support_ticket_messages"
    ADD CONSTRAINT "support_ticket_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."support_tickets"
    ADD CONSTRAINT "support_tickets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."terms_page_content"
    ADD CONSTRAINT "terms_page_content_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_highlight_booster_purchases"
    ADD CONSTRAINT "user_highlight_booster_purchases_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_legal_consents"
    ADD CONSTRAINT "user_legal_consents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_subscriptions"
    ADD CONSTRAINT "user_subscriptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."webhook_logs"
    ADD CONSTRAINT "webhook_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."webhook_request_registry"
    ADD CONSTRAINT "webhook_request_registry_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."website_visits"
    ADD CONSTRAINT "website_visits_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."website_visits"
    ADD CONSTRAINT "website_visits_visit_date_key" UNIQUE ("visit_date");



CREATE INDEX "announcement_edit_requests_announcement_idx" ON "public"."announcement_edit_requests" USING "btree" ("announcement_id", "status", "created_at" DESC);



CREATE UNIQUE INDEX "announcement_edit_requests_pending_unique" ON "public"."announcement_edit_requests" USING "btree" ("announcement_id") WHERE ("status" = 'pending'::"text");



CREATE INDEX "announcement_edit_requests_reanalysis_idx" ON "public"."announcement_edit_requests" USING "btree" ("announcement_id", "reanalysis_available_at" DESC) WHERE (("status" = 'rejected'::"text") AND ("reanalysis_available_at" IS NOT NULL));



CREATE INDEX "announcement_edit_requests_user_idx" ON "public"."announcement_edit_requests" USING "btree" ("user_id", "status", "created_at" DESC);



CREATE INDEX "announcement_reports_announcement_idx" ON "public"."announcement_reports" USING "btree" ("announcement_id", "status", "created_at" DESC);



CREATE INDEX "announcement_reports_reporter_idx" ON "public"."announcement_reports" USING "btree" ("reporter_user_id", "created_at" DESC);



CREATE UNIQUE INDEX "announcement_reports_unique_user_idx" ON "public"."announcement_reports" USING "btree" ("announcement_id", "reporter_user_id");



CREATE UNIQUE INDEX "category_ranking_settings_singleton_idx" ON "public"."category_ranking_settings" USING "btree" ((true));



CREATE UNIQUE INDEX "growth_conversion_settings_singleton_idx" ON "public"."growth_conversion_settings" USING "btree" ((true));



CREATE UNIQUE INDEX "highlight_settings_singleton_idx" ON "public"."highlight_settings" USING "btree" ((true));



CREATE INDEX "idx_admin_mfa_login_tickets_expires_at" ON "public"."admin_mfa_login_tickets" USING "btree" ("expires_at");



CREATE INDEX "idx_admin_mfa_login_tickets_user_id" ON "public"."admin_mfa_login_tickets" USING "btree" ("user_id");



CREATE INDEX "idx_ads_location" ON "public"."announcements" USING "btree" ("state", "city");



CREATE INDEX "idx_ads_price" ON "public"."announcements" USING "btree" ("price");



CREATE INDEX "idx_announcement_highlights_history_announcement_id" ON "public"."announcement_highlights_history" USING "btree" ("announcement_id");



CREATE INDEX "idx_announcement_highlights_history_applied_at" ON "public"."announcement_highlights_history" USING "btree" ("applied_at");



CREATE INDEX "idx_announcement_highlights_history_credit_source" ON "public"."announcement_highlights_history" USING "btree" ("credit_source");



CREATE INDEX "idx_announcement_highlights_history_expires_at" ON "public"."announcement_highlights_history" USING "btree" ("expires_at");



CREATE INDEX "idx_announcement_highlights_history_type" ON "public"."announcement_highlights_history" USING "btree" ("highlight_type");



CREATE INDEX "idx_announcement_highlights_history_user_id" ON "public"."announcement_highlights_history" USING "btree" ("user_id");



CREATE INDEX "idx_announcement_similarity_cooldowns_signature" ON "public"."announcement_similarity_cooldowns" USING "btree" ("user_id", "title_normalized", "category_id", "city", "state", "price");



CREATE INDEX "idx_announcement_similarity_cooldowns_user_active" ON "public"."announcement_similarity_cooldowns" USING "btree" ("user_id", "cooldown_until" DESC);



CREATE INDEX "idx_announcements_category_group_id" ON "public"."announcements" USING "btree" ("category_group_id");



CREATE INDEX "idx_announcements_category_id" ON "public"."announcements" USING "btree" ("category_id");



CREATE INDEX "idx_announcements_community_report_queue" ON "public"."announcements" USING "btree" ("community_reported_to_review_at" DESC) WHERE ("community_reported_to_review_at" IS NOT NULL);



CREATE INDEX "idx_announcements_created_at" ON "public"."announcements" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_announcements_geo" ON "public"."announcements" USING "btree" ("latitude", "longitude") WHERE (("latitude" IS NOT NULL) AND ("longitude" IS NOT NULL));



CREATE INDEX "idx_announcements_highlight_category" ON "public"."announcements" USING "btree" ("highlight_category") WHERE ("highlight_category" = true);



CREATE INDEX "idx_announcements_highlight_home" ON "public"."announcements" USING "btree" ("highlight_home") WHERE ("highlight_home" = true);



CREATE INDEX "idx_announcements_reanalysis_available_at" ON "public"."announcements" USING "btree" ("reanalysis_available_at") WHERE ("reanalysis_available_at" IS NOT NULL);



CREATE INDEX "idx_announcements_status" ON "public"."announcements" USING "btree" ("status");



CREATE INDEX "idx_announcements_user_id" ON "public"."announcements" USING "btree" ("user_id");



CREATE INDEX "idx_announcements_user_store_display_order" ON "public"."announcements" USING "btree" ("user_id", "store_display_order");



CREATE INDEX "idx_audit_action" ON "public"."admin_audit_logs" USING "btree" ("action");



CREATE INDEX "idx_audit_admin_id" ON "public"."admin_audit_logs" USING "btree" ("admin_id");



CREATE INDEX "idx_audit_created_at" ON "public"."admin_audit_logs" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_audit_ip_address" ON "public"."admin_audit_logs" USING "btree" ("ip_address");



CREATE INDEX "idx_audit_resource" ON "public"."admin_audit_logs" USING "btree" ("resource_type", "resource_id");



CREATE INDEX "idx_booster_purchases_status" ON "public"."user_highlight_booster_purchases" USING "btree" ("status");



CREATE INDEX "idx_booster_purchases_user_id" ON "public"."user_highlight_booster_purchases" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "idx_categories_parent_group_slug" ON "public"."categories" USING "btree" ("parent_group_slug", "sort_order", "name");



CREATE INDEX "idx_category_showcase_impressions_announcement" ON "public"."category_showcase_impressions" USING "btree" ("announcement_id", "viewed_at" DESC);



CREATE INDEX "idx_category_showcase_impressions_category" ON "public"."category_showcase_impressions" USING "btree" ("category_slug", "viewed_at" DESC);



CREATE INDEX "idx_category_subcategories_category_id" ON "public"."category_subcategories" USING "btree" ("category_id");



CREATE INDEX "idx_category_subcategories_sort_order" ON "public"."category_subcategories" USING "btree" ("category_id", "sort_order", "name");



CREATE INDEX "idx_chats_ad_id" ON "public"."chats" USING "btree" ("announcement_id");



CREATE INDEX "idx_chats_announcement" ON "public"."chats" USING "btree" ("announcement_id");



CREATE INDEX "idx_chats_buyer" ON "public"."chats" USING "btree" ("buyer_id");



CREATE INDEX "idx_chats_buyer_id" ON "public"."chats" USING "btree" ("buyer_id");



CREATE INDEX "idx_chats_seller" ON "public"."chats" USING "btree" ("seller_id");



CREATE INDEX "idx_chats_seller_id" ON "public"."chats" USING "btree" ("seller_id");



CREATE INDEX "idx_chats_status" ON "public"."chats" USING "btree" ("status");



CREATE INDEX "idx_chats_updated" ON "public"."chats" USING "btree" ("updated_at" DESC);



CREATE INDEX "idx_commercial_intelligence_contact_shares_buyer" ON "public"."commercial_intelligence_contact_shares" USING "btree" ("buyer_user_id", "granted_at" DESC);



CREATE INDEX "idx_commercial_intelligence_contact_shares_seller" ON "public"."commercial_intelligence_contact_shares" USING "btree" ("seller_user_id", "granted_at" DESC);



CREATE INDEX "idx_commercial_intelligence_conversation_messages_conversation" ON "public"."commercial_intelligence_conversation_messages" USING "btree" ("conversation_id", "created_at");



CREATE INDEX "idx_commercial_intelligence_conversations_buyer" ON "public"."commercial_intelligence_conversations" USING "btree" ("buyer_user_id", "updated_at" DESC);



CREATE INDEX "idx_commercial_intelligence_conversations_seller" ON "public"."commercial_intelligence_conversations" USING "btree" ("seller_user_id", "updated_at" DESC);



CREATE INDEX "idx_commercial_intelligence_interest_responses_buyer" ON "public"."commercial_intelligence_interest_responses" USING "btree" ("buyer_user_id", "created_at" DESC);



CREATE INDEX "idx_commercial_intelligence_interest_responses_seller" ON "public"."commercial_intelligence_interest_responses" USING "btree" ("seller_user_id", "created_at" DESC);



CREATE INDEX "idx_commercial_intelligence_outreach_campaigns_user_month" ON "public"."commercial_intelligence_outreach_campaigns" USING "btree" ("seller_user_id", "created_at" DESC);



CREATE INDEX "idx_commercial_intelligence_outreach_deliveries_campaign" ON "public"."commercial_intelligence_outreach_deliveries" USING "btree" ("campaign_id", "created_at" DESC);



CREATE INDEX "idx_commercial_intelligence_requests_user_month" ON "public"."commercial_intelligence_requests" USING "btree" ("seller_user_id", "created_at" DESC);



CREATE INDEX "idx_commercial_lead_preferences_optin" ON "public"."commercial_lead_preferences" USING "btree" ("allow_commercial_contact", "updated_at" DESC);



CREATE INDEX "idx_contact_form_email_jobs_contact_message_id" ON "public"."contact_form_email_jobs" USING "btree" ("contact_message_id");



CREATE INDEX "idx_contact_form_email_jobs_status_queued_at" ON "public"."contact_form_email_jobs" USING "btree" ("status", "queued_at" DESC);



CREATE INDEX "idx_contact_messages_email_created_at" ON "public"."contact_messages" USING "btree" ("email", "created_at" DESC);



CREATE INDEX "idx_contact_messages_requester_user_id" ON "public"."contact_messages" USING "btree" ("requester_user_id");



CREATE INDEX "idx_contact_messages_status_created_at" ON "public"."contact_messages" USING "btree" ("status", "created_at" DESC);



CREATE INDEX "idx_contact_notification_email_dispatch_logs_started_at" ON "public"."contact_notification_email_dispatch_logs" USING "btree" ("started_at" DESC);



CREATE UNIQUE INDEX "idx_contact_notification_email_jobs_lead_unique" ON "public"."contact_notification_email_jobs" USING "btree" ("lead_id") WHERE ("lead_id" IS NOT NULL);



CREATE UNIQUE INDEX "idx_contact_notification_email_jobs_message_unique" ON "public"."contact_notification_email_jobs" USING "btree" ("message_id") WHERE ("message_id" IS NOT NULL);



CREATE INDEX "idx_contact_notification_email_jobs_recipient_user_id" ON "public"."contact_notification_email_jobs" USING "btree" ("recipient_user_id");



CREATE INDEX "idx_contact_notification_email_jobs_status_created_at" ON "public"."contact_notification_email_jobs" USING "btree" ("status", "queued_at" DESC);



CREATE INDEX "idx_favorites_ad_id" ON "public"."favorites" USING "btree" ("announcement_id");



CREATE INDEX "idx_favorites_user_id" ON "public"."favorites" USING "btree" ("user_id");



CREATE INDEX "idx_fiscal_document_jobs_status" ON "public"."fiscal_document_jobs" USING "btree" ("status", "created_at" DESC);



CREATE UNIQUE INDEX "idx_fiscal_settings_singleton" ON "public"."fiscal_settings" USING "btree" ((true));



CREATE INDEX "idx_highlight_boosters_active" ON "public"."highlight_boosters" USING "btree" ("is_active", "position");



CREATE INDEX "idx_home_banners_active" ON "public"."home_banners" USING "btree" ("is_active");



CREATE INDEX "idx_home_banners_sort" ON "public"."home_banners" USING "btree" ("sort_order");



CREATE INDEX "idx_home_showcase_impressions_announcement" ON "public"."home_showcase_impressions" USING "btree" ("announcement_id", "viewed_at" DESC);



CREATE INDEX "idx_institutional_pages_published" ON "public"."institutional_pages" USING "btree" ("is_published");



CREATE INDEX "idx_institutional_pages_slug" ON "public"."institutional_pages" USING "btree" ("slug");



CREATE INDEX "idx_institutional_pages_updated_by" ON "public"."institutional_pages" USING "btree" ("last_updated_by");



CREATE INDEX "idx_invite_campaigns_status" ON "public"."invite_campaigns" USING "btree" ("status", "created_at" DESC);



CREATE INDEX "idx_invite_visits_campaign_id" ON "public"."invite_visits" USING "btree" ("invite_campaign_id", "created_at" DESC);



CREATE INDEX "idx_invite_visits_registered_user_id" ON "public"."invite_visits" USING "btree" ("registered_user_id");



CREATE INDEX "idx_lead_conversions_announcement" ON "public"."lead_conversions" USING "btree" ("announcement_id");



CREATE INDEX "idx_lead_conversions_created_at" ON "public"."lead_conversions" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_lead_conversions_type" ON "public"."lead_conversions" USING "btree" ("conversion_type");



CREATE INDEX "idx_lead_conversions_viewer" ON "public"."lead_conversions" USING "btree" ("viewer_id");



CREATE INDEX "idx_leads_announcement" ON "public"."leads" USING "btree" ("announcement_id");



CREATE INDEX "idx_leads_announcement_created_at" ON "public"."leads" USING "btree" ("announcement_id", "created_at" DESC);



CREATE INDEX "idx_leads_buyer" ON "public"."leads" USING "btree" ("buyer_id");



CREATE INDEX "idx_leads_seller" ON "public"."leads" USING "btree" ("seller_id");



CREATE INDEX "idx_leads_status" ON "public"."leads" USING "btree" ("status");



CREATE INDEX "idx_market_quote_source_previews_source" ON "public"."market_quote_source_previews" USING "btree" ("source_id", "previewed_at" DESC);



CREATE INDEX "idx_market_quote_sources_active" ON "public"."market_quote_sources" USING "btree" ("is_active", "updated_at" DESC);



CREATE INDEX "idx_market_quotes_active_sort" ON "public"."market_quotes" USING "btree" ("is_active", "sort_order", "name");



CREATE INDEX "idx_market_quotes_temp_source_created" ON "public"."market_quotes_temp" USING "btree" ("source_id", "created_at" DESC);



CREATE UNIQUE INDEX "idx_market_quotes_temp_unique_pending" ON "public"."market_quotes_temp" USING "btree" ("source_id", "commodity", "data_referencia", "preco");



CREATE INDEX "idx_marketing_costs_month" ON "public"."marketing_costs" USING "btree" ("month_year" DESC);



CREATE INDEX "idx_messages_chat" ON "public"."messages" USING "btree" ("chat_id");



CREATE INDEX "idx_messages_chat_id" ON "public"."messages" USING "btree" ("chat_id");



CREATE INDEX "idx_messages_created" ON "public"."messages" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_messages_created_at" ON "public"."messages" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_messages_sender" ON "public"."messages" USING "btree" ("sender_id");



CREATE INDEX "idx_messages_sender_id" ON "public"."messages" USING "btree" ("sender_id");



CREATE INDEX "idx_news_article_sources_article" ON "public"."news_article_sources" USING "btree" ("article_id", "display_order");



CREATE INDEX "idx_news_articles_status_published_at" ON "public"."news_articles" USING "btree" ("status", "published_at" DESC NULLS LAST);



CREATE INDEX "idx_news_generation_jobs_status" ON "public"."news_generation_jobs" USING "btree" ("status", "created_at" DESC);



CREATE INDEX "idx_news_ingestions_capture_status" ON "public"."news_ingestions" USING "btree" ("capture_status", "created_at" DESC);



CREATE UNIQUE INDEX "idx_news_social_publications_article_platform" ON "public"."news_social_publications" USING "btree" ("article_id", "platform");



CREATE INDEX "idx_news_social_publications_status" ON "public"."news_social_publications" USING "btree" ("status", "created_at" DESC);



CREATE INDEX "idx_newsletter_campaign_email_jobs_campaign_id" ON "public"."newsletter_campaign_email_jobs" USING "btree" ("campaign_id");



CREATE INDEX "idx_newsletter_campaign_email_jobs_status_created_at" ON "public"."newsletter_campaign_email_jobs" USING "btree" ("status", "queued_at" DESC);



CREATE INDEX "idx_newsletter_campaigns_status_created_at" ON "public"."newsletter_campaigns" USING "btree" ("status", "created_at" DESC);



CREATE INDEX "idx_newsletter_subscriptions_status" ON "public"."newsletter_subscriptions" USING "btree" ("status");



CREATE INDEX "idx_notifications_is_read" ON "public"."notifications" USING "btree" ("is_read");



CREATE INDEX "idx_notifications_unread" ON "public"."notifications" USING "btree" ("user_id", "is_read");



CREATE INDEX "idx_notifications_user" ON "public"."notifications" USING "btree" ("user_id");



CREATE INDEX "idx_notifications_user_id" ON "public"."notifications" USING "btree" ("user_id");



CREATE INDEX "idx_opportunities_expires_at" ON "public"."opportunities" USING "btree" ("expires_at");



CREATE INDEX "idx_opportunities_user_ad" ON "public"."opportunities" USING "btree" ("user_id", "announcement_id");



CREATE INDEX "idx_opportunity_alerts_category" ON "public"."opportunity_alerts" USING "btree" ("category_id");



CREATE INDEX "idx_opportunity_alerts_category_group_id" ON "public"."opportunity_alerts" USING "btree" ("category_group_id");



CREATE INDEX "idx_opportunity_alerts_state" ON "public"."opportunity_alerts" USING "btree" ("state");



CREATE INDEX "idx_opportunity_alerts_status" ON "public"."opportunity_alerts" USING "btree" ("status");



CREATE INDEX "idx_opportunity_alerts_subcategory" ON "public"."opportunity_alerts" USING "btree" ("subcategory_id");



CREATE INDEX "idx_opportunity_alerts_user_id" ON "public"."opportunity_alerts" USING "btree" ("user_id");



CREATE INDEX "idx_opportunity_matches_alert_id" ON "public"."opportunity_matches" USING "btree" ("alert_id");



CREATE INDEX "idx_opportunity_matches_announcement_id" ON "public"."opportunity_matches" USING "btree" ("announcement_id");



CREATE INDEX "idx_opportunity_matches_created_at" ON "public"."opportunity_matches" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_opportunity_matches_is_viewed" ON "public"."opportunity_matches" USING "btree" ("is_viewed");



CREATE INDEX "idx_opportunity_matches_user_id" ON "public"."opportunity_matches" USING "btree" ("user_id");



CREATE INDEX "idx_opportunity_matches_user_viewed" ON "public"."opportunity_matches" USING "btree" ("user_id", "is_viewed", "created_at" DESC);



CREATE INDEX "idx_payments_billing_model" ON "public"."payments" USING "btree" ("billing_model");



CREATE INDEX "idx_payments_booster_id" ON "public"."payments" USING "btree" ("booster_id");



CREATE INDEX "idx_payments_plan_id" ON "public"."payments" USING "btree" ("plan_id");



CREATE INDEX "idx_payments_provider_checkout_session_id" ON "public"."payments" USING "btree" ("provider", "provider_checkout_session_id") WHERE ("provider_checkout_session_id" IS NOT NULL);



CREATE INDEX "idx_payments_provider_customer_id" ON "public"."payments" USING "btree" ("provider", "provider_customer_id") WHERE ("provider_customer_id" IS NOT NULL);



CREATE INDEX "idx_payments_provider_invoice_id" ON "public"."payments" USING "btree" ("provider", "provider_invoice_id") WHERE ("provider_invoice_id" IS NOT NULL);



CREATE INDEX "idx_payments_provider_subscription_id" ON "public"."payments" USING "btree" ("provider", "provider_subscription_id") WHERE ("provider_subscription_id" IS NOT NULL);



CREATE INDEX "idx_payments_status" ON "public"."payments" USING "btree" ("status");



CREATE INDEX "idx_payments_user_id_created_at" ON "public"."payments" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "idx_plan_alert_email_dispatch_logs_started_at" ON "public"."plan_alert_email_dispatch_logs" USING "btree" ("started_at" DESC);



CREATE INDEX "idx_plan_alert_email_jobs_status_created_at" ON "public"."plan_alert_email_jobs" USING "btree" ("status", "queued_at" DESC);



CREATE INDEX "idx_plan_alert_email_jobs_user_id" ON "public"."plan_alert_email_jobs" USING "btree" ("user_id");



CREATE INDEX "idx_plans_active" ON "public"."plans" USING "btree" ("is_active");



CREATE INDEX "idx_plans_billing_model" ON "public"."plans" USING "btree" ("billing_model");



CREATE INDEX "idx_plans_default_signup" ON "public"."plans" USING "btree" ("is_default_signup_plan");



CREATE INDEX "idx_plans_downgrade" ON "public"."plans" USING "btree" ("is_downgrade_plan");



CREATE INDEX "idx_plans_position" ON "public"."plans" USING "btree" ("position");



CREATE INDEX "idx_plans_public_pricing" ON "public"."plans" USING "btree" ("show_in_public_pricing");



CREATE UNIQUE INDEX "idx_plans_single_default_signup" ON "public"."plans" USING "btree" ("is_default_signup_plan") WHERE ("is_default_signup_plan" = true);



CREATE INDEX "idx_price_drop_notifications_user_id" ON "public"."price_drop_notifications" USING "btree" ("user_id");



CREATE UNIQUE INDEX "idx_promotion_plan_codes_code_upper" ON "public"."promotion_plan_codes" USING "btree" ("upper"("code"));



CREATE INDEX "idx_promotion_plan_codes_status" ON "public"."promotion_plan_codes" USING "btree" ("status", "expires_on");



CREATE INDEX "idx_promotion_plan_redemptions_code" ON "public"."promotion_plan_redemptions" USING "btree" ("code_id", "redeemed_at" DESC);



CREATE INDEX "idx_promotion_plan_redemptions_code_user_status" ON "public"."promotion_plan_redemptions" USING "btree" ("code_id", "user_id", "status");



CREATE INDEX "idx_promotion_plan_redemptions_user" ON "public"."promotion_plan_redemptions" USING "btree" ("user_id", "redeemed_at" DESC);



CREATE UNIQUE INDEX "idx_publication_moderation_rules_name_unique" ON "public"."publication_moderation_rules" USING "btree" ("lower"("name"));



CREATE INDEX "idx_radar_match_email_dispatch_logs_started_at" ON "public"."radar_match_email_dispatch_logs" USING "btree" ("started_at" DESC);



CREATE INDEX "idx_radar_match_email_jobs_sent_at" ON "public"."radar_match_email_jobs" USING "btree" ("sent_at" DESC);



CREATE INDEX "idx_radar_match_email_jobs_status_created_at" ON "public"."radar_match_email_jobs" USING "btree" ("status", "queued_at" DESC);



CREATE INDEX "idx_radar_match_email_jobs_user_id" ON "public"."radar_match_email_jobs" USING "btree" ("user_id");



CREATE INDEX "idx_rate_limit_user_action" ON "public"."rate_limit_counters" USING "btree" ("user_id", "action", "window_start");



CREATE INDEX "idx_search_events_created_at" ON "public"."search_events" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_search_events_normalized_term" ON "public"."search_events" USING "btree" ("normalized_term");



CREATE INDEX "idx_security_events_attempted_action_created_at" ON "public"."security_events" USING "btree" ("attempted_action", "created_at" DESC);



CREATE INDEX "idx_security_events_attempted_route" ON "public"."security_events" USING "btree" ("attempted_route");



CREATE INDEX "idx_security_events_created_at" ON "public"."security_events" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_security_events_email_created_at" ON "public"."security_events" USING "btree" ("lower"(COALESCE("email", ''::"text")), "created_at" DESC);



CREATE INDEX "idx_security_events_ip_address" ON "public"."security_events" USING "btree" ("ip_address");



CREATE INDEX "idx_security_events_severity" ON "public"."security_events" USING "btree" ("severity");



CREATE INDEX "idx_security_events_user_id" ON "public"."security_events" USING "btree" ("user_id");



CREATE INDEX "idx_security_events_user_severity" ON "public"."security_events" USING "btree" ("user_id", "severity", "created_at" DESC);



CREATE INDEX "idx_seller_stores_active" ON "public"."seller_stores" USING "btree" ("is_active");



CREATE INDEX "idx_seller_stores_feature_enabled" ON "public"."seller_stores" USING "btree" ("is_store_feature_enabled");



CREATE INDEX "idx_seller_stores_paused_due_to_plan" ON "public"."seller_stores" USING "btree" ("is_paused_due_to_plan");



CREATE INDEX "idx_seller_stores_slug" ON "public"."seller_stores" USING "btree" ("slug");



CREATE INDEX "idx_seller_stores_user_id" ON "public"."seller_stores" USING "btree" ("user_id");



CREATE INDEX "idx_site_page_views_created_at" ON "public"."site_page_views" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_site_page_views_entity_created_at" ON "public"."site_page_views" USING "btree" ("entity_id", "created_at" DESC) WHERE (("page_type" = 'announcement'::"text") AND ("is_admin_area" = false));



CREATE INDEX "idx_site_page_views_page_type_created_at" ON "public"."site_page_views" USING "btree" ("page_type", "created_at" DESC);



CREATE INDEX "idx_site_page_views_path_created_at" ON "public"."site_page_views" USING "btree" ("page_path", "created_at" DESC);



CREATE INDEX "idx_site_page_views_session_id" ON "public"."site_page_views" USING "btree" ("session_id");



CREATE INDEX "idx_site_popup_events_created_at" ON "public"."site_popup_events" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_site_popup_events_event_type" ON "public"."site_popup_events" USING "btree" ("event_type");



CREATE INDEX "idx_site_popup_events_popup_id" ON "public"."site_popup_events" USING "btree" ("popup_id");



CREATE INDEX "idx_site_popup_user_states_user_id" ON "public"."site_popup_user_states" USING "btree" ("user_id", "updated_at" DESC);



CREATE INDEX "idx_site_popups_active_updated_at" ON "public"."site_popups" USING "btree" ("is_active", "updated_at" DESC);



CREATE INDEX "idx_site_presence_last_seen_at" ON "public"."site_presence" USING "btree" ("last_seen_at" DESC);



CREATE INDEX "idx_site_sponsor_clicks_sponsor_created_at" ON "public"."site_sponsor_clicks" USING "btree" ("sponsor_id", "created_at" DESC);



CREATE INDEX "idx_site_sponsor_impressions_sponsor_created_at" ON "public"."site_sponsor_impressions" USING "btree" ("sponsor_id", "created_at" DESC);



CREATE UNIQUE INDEX "idx_site_sponsor_impressions_unique_daily" ON "public"."site_sponsor_impressions" USING "btree" ("sponsor_id", "placement_key", "session_id", "page_path", "impression_date", COALESCE("slot_position", 0));



CREATE UNIQUE INDEX "idx_site_sponsors_active_slot_unique" ON "public"."site_sponsors" USING "btree" ("slot_position") WHERE (("status" = 'active'::"text") AND ("slot_position" IS NOT NULL));



CREATE INDEX "idx_site_sponsors_home_carousel" ON "public"."site_sponsors" USING "btree" ("show_on_home_carousel", "home_carousel_sort_order") WHERE ("show_on_home_carousel" = true);



CREATE INDEX "idx_site_sponsors_metric_recipient_emails" ON "public"."site_sponsors" USING "gin" ("metric_recipient_emails");



CREATE INDEX "idx_site_sponsors_period" ON "public"."site_sponsors" USING "btree" ("starts_on", "ends_on");



CREATE INDEX "idx_site_sponsors_slot_position" ON "public"."site_sponsors" USING "btree" ("slot_position");



CREATE INDEX "idx_site_sponsors_status" ON "public"."site_sponsors" USING "btree" ("status");



CREATE INDEX "idx_sponsor_interest_leads_created_at" ON "public"."sponsor_interest_leads" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_sponsor_interest_leads_status" ON "public"."sponsor_interest_leads" USING "btree" ("status");



CREATE INDEX "idx_sponsor_metric_email_dispatch_logs_started_at" ON "public"."sponsor_metric_email_dispatch_logs" USING "btree" ("started_at" DESC);



CREATE INDEX "idx_sponsor_metric_email_jobs_sponsor_id" ON "public"."sponsor_metric_email_jobs" USING "btree" ("sponsor_id");



CREATE INDEX "idx_sponsor_metric_email_jobs_status_created_at" ON "public"."sponsor_metric_email_jobs" USING "btree" ("status", "queued_at" DESC);



CREATE UNIQUE INDEX "idx_sponsor_metric_email_jobs_unique_period_recipient" ON "public"."sponsor_metric_email_jobs" USING "btree" ("sponsor_id", "recipient_email", "period_start", "period_end");



CREATE INDEX "idx_sponsor_testimonials_status_order" ON "public"."sponsor_testimonials" USING "btree" ("status", "is_featured" DESC, "display_order", "created_at" DESC);



CREATE INDEX "idx_subscription_history_created_at" ON "public"."subscription_history" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_subscription_history_event_type" ON "public"."subscription_history" USING "btree" ("event_type");



CREATE INDEX "idx_subscription_history_period" ON "public"."subscription_history" USING "btree" ("period_start", "period_end");



CREATE INDEX "idx_subscription_history_plan_id" ON "public"."subscription_history" USING "btree" ("plan_id");



CREATE INDEX "idx_subscription_history_user_id" ON "public"."subscription_history" USING "btree" ("user_id");



CREATE UNIQUE INDEX "idx_user_legal_consents_unique_acceptance" ON "public"."user_legal_consents" USING "btree" ("user_id", "consent_type", "document_version", "source") WHERE ("revoked_at" IS NULL);



CREATE INDEX "idx_user_legal_consents_user_id" ON "public"."user_legal_consents" USING "btree" ("user_id", "accepted_at" DESC);



CREATE INDEX "idx_user_subscriptions_billing_model" ON "public"."user_subscriptions" USING "btree" ("billing_model");



CREATE INDEX "idx_user_subscriptions_current_period_end" ON "public"."user_subscriptions" USING "btree" ("current_period_end" DESC);



CREATE UNIQUE INDEX "idx_user_subscriptions_one_active_per_user" ON "public"."user_subscriptions" USING "btree" ("user_id") WHERE ("status" = 'active'::"text");



CREATE INDEX "idx_user_subscriptions_plan_id" ON "public"."user_subscriptions" USING "btree" ("plan_id");



CREATE INDEX "idx_user_subscriptions_promotion_code" ON "public"."user_subscriptions" USING "btree" ("promotion_code_id");



CREATE INDEX "idx_user_subscriptions_provider" ON "public"."user_subscriptions" USING "btree" ("provider");



CREATE INDEX "idx_user_subscriptions_provider_checkout_session_id" ON "public"."user_subscriptions" USING "btree" ("provider", "provider_checkout_session_id") WHERE ("provider_checkout_session_id" IS NOT NULL);



CREATE INDEX "idx_user_subscriptions_provider_customer_id" ON "public"."user_subscriptions" USING "btree" ("provider", "provider_customer_id") WHERE ("provider_customer_id" IS NOT NULL);



CREATE INDEX "idx_user_subscriptions_provider_price_id" ON "public"."user_subscriptions" USING "btree" ("provider", "provider_price_id") WHERE ("provider_price_id" IS NOT NULL);



CREATE INDEX "idx_user_subscriptions_provider_subscription_id" ON "public"."user_subscriptions" USING "btree" ("provider", "provider_subscription_id") WHERE ("provider_subscription_id" IS NOT NULL);



CREATE INDEX "idx_user_subscriptions_status" ON "public"."user_subscriptions" USING "btree" ("status");



CREATE INDEX "idx_user_subscriptions_user_id" ON "public"."user_subscriptions" USING "btree" ("user_id");



CREATE INDEX "idx_users_cep" ON "public"."users" USING "btree" ("cep");



CREATE INDEX "idx_users_cidade" ON "public"."users" USING "btree" ("cidade");



CREATE INDEX "idx_users_document_retry_available_at" ON "public"."users" USING "btree" ("document_retry_available_at");



CREATE INDEX "idx_users_document_review_status" ON "public"."users" USING "btree" ("document_review_status");



CREATE INDEX "idx_users_document_verified" ON "public"."users" USING "btree" ("document_verified") WHERE ("document_verified" IS NOT NULL);



CREATE INDEX "idx_users_email" ON "public"."users" USING "btree" ("email");



CREATE INDEX "idx_users_estado" ON "public"."users" USING "btree" ("estado");



CREATE INDEX "idx_users_geo" ON "public"."users" USING "btree" ("latitude", "longitude") WHERE (("latitude" IS NOT NULL) AND ("longitude" IS NOT NULL));



CREATE INDEX "idx_users_invite_campaign_id" ON "public"."users" USING "btree" ("invite_campaign_id", "created_at" DESC);



CREATE INDEX "idx_users_is_suspended" ON "public"."users" USING "btree" ("is_suspended");



CREATE INDEX "idx_users_role" ON "public"."users" USING "btree" ("role");



CREATE INDEX "idx_webhook_logs_processed" ON "public"."webhook_logs" USING "btree" ("processed");



CREATE INDEX "idx_webhook_logs_provider" ON "public"."webhook_logs" USING "btree" ("provider");



CREATE INDEX "idx_webhook_logs_received_at" ON "public"."webhook_logs" USING "btree" ("received_at" DESC);



CREATE INDEX "idx_webhook_request_registry_created_at" ON "public"."webhook_request_registry" USING "btree" ("created_at" DESC);



CREATE UNIQUE INDEX "idx_webhook_request_registry_provider_request" ON "public"."webhook_request_registry" USING "btree" ("provider", "request_id");



CREATE INDEX "idx_website_visits_date" ON "public"."website_visits" USING "btree" ("visit_date" DESC);



CREATE UNIQUE INDEX "layout_settings_singleton_idx" ON "public"."layout_settings" USING "btree" ((true));



CREATE UNIQUE INDEX "news_social_settings_singleton_idx" ON "public"."news_social_settings" USING "btree" ((true));



CREATE UNIQUE INDEX "renewal_notification_settings_singleton_idx" ON "public"."renewal_notification_settings" USING "btree" ((true));



CREATE INDEX "subcategories_category_id_idx" ON "public"."subcategories" USING "btree" ("category_id");



CREATE INDEX "support_ticket_messages_ticket_id_idx" ON "public"."support_ticket_messages" USING "btree" ("ticket_id", "created_at");



CREATE INDEX "support_tickets_last_message_at_idx" ON "public"."support_tickets" USING "btree" ("last_message_at" DESC);



CREATE INDEX "support_tickets_status_idx" ON "public"."support_tickets" USING "btree" ("status");



CREATE INDEX "support_tickets_user_id_idx" ON "public"."support_tickets" USING "btree" ("user_id");



CREATE UNIQUE INDEX "users_document_normalized_unique_idx" ON "public"."users" USING "btree" ("document_normalized") WHERE ("document_normalized" IS NOT NULL);



CREATE OR REPLACE TRIGGER "announcement_edit_requests_enforce_publication_rules" BEFORE INSERT OR UPDATE OF "payload", "status" ON "public"."announcement_edit_requests" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_announcement_edit_request_publication_rules"();



CREATE OR REPLACE TRIGGER "announcement_edit_requests_touch_updated_at" BEFORE UPDATE ON "public"."announcement_edit_requests" FOR EACH ROW EXECUTE FUNCTION "public"."touch_announcement_edit_requests_updated_at"();



CREATE OR REPLACE TRIGGER "censor_announcements_contact" BEFORE INSERT OR UPDATE OF "title", "description" ON "public"."announcements" FOR EACH ROW EXECUTE FUNCTION "public"."censor_contact_data"();



COMMENT ON TRIGGER "censor_announcements_contact" ON "public"."announcements" IS 'Trigger que censura automaticamente dados de contato (telefones, e-mails, links) nos campos title e description antes de INSERT ou UPDATE. Garante proteção da plataforma mesmo se o frontend for burlado.';



CREATE OR REPLACE TRIGGER "clean_highlights_on_change" BEFORE INSERT OR UPDATE ON "public"."announcements" FOR EACH ROW EXECUTE FUNCTION "public"."check_and_clean_highlights_before_select"();



COMMENT ON TRIGGER "clean_highlights_on_change" ON "public"."announcements" IS 'Trigger que limpa automaticamente destaques expirados antes de INSERT ou UPDATE. Garante que nenhum anúncio seja salvo com destaque expirado.';



CREATE OR REPLACE TRIGGER "handle_updated_at" BEFORE UPDATE ON "public"."announcements" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "on_announcement_activated" AFTER UPDATE OF "status" ON "public"."announcements" FOR EACH ROW WHEN ((("old"."status" <> 'ACTIVE'::"text") AND ("new"."status" = 'ACTIVE'::"text"))) EXECUTE FUNCTION "public"."trigger_radar_matcher"();



CREATE OR REPLACE TRIGGER "on_announcement_price_drop" AFTER UPDATE OF "price" ON "public"."announcements" FOR EACH ROW WHEN (("new"."status" = 'ACTIVE'::"text")) EXECUTE FUNCTION "public"."trigger_radar_matcher_price_drop"();



CREATE OR REPLACE TRIGGER "on_announcement_published" AFTER INSERT ON "public"."announcements" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_radar_matcher"();



CREATE OR REPLACE TRIGGER "on_contact_message_queue_email" AFTER INSERT ON "public"."contact_messages" FOR EACH ROW EXECUTE FUNCTION "public"."queue_contact_form_email_job"();



CREATE OR REPLACE TRIGGER "on_lead_queue_contact_email" AFTER INSERT ON "public"."leads" FOR EACH ROW EXECUTE FUNCTION "public"."queue_contact_lead_email_job"();



CREATE OR REPLACE TRIGGER "on_message_queue_contact_email" AFTER INSERT ON "public"."messages" FOR EACH ROW EXECUTE FUNCTION "public"."queue_contact_message_email_job"();



CREATE OR REPLACE TRIGGER "on_opportunity_alert_backfill_matches" AFTER INSERT OR UPDATE OF "category_group_id", "category_id", "subcategory_id", "state", "radius_km", "min_price", "max_price", "keywords", "status" ON "public"."opportunity_alerts" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_match_existing_announcements_to_alert"();



CREATE OR REPLACE TRIGGER "on_plan_alert_queue_email" AFTER INSERT ON "public"."notifications" FOR EACH ROW EXECUTE FUNCTION "public"."queue_plan_alert_email_job"();



CREATE OR REPLACE TRIGGER "on_radar_match_notify" AFTER INSERT ON "public"."opportunity_matches" FOR EACH ROW EXECUTE FUNCTION "public"."create_radar_match_notification"();



COMMENT ON TRIGGER "on_radar_match_notify" ON "public"."opportunity_matches" IS 'Dispara notificação para usuário quando novo radar match é detectado';



CREATE OR REPLACE TRIGGER "on_radar_match_queue_email" AFTER INSERT ON "public"."opportunity_matches" FOR EACH ROW EXECUTE FUNCTION "public"."queue_radar_match_email_job"();



CREATE OR REPLACE TRIGGER "trg_assign_start_plan" AFTER INSERT ON "public"."users" FOR EACH ROW EXECUTE FUNCTION "public"."assign_start_agro_plan"();



CREATE OR REPLACE TRIGGER "trg_block_messages_for_expired_announcements" BEFORE INSERT ON "public"."messages" FOR EACH ROW EXECUTE FUNCTION "public"."block_messages_for_expired_announcements"();



CREATE OR REPLACE TRIGGER "trg_capture_signup_invite_attribution" AFTER INSERT ON "public"."users" FOR EACH ROW EXECUTE FUNCTION "public"."capture_signup_invite_attribution"();



CREATE OR REPLACE TRIGGER "trg_capture_signup_legal_consents" AFTER INSERT ON "public"."users" FOR EACH ROW EXECUTE FUNCTION "public"."capture_signup_legal_consents"();



CREATE OR REPLACE TRIGGER "trg_enforce_announcement_publication_rules" BEFORE INSERT OR UPDATE OF "title", "description", "category_slug", "images", "status", "publication_review_admin_override" ON "public"."announcements" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_announcement_publication_rules"();



CREATE OR REPLACE TRIGGER "trg_enforce_default_signup_plan_integrity" BEFORE INSERT OR DELETE OR UPDATE ON "public"."plans" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_default_signup_plan_integrity"();



CREATE OR REPLACE TRIGGER "trg_enforce_no_duplicate_active_announcements" BEFORE INSERT OR UPDATE OF "status", "title", "category_id", "city", "state", "price" ON "public"."announcements" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_no_duplicate_active_announcements"();



CREATE OR REPLACE TRIGGER "trg_enforce_simultaneous_active_ad_limit" BEFORE INSERT OR UPDATE OF "status" ON "public"."announcements" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_simultaneous_active_ad_limit"();



CREATE OR REPLACE TRIGGER "trg_mark_start_plan_consumed" AFTER INSERT OR UPDATE OF "plan_id" ON "public"."user_subscriptions" FOR EACH ROW EXECUTE FUNCTION "public"."mark_start_plan_consumed"();



CREATE OR REPLACE TRIGGER "trg_market_quote_sources_updated_at" BEFORE UPDATE ON "public"."market_quote_sources" FOR EACH ROW EXECUTE FUNCTION "public"."set_market_quote_sources_updated_at"();



CREATE OR REPLACE TRIGGER "trg_market_quotes_updated_at" BEFORE UPDATE ON "public"."market_quotes" FOR EACH ROW EXECUTE FUNCTION "public"."set_market_quotes_updated_at"();



CREATE OR REPLACE TRIGGER "trg_plans_updated_at" BEFORE UPDATE ON "public"."plans" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at_plans"();



CREATE OR REPLACE TRIGGER "trg_prevent_start_plan_reuse" BEFORE INSERT OR UPDATE OF "plan_id" ON "public"."user_subscriptions" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_start_plan_reuse"();



CREATE OR REPLACE TRIGGER "trg_refresh_lead_windows_after_subscription_change" AFTER INSERT OR UPDATE OF "plan_id", "status", "current_period_start", "current_period_end" ON "public"."user_subscriptions" FOR EACH ROW EXECUTE FUNCTION "public"."sync_lead_windows_after_subscription_change"();



CREATE OR REPLACE TRIGGER "trg_register_announcement_similarity_cooldown_on_delete" BEFORE DELETE ON "public"."announcements" FOR EACH ROW EXECUTE FUNCTION "public"."register_announcement_similarity_cooldown"();



CREATE OR REPLACE TRIGGER "trg_register_announcement_similarity_cooldown_on_update" BEFORE UPDATE OF "status" ON "public"."announcements" FOR EACH ROW EXECUTE FUNCTION "public"."register_announcement_similarity_cooldown"();



CREATE OR REPLACE TRIGGER "trg_seller_stores_initial_feature_sync" BEFORE INSERT OR UPDATE ON "public"."seller_stores" FOR EACH ROW EXECUTE FUNCTION "public"."handle_seller_store_initial_feature_sync"();



CREATE OR REPLACE TRIGGER "trg_seller_stores_notify_paused_due_to_plan" AFTER UPDATE ON "public"."seller_stores" FOR EACH ROW EXECUTE FUNCTION "public"."notify_partner_store_paused_due_to_plan"();



CREATE OR REPLACE TRIGGER "trg_seller_stores_updated_at" BEFORE UPDATE ON "public"."seller_stores" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "trg_set_highlight_settings_updated_by" BEFORE INSERT OR UPDATE ON "public"."highlight_settings" FOR EACH ROW EXECUTE FUNCTION "public"."set_highlight_settings_updated_by"();



CREATE OR REPLACE TRIGGER "trg_set_support_settings_updated_at" BEFORE UPDATE ON "public"."support_settings" FOR EACH ROW EXECUTE FUNCTION "public"."set_support_settings_updated_at"();



CREATE OR REPLACE TRIGGER "trg_set_support_ticket_updated_at" BEFORE UPDATE ON "public"."support_tickets" FOR EACH ROW EXECUTE FUNCTION "public"."set_support_ticket_updated_at"();



CREATE OR REPLACE TRIGGER "trg_sync_alert_category_group_id" BEFORE INSERT OR UPDATE OF "category_id" ON "public"."opportunity_alerts" FOR EACH ROW EXECUTE FUNCTION "public"."sync_category_group_id_from_category"();



CREATE OR REPLACE TRIGGER "trg_sync_announcement_category_group_id" BEFORE INSERT OR UPDATE OF "category_id" ON "public"."announcements" FOR EACH ROW EXECUTE FUNCTION "public"."sync_category_group_id_from_category"();



CREATE OR REPLACE TRIGGER "trg_sync_announcement_expires_at" BEFORE INSERT OR UPDATE OF "status", "user_id", "expires_at" ON "public"."announcements" FOR EACH ROW EXECUTE FUNCTION "public"."sync_announcement_expires_at"();



CREATE OR REPLACE TRIGGER "trg_sync_lead_contact_expires_at" BEFORE INSERT OR UPDATE OF "seller_id", "created_at" ON "public"."leads" FOR EACH ROW EXECUTE FUNCTION "public"."sync_lead_contact_expires_at"();



CREATE OR REPLACE TRIGGER "trg_sync_payments_invoice_issued_on" BEFORE INSERT OR UPDATE OF "invoice_issued_at", "invoice_issued_on" ON "public"."payments" FOR EACH ROW EXECUTE FUNCTION "public"."sync_payments_invoice_issued_on"();



CREATE OR REPLACE TRIGGER "trg_sync_support_ticket_last_message_at" AFTER INSERT ON "public"."support_ticket_messages" FOR EACH ROW EXECUTE FUNCTION "public"."sync_support_ticket_last_message_at"();



CREATE OR REPLACE TRIGGER "trg_sync_user_document_normalized" BEFORE INSERT OR UPDATE OF "document" ON "public"."users" FOR EACH ROW EXECUTE FUNCTION "public"."sync_user_document_normalized"();



CREATE OR REPLACE TRIGGER "trg_touch_announcement_reports_updated_at" BEFORE UPDATE ON "public"."announcement_reports" FOR EACH ROW EXECUTE FUNCTION "public"."touch_announcement_reports_updated_at"();



CREATE OR REPLACE TRIGGER "trg_touch_category_ranking_settings_updated_at" BEFORE UPDATE ON "public"."category_ranking_settings" FOR EACH ROW EXECUTE FUNCTION "public"."touch_category_ranking_settings_updated_at"();



CREATE OR REPLACE TRIGGER "trg_touch_invite_campaigns_updated_at" BEFORE INSERT OR UPDATE ON "public"."invite_campaigns" FOR EACH ROW EXECUTE FUNCTION "public"."touch_invite_campaigns_updated_at"();



CREATE OR REPLACE TRIGGER "trg_touch_invite_visits_updated_at" BEFORE UPDATE ON "public"."invite_visits" FOR EACH ROW EXECUTE FUNCTION "public"."touch_invite_visits_updated_at"();



CREATE OR REPLACE TRIGGER "trg_touch_promotion_plan_codes_updated_at" BEFORE INSERT OR UPDATE ON "public"."promotion_plan_codes" FOR EACH ROW EXECUTE FUNCTION "public"."touch_promotion_plan_codes_updated_at"();



CREATE OR REPLACE TRIGGER "trg_touch_publication_moderation_rules_updated_at" BEFORE UPDATE ON "public"."publication_moderation_rules" FOR EACH ROW EXECUTE FUNCTION "public"."touch_publication_moderation_rules_updated_at"();



CREATE OR REPLACE TRIGGER "trg_touch_site_sponsors_updated_at" BEFORE INSERT OR UPDATE ON "public"."site_sponsors" FOR EACH ROW EXECUTE FUNCTION "public"."touch_site_sponsors_updated_at"();



CREATE OR REPLACE TRIGGER "trg_touch_sponsor_interest_leads_updated_at" BEFORE UPDATE ON "public"."sponsor_interest_leads" FOR EACH ROW EXECUTE FUNCTION "public"."touch_sponsor_interest_leads_updated_at"();



CREATE OR REPLACE TRIGGER "trg_touch_sponsor_testimonials_updated_at" BEFORE UPDATE ON "public"."sponsor_testimonials" FOR EACH ROW EXECUTE FUNCTION "public"."touch_sponsor_testimonials_updated_at"();



CREATE OR REPLACE TRIGGER "trg_user_subscriptions_sync_seller_store_feature" AFTER INSERT OR DELETE OR UPDATE ON "public"."user_subscriptions" FOR EACH ROW EXECUTE FUNCTION "public"."handle_seller_store_feature_sync"();



CREATE OR REPLACE TRIGGER "trg_user_subscriptions_updated_at" BEFORE UPDATE ON "public"."user_subscriptions" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at_user_subscriptions"();



CREATE OR REPLACE TRIGGER "trg_validate_site_sponsor_capacity" BEFORE INSERT OR UPDATE ON "public"."site_sponsors" FOR EACH ROW EXECUTE FUNCTION "public"."validate_site_sponsor_capacity"();



CREATE OR REPLACE TRIGGER "trg_zzz_enforce_announcement_similarity_review" BEFORE INSERT OR UPDATE OF "status", "title", "category_id", "city", "state", "price" ON "public"."announcements" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_announcement_similarity_review"();



CREATE OR REPLACE TRIGGER "trigger_chats_updated_at" BEFORE UPDATE ON "public"."chats" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "trigger_create_lead_notification" AFTER INSERT ON "public"."leads" FOR EACH ROW EXECUTE FUNCTION "public"."create_lead_notification"();



CREATE OR REPLACE TRIGGER "trigger_create_message_notification" AFTER INSERT ON "public"."messages" FOR EACH ROW EXECUTE FUNCTION "public"."create_message_notification"();



CREATE OR REPLACE TRIGGER "trigger_deduct_credits_on_unlock" BEFORE UPDATE ON "public"."leads" FOR EACH ROW WHEN ((("old"."status" = 'pending'::"text") AND ("new"."status" = 'unlocked'::"text"))) EXECUTE FUNCTION "public"."deduct_credits_on_unlock"();



CREATE OR REPLACE TRIGGER "trigger_leads_updated_at" BEFORE UPDATE ON "public"."leads" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "trigger_match_existing_announcements_to_alert" AFTER INSERT OR UPDATE OF "status", "category_id", "subcategory_id", "state", "radius_km", "min_price", "max_price", "keywords" ON "public"."opportunity_alerts" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_match_existing_announcements_to_alert"();



CREATE OR REPLACE TRIGGER "trigger_messages_updated_at" BEFORE UPDATE ON "public"."messages" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "trigger_notify_critical_event" AFTER INSERT ON "public"."security_events" FOR EACH ROW WHEN (("new"."severity" = ANY (ARRAY['critical'::"public"."severity_level", 'blocked'::"public"."severity_level"]))) EXECUTE FUNCTION "public"."notify_critical_security_event"();



COMMENT ON TRIGGER "trigger_notify_critical_event" ON "public"."security_events" IS 'Dispara notificação PostgreSQL NOTIFY para eventos críticos';



CREATE OR REPLACE TRIGGER "trigger_radar_match_on_activate" AFTER UPDATE OF "status" ON "public"."announcements" FOR EACH ROW WHEN ((("old"."status" IS DISTINCT FROM "new"."status") AND ("new"."status" = 'ACTIVE'::"text"))) EXECUTE FUNCTION "public"."trigger_radar_matcher_sql"();



COMMENT ON TRIGGER "trigger_radar_match_on_activate" ON "public"."announcements" IS 'Cria matches automaticamente quando anúncio muda status para ACTIVE';



CREATE OR REPLACE TRIGGER "trigger_radar_match_on_publish" AFTER INSERT ON "public"."announcements" FOR EACH ROW WHEN (("new"."status" = 'ACTIVE'::"text")) EXECUTE FUNCTION "public"."trigger_radar_matcher_sql"();



COMMENT ON TRIGGER "trigger_radar_match_on_publish" ON "public"."announcements" IS 'Cria matches automaticamente quando novo anúncio é publicado como ACTIVE';



CREATE OR REPLACE TRIGGER "trigger_reset_unread_count" AFTER UPDATE ON "public"."messages" FOR EACH ROW EXECUTE FUNCTION "public"."reset_unread_count"();



CREATE OR REPLACE TRIGGER "trigger_set_first_ad_timestamp" AFTER INSERT ON "public"."announcements" FOR EACH ROW EXECUTE FUNCTION "public"."set_first_ad_timestamp"();



CREATE OR REPLACE TRIGGER "trigger_subscription_created" AFTER INSERT ON "public"."user_subscriptions" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_create_subscription_history"();



CREATE OR REPLACE TRIGGER "trigger_subscription_updated" AFTER UPDATE ON "public"."user_subscriptions" FOR EACH ROW WHEN ((("old"."status" IS DISTINCT FROM "new"."status") OR ("old"."plan_id" IS DISTINCT FROM "new"."plan_id"))) EXECUTE FUNCTION "public"."trigger_update_subscription_history"();



CREATE OR REPLACE TRIGGER "trigger_sync_lead_chat_status" AFTER UPDATE ON "public"."leads" FOR EACH ROW WHEN (("old"."status" IS DISTINCT FROM "new"."status")) EXECUTE FUNCTION "public"."sync_lead_chat_status"();



CREATE OR REPLACE TRIGGER "trigger_touch_commercial_intelligence_contact_shares_updated_at" BEFORE UPDATE ON "public"."commercial_intelligence_contact_shares" FOR EACH ROW EXECUTE FUNCTION "public"."touch_commercial_intelligence_contact_shares_updated_at"();



CREATE OR REPLACE TRIGGER "trigger_touch_commercial_intelligence_conversations_updated_at" BEFORE UPDATE ON "public"."commercial_intelligence_conversations" FOR EACH ROW EXECUTE FUNCTION "public"."touch_commercial_intelligence_conversations_updated_at"();



CREATE OR REPLACE TRIGGER "trigger_touch_commercial_intelligence_interest_responses_update" BEFORE UPDATE ON "public"."commercial_intelligence_interest_responses" FOR EACH ROW EXECUTE FUNCTION "public"."touch_commercial_intelligence_interest_responses_updated_at"();



CREATE OR REPLACE TRIGGER "trigger_touch_commercial_intelligence_outreach_campaigns_update" BEFORE UPDATE ON "public"."commercial_intelligence_outreach_campaigns" FOR EACH ROW EXECUTE FUNCTION "public"."touch_commercial_intelligence_outreach_campaigns_updated_at"();



CREATE OR REPLACE TRIGGER "trigger_touch_commercial_lead_preferences_updated_at" BEFORE UPDATE ON "public"."commercial_lead_preferences" FOR EACH ROW EXECUTE FUNCTION "public"."touch_commercial_lead_preferences_updated_at"();



CREATE OR REPLACE TRIGGER "trigger_touch_contact_form_email_jobs_updated_at" BEFORE UPDATE ON "public"."contact_form_email_jobs" FOR EACH ROW EXECUTE FUNCTION "public"."touch_contact_form_email_jobs_updated_at"();



CREATE OR REPLACE TRIGGER "trigger_touch_contact_messages_updated_at" BEFORE UPDATE ON "public"."contact_messages" FOR EACH ROW EXECUTE FUNCTION "public"."touch_contact_messages_updated_at"();



CREATE OR REPLACE TRIGGER "trigger_touch_contact_notification_email_dispatch_logs_updated_" BEFORE UPDATE ON "public"."contact_notification_email_dispatch_logs" FOR EACH ROW EXECUTE FUNCTION "public"."touch_contact_notification_email_updated_at"();



CREATE OR REPLACE TRIGGER "trigger_touch_contact_notification_email_jobs_updated_at" BEFORE UPDATE ON "public"."contact_notification_email_jobs" FOR EACH ROW EXECUTE FUNCTION "public"."touch_contact_notification_email_updated_at"();



CREATE OR REPLACE TRIGGER "trigger_touch_newsletter_campaign_email_jobs_updated_at" BEFORE UPDATE ON "public"."newsletter_campaign_email_jobs" FOR EACH ROW EXECUTE FUNCTION "public"."touch_updated_at"();



CREATE OR REPLACE TRIGGER "trigger_touch_newsletter_campaigns_updated_at" BEFORE UPDATE ON "public"."newsletter_campaigns" FOR EACH ROW EXECUTE FUNCTION "public"."touch_updated_at"();



CREATE OR REPLACE TRIGGER "trigger_touch_plan_alert_email_dispatch_logs_updated_at" BEFORE UPDATE ON "public"."plan_alert_email_dispatch_logs" FOR EACH ROW EXECUTE FUNCTION "public"."touch_plan_alert_email_updated_at"();



CREATE OR REPLACE TRIGGER "trigger_touch_plan_alert_email_jobs_updated_at" BEFORE UPDATE ON "public"."plan_alert_email_jobs" FOR EACH ROW EXECUTE FUNCTION "public"."touch_plan_alert_email_updated_at"();



CREATE OR REPLACE TRIGGER "trigger_touch_radar_match_email_dispatch_logs_updated_at" BEFORE UPDATE ON "public"."radar_match_email_dispatch_logs" FOR EACH ROW EXECUTE FUNCTION "public"."touch_radar_match_email_updated_at"();



CREATE OR REPLACE TRIGGER "trigger_touch_radar_match_email_jobs_updated_at" BEFORE UPDATE ON "public"."radar_match_email_jobs" FOR EACH ROW EXECUTE FUNCTION "public"."touch_radar_match_email_updated_at"();



CREATE OR REPLACE TRIGGER "trigger_touch_site_presence_updated_at" BEFORE UPDATE ON "public"."site_presence" FOR EACH ROW EXECUTE FUNCTION "public"."touch_site_presence_updated_at"();



CREATE OR REPLACE TRIGGER "trigger_touch_smtp_settings_updated_at" BEFORE UPDATE ON "public"."smtp_settings" FOR EACH ROW EXECUTE FUNCTION "public"."touch_smtp_settings_updated_at"();



CREATE OR REPLACE TRIGGER "trigger_touch_sponsor_metric_email_dispatch_logs_updated_at" BEFORE UPDATE ON "public"."sponsor_metric_email_dispatch_logs" FOR EACH ROW EXECUTE FUNCTION "public"."touch_sponsor_metrics_updated_at"();



CREATE OR REPLACE TRIGGER "trigger_touch_sponsor_metric_email_jobs_updated_at" BEFORE UPDATE ON "public"."sponsor_metric_email_jobs" FOR EACH ROW EXECUTE FUNCTION "public"."touch_sponsor_metrics_updated_at"();



CREATE OR REPLACE TRIGGER "trigger_update_category_count" AFTER INSERT OR DELETE OR UPDATE ON "public"."announcements" FOR EACH ROW EXECUTE FUNCTION "public"."update_category_count"();



CREATE OR REPLACE TRIGGER "trigger_update_chat_last_message" AFTER INSERT ON "public"."messages" FOR EACH ROW EXECUTE FUNCTION "public"."update_chat_last_message"();



CREATE OR REPLACE TRIGGER "trigger_update_chat_on_message" AFTER INSERT ON "public"."messages" FOR EACH ROW EXECUTE FUNCTION "public"."update_chat_last_message"();



CREATE OR REPLACE TRIGGER "trigger_update_opportunity_alerts_updated_at" BEFORE UPDATE ON "public"."opportunity_alerts" FOR EACH ROW EXECUTE FUNCTION "public"."update_opportunity_alerts_updated_at"();



CREATE OR REPLACE TRIGGER "trigger_update_payment_settings_updated_at" BEFORE UPDATE ON "public"."payment_settings" FOR EACH ROW EXECUTE FUNCTION "public"."update_payment_settings_updated_at"();



CREATE OR REPLACE TRIGGER "trigger_update_user_subscriptions_updated_at" BEFORE UPDATE ON "public"."user_subscriptions" FOR EACH ROW EXECUTE FUNCTION "public"."update_user_subscriptions_updated_at"();



CREATE OR REPLACE TRIGGER "update_about_page_updated_at" BEFORE UPDATE ON "public"."about_page_content" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_ad_metrics_updated_at" BEFORE UPDATE ON "public"."announcement_metrics" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_ads_updated_at" BEFORE UPDATE ON "public"."announcements" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_banners_updated_at" BEFORE UPDATE ON "public"."banners" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_categories_updated_at" BEFORE UPDATE ON "public"."categories" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_chats_updated_at" BEFORE UPDATE ON "public"."chats" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_contact_page_updated_at" BEFORE UPDATE ON "public"."contact_page_content" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_home_banners_updated_at" BEFORE UPDATE ON "public"."home_banners" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_institutional_pages_updated_at" BEFORE UPDATE ON "public"."institutional_pages" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_privacy_page_updated_at" BEFORE UPDATE ON "public"."privacy_page_content" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_smtp_config_updated_at" BEFORE UPDATE ON "public"."smtp_config" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_terms_page_updated_at" BEFORE UPDATE ON "public"."terms_page_content" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_users_updated_at" BEFORE UPDATE ON "public"."users" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "users_validate_business_description" BEFORE INSERT OR UPDATE OF "business_description" ON "public"."users" FOR EACH ROW EXECUTE FUNCTION "public"."validate_user_business_description"();



CREATE OR REPLACE TRIGGER "validate_slug_before_insert_update" BEFORE INSERT OR UPDATE ON "public"."institutional_pages" FOR EACH ROW EXECUTE FUNCTION "public"."validate_page_slug"();



ALTER TABLE ONLY "public"."about_page_content"
    ADD CONSTRAINT "about_page_content_last_updated_by_fkey" FOREIGN KEY ("last_updated_by") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."announcement_clicks_by_state"
    ADD CONSTRAINT "ad_clicks_by_state_announcement_id_fkey" FOREIGN KEY ("announcement_id") REFERENCES "public"."announcements"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."admin_audit_logs"
    ADD CONSTRAINT "admin_audit_logs_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."admin_mfa_login_tickets"
    ADD CONSTRAINT "admin_mfa_login_tickets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."announcement_edit_requests"
    ADD CONSTRAINT "announcement_edit_requests_announcement_id_fkey" FOREIGN KEY ("announcement_id") REFERENCES "public"."announcements"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."announcement_edit_requests"
    ADD CONSTRAINT "announcement_edit_requests_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."announcement_edit_requests"
    ADD CONSTRAINT "announcement_edit_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."announcement_highlights_history"
    ADD CONSTRAINT "announcement_highlights_history_announcement_id_fkey" FOREIGN KEY ("announcement_id") REFERENCES "public"."announcements"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."announcement_highlights_history"
    ADD CONSTRAINT "announcement_highlights_history_booster_purchase_id_fkey" FOREIGN KEY ("booster_purchase_id") REFERENCES "public"."user_highlight_booster_purchases"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."announcement_highlights_history"
    ADD CONSTRAINT "announcement_highlights_history_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."announcement_metrics"
    ADD CONSTRAINT "announcement_metrics_announcement_id_fkey" FOREIGN KEY ("announcement_id") REFERENCES "public"."announcements"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."announcement_reports"
    ADD CONSTRAINT "announcement_reports_announcement_id_fkey" FOREIGN KEY ("announcement_id") REFERENCES "public"."announcements"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."announcement_reports"
    ADD CONSTRAINT "announcement_reports_reporter_user_id_fkey" FOREIGN KEY ("reporter_user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."announcement_similarity_cooldowns"
    ADD CONSTRAINT "announcement_similarity_cooldowns_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."announcement_technical_details"
    ADD CONSTRAINT "announcement_technical_details_announcement_id_fkey" FOREIGN KEY ("announcement_id") REFERENCES "public"."announcements"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."announcements"
    ADD CONSTRAINT "announcements_category_group_id_fkey" FOREIGN KEY ("category_group_id") REFERENCES "public"."category_groups"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."announcements"
    ADD CONSTRAINT "announcements_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."announcements"
    ADD CONSTRAINT "announcements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."category_group_categories"
    ADD CONSTRAINT "category_group_categories_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."category_group_categories"
    ADD CONSTRAINT "category_group_categories_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."category_groups"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."category_showcase_impressions"
    ADD CONSTRAINT "category_showcase_impressions_announcement_id_fkey" FOREIGN KEY ("announcement_id") REFERENCES "public"."announcements"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."category_subcategories"
    ADD CONSTRAINT "category_subcategories_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chats"
    ADD CONSTRAINT "chats_announcement_id_fkey" FOREIGN KEY ("announcement_id") REFERENCES "public"."announcements"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chats"
    ADD CONSTRAINT "chats_buyer_id_fkey" FOREIGN KEY ("buyer_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chats"
    ADD CONSTRAINT "chats_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."commercial_intelligence_contact_shares"
    ADD CONSTRAINT "commercial_intelligence_contact_shares_buyer_user_id_fkey" FOREIGN KEY ("buyer_user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."commercial_intelligence_contact_shares"
    ADD CONSTRAINT "commercial_intelligence_contact_shares_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."commercial_intelligence_conversations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."commercial_intelligence_contact_shares"
    ADD CONSTRAINT "commercial_intelligence_contact_shares_seller_user_id_fkey" FOREIGN KEY ("seller_user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."commercial_intelligence_conversation_messages"
    ADD CONSTRAINT "commercial_intelligence_conversation_messa_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."commercial_intelligence_conversations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."commercial_intelligence_conversation_messages"
    ADD CONSTRAINT "commercial_intelligence_conversation_messag_sender_user_id_fkey" FOREIGN KEY ("sender_user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."commercial_intelligence_conversations"
    ADD CONSTRAINT "commercial_intelligence_conversations_buyer_user_id_fkey" FOREIGN KEY ("buyer_user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."commercial_intelligence_conversations"
    ADD CONSTRAINT "commercial_intelligence_conversations_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."commercial_intelligence_outreach_campaigns"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."commercial_intelligence_conversations"
    ADD CONSTRAINT "commercial_intelligence_conversations_response_id_fkey" FOREIGN KEY ("response_id") REFERENCES "public"."commercial_intelligence_interest_responses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."commercial_intelligence_conversations"
    ADD CONSTRAINT "commercial_intelligence_conversations_seller_user_id_fkey" FOREIGN KEY ("seller_user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."commercial_intelligence_interest_responses"
    ADD CONSTRAINT "commercial_intelligence_interest_responses_buyer_user_id_fkey" FOREIGN KEY ("buyer_user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."commercial_intelligence_interest_responses"
    ADD CONSTRAINT "commercial_intelligence_interest_responses_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."commercial_intelligence_outreach_campaigns"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."commercial_intelligence_interest_responses"
    ADD CONSTRAINT "commercial_intelligence_interest_responses_delivery_id_fkey" FOREIGN KEY ("delivery_id") REFERENCES "public"."commercial_intelligence_outreach_deliveries"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."commercial_intelligence_interest_responses"
    ADD CONSTRAINT "commercial_intelligence_interest_responses_seller_user_id_fkey" FOREIGN KEY ("seller_user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."commercial_intelligence_outreach_campaigns"
    ADD CONSTRAINT "commercial_intelligence_outreach_campaigns_seller_user_id_fkey" FOREIGN KEY ("seller_user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."commercial_intelligence_outreach_deliveries"
    ADD CONSTRAINT "commercial_intelligence_outreach_deliver_recipient_user_id_fkey" FOREIGN KEY ("recipient_user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."commercial_intelligence_outreach_deliveries"
    ADD CONSTRAINT "commercial_intelligence_outreach_deliverie_notification_id_fkey" FOREIGN KEY ("notification_id") REFERENCES "public"."notifications"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."commercial_intelligence_outreach_deliveries"
    ADD CONSTRAINT "commercial_intelligence_outreach_deliveries_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."commercial_intelligence_outreach_campaigns"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."commercial_intelligence_requests"
    ADD CONSTRAINT "commercial_intelligence_requests_seller_user_id_fkey" FOREIGN KEY ("seller_user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."commercial_lead_preferences"
    ADD CONSTRAINT "commercial_lead_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."contact_form_email_jobs"
    ADD CONSTRAINT "contact_form_email_jobs_contact_message_id_fkey" FOREIGN KEY ("contact_message_id") REFERENCES "public"."contact_messages"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."contact_messages"
    ADD CONSTRAINT "contact_messages_handled_by_fkey" FOREIGN KEY ("handled_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."contact_messages"
    ADD CONSTRAINT "contact_messages_requester_user_id_fkey" FOREIGN KEY ("requester_user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."contact_notification_email_jobs"
    ADD CONSTRAINT "contact_notification_email_jobs_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."contact_notification_email_jobs"
    ADD CONSTRAINT "contact_notification_email_jobs_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."contact_notification_email_jobs"
    ADD CONSTRAINT "contact_notification_email_jobs_recipient_user_id_fkey" FOREIGN KEY ("recipient_user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."contact_page_content"
    ADD CONSTRAINT "contact_page_content_last_updated_by_fkey" FOREIGN KEY ("last_updated_by") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."favorites"
    ADD CONSTRAINT "favorites_announcement_id_fkey" FOREIGN KEY ("announcement_id") REFERENCES "public"."announcements"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."favorites"
    ADD CONSTRAINT "favorites_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."fiscal_document_jobs"
    ADD CONSTRAINT "fiscal_document_jobs_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."fiscal_settings"
    ADD CONSTRAINT "fiscal_settings_last_updated_by_fkey" FOREIGN KEY ("last_updated_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."opportunity_alerts"
    ADD CONSTRAINT "fk_user" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."growth_conversion_settings"
    ADD CONSTRAINT "growth_conversion_settings_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."highlight_settings"
    ADD CONSTRAINT "highlight_settings_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."home_showcase_impressions"
    ADD CONSTRAINT "home_showcase_impressions_announcement_id_fkey" FOREIGN KEY ("announcement_id") REFERENCES "public"."announcements"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."institutional_pages"
    ADD CONSTRAINT "institutional_pages_last_updated_by_fkey" FOREIGN KEY ("last_updated_by") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."invite_campaigns"
    ADD CONSTRAINT "invite_campaigns_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."invite_visits"
    ADD CONSTRAINT "invite_visits_invite_campaign_id_fkey" FOREIGN KEY ("invite_campaign_id") REFERENCES "public"."invite_campaigns"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."invite_visits"
    ADD CONSTRAINT "invite_visits_registered_user_id_fkey" FOREIGN KEY ("registered_user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."layout_settings"
    ADD CONSTRAINT "layout_settings_last_updated_by_fkey" FOREIGN KEY ("last_updated_by") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."lead_conversions"
    ADD CONSTRAINT "lead_conversions_announcement_id_fkey" FOREIGN KEY ("announcement_id") REFERENCES "public"."announcements"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lead_conversions"
    ADD CONSTRAINT "lead_conversions_viewer_id_fkey" FOREIGN KEY ("viewer_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."leads"
    ADD CONSTRAINT "leads_announcement_id_fkey" FOREIGN KEY ("announcement_id") REFERENCES "public"."announcements"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."leads"
    ADD CONSTRAINT "leads_buyer_id_fkey" FOREIGN KEY ("buyer_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."leads"
    ADD CONSTRAINT "leads_chat_id_fkey" FOREIGN KEY ("chat_id") REFERENCES "public"."chats"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."leads"
    ADD CONSTRAINT "leads_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."market_quote_source_previews"
    ADD CONSTRAINT "market_quote_source_previews_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."market_quote_source_previews"
    ADD CONSTRAINT "market_quote_source_previews_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "public"."market_quote_sources"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."market_quote_sources"
    ADD CONSTRAINT "market_quote_sources_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."market_quotes"
    ADD CONSTRAINT "market_quotes_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "public"."market_quote_sources"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."market_quotes_temp"
    ADD CONSTRAINT "market_quotes_temp_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."market_quotes_temp"
    ADD CONSTRAINT "market_quotes_temp_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "public"."market_quote_sources"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."marketing_costs"
    ADD CONSTRAINT "marketing_costs_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_chat_id_fkey" FOREIGN KEY ("chat_id") REFERENCES "public"."chats"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."news_article_sources"
    ADD CONSTRAINT "news_article_sources_article_id_fkey" FOREIGN KEY ("article_id") REFERENCES "public"."news_articles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."news_article_sources"
    ADD CONSTRAINT "news_article_sources_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "public"."news_sources"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."news_articles"
    ADD CONSTRAINT "news_articles_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."news_articles"
    ADD CONSTRAINT "news_articles_ingestion_id_fkey" FOREIGN KEY ("ingestion_id") REFERENCES "public"."news_ingestions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."news_articles"
    ADD CONSTRAINT "news_articles_legacy_news_id_fkey" FOREIGN KEY ("legacy_news_id") REFERENCES "public"."news"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."news_articles"
    ADD CONSTRAINT "news_articles_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."news_generation_jobs"
    ADD CONSTRAINT "news_generation_jobs_article_id_fkey" FOREIGN KEY ("article_id") REFERENCES "public"."news_articles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."news_generation_jobs"
    ADD CONSTRAINT "news_generation_jobs_ingestion_id_fkey" FOREIGN KEY ("ingestion_id") REFERENCES "public"."news_ingestions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."news_ingestions"
    ADD CONSTRAINT "news_ingestions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."news_ingestions"
    ADD CONSTRAINT "news_ingestions_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "public"."news_sources"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."news_social_publications"
    ADD CONSTRAINT "news_social_publications_article_id_fkey" FOREIGN KEY ("article_id") REFERENCES "public"."news_articles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."newsletter_campaign_email_jobs"
    ADD CONSTRAINT "newsletter_campaign_email_jobs_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."newsletter_campaigns"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."newsletter_campaigns"
    ADD CONSTRAINT "newsletter_campaigns_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."opportunities"
    ADD CONSTRAINT "opportunities_announcement_id_fkey" FOREIGN KEY ("announcement_id") REFERENCES "public"."announcements"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."opportunities"
    ADD CONSTRAINT "opportunities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."opportunity_alerts"
    ADD CONSTRAINT "opportunity_alerts_category_group_id_fkey" FOREIGN KEY ("category_group_id") REFERENCES "public"."category_groups"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."opportunity_alerts"
    ADD CONSTRAINT "opportunity_alerts_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."opportunity_alerts"
    ADD CONSTRAINT "opportunity_alerts_subcategory_id_fkey" FOREIGN KEY ("subcategory_id") REFERENCES "public"."subcategories"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."opportunity_alerts"
    ADD CONSTRAINT "opportunity_alerts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."opportunity_matches"
    ADD CONSTRAINT "opportunity_matches_alert_id_fkey" FOREIGN KEY ("alert_id") REFERENCES "public"."opportunity_alerts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."opportunity_matches"
    ADD CONSTRAINT "opportunity_matches_announcement_id_fkey" FOREIGN KEY ("announcement_id") REFERENCES "public"."announcements"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."opportunity_matches"
    ADD CONSTRAINT "opportunity_matches_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payment_settings"
    ADD CONSTRAINT "payment_settings_last_updated_by_fkey" FOREIGN KEY ("last_updated_by") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_booster_id_fkey" FOREIGN KEY ("booster_id") REFERENCES "public"."highlight_boosters"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "public"."user_subscriptions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."plan_alert_email_jobs"
    ADD CONSTRAINT "plan_alert_email_jobs_notification_id_fkey" FOREIGN KEY ("notification_id") REFERENCES "public"."notifications"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."plan_alert_email_jobs"
    ADD CONSTRAINT "plan_alert_email_jobs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."price_drop_notifications"
    ADD CONSTRAINT "price_drop_notifications_announcement_id_fkey" FOREIGN KEY ("announcement_id") REFERENCES "public"."announcements"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."price_drop_notifications"
    ADD CONSTRAINT "price_drop_notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."privacy_page_content"
    ADD CONSTRAINT "privacy_page_content_last_updated_by_fkey" FOREIGN KEY ("last_updated_by") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."promotion_plan_codes"
    ADD CONSTRAINT "promotion_plan_codes_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."promotion_plan_codes"
    ADD CONSTRAINT "promotion_plan_codes_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."promotion_plan_redemptions"
    ADD CONSTRAINT "promotion_plan_redemptions_code_id_fkey" FOREIGN KEY ("code_id") REFERENCES "public"."promotion_plan_codes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."promotion_plan_redemptions"
    ADD CONSTRAINT "promotion_plan_redemptions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."promotion_plan_redemptions"
    ADD CONSTRAINT "promotion_plan_redemptions_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "public"."user_subscriptions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."promotion_plan_redemptions"
    ADD CONSTRAINT "promotion_plan_redemptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."radar_match_email_jobs"
    ADD CONSTRAINT "radar_match_email_jobs_announcement_id_fkey" FOREIGN KEY ("announcement_id") REFERENCES "public"."announcements"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."radar_match_email_jobs"
    ADD CONSTRAINT "radar_match_email_jobs_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "public"."opportunity_matches"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."radar_match_email_jobs"
    ADD CONSTRAINT "radar_match_email_jobs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."rate_limit_counters"
    ADD CONSTRAINT "rate_limit_counters_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."renewal_notification_settings"
    ADD CONSTRAINT "renewal_notification_settings_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."security_events"
    ADD CONSTRAINT "security_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."seller_stores"
    ADD CONSTRAINT "seller_stores_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."site_page_views"
    ADD CONSTRAINT "site_page_views_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."site_popup_events"
    ADD CONSTRAINT "site_popup_events_popup_id_fkey" FOREIGN KEY ("popup_id") REFERENCES "public"."site_popups"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."site_popup_events"
    ADD CONSTRAINT "site_popup_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."site_popup_user_states"
    ADD CONSTRAINT "site_popup_user_states_popup_id_fkey" FOREIGN KEY ("popup_id") REFERENCES "public"."site_popups"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."site_popup_user_states"
    ADD CONSTRAINT "site_popup_user_states_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."site_popups"
    ADD CONSTRAINT "site_popups_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."site_presence"
    ADD CONSTRAINT "site_presence_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."site_sponsor_clicks"
    ADD CONSTRAINT "site_sponsor_clicks_sponsor_id_fkey" FOREIGN KEY ("sponsor_id") REFERENCES "public"."site_sponsors"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."site_sponsor_clicks"
    ADD CONSTRAINT "site_sponsor_clicks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."site_sponsor_impressions"
    ADD CONSTRAINT "site_sponsor_impressions_sponsor_id_fkey" FOREIGN KEY ("sponsor_id") REFERENCES "public"."site_sponsors"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."site_sponsor_impressions"
    ADD CONSTRAINT "site_sponsor_impressions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."site_sponsors"
    ADD CONSTRAINT "site_sponsors_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."sponsor_metric_email_jobs"
    ADD CONSTRAINT "sponsor_metric_email_jobs_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."sponsor_metric_email_jobs"
    ADD CONSTRAINT "sponsor_metric_email_jobs_sponsor_id_fkey" FOREIGN KEY ("sponsor_id") REFERENCES "public"."site_sponsors"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."subcategories"
    ADD CONSTRAINT "subcategories_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."subscription_history"
    ADD CONSTRAINT "subscription_history_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."subscription_history"
    ADD CONSTRAINT "subscription_history_previous_plan_id_fkey" FOREIGN KEY ("previous_plan_id") REFERENCES "public"."plans"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."subscription_history"
    ADD CONSTRAINT "subscription_history_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "public"."user_subscriptions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."subscription_history"
    ADD CONSTRAINT "subscription_history_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."support_ticket_messages"
    ADD CONSTRAINT "support_ticket_messages_sender_admin_id_fkey" FOREIGN KEY ("sender_admin_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."support_ticket_messages"
    ADD CONSTRAINT "support_ticket_messages_sender_user_id_fkey" FOREIGN KEY ("sender_user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."support_ticket_messages"
    ADD CONSTRAINT "support_ticket_messages_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "public"."support_tickets"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."support_tickets"
    ADD CONSTRAINT "support_tickets_assigned_admin_id_fkey" FOREIGN KEY ("assigned_admin_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."support_tickets"
    ADD CONSTRAINT "support_tickets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."terms_page_content"
    ADD CONSTRAINT "terms_page_content_last_updated_by_fkey" FOREIGN KEY ("last_updated_by") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."user_highlight_booster_purchases"
    ADD CONSTRAINT "user_highlight_booster_purchases_booster_id_fkey" FOREIGN KEY ("booster_id") REFERENCES "public"."highlight_boosters"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."user_highlight_booster_purchases"
    ADD CONSTRAINT "user_highlight_booster_purchases_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."user_highlight_booster_purchases"
    ADD CONSTRAINT "user_highlight_booster_purchases_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_legal_consents"
    ADD CONSTRAINT "user_legal_consents_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_subscriptions"
    ADD CONSTRAINT "user_subscriptions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."user_subscriptions"
    ADD CONSTRAINT "user_subscriptions_promotion_code_id_fkey" FOREIGN KEY ("promotion_code_id") REFERENCES "public"."promotion_plan_codes"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."user_subscriptions"
    ADD CONSTRAINT "user_subscriptions_promotion_redemption_id_fkey" FOREIGN KEY ("promotion_redemption_id") REFERENCES "public"."promotion_plan_redemptions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."user_subscriptions"
    ADD CONSTRAINT "user_subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_document_reviewed_by_fkey" FOREIGN KEY ("document_reviewed_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_invite_campaign_id_fkey" FOREIGN KEY ("invite_campaign_id") REFERENCES "public"."invite_campaigns"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."webhook_request_registry"
    ADD CONSTRAINT "webhook_request_registry_webhook_log_id_fkey" FOREIGN KEY ("webhook_log_id") REFERENCES "public"."webhook_logs"("id") ON DELETE SET NULL;



CREATE POLICY "Admin can view all subscriptions" ON "public"."user_subscriptions" FOR SELECT TO "authenticated" USING (("public"."is_admin"() = true));



CREATE POLICY "Admins can delete banners" ON "public"."home_banners" FOR DELETE TO "authenticated" USING (("public"."is_admin"() = true));



CREATE POLICY "Admins can delete pages" ON "public"."institutional_pages" FOR DELETE TO "authenticated" USING (("public"."is_admin"() = true));



CREATE POLICY "Admins can delete plans" ON "public"."plans" FOR DELETE TO "authenticated" USING (("public"."is_admin"() = true));



CREATE POLICY "Admins can delete site sponsors" ON "public"."site_sponsors" FOR DELETE TO "authenticated" USING ("public"."is_admin_user"());



CREATE POLICY "Admins can delete subscriptions" ON "public"."user_subscriptions" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can delete webhook logs" ON "public"."webhook_logs" FOR DELETE TO "authenticated" USING (("public"."is_admin"() = true));



CREATE POLICY "Admins can delete webhook request registry" ON "public"."webhook_request_registry" FOR DELETE TO "authenticated" USING (("public"."is_admin"() = true));



CREATE POLICY "Admins can insert audit logs" ON "public"."admin_audit_logs" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_admin"() = true));



CREATE POLICY "Admins can insert banners" ON "public"."home_banners" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_admin"() = true));



CREATE POLICY "Admins can insert fiscal settings" ON "public"."fiscal_settings" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_admin"() = true));



CREATE POLICY "Admins can insert notifications" ON "public"."notifications" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_admin"() = true));



CREATE POLICY "Admins can insert pages" ON "public"."institutional_pages" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_admin"() = true));



CREATE POLICY "Admins can insert plans" ON "public"."plans" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_admin"() = true));



CREATE POLICY "Admins can insert site sponsors" ON "public"."site_sponsors" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_admin_user"());



CREATE POLICY "Admins can insert support settings" ON "public"."support_settings" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."users" "u"
  WHERE (("u"."id" = "auth"."uid"()) AND (COALESCE("u"."is_admin", false) = true)))));



CREATE POLICY "Admins can manage category ranking settings" ON "public"."category_ranking_settings" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users" "u"
  WHERE (("u"."id" = "auth"."uid"()) AND ((COALESCE("u"."is_admin", false) = true) OR ("u"."role" = 'admin'::"text")))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."users" "u"
  WHERE (("u"."id" = "auth"."uid"()) AND ((COALESCE("u"."is_admin", false) = true) OR ("u"."role" = 'admin'::"text"))))));



CREATE POLICY "Admins can manage category_group_images" ON "public"."category_group_images" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true)))));



CREATE POLICY "Admins can manage category_subcategories" ON "public"."category_subcategories" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true)))));



CREATE POLICY "Admins can manage contact form email jobs" ON "public"."contact_form_email_jobs" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true)))));



CREATE POLICY "Admins can manage contact messages" ON "public"."contact_messages" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true)))));



CREATE POLICY "Admins can manage contact notification email dispatch logs" ON "public"."contact_notification_email_dispatch_logs" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true)))));



CREATE POLICY "Admins can manage contact notification email jobs" ON "public"."contact_notification_email_jobs" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true)))));



CREATE POLICY "Admins can manage growth conversion settings" ON "public"."growth_conversion_settings" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true)))));



CREATE POLICY "Admins can manage highlight boosters" ON "public"."highlight_boosters" TO "authenticated" USING (("public"."is_admin"() = true)) WITH CHECK (("public"."is_admin"() = true));



CREATE POLICY "Admins can manage highlight settings" ON "public"."highlight_settings" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND (("users"."is_admin" = true) OR ("upper"(COALESCE("users"."role", ''::"text")) = 'ADMIN'::"text")))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND (("users"."is_admin" = true) OR ("upper"(COALESCE("users"."role", ''::"text")) = 'ADMIN'::"text"))))));



CREATE POLICY "Admins can manage legal consents" ON "public"."user_legal_consents" TO "authenticated" USING (("public"."is_admin"() = true)) WITH CHECK (("public"."is_admin"() = true));



CREATE POLICY "Admins can manage news article sources" ON "public"."news_article_sources" TO "authenticated" USING (("public"."is_admin"() = true)) WITH CHECK (("public"."is_admin"() = true));



CREATE POLICY "Admins can manage news articles" ON "public"."news_articles" TO "authenticated" USING (("public"."is_admin"() = true)) WITH CHECK (("public"."is_admin"() = true));



CREATE POLICY "Admins can manage news generation jobs" ON "public"."news_generation_jobs" TO "authenticated" USING (("public"."is_admin"() = true)) WITH CHECK (("public"."is_admin"() = true));



CREATE POLICY "Admins can manage news ingestions" ON "public"."news_ingestions" TO "authenticated" USING (("public"."is_admin"() = true)) WITH CHECK (("public"."is_admin"() = true));



CREATE POLICY "Admins can manage news settings" ON "public"."news_settings" TO "authenticated" USING (("public"."is_admin"() = true)) WITH CHECK (("public"."is_admin"() = true));



CREATE POLICY "Admins can manage news social publications" ON "public"."news_social_publications" TO "authenticated" USING (("public"."is_admin"() = true)) WITH CHECK (("public"."is_admin"() = true));



CREATE POLICY "Admins can manage news social settings" ON "public"."news_social_settings" TO "authenticated" USING (("public"."is_admin"() = true)) WITH CHECK (("public"."is_admin"() = true));



CREATE POLICY "Admins can manage news sources" ON "public"."news_sources" TO "authenticated" USING (("public"."is_admin"() = true)) WITH CHECK (("public"."is_admin"() = true));



CREATE POLICY "Admins can manage newsletter campaign dispatch logs" ON "public"."newsletter_campaign_email_dispatch_logs" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ((COALESCE("users"."is_admin", false) = true) OR ("lower"(COALESCE("users"."role", ''::"text")) = 'admin'::"text")))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ((COALESCE("users"."is_admin", false) = true) OR ("lower"(COALESCE("users"."role", ''::"text")) = 'admin'::"text"))))));



CREATE POLICY "Admins can manage newsletter campaign email jobs" ON "public"."newsletter_campaign_email_jobs" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ((COALESCE("users"."is_admin", false) = true) OR ("lower"(COALESCE("users"."role", ''::"text")) = 'admin'::"text")))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ((COALESCE("users"."is_admin", false) = true) OR ("lower"(COALESCE("users"."role", ''::"text")) = 'admin'::"text"))))));



CREATE POLICY "Admins can manage newsletter campaigns" ON "public"."newsletter_campaigns" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ((COALESCE("users"."is_admin", false) = true) OR ("lower"(COALESCE("users"."role", ''::"text")) = 'admin'::"text")))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ((COALESCE("users"."is_admin", false) = true) OR ("lower"(COALESCE("users"."role", ''::"text")) = 'admin'::"text"))))));



CREATE POLICY "Admins can manage newsletter subscriptions" ON "public"."newsletter_subscriptions" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true)))));



CREATE POLICY "Admins can manage plan alert email dispatch logs" ON "public"."plan_alert_email_dispatch_logs" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true)))));



CREATE POLICY "Admins can manage plan alert email jobs" ON "public"."plan_alert_email_jobs" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true)))));



CREATE POLICY "Admins can manage promotion plan codes" ON "public"."promotion_plan_codes" TO "authenticated" USING (("public"."is_admin"() = true)) WITH CHECK (("public"."is_admin"() = true));



CREATE POLICY "Admins can manage radar match email dispatch logs" ON "public"."radar_match_email_dispatch_logs" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true)))));



CREATE POLICY "Admins can manage radar match email jobs" ON "public"."radar_match_email_jobs" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true)))));



CREATE POLICY "Admins can manage renewal notification settings" ON "public"."renewal_notification_settings" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true)))));



CREATE POLICY "Admins can manage search events" ON "public"."search_events" TO "authenticated" USING ("public"."site_analytics_is_admin"()) WITH CHECK ("public"."site_analytics_is_admin"());



CREATE POLICY "Admins can manage site popups" ON "public"."site_popups" USING (("public"."is_admin"() = true)) WITH CHECK (("public"."is_admin"() = true));



CREATE POLICY "Admins can manage smtp settings" ON "public"."smtp_settings" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true)))));



CREATE POLICY "Admins can manage sponsor metric email dispatch logs" ON "public"."sponsor_metric_email_dispatch_logs" TO "authenticated" USING ("public"."is_admin_user"()) WITH CHECK ("public"."is_admin_user"());



CREATE POLICY "Admins can manage sponsor metric email jobs" ON "public"."sponsor_metric_email_jobs" TO "authenticated" USING ("public"."is_admin_user"()) WITH CHECK ("public"."is_admin_user"());



CREATE POLICY "Admins can manage sponsor testimonials" ON "public"."sponsor_testimonials" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ((COALESCE("users"."is_admin", false) = true) OR ("users"."role" = 'admin'::"text")))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ((COALESCE("users"."is_admin", false) = true) OR ("users"."role" = 'admin'::"text"))))));



CREATE POLICY "Admins can read fiscal jobs" ON "public"."fiscal_document_jobs" FOR SELECT TO "authenticated" USING (("public"."is_admin"() = true));



CREATE POLICY "Admins can read fiscal settings" ON "public"."fiscal_settings" FOR SELECT TO "authenticated" USING (("public"."is_admin"() = true));



CREATE POLICY "Admins can read payments" ON "public"."payments" FOR SELECT TO "authenticated" USING (("public"."is_admin"() = true));



CREATE POLICY "Admins can read site page views" ON "public"."site_page_views" FOR SELECT TO "authenticated" USING ("public"."site_analytics_is_admin"());



CREATE POLICY "Admins can read site presence" ON "public"."site_presence" FOR SELECT TO "authenticated" USING ("public"."site_analytics_is_admin"());



CREATE POLICY "Admins can read site sponsor clicks" ON "public"."site_sponsor_clicks" FOR SELECT TO "authenticated" USING ("public"."is_admin_user"());



CREATE POLICY "Admins can read site sponsor impressions" ON "public"."site_sponsor_impressions" FOR SELECT TO "authenticated" USING ("public"."is_admin_user"());



CREATE POLICY "Admins can read site sponsors" ON "public"."site_sponsors" FOR SELECT TO "authenticated" USING ("public"."is_admin_user"());



CREATE POLICY "Admins can read sponsor interest leads" ON "public"."sponsor_interest_leads" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ((COALESCE("users"."is_admin", false) = true) OR ("users"."role" = 'admin'::"text"))))));



CREATE POLICY "Admins can update about page" ON "public"."about_page_content" FOR UPDATE TO "authenticated" USING (("public"."is_admin"() = true)) WITH CHECK (("public"."is_admin"() = true));



CREATE POLICY "Admins can update all announcement edit requests" ON "public"."announcement_edit_requests" FOR UPDATE TO "authenticated" USING (("public"."is_admin"() = true)) WITH CHECK (("public"."is_admin"() = true));



CREATE POLICY "Admins can update any user" ON "public"."users" FOR UPDATE TO "authenticated" USING (("public"."is_admin"() = true)) WITH CHECK (("public"."is_admin"() = true));



CREATE POLICY "Admins can update banners" ON "public"."home_banners" FOR UPDATE TO "authenticated" USING (("public"."is_admin"() = true)) WITH CHECK (("public"."is_admin"() = true));



CREATE POLICY "Admins can update contact page" ON "public"."contact_page_content" FOR UPDATE TO "authenticated" USING (("public"."is_admin"() = true)) WITH CHECK (("public"."is_admin"() = true));



CREATE POLICY "Admins can update fiscal jobs" ON "public"."fiscal_document_jobs" FOR UPDATE TO "authenticated" USING (("public"."is_admin"() = true)) WITH CHECK (("public"."is_admin"() = true));



CREATE POLICY "Admins can update fiscal settings" ON "public"."fiscal_settings" FOR UPDATE TO "authenticated" USING (("public"."is_admin"() = true)) WITH CHECK (("public"."is_admin"() = true));



CREATE POLICY "Admins can update pages" ON "public"."institutional_pages" FOR UPDATE TO "authenticated" USING (("public"."is_admin"() = true)) WITH CHECK (("public"."is_admin"() = true));



CREATE POLICY "Admins can update payments" ON "public"."payments" FOR UPDATE TO "authenticated" USING (("public"."is_admin"() = true)) WITH CHECK (("public"."is_admin"() = true));



CREATE POLICY "Admins can update plans" ON "public"."plans" FOR UPDATE TO "authenticated" USING (("public"."is_admin"() = true)) WITH CHECK (("public"."is_admin"() = true));



CREATE POLICY "Admins can update privacy page" ON "public"."privacy_page_content" FOR UPDATE TO "authenticated" USING (("public"."is_admin"() = true)) WITH CHECK (("public"."is_admin"() = true));



CREATE POLICY "Admins can update site sponsors" ON "public"."site_sponsors" FOR UPDATE TO "authenticated" USING ("public"."is_admin_user"()) WITH CHECK ("public"."is_admin_user"());



CREATE POLICY "Admins can update sponsor interest leads" ON "public"."sponsor_interest_leads" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ((COALESCE("users"."is_admin", false) = true) OR ("users"."role" = 'admin'::"text")))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ((COALESCE("users"."is_admin", false) = true) OR ("users"."role" = 'admin'::"text"))))));



CREATE POLICY "Admins can update subscriptions" ON "public"."user_subscriptions" FOR UPDATE TO "authenticated" USING (("public"."is_admin"() = true)) WITH CHECK (("public"."is_admin"() = true));



CREATE POLICY "Admins can update support settings" ON "public"."support_settings" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users" "u"
  WHERE (("u"."id" = "auth"."uid"()) AND (COALESCE("u"."is_admin", false) = true))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."users" "u"
  WHERE (("u"."id" = "auth"."uid"()) AND (COALESCE("u"."is_admin", false) = true)))));



CREATE POLICY "Admins can update support tickets" ON "public"."support_tickets" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users" "u"
  WHERE (("u"."id" = "auth"."uid"()) AND (COALESCE("u"."is_admin", false) = true))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."users" "u"
  WHERE (("u"."id" = "auth"."uid"()) AND (COALESCE("u"."is_admin", false) = true)))));



CREATE POLICY "Admins can update terms page" ON "public"."terms_page_content" FOR UPDATE TO "authenticated" USING (("public"."is_admin"() = true)) WITH CHECK (("public"."is_admin"() = true));



CREATE POLICY "Admins can view all announcement edit requests" ON "public"."announcement_edit_requests" FOR SELECT TO "authenticated" USING (("public"."is_admin"() = true));



CREATE POLICY "Admins can view all banners" ON "public"."home_banners" FOR SELECT TO "authenticated" USING (("public"."is_admin"() = true));



CREATE POLICY "Admins can view all booster purchases" ON "public"."user_highlight_booster_purchases" FOR SELECT TO "authenticated" USING (("public"."is_admin"() = true));



CREATE POLICY "Admins can view all pages" ON "public"."institutional_pages" FOR SELECT TO "authenticated" USING (("public"."is_admin"() = true));



CREATE POLICY "Admins can view all plans" ON "public"."plans" FOR SELECT TO "authenticated" USING (("public"."is_admin"() = true));



CREATE POLICY "Admins can view all subscriptions" ON "public"."user_subscriptions" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can view all users" ON "public"."users" FOR SELECT TO "authenticated" USING (("public"."is_admin"() = true));



CREATE POLICY "Admins can view category showcase impressions" ON "public"."category_showcase_impressions" FOR SELECT TO "authenticated" USING (("public"."is_admin"() = true));



CREATE POLICY "Admins can view home showcase impressions" ON "public"."home_showcase_impressions" FOR SELECT TO "authenticated" USING (("public"."is_admin"() = true));



CREATE POLICY "Admins can view promotion plan redemptions" ON "public"."promotion_plan_redemptions" FOR SELECT TO "authenticated" USING (("public"."is_admin"() = true));



CREATE POLICY "Admins can view site popup events" ON "public"."site_popup_events" FOR SELECT USING (("public"."is_admin"() = true));



CREATE POLICY "Admins can view webhook logs" ON "public"."webhook_logs" FOR SELECT TO "authenticated" USING (("public"."is_admin"() = true));



CREATE POLICY "Admins can view webhook request registry" ON "public"."webhook_request_registry" FOR SELECT TO "authenticated" USING (("public"."is_admin"() = true));



CREATE POLICY "Admins manage invite campaigns" ON "public"."invite_campaigns" TO "authenticated" USING (("public"."is_admin"() = true)) WITH CHECK (("public"."is_admin"() = true));



CREATE POLICY "Admins view invite visits" ON "public"."invite_visits" FOR SELECT TO "authenticated" USING (("public"."is_admin"() = true));



CREATE POLICY "Anyone can read highlight settings" ON "public"."highlight_settings" FOR SELECT USING (true);



CREATE POLICY "Anyone can view active highlight boosters" ON "public"."highlight_boosters" FOR SELECT USING ((("is_active" = true) OR ("auth"."uid"() IS NOT NULL)));



CREATE POLICY "Anyone can view active plans" ON "public"."plans" FOR SELECT TO "authenticated", "anon" USING (("is_active" = true));



CREATE POLICY "Authenticated users can read support settings" ON "public"."support_settings" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can view category_subcategories" ON "public"."category_subcategories" FOR SELECT TO "authenticated", "anon" USING (("is_active" = true));



CREATE POLICY "Compradores podem criar chats" ON "public"."chats" FOR INSERT WITH CHECK (("auth"."uid"() = "buyer_id"));



CREATE POLICY "Enable insert for authenticated users only" ON "public"."announcements" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Enable update for users based on user_id" ON "public"."announcements" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "News are public" ON "public"."news" FOR SELECT USING (true);



CREATE POLICY "Only admins can create subscriptions" ON "public"."user_subscriptions" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_admin"() = true));



CREATE POLICY "Only admins can delete subscriptions" ON "public"."user_subscriptions" FOR DELETE TO "authenticated" USING (("public"."is_admin"() = true));



CREATE POLICY "Participantes podem atualizar chats" ON "public"."chats" FOR UPDATE USING ((("auth"."uid"() = "buyer_id") OR ("auth"."uid"() = "seller_id")));



CREATE POLICY "Plans are publicly readable" ON "public"."plans" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Plans public read" ON "public"."plans" FOR SELECT USING (("is_active" = true));



CREATE POLICY "Public can insert category showcase impressions" ON "public"."category_showcase_impressions" FOR INSERT WITH CHECK (true);



CREATE POLICY "Public can insert click records" ON "public"."announcement_clicks_by_state" FOR INSERT WITH CHECK (true);



COMMENT ON POLICY "Public can insert click records" ON "public"."announcement_clicks_by_state" IS 'Permite que qualquer visitante (anônimo ou autenticado) registre cliques para analytics';



CREATE POLICY "Public can insert home showcase impressions" ON "public"."home_showcase_impressions" FOR INSERT WITH CHECK (true);



CREATE POLICY "Public can insert site popup events" ON "public"."site_popup_events" FOR INSERT WITH CHECK (true);



CREATE POLICY "Public can insert sponsor interest leads" ON "public"."sponsor_interest_leads" FOR INSERT TO "authenticated", "anon" WITH CHECK ((("company_name" IS NOT NULL) AND ("contact_name" IS NOT NULL) AND ("email" IS NOT NULL) AND ("segment" IS NOT NULL) AND ("source" = 'sponsor_landing'::"text")));



CREATE POLICY "Public can read category_group_images" ON "public"."category_group_images" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "Public can read news article sources for published articles" ON "public"."news_article_sources" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."news_articles" "a"
  WHERE (("a"."id" = "news_article_sources"."article_id") AND ("a"."status" = 'published'::"text")))));



CREATE POLICY "Public can read published news articles" ON "public"."news_articles" FOR SELECT USING (("status" = 'published'::"text"));



CREATE POLICY "Public can read published sponsor testimonials" ON "public"."sponsor_testimonials" FOR SELECT TO "authenticated", "anon" USING (("status" = 'published'::"text"));



CREATE POLICY "Public can view about page" ON "public"."about_page_content" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "Public can view active banners" ON "public"."home_banners" FOR SELECT TO "authenticated", "anon" USING (("is_active" = true));



CREATE POLICY "Public can view active site popups" ON "public"."site_popups" FOR SELECT USING ((("is_active" = true) OR ("public"."is_admin"() = true)));



CREATE POLICY "Public can view contact page" ON "public"."contact_page_content" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "Public can view privacy page" ON "public"."privacy_page_content" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "Public can view published pages" ON "public"."institutional_pages" FOR SELECT TO "authenticated", "anon" USING (("is_published" = true));



CREATE POLICY "Public can view terms page" ON "public"."terms_page_content" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "Service role can manage fiscal jobs" ON "public"."fiscal_document_jobs" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role only" ON "public"."rate_limit_counters" AS RESTRICTIVE USING (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "Sistema pode criar leads" ON "public"."leads" FOR INSERT WITH CHECK (("auth"."uid"() = "buyer_id"));



CREATE POLICY "User subscriptions read" ON "public"."user_subscriptions" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can create own announcement edit requests" ON "public"."announcement_edit_requests" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can create own commercial intelligence requests" ON "public"."commercial_intelligence_requests" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "seller_user_id"));



CREATE POLICY "Users can create own support messages" ON "public"."support_ticket_messages" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."support_tickets" "t"
  WHERE (("t"."id" = "support_ticket_messages"."ticket_id") AND ("t"."status" <> ALL (ARRAY['resolved'::"text", 'closed'::"text"])) AND ((("t"."user_id" = "auth"."uid"()) AND ("support_ticket_messages"."sender_type" = 'user'::"text") AND ("support_ticket_messages"."sender_user_id" = "auth"."uid"())) OR ((EXISTS ( SELECT 1
           FROM "public"."users" "u"
          WHERE (("u"."id" = "auth"."uid"()) AND (COALESCE("u"."is_admin", false) = true)))) AND ("support_ticket_messages"."sender_type" = 'admin'::"text") AND ("support_ticket_messages"."sender_admin_id" = "auth"."uid"())))))));



CREATE POLICY "Users can create own support tickets" ON "public"."support_tickets" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can create their own alerts" ON "public"."opportunity_alerts" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete their own alerts" ON "public"."opportunity_alerts" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own site popup states" ON "public"."site_popup_user_states" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own subscriptions" ON "public"."user_subscriptions" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert their own highlights" ON "public"."announcement_highlights_history" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert their own matches" ON "public"."opportunity_matches" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



COMMENT ON POLICY "Users can insert their own matches" ON "public"."opportunity_matches" IS 'Permite inserção de matches quando o user_id corresponde ao usuário autenticado. Triggers do sistema usam SECURITY DEFINER para bypass.';



CREATE POLICY "Users can read own announcement similarity cooldowns" ON "public"."announcement_similarity_cooldowns" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can read own commercial intelligence contact shares" ON "public"."commercial_intelligence_contact_shares" FOR SELECT TO "authenticated" USING ((("auth"."uid"() = "seller_user_id") OR ("auth"."uid"() = "buyer_user_id") OR (EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true))))));



CREATE POLICY "Users can read own commercial intelligence conversation message" ON "public"."commercial_intelligence_conversation_messages" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."commercial_intelligence_conversations" "conversations"
  WHERE (("conversations"."id" = "commercial_intelligence_conversation_messages"."conversation_id") AND (("conversations"."seller_user_id" = "auth"."uid"()) OR ("conversations"."buyer_user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."users"
          WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true)))))))));



CREATE POLICY "Users can read own commercial intelligence conversations" ON "public"."commercial_intelligence_conversations" FOR SELECT TO "authenticated" USING ((("auth"."uid"() = "seller_user_id") OR ("auth"."uid"() = "buyer_user_id") OR (EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true))))));



CREATE POLICY "Users can read own commercial intelligence requests" ON "public"."commercial_intelligence_requests" FOR SELECT TO "authenticated" USING ((("auth"."uid"() = "seller_user_id") OR (EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true))))));



CREATE POLICY "Users can read own commercial intelligence responses" ON "public"."commercial_intelligence_interest_responses" FOR SELECT TO "authenticated" USING ((("auth"."uid"() = "seller_user_id") OR ("auth"."uid"() = "buyer_user_id") OR (EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true))))));



CREATE POLICY "Users can read own commercial lead preferences" ON "public"."commercial_lead_preferences" FOR SELECT TO "authenticated" USING ((("auth"."uid"() = "user_id") OR (EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true))))));



CREATE POLICY "Users can read own commercial outreach campaigns" ON "public"."commercial_intelligence_outreach_campaigns" FOR SELECT TO "authenticated" USING ((("auth"."uid"() = "seller_user_id") OR (EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true))))));



CREATE POLICY "Users can read own commercial outreach deliveries" ON "public"."commercial_intelligence_outreach_deliveries" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."commercial_intelligence_outreach_campaigns" "campaigns"
  WHERE (("campaigns"."id" = "commercial_intelligence_outreach_deliveries"."campaign_id") AND (("campaigns"."seller_user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."users"
          WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true)))))))));



CREATE POLICY "Users can read own payments" ON "public"."payments" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own pending announcement edit requests" ON "public"."announcement_edit_requests" FOR UPDATE TO "authenticated" USING ((("auth"."uid"() = "user_id") AND ("status" = 'pending'::"text"))) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own site popup states" ON "public"."site_popup_user_states" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update their announcement clicks" ON "public"."announcement_clicks_by_state" FOR UPDATE TO "authenticated" USING (("announcement_id" IN ( SELECT "announcements"."id"
   FROM "public"."announcements"
  WHERE ("announcements"."user_id" = "auth"."uid"()))));



CREATE POLICY "Users can update their own alerts" ON "public"."opportunity_alerts" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update their own data" ON "public"."users" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "id")) WITH CHECK ((("auth"."uid"() = "id") AND ("is_admin" = ( SELECT "users_1"."is_admin"
   FROM "public"."users" "users_1"
  WHERE ("users_1"."id" = "auth"."uid"()))) AND ("role" = ( SELECT "users_1"."role"
   FROM "public"."users" "users_1"
  WHERE ("users_1"."id" = "auth"."uid"())))));



CREATE POLICY "Users can update their own matches" ON "public"."opportunity_matches" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can upsert own commercial lead preferences" ON "public"."commercial_lead_preferences" TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own announcement edit requests" ON "public"."announcement_edit_requests" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own legal consents" ON "public"."user_legal_consents" FOR SELECT TO "authenticated" USING ((("auth"."uid"() = "user_id") OR ("public"."is_admin"() = true)));



CREATE POLICY "Users can view own promotion plan redemptions" ON "public"."promotion_plan_redemptions" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own site popup states" ON "public"."site_popup_user_states" FOR SELECT USING ((("auth"."uid"() = "user_id") OR ("public"."is_admin"() = true)));



CREATE POLICY "Users can view own subscriptions" ON "public"."user_subscriptions" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own support messages" ON "public"."support_ticket_messages" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."support_tickets" "t"
  WHERE (("t"."id" = "support_ticket_messages"."ticket_id") AND (("t"."user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."users" "u"
          WHERE (("u"."id" = "auth"."uid"()) AND (COALESCE("u"."is_admin", false) = true)))))))));



CREATE POLICY "Users can view own support tickets" ON "public"."support_tickets" FOR SELECT TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."users" "u"
  WHERE (("u"."id" = "auth"."uid"()) AND (COALESCE("u"."is_admin", false) = true))))));



CREATE POLICY "Users can view their own alerts" ON "public"."opportunity_alerts" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own booster purchases" ON "public"."user_highlight_booster_purchases" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own data" ON "public"."users" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "id"));



CREATE POLICY "Users can view their own highlights" ON "public"."announcement_highlights_history" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own matches" ON "public"."opportunity_matches" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own subscriptions" ON "public"."user_subscriptions" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users see only their announcement clicks" ON "public"."announcement_clicks_by_state" FOR SELECT TO "authenticated" USING (("announcement_id" IN ( SELECT "announcements"."id"
   FROM "public"."announcements"
  WHERE ("announcements"."user_id" = "auth"."uid"()))));



COMMENT ON POLICY "Users see only their announcement clicks" ON "public"."announcement_clicks_by_state" IS 'Garante privacidade: cada usuário vê apenas estatísticas dos próprios anúncios';



CREATE POLICY "Usuários podem adicionar favoritos" ON "public"."favorites" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Usuários podem atualizar mensagens de seus chats" ON "public"."messages" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."chats"
  WHERE (("chats"."id" = "messages"."chat_id") AND (("chats"."buyer_id" = "auth"."uid"()) OR ("chats"."seller_id" = "auth"."uid"()))))));



CREATE POLICY "Usuários podem criar chats" ON "public"."chats" FOR INSERT WITH CHECK ((("auth"."uid"() = "seller_id") OR ("auth"."uid"() = "buyer_id")));



CREATE POLICY "Usuários podem enviar mensagens" ON "public"."messages" FOR INSERT WITH CHECK ((("auth"."uid"() = "sender_id") AND (EXISTS ( SELECT 1
   FROM "public"."chats"
  WHERE (("chats"."id" = "messages"."chat_id") AND (("chats"."buyer_id" = "auth"."uid"()) OR ("chats"."seller_id" = "auth"."uid"())))))));



CREATE POLICY "Usuários podem marcar notificações como lidas" ON "public"."notifications" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Usuários podem remover favoritos" ON "public"."favorites" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Usuários podem remover seus favoritos" ON "public"."favorites" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Usuários podem ver mensagens de seus chats" ON "public"."messages" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."chats"
  WHERE (("chats"."id" = "messages"."chat_id") AND (("chats"."buyer_id" = "auth"."uid"()) OR ("chats"."seller_id" = "auth"."uid"()))))));



CREATE POLICY "Usuários podem ver seus próprios chats" ON "public"."chats" FOR SELECT USING ((("auth"."uid"() = "buyer_id") OR ("auth"."uid"() = "seller_id")));



CREATE POLICY "Usuários podem ver seus próprios favoritos" ON "public"."favorites" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Usuários podem ver suas próprias notificações" ON "public"."notifications" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Usuários veem mensagens dos próprios chats" ON "public"."messages" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."chats"
  WHERE (("chats"."id" = "messages"."chat_id") AND (("chats"."seller_id" = "auth"."uid"()) OR ("chats"."buyer_id" = "auth"."uid"()))))));



CREATE POLICY "Usuários veem próprias faturas" ON "public"."invoices" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Usuários veem próprias notificações" ON "public"."notifications" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Usuários veem próprias notificações de preço" ON "public"."price_drop_notifications" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Usuários veem próprias oportunidades" ON "public"."opportunities" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Usuários veem próprios chats" ON "public"."chats" FOR SELECT USING ((("auth"."uid"() = "seller_id") OR ("auth"."uid"() = "buyer_id")));



CREATE POLICY "Usuários veem próprios favoritos" ON "public"."favorites" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Vendedores e compradores podem ver seus leads" ON "public"."leads" FOR SELECT USING ((("auth"."uid"() = "buyer_id") OR ("auth"."uid"() = "seller_id")));



CREATE POLICY "Vendedores podem atualizar status do lead" ON "public"."leads" FOR UPDATE USING (("auth"."uid"() = "seller_id"));



CREATE POLICY "Vendedores veem seu histórico de destaques" ON "public"."announcement_highlights_history" FOR SELECT USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."about_page_content" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."admin_audit_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."admin_mfa_login_tickets" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "admins_delete_notifications" ON "public"."notifications" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND (("users"."is_admin" = true) OR ("upper"(COALESCE("users"."role", ''::"text")) = 'ADMIN'::"text"))))));



CREATE POLICY "admins_delete_users" ON "public"."users" FOR DELETE USING ("public"."is_current_user_admin"());



CREATE POLICY "admins_insert_notifications" ON "public"."notifications" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND (("users"."is_admin" = true) OR ("upper"(COALESCE("users"."role", ''::"text")) = 'ADMIN'::"text"))))));



CREATE POLICY "admins_manage_marketing_costs" ON "public"."marketing_costs" USING ((( SELECT "users"."is_admin"
   FROM "public"."users"
  WHERE ("users"."id" = "auth"."uid"())) = true));



CREATE POLICY "admins_select_all_users" ON "public"."users" FOR SELECT USING ("public"."is_current_user_admin"());



CREATE POLICY "admins_select_notifications" ON "public"."notifications" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND (("users"."is_admin" = true) OR ("upper"(COALESCE("users"."role", ''::"text")) = 'ADMIN'::"text"))))));



CREATE POLICY "admins_update_all_users" ON "public"."users" FOR UPDATE USING ("public"."is_current_user_admin"());



CREATE POLICY "admins_update_notifications" ON "public"."notifications" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND (("users"."is_admin" = true) OR ("upper"(COALESCE("users"."role", ''::"text")) = 'ADMIN'::"text")))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND (("users"."is_admin" = true) OR ("upper"(COALESCE("users"."role", ''::"text")) = 'ADMIN'::"text"))))));



CREATE POLICY "admins_view_audit_logs" ON "public"."admin_audit_logs" FOR SELECT USING ("public"."is_current_user_admin"());



CREATE POLICY "admins_view_lead_conversions" ON "public"."lead_conversions" FOR SELECT USING ((( SELECT "users"."is_admin"
   FROM "public"."users"
  WHERE ("users"."id" = "auth"."uid"())) = true));



CREATE POLICY "admins_view_security_events" ON "public"."security_events" FOR SELECT USING ("public"."is_admin"());



CREATE POLICY "admins_view_subscription_history" ON "public"."subscription_history" FOR SELECT USING ((( SELECT "users"."is_admin"
   FROM "public"."users"
  WHERE ("users"."id" = "auth"."uid"())) = true));



CREATE POLICY "admins_view_website_visits" ON "public"."website_visits" FOR SELECT USING ((( SELECT "users"."is_admin"
   FROM "public"."users"
  WHERE ("users"."id" = "auth"."uid"())) = true));



ALTER TABLE "public"."announcement_clicks_by_state" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."announcement_edit_requests" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."announcement_highlights_history" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."announcement_reports" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "announcement_reports_admin_select" ON "public"."announcement_reports" FOR SELECT TO "authenticated" USING (("public"."is_admin"() = true));



CREATE POLICY "announcement_reports_admin_update" ON "public"."announcement_reports" FOR UPDATE TO "authenticated" USING (("public"."is_admin"() = true)) WITH CHECK (("public"."is_admin"() = true));



ALTER TABLE "public"."announcement_similarity_cooldowns" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."announcements" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."category_group_images" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."category_ranking_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."category_showcase_impressions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."category_subcategories" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."chats" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."commercial_intelligence_contact_shares" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."commercial_intelligence_conversation_messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."commercial_intelligence_conversations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."commercial_intelligence_interest_responses" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."commercial_intelligence_outreach_campaigns" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."commercial_intelligence_outreach_deliveries" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."commercial_intelligence_requests" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."commercial_lead_preferences" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."contact_form_email_jobs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."contact_messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."contact_notification_email_dispatch_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."contact_notification_email_jobs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."contact_page_content" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "delete_announcements" ON "public"."announcements" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "enable_insert_for_registration" ON "public"."users" FOR INSERT WITH CHECK (("auth"."uid"() = "id"));



ALTER TABLE "public"."favorites" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."fiscal_document_jobs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."fiscal_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."growth_conversion_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."highlight_boosters" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."highlight_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."home_banners" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."home_showcase_impressions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "insert_announcements" ON "public"."announcements" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."institutional_pages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."invite_campaigns" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."invite_visits" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."invoices" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."lead_conversions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."leads" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."market_quote_source_previews" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "market_quote_source_previews_admin_only" ON "public"."market_quote_source_previews" USING ((EXISTS ( SELECT 1
   FROM "public"."users" "u"
  WHERE (("u"."id" = "auth"."uid"()) AND ("u"."is_admin" = true))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."users" "u"
  WHERE (("u"."id" = "auth"."uid"()) AND ("u"."is_admin" = true)))));



ALTER TABLE "public"."market_quote_sources" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "market_quote_sources_admin_only" ON "public"."market_quote_sources" USING ((EXISTS ( SELECT 1
   FROM "public"."users" "u"
  WHERE (("u"."id" = "auth"."uid"()) AND ("u"."is_admin" = true))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."users" "u"
  WHERE (("u"."id" = "auth"."uid"()) AND ("u"."is_admin" = true)))));



ALTER TABLE "public"."market_quotes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "market_quotes_admin_manage" ON "public"."market_quotes" USING ((EXISTS ( SELECT 1
   FROM "public"."users" "u"
  WHERE (("u"."id" = "auth"."uid"()) AND ("u"."is_admin" = true))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."users" "u"
  WHERE (("u"."id" = "auth"."uid"()) AND ("u"."is_admin" = true)))));



CREATE POLICY "market_quotes_public_read" ON "public"."market_quotes" FOR SELECT USING (("is_active" = true));



ALTER TABLE "public"."market_quotes_temp" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "market_quotes_temp_admin_only" ON "public"."market_quotes_temp" USING ((EXISTS ( SELECT 1
   FROM "public"."users" "u"
  WHERE (("u"."id" = "auth"."uid"()) AND ("u"."is_admin" = true))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."users" "u"
  WHERE (("u"."id" = "auth"."uid"()) AND ("u"."is_admin" = true)))));



ALTER TABLE "public"."marketing_costs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."news" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."news_article_sources" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."news_articles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."news_generation_jobs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."news_ingestions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."news_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."news_social_publications" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."news_social_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."news_sources" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."newsletter_campaign_email_dispatch_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."newsletter_campaign_email_jobs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."newsletter_campaigns" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."newsletter_subscriptions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "no_delete_security_events" ON "public"."security_events" FOR DELETE USING (false);



CREATE POLICY "no_update_security_events" ON "public"."security_events" FOR UPDATE USING (false);



ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."opportunities" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."opportunity_alerts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."opportunity_matches" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."payment_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."payments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."plan_alert_email_dispatch_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."plan_alert_email_jobs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."plans" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."price_drop_notifications" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."privacy_page_content" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."promotion_plan_codes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."promotion_plan_redemptions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."publication_moderation_rules" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "publication_moderation_rules_admin_all" ON "public"."publication_moderation_rules" TO "authenticated" USING (("public"."is_admin"() = true)) WITH CHECK (("public"."is_admin"() = true));



ALTER TABLE "public"."radar_match_email_dispatch_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."radar_match_email_jobs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."rate_limit_counters" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."renewal_notification_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."search_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."security_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "select_announcements" ON "public"."announcements" FOR SELECT USING ((("status" = 'ACTIVE'::"text") OR ("auth"."uid"() = "user_id")));



ALTER TABLE "public"."seller_stores" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "seller_stores_owner_delete" ON "public"."seller_stores" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "seller_stores_owner_insert" ON "public"."seller_stores" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "seller_stores_owner_read" ON "public"."seller_stores" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "seller_stores_owner_update" ON "public"."seller_stores" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "seller_stores_public_read_active" ON "public"."seller_stores" FOR SELECT USING ((("is_active" = true) AND ("is_store_feature_enabled" = true) AND (COALESCE("is_paused_due_to_plan", false) = false)));



ALTER TABLE "public"."site_page_views" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."site_popup_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."site_popup_user_states" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."site_popups" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."site_presence" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."site_sponsor_clicks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."site_sponsor_impressions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."site_sponsors" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."smtp_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sponsor_interest_leads" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sponsor_metric_email_dispatch_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sponsor_metric_email_jobs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sponsor_testimonials" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."subscription_history" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."support_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."support_ticket_messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."support_tickets" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "system_insert_audit_logs" ON "public"."admin_audit_logs" FOR INSERT WITH CHECK (true);



CREATE POLICY "system_insert_lead_conversions" ON "public"."lead_conversions" FOR INSERT WITH CHECK (true);



ALTER TABLE "public"."terms_page_content" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "update_announcements" ON "public"."announcements" FOR UPDATE USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."user_highlight_booster_purchases" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_legal_consents" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_subscriptions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."users" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "users_select_own_data" ON "public"."users" FOR SELECT USING (("id" = "auth"."uid"()));



CREATE POLICY "users_update_own_data" ON "public"."users" FOR UPDATE USING (("id" = "auth"."uid"())) WITH CHECK (("id" = "auth"."uid"()));



ALTER TABLE "public"."webhook_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."webhook_request_registry" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."website_visits" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."notifications";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."opportunity_alerts";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."opportunity_matches";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."security_events";






GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";











































































































































































GRANT ALL ON FUNCTION "public"."accept_my_pending_legal_consents"("p_user_agent" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."accept_my_pending_legal_consents"("p_user_agent" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."accept_my_pending_legal_consents"("p_user_agent" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."add_subscription_history_entry"("p_user_id" "uuid", "p_subscription_id" "uuid", "p_plan_id" "uuid", "p_event_type" "text", "p_status" "text", "p_period_start" timestamp with time zone, "p_period_end" timestamp with time zone, "p_previous_plan_id" "uuid", "p_cancellation_reason" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."add_subscription_history_entry"("p_user_id" "uuid", "p_subscription_id" "uuid", "p_plan_id" "uuid", "p_event_type" "text", "p_status" "text", "p_period_start" timestamp with time zone, "p_period_end" timestamp with time zone, "p_previous_plan_id" "uuid", "p_cancellation_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."add_subscription_history_entry"("p_user_id" "uuid", "p_subscription_id" "uuid", "p_plan_id" "uuid", "p_event_type" "text", "p_status" "text", "p_period_start" timestamp with time zone, "p_period_end" timestamp with time zone, "p_previous_plan_id" "uuid", "p_cancellation_reason" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."admin_apply_announcement_edit_request"("p_request_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."admin_apply_announcement_edit_request"("p_request_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_apply_announcement_edit_request"("p_request_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."admin_approve_reported_announcement"("p_announcement_id" "uuid", "p_note" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."admin_approve_reported_announcement"("p_announcement_id" "uuid", "p_note" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_approve_reported_announcement"("p_announcement_id" "uuid", "p_note" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."admin_clear_announcement_highlight"("p_announcement_id" "uuid", "p_highlight_type" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."admin_clear_announcement_highlight"("p_announcement_id" "uuid", "p_highlight_type" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_clear_announcement_highlight"("p_announcement_id" "uuid", "p_highlight_type" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."admin_delete_announcement_with_notification"("p_announcement_id" "uuid", "p_reason" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."admin_delete_announcement_with_notification"("p_announcement_id" "uuid", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_delete_announcement_with_notification"("p_announcement_id" "uuid", "p_reason" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."admin_export_newsletter_subscriptions"("p_search" "text", "p_status" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."admin_export_newsletter_subscriptions"("p_search" "text", "p_status" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_export_newsletter_subscriptions"("p_search" "text", "p_status" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."admin_export_user_legal_consents"("p_search" "text", "p_consent_type" "text", "p_source" "text", "p_date_from" timestamp with time zone, "p_date_to" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."admin_export_user_legal_consents"("p_search" "text", "p_consent_type" "text", "p_source" "text", "p_date_from" timestamp with time zone, "p_date_to" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_export_user_legal_consents"("p_search" "text", "p_consent_type" "text", "p_source" "text", "p_date_from" timestamp with time zone, "p_date_to" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."admin_get_reported_announcement_details"("p_announcement_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."admin_get_reported_announcement_details"("p_announcement_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_get_reported_announcement_details"("p_announcement_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."admin_list_announcements_monitoring"() TO "anon";
GRANT ALL ON FUNCTION "public"."admin_list_announcements_monitoring"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_list_announcements_monitoring"() TO "service_role";



GRANT ALL ON FUNCTION "public"."admin_list_invite_campaigns"() TO "anon";
GRANT ALL ON FUNCTION "public"."admin_list_invite_campaigns"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_list_invite_campaigns"() TO "service_role";



GRANT ALL ON FUNCTION "public"."admin_list_moderation_queue_announcements"() TO "anon";
GRANT ALL ON FUNCTION "public"."admin_list_moderation_queue_announcements"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_list_moderation_queue_announcements"() TO "service_role";



GRANT ALL ON FUNCTION "public"."admin_list_newsletter_subscriptions"("p_search" "text", "p_status" "text", "p_page" integer, "p_page_size" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."admin_list_newsletter_subscriptions"("p_search" "text", "p_status" "text", "p_page" integer, "p_page_size" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_list_newsletter_subscriptions"("p_search" "text", "p_status" "text", "p_page" integer, "p_page_size" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."admin_list_reported_announcements"() TO "anon";
GRANT ALL ON FUNCTION "public"."admin_list_reported_announcements"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_list_reported_announcements"() TO "service_role";



GRANT ALL ON FUNCTION "public"."admin_list_user_legal_consents"("p_search" "text", "p_consent_type" "text", "p_source" "text", "p_date_from" timestamp with time zone, "p_date_to" timestamp with time zone, "p_page" integer, "p_page_size" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."admin_list_user_legal_consents"("p_search" "text", "p_consent_type" "text", "p_source" "text", "p_date_from" timestamp with time zone, "p_date_to" timestamp with time zone, "p_page" integer, "p_page_size" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_list_user_legal_consents"("p_search" "text", "p_consent_type" "text", "p_source" "text", "p_date_from" timestamp with time zone, "p_date_to" timestamp with time zone, "p_page" integer, "p_page_size" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_queue_newsletter_campaign"("p_campaign_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_queue_newsletter_campaign"("p_campaign_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."admin_queue_newsletter_campaign"("p_campaign_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_queue_newsletter_campaign"("p_campaign_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."admin_reject_announcement"("p_announcement_id" "uuid", "p_reason" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."admin_reject_announcement"("p_announcement_id" "uuid", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_reject_announcement"("p_announcement_id" "uuid", "p_reason" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."admin_set_announcement_status"("p_announcement_id" "uuid", "p_status" "text", "p_reason" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."admin_set_announcement_status"("p_announcement_id" "uuid", "p_status" "text", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_set_announcement_status"("p_announcement_id" "uuid", "p_status" "text", "p_reason" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."admin_update_announcement_highlight_expiration"("p_announcement_id" "uuid", "p_highlight_type" "text", "p_expires_at" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."admin_update_announcement_highlight_expiration"("p_announcement_id" "uuid", "p_highlight_type" "text", "p_expires_at" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_update_announcement_highlight_expiration"("p_announcement_id" "uuid", "p_highlight_type" "text", "p_expires_at" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."admin_update_user_plan_period"("p_user_id" "uuid", "p_plan_id" "uuid", "p_period_start" timestamp with time zone, "p_period_end" timestamp with time zone, "p_billing_cycle" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."admin_update_user_plan_period"("p_user_id" "uuid", "p_plan_id" "uuid", "p_period_start" timestamp with time zone, "p_period_end" timestamp with time zone, "p_billing_cycle" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_update_user_plan_period"("p_user_id" "uuid", "p_plan_id" "uuid", "p_period_start" timestamp with time zone, "p_period_end" timestamp with time zone, "p_billing_cycle" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."append_query_param"("p_link" "text", "p_key" "text", "p_value" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."append_query_param"("p_link" "text", "p_key" "text", "p_value" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."append_query_param"("p_link" "text", "p_key" "text", "p_value" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."apply_announcement_highlight"("p_announcement_id" "uuid", "p_highlight_type" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."apply_announcement_highlight"("p_announcement_id" "uuid", "p_highlight_type" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."apply_announcement_highlight"("p_announcement_id" "uuid", "p_highlight_type" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."apply_censorship_to_existing_announcements"() TO "anon";
GRANT ALL ON FUNCTION "public"."apply_censorship_to_existing_announcements"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."apply_censorship_to_existing_announcements"() TO "service_role";



GRANT ALL ON FUNCTION "public"."assign_start_agro_plan"() TO "anon";
GRANT ALL ON FUNCTION "public"."assign_start_agro_plan"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."assign_start_agro_plan"() TO "service_role";



GRANT ALL ON FUNCTION "public"."block_messages_for_expired_announcements"() TO "anon";
GRANT ALL ON FUNCTION "public"."block_messages_for_expired_announcements"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."block_messages_for_expired_announcements"() TO "service_role";



GRANT ALL ON FUNCTION "public"."business_description_has_contact_reference"("input_text" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."business_description_has_contact_reference"("input_text" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."business_description_has_contact_reference"("input_text" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."calculate_announcement_deletion_scheduled_at"("p_user_id" "uuid", "p_reference" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."calculate_announcement_deletion_scheduled_at"("p_user_id" "uuid", "p_reference" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."calculate_announcement_deletion_scheduled_at"("p_user_id" "uuid", "p_reference" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."calculate_announcement_expires_at"("p_user_id" "uuid", "p_reference" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."calculate_announcement_expires_at"("p_user_id" "uuid", "p_reference" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."calculate_announcement_expires_at"("p_user_id" "uuid", "p_reference" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."calculate_distance_km"("lat1" numeric, "lon1" numeric, "lat2" numeric, "lon2" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."calculate_distance_km"("lat1" numeric, "lon1" numeric, "lat2" numeric, "lon2" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."calculate_distance_km"("lat1" numeric, "lon1" numeric, "lat2" numeric, "lon2" numeric) TO "service_role";



GRANT ALL ON FUNCTION "public"."calculate_lead_contact_expires_at"("p_seller_id" "uuid", "p_announcement_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."calculate_lead_contact_expires_at"("p_seller_id" "uuid", "p_announcement_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."calculate_lead_contact_expires_at"("p_seller_id" "uuid", "p_announcement_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."calculate_subscription_usage_window"("p_period_start" timestamp with time zone, "p_period_end" timestamp with time zone, "p_reference" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."calculate_subscription_usage_window"("p_period_start" timestamp with time zone, "p_period_end" timestamp with time zone, "p_reference" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."calculate_subscription_usage_window"("p_period_start" timestamp with time zone, "p_period_end" timestamp with time zone, "p_reference" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."cancel_subscription"("p_subscription_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."cancel_subscription"("p_subscription_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cancel_subscription"("p_subscription_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."capture_signup_invite_attribution"() TO "anon";
GRANT ALL ON FUNCTION "public"."capture_signup_invite_attribution"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."capture_signup_invite_attribution"() TO "service_role";



GRANT ALL ON FUNCTION "public"."capture_signup_legal_consents"() TO "anon";
GRANT ALL ON FUNCTION "public"."capture_signup_legal_consents"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."capture_signup_legal_consents"() TO "service_role";



GRANT ALL ON FUNCTION "public"."censor_contact_data"() TO "anon";
GRANT ALL ON FUNCTION "public"."censor_contact_data"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."censor_contact_data"() TO "service_role";



GRANT ALL ON FUNCTION "public"."check_and_clean_highlights_before_select"() TO "anon";
GRANT ALL ON FUNCTION "public"."check_and_clean_highlights_before_select"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_and_clean_highlights_before_select"() TO "service_role";



GRANT ALL ON FUNCTION "public"."check_rate_limit"("p_user_id" "uuid", "p_action" "text", "p_max_requests" integer, "p_window_seconds" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."check_rate_limit"("p_user_id" "uuid", "p_action" "text", "p_max_requests" integer, "p_window_seconds" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_rate_limit"("p_user_id" "uuid", "p_action" "text", "p_max_requests" integer, "p_window_seconds" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."check_user_plan_active"("user_uuid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."check_user_plan_active"("user_uuid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_user_plan_active"("user_uuid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."clean_expired_highlights"() TO "anon";
GRANT ALL ON FUNCTION "public"."clean_expired_highlights"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."clean_expired_highlights"() TO "service_role";



GRANT ALL ON FUNCTION "public"."cleanup_expired_highlights"() TO "anon";
GRANT ALL ON FUNCTION "public"."cleanup_expired_highlights"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."cleanup_expired_highlights"() TO "service_role";



GRANT ALL ON FUNCTION "public"."cleanup_expired_opportunities"() TO "anon";
GRANT ALL ON FUNCTION "public"."cleanup_expired_opportunities"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."cleanup_expired_opportunities"() TO "service_role";



GRANT ALL ON FUNCTION "public"."cleanup_old_security_events"("p_days_to_keep" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."cleanup_old_security_events"("p_days_to_keep" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."cleanup_old_security_events"("p_days_to_keep" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."complete_my_document_verification_upload"("p_document_path" "text", "p_result" "text", "p_failure_reason" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."complete_my_document_verification_upload"("p_document_path" "text", "p_result" "text", "p_failure_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."complete_my_document_verification_upload"("p_document_path" "text", "p_result" "text", "p_failure_reason" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."count_shared_announcement_title_tokens"("p_first" "text", "p_second" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."count_shared_announcement_title_tokens"("p_first" "text", "p_second" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."count_shared_announcement_title_tokens"("p_first" "text", "p_second" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_lead_notification"() TO "anon";
GRANT ALL ON FUNCTION "public"."create_lead_notification"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_lead_notification"() TO "service_role";



GRANT ALL ON FUNCTION "public"."create_message_notification"() TO "anon";
GRANT ALL ON FUNCTION "public"."create_message_notification"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_message_notification"() TO "service_role";



GRANT ALL ON FUNCTION "public"."create_radar_match_notification"() TO "anon";
GRANT ALL ON FUNCTION "public"."create_radar_match_notification"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_radar_match_notification"() TO "service_role";



GRANT ALL ON FUNCTION "public"."deduct_credits_on_unlock"() TO "anon";
GRANT ALL ON FUNCTION "public"."deduct_credits_on_unlock"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."deduct_credits_on_unlock"() TO "service_role";



GRANT ALL ON FUNCTION "public"."delete_announcement_with_relations"("p_announcement_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."delete_announcement_with_relations"("p_announcement_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_announcement_with_relations"("p_announcement_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."dispatch_commercial_intelligence_outreach"("p_category_slug" "text", "p_subcategory_slug" "text", "p_message" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."dispatch_commercial_intelligence_outreach"("p_category_slug" "text", "p_subcategory_slug" "text", "p_message" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."dispatch_commercial_intelligence_outreach"("p_category_slug" "text", "p_subcategory_slug" "text", "p_message" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."downgrade_expired_subscriptions_to_basic"() TO "anon";
GRANT ALL ON FUNCTION "public"."downgrade_expired_subscriptions_to_basic"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."downgrade_expired_subscriptions_to_basic"() TO "service_role";



GRANT ALL ON FUNCTION "public"."enforce_announcement_edit_request_publication_rules"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_announcement_edit_request_publication_rules"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_announcement_edit_request_publication_rules"() TO "service_role";



GRANT ALL ON FUNCTION "public"."enforce_announcement_publication_rules"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_announcement_publication_rules"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_announcement_publication_rules"() TO "service_role";



GRANT ALL ON FUNCTION "public"."enforce_announcement_similarity_review"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_announcement_similarity_review"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_announcement_similarity_review"() TO "service_role";



GRANT ALL ON FUNCTION "public"."enforce_default_signup_plan_integrity"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_default_signup_plan_integrity"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_default_signup_plan_integrity"() TO "service_role";



GRANT ALL ON FUNCTION "public"."enforce_no_duplicate_active_announcements"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_no_duplicate_active_announcements"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_no_duplicate_active_announcements"() TO "service_role";



GRANT ALL ON FUNCTION "public"."enforce_simultaneous_active_ad_limit"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_simultaneous_active_ad_limit"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_simultaneous_active_ad_limit"() TO "service_role";



GRANT ALL ON FUNCTION "public"."ensure_user_current_subscription"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."ensure_user_current_subscription"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."ensure_user_current_subscription"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."evaluate_announcement_publication_rules"("p_title" "text", "p_description" "text", "p_category_slug" "text", "p_images" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."evaluate_announcement_publication_rules"("p_title" "text", "p_description" "text", "p_category_slug" "text", "p_images" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."evaluate_announcement_publication_rules"("p_title" "text", "p_description" "text", "p_category_slug" "text", "p_images" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."expire_elapsed_announcements"() TO "anon";
GRANT ALL ON FUNCTION "public"."expire_elapsed_announcements"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."expire_elapsed_announcements"() TO "service_role";



GRANT ALL ON FUNCTION "public"."expire_old_subscriptions"() TO "anon";
GRANT ALL ON FUNCTION "public"."expire_old_subscriptions"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."expire_old_subscriptions"() TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_commercial_intelligence_report"("p_category_slug" "text", "p_subcategory_slug" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."generate_commercial_intelligence_report"("p_category_slug" "text", "p_subcategory_slug" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_commercial_intelligence_report"("p_category_slug" "text", "p_subcategory_slug" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_growth_conversion_notification_for_user"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."generate_growth_conversion_notification_for_user"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_growth_conversion_notification_for_user"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_growth_conversion_notifications_batch"() TO "anon";
GRANT ALL ON FUNCTION "public"."generate_growth_conversion_notifications_batch"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_growth_conversion_notifications_batch"() TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_invite_campaign_code"("p_captor_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."generate_invite_campaign_code"("p_captor_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_invite_campaign_code"("p_captor_name" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_renewal_notification_for_user"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."generate_renewal_notification_for_user"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_renewal_notification_for_user"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_renewal_notifications_batch"() TO "anon";
GRANT ALL ON FUNCTION "public"."generate_renewal_notifications_batch"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_renewal_notifications_batch"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_active_subscription"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_active_subscription"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_active_subscription"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_admin_login_rate_limit_status"("p_email" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_admin_login_rate_limit_status"("p_email" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_admin_login_rate_limit_status"("p_email" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_admin_security_overview"("p_days" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_admin_security_overview"("p_days" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_admin_security_overview"("p_days" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_announcement_report_snapshot"("p_announcement_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_announcement_report_snapshot"("p_announcement_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_announcement_report_snapshot"("p_announcement_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_announcement_similarity_cooldown"("p_user_id" "uuid", "p_title" "text", "p_category_id" "uuid", "p_city" "text", "p_state" "text", "p_price" numeric, "p_ignore_announcement_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_announcement_similarity_cooldown"("p_user_id" "uuid", "p_title" "text", "p_category_id" "uuid", "p_city" "text", "p_state" "text", "p_price" numeric, "p_ignore_announcement_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_announcement_similarity_cooldown"("p_user_id" "uuid", "p_title" "text", "p_category_id" "uuid", "p_city" "text", "p_state" "text", "p_price" numeric, "p_ignore_announcement_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_announcement_similarity_review_signal"("p_user_id" "uuid", "p_title" "text", "p_category_id" "uuid", "p_city" "text", "p_state" "text", "p_price" numeric, "p_ignore_announcement_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_announcement_similarity_review_signal"("p_user_id" "uuid", "p_title" "text", "p_category_id" "uuid", "p_city" "text", "p_state" "text", "p_price" numeric, "p_ignore_announcement_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_announcement_similarity_review_signal"("p_user_id" "uuid", "p_title" "text", "p_category_id" "uuid", "p_city" "text", "p_state" "text", "p_price" numeric, "p_ignore_announcement_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_category_showcase_impression_stats"("p_announcement_ids" "uuid"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."get_category_showcase_impression_stats"("p_announcement_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_category_showcase_impression_stats"("p_announcement_ids" "uuid"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_checkout_gateway_public_safe"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_checkout_gateway_public_safe"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_checkout_gateway_public_safe"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_current_user_role"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_current_user_role"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_current_user_role"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_dashboard_stats"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_dashboard_stats"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_dashboard_stats"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_dashboard_stats"("p_announcement_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_dashboard_stats"("p_announcement_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_dashboard_stats"("p_announcement_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_home_showcase_impression_stats"("p_announcement_ids" "uuid"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."get_home_showcase_impression_stats"("p_announcement_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_home_showcase_impression_stats"("p_announcement_ids" "uuid"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_my_active_ad_capacity_status"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_my_active_ad_capacity_status"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_my_active_ad_capacity_status"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_my_document_verification_retry_status"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_my_document_verification_retry_status"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_my_document_verification_retry_status"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_my_highlight_booster_summary"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_my_highlight_booster_summary"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_my_highlight_booster_summary"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_payment_settings_admin_safe"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_payment_settings_admin_safe"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_payment_settings_admin_safe"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_public_about_stats"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_public_about_stats"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_public_about_stats"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_public_about_stats"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_public_active_plan_signals"("p_user_ids" "uuid"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."get_public_active_plan_signals"("p_user_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_public_active_plan_signals"("p_user_ids" "uuid"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_public_active_site_sponsors"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_public_active_site_sponsors"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_public_active_site_sponsors"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_public_announcement_engagement_signals"("p_announcement_ids" "uuid"[], "p_period_days" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_public_announcement_engagement_signals"("p_announcement_ids" "uuid"[], "p_period_days" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_public_announcement_engagement_signals"("p_announcement_ids" "uuid"[], "p_period_days" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_public_category_ranking_settings"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_public_category_ranking_settings"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_public_category_ranking_settings"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_public_home_carousel_sponsors"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_public_home_carousel_sponsors"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_public_home_carousel_sponsors"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_public_sponsor_landing_stats"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_public_sponsor_landing_stats"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_public_sponsor_landing_stats"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_radar_stats"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_radar_stats"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_radar_stats"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_server_now"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_server_now"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_server_now"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_site_analytics_device_breakdown"("p_period_days" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_site_analytics_device_breakdown"("p_period_days" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_site_analytics_device_breakdown"("p_period_days" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_site_analytics_geo_breakdown"("p_period_days" integer, "p_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_site_analytics_geo_breakdown"("p_period_days" integer, "p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_site_analytics_geo_breakdown"("p_period_days" integer, "p_limit" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_site_analytics_live_presence"("p_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_site_analytics_live_presence"("p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_site_analytics_live_presence"("p_limit" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_site_analytics_source_breakdown"("p_period_days" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_site_analytics_source_breakdown"("p_period_days" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_site_analytics_source_breakdown"("p_period_days" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_site_analytics_summary"("p_period_days" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_site_analytics_summary"("p_period_days" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_site_analytics_summary"("p_period_days" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_site_analytics_time_series"("p_period_days" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_site_analytics_time_series"("p_period_days" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_site_analytics_time_series"("p_period_days" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_site_analytics_top_announcements"("p_period_days" integer, "p_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_site_analytics_top_announcements"("p_period_days" integer, "p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_site_analytics_top_announcements"("p_period_days" integer, "p_limit" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_site_analytics_top_pages"("p_period_days" integer, "p_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_site_analytics_top_pages"("p_period_days" integer, "p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_site_analytics_top_pages"("p_period_days" integer, "p_limit" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_site_analytics_top_searches"("p_period_days" integer, "p_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_site_analytics_top_searches"("p_period_days" integer, "p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_site_analytics_top_searches"("p_period_days" integer, "p_limit" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_site_analytics_top_stores"("p_period_days" integer, "p_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_site_analytics_top_stores"("p_period_days" integer, "p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_site_analytics_top_stores"("p_period_days" integer, "p_limit" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_site_sponsor_metrics_report"("p_sponsor_id" "uuid", "p_period_start" timestamp with time zone, "p_period_end" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."get_site_sponsor_metrics_report"("p_sponsor_id" "uuid", "p_period_start" timestamp with time zone, "p_period_end" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_site_sponsor_metrics_report"("p_sponsor_id" "uuid", "p_period_start" timestamp with time zone, "p_period_end" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_top_public_searches"("p_limit" integer, "p_days" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_top_public_searches"("p_limit" integer, "p_days" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_top_public_searches"("p_limit" integer, "p_days" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_stats"("user_uuid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_stats"("user_uuid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_stats"("user_uuid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."grant_commercial_intelligence_contact_share"("p_conversation_id" "uuid", "p_share_email" boolean, "p_share_whatsapp" boolean, "p_buyer_note" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."grant_commercial_intelligence_contact_share"("p_conversation_id" "uuid", "p_share_email" boolean, "p_share_whatsapp" boolean, "p_buyer_note" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."grant_commercial_intelligence_contact_share"("p_conversation_id" "uuid", "p_share_email" boolean, "p_share_whatsapp" boolean, "p_buyer_note" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_auth_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_auth_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_auth_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_seller_store_feature_sync"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_seller_store_feature_sync"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_seller_store_feature_sync"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_seller_store_initial_feature_sync"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_seller_store_initial_feature_sync"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_seller_store_initial_feature_sync"() TO "service_role";



GRANT ALL ON FUNCTION "public"."has_active_subscription"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."has_active_subscription"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_active_subscription"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."increment_ad_views"("ad_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."increment_ad_views"("ad_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."increment_ad_views"("ad_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."insert_notification_compat"("p_user_id" "uuid", "p_type" "text", "p_title" "text", "p_content" "text", "p_link" "text", "p_is_read" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."insert_notification_compat"("p_user_id" "uuid", "p_type" "text", "p_title" "text", "p_content" "text", "p_link" "text", "p_is_read" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."insert_notification_compat"("p_user_id" "uuid", "p_type" "text", "p_title" "text", "p_content" "text", "p_link" "text", "p_is_read" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."is_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_admin_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_admin_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_announcement_price_close"("p_first" numeric, "p_second" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."is_announcement_price_close"("p_first" numeric, "p_second" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_announcement_price_close"("p_first" numeric, "p_second" numeric) TO "service_role";



GRANT ALL ON FUNCTION "public"."is_current_user_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_current_user_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_current_user_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_current_user_moderator"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_current_user_moderator"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_current_user_moderator"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_document_available"("p_document" "text", "p_ignore_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_document_available"("p_document" "text", "p_ignore_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_document_available"("p_document" "text", "p_ignore_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_moderator"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_moderator"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_moderator"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_start_signup_plan"("p_plan_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_start_signup_plan"("p_plan_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_start_signup_plan"("p_plan_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."list_commercial_intelligence_conversation_messages"("p_conversation_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."list_commercial_intelligence_conversation_messages"("p_conversation_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."list_commercial_intelligence_conversation_messages"("p_conversation_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."list_my_commercial_intelligence_contact_shares"() TO "anon";
GRANT ALL ON FUNCTION "public"."list_my_commercial_intelligence_contact_shares"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."list_my_commercial_intelligence_contact_shares"() TO "service_role";



GRANT ALL ON FUNCTION "public"."list_my_commercial_intelligence_conversations"() TO "anon";
GRANT ALL ON FUNCTION "public"."list_my_commercial_intelligence_conversations"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."list_my_commercial_intelligence_conversations"() TO "service_role";



GRANT ALL ON FUNCTION "public"."list_my_pending_legal_consents"() TO "anon";
GRANT ALL ON FUNCTION "public"."list_my_pending_legal_consents"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."list_my_pending_legal_consents"() TO "service_role";



GRANT ALL ON FUNCTION "public"."list_received_commercial_intelligence_opportunities"() TO "anon";
GRANT ALL ON FUNCTION "public"."list_received_commercial_intelligence_opportunities"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."list_received_commercial_intelligence_opportunities"() TO "service_role";



GRANT ALL ON FUNCTION "public"."list_sent_commercial_intelligence_interest_responses"() TO "anon";
GRANT ALL ON FUNCTION "public"."list_sent_commercial_intelligence_interest_responses"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."list_sent_commercial_intelligence_interest_responses"() TO "service_role";



GRANT ALL ON FUNCTION "public"."log_admin_action"("p_action" "text", "p_resource_type" "text", "p_resource_id" "uuid", "p_old_value" "jsonb", "p_new_value" "jsonb", "p_reason" "text", "p_ip_address" "text", "p_user_agent" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."log_admin_action"("p_action" "text", "p_resource_type" "text", "p_resource_id" "uuid", "p_old_value" "jsonb", "p_new_value" "jsonb", "p_reason" "text", "p_ip_address" "text", "p_user_agent" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_admin_action"("p_action" "text", "p_resource_type" "text", "p_resource_id" "uuid", "p_old_value" "jsonb", "p_new_value" "jsonb", "p_reason" "text", "p_ip_address" "text", "p_user_agent" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."log_checkout_attempt"("p_plan_id" "uuid", "p_billing_cycle" "text", "p_amount" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."log_checkout_attempt"("p_plan_id" "uuid", "p_billing_cycle" "text", "p_amount" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_checkout_attempt"("p_plan_id" "uuid", "p_billing_cycle" "text", "p_amount" numeric) TO "service_role";



GRANT ALL ON FUNCTION "public"."log_lead_conversion"("p_announcement_id" "uuid", "p_viewer_id" "uuid", "p_conversion_type" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."log_lead_conversion"("p_announcement_id" "uuid", "p_viewer_id" "uuid", "p_conversion_type" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_lead_conversion"("p_announcement_id" "uuid", "p_viewer_id" "uuid", "p_conversion_type" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."log_public_search"("p_term" "text", "p_source" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."log_public_search"("p_term" "text", "p_source" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_public_search"("p_term" "text", "p_source" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."log_security_event"("p_user_id" "uuid", "p_email" "text", "p_attempted_route" "text", "p_attempted_action" "text", "p_ip_address" "text", "p_user_agent" "text", "p_severity" "text", "p_reason" "text", "p_metadata" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."log_security_event"("p_user_id" "uuid", "p_email" "text", "p_attempted_route" "text", "p_attempted_action" "text", "p_ip_address" "text", "p_user_agent" "text", "p_severity" "text", "p_reason" "text", "p_metadata" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_security_event"("p_user_id" "uuid", "p_email" "text", "p_attempted_route" "text", "p_attempted_action" "text", "p_ip_address" "text", "p_user_agent" "text", "p_severity" "text", "p_reason" "text", "p_metadata" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."log_unauthorized_access"("p_attempted_route" "text", "p_reason" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."log_unauthorized_access"("p_attempted_route" "text", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_unauthorized_access"("p_attempted_route" "text", "p_reason" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."mark_start_plan_consumed"() TO "anon";
GRANT ALL ON FUNCTION "public"."mark_start_plan_consumed"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."mark_start_plan_consumed"() TO "service_role";



GRANT ALL ON FUNCTION "public"."match_announcements_to_alerts"("p_announcement_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."match_announcements_to_alerts"("p_announcement_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."match_announcements_to_alerts"("p_announcement_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."match_existing_announcements_to_alert"("p_alert_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."match_existing_announcements_to_alert"("p_alert_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."match_existing_announcements_to_alert"("p_alert_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."normalize_announcement_similarity_text"("p_value" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."normalize_announcement_similarity_text"("p_value" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."normalize_announcement_similarity_text"("p_value" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."normalize_announcement_similarity_words"("p_value" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."normalize_announcement_similarity_words"("p_value" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."normalize_announcement_similarity_words"("p_value" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."normalize_user_document"("p_document" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."normalize_user_document"("p_document" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."normalize_user_document"("p_document" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."notify_critical_security_event"() TO "anon";
GRANT ALL ON FUNCTION "public"."notify_critical_security_event"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."notify_critical_security_event"() TO "service_role";



GRANT ALL ON FUNCTION "public"."notify_partner_store_paused_due_to_plan"() TO "anon";
GRANT ALL ON FUNCTION "public"."notify_partner_store_paused_due_to_plan"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."notify_partner_store_paused_due_to_plan"() TO "service_role";



GRANT ALL ON FUNCTION "public"."parse_publication_rule_patterns"("p_value" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."parse_publication_rule_patterns"("p_value" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."parse_publication_rule_patterns"("p_value" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."prevent_start_plan_reuse"() TO "anon";
GRANT ALL ON FUNCTION "public"."prevent_start_plan_reuse"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."prevent_start_plan_reuse"() TO "service_role";



GRANT ALL ON FUNCTION "public"."queue_contact_form_email_job"() TO "anon";
GRANT ALL ON FUNCTION "public"."queue_contact_form_email_job"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."queue_contact_form_email_job"() TO "service_role";



GRANT ALL ON FUNCTION "public"."queue_contact_lead_email_job"() TO "anon";
GRANT ALL ON FUNCTION "public"."queue_contact_lead_email_job"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."queue_contact_lead_email_job"() TO "service_role";



GRANT ALL ON FUNCTION "public"."queue_contact_message_email_job"() TO "anon";
GRANT ALL ON FUNCTION "public"."queue_contact_message_email_job"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."queue_contact_message_email_job"() TO "service_role";



GRANT ALL ON FUNCTION "public"."queue_plan_alert_email_job"() TO "anon";
GRANT ALL ON FUNCTION "public"."queue_plan_alert_email_job"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."queue_plan_alert_email_job"() TO "service_role";



GRANT ALL ON FUNCTION "public"."queue_radar_match_email_job"() TO "anon";
GRANT ALL ON FUNCTION "public"."queue_radar_match_email_job"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."queue_radar_match_email_job"() TO "service_role";



GRANT ALL ON FUNCTION "public"."reactivate_expired_announcement"("p_announcement_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."reactivate_expired_announcement"("p_announcement_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."reactivate_expired_announcement"("p_announcement_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."record_my_contact_legal_consents"("p_user_agent" "text", "p_metadata" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."record_my_contact_legal_consents"("p_user_agent" "text", "p_metadata" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."record_my_contact_legal_consents"("p_user_agent" "text", "p_metadata" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."record_site_page_view"("p_session_id" "text", "p_user_id" "uuid", "p_page_path" "text", "p_page_type" "text", "p_page_label" "text", "p_entity_id" "uuid", "p_entity_key" "text", "p_referrer" "text", "p_user_agent" "text", "p_device_type" "text", "p_is_admin_area" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."record_site_page_view"("p_session_id" "text", "p_user_id" "uuid", "p_page_path" "text", "p_page_type" "text", "p_page_label" "text", "p_entity_id" "uuid", "p_entity_key" "text", "p_referrer" "text", "p_user_agent" "text", "p_device_type" "text", "p_is_admin_area" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."record_site_page_view"("p_session_id" "text", "p_user_id" "uuid", "p_page_path" "text", "p_page_type" "text", "p_page_label" "text", "p_entity_id" "uuid", "p_entity_key" "text", "p_referrer" "text", "p_user_agent" "text", "p_device_type" "text", "p_is_admin_area" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."record_site_page_view"("p_session_id" "text", "p_user_id" "uuid", "p_page_path" "text", "p_page_type" "text", "p_page_label" "text", "p_entity_id" "uuid", "p_entity_key" "text", "p_referrer" "text", "p_user_agent" "text", "p_device_type" "text", "p_is_admin_area" boolean, "p_user_city" "text", "p_user_state" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."record_site_page_view"("p_session_id" "text", "p_user_id" "uuid", "p_page_path" "text", "p_page_type" "text", "p_page_label" "text", "p_entity_id" "uuid", "p_entity_key" "text", "p_referrer" "text", "p_user_agent" "text", "p_device_type" "text", "p_is_admin_area" boolean, "p_user_city" "text", "p_user_state" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."record_site_page_view"("p_session_id" "text", "p_user_id" "uuid", "p_page_path" "text", "p_page_type" "text", "p_page_label" "text", "p_entity_id" "uuid", "p_entity_key" "text", "p_referrer" "text", "p_user_agent" "text", "p_device_type" "text", "p_is_admin_area" boolean, "p_user_city" "text", "p_user_state" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."record_site_sponsor_click"("p_sponsor_id" "uuid", "p_session_id" "text", "p_page_path" "text", "p_slot_position" integer, "p_user_id" "uuid", "p_user_city" "text", "p_user_state" "text", "p_device_type" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."record_site_sponsor_click"("p_sponsor_id" "uuid", "p_session_id" "text", "p_page_path" "text", "p_slot_position" integer, "p_user_id" "uuid", "p_user_city" "text", "p_user_state" "text", "p_device_type" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."record_site_sponsor_click"("p_sponsor_id" "uuid", "p_session_id" "text", "p_page_path" "text", "p_slot_position" integer, "p_user_id" "uuid", "p_user_city" "text", "p_user_state" "text", "p_device_type" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."record_site_sponsor_click"("p_sponsor_id" "uuid", "p_session_id" "text", "p_page_path" "text", "p_slot_position" integer, "p_user_id" "uuid", "p_user_city" "text", "p_user_state" "text", "p_device_type" "text", "p_placement_key" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."record_site_sponsor_click"("p_sponsor_id" "uuid", "p_session_id" "text", "p_page_path" "text", "p_slot_position" integer, "p_user_id" "uuid", "p_user_city" "text", "p_user_state" "text", "p_device_type" "text", "p_placement_key" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."record_site_sponsor_click"("p_sponsor_id" "uuid", "p_session_id" "text", "p_page_path" "text", "p_slot_position" integer, "p_user_id" "uuid", "p_user_city" "text", "p_user_state" "text", "p_device_type" "text", "p_placement_key" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."record_site_sponsor_impression"("p_sponsor_id" "uuid", "p_session_id" "text", "p_page_path" "text", "p_slot_position" integer, "p_user_id" "uuid", "p_user_city" "text", "p_user_state" "text", "p_device_type" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."record_site_sponsor_impression"("p_sponsor_id" "uuid", "p_session_id" "text", "p_page_path" "text", "p_slot_position" integer, "p_user_id" "uuid", "p_user_city" "text", "p_user_state" "text", "p_device_type" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."record_site_sponsor_impression"("p_sponsor_id" "uuid", "p_session_id" "text", "p_page_path" "text", "p_slot_position" integer, "p_user_id" "uuid", "p_user_city" "text", "p_user_state" "text", "p_device_type" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."record_site_sponsor_impression"("p_sponsor_id" "uuid", "p_session_id" "text", "p_page_path" "text", "p_slot_position" integer, "p_user_id" "uuid", "p_user_city" "text", "p_user_state" "text", "p_device_type" "text", "p_placement_key" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."record_site_sponsor_impression"("p_sponsor_id" "uuid", "p_session_id" "text", "p_page_path" "text", "p_slot_position" integer, "p_user_id" "uuid", "p_user_city" "text", "p_user_state" "text", "p_device_type" "text", "p_placement_key" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."record_site_sponsor_impression"("p_sponsor_id" "uuid", "p_session_id" "text", "p_page_path" "text", "p_slot_position" integer, "p_user_id" "uuid", "p_user_city" "text", "p_user_state" "text", "p_device_type" "text", "p_placement_key" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."redeem_promotion_plan_code"("p_code" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."redeem_promotion_plan_code"("p_code" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."redeem_promotion_plan_code"("p_code" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."refresh_announcement_report_state"("p_announcement_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."refresh_announcement_report_state"("p_announcement_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."refresh_announcement_report_state"("p_announcement_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."refresh_seller_lead_contact_windows"("p_seller_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."refresh_seller_lead_contact_windows"("p_seller_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."refresh_seller_lead_contact_windows"("p_seller_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."register_admin_login_attempt"("p_email" "text", "p_success" boolean, "p_reason" "text", "p_user_agent" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."register_admin_login_attempt"("p_email" "text", "p_success" boolean, "p_reason" "text", "p_user_agent" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."register_admin_login_attempt"("p_email" "text", "p_success" boolean, "p_reason" "text", "p_user_agent" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."register_announcement_similarity_cooldown"() TO "anon";
GRANT ALL ON FUNCTION "public"."register_announcement_similarity_cooldown"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."register_announcement_similarity_cooldown"() TO "service_role";



GRANT ALL ON FUNCTION "public"."register_click_by_state"("p_announcement_id" "uuid", "p_state" character varying) TO "anon";
GRANT ALL ON FUNCTION "public"."register_click_by_state"("p_announcement_id" "uuid", "p_state" character varying) TO "authenticated";
GRANT ALL ON FUNCTION "public"."register_click_by_state"("p_announcement_id" "uuid", "p_state" character varying) TO "service_role";



GRANT ALL ON FUNCTION "public"."register_highlight_booster_purchase"("p_user_id" "uuid", "p_booster_id" "uuid", "p_payment_id" "uuid", "p_provider_payment_id" "text", "p_amount" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."register_highlight_booster_purchase"("p_user_id" "uuid", "p_booster_id" "uuid", "p_payment_id" "uuid", "p_provider_payment_id" "text", "p_amount" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."register_highlight_booster_purchase"("p_user_id" "uuid", "p_booster_id" "uuid", "p_payment_id" "uuid", "p_provider_payment_id" "text", "p_amount" numeric) TO "service_role";



GRANT ALL ON FUNCTION "public"."register_invite_visit"("p_code" "text", "p_session_id" "text", "p_landing_path" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."register_invite_visit"("p_code" "text", "p_session_id" "text", "p_landing_path" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."register_invite_visit"("p_code" "text", "p_session_id" "text", "p_landing_path" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."replace_template_placeholders"("p_template" "text", "p_values" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."replace_template_placeholders"("p_template" "text", "p_values" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."replace_template_placeholders"("p_template" "text", "p_values" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."reset_unread_count"() TO "anon";
GRANT ALL ON FUNCTION "public"."reset_unread_count"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."reset_unread_count"() TO "service_role";



GRANT ALL ON FUNCTION "public"."resolve_lead_contact_limit_days"("p_period_start" timestamp with time zone, "p_period_end" timestamp with time zone, "p_monthly_limit" integer, "p_yearly_limit" integer, "p_legacy_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."resolve_lead_contact_limit_days"("p_period_start" timestamp with time zone, "p_period_end" timestamp with time zone, "p_monthly_limit" integer, "p_yearly_limit" integer, "p_legacy_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."resolve_lead_contact_limit_days"("p_period_start" timestamp with time zone, "p_period_end" timestamp with time zone, "p_monthly_limit" integer, "p_yearly_limit" integer, "p_legacy_limit" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."resolve_lead_contact_limit_days"("p_period_start" timestamp with time zone, "p_period_end" timestamp with time zone, "p_monthly_limit" integer, "p_yearly_limit" integer, "p_legacy_limit" integer, "p_is_promotion" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."resolve_lead_contact_limit_days"("p_period_start" timestamp with time zone, "p_period_end" timestamp with time zone, "p_monthly_limit" integer, "p_yearly_limit" integer, "p_legacy_limit" integer, "p_is_promotion" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."resolve_lead_contact_limit_days"("p_period_start" timestamp with time zone, "p_period_end" timestamp with time zone, "p_monthly_limit" integer, "p_yearly_limit" integer, "p_legacy_limit" integer, "p_is_promotion" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."resolve_legal_document_snapshot"("p_consent_type" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."resolve_legal_document_snapshot"("p_consent_type" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."resolve_legal_document_snapshot"("p_consent_type" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."resolve_plan_validity_days"("p_billing_cycle" "text", "p_monthly_days" integer, "p_yearly_days" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."resolve_plan_validity_days"("p_billing_cycle" "text", "p_monthly_days" integer, "p_yearly_days" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."resolve_plan_validity_days"("p_billing_cycle" "text", "p_monthly_days" integer, "p_yearly_days" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."resolve_public_invite_campaign"("p_code" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."resolve_public_invite_campaign"("p_code" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."resolve_public_invite_campaign"("p_code" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."respond_to_commercial_intelligence_outreach"("p_delivery_id" "uuid", "p_buyer_note" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."respond_to_commercial_intelligence_outreach"("p_delivery_id" "uuid", "p_buyer_note" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."respond_to_commercial_intelligence_outreach"("p_delivery_id" "uuid", "p_buyer_note" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."scheduled_highlights_cleanup"() TO "anon";
GRANT ALL ON FUNCTION "public"."scheduled_highlights_cleanup"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."scheduled_highlights_cleanup"() TO "service_role";



GRANT ALL ON TABLE "public"."announcements" TO "anon";
GRANT ALL ON TABLE "public"."announcements" TO "authenticated";
GRANT ALL ON TABLE "public"."announcements" TO "service_role";



GRANT ALL ON FUNCTION "public"."search_ads"("search_query" "text", "category_slug_filter" "text", "min_price" numeric, "max_price" numeric, "state_filter" "text", "status_filter" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."search_ads"("search_query" "text", "category_slug_filter" "text", "min_price" numeric, "max_price" numeric, "state_filter" "text", "status_filter" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."search_ads"("search_query" "text", "category_slug_filter" "text", "min_price" numeric, "max_price" numeric, "state_filter" "text", "status_filter" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."seller_has_active_plan_contact_access"("p_seller_id" "uuid", "p_reference" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."seller_has_active_plan_contact_access"("p_seller_id" "uuid", "p_reference" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."seller_has_active_plan_contact_access"("p_seller_id" "uuid", "p_reference" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."send_commercial_intelligence_conversation_message"("p_conversation_id" "uuid", "p_message" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."send_commercial_intelligence_conversation_message"("p_conversation_id" "uuid", "p_message" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."send_commercial_intelligence_conversation_message"("p_conversation_id" "uuid", "p_message" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."send_email_notification"() TO "anon";
GRANT ALL ON FUNCTION "public"."send_email_notification"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."send_email_notification"() TO "service_role";



GRANT ALL ON TABLE "public"."plans" TO "anon";
GRANT ALL ON TABLE "public"."plans" TO "authenticated";
GRANT ALL ON TABLE "public"."plans" TO "service_role";



GRANT ALL ON FUNCTION "public"."set_default_signup_plan"("p_plan_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."set_default_signup_plan"("p_plan_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_default_signup_plan"("p_plan_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."set_first_ad_timestamp"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_first_ad_timestamp"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_first_ad_timestamp"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_highlight_settings_updated_by"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_highlight_settings_updated_by"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_highlight_settings_updated_by"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_market_quote_sources_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_market_quote_sources_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_market_quote_sources_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_market_quotes_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_market_quotes_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_market_quotes_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_support_settings_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_support_settings_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_support_settings_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_support_ticket_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_support_ticket_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_support_ticket_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_updated_at_plans"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at_plans"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at_plans"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_updated_at_user_subscriptions"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at_user_subscriptions"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at_user_subscriptions"() TO "service_role";



GRANT ALL ON FUNCTION "public"."site_analytics_is_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."site_analytics_is_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."site_analytics_is_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."slugify"("input" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."slugify"("input" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."slugify"("input" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."start_commercial_intelligence_conversation"("p_response_id" "uuid", "p_initial_message" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."start_commercial_intelligence_conversation"("p_response_id" "uuid", "p_initial_message" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."start_commercial_intelligence_conversation"("p_response_id" "uuid", "p_initial_message" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strip_community_report_review_reasons"("p_reasons" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."strip_community_report_review_reasons"("p_reasons" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strip_community_report_review_reasons"("p_reasons" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."submit_announcement_report"("p_announcement_id" "uuid", "p_reason" "text", "p_details" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."submit_announcement_report"("p_announcement_id" "uuid", "p_reason" "text", "p_details" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."submit_announcement_report"("p_announcement_id" "uuid", "p_reason" "text", "p_details" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."submit_contact_message"("p_name" "text", "p_email" "text", "p_phone" "text", "p_subject" "text", "p_message" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."submit_contact_message"("p_name" "text", "p_email" "text", "p_phone" "text", "p_subject" "text", "p_message" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."submit_contact_message"("p_name" "text", "p_email" "text", "p_phone" "text", "p_subject" "text", "p_message" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."subscribe_newsletter"("p_email" "text", "p_source" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."subscribe_newsletter"("p_email" "text", "p_source" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."subscribe_newsletter"("p_email" "text", "p_source" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_announcement_expires_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_announcement_expires_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_announcement_expires_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_category_group_id_from_category"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_category_group_id_from_category"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_category_group_id_from_category"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_lead_chat_status"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_lead_chat_status"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_lead_chat_status"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_lead_contact_expires_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_lead_contact_expires_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_lead_contact_expires_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_lead_windows_after_subscription_change"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_lead_windows_after_subscription_change"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_lead_windows_after_subscription_change"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_payments_invoice_issued_on"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_payments_invoice_issued_on"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_payments_invoice_issued_on"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_seller_store_feature_status"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."sync_seller_store_feature_status"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_seller_store_feature_status"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_support_ticket_last_message_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_support_ticket_last_message_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_support_ticket_last_message_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_user_document_normalized"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_user_document_normalized"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_user_document_normalized"() TO "service_role";



GRANT ALL ON FUNCTION "public"."touch_announcement_edit_requests_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."touch_announcement_edit_requests_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."touch_announcement_edit_requests_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."touch_announcement_reports_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."touch_announcement_reports_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."touch_announcement_reports_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."touch_category_ranking_settings_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."touch_category_ranking_settings_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."touch_category_ranking_settings_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."touch_commercial_intelligence_contact_shares_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."touch_commercial_intelligence_contact_shares_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."touch_commercial_intelligence_contact_shares_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."touch_commercial_intelligence_conversations_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."touch_commercial_intelligence_conversations_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."touch_commercial_intelligence_conversations_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."touch_commercial_intelligence_interest_responses_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."touch_commercial_intelligence_interest_responses_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."touch_commercial_intelligence_interest_responses_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."touch_commercial_intelligence_outreach_campaigns_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."touch_commercial_intelligence_outreach_campaigns_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."touch_commercial_intelligence_outreach_campaigns_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."touch_commercial_lead_preferences_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."touch_commercial_lead_preferences_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."touch_commercial_lead_preferences_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."touch_contact_form_email_jobs_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."touch_contact_form_email_jobs_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."touch_contact_form_email_jobs_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."touch_contact_messages_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."touch_contact_messages_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."touch_contact_messages_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."touch_contact_notification_email_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."touch_contact_notification_email_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."touch_contact_notification_email_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."touch_invite_campaigns_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."touch_invite_campaigns_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."touch_invite_campaigns_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."touch_invite_visits_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."touch_invite_visits_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."touch_invite_visits_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."touch_plan_alert_email_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."touch_plan_alert_email_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."touch_plan_alert_email_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."touch_promotion_plan_codes_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."touch_promotion_plan_codes_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."touch_promotion_plan_codes_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."touch_publication_moderation_rules_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."touch_publication_moderation_rules_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."touch_publication_moderation_rules_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."touch_radar_match_email_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."touch_radar_match_email_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."touch_radar_match_email_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."touch_site_presence"("p_session_id" "text", "p_user_id" "uuid", "p_current_path" "text", "p_page_type" "text", "p_page_label" "text", "p_device_type" "text", "p_is_admin_area" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."touch_site_presence"("p_session_id" "text", "p_user_id" "uuid", "p_current_path" "text", "p_page_type" "text", "p_page_label" "text", "p_device_type" "text", "p_is_admin_area" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."touch_site_presence"("p_session_id" "text", "p_user_id" "uuid", "p_current_path" "text", "p_page_type" "text", "p_page_label" "text", "p_device_type" "text", "p_is_admin_area" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."touch_site_presence"("p_session_id" "text", "p_user_id" "uuid", "p_current_path" "text", "p_page_type" "text", "p_page_label" "text", "p_device_type" "text", "p_is_admin_area" boolean, "p_user_city" "text", "p_user_state" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."touch_site_presence"("p_session_id" "text", "p_user_id" "uuid", "p_current_path" "text", "p_page_type" "text", "p_page_label" "text", "p_device_type" "text", "p_is_admin_area" boolean, "p_user_city" "text", "p_user_state" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."touch_site_presence"("p_session_id" "text", "p_user_id" "uuid", "p_current_path" "text", "p_page_type" "text", "p_page_label" "text", "p_device_type" "text", "p_is_admin_area" boolean, "p_user_city" "text", "p_user_state" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."touch_site_presence_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."touch_site_presence_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."touch_site_presence_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."touch_site_sponsors_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."touch_site_sponsors_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."touch_site_sponsors_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."touch_smtp_settings_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."touch_smtp_settings_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."touch_smtp_settings_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."touch_sponsor_interest_leads_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."touch_sponsor_interest_leads_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."touch_sponsor_interest_leads_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."touch_sponsor_metrics_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."touch_sponsor_metrics_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."touch_sponsor_metrics_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."touch_sponsor_testimonials_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."touch_sponsor_testimonials_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."touch_sponsor_testimonials_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."touch_subscription_change_requests_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."touch_subscription_change_requests_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."touch_subscription_change_requests_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."touch_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."touch_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."touch_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trigger_create_subscription_history"() TO "anon";
GRANT ALL ON FUNCTION "public"."trigger_create_subscription_history"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trigger_create_subscription_history"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trigger_match_existing_announcements_to_alert"() TO "anon";
GRANT ALL ON FUNCTION "public"."trigger_match_existing_announcements_to_alert"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trigger_match_existing_announcements_to_alert"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trigger_radar_matcher"() TO "anon";
GRANT ALL ON FUNCTION "public"."trigger_radar_matcher"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trigger_radar_matcher"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trigger_radar_matcher_price_drop"() TO "anon";
GRANT ALL ON FUNCTION "public"."trigger_radar_matcher_price_drop"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trigger_radar_matcher_price_drop"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trigger_radar_matcher_sql"() TO "anon";
GRANT ALL ON FUNCTION "public"."trigger_radar_matcher_sql"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trigger_radar_matcher_sql"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trigger_update_subscription_history"() TO "anon";
GRANT ALL ON FUNCTION "public"."trigger_update_subscription_history"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trigger_update_subscription_history"() TO "service_role";



GRANT ALL ON FUNCTION "public"."unaccent"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."unaccent"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."unaccent"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."unaccent"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."unaccent"("regdictionary", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."unaccent"("regdictionary", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."unaccent"("regdictionary", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."unaccent"("regdictionary", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."unaccent_init"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."unaccent_init"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."unaccent_init"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."unaccent_init"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."unaccent_lexize"("internal", "internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."unaccent_lexize"("internal", "internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."unaccent_lexize"("internal", "internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."unaccent_lexize"("internal", "internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_category_count"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_category_count"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_category_count"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_chat_last_message"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_chat_last_message"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_chat_last_message"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_opportunity_alerts_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_opportunity_alerts_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_opportunity_alerts_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_payment_settings_admin_safe"("p_asaas_api_key" "text", "p_asaas_webhook_token" "text", "p_is_production" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."update_payment_settings_admin_safe"("p_asaas_api_key" "text", "p_asaas_webhook_token" "text", "p_is_production" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_payment_settings_admin_safe"("p_asaas_api_key" "text", "p_asaas_webhook_token" "text", "p_is_production" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."update_payment_settings_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_payment_settings_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_payment_settings_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_stripe_rollout_overrides_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_stripe_rollout_overrides_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_stripe_rollout_overrides_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_user_subscriptions_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_user_subscriptions_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_user_subscriptions_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."validate_page_slug"() TO "anon";
GRANT ALL ON FUNCTION "public"."validate_page_slug"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."validate_page_slug"() TO "service_role";



GRANT ALL ON FUNCTION "public"."validate_site_sponsor_capacity"() TO "anon";
GRANT ALL ON FUNCTION "public"."validate_site_sponsor_capacity"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."validate_site_sponsor_capacity"() TO "service_role";



GRANT ALL ON FUNCTION "public"."validate_user_business_description"() TO "anon";
GRANT ALL ON FUNCTION "public"."validate_user_business_description"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."validate_user_business_description"() TO "service_role";
























GRANT ALL ON TABLE "public"."about_page_content" TO "anon";
GRANT ALL ON TABLE "public"."about_page_content" TO "authenticated";
GRANT ALL ON TABLE "public"."about_page_content" TO "service_role";



GRANT ALL ON TABLE "public"."admin_audit_logs" TO "anon";
GRANT ALL ON TABLE "public"."admin_audit_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."admin_audit_logs" TO "service_role";



GRANT ALL ON TABLE "public"."admin_mfa_login_tickets" TO "anon";
GRANT ALL ON TABLE "public"."admin_mfa_login_tickets" TO "authenticated";
GRANT ALL ON TABLE "public"."admin_mfa_login_tickets" TO "service_role";



GRANT ALL ON TABLE "public"."announcement_technical_details" TO "anon";
GRANT ALL ON TABLE "public"."announcement_technical_details" TO "authenticated";
GRANT ALL ON TABLE "public"."announcement_technical_details" TO "service_role";



GRANT ALL ON TABLE "public"."categories" TO "anon";
GRANT ALL ON TABLE "public"."categories" TO "authenticated";
GRANT ALL ON TABLE "public"."categories" TO "service_role";



GRANT ALL ON TABLE "public"."favorites" TO "anon";
GRANT ALL ON TABLE "public"."favorites" TO "authenticated";
GRANT ALL ON TABLE "public"."favorites" TO "service_role";



GRANT ALL ON TABLE "public"."users" TO "anon";
GRANT ALL ON TABLE "public"."users" TO "authenticated";
GRANT ALL ON TABLE "public"."users" TO "service_role";



GRANT ALL ON TABLE "public"."ads_full" TO "anon";
GRANT ALL ON TABLE "public"."ads_full" TO "authenticated";
GRANT ALL ON TABLE "public"."ads_full" TO "service_role";



GRANT ALL ON TABLE "public"."announcement_clicks_by_state" TO "anon";
GRANT ALL ON TABLE "public"."announcement_clicks_by_state" TO "authenticated";
GRANT ALL ON TABLE "public"."announcement_clicks_by_state" TO "service_role";



GRANT ALL ON TABLE "public"."announcement_edit_requests" TO "anon";
GRANT ALL ON TABLE "public"."announcement_edit_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."announcement_edit_requests" TO "service_role";



GRANT ALL ON TABLE "public"."announcement_highlights_history" TO "anon";
GRANT ALL ON TABLE "public"."announcement_highlights_history" TO "authenticated";
GRANT ALL ON TABLE "public"."announcement_highlights_history" TO "service_role";



GRANT ALL ON TABLE "public"."announcement_metrics" TO "anon";
GRANT ALL ON TABLE "public"."announcement_metrics" TO "authenticated";
GRANT ALL ON TABLE "public"."announcement_metrics" TO "service_role";



GRANT ALL ON TABLE "public"."announcement_reports" TO "anon";
GRANT ALL ON TABLE "public"."announcement_reports" TO "authenticated";
GRANT ALL ON TABLE "public"."announcement_reports" TO "service_role";



GRANT ALL ON TABLE "public"."announcement_similarity_cooldowns" TO "anon";
GRANT ALL ON TABLE "public"."announcement_similarity_cooldowns" TO "authenticated";
GRANT ALL ON TABLE "public"."announcement_similarity_cooldowns" TO "service_role";



GRANT ALL ON TABLE "public"."announcements_with_active_highlights" TO "anon";
GRANT ALL ON TABLE "public"."announcements_with_active_highlights" TO "authenticated";
GRANT ALL ON TABLE "public"."announcements_with_active_highlights" TO "service_role";



GRANT ALL ON TABLE "public"."banners" TO "anon";
GRANT ALL ON TABLE "public"."banners" TO "authenticated";
GRANT ALL ON TABLE "public"."banners" TO "service_role";



GRANT ALL ON TABLE "public"."category_group_categories" TO "anon";
GRANT ALL ON TABLE "public"."category_group_categories" TO "authenticated";
GRANT ALL ON TABLE "public"."category_group_categories" TO "service_role";



GRANT ALL ON TABLE "public"."category_group_images" TO "anon";
GRANT ALL ON TABLE "public"."category_group_images" TO "authenticated";
GRANT ALL ON TABLE "public"."category_group_images" TO "service_role";



GRANT ALL ON TABLE "public"."category_groups" TO "anon";
GRANT ALL ON TABLE "public"."category_groups" TO "authenticated";
GRANT ALL ON TABLE "public"."category_groups" TO "service_role";



GRANT ALL ON TABLE "public"."category_group_resolved" TO "anon";
GRANT ALL ON TABLE "public"."category_group_resolved" TO "authenticated";
GRANT ALL ON TABLE "public"."category_group_resolved" TO "service_role";



GRANT ALL ON TABLE "public"."category_ranking_settings" TO "anon";
GRANT ALL ON TABLE "public"."category_ranking_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."category_ranking_settings" TO "service_role";



GRANT ALL ON TABLE "public"."category_showcase_impressions" TO "anon";
GRANT ALL ON TABLE "public"."category_showcase_impressions" TO "authenticated";
GRANT ALL ON TABLE "public"."category_showcase_impressions" TO "service_role";



GRANT ALL ON TABLE "public"."category_subcategories" TO "anon";
GRANT ALL ON TABLE "public"."category_subcategories" TO "authenticated";
GRANT ALL ON TABLE "public"."category_subcategories" TO "service_role";



GRANT ALL ON TABLE "public"."chats" TO "anon";
GRANT ALL ON TABLE "public"."chats" TO "authenticated";
GRANT ALL ON TABLE "public"."chats" TO "service_role";



GRANT ALL ON TABLE "public"."leads" TO "anon";
GRANT ALL ON TABLE "public"."leads" TO "authenticated";
GRANT ALL ON TABLE "public"."leads" TO "service_role";



GRANT ALL ON TABLE "public"."chats_full" TO "anon";
GRANT ALL ON TABLE "public"."chats_full" TO "authenticated";
GRANT ALL ON TABLE "public"."chats_full" TO "service_role";



GRANT ALL ON TABLE "public"."commercial_intelligence_contact_shares" TO "anon";
GRANT ALL ON TABLE "public"."commercial_intelligence_contact_shares" TO "authenticated";
GRANT ALL ON TABLE "public"."commercial_intelligence_contact_shares" TO "service_role";



GRANT ALL ON TABLE "public"."commercial_intelligence_conversation_messages" TO "anon";
GRANT ALL ON TABLE "public"."commercial_intelligence_conversation_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."commercial_intelligence_conversation_messages" TO "service_role";



GRANT ALL ON TABLE "public"."commercial_intelligence_conversations" TO "anon";
GRANT ALL ON TABLE "public"."commercial_intelligence_conversations" TO "authenticated";
GRANT ALL ON TABLE "public"."commercial_intelligence_conversations" TO "service_role";



GRANT ALL ON TABLE "public"."commercial_intelligence_interest_responses" TO "anon";
GRANT ALL ON TABLE "public"."commercial_intelligence_interest_responses" TO "authenticated";
GRANT ALL ON TABLE "public"."commercial_intelligence_interest_responses" TO "service_role";



GRANT ALL ON TABLE "public"."commercial_intelligence_outreach_campaigns" TO "anon";
GRANT ALL ON TABLE "public"."commercial_intelligence_outreach_campaigns" TO "authenticated";
GRANT ALL ON TABLE "public"."commercial_intelligence_outreach_campaigns" TO "service_role";



GRANT ALL ON TABLE "public"."commercial_intelligence_outreach_deliveries" TO "anon";
GRANT ALL ON TABLE "public"."commercial_intelligence_outreach_deliveries" TO "authenticated";
GRANT ALL ON TABLE "public"."commercial_intelligence_outreach_deliveries" TO "service_role";



GRANT ALL ON TABLE "public"."commercial_intelligence_requests" TO "anon";
GRANT ALL ON TABLE "public"."commercial_intelligence_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."commercial_intelligence_requests" TO "service_role";



GRANT ALL ON TABLE "public"."commercial_lead_preferences" TO "anon";
GRANT ALL ON TABLE "public"."commercial_lead_preferences" TO "authenticated";
GRANT ALL ON TABLE "public"."commercial_lead_preferences" TO "service_role";



GRANT ALL ON TABLE "public"."contact_form_email_jobs" TO "anon";
GRANT ALL ON TABLE "public"."contact_form_email_jobs" TO "authenticated";
GRANT ALL ON TABLE "public"."contact_form_email_jobs" TO "service_role";



GRANT ALL ON TABLE "public"."contact_messages" TO "anon";
GRANT ALL ON TABLE "public"."contact_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."contact_messages" TO "service_role";



GRANT ALL ON TABLE "public"."contact_notification_email_dispatch_logs" TO "anon";
GRANT ALL ON TABLE "public"."contact_notification_email_dispatch_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."contact_notification_email_dispatch_logs" TO "service_role";



GRANT ALL ON TABLE "public"."contact_notification_email_jobs" TO "anon";
GRANT ALL ON TABLE "public"."contact_notification_email_jobs" TO "authenticated";
GRANT ALL ON TABLE "public"."contact_notification_email_jobs" TO "service_role";



GRANT ALL ON TABLE "public"."contact_page_content" TO "anon";
GRANT ALL ON TABLE "public"."contact_page_content" TO "authenticated";
GRANT ALL ON TABLE "public"."contact_page_content" TO "service_role";



GRANT ALL ON TABLE "public"."fiscal_document_jobs" TO "anon";
GRANT ALL ON TABLE "public"."fiscal_document_jobs" TO "authenticated";
GRANT ALL ON TABLE "public"."fiscal_document_jobs" TO "service_role";



GRANT ALL ON TABLE "public"."fiscal_settings" TO "anon";
GRANT ALL ON TABLE "public"."fiscal_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."fiscal_settings" TO "service_role";



GRANT ALL ON TABLE "public"."growth_conversion_settings" TO "anon";
GRANT ALL ON TABLE "public"."growth_conversion_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."growth_conversion_settings" TO "service_role";



GRANT ALL ON TABLE "public"."highlight_boosters" TO "anon";
GRANT ALL ON TABLE "public"."highlight_boosters" TO "authenticated";
GRANT ALL ON TABLE "public"."highlight_boosters" TO "service_role";



GRANT ALL ON TABLE "public"."highlight_settings" TO "anon";
GRANT ALL ON TABLE "public"."highlight_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."highlight_settings" TO "service_role";



GRANT ALL ON TABLE "public"."home_banners" TO "anon";
GRANT ALL ON TABLE "public"."home_banners" TO "authenticated";
GRANT ALL ON TABLE "public"."home_banners" TO "service_role";



GRANT ALL ON TABLE "public"."home_showcase_impressions" TO "anon";
GRANT ALL ON TABLE "public"."home_showcase_impressions" TO "authenticated";
GRANT ALL ON TABLE "public"."home_showcase_impressions" TO "service_role";



GRANT ALL ON TABLE "public"."institutional_pages" TO "anon";
GRANT ALL ON TABLE "public"."institutional_pages" TO "authenticated";
GRANT ALL ON TABLE "public"."institutional_pages" TO "service_role";



GRANT ALL ON TABLE "public"."invite_campaigns" TO "anon";
GRANT ALL ON TABLE "public"."invite_campaigns" TO "authenticated";
GRANT ALL ON TABLE "public"."invite_campaigns" TO "service_role";



GRANT ALL ON TABLE "public"."invite_visits" TO "anon";
GRANT ALL ON TABLE "public"."invite_visits" TO "authenticated";
GRANT ALL ON TABLE "public"."invite_visits" TO "service_role";



GRANT ALL ON TABLE "public"."invoices" TO "anon";
GRANT ALL ON TABLE "public"."invoices" TO "authenticated";
GRANT ALL ON TABLE "public"."invoices" TO "service_role";



GRANT ALL ON TABLE "public"."layout_settings" TO "anon";
GRANT ALL ON TABLE "public"."layout_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."layout_settings" TO "service_role";



GRANT ALL ON TABLE "public"."lead_conversions" TO "anon";
GRANT ALL ON TABLE "public"."lead_conversions" TO "authenticated";
GRANT ALL ON TABLE "public"."lead_conversions" TO "service_role";



GRANT ALL ON TABLE "public"."market_quote_source_previews" TO "anon";
GRANT ALL ON TABLE "public"."market_quote_source_previews" TO "authenticated";
GRANT ALL ON TABLE "public"."market_quote_source_previews" TO "service_role";



GRANT ALL ON TABLE "public"."market_quote_sources" TO "anon";
GRANT ALL ON TABLE "public"."market_quote_sources" TO "authenticated";
GRANT ALL ON TABLE "public"."market_quote_sources" TO "service_role";



GRANT ALL ON TABLE "public"."market_quotes" TO "anon";
GRANT ALL ON TABLE "public"."market_quotes" TO "authenticated";
GRANT ALL ON TABLE "public"."market_quotes" TO "service_role";



GRANT ALL ON TABLE "public"."market_quotes_temp" TO "anon";
GRANT ALL ON TABLE "public"."market_quotes_temp" TO "authenticated";
GRANT ALL ON TABLE "public"."market_quotes_temp" TO "service_role";



GRANT ALL ON TABLE "public"."marketing_costs" TO "anon";
GRANT ALL ON TABLE "public"."marketing_costs" TO "authenticated";
GRANT ALL ON TABLE "public"."marketing_costs" TO "service_role";



GRANT ALL ON TABLE "public"."messages" TO "anon";
GRANT ALL ON TABLE "public"."messages" TO "authenticated";
GRANT ALL ON TABLE "public"."messages" TO "service_role";



GRANT ALL ON TABLE "public"."news" TO "anon";
GRANT ALL ON TABLE "public"."news" TO "authenticated";
GRANT ALL ON TABLE "public"."news" TO "service_role";



GRANT ALL ON TABLE "public"."news_article_sources" TO "anon";
GRANT ALL ON TABLE "public"."news_article_sources" TO "authenticated";
GRANT ALL ON TABLE "public"."news_article_sources" TO "service_role";



GRANT ALL ON TABLE "public"."news_articles" TO "anon";
GRANT ALL ON TABLE "public"."news_articles" TO "authenticated";
GRANT ALL ON TABLE "public"."news_articles" TO "service_role";



GRANT ALL ON TABLE "public"."news_generation_jobs" TO "anon";
GRANT ALL ON TABLE "public"."news_generation_jobs" TO "authenticated";
GRANT ALL ON TABLE "public"."news_generation_jobs" TO "service_role";



GRANT ALL ON TABLE "public"."news_ingestions" TO "anon";
GRANT ALL ON TABLE "public"."news_ingestions" TO "authenticated";
GRANT ALL ON TABLE "public"."news_ingestions" TO "service_role";



GRANT ALL ON TABLE "public"."news_settings" TO "anon";
GRANT ALL ON TABLE "public"."news_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."news_settings" TO "service_role";



GRANT ALL ON TABLE "public"."news_social_publications" TO "anon";
GRANT ALL ON TABLE "public"."news_social_publications" TO "authenticated";
GRANT ALL ON TABLE "public"."news_social_publications" TO "service_role";



GRANT ALL ON TABLE "public"."news_social_settings" TO "anon";
GRANT ALL ON TABLE "public"."news_social_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."news_social_settings" TO "service_role";



GRANT ALL ON TABLE "public"."news_sources" TO "anon";
GRANT ALL ON TABLE "public"."news_sources" TO "authenticated";
GRANT ALL ON TABLE "public"."news_sources" TO "service_role";



GRANT ALL ON TABLE "public"."newsletter_campaign_email_dispatch_logs" TO "anon";
GRANT ALL ON TABLE "public"."newsletter_campaign_email_dispatch_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."newsletter_campaign_email_dispatch_logs" TO "service_role";



GRANT ALL ON TABLE "public"."newsletter_campaign_email_jobs" TO "anon";
GRANT ALL ON TABLE "public"."newsletter_campaign_email_jobs" TO "authenticated";
GRANT ALL ON TABLE "public"."newsletter_campaign_email_jobs" TO "service_role";



GRANT ALL ON TABLE "public"."newsletter_campaigns" TO "anon";
GRANT ALL ON TABLE "public"."newsletter_campaigns" TO "authenticated";
GRANT ALL ON TABLE "public"."newsletter_campaigns" TO "service_role";



GRANT ALL ON TABLE "public"."newsletter_subscriptions" TO "service_role";



GRANT ALL ON TABLE "public"."notifications" TO "anon";
GRANT ALL ON TABLE "public"."notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."notifications" TO "service_role";



GRANT ALL ON TABLE "public"."opportunities" TO "anon";
GRANT ALL ON TABLE "public"."opportunities" TO "authenticated";
GRANT ALL ON TABLE "public"."opportunities" TO "service_role";



GRANT ALL ON TABLE "public"."opportunities_view" TO "anon";
GRANT ALL ON TABLE "public"."opportunities_view" TO "authenticated";
GRANT ALL ON TABLE "public"."opportunities_view" TO "service_role";



GRANT ALL ON TABLE "public"."opportunity_alerts" TO "anon";
GRANT ALL ON TABLE "public"."opportunity_alerts" TO "authenticated";
GRANT ALL ON TABLE "public"."opportunity_alerts" TO "service_role";



GRANT ALL ON TABLE "public"."opportunity_matches" TO "anon";
GRANT ALL ON TABLE "public"."opportunity_matches" TO "authenticated";
GRANT ALL ON TABLE "public"."opportunity_matches" TO "service_role";



GRANT ALL ON TABLE "public"."payment_settings" TO "anon";
GRANT ALL ON TABLE "public"."payment_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."payment_settings" TO "service_role";



GRANT ALL ON TABLE "public"."payments" TO "anon";
GRANT ALL ON TABLE "public"."payments" TO "authenticated";
GRANT ALL ON TABLE "public"."payments" TO "service_role";



GRANT ALL ON TABLE "public"."plan_alert_email_dispatch_logs" TO "anon";
GRANT ALL ON TABLE "public"."plan_alert_email_dispatch_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."plan_alert_email_dispatch_logs" TO "service_role";



GRANT ALL ON TABLE "public"."plan_alert_email_jobs" TO "anon";
GRANT ALL ON TABLE "public"."plan_alert_email_jobs" TO "authenticated";
GRANT ALL ON TABLE "public"."plan_alert_email_jobs" TO "service_role";



GRANT ALL ON TABLE "public"."price_drop_notifications" TO "anon";
GRANT ALL ON TABLE "public"."price_drop_notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."price_drop_notifications" TO "service_role";



GRANT ALL ON TABLE "public"."pricing_plans_view" TO "anon";
GRANT ALL ON TABLE "public"."pricing_plans_view" TO "authenticated";
GRANT ALL ON TABLE "public"."pricing_plans_view" TO "service_role";



GRANT ALL ON TABLE "public"."privacy_page_content" TO "anon";
GRANT ALL ON TABLE "public"."privacy_page_content" TO "authenticated";
GRANT ALL ON TABLE "public"."privacy_page_content" TO "service_role";



GRANT ALL ON TABLE "public"."promotion_plan_codes" TO "anon";
GRANT ALL ON TABLE "public"."promotion_plan_codes" TO "authenticated";
GRANT ALL ON TABLE "public"."promotion_plan_codes" TO "service_role";



GRANT ALL ON TABLE "public"."promotion_plan_redemptions" TO "anon";
GRANT ALL ON TABLE "public"."promotion_plan_redemptions" TO "authenticated";
GRANT ALL ON TABLE "public"."promotion_plan_redemptions" TO "service_role";



GRANT ALL ON TABLE "public"."publication_moderation_rules" TO "anon";
GRANT ALL ON TABLE "public"."publication_moderation_rules" TO "authenticated";
GRANT ALL ON TABLE "public"."publication_moderation_rules" TO "service_role";



GRANT ALL ON TABLE "public"."quotations" TO "anon";
GRANT ALL ON TABLE "public"."quotations" TO "authenticated";
GRANT ALL ON TABLE "public"."quotations" TO "service_role";



GRANT ALL ON TABLE "public"."radar_match_email_dispatch_logs" TO "anon";
GRANT ALL ON TABLE "public"."radar_match_email_dispatch_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."radar_match_email_dispatch_logs" TO "service_role";



GRANT ALL ON TABLE "public"."radar_match_email_jobs" TO "anon";
GRANT ALL ON TABLE "public"."radar_match_email_jobs" TO "authenticated";
GRANT ALL ON TABLE "public"."radar_match_email_jobs" TO "service_role";



GRANT ALL ON TABLE "public"."rate_limit_counters" TO "anon";
GRANT ALL ON TABLE "public"."rate_limit_counters" TO "authenticated";
GRANT ALL ON TABLE "public"."rate_limit_counters" TO "service_role";



GRANT ALL ON TABLE "public"."renewal_notification_settings" TO "anon";
GRANT ALL ON TABLE "public"."renewal_notification_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."renewal_notification_settings" TO "service_role";



GRANT ALL ON TABLE "public"."search_events" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."security_events" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."security_events" TO "authenticated";
GRANT ALL ON TABLE "public"."security_events" TO "service_role";



GRANT ALL ON TABLE "public"."seller_stores" TO "anon";
GRANT ALL ON TABLE "public"."seller_stores" TO "authenticated";
GRANT ALL ON TABLE "public"."seller_stores" TO "service_role";



GRANT ALL ON TABLE "public"."site_page_views" TO "service_role";



GRANT ALL ON TABLE "public"."site_popup_events" TO "anon";
GRANT ALL ON TABLE "public"."site_popup_events" TO "authenticated";
GRANT ALL ON TABLE "public"."site_popup_events" TO "service_role";



GRANT ALL ON TABLE "public"."site_popup_metrics" TO "anon";
GRANT ALL ON TABLE "public"."site_popup_metrics" TO "authenticated";
GRANT ALL ON TABLE "public"."site_popup_metrics" TO "service_role";



GRANT ALL ON TABLE "public"."site_popup_user_states" TO "anon";
GRANT ALL ON TABLE "public"."site_popup_user_states" TO "authenticated";
GRANT ALL ON TABLE "public"."site_popup_user_states" TO "service_role";



GRANT ALL ON TABLE "public"."site_popups" TO "anon";
GRANT ALL ON TABLE "public"."site_popups" TO "authenticated";
GRANT ALL ON TABLE "public"."site_popups" TO "service_role";



GRANT ALL ON TABLE "public"."site_presence" TO "service_role";



GRANT ALL ON TABLE "public"."site_sponsor_clicks" TO "anon";
GRANT ALL ON TABLE "public"."site_sponsor_clicks" TO "authenticated";
GRANT ALL ON TABLE "public"."site_sponsor_clicks" TO "service_role";



GRANT ALL ON TABLE "public"."site_sponsor_impressions" TO "anon";
GRANT ALL ON TABLE "public"."site_sponsor_impressions" TO "authenticated";
GRANT ALL ON TABLE "public"."site_sponsor_impressions" TO "service_role";



GRANT ALL ON TABLE "public"."site_sponsors" TO "anon";
GRANT ALL ON TABLE "public"."site_sponsors" TO "authenticated";
GRANT ALL ON TABLE "public"."site_sponsors" TO "service_role";



GRANT ALL ON TABLE "public"."smtp_config" TO "anon";
GRANT ALL ON TABLE "public"."smtp_config" TO "authenticated";
GRANT ALL ON TABLE "public"."smtp_config" TO "service_role";



GRANT ALL ON TABLE "public"."smtp_settings" TO "anon";
GRANT ALL ON TABLE "public"."smtp_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."smtp_settings" TO "service_role";



GRANT ALL ON TABLE "public"."sponsor_interest_leads" TO "anon";
GRANT ALL ON TABLE "public"."sponsor_interest_leads" TO "authenticated";
GRANT ALL ON TABLE "public"."sponsor_interest_leads" TO "service_role";



GRANT ALL ON TABLE "public"."sponsor_metric_email_dispatch_logs" TO "anon";
GRANT ALL ON TABLE "public"."sponsor_metric_email_dispatch_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."sponsor_metric_email_dispatch_logs" TO "service_role";



GRANT ALL ON TABLE "public"."sponsor_metric_email_jobs" TO "anon";
GRANT ALL ON TABLE "public"."sponsor_metric_email_jobs" TO "authenticated";
GRANT ALL ON TABLE "public"."sponsor_metric_email_jobs" TO "service_role";



GRANT ALL ON TABLE "public"."sponsor_testimonials" TO "anon";
GRANT ALL ON TABLE "public"."sponsor_testimonials" TO "authenticated";
GRANT ALL ON TABLE "public"."sponsor_testimonials" TO "service_role";



GRANT ALL ON TABLE "public"."subcategories" TO "anon";
GRANT ALL ON TABLE "public"."subcategories" TO "authenticated";
GRANT ALL ON TABLE "public"."subcategories" TO "service_role";



GRANT ALL ON TABLE "public"."subscription_history" TO "anon";
GRANT ALL ON TABLE "public"."subscription_history" TO "authenticated";
GRANT ALL ON TABLE "public"."subscription_history" TO "service_role";



GRANT ALL ON TABLE "public"."support_settings" TO "anon";
GRANT ALL ON TABLE "public"."support_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."support_settings" TO "service_role";



GRANT ALL ON TABLE "public"."support_ticket_messages" TO "anon";
GRANT ALL ON TABLE "public"."support_ticket_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."support_ticket_messages" TO "service_role";



GRANT ALL ON TABLE "public"."support_tickets" TO "anon";
GRANT ALL ON TABLE "public"."support_tickets" TO "authenticated";
GRANT ALL ON TABLE "public"."support_tickets" TO "service_role";



GRANT ALL ON TABLE "public"."terms_page_content" TO "anon";
GRANT ALL ON TABLE "public"."terms_page_content" TO "authenticated";
GRANT ALL ON TABLE "public"."terms_page_content" TO "service_role";



GRANT ALL ON TABLE "public"."user_highlight_booster_purchases" TO "anon";
GRANT ALL ON TABLE "public"."user_highlight_booster_purchases" TO "authenticated";
GRANT ALL ON TABLE "public"."user_highlight_booster_purchases" TO "service_role";



GRANT ALL ON TABLE "public"."user_legal_consents" TO "anon";
GRANT ALL ON TABLE "public"."user_legal_consents" TO "authenticated";
GRANT ALL ON TABLE "public"."user_legal_consents" TO "service_role";



GRANT ALL ON TABLE "public"."user_subscriptions" TO "anon";
GRANT ALL ON TABLE "public"."user_subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."user_subscriptions" TO "service_role";



GRANT ALL ON TABLE "public"."v_admin_action_stats" TO "anon";
GRANT ALL ON TABLE "public"."v_admin_action_stats" TO "authenticated";
GRANT ALL ON TABLE "public"."v_admin_action_stats" TO "service_role";



GRANT ALL ON TABLE "public"."v_cac_monthly" TO "anon";
GRANT ALL ON TABLE "public"."v_cac_monthly" TO "authenticated";
GRANT ALL ON TABLE "public"."v_cac_monthly" TO "service_role";



GRANT ALL ON TABLE "public"."v_churn_monthly" TO "anon";
GRANT ALL ON TABLE "public"."v_churn_monthly" TO "authenticated";
GRANT ALL ON TABLE "public"."v_churn_monthly" TO "service_role";



GRANT ALL ON TABLE "public"."v_critical_security_events" TO "anon";
GRANT ALL ON TABLE "public"."v_critical_security_events" TO "authenticated";
GRANT ALL ON TABLE "public"."v_critical_security_events" TO "service_role";



GRANT ALL ON TABLE "public"."v_customer_churn_30d" TO "anon";
GRANT ALL ON TABLE "public"."v_customer_churn_30d" TO "authenticated";
GRANT ALL ON TABLE "public"."v_customer_churn_30d" TO "service_role";



GRANT ALL ON TABLE "public"."v_free_to_paid_conversion" TO "anon";
GRANT ALL ON TABLE "public"."v_free_to_paid_conversion" TO "authenticated";
GRANT ALL ON TABLE "public"."v_free_to_paid_conversion" TO "service_role";



GRANT ALL ON TABLE "public"."v_lead_conversion_rate" TO "anon";
GRANT ALL ON TABLE "public"."v_lead_conversion_rate" TO "authenticated";
GRANT ALL ON TABLE "public"."v_lead_conversion_rate" TO "service_role";



GRANT ALL ON TABLE "public"."v_mrr_monthly" TO "anon";
GRANT ALL ON TABLE "public"."v_mrr_monthly" TO "authenticated";
GRANT ALL ON TABLE "public"."v_mrr_monthly" TO "service_role";



GRANT ALL ON TABLE "public"."v_paid_conversion_30d" TO "anon";
GRANT ALL ON TABLE "public"."v_paid_conversion_30d" TO "authenticated";
GRANT ALL ON TABLE "public"."v_paid_conversion_30d" TO "service_role";



GRANT ALL ON TABLE "public"."v_radar_stats" TO "anon";
GRANT ALL ON TABLE "public"."v_radar_stats" TO "authenticated";
GRANT ALL ON TABLE "public"."v_radar_stats" TO "service_role";



GRANT ALL ON TABLE "public"."v_recent_admin_actions" TO "anon";
GRANT ALL ON TABLE "public"."v_recent_admin_actions" TO "authenticated";
GRANT ALL ON TABLE "public"."v_recent_admin_actions" TO "service_role";



GRANT ALL ON TABLE "public"."website_visits" TO "anon";
GRANT ALL ON TABLE "public"."website_visits" TO "authenticated";
GRANT ALL ON TABLE "public"."website_visits" TO "service_role";



GRANT ALL ON TABLE "public"."v_registration_conversion_30d" TO "anon";
GRANT ALL ON TABLE "public"."v_registration_conversion_30d" TO "authenticated";
GRANT ALL ON TABLE "public"."v_registration_conversion_30d" TO "service_role";



GRANT ALL ON TABLE "public"."v_revenue_by_plan" TO "anon";
GRANT ALL ON TABLE "public"."v_revenue_by_plan" TO "authenticated";
GRANT ALL ON TABLE "public"."v_revenue_by_plan" TO "service_role";



GRANT ALL ON TABLE "public"."v_security_stats" TO "anon";
GRANT ALL ON TABLE "public"."v_security_stats" TO "authenticated";
GRANT ALL ON TABLE "public"."v_security_stats" TO "service_role";



GRANT ALL ON TABLE "public"."v_user_usage" TO "anon";
GRANT ALL ON TABLE "public"."v_user_usage" TO "authenticated";
GRANT ALL ON TABLE "public"."v_user_usage" TO "service_role";



GRANT ALL ON TABLE "public"."vendedores_publicos" TO "anon";
GRANT ALL ON TABLE "public"."vendedores_publicos" TO "authenticated";
GRANT ALL ON TABLE "public"."vendedores_publicos" TO "service_role";



GRANT ALL ON TABLE "public"."vw_user_status" TO "anon";
GRANT ALL ON TABLE "public"."vw_user_status" TO "authenticated";
GRANT ALL ON TABLE "public"."vw_user_status" TO "service_role";



GRANT ALL ON TABLE "public"."webhook_logs" TO "anon";
GRANT ALL ON TABLE "public"."webhook_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."webhook_logs" TO "service_role";



GRANT ALL ON TABLE "public"."webhook_request_registry" TO "anon";
GRANT ALL ON TABLE "public"."webhook_request_registry" TO "authenticated";
GRANT ALL ON TABLE "public"."webhook_request_registry" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































