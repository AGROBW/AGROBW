-- =====================================================================
-- LOTE 2C — Diagnóstico READ-ONLY: policies/with_check de colunas sensíveis
-- Data: 2026-06-10 | NÃO altera nada. Rodar bloco a bloco e colar a saída.
-- Foco: users (is_admin/role/credits), segredos (fiscal_settings,
-- news_social_settings), financeiras (payments, user_subscriptions, invoices).
-- Contexto app: admin altera users.role/is_admin via .from('users').update()
-- DIRETO (authenticated) -> a ÚNICA barreira contra auto-promoção é o WITH CHECK
-- da policy de UPDATE de users. ESTE é o item crítico do lote.
-- =====================================================================

-- =====================================================================
-- BLOCO A — users: policies COMPLETAS (cmd, roles, using, with_check)
-- =====================================================================
select
  policyname, cmd, roles, permissive,
  qual       as using_expr,
  with_check as check_expr
from pg_policies
where schemaname='public' and tablename='users'
order by cmd, policyname;
-- LEITURA CRÍTICA:
--   Procurar a policy de UPDATE para {authenticated}/{public}. O WITH CHECK dela
--   precisa IMPEDIR que um usuário comum altere role/is_admin/credits do próprio
--   registro. Sinais SEGUROS (qualquer um destes no with_check da policy "own"):
--     - role = (select role from users where id = auth.uid())  -- pin do valor antigo
--     - is_admin = (select is_admin from ...)
--     - is_admin() = true  (só admin altera essas colunas)  [se via policy admin separada]
--     - referência a coluna OLD via trigger (ver BLOCO E)
--   Sinal de ALERTA (VULNERÁVEL):
--     - policy UPDATE "own" com with_check = (id = auth.uid()) APENAS, sem pin de
--       role/is_admin/credits -> usuário comum faz PATCH users?id=eq.<self>
--       {is_admin:true} e ESCALA para admin. CRÍTICO (vetor V1).

-- =====================================================================
-- BLOCO A2 — users: RLS on? grants? + triggers de proteção (escalonamento)
-- =====================================================================
select c.relrowsecurity as rls_on, c.relforcerowsecurity as rls_forced
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname='users';

select grantee, string_agg(privilege_type,', ' order by privilege_type) as privs
from information_schema.role_table_grants
where table_schema='public' and table_name='users' and grantee in ('anon','authenticated')
group by grantee order by grantee;

-- triggers em users (pode haver guard de escalonamento que pina role/is_admin)
select t.tgname, p.proname, pg_get_functiondef(p.oid) as func_def
from pg_trigger t
join pg_class c on c.oid=t.tgrelid
join pg_namespace n on n.oid=c.relnamespace
join pg_proc p on p.oid=t.tgfoid
where n.nspname='public' and c.relname='users' and not t.tgisinternal
order by t.tgname;
-- LEITURA: se existir trigger BEFORE UPDATE que rejeita mudança de is_admin/role/
--   credits por não-admin, ele complementa/substitui o pin no with_check. Avaliar.

-- =====================================================================
-- BLOCO B — Segredos/config: fiscal_settings + news_social_settings
-- =====================================================================
-- B1) policies
select tablename, policyname, cmd, roles, qual as using_expr, with_check as check_expr
from pg_policies
where schemaname='public' and tablename in ('fiscal_settings','news_social_settings')
order by tablename, cmd, policyname;
-- B2) RLS on?
select c.relname, c.relrowsecurity as rls_on
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in ('fiscal_settings','news_social_settings');
-- B3) grants
select table_name, grantee, string_agg(privilege_type,', ' order by privilege_type) as privs
from information_schema.role_table_grants
where table_schema='public' and table_name in ('fiscal_settings','news_social_settings')
  and grantee in ('anon','authenticated')
