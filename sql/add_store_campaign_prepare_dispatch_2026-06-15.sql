-- =====================================================================
-- CAMPANHA DE LOJA PARCEIRA — FASE 4 (preparar + disparar)
-- Data: 2026-06-15
-- Reaproveita a engine de newsletter. Adiciona:
--   A) audience_type 'marketing_thirdparty' em newsletter_campaigns
--   B) branch no admin_queue_newsletter_campaign com FILTRO DE CONSENTIMENTO
--      (marketing_thirdparty_opt_in ATIVO na versão atual)
--   C) RPC admin_prepare_store_campaign (cria a campanha a partir da aprovação)
--   D) trigger de sincronização de status (campanha -> solicitação)
-- Idempotente.
-- =====================================================================

-- ── A) audience_type ────────────────────────────────────────────────
alter table public.newsletter_campaigns
  drop constraint if exists newsletter_campaigns_audience_type_check;
alter table public.newsletter_campaigns
  add constraint newsletter_campaigns_audience_type_check
  check (audience_type in ('newsletter', 'platform_users', 'imported', 'marketing_thirdparty'));

-- ── B) queue com filtro de consentimento ────────────────────────────
create or replace function public.admin_queue_newsletter_campaign(p_campaign_id uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_campaign public.newsletter_campaigns%rowtype;
  v_inserted_count integer := 0;
begin
  -- Mantém o hardening aal2/MFA centralizado em public.is_admin() (sem checagem inline).
  if not public.is_admin() then
    raise exception 'Acesso administrativo necessario';
  end if;

  select * into v_campaign from public.newsletter_campaigns where newsletter_campaigns.id = p_campaign_id;
  if v_campaign.id is null then
    raise exception 'Campanha nao encontrada';
  end if;

  if v_campaign.audience_type = 'newsletter' then
    insert into public.newsletter_campaign_email_jobs (campaign_id, recipient_email, recipient_name, source)
    select v_campaign.id, lower(trim(ns.email)), null, 'newsletter'
    from public.newsletter_subscriptions ns
    where ns.status = 'active' and ns.email is not null and trim(ns.email) <> ''
    on conflict (campaign_id, recipient_email) do nothing;

  elsif v_campaign.audience_type = 'platform_users' then
    insert into public.newsletter_campaign_email_jobs (campaign_id, recipient_email, recipient_name, source)
    select v_campaign.id, lower(trim(u.email)), nullif(trim(u.name), ''), 'platform_user'
    from public.users u
    where u.email is not null and trim(u.email) <> '' and coalesce(u.is_suspended, false) = false
    on conflict (campaign_id, recipient_email) do nothing;

  elsif v_campaign.audience_type = 'marketing_thirdparty' then
    -- SOMENTE usuários com consentimento de terceiros ATIVO na versão ATUAL.
    -- Nunca "toda a base".
    insert into public.newsletter_campaign_email_jobs (campaign_id, recipient_email, recipient_name, source)
    select v_campaign.id, lower(trim(u.email)), nullif(trim(u.name), ''), 'platform_user'
    from public.users u
    where u.email is not null and trim(u.email) <> ''
      and coalesce(u.is_suspended, false) = false
      and exists (
        select 1
        from public.user_legal_consents c
        cross join lateral public.resolve_marketing_consent_snapshot('marketing_thirdparty_opt_in') s
        where c.user_id = u.id
          and c.consent_type = 'marketing_thirdparty_opt_in'
          and c.document_version = s.document_version
          and c.revoked_at is null
          and coalesce(c.metadata ->> 'decision', 'accepted') = 'accepted'
      )
    on conflict (campaign_id, recipient_email) do nothing;

  elsif v_campaign.audience_type = 'imported' then
    insert into public.newsletter_campaign_email_jobs (campaign_id, recipient_email, recipient_name, source)
    select v_campaign.id, lower(trim(imported.email)), null, 'imported'
    from (select distinct jsonb_array_elements_text(v_campaign.imported_emails) as email) imported
    where imported.email is not null and trim(imported.email) <> ''
    on conflict (campaign_id, recipient_email) do nothing;
  else
    raise exception 'Tipo de publico alvo invalido';
  end if;

  get diagnostics v_inserted_count = row_count;

  update public.newsletter_campaigns
  set status = case when exists (
        select 1 from public.newsletter_campaign_email_jobs jobs where jobs.campaign_id = v_campaign.id
      ) then 'queued' else 'failed' end,
      queued_at = now(),
      total_recipients = (select count(*) from public.newsletter_campaign_email_jobs jobs where jobs.campaign_id = v_campaign.id),
      updated_at = now()
  where public.newsletter_campaigns.id = v_campaign.id;

  return jsonb_build_object(
    'success', true,
    'campaign_id', v_campaign.id,
    'queued_now', v_inserted_count,
    'total_recipients', (select count(*) from public.newsletter_campaign_email_jobs jobs where jobs.campaign_id = v_campaign.id)
  );
end;
$$;

revoke all on function public.admin_queue_newsletter_campaign(uuid) from public;
grant execute on function public.admin_queue_newsletter_campaign(uuid) to authenticated;

-- ── C) preparar campanha a partir da aprovação ──────────────────────
create or replace function public.admin_prepare_store_campaign(
  p_request_id uuid,
  p_subject text,
  p_html text,
  p_preview text default null
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_admin uuid := auth.uid();
  v_req record;
  v_campaign_id uuid;
  v_claimed uuid;
begin
  if not public.is_admin() then
    raise exception 'Acesso administrativo necessario.';
  end if;
  if coalesce(trim(p_subject), '') = '' then
    raise exception 'Informe o assunto da campanha.';
  end if;
  if coalesce(trim(p_html), '') = '' then
    raise exception 'Informe o conteudo (HTML) da campanha.';
  end if;

  -- Claim atômico: só uma solicitação 'approved' pode virar 'preparing'.
  update public.seller_store_campaign_requests
     set status = 'preparing', reviewed_by = coalesce(reviewed_by, v_admin)
   where id = p_request_id and status = 'approved'
  returning id into v_claimed;

  if v_claimed is null then
    raise exception 'Solicitacao precisa estar aprovada para preparar a campanha.';
  end if;

  select * into v_req from public.seller_store_campaign_requests where id = p_request_id;

  insert into public.newsletter_campaigns (
    name, subject, preview_text, html_content, audience_type, status, created_by
  ) values (
    left('Loja Parceira - ' || coalesce(v_req.announcement_snapshot ->> 'title', 'anuncio'), 200),
    left(trim(p_subject), 200),
    nullif(left(trim(coalesce(p_preview, '')), 200), ''),
    p_html,
    'marketing_thirdparty',
    'draft',
    v_admin
  )
  returning id into v_campaign_id;

  update public.seller_store_campaign_requests
     set campaign_id = v_campaign_id
   where id = p_request_id;

  return v_campaign_id;
end;
$$;

revoke all on function public.admin_prepare_store_campaign(uuid, text, text, text) from public;
grant execute on function public.admin_prepare_store_campaign(uuid, text, text, text) to authenticated;

-- ── D) sincronização de status (campanha -> solicitação) ────────────
create or replace function public.sync_store_campaign_request_status()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  v_req_status text;
begin
  if NEW.status is distinct from OLD.status then
    v_req_status := case NEW.status
      when 'queued' then 'queued'
      when 'sending' then 'sending'
      when 'completed' then 'completed'
      when 'failed' then 'failed'
      else null
    end;

    if v_req_status is not null then
      update public.seller_store_campaign_requests
         set status = v_req_status
       where campaign_id = NEW.id
         and status in ('preparing', 'queued', 'sending'); -- só avança; não toca terminal/cancelada
    end if;
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_sync_store_campaign_status on public.newsletter_campaigns;
create trigger trg_sync_store_campaign_status
after update of status on public.newsletter_campaigns
for each row execute function public.sync_store_campaign_request_status();
