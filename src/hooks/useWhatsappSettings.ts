import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { appError } from '../utils/appLogger';

export interface WhatsappSettings {
  id: string;
  access_token_configured: boolean;
  phone_number_id: string | null;
  template_name: string | null;
  template_lang: string;
  is_enabled: boolean;
  last_updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface UpdateWhatsappSettingsData {
  access_token?: string | null;
  phone_number_id?: string | null;
  template_name?: string | null;
  template_lang?: string | null;
  is_enabled?: boolean;
}

interface UseWhatsappSettingsReturn {
  settings: WhatsappSettings | null;
  isLoading: boolean;
  error: string | null;
  fetchSettings: () => Promise<void>;
  updateSettings: (updates: UpdateWhatsappSettingsData) => Promise<{ error: string | null }>;
}

export const useWhatsappSettings = (): UseWhatsappSettingsReturn => {
  const [settings, setSettings] = useState<WhatsappSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSettings = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase.rpc('get_whatsapp_settings_admin_safe');

      if (fetchError) {
        appError('Erro ao buscar configuracoes do WhatsApp', fetchError);
        setError(fetchError.message);
        return;
      }

      setSettings((Array.isArray(data) ? data[0] : data) || null);
    } catch (err) {
      appError('Erro inesperado ao buscar configuracoes do WhatsApp', err);
      setError('Erro ao carregar configuracoes do WhatsApp');
    } finally {
      setIsLoading(false);
    }
  };

  const updateSettings = async (
    updates: UpdateWhatsappSettingsData
  ): Promise<{ error: string | null }> => {
    try {
      const { data, error: updateError } = await supabase.rpc('update_whatsapp_settings_admin_safe', {
        p_access_token:
          typeof updates.access_token === 'string' && updates.access_token.trim() !== ''
            ? updates.access_token.trim()
            : null,
        p_phone_number_id:
          typeof updates.phone_number_id === 'string' ? updates.phone_number_id.trim() : null,
        p_template_name:
          typeof updates.template_name === 'string' ? updates.template_name.trim() : null,
        p_template_lang:
          typeof updates.template_lang === 'string' && updates.template_lang.trim() !== ''
            ? updates.template_lang.trim()
            : null,
        p_is_enabled: typeof updates.is_enabled === 'boolean' ? updates.is_enabled : null,
      });

      if (updateError) {
        appError('Erro ao atualizar configuracoes do WhatsApp', updateError);
        return { error: updateError.message };
      }

      setSettings((Array.isArray(data) ? data[0] : data) || null);
      return { error: null };
    } catch (err) {
      appError('Erro inesperado ao atualizar configuracoes do WhatsApp', err);
      return { error: 'Erro ao salvar configuracoes do WhatsApp' };
    }
  };

  useEffect(() => {
    void fetchSettings();
  }, []);

  return { settings, isLoading, error, fetchSettings, updateSettings };
};
