import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { appError } from '../utils/appLogger';

export interface PaymentSettings {
  id: string;
  asaas_api_key_configured: boolean;
  asaas_webhook_token_configured: boolean;
  preferred_checkout_provider: 'asaas';
  is_production: boolean;
  last_updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface UpdatePaymentSettingsData {
  asaas_api_key?: string | null;
  asaas_webhook_token?: string | null;
  is_production?: boolean;
}

interface UsePaymentSettingsReturn {
  settings: PaymentSettings | null;
  isLoading: boolean;
  error: string | null;
  fetchSettings: () => Promise<void>;
  updateSettings: (
    updates: UpdatePaymentSettingsData
  ) => Promise<{ error: string | null }>;
}

export const usePaymentSettings = (): UsePaymentSettingsReturn => {
  const [settings, setSettings] = useState<PaymentSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSettings = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase.rpc('get_payment_settings_admin_safe');

      if (fetchError) {
        appError('Erro ao buscar configuracoes de pagamento', fetchError);
        setError(fetchError.message);
        return;
      }

      setSettings((Array.isArray(data) ? data[0] : data) || null);
    } catch (err) {
      appError('Erro inesperado ao buscar configuracoes de pagamento', err);
      setError('Erro ao carregar configuracoes de pagamento');
    } finally {
      setIsLoading(false);
    }
  };

  const updateSettings = async (
    updates: UpdatePaymentSettingsData
  ): Promise<{ error: string | null }> => {
    try {
      const { data, error: updateError } = await supabase.rpc('update_payment_settings_admin_safe', {
        p_asaas_api_key:
          typeof updates.asaas_api_key === 'string' && updates.asaas_api_key.trim() !== ''
            ? updates.asaas_api_key.trim()
            : null,
        p_asaas_webhook_token:
          typeof updates.asaas_webhook_token === 'string' && updates.asaas_webhook_token.trim() !== ''
            ? updates.asaas_webhook_token.trim()
            : null,
        p_is_production:
          typeof updates.is_production === 'boolean'
            ? updates.is_production
            : null,
      });

      if (updateError) {
        appError('Erro ao atualizar configuracoes de pagamento', updateError);
        return { error: updateError.message };
      }

      setSettings((Array.isArray(data) ? data[0] : data) || null);
      return { error: null };
    } catch (err) {
      appError('Erro inesperado ao atualizar configuracoes de pagamento', err);
      return { error: 'Erro ao salvar configuracoes de pagamento' };
    }
  };

  useEffect(() => {
    void fetchSettings();
  }, []);

  return {
    settings,
    isLoading,
    error,
    fetchSettings,
    updateSettings,
  };
};

export const PAYMENT_SETTINGS_FALLBACK: PaymentSettings = {
  id: '00000000-0000-0000-0000-000000000005',
  asaas_api_key_configured: false,
  asaas_webhook_token_configured: false,
  preferred_checkout_provider: 'asaas',
  is_production: false,
  last_updated_by: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};
