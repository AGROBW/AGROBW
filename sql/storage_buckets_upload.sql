-- ============================================================================
-- CONFIGURAÇÃO DE STORAGE BUCKETS E POLÍTICAS RLS
-- Data: 2026-03-02
-- Descrição: Criar buckets para avatars e documentos com estrutura de pastas
-- ============================================================================

-- ===========================
-- 1. CRIAR BUCKETS
-- ===========================

-- Bucket para avatares de usuários
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  true, -- Público para visualização
  5242880, -- 5MB
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

-- Bucket para documentos de verificação
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'verification_docs',
  'verification_docs',
  false, -- Privado
  10485760, -- 10MB
  ARRAY['application/pdf', 'image/jpeg', 'image/jpg', 'image/png']
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 10485760,
  allowed_mime_types = ARRAY['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];

-- ===========================
-- 2. POLÍTICAS RLS - AVATARS
-- ===========================

-- Limpar políticas antigas
DROP POLICY IF EXISTS "Usuários podem fazer upload de avatares" ON storage.objects;
DROP POLICY IF EXISTS "Avatares são públicos" ON storage.objects;
DROP POLICY IF EXISTS "Usuários podem atualizar seus avatares" ON storage.objects;
DROP POLICY IF EXISTS "Usuários podem deletar seus avatares" ON storage.objects;

-- Política: Upload de avatares (apenas na própria pasta do usuário)
CREATE POLICY "Usuários podem fazer upload de avatares"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'avatars' AND
  (storage.foldername(name))[1] = (
    SELECT LOWER(REGEXP_REPLACE(TRIM(name), '[^a-zA-Z0-9]', '_', 'g'))
    FROM public.users
    WHERE id = auth.uid()
  )
);

-- Política: Leitura pública de avatares
CREATE POLICY "Avatares são públicos"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'avatars');

-- Política: Atualizar avatares (apenas próprios)
CREATE POLICY "Usuários podem atualizar seus avatares"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'avatars' AND
  (storage.foldername(name))[1] = (
    SELECT LOWER(REGEXP_REPLACE(TRIM(name), '[^a-zA-Z0-9]', '_', 'g'))
    FROM public.users
    WHERE id = auth.uid()
  )
)
WITH CHECK (
  bucket_id = 'avatars' AND
  (storage.foldername(name))[1] = (
    SELECT LOWER(REGEXP_REPLACE(TRIM(name), '[^a-zA-Z0-9]', '_', 'g'))
    FROM public.users
    WHERE id = auth.uid()
  )
);

-- Política: Deletar avatares (apenas próprios)
CREATE POLICY "Usuários podem deletar seus avatares"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'avatars' AND
  (storage.foldername(name))[1] = (
    SELECT LOWER(REGEXP_REPLACE(TRIM(name), '[^a-zA-Z0-9]', '_', 'g'))
    FROM public.users
    WHERE id = auth.uid()
  )
);

-- ===========================
-- 3. POLÍTICAS RLS - VERIFICATION_DOCS
-- ===========================

-- Limpar políticas antigas
DROP POLICY IF EXISTS "Usuários podem fazer upload de documentos" ON storage.objects;
DROP POLICY IF EXISTS "Usuários podem ver seus documentos" ON storage.objects;
DROP POLICY IF EXISTS "Admins podem ver todos os documentos" ON storage.objects;
DROP POLICY IF EXISTS "Usuários podem deletar seus documentos" ON storage.objects;

-- Política: Upload de documentos (apenas na própria pasta)
CREATE POLICY "Usuários podem fazer upload de documentos"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'verification_docs' AND
  (storage.foldername(name))[1] = (
    SELECT LOWER(REGEXP_REPLACE(TRIM(name), '[^a-zA-Z0-9]', '_', 'g'))
    FROM public.users
    WHERE id = auth.uid()
  )
);

-- Política: Usuários podem ver seus próprios documentos
CREATE POLICY "Usuários podem ver seus documentos"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'verification_docs' AND
  (storage.foldername(name))[1] = (
    SELECT LOWER(REGEXP_REPLACE(TRIM(name), '[^a-zA-Z0-9]', '_', 'g'))
    FROM public.users
    WHERE id = auth.uid()
  )
);

-- Política: Admins podem ver todos os documentos
CREATE POLICY "Admins podem ver todos os documentos"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'verification_docs' AND
  (SELECT is_admin FROM public.users WHERE id = auth.uid()) = true
);

-- Política: Usuários podem deletar seus documentos
CREATE POLICY "Usuários podem deletar seus documentos"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'verification_docs' AND
  (storage.foldername(name))[1] = (
    SELECT LOWER(REGEXP_REPLACE(TRIM(name), '[^a-zA-Z0-9]', '_', 'g'))
    FROM public.users
    WHERE id = auth.uid()
  )
);

-- ===========================
-- 4. ADICIONAR COLUNA DOCUMENT_PATH NA TABELA USERS
-- ===========================

-- Adicionar coluna se não existir
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'users' 
    AND column_name = 'document_path'
  ) THEN
    ALTER TABLE public.users ADD COLUMN document_path TEXT;
    COMMENT ON COLUMN public.users.document_path IS 'Caminho do documento de verificação no storage';
  END IF;
END $$;

-- ===========================
-- 5. COMENTÁRIOS
-- ===========================

COMMENT ON COLUMN public.users.avatar IS 'URL pública do avatar do usuário (storage: avatars/{username}/perfil.jpg)';

-- ===========================
-- RESUMO DA ESTRUTURA
-- ===========================

/*
ESTRUTURA DE PASTAS:

1. Avatars (Público):
   - avatars/wallace/perfil.jpg
   - avatars/maria_silva/perfil.png
   
2. Documentos (Privado):
   - verification_docs/wallace/documento_identidade.pdf
   - verification_docs/maria_silva/cnh_frente.jpg

SLUGIFY JAVASCRIPT:
  userName.toLowerCase().trim().replace(/[^a-zA-Z0-9]/g, '_')

SLUGIFY SQL:
  LOWER(REGEXP_REPLACE(TRIM(name), '[^a-zA-Z0-9]', '_', 'g'))

SEGURANÇA:
  - Usuários só podem fazer upload na própria pasta
  - Avatares são públicos para todos
  - Documentos são privados (apenas dono e admins)
*/
