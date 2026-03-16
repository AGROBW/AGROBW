-- ==================================================
-- CORREÇÃO URGENTE: Remover Recursão das Políticas RLS
-- ==================================================
-- Problema: Políticas com subquery em users causam loop infinito
-- Solução: Usar função SECURITY DEFINER para verificar is_admin
-- ==================================================

-- PASSO 1: Deletar TODAS as políticas problemáticas
-- ==================================================
DROP POLICY IF EXISTS "Users can view their own data" ON public.users;
DROP POLICY IF EXISTS "Admins can view all users" ON public.users;
DROP POLICY IF EXISTS "Users can update their own data" ON public.users;
DROP POLICY IF EXISTS "Admins can update any user" ON public.users;

DROP POLICY IF EXISTS "Admin can view all subscriptions" ON public.user_subscriptions;
DROP POLICY IF EXISTS "Only admins can create subscriptions" ON public.user_subscriptions;
DROP POLICY IF EXISTS "Admins can update subscriptions" ON public.user_subscriptions;
DROP POLICY IF EXISTS "Only admins can delete subscriptions" ON public.user_subscriptions;


-- ==================================================
-- PASSO 2: Criar função SECURITY DEFINER para verificar admin
-- ==================================================
-- Esta função bypassa RLS para evitar recursão
-- ==================================================

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER -- ← Executa com permissões do criador (bypassa RLS)
SET search_path = public
AS $$
BEGIN
  RETURN (
    SELECT is_admin 
    FROM public.users 
    WHERE id = auth.uid()
  );
END;
$$;

COMMENT ON FUNCTION public.is_admin() IS 
'Verifica se o usuário logado é admin. SECURITY DEFINER bypassa RLS para evitar recursão.';


-- ==================================================
-- PASSO 3: Recriar políticas USANDO A FUNÇÃO (sem recursão)
-- ==================================================

-- TABELA: users
-- ==================================================

-- SELECT: Usuários veem seus próprios dados
CREATE POLICY "Users can view their own data"
ON public.users
FOR SELECT
TO authenticated
USING (auth.uid() = id);

-- SELECT: Admins veem todos (usando função)
CREATE POLICY "Admins can view all users"
ON public.users
FOR SELECT
TO authenticated
USING (public.is_admin() = true);


-- UPDATE: Usuários podem atualizar seus dados (exceto is_admin e role)
CREATE POLICY "Users can update their own data"
ON public.users
FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (
  auth.uid() = id
  AND is_admin = (SELECT is_admin FROM public.users WHERE id = auth.uid())
  AND role = (SELECT role FROM public.users WHERE id = auth.uid())
);

-- UPDATE: Admins podem atualizar qualquer usuário (usando função)
CREATE POLICY "Admins can update any user"
ON public.users
FOR UPDATE
TO authenticated
USING (public.is_admin() = true)
WITH CHECK (public.is_admin() = true);


-- TABELA: user_subscriptions
-- ==================================================

-- SELECT: Usuários veem suas próprias subscriptions (já existe)
-- (mantém a política "Users can view their own subscriptions")

-- SELECT: Admins veem todas (usando função)
CREATE POLICY "Admin can view all subscriptions"
ON public.user_subscriptions
FOR SELECT
TO authenticated
USING (public.is_admin() = true);

-- INSERT: Apenas admins (usando função)
CREATE POLICY "Only admins can create subscriptions"
ON public.user_subscriptions
FOR INSERT
TO authenticated
WITH CHECK (public.is_admin() = true);

-- UPDATE: Apenas admins (usando função)
CREATE POLICY "Admins can update subscriptions"
ON public.user_subscriptions
FOR UPDATE
TO authenticated
USING (public.is_admin() = true)
WITH CHECK (public.is_admin() = true);

-- DELETE: Apenas admins (usando função)
CREATE POLICY "Only admins can delete subscriptions"
ON public.user_subscriptions
FOR DELETE
TO authenticated
USING (public.is_admin() = true);


-- ==================================================
-- PASSO 4: Verificar se as políticas foram criadas corretamente
-- ==================================================

SELECT 
  tablename,
  policyname,
  cmd
FROM pg_policies
WHERE tablename IN ('users', 'user_subscriptions')
ORDER BY tablename, cmd;

-- Deve retornar:
-- users | Users can view their own data | SELECT
-- users | Admins can view all users | SELECT
-- users | Users can update their own data | UPDATE
-- users | Admins can update any user | UPDATE
-- user_subscriptions | Users can view their own subscriptions | SELECT
-- user_subscriptions | Admin can view all subscriptions | SELECT
-- user_subscriptions | Only admins can create subscriptions | INSERT
-- user_subscriptions | Admins can update subscriptions | UPDATE
-- user_subscriptions | Only admins can delete subscriptions | DELETE


-- ==================================================
-- PASSO 5: Testar a função is_admin() manualmente
-- ==================================================

-- Execute logado como admin
SELECT public.is_admin();
-- Deve retornar: true

-- Execute logado como usuário comum
-- Deve retornar: false


-- ==================================================
-- EXPLICAÇÃO DA CORREÇÃO
-- ==================================================

-- ❌ ANTES (com recursão):
-- USING (
--   EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND is_admin = true)
--          ↑ Subquery tenta acessar users, mas users TEM RLS
--            = precisa verificar permissões = LOOP INFINITO
-- )

-- ✅ AGORA (sem recursão):
-- USING (public.is_admin() = true)
--        ↑ Função é SECURITY DEFINER = bypassa RLS
--          = acessa users diretamente SEM verificar permissões
--          = SEM recursão

-- ==================================================
