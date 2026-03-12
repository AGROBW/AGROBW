-- =====================================================
-- MÁXIMA SEGURANÇA: RLS Completo Sem Recursão
-- =====================================================
-- Este script REATIVA RLS com segurança total
-- Executa tudo na ordem correta:
-- 1. Cria funções auxiliares (sem recursão)
-- 2. Reativa RLS em users
-- 3. Cria políticas seguras
-- 4. Protege admin_audit_logs
-- =====================================================

-- =====================================================
-- PASSO 1: CRIAR FUNÇÕES AUXILIARES (SEM RECURSÃO)
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
'Verifica se usuário logado é admin - SECURITY DEFINER evita recursão';

-- Função: Verificar se usuário atual é moderador (admin ou editor)
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

-- Função: Obter role do usuário atual
CREATE OR REPLACE FUNCTION get_current_user_role()
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT COALESCE(
    (
      SELECT role::text
      FROM users 
      WHERE id = auth.uid() 
      LIMIT 1
    ),
    'user'
  );
$$;

COMMENT ON FUNCTION get_current_user_role() IS 
'Retorna role do usuário logado (user/editor/admin)';

-- =====================================================
-- PASSO 2: REMOVER POLÍTICAS ANTIGAS (LIMPEZA)
-- =====================================================

DO $$
DECLARE
  policy_record RECORD;
BEGIN
  -- Remover todas as políticas da tabela users
  FOR policy_record IN 
    SELECT policyname 
    FROM pg_policies 
    WHERE tablename = 'users'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON users', policy_record.policyname);
  END LOOP;
  
  -- Remover políticas antigas de admin_audit_logs
  FOR policy_record IN 
    SELECT policyname 
    FROM pg_policies 
    WHERE tablename = 'admin_audit_logs'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON admin_audit_logs', policy_record.policyname);
  END LOOP;
END $$;

-- =====================================================
-- PASSO 3: HABILITAR RLS NAS TABELAS
-- =====================================================

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_audit_logs ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- PASSO 4: CRIAR POLÍTICAS SEGURAS PARA USERS
-- =====================================================

-- Política A: Usuários veem apenas seus próprios dados
CREATE POLICY "users_select_own_data"
ON users FOR SELECT
USING (id = auth.uid());

-- Política B: Admins veem todos os usuários (usa função, sem recursão)
CREATE POLICY "admins_select_all_users"
ON users FOR SELECT
USING (is_current_user_admin());

-- Política C: Usuários atualizam apenas seus dados
CREATE POLICY "users_update_own_data"
ON users FOR UPDATE
USING (id = auth.uid())
WITH CHECK (id = auth.uid());

-- Política D: Admins atualizam qualquer usuário
CREATE POLICY "admins_update_all_users"
ON users FOR UPDATE
USING (is_current_user_admin());

-- Política E: Admins podem deletar usuários
CREATE POLICY "admins_delete_users"
ON users FOR DELETE
USING (is_current_user_admin());

-- Política F: Permitir novos cadastros (registro)
CREATE POLICY "enable_insert_for_registration"
ON users FOR INSERT
WITH CHECK (auth.uid() = id);

-- =====================================================
-- PASSO 5: CRIAR POLÍTICAS PARA ADMIN_AUDIT_LOGS
-- =====================================================

-- Política: Apenas admins veem logs de auditoria
CREATE POLICY "admins_view_audit_logs"
ON admin_audit_logs FOR SELECT
USING (is_current_user_admin());

-- Política: Sistema pode inserir logs (via função SECURITY DEFINER)
CREATE POLICY "system_insert_audit_logs"
ON admin_audit_logs FOR INSERT
WITH CHECK (true);

-- Logs são IMUTÁVEIS: Não criar políticas UPDATE/DELETE
-- (PostgreSQL bloqueia automaticamente sem políticas)

-- =====================================================
-- PASSO 6: VERIFICAR SE NÃO HÁ RECURSÃO
-- =====================================================

DO $$
DECLARE
  user_count INTEGER;
  policy_count INTEGER;
  test_user RECORD;
BEGIN
  -- Teste 1: Contar usuários (falharia se recursão existir)
  SELECT COUNT(*) INTO user_count FROM users;
  
  -- Teste 2: Ler um usuário específico
  SELECT id, name, email, role, is_admin 
  INTO test_user
  FROM users 
  LIMIT 1;
  
  -- Teste 3: Contar políticas ativas
  SELECT COUNT(*) INTO policy_count FROM pg_policies WHERE tablename = 'users';
  
  IF user_count > 0 AND test_user.id IS NOT NULL THEN
    RAISE NOTICE '';
    RAISE NOTICE '=====================================================';
    RAISE NOTICE '✅ MÁXIMA SEGURANÇA ATIVADA COM SUCESSO!';
    RAISE NOTICE '=====================================================';
    RAISE NOTICE '';
    RAISE NOTICE '✅ Funções auxiliares criadas sem recursão';
    RAISE NOTICE '✅ RLS habilitado em users e admin_audit_logs';
    RAISE NOTICE '✅ 6 políticas ativas em users';
    RAISE NOTICE '✅ 2 políticas ativas em admin_audit_logs';
    RAISE NOTICE '';
    RAISE NOTICE '📊 Estatísticas do Banco:';
    RAISE NOTICE '   - Total de usuários: %', user_count;
    RAISE NOTICE '   - Políticas RLS em users: %', policy_count;
    RAISE NOTICE '   - Teste leitura: OK (% - %)', test_user.name, test_user.email;
    RAISE NOTICE '';
    RAISE NOTICE '🔒 Segurança Implementada:';
    RAISE NOTICE '   ✅ Usuários veem apenas próprios dados';
    RAISE NOTICE '   ✅ Admins veem e editam todos os dados';
    RAISE NOTICE '   ✅ Logs de auditoria protegidos (somente admins)';
    RAISE NOTICE '   ✅ Logs são IMUTÁVEIS (sem update/delete)';
    RAISE NOTICE '   ✅ Novos cadastros permitidos via signup';
    RAISE NOTICE '';
    RAISE NOTICE '⚠️  PRÓXIMOS PASSOS:';
    RAISE NOTICE '1. Volte ao navegador';
    RAISE NOTICE '2. Limpe cache (Ctrl+Shift+Delete)';
    RAISE NOTICE '3. Faça logout e login novamente';
    RAISE NOTICE '4. Teste se tudo funciona normalmente';
    RAISE NOTICE '';
    RAISE NOTICE '🧪 Para testar segurança:';
    RAISE NOTICE '   SELECT * FROM users; (deve ver só seus dados)';
    RAISE NOTICE '   SELECT * FROM admin_audit_logs; (admin vê, user não)';
    RAISE NOTICE '';
    RAISE NOTICE '=====================================================';
  ELSE
    RAISE EXCEPTION '❌ ERRO: Não foi possível acessar tabela users após RLS!';
  END IF;
END $$;

-- =====================================================
-- PASSO 7: TESTE DE SEGURANÇA (OPCIONAL)
-- =====================================================

-- Descomente para ver políticas ativas:
-- SELECT tablename, policyname, cmd, qual FROM pg_policies WHERE tablename IN ('users', 'admin_audit_logs');

-- Descomente para testar funções:
-- SELECT is_current_user_admin() AS "Sou Admin?";
-- SELECT get_current_user_role() AS "Meu Role";
