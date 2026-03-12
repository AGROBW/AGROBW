-- ======================================================
-- BWAGRO - Adicionar Colunas de Suspensão na Tabela Users
-- ======================================================
-- Execute no SQL Editor do Supabase Dashboard
-- Este script adiciona as colunas necessárias para a funcionalidade
-- de suspensão de usuários no painel administrativo

-- Adicionar coluna is_suspended
ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS is_suspended BOOLEAN NOT NULL DEFAULT false;

-- Adicionar coluna suspension_reason
ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS suspension_reason TEXT;

-- Adicionar coluna suspended_at (data/hora da suspensão)
ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ;

-- Criar índice para melhorar performance em queries que filtram usuários suspensos
CREATE INDEX IF NOT EXISTS idx_users_is_suspended ON public.users(is_suspended);

-- Comentários nas colunas
COMMENT ON COLUMN public.users.is_suspended IS 'Indica se o usuário está suspenso (bloqueado)';
COMMENT ON COLUMN public.users.suspension_reason IS 'Motivo da suspensão do usuário';
COMMENT ON COLUMN public.users.suspended_at IS 'Data e hora em que o usuário foi suspenso';

-- Atualizar RLS policies para considerar suspensão (opcional - ajuste conforme necessário)
-- Exemplo: prevent suspended users from creating/updating content
-- DROP POLICY IF EXISTS "users_insert_own_announcements" ON announcements;
-- CREATE POLICY "users_insert_own_announcements" ON announcements
-- FOR INSERT
-- WITH CHECK (
--   auth.uid() = user_id 
--   AND (SELECT is_suspended FROM users WHERE id = auth.uid()) = false
-- );

-- Verificar se as colunas foram criadas
SELECT 
  column_name, 
  data_type, 
  is_nullable, 
  column_default
FROM information_schema.columns
WHERE table_name = 'users' 
  AND column_name IN ('is_suspended', 'suspension_reason', 'suspended_at')
ORDER BY column_name;
