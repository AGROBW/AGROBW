-- ==================================================
-- CRIAÇÃO DA TABELA contact_page_content
-- ==================================================
-- Estrutura dedicada para a página "Fale Conosco"
-- ==================================================

CREATE TABLE IF NOT EXISTS public.contact_page_content (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Hero Section
  page_title VARCHAR(100) DEFAULT 'Fale Conosco',
  page_subtitle TEXT DEFAULT 'Estamos aqui para ajudar você a colher os melhores resultados. Entre em contato pelos nossos canais oficiais ou envie uma mensagem.',
  
  -- Canais de Atendimento
  whatsapp_label VARCHAR(50) DEFAULT 'WHATSAPP',
  whatsapp_number VARCHAR(20) DEFAULT '(11) 99999-9999',
  
  email_label VARCHAR(50) DEFAULT 'E-MAIL',
  email_address VARCHAR(100) DEFAULT 'suporte@bwagro.com.br',
  
  address_label VARCHAR(50) DEFAULT 'ENDEREÇO SEDE',
  address_full TEXT DEFAULT 'Av. Paulista, 1000 - Bela Vista, São Paulo - SP',
  
  schedule_text VARCHAR(100) DEFAULT 'Segunda a Sexta, das 08h às 18h',
  
  -- Google Maps
  maps_embed_url TEXT DEFAULT 'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3657.0977!2d-46.6564!3d-23.5629!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x0%3A0x0!2zMjPCsDMzJzQ2LjQiUyA0NsKwMzknMjMuMCJX!5e0!3m2!1spt-BR!2sbr!4v1234567890',
  
  -- Formulário
  form_title VARCHAR(100) DEFAULT 'Envie sua Mensagem',
  form_name_placeholder VARCHAR(50) DEFAULT 'Seu nome',
  form_email_placeholder VARCHAR(50) DEFAULT 'seu@email.com',
  form_phone_placeholder VARCHAR(50) DEFAULT '(00) 00000-0000',
  form_subject_placeholder VARCHAR(50) DEFAULT 'Selecione o assunto',
  form_subject_options TEXT DEFAULT E'Suporte Técnico\nDúvidas sobre Planos\nParcerias Comerciais\nSugestões e Elogios\nDenunciar Anúncio',
  form_message_placeholder TEXT DEFAULT 'Como podemos ajudar?',
  form_button_text VARCHAR(50) DEFAULT 'Enviar Mensagem',
  form_recipient_email VARCHAR(100) DEFAULT 'contato@bwagro.com.br',
  
  -- Metadata
  last_updated_by UUID REFERENCES public.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Garantir apenas 1 registro (singleton)
  CONSTRAINT single_row CHECK (id = '00000000-0000-0000-0000-000000000004')
);

-- Comentários
COMMENT ON TABLE public.contact_page_content IS 'Conteúdo estruturado da página Fale Conosco (singleton)';

-- ==================================================
-- POLÍTICAS RLS
-- ==================================================

ALTER TABLE public.contact_page_content ENABLE ROW LEVEL SECURITY;

-- Remover políticas existentes (se houver)
DROP POLICY IF EXISTS "Public can view contact page" ON public.contact_page_content;
DROP POLICY IF EXISTS "Admins can update contact page" ON public.contact_page_content;

-- SELECT: Público pode ler
CREATE POLICY "Public can view contact page"
ON public.contact_page_content
FOR SELECT
TO authenticated, anon
USING (true);

-- UPDATE: Apenas admins podem editar
CREATE POLICY "Admins can update contact page"
ON public.contact_page_content
FOR UPDATE
TO authenticated
USING (public.is_admin() = true)
WITH CHECK (public.is_admin() = true);

-- ==================================================
-- TRIGGER: Atualizar updated_at
-- ==================================================

DROP TRIGGER IF EXISTS update_contact_page_updated_at ON public.contact_page_content;

CREATE TRIGGER update_contact_page_updated_at
BEFORE UPDATE ON public.contact_page_content
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- ==================================================
-- DADOS INICIAIS
-- ==================================================

INSERT INTO public.contact_page_content (
  id,
  page_title,
  page_subtitle,
  whatsapp_label,
  whatsapp_number,
  email_label,
  email_address,
  address_label,
  address_full,
  schedule_text,
  maps_embed_url,
  form_title,
  form_name_placeholder,
  form_email_placeholder,
  form_phone_placeholder,
  form_subject_placeholder,
  form_subject_options,
  form_message_placeholder,
  form_button_text,
  form_recipient_email
) VALUES (
  '00000000-0000-0000-0000-000000000004',
  'Fale Conosco',
  'Estamos aqui para ajudar você a colher os melhores resultados. Entre em contato pelos nossos canais oficiais ou envie uma mensagem.',
  'WHATSAPP',
  '(11) 99999-9999',
  'E-MAIL',
  'suporte@bwagro.com.br',
  'ENDEREÇO SEDE',
  'Av. Paulista, 1000 - Bela Vista, São Paulo - SP',
  'Segunda a Sexta, das 08h às 18h',
  'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3657.0977!2d-46.6564!3d-23.5629!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x0%3A0x0!2zMjPCsDMzJzQ2LjQiUyA0NsKwMzknMjMuMCJX!5e0!3m2!1spt-BR!2sbr!4v1234567890',
  'Envie sua Mensagem',
  'Seu nome',
  'seu@email.com',
  '(00) 00000-0000',
  'Selecione o assunto',
  E'Suporte Técnico\nDúvidas sobre Planos\nParcerias Comerciais\nSugestões e Elogios\nDenunciar Anúncio',
  'Como podemos ajudar?',
  'Enviar Mensagem',
  'contato@bwagro.com.br'
) ON CONFLICT (id) DO NOTHING;

-- Verificação
SELECT * FROM public.contact_page_content;
