-- ==========================================
-- TABELAS PARA PAINEL DE BI - BWAGRO
-- ==========================================
-- Execute este script no Supabase SQL Editor
-- Data: 12/03/2026
-- 
-- Tabelas criadas:
-- 1. subscription_history (Histórico de mudanças de planos)
-- 2. marketing_costs (Custos de marketing mensais)
-- 3. website_visits (Rastreamento de visitas)
-- 4. lead_conversions (Conversões de leads)
-- ==========================================

-- ==========================================
-- 1. TABELA: subscription_history
-- ==========================================
-- Rastreia TODAS as mudanças de planos para cálculos precisos de Churn e MRR

CREATE TABLE IF NOT EXISTS subscription_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Identificação
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subscription_id UUID REFERENCES user_subscriptions(id) ON DELETE SET NULL,
  
  -- Plano
  plan_id UUID NOT NULL REFERENCES plans(id) ON DELETE RESTRICT,
  plan_name TEXT NOT NULL, -- Cache para histórico
  plan_monthly_price NUMERIC(10,2) NOT NULL, -- Cache do preço na época
  
  -- Tipo de Evento
  event_type TEXT NOT NULL CHECK (event_type IN ('created', 'upgraded', 'downgraded', 'renewed', 'canceled', 'expired', 'trial_started', 'trial_converted')),
  
  -- Status
  status TEXT NOT NULL CHECK (status IN ('active', 'trialing', 'past_due', 'canceled', 'expired')),
  
  -- Períodos (para cálculo de MRR retroativo)
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  
  -- Valores financeiros
  mrr_contribution NUMERIC(10,2) NOT NULL, -- Contribuição para MRR neste período
  was_paid BOOLEAN DEFAULT false, -- Se o pagamento foi confirmado
  
  -- Metadados
  previous_plan_id UUID REFERENCES plans(id) ON DELETE SET NULL, -- Plano anterior (para upgrades/downgrades)
  cancellation_reason TEXT, -- Motivo do cancelamento
  metadata JSONB DEFAULT '{}'::jsonb,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para Performance
CREATE INDEX IF NOT EXISTS idx_subscription_history_user_id 
  ON subscription_history(user_id);

CREATE INDEX IF NOT EXISTS idx_subscription_history_plan_id 
  ON subscription_history(plan_id);

CREATE INDEX IF NOT EXISTS idx_subscription_history_period 
  ON subscription_history(period_start, period_end);

CREATE INDEX IF NOT EXISTS idx_subscription_history_event_type 
  ON subscription_history(event_type);

CREATE INDEX IF NOT EXISTS idx_subscription_history_created_at 
  ON subscription_history(created_at DESC);

-- Comentários
COMMENT ON TABLE subscription_history IS 'Histórico de todas as mudanças de assinaturas para cálculos precisos de MRR e Churn';
COMMENT ON COLUMN subscription_history.mrr_contribution IS 'Valor mensal que este período contribui para o MRR';
COMMENT ON COLUMN subscription_history.event_type IS 'Tipo de evento: created, upgraded, downgraded, renewed, canceled, expired';

-- ==========================================
-- 2. TABELA: marketing_costs
-- ==========================================
-- Armazena custos de marketing mensais para cálculo de CAC

CREATE TABLE IF NOT EXISTS marketing_costs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Período
  month_year DATE NOT NULL UNIQUE, -- Formato: 2026-03-01 (primeiro dia do mês)
  
  -- Custos
  total_cost NUMERIC(10,2) NOT NULL DEFAULT 0, -- Custo total de marketing no mês
  
  -- Detalhamento (opcional)
  ad_spend NUMERIC(10,2) DEFAULT 0, -- Gastos com anúncios
  influencer_cost NUMERIC(10,2) DEFAULT 0, -- Parcerias com influenciadores
  content_cost NUMERIC(10,2) DEFAULT 0, -- Produção de conteúdo
  other_costs NUMERIC(10,2) DEFAULT 0, -- Outros custos
  
  -- Metadados
  notes TEXT, -- Observações sobre o mês
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL, -- Admin que atualizou
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índice
CREATE INDEX IF NOT EXISTS idx_marketing_costs_month 
  ON marketing_costs(month_year DESC);

