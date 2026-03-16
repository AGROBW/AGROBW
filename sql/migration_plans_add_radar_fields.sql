-- ==================================================
-- MIGRATION: Adicionar campos Radar à tabela plans
-- ==================================================
-- Adiciona os campos radar_max_alerts, radar_has_radius,
-- radar_has_keywords e radar_has_price_filter
-- ==================================================

-- Adicionar campo radar_max_alerts (se não existir)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'plans' 
    AND column_name = 'radar_max_alerts'
  ) THEN
    ALTER TABLE public.plans 
    ADD COLUMN radar_max_alerts INT NOT NULL DEFAULT 0;
    
    RAISE NOTICE 'Campo radar_max_alerts adicionado com sucesso';
  ELSE
    RAISE NOTICE 'Campo radar_max_alerts já existe';
  END IF;
END $$;

-- Adicionar campo radar_has_radius (se não existir)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'plans' 
    AND column_name = 'radar_has_radius'
  ) THEN
    ALTER TABLE public.plans 
    ADD COLUMN radar_has_radius BOOLEAN NOT NULL DEFAULT false;
    
    RAISE NOTICE 'Campo radar_has_radius adicionado com sucesso';
  ELSE
    RAISE NOTICE 'Campo radar_has_radius já existe';
  END IF;
END $$;

-- Adicionar campo radar_has_keywords (se não existir)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'plans' 
    AND column_name = 'radar_has_keywords'
  ) THEN
    ALTER TABLE public.plans 
    ADD COLUMN radar_has_keywords BOOLEAN NOT NULL DEFAULT false;
    
    RAISE NOTICE 'Campo radar_has_keywords adicionado com sucesso';
  ELSE
    RAISE NOTICE 'Campo radar_has_keywords já existe';
  END IF;
END $$;

-- Adicionar campo radar_has_price_filter (se não existir)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'plans' 
    AND column_name = 'radar_has_price_filter'
  ) THEN
    ALTER TABLE public.plans 
    ADD COLUMN radar_has_price_filter BOOLEAN NOT NULL DEFAULT false;
    
    RAISE NOTICE 'Campo radar_has_price_filter adicionado com sucesso';
  ELSE
    RAISE NOTICE 'Campo radar_has_price_filter já existe';
  END IF;
END $$;

-- ==================================================
-- ATUALIZAR VALORES DOS PLANOS EXISTENTES
-- ==================================================

-- Start Agro (gratuito - sem radar)
UPDATE public.plans 
SET 
  radar_max_alerts = 0,
  radar_has_radius = false,
  radar_has_keywords = false,
  radar_has_price_filter = false
WHERE name = 'Start Agro';

-- Essencial (básico - radar limitado)
UPDATE public.plans 
SET 
  radar_max_alerts = 3,
  radar_has_radius = false,
  radar_has_keywords = false,
  radar_has_price_filter = false
WHERE name = 'Essencial';

-- Destaque (popular - radar intermediário)
UPDATE public.plans 
SET 
  radar_max_alerts = 5,
  radar_has_radius = true,
  radar_has_keywords = false,
  radar_has_price_filter = false
WHERE name = 'Destaque';

-- Premium (premium - radar completo)
UPDATE public.plans 
SET 
  radar_max_alerts = 10,
  radar_has_radius = true,
  radar_has_keywords = true,
  radar_has_price_filter = true
WHERE name = 'Premium';

-- Corporativo (máximo - radar completo ilimitado)
UPDATE public.plans 
SET 
  radar_max_alerts = 999,
  radar_has_radius = true,
  radar_has_keywords = true,
  radar_has_price_filter = true
WHERE name = 'Corporativo';

-- Verificação
SELECT 
  name,
  radar_max_alerts,
  radar_has_radius,
  radar_has_keywords,
  radar_has_price_filter
FROM public.plans
ORDER BY position;

-- ==================================================
-- RESULTADO ESPERADO:
-- ✅ 4 novos campos adicionados
-- ✅ Valores padrão configurados para planos existentes
-- ✅ Sistema de Radar integrado aos planos
-- ==================================================
