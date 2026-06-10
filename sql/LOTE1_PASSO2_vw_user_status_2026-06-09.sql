-- =====================================================================
-- LOTE 1 — PASSO 2 — vw_user_status (revoke puro)
-- Data: 2026-06-09 | View owner-rights de status/identidade. Único consumidor
-- é examples/hybrid-profiles-integration.tsx (NÃO produção) -> revogar.
-- =====================================================================
revoke all on table public.vw_user_status from anon, authenticated;

-- VALIDAÇÃO:
--   anon/authenticated: select * from public.vw_user_status; -> NEGADO
--   App de produção: sem regressão (nenhuma página real consome esta view)
-- ROLLBACK (não recomendado): grant select on public.vw_user_status to anon, authenticated;
