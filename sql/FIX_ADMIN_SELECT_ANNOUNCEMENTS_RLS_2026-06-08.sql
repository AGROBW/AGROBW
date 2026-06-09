-- =====================================================================
-- FIX — Admin (aal2) deve poder ler QUALQUER anúncio via REST direto
-- Data: 2026-06-08
-- =====================================================================
-- BUG: a aba de EDIÇÕES do painel carrega o anúncio original por query direta em
-- public.announcements (ModerationQueue: fetchAnnouncementsMap / refresh). A única
-- policy de SELECT é:
--   select_announcements USING (status='ACTIVE' OR auth.uid()=user_id)
-- Logo, um anúncio PENDING de OUTRO usuário é INVISÍVEL ao admin via REST direto
-- -> request.announcement vem null -> "Anúncio original não encontrado" ao aprovar
-- a edit-request, e "Anúncio indisponível" no card. (A aba de anúncios funciona
-- porque usa a RPC SECURITY DEFINER admin_list_moderation_queue_announcements.)
--
-- CORREÇÃO (raiz, mínima): policy de SELECT para ADMIN (aal2) ler todos os
-- anúncios. Resolve a exibição E a aprovação, sem mudar o app. Consistente com o
-- modelo (admin já lê tudo via RPCs definer). Risco baixo: só admin aal2; após o
-- CONTRACT, announcements.whatsapp nem existe mais.
--
-- ⚠️ VALIDAR ANTES (estado vivo das policies de SELECT em announcements):
--   select policyname, qual from pg_policies
--   where schemaname='public' and tablename='announcements' and cmd='SELECT';
--
-- NÃO aplicar automaticamente. Idempotente.
-- =====================================================================

begin;

drop policy if exists "admins_select_all_announcements" on public.announcements;
create policy "admins_select_all_announcements"
  on public.announcements
  for select
  to authenticated
  using (public.is_admin() = true);   -- is_admin() exige aal2

commit;

-- =====================================================================
-- VERIFICAÇÃO / TESTE
-- =====================================================================
-- a) policy criada:
-- select policyname, cmd, qual from pg_policies
-- where schemaname='public' and tablename='announcements' and policyname='admins_select_all_announcements';
--
-- b) admin (aal2) lê o anúncio PENDING de outro usuário (no app: aba Edições
--    deixa de mostrar "Anúncio indisponível"; aprovar a edição passa do guard
--    request.announcement):
--    select id, status, user_id from public.announcements
--    where id='04d0b294-eeec-4bd4-8706-ca2db9c0b9ed';   -- (logado como admin) retorna a linha
--
-- c) usuário comum NÃO ganhou acesso novo (a sua policy own/ACTIVE segue valendo;
--    is_admin()=false para não-admin) -> sem regressão de privacidade.
--
-- ROLLBACK: drop policy if exists "admins_select_all_announcements" on public.announcements;
-- =====================================================================
