-- ================================================
-- SECURITY EVENTS TABLE & LOGGING SYSTEM
-- ================================================
-- Descrição: Sistema de auditoria de tentativas de acesso não autorizado
-- Autor: Sistema BWAGRO
-- Data: 12/03/2026
-- 
-- Features:
-- - Tabela security_events para registrar tentativas de invasão
-- - Função SECURITY DEFINER para permitir logging mesmo com RLS restrito
-- - View para análise de eventos críticos
-- - Políticas RLS para proteger dados sensíveis
-- ================================================

-- ================================================
-- PASSO 1: Criar Tipo de Severidade
-- ================================================

DO $$ BEGIN
  CREATE TYPE severity_level AS ENUM ('info', 'warning', 'critical', 'blocked');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ================================================
-- PASSO 2: Criar Tabela de Eventos de Segurança
-- ================================================

CREATE TABLE IF NOT EXISTS security_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Identificação do Usuário
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  email TEXT, -- Pode ser null se tentativa anônima
  
  -- Detalhes da Tentativa
  attempted_route TEXT NOT NULL, -- Ex: '/admin', '/admin/users'
  attempted_action TEXT, -- Ex: 'access_admin_panel', 'view_users'
  
  -- Informações de Rede
  ip_address INET, -- Tipo específico para IPs
  user_agent TEXT, -- Browser/Device info
  
  -- Metadados de Segurança
  severity severity_level DEFAULT 'warning',
  reason TEXT, -- Ex: 'Insufficient role: user (required: admin)'
  
  -- Contexto Adicional (JSONB para flexibilidade)
  metadata JSONB DEFAULT '{}'::jsonb,
  
  -- Timestamp
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Índices para Performance
  CONSTRAINT valid_severity CHECK (severity IN ('info', 'warning', 'critical', 'blocked'))
);

-- Comentários nas colunas
COMMENT ON TABLE security_events IS 'Auditoria de tentativas de acesso não autorizado';
COMMENT ON COLUMN security_events.user_id IS 'ID do usuário que tentou acessar (null se anônimo)';
COMMENT ON COLUMN security_events.email IS 'Email do usuário (cache para análise)';
COMMENT ON COLUMN security_events.attempted_route IS 'Rota que foi bloqueada';
COMMENT ON COLUMN security_events.ip_address IS 'Endereço IP da tentativa';
COMMENT ON COLUMN security_events.severity IS 'Nível de criticidade: info, warning, critical, blocked';
COMMENT ON COLUMN security_events.metadata IS 'Dados adicionais em formato JSON';

-- ================================================
-- PASSO 3: Criar Índices para Performance
-- ================================================

CREATE INDEX IF NOT EXISTS idx_security_events_user_id 
  ON security_events(user_id);

