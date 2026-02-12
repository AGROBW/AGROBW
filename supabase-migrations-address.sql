-- ============================================
-- BWAGRO - Migração para adicionar campos de endereço
-- ============================================

-- Adicionar colunas de endereço e dados pessoais à tabela users
-- Execute este script no SQL Editor do Supabase Dashboard

ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS document VARCHAR(20),
ADD COLUMN IF NOT EXISTS birth_date DATE,
ADD COLUMN IF NOT EXISTS website VARCHAR(255),
ADD COLUMN IF NOT EXISTS cep VARCHAR(8),
ADD COLUMN IF NOT EXISTS logradouro VARCHAR(255),
ADD COLUMN IF NOT EXISTS numero VARCHAR(20),
ADD COLUMN IF NOT EXISTS complemento VARCHAR(255),
ADD COLUMN IF NOT EXISTS bairro VARCHAR(100),
ADD COLUMN IF NOT EXISTS cidade VARCHAR(100),
ADD COLUMN IF NOT EXISTS estado VARCHAR(2);

-- Criar índices para melhorar performance de buscas por localização
CREATE INDEX IF NOT EXISTS idx_users_cidade ON public.users(cidade);
CREATE INDEX IF NOT EXISTS idx_users_estado ON public.users(estado);
CREATE INDEX IF NOT EXISTS idx_users_cep ON public.users(cep);

-- Comentários descritivos para as novas colunas
COMMENT ON COLUMN public.users.birth_date IS 'Data de nascimento do usuário (apenas para perfil individual)';
COMMENT ON COLUMN public.users.website IS 'Site ou URL do perfil do usuário';
COMMENT ON COLUMN public.users.document IS 'CPF ou CNPJ apenas com números';
COMMENT ON COLUMN public.users.cep IS 'Código de Endereçamento Postal (8 dígitos)';
COMMENT ON COLUMN public.users.logradouro IS 'Rua, avenida, praça, etc.';
COMMENT ON COLUMN public.users.numero IS 'Número do imóvel';
COMMENT ON COLUMN public.users.complemento IS 'Complemento do endereço (apto, bloco, etc.)';
COMMENT ON COLUMN public.users.bairro IS 'Bairro do imóvel';
COMMENT ON COLUMN public.users.cidade IS 'Cidade';
COMMENT ON COLUMN public.users.estado IS 'Estado (UF) - 2 caracteres';