-- Comentários
COMMENT ON TABLE marketing_costs IS 'Custos de marketing mensais para cálculo de CAC';
COMMENT ON COLUMN marketing_costs.month_year IS 'Primeiro dia do mês (ex: 2026-03-01)';

-- ==========================================
-- 3. TABELA: website_visits
-- ==========================================
-- Rastreia visitas diárias ao site

CREATE TABLE IF NOT EXISTS website_visits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Data
  visit_date DATE NOT NULL UNIQUE, -- Uma linha por dia
  
  -- Métricas
  total_visits INTEGER DEFAULT 0, -- Total de visitas/sessões
  unique_visitors INTEGER DEFAULT 0, -- Visitantes únicos
  page_views INTEGER DEFAULT 0, -- Total de páginas vistas
  
  -- Métricas de Engajamento
  avg_session_duration INTEGER DEFAULT 0, -- Duração média da sessão (segundos)
  bounce_rate NUMERIC(5,2) DEFAULT 0, -- Taxa de rejeição (%)
  
  -- Origem do Tráfego (opcional)
  organic_visits INTEGER DEFAULT 0, -- Busca orgânica
  direct_visits INTEGER DEFAULT 0, -- Acesso direto
  social_visits INTEGER DEFAULT 0, -- Redes sociais
  referral_visits INTEGER DEFAULT 0, -- Referências
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índice
CREATE INDEX IF NOT EXISTS idx_website_visits_date 
  ON website_visits(visit_date DESC);

-- Comentários
COMMENT ON TABLE website_visits IS 'Rastreamento diário de visitas ao site';
COMMENT ON COLUMN website_visits.total_visits IS 'Total de sessões iniciadas no dia';

-- ==========================================
-- 4. TABELA: lead_conversions
-- ==========================================
-- Rastreia conversões de leads (cliques em contato nos anúncios)

CREATE TABLE IF NOT EXISTS lead_conversions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Referências
  announcement_id UUID NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
  viewer_id UUID REFERENCES users(id) ON DELETE SET NULL, -- Quem visualizou (pode ser NULL se anônimo)
  
  -- Tipo de Conversão
  conversion_type TEXT NOT NULL CHECK (conversion_type IN ('whatsapp_click', 'phone_click', 'email_click', 'message_sent')),
  
  -- Metadados
  ip_address INET, -- IP do visitante
  user_agent TEXT, -- Browser info
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_lead_conversions_announcement 
  ON lead_conversions(announcement_id);

CREATE INDEX IF NOT EXISTS idx_lead_conversions_viewer 
  ON lead_conversions(viewer_id);

