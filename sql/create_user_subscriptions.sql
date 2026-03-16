-- =====================================================
-- Tabela de Assinaturas de Usuários
-- =====================================================
-- Esta tabela gerencia as assinaturas ativas dos usuários após checkout aprovado

-- Verificar se a tabela já existe
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'user_subscriptions'
  ) THEN

    -- Criar tabela
    CREATE TABLE public.user_subscriptions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      
      -- Relacionamentos
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      plan_id UUID NOT NULL REFERENCES plans(id) ON DELETE SET NULL,
      
      -- Detalhes da assinatura
      billing_cycle VARCHAR(20) NOT NULL CHECK (billing_cycle IN ('monthly', 'yearly')),
      status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'cancelled', 'expired', 'past_due')),
      
      -- Valores
      amount_paid NUMERIC(10, 2) NOT NULL,
      currency VARCHAR(3) DEFAULT 'BRL',
      
      -- Datas
      starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL,
      cancelled_at TIMESTAMPTZ,
      
      -- Pagamento (Mercado Pago)
      mp_payment_id VARCHAR(100),
      mp_preference_id VARCHAR(100),
      mp_external_reference VARCHAR(200),
      mp_status VARCHAR(50),
      mp_status_detail TEXT,
      
      -- Metadados
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      
      -- Índices únicos
      CONSTRAINT unique_active_subscription UNIQUE (user_id, plan_id, status)
    );

    -- Índices para performance
    CREATE INDEX idx_user_subscriptions_user_id ON user_subscriptions(user_id);
    CREATE INDEX idx_user_subscriptions_plan_id ON user_subscriptions(plan_id);
    CREATE INDEX idx_user_subscriptions_status ON user_subscriptions(status);
    CREATE INDEX idx_user_subscriptions_expires_at ON user_subscriptions(expires_at DESC);
    CREATE INDEX idx_user_subscriptions_mp_payment_id ON user_subscriptions(mp_payment_id);

    RAISE NOTICE 'Tabela user_subscriptions criada com sucesso';
  ELSE
    RAISE NOTICE 'Tabela user_subscriptions já existe';
  END IF;
END $$;

-- =====================================================
-- RLS (Row Level Security)
-- =====================================================

ALTER TABLE user_subscriptions ENABLE ROW LEVEL SECURITY;

-- Usuários podem ver apenas suas próprias assinaturas
DROP POLICY IF EXISTS "Users can view own subscriptions" ON user_subscriptions;
CREATE POLICY "Users can view own subscriptions"
ON user_subscriptions
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Admins podem ver todas as assinaturas
DROP POLICY IF EXISTS "Admins can view all subscriptions" ON user_subscriptions;
CREATE POLICY "Admins can view all subscriptions"
ON user_subscriptions
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid() AND role = 'admin'
  )
);

-- Service role pode inserir/atualizar (para webhook)
DROP POLICY IF EXISTS "Service can insert subscriptions" ON user_subscriptions;
CREATE POLICY "Service can insert subscriptions"
ON user_subscriptions
FOR INSERT
TO authenticated, anon
WITH CHECK (true);

DROP POLICY IF EXISTS "Service can update subscriptions" ON user_subscriptions;
CREATE POLICY "Service can update subscriptions"
ON user_subscriptions
FOR UPDATE
TO authenticated, anon
USING (true)
WITH CHECK (true);

-- Admins podem deletar assinaturas
DROP POLICY IF EXISTS "Admins can delete subscriptions" ON user_subscriptions;
CREATE POLICY "Admins can delete subscriptions"
ON user_subscriptions
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid() AND role = 'admin'
  )
);

-- =====================================================
-- Trigger para Updated_At
-- =====================================================

CREATE OR REPLACE FUNCTION update_user_subscriptions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_user_subscriptions_updated_at ON user_subscriptions;
CREATE TRIGGER trigger_update_user_subscriptions_updated_at
BEFORE UPDATE ON user_subscriptions
FOR EACH ROW
EXECUTE FUNCTION update_user_subscriptions_updated_at();

-- =====================================================
-- Função para Cancelar Assinatura
-- =====================================================

