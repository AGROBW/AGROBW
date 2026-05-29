import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../contexts/AuthContext';

export type ScheduledSubscriptionChange = {
  id: string;
  subscriptionId: string;
  provider: string;
  providerSubscriptionId?: string | null;
  changeKind: 'upgrade' | 'downgrade' | 'cancel';
  status: 'pending' | 'applied' | 'cancelled' | 'failed';
  effectiveOn: string;
  requestedAt: string;
  currentPlanId: string;
  currentPlanName: string;
  targetPlanId?: string | null;
  targetPlanName?: string | null;
  currentBillingCycle?: 'monthly' | 'yearly' | null;
  targetBillingCycle?: 'monthly' | 'yearly' | null;
  source: string;
  metadata: Record<string, unknown>;
};

const mapScheduledSubscriptionChange = (row: any): ScheduledSubscriptionChange => ({
  id: row.id,
  subscriptionId: row.subscription_id,
  provider: row.provider ?? 'stripe',
  providerSubscriptionId: row.provider_subscription_id ?? null,
  changeKind: row.change_kind,
  status: row.status,
  effectiveOn: row.effective_on,
  requestedAt: row.requested_at,
  currentPlanId: row.current_plan_id,
  currentPlanName: row.current_plan_name ?? 'Plano atual',
  targetPlanId: row.target_plan_id ?? null,
  targetPlanName: row.target_plan_name ?? null,
  currentBillingCycle: row.current_billing_cycle ?? null,
  targetBillingCycle: row.target_billing_cycle ?? null,
  source: row.source ?? 'user_dashboard',
  metadata: row.metadata ?? {},
});

export const useScheduledSubscriptionChange = () => {
  const { user } = useAuth();
  const [pendingChange, setPendingChange] = useState<ScheduledSubscriptionChange | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPendingChange = async () => {
    if (!user?.id) {
      setPendingChange(null);
      setIsLoading(false);
      setError(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const { data, error: rpcError } = await supabase.rpc('get_my_pending_subscription_change');

      if (rpcError) {
        const lowerMessage = String(rpcError.message || '').toLowerCase();
        const isMissingFoundation =
          lowerMessage.includes('could not find the function') ||
          lowerMessage.includes('does not exist') ||
          lowerMessage.includes('relation') ||
          lowerMessage.includes('schema cache');

        if (isMissingFoundation) {
          setPendingChange(null);
          setError(null);
          return;
        }

        setPendingChange(null);
        setError(rpcError.message);
        return;
      }

      const row = Array.isArray(data) ? data[0] : data;
      setPendingChange(row ? mapScheduledSubscriptionChange(row) : null);
    } catch (err) {
      setPendingChange(null);
      setError(err instanceof Error ? err.message : 'Erro ao carregar alteracao agendada.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void fetchPendingChange();
  }, [user?.id]);

  return {
    pendingChange,
    isLoading,
    error,
    refetch: fetchPendingChange,
  };
};
