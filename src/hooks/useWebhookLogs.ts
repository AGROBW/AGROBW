import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { appError } from '../utils/appLogger';

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
  deleteLogs: (olderThanDays?: number) => Promise<{ error: string | null; count: number }>;
}

export const useWebhookLogs = (): UseWebhookLogsReturn => {
  const [logs, setLogs] = useState<WebhookLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
        appError('Erro ao buscar logs', fetchError, { limit });
        setError(fetchError.message);
        return;
      }

      setLogs(data || []);
    } catch (err) {
      appError('Erro inesperado ao buscar logs', err, { limit });
      setError('Erro ao carregar logs');
    } finally {
      setIsLoading(false);
    }
  };

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
        appError('Erro ao deletar logs', deleteError, { olderThanDays });
        return { error: deleteError.message, count: 0 };
      }

      await fetchLogs();

      return { error: null, count: data?.length || 0 };
    } catch (err) {
      appError('Erro inesperado ao deletar logs', err, { olderThanDays });
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
    deleteLogs,
  };
};
