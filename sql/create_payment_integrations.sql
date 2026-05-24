-- ==================================================
-- TABELAS PARA INTEGRACOES DE PAGAMENTO
-- ==================================================
-- payment_settings: Credenciais do gateway de pagamento (singleton)
-- webhook_logs: Logs de webhooks recebidos (debug)
-- ==================================================

-- ==================================================
-- TABELA: payment_settings (Singleton)
-- ==================================================

CREATE TABLE IF NOT EXISTS public.payment_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Credenciais Stripe
  stripe_secret_key TEXT,
  stripe_publishable_key TEXT,
  stripe_webhook_secret TEXT,

  -- Rollout controlado
  preferred_checkout_provider TEXT NOT NULL DEFAULT 'stripe'
    CHECK (preferred_checkout_provider IN ('stripe')),
  stripe_rollout_mode TEXT NOT NULL DEFAULT 'all_customers'
    CHECK (stripe_rollout_mode IN ('all_customers', 'new_customers')),

  -- Ambiente
  is_production BOOLEAN NOT NULL DEFAULT false,

  -- Metadata
  last_updated_by UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Garantir apenas 1 registro (singleton)
  CONSTRAINT single_row CHECK (id = '00000000-0000-0000-0000-000000000005')
);

COMMENT ON TABLE public.payment_settings IS 'Configuracoes de integracao com o gateway de pagamento (singleton)';
COMMENT ON COLUMN public.payment_settings.stripe_secret_key IS 'Secret Key da Stripe (sensivel)';
COMMENT ON COLUMN public.payment_settings.stripe_publishable_key IS 'Publishable Key da Stripe';
COMMENT ON COLUMN public.payment_settings.stripe_webhook_secret IS 'Secret para validar webhooks da Stripe (sensivel)';
COMMENT ON COLUMN public.payment_settings.preferred_checkout_provider IS 'Gateway operacional principal do checkout';
COMMENT ON COLUMN public.payment_settings.stripe_rollout_mode IS 'Controla se a Stripe atende toda a base ou apenas contas sem historico pago';
COMMENT ON COLUMN public.payment_settings.is_production IS 'false = Sandbox, true = Producao';

-- ==================================================
-- TABELA: webhook_logs
-- ==================================================

