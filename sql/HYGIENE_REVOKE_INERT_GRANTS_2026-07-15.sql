-- =====================================================================
-- Higiene / least-privilege — revogar grants públicos INERTES
-- Data: 2026-07-15
-- =====================================================================
-- Contexto (Fase 2 auditada):
--   whatsapp_settings e quotations estão com RLS on + 0 policies (deny-all p/ anon/auth),
--   mas ainda têm grants de tabela sobrando (anon: SELECT; authenticated: SELECT/INSERT/UPDATE/DELETE).
--   Esses grants são INERTES hoje (a RLS deny-all bloqueia todas as linhas) -> sem risco aberto.
-- Objetivo: fechar o grant inerte (defense-in-depth), começando pelo objeto sensível.
-- Por que é seguro:
--   - Acesso legítimo NÃO depende desses grants:
--       * whatsapp_settings: frontend via RPC SECURITY DEFINER (roda como dono, não como o caller);
--         worker via service_role (bypassa RLS + grants próprios). Token nunca volta ao cliente.
--       * quotations: ÓRFÃ (sem view/trigger/consumidor no app); só service_role.
--   - Revogar anon/authenticated NÃO afeta service_role nem funções SECURITY DEFINER.
-- Padrão: preview -> commit (troque COMMIT por ROLLBACK na 1ª passada) -> validação -> rollback.
-- =====================================================================


-- =====================================================================
-- FASE A — whatsapp_settings (PRIMEIRO — guarda o access_token sensível)
-- =====================================================================
begin;

-- PREVIEW (antes): deve listar anon(SELECT) e authenticated(SELECT/INSERT/UPDATE/DELETE)
select grantee, string_agg(privilege_type, ', ' order by privilege_type) as privs
from information_schema.role_table_grants
where table_schema='public' and table_name='whatsapp_settings'
  and grantee in ('anon','authenticated')
group by grantee order by grantee;

revoke all on public.whatsapp_settings from anon, authenticated;

-- PREVIEW (depois): deve retornar 0 linhas
select grantee, string_agg(privilege_type, ', ' order by privilege_type) as privs
from information_schema.role_table_grants
where table_schema='public' and table_name='whatsapp_settings'
  and grantee in ('anon','authenticated')
group by grantee order by grantee;

-- 1ª passada: troque COMMIT por ROLLBACK para pré-visualizar. Conferido -> COMMIT.
commit;

-- VALIDAÇÃO PÓS-COMMIT (Fase A):
--   (1) grants: a consulta acima (depois) = 0 linhas.
--   (2) Painel admin de WhatsApp continua carregando (RPC get_whatsapp_settings_admin_safe -> OK,
--       pois é SECURITY DEFINER, não depende do grant do caller).
--   (3) Worker api/whatsapp/process-jobs.mjs (service_role) continua lendo settings -> OK.
-- ROLLBACK (Fase A) — restaura os grants exatos que existiam:
--   grant select on public.whatsapp_settings to anon;
--   grant select, insert, update, delete on public.whatsapp_settings to authenticated;


-- =====================================================================
-- FASE B — quotations (órfã; sem consumidor)
-- =====================================================================
begin;

-- PREVIEW (antes): anon(SELECT) e authenticated(SELECT/INSERT/UPDATE/DELETE)
select grantee, string_agg(privilege_type, ', ' order by privilege_type) as privs
from information_schema.role_table_grants
where table_schema='public' and table_name='quotations'
  and grantee in ('anon','authenticated')
group by grantee order by grantee;

revoke all on public.quotations from anon, authenticated;

-- PREVIEW (depois): 0 linhas
select grantee, string_agg(privilege_type, ', ' order by privilege_type) as privs
from information_schema.role_table_grants
where table_schema='public' and table_name='quotations'
  and grantee in ('anon','authenticated')
group by grantee order by grantee;

-- 1ª passada: ROLLBACK para pré-visualizar. Conferido -> COMMIT.
commit;

-- VALIDAÇÃO PÓS-COMMIT (Fase B):
--   (1) grants: 0 linhas.
--   (2) Nada no app quebra (tabela órfã; quotationService usa BCB API, não a tabela).
--   (3) Pipeline de cotações (edge, service_role) inalterado.
-- ROLLBACK (Fase B) — restaura os grants exatos:
--   grant select on public.quotations to anon;
--   grant select, insert, update, delete on public.quotations to authenticated;
-- =====================================================================
