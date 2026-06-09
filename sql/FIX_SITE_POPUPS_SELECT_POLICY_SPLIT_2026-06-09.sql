-- =====================================================================
-- FIX — Separar policy pública x admin em site_popups (raiz do 401 anon)
-- Data: 2026-06-09
-- =====================================================================
-- ROOT: as DUAS policies de site_popups estavam TO public e chamavam is_admin():
--   "Public can view active site popups" : FOR SELECT USING (is_active OR is_admin())
--   "Admins can manage site popups"      : FOR ALL    USING (is_admin())  [pega SELECT tb]
-- anon NÃO tem EXECUTE em public.is_admin() -> avaliar a policy no SELECT do anon
-- dispara erro de permissão (401). Não queremos conceder EXECUTE de is_admin a anon.
--
-- CORREÇÃO (mínima e limpa): separar caminhos por ROLE.
--  1) policy pública: TO public, USING (is_active = true)  -- sem is_admin()
--  2) policy admin  : TO authenticated, FOR ALL USING/CHECK is_admin()
--     (admin é role authenticated e PODE executar is_admin(); cobre SELECT+escrita)
-- Resultado: anon nunca avalia is_admin(); admin (aal2) continua vendo/gerenciando tudo.
--
-- NÃO aplicar automaticamente. Idempotente.
-- =====================================================================

begin;

-- 1) Pública — só popups ativos, sem tocar em is_admin(). TO public (inclui anon).
drop policy if exists "Public can view active site popups" on public.site_popups;
create policy "Public can view active site popups"
  on public.site_popups
  for select
  to public
  using (is_active = true);

-- 2) Admin — gestão completa (SELECT incluso via FOR ALL). Só authenticated avalia is_admin().
drop policy if exists "Admins can manage site popups" on public.site_popups;
create policy "Admins can manage site popups"
  on public.site_popups
  for all
  to authenticated
  using (public.is_admin() = true)
  with check (public.is_admin() = true);

commit;

-- =====================================================================
-- VERIFICAÇÃO
-- =====================================================================
-- a) policies resultantes (roles e ausência de is_admin na pública):
-- select policyname, cmd, roles, qual, with_check
-- from pg_policies
-- where schemaname='public' and tablename='site_popups'
-- order by policyname;
--   esperado:
--     "Public can view active site popups" | SELECT | {public}        | (is_active = true)  | (null)
--     "Admins can manage site popups"      | ALL    | {authenticated} | (is_admin() = true) | (is_admin() = true)
--
-- b) anon NÃO ganhou EXECUTE de is_admin():
-- select has_function_privilege('anon','public.is_admin()','execute');  -- esperado: false
--
-- ROLLBACK (volta ao estado anterior — NÃO recomendado, reabre o 401):
--   drop policy if exists "Public can view active site popups" on public.site_popups;
--   create policy "Public can view active site popups" on public.site_popups
--     for select using ((is_active = true) or (public.is_admin() = true));
--   drop policy if exists "Admins can manage site popups" on public.site_popups;
--   create policy "Admins can manage site popups" on public.site_popups
--     using ((public.is_admin() = true)) with check ((public.is_admin() = true));
-- =====================================================================
