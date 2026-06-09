-- =====================================================================
-- FIX — Trigger de similaridade deve HONRAR o override do admin (P1)
-- Data: 2026-06-08
-- =====================================================================
-- BUG: ao aprovar um anúncio (admin_set_announcement_status -> status='ACTIVE',
-- publication_review_admin_override=true), o trigger de PUBLICAÇÃO honra o
-- override e mantém ACTIVE; porém o trigger trg_zzz_enforce_announcement_similarity_review
-- (roda POR ÚLTIMO, prefixo zzz) re-avalia similaridade e força status='PENDING'
-- SEM checar o override -> o anúncio volta para PENDING e a aprovação falha.
--
-- CORREÇÃO (mínima): só reverter para PENDING por similaridade quando NÃO houver
-- override do admin (= comportamento consistente com o trigger de publicação).
-- A retenção por similaridade segue valendo no fluxo normal (criação/edição sem
-- override). Editar conteúdo zera o override no trigger de publicação, então
-- edições continuam sujeitas à revisão.
--
-- ⚠️ VALIDAR ANTES contra a definição VIVA:
--    select pg_get_functiondef('public.enforce_announcement_similarity_review()'::regprocedure);
--    Se o corpo vivo divergir deste, aplique APENAS a mudança da condição
--    (adicionar: and coalesce(new.publication_review_admin_override,false)=false).
--
-- NÃO aplicar automaticamente. Idempotente (CREATE OR REPLACE).
-- =====================================================================

create or replace function public.enforce_announcement_similarity_review()
returns trigger
language plpgsql
set search_path to 'public'
as $$
declare
  review_signal record;
begin
  if coalesce(new.status, '') not in ('ACTIVE', 'active') then
    return new;
  end if;

  if new.user_id is null then
    return new;
  end if;

  -- P1: aprovação administrativa (override) vence a retenção por similaridade.
  if coalesce(new.publication_review_admin_override, false) = true then
    return new;
  end if;

  select *
    into review_signal
  from public.get_announcement_similarity_review_signal(
    new.user_id,
    new.title,
    new.category_id,
    new.city,
    new.state,
    new.price,
    case when tg_op = 'UPDATE' then new.id else null end
  )
  limit 1;

  if coalesce(review_signal.suspicious, false) then
    new.status := 'PENDING';
  end if;

  return new;
end;
$$;

-- =====================================================================
-- VERIFICAÇÃO / TESTE (ver seção de testes do plano)
-- =====================================================================
-- 1) confirmar que os 2 casos eram suspeitos (antes):
-- select s.* from public.get_announcement_similarity_review_signal(
--   a.user_id, a.title, a.category_id, a.city, a.state, a.price, a.id) s,
--   public.announcements a
-- where a.id in ('04d0b294-eeec-4bd4-8706-ca2db9c0b9ed','2b42f7e9-7471-4826-bbaf-6d588747961b');
--
-- 2) aprovar pelos painel (ou simular):
--   select * from public.admin_set_announcement_status('04d0b294-...','ACTIVE','teste');
--   -> status retornado deve ser 'ACTIVE'
--
-- 3) conferir persistência:
--   select id, status, publication_review_admin_override
--   from public.announcements
--   where id in ('04d0b294-...','2b42f7e9-...');   -- status='ACTIVE' nos dois
--
-- 4) regressão (regra ainda protege o fluxo normal): criar/editar um anúncio
--    suspeito SEM override -> deve cair em PENDING normalmente.
--
-- ROLLBACK: re-aplicar a versão ANTERIOR da função (sem o early-return de
-- override) — capture-a antes com pg_get_functiondef e guarde.
-- =====================================================================
