import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { appError } from '../utils/appLogger';

export interface PaymentSettings {
  id: string;
  stripe_secret_key_configured: boolean;
  stripe_publishable_key: string | null;
  stripe_webhook_secret_configured: boolean;
  preferred_checkout_provider: 'stripe';
  stripe_rollout_mode: 'all_customers' | 'new_customers';
  is_production: boolean;
  last_updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface UpdatePaymentSettingsData {
  stripe_secret_key?: string | null;
  stripe_publishable_key?: string | null;
  stripe_webhook_secret?: string | null;
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
          appError('Erro ao buscar configuracoes', fetchError);
        setError(fetchError.message);
        return;
      }

      setSettings((Array.isArray(data) ? data[0] : data) || null);
    } catch (err) {
        appError('Erro inesperado ao buscar configuracoes', err);
      setError('Erro ao carregar configuracoes');
    } finally {
      setIsLoading(false);
    }
  };

  const updateSettings = async (updates: UpdatePaymentSettingsData): Promise<{ error: string | null }> => {
    try {
      const { data, error: updateError } = await supabase.rpc('update_payment_settings_admin_safe', {
        p_stripe_secret_key:
          typeof updates.stripe_secret_key === 'string' && updates.stripe_secret_key.trim() !== ''
            ? updates.stripe_secret_key.trim()
            : null,
        p_stripe_publishable_key:
          typeof updates.stripe_publishable_key === 'string'
            ? updates.stripe_publishable_key
            : null,
        p_stripe_webhook_secret:
          typeof updates.stripe_webhook_secret === 'string' && updates.stripe_webhook_secret.trim() !== ''
            ? updates.stripe_webhook_secret.trim()
            : null,
        p_is_production:
          typeof updates.is_production === 'boolean'
            ? updates.is_production
            : null,
      });

      if (updateError) {
          appError('Erro ao atualizar configuracoes', updateError);
        return { error: updateError.message };
      }

      setSettings((Array.isArray(data) ? data[0] : data) || null);
      return { error: null };
    } catch (err) {
        appError('Erro inesperado ao atualizar configuracoes', err);
      return { error: 'Erro ao salvar configuracoes' };
    }
  };

  useEffect(() => {
    fetchSettings();
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
  stripe_secret_key_configured: false,
  stripe_publishable_key: null,
  stripe_webhook_secret_configured: false,
  preferred_checkout_provider: 'stripe',
  stripe_rollout_mode: 'all_customers',
  is_production: false,
  last_updated_by: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};
