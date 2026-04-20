import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

export type SupportSettings = {
  id: string;
  cardTitle: string;
  averageResponseLabel: string;
  averageResponseValue: string;
  scheduleLabel: string;
  scheduleDays: string;
  scheduleTimeLabel: string;
  scheduleTime: string;
  isOnline: boolean;
  onlineStatusText: string;
  offlineStatusText: string;
};

const DEFAULT_SUPPORT_SETTINGS: SupportSettings = {
  id: 'default',
  cardTitle: 'Atendimento',
  averageResponseLabel: 'Resposta média',
  averageResponseValue: '< 24h',
  scheduleLabel: 'Horário',
  scheduleDays: 'Seg-Sex',
  scheduleTimeLabel: 'Das',
  scheduleTime: '08h às 18h',
  isOnline: true,
  onlineStatusText: 'Suporte online agora',
  offlineStatusText: 'Suporte offline no momento',
};

const mapRowToSettings = (row: any): SupportSettings => ({
  id: row?.id || DEFAULT_SUPPORT_SETTINGS.id,
  cardTitle: row?.card_title || DEFAULT_SUPPORT_SETTINGS.cardTitle,
  averageResponseLabel: row?.average_response_label || DEFAULT_SUPPORT_SETTINGS.averageResponseLabel,
  averageResponseValue: row?.average_response_value || DEFAULT_SUPPORT_SETTINGS.averageResponseValue,
  scheduleLabel: row?.schedule_label || DEFAULT_SUPPORT_SETTINGS.scheduleLabel,
  scheduleDays: row?.schedule_days || DEFAULT_SUPPORT_SETTINGS.scheduleDays,
  scheduleTimeLabel: row?.schedule_time_label || DEFAULT_SUPPORT_SETTINGS.scheduleTimeLabel,
  scheduleTime: row?.schedule_time || DEFAULT_SUPPORT_SETTINGS.scheduleTime,
  isOnline: row?.is_online ?? DEFAULT_SUPPORT_SETTINGS.isOnline,
  onlineStatusText: row?.online_status_text || DEFAULT_SUPPORT_SETTINGS.onlineStatusText,
  offlineStatusText: row?.offline_status_text || DEFAULT_SUPPORT_SETTINGS.offlineStatusText,
});

const mapSettingsToPayload = (settings: SupportSettings) => ({
  id: settings.id || DEFAULT_SUPPORT_SETTINGS.id,
  card_title: settings.cardTitle.trim() || DEFAULT_SUPPORT_SETTINGS.cardTitle,
  average_response_label: settings.averageResponseLabel.trim() || DEFAULT_SUPPORT_SETTINGS.averageResponseLabel,
  average_response_value: settings.averageResponseValue.trim() || DEFAULT_SUPPORT_SETTINGS.averageResponseValue,
  schedule_label: settings.scheduleLabel.trim() || DEFAULT_SUPPORT_SETTINGS.scheduleLabel,
  schedule_days: settings.scheduleDays.trim() || DEFAULT_SUPPORT_SETTINGS.scheduleDays,
  schedule_time_label: settings.scheduleTimeLabel.trim() || DEFAULT_SUPPORT_SETTINGS.scheduleTimeLabel,
  schedule_time: settings.scheduleTime.trim() || DEFAULT_SUPPORT_SETTINGS.scheduleTime,
  is_online: settings.isOnline,
  online_status_text: settings.onlineStatusText.trim() || DEFAULT_SUPPORT_SETTINGS.onlineStatusText,
  offline_status_text: settings.offlineStatusText.trim() || DEFAULT_SUPPORT_SETTINGS.offlineStatusText,
  updated_at: new Date().toISOString(),
});

export const useSupportSettings = () => {
  const [settings, setSettings] = useState<SupportSettings>(DEFAULT_SUPPORT_SETTINGS);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadSettings = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    const { data, error: loadError } = await supabase
      .from('support_settings')
      .select('*')
      .eq('id', DEFAULT_SUPPORT_SETTINGS.id)
      .maybeSingle();

    if (loadError) {
      console.warn('[useSupportSettings] Não foi possível carregar as configurações de suporte:', loadError);
      setSettings(DEFAULT_SUPPORT_SETTINGS);
      setError(loadError.message);
      setIsLoading(false);
      return;
    }

    setSettings(mapRowToSettings(data));
    setIsLoading(false);
  }, []);

  const saveSettings = useCallback(async (nextSettings: SupportSettings) => {
    setIsSaving(true);
    setError(null);

    const { data, error: saveError } = await supabase
      .from('support_settings')
      .upsert(mapSettingsToPayload(nextSettings), { onConflict: 'id' })
      .select('*')
      .single();

    setIsSaving(false);

    if (saveError) {
      setError(saveError.message);
      return { success: false, message: saveError.message };
    }

    const mappedSettings = mapRowToSettings(data);
    setSettings(mappedSettings);
    return { success: true, settings: mappedSettings };
  }, []);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  return {
    settings,
    setSettings,
    isLoading,
    isSaving,
    error,
    reload: loadSettings,
    saveSettings,
  };
};
