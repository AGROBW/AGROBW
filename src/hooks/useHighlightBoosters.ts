import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import {
  HighlightBoosterPurchaseRecord,
  HighlightBoosterRecord,
  HighlightBoosterSummary,
} from '../../types';

const mapBooster = (row: any): HighlightBoosterRecord => ({
  id: row.id,
  name: row.name,
  description: row.description ?? null,
  monthlyPrice: Number(row.monthly_price ?? 0),
  categoryCredits: Number(row.category_credits ?? 0),
  homeCredits: Number(row.home_credits ?? 0),
  categoryHighlightDays: Number(row.category_highlight_days ?? 30),
  homeHighlightDays: Number(row.home_highlight_days ?? 15),
  maxPurchasesPer30Days: Number(row.max_purchases_per_30_days ?? 2),
  buttonText: row.button_text ?? 'Comprar booster',
  isActive: !!row.is_active,
  position: Number(row.position ?? 0),
});

const mapPurchase = (row: any): HighlightBoosterPurchaseRecord => ({
  id: row.id,
  boosterId: row.booster_id,
  boosterName: row.booster_name,
  amount: Number(row.amount ?? 0),
  status: row.status ?? 'credited',
  categoryCreditsTotal: Number(row.category_credits_total ?? 0),
  categoryCreditsRemaining: Number(row.category_credits_remaining ?? 0),
  homeCreditsTotal: Number(row.home_credits_total ?? 0),
  homeCreditsRemaining: Number(row.home_credits_remaining ?? 0),
  creditedAt: row.credited_at ?? row.created_at,
  createdAt: row.created_at,
  paymentId: row.payment_id ?? null,
  providerPaymentId: row.provider_payment_id ?? null,
});

const getRecentBoosterPurchasesCount = (rows: any[]) => {
  const now = Date.now();
  const windowStart = now - 30 * 24 * 60 * 60 * 1000;

  return rows.filter((row) => {
    if (row?.status !== 'credited') return false;
    const createdAt = new Date(row?.created_at ?? row?.credited_at ?? 0).getTime();
    if (!createdAt || Number.isNaN(createdAt)) return false;
    return createdAt >= windowStart;
  }).length;
};

export const useHighlightBoosters = () => {
  const { user } = useAuth();
  const [boosters, setBoosters] = useState<HighlightBoosterRecord[]>([]);
  const [purchases, setPurchases] = useState<HighlightBoosterPurchaseRecord[]>([]);
  const [summary, setSummary] = useState<HighlightBoosterSummary>({
    categoryRemaining: 0,
    homeRemaining: 0,
    purchasesLast30Days: 0,
    canPurchase: true,
    requiresPaidPlan: true,
    hasEligiblePaidPlan: false,
    currentPlanName: null,
    blockedReason: null,
  });
  const [isLoading, setIsLoading] = useState(true);

  const loadBoosters = async () => {
    const { data, error } = await supabase
      .from('highlight_boosters')
      .select('*')
      .eq('is_active', true)
      .order('position', { ascending: true });

    if (error) {
      console.error('[useHighlightBoosters] Erro ao carregar boosters:', error);
      setBoosters([]);
      return;
    }

    setBoosters((data || []).map(mapBooster));
  };

  const loadUserData = async () => {
    if (!user?.id) {
      setPurchases([]);
      setSummary({
        categoryRemaining: 0,
        homeRemaining: 0,
        purchasesLast30Days: 0,
        canPurchase: true,
        requiresPaidPlan: true,
        hasEligiblePaidPlan: false,
        currentPlanName: null,
        blockedReason: null,
      });
      return;
    }

    const [
      { data: purchasesData, error: purchasesError },
      { data: summaryData, error: summaryError },
      { data: activeSubscriptionData, error: activeSubscriptionError },
    ] =
      await Promise.all([
        supabase
          .from('user_highlight_booster_purchases')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false }),
        supabase.rpc('get_my_highlight_booster_summary'),
        supabase
          .from('user_subscriptions')
          .select(`
            status,
            current_period_end,
            plan:plans(
              id,
              name,
              monthly_price,
              yearly_price,
              is_downgrade_plan
            )
          `)
          .eq('user_id', user.id)
          .eq('status', 'active')
          .order('current_period_end', { ascending: false, nullsFirst: false })
          .limit(1)
          .maybeSingle(),
      ]);

    if (purchasesError) {
      console.error('[useHighlightBoosters] Erro ao carregar compras de booster:', purchasesError);
      setPurchases([]);
    } else {
      setPurchases((purchasesData || []).map(mapPurchase));
    }

    if (summaryError || !summaryData?.success) {
      console.error('[useHighlightBoosters] Erro ao carregar resumo de booster:', summaryError || summaryData);
      setSummary({
        categoryRemaining: 0,
        homeRemaining: 0,
        purchasesLast30Days: 0,
        canPurchase: true,
        requiresPaidPlan: true,
        hasEligiblePaidPlan: false,
        currentPlanName: null,
        blockedReason: null,
      });
      return;
    }

    if (activeSubscriptionError) {
      console.error('[useHighlightBoosters] Erro ao carregar plano ativo para booster:', activeSubscriptionError);
    }

    const activePlan = Array.isArray((activeSubscriptionData as any)?.plan)
      ? (activeSubscriptionData as any)?.plan?.[0] ?? null
      : (activeSubscriptionData as any)?.plan ?? null;
    const hasEligiblePaidPlan =
      !!activePlan &&
      !activePlan.is_downgrade_plan &&
      (Number(activePlan.monthly_price ?? 0) > 0 || Number(activePlan.yearly_price ?? 0) > 0);
    const blockedReason = hasEligiblePaidPlan
      ? null
      : 'Booster disponivel apenas para assinantes com plano pago ativo.';

    const activeBooster = (boosters[0] || null);
    const limit = activeBooster?.maxPurchasesPer30Days ?? 2;
    const recentPurchasesCount = getRecentBoosterPurchasesCount(purchasesData || []);

    setSummary({
      categoryRemaining: Number(summaryData.category_remaining ?? 0),
      homeRemaining: Number(summaryData.home_remaining ?? 0),
      purchasesLast30Days: recentPurchasesCount,
      canPurchase: hasEligiblePaidPlan && recentPurchasesCount < limit,
      requiresPaidPlan: true,
      hasEligiblePaidPlan,
      currentPlanName: activePlan?.name ?? null,
      blockedReason,
    });
  };

  useEffect(() => {
    setIsLoading(true);
    void loadBoosters().finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    void loadUserData();
  }, [user?.id, boosters.length]);

  const usageHistory = useMemo(
    () =>
      purchases.filter(
        (purchase) =>
          purchase.categoryCreditsRemaining < purchase.categoryCreditsTotal ||
          purchase.homeCreditsRemaining < purchase.homeCreditsTotal
      ),
    [purchases]
  );

  return {
    boosters,
    purchases,
    usageHistory,
    summary,
    isLoading,
    refresh: async () => {
      setIsLoading(true);
      await Promise.all([loadBoosters(), loadUserData()]);
      setIsLoading(false);
    },
  };
};
