import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { RenewalNotificationSettings } from '../../types';
import {
  DEFAULT_RENEWAL_NOTIFICATION_TEMPLATES,
  cloneTemplateSet,
  mergeRenewalTemplates,
} from '../lib/planAlertTemplates';

const DEFAULT_RENEWAL_NOTIFICATION_SETTINGS: Omit<
  RenewalNotificationSettings,
  'id' | 'createdAt' | 'updatedAt'
> = {
  isEnabled: true,
  dailyUserLimit: 1,
  notifySevenDaysBefore: true,
  notifyThreeDaysBefore: true,
  notifyOneDayBefore: true,
  notifyOnExpirationDay: true,
  notifyAfterExpiration: true,
  daysAfterExpiration: 1,
  showDashboardToast: true,
  templates: cloneTemplateSet(DEFAULT_RENEWAL_NOTIFICATION_TEMPLATES),
  updatedBy: null,
};

const mapRenewalNotificationSettings = (row: any): RenewalNotificationSettings => ({
  id: row.id,
  isEnabled: row.is_enabled ?? DEFAULT_RENEWAL_NOTIFICATION_SETTINGS.isEnabled,
  dailyUserLimit: row.daily_user_limit ?? DEFAULT_RENEWAL_NOTIFICATION_SETTINGS.dailyUserLimit,
  notifySevenDaysBefore:
    row.notify_seven_days_before ?? DEFAULT_RENEWAL_NOTIFICATION_SETTINGS.notifySevenDaysBefore,
  notifyThreeDaysBefore:
    row.notify_three_days_before ?? DEFAULT_RENEWAL_NOTIFICATION_SETTINGS.notifyThreeDaysBefore,
  notifyOneDayBefore:
    row.notify_one_day_before ?? DEFAULT_RENEWAL_NOTIFICATION_SETTINGS.notifyOneDayBefore,
  notifyOnExpirationDay:
    row.notify_on_expiration_day ?? DEFAULT_RENEWAL_NOTIFICATION_SETTINGS.notifyOnExpirationDay,
  notifyAfterExpiration:
    row.notify_after_expiration ?? DEFAULT_RENEWAL_NOTIFICATION_SETTINGS.notifyAfterExpiration,
  daysAfterExpiration:
    row.days_after_expiration ?? DEFAULT_RENEWAL_NOTIFICATION_SETTINGS.daysAfterExpiration,
  showDashboardToast:
    row.show_dashboard_toast ?? DEFAULT_RENEWAL_NOTIFICATION_SETTINGS.showDashboardToast,
  templates: mergeRenewalTemplates(row.templates),
  updatedBy: row.updated_by ?? null,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export const useRenewalNotificationSettings = () => {
  const [settings, setSettings] = useState<RenewalNotificationSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSettings = async () => {
    setIsLoading(true);
    setError(null);

    const { data, error } = await supabase
      .from('renewal_notification_settings')
      .select('*')
      .limit(1)
      .maybeSingle();

    if (error) {
      setError(error.message);
      setSettings(null);
    } else {
      setSettings(data ? mapRenewalNotificationSettings(data) : null);
    }

    setIsLoading(false);
  };

  const saveSettings = async (payload: Partial<RenewalNotificationSettings>) => {
    const currentId = settings?.id;
    const dbPayload = {
      is_enabled: payload.isEnabled ?? settings?.isEnabled ?? DEFAULT_RENEWAL_NOTIFICATION_SETTINGS.isEnabled,
      daily_user_limit:
        payload.dailyUserLimit ??
        settings?.dailyUserLimit ??
        DEFAULT_RENEWAL_NOTIFICATION_SETTINGS.dailyUserLimit,
      notify_seven_days_before:
        payload.notifySevenDaysBefore ??
        settings?.notifySevenDaysBefore ??
        DEFAULT_RENEWAL_NOTIFICATION_SETTINGS.notifySevenDaysBefore,
      notify_three_days_before:
        payload.notifyThreeDaysBefore ??
        settings?.notifyThreeDaysBefore ??
        DEFAULT_RENEWAL_NOTIFICATION_SETTINGS.notifyThreeDaysBefore,
      notify_one_day_before:
        payload.notifyOneDayBefore ??
        settings?.notifyOneDayBefore ??
        DEFAULT_RENEWAL_NOTIFICATION_SETTINGS.notifyOneDayBefore,
      notify_on_expiration_day:
        payload.notifyOnExpirationDay ??
        settings?.notifyOnExpirationDay ??
        DEFAULT_RENEWAL_NOTIFICATION_SETTINGS.notifyOnExpirationDay,
      notify_after_expiration:
        payload.notifyAfterExpiration ??
        settings?.notifyAfterExpiration ??
        DEFAULT_RENEWAL_NOTIFICATION_SETTINGS.notifyAfterExpiration,
      days_after_expiration:
        payload.daysAfterExpiration ??
        settings?.daysAfterExpiration ??
        DEFAULT_RENEWAL_NOTIFICATION_SETTINGS.daysAfterExpiration,
      show_dashboard_toast:
        payload.showDashboardToast ??
        settings?.showDashboardToast ??
        DEFAULT_RENEWAL_NOTIFICATION_SETTINGS.showDashboardToast,
      templates: payload.templates ?? settings?.templates ?? DEFAULT_RENEWAL_NOTIFICATION_SETTINGS.templates,
      updated_at: new Date().toISOString(),
    };

    const query = currentId
      ? supabase.from('renewal_notification_settings').update(dbPayload).eq('id', currentId)
      : supabase.from('renewal_notification_settings').insert(dbPayload);

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
    defaultSettings: DEFAULT_RENEWAL_NOTIFICATION_SETTINGS,
  };
};
