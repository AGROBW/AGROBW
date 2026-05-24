-- =====================================================
-- Tabela de Assinaturas de Usuarios
-- =====================================================
-- Esta tabela gerencia as assinaturas ativas dos usuarios
-- apos checkout aprovado.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'user_subscriptions'
  ) THEN
    CREATE TABLE public.user_subscriptions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

      -- Relacionamentos
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      plan_id UUID NOT NULL REFERENCES plans(id) ON DELETE SET NULL,

      -- Detalhes da assinatura
      billing_cycle VARCHAR(20) NOT NULL CHECK (billing_cycle IN ('monthly', 'yearly')),
      status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'active', 'trialing', 'past_due', 'canceled', 'cancelled', 'expired')),
      provider VARCHAR(20) NOT NULL DEFAULT 'stripe'
        CHECK (provider IN ('stripe', 'legacy')),

      -- Valores
      amount_paid NUMERIC(10, 2) NOT NULL,
      currency VARCHAR(3) DEFAULT 'BRL',

      -- Datas
      starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL,
      cancelled_at TIMESTAMPTZ,

      -- Identificadores genericos de gateway
      provider_customer_id VARCHAR(150),
      provider_subscription_id VARCHAR(150),
      provider_price_id VARCHAR(150),
      provider_checkout_session_id VARCHAR(150),

      -- Metadados
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),

      CONSTRAINT unique_active_subscription UNIQUE (user_id, plan_id, status)
    );

    CREATE INDEX idx_user_subscriptions_user_id ON user_subscriptions(user_id);
    CREATE INDEX idx_user_subscriptions_plan_id ON user_subscriptions(plan_id);
    CREATE INDEX idx_user_subscriptions_status ON user_subscriptions(status);
    CREATE INDEX idx_user_subscriptions_provider ON user_subscriptions(provider);
    CREATE INDEX idx_user_subscriptions_expires_at ON user_subscriptions(expires_at DESC);
    CREATE INDEX idx_user_subscriptions_provider_subscription_id ON user_subscriptions(provider_subscription_id);
    CREATE INDEX idx_user_subscriptions_provider_price_id ON user_subscriptions(provider_price_id);
    CREATE INDEX idx_user_subscriptions_provider_checkout_session_id ON user_subscriptions(provider_checkout_session_id);

    RAISE NOTICE 'Tabela user_subscriptions criada com sucesso';
  ELSE
    RAISE NOTICE 'Tabela user_subscriptions ja existe';
  END IF;
END $$;

-- =====================================================
-- RLS
-- =====================================================

ALTER TABLE user_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own subscriptions" ON user_subscriptions;
CREATE POLICY "Users can view own subscriptions"
ON user_subscriptions
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

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

DROP POLICY IF EXISTS "Only admins can create subscriptions" ON user_subscriptions;
CREATE POLICY "Only admins can create subscriptions"
ON user_subscriptions
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid() AND role = 'admin'
  )
);

DROP POLICY IF EXISTS "Admins can update subscriptions" ON user_subscriptions;
CREATE POLICY "Admins can update subscriptions"
ON user_subscriptions
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid() AND role = 'admin'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid() AND role = 'admin'
  )
);

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
-- Trigger para updated_at
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
-- Funcoes utilitarias
-- =====================================================

CREATE OR REPLACE FUNCTION cancel_subscription(p_subscription_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  SELECT user_id
    INTO v_user_id
  FROM user_subscriptions
  WHERE id = p_subscription_id;

  IF auth.uid() != v_user_id
     AND NOT EXISTS (
       SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'
     ) THEN
    RAISE EXCEPTION 'Unauthorized to cancel this subscription';
  END IF;

  UPDATE user_subscriptions
  SET
    status = 'cancelled',
    cancelled_at = NOW()
  WHERE id = p_subscription_id;

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION cancel_subscription(UUID) TO authenticated;

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
  )
  INTO v_has_active;

  RETURN v_has_active;
END;
$$;

GRANT EXECUTE ON FUNCTION has_active_subscription(UUID) TO authenticated, anon;

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
-- Comentarios
-- =====================================================

COMMENT ON TABLE user_subscriptions IS 'Assinaturas de usuarios dos planos de pagamento';
COMMENT ON FUNCTION cancel_subscription(UUID) IS 'Cancela uma assinatura (usuario ou admin)';
COMMENT ON FUNCTION has_active_subscription(UUID) IS 'Verifica se usuario tem assinatura ativa';
COMMENT ON FUNCTION get_active_subscription(UUID) IS 'Retorna assinatura ativa do usuario';
COMMENT ON FUNCTION expire_old_subscriptions() IS 'Job para expirar assinaturas vencidas';

-- =====================================================
-- Verificacao
-- =====================================================

SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'user_subscriptions'
ORDER BY ordinal_position;

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
