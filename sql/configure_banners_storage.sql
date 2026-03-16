-- ==================================================
-- CONFIGURAÇÃO DO STORAGE BUCKET PARA BANNERS
-- ==================================================
-- Bucket público para imagens de banners da Home
-- ==================================================

-- PASSO 1: Criar bucket 'banners' (execute via Dashboard ou código)
-- No Supabase Dashboard: Storage > Create Bucket
-- Name: banners
-- Public: true (para leitura pública)

-- PASSO 2: Configurar políticas de acesso
-- ==================================================

-- Política de INSERIR (apenas admins podem fazer upload)
CREATE POLICY "Admins can upload banners"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'banners' 
  AND public.is_admin() = true
);

-- Política de ATUALIZAR (apenas admins)
CREATE POLICY "Admins can update banners"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'banners' 
  AND public.is_admin() = true
);

-- Política de DELETAR (apenas admins)
CREATE POLICY "Admins can delete banners"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'banners' 
  AND public.is_admin() = true
);

-- Política de LEITURA (público pode ver)
CREATE POLICY "Public can view banners"
ON storage.objects
FOR SELECT
TO authenticated, anon
USING (bucket_id = 'banners');


-- ==================================================
-- CRIAÇÃO DO BUCKET VIA SQL (alternativa ao Dashboard)
-- ==================================================
-- Caso prefira criar via SQL em vez do Dashboard:

INSERT INTO storage.buckets (id, name, public)
VALUES ('banners', 'banners', true)
ON CONFLICT (id) DO NOTHING;


-- ==================================================
-- CONFIGURAÇÕES RECOMENDADAS (via Dashboard)
-- ==================================================
-- 1. File size limit: 5 MB
-- 2. Allowed MIME types: image/jpeg, image/png, image/webp, image/avif
-- 3. Public access: Enabled (para leitura)


-- ==================================================
-- VERIFICAÇÃO
-- ==================================================

-- Listar buckets
SELECT * FROM storage.buckets WHERE id = 'banners';

-- Listar políticas do bucket
SELECT 
  policyname,
  cmd,
  qual
FROM pg_policies
WHERE schemaname = 'storage' 
  AND tablename = 'objects'
  AND policyname LIKE '%banner%'
ORDER BY cmd;


-- ==================================================
-- EXEMPLO DE USO (JavaScript)
-- ==================================================

/*
// Upload de imagem no bucket 'banners'
const { data, error } = await supabase.storage
  .from('banners')
  .upload('banner-1.webp', file, {
    cacheControl: '3600',
    upsert: false
  });

// Obter URL pública
const { data: { publicUrl } } = supabase.storage
  .from('banners')
  .getPublicUrl('banner-1.webp');

// Deletar arquivo
const { error } = await supabase.storage
  .from('banners')
  .remove(['banner-1.webp']);
*/