CREATE INDEX IF NOT EXISTS idx_security_events_created_at 
  ON security_events(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_security_events_severity 
  ON security_events(severity);

CREATE INDEX IF NOT EXISTS idx_security_events_ip_address 
  ON security_events(ip_address);

-- Índice composto para queries comuns
CREATE INDEX IF NOT EXISTS idx_security_events_user_severity 
  ON security_events(user_id, severity, created_at DESC);

-- ================================================
-- PASSO 4: Função para Logging (SECURITY DEFINER)
-- ================================================

CREATE OR REPLACE FUNCTION log_security_event(
  p_user_id UUID,
  p_email TEXT,
  p_attempted_route TEXT,
  p_attempted_action TEXT DEFAULT NULL,
  p_ip_address TEXT DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL,
  p_severity TEXT DEFAULT 'warning',
  p_reason TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER -- ← Executa com permissões elevadas, ignora RLS
SET search_path = public
AS $$
DECLARE
  v_event_id UUID;
  v_ip_inet INET;
BEGIN
  -- Converter IP string para tipo INET (com validação)
  BEGIN
    v_ip_inet := p_ip_address::INET;
  EXCEPTION
    WHEN OTHERS THEN
      v_ip_inet := NULL; -- IP inválido, usar NULL
  END;

  -- Inserir evento de segurança
  INSERT INTO security_events (
    user_id,
    email,
    attempted_route,
    attempted_action,
    ip_address,
    user_agent,
    severity,
    reason,
    metadata,
    created_at
  ) VALUES (
    p_user_id,
    p_email,
    p_attempted_route,
    p_attempted_action,
    v_ip_inet,
    p_user_agent,
    p_severity::severity_level,
    p_reason,
    p_metadata,
    NOW()
  )
  RETURNING id INTO v_event_id;

  -- Log no servidor (para monitoramento)
  RAISE NOTICE 'Security Event: % - User: % - Route: %', 
    p_severity, COALESCE(p_email, 'anonymous'), p_attempted_route;

  RETURN v_event_id;
END;
$$;

-- Comentário na função
COMMENT ON FUNCTION log_security_event IS 
  'Registra tentativa de acesso não autorizado. Usa SECURITY DEFINER para permitir logging mesmo com RLS restrito.';

-- ================================================
-- PASSO 5: Função Simplificada (Client-Side)
-- ================================================

CREATE OR REPLACE FUNCTION log_unauthorized_access(
  p_attempted_route TEXT,
  p_reason TEXT DEFAULT 'Acesso não autorizado'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_user_id UUID;
  v_current_email TEXT;
BEGIN
  -- Obter informações do usuário autenticado (se existir)
  SELECT id, email INTO v_current_user_id, v_current_email
  FROM users
  WHERE id = auth.uid()
  LIMIT 1;

  -- Logar evento
  RETURN log_security_event(
    p_user_id := v_current_user_id,
    p_email := v_current_email,
    p_attempted_route := p_attempted_route,
    p_attempted_action := 'unauthorized_access',
    p_severity := 'blocked',
    p_reason := p_reason
  );
END;
$$;

COMMENT ON FUNCTION log_unauthorized_access IS 
  'Versão simplificada para uso no client-side. Detecta usuário automaticamente.';

-- ================================================
-- PASSO 6: View para Eventos Críticos (Últimos 30 dias)
-- ================================================

CREATE OR REPLACE VIEW v_critical_security_events AS
SELECT 
  se.id,
  se.user_id,
  u.name AS user_name,
  se.email,
  se.attempted_route,
  se.attempted_action,
  se.ip_address,
  se.severity,
  se.reason,
  se.created_at,
  -- Contar tentativas do mesmo usuário
  COUNT(*) OVER (
    PARTITION BY se.user_id 
    ORDER BY se.created_at 
    ROWS BETWEEN 6 PRECEDING AND CURRENT ROW
  ) AS recent_attempts
FROM security_events se
LEFT JOIN users u ON se.user_id = u.id
WHERE 
  se.severity IN ('critical', 'blocked')
  AND se.created_at >= NOW() - INTERVAL '30 days'
ORDER BY se.created_at DESC;

COMMENT ON VIEW v_critical_security_events IS 
  'Eventos críticos dos últimos 30 dias com contador de tentativas repetidas';

-- ================================================
-- PASSO 7: View para Estatísticas de Segurança
-- ================================================

CREATE OR REPLACE VIEW v_security_stats AS
SELECT
  -- Contadores por severidade
  COUNT(*) FILTER (WHERE severity = 'critical') AS critical_count,
  COUNT(*) FILTER (WHERE severity = 'blocked') AS blocked_count,
  COUNT(*) FILTER (WHERE severity = 'warning') AS warning_count,
  COUNT(*) FILTER (WHERE severity = 'info') AS info_count,
  
  -- Total
  COUNT(*) AS total_events,
  
  -- Top 5 IPs com mais tentativas
  (
    SELECT jsonb_agg(row_to_json(t))
    FROM (
      SELECT 
        ip_address::TEXT,
        COUNT(*) AS attempts
      FROM security_events
      WHERE ip_address IS NOT NULL
      GROUP BY ip_address
      ORDER BY attempts DESC
      LIMIT 5
    ) t
  ) AS top_ips,
  
  -- Top 5 rotas mais atacadas
  (
    SELECT jsonb_agg(row_to_json(t))
    FROM (
      SELECT 
        attempted_route,
        COUNT(*) AS attempts
      FROM security_events
      GROUP BY attempted_route
      ORDER BY attempts DESC
      LIMIT 5
    ) t
  ) AS top_routes,
  
  -- Período de análise
  MIN(created_at) AS first_event,
  MAX(created_at) AS last_event
FROM security_events
WHERE created_at >= NOW() - INTERVAL '30 days';

COMMENT ON VIEW v_security_stats IS 
  'Estatísticas agregadas de segurança (últimos 30 dias)';

-- ================================================
-- PASSO 8: Políticas RLS (Row Level Security)
-- ================================================

-- Habilitar RLS
ALTER TABLE security_events ENABLE ROW LEVEL SECURITY;

-- Policy 1: Apenas admins podem visualizar eventos
CREATE POLICY "admins_view_security_events"
ON security_events FOR SELECT
USING (
  (SELECT is_admin FROM users WHERE id = auth.uid() LIMIT 1) = true
);

-- Policy 2: Sistema pode inserir (via funções SECURITY DEFINER)
-- Nota: Como as funções são SECURITY DEFINER, elas executam com 
-- permissões elevadas e não precisam de policy explícita.
-- Mas vamos criar uma policy de fallback:
CREATE POLICY "system_insert_security_events"
ON security_events FOR INSERT
WITH CHECK (true); -- Permite inserção via funções

-- Policy 3: Ninguém pode atualizar ou deletar (apenas inserção e leitura)
CREATE POLICY "no_update_security_events"
ON security_events FOR UPDATE
USING (false);

CREATE POLICY "no_delete_security_events"
ON security_events FOR DELETE
USING (false);

-- ================================================
-- PASSO 9: Função para Limpar Eventos Antigos
-- ================================================

CREATE OR REPLACE FUNCTION cleanup_old_security_events(
  p_days_to_keep INTEGER DEFAULT 90
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted_count INTEGER;
BEGIN
  -- Deletar eventos mais antigos que X dias
  DELETE FROM security_events
  WHERE created_at < NOW() - (p_days_to_keep || ' days')::INTERVAL;
  
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  
  RAISE NOTICE 'Cleanup: % eventos de segurança antigos removidos', v_deleted_count;
  
  RETURN v_deleted_count;
END;
$$;

COMMENT ON FUNCTION cleanup_old_security_events IS 
  'Remove eventos de segurança mais antigos que N dias (padrão: 90). Deve ser executado periodicamente.';

-- ================================================
-- PASSO 10: Trigger para Alertas Automáticos
-- ================================================

CREATE OR REPLACE FUNCTION notify_critical_security_event()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Se evento é crítico, notificar via PostgreSQL NOTIFY
  IF NEW.severity IN ('critical', 'blocked') THEN
    PERFORM pg_notify(
      'critical_security_alert',
      json_build_object(
        'event_id', NEW.id,
        'user_id', NEW.user_id,
        'email', NEW.email,
        'route', NEW.attempted_route,
        'ip', NEW.ip_address,
        'severity', NEW.severity,
        'timestamp', NEW.created_at
      )::text
    );
  END IF;
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_notify_critical_event
AFTER INSERT ON security_events
FOR EACH ROW
WHEN (NEW.severity IN ('critical', 'blocked'))
EXECUTE FUNCTION notify_critical_security_event();

COMMENT ON TRIGGER trigger_notify_critical_event ON security_events IS 
  'Dispara notificação PostgreSQL NOTIFY para eventos críticos';

-- ================================================
-- SUCESSO
-- ================================================

DO $$ 
BEGIN
  RAISE NOTICE '✅ Tabela security_events criada com sucesso';
  RAISE NOTICE '✅ Funções de logging configuradas (SECURITY DEFINER)';
  RAISE NOTICE '✅ Views de análise criadas';
  RAISE NOTICE '✅ Políticas RLS aplicadas';
  RAISE NOTICE '✅ Triggers de notificação habilitados';
  RAISE NOTICE '';
  RAISE NOTICE '📊 Para ver estatísticas: SELECT * FROM v_security_stats;';
  RAISE NOTICE '🚨 Para ver eventos críticos: SELECT * FROM v_critical_security_events;';
  RAISE NOTICE '🧹 Para limpar eventos antigos: SELECT cleanup_old_security_events(90);';
END $$;
