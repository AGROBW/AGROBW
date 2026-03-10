-- =====================================================
-- RADAR DE OPORTUNIDADES - ESTRUTURA DE TABELAS
-- =====================================================
-- Data: 09/03/2026
-- Descrição: Tabelas para sistema de alertas de oportunidades
--            com geolocalização e matching inteligente
-- =====================================================

-- 1. Tabela de Alertas de Oportunidades
-- =====================================================
CREATE TABLE IF NOT EXISTS opportunity_alerts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- Identificação
  name VARCHAR(255) NOT NULL,
  
  -- Filtros de Categoria
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  subcategory_id UUID REFERENCES subcategories(id) ON DELETE SET NULL,
  
  -- Filtros Geográficos
  state VARCHAR(2), -- Ex: SP, MG, RS
  radius_km INTEGER DEFAULT 0, -- 0 = sem filtro de raio (apenas estado)
  
  -- Filtros de Preço
  min_price DECIMAL(15,2),
  max_price DECIMAL(15,2),
  
  -- Filtros de Conteúdo
  keywords TEXT[], -- Array de palavras-chave para buscar no título/descrição
  
  -- Status e Controle
  status VARCHAR(20) DEFAULT 'ativo' CHECK (status IN ('ativo', 'pausado')),
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_match_at TIMESTAMP WITH TIME ZONE,
  
  -- Índices para otimização
  CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Índices para performance
CREATE INDEX idx_opportunity_alerts_user_id ON opportunity_alerts(user_id);
CREATE INDEX idx_opportunity_alerts_status ON opportunity_alerts(status);
CREATE INDEX idx_opportunity_alerts_category ON opportunity_alerts(category_id);
CREATE INDEX idx_opportunity_alerts_subcategory ON opportunity_alerts(subcategory_id);
CREATE INDEX idx_opportunity_alerts_state ON opportunity_alerts(state);

-- Comentários
COMMENT ON TABLE opportunity_alerts IS 'Alertas configurados pelos usuários para receber notificações de novas oportunidades';
COMMENT ON COLUMN opportunity_alerts.radius_km IS 'Raio em km para busca geolocalizada (0 = desabilitado, busca apenas por estado)';
COMMENT ON COLUMN opportunity_alerts.keywords IS 'Array de palavras-chave para buscar em título e descrição dos anúncios';


-- 2. Tabela de Matches de Oportunidades
-- =====================================================
CREATE TABLE IF NOT EXISTS opportunity_matches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Relacionamentos
  alert_id UUID NOT NULL REFERENCES opportunity_alerts(id) ON DELETE CASCADE,
  announcement_id UUID NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- Controle de Visualização
  is_viewed BOOLEAN DEFAULT FALSE,
  is_dismissed BOOLEAN DEFAULT FALSE,
  viewed_at TIMESTAMP WITH TIME ZONE,
  
  -- Metadados do Match
  match_score INTEGER DEFAULT 100, -- Score de relevância (0-100)
  match_reason JSONB, -- Detalhes sobre o que deu match (categoria, preço, keywords, etc)
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Constraint para evitar duplicatas
  UNIQUE(alert_id, announcement_id)
);

-- Índices para performance
CREATE INDEX idx_opportunity_matches_alert_id ON opportunity_matches(alert_id);
CREATE INDEX idx_opportunity_matches_announcement_id ON opportunity_matches(announcement_id);
CREATE INDEX idx_opportunity_matches_user_id ON opportunity_matches(user_id);
CREATE INDEX idx_opportunity_matches_is_viewed ON opportunity_matches(is_viewed);
CREATE INDEX idx_opportunity_matches_created_at ON opportunity_matches(created_at DESC);

-- Índice composto para consultas frequentes
CREATE INDEX idx_opportunity_matches_user_viewed ON opportunity_matches(user_id, is_viewed, created_at DESC);

-- Comentários
COMMENT ON TABLE opportunity_matches IS 'Registro de anúncios que deram match com alertas configurados';
COMMENT ON COLUMN opportunity_matches.match_score IS 'Score de 0-100 indicando relevância do match';
COMMENT ON COLUMN opportunity_matches.match_reason IS 'JSON com detalhes: {category: true, price: true, keywords: ["trator", "john deere"], distance_km: 45}';


-- 3. Adicionar colunas de geolocalização na tabela users (se não existirem)
-- =====================================================
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name='users' AND column_name='latitude') THEN
    ALTER TABLE users ADD COLUMN latitude DECIMAL(10, 8);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name='users' AND column_name='longitude') THEN
    ALTER TABLE users ADD COLUMN longitude DECIMAL(11, 8);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name='users' AND column_name='geo_updated_at') THEN
    ALTER TABLE users ADD COLUMN geo_updated_at TIMESTAMP WITH TIME ZONE;
  END IF;
END $$;

-- Índice para geolocalização
CREATE INDEX IF NOT EXISTS idx_users_geo ON users(latitude, longitude) WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

COMMENT ON COLUMN users.latitude IS 'Latitude obtida do CEP do usuário';
COMMENT ON COLUMN users.longitude IS 'Longitude obtida do CEP do usuário';
COMMENT ON COLUMN users.geo_updated_at IS 'Última atualização das coordenadas geográficas';


