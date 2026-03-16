import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';

export interface AboutPageContent {
  id: string;
  // Estatísticas
  stat_users_value: string;
  stat_users_label: string;
  stat_ads_value: string;
  stat_ads_label: string;
  stat_revenue_value: string;
  stat_revenue_label: string;
  // História
  history_title: string;
  history_text: string;
  history_image_url: string | null;
  // Pilares
  mission_title: string;
  mission_text: string;
  vision_title: string;
  vision_text: string;
  values_title: string;
  values_text: string;
  // Diferenciais
  diff1_title: string;
  diff1_text: string;
  diff2_title: string;
  diff2_text: string;
  diff3_title: string;
  diff3_text: string;
  // Meta
  last_updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface UpdateAboutPageData {
  stat_users_value?: string;
  stat_users_label?: string;
  stat_ads_value?: string;
  stat_ads_label?: string;
  stat_revenue_value?: string;
  stat_revenue_label?: string;
  history_title?: string;
  history_text?: string;
  history_image_url?: string | null;
  mission_title?: string;
  mission_text?: string;
  vision_title?: string;
  vision_text?: string;
  values_title?: string;
  values_text?: string;
  diff1_title?: string;
  diff1_text?: string;
  diff2_title?: string;
  diff2_text?: string;
  diff3_title?: string;
  diff3_text?: string;
}

interface UseAboutPageReturn {
  content: AboutPageContent | null;
  isLoading: boolean;
  error: string | null;
  fetchContent: () => Promise<void>;
  updateContent: (data: UpdateAboutPageData, userId: string) => Promise<{ error: any | null }>;
}

/**
 * Hook para gerenciar conteúdo da página "Quem Somos"
 * Singleton - apenas 1 registro no banco
 */
export const useAboutPage = (): UseAboutPageReturn => {
  const [content, setContent] = useState<AboutPageContent | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const SINGLETON_ID = '00000000-0000-0000-0000-000000000001';

  /**
   * Buscar conteúdo (sempre 1 registro)
   */
  const fetchContent = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const { data, error: fetchError } = await supabase
        .from('about_page_content')
        .select('*')
        .eq('id', SINGLETON_ID)
        .single();

      if (fetchError) {
        // Se não existir, criar com valores padrão
        if (fetchError.code === 'PGRST116') {
          console.log('[useAboutPage] Registro não encontrado, criando...');
          return;
        }
        throw fetchError;
      }

      setContent(data);
    } catch (err: any) {
      console.error('[useAboutPage] Erro ao buscar conteúdo:', err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Atualizar conteúdo
   */
  const updateContent = async (
    updates: UpdateAboutPageData,
    userId: string
  ): Promise<{ error: any | null }> => {
    try {
      const { data, error: updateError } = await supabase
        .from('about_page_content')
        .update({
          ...updates,
          last_updated_by: userId
        })
        .eq('id', SINGLETON_ID)
        .select()
        .single();

      if (updateError) throw updateError;

      setContent(data);
      return { error: null };
    } catch (err: any) {
      console.error('[useAboutPage] Erro ao atualizar:', err);
      return { error: err.message };
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
    updateContent
  };
};

/**
 * Valores fallback para caso o banco esteja vazio
 */
export const ABOUT_PAGE_FALLBACK: AboutPageContent = {
  id: '00000000-0000-0000-0000-000000000001',
  stat_users_value: '10k+',
  stat_users_label: 'USUÁRIOS ATIVOS',
  stat_ads_value: '50k+',
  stat_ads_label: 'ANÚNCIOS CRIADOS',
  stat_revenue_value: '850 Mi',
  stat_revenue_label: 'NEGÓCIOS GERADOS',
  history_title: 'Nossa História',
  history_text: 'Nascida da necessidade real do produtor rural brasileiro, a BWAGRO surgiu em 2020 para eliminar barreiras e burocracias no mercado de compra e venda no campo.',
  history_image_url: 'https://images.unsplash.com/photo-1464226184884-fa280b87c399?q=80&w=800&auto=format&fit=crop',
  mission_title: 'Missão',
  mission_text: 'Prover as melhores ferramentas tecnológicas para que o produtor rural comercialize seus ativos com segurança e eficiência máxima.',
  vision_title: 'Visão',
  vision_text: 'Ser o ecossistema digital indispensável para o agronegócio.',
  values_title: 'Valores',
  values_text: 'Integridade nas relações, inovação constante centrada no usuário.',
  diff1_title: 'Tecnologia de Ponta',
  diff1_text: 'Filtros inteligentes e interface otimizada para quem está no campo.',
  diff2_title: 'Facilidade de Uso',
  diff2_text: 'Anuncie seus produtos em menos de 2 minutos pelo celular.',
  diff3_title: 'Suporte Especializado',
  diff3_text: 'Time que entende a realidade rural pronto para auxiliar.',
  last_updated_by: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString()
};
