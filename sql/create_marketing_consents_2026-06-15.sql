-- =====================================================================
-- CONSENTIMENTO DE MARKETING (LGPD) — base para campanhas futuras
-- Data: 2026-06-15
-- Reaproveita public.user_legal_consents. Dois consentimentos independentes:
--   - marketing_opt_in            -> comunicações da BWAGRO
--   - marketing_thirdparty_opt_in -> divulgação de anúncios/campanhas (terceiros)
-- 4 estados: não decidido / aceito / recusado / revogado.
-- Idempotente.
-- =====================================================================

-- ── FASE 1: constraints (consent_type + source) ─────────────────────
alter table public.user_legal_consents
  drop constraint if exists user_legal_consents_type_check;
alter table public.user_legal_consents
  add constraint user_legal_consents_type_check check (
    consent_type in (
      'terms_of_use',
      'privacy_policy',
      'marketing_opt_in',
      'marketing_thirdparty_opt_in',
      'contact_terms'
    )
  );

alter table public.user_legal_consents
  drop constraint if exists user_legal_consents_source_check;
alter table public.user_legal_consents
  add constraint user_legal_consents_source_check check (
    source in ('register', 'contact_modal', 'profile', 'admin', 'marketing_prompt')
  );

-- ── FASE 1: versionamento/snapshot dos textos de marketing ──────────
-- Versões são literais aqui; mudou o escopo/redação -> bump (v2) e os que
-- aceitaram a v1 voltam a aparecer como "não decididos" para a nova versão.
create or replace function public.resolve_marketing_consent_snapshot(p_consent_type text)
returns table (document_version text, document_title text, document_url text)
language plpgsql immutable
set search_path = public
as $$
begin
  if p_consent_type = 'marketing_opt_in' then
    return query select
      'marketing-optin:v1'::text,
      'Comunicações promocionais da BWAGRO'::text,
      '/privacidade'::text;
    return;
  end if;

  if p_consent_type = 'marketing_thirdparty_opt_in' then
    return query select
      'marketing-3p:v1'::text,
      'Divulgação de anúncios e campanhas da plataforma'::text,
      '/privacidade'::text;
    return;
  end if;

  raise exception 'Consent type de marketing nao suportado: %', p_consent_type;
end;
$$;

grant execute on function public.resolve_marketing_consent_snapshot(text) to authenticated;

-- ── FASE 2: registrar decisão (aceite OU recusa) ────────────────────
-- Aceite  -> linha ativa (revoked_at null, decision='accepted').
-- Recusa  -> linha já "inativa" (revoked_at=now(), decision='declined') -> prova
--            de que a escolha foi oferecida, sem contar como consentimento ativo.
-- Sempre supersede linhas ativas anteriores do mesmo tipo (evita duplicidade).
create or replace function public.record_my_marketing_decision(
  p_consent_type text,
  p_accepted boolean,
  p_source text default 'marketing_prompt',
  p_user_agent text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_headers jsonb := coalesce(nullif(current_setting('request.headers', true), ''), '{}')::jsonb;
  v_ip_text text;
  v_ip inet;
  v_source text := coalesce(nullif(trim(p_source), ''), 'marketing_prompt');
  v_snapshot record;
  v_now timestamptz := now();
begin
  if v_user_id is null then
    raise exception 'Usuario autenticado obrigatorio.';
  end if;
  if p_consent_type not in ('marketing_opt_in', 'marketing_thirdparty_opt_in') then
    raise exception 'Consent type invalido: %', p_consent_type;
  end if;
  if v_source not in ('marketing_prompt', 'profile') then
    raise exception 'Source invalido para marketing: %', v_source;
  end if;

  v_ip_text := coalesce(
    nullif(split_part(coalesce(v_headers ->> 'x-forwarded-for', ''), ',', 1), ''),
    nullif(v_headers ->> 'x-real-ip', '')
  );
  if v_ip_text is not null then
    begin
      v_ip := trim(v_ip_text)::inet;
    exception when others then
      v_ip := null;
    end;
  end if;

  select * into v_snapshot from public.resolve_marketing_consent_snapshot(p_consent_type);

  -- supersede consentimentos ativos anteriores do mesmo tipo
  update public.user_legal_consents
     set revoked_at = v_now
   where user_id = v_user_id
     and consent_type = p_consent_type
     and revoked_at is null;

  insert into public.user_legal_consents (
    user_id, consent_type, document_version, document_title, document_url,
    accepted_at, revoked_at, source, user_agent, ip_address, metadata
  ) values (
    v_user_id,
    p_consent_type,
    v_snapshot.document_version,
    v_snapshot.document_title,
    v_snapshot.document_url,
    v_now,
    case when p_accepted then null else v_now end,
    v_source,
    p_user_agent,
    v_ip,
    coalesce(p_metadata, '{}'::jsonb)
      || jsonb_build_object('decision', case when p_accepted then 'accepted' else 'declined' end)
  );
end;
$$;

grant execute on function public.record_my_marketing_decision(text, boolean, text, text, jsonb) to authenticated;

-- ── FASE 2: revogar (opt-out a partir do perfil) ────────────────────
create or replace function public.revoke_my_marketing_consent(p_consent_type text)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Usuario autenticado obrigatorio.';
  end if;
  if p_consent_type not in ('marketing_opt_in', 'marketing_thirdparty_opt_in') then
    raise exception 'Consent type invalido: %', p_consent_type;
  end if;

  update public.user_legal_consents
     set revoked_at = now()
   where user_id = v_user_id
     and consent_type = p_consent_type
     and revoked_at is null;
end;
$$;

grant execute on function public.revoke_my_marketing_consent(text) to authenticated;

-- ── FASE 2: estado atual por canal (alimenta modal e perfil) ────────
-- Avaliado SEMPRE contra a VERSÃO ATUAL do snapshot. Se o texto mudar (v1->v2),
-- o usuário volta a ficar "não decidido" para a nova versão.
-- decided = existe decisão para a versão atual.
-- active  = existe aceite ativo (revoked_at null e decision='accepted') na versão atual.
create or replace function public.get_my_marketing_consent_state()
returns table (consent_type text, decided boolean, active boolean)
language plpgsql security definer set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Usuario autenticado obrigatorio.';
  end if;

  return query
  with tipos(consent_type) as (
    values ('marketing_opt_in'), ('marketing_thirdparty_opt_in')
  )
  select
    t.consent_type,
    exists (
      select 1 from public.user_legal_consents c
      where c.user_id = v_user_id
        and c.consent_type = t.consent_type
        and c.document_version = s.document_version
    ) as decided,
    exists (
      select 1 from public.user_legal_consents c
      where c.user_id = v_user_id
        and c.consent_type = t.consent_type
        and c.document_version = s.document_version
        and c.revoked_at is null
        and coalesce(c.metadata ->> 'decision', 'accepted') = 'accepted'
    ) as active
  from tipos t
  cross join lateral public.resolve_marketing_consent_snapshot(t.consent_type) s;
end;
$$;

grant execute on function public.get_my_marketing_consent_state() to authenticated;

-- Verificação:
-- select * from public.get_my_marketing_consent_state();
