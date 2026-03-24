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

export const useHighlightBoosters = () => {
  const { user } = useAuth();
  const [boosters, setBoosters] = useState<HighlightBoosterRecord[]>([]);
  const [purchases, setPurchases] = useState<HighlightBoosterPurchaseRecord[]>([]);
  const [summary, setSummary] = useState<HighlightBoosterSummary>({
    categoryRemaining: 0,
    homeRemaining: 0,
    purchasesLast30Days: 0,
    canPurchase: true,
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
      });
      return;
    }

    const [{ data: purchasesData, error: purchasesError }, { data: summaryData, error: summaryError }] =
      await Promise.all([
        supabase
          .from('user_highlight_booster_purchases')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false }),
        supabase.rpc('get_my_highlight_booster_summary'),
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
      });
      return;
    }

    const activeBooster = (boosters[0] || null);
    const limit = activeBooster?.maxPurchasesPer30Days ?? 2;

    setSummary({
      categoryRemaining: Number(summaryData.category_remaining ?? 0),
      homeRemaining: Number(summaryData.home_remaining ?? 0),
      purchasesLast30Days: Number(summaryData.purchases_last_30_days ?? 0),
      canPurchase: Number(summaryData.purchases_last_30_days ?? 0) < limit,
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