CREATE INDEX IF NOT EXISTS idx_lead_conversions_created_at 
  ON lead_conversions(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_lead_conversions_type 
  ON lead_conversions(conversion_type);

-- Comentários
COMMENT ON TABLE lead_conversions IS 'Rastreamento de conversões de leads (cliques em contato)';
COMMENT ON COLUMN lead_conversions.conversion_type IS 'Tipo: whatsapp_click, phone_click, email_click, message_sent';

-- ==========================================
-- 5. VIEWS DE ANÁLISE
-- ==========================================

-- View: MRR Mensal
CREATE OR REPLACE VIEW v_mrr_monthly AS
SELECT 
  DATE_TRUNC('month', period_start)::DATE AS month_year,
  SUM(mrr_contribution) AS total_mrr,
  COUNT(DISTINCT user_id) AS active_subscribers,
  SUM(CASE WHEN event_type = 'created' THEN mrr_contribution ELSE 0 END) AS new_mrr,
  SUM(CASE WHEN event_type = 'upgraded' THEN mrr_contribution ELSE 0 END) AS expansion_mrr,
  SUM(CASE WHEN event_type IN ('downgraded', 'canceled') THEN mrr_contribution ELSE 0 END) AS churn_mrr
FROM subscription_history
WHERE status = 'active' 
  AND period_start >= NOW() - INTERVAL '12 months'
GROUP BY DATE_TRUNC('month', period_start)
ORDER BY month_year DESC;

COMMENT ON VIEW v_mrr_monthly IS 'MRR mensal com detalhamento de novos, expansão e churn';

-- View: Receita por Plano
CREATE OR REPLACE VIEW v_revenue_by_plan AS
SELECT 
  p.name AS plan_name,
  COUNT(DISTINCT sh.user_id) AS active_users,
  SUM(sh.mrr_contribution) AS total_mrr,
  ROUND(
    SUM(sh.mrr_contribution) * 100.0 / NULLIF((SELECT SUM(mrr_contribution) FROM subscription_history WHERE status = 'active'), 0),
    2
  ) AS mrr_percentage
FROM subscription_history sh
JOIN plans p ON sh.plan_id = p.id
WHERE sh.status = 'active'
  AND sh.period_start <= NOW()
  AND sh.period_end >= NOW()
GROUP BY p.name
ORDER BY total_mrr DESC;

COMMENT ON VIEW v_revenue_by_plan IS 'Distribuição de MRR por plano';

-- View: Churn Financeiro Mensal
CREATE OR REPLACE VIEW v_churn_monthly AS
WITH monthly_mrr AS (
  SELECT 
    DATE_TRUNC('month', period_start)::DATE AS month_year,
    SUM(mrr_contribution) AS mrr
  FROM subscription_history
  WHERE status = 'active'
  GROUP BY DATE_TRUNC('month', period_start)
),
churned_mrr AS (
  SELECT 
    DATE_TRUNC('month', created_at)::DATE AS month_year,
    SUM(mrr_contribution) AS churned_amount
  FROM subscription_history
  WHERE event_type IN ('canceled', 'expired')
  GROUP BY DATE_TRUNC('month', created_at)
)
SELECT 
  m.month_year,
  m.mrr AS starting_mrr,
  COALESCE(c.churned_amount, 0) AS churned_mrr,
  ROUND(
    COALESCE(c.churned_amount, 0) * 100.0 / NULLIF(m.mrr, 0),
    2
  ) AS churn_rate_percentage
FROM monthly_mrr m
LEFT JOIN churned_mrr c ON m.month_year = c.month_year
ORDER BY m.month_year DESC;

COMMENT ON VIEW v_churn_monthly IS 'Taxa de churn financeiro mensal (MRR Perdida / MRR Inicial * 100)';

-- View: Taxa de Conversão Grátis para Pago
CREATE OR REPLACE VIEW v_free_to_paid_conversion AS
WITH free_users AS (
  SELECT COUNT(DISTINCT user_id) AS total_free
  FROM user_subscriptions us
  JOIN plans p ON us.plan_id = p.id
  WHERE p.monthly_price = 0
    AND us.status = 'active'
),
upgraded_users AS (
  SELECT COUNT(DISTINCT user_id) AS total_upgraded
  FROM subscription_history
  WHERE event_type = 'upgraded'
    AND created_at >= NOW() - INTERVAL '30 days'
)
SELECT 
  f.total_free,
  u.total_upgraded,
  ROUND(
    u.total_upgraded * 100.0 / NULLIF(f.total_free, 0),
    2
  ) AS conversion_rate_percentage
FROM free_users f, upgraded_users u;

COMMENT ON VIEW v_free_to_paid_conversion IS 'Taxa de conversão de usuários gratuitos para pagos';

-- View: CAC (Custo de Aquisição de Cliente)
CREATE OR REPLACE VIEW v_cac_monthly AS
WITH new_paid_customers AS (
  SELECT 
    DATE_TRUNC('month', created_at)::DATE AS month_year,
    COUNT(DISTINCT user_id) AS new_customers
  FROM subscription_history
  WHERE event_type IN ('created', 'trial_converted')
    AND plan_monthly_price > 0
  GROUP BY DATE_TRUNC('month', created_at)
)
SELECT 
  mc.month_year,
  mc.total_cost AS marketing_cost,
  COALESCE(npc.new_customers, 0) AS new_paid_customers,
  CASE 
    WHEN COALESCE(npc.new_customers, 0) > 0 THEN
      ROUND(mc.total_cost / npc.new_customers, 2)
    ELSE 0
  END AS cac
FROM marketing_costs mc
LEFT JOIN new_paid_customers npc ON mc.month_year = npc.month_year
ORDER BY mc.month_year DESC;

COMMENT ON VIEW v_cac_monthly IS 'CAC (Custo de Marketing / Novos Clientes Pagantes)';

-- View: Taxa de Conversão de Leads
CREATE OR REPLACE VIEW v_lead_conversion_rate AS
WITH announcement_stats AS (
  SELECT 
    a.id,
    a.views AS total_views,
    COUNT(lc.id) AS total_leads
  FROM announcements a
  LEFT JOIN lead_conversions lc ON a.id = lc.announcement_id
  WHERE a.status = 'ACTIVE'
  GROUP BY a.id, a.views
)
SELECT 
  SUM(total_views) AS total_views,
  SUM(total_leads) AS total_leads,
  ROUND(
    SUM(total_leads) * 100.0 / NULLIF(SUM(total_views), 0),
    2
  ) AS conversion_rate_percentage
FROM announcement_stats;

COMMENT ON VIEW v_lead_conversion_rate IS 'Taxa de conversão de visualizações para leads';

-- ==========================================
-- 6. FUNÇÕES UTILITÁRIAS
-- ==========================================

-- Função: Adicionar entrada no histórico de assinatura
CREATE OR REPLACE FUNCTION add_subscription_history_entry(
  p_user_id UUID,
  p_subscription_id UUID,
  p_plan_id UUID,
  p_event_type TEXT,
  p_status TEXT,
  p_period_start TIMESTAMPTZ,
  p_period_end TIMESTAMPTZ,
  p_previous_plan_id UUID DEFAULT NULL,
  p_cancellation_reason TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_history_id UUID;
  v_plan_name TEXT;
  v_plan_price NUMERIC(10,2);
  v_mrr NUMERIC(10,2);
BEGIN
  -- Buscar informações do plano
  SELECT name, monthly_price INTO v_plan_name, v_plan_price
  FROM plans
  WHERE id = p_plan_id;

  -- Calcular MRR contribution
  v_mrr := CASE 
    WHEN p_status IN ('canceled', 'expired') THEN 0
    ELSE v_plan_price
  END;

  -- Inserir no histórico
  INSERT INTO subscription_history (
    user_id,
    subscription_id,
    plan_id,
    plan_name,
    plan_monthly_price,
    event_type,
    status,
    period_start,
    period_end,
    mrr_contribution,
    previous_plan_id,
    cancellation_reason
  ) VALUES (
    p_user_id,
    p_subscription_id,
    p_plan_id,
    v_plan_name,
    v_plan_price,
    p_event_type,
    p_status,
    p_period_start,
    p_period_end,
    v_mrr,
    p_previous_plan_id,
    p_cancellation_reason
  )
  RETURNING id INTO v_history_id;

  RETURN v_history_id;
END;
$$;

COMMENT ON FUNCTION add_subscription_history_entry IS 'Adiciona entrada no histórico de assinaturas automaticamente';

-- Função: Registrar conversão de lead
CREATE OR REPLACE FUNCTION log_lead_conversion(
  p_announcement_id UUID,
  p_viewer_id UUID,
  p_conversion_type TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conversion_id UUID;
BEGIN
  INSERT INTO lead_conversions (
    announcement_id,
    viewer_id,
    conversion_type
  ) VALUES (
    p_announcement_id,
    p_viewer_id,
    p_conversion_type
  )
  RETURNING id INTO v_conversion_id;

  RETURN v_conversion_id;
END;
$$;

COMMENT ON FUNCTION log_lead_conversion IS 'Registra conversão de lead (clique em contato)';

-- ==========================================
-- 7. TRIGGERS
-- ==========================================

-- Trigger: Auto-criar entrada no histórico quando subscription é criada
CREATE OR REPLACE FUNCTION trigger_create_subscription_history()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Adicionar entrada no histórico
  PERFORM add_subscription_history_entry(
    p_user_id := NEW.user_id,
    p_subscription_id := NEW.id,
    p_plan_id := NEW.plan_id,
    p_event_type := CASE 
      WHEN NEW.status = 'trialing' THEN 'trial_started'
      ELSE 'created'
    END,
    p_status := NEW.status,
    p_period_start := NEW.current_period_start,
    p_period_end := NEW.current_period_end
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_subscription_created
AFTER INSERT ON user_subscriptions
FOR EACH ROW
EXECUTE FUNCTION trigger_create_subscription_history();

-- Trigger: Auto-atualizar histórico quando subscription é modificada
CREATE OR REPLACE FUNCTION trigger_update_subscription_history()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_event_type TEXT;
  v_cancellation_reason TEXT;
BEGIN
  -- Determinar tipo de evento
  IF OLD.status = 'trialing' AND NEW.status = 'active' THEN
    v_event_type := 'trial_converted';
  ELSIF OLD.plan_id != NEW.plan_id THEN
    -- Verificar se é upgrade ou downgrade
    DECLARE
      v_old_price NUMERIC(10,2);
      v_new_price NUMERIC(10,2);
    BEGIN
      SELECT monthly_price INTO v_old_price FROM plans WHERE id = OLD.plan_id;
      SELECT monthly_price INTO v_new_price FROM plans WHERE id = NEW.plan_id;
      
      v_event_type := CASE 
        WHEN v_new_price > v_old_price THEN 'upgraded'
        ELSE 'downgraded'
      END;
    END;
  ELSIF NEW.status = 'canceled' THEN
    v_event_type := 'canceled';
    v_cancellation_reason := 'Cancelado pelo usuário';
  ELSIF NEW.status = 'expired' THEN
    v_event_type := 'expired';
  ELSE
    v_event_type := 'renewed';
  END IF;

  -- Adicionar entrada no histórico
  PERFORM add_subscription_history_entry(
    p_user_id := NEW.user_id,
    p_subscription_id := NEW.id,
    p_plan_id := NEW.plan_id,
    p_event_type := v_event_type,
    p_status := NEW.status,
    p_period_start := NEW.current_period_start,
    p_period_end := NEW.current_period_end,
    p_previous_plan_id := CASE WHEN OLD.plan_id != NEW.plan_id THEN OLD.plan_id ELSE NULL END,
    p_cancellation_reason := v_cancellation_reason
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_subscription_updated
AFTER UPDATE ON user_subscriptions
FOR EACH ROW
WHEN (
  OLD.status IS DISTINCT FROM NEW.status OR
  OLD.plan_id IS DISTINCT FROM NEW.plan_id
)
EXECUTE FUNCTION trigger_update_subscription_history();

-- ==========================================
-- 8. POLÍTICAS RLS
-- ==========================================

-- subscription_history: Apenas admins podem ver
ALTER TABLE subscription_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins_view_subscription_history"
ON subscription_history FOR SELECT
USING ((SELECT is_admin FROM users WHERE id = auth.uid()) = true);

-- marketing_costs: Apenas admins podem ver e editar
ALTER TABLE marketing_costs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins_manage_marketing_costs"
ON marketing_costs FOR ALL
USING ((SELECT is_admin FROM users WHERE id = auth.uid()) = true);

-- website_visits: Apenas admins podem ver
ALTER TABLE website_visits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins_view_website_visits"
ON website_visits FOR SELECT
USING ((SELECT is_admin FROM users WHERE id = auth.uid()) = true);

-- lead_conversions: Sistema pode inserir, admins podem ver
ALTER TABLE lead_conversions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "system_insert_lead_conversions"
ON lead_conversions FOR INSERT
WITH CHECK (true);

CREATE POLICY "admins_view_lead_conversions"
ON lead_conversions FOR SELECT
USING ((SELECT is_admin FROM users WHERE id = auth.uid()) = true);

-- ==========================================
-- SUCESSO
-- ==========================================

DO $$ 
BEGIN
  RAISE NOTICE '✅ Tabelas de BI criadas com sucesso';
  RAISE NOTICE '✅ subscription_history: Histórico de planos';
  RAISE NOTICE '✅ marketing_costs: Custos de marketing';
  RAISE NOTICE '✅ website_visits: Rastreamento de visitas';
  RAISE NOTICE '✅ lead_conversions: Conversões de leads';
  RAISE NOTICE '✅ 6 Views de análise criadas';
  RAISE NOTICE '✅ Funções e triggers configurados';
  RAISE NOTICE '✅ Políticas RLS aplicadas';
  RAISE NOTICE '';
  RAISE NOTICE '📊 Views disponíveis:';
  RAISE NOTICE '   - v_mrr_monthly (MRR mensal)';
  RAISE NOTICE '   - v_revenue_by_plan (Receita por plano)';
  RAISE NOTICE '   - v_churn_monthly (Taxa de churn)';
  RAISE NOTICE '   - v_free_to_paid_conversion (Conversão grátis→pago)';
  RAISE NOTICE '   - v_cac_monthly (CAC)';
  RAISE NOTICE '   - v_lead_conversion_rate (Taxa conversão de leads)';
END $$;
