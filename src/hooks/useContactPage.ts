import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';

export interface ContactPageContent {
  id: string;
  page_title: string;
  page_subtitle: string;
  whatsapp_label: string;
  whatsapp_number: string;
  email_label: string;
  email_address: string;
  address_label: string;
  address_full: string;
  schedule_text: string;
  maps_embed_url: string;
  form_title: string;
  form_name_placeholder: string;
  form_email_placeholder: string;
  form_phone_placeholder: string;
  form_subject_placeholder: string;
  form_subject_options: string;
  form_message_placeholder: string;
  form_button_text: string;
  form_recipient_email: string;
  last_updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface UpdateContactPageData {
  page_title?: string;
  page_subtitle?: string;
  whatsapp_label?: string;
  whatsapp_number?: string;
  email_label?: string;
  email_address?: string;
  address_label?: string;
  address_full?: string;
  schedule_text?: string;
  maps_embed_url?: string;
  form_title?: string;
  form_name_placeholder?: string;
  form_email_placeholder?: string;
  form_phone_placeholder?: string;
  form_subject_placeholder?: string;
  form_subject_options?: string;
  form_message_placeholder?: string;
  form_button_text?: string;
  form_recipient_email?: string;
}

interface UseContactPageReturn {
  content: ContactPageContent | null;
  isLoading: boolean;
  error: string | null;
  fetchContent: () => Promise<void>;
  updateContent: (updates: UpdateContactPageData, userId: string) => Promise<{ error: string | null }>;
}

export const useContactPage = (): UseContactPageReturn => {
  const [content, setContent] = useState<ContactPageContent | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const SINGLETON_ID = '00000000-0000-0000-0000-000000000004';

  const fetchContent = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        .from('contact_page_content')
        .select('*')
        .eq('id', SINGLETON_ID)
        .single();

      if (fetchError) {
        console.error('Erro ao buscar página Contact:', fetchError);
        setError(fetchError.message);
        return;
      }

      setContent(data);
    } catch (err) {
      console.error('Erro inesperado ao buscar conteúdo:', err);
      setError('Erro ao carregar conteúdo');
    } finally {
      setIsLoading(false);
    }
  };

  const updateContent = async (
    updates: UpdateContactPageData,
    userId: string
  ): Promise<{ error: string | null }> => {
    try {
      const { data, error: updateError } = await supabase
        .from('contact_page_content')
        .update({
          ...updates,
          last_updated_by: userId,
        })
        .eq('id', SINGLETON_ID)
        .select()
        .single();

      if (updateError) {
        console.error('Erro ao atualizar página Contact:', updateError);
        return { error: updateError.message };
      }

      setContent(data);
      return { error: null };
    } catch (err) {
      console.error('Erro inesperado ao atualizar:', err);
      return { error: 'Erro ao salvar alterações' };
    }
  };

  useEffect(() => {
    fetchContent();
  }, []);

  return {
    content,
    isLoading,
    error,
    fetchContent,
    updateContent,
  };
};

// Fallback com conteúdo padrão
export const CONTACT_PAGE_FALLBACK: ContactPageContent = {
  id: '00000000-0000-0000-0000-000000000004',
  page_title: 'Fale Conosco',
  page_subtitle: 'Estamos aqui para ajudar você a colher os melhores resultados. Entre em contato pelos nossos canais oficiais ou envie uma mensagem.',
  whatsapp_label: 'WHATSAPP',
  whatsapp_number: '(11) 99999-9999',
  email_label: 'E-MAIL',
  email_address: 'suporte@bwagro.com.br',
  address_label: 'ENDEREÇO SEDE',
  address_full: 'Av. Paulista, 1000 - Bela Vista, São Paulo - SP',
  schedule_text: 'Segunda a Sexta, das 08h às 18h',
  maps_embed_url: 'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3657.0977!2d-46.6564!3d-23.5629!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x0%3A0x0!2zMjPCsDMzJzQ2LjQiUyA0NsKwMzknMjMuMCJX!5e0!3m2!1spt-BR!2sbr!4v1234567890',
  form_title: 'Envie sua Mensagem',
  form_name_placeholder: 'Seu nome',
  form_email_placeholder: 'seu@email.com',
  form_phone_placeholder: '(00) 00000-0000',
  form_subject_placeholder: 'Selecione o assunto',
  form_subject_options: 'Suporte Técnico\nDúvidas sobre Planos\nParcerias Comerciais\nSugestões e Elogios\nDenunciar Anúncio',
  form_message_placeholder: 'Como podemos ajudar?',
  form_button_text: 'Enviar Mensagem',
  form_recipient_email: 'contato@bwagro.com.br',
  last_updated_by: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};
