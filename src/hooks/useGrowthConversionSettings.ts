import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { GrowthConversionSettings } from '../../types';
import {
  DEFAULT_GROWTH_CONVERSION_TEMPLATES,
  cloneTemplateSet,
  mergeGrowthTemplates,
} from '../lib/planAlertTemplates';

const DEFAULT_GROWTH_CONVERSION_SETTINGS: Omit<
  GrowthConversionSettings,
  'id' | 'createdAt' | 'updatedAt'
> = {
  isEnabled: true,
  dailyUserLimit: 1,
  minViewsForHighViews: 20,
  minViewsForNoLeads: 50,
  minViewsForExpiring: 15,
  expireSoonDays: 7,
  triggerHighViewsEnabled: true,
  triggerTopCategoryEnabled: true,
  triggerNoLeadsEnabled: true,
  triggerExpiringEnabled: true,
  triggerPlanLimitEnabled: true,
  templates: cloneTemplateSet(DEFAULT_GROWTH_CONVERSION_TEMPLATES),
  updatedBy: null,
};

const mapGrowthConversionSettings = (row: any): GrowthConversionSettings => ({
  id: row.id,
  isEnabled: row.is_enabled ?? DEFAULT_GROWTH_CONVERSION_SETTINGS.isEnabled,
  dailyUserLimit: row.daily_user_limit ?? DEFAULT_GROWTH_CONVERSION_SETTINGS.dailyUserLimit,
  minViewsForHighViews:
    row.min_views_for_high_views ?? DEFAULT_GROWTH_CONVERSION_SETTINGS.minViewsForHighViews,
  minViewsForNoLeads:
    row.min_views_for_no_leads ?? DEFAULT_GROWTH_CONVERSION_SETTINGS.minViewsForNoLeads,
  minViewsForExpiring:
    row.min_views_for_expiring ?? DEFAULT_GROWTH_CONVERSION_SETTINGS.minViewsForExpiring,
  expireSoonDays: row.expire_soon_days ?? DEFAULT_GROWTH_CONVERSION_SETTINGS.expireSoonDays,
  triggerHighViewsEnabled:
    row.trigger_high_views_enabled ?? DEFAULT_GROWTH_CONVERSION_SETTINGS.triggerHighViewsEnabled,
  triggerTopCategoryEnabled:
    row.trigger_top_category_enabled ??
    DEFAULT_GROWTH_CONVERSION_SETTINGS.triggerTopCategoryEnabled,
  triggerNoLeadsEnabled:
    row.trigger_no_leads_enabled ?? DEFAULT_GROWTH_CONVERSION_SETTINGS.triggerNoLeadsEnabled,
  triggerExpiringEnabled:
    row.trigger_expiring_enabled ?? DEFAULT_GROWTH_CONVERSION_SETTINGS.triggerExpiringEnabled,
  triggerPlanLimitEnabled:
    row.trigger_plan_limit_enabled ?? DEFAULT_GROWTH_CONVERSION_SETTINGS.triggerPlanLimitEnabled,
  templates: mergeGrowthTemplates(row.templates),
  updatedBy: row.updated_by ?? null,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export const useGrowthConversionSettings = () => {
  const [settings, setSettings] = useState<GrowthConversionSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSettings = async () => {
    setIsLoading(true);
    setError(null);

    const { data, error } = await supabase
      .from('growth_conversion_settings')
      .select('*')
      .limit(1)
      .maybeSingle();

    if (error) {
      setError(error.message);
      setSettings(null);
    } else {
      setSettings(data ? mapGrowthConversionSettings(data) : null);
    }

    setIsLoading(false);
  };

  const saveSettings = async (payload: Partial<GrowthConversionSettings>) => {
    const currentId = settings?.id;
    const dbPayload = {
      is_enabled: payload.isEnabled ?? settings?.isEnabled ?? DEFAULT_GROWTH_CONVERSION_SETTINGS.isEnabled,
      daily_user_limit:
        payload.dailyUserLimit ??
        settings?.dailyUserLimit ??
        DEFAULT_GROWTH_CONVERSION_SETTINGS.dailyUserLimit,
      min_views_for_high_views:
        payload.minViewsForHighViews ??
        settings?.minViewsForHighViews ??
        DEFAULT_GROWTH_CONVERSION_SETTINGS.minViewsForHighViews,
      min_views_for_no_leads:
        payload.minViewsForNoLeads ??
        settings?.minViewsForNoLeads ??
        DEFAULT_GROWTH_CONVERSION_SETTINGS.minViewsForNoLeads,
      min_views_for_expiring:
        payload.minViewsForExpiring ??
        settings?.minViewsForExpiring ??
        DEFAULT_GROWTH_CONVERSION_SETTINGS.minViewsForExpiring,
      expire_soon_days:
        payload.expireSoonDays ??
        settings?.expireSoonDays ??
        DEFAULT_GROWTH_CONVERSION_SETTINGS.expireSoonDays,
      trigger_high_views_enabled:
        payload.triggerHighViewsEnabled ??
        settings?.triggerHighViewsEnabled ??
        DEFAULT_GROWTH_CONVERSION_SETTINGS.triggerHighViewsEnabled,
      trigger_top_category_enabled:
        payload.triggerTopCategoryEnabled ??
        settings?.triggerTopCategoryEnabled ??
        DEFAULT_GROWTH_CONVERSION_SETTINGS.triggerTopCategoryEnabled,
      trigger_no_leads_enabled:
        payload.triggerNoLeadsEnabled ??
        settings?.triggerNoLeadsEnabled ??
        DEFAULT_GROWTH_CONVERSION_SETTINGS.triggerNoLeadsEnabled,
      trigger_expiring_enabled:
        payload.triggerExpiringEnabled ??
        settings?.triggerExpiringEnabled ??
        DEFAULT_GROWTH_CONVERSION_SETTINGS.triggerExpiringEnabled,
      trigger_plan_limit_enabled:
        payload.triggerPlanLimitEnabled ??
        settings?.triggerPlanLimitEnabled ??
        DEFAULT_GROWTH_CONVERSION_SETTINGS.triggerPlanLimitEnabled,
      templates: payload.templates ?? settings?.templates ?? DEFAULT_GROWTH_CONVERSION_SETTINGS.templates,
      updated_at: new Date().toISOString(),
    };

    const query = currentId
      ? supabase.from('growth_conversion_settings').update(dbPayload).eq('id', currentId)
      : supabase.from('growth_conversion_settings').insert(dbPayload);

    const { error } = await query;

    if (error) {
      return { error: error.message };
    }

    await fetchSettings();
    return { error: null };
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  return {
    settings,
    isLoading,
    error,
    fetchSettings,
    saveSettings,
    defaultSettings: DEFAULT_GROWTH_CONVERSION_SETTINGS,
  };
};
