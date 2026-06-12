-- =====================================================================
-- ITEM B (hardening aal2) — cancel_subscription: alinhar ramo admin -> public.is_admin()
-- Data: 2026-06-10
-- =====================================================================
-- A função permite cancelar a assinatura ao DONO (auth.uid()=user_id) OU a admin.
-- O ramo admin era inline (role='admin') SEM aal2. Troca MÍNIMA: manter o ramo
-- OWNER e substituir o EXISTS inline por public.is_admin() (exige aal2/MFA).
-- Corpo preservado; só a condição de autorização muda.
-- =====================================================================

create or replace function public.cancel_subscription(p_subscription_id uuid)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE
  v_user_id UUID;
BEGIN
  -- Buscar user_id da assinatura
  SELECT user_id INTO v_user_id
  FROM user_subscriptions
  WHERE id = p_subscription_id;

  -- Verificar se o usuário pode cancelar (próprio OU admin/aal2)
  IF auth.uid() <> v_user_id AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized to cancel this subscription';
  END IF;

  -- Atualizar assinatura
  UPDATE user_subscriptions
  SET
    status = 'cancelled',
    cancelled_at = NOW()
  WHERE id = p_subscription_id;

  RETURN true;
END;
$function$;

-- =====================================================================
-- VALIDAÇÃO:
--   dono cancela a PRÓPRIA assinatura -> OK (auth.uid() = v_user_id).
--   admin COM aal2 cancela assinatura de OUTRO -> OK (public.is_admin()).
--   admin SEM aal2 -> negado ('Unauthorized to cancel this subscription').
--   não-dono não-admin -> negado.
--   OBS: auth.uid() <> v_user_id usa <> (era !=); semântica idêntica em SQL.
-- ROLLBACK: re-aplicar a definição viva original (ramo admin inline role='admin').
-- =====================================================================
