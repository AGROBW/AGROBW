-- ==================================================
-- MIGRATION: Adicionar campos ao contact_page_content
-- ==================================================
-- Adiciona os campos form_subject_options e form_recipient_email
-- sem perder os dados existentes
-- ==================================================

-- Adicionar campo form_subject_options (se não existir)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'contact_page_content' 
    AND column_name = 'form_subject_options'
  ) THEN
    ALTER TABLE public.contact_page_content 
    ADD COLUMN form_subject_options TEXT 
    DEFAULT E'Suporte Técnico\nDúvidas sobre Planos\nParcerias Comerciais\nSugestões e Elogios\nDenunciar Anúncio';
    
    RAISE NOTICE 'Campo form_subject_options adicionado com sucesso';
  ELSE
    RAISE NOTICE 'Campo form_subject_options já existe';
  END IF;
END $$;

-- Adicionar campo form_recipient_email (se não existir)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'contact_page_content' 
    AND column_name = 'form_recipient_email'
  ) THEN
    ALTER TABLE public.contact_page_content 
    ADD COLUMN form_recipient_email VARCHAR(100) 
    DEFAULT 'contato@bwagro.com.br';
    
    RAISE NOTICE 'Campo form_recipient_email adicionado com sucesso';
  ELSE
    RAISE NOTICE 'Campo form_recipient_email já existe';
  END IF;
END $$;

-- Atualizar form_subject_placeholder para 'Selecione o assunto' (se estiver 'Assunto')
UPDATE public.contact_page_content 
SET form_subject_placeholder = 'Selecione o assunto' 
WHERE form_subject_placeholder = 'Assunto';

-- Verificação
SELECT 
  id,
  form_subject_placeholder,
  form_subject_options,
  form_recipient_email
FROM public.contact_page_content;

-- ==================================================
-- RESULTADO ESPERADO:
-- ✅ 2 novos campos adicionados
-- ✅ Placeholder atualizado para evitar duplicação
-- ✅ Dados existentes preservados
-- ==================================================
