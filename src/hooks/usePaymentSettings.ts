import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

export interface PaymentSettings {
  id: string;
  mp_access_token: string | null;
  mp_public_key: string | null;
  mp_webhook_secret: string | null;
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
    updates: UpdatePaymentSettingsData,
    userId: string
  ) => Promise<{ error: string | null }>;
  testConnection: () => Promise<{ success: boolean; data?: any; error?: string }>;
}

const SINGLETON_ID = '00000000-0000-0000-0000-000000000005';

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
    console.error('Erro ao ler corpo da resposta da Edge Function:', parseError);
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

      const { data, error: fetchError } = await supabase
        .from('payment_settings')
        .select('*')
        .eq('id', SINGLETON_ID)
        .single();

      if (fetchError) {
        console.error('Erro ao buscar configuracoes:', fetchError);
        setError(fetchError.message);
        return;
      }

      setSettings(data);
    } catch (err) {
      console.error('Erro inesperado ao buscar configuracoes:', err);
      setError('Erro ao carregar configuracoes');
    } finally {
      setIsLoading(false);
    }
  };

  const updateSettings = async (
    updates: UpdatePaymentSettingsData,
    userId: string
  ): Promise<{ error: string | null }> => {
    try {
      const { data, error: updateError } = await supabase
        .from('payment_settings')
        .update({
          ...updates,
          last_updated_by: userId,
        })
        .eq('id', SINGLETON_ID)
        .select()
        .single();

      if (updateError) {
        console.error('Erro ao atualizar configuracoes:', updateError);
        return { error: updateError.message };
      }

      setSettings(data);
      return { error: null };
    } catch (err) {
      console.error('Erro inesperado ao atualizar configuracoes:', err);
      return { error: 'Erro ao salvar configuracoes' };
    }
  };

  const testConnection = async (): Promise<{ success: boolean; data?: any; error?: string }> => {
    try {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      console.log('[testConnection] Verificando sessao...');
      console.log('Session:', session ? 'Presente' : 'AUSENTE');
      console.log('Session error:', sessionError);

      if (sessionError) {
        console.error('Erro ao obter sessao:', sessionError);
        return {
          success: false,
          error: `Erro de sessao: ${sessionError.message}`,
        };
      }

      if (!session?.access_token) {
        console.error('Sessao nao encontrada');
        return {
          success: false,
          error: 'Usuario nao autenticado. Faca login novamente.',
        };
      }

      console.log('Sessao valida - User ID:', session.user.id);
      console.log('Token (primeiros 50 chars):', `${session.access_token.substring(0, 50)}...`);
      console.log('[testConnection] Supabase client usa VITE_SUPABASE_ANON_KEY');

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

      console.log('[testConnection] Resposta da Edge Function:', {
        status: response?.status,
        ok: response?.ok,
        data,
        error: invokeError,
      });

      if (invokeError) {
        const errorDetails = await readFunctionErrorResponse(response);

        console.error('Erro ao chamar Edge Function:', invokeError);
        console.error('Corpo da resposta da Edge Function:', errorDetails);

        return {
          success: false,
          error:
            errorDetails ||
            invokeError.message ||
            `Erro ao testar conexao${response?.status ? ` (HTTP ${response.status})` : ''}`,
        };
      }

      if (!data) {
        console.error('Resposta vazia da Edge Function');
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
      console.error('Erro inesperado ao testar conexao:', err);
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
  id: SINGLETON_ID,
  mp_access_token: null,
  mp_public_key: null,
  mp_webhook_secret: null,
  is_production: false,
  last_updated_by: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};
