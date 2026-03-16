-- ==================================================
-- MIGRATION: Adicionar políticas RLS para admins na tabela plans
-- ==================================================
-- Permite que administradores gerenciem planos
-- ==================================================
-- IMPORTANTE: Execute este script se estiver recebendo erro 406
-- ao tentar salvar planos no painel admin
-- ==================================================

-- RLS já está habilitado, garantir que está ativo
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;

-- Remover política antiga se existir (muito restritiva)
DROP POLICY IF EXISTS "Plans public read" ON public.plans;

-- ==================================================
-- NOVAS POLÍTICAS RLS
-- ==================================================

-- 1. SELECT: Todos podem ver planos ativos (autenticados ou não)
CREATE POLICY "Anyone can view active plans"
ON public.plans
FOR SELECT
TO authenticated, anon
USING (is_active = true);

-- 2. SELECT ALL: Admins podem ver todos os planos (ativos ou não)
CREATE POLICY "Admins can view all plans"
ON public.plans
FOR SELECT
TO authenticated
USING (public.is_admin() = true);

-- 3. INSERT: Apenas admins podem criar planos
CREATE POLICY "Admins can insert plans"
ON public.plans
FOR INSERT
TO authenticated
WITH CHECK (public.is_admin() = true);

-- 4. UPDATE: Apenas admins podem atualizar planos
CREATE POLICY "Admins can update plans"
ON public.plans
FOR UPDATE
TO authenticated
USING (public.is_admin() = true)
WITH CHECK (public.is_admin() = true);

-- 5. DELETE: Apenas admins podem deletar planos
CREATE POLICY "Admins can delete plans"
ON public.plans
FOR DELETE
TO authenticated
USING (public.is_admin() = true);

-- ==================================================
-- VERIFICAÇÃO
-- ==================================================

-- Listar todas as políticas da tabela plans
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'plans'
ORDER BY policyname;

-- ==================================================
-- RESULTADO ESPERADO:
-- ✅ 5 políticas criadas
-- ✅ Admins podem: SELECT ALL, INSERT, UPDATE, DELETE
-- ✅ Público pode: SELECT apenas planos ativos
-- ==================================================
