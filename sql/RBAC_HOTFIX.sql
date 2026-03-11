-- =====================================================
-- HOTFIX: RBAC Security - Corrigir Erro 500
-- =====================================================
-- Este script corrige o erro 500 causado pelo trigger
-- sync_user_role_to_jwt que não tem permissão para 
-- atualizar auth.users
-- =====================================================

-- 1. DESABILITAR O TRIGGER PROBLEMÁTICO
DROP TRIGGER IF EXISTS trigger_sync_user_role_to_jwt ON users;

-- 2. REMOVER A FUNÇÃO (causando erro)
DROP FUNCTION IF EXISTS sync_user_role_to_jwt();

-- 3. VERIFICAR POLÍTICAS RLS (podem estar causando problema)
-- Remover temporariamente políticas que referenciam 'role'
DROP POLICY IF EXISTS "Admins can view audit logs" ON admin_audit_logs;

-- 4. RECRIAR POLÍTICA RLS MAIS SEGURA (usando is_admin)
CREATE POLICY "Admins can view audit logs"
ON admin_audit_logs FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM users 
    WHERE users.id = auth.uid() 
    AND users.is_admin = true
  )
);

-- 5. ATUALIZAR USUÁRIOS EXISTENTES (garantir que role está configurado)
UPDATE users SET role = 'user' WHERE role IS NULL;
UPDATE users SET role = 'admin' WHERE is_admin = true AND role != 'admin';

-- 6. VERIFICAÇÃO DE INTEGRIDADE
DO $$
BEGIN
  -- Verificar se todos os usuários têm role
  IF EXISTS (SELECT 1 FROM users WHERE role IS NULL) THEN
    RAISE EXCEPTION 'Ainda existem usuários sem role definido';
  END IF;
  
  -- Verificar se admins têm role correto
  IF EXISTS (SELECT 1 FROM users WHERE is_admin = true AND role != 'admin') THEN
    RAISE WARNING 'Alguns admins não têm role=admin, corrigindo...';
    UPDATE users SET role = 'admin' WHERE is_admin = true;
  END IF;
END $$;

-- =====================================================
-- MENSAGENS DE SUCESSO
-- =====================================================

DO $$
BEGIN
  RAISE NOTICE '=====================================================';
  RAISE NOTICE '✅ HOTFIX APLICADO COM SUCESSO';
  RAISE NOTICE '=====================================================';
  RAISE NOTICE '';
  RAISE NOTICE '✅ Trigger problemático desabilitado';
  RAISE NOTICE '✅ Função sync_user_role_to_jwt removida';
  RAISE NOTICE '✅ Políticas RLS corrigidas (usando is_admin)';
  RAISE NOTICE '✅ Usuários atualizados com role padrão';
  RAISE NOTICE '';
  RAISE NOTICE '⚠️  IMPORTANTE:';
  RAISE NOTICE '- O sync automático de JWT foi desabilitado';
  RAISE NOTICE '- Roles ainda funcionam normalmente no sistema';
  RAISE NOTICE '- JWT pode ser atualizado manualmente se necessário';
  RAISE NOTICE '';
  RAISE NOTICE '🔧 Para atualizar JWT manualmente (se necessário):';
  RAISE NOTICE '   Use o Dashboard do Supabase > Auth > Users';
  RAISE NOTICE '   Edite User Metadata manualmente';
  RAISE NOTICE '';
  RAISE NOTICE '✅ Sistema deve funcionar normalmente agora!';
  RAISE NOTICE '=====================================================';
END $$;
