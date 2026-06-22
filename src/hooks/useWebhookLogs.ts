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

export const WEBHOOK_LOGS_PAGE_SIZE = 10;

interface UseWebhookLogsReturn {
  logs: WebhookLog[];
  isLoading: boolean;
  error: string | null;
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  fetchLogs: (targetPage?: number) => Promise<void>;
  goToPage: (targetPage: number) => Promise<void>;
  deleteLogs: (olderThanDays?: number) => Promise<{ error: string | null; count: number }>;
}

export const useWebhookLogs = (): UseWebhookLogsReturn => {
  const [logs, setLogs] = useState<WebhookLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1); // 1-based
  const [total, setTotal] = useState(0);

  const pageSize = WEBHOOK_LOGS_PAGE_SIZE;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const fetchLogs = async (targetPage: number = page) => {
    try {
      setIsLoading(true);
      setError(null);

      const safePage = Math.max(1, Math.floor(targetPage) || 1);
      const from = (safePage - 1) * pageSize;
      const to = from + pageSize - 1;

      const { data, error: fetchError, count } = await supabase
        .from('webhook_logs')
        .select('*', { count: 'exact' })
        .order('received_at', { ascending: false })
        .range(from, to);

      if (fetchError) {
        // Range fora do conjunto (ex.: página atual esvaziou após "Limpar antigos"):
        // recalcula a última página válida e refaz a busca.
        if (fetchError.code === 'PGRST103' && safePage > 1) {
          const { count: freshTotal } = await supabase
            .from('webhook_logs')
            .select('id', { count: 'exact', head: true });
          const lastPage = Math.max(1, Math.ceil((freshTotal || 0) / pageSize));
          setIsLoading(false);
          await fetchLogs(lastPage);
          return;
        }
        appError('Erro ao buscar logs', fetchError, { targetPage });
        setError(fetchError.message);
        return;
      }

      setLogs(data || []);
      setTotal(count || 0);
      setPage(safePage);
    } catch (err) {
      appError('Erro inesperado ao buscar logs', err, { targetPage });
      setError('Erro ao carregar logs');
    } finally {
      setIsLoading(false);
    }
  };

  const goToPage = async (targetPage: number) => {
    await fetchLogs(targetPage);
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

      // Mantém a página atual; se ela ficou fora do range, o fetch ajusta p/ a última válida.
      await fetchLogs(page);

      return { error: null, count: data?.length || 0 };
    } catch (err) {
      appError('Erro inesperado ao deletar logs', err, { olderThanDays });
      return { error: 'Erro ao deletar logs', count: 0 };
    }
  };

  useEffect(() => {
    fetchLogs(1);
  }, []);

  return {
    logs,
    isLoading,
    error,
    page,
    pageSize,
    total,
    totalPages,
    fetchLogs,
    goToPage,
    deleteLogs,
  };
};
