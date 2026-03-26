-- ======================================================
-- BWAGRO - Sistema de Destaques de Anúncios
-- ======================================================
-- Execute no SQL Editor do Supabase Dashboard
-- Este script cria a tabela de histórico de destaques e a RPC para aplicar destaques

-- 1) Tabela announcement_highlights_history
-- ======================================================
CREATE TABLE IF NOT EXISTS public.announcement_highlights_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_id UUID REFERENCES public.announcements(id) ON DELETE SET NULL,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  highlight_type TEXT NOT NULL CHECK (highlight_type IN ('category', 'home')),
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  subscription_period_start TIMESTAMPTZ NOT NULL,
  subscription_period_end TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_announcement_highlights_history_announcement_id 
  ON public.announcement_highlights_history(announcement_id);
CREATE INDEX IF NOT EXISTS idx_announcement_highlights_history_user_id 
  ON public.announcement_highlights_history(user_id);
CREATE INDEX IF NOT EXISTS idx_announcement_highlights_history_type 
  ON public.announcement_highlights_history(highlight_type);
CREATE INDEX IF NOT EXISTS idx_announcement_highlights_history_applied_at 
  ON public.announcement_highlights_history(applied_at);
CREATE INDEX IF NOT EXISTS idx_announcement_highlights_history_expires_at 
  ON public.announcement_highlights_history(expires_at);

-- RLS
ALTER TABLE public.announcement_highlights_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own highlights" ON public.announcement_highlights_history;
CREATE POLICY "Users can view their own highlights" ON public.announcement_highlights_history
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own highlights" ON public.announcement_highlights_history;
CREATE POLICY "Users can insert their own highlights" ON public.announcement_highlights_history
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ======================================================
-- 2) RPC: apply_announcement_highlight
-- ======================================================
-- Esta função aplica um destaque (categoria ou home) a um anúncio
-- Regras:
-- 1. Verifica se o usuário tem créditos disponíveis no ciclo atual
-- 2. Verifica se o anúncio não foi destacado nos últimos 15 dias
-- 3. Atualiza os campos highlight_category ou highlight_home no anúncio
-- 4. Registra o uso do crédito na tabela announcement_highlights_history

CREATE OR REPLACE FUNCTION public.apply_announcement_highlight(
  p_announcement_id UUID,
  p_highlight_type TEXT -- 'category' ou 'home'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_subscription_record RECORD;
  v_plan_record RECORD;
  v_last_highlight RECORD;
  v_highlights_used INT;
  v_highlights_limit INT;
  v_expires_at TIMESTAMPTZ;
  v_result JSONB;
BEGIN
  -- Obter user_id autenticado
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Usuário não autenticado'
    );
  END IF;

  -- Verificar se o anúncio existe e pertence ao usuário
  IF NOT EXISTS (
    SELECT 1 FROM public.announcements 
    WHERE id = p_announcement_id AND user_id = v_user_id
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Anúncio não encontrado ou não pertence ao usuário'
    );
  END IF;

  -- Validar tipo de destaque
  IF p_highlight_type NOT IN ('category', 'home') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Tipo de destaque inválido. Use "category" ou "home"'
    );
  END IF;

  -- Buscar assinatura ativa do usuário
  SELECT *
  INTO v_subscription_record
  FROM public.user_subscriptions
  WHERE user_id = v_user_id
    AND status = 'active'
    AND NOW() BETWEEN current_period_start AND current_period_end
  ORDER BY current_period_end DESC
  LIMIT 1;

  IF v_subscription_record IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Você não possui uma assinatura ativa'
    );
  END IF;

  -- Buscar dados do plano
  SELECT *
  INTO v_plan_record
  FROM public.plans
  WHERE id = v_subscription_record.plan_id;

  IF v_plan_record IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Plano não encontrado'
    );
  END IF;

  -- Verificar limite de créditos do plano
  IF p_highlight_type = 'category' THEN
    v_highlights_limit := COALESCE(v_plan_record.category_highlights_count, 0);
  ELSE
    v_highlights_limit := COALESCE(v_plan_record.home_highlight_count, 0);
  END IF;

  IF v_highlights_limit <= 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format('Seu plano %s não inclui destaques de %s', 
        v_plan_record.name, 
        CASE WHEN p_highlight_type = 'category' THEN 'categoria' ELSE 'home' END
      )
    );
  END IF;

  -- Contar quantos destaques já foram usados neste ciclo
  SELECT COUNT(*)
  INTO v_highlights_used
  FROM public.announcement_highlights_history
  WHERE user_id = v_user_id
    AND highlight_type = p_highlight_type
    AND applied_at BETWEEN v_subscription_record.current_period_start 
                       AND v_subscription_record.current_period_end;

  IF v_highlights_used >= v_highlights_limit THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format('Você já usou todos os %s créditos de destaque de %s deste ciclo. Créditos não são acumulativos.', 
        v_highlights_limit,
        CASE WHEN p_highlight_type = 'category' THEN 'categoria' ELSE 'home' END
      ),
      'used', v_highlights_used,
      'limit', v_highlights_limit
    );
  END IF;

  -- REGRA DOS 15 DIAS: Verificar se o anúncio já foi destacado nos últimos 15 dias
  SELECT *
  INTO v_last_highlight
  FROM public.announcement_highlights_history
  WHERE announcement_id = p_announcement_id
    AND highlight_type = p_highlight_type
    AND applied_at > (NOW() - INTERVAL '15 days')
  ORDER BY applied_at DESC
  LIMIT 1;

  IF v_last_highlight IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Este anúncio já foi destacado nos últimos 15 dias. Aguarde o período mínimo.',
      'last_highlight_date', v_last_highlight.applied_at,
      'available_after', v_last_highlight.applied_at + INTERVAL '15 days'
    );
  END IF;

  -- Calcular data de expiração do destaque
  IF p_highlight_type = 'category' THEN
    v_expires_at := NOW() + (COALESCE(v_plan_record.category_highlight_days, 7) || ' days')::INTERVAL;
  ELSE
    v_expires_at := NOW() + (COALESCE(v_plan_record.home_highlight_days, 7) || ' days')::INTERVAL;
  END IF;

  -- Atualizar campos de destaque no anúncio
  IF p_highlight_type = 'category' THEN
    UPDATE public.announcements
    SET 
      highlight_category = TRUE,
      highlight_category_until = v_expires_at,
      updated_at = NOW()
    WHERE id = p_announcement_id;
  ELSE
    UPDATE public.announcements
    SET 
      highlight_home = TRUE,
      highlight_home_until = v_expires_at,
      updated_at = NOW()
    WHERE id = p_announcement_id;
  END IF;

  -- Registrar uso do crédito no histórico
  INSERT INTO public.announcement_highlights_history (
    announcement_id,
    user_id,
    highlight_type,
    applied_at,
    expires_at,
    subscription_period_start,
    subscription_period_end
  ) VALUES (
    p_announcement_id,
    v_user_id,
    p_highlight_type,
    NOW(),
    v_expires_at,
    v_subscription_record.current_period_start,
    v_subscription_record.current_period_end
  );

  -- Retornar sucesso
  RETURN jsonb_build_object(
    'success', true,
    'message', format('Destaque de %s aplicado com sucesso!', 
      CASE WHEN p_highlight_type = 'category' THEN 'categoria' ELSE 'home' END
    ),
    'expires_at', v_expires_at,
    'used', v_highlights_used + 1,
    'limit', v_highlights_limit,
    'remaining', v_highlights_limit - (v_highlights_used + 1)
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format('Erro ao aplicar destaque: %s', SQLERRM)
    );