-- 4. Adicionar colunas de geolocalização na tabela announcements (se não existirem)
-- =====================================================
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name='announcements' AND column_name='latitude') THEN
    ALTER TABLE announcements ADD COLUMN latitude DECIMAL(10, 8);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name='announcements' AND column_name='longitude') THEN
    ALTER TABLE announcements ADD COLUMN longitude DECIMAL(11, 8);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name='announcements' AND column_name='geo_updated_at') THEN
    ALTER TABLE announcements ADD COLUMN geo_updated_at TIMESTAMP WITH TIME ZONE;
  END IF;
END $$;

-- Índice para geolocalização de anúncios
CREATE INDEX IF NOT EXISTS idx_announcements_geo ON announcements(latitude, longitude) WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

COMMENT ON COLUMN announcements.latitude IS 'Latitude obtida do CEP do anúncio';
COMMENT ON COLUMN announcements.longitude IS 'Longitude obtida do CEP do anúncio';
COMMENT ON COLUMN announcements.geo_updated_at IS 'Última atualização das coordenadas geográficas';


-- 5. Função auxiliar para calcular distância (Haversine)
-- =====================================================
-- Se o PostGIS não estiver disponível, usar fórmula Haversine pura
CREATE OR REPLACE FUNCTION calculate_distance_km(
  lat1 DECIMAL, lon1 DECIMAL,
  lat2 DECIMAL, lon2 DECIMAL
) RETURNS DECIMAL AS $$
DECLARE
  earth_radius CONSTANT DECIMAL := 6371.0; -- Raio da Terra em km
  dlat DECIMAL;
  dlon DECIMAL;
  a DECIMAL;
  c DECIMAL;
BEGIN
  -- Validação de entrada
  IF lat1 IS NULL OR lon1 IS NULL OR lat2 IS NULL OR lon2 IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- Fórmula de Haversine
  dlat := RADIANS(lat2 - lat1);
  dlon := RADIANS(lon2 - lon1);
  
  a := SIN(dlat/2) * SIN(dlat/2) + 
       COS(RADIANS(lat1)) * COS(RADIANS(lat2)) * 
       SIN(dlon/2) * SIN(dlon/2);
  
  c := 2 * ATAN2(SQRT(a), SQRT(1-a));
  
  RETURN earth_radius * c;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION calculate_distance_km IS 'Calcula distância em km entre dois pontos usando fórmula de Haversine';


-- 6. Trigger para atualizar updated_at automaticamente
-- =====================================================
CREATE OR REPLACE FUNCTION update_opportunity_alerts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_opportunity_alerts_updated_at
BEFORE UPDATE ON opportunity_alerts
FOR EACH ROW
EXECUTE FUNCTION update_opportunity_alerts_updated_at();


-- 7. RLS (Row Level Security) Policies
-- =====================================================
-- Habilitar RLS
ALTER TABLE opportunity_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE opportunity_matches ENABLE ROW LEVEL SECURITY;

-- Policy: Usuários podem ver apenas seus próprios alertas
CREATE POLICY "Users can view their own alerts"
ON opportunity_alerts FOR SELECT
USING (auth.uid() = user_id);

-- Policy: Usuários podem criar seus próprios alertas
CREATE POLICY "Users can create their own alerts"
ON opportunity_alerts FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Policy: Usuários podem atualizar seus próprios alertas
CREATE POLICY "Users can update their own alerts"
ON opportunity_alerts FOR UPDATE
USING (auth.uid() = user_id);

-- Policy: Usuários podem deletar seus próprios alertas
CREATE POLICY "Users can delete their own alerts"
ON opportunity_alerts FOR DELETE
USING (auth.uid() = user_id);

-- Policy: Usuários podem ver apenas seus próprios matches
CREATE POLICY "Users can view their own matches"
ON opportunity_matches FOR SELECT
USING (auth.uid() = user_id);

-- Policy: Usuários podem atualizar seus próprios matches (marcar como visto)
CREATE POLICY "Users can update their own matches"
ON opportunity_matches FOR UPDATE
USING (auth.uid() = user_id);


-- 8. View para estatísticas de alertas
-- =====================================================
CREATE OR REPLACE VIEW v_radar_stats
WITH (security_invoker = on)
AS
SELECT 
  oa.user_id,
  COUNT(DISTINCT oa.id) as total_alerts,
  COUNT(DISTINCT CASE WHEN oa.status = 'ativo' THEN oa.id END) as active_alerts,
  COUNT(DISTINCT om.id) as total_matches,
  COUNT(DISTINCT CASE WHEN om.is_viewed = false THEN om.id END) as unviewed_matches,
  MAX(om.created_at) as last_match_date
FROM opportunity_alerts oa
LEFT JOIN opportunity_matches om ON om.alert_id = oa.id
GROUP BY oa.user_id;

-- Garantir acesso à view
GRANT SELECT ON v_radar_stats TO authenticated;
GRANT SELECT ON v_radar_stats TO anon;

COMMENT ON VIEW v_radar_stats IS 'Estatísticas agregadas de alertas e matches por usuário';


-- =====================================================
-- FIM DO SCRIPT
-- =====================================================
-- Para executar: Copie e cole no SQL Editor do Supabase
-- Ordem de execução: 1. Criar tabelas, 2. Criar índices,
--                     3. Criar funções, 4. Criar triggers,
--                     5. Configurar RLS
-- =====================================================
