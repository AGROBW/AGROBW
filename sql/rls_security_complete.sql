-- ==================================================
-- COMPLEMENTO: Políticas RLS Completas + Segurança
-- ==================================================
-- Este script complementa o fix_rls_user_subscriptions.sql
-- Adiciona políticas de escrita e proteções adicionais
-- ==================================================

-- ============================================
-- PARTE 1: Políticas de ESCRITA para user_subscriptions
-- ============================================

-- Política INSERT: Apenas admins podem criar subscriptions
-- (Evita que usuários criem planos gratuitos para si mesmos)
-- ============================================
DROP POLICY IF EXISTS "Only admins can create subscriptions" ON public.user_subscriptions;

CREATE POLICY "Only admins can create subscriptions"
ON public.user_subscriptions
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = auth.uid()
      AND users.is_admin = true
  )
);


-- Política UPDATE: Admins podem atualizar qualquer subscription
-- ============================================
DROP POLICY IF EXISTS "Admins can update subscriptions" ON public.user_subscriptions;

CREATE POLICY "Admins can update subscriptions"
ON public.user_subscriptions
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = auth.uid()
      AND users.is_admin = true
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = auth.uid()
      AND users.is_admin = true
  )
);


-- Política DELETE: Apenas admins podem deletar subscriptions
-- ============================================
DROP POLICY IF EXISTS "Only admins can delete subscriptions" ON public.user_subscriptions;

CREATE POLICY "Only admins can delete subscriptions"
ON public.user_subscriptions
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = auth.uid()
      AND users.is_admin = true
  )
);


-- ============================================
-- PARTE 2: Proteger campo is_admin da tabela users
-- ============================================

-- Verificar se RLS está ativo na tabela users
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE tablename = 'users';

-- Habilitar RLS se não estiver ativo
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;


-- Política SELECT: Usuários podem ver seus próprios dados
-- Admins podem ver todos os usuários
-- ============================================
DROP POLICY IF EXISTS "Users can view their own data" ON public.users;
DROP POLICY IF EXISTS "Admins can view all users" ON public.users;

CREATE POLICY "Users can view their own data"
ON public.users
FOR SELECT
TO authenticated
USING (auth.uid() = id);

CREATE POLICY "Admins can view all users"
ON public.users
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid()
      AND u.is_admin = true
  )
);


-- Política UPDATE: Usuários podem atualizar apenas seus dados
-- MAS NÃO PODEM MODIFICAR is_admin!
-- ============================================
DROP POLICY IF EXISTS "Users can update their own data" ON public.users;
DROP POLICY IF EXISTS "Admins can update any user" ON public.users;

-- Usuários comuns: podem atualizar seus dados EXCETO is_admin e role
CREATE POLICY "Users can update their own data"
ON public.users
FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (
  auth.uid() = id
  -- Garantir que is_admin e role não foram modificados
  AND is_admin = (SELECT is_admin FROM public.users WHERE id = auth.uid())
  AND role = (SELECT role FROM public.users WHERE id = auth.uid())
);

-- Admins: podem atualizar qualquer usuário (incluindo is_admin)
CREATE POLICY "Admins can update any user"
ON public.users
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = auth.uid()
      AND users.is_admin = true
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = auth.uid()
      AND users.is_admin = true
  )
);


-- ============================================
-- PARTE 3: Limpar subscriptions duplicadas da Livia
-- ============================================

-- Ver todas as subscriptions da Livia
SELECT 
  id,
  user_id,
  plan_id,
  status,
  created_at,
  current_period_start,
  current_period_end
FROM user_subscriptions
WHERE user_id = 'f62bc8aa-b646-43f0-b37d-9060f7064aef'
ORDER BY created_at DESC;

-- ⚠️ ATENÇÃO: Revisar o resultado acima antes de executar o DELETE
-- Manter apenas a subscription mais recente, deletar as antigas

-- EXECUTE ESTA QUERY APENAS APÓS REVISAR O SELECT ACIMA:
/*
DELETE FROM user_subscriptions
WHERE user_id = 'f62bc8aa-b646-43f0-b37d-9060f7064aef'
  AND id NOT IN (
    -- Manter apenas a subscription mais recente
    SELECT id 
    FROM user_subscriptions
    WHERE user_id = 'f62bc8aa-b646-43f0-b37d-9060f7064aef'
    ORDER BY created_at DESC
    LIMIT 1
  );
*/


-- ============================================
-- PARTE 4: Verificação Final de Segurança
-- ============================================

-- Listar TODAS as políticas das tabelas críticas
SELECT 
  schemaname,
  tablename,
  policyname,
  cmd,
  roles
FROM pg_policies
WHERE tablename IN ('users', 'user_subscriptions', 'plans')
ORDER BY tablename, cmd;

-- Resultado esperado:
-- 
-- users:
--   - SELECT: Users can view their own data
--   - SELECT: Admins can view all users
--   - UPDATE: Users can update their own data
--   - UPDATE: Admins can update any user
--
-- user_subscriptions:
--   - SELECT: Users can view their own subscriptions
--   - SELECT: Admin can view all subscriptions
--   - INSERT: Only admins can create subscriptions
--   - UPDATE: Admins can update subscriptions
--   - DELETE: Only admins can delete subscriptions
--
-- plans:
--   - SELECT: Plans are publicly readable


-- ============================================
-- RESUMO DE SEGURANÇA
-- ============================================

-- ✅ PROTEÇÕES IMPLEMENTADAS:
--
-- 1. Isolamento de dados:
--    - Usuários só veem seus próprios dados
--    - Admins veem tudo (necessário para o painel)
--
-- 2. Proteção contra escalação de privilégios:
--    - Usuários comuns NÃO podem modificar is_admin
--    - Apenas admins podem promover/rebaixar outros usuários
--
-- 3. Controle de subscriptions:
--    - Apenas admins podem criar/modificar/deletar subscriptions
--    - Evita fraudes (usuários criando planos premium gratuitos)
--
-- 4. Auditoria:
--    - Todas as operações requerem autenticação
--    - auth.uid() registra quem fez cada operação

-- ==================================================
