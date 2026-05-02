import { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from './supabaseClient';

export type AdminNotificationCategory = 'moderation' | 'support' | 'system';

export interface AdminNotificationItem {
  id: string;
  category: AdminNotificationCategory;
  title: string;
  content: string;
  link: string;
  count: number;
  timestamp: string;
  priority: 'default' | 'high';
}

const safeError = (error: unknown) => {
  if (error && typeof error === 'object' && 'code' in error) {
    return error as { code?: string };
  }
  return null;
};

export const fetchAdminNotificationItems = async (): Promise<AdminNotificationItem[]> => {
  const items: AdminNotificationItem[] = [];

  try {
    const [
      pendingAnnouncementsResult,
      latestPendingAnnouncementResult,
      pendingEditRequestsResult,
      latestPendingEditRequestResult,
      openSupportTicketsResult,
      latestOpenSupportTicketResult,
      urgentSupportTicketsResult,
      latestUrgentSupportTicketResult,
    ] = await Promise.all([
      supabase.from('announcements').select('id', { count: 'exact', head: true }).in('status', ['PENDING', 'UNDER_REVIEW']),
      supabase.from('announcements').select('created_at').in('status', ['PENDING', 'UNDER_REVIEW']).order('created_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('announcement_edit_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('announcement_edit_requests').select('created_at').eq('status', 'pending').order('created_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('support_tickets').select('id', { count: 'exact', head: true }).in('status', ['open', 'in_progress']),
      supabase.from('support_tickets').select('last_message_at').in('status', ['open', 'in_progress']).order('last_message_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('support_tickets').select('id', { count: 'exact', head: true }).eq('priority', 'urgent').in('status', ['open', 'in_progress']),
      supabase.from('support_tickets').select('last_message_at').eq('priority', 'urgent').in('status', ['open', 'in_progress']).order('last_message_at', { ascending: false }).limit(1).maybeSingle(),
    ]);

    if (pendingAnnouncementsResult.error) {
      throw pendingAnnouncementsResult.error;
    }

    const pendingAnnouncementsCount = pendingAnnouncementsResult.count || 0;
    if (pendingAnnouncementsCount > 0) {
      items.push({
        id: 'pending-announcements',
        category: 'moderation',
        title: `${pendingAnnouncementsCount} anuncio(s) aguardando moderacao`,
        content: 'Existem anuncios aguardando analise ou aprovacao na fila de moderacao.',
        link: '/admin/moderation',
        count: pendingAnnouncementsCount,
        timestamp: latestPendingAnnouncementResult.data?.created_at || new Date().toISOString(),
        priority: 'high',
      });
    }

    const pendingEditRequestError = safeError(pendingEditRequestsResult.error);
    const latestPendingEditRequestError = safeError(latestPendingEditRequestResult.error);
    const pendingEditRequestsCount =
      pendingEditRequestError?.code === 'PGRST205' ? 0 : pendingEditRequestsResult.count || 0;

    if (pendingEditRequestError && pendingEditRequestError.code !== 'PGRST205') {
      throw pendingEditRequestsResult.error;
    }
    if (latestPendingEditRequestError && latestPendingEditRequestError.code !== 'PGRST205') {
      throw latestPendingEditRequestResult.error;
    }

    if (pendingEditRequestsCount > 0) {
      items.push({
        id: 'pending-edit-requests',
        category: 'moderation',
        title: `${pendingEditRequestsCount} edicao(oes) aguardando aprovacao`,
        content: 'Alteracoes em anuncios publicados estao esperando revisao administrativa.',
        link: '/admin/moderation',
        count: pendingEditRequestsCount,
        timestamp: latestPendingEditRequestResult.data?.created_at || new Date().toISOString(),
        priority: 'default',
      });
    }

    if (openSupportTicketsResult.error) {
      throw openSupportTicketsResult.error;
    }

    const openSupportTicketsCount = openSupportTicketsResult.count || 0;
    if (openSupportTicketsCount > 0) {
      items.push({
        id: 'open-support-tickets',
        category: 'support',
        title: `${openSupportTicketsCount} ticket(s) de suporte em aberto`,
        content: 'Ha atendimentos aguardando resposta ou acompanhamento no painel de suporte.',
        link: '/admin/support',
        count: openSupportTicketsCount,
        timestamp: latestOpenSupportTicketResult.data?.last_message_at || new Date().toISOString(),
        priority: 'default',
      });
    }

    if (urgentSupportTicketsResult.error) {
      throw urgentSupportTicketsResult.error;
    }

    const urgentSupportTicketsCount = urgentSupportTicketsResult.count || 0;
    if (urgentSupportTicketsCount > 0) {
      items.push({
        id: 'urgent-support-tickets',
        category: 'support',
        title: `${urgentSupportTicketsCount} ticket(s) urgente(s) exigem atencao`,
        content: 'Chamados classificados como urgentes merecem tratamento prioritario.',
        link: '/admin/support',
        count: urgentSupportTicketsCount,
        timestamp: latestUrgentSupportTicketResult.data?.last_message_at || new Date().toISOString(),
        priority: 'high',
      });
    }
  } catch (error) {
    console.error('[adminNotificationCenter] Erro ao carregar alertas do admin:', error);
  }

  return items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
};

export const subscribeToAdminNotificationEvents = (onChange: () => void) => {
  const debouncedRefresh = (() => {
    let timeoutId: number | null = null;

    return () => {
      if (typeof window === 'undefined') {
        onChange();
        return;
      }

      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }

      timeoutId = window.setTimeout(() => {
        timeoutId = null;
        onChange();
      }, 250);
    };
  })();

  const channel: RealtimeChannel = supabase
    .channel('admin_notification_center_changes')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'announcements',
      },
      debouncedRefresh,
    )
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'announcement_edit_requests',
      },
      debouncedRefresh,
    )
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'support_tickets',
      },
      debouncedRefresh,
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
};
