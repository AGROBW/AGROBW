import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';

export interface StateClicks {
  state: string;
  clicks: number;
}

export interface PriceAnalysis {
  announcement_id: string;
  user_price: number;
  market_avg_price: number | null;
  price_position: 'LOW' | 'MED' | 'HIGH' | null;
  percentage: number | null;
  has_market_data: boolean;
}

export interface TopPerformanceAnnouncement {
  announcement_id: string;
  title: string;
  status: string;
  views: number;
  leads: number;
  favorites_count: number;
  conversion_rate: number;
}

export interface AttentionAnnouncement {
  announcement_id: string;
  title: string;
  status: string;
  views: number;
  leads: number;
  favorites_count: number;
  reason: string;
}

export interface DashboardStats {
  total_ads: number;
  total_views: number;
  total_leads: number;
  total_favorites: number;
  conversion_rate: number;
  clicks_by_state: StateClicks[];
  price_analysis: PriceAnalysis | null;
  home_highlights: number;
  top_ads_by_views: TopPerformanceAnnouncement[];
  top_ads_by_leads: TopPerformanceAnnouncement[];
  attention_ads: AttentionAnnouncement[];
}

interface UseDashboardStatsReturn {
  stats: DashboardStats | null;
  loading: boolean;
  error: string | null;
  refresh: (announcementId?: string | null) => Promise<void>;
}

/**
 * Hook para obter estatísticas agregadas do dashboard
 * Consome a função RPC get_dashboard_stats do Supabase
 * Auto-refresh quando a página volta ao foco
 * @param announcementId - ID opcional do anúncio para filtrar métricas individuais
 */
export function useDashboardStats(announcementId?: string | null): UseDashboardStatsReturn {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = useCallback(async (adId?: string | null) => {
    try {
      setLoading(true);
      setError(null);

      // Passar parâmetro para a RPC
      const { data, error: rpcError } = await supabase
        .rpc('get_dashboard_stats', { 
          p_announcement_id: adId || announcementId || null 
        });

      if (rpcError) {
        console.error('Erro ao buscar estatísticas do dashboard:', rpcError);
        throw rpcError;
      }

      // A função RPC retorna um objeto JSONB, o Supabase já faz o parse
      setStats(data as DashboardStats);
    } catch (err: any) {
      console.error('Erro no useDashboardStats:', err);
      setError(err.message || 'Erro ao carregar estatísticas');
      
      // Em caso de erro, retornar estrutura vazia
      setStats({
        total_ads: 0,
        total_views: 0,
        total_leads: 0,
        total_favorites: 0,
        conversion_rate: 0,
        clicks_by_state: [],
        price_analysis: null,
        home_highlights: 0,
        top_ads_by_views: [],
        top_ads_by_leads: [],
        attention_ads: []
      });
    } finally {
      setLoading(false);
    }
  }, [announcementId]);

  // Carregar dados ao montar o componente ou quando announcementId mudar
  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  // Refresh automático quando a página volta ao foco (usuário retorna à aba)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        fetchStats();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [fetchStats]);

  return {
    stats,
    loading,
    error,
    refresh: fetchStats
  };
}
