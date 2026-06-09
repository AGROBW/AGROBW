-- =====================================================================
-- CLEANUP least-privilege — frente site_popups (popup público vs admin)
-- Data: 2026-06-09
-- =====================================================================
-- Modelo: grant por role (anon/authenticated) + RLS gateando por usuário
-- (is_admin()/aal2). Admin == role authenticated; a RLS protege escrita.
-- service_role intocado (bypassa RLS; usado por edge/admin server).
--
-- Objetivo: remover grants amplos (DML/TRUNCATE/REFERENCES/TRIGGER) que
-- sobraram em anon/authenticated nestes 3 objetos, mantendo:
--   - popup público lendo só o necessário (site_popups)
--   - telemetria pública (INSERT em site_popup_events)
--   - métricas admin-only (view site_popup_metrics) p/ painel
-- e eliminando o 401 no caminho anônimo (o hook público já não consulta a view).
--
-- RESÍDUO ACEITO (melhoria futura, NÃO bloqueia esta frente):
--   authenticated mantém SELECT na view agregada site_popup_metrics, então
--   qualquer usuário logado (não só admin) pode ler os agregados (counts,
--   sem PII). Fechamento 100% exigiria recriar a view com security_invoker=true
--   apoiada na RLS admin-only de site_popup_events — alteração separada, fora
--   deste lote por decisão de escopo.
--
-- ⚠️ ANTES DE APLICAR: capturar o estado atual p/ rollback:
--   select table_name, grantee, privilege_type
--   from information_schema.role_table_grants
--   where table_schema='public'
--     and table_name in ('site_popups','site_popup_events','site_popup_metrics')
--     and grantee in ('anon','authenticated')
--   order by table_name, grantee, privilege_type;
--
-- NÃO aplicar automaticamente. Idempotente.
-- =====================================================================

begin;

-- ── site_popups: público lê ativos; authenticated (=admin via RLS) gerencia ──
revoke all on table public.site_popups from anon, authenticated;
grant select on table public.site_popups to anon;                  -- RLS: is_active OR is_admin
grant select, insert, update, delete on table public.site_popups
  to authenticated;                                                -- RLS "Admins can manage" gateia escrita

-- ── site_popup_events: só INSERT (telemetria). Leitura = admin-only via RLS/view ──
revoke all on table public.site_popup_events from anon, authenticated;
grant insert on table public.site_popup_events to anon;            -- recordSitePopupEvent (anônimo)
grant insert on table public.site_popup_events to authenticated;   -- recordSitePopupEvent (logado)
-- (sem SELECT: admin lê agregado pela view; policy "Admins can view" cobre leitura direta eventual)

-- ── site_popup_metrics (VIEW agregada): só admin panel (authenticated) lê ──
revoke all on table public.site_popup_metrics from anon, authenticated;
grant select on table public.site_popup_metrics to authenticated;  -- useSitePopups (painel)
-- (anon: nenhum grant — caminho público não consulta mais a view)

commit;

-- =====================================================================
-- VERIFICAÇÃO (rodar após o commit)
-- =====================================================================
-- Esperado:
--   site_popups        | anon          | SELECT
--   site_popups        | authenticated | SELECT, INSERT, UPDATE, DELETE
--   site_popup_events  | anon          | INSERT
--   site_popup_events  | authenticated | INSERT
--   site_popup_metrics | authenticated | SELECT
--   (anon NÃO deve aparecer para site_popup_metrics)
--
-- select table_name, grantee, privilege_type
-- from information_schema.role_table_grants
-- where table_schema='public'
--   and table_name in ('site_popups','site_popup_events','site_popup_metrics')
--   and grantee in ('anon','authenticated')
-- order by table_name, grantee, privilege_type;
--
-- ROLLBACK (emergência — volta ao estado amplo anterior):
--   grant all on table public.site_popups        to anon, authenticated;
--   grant all on table public.site_popup_events  to anon, authenticated;
--   grant all on table public.site_popup_metrics to anon, authenticated;
-- (ou reconceda exatamente conforme a captura pré-aplicação)
-- =====================================================================
