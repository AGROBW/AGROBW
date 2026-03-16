-- ==================================================
-- TABELAS PARA INTEGRAÇÕES DE PAGAMENTO
-- ==================================================
-- payment_settings: Credenciais do Mercado Pago (singleton)
-- webhook_logs: Logs de webhooks recebidos (debug)
-- ==================================================

-- ==================================================
-- TABELA: payment_settings (Singleton)
-- ==================================================

CREATE TABLE IF NOT EXISTS public.payment_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Credenciais Mercado Pago
  mp_access_token TEXT,
  mp_public_key TEXT,
  mp_webhook_secret TEXT,
  
  -- Ambiente
  is_production BOOLEAN NOT NULL DEFAULT false,
  
  -- Metadata
  last_updated_by UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Garantir apenas 1 registro (singleton)
  CONSTRAINT single_row CHECK (id = '00000000-0000-0000-0000-000000000005')
);

COMMENT ON TABLE public.payment_settings IS 'Configurações de integração com Mercado Pago (singleton)';
COMMENT ON COLUMN public.payment_settings.mp_access_token IS 'Access Token do Mercado Pago (sensível)';
COMMENT ON COLUMN public.payment_settings.mp_public_key IS 'Public Key do Mercado Pago';
COMMENT ON COLUMN public.payment_settings.mp_webhook_secret IS 'Secret para validar webhooks (sensível)';
COMMENT ON COLUMN public.payment_settings.is_production IS 'false = Sandbox, true = Produção';

-- ==================================================
-- TABELA: webhook_logs
-- ==================================================

CREATE TABLE IF NOT EXISTS public.webhook_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Dados do webhook
  provider VARCHAR(50) NOT NULL DEFAULT 'mercadopago',
  event_type VARCHAR(100),
  payload JSONB NOT NULL,
  
  -- Resposta/Status
  status_code INT,
  processed BOOLEAN NOT NULL DEFAULT false,
  error_message TEXT,
  
  -- Metadata
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  
  -- Índices
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhook_logs_provider ON public.webhook_logs(provider);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_received_at ON public.webhook_logs(received_at DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_processed ON public.webhook_logs(processed);

COMMENT ON TABLE public.webhook_logs IS 'Logs de webhooks recebidos (debug e auditoria)';
COMMENT ON COLUMN public.webhook_logs.provider IS 'Provedor do webhook (mercadopago, stripe, etc)';
COMMENT ON COLUMN public.webhook_logs.event_type IS 'Tipo de evento do webhook';
COMMENT ON COLUMN public.webhook_logs.payload IS 'Payload completo do webhook';
COMMENT ON COLUMN public.webhook_logs.processed IS 'Se o webhook foi processado com sucesso';

-- ==================================================
-- TRIGGER: update_updated_at (payment_settings)
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

-- ==================================================
-- RLS: payment_settings
-- ==================================================

ALTER TABLE public.payment_settings ENABLE ROW LEVEL SECURITY;

-- Remover políticas antigas
DROP POLICY IF EXISTS "Admins can view payment settings" ON public.payment_settings;
DROP POLICY IF EXISTS "Admins can update payment settings" ON public.payment_settings;

-- SELECT: Apenas admins
CREATE POLICY "Admins can view payment settings"
ON public.payment_settings
FOR SELECT
TO authenticated
USING (public.is_admin() = true);

-- UPDATE: Apenas admins
CREATE POLICY "Admins can update payment settings"
ON public.payment_settings
FOR UPDATE
TO authenticated
USING (public.is_admin() = true)
WITH CHECK (public.is_admin() = true);

-- INSERT: Apenas admins (caso não exista)
CREATE POLICY "Admins can insert payment settings"
ON public.payment_settings
FOR INSERT
TO authenticated
WITH CHECK (public.is_admin() = true);

-- ==================================================
-- RLS: webhook_logs
-- ==================================================

ALTER TABLE public.webhook_logs ENABLE ROW LEVEL SECURITY;

-- Remover políticas antigas
DROP POLICY IF EXISTS "Admins can view webhook logs" ON public.webhook_logs;
DROP POLICY IF EXISTS "Service can insert webhook logs" ON public.webhook_logs;

-- SELECT: Apenas admins
CREATE POLICY "Admins can view webhook logs"
ON public.webhook_logs
FOR SELECT
TO authenticated
USING (public.is_admin() = true);

-- INSERT: Service role (para endpoint de webhook)
CREATE POLICY "Service can insert webhook logs"
ON public.webhook_logs
FOR INSERT
TO authenticated, anon
WITH CHECK (true);

-- DELETE: Apenas admins (limpar logs antigos)
CREATE POLICY "Admins can delete webhook logs"
ON public.webhook_logs
FOR DELETE
TO authenticated
USING (public.is_admin() = true);

-- ==================================================
-- DADOS INICIAIS: payment_settings
-- ==================================================

INSERT INTO public.payment_settings (
  id,
  mp_access_token,
  mp_public_key,
  mp_webhook_secret,
  is_production
) VALUES (
  '00000000-0000-0000-0000-000000000005',
  NULL,
  NULL,
  NULL,
  false
) ON CONFLICT (id) DO NOTHING;

-- ==================================================
-- VERIFICAÇÃO
-- ==================================================

-- Verificar tabelas criadas
SELECT 
  table_name,
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name IN ('payment_settings', 'webhook_logs')
ORDER BY table_name, ordinal_position;

-- Verificar registro inicial
SELECT * FROM public.payment_settings;

-- Verificar políticas RLS
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd
FROM pg_policies
WHERE tablename IN ('payment_settings', 'webhook_logs')
ORDER BY tablename, policyname;

-- ==================================================
-- RESULTADO ESPERADO:
-- ✅ Tabela payment_settings criada (singleton)
-- ✅ Tabela webhook_logs criada
-- ✅ RLS configurado (apenas admins)
-- ✅ 1 registro inicial em payment_settings
-- ==================================================
