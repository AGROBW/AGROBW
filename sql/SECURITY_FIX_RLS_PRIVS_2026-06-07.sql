-- =====================================================================
-- SECURITY FIX — RLS / GRANTS HARDENING
-- Data: 2026-06-07
-- Autor: Auditoria AppSec (revisão obrigatória antes de aplicar)
-- =====================================================================
-- Corrige as vulnerabilidades CONFIRMADAS pela auditoria:
--   V1  Auto-promoção a admin (policy permissiva frouxa + WITH CHECK aberto)
--   V2  Auto-criação de assinatura paga (self-insert em user_subscriptions)
--   V3  Bypass de MFA admin via policies legadas sem aal2
--   V4  Insert forjado em admin_audit_logs (policy public WITH CHECK true)
--   V5  Privilégios excessivos para anon/authenticated (TRUNCATE etc.)
--
-- PRINCÍPIO: defesa em profundidade — corrige POLICY (RLS) e GRANTS.
-- NÃO altera grants de coluna do painel admin (admin escreve users como
-- authenticated e é liberado pela policy is_admin() com aal2).
--
-- COMO APLICAR:
--   1. Rode ANTES o backup/staging.
--   2. Execute este arquivo inteiro no Supabase SQL Editor.
--   3. Rode o bloco de VERIFICAÇÃO no final (comentado).
--   4. Reteste V1–V4 com conta comum e com admin aal1.
--
-- ROLLBACK: este script é destrutivo de POLICIES legadas. Tenha o dump
--   das policies atuais (pg_policies) salvo antes de rodar.
-- =====================================================================

begin;

-- =====================================================================
-- 0. FUNÇÕES DE AUTORIZAÇÃO — UNIFICAR EM aal2 (corrige V3)
--    Redefine as variantes legadas para exigir MFA (aal2), igualando
--    o comportamento de public.is_admin(). Como são SECURITY DEFINER e
--    o owner (postgres) é dono da tabela users (rls NOT forced), não há
--    recursão de RLS.
-- =====================================================================

create or replace function public.is_current_user_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.users u
    where u.id = auth.uid()
      and (coalesce(u.is_admin, false) = true or lower(coalesce(u.role, '')) = 'admin')
      and coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
  );
$$;

comment on function public.is_current_user_admin() is
'Admin somente com MFA (aal2). Unificado com is_admin() em 2026-06-07 (fix V3).';

create or replace function public.is_current_user_moderator()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.users u
    where u.id = auth.uid()
      and (
        lower(coalesce(u.role, '')) in ('admin', 'editor')
        or coalesce(u.is_admin, false) = true
      )
      and coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
  );
$$;

comment on function public.is_current_user_moderator() is
'Moderador (admin/editor) somente com MFA (aal2). Fix V3 (2026-06-07).';

-- Observação: public.is_admin() (sql) e public.site_analytics_is_admin()
-- já exigem aal2 — mantidas como estão.

-- =====================================================================
-- 1. TABELA users — REMOVER POLICIES DUPLICADAS/FROUXAS (corrige V1)
--    O problema: policies PERMISSIVAS são combinadas por OR. A policy
--    "users_update_own_data" (WITH CHECK id = auth.uid()) anulava a trava
--    de role/is_admin da policy segura. Consolidamos em UMA policy de
--    self-update que tranca TODAS as colunas sensíveis.
-- =====================================================================

-- Remover variantes redundantes/inseguras de UPDATE/SELECT/DELETE em users
drop policy if exists "users_update_own_data"        on public.users;  -- frouxa (V1)
drop policy if exists "Users can update their own data" on public.users; -- substituída
drop policy if exists "admins_update_all_users"      on public.users;  -- legada (aal2 agora vem da função, mas consolidamos)
drop policy if exists "users_select_own_data"        on public.users;  -- duplicada
drop policy if exists "admins_select_all_users"      on public.users;  -- duplicada
drop policy if exists "admins_delete_users"          on public.users;  -- legada (recriada com is_admin aal2)

-- SELECT: usuário vê o próprio registro
create policy "users_select_own"
  on public.users
  for select
  to authenticated
  using (auth.uid() = id);

-- SELECT: admin (aal2) vê todos  -- mantém a já existente "Admins can view all users"
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'users'
      and policyname = 'Admins can view all users'
  ) then
    execute $p$
      create policy "Admins can view all users"
        on public.users for select to authenticated
        using (public.is_admin() = true)
    $p$;
  end if;
end $$;

