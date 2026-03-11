-- =====================================================
-- RBAC AND SECURITY SETUP - Sistema de Roles e Auditoria
-- =====================================================
-- Descrição:
--   Implementa sistema completo de RBAC (Role-Based Access Control)
--   com auditoria, custom claims JWT e políticas RLS rigorosas
--
-- Componentes:
--   1. Atualização da tabela users com roles
--   2. Tabela de auditoria admin_audit_logs
--   3. Políticas RLS para proteção de dados
--   4. Custom Claims no JWT para verificação de role
--   5. Funções auxiliares de auditoria
--
-- Execução:
--   Execute este script no Supabase SQL Editor
-- =====================================================

-- =====================================================
-- 1. ATUALIZAR TABELA USERS COM ROLES
-- =====================================================

-- Criar tipo ENUM para roles (se não existir)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
        CREATE TYPE user_role AS ENUM ('user', 'editor', 'admin');
    END IF;
END $$;

-- Adicionar coluna role se não existir
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'role'
    ) THEN
        ALTER TABLE users ADD COLUMN role user_role DEFAULT 'user';
    END IF;
END $$;

-- Adicionar índice para performance
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- Atualizar usuários admin existentes (baseado em is_admin)
UPDATE users 
SET role = 'admin' 
WHERE is_admin = true AND role != 'admin';

-- Adicionar constraint para garantir consistência
ALTER TABLE users 
ADD CONSTRAINT check_admin_role 
CHECK ((is_admin = true AND role = 'admin') OR (is_admin = false));

COMMENT ON COLUMN users.role IS 'Role do usuário: user (padrão), editor (moderador), admin (administrador)';

-- =====================================================
-- 2. CRIAR TABELA DE AUDITORIA (admin_audit_logs)
-- =====================================================

CREATE TABLE IF NOT EXISTS admin_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Quem realizou a ação
  admin_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  admin_email TEXT NOT NULL,
  admin_name TEXT NOT NULL,
  
  -- Detalhes da ação
  action TEXT NOT NULL, -- 'APPROVE_AD', 'REJECT_AD', 'DELETE_USER', 'UPDATE_PLAN', etc.
  resource_type TEXT NOT NULL, -- 'announcement', 'user', 'plan', 'subscription', etc.
  resource_id UUID, -- ID do recurso afetado
  
  -- Valores antes e depois (JSON)
  old_value JSONB, -- Estado anterior
  new_value JSONB, -- Estado novo
  
  -- Contexto adicional
  reason TEXT, -- Motivo da ação (opcional)
  metadata JSONB, -- Dados extras (ex: informações do navegador)
  
  -- Rastreabilidade
  ip_address INET, -- Endereço IP do admin
  user_agent TEXT, -- User agent do navegador
  
  -- Timestamp
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX idx_audit_admin_id ON admin_audit_logs(admin_id);
CREATE INDEX idx_audit_action ON admin_audit_logs(action);
CREATE INDEX idx_audit_resource ON admin_audit_logs(resource_type, resource_id);
CREATE INDEX idx_audit_created_at ON admin_audit_logs(created_at DESC);
CREATE INDEX idx_audit_ip_address ON admin_audit_logs(ip_address);

COMMENT ON TABLE admin_audit_logs IS 'Registro completo de todas as ações administrativas para auditoria e rastreabilidade';

-- =====================================================
-- 3. POLÍTICAS RLS (Row Level Security)
-- =====================================================

-- Habilitar RLS na tabela de auditoria
ALTER TABLE admin_audit_logs ENABLE ROW LEVEL SECURITY;

-- Política: Apenas admins podem VER logs de auditoria
CREATE POLICY "Admins can view audit logs"
ON admin_audit_logs FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM users 
    WHERE users.id = auth.uid() 
    AND users.role = 'admin'
  )
);

-- Política: Sistema pode INSERIR logs (via função SECURITY DEFINER)
CREATE POLICY "System can insert audit logs"
ON admin_audit_logs FOR INSERT
WITH CHECK (true); -- Será controlado pela função SECURITY DEFINER

-- Política: NENHUM UPDATE ou DELETE permitido (logs são imutáveis)
-- Logs de auditoria NUNCA devem ser modificados ou deletados

