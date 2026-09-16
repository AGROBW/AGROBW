import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import type { ContextualUpsellContext } from '../lib/contextualUpsell';

export interface ContextualUpsellAdminSettings {
  id: string;
  is_enabled: boolean;
  recovery_enabled: boolean;
  usage_threshold_percent: number;
  impression_cooldown_hours: number;
  enabled_contexts: ContextualUpsellContext[];
  canary_user_ids: string[];
  updated_at: string;
}

export interface ContextualUpsellMetrics {
  impressions_30d: number;
  clicks_30d: number;
  checkout_started_30d: number;
  converted_30d: number;
  pending_recovery: number;
}

interface AdminPayload {
  settings: ContextualUpsellAdminSettings;
  metrics: ContextualUpsellMetrics;
}

export const useContextualUpsellSettings = () => {
  const [data, setData] = useState<AdminPayload | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    const { data: response, error: loadError } = await supabase.rpc('get_contextual_upsell_admin');
    if (loadError) {
      setError(loadError.message);
      setData(null);
    } else {
      setData(response as unknown as AdminPayload);
    }
    setIsLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const save = useCallback(async (settings: ContextualUpsellAdminSettings) => {
    setIsSaving(true);
    setError(null);
    const { error: saveError } = await supabase.rpc('update_contextual_upsell_admin', {
      p_is_enabled: settings.is_enabled,
      p_recovery_enabled: settings.recovery_enabled,
      p_usage_threshold_percent: settings.usage_threshold_percent,
      p_impression_cooldown_hours: settings.impression_cooldown_hours,
      p_enabled_contexts: settings.enabled_contexts,
      p_canary_user_ids: settings.canary_user_ids,
    });
    setIsSaving(false);
    if (saveError) {
      setError(saveError.message);
      return false;
    }
    await load();
    return true;
  }, [load]);

  return { data, isLoading, isSaving, error, load, save };
};