-- UPDATE: usuário atualiza o próprio perfil, MAS não pode alterar
-- colunas sensíveis (auto-promoção / auto-suspensão / créditos / plano).
-- IS NOT DISTINCT FROM trata NULL corretamente. A subquery dispara apenas
-- as policies de SELECT (não a de UPDATE) — sem recursão.
create policy "users_update_own_safe"
  on public.users
  for update
  to authenticated
  using (auth.uid() = id)
  with check (
    auth.uid() = id
    and role                   is not distinct from (select u.role                   from public.users u where u.id = auth.uid())
    and is_admin               is not distinct from (select u.is_admin               from public.users u where u.id = auth.uid())
    and is_suspended           is not distinct from (select u.is_suspended           from public.users u where u.id = auth.uid())
    and credits                is not distinct from (select u.credits                from public.users u where u.id = auth.uid())
    and plan                   is not distinct from (select u.plan                   from public.users u where u.id = auth.uid())
    and start_plan_consumed_at is not distinct from (select u.start_plan_consumed_at from public.users u where u.id = auth.uid())
  );

-- UPDATE: admin (aal2) pode alterar qualquer usuário  -- mantém "Admins can update any user"
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'users'
      and policyname = 'Admins can update any user'
  ) then
    execute $p$
      create policy "Admins can update any user"
        on public.users for update to authenticated
        using (public.is_admin() = true)
        with check (public.is_admin() = true)
    $p$;
  end if;
end $$;

-- DELETE: somente admin (aal2)
create policy "users_delete_admin_only"
  on public.users
  for delete
  to authenticated
  using (public.is_admin() = true);

-- INSERT no registro: mantém a policy existente enable_insert_for_registration
-- (CHECK auth.uid() = id). Nada a fazer aqui.

-- =====================================================================
-- 2. TABELA user_subscriptions — REMOVER SELF-INSERT (corrige V2)
--    Assinaturas são criadas pelo webhook (service_role, bypassa RLS) ou
--    por admin. Usuário comum não pode inserir/forjar a própria.
-- =====================================================================

drop policy if exists "Users can insert own subscriptions"   on public.user_subscriptions; -- V2
drop policy if exists "Admins can view all subscriptions"     on public.user_subscriptions; -- legada inline role (sem aal2)
drop policy if exists "Admins can delete subscriptions"       on public.user_subscriptions; -- legada inline role (sem aal2)
drop policy if exists "User subscriptions read"               on public.user_subscriptions; -- duplicada public

-- Mantidas (já com is_admin() aal2):
--   "Only admins can create subscriptions"  INSERT  CHECK is_admin()
--   "Only admins can delete subscriptions"  DELETE  USING is_admin()
--   "Admins can update subscriptions"       UPDATE  is_admin()
--   "Admin can view all subscriptions"      SELECT  is_admin()
--   "Users can view own subscriptions"      SELECT  auth.uid() = user_id

-- Garante leitura do próprio registro (idempotente)
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'user_subscriptions'
      and policyname = 'Users can view own subscriptions'
  ) then
    execute $p$
      create policy "Users can view own subscriptions"
        on public.user_subscriptions for select to authenticated
        using (auth.uid() = user_id)
    $p$;
  end if;
end $$;

-- =====================================================================
-- 3. TABELA admin_audit_logs — REMOVER INSERT PÚBLICO (corrige V4)
--    Inserts legítimos vêm de log_admin_action() (SECURITY DEFINER) e de
--    Edge Functions (service_role). Ninguém mais insere direto.
-- =====================================================================

drop policy if exists "system_insert_audit_logs" on public.admin_audit_logs; -- V4 (public, CHECK true)

-- Mantidas:
--   "Admins can insert audit logs"  INSERT  CHECK is_admin()         (aal2)
--   "admins_view_audit_logs"        SELECT  is_current_user_admin()  (agora aal2)

-- =====================================================================
-- 4. GRANTS — LEAST PRIVILEGE (corrige V5)
--    RLS não protege TRUNCATE; anon não deve escrever nada nessas tabelas.
--    NÃO removemos grants de tabelas públicas (announcements, plans, etc.)
--    para não quebrar o PostgREST do frontend.
-- =====================================================================

-- 4.1 anon: remover toda escrita nas tabelas sensíveis (mantém o modelo
--      Supabase; RLS já bloqueava leitura, isto é defesa em profundidade).
revoke insert, update, delete, truncate, references, trigger
  on public.users,
     public.payments,
     public.user_subscriptions,
     public.admin_audit_logs,
     public.payment_settings,
     public.admin_mfa_login_tickets,
     public.webhook_logs,
     public.security_events,
     public.user_highlight_booster_purchases
  from anon;

-- 4.1b anon: remover também SELECT nas tabelas exclusivamente administrativas
--      (RLS já nega, isto é defesa em profundidade e least privilege).
revoke select
  on public.admin_audit_logs,
     public.payment_settings,
     public.admin_mfa_login_tickets,
     public.webhook_logs,
     public.security_events
  from anon;

-- 4.2 authenticated: remover privilégios perigosos que a RLS NÃO gateia.
--      (TRUNCATE/REFERENCES/TRIGGER). INSERT/UPDATE/DELETE/SELECT seguem
--      gateados por RLS e são mantidos.
revoke truncate, references, trigger
  on public.users,
     public.payments,
     public.user_subscriptions,
     public.admin_audit_logs,
     public.payment_settings,
     public.admin_mfa_login_tickets,
     public.webhook_logs,
     public.security_events,
     public.user_highlight_booster_purchases
  from authenticated;

