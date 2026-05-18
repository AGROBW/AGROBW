import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { appError } from '../utils/appLogger';

export interface PaymentSettings {
  id: string;
  mp_access_token_configured: boolean;
  mp_public_key: string | null;
  mp_webhook_secret_configured: boolean;
  is_production: boolean;
  last_updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface UpdatePaymentSettingsData {
  mp_access_token?: string | null;
  mp_public_key?: string | null;
  mp_webhook_secret?: string | null;
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
  testConnection: () => Promise<{ success: boolean; data?: any; error?: string }>;
}

const readFunctionErrorResponse = async (response?: Response): Promise<string | null> => {
  if (!response) {
    return null;
  }

  try {
    const contentType = response.headers.get('content-type') || '';

    if (contentType.includes('application/json')) {
      const payload = await response.clone().json();
      return payload?.details || payload?.error || payload?.message || JSON.stringify(payload);
    }

    const text = await response.clone().text();
    return text || null;
  } catch (parseError) {
      appError('Erro ao ler corpo da resposta da Edge Function', parseError);
    return null;
  }
};

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
        p_mp_access_token:
          typeof updates.mp_access_token === 'string' && updates.mp_access_token.trim() !== ''
            ? updates.mp_access_token.trim()
            : null,
        p_mp_public_key:
          typeof updates.mp_public_key === 'string'
            ? updates.mp_public_key
            : null,
        p_mp_webhook_secret:
          typeof updates.mp_webhook_secret === 'string' && updates.mp_webhook_secret.trim() !== ''
            ? updates.mp_webhook_secret.trim()
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

  const testConnection = async (): Promise<{ success: boolean; data?: any; error?: string }> => {
    try {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError) {
          appError('Erro ao obter sessao', sessionError);
        return {
          success: false,
          error: `Erro de sessao: ${sessionError.message}`,
        };
      }

      if (!session?.access_token) {
          appError('Sessao nao encontrada');
        return {
          success: false,
          error: 'Usuario nao autenticado. Faca login novamente.',
        };
      }

      const { data, error: invokeError, response } = await supabase.functions.invoke(
        'test-mp-connection',
        {
          method: 'POST',
          body: {},
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
        }
      );

      if (invokeError) {
        const errorDetails = await readFunctionErrorResponse(response);

        appError('Erro ao chamar Edge Function', invokeError, { errorDetails });

        return {
          success: false,
          error:
            errorDetails ||
            invokeError.message ||
            `Erro ao testar conexao${response?.status ? ` (HTTP ${response.status})` : ''}`,
        };
      }

      if (!data) {
          appError('Resposta vazia da Edge Function');
        return {
          success: false,
          error: 'Resposta invalida do servidor',
        };
      }

      if (!data.success) {
        const detailedError = [data.error, data.message, data.details]
          .filter((value): value is string => Boolean(value && String(value).trim()))
          .join(' | ');

        return {
          success: false,
          data: data.data,
          error: detailedError || 'Erro ao testar conexao com Mercado Pago',
        };
      }

      return {
        success: data.success,
        data: data.data,
        error: data.error,
      };
    } catch (err) {
        appError('Erro inesperado ao testar conexao', err);
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Erro ao testar conexao com Mercado Pago',
      };
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
    testConnection,
  };
};

export const PAYMENT_SETTINGS_FALLBACK: PaymentSettings = {
  id: '00000000-0000-0000-0000-000000000005',
  mp_access_token_configured: false,
  mp_public_key: null,
  mp_webhook_secret_configured: false,
  is_production: false,
  last_updated_by: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};
