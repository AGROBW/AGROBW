-- ==================================================
-- CORREÇÃO: Row Level Security (RLS) - user_subscriptions
-- ==================================================
-- Problema: Frontend não consegue ler subscriptions devido a RLS
-- Solução: Criar política que permite leitura de subscriptions
-- ==================================================

-- PASSO 1: Verificar se RLS está habilitado
-- ==================================================
SELECT 
  schemaname,
  tablename,
  rowsecurity
FROM pg_tables
WHERE tablename = 'user_subscriptions';

-- Se rowsecurity = true, RLS está ativo


-- PASSO 2: Ver políticas atuais
-- ==================================================
SELECT 
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'user_subscriptions';

-- Anote as políticas existentes antes de modificar


-- PASSO 3: Criar política de leitura
-- ==================================================
-- Esta política permite:
-- - Usuários autenticados lerem SUAS PRÓPRIAS subscriptions
-- - Admins lerem TODAS as subscriptions (para o painel)
-- ==================================================

-- Remover política antiga se existir
DROP POLICY IF EXISTS "Users can view their own subscriptions" ON public.user_subscriptions;
DROP POLICY IF EXISTS "Admin can view all subscriptions" ON public.user_subscriptions;

-- Política 1: Usuários podem ver suas próprias subscriptions
CREATE POLICY "Users can view their own subscriptions"
ON public.user_subscriptions
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Política 2: Admins podem ver todas as subscriptions
CREATE POLICY "Admin can view all subscriptions"
ON public.user_subscriptions
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = auth.uid()
      AND users.is_admin = true
  )
);


-- PASSO 4: Verificar se as políticas foram criadas
-- ==================================================
SELECT 
  policyname,
  cmd,
  qual
FROM pg_policies
WHERE tablename = 'user_subscriptions'
  AND cmd = 'SELECT';

-- Deve mostrar 2 políticas de SELECT


-- ==================================================
-- ALTERNATIVA: Desabilitar RLS temporariamente
-- ==================================================
-- ⚠️ USE APENAS PARA TESTES - NÃO RECOMENDADO EM PRODUÇÃO
-- ==================================================

-- Desabilitar RLS (permite leitura irrestrita)
-- ALTER TABLE public.user_subscriptions DISABLE ROW LEVEL SECURITY;

-- Para reabilitar depois:
-- ALTER TABLE public.user_subscriptions ENABLE ROW LEVEL SECURITY;


-- ==================================================
-- VERIFICAÇÃO FINAL
-- ==================================================
-- Execute esta query como usuário autenticado (não admin)
-- para testar se a política está funcionando:
-- ==================================================

-- Substitua 'SEU_USER_ID' pelo ID do usuário logado
SELECT 
  us.*,
  p.name as plan_name
FROM public.user_subscriptions us
LEFT JOIN public.plans p ON us.plan_id = p.id
WHERE us.user_id = auth.uid();  -- ← auth.uid() pega o ID do usuário logado

-- Se retornar dados, a política está funcionando!


-- ==================================================
-- PROBLEMA ADICIONAL: FK com plans
-- ==================================================
-- Se a política acima não resolver, pode ser que o JOIN
-- com a tabela 'plans' também esteja bloqueado por RLS
-- ==================================================

-- Verificar RLS na tabela plans
SELECT 
  schemaname,
  tablename,
  rowsecurity
FROM pg_tables
WHERE tablename = 'plans';

-- Criar política de leitura pública para plans
DROP POLICY IF EXISTS "Plans are publicly readable" ON public.plans;

CREATE POLICY "Plans are publicly readable"
ON public.plans
FOR SELECT
TO authenticated
USING (true);  -- Todos os usuários autenticados podem ler todos os planos


-- ==================================================
-- RESUMO DAS POLÍTICAS CRIADAS
-- ==================================================

-- ✅ user_subscriptions:
--    - Usuários veem apenas suas subscriptions
--    - Admins veem todas as subscriptions
--
-- ✅ plans:
--    - Todos os usuários veem todos os planos (tabela pública)
--
-- Isso permite que:
--    1. Usuários vejam seu próprio plano no perfil
--    2. Admins vejam planos de todos no painel
--    3. O JOIN entre user_subscriptions e plans funcione

-- ==================================================
