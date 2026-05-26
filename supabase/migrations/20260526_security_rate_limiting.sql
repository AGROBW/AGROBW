-- ============================================================
-- Migração de Segurança: Rate Limiting
-- VULN-007 fix: Função para controle de taxa de requisições
-- por usuário e ação.
-- ============================================================

-- Tabela de contadores de rate limit
CREATE TABLE IF NOT EXISTS public.rate_limit_counters (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action        text        NOT NULL,
  request_count integer     NOT NULL DEFAULT 1,
  window_start  timestamptz NOT NULL DEFAULT now(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, action)
);

-- Índice para lookup rápido
CREATE INDEX IF NOT EXISTS idx_rate_limit_user_action
  ON public.rate_limit_counters (user_id, action, window_start);

-- RLS: Apenas o service role pode acessar
ALTER TABLE public.rate_limit_counters ENABLE ROW LEVEL SECURITY;

-- Somente service_role pode ler/escrever (Edge Functions usam service_role_key)
CREATE POLICY "Service role only" ON public.rate_limit_counters
  AS RESTRICTIVE
  USING (auth.role() = 'service_role');

-- ============================================================
-- Função de verificação de rate limit com upsert atômico
-- ============================================================
CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_user_id       uuid,
  p_action        text,
  p_max_requests  integer,
  p_window_seconds integer
)
RETURNS TABLE (
  allowed    boolean,
  remaining  integer,
  reset_at   timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_window_start  timestamptz;
  v_count         integer;
  v_reset_at      timestamptz;
BEGIN
  v_window_start := now() - (p_window_seconds || ' seconds')::interval;

  -- Upsert atômico: incrementar contador ou resetar se janela expirou
  INSERT INTO public.rate_limit_counters (user_id, action, request_count, window_start, updated_at)
  VALUES (p_user_id, p_action, 1, now(), now())
  ON CONFLICT (user_id, action) DO UPDATE
  SET
    request_count = CASE
      WHEN rate_limit_counters.window_start < v_window_start THEN 1  -- Janela expirou, reiniciar
      ELSE rate_limit_counters.request_count + 1
    END,
    window_start = CASE
      WHEN rate_limit_counters.window_start < v_window_start THEN now()
      ELSE rate_limit_counters.window_start
    END,
    updated_at = now()
  RETURNING request_count, window_start
  INTO v_count, v_reset_at;

  v_reset_at := v_reset_at + (p_window_seconds || ' seconds')::interval;

  RETURN QUERY SELECT
    v_count <= p_max_requests,                    -- allowed
    GREATEST(0, p_max_requests - v_count),        -- remaining
    v_reset_at;                                   -- reset_at
END;
$$;

-- Comentários para documentação
COMMENT ON TABLE public.rate_limit_counters IS 'Contadores de rate limiting por usuário e ação — VULN-007';
COMMENT ON FUNCTION public.check_rate_limit IS 'Verifica e incrementa contador de rate limit de forma atômica';
