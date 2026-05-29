import { supabase } from '../src/lib/supabaseClient';

export type SubscriptionChangeKind = 'upgrade' | 'downgrade' | 'cancel';
type SyncStripeSubscriptionChangeMode = 'sync_pending' | 'revert_cancelled';
type DirectStripeChangeMode = SyncStripeSubscriptionChangeMode | 'clear_cancel_at_period_end';

const readRpcErrorMessage = (error: any) =>
  error?.message || error?.details || error?.hint || 'Não foi possível processar a alteração da assinatura.';

const syncStripeSubscriptionChangeRequest = async (params?: {
  requestId?: string | null;
  mode?: DirectStripeChangeMode;
  providerSubscriptionId?: string | null;
}) => {
  const { data, error } = await supabase.functions.invoke('sync-stripe-subscription-change-request', {
    body: {
      requestId: params?.requestId ?? undefined,
      mode: params?.mode ?? 'sync_pending',
      providerSubscriptionId: params?.providerSubscriptionId ?? undefined,
    },
  });

  if (error) {
    return {
      success: false as const,
      error: error.message || 'Não foi possível sincronizar a alteração com a Stripe.',
    };
  }

  if (data?.success === false) {
    return {
      success: false as const,
      error: data?.error || 'Não foi possível sincronizar a alteração com a Stripe.',
    };
  }

  return {
    success: true as const,
    data,
  };
};

export const requestSubscriptionChangeNextCycle = async (params: {
  changeKind: SubscriptionChangeKind;
  targetPlanId?: string | null;
  targetBillingCycle?: 'monthly' | 'yearly' | null;
}) => {
  const { data, error } = await supabase.rpc('request_subscription_change_next_cycle', {
    p_change_kind: params.changeKind,
    p_target_plan_id: params.targetPlanId ?? null,
    p_target_billing_cycle: params.targetBillingCycle ?? null,
  });

  if (error) {
    return {
      success: false as const,
      error: readRpcErrorMessage(error),
    };
  }

  const requestId = data?.id ? String(data.id) : null;
  const syncResult = await syncStripeSubscriptionChangeRequest({
    requestId,
    mode: 'sync_pending',
  });

  return {
    success: true as const,
    data,
    warning: syncResult.success ? null : syncResult.error,
  };
};

export const cancelPendingSubscriptionChange = async () => {
  const { data, error } = await supabase.rpc('cancel_my_pending_subscription_change');

  if (error) {
    return {
      success: false as const,
      error: readRpcErrorMessage(error),
    };
  }

  const requestId = data?.id ? String(data.id) : null;
  const syncResult = await syncStripeSubscriptionChangeRequest({
    requestId,
    mode: 'revert_cancelled',
  });

  return {
    success: true as const,
    data,
    warning: syncResult.success ? null : syncResult.error,
  };
};

export const clearStripeSubscriptionCancelAtPeriodEnd = async (providerSubscriptionId?: string | null) => {
  const syncResult = await syncStripeSubscriptionChangeRequest({
    mode: 'clear_cancel_at_period_end',
    providerSubscriptionId: providerSubscriptionId ?? null,
  });

  if (!syncResult.success) {
    return {
      success: false as const,
      error: syncResult.error,
    };
  }

  return {
    success: true as const,
    data: syncResult.data,
  };
};
