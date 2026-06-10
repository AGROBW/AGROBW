-- =====================================================================
-- AUDITORIA — Inventário READ-ONLY da superfície (views/grants/policies/RPCs)
-- Data: 2026-06-09  | Frente 1 (diagnóstico). NÃO altera nada.
-- Rodar bloco a bloco no Supabase (SQL editor) e colar a saída.
-- =====================================================================

-- =====================================================================
-- BLOCO 1 — Views e materialized views expostas (security_invoker / owner-rights)
-- =====================================================================
select
  n.nspname                                              as schema,
  c.relname                                              as objeto,
  case c.relkind when 'v' then 'view' when 'm' then 'matview' end as tipo,
  pg_get_userbyid(c.relowner)                            as owner,
  ('security_invoker=true' = any(coalesce(c.reloptions, '{}'))) as security_invoker,
  has_table_privilege('anon',          c.oid, 'SELECT')  as anon_select,
  has_table_privilege('authenticated', c.oid, 'SELECT')  as auth_select
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where c.relkind in ('v', 'm')
  and n.nspname = 'public'
order by anon_select desc, auth_select desc, security_invoker asc, c.relname;
-- SINAL DE ALERTA:
--   security_invoker = false  E  anon_select/auth_select = true
--   -> a view roda como OWNER (postgres) e IGNORA a RLS das tabelas-base.
--      Qualquer coluna/linha que a view exponha vaza para o role, sem RLS.
--   matview: nunca tem security_invoker -> se exposta, é sempre owner-rights.
-- PRIORIDADE:
--   CRÍTICO  = anon_select=true + security_invoker=false
--   ALTO     = auth_select=true + security_invoker=false
--   MÉDIO    = exposta mas security_invoker=true (ainda revisar colunas)

-- =====================================================================
-- BLOCO 2 — Grants anon/authenticated por tabela e view (largura do privilégio)
-- =====================================================================
select
  table_name,
  grantee,
  string_agg(privilege_type, ', ' order by privilege_type) as privilegios
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee in ('anon', 'authenticated')
group by table_name, grantee
order by table_name, grantee;
-- SINAL DE ALERTA:
--   anon com qualquer um de INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER
--     -> escrita pública (só a RLS te protege; se houver policy permissiva, abre).
--   authenticated com TRUNCATE/REFERENCES/TRIGGER -> supérfluo, remover.
--   SELECT amplo em tabela sensível para anon -> conferir se a RLS realmente filtra.
-- PRIORIDADE:
--   CRÍTICO = anon com DML (INSERT/UPDATE/DELETE) em tabela sensível
--   ALTO    = anon DML em tabela qualquer / authenticated DML onde não gerencia
--   MÉDIO   = TRUNCATE/REFERENCES/TRIGGER sobrando (limpeza least-privilege)

-- =====================================================================
-- BLOCO 3 — Column privileges relevantes (escrita em colunas sensíveis)
-- =====================================================================
select
  table_name,
  column_name,
  grantee,
  privilege_type
from information_schema.column_privileges
where table_schema = 'public'
  and grantee in ('anon', 'authenticated')
  and privilege_type in ('INSERT', 'UPDATE')
  and (
        column_name ~* '(role|is_admin|admin|status|price|user_id|owner|verified|premium|highlight|email|whatsapp|phone|document|cpf|cnpj|balance|credit)'
      )
order by table_name, column_name, grantee;
-- SINAL DE ALERTA:
--   anon/authenticated com UPDATE em colunas de autorização/identidade/dinheiro
--   (role, is_admin, status, price, user_id, is_verified, is_premium, highlight*)
--   -> vetor de auto-promoção / auto-aprovação / manipulação de preço/destaque.
--   (lembrar V1 desta auditoria: auto-promoção a admin por grant de coluna frouxo.)
-- PRIORIDADE:
--   CRÍTICO = UPDATE em role/is_admin/status/price/is_verified/is_premium/highlight*
--   ALTO    = UPDATE/INSERT em user_id/owner (troca de dono) ou PII (email/phone/doc)
--   MÉDIO   = demais colunas listadas (revisar caso a caso)

-- =====================================================================
-- BLOCO 4 — Policies por tabela (roles + expressões) + estado da RLS
-- =====================================================================
-- 4a) RLS habilitada por tabela
select
  c.relname                  as tabela,
  c.relrowsecurity           as rls_habilitada,
  c.relforcerowsecurity      as rls_forcada
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where c.relkind = 'r' and n.nspname = 'public'
order by c.relrowsecurity asc, c.relname;
-- ALERTA 4a: rls_habilitada=false numa tabela com grant para anon/authenticated
--   -> leitura/escrita SEM filtro de linha. CRÍTICO se houver dado sensível.

-- 4b) Policies, roles e expressões
select
  tablename,
  policyname,
  cmd,
  roles,
  permissive,
  qual        as using_expr,
  with_check  as check_expr
