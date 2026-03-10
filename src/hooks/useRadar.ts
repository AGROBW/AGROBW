// =====================================================
// HOOK: useRadar
// =====================================================
// Gerencia alertas de oportunidades e matches
// =====================================================

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import { updateUserCoordinates } from '../../services/geoService';

export interface OpportunityAlert {
  id: string;
  user_id: string;
  name: string;
  category_id: string | null;
  subcategory_id: string | null;
  state: string | null;
  radius_km: number;
  min_price: number | null;
  max_price: number | null;
  keywords: string[];
  status: 'ativo' | 'pausado';
  created_at: string;
  updated_at: string;
  last_match_at: string | null;
}

export interface OpportunityMatch {
  id: string;
  alert_id: string;
  announcement_id: string;
  user_id: string;
  is_viewed: boolean;
  is_dismissed: boolean;
  viewed_at: string | null;
  match_score: number;
  match_reason: any;
  created_at: string;
  // Dados do anúncio (via join)
  announcement?: {
    id: string;
    title: string;
    price: number;
    images: string[];
    city: string;
    state: string;
    created_at: string;
  };
}

interface RadarStats {
  total_alerts: number;
  active_alerts: number;
  total_matches: number;
  unviewed_matches: number;
  last_match_date: string | null;
}

interface PlanLimits {
  alerts: number;
  radius: boolean;
  keywords: boolean;
  price_filter: boolean;
}

// Limites padrão (fallback se não conseguir buscar do banco)
const DEFAULT_LIMITS: PlanLimits = {
  alerts: 1,
  radius: false,
  keywords: false,
  price_filter: false
};

/**
 * Hook principal para gerenciar Radar de Oportunidades
 */
