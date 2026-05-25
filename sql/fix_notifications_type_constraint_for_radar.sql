-- =====================================================
-- FIX: Ampliar tipos permitidos em notifications
-- =====================================================
-- Necessario para suportar tipos usados pelo app, incluindo:
-- - radar_match
-- - plan_alert
-- - variacoes legadas em caixa alta
-- =====================================================

DO $$
DECLARE
  v_constraint_name text;
BEGIN
  SELECT conname
  INTO v_constraint_name
  FROM pg_constraint
  WHERE conrelid = 'public.notifications'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%type%';

  IF v_constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.notifications DROP CONSTRAINT %I', v_constraint_name);
  END IF;
END $$;

ALTER TABLE public.notifications
ADD CONSTRAINT notifications_type_check
CHECK (
  type IN (
    'new_message',
    'new_lead',
    'radar_match',
    'system',
    'plan_alert',
    'account_verification',
    'ad_edit_rejected',
    'SYSTEM',
    'SECURITY',
    'PROMO',
    'AD_STATUS',
    'NEW_MESSAGE'
  )
);

COMMENT ON CONSTRAINT notifications_type_check ON public.notifications IS
'Tipos de notificacao permitidos pelo app, incluindo radar e tipos legados.';