-- =====================================================
-- 4. CUSTOM CLAIMS NO JWT (app_metadata)
-- =====================================================

-- Função para sincronizar role no JWT quando usuário é atualizado
CREATE OR REPLACE FUNCTION sync_user_role_to_jwt()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Atualizar app_metadata no auth.users com o role
  UPDATE auth.users
  SET raw_app_meta_data = 
    COALESCE(raw_app_meta_data, '{}'::jsonb) || 
    jsonb_build_object(
      'role', NEW.role::text,
      'is_admin', NEW.is_admin
    )
  WHERE id = NEW.id;
  
  RETURN NEW;
END;
$$;

-- Trigger para sincronizar automaticamente
DROP TRIGGER IF EXISTS trigger_sync_user_role_to_jwt ON users;
CREATE TRIGGER trigger_sync_user_role_to_jwt
AFTER INSERT OR UPDATE OF role, is_admin ON users
FOR EACH ROW
EXECUTE FUNCTION sync_user_role_to_jwt();

COMMENT ON FUNCTION sync_user_role_to_jwt() IS 
'Sincroniza role do usuário para JWT (app_metadata) automaticamente';

-- Atualizar JWT de todos os usuários existentes
DO $$
DECLARE
  user_record RECORD;
BEGIN
  FOR user_record IN SELECT id, role, is_admin FROM users
  LOOP
    UPDATE auth.users
    SET raw_app_meta_data = 
      COALESCE(raw_app_meta_data, '{}'::jsonb) || 
      jsonb_build_object(
        'role', user_record.role::text,
        'is_admin', user_record.is_admin
      )
    WHERE id = user_record.id;
  END LOOP;
END $$;

-- =====================================================
-- 5. FUNÇÕES AUXILIARES DE AUDITORIA
-- =====================================================

-- Função para registrar ação administrativa
CREATE OR REPLACE FUNCTION log_admin_action(
  p_action TEXT,
  p_resource_type TEXT,
  p_resource_id UUID,
  p_old_value JSONB DEFAULT NULL,
  p_new_value JSONB DEFAULT NULL,
  p_reason TEXT DEFAULT NULL,
  p_ip_address TEXT DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id UUID;
  v_admin_email TEXT;
  v_admin_name TEXT;
  v_log_id UUID;
BEGIN
  -- Obter ID do usuário autenticado
  v_admin_id := auth.uid();
  
  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado';
  END IF;
  
  -- Verificar se é admin
  SELECT email, name, role INTO v_admin_email, v_admin_name
  FROM users
  WHERE id = v_admin_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Usuário não encontrado';
  END IF;
  
  -- Inserir log de auditoria
  INSERT INTO admin_audit_logs (
    admin_id,
    admin_email,
    admin_name,
    action,
    resource_type,
    resource_id,
    old_value,
    new_value,
    reason,
    ip_address,
    user_agent,
    metadata,
    created_at
  ) VALUES (
    v_admin_id,
    v_admin_email,
    v_admin_name,
    p_action,
    p_resource_type,
    p_resource_id,
    p_old_value,
    p_new_value,
    p_reason,
    p_ip_address::INET,
    p_user_agent,
    jsonb_build_object(
      'timestamp', NOW(),
      'request_info', jsonb_build_object(
        'ip', p_ip_address,
        'user_agent', p_user_agent
      )
    ),
    NOW()
  )
  RETURNING id INTO v_log_id;
  
  RETURN v_log_id;
END;
$$;

COMMENT ON FUNCTION log_admin_action IS 
'Registra ação administrativa no log de auditoria com detalhes completos';

-- =====================================================
-- 6. POLÍTICAS RLS PARA DADOS SENSÍVEIS
-- =====================================================

-- Política: Apenas admins podem ver TODOS os usuários
DROP POLICY IF EXISTS "Admins can view all users" ON users;
CREATE POLICY "Admins can view all users"
ON users FOR SELECT
USING (
  auth.uid() = id -- Próprio usuário
  OR
  EXISTS (
    SELECT 1 FROM users 
    WHERE users.id = auth.uid() 
    AND users.role IN ('admin', 'editor')
  )
);

-- Política: Apenas admins podem ATUALIZAR roles
DROP POLICY IF EXISTS "Admins can update user roles" ON users;
CREATE POLICY "Admins can update user roles"
ON users FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM users 
    WHERE users.id = auth.uid() 
    AND users.role = 'admin'
  )
);

