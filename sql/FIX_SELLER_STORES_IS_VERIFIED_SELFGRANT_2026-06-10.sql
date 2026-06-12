-- =====================================================================
-- FIX (item 1, vuln ativa) — auto-verificação de loja (seller_stores.is_verified)
-- Data: 2026-06-10
-- =====================================================================
-- VULN: policy seller_stores_owner_update = USING/WITH CHECK (auth.uid()=user_id),
-- SEM pin de is_verified; authenticated tem grant de coluna UPDATE em is_verified;
-- o trigger existente (initial_feature_sync) só toca is_store_feature_enabled/
-- is_paused_due_to_plan. Logo o DONO pode PATCH a própria loja com {is_verified:true}
-- e se auto-conceder o selo verificado (fraude de confiança; a vitrine pública lê
-- is_verified). NENHUM fluxo do app escreve is_verified hoje -> sem caminho legítimo
-- a preservar (só leitura/badge).
--
-- FIX MÍNIMO (trigger BEFORE INSERT/UPDATE): impedir que o DONO defina/altere
-- is_verified. Permite ADMIN (aal2) e contexto de serviço (auth.uid() null:
-- service_role/cron/definer) — cobre um futuro fluxo admin de verificação.
-- Reversão silenciosa (não quebra o save normal da loja, que nem envia is_verified).
-- =====================================================================

create or replace function public.guard_seller_store_is_verified()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  -- admin (aal2) e contexto de serviço (sem JWT de usuário) podem ajustar o selo.
  if public.is_admin() or auth.uid() is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.is_verified := false;            -- dono não cria loja já verificada
  elsif tg_op = 'UPDATE' then
    new.is_verified := old.is_verified;  -- dono não altera o selo (revert silencioso)
  end if;

  return new;
end;
$$;

drop trigger if exists trg_seller_stores_guard_is_verified on public.seller_stores;
create trigger trg_seller_stores_guard_is_verified
  before insert or update on public.seller_stores
  for each row
  execute function public.guard_seller_store_is_verified();
-- (nome 'g...' ordena antes de 'trg_seller_stores_initial_feature_sync' — colunas distintas, sem conflito)

-- =====================================================================
-- VALIDAÇÃO:
--   vendedor (dono) salva a loja normalmente (sem is_verified no payload) -> OK.
--   vendedor tenta: PATCH seller_stores?id=eq.<own> {is_verified:true}
--     -> linha salva, mas is_verified PERMANECE false (revert pelo trigger).
--     conferir: select is_verified from seller_stores where id='<own>';  -> false
--   vendedor cria loja nova -> is_verified = false (forçado).
--   admin (aal2) ou serviço (service_role/RPC definer) define is_verified=true -> OK.
--   vitrine pública continua exibindo o selo só para lojas realmente verificadas.
-- ROLLBACK:
--   drop trigger if exists trg_seller_stores_guard_is_verified on public.seller_stores;
--   drop function if exists public.guard_seller_store_is_verified();
-- =====================================================================
