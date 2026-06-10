-- =====================================================================
-- LOTE 2B — FASE 2A — revogar UPDATE/DELETE de ANON (todas as tabelas)
-- Data: 2026-06-10 | RISCO ZERO. anon NUNCA atualiza/apaga linha legitimamente.
-- =====================================================================
-- Flows anônimos legítimos são só INSERT (telemetria/forms). Contatar vendedor
-- exige login (ContactSellerModal: if(!user)). Logo anon UPDATE/DELETE não tem
-- caso de uso em nenhuma tabela -> revogar globalmente.
-- =====================================================================

revoke update, delete on all tables in schema public from anon;

-- Fecha defaults futuros para anon (mantém só o necessário; INSERT tratado na Fase 2B):
alter default privileges in schema public revoke update, delete on tables from anon;

-- =====================================================================
-- VALIDAÇÃO:
--   select count(*) from information_schema.role_table_grants
--   where table_schema='public' and grantee='anon' and privilege_type in ('UPDATE','DELETE');
--   -> esperado 0
--   Smoke test anônimo (deslogado): navegação, busca, telemetria (popup/impressões),
--   forms públicos -> tudo OK (nenhum depende de UPDATE/DELETE anon).
-- ROLLBACK (não recomendado): grant update, delete on all tables in schema public to anon;
-- =====================================================================
