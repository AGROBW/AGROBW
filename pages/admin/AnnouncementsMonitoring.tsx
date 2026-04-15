import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  Eye,
  Filter,
  Image as ImageIcon,
  MessageSquare,
  MoreHorizontal,
  PauseCircle,
  PlayCircle,
  Search,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  UserRound,
  X,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { supabase } from '../../src/lib/supabaseClient';
import { useAdminAudit, ADMIN_ACTIONS, RESOURCE_TYPES } from '../../src/hooks/useAdminAudit';
import { toast } from 'sonner';
import { CATEGORY_HIERARCHY, getCategoryGroupBySlug } from '../../src/lib/categoryHierarchy';

type MonitoringAnnouncement = {
  id: string;
  title: string;
  description?: string | null;
  status: string;
  created_at: string;
  expires_at?: string | null;
  views: number;
  price?: number | null;
  images?: string[] | null;
  category_slug?: string | null;
  category_id?: string | null;
  user_id: string;
  highlight_home?: boolean | null;
  highlight_category?: boolean | null;
  owner?: {
    name: string;
    email: string;
  };
  leadsCount?: number;
  messagesCount?: number;
  isOfficialStore?: boolean;
};

type OwnerSummary = {
  name: string;
  email: string;
};

type SummaryMetrics = {
  active: number;
  pending: number;
  expiringSoon: number;
  highlighted: number;
};

const PAGE_SIZE = 20;

const statusLabel: Record<string, string> = {
  ACTIVE: 'Ativo',
  PENDING: 'Pendente',
  PAUSED: 'Pausado',
  BLOCKED: 'Bloqueado',
  EXPIRED: 'Expirado',
  SOLD: 'Vendido',
  REJECTED: 'Rejeitado',
  UNDER_REVIEW: 'Em análise',
};

const statusClass: Record<string, string> = {
  ACTIVE: 'bg-emerald-100 text-emerald-700',
  PENDING: 'bg-amber-100 text-amber-700',
  PAUSED: 'bg-slate-200 text-slate-700',
  BLOCKED: 'bg-rose-100 text-rose-700',
  EXPIRED: 'bg-slate-200 text-slate-700',
  SOLD: 'bg-sky-100 text-sky-700',
  REJECTED: 'bg-rose-100 text-rose-700',
  UNDER_REVIEW: 'bg-indigo-100 text-indigo-700',
};