END;
$$;

-- ======================================================
-- 3) Adicionar colunas de destaque na tabela announcements (se não existirem)
-- ======================================================
DO $$
BEGIN
  -- Destaque de categoria
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'announcements' AND column_name = 'highlight_category'
  ) THEN
    ALTER TABLE public.announcements 
      ADD COLUMN highlight_category BOOLEAN NOT NULL DEFAULT FALSE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'announcements' AND column_name = 'highlight_category_until'
  ) THEN
    ALTER TABLE public.announcements 
      ADD COLUMN highlight_category_until TIMESTAMPTZ;
  END IF;

  -- Destaque de home
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'announcements' AND column_name = 'highlight_home'
  ) THEN
    ALTER TABLE public.announcements 
      ADD COLUMN highlight_home BOOLEAN NOT NULL DEFAULT FALSE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'announcements' AND column_name = 'highlight_home_until'
  ) THEN
    ALTER TABLE public.announcements 
      ADD COLUMN highlight_home_until TIMESTAMPTZ;
  END IF;
END $$;

-- Índices para os campos de destaque
CREATE INDEX IF NOT EXISTS idx_announcements_highlight_category 
  ON public.announcements(highlight_category) 
  WHERE highlight_category = TRUE;

CREATE INDEX IF NOT EXISTS idx_announcements_highlight_home 
  ON public.announcements(highlight_home) 
  WHERE highlight_home = TRUE;

-- ======================================================
-- 4) Função para limpar destaques expirados (executar via cron)
-- ======================================================
CREATE OR REPLACE FUNCTION public.cleanup_expired_highlights()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Limpar destaques de categoria expirados
  UPDATE public.announcements
  SET 
    highlight_category = FALSE,
    highlight_category_until = NULL,
    updated_at = NOW()
  WHERE highlight_category = TRUE
    AND highlight_category_until IS NOT NULL
    AND highlight_category_until < NOW();

  -- Limpar destaques de home expirados
  UPDATE public.announcements
  SET 
    highlight_home = FALSE,
    highlight_home_until = NULL,
    updated_at = NOW()
  WHERE highlight_home = TRUE
    AND highlight_home_until IS NOT NULL
    AND highlight_home_until < NOW();
END;
$$;

-- ======================================================
-- INSTRUÇÕES DE USO
-- ======================================================
-- Para aplicar um destaque de categoria:
-- SELECT apply_announcement_highlight('announcement-uuid', 'category');
--
-- Para aplicar um destaque de home:
-- SELECT apply_announcement_highlight('announcement-uuid', 'home');
--
-- O retorno será um JSON com:
-- {
--   "success": true/false,
--   "message": "...",
--   "expires_at": "...",
--   "used": 1,
--   "limit": 3,
--   "remaining": 2
-- }
--
-- Configure um cron job no Supabase para executar cleanup_expired_highlights() diariamente
