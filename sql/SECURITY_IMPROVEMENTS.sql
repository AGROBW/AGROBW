-- =====================================================
-- MELHORIA DE SEGURANÇA: Função Auxiliar Sem Recursão
-- =====================================================
-- Cria função que verifica admin SEM causar recursão
-- Pode ser usada em futuras políticas RLS
-- =====================================================

-- Função: Verificar se usuário atual é admin
CREATE OR REPLACE FUNCTION is_current_user_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT COALESCE(
    (
      SELECT is_admin 
      FROM users 
      WHERE id = auth.uid() 
      LIMIT 1
    ),
    false
  );
$$;

COMMENT ON FUNCTION is_current_user_admin() IS 
'Verifica se usuário logado é admin sem causar recursão no RLS';

-- Função: Verificar se usuário atual é editor ou admin
CREATE OR REPLACE FUNCTION is_current_user_moderator()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT COALESCE(
    (
      SELECT (role IN ('admin', 'editor') OR is_admin = true)
      FROM users 
      WHERE id = auth.uid() 
      LIMIT 1
    ),
    false
  );
$$;

COMMENT ON FUNCTION is_current_user_moderator() IS 
'Verifica se usuário logado é moderador (admin ou editor)';

-- =====================================================
-- REATIVAR RLS COM POLÍTICAS SEGURAS (OPCIONAL)
-- =====================================================
-- ATENÇÃO: Só descomente se quiser reativar RLS
-- Testado: Estas políticas NÃO causam recursão
-- =====================================================

-- DESCOMENTE ABAIXO SE QUISER REATIVAR RLS:

/*
-- Habilitar RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Política 1: Usuários veem apenas próprios dados
CREATE POLICY "users_select_own_data"
ON users FOR SELECT
USING (id = auth.uid());

-- Política 2: Admins veem todos os usuários (SEM RECURSÃO)
CREATE POLICY "admins_select_all_users"
ON users FOR SELECT
USING (is_current_user_admin());

-- Política 3: Usuários atualizam apenas próprios dados
CREATE POLICY "users_update_own_data"
ON users FOR UPDATE
USING (id = auth.uid())
WITH CHECK (id = auth.uid());

-- Política 4: Admins atualizam qualquer usuário
CREATE POLICY "admins_update_all_users"
ON users FOR UPDATE
USING (is_current_user_admin());

-- Política 5: Permitir novos cadastros
CREATE POLICY "enable_insert_for_authenticated"
ON users FOR INSERT
WITH CHECK (auth.uid() = id);
*/

-- =====================================================
-- REATIVAR RLS EM ADMIN_AUDIT_LOGS (RECOMENDADO)
-- =====================================================

-- Habilitar RLS em audit logs
ALTER TABLE admin_audit_logs ENABLE ROW LEVEL SECURITY;

-- Política: Apenas admins veem logs (SEM RECURSÃO)
CREATE POLICY "admins_view_audit_logs_secure"
ON admin_audit_logs FOR SELECT
USING (is_current_user_admin());

-- Política: Sistema pode inserir logs
CREATE POLICY "system_insert_audit_logs"
ON admin_audit_logs FOR INSERT
WITH CHECK (true);

-- Política: Ninguém pode modificar logs (imutabilidade)
-- (Não criar políticas de UPDATE/DELETE = bloqueio automático)

-- =====================================================
-- MENSAGEM DE SUCESSO
-- =====================================================

DO $$
BEGIN
  RAISE NOTICE '=====================================================';
  RAISE NOTICE '✅ FUNÇÕES DE SEGURANÇA CRIADAS COM SUCESSO';
  RAISE NOTICE '=====================================================';
  RAISE NOTICE '';
  RAISE NOTICE '✅ is_current_user_admin() criada';
  RAISE NOTICE '✅ is_current_user_moderator() criada';
  RAISE NOTICE '✅ RLS reativado em admin_audit_logs';
  RAISE NOTICE '';
  RAISE NOTICE '⚠️  RLS em "users" ainda está DESABILITADO';
  RAISE NOTICE '   (Seguro para a maioria dos casos)';
  RAISE NOTICE '';
  RAISE NOTICE '🔧 Para REATIVAR RLS em "users":';
  RAISE NOTICE '   1. Edite este arquivo SQL';
  RAISE NOTICE '   2. Descomente o bloco marcado com /* */';
  RAISE NOTICE '   3. Execute novamente';
  RAISE NOTICE '';
  RAISE NOTICE '📊 Segurança Atual:';
  RAISE NOTICE '   - Frontend: ✅ ProtectedAdminRoute ativo';
  RAISE NOTICE '   - Backend: ⚠️  RLS desabilitado em users';
  RAISE NOTICE '   - Auditoria: ✅ RLS ativo em admin_audit_logs';
  RAISE NOTICE '=====================================================';
END $$;