const AnnouncementsMonitoring: React.FC = () => {
  const { logAction } = useAdminAudit();
  const [announcements, setAnnouncements] = useState<MonitoringAnnouncement[]>([]);
  const [summary, setSummary] = useState<SummaryMetrics>({
    active: 0,
    pending: 0,
    expiringSoon: 0,
    highlighted: 0,
  });
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<MonitoringAnnouncement | null>(null);
  const [pauseTarget, setPauseTarget] = useState<MonitoringAnnouncement | null>(null);
  const [pauseReason, setPauseReason] = useState('');
  const [isSubmittingPause, setIsSubmittingPause] = useState(false);
  const [openActionsMenuId, setOpenActionsMenuId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [performanceFilter, setPerformanceFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    void loadAnnouncements();
  }, [page, statusFilter, categoryFilter, performanceFilter, searchTerm]);

  useEffect(() => {
    const handleClickOutside = () => setOpenActionsMenuId(null);
    window.addEventListener('click', handleClickOutside);
    return () => window.removeEventListener('click', handleClickOutside);
  }, []);

  const loadAnnouncements = async () => {
    setLoading(true);

    try {
      const nowIso = new Date().toISOString();
      const sevenDaysAheadIso = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

      const [activeSummary, pendingSummary, expiringSummary, highlightedSummary] = await Promise.all([
        supabase.from('announcements').select('id', { count: 'exact', head: true }).eq('status', 'ACTIVE'),
        supabase.from('announcements').select('id', { count: 'exact', head: true }).eq('status', 'PENDING'),
        supabase
          .from('announcements')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'ACTIVE')
          .not('expires_at', 'is', null)
          .gt('expires_at', nowIso)
          .lte('expires_at', sevenDaysAheadIso),
        supabase
          .from('announcements')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'ACTIVE')
          .or('highlight_home.eq.true,highlight_category.eq.true'),
      ]);

      setSummary({
        active: activeSummary.count || 0,
        pending: pendingSummary.count || 0,
        expiringSoon: expiringSummary.count || 0,
        highlighted: highlightedSummary.count || 0,
      });

      let query = supabase
        .from('announcements')
        .select(
          'id,title,description,status,created_at,expires_at,views,price,images,category_id,category_slug,user_id,highlight_home,highlight_category',
          { count: 'exact' }
        )
        .order('created_at', { ascending: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      if (categoryFilter !== 'all') {
        const group = CATEGORY_HIERARCHY.find((item) => item.slug === categoryFilter);
        if (group?.categorySlugs?.length) {
          query = query.in('category_slug', group.categorySlugs);
        } else {
          query = query.eq('category_slug', categoryFilter);
        }
      }

      if (searchTerm.trim()) {
        query = query.or(`title.ilike.%${searchTerm.trim()}%,description.ilike.%${searchTerm.trim()}%`);
      }

      const { data, error, count } = await query;
      if (error) throw error;

      let rows = (data || []) as MonitoringAnnouncement[];
      const announcementIds = rows.map((item) => item.id);
      const userIds = Array.from(new Set(rows.map((item) => item.user_id).filter(Boolean)));

      const [ownersResponse, leadsResponse, chatsResponse, storesResponse] = await Promise.all([
        userIds.length
          ? supabase.from('users').select('id,name,email').in('id', userIds)
          : Promise.resolve({ data: [], error: null } as any),
        announcementIds.length
          ? supabase.from('leads').select('announcement_id').in('announcement_id', announcementIds)
          : Promise.resolve({ data: [], error: null } as any),
        announcementIds.length
          ? supabase.from('chats').select('announcement_id').in('announcement_id', announcementIds)
          : Promise.resolve({ data: [], error: null } as any),
        userIds.length
          ? supabase
              .from('seller_stores')
              .select('user_id,is_active,is_store_feature_enabled')
              .in('user_id', userIds)
          : Promise.resolve({ data: [], error: null } as any),
      ]);

      if (ownersResponse.error) throw ownersResponse.error;
      if (leadsResponse.error) throw leadsResponse.error;
      if (chatsResponse.error) throw chatsResponse.error;
      if (storesResponse.error) throw storesResponse.error;

      const ownersMap = new Map<string, OwnerSummary>(
        (ownersResponse.data || []).map((owner: any) => [
          owner.id,
          { name: owner.name, email: owner.email },
        ])
      );

      const leadsCountMap = new Map<string, number>();
      (leadsResponse.data || []).forEach((lead: any) => {
        const key = lead.announcement_id;
        leadsCountMap.set(key, (leadsCountMap.get(key) || 0) + 1);
      });

      const messagesCountMap = new Map<string, number>();
      (chatsResponse.data || []).forEach((chat: any) => {
        const key = chat.announcement_id;
        messagesCountMap.set(key, (messagesCountMap.get(key) || 0) + 1);
      });

      const officialStoreUserIds = new Set(
        (storesResponse.data || [])
          .filter((store: any) => store.is_active && store.is_store_feature_enabled)
          .map((store: any) => store.user_id)
      );

      rows = rows.map((row): MonitoringAnnouncement => ({
        ...row,
        owner: ownersMap.get(row.user_id) || undefined,
        leadsCount: leadsCountMap.get(row.id) || 0,
        messagesCount: messagesCountMap.get(row.id) || 0,
        isOfficialStore: officialStoreUserIds.has(row.user_id),
      }));

      if (performanceFilter !== 'all') {
        rows = rows.filter((row) => {
          const isExpiringSoon =
            row.status === 'ACTIVE' &&
            row.expires_at &&
            new Date(row.expires_at).getTime() > Date.now() &&
            new Date(row.expires_at).getTime() <= Date.now() + 7 * 24 * 60 * 60 * 1000;

          const highViewsNoLead = (row.views || 0) >= 50 && (row.leadsCount || 0) === 0;
          const hasHighlight = Boolean(row.highlight_home || row.highlight_category);

          if (performanceFilter === 'expiring') return isExpiringSoon;
          if (performanceFilter === 'no_leads') return highViewsNoLead;
          if (performanceFilter === 'highlighted') return hasHighlight;
          if (performanceFilter === 'official_store') return row.isOfficialStore;
          return true;
        });
      }

      setAnnouncements(rows);
      setTotalCount(count || 0);
    } catch (error) {
      console.error('[AnnouncementsMonitoring] Erro ao carregar monitoramento:', error);
    } finally {
      setLoading(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  const getCategoryLabel = (announcement: MonitoringAnnouncement) =>
    getCategoryGroupBySlug(announcement.category_slug)?.name ||
    announcement.category_slug ||
    'Categoria';

  const getAlertMeta = (announcement: MonitoringAnnouncement) => {
    const isExpiringSoon =
      announcement.status === 'ACTIVE' &&
      announcement.expires_at &&
      new Date(announcement.expires_at).getTime() > Date.now() &&
      new Date(announcement.expires_at).getTime() <= Date.now() + 7 * 24 * 60 * 60 * 1000;

    if (announcement.status === 'PENDING') {
      return {
        label: 'Aguardando moderação',
        className: 'bg-amber-100 text-amber-700',
      };
    }

    if (isExpiringSoon) {
      return {
        label: 'Expira em breve',
        className: 'bg-orange-100 text-orange-700',
      };
    }

    if ((announcement.views || 0) >= 50 && (announcement.leadsCount || 0) === 0) {
      return {
        label: 'Muita visita sem lead',
        className: 'bg-rose-100 text-rose-700',
      };
    }

    if ((announcement.highlight_home || announcement.highlight_category) && (announcement.leadsCount || 0) === 0) {
      return {
        label: 'Destaque sem conversão',
        className: 'bg-indigo-100 text-indigo-700',
      };
    }

    return {
      label: 'Saudável',
      className: 'bg-emerald-100 text-emerald-700',
    };
  };

  const performanceFilterCount = useMemo(() => {
    let count = 0;
    if (statusFilter !== 'all') count += 1;
    if (categoryFilter !== 'all') count += 1;
    if (performanceFilter !== 'all') count += 1;
    if (searchTerm.trim()) count += 1;
    return count;
  }, [statusFilter, categoryFilter, performanceFilter, searchTerm]);

  const openPauseModal = (announcement: MonitoringAnnouncement) => {
    setPauseTarget(announcement);
    setPauseReason('');
  };

  const closePauseModal = () => {
    setPauseTarget(null);
    setPauseReason('');
    setIsSubmittingPause(false);
  };

  const handleTogglePause = async (announcement: MonitoringAnnouncement, reason?: string) => {
    const nextStatus = announcement.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE';
    const isPausing = nextStatus === 'PAUSED';
    const pauseReasonValue = reason?.trim() || '';

    if (isPausing && !pauseReasonValue) {
      toast.error('Informe o motivo da pausa do anúncio');
      return;
    }

    try {
      setIsSubmittingPause(true);
      const { data, error } = await supabase
        .from('announcements')
        .update({ status: nextStatus })
        .eq('id', announcement.id)
        .select('id,status')
        .maybeSingle();

      if (error) throw error;
      if (!data) {
        throw new Error('Nenhum anúncio foi atualizado. Verifique as permissões do administrador.');
      }

      setAnnouncements((current) =>
        current.map((item) =>
          item.id === announcement.id
            ? { ...item, status: nextStatus }
            : item
        )
      );

      setSelectedAnnouncement((current) =>
        current?.id === announcement.id
          ? { ...current, status: nextStatus }
          : current
      );

      await logAction({
        action: isPausing ? 'PAUSE_AD' : 'RESUME_AD',
        resourceType: RESOURCE_TYPES.ANNOUNCEMENT,
        resourceId: announcement.id,
        oldValue: { status: announcement.status },
        newValue: { status: nextStatus },
        reason: isPausing
          ? `Anúncio "${announcement.title}" pausado via monitoramento. Motivo: ${pauseReasonValue}`
          : `Anúncio "${announcement.title}" reativado via monitoramento.`
      });

      const notificationTitle = isPausing
        ? 'Seu anúncio foi pausado pela equipe'
        : 'Seu anúncio foi reativado pela equipe';
      const notificationContent = isPausing
        ? `O anúncio "${announcement.title}" foi pausado temporariamente pela equipe AGRO BW. Motivo: ${pauseReasonValue}`
        : `O anúncio "${announcement.title}" foi reativado pela equipe AGRO BW e voltou a ficar disponível na plataforma.`;

      const { data: notificationRecord, error: notificationError } = await supabase
        .from('notifications')
        .insert({
          user_id: announcement.user_id,
          type: 'system',
          title: notificationTitle,
          content: notificationContent,
          link: '/minha-conta/anuncios',
          is_read: false,
        })
        .select('id')
        .single();

      if (notificationError) {
        console.error('[AnnouncementsMonitoring] Erro ao criar notificação para o anunciante:', notificationError);
      } else {
        const recipientEmail = announcement.owner?.email?.trim() || null;
        const recipientName = announcement.owner?.name?.trim() || 'Cliente';
        const { error: emailJobError } = await supabase.from('plan_alert_email_jobs').insert({
          notification_id: notificationRecord.id,
          user_id: announcement.user_id,
          recipient_email: recipientEmail,
          recipient_name: recipientName,
          alert_kind: isPausing ? 'ad_paused' : 'ad_resumed',
          notification_title: notificationTitle,
          notification_content: notificationContent,
          link: '/minha-conta/anuncios',
          status: recipientEmail ? 'pending' : 'skipped',
          last_error: recipientEmail ? null : 'Usuario sem e-mail valido',
        });

        if (emailJobError) {
          console.error('[AnnouncementsMonitoring] Erro ao criar job de e-mail do anunciante:', emailJobError);
        }
      }

      toast.success(isPausing ? 'Anúncio pausado com sucesso' : 'Anúncio reativado com sucesso');
      closePauseModal();
      await loadAnnouncements();
    } catch (error) {
      console.error('[AnnouncementsMonitoring] Erro ao alterar status:', error);
      toast.error(error instanceof Error ? error.message : 'Não foi possível atualizar o status do anúncio');
    } finally {
      setIsSubmittingPause(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-[26px] border border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] p-6 shadow-[0_24px_60px_-42px_rgba(15,23,42,0.35)] lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700">Monitoramento operacional</p>
          <h1 className="mt-2 text-3xl font-black text-slate-900">Monitoramento de Anúncios</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-500">
            Acompanhe saúde, desempenho e sinais de atenção dos anúncios publicados na plataforma.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Ativos</p>
            <p className="mt-1 text-2xl font-black text-slate-900">{summary.active}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Pendentes</p>
            <p className="mt-1 text-2xl font-black text-slate-900">{summary.pending}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Expiram em 7 dias</p>
            <p className="mt-1 text-2xl font-black text-slate-900">{summary.expiringSoon}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Com destaque</p>
            <p className="mt-1 text-2xl font-black text-slate-900">{summary.highlighted}</p>
          </div>
        </div>
      </div>

      <section className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_22px_50px_-42px_rgba(15,23,42,0.28)]">
        <div className="flex flex-col gap-4 xl:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(event) => {
                setPage(0);
                setSearchTerm(event.target.value);
              }}
              placeholder="Buscar por título do anúncio"
              className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-4 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-green-500/20"
            />
          </div>

          <div className="flex flex-col gap-3 md:flex-row">
            <select
              value={statusFilter}
              onChange={(event) => {
                setPage(0);
                setStatusFilter(event.target.value);
              }}
              className="h-11 rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-green-500/20"
            >
              <option value="all">Todos os status</option>
              <option value="ACTIVE">Ativos</option>
              <option value="PENDING">Pendentes</option>
              <option value="PAUSED">Pausados</option>
              <option value="EXPIRED">Expirados</option>
              <option value="BLOCKED">Bloqueados</option>
            </select>

            <select
              value={categoryFilter}
              onChange={(event) => {
                setPage(0);
                setCategoryFilter(event.target.value);
              }}
              className="h-11 rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-green-500/20"
            >
              <option value="all">Todas as categorias</option>
              {CATEGORY_HIERARCHY.map((category) => (
                <option key={category.slug} value={category.slug}>
                  {category.name}
                </option>
              ))}
            </select>

            <select
              value={performanceFilter}
              onChange={(event) => {
                setPage(0);
                setPerformanceFilter(event.target.value);
              }}
              className="h-11 rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-green-500/20"
            >
              <option value="all">Todos os cenários</option>
              <option value="expiring">Expirando em 7 dias</option>
              <option value="no_leads">Muita visita sem lead</option>
              <option value="highlighted">Com destaque</option>
              <option value="official_store">Loja parceira</option>
            </select>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between gap-4">
          <div className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
            <Filter className="h-3.5 w-3.5" />
            {performanceFilterCount} filtro(s) ativo(s)
          </div>

          <button
            type="button"
            onClick={() => {
              setPage(0);
              setStatusFilter('all');
              setCategoryFilter('all');
              setPerformanceFilter('all');
              setSearchTerm('');
            }}
            className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700 hover:text-emerald-800"
          >
            Limpar
          </button>
        </div>
      </section>

      <section className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-[0_22px_50px_-42px_rgba(15,23,42,0.28)]">
        <div className="border-b border-slate-100 px-6 py-5">
          <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Painel de leitura</p>
              <h3 className="text-lg font-semibold text-slate-900">Anúncios monitorados</h3>
            </div>
            <p className="text-sm text-slate-500">{totalCount} registro(s) no cenário atual</p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1120px]">
            <thead className="bg-slate-50">
              <tr className="text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                <th className="px-6 py-4">Anúncio</th>
                <th className="px-6 py-4">Anunciante</th>
                <th className="px-6 py-4">Categoria</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4">Desempenho</th>
                <th className="px-6 py-4">Exposição</th>
                <th className="px-6 py-4">Expiração</th>
                <th className="px-6 py-4">Alerta</th>
                <th className="px-6 py-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={9} className="px-6 py-12 text-center">
                    <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-emerald-600" />
                  </td>
                </tr>
              ) : announcements.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-6 py-12 text-center text-sm text-slate-500">
                    Nenhum anúncio encontrado nesse monitoramento.
                  </td>
                </tr>
              ) : (
                announcements.map((announcement) => {
                  const alertMeta = getAlertMeta(announcement);

                  return (
                    <tr key={announcement.id} className="transition-colors hover:bg-slate-50/80">
                      <td className="px-6 py-4">
                        <div>
                          <p className="font-semibold text-slate-900">{announcement.title}</p>
                          <p className="mt-1 text-xs text-slate-500">
                            Criado em {new Date(announcement.created_at).toLocaleDateString('pt-BR')}
                          </p>
                        </div>
                        <div className="hidden justify-end">
                          <div className="relative">
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                setOpenActionsMenuId((current) => (current === announcement.id ? null : announcement.id));
                              }}
                              className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-600 transition-colors hover:bg-slate-50"
                              aria-label="Abrir ações do anúncio"
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </button>

                            {openActionsMenuId === announcement.id && (
                              <div
                                className="absolute right-0 top-11 z-20 w-56 overflow-hidden rounded-2xl border border-slate-200 bg-white p-2 shadow-[0_24px_60px_-30px_rgba(15,23,42,0.35)]"
                                onClick={(event) => event.stopPropagation()}
                              >
                                <div className="space-y-1">
                                  {(announcement.status === 'ACTIVE' || announcement.status === 'PAUSED') && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setOpenActionsMenuId(null);
                                        if (announcement.status === 'ACTIVE') {
                                          openPauseModal(announcement);
                                          return;
                                        }
                                        void handleTogglePause(announcement);
                                      }}
                                      className="flex h-10 w-full items-center gap-2 rounded-xl px-3 text-left text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
                                    >
                                      {announcement.status === 'ACTIVE' ? (
                                        <>
                                          <PauseCircle className="h-4 w-4" />
                                          Pausar
                                        </>
                                      ) : (
                                        <>
                                          <PlayCircle className="h-4 w-4" />
                                          Reativar
                                        </>
                                      )}
                                    </button>
                                  )}
                                  <Link
                                    to={`/admin/users?q=${encodeURIComponent(announcement.owner?.email || announcement.owner?.name || announcement.user_id)}`}
                                    onClick={() => setOpenActionsMenuId(null)}
                                    className="flex h-10 w-full items-center gap-2 rounded-xl px-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
                                  >
                                    <UserRound className="h-4 w-4" />
                                    Anunciante
                                  </Link>
                                  {announcement.status === 'PENDING' && (
                                    <Link
                                      to="/admin/moderation"
                                      onClick={() => setOpenActionsMenuId(null)}
                                      className="flex h-10 w-full items-center gap-2 rounded-xl px-3 text-sm font-semibold text-amber-700 transition-colors hover:bg-amber-50"
                                    >
                                      <ShieldCheck className="h-4 w-4" />
                                      Moderar
                                    </Link>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setOpenActionsMenuId(null);
                                      setSelectedAnnouncement(announcement);
                                    }}
                                    className="flex h-10 w-full items-center gap-2 rounded-xl px-3 text-left text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
                                  >
                                    <ImageIcon className="h-4 w-4" />
                                    Resumo
                                  </button>
                                  <Link
                                    to={`/anuncio/${announcement.id}`}
                                    target="_blank"
                                    onClick={() => setOpenActionsMenuId(null)}
                                    className="flex h-10 w-full items-center gap-2 rounded-xl px-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
                                  >
                                    <Eye className="h-4 w-4" />
                                    Ver anúncio
                                  </Link>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div>
                          <p className="font-medium text-slate-900">{announcement.owner?.name || 'Não informado'}</p>
                          <p className="mt-1 text-xs text-slate-500">{announcement.owner?.email || 'Sem e-mail'}</p>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600">{getCategoryLabel(announcement)}</td>
                      <td className="px-6 py-4">
                        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass[announcement.status] || 'bg-slate-100 text-slate-700'}`}>
                          {statusLabel[announcement.status] || announcement.status}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="space-y-1 text-xs text-slate-600">
                          <div className="flex items-center gap-2">
                            <Eye className="h-3.5 w-3.5 text-slate-400" />
                            <span>{announcement.views || 0} visualizações</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <TrendingUp className="h-3.5 w-3.5 text-slate-400" />
                            <span>{announcement.leadsCount || 0} lead(s)</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <MessageSquare className="h-3.5 w-3.5 text-slate-400" />
                            <span>{announcement.messagesCount || 0} conversa(s)</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-wrap gap-2">
                          {announcement.highlight_home && (
                            <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700">
                              Home
                            </span>
                          )}
                          {announcement.highlight_category && (
                            <span className="rounded-full bg-blue-100 px-2.5 py-1 text-xs font-semibold text-blue-700">
                              Categoria
                            </span>
                          )}
                          {announcement.isOfficialStore && (
                            <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                              Loja Parceira
                            </span>
                          )}
                          {!announcement.highlight_home && !announcement.highlight_category && !announcement.isOfficialStore && (
                            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-500">
                              Padrão
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        {announcement.expires_at ? (
                          <div className="flex items-center gap-2 text-sm text-slate-600">
                            <CalendarClock className="h-4 w-4 text-slate-400" />
                            {new Date(announcement.expires_at).toLocaleDateString('pt-BR')}
                          </div>
                        ) : (
                          <span className="text-sm text-slate-400">Sem data</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${alertMeta.className}`}>
                          {alertMeta.label}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="hidden justify-end gap-2">
                          {(announcement.status === 'ACTIVE' || announcement.status === 'PAUSED') && (
                            <button
                              type="button"
                              onClick={() => void handleTogglePause(announcement)}
                              className="inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
                            >
                              {announcement.status === 'ACTIVE' ? (
                                <>
                                  <PauseCircle className="h-4 w-4" />
                                  Pausar
                                </>
                              ) : (
                                <>
                                  <PlayCircle className="h-4 w-4" />
                                  Reativar
                                </>
                              )}
                            </button>
                          )}
                          <Link
                            to={`/admin/users?q=${encodeURIComponent(announcement.owner?.email || announcement.owner?.name || announcement.user_id)}`}
                            className="inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
                          >
                            <UserRound className="h-4 w-4" />
                            Anunciante
                          </Link>
                          {announcement.status === 'PENDING' && (
                            <Link
                              to="/admin/moderation"
                              className="inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 text-sm font-semibold text-amber-700 transition-colors hover:bg-amber-100"
                            >
                              <ShieldCheck className="h-4 w-4" />
                              Moderar
                            </Link>
                          )}
                          <button
                            type="button"
                            onClick={() => setSelectedAnnouncement(announcement)}
                            className="inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
                          >
                            <ImageIcon className="h-4 w-4" />
                            Resumo
                          </button>
                          <Link
                            to={`/anuncio/${announcement.id}`}
                            target="_blank"
                            className="inline-flex h-9 items-center justify-center rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
                          >
                            Ver anúncio
                          </Link>
                        </div>
                        <div className="flex justify-end">
                          <div className="relative">
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                setOpenActionsMenuId((current) => (current === announcement.id ? null : announcement.id));
                              }}
                              className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-600 transition-colors hover:bg-slate-50"
                              aria-label="Abrir ações do anúncio"
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </button>

                            {openActionsMenuId === announcement.id && (
                              <div
                                className="absolute right-0 top-11 z-20 w-56 overflow-hidden rounded-2xl border border-slate-200 bg-white p-2 shadow-[0_24px_60px_-30px_rgba(15,23,42,0.35)]"
                                onClick={(event) => event.stopPropagation()}
                              >
                                <div className="space-y-1">
                                  {(announcement.status === 'ACTIVE' || announcement.status === 'PAUSED') && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setOpenActionsMenuId(null);
                                        if (announcement.status === 'ACTIVE') {
                                          openPauseModal(announcement);
                                          return;
                                        }
                                        void handleTogglePause(announcement);
                                      }}
                                      className="flex h-10 w-full items-center gap-2 rounded-xl px-3 text-left text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
                                    >
                                      {announcement.status === 'ACTIVE' ? (
                                        <>
                                          <PauseCircle className="h-4 w-4" />
                                          Pausar
                                        </>
                                      ) : (
                                        <>
                                          <PlayCircle className="h-4 w-4" />
                                          Reativar
                                        </>
                                      )}
                                    </button>
                                  )}
                                  <Link
                                    to={`/admin/users?q=${encodeURIComponent(announcement.owner?.email || announcement.owner?.name || announcement.user_id)}`}
                                    onClick={() => setOpenActionsMenuId(null)}
                                    className="flex h-10 w-full items-center gap-2 rounded-xl px-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
                                  >
                                    <UserRound className="h-4 w-4" />
                                    Anunciante
                                  </Link>
                                  {announcement.status === 'PENDING' && (
                                    <Link
                                      to="/admin/moderation"
                                      onClick={() => setOpenActionsMenuId(null)}
                                      className="flex h-10 w-full items-center gap-2 rounded-xl px-3 text-sm font-semibold text-amber-700 transition-colors hover:bg-amber-50"
                                    >
                                      <ShieldCheck className="h-4 w-4" />
                                      Moderar
                                    </Link>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setOpenActionsMenuId(null);
                                      setSelectedAnnouncement(announcement);
                                    }}
                                    className="flex h-10 w-full items-center gap-2 rounded-xl px-3 text-left text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
                                  >
                                    <ImageIcon className="h-4 w-4" />
                                    Resumo
                                  </button>
                                  <Link
                                    to={`/anuncio/${announcement.id}`}
                                    target="_blank"
                                    onClick={() => setOpenActionsMenuId(null)}
                                    className="flex h-10 w-full items-center gap-2 rounded-xl px-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
                                  >
                                    <Eye className="h-4 w-4" />
                                    Ver anúncio
                                  </Link>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-slate-100 px-6 py-4">
            <p className="text-sm text-slate-500">
              Página {page + 1} de {totalPages}
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((current) => Math.max(0, current - 1))}
                disabled={page === 0}
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                onClick={() => setPage((current) => Math.min(totalPages - 1, current + 1))}
                disabled={page >= totalPages - 1}
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </section>

      {pauseTarget && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/45 px-4 backdrop-blur-[1px]">
          <div className="w-full max-w-xl rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_32px_80px_-32px_rgba(15,23,42,0.45)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-600">Pausar anúncio</p>
                <h3 className="mt-2 text-xl font-bold text-slate-900">{pauseTarget.title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  Informe o motivo da pausa. Esse texto será mostrado ao anunciante no painel e no e-mail.
                </p>
              </div>
              <button
                type="button"
                onClick={closePauseModal}
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-6 space-y-3">
              <label htmlFor="pause-reason" className="text-sm font-semibold text-slate-700">
                Motivo da pausa
              </label>
              <textarea
                id="pause-reason"
                value={pauseReason}
                onChange={(event) => setPauseReason(event.target.value)}
                rows={5}
                placeholder="Explique por que o anúncio está sendo pausado e o que o anunciante precisa ajustar."
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-emerald-300 focus:bg-white focus:ring-2 focus:ring-emerald-500/15"
              />
            </div>

            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <button
                type="button"
                onClick={closePauseModal}
                className="inline-flex h-11 items-center justify-center rounded-2xl border border-slate-200 px-5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void handleTogglePause(pauseTarget, pauseReason)}
                disabled={isSubmittingPause}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-amber-600 px-5 text-sm font-semibold text-white transition-colors hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <PauseCircle className="h-4 w-4" />
                {isSubmittingPause ? 'Pausando...' : 'Confirmar pausa'}
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedAnnouncement && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/45 backdrop-blur-[1px]">
          <div className="h-full w-full max-w-xl overflow-y-auto border-l border-slate-200 bg-white shadow-[0_0_60px_-30px_rgba(15,23,42,0.55)]">
            <div className="sticky top-0 z-10 border-b border-slate-100 bg-white/95 px-6 py-5 backdrop-blur">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Preview do anúncio</p>
                  <h3 className="mt-2 text-xl font-bold text-slate-900">{selectedAnnouncement.title}</h3>
                  <p className="mt-1 text-sm text-slate-500">
                    {selectedAnnouncement.owner?.name || 'Anunciante não identificado'} • {getCategoryLabel(selectedAnnouncement)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedAnnouncement(null)}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-700"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="space-y-6 px-6 py-6">
              <div className="overflow-hidden rounded-[24px] border border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] shadow-sm">
                <div className="aspect-[16/9] bg-slate-100">
                  {selectedAnnouncement.images?.[0] ? (
                    <img
                      src={selectedAnnouncement.images[0]}
                      alt={selectedAnnouncement.title}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-slate-400">
                      <AlertTriangle className="h-8 w-8" />
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Status</p>
                  <span className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass[selectedAnnouncement.status] || 'bg-slate-100 text-slate-700'}`}>
                    {statusLabel[selectedAnnouncement.status] || selectedAnnouncement.status}
                  </span>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Preço</p>
                  <p className="mt-2 text-lg font-bold text-slate-900">
                    {typeof selectedAnnouncement.price === 'number'
                      ? selectedAnnouncement.price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                      : 'Não informado'}
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Views</p>
                  <p className="mt-2 text-lg font-bold text-slate-900">{selectedAnnouncement.views || 0}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Leads / Conversas</p>
                  <p className="mt-2 text-lg font-bold text-slate-900">
                    {selectedAnnouncement.leadsCount || 0} / {selectedAnnouncement.messagesCount || 0}
                  </p>
                </div>
              </div>

              <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Descrição</p>
                <p className="mt-3 text-sm leading-6 text-slate-600">
                  {selectedAnnouncement.description?.trim() || 'Descrição não informada.'}
                </p>
              </div>

              <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Contexto operacional</p>
                <div className="mt-4 grid grid-cols-1 gap-3 text-sm text-slate-600">
                  <div className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3">
                    <span>Criado em</span>
                    <span className="font-semibold text-slate-900">
                      {new Date(selectedAnnouncement.created_at).toLocaleString('pt-BR')}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3">
                    <span>Expira em</span>
                    <span className="font-semibold text-slate-900">
                      {selectedAnnouncement.expires_at
                        ? new Date(selectedAnnouncement.expires_at).toLocaleDateString('pt-BR')
                        : 'Sem data'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3">
                    <span>Exposição</span>
                    <span className="font-semibold text-slate-900">
                      {selectedAnnouncement.highlight_home || selectedAnnouncement.highlight_category || selectedAnnouncement.isOfficialStore
                        ? [
                            selectedAnnouncement.highlight_home ? 'Home' : null,
                            selectedAnnouncement.highlight_category ? 'Categoria' : null,
                            selectedAnnouncement.isOfficialStore ? 'Loja Parceira' : null,
                          ]
                            .filter(Boolean)
                            .join(' • ')
                        : 'Padrão'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                {(selectedAnnouncement.status === 'ACTIVE' || selectedAnnouncement.status === 'PAUSED') && (
                  <button
                    type="button"
                    onClick={() => {
                      if (selectedAnnouncement.status === 'ACTIVE') {
                        openPauseModal(selectedAnnouncement);
                        return;
                      }
                      void handleTogglePause(selectedAnnouncement);
                    }}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
                  >
                    {selectedAnnouncement.status === 'ACTIVE' ? (
                      <>
                        <PauseCircle className="h-4 w-4" />
                        Pausar anúncio
                      </>
                    ) : (
                      <>
                        <PlayCircle className="h-4 w-4" />
                        Reativar anúncio
                      </>
                    )}
                  </button>
                )}

                <Link
                  to={`/admin/users?q=${encodeURIComponent(selectedAnnouncement.owner?.email || selectedAnnouncement.owner?.name || selectedAnnouncement.user_id)}`}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
                >
                  <UserRound className="h-4 w-4" />
                  Ver anunciante
                </Link>

                <Link
                  to={`/anuncio/${selectedAnnouncement.id}`}
                  target="_blank"
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white transition-colors hover:bg-slate-800"
                >
                  <Eye className="h-4 w-4" />
                  Abrir anúncio
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AnnouncementsMonitoring;
