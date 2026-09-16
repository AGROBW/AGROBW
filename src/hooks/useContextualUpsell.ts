import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabaseClient';
import {
  getContextualUpsellRecommendation,
  type ContextualUpsellContext,
  type ContextualUpsellEventType,
} from '../lib/contextualUpsell';
import { usePlans } from './usePlans';
import { useSubscription } from './useSubscription';

interface RuntimeSettings {
  enabled: boolean;
  recovery_enabled: boolean;
  usage_threshold_percent: number;
  impression_cooldown_hours: number;
  enabled_contexts: ContextualUpsellContext[];
}

const disabledRuntime: RuntimeSettings = {
  enabled: false,
  recovery_enabled: false,
  usage_threshold_percent: 80,
  impression_cooldown_hours: 72,
  enabled_contexts: [],
};

export const useContextualUpsell = ({
  context,
  adsLimit,
  resourceType,
  resourceId,
}: {
  context: ContextualUpsellContext;
  adsLimit?: number | null;
  resourceType?: 'announcement' | 'lead' | 'radar';
  resourceId?: string;
}) => {
  const { user } = useAuth();
  const { plansRaw } = usePlans();
  const {
    subscription,
    isLoading: isSubscriptionLoading,
    error: subscriptionError,
  } = useSubscription();
  const [runtime, setRuntime] = useState<RuntimeSettings>(disabledRuntime);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;
    if (!user) {
      setRuntime(disabledRuntime);
      setIsLoading(false);
      return () => { active = false; };
    }

    setIsLoading(true);
    void supabase.rpc('get_my_contextual_upsell_runtime').then(({ data, error }) => {
      if (!active) return;
      const row = Array.isArray(data) ? data[0] : data;
      setRuntime(!error && row ? row as RuntimeSettings : disabledRuntime);
      setIsLoading(false);
    });

    return () => { active = false; };
  }, [user?.id]);

  const currentPlan = useMemo(
    () => plansRaw.find((plan) => plan.id === subscription?.plan_id) || null,
    [plansRaw, subscription?.plan_id],
  );

  const hasActiveRecurringSubscription = Boolean(
    subscription
      && (subscription.billing_model || currentPlan?.billing_model) === 'recurring'
      && ['active', 'trialing', 'past_due'].includes(subscription.status)
      && (!subscription.current_period_end || new Date(subscription.current_period_end).getTime() > Date.now()),
  );

  const recommendation = useMemo(() => {
    if (
      isSubscriptionLoading
      || subscriptionError
      || !runtime.enabled
      || !runtime.enabled_contexts.includes(context)
    ) return null;
    return getContextualUpsellRecommendation({
      context,
      plans: plansRaw,
      currentPlan,
      adsLimit,
      hasActiveRecurringSubscription,
    });
  }, [adsLimit, context, currentPlan, hasActiveRecurringSubscription, isSubscriptionLoading, plansRaw, runtime.enabled, runtime.enabled_contexts, subscriptionError]);

  const track = useCallback(async (eventType: ContextualUpsellEventType) => {
    if (!user || !recommendation) return false;
    const { data, error } = await supabase.rpc('record_my_contextual_upsell_event', {
      p_context: context,
      p_event_type: eventType,
      p_offer_kind: recommendation.offerKind,
      p_target_plan_id: recommendation.targetPlan?.id || null,
      p_resource_type: resourceType || null,
      p_resource_id: resourceId || null,
      p_source_path: window.location.pathname.slice(0, 200),
    });
    if (error) return false;
    const row = Array.isArray(data) ? data[0] : data;
    return Boolean(row?.accepted);
  }, [context, recommendation, resourceId, resourceType, user]);

  return {
    isLoading: isLoading || isSubscriptionLoading,
    runtime,
    currentPlan,
    recommendation,
    track,
  };
};
