-- =====================================================================
-- LOTE 2B — FASE 1 — revogar TRUNCATE/REFERENCES/TRIGGER (anon + authenticated)
-- Data: 2026-06-10 | RISCO ZERO. PostgREST/supabase-js nunca usam esses privilégios.
-- =====================================================================
-- Remove de anon e authenticated a capacidade de TRUNCATE (apagar tabela inteira),
-- REFERENCES e TRIGGER em TODAS as tabelas public. Nenhum fluxo do app usa.
-- =====================================================================

revoke truncate, references, trigger on all tables in schema public from anon, authenticated;

-- Também fecha defaults futuros (novas tabelas não nascem com esses grants p/ anon/auth):
alter default privileges in schema public revoke truncate, references, trigger on tables from anon, authenticated;

-- =====================================================================
-- VALIDAÇÃO:
--   select grantee, count(*) from information_schema.role_table_grants
--   where table_schema='public' and grantee in ('anon','authenticated')
--     and privilege_type in ('TRUNCATE','REFERENCES','TRIGGER')
--   group by grantee;   -> esperado 0 linhas
--   Smoke test: app funciona normalmente (nada usa esses privilégios).
-- ROLLBACK (não recomendado):
--   grant truncate, references, trigger on all tables in schema public to anon, authenticated;
-- =====================================================================
