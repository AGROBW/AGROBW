-- =====================================================================
-- LOTE 2A — PASSO 1 — DROP smtp_config (tabela legada, vazia, RLS off)
-- Data: 2026-06-10
-- =====================================================================
-- smtp_config: RLS off + grants amplos anon/authenticated, contém
-- password_encrypted/user_email. Está VAZIA (0 linhas) e SEM consumidor vivo:
-- o app usa smtp_settings (services/emailService.ts, server, edge). É casca legada.
--
-- ⚠️ CONFIRMAR ANTES (deve dar 0 e nenhuma dependência):
--   select count(*) from public.smtp_config;                       -- esperado 0
--   select dependent.relname from pg_depend d
--     join pg_rewrite r on r.oid=d.objid
--     join pg_class dependent on dependent.oid=r.ev_class
--     join pg_class src on src.oid=d.refobjid
--    where src.relname='smtp_config' and dependent.relname<>'smtp_config';  -- esperado vazio
-- =====================================================================

drop table if exists public.smtp_config;

-- =====================================================================
-- VALIDAÇÃO:
--   - app de e-mail continua OK (usa smtp_settings)
--   - select to_regclass('public.smtp_config');  -> NULL (tabela não existe)
--   - nenhum erro no painel SMTP / envio de e-mail
-- ROLLBACK (recriar casca vazia, NÃO recomendado — reabriria exposição):
--   recriar a partir de sql/create_smtp_settings.sql adaptado, ou restaurar do dump.
--   Como está vazia, não há perda de dado.
-- =====================================================================
