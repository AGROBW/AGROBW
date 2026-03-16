-- ==================================================
-- SCRIPT: Adicionar Coluna last_login
-- ==================================================
-- Objetivo: Armazenar timestamp do último login do usuário
-- Motivo: O schema auth.users é inacessível no frontend
-- Atualização: Será feita via frontend no AuthContext após login
-- ==================================================

-- PASSO 1: Adicionar coluna last_login na tabela public.users
-- ==================================================
ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS last_login TIMESTAMPTZ;

COMMENT ON COLUMN public.users.last_login IS 
'Timestamp do último login do usuário. Atualizado pelo frontend após autenticação bem-sucedida.';

-- ==================================================
-- PASSO 2: Sincronização inicial (dados históricos)
-- ==================================================
-- Popula last_login para usuários existentes baseado nos dados atuais do auth
-- (Requer permissões de administrador - pode falhar em alguns ambientes)
-- ==================================================

DO $$
BEGIN
  UPDATE public.users u
  SET last_login = a.last_sign_in_at
  FROM auth.users a
  WHERE u.id = a.id
    AND a.last_sign_in_at IS NOT NULL
    AND u.last_login IS NULL;
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'Aviso: Sincronização inicial pulada (sem permissões para acessar auth.users). O last_login será populado nos próximos logins.';
END $$;

-- ==================================================
-- ✅ EXECUÇÃO CONCLUÍDA
-- ==================================================
-- A coluna last_login foi adicionada com sucesso!
-- A partir de agora, o campo será atualizado automaticamente pelo frontend
-- sempre que um usuário fizer login.
-- ==================================================

-- ==================================================
-- VERIFICAÇÃO (Opcional)
-- ==================================================
-- Execute para verificar se a coluna foi criada:
-- 
-- SELECT id, name, email, last_login, created_at
-- FROM public.users
-- ORDER BY created_at DESC
-- LIMIT 10;
-- ==================================================
