-- =====================================================================
-- CAMPANHA DE LOJA PARCEIRA — FASE 4.1 (suporte)
-- Data: 2026-06-15
-- Função para o worker revalidar consentimento ATUAL no momento do envio.
-- Usa a versão vigente do snapshot (re-pergunta se o texto mudar).
-- Idempotente.
-- =====================================================================

create or replace function public.is_marketing_consent_active(
  p_user_id uuid,
  p_consent_type text
)
returns boolean
language sql security definer set search_path = public
as $$
  select exists (
    select 1
    from public.user_legal_consents c
    cross join lateral public.resolve_marketing_consent_snapshot(p_consent_type) s
    where c.user_id = p_user_id
      and c.consent_type = p_consent_type
      and c.document_version = s.document_version
      and c.revoked_at is null
      and coalesce(c.metadata ->> 'decision', 'accepted') = 'accepted'
  );
$$;

revoke all on function public.is_marketing_consent_active(uuid, text) from public, anon;
grant execute on function public.is_marketing_consent_active(uuid, text) to service_role;
