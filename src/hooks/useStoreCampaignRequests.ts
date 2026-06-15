import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import { appError } from '../utils/appLogger';

export type StoreCampaignStatus =
  | 'pending_review'
  | 'approved'
  | 'rejected'
  | 'preparing'
  | 'queued'
  | 'sending'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface StoreCampaignRequest {
  id: string;
  announcement_id: string | null;
  announcement_snapshot: Record<string, any>;
  requested_subject: string | null;
  requested_message: string | null;
  status: StoreCampaignStatus;
  rejection_reason: string | null;
  campaign_id: string | null;
  created_at: string;
  updated_at: string;
}

// Status que indicam uma solicitação "em andamento" para um anúncio (bloqueia novo pedido p/ o mesmo anúncio).
const OPEN_STATUSES: StoreCampaignStatus[] = ['pending_review', 'approved', 'preparing', 'queued', 'sending'];

export const useStoreCampaignRequests = () => {
  const { user } = useAuth();
  const [requests, setRequests] = useState<StoreCampaignRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user?.id) {
      setRequests([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    const { data, error } = await supabase
      .from('seller_store_campaign_requests')
      .select(
        'id, announcement_id, announcement_snapshot, requested_subject, requested_message, status, rejection_reason, campaign_id, created_at, updated_at'
      )
      .order('created_at', { ascending: false });

    if (error) {
      appError('[StoreCampaign] Erro ao carregar solicitações', error);
      setRequests([]);
    } else {
      setRequests((data as StoreCampaignRequest[]) || []);
    }
    setIsLoading(false);
  }, [user?.id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const openByAnnouncement = useMemo(() => {
    const map = new Map<string, StoreCampaignRequest>();
    for (const r of requests) {
      if (r.announcement_id && OPEN_STATUSES.includes(r.status) && !map.has(r.announcement_id)) {
        map.set(r.announcement_id, r);
      }
    }
    return map;
  }, [requests]);

  const requestCampaign = useCallback(
    async (announcementId: string, subject?: string | null, message?: string | null) => {
      const { data, error } = await supabase.rpc('request_store_campaign', {
        p_announcement_id: announcementId,
        p_subject: subject?.trim() || null,
        p_message: message?.trim() || null,
      });
      if (error) {
        return { error: error.message, id: null as string | null };
      }
      await refresh();
      return { error: null, id: (data as string) ?? null };
    },
    [refresh]
  );

  return { requests, isLoading, refresh, openByAnnouncement, requestCampaign };
};