CREATE TABLE IF NOT EXISTS public.webhook_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Dados do webhook
  provider VARCHAR(50) NOT NULL DEFAULT 'stripe',
  event_type VARCHAR(100),
  payload JSONB NOT NULL,

  -- Resposta/Status
  status_code INT,
  processed BOOLEAN NOT NULL DEFAULT false,
  error_message TEXT,

  -- Metadata
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhook_logs_provider ON public.webhook_logs(provider);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_received_at ON public.webhook_logs(received_at DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_processed ON public.webhook_logs(processed);

COMMENT ON TABLE public.webhook_logs IS 'Logs de webhooks recebidos (debug e auditoria)';
COMMENT ON COLUMN public.webhook_logs.provider IS 'Provedor do webhook (stripe, legacy, etc)';
COMMENT ON COLUMN public.webhook_logs.event_type IS 'Tipo de evento do webhook';
COMMENT ON COLUMN public.webhook_logs.payload IS 'Payload completo do webhook';
COMMENT ON COLUMN public.webhook_logs.processed IS 'Se o webhook foi processado com sucesso';

-- ==================================================
-- TABELA: stripe_rollout_overrides
-- ==================================================

CREATE TABLE IF NOT EXISTS public.stripe_rollout_overrides (
  user_id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  reason TEXT,
  created_by UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stripe_rollout_overrides_created_at
  ON public.stripe_rollout_overrides(created_at DESC);

COMMENT ON TABLE public.stripe_rollout_overrides IS 'Allowlist operacional para liberar checkout Stripe a contas legadas especificas';
COMMENT ON COLUMN public.stripe_rollout_overrides.reason IS 'Observacao interna sobre a liberacao manual da conta legada';

-- ==================================================
-- TRIGGERS
-- ==================================================

CREATE OR REPLACE FUNCTION public.update_payment_settings_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_update_payment_settings_updated_at ON public.payment_settings;
CREATE TRIGGER trigger_update_payment_settings_updated_at
BEFORE UPDATE ON public.payment_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_payment_settings_updated_at();

CREATE OR REPLACE FUNCTION public.update_stripe_rollout_overrides_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_update_stripe_rollout_overrides_updated_at ON public.stripe_rollout_overrides;
CREATE TRIGGER trigger_update_stripe_rollout_overrides_updated_at
BEFORE UPDATE ON public.stripe_rollout_overrides
FOR EACH ROW
EXECUTE FUNCTION public.update_stripe_rollout_overrides_updated_at();

-- ==================================================
-- RLS: payment_settings
-- ==================================================

ALTER TABLE public.payment_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view payment settings" ON public.payment_settings;
DROP POLICY IF EXISTS "Admins can update payment settings" ON public.payment_settings;

-- Acesso direto do frontend a payment_settings deve permanecer bloqueado.
-- O painel admin deve usar RPCs seguras que nao devolvem os segredos brutos.

-- ==================================================
-- RLS: webhook_logs
-- ==================================================

ALTER TABLE public.webhook_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view webhook logs" ON public.webhook_logs;
DROP POLICY IF EXISTS "Service can insert webhook logs" ON public.webhook_logs;

CREATE POLICY "Admins can view webhook logs"
ON public.webhook_logs
FOR SELECT
TO authenticated
USING (public.is_admin() = true);

CREATE POLICY "Admins can delete webhook logs"
ON public.webhook_logs
FOR DELETE
TO authenticated
USING (public.is_admin() = true);

-- ==================================================
-- RLS: stripe_rollout_overrides
-- ==================================================

ALTER TABLE public.stripe_rollout_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view stripe rollout overrides" ON public.stripe_rollout_overrides;
DROP POLICY IF EXISTS "Admins can insert stripe rollout overrides" ON public.stripe_rollout_overrides;
DROP POLICY IF EXISTS "Admins can update stripe rollout overrides" ON public.stripe_rollout_overrides;
DROP POLICY IF EXISTS "Admins can delete stripe rollout overrides" ON public.stripe_rollout_overrides;

CREATE POLICY "Admins can view stripe rollout overrides"
ON public.stripe_rollout_overrides
FOR SELECT
TO authenticated
USING (public.is_admin() = true);

CREATE POLICY "Admins can insert stripe rollout overrides"
ON public.stripe_rollout_overrides
FOR INSERT
TO authenticated
WITH CHECK (public.is_admin() = true);

CREATE POLICY "Admins can update stripe rollout overrides"
ON public.stripe_rollout_overrides
FOR UPDATE
TO authenticated
USING (public.is_admin() = true)
WITH CHECK (public.is_admin() = true);

CREATE POLICY "Admins can delete stripe rollout overrides"
ON public.stripe_rollout_overrides
FOR DELETE
TO authenticated
USING (public.is_admin() = true);

-- ==================================================
-- DADOS INICIAIS: payment_settings
-- ==================================================

INSERT INTO public.payment_settings (
  id,
  stripe_secret_key,
  stripe_publishable_key,
  stripe_webhook_secret,
  preferred_checkout_provider,
  stripe_rollout_mode,
  is_production
) VALUES (
  '00000000-0000-0000-0000-000000000005',
  NULL,
  NULL,
  NULL,
  'stripe',
  'all_customers',
  false
) ON CONFLICT (id) DO NOTHING;

-- ==================================================
-- VERIFICACAO
-- ==================================================

SELECT
  table_name,
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('payment_settings', 'webhook_logs', 'stripe_rollout_overrides')
ORDER BY table_name, ordinal_position;
