-- =====================================================================
-- LOTE 1 — PASSO 1 — v_critical_security_events (revoke puro)
-- Data: 2026-06-09 | View admin/ops SEM consumidor no app -> remover do
-- alcance de anon/authenticated. Leitura segue por service_role/admin.
-- =====================================================================
revoke all on table public.v_critical_security_events from anon, authenticated;

-- VALIDAÇÃO:
--   como anon e authenticated comum: select * from public.v_critical_security_events; -> NEGADO
--   como service_role/admin (canal próprio): retorna linhas
-- ROLLBACK (não recomendado): grant select on public.v_critical_security_events to authenticated; -- (e/ou anon)
