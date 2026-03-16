-- =====================================================
-- Função RPC para Buscar Credenciais do Mercado Pago
-- =====================================================
-- Esta função retorna as credenciais do MP de forma segura
-- Apenas usuários autenticados podem chamar via supabase.rpc()

CREATE OR REPLACE FUNCTION get_mp_credentials()
RETURNS TABLE (
  access_token TEXT,
  public_key TEXT,
  is_production BOOLEAN
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Verificar se usuário está autenticado
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthenticated';
  END IF;

  -- Retornar credenciais (sem o webhook_secret)
  RETURN QUERY
  SELECT 
    mp_access_token,
    mp_public_key,
    payment_settings.is_production
  FROM payment_settings
  WHERE id = '00000000-0000-0000-0000-000000000005'
  LIMIT 1;
END;
$$;

-- Conceder permissão para usuários autenticados
GRANT EXECUTE ON FUNCTION get_mp_credentials() TO authenticated;

-- =====================================================
-- Função RPC para Criar Log de Tentativa de Checkout
-- =====================================================
-- Registra quando um usuário tenta fazer checkout de um plano

CREATE OR REPLACE FUNCTION log_checkout_attempt(
  p_plan_id UUID,
  p_billing_cycle TEXT,
  p_amount NUMERIC
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_log_id UUID;
BEGIN
  -- Verificar se usuário está autenticado
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthenticated';
  END IF;

  -- Criar log na tabela de auditoria (se existir)
  -- Ajuste conforme sua estrutura de logs
  INSERT INTO admin_audit_logs (
    admin_id,
    action,
    resource_type,
    resource_id,
    new_value,
    reason
  ) VALUES (
    auth.uid(),
    'CHECKOUT_ATTEMPT',
    'PLAN',
    p_plan_id,
    jsonb_build_object(
      'billing_cycle', p_billing_cycle,
      'amount', p_amount,
      'timestamp', NOW()
    ),
    'Tentativa de checkout via Mercado Pago'
  )
  RETURNING id INTO v_log_id;

  RETURN v_log_id;
EXCEPTION
  WHEN OTHERS THEN
    -- Se a tabela não existir ou houver erro, apenas retornar UUID aleatório
    RETURN gen_random_uuid();
END;
$$;

GRANT EXECUTE ON FUNCTION log_checkout_attempt(UUID, TEXT, NUMERIC) TO authenticated;

-- =====================================================
-- Visualização de Planos para Checkout
-- =====================================================
-- View otimizada para página de pricing (apenas campos necessários)

CREATE OR REPLACE VIEW public.pricing_plans_view AS
SELECT 
  id,
  name,
  description,
  position,
  is_active,
  is_popular,
  monthly_price,
  yearly_price,
  button_text,
  display_features,
  comparison,
  -- Metadados úteis para checkout
  max_ads,
  ad_duration_days,
  has_verification_badge,
  has_seller_store
FROM plans
WHERE is_active = true
ORDER BY position ASC;

-- RLS na view (público pode ver planos ativos)
ALTER VIEW pricing_plans_view OWNER TO postgres;
GRANT SELECT ON pricing_plans_view TO anon;
GRANT SELECT ON pricing_plans_view TO authenticated;

-- =====================================================
-- Comentários para Documentação
-- =====================================================

COMMENT ON FUNCTION get_mp_credentials() IS 'Retorna credenciais do Mercado Pago para usuários autenticados (sem webhook_secret)';
COMMENT ON FUNCTION log_checkout_attempt(UUID, TEXT, NUMERIC) IS 'Registra tentativa de checkout de um plano de assinatura';
COMMENT ON VIEW pricing_plans_view IS 'View otimizada de planos ativos para página de pricing';

-- =====================================================
-- Verificação
-- =====================================================

-- Testar função (substitua o ID por um plano real)
-- SELECT * FROM get_mp_credentials();
-- SELECT * FROM pricing_plans_view;
-- SELECT log_checkout_attempt('plan-id-aqui'::UUID, 'monthly', 99.90);
