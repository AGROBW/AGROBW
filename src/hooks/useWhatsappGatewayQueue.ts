import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { appError } from '../utils/appLogger';

export interface WhatsappGatewayTemplate {
  event_type: string;
  label: string;
  body_template: string;
  allowed_placeholders: string[];
  is_enabled: boolean;
  updated_at: string;
}

export interface WhatsappGatewayQueueSummary {
  pending_count: number;
  processing_count: number;
  retry_count: number;
  sent_today_count: number;
  dead_letter_count: number;
  enqueue_failure_count: number;
  last_queued_at: string | null;
  last_sent_at: string | null;
}

export interface WhatsappGatewayJobSummary {
  id: string;
  event_type: string;
  event_label: string;
  status: 'pending' | 'processing' | 'retry' | 'sent' | 'dead_letter' | 'skipped';
  attempts: number;
  max_attempts: number;
  last_http_status: number | null;
  last_error_code: string | null;
  created_at: string;
  sent_at: string | null;
}

const EMPTY_SUMMARY: WhatsappGatewayQueueSummary = {
  pending_count: 0,
  processing_count: 0,
  retry_count: 0,
  sent_today_count: 0,
  dead_letter_count: 0,
  enqueue_failure_count: 0,
  last_queued_at: null,
  last_sent_at: null,
};

export const useWhatsappGatewayQueue = () => {
  const [templates, setTemplates] = useState<WhatsappGatewayTemplate[]>([]);
  const [summary, setSummary] = useState<WhatsappGatewayQueueSummary>(EMPTY_SUMMARY);
  const [recentJobs, setRecentJobs] = useState<WhatsappGatewayJobSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchQueue = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [templatesResult, summaryResult, recentJobsResult] = await Promise.all([
        supabase.rpc('get_whatsapp_gateway_templates_admin_safe'),
        supabase.rpc('get_whatsapp_gateway_queue_summary_admin_safe'),
        supabase.rpc('get_recent_whatsapp_gateway_jobs_admin_safe', { p_limit: 25 }),
      ]);
      if (templatesResult.error) throw templatesResult.error;
      if (summaryResult.error) throw summaryResult.error;
      if (recentJobsResult.error) throw recentJobsResult.error;

      setTemplates(Array.isArray(templatesResult.data) ? templatesResult.data : []);
      const summaryRow = Array.isArray(summaryResult.data)
        ? summaryResult.data[0]
        : summaryResult.data;
      setSummary(summaryRow || EMPTY_SUMMARY);
      setRecentJobs(Array.isArray(recentJobsResult.data) ? recentJobsResult.data : []);
    } catch (fetchError) {
      appError('[WhatsappGateway] Erro ao carregar fila e templates', fetchError);
      setError('Nao foi possivel carregar os eventos automaticos da Central WhatsApp.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const updateTemplate = async (template: WhatsappGatewayTemplate) => {
    const { data, error: updateError } = await supabase.rpc(
      'update_whatsapp_gateway_template_admin_safe',
      {
        p_event_type: template.event_type,
        p_body_template: template.body_template.trim(),
        p_is_enabled: template.is_enabled,
      },
    );
    if (updateError) {
      appError('[WhatsappGateway] Erro ao atualizar template', updateError, {
        eventType: template.event_type,
      });
      return { error: updateError.message };
    }

    const updated = (Array.isArray(data) ? data[0] : data) as WhatsappGatewayTemplate | null;
    if (updated) {
      setTemplates((current) => current.map((item) => (
        item.event_type === updated.event_type ? updated : item
      )));
    }
    return { error: null };
  };

  const retryJob = async (jobId: string) => {
    const { data, error: retryError } = await supabase.rpc(
      'retry_whatsapp_gateway_job_admin_safe',
      { p_job_id: jobId },
    );
    if (retryError) {
      appError('[WhatsappGateway] Erro ao reenfileirar job', retryError, { jobId });
      return { retried: false, error: retryError.message };
    }
    if (!data) return { retried: false, error: 'Este envio nao pode mais ser reenfileirado.' };
    await fetchQueue();
    return { retried: true, error: null };
  };

  useEffect(() => {
    void fetchQueue();
  }, [fetchQueue]);

  return { templates, summary, recentJobs, isLoading, error, fetchQueue, updateTemplate, retryJob };
};
