-- =====================================================================
-- FIX — restaurar EXECUTE p/ anon de get_announcement_report_snapshot
-- Data: 2026-06-08
-- =====================================================================
-- O R2 (revoke de EXECUTE de funções p/ anon) deixou de fora a
-- get_announcement_report_snapshot, que é chamada no AdDetailView para TODO
-- visitante (inclusive anon). Resultado: 401 ao abrir um anúncio como anon.
--
-- Classificação: ANON-SAFE. A função (SECURITY DEFINER) retorna apenas
-- community_reports_count (contagem pública já exibida) e user_has_reported
-- (=false p/ anon, pois auth.uid() é nulo). NÃO tem guarda de admin nem expõe
-- dados sensíveis. Antes do R2 anon já a executava.
--
-- NÃO aplicar automaticamente. Idempotente.
-- =====================================================================

do $$
declare r record;
begin
  for r in
    select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname='public' and p.proname='get_announcement_report_snapshot'
  loop
    execute format('grant execute on function %s to anon', r.oid::regprocedure);
  end loop;
end $$;

-- VERIFICAÇÃO:
-- select has_function_privilege('anon',
--   'public.get_announcement_report_snapshot(uuid)'::regprocedure, 'EXECUTE');  -- true
