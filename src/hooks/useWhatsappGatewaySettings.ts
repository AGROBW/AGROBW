import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import type {
  WhatsappGatewayAuthType,
  WhatsappGatewaySettings,
} from '../lib/whatsappGateway';
import { appError } from '../utils/appLogger';

export interface UpdateWhatsappGatewaySettingsData {
  base_url?: string | null;
  send_path?: string | null;
  health_path?: string | null;
  auth_type?: WhatsappGatewayAuthType | null;
  auth_secret?: string | null;
  default_recipient_phone?: string | null;
  is_enabled?: boolean;
}

export const useWhatsappGatewaySettings = () => {
  const [settings, setSettings] = useState<WhatsappGatewaySettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSettings = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const { data, error: fetchError } = await supabase.rpc('get_whatsapp_gateway_settings_admin_safe');
      if (fetchError) {
        appError('[WhatsappGateway] Erro ao buscar configuracoes', fetchError);
        setError(fetchError.message);
        return;
      }

      setSettings((Array.isArray(data) ? data[0] : data) || null);
    } catch (unexpectedError) {
      appError('[WhatsappGateway] Erro inesperado ao buscar configuracoes', unexpectedError);
      setError('Nao foi possivel carregar a Central WhatsApp.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const updateSettings = async (updates: UpdateWhatsappGatewaySettingsData) => {
    try {
      const { data, error: updateError } = await supabase.rpc('update_whatsapp_gateway_settings_admin_safe', {
        p_base_url: typeof updates.base_url === 'string' ? updates.base_url.trim() : null,
        p_send_path: typeof updates.send_path === 'string' ? updates.send_path.trim() : null,
        p_health_path: typeof updates.health_path === 'string' ? updates.health_path.trim() : null,
        p_auth_type: updates.auth_type || null,
        p_auth_secret:
          typeof updates.auth_secret === 'string' && updates.auth_secret.trim()
            ? updates.auth_secret.trim()
            : null,
        p_default_recipient_phone:
          typeof updates.default_recipient_phone === 'string'
            ? updates.default_recipient_phone.trim()
            : null,
        p_is_enabled: typeof updates.is_enabled === 'boolean' ? updates.is_enabled : null,
      });

      if (updateError) {
        appError('[WhatsappGateway] Erro ao atualizar configuracoes', updateError);
        return { error: updateError.message };
      }

      setSettings((Array.isArray(data) ? data[0] : data) || null);
      return { error: null };
    } catch (unexpectedError) {
      appError('[WhatsappGateway] Erro inesperado ao atualizar configuracoes', unexpectedError);
      return { error: 'Nao foi possivel salvar a configuracao da Central WhatsApp.' };
    }
  };

  useEffect(() => {
    void fetchSettings();
  }, [fetchSettings]);

  return { settings, isLoading, error, fetchSettings, updateSettings };
};
