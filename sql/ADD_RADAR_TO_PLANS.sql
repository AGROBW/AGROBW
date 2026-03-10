-- =====================================================
-- MIGRATION: Adicionar recursos do Radar aos planos
-- =====================================================
-- Adiciona colunas para controlar recursos do Radar de Oportunidades
-- =====================================================

-- 1. Adicionar colunas à tabela plans
ALTER TABLE plans 
ADD COLUMN IF NOT EXISTS radar_max_alerts INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS radar_has_radius BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS radar_has_keywords BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS radar_has_price_filter BOOLEAN DEFAULT false;

-- 2. Adicionar comentários
COMMENT ON COLUMN plans.radar_max_alerts IS 'Número máximo de alertas do Radar de Oportunidades (0 = sem acesso, 999 = ilimitado)';
COMMENT ON COLUMN plans.radar_has_radius IS 'Permite filtro por raio geográfico (km)';
COMMENT ON COLUMN plans.radar_has_keywords IS 'Permite filtro por palavras-chave';
COMMENT ON COLUMN plans.radar_has_price_filter IS 'Permite filtro por faixa de preço';

-- 3. Atualizar planos existentes com recursos do Radar

-- Start Agro (Gratuito) - Básico
UPDATE plans 
SET 
  radar_max_alerts = 1,
  radar_has_radius = false,
  radar_has_keywords = false,
  radar_has_price_filter = false
WHERE name = 'Start Agro';

-- Essencial (R$ 49) - Intermediário
UPDATE plans 
SET 
  radar_max_alerts = 3,
  radar_has_radius = false,
  radar_has_keywords = true,
  radar_has_price_filter = true
WHERE name = 'Essencial';

-- Destaque (R$ 99) - Avançado
UPDATE plans 
SET 
  radar_max_alerts = 5,
  radar_has_radius = true,
  radar_has_keywords = true,
  radar_has_price_filter = true
WHERE name = 'Destaque';

-- Loja Oficial (R$ 299) - Premium
UPDATE plans 
SET 
  radar_max_alerts = 10,
  radar_has_radius = true,
  radar_has_keywords = true,
  radar_has_price_filter = true
WHERE name = 'Loja Oficial';

-- Corporativo (R$ 599) - Ilimitado
UPDATE plans 
SET 
  radar_max_alerts = 999,
  radar_has_radius = true,
  radar_has_keywords = true,
  radar_has_price_filter = true
WHERE name = 'Corporativo';

-- 4. Verificar resultado
SELECT 
  name,
  monthly_price,
  radar_max_alerts,
  radar_has_radius,
  radar_has_keywords,
  radar_has_price_filter
FROM plans
ORDER BY position;

-- 5. Atualizar display_features (opcional - adiciona Radar aos benefícios visíveis)

-- Start Agro
UPDATE plans
SET display_features = display_features || '["Radar de Oportunidades: 1 alerta básico"]'::jsonb
WHERE name = 'Start Agro';

-- Essencial
UPDATE plans
SET display_features = display_features || '["Radar de Oportunidades: 3 alertas + filtros avançados"]'::jsonb
WHERE name = 'Essencial';

-- Destaque
UPDATE plans
SET display_features = display_features || '["Radar de Oportunidades: 5 alertas + raio geográfico"]'::jsonb
WHERE name = 'Destaque';

-- Loja Oficial
UPDATE plans
SET display_features = display_features || '["Radar de Oportunidades: 10 alertas com todos recursos"]'::jsonb
WHERE name = 'Loja Oficial';

-- Corporativo
UPDATE plans
SET display_features = display_features || '["Radar de Oportunidades: Alertas ilimitados"]'::jsonb
WHERE name = 'Corporativo';
