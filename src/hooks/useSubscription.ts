import { useEffect, useState, useMemo } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../contexts/AuthContext';

export type UserSubscription = {
  id: string;
  user_id: string;
  plan_id: string;
  status: 'active' | 'trialing' | 'past_due' | 'canceled' | 'expired';
  current_period_start: string;
  current_period_end: string;
  cancel_at_period_end: boolean;
  trial_end_date: string | null;
  created_at: string;
  updated_at: string;
  plans: {
    id: string;
    name: string;
    max_ads: number | null;
    category_highlights_count: number;
    home_highlight_count: number;
    ad_duration_days: number | null;
    lead_contact_limit_days: number | null;
    has_verification_badge: boolean;
    has_seller_store: boolean;
    has_email_marketing: boolean;
  } | null;
};

export type UsageStats = {
  adsUsed: number;
  adsLimit: number | null;
  categoryHighlightsUsed: number;
  categoryHighlightsLimit: number;
  homeHighlightsUsed: number;
  homeHighlightsLimit: number;
  isWithinPeriod: boolean;
  periodEndDate: Date | null;
  periodStartDate: Date | null;
};

export const useSubscription = () => {
  const { user } = useAuth();
  const [subscription, setSubscription] = useState<UserSubscription | null>(null);
  const [usage, setUsage] = useState<UsageStats>({
    adsUsed: 0,
    adsLimit: null,
    categoryHighlightsUsed: 0,
    categoryHighlightsLimit: 0,
    homeHighlightsUsed: 0,
    homeHighlightsLimit: 0,
    isWithinPeriod: true,
    periodEndDate: null,
    periodStartDate: null
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Buscar assinatura ativa do usuário
  const fetchSubscription = async () => {
    if (!user?.id) {
      setSubscription(null);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      const { data, error: subscriptionError } = await supabase
        .from('user_subscriptions')
        .select(`
          *,
          plans (
            id,
            name,
            max_ads,
            category_highlights_count,
            home_highlight_count,
            ad_duration_days,
            lead_contact_limit_days,
            has_verification_badge,
            has_seller_store,
            has_email_marketing
          )
        `)
        .eq('user_id', user.id)
        .eq('status', 'active')
        .gte('current_period_end', new Date().toISOString())
        .order('current_period_end', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (subscriptionError) throw subscriptionError;

      setSubscription(data as UserSubscription | null);
    } catch (err: any) {
      console.error('[useSubscription] Erro ao buscar assinatura:', err);
      setError(err.message);
      setSubscription(null);
    } finally {
      setIsLoading(false);
    }
  };

  // Buscar estatísticas de uso do ciclo atual
  const fetchUsage = async () => {
    if (!user?.id || !subscription) {
      return;
    }

    try {
      const periodStart = new Date(subscription.current_period_start);
      const periodEnd = new Date(subscription.current_period_end);
      const now = new Date();
      const isWithinPeriod = now >= periodStart && now <= periodEnd;

      // Contar anúncios criados no período atual
      const { count: adsCount, error: adsError } = await supabase
        .from('announcements')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .in('status', ['active', 'ACTIVE'])
        .gte('created_at', subscription.current_period_start);

      if (adsError) throw adsError;

      // Contar destaques de categoria no período atual
      const { count: categoryHighlightsCount, error: categoryError } = await supabase
        .from('announcement_highlights_history')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('highlight_type', 'category')
        .gte('applied_at', subscription.current_period_start)
        .lte('applied_at', subscription.current_period_end);

      if (categoryError) throw categoryError;

      // Contar destaques de home no período atual (anúncios atualmente destacados)
      const { count: homeHighlightsCount, error: homeError } = await supabase
        .from('announcements')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('highlight_home', true)
        .in('status', ['active', 'ACTIVE']);

      if (homeError) throw homeError;

      setUsage({
        adsUsed: adsCount || 0,
        adsLimit: subscription.plans?.max_ads ?? null,
        categoryHighlightsUsed: categoryHighlightsCount || 0,
        categoryHighlightsLimit: subscription.plans?.category_highlights_count || 0,
        homeHighlightsUsed: homeHighlightsCount || 0,
        homeHighlightsLimit: subscription.plans?.home_highlight_count || 0,
        isWithinPeriod,
        periodEndDate: periodEnd,
        periodStartDate: periodStart
      });
    } catch (err: any) {
      console.error('[useSubscription] Erro ao buscar uso:', err);
    }
  };

  useEffect(() => {
    fetchSubscription();
  }, [user?.id]);

  useEffect(() => {
    if (subscription) {
      fetchUsage();
    }
  }, [subscription, user?.id]);

  // Verificar se pode criar mais anúncios
  const canCreateAd = useMemo(() => {
    if (!subscription?.plans) return false;
    const maxAds = subscription.plans.max_ads;
    if (maxAds === null || maxAds === undefined) return true;
    return usage.adsUsed < maxAds;
  }, [subscription, usage.adsUsed]);

  // Verificar se pode aplicar destaque de categoria
  const canApplyCategoryHighlight = useMemo(() => {
    if (!subscription?.plans) return false;
    const limit = subscription.plans.category_highlights_count || 0;
    return usage.categoryHighlightsUsed < limit && usage.isWithinPeriod;
  }, [subscription, usage.categoryHighlightsUsed, usage.isWithinPeriod]);

  // Verificar se pode aplicar destaque de home
  const canApplyHomeHighlight = useMemo(() => {
    if (!subscription?.plans) return false;
    const limit = subscription.plans.home_highlight_count || 0;
    return usage.homeHighlightsUsed < limit && usage.isWithinPeriod;
  }, [subscription, usage.homeHighlightsUsed, usage.isWithinPeriod]);

  // Mensagem de erro para limite de anúncios
  const adLimitMessage = useMemo(() => {
    if (!subscription?.plans) return '';
    const planName = subscription.plans.name;
    const maxAds = subscription.plans.max_ads;
    return `Você atingiu o limite de anúncios do seu plano ${planName} (${maxAds} anúncios). Faça um upgrade para publicar mais.`;
  }, [subscription]);

  // Atualizar uso (para chamar após criar anúncio ou aplicar destaque)
  const refreshUsage = async () => {
    await fetchUsage();
  };

  return {
    subscription,
    usage,
    isLoading,
    error,
    canCreateAd,
    canApplyCategoryHighlight,
    canApplyHomeHighlight,
    adLimitMessage,
    refreshUsage,
    refetch: fetchSubscription
  };
};