from pg_policies
where schemaname = 'public'
order by tablename, cmd, policyname;
-- SINAL DE ALERTA 4b:
--   roles = {public} numa policy de tabela sensível (inclui anon) -> revisar.
--   using/with_check com 'true' (sem filtro) em INSERT/SELECT -> fail-open.
--   policy PERMISSIVE duplicada na mesma tabela/cmd -> somam por OR e podem
--     anular uma policy restritiva (padrão que já corrigimos no Bloco 0/1).
-- PRIORIDADE:
--   CRÍTICO = policy 'true' de INSERT/SELECT em tabela sensível p/ public/anon
--   ALTO    = policies permissivas duplicadas que ampliam acesso
--   MÉDIO   = roles {public} onde {authenticated} bastaria (higiene)

-- =====================================================================
-- BLOCO 5 — Policies que chamam funções (risco de fail-open por role sem EXECUTE)
-- =====================================================================
select
  tablename,
  policyname,
  cmd,
  roles,
  qual       as using_expr,
  with_check as check_expr
from pg_policies
where schemaname = 'public'
  and (qual ~* '[a-z_]+\s*\(' or with_check ~* '[a-z_]+\s*\(')
order by tablename, policyname;
-- SINAL DE ALERTA:
--   policy com roles incluindo {public}/{anon} que chama is_admin() ou outra
--   função SECURITY DEFINER que o anon NÃO pode executar
--   -> avaliar a policy no acesso do anon dispara erro de permissão (o 401 de
--      site_popups que corrigimos). Sintoma: 401 no caminho público.
--   Conferir EXECUTE do role para cada função citada (ver query auxiliar abaixo).
-- AUXILIAR — has_function_privilege para uma função citada (ajuste o nome):
--   select
--     has_function_privilege('anon',          'public.is_admin()', 'execute') as anon_exec,
--     has_function_privilege('authenticated', 'public.is_admin()', 'execute') as auth_exec;
-- PRIORIDADE:
--   ALTO  = policy TO public/anon chamando função que anon não executa (401/quebra)
--   MÉDIO = policy chamando função sem search_path fixo (ver Bloco 6)

-- =====================================================================
-- BLOCO 6 — Funções SECURITY DEFINER na superfície pública
-- =====================================================================
select
  p.proname                                              as funcao,
  pg_get_userbyid(p.proowner)                            as owner,
  p.prosecdef                                            as security_definer,
  p.proconfig                                            as config,   -- procurar search_path=...
  has_function_privilege('anon',          p.oid, 'EXECUTE') as anon_exec,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_exec,
  pg_get_function_identity_arguments(p.oid)              as args
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.prosecdef = true
order by anon_exec desc, auth_exec desc, p.proname;
-- SINAL DE ALERTA:
--   security_definer=true + (anon_exec ou auth_exec)=true + config NULL
--   -> roda como owner (bypassa RLS), é chamável pelo público, e NÃO fixa
--      search_path -> risco de hijack de search_path E de authz interna fraca
--      (a função precisa checar is_admin()/auth.uid() no corpo).
--   Para cada candidata, capturar o corpo e revisar authz:
--     select pg_get_functiondef('public.NOME(ARGS)'::regprocedure);
-- PRIORIDADE:
--   CRÍTICO = definer + anon_exec + sem checagem interna de authz (ler corpo)
--   ALTO    = definer + auth_exec + authz interna ausente/fraca
--   MÉDIO   = definer + config sem search_path (mesmo com authz ok -> hardening)

-- =====================================================================
-- BLOCO 7 — Ranking automático de risco (views) — visão consolidada rápida
-- =====================================================================
-- Heurística para priorizar a saída do Bloco 1 sem inspeção manual.
select
  c.relname as objeto,
  case c.relkind when 'v' then 'view' when 'm' then 'matview' end as tipo,
  ('security_invoker=true' = any(coalesce(c.reloptions, '{}'))) as security_invoker,
  has_table_privilege('anon',          c.oid, 'SELECT') as anon_select,
  has_table_privilege('authenticated', c.oid, 'SELECT') as auth_select,
  case
    when has_table_privilege('anon', c.oid, 'SELECT')
         and not ('security_invoker=true' = any(coalesce(c.reloptions, '{}')))
      then 'CRITICO'
    when has_table_privilege('authenticated', c.oid, 'SELECT')
         and not ('security_invoker=true' = any(coalesce(c.reloptions, '{}')))
      then 'ALTO'
    when has_table_privilege('anon', c.oid, 'SELECT')
         or  has_table_privilege('authenticated', c.oid, 'SELECT')
      then 'MEDIO'
    else 'BAIXO'
  end as risco
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where c.relkind in ('v', 'm') and n.nspname = 'public'
order by
  case
    when has_table_privilege('anon', c.oid, 'SELECT')
         and not ('security_invoker=true' = any(coalesce(c.reloptions, '{}'))) then 0
    when has_table_privilege('authenticated', c.oid, 'SELECT')
         and not ('security_invoker=true' = any(coalesce(c.reloptions, '{}'))) then 1
    else 2
  end,
  c.relname;
-- LEITURA: as linhas 'CRITICO' são as views públicas owner-rights -> alvo #1.
--   Para cada CRITICO/ALTO, em seguida inspecionar as COLUNAS expostas:
--     select column_name from information_schema.columns
--     where table_schema='public' and table_name='<view>' order by ordinal_position;
--   e cruzar com colunas sensíveis (PII, user_id, flags de authz).
-- =====================================================================
