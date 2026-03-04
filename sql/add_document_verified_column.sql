-- Adiciona coluna document_verified à tabela users
-- Esta coluna rastreia o status de validação automática por OCR

ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS document_verified BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN public.users.document_verified IS 
'Status de validação do documento por OCR. TRUE = validado automaticamente, FALSE = pendente ou reprovado, NULL = não enviado';

-- Índice para consultas por status de verificação
CREATE INDEX IF NOT EXISTS idx_users_document_verified 
ON public.users(document_verified) 
WHERE document_verified IS NOT NULL;
