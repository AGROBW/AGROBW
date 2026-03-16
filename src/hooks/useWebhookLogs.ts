import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';

export interface WebhookLog {
  id: string;
  provider: string;
  event_type: string | null;
  payload: any;
  status_code: number | null;
  processed: boolean;
  error_message: string | null;
  received_at: string;
  processed_at: string | null;
  created_at: string;
}

interface UseWebhookLogsReturn {
  logs: WebhookLog[];
  isLoading: boolean;
  error: string | null;
  fetchLogs: (limit?: number) => Promise<void>;
  simulateWebhook: () => Promise<{ error: string | null; data: WebhookLog | null }>;
  deleteLogs: (olderThanDays?: number) => Promise<{ error: string | null; count: number }>;
}

export const useWebhookLogs = (): UseWebhookLogsReturn => {
  const [logs, setLogs] = useState<WebhookLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /**
   * Busca os logs de webhooks do banco de dados
   * @param limit - Número máximo de logs a retornar (padrão: 50)
   */
  const fetchLogs = async (limit = 50) => {
    try {
      setIsLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        .from('webhook_logs')
        .select('*')
        .order('received_at', { ascending: false })
        .limit(limit);

      if (fetchError) {
        console.error('Erro ao buscar logs:', fetchError);
        setError(fetchError.message);
        return;
      }

      setLogs(data || []);
    } catch (err) {
      console.error('Erro inesperado ao buscar logs:', err);
      setError('Erro ao carregar logs');
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Simula o recebimento de um webhook do Mercado Pago
   * Útil para testar se o endpoint está funcionando sem fazer um pagamento real
   */
  const simulateWebhook = async (): Promise<{ error: string | null; data: WebhookLog | null }> => {
    try {
      // Criar payload de teste similar ao que o MP envia
      const testPayload = {
        action: 'payment.created',
        api_version: 'v1',
        data: {
          id: '1234567890',
        },
        date_created: new Date().toISOString(),
        id: Math.floor(Math.random() * 1000000000),
        live_mode: false,
        type: 'payment',
        user_id: '123456789',
      };

      const { data, error: insertError } = await supabase
        .from('webhook_logs')
        .insert({
          provider: 'mercadopago',
          event_type: 'payment.created',
          payload: testPayload,
          status_code: 200,
          processed: false,
        })
        .select()
        .single();

      if (insertError) {
        console.error('Erro ao simular webhook:', insertError);
        return { error: insertError.message, data: null };
      }

      // Atualizar lista de logs
      await fetchLogs();

      return { error: null, data };
    } catch (err) {
      console.error('Erro inesperado ao simular webhook:', err);
      return { error: 'Erro ao simular webhook', data: null };
    }
  };

  /**
   * Deleta logs antigos do banco de dados
   * @param olderThanDays - Deleta logs mais antigos que X dias (padrão: 30 dias)
   */
  const deleteLogs = async (olderThanDays = 30): Promise<{ error: string | null; count: number }> => {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

      const { data, error: deleteError } = await supabase
        .from('webhook_logs')
        .delete()
        .lt('received_at', cutoffDate.toISOString())
        .select();

      if (deleteError) {
        console.error('Erro ao deletar logs:', deleteError);
        return { error: deleteError.message, count: 0 };
      }

      // Atualizar lista de logs
      await fetchLogs();

      return { error: null, count: data?.length || 0 };
    } catch (err) {
      console.error('Erro inesperado ao deletar logs:', err);
      return { error: 'Erro ao deletar logs', count: 0 };
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  return {
    logs,
    isLoading,
    error,
    fetchLogs,
    simulateWebhook,
    deleteLogs,
  };
};
