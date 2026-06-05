import { useEffect, useState, useMemo, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';
import { endAppSync, startAppSync } from '../lib/appSyncStatus';
import { useAuth } from '../contexts/AuthContext';
import { isSupabaseUnauthorizedError } from '../lib/supabaseAuthGuard';
import { getEffectiveLeadContactLimitDays, getSubscriptionUsageWindow } from '../utils/subscriptionUsageWindow';
import { BillingModel } from '../../types';

export type UserSubscription = {
  id: string;
  user_id: string;
  plan_id: string;
  billing_model: BillingModel;
  category_highlights_carryover?: number | null;
  home_highlights_carryover?: number | null;
  provider: string;
  provider_customer_id?: string | null;
  provider_subscription_id?: string | null;
  provider_price_id?: string | null;
  provider_checkout_session_id?: string | null;
  status: 'active' | 'trialing' | 'past_due' | 'canceled' | 'cancelled' | 'expired';
  current_period_start: string;
  current_period_end: string;
  cancel_at_period_end: boolean;
  trial_end_date: string | null;
  source?: string | null;
  promotion_code_id?: string | null;
  promotion_redemption_id?: string | null;
  created_at: string;
  updated_at: string;
  plans: {
    id: string;
    name: string;
    max_ads: number | null;
    category_highlights_count: number;
    home_highlight_count: number;
    category_highlight_days: number | null;
    home_highlight_days: number | null;
    ad_duration_days: number | null;
    lead_contact_limit_days: number | null;
    lead_contact_limit_days_monthly: number | null;
    lead_contact_limit_days_yearly: number | null;
    has_verification_badge: boolean;
    has_seller_store: boolean;
    has_email_marketing: boolean;
    has_commercial_intelligence: boolean;
    commercial_intelligence_requests_per_month: number;
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

type ActiveAdCapacityStatus = {
  plan_name: string | null;
  active_ads_count: number;
  max_ads: number | null;
  available_slots: number;
  is_over_limit: boolean;
  can_publish_new: boolean;
  can_reactivate: boolean;
};

const ELIGIBLE_SUBSCRIPTION_STATUSES: UserSubscription['status'][] = ['active', 'trialing', 'past_due'];
const SUBSCRIPTION_STATUS_PRIORITY: Record<UserSubscription['status'], number> = {
  active: 3,
  trialing: 2,
  past_due: 1,
  canceled: 0,
  cancelled: 0,
  expired: 0,
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
      return null;
    }

    try {
      setIsLoading(true);
      setError(null);

      await supabase.rpc('ensure_user_current_subscription', {
        p_user_id: user.id,
      });

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
            category_highlight_days,
            home_highlight_days,
            ad_duration_days,
            lead_contact_limit_days,
            lead_contact_limit_days_monthly,
            lead_contact_limit_days_yearly,
            has_verification_badge,
            has_seller_store,
            has_email_marketing,
            has_commercial_intelligence,
            commercial_intelligence_requests_per_month
          )
        `)
        .eq('user_id', user.id)
        .in('status', ELIGIBLE_SUBSCRIPTION_STATUSES)
        .gte('current_period_end', new Date().toISOString())
        .order('current_period_end', { ascending: false })
        .limit(5);

      if (subscriptionError) throw subscriptionError;

      const nextSubscription =
        ((data as UserSubscription[] | null) || [])
          .sort((left, right) => {
            const statusDiff =
              SUBSCRIPTION_STATUS_PRIORITY[right.status] - SUBSCRIPTION_STATUS_PRIORITY[left.status];

            if (statusDiff !== 0) {
              return statusDiff;
            }

            return (
              new Date(right.current_period_end).getTime() -
              new Date(left.current_period_end).getTime()
            );
          })[0] || null;
      setSubscription(nextSubscription);
      clearRetry();
      return nextSubscription;
    } catch (err: any) {
      if (isSupabaseUnauthorizedError(err)) {
        console.warn('[useSubscription] Sessao expirada ao buscar assinatura.');
        clearRetry();
        setError(null);
        setSubscription(null);
        return null;
      }

      console.error('[useSubscription] Erro ao buscar assinatura:', err);
      setError(err.message);
      setSubscription(null);
      scheduleRetry(async () => {
        await fetchSubscription();
      });
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  const fetchUsage = async (subscriptionOverride?: UserSubscription | null) => {
    if (!user?.id) {
      return;
    }

    try {
      const activeSubscription = subscriptionOverride !== undefined ? subscriptionOverride : subscription;
      const periodStart = activeSubscription ? new Date(activeSubscription.current_period_start) : null;
      const periodEnd = activeSubscription ? new Date(activeSubscription.current_period_end) : null;
      const usageWindow = activeSubscription
        ? getSubscriptionUsageWindow(activeSubscription.current_period_start, activeSubscription.current_period_end)
        : null;
      const now = new Date();
      const isWithinPeriod = periodStart && periodEnd ? now >= periodStart && now <= periodEnd : false;

      let adsCount = 0;
      let adsLimit = activeSubscription?.plans?.max_ads ?? null;
      let categoryHighlightsCount = 0;
      let homeHighlightsCount = 0;
      const categoryHighlightsCarryover = Math.max(
        Number(activeSubscription?.category_highlights_carryover ?? 0),
        0
      );
      const homeHighlightsCarryover = Math.max(
        Number(activeSubscription?.home_highlights_carryover ?? 0),
        0
      );

      if (activeSubscription) {
        const { data: capacityRows, error: capacityError } = await supabase.rpc('get_my_active_ad_capacity_status');

        if (capacityError) {
          throw capacityError;
        }

        const capacityStatus = (capacityRows as ActiveAdCapacityStatus[] | null)?.[0];
        if (capacityStatus) {
          adsCount = Number(capacityStatus.active_ads_count ?? 0);
          adsLimit = capacityStatus.max_ads ?? adsLimit;
        }

        const { count: categoryHighlightsCountData, error: categoryError } = await supabase
          .from('announcement_highlights_history')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .eq('highlight_type', 'category')
          .eq('credit_source', 'plan')
          .gte('applied_at', usageWindow?.usageStart.toISOString() || activeSubscription.current_period_start)
          .lte('applied_at', usageWindow?.usageEnd.toISOString() || activeSubscription.current_period_end);

        if (categoryError) throw categoryError;
        categoryHighlightsCount = categoryHighlightsCountData || 0;

        const { count: homeHighlightsCountData, error: homeError } = await supabase
          .from('announcement_highlights_history')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .eq('highlight_type', 'home')
          .eq('credit_source', 'plan')
          .gte('applied_at', usageWindow?.usageStart.toISOString() || activeSubscription.current_period_start)
          .lte('applied_at', usageWindow?.usageEnd.toISOString() || activeSubscription.current_period_end);

        if (homeError) throw homeError;
        homeHighlightsCount = homeHighlightsCountData || 0;
      }

      const { data: boosterSummary, error: boosterError } = await supabase.rpc('get_my_highlight_booster_summary');

      if (boosterError) throw boosterError;

      setUsage({
        adsUsed: adsCount,
        adsLimit,
        categoryHighlightsUsed: categoryHighlightsCount,
        categoryHighlightsLimit:
          Math.max(Number(activeSubscription?.plans?.category_highlights_count ?? 0), 0) +
          categoryHighlightsCarryover,
        homeHighlightsUsed: homeHighlightsCount,
        homeHighlightsLimit:
          Math.max(Number(activeSubscription?.plans?.home_highlight_count ?? 0), 0) +
          homeHighlightsCarryover,
        categoryHighlightsBoosterRemaining: Number(boosterSummary?.category_remaining ?? 0),
        homeHighlightsBoosterRemaining: Number(boosterSummary?.home_remaining ?? 0),
        isWithinPeriod: !!isWithinPeriod,
        periodEndDate: periodEnd,
        periodStartDate: periodStart
      });
      clearRetry();
    } catch (err: any) {
      if (isSupabaseUnauthorizedError(err)) {
        console.warn('[useSubscription] Sessao expirada ao buscar uso.');
        clearRetry();
        return;
      }

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
      const tasks: Promise<void>[] = [
        fetchSubscription().then(() => undefined),
      ];
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

  const effectiveLeadContactLimitDays = useMemo(() => {
    if (!subscription?.plans) return null;
    const usageWindow = getSubscriptionUsageWindow(
      subscription.current_period_start,
      subscription.current_period_end
    );
    return getEffectiveLeadContactLimitDays(subscription.plans, usageWindow.isAnnualContract, {
      isPromotion: subscription.source === 'promotion' || Boolean(subscription.promotion_code_id),
      periodStartIso: subscription.current_period_start,
      periodEndIso: subscription.current_period_end,
    });
  }, [subscription]);

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
    return `Voce atingiu o limite de anuncios ativos do seu plano ${planName} (${maxAds} anuncios). Desative um anuncio ativo ou faca upgrade para liberar mais vagas.`;
  }, [subscription]);

  const refreshUsage = async () => {
    await fetchUsage();
  };

  const refreshSubscriptionAndUsage = async () => {
    const nextSubscription = await fetchSubscription();
    await fetchUsage(nextSubscription);
    return nextSubscription;
  };

  return {
    subscription,
    usage,
    isLoading,
    error,
    canCreateAd,
    canApplyCategoryHighlight,
    canApplyHomeHighlight,
    effectiveLeadContactLimitDays,
    adLimitMessage,
    refreshUsage,
    refetch: refreshSubscriptionAndUsage
  };
};