-- 4.3 payment_settings / admin_mfa_login_tickets:
--      acesso somente via service_role (Edge Functions). Nenhum hook/tela
--      do app lê estas tabelas direto (verificado em src/**). Remover
--      qualquer acesso de authenticated.
revoke select, insert, update, delete
  on public.payment_settings,
     public.admin_mfa_login_tickets
  from authenticated;

-- 4.4 webhook_logs: FLUXO LEGÍTIMO DO ADMIN.
--      O painel (src/hooks/useWebhookLogs.ts) faz SELECT e DELETE direto
--      como authenticated. Escrita (INSERT/UPDATE) é feita pelo webhook via
--      service_role (bypassa RLS). Portanto:
--        - authenticated mantém SELECT + DELETE (gateados por RLS admin aal2)
--        - authenticated PERDE INSERT/UPDATE (não usados pelo app)
--        - anon: nada (já revogado em 4.1/4.1b)
revoke insert, update on public.webhook_logs from authenticated;

-- Recriar policies de webhook_logs do zero (elimina qualquer policy legada
-- frouxa) — acesso somente admin com MFA (aal2).
do $$
declare
  pol record;
begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'webhook_logs'
  loop
    execute format('drop policy if exists %I on public.webhook_logs', pol.policyname);
  end loop;
end $$;

create policy "webhook_logs_admin_select"
  on public.webhook_logs
  for select
  to authenticated
  using (public.is_admin() = true);

create policy "webhook_logs_admin_delete"
  on public.webhook_logs
  for delete
  to authenticated
  using (public.is_admin() = true);

-- (sem policy de INSERT/UPDATE para authenticated — escrita só via service_role)

commit;

-- =====================================================================
-- 5. (OPCIONAL / HARDENING FUTURO) DEFAULT PRIVILEGES
--    Hoje toda tabela nova em public nasce com arwdDxtm para anon/auth.
--    Descomente para que tabelas FUTURAS exijam grant explícito.
--    ATENÇÃO: depois disto, toda tabela nova precisará de GRANT manual
--    para aparecer na API. Aplicar com a equipe ciente.
-- =====================================================================
-- alter default privileges in schema public
--   revoke all on tables from anon, authenticated;

-- =====================================================================
-- 6. VERIFICAÇÃO (rodar após o COMMIT) — todas devem refletir o esperado
-- =====================================================================
-- -- 6.1 Policies finais de users (não deve existir WITH CHECK frouxo p/ self-update):
-- select policyname, cmd, roles, qual, with_check
-- from pg_policies where schemaname='public' and tablename='users' order by cmd, policyname;
--
-- -- 6.2 user_subscriptions sem self-insert:
-- select policyname, cmd, roles, with_check
-- from pg_policies where schemaname='public' and tablename='user_subscriptions' and cmd='INSERT';
--
-- -- 6.3 admin_audit_logs sem insert público:
-- select policyname, cmd, roles, with_check
-- from pg_policies where schemaname='public' and tablename='admin_audit_logs' and cmd='INSERT';
--
-- -- 6.4 anon sem escrita / sem TRUNCATE em users:
-- select grantee, privilege_type from information_schema.role_table_grants
-- where table_schema='public' and table_name='users' and grantee in ('anon','authenticated')
-- order by grantee, privilege_type;
--
-- -- 6.5b webhook_logs: admin (aal2) lê/deleta; só 2 policies admin:
-- select policyname, cmd, roles, qual from pg_policies
-- where schemaname='public' and tablename='webhook_logs';
-- select grantee, privilege_type from information_schema.role_table_grants
-- where table_schema='public' and table_name='webhook_logs'
--   and grantee in ('anon','authenticated') order by grantee, privilege_type;
-- -- esperado: authenticated com SELECT e DELETE (sem INSERT/UPDATE); anon sem nada.
--
-- -- 6.5 funções de admin exigem aal2:
-- select proname, (position('aal' in prosrc)>0) as menciona_aal
-- from pg_proc p join pg_namespace n on n.oid=p.pronamespace
-- where n.nspname='public' and proname in
--   ('is_admin','is_current_user_admin','is_current_user_moderator','site_analytics_is_admin');
--
-- TESTES DE EXPLORAÇÃO (devem FALHAR agora):
--   #1 PATCH users?id=eq.<meu_id> {"role":"admin"}            => 0 linhas / erro CHECK
--   #2 POST  user_subscriptions {"user_id":<meu>,"status":"active"} => 403 / 0 linhas
--   #3 (admin aal1) GET users?select=*                         => 0 linhas
--   #4 POST  admin_audit_logs {...} (anon ou user comum)       => 403 / 0 linhas
-- =====================================================================
