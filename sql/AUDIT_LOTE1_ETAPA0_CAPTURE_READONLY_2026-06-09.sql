-- =====================================================================
-- LOTE 1 — ETAPA 0 (CAPTURA READ-ONLY) p/ fundamentar os SQLs de correção
-- Data: 2026-06-09  | NÃO altera nada. Rodar bloco a bloco e colar a saída.
-- Alvos: vw_user_status, v_critical_security_events, v_recent_admin_actions,
--        chats_full, smtp_settings (+ tabelas-base).
-- =====================================================================

-- =====================================================================
-- BLOCO A — Definição viva das 4 views (pg_get_viewdef) + flags
-- =====================================================================
-- A1) Corpo das views (projeção real -> p/ recriar com security_invoker sem perder coluna)
select 'vw_user_status'             as view, pg_get_viewdef('public.vw_user_status'::regclass, true)             as definicao;
select 'v_critical_security_events' as view, pg_get_viewdef('public.v_critical_security_events'::regclass, true) as definicao;
select 'v_recent_admin_actions'     as view, pg_get_viewdef('public.v_recent_admin_actions'::regclass, true)     as definicao;
select 'chats_full'                 as view, pg_get_viewdef('public.chats_full'::regclass, true)                 as definicao;

-- A2) Flags por view: owner, security_invoker, exposição anon/authenticated
select
  c.relname                                              as view,
  pg_get_userbyid(c.relowner)                            as owner,
  ('security_invoker=true' = any(coalesce(c.reloptions, '{}'))) as security_invoker,
  has_table_privilege('anon',          c.oid, 'SELECT')  as anon_select,
  has_table_privilege('authenticated', c.oid, 'SELECT')  as auth_select
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('vw_user_status','v_critical_security_events','v_recent_admin_actions','chats_full')
order by c.relname;

-- A3) Colunas expostas por view (cruzar com colunas sensíveis: password, email, doc, user_id, is_admin...)
select table_name as view, ordinal_position as pos, column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name in ('vw_user_status','v_critical_security_events','v_recent_admin_actions','chats_full')
order by table_name, ordinal_position;

-- =====================================================================
-- BLOCO B — RLS habilitada nas tabelas-base + nas views-alvo
-- =====================================================================
select
  c.relname                  as objeto,
  case c.relkind when 'r' then 'tabela' when 'v' then 'view' when 'm' then 'matview' end as tipo,
  c.relrowsecurity           as rls_habilitada,
  c.relforcerowsecurity      as rls_forcada
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('users','security_events','admin_audit_logs','chats','messages','smtp_settings')
order by c.relname;
-- ALERTA: rls_habilitada=false em tabela-base com grant p/ anon/authenticated
--   -> security_invoker NA VIEW não adianta (a base não filtra) -> precisa ligar RLS.

-- =====================================================================
-- BLOCO C — Policies das tabelas-base + smtp_settings (roles + expressões)
-- =====================================================================
select
  tablename,
  policyname,
  cmd,
  roles,
  permissive,
  qual       as using_expr,
  with_check as check_expr
from pg_policies
where schemaname = 'public'
  and tablename in ('users','security_events','admin_audit_logs','chats','messages','smtp_settings')
order by tablename, cmd, policyname;
-- LEITURA:
--   chats/messages -> precisa de SELECT por usuário (buyer_id/seller_id = auth.uid())
--     p/ security_invoker em chats_full fechar o IDOR.
--   admin_audit_logs/security_events -> precisa de SELECT admin-only p/ as views
--     v_recent_admin_actions / v_critical_security_events ficarem admin-only via invoker.
--   smtp_settings -> confirmar se a policy viva usa is_admin() (aal2) ou exists(...is_admin col...).

-- =====================================================================
-- BLOCO D — Grants anon/authenticated nas tabelas-base + views-alvo
-- =====================================================================
select
  table_name,
  grantee,
  string_agg(privilege_type, ', ' order by privilege_type) as privilegios
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee in ('anon','authenticated')
  and table_name in (
    'users','security_events','admin_audit_logs','chats','messages','smtp_settings',
    'vw_user_status','v_critical_security_events','v_recent_admin_actions','chats_full'
  )
group by table_name, grantee
order by table_name, grantee;
-- ALERTA:
--   anon com SELECT em smtp_settings/chats_full/views admin -> revogar.
--   anon/authenticated com DML em smtp_settings -> só admin (RLS) deve gravar.

-- =====================================================================
-- BLOCO E — smtp_settings: confirmação viva (policy + grants + colunas sensíveis)
-- =====================================================================
-- E1) policy viva
select policyname, cmd, roles, qual as using_expr, with_check as check_expr
from pg_policies
where schemaname = 'public' and tablename = 'smtp_settings';

-- E2) grants vivos
select grantee, string_agg(privilege_type, ', ' order by privilege_type) as privilegios
from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'smtp_settings'
  and grantee in ('anon','authenticated','service_role')
group by grantee
order by grantee;

-- E3) colunas (confirmar que 'password' está na tabela e não deve sair p/ browser)
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'smtp_settings'
order by ordinal_position;

-- =====================================================================
-- BLOCO F — Impacto do endurecimento com is_admin()/aal2
-- =====================================================================
-- F1) definição viva de is_admin() -> confirmar que EXIGE aal2 (MFA)
select pg_get_functiondef('public.is_admin()'::regprocedure) as is_admin_def;
-- LEITURA: confirmar no corpo a checagem de aal2 (request.jwt / aal = 'aal2').
--   Se a policy de smtp_settings hoje usa exists(...is_admin col...) (sem aal2),
--   trocar p/ is_admin() ENDURECE: admin sem MFA perde acesso ao SMTP.

-- F2) (informativo) quantos admins existem e estado — dimensiona impacto operacional
select count(*) as total_admins
from public.users
where is_admin = true;
-- LEITURA: se houver admin que opera SMTP sem MFA hoje, ele precisará concluir o
--   enrollment de MFA p/ continuar. Decisão já tomada: endurecer é desejado.

-- =====================================================================
-- BLOCO G — (sem query) ITEM EXPLÍCITO DE APP NO LOTE 1
-- =====================================================================
-- Fallback client-side de credencial SMTP — services/emailService.ts:
--   getSMTPConfig()/saveSMTPConfig() usam backend SE VITE_EMAIL_BACKEND_URL setada;
--   CASO CONTRÁRIO fazem supabase.from('smtp_settings').select('*')/upsert(...) DIRETO
--   do browser (linhas ~44-48 e ~89-95), trazendo 'password' p/ o client.
-- AÇÃO DO LOTE 1 (app, não-SQL):
--   (a) garantir VITE_EMAIL_BACKEND_URL definida em produção; e
--   (b) remover/desabilitar o fallback client-side de leitura/escrita de credencial,
--       forçando o caminho server-side (backend/edge) -> senha nunca transita no browser.
-- VALIDAÇÃO: confirmar que NENHUM request a 'smtp_settings' parte do browser.
-- =====================================================================
