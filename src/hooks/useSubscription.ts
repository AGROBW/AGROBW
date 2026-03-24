import { useEffect, useState, useMemo, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';
import { endAppSync, startAppSync } from '../lib/appSyncStatus';
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
  categoryHighlightsBoosterRemaining: number;
  homeHighlightsBoosterRemaining: number;
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
    categoryHighlightsBoosterRemaining: 0,
    homeHighlightsBoosterRemaining: 0,
    isWithinPeriod: true,
    periodEndDate: null,
    periodStartDate: null
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const retryTimeoutRef = useRef<number | null>(null);

  const clearRetry = () => {
    if (retryTimeoutRef.current !== null && typeof window !== 'undefined') {
      window.clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
  };

  const scheduleRetry = (fn: () => Promise<void>) => {
    if (typeof window === 'undefined' || retryTimeoutRef.current !== null) return;

    retryTimeoutRef.current = window.setTimeout(() => {
      retryTimeoutRef.current = null;
      startAppSync();
      void fn().finally(() => {
        endAppSync();
      });
    }, 5000);
  };

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
      clearRetry();
    } catch (err: any) {
      console.error('[useSubscription] Erro ao buscar assinatura:', err);
      setError(err.message);
      setSubscription(null);
      scheduleRetry(fetchSubscription);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchUsage = async () => {
    if (!user?.id) {
      return;
    }

    try {
      const periodStart = subscription ? new Date(subscription.current_period_start) : null;
      const periodEnd = subscription ? new Date(subscription.current_period_end) : null;
      const now = new Date();
      const isWithinPeriod = periodStart && periodEnd ? now >= periodStart && now <= periodEnd : false;

      let adsCount = 0;
      let categoryHighlightsCount = 0;
      let homeHighlightsCount = 0;

      if (subscription) {
        const { count: adsCountData, error: adsError } = await supabase
          .from('announcements')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .in('status', ['active', 'ACTIVE'])
          .gte('created_at', subscription.current_period_start);

        if (adsError) throw adsError;
        adsCount = adsCountData || 0;

        const { count: categoryHighlightsCountData, error: categoryError } = await supabase
          .from('announcement_highlights_history')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .eq('highlight_type', 'category')
          .eq('credit_source', 'plan')
          .gte('applied_at', subscription.current_period_start)
          .lte('applied_at', subscription.current_period_end);

        if (categoryError) throw categoryError;
        categoryHighlightsCount = categoryHighlightsCountData || 0;

        const { count: homeHighlightsCountData, error: homeError } = await supabase
          .from('announcement_highlights_history')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .eq('highlight_type', 'home')
          .eq('credit_source', 'plan')
          .gte('applied_at', subscription.current_period_start)
          .lte('applied_at', subscription.current_period_end);

        if (homeError) throw homeError;
        homeHighlightsCount = homeHighlightsCountData || 0;
      }

      const { data: boosterSummary, error: boosterError } = await supabase.rpc('get_my_highlight_booster_summary');

      if (boosterError) throw boosterError;

      setUsage({
        adsUsed: adsCount,
        adsLimit: subscription.plans?.max_ads ?? null,
        categoryHighlightsUsed: categoryHighlightsCount,
        categoryHighlightsLimit: subscription.plans?.category_highlights_count || 0,
        homeHighlightsUsed: homeHighlightsCount,
        homeHighlightsLimit: subscription.plans?.home_highlight_count || 0,
        categoryHighlightsBoosterRemaining: Number(boosterSummary?.category_remaining ?? 0),
        homeHighlightsBoosterRemaining: Number(boosterSummary?.home_remaining ?? 0),
        isWithinPeriod: !!isWithinPeriod,
        periodEndDate: periodEnd,
        periodStartDate: periodStart
      });
      clearRetry();
    } catch (err: any) {
      console.error('[useSubscription] Erro ao buscar uso:', err);
      scheduleRetry(fetchUsage);
    }
  };

  useEffect(() => {
    void fetchSubscription();
    return () => clearRetry();
  }, [user?.id]);

  useEffect(() => {
    void fetchUsage();
  }, [subscription?.id, user?.id]);

  useEffect(() => {
    if (typeof window === 'undefined' || !user?.id) return;

    const handleOnline = () => {
      startAppSync();
      const tasks: Promise<void>[] = [fetchSubscription()];
      if (subscription) {
        tasks.push(fetchUsage());
      }
      void Promise.all(tasks).finally(() => {
        endAppSync();
      });
    };

    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [user?.id, subscription?.id]);

  const canCreateAd = useMemo(() => {
    if (!subscription?.plans) return false;
    const maxAds = subscription.plans.max_ads;
    if (maxAds === null || maxAds === undefined) return true;
    return usage.adsUsed < maxAds;
  }, [subscription, usage.adsUsed]);

  const canApplyCategoryHighlight = useMemo(() => {
    const limit = subscription?.plans?.category_highlights_count || 0;
    return (usage.categoryHighlightsUsed < limit && usage.isWithinPeriod) || usage.categoryHighlightsBoosterRemaining > 0;
  }, [subscription, usage.categoryHighlightsUsed, usage.categoryHighlightsBoosterRemaining, usage.isWithinPeriod]);

  const canApplyHomeHighlight = useMemo(() => {
    const limit = subscription?.plans?.home_highlight_count || 0;
    return (usage.homeHighlightsUsed < limit && usage.isWithinPeriod) || usage.homeHighlightsBoosterRemaining > 0;
  }, [subscription, usage.homeHighlightsUsed, usage.homeHighlightsBoosterRemaining, usage.isWithinPeriod]);

  const adLimitMessage = useMemo(() => {
    if (!subscription?.plans) return '';
    const planName = subscription.plans.name;
    const maxAds = subscription.plans.max_ads;
    return `Você atingiu o limite de anúncios do seu plano ${planName} (${maxAds} anúncios). Faça um upgrade para publicar mais.`;
  }, [subscription]);

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