group by table_name, grantee order by table_name, grantee;
-- ALERTA: estas tabelas guardam provider_webhook_secret / *_access_token / cnpj.
--   Se RLS off OU policy permissiva (using/with_check 'true' ou só id=auth.uid()),
--   anon/authenticated lê/escreve segredo -> CRÍTICO (exfiltração/troca de token).
--   Esperado seguro: RLS on + policy admin-only (is_admin()) p/ TODO acesso;
--   edges leem via service_role (bypassa RLS).
-- Consumidores: useFiscalSettings (admin), useAdminNews (admin); edges service_role.

-- =====================================================================
-- BLOCO C — Financeiras: payments + user_subscriptions + invoices
-- =====================================================================
-- C1) policies
select tablename, policyname, cmd, roles, qual as using_expr, with_check as check_expr
from pg_policies
where schemaname='public' and tablename in ('payments','user_subscriptions','invoices')
order by tablename, cmd, policyname;
-- C2) RLS on?
select c.relname, c.relrowsecurity as rls_on
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in ('payments','user_subscriptions','invoices');
-- C3) grants
select table_name, grantee, string_agg(privilege_type,', ' order by privilege_type) as privs
from information_schema.role_table_grants
where table_schema='public' and table_name in ('payments','user_subscriptions','invoices')
  and grantee in ('anon','authenticated')
group by table_name, grantee order by table_name, grantee;
-- ALERTA: o desejado é SELECT só do DONO (user_id = auth.uid()) ou admin, e
--   ESCRITA só por service_role (webhooks/checkout). Se houver policy de UPDATE
--   to authenticated com check frouxo em amount/status/user_id -> usuário forja
--   pagamento/assinatura ATIVA sem pagar, ou altera valor. CRÍTICO (financeiro).
-- Consumidores: usePayments/useSubscription/useInvoices (leitura própria), admin
--   (UserManagement/PaymentsManagement leem), edges webhook-asaas/checkout/issue-nfse
--   (service_role escreve).

-- =====================================================================
-- BLOCO D — is_admin(): confirmar aal2 (MFA) — base de toda policy admin
-- =====================================================================
select pg_get_functiondef('public.is_admin()'::regprocedure) as is_admin_def;
-- LEITURA: confirmar checagem de aal2 no corpo (request.jwt 'aal'='aal2').

-- =====================================================================
-- BLOCO E — Funções SECURITY DEFINER que escrevem nestas tabelas
-- =====================================================================
select p.proname, p.prosecdef as security_definer, p.proconfig as config,
       has_function_privilege('anon', p.oid,'EXECUTE') as anon_exec,
       has_function_privilege('authenticated', p.oid,'EXECUTE') as auth_exec
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and (p.proname ~* '(user|role|admin|credit|payment|subscription|invoice|fiscal|promote|plan)')
order by p.prosecdef desc, p.proname;
-- LEITURA: RPCs definer chamáveis por authenticated que tocam role/is_admin/
--   credits/payments precisam checar is_admin()/owner no corpo. Capturar as
--   suspeitas: select pg_get_functiondef('public.<nome>(<args>)'::regprocedure);
--   (ex.: admin_update_user_plan_period — confirmar guard is_admin()).

-- =====================================================================
-- BLOCO F — (opcional) Secundárias do escopo 2C: flags/segredos extras
-- =====================================================================
select tablename, policyname, cmd, roles, qual as using_expr, with_check as check_expr
from pg_policies
where schemaname='public' and tablename in ('site_sponsors','seller_stores')
order by tablename, cmd, policyname;
-- ALERTA: seller_stores.is_verified e site_sponsors.email/phone/status escrevíveis
--   por authenticated; confirmar policy restringe a dono/admin (não auto-verificação).

-- =====================================================================
-- O QUE ME DEVOLVER: BLOCO A + A2 (prioridade máxima), B, C, E. D e F = contexto.
-- Com isso eu: priorizo por risco, confirmo o vetor real de exploração (sobretudo
-- auto-promoção em users e forja financeira), e proponho a correção MÍNIMA por
-- tabela (pin de coluna no with_check / policy admin-only / split SELECT-dono +
-- escrita service_role), sem quebrar os fluxos legítimos mapeados.
-- =====================================================================
