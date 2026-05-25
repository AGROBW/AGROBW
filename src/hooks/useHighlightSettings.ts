import { useEffect, useState } from 'react';
import { HighlightSettings } from '../../types';
import { supabase } from '../lib/supabaseClient';
import { DEFAULT_HIGHLIGHT_COOLDOWN_DAYS, getEffectiveHighlightCooldownDays } from '../utils/highlightCooldown';

const DEFAULT_HIGHLIGHT_SETTINGS: Omit<HighlightSettings, 'id' | 'createdAt' | 'updatedAt'> = {
  highlightCooldownDays: DEFAULT_HIGHLIGHT_COOLDOWN_DAYS,
  updatedBy: null,
};

const mapHighlightSettings = (row: any): HighlightSettings => ({
  id: row.id,
  highlightCooldownDays: getEffectiveHighlightCooldownDays(row.highlight_cooldown_days),
  updatedBy: row.updated_by ?? null,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export const useHighlightSettings = () => {
  const [settings, setSettings] = useState<HighlightSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSettings = async () => {
    setIsLoading(true);
    setError(null);

    const { data, error } = await supabase
      .from('highlight_settings')
      .select('*')
      .limit(1)
      .maybeSingle();

    if (error) {
      setError(error.message);
      setSettings(null);
    } else {
      setSettings(data ? mapHighlightSettings(data) : null);
    }

    setIsLoading(false);
  };

  const saveSettings = async (payload: Partial<HighlightSettings>) => {
    const currentId = settings?.id;
    const dbPayload = {
      highlight_cooldown_days:
        getEffectiveHighlightCooldownDays(
          payload.highlightCooldownDays ?? settings?.highlightCooldownDays ?? DEFAULT_HIGHLIGHT_SETTINGS.highlightCooldownDays
        ),
      updated_at: new Date().toISOString(),
    };

    const query = currentId
      ? supabase.from('highlight_settings').update(dbPayload).eq('id', currentId)
      : supabase.from('highlight_settings').insert(dbPayload);

    const { error } = await query;

    if (error) {
      return { error: error.message };
    }

    await fetchSettings();
    return { error: null };
  };

  useEffect(() => {
    void fetchSettings();
  }, []);

  return {
    settings,
    isLoading,
    error,
    fetchSettings,
    saveSettings,
    defaultSettings: DEFAULT_HIGHLIGHT_SETTINGS,
  };
};
