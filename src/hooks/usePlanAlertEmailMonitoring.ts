import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { PlanAlertEmailDispatchLog, PlanAlertEmailJob } from '../../types';

interface PlanAlertEmailSummary {
  pending: number;
  failed: number;
  skipped: number;
  sentToday: number;
}

const mapJob = (row: any): PlanAlertEmailJob => ({
  id: row.id,
  notificationId: row.notification_id,
  userId: row.user_id,
  recipientEmail: row.recipient_email ?? null,
  recipientName: row.recipient_name ?? null,
  alertKind: row.alert_kind,
  notificationTitle: row.notification_title,
  notificationContent: row.notification_content,
  link: row.link ?? null,
  status: row.status,
  provider: row.provider,
  attempts: row.attempts ?? 0,
  lastError: row.last_error ?? null,
  queuedAt: row.queued_at,
  processingStartedAt: row.processing_started_at ?? null,
  lastAttemptAt: row.last_attempt_at ?? null,
  sentAt: row.sent_at ?? null,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const mapLog = (row: any): PlanAlertEmailDispatchLog => ({
  id: row.id,
  triggeredBy: row.triggered_by,
  status: row.status,
  requestedLimit: row.requested_limit ?? 25,
  processedCount: row.processed_count ?? 0,
  sentCount: row.sent_count ?? 0,
  failedCount: row.failed_count ?? 0,
  skippedCount: row.skipped_count ?? 0,
  notes: row.notes ?? null,
  startedAt: row.started_at,
  finishedAt: row.finished_at ?? null,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export const usePlanAlertEmailMonitoring = () => {
  const [summary, setSummary] = useState<PlanAlertEmailSummary>({
    pending: 0,
    failed: 0,
    skipped: 0,
    sentToday: 0,
  });
  const [jobs, setJobs] = useState<PlanAlertEmailJob[]>([]);
  const [dispatchLogs, setDispatchLogs] = useState<PlanAlertEmailDispatchLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMonitoring = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const [pendingResult, failedResult, skippedResult, sentTodayResult, jobsResult, logsResult] =
      await Promise.all([
        supabase.from('plan_alert_email_jobs').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('plan_alert_email_jobs').select('id', { count: 'exact', head: true }).eq('status', 'failed'),
        supabase.from('plan_alert_email_jobs').select('id', { count: 'exact', head: true }).eq('status', 'skipped'),
        supabase
          .from('plan_alert_email_jobs')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'sent')
          .gte('sent_at', startOfDay.toISOString()),
        supabase.from('plan_alert_email_jobs').select('*').order('queued_at', { ascending: false }).limit(50),
        supabase
          .from('plan_alert_email_dispatch_logs')
          .select('*')
          .order('started_at', { ascending: false })
          .limit(20),
      ]);

    const firstError =
      pendingResult.error ||
      failedResult.error ||
      skippedResult.error ||
      sentTodayResult.error ||
      jobsResult.error ||
      logsResult.error;

    if (firstError) {
      console.error('[usePlanAlertEmailMonitoring] erro ao carregar monitoramento:', firstError);
      setError(firstError.message);
      setJobs([]);
      setDispatchLogs([]);
      setSummary({ pending: 0, failed: 0, skipped: 0, sentToday: 0 });
      setIsLoading(false);
      return;
    }

    setSummary({
      pending: pendingResult.count ?? 0,
      failed: failedResult.count ?? 0,
      skipped: skippedResult.count ?? 0,
      sentToday: sentTodayResult.count ?? 0,
    });
    setJobs((jobsResult.data || []).map(mapJob));
    setDispatchLogs((logsResult.data || []).map(mapLog));
    setIsLoading(false);
  }, []);

  const processQueueNow = useCallback(
    async (limit = 25) => {
      const { data, error } = await supabase.functions.invoke('sync-plan-alert-emails', {
        body: { limit },
      });

      if (error) {
        return { data: null, error: error.message };
      }

      await fetchMonitoring();
      return { data, error: null };
    },
    [fetchMonitoring]
  );

  useEffect(() => {
    fetchMonitoring();
  }, [fetchMonitoring]);

  return {
    summary,
    jobs,
    dispatchLogs,
    isLoading,
    error,
    fetchMonitoring,
    processQueueNow,
  };
};
