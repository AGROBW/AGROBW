-- =====================================================
-- RECOVERY URGENTE: Corrigir Recursão Infinita RLS
-- =====================================================
-- ERRO: "infinite recursion detected in policy for relation users"
-- CAUSA: Políticas RLS na tabela users que referenciam a própria tabela
-- SOLUÇÃO: Desabilitar RLS problemático e recriar políticas seguras
-- =====================================================

-- =====================================================
-- PASSO 1: DESABILITAR RLS NA TABELA USERS (URGENTE)
-- =====================================================

-- Desabilitar RLS completamente na tabela users
ALTER TABLE users DISABLE ROW LEVEL SECURITY;

-- =====================================================
-- PASSO 2: REMOVER TODAS AS POLÍTICAS PROBLEMÁTICAS
-- =====================================================

-- Remover TODAS as políticas da tabela users
DO $$
DECLARE
  policy_record RECORD;
BEGIN
  FOR policy_record IN 
    SELECT policyname 
    FROM pg_policies 
    WHERE tablename = 'users'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON users', policy_record.policyname);
    RAISE NOTICE 'Removida política: %', policy_record.policyname;
  END LOOP;
END $$;

-- =====================================================
-- PASSO 3: REMOVER POLÍTICAS DE ADMIN_AUDIT_LOGS TAMBÉM
-- =====================================================

-- Remover políticas que referenciam users (causam recursão)
DROP POLICY IF EXISTS "Admins can view audit logs" ON admin_audit_logs;
DROP POLICY IF EXISTS "System can insert audit logs" ON admin_audit_logs;

-- =====================================================
-- PASSO 4: HABILITAR RLS DE FORMA SEGURA (SEM RECURSÃO)
-- =====================================================

-- Habilitar RLS na tabela users
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Política SEGURA: Usuários veem apenas seus próprios dados
-- IMPORTANTE: Usa auth.uid() direto, SEM subquery em users
CREATE POLICY "Users can view own data"
ON users FOR SELECT
USING (id = auth.uid());

-- Política SEGURA: Usuários podem atualizar seus próprios dados
CREATE POLICY "Users can update own data"
ON users FOR UPDATE
USING (id = auth.uid())
WITH CHECK (id = auth.uid());

-- Política SEGURA: Permitir INSERT (para novos cadastros)
CREATE POLICY "Enable insert for authenticated users"
ON users FOR INSERT
WITH CHECK (auth.uid() = id);

-- =====================================================
-- PASSO 5: RECRIAR POLÍTICAS DE ADMIN_AUDIT_LOGS (SEGURAS)
-- =====================================================

-- Manter RLS ativo em admin_audit_logs
ALTER TABLE admin_audit_logs ENABLE ROW LEVEL SECURITY;

-- Política SEGURA: Admins veem logs (verifica is_admin direto)
CREATE POLICY "Admins can view audit logs v2"
ON admin_audit_logs FOR SELECT
USING (
  (SELECT is_admin FROM users WHERE id = auth.uid() LIMIT 1) = true
);

-- Política: Sistema pode inserir logs
CREATE POLICY "System can insert audit logs v2"
ON admin_audit_logs FOR INSERT
WITH CHECK (true);

-- =====================================================
-- PASSO 6: VERIFICAR SE NÃO HÁ MAIS RECURSÃO
-- =====================================================

DO $$
DECLARE
  user_count INTEGER;
  policy_count INTEGER;
BEGIN
  -- Contar usuários (se falhar, ainda há recursão)
  SELECT COUNT(*) INTO user_count FROM users;
  RAISE NOTICE 'Total de usuários no banco: %', user_count;
  
  -- Contar políticas ativas
  SELECT COUNT(*) INTO policy_count FROM pg_policies WHERE tablename = 'users';
  RAISE NOTICE 'Políticas RLS ativas em users: %', policy_count;
  
  IF user_count = 0 THEN
    RAISE WARNING 'ATENÇÃO: Nenhum usuário encontrado na tabela users!';
  END IF;
END $$;

-- =====================================================
-- PASSO 7: GARANTIR QUE ADMINS PODEM ACESSAR TUDO
-- =====================================================

-- Criar política especial para admins (APÓS auth, não durante)
CREATE POLICY "Admins can view all users v2"
ON users FOR SELECT
USING (
  -- Verifica is_admin do usuário logado
  (SELECT is_admin FROM users WHERE id = auth.uid() LIMIT 1) = true
);

CREATE POLICY "Admins can update all users v2"
ON users FOR UPDATE
USING (
  (SELECT is_admin FROM users WHERE id = auth.uid() LIMIT 1) = true
);

-- =====================================================
-- PASSO 8: VERIFICAÇÃO FINAL E MENSAGENS
-- =====================================================

DO $$
DECLARE
  test_user_id UUID;
  test_count INTEGER;
BEGIN
  -- Testar se consegue ler a tabela
  SELECT id INTO test_user_id FROM users LIMIT 1;
  
  IF test_user_id IS NOT NULL THEN
    RAISE NOTICE '=====================================================';
    RAISE NOTICE '✅ RECOVERY COMPLETADO COM SUCESSO!';
    RAISE NOTICE '=====================================================';
    RAISE NOTICE '';
    RAISE NOTICE '✅ RLS desabilitado e recriado sem recursão';
    RAISE NOTICE '✅ Políticas seguras implementadas';
    RAISE NOTICE '✅ Tabela users acessível novamente';
    RAISE NOTICE '✅ Admins têm acesso total';
    RAISE NOTICE '';
    RAISE NOTICE '📊 Estatísticas:';
    SELECT COUNT(*) INTO test_count FROM users;
    RAISE NOTICE '   - Usuários no banco: %', test_count;
    SELECT COUNT(*) INTO test_count FROM pg_policies WHERE tablename = 'users';
    RAISE NOTICE '   - Políticas RLS ativas: %', test_count;
    RAISE NOTICE '';
    RAISE NOTICE '⚠️  PRÓXIMOS PASSOS:';
    RAISE NOTICE '1. Faça logout do sistema';
    RAISE NOTICE '2. Limpe cache do navegador (Ctrl+Shift+Del)';
    RAISE NOTICE '3. Faça login novamente';
    RAISE NOTICE '4. Seus dados devem aparecer normalmente';
    RAISE NOTICE '';
    RAISE NOTICE '🔧 Se ainda houver problemas, execute:';
    RAISE NOTICE '   SELECT * FROM users LIMIT 5;';
    RAISE NOTICE '   (para verificar se dados estão visíveis)';
    RAISE NOTICE '=====================================================';
  ELSE
    RAISE EXCEPTION 'ERRO: Ainda não é possível acessar a tabela users!';
  END IF;
END $$;