export const useRadar = () => {
  const { user } = useAuth();
  const [alerts, setAlerts] = useState<OpportunityAlert[]>([]);
  const [matches, setMatches] = useState<OpportunityMatch[]>([]);
  const [stats, setStats] = useState<RadarStats | null>(null);
  const [planLimits, setPlanLimits] = useState<PlanLimits>(DEFAULT_LIMITS);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Buscar limites do plano do usuário
  const fetchPlanLimits = useCallback(async () => {
    if (!user?.id) return;

    try {
      // Buscar dados do usuário incluindo plan (nome do plano)
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('plan')
        .eq('id', user.id)
        .single();

      if (userError) throw userError;

      if (!userData?.plan) {
        setPlanLimits(DEFAULT_LIMITS);
        return;
      }

      // Normalizar nome do plano (remover hífens, espaços, lowercase)
      const normalizedPlan = userData.plan.toLowerCase().replace(/[\s-]/g, '');

      // Buscar configurações do Radar no plano
      // Tenta encontrar por nome exato ou normalizado
      const { data: planData, error: planError } = await supabase
        .from('plans')
        .select('radar_max_alerts, radar_has_radius, radar_has_keywords, radar_has_price_filter, name')
        .or(`name.ilike.${userData.plan},name.ilike.%${userData.plan}%`)
        .single();

      if (planError && planError.code !== 'PGRST116') throw planError;

      // Se não encontrou, usar limites padrão
      if (!planData) {
        setPlanLimits(DEFAULT_LIMITS);
        return;
      }

      setPlanLimits({
        alerts: planData?.radar_max_alerts || 0,
        radius: planData?.radar_has_radius || false,
        keywords: planData?.radar_has_keywords || false,
        price_filter: planData?.radar_has_price_filter || false
      });
    } catch (err: any) {
      console.error('Erro ao buscar limites do plano:', err);
      setPlanLimits(DEFAULT_LIMITS);
    }
  }, [user?.id]);

  // Buscar alertas do usuário
  const fetchAlerts = useCallback(async () => {
    if (!user?.id) return;

    try {
      const { data, error } = await supabase
        .from('opportunity_alerts')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      setAlerts(data || []);
    } catch (err: any) {
      console.error('Erro ao buscar alertas:', err);
      setError(err.message);
    }
  }, [user?.id]);

  // Buscar matches do usuário
  const fetchMatches = useCallback(async () => {
    if (!user?.id) return;

    try {
      const { data, error } = await supabase
        .from('opportunity_matches')
        .select(`
          *,
          announcements (
            id,
            title,
            price,
            images,
            city,
            state,
            created_at
          )
        `)
        .eq('user_id', user.id)
        .eq('is_dismissed', false)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;

      // Mapear dados
      const mappedMatches = (data || []).map((match: any) => ({
        ...match,
        announcement: match.announcements
      }));

      setMatches(mappedMatches);
    } catch (err: any) {
      console.error('Erro ao buscar matches:', err);
      setError(err.message);
    }
  }, [user?.id]);

  // Buscar estatísticas (usando RPC para evitar erro 406)
  const fetchStats = useCallback(async () => {
    if (!user?.id) return;

    try {
      const { data, error } = await supabase
        .rpc('get_radar_stats');

      if (error) throw error;

      // A função RPC retorna array, então pegamos o primeiro elemento
      const statsData = Array.isArray(data) && data.length > 0 ? data[0] : null;

      setStats(statsData || {
        total_alerts: 0,
        active_alerts: 0,
        total_matches: 0,
        unviewed_matches: 0,
        last_match_date: null
      });
    } catch (err: any) {
      console.error('Erro ao buscar estatísticas:', err);
    }
  }, [user?.id]);

  // Criar novo alerta
  const createAlert = async (alertData: Partial<OpportunityAlert>) => {
    if (!user?.id) throw new Error('Usuário não autenticado');

    // Verificar limite do plano
    if (planLimits.alerts === 0) {
      throw new Error('Seu plano não tem acesso ao Radar de Oportunidades. Faça upgrade para usar.');
    }

    if (alerts.length >= planLimits.alerts) {
      throw new Error(`Seu plano permite apenas ${planLimits.alerts} alerta(s). Faça upgrade para criar mais.`);
    }

    // Validar recursos do plano
    if (alertData.radius_km && alertData.radius_km > 0 && !planLimits.radius) {
      throw new Error('Filtro por raio geográfico não disponível no seu plano. Faça upgrade.');
    }

    if (alertData.keywords && alertData.keywords.length > 0 && !planLimits.keywords) {
      throw new Error('Filtro por palavras-chave não disponível no seu plano. Faça upgrade.');
    }

    if ((alertData.min_price || alertData.max_price) && !planLimits.price_filter) {
      throw new Error('Filtro por preço não disponível no seu plano. Faça upgrade.');
    }

    try {
      // Se o alerta usa raio, garantir que o usuário tem coordenadas
      if (alertData.radius_km && alertData.radius_km > 0) {
        // Buscar dados do usuário
        const { data: userData, error: userError } = await supabase
          .from('users')
          .select('cep, latitude, longitude, geo_updated_at')
          .eq('id', user.id)
          .single();

        if (userError) throw userError;

        // Se não tem coordenadas ou estão desatualizadas (mais de 30 dias)
        const needsUpdate = !userData?.latitude || 
                           !userData?.longitude || 
                           !userData?.geo_updated_at ||
                           (new Date().getTime() - new Date(userData.geo_updated_at).getTime()) > 30 * 24 * 60 * 60 * 1000;

        if (needsUpdate && userData?.cep) {
          console.log('Atualizando coordenadas do usuário...');
          await updateUserCoordinates(user.id, userData.cep, supabase);
        } else if (!userData?.cep) {
          throw new Error('CEP não cadastrado no perfil. Atualize seu perfil para usar filtro por raio.');
        }
      }

      const { data, error } = await supabase
        .from('opportunity_alerts')
        .insert({
          ...alertData,
          user_id: user.id,
          status: 'ativo'
        })
        .select()
        .single();

      if (error) throw error;

      await fetchAlerts();
      return data;
    } catch (err: any) {
      console.error('Erro ao criar alerta:', err);
      throw err;
    }
  };

  // Atualizar alerta
  const updateAlert = async (alertId: string, updates: Partial<OpportunityAlert>) => {
    if (!user?.id) throw new Error('Usuário não autenticado');

    try {
      const { data, error } = await supabase
        .from('opportunity_alerts')
        .update(updates)
        .eq('id', alertId)
        .eq('user_id', user.id)
        .select()
        .single();

      if (error) throw error;

      await fetchAlerts();
      return data;
    } catch (err: any) {
      console.error('Erro ao atualizar alerta:', err);
      throw err;
    }
  };

  // Deletar alerta
  const deleteAlert = async (alertId: string) => {
    if (!user?.id) throw new Error('Usuário não autenticado');

    try {
      const { error } = await supabase
        .from('opportunity_alerts')
        .delete()
        .eq('id', alertId)
        .eq('user_id', user.id);

      if (error) throw error;

      await fetchAlerts();
    } catch (err: any) {
      console.error('Erro ao deletar alerta:', err);
      throw err;
    }
  };

  // Alternar status do alerta (ativo/pausado)
  const toggleAlertStatus = async (alertId: string) => {
    const alert = alerts.find(a => a.id === alertId);
    if (!alert) throw new Error('Alerta não encontrado');

    const newStatus = alert.status === 'ativo' ? 'pausado' : 'ativo';
    return updateAlert(alertId, { status: newStatus });
  };

  // Marcar match como visualizado
  const markMatchAsViewed = async (matchId: string) => {
    if (!user?.id) throw new Error('Usuário não autenticado');

    try {
      const { error } = await supabase
        .from('opportunity_matches')
        .update({
          is_viewed: true,
          viewed_at: new Date().toISOString()
        })
        .eq('id', matchId)
        .eq('user_id', user.id);

      if (error) throw error;

      await fetchMatches();
      await fetchStats();
    } catch (err: any) {
      console.error('Erro ao marcar match como visto:', err);
      throw err;
    }
  };

  // Descartar match
  const dismissMatch = async (matchId: string) => {
    if (!user?.id) throw new Error('Usuário não autenticado');

    try {
      const { error } = await supabase
        .from('opportunity_matches')
        .update({
          is_dismissed: true
        })
        .eq('id', matchId)
        .eq('user_id', user.id);

      if (error) throw error;

      await fetchMatches();
      await fetchStats();
    } catch (err: any) {
      console.error('Erro ao descartar match:', err);
      throw err;
    }
  };

  // Obter limites do plano do usuário
  // Carregar dados iniciais
  useEffect(() => {
    if (!user?.id) {
      setIsLoading(false);
      return;
    }

    const loadData = async () => {
      setIsLoading(true);
      await Promise.all([
        fetchPlanLimits(),
        fetchAlerts(),
        fetchMatches(),
        fetchStats()
      ]);
      setIsLoading(false);
    };

    loadData();
  }, [user?.id, fetchPlanLimits, fetchAlerts, fetchMatches, fetchStats]);

  // Subscription para updates em tempo real
  useEffect(() => {
    if (!user?.id) return;

    console.log('🔔 Iniciando subscription para matches do usuário:', user.id);

    // Subscribe a novos matches
    const matchesSubscription = supabase
      .channel(`opportunity_matches_${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'opportunity_matches',
          filter: `user_id=eq.${user.id}`
        },
        async (payload) => {
          console.log('✨ Novo match recebido via Real-time!', payload);
          
          // Atualizar matches e stats imediatamente
          try {
            // Buscar matches atualizados
            const { data: matchesData, error: matchesError } = await supabase
              .from('opportunity_matches')
              .select(`
                *,
                announcements (
                  id,
                  title,
                  price,
                  images,
                  city,
                  state,
                  created_at
                )
              `)
              .eq('user_id', user.id)
              .eq('is_dismissed', false)
              .order('created_at', { ascending: false })
              .limit(50);

            if (!matchesError && matchesData) {
              const mappedMatches = matchesData.map((match: any) => ({
                ...match,
                announcement: match.announcements
              }));
              setMatches(mappedMatches);
              console.log('✅ Matches atualizados:', mappedMatches.length);
            }

            // Buscar stats atualizadas
            const { data: statsData, error: statsError } = await supabase.rpc('get_radar_stats');
            if (!statsError && statsData) {
              const stats = Array.isArray(statsData) && statsData.length > 0 ? statsData[0] : null;
              setStats(stats || {
                total_alerts: 0,
                active_alerts: 0,
                total_matches: 0,
                unviewed_matches: 0,
                last_match_date: null
              });
              console.log('✅ Stats atualizadas:', stats);
            }
          } catch (err) {
            console.error('❌ Erro ao processar novo match via Real-time:', err);
          }
        }
      )
      .subscribe((status) => {
        console.log('📡 Status da subscription:', status);
        if (status === 'SUBSCRIBED') {
          console.log('✅ Subscription ativa para matches!');
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.error('❌ Erro na subscription:', status);
        }
      });

    return () => {
      console.log('🔌 Desconectando subscription de matches');
      matchesSubscription.unsubscribe();
    };
  }, [user?.id]);

  return {
    alerts,
    matches,
    stats,
    planLimits,
    isLoading,
    error,
    createAlert,
    updateAlert,
    deleteAlert,
    toggleAlertStatus,
    markMatchAsViewed,
    dismissMatch,
    refreshAlerts: fetchAlerts,
    refreshMatches: fetchMatches,
    refreshStats: fetchStats
  };
};

export default useRadar;