CREATE OR REPLACE FUNCTION cancel_subscription(p_subscription_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  -- Buscar user_id da assinatura
  SELECT user_id INTO v_user_id
  FROM user_subscriptions
  WHERE id = p_subscription_id;

  -- Verificar se o usuário pode cancelar (próprio ou admin)
  IF auth.uid() != v_user_id AND NOT EXISTS (
    SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'
  ) THEN
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
$$;

GRANT EXECUTE ON FUNCTION cancel_subscription(UUID) TO authenticated;

-- =====================================================
-- Função para Verificar Assinatura Ativa
-- =====================================================

CREATE OR REPLACE FUNCTION has_active_subscription(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_has_active BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM user_subscriptions
    WHERE user_id = p_user_id
      AND status = 'active'
      AND expires_at > NOW()
  ) INTO v_has_active;

  RETURN v_has_active;
END;
$$;

GRANT EXECUTE ON FUNCTION has_active_subscription(UUID) TO authenticated, anon;

-- =====================================================
-- Função para Obter Assinatura Ativa do Usuário
-- =====================================================

CREATE OR REPLACE FUNCTION get_active_subscription(p_user_id UUID)
RETURNS TABLE (
  id UUID,
  plan_id UUID,
  plan_name VARCHAR,
  billing_cycle VARCHAR,
  status VARCHAR,
  starts_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  amount_paid NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    s.id,
    s.plan_id,
    p.name AS plan_name,
    s.billing_cycle,
    s.status,
    s.starts_at,
    s.expires_at,
    s.amount_paid
  FROM user_subscriptions s
  JOIN plans p ON s.plan_id = p.id
  WHERE s.user_id = p_user_id
    AND s.status = 'active'
    AND s.expires_at > NOW()
  ORDER BY s.expires_at DESC
  LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION get_active_subscription(UUID) TO authenticated, anon;

-- =====================================================
-- Função para Processar Pagamento Aprovado (Webhook)
-- =====================================================

CREATE OR REPLACE FUNCTION process_approved_payment(
  p_mp_payment_id VARCHAR,
  p_mp_external_reference VARCHAR,
  p_amount NUMERIC,
  p_mp_status VARCHAR,
  p_mp_status_detail TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID;
  v_plan_id UUID;
  v_billing_cycle VARCHAR;
  v_subscription_id UUID;
  v_duration_days INT;
BEGIN
  -- Parsear external_reference (user_id|plan_id|billing_cycle)
  BEGIN
    v_user_id := (string_to_array(p_mp_external_reference, '|'))[1]::UUID;
    v_plan_id := (string_to_array(p_mp_external_reference, '|'))[2]::UUID;
    v_billing_cycle := (string_to_array(p_mp_external_reference, '|'))[3];
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Invalid external_reference format';
  END;

  -- Verificar se pagamento já foi processado
  IF EXISTS (
    SELECT 1 FROM user_subscriptions 
    WHERE mp_payment_id = p_mp_payment_id
  ) THEN
    RAISE NOTICE 'Payment already processed: %', p_mp_payment_id;
    RETURN NULL;
  END IF;

  -- Calcular duração
  v_duration_days := CASE 
    WHEN v_billing_cycle = 'monthly' THEN 30
    WHEN v_billing_cycle = 'yearly' THEN 365
    ELSE 30
  END;

  -- Criar assinatura
  INSERT INTO user_subscriptions (
    user_id,
    plan_id,
    billing_cycle,
    status,
    amount_paid,
    currency,
    starts_at,
    expires_at,
    mp_payment_id,
    mp_external_reference,
    mp_status,
    mp_status_detail
  ) VALUES (
    v_user_id,
    v_plan_id,
    v_billing_cycle,
    'active',
    p_amount,
    'BRL',
    NOW(),
    NOW() + (v_duration_days || ' days')::INTERVAL,
    p_mp_payment_id,
    p_mp_external_reference,
    p_mp_status,
    p_mp_status_detail
  )
  ON CONFLICT (user_id, plan_id, status) DO UPDATE
  SET
    expires_at = EXCLUDED.expires_at,
    updated_at = NOW()
  RETURNING id INTO v_subscription_id;

  -- Log de auditoria
  INSERT INTO admin_audit_logs (
    admin_id,
    action,
    resource_type,
    resource_id,
    new_value,
    reason
  ) VALUES (
    v_user_id,
    'SUBSCRIPTION_ACTIVATED',
    'SUBSCRIPTION',
    v_subscription_id,
    jsonb_build_object(
      'plan_id', v_plan_id,
      'billing_cycle', v_billing_cycle,
      'amount', p_amount,
      'mp_payment_id', p_mp_payment_id
    ),
    'Assinatura ativada via pagamento Mercado Pago'
  );

  RETURN v_subscription_id;
END;
$$;

-- Conceder permissão para service role e anon (webhook)
GRANT EXECUTE ON FUNCTION process_approved_payment(VARCHAR, VARCHAR, NUMERIC, VARCHAR, TEXT) TO authenticated, anon;

-- =====================================================
-- Job para Expirar Assinaturas Vencidas
-- =====================================================
-- Executar diariamente via pg_cron ou Supabase Edge Function

CREATE OR REPLACE FUNCTION expire_old_subscriptions()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_expired_count INTEGER;
BEGIN
  WITH expired AS (
    UPDATE user_subscriptions
    SET status = 'expired'
    WHERE status = 'active'
      AND expires_at < NOW()
    RETURNING id
  )
  SELECT COUNT(*) INTO v_expired_count FROM expired;

  RAISE NOTICE 'Expired % subscriptions', v_expired_count;
  RETURN v_expired_count;
END;
$$;

GRANT EXECUTE ON FUNCTION expire_old_subscriptions() TO authenticated;

-- =====================================================
-- Comentários para Documentação
-- =====================================================

COMMENT ON TABLE user_subscriptions IS 'Assinaturas de usuários dos planos de pagamento';
COMMENT ON FUNCTION cancel_subscription(UUID) IS 'Cancela uma assinatura (usuário ou admin)';
COMMENT ON FUNCTION has_active_subscription(UUID) IS 'Verifica se usuário tem assinatura ativa';
COMMENT ON FUNCTION get_active_subscription(UUID) IS 'Retorna assinatura ativa do usuário';
COMMENT ON FUNCTION process_approved_payment(VARCHAR, VARCHAR, NUMERIC, VARCHAR, TEXT) IS 'Processa pagamento aprovado do webhook do Mercado Pago';
COMMENT ON FUNCTION expire_old_subscriptions() IS 'Job para expirar assinaturas vencidas';

-- =====================================================
-- Verificação
-- =====================================================

-- Verificar estrutura
SELECT 
  column_name, 
  data_type, 
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'user_subscriptions'
ORDER BY ordinal_position;

-- Verificar políticas RLS
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual
FROM pg_policies
WHERE tablename = 'user_subscriptions';

-- Testar funções (ajuste os UUIDs)
-- SELECT has_active_subscription('user-uuid-aqui'::UUID);
-- SELECT * FROM get_active_subscription('user-uuid-aqui'::UUID);
-- SELECT expire_old_subscriptions();
