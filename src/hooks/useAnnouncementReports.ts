import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

export type AnnouncementReportReason =
  | 'inappropriate_content'
  | 'wrong_category'
  | 'fraud_or_scam'
  | 'false_information'
  | 'prohibited_item'
  | 'duplicate_or_spam'
  | 'other';

export interface AnnouncementReportSnapshot {
  reportCount: number;
  threshold: number;
  reportsRemaining: number;
  userHasReported: boolean;
}

const DEFAULT_SNAPSHOT: AnnouncementReportSnapshot = {
  reportCount: 0,
  threshold: 10,
  reportsRemaining: 10,
  userHasReported: false,
};

const getReportErrorMessage = (error: unknown) => {
  if (error && typeof error === 'object') {
    const candidate = error as { message?: string; details?: string; hint?: string };
    return candidate.message || candidate.details || candidate.hint || 'Nao foi possivel registrar a denuncia.';
  }

  return 'Nao foi possivel registrar a denuncia.';
};

export const useAnnouncementReports = (announcementId?: string) => {
  const [snapshot, setSnapshot] = useState<AnnouncementReportSnapshot>(DEFAULT_SNAPSHOT);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadSnapshot = useCallback(async () => {
    if (!announcementId) {
      setSnapshot(DEFAULT_SNAPSHOT);
      return;
    }

    setIsLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_announcement_report_snapshot', {
        p_announcement_id: announcementId,
      });

      if (error) throw error;

      setSnapshot({
        reportCount: Number(data?.report_count || 0),
        threshold: Number(data?.threshold || 10),
        reportsRemaining: Number(data?.reports_remaining || 0),
        userHasReported: Boolean(data?.user_has_reported),
      });
    } catch (error) {
      console.error('[AnnouncementReports] Erro ao carregar snapshot de denuncias:', error);
      setSnapshot(DEFAULT_SNAPSHOT);
    } finally {
      setIsLoading(false);
    }
  }, [announcementId]);

  useEffect(() => {
    void loadSnapshot();
  }, [loadSnapshot]);

  const submitReport = useCallback(
    async (reason: AnnouncementReportReason, details?: string) => {
      if (!announcementId) {
        throw new Error('Anuncio nao informado.');
      }

      setIsSubmitting(true);
      try {
        const { data, error } = await supabase.rpc('submit_announcement_report', {
          p_announcement_id: announcementId,
          p_reason: reason,
          p_details: details?.trim() ? details.trim() : null,
        });

        if (error) {
          throw new Error(getReportErrorMessage(error));
        }

        setSnapshot((previous) => {
          const reportCount = Number(data?.report_count ?? previous.reportCount);
          const threshold = Number(data?.threshold ?? previous.threshold);
          return {
            reportCount,
            threshold,
            reportsRemaining: Math.max(threshold - reportCount, 0),
            userHasReported: true,
          };
        });

        return {
          reportCount: Number(data?.report_count || 0),
          threshold: Number(data?.threshold || 10),
          sentToReview: Boolean(data?.sent_to_review),
        };
      } catch (error) {
        throw new Error(getReportErrorMessage(error));
      } finally {
        setIsSubmitting(false);
      }
    },
    [announcementId]
  );

  return {
    snapshot,
    isLoading,
    isSubmitting,
    loadSnapshot,
    submitReport,
  };
};
