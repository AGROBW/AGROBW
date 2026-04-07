import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { RadarMatchEmailDispatchLog, RadarMatchEmailJob } from '../../types';

interface RadarMatchEmailSummary {
  pending: number;
  failed: number;
  skipped: number;
  sentToday: number;
}

const mapRadarMatchEmailJob = (row: any): RadarMatchEmailJob => ({
  id: row.id,
  matchId: row.match_id,
  userId: row.user_id,
  announcementId: row.announcement_id,
  recipientEmail: row.recipient_email ?? null,
  recipientName: row.recipient_name ?? null,
  announcementTitle: row.announcement_title ?? null,
  alertName: row.alert_name ?? null,
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

const mapRadarMatchEmailDispatchLog = (row: any): RadarMatchEmailDispatchLog => ({
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

export const useRadarMatchEmailMonitoring = () => {
  const [summary, setSummary] = useState<RadarMatchEmailSummary>({
    pending: 0,
    failed: 0,
    skipped: 0,
    sentToday: 0,
  });
  const [jobs, setJobs] = useState<RadarMatchEmailJob[]>([]);
  const [dispatchLogs, setDispatchLogs] = useState<RadarMatchEmailDispatchLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMonitoring = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const [
      pendingResult,
      failedResult,
      skippedResult,
      sentTodayResult,
      jobsResult,
      logsResult,
    ] = await Promise.all([
      supabase.from('radar_match_email_jobs').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('radar_match_email_jobs').select('id', { count: 'exact', head: true }).eq('status', 'failed'),
      supabase.from('radar_match_email_jobs').select('id', { count: 'exact', head: true }).eq('status', 'skipped'),
      supabase
        .from('radar_match_email_jobs')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'sent')
        .gte('sent_at', startOfDay.toISOString()),
      supabase
        .from('radar_match_email_jobs')
        .select('*')
        .order('queued_at', { ascending: false })
        .limit(50),
      supabase
        .from('radar_match_email_dispatch_logs')
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
      console.error('[useRadarMatchEmailMonitoring] erro ao carregar monitoramento:', firstError);
      setError(firstError.message);
      setJobs([]);
      setDispatchLogs([]);
      setSummary({
        pending: 0,
        failed: 0,
        skipped: 0,
        sentToday: 0,
      });
      setIsLoading(false);
      return;
    }

    setSummary({
      pending: pendingResult.count ?? 0,
      failed: failedResult.count ?? 0,
      skipped: skippedResult.count ?? 0,
      sentToday: sentTodayResult.count ?? 0,
    });
    setJobs((jobsResult.data || []).map(mapRadarMatchEmailJob));
    setDispatchLogs((logsResult.data || []).map(mapRadarMatchEmailDispatchLog));
    setIsLoading(false);
  }, []);

  const processQueueNow = useCallback(async (limit = 25) => {
    const { data, error } = await supabase.functions.invoke('sync-radar-match-emails', {
      body: { limit },
    });

    if (error) {
      return { data: null, error: error.message };
    }

    await fetchMonitoring();
    return { data, error: null };
  }, [fetchMonitoring]);

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
