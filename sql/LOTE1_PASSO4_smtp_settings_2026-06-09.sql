-- =====================================================================
-- LOTE 1 — PASSO 4 (ordem de execução) — smtp_settings
-- Endurecer authz para is_admin()/aal2 + revogar anon
-- Data: 2026-06-09
-- =====================================================================
-- PRÉ-REQUISITO: aplicar ANTES o patch de app (services/emailService.ts) e
-- confirmar VITE_EMAIL_BACKEND_URL em produção/preview — para que o painel SMTP
-- já use o caminho server-side e não dependa de leitura/escrita direta da tabela.
--
-- smtp_settings: RLS já habilitada. Policy viva usa exists(...users.is_admin...)
-- INLINE (sem aal2). Trocar por public.is_admin() (exige MFA/aal2), alinhando ao
-- resto do sistema. Revogar anon (não tem o que fazer aqui). authenticated mantém
-- (a RLS gateia para admin aal2). Contém coluna 'password' -> nunca pública.
-- =====================================================================

begin;

drop policy if exists "Admins can manage smtp settings" on public.smtp_settings;
create policy "Admins can manage smtp settings"
  on public.smtp_settings
  for all
  to authenticated
  using (public.is_admin() = true)        -- exige aal2/MFA
  with check (public.is_admin() = true);

revoke all on table public.smtp_settings from anon;

commit;

-- VALIDAÇÃO:
--   admin com aal2: ler/salvar config + enviar e-mail de teste -> OK
--   admin sem aal2: acesso NEGADO (policy exige is_admin())
--   authenticated não-admin: select * from public.smtp_settings; -> [] / negado
--   anon: select -> NEGADO
--   pg_policies(smtp_settings): policy única com is_admin(); relrowsecurity=true; sem grant anon
--   App: com VITE_EMAIL_BACKEND_URL setada, painel usa /api/email/settings; nenhum
--        request a smtp_settings parte do browser.
--
-- ROLLBACK (volta à policy inline anterior — sem aal2):
--   drop policy if exists "Admins can manage smtp settings" on public.smtp_settings;
--   create policy "Admins can manage smtp settings" on public.smtp_settings
--     for all to authenticated
--     using (exists (select 1 from public.users where users.id = auth.uid() and users.is_admin = true))
--     with check (exists (select 1 from public.users where users.id = auth.uid() and users.is_admin = true));
--   -- (e, se necessário p/ algum fluxo legado, regrant a anon — NÃO recomendado)
-- =====================================================================