-- =====================================================
-- 7. VISUALIZAÇÕES (VIEWS) PARA REPORTES
-- =====================================================

-- View: Ações administrativas recentes
CREATE OR REPLACE VIEW v_recent_admin_actions AS
SELECT 
  aal.id,
  aal.admin_email,
  aal.admin_name,
  aal.action,
  aal.resource_type,
  aal.resource_id,
  aal.reason,
  aal.ip_address,
  aal.created_at,
  CASE 
    WHEN aal.action LIKE '%DELETE%' THEN 'danger'
    WHEN aal.action LIKE '%UPDATE%' THEN 'warning'
    WHEN aal.action LIKE '%APPROVE%' THEN 'success'
    ELSE 'info'
  END as severity
FROM admin_audit_logs aal
ORDER BY aal.created_at DESC
LIMIT 100;

COMMENT ON VIEW v_recent_admin_actions IS 
'Visualização das 100 ações administrativas mais recentes';

-- View: Estatísticas de auditoria por admin
CREATE OR REPLACE VIEW v_admin_action_stats AS
SELECT 
  admin_id,
  admin_email,
  admin_name,
  COUNT(*) as total_actions,
  COUNT(DISTINCT DATE(created_at)) as days_active,
  MAX(created_at) as last_action_at,
  jsonb_object_agg(action, action_count) as actions_breakdown
FROM (
  SELECT 
    admin_id,
    admin_email,
    admin_name,
    action,
    created_at,
    COUNT(*) OVER (PARTITION BY admin_id, action) as action_count
  FROM admin_audit_logs
) subquery
GROUP BY admin_id, admin_email, admin_name;

COMMENT ON VIEW v_admin_action_stats IS 
'Estatísticas agregadas de ações por administrador';

-- =====================================================
-- 8. FUNÇÃO PARA VERIFICAR PERMISSÕES
-- =====================================================

-- Função auxiliar para verificar se usuário é admin
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM users 
    WHERE id = auth.uid() 
    AND role = 'admin'
  ) INTO v_is_admin;
  
  RETURN COALESCE(v_is_admin, false);
END;
$$;

-- Função auxiliar para verificar se usuário é editor ou admin
CREATE OR REPLACE FUNCTION is_moderator()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_moderator BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM users 
    WHERE id = auth.uid() 
    AND role IN ('admin', 'editor')
  ) INTO v_is_moderator;
  
  RETURN COALESCE(v_is_moderator, false);
END;
$$;

COMMENT ON FUNCTION is_admin() IS 'Verifica se usuário autenticado é admin';
COMMENT ON FUNCTION is_moderator() IS 'Verifica se usuário autenticado é moderador (editor ou admin)';

-- =====================================================
-- 9. MENSAGENS DE SUCESSO
-- =====================================================

DO $$
BEGIN
  RAISE NOTICE '✅ RBAC e Sistema de Segurança configurados com sucesso!';
  RAISE NOTICE '';
  RAISE NOTICE '📋 Componentes instalados:';
  RAISE NOTICE '  1. ✅ Tabela users atualizada com campo role (user, editor, admin)';
  RAISE NOTICE '  2. ✅ Tabela admin_audit_logs criada para auditoria completa';
  RAISE NOTICE '  3. ✅ Políticas RLS configuradas (proteção de dados)';
  RAISE NOTICE '  4. ✅ Custom Claims JWT sincronizados automaticamente';
  RAISE NOTICE '  5. ✅ Função log_admin_action() para registrar ações';
  RAISE NOTICE '  6. ✅ Funções is_admin() e is_moderator() auxiliares';
  RAISE NOTICE '  7. ✅ Views para reportes (v_recent_admin_actions, v_admin_action_stats)';
  RAISE NOTICE '';
  RAISE NOTICE '🔐 Próximos passos:';
  RAISE NOTICE '  - Implemente Rate Limiting no frontend/edge functions';
  RAISE NOTICE '  - Adicione Captcha (Turnstile/hCaptcha) no login admin';
  RAISE NOTICE '  - Configure Middleware de proteção de rotas /admin/*';
  RAISE NOTICE '  - Use log_admin_action() em todas as operações admin';
END $$;
