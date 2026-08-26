import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDownAZ,
  ArrowUpAZ,
  BadgeCheck,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Download,
  ExternalLink,
  FileText,
  Handshake,
  Inbox,
  Loader2,
  LockKeyhole,
  Mail,
  MapPin,
  MessageSquare,
  Phone,
  RefreshCw,
  Search,
  TrendingUp,
  UserRound,
  Users,
  X,
  XCircle,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { format, formatDistanceToNow, subDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import { useAuth } from '../src/contexts/AuthContext';
import { supabase } from '../src/lib/supabaseClient';
import { isTimestampExpired, syncTrustedTime } from '../src/lib/trustedTime';
import { LEAD_STATUS } from '../constants/status';
import type { LeadStatus } from '../constants/status';
import {
  getLeadQualificationLevelLabel,
  getPaymentPreferenceLabel,
  getPurchaseTimelineLabel,
  getTradeInLabel,
  normalizeLeadQualification,
  type LeadQualification,
  type LeadQualificationLevel,
} from '../src/lib/leads/leadQualification';
import LeadProposalComposer from './leads/LeadProposalComposer';

const PAGE_SIZE = 30;

interface Lead {
  id: string;
  chat_id: string;
  announcement_id: string;
  buyer_id: string;
  seller_id: string;
  buyer_name: string;
  buyer_email: string;
  buyer_phone: string;
  buyer_cep: string;
  initial_message: string;
  status: LeadStatus;
  created_at: string;
  contact_expires_at?: string | null;
  is_locked?: boolean;
  announcement_title?: string;
  announcement_price?: number;
  announcement_image?: string;
  qualification?: LeadQualification | null;
}

type PeriodFilter = 'all' | '7' | '30' | '90';
type SortOrder = 'newest' | 'oldest';
type QualificationFilter = 'all' | LeadQualificationLevel;

const statusDisplayMap: Record<
  LeadStatus,
  { label: string; shortLabel: string; badge: string; dot: string; icon: React.ElementType }
> = {
  [LEAD_STATUS.NEW]: {
    label: 'Aguardando contato',
    shortLabel: 'Novos',
    badge: 'border-sky-200 bg-sky-50 text-sky-700',
    dot: 'bg-sky-500',
    icon: Clock3,
  },
  [LEAD_STATUS.CONTACTED]: {
    label: 'Em atendimento',
    shortLabel: 'Em atendimento',
    badge: 'border-amber-200 bg-amber-50 text-amber-700',
    dot: 'bg-amber-500',
    icon: Phone,
  },
  [LEAD_STATUS.NEGOTIATING]: {
    label: 'Negociando',
    shortLabel: 'Negociando',
    badge: 'border-cyan-200 bg-cyan-50 text-cyan-700',
    dot: 'bg-cyan-500',
    icon: TrendingUp,
  },
  [LEAD_STATUS.CLOSED]: {
    label: 'Negócio fechado',
    shortLabel: 'Fechados',
    badge: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    dot: 'bg-emerald-500',
    icon: CheckCircle2,
  },
  [LEAD_STATUS.LOST]: {
    label: 'Sem retorno',
    shortLabel: 'Sem retorno',
    badge: 'border-slate-200 bg-slate-100 text-slate-600',
    dot: 'bg-slate-400',
    icon: XCircle,
  },
};

const emptyStatusCounts = (): Record<LeadStatus, number> => ({
  [LEAD_STATUS.NEW]: 0,
  [LEAD_STATUS.CONTACTED]: 0,
  [LEAD_STATUS.NEGOTIATING]: 0,
  [LEAD_STATUS.CLOSED]: 0,
  [LEAD_STATUS.LOST]: 0,
});

const getStatusConfig = (status: LeadStatus | string | undefined | null) =>
  statusDisplayMap[status as LeadStatus] || statusDisplayMap[LEAD_STATUS.NEW];

const qualificationDisplayMap: Record<LeadQualificationLevel, { label: string; badge: string; dot: string }> = {
  qualified: {
    label: 'Qualificado',
    badge: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    dot: 'bg-emerald-500',
  },
  partial: {
    label: 'Parcial',
    badge: 'border-amber-200 bg-amber-50 text-amber-700',
    dot: 'bg-amber-500',
  },
  unqualified: {
    label: 'Nao informado',
    badge: 'border-slate-200 bg-slate-50 text-slate-500',
    dot: 'bg-slate-400',
  },
};

const getQualificationConfig = (lead: Lead) =>
  qualificationDisplayMap[lead.qualification?.level || 'unqualified'];

const formatCurrency = (value?: number) => {
  if (!value) return 'Valor a combinar';
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  }).format(value);
};

const csvCell = (value: unknown) => {
  const text = String(value ?? '').replace(/\r?\n/g, ' ').trim();
  const safe = /^[=+@-]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
};

const LeadsView: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const observerTarget = useRef<HTMLDivElement>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [statusCounts, setStatusCounts] = useState<Record<LeadStatus, number>>(emptyStatusCounts);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [updatingIds, setUpdatingIds] = useState<Set<string>>(new Set());
  const [filterStatus, setFilterStatus] = useState<'all' | LeadStatus>('all');
  const [qualificationFilter, setQualificationFilter] = useState<QualificationFilter>('all');
  const [period, setPeriod] = useState<PeriodFilter>('all');
  const [sortOrder, setSortOrder] = useState<SortOrder>('newest');
  const [search, setSearch] = useState('');
  const [bulkStatus, setBulkStatus] = useState<LeadStatus>(LEAD_STATUS.CONTACTED);

  const mapLead = (lead: any): Lead => {
    const isLocked = isTimestampExpired(lead.contact_expires_at);

    return {
      ...lead,
      is_locked: isLocked,
      announcement_title: lead.announcements?.title,
      announcement_price: lead.announcements?.price,
      announcement_image: lead.announcements?.images?.[0],
      // Remove dados protegidos da memoria antes de filtros, busca, CSV e UI.
      qualification: isLocked ? null : normalizeLeadQualification(lead.lead_qualifications),
    };
  };

  const fetchStatusCounts = useCallback(async () => {
    if (!user) return;
    const statuses = Object.values(LEAD_STATUS) as LeadStatus[];
    const results = await Promise.all(
      statuses.map((status) =>
        supabase
          .from('leads')
          .select('id', { count: 'exact', head: true })
          .eq('seller_id', user.id)
          .eq('status', status),
      ),
    );
    const next = emptyStatusCounts();
    results.forEach((result, index) => {
      if (!result.error) next[statuses[index]] = result.count || 0;
    });
    setStatusCounts(next);
  }, [user]);

  const fetchLeads = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    try {
      await syncTrustedTime();
      const [leadResult] = await Promise.all([
        supabase
          .from('leads')
          .select(
            `
              *,
              announcements (title, price, images),
              lead_qualifications (
                purchase_timeline,
                payment_preference,
                has_trade_in,
                purchase_need,
                qualification_score,
                qualification_level,
                updated_at
              )
            `,
            { count: 'exact' },
          )
          .eq('seller_id', user.id)
          .order('created_at', { ascending: false })
          .range(0, PAGE_SIZE - 1),
        fetchStatusCounts(),
      ]);
      if (leadResult.error) throw leadResult.error;
      const mapped = (leadResult.data || []).map(mapLead);
      setLeads(mapped);
      setPage(0);
      setTotalCount(leadResult.count || mapped.length);
      setHasMore(mapped.length < (leadResult.count || 0));
      setSelectedIds(new Set());
    } catch (error) {
      console.error('Erro ao buscar leads:', error);
      toast.error('Não foi possível carregar seus leads agora.');
    } finally {
      setIsLoading(false);
    }
  }, [fetchStatusCounts, user]);

  const loadMoreLeads = useCallback(async () => {
    if (!user || loadingMore || !hasMore) return;
    setLoadingMore(true);
    const nextPage = page + 1;
    try {
      const from = nextPage * PAGE_SIZE;
      const { data, error } = await supabase
        .from('leads')
        .select(`
          *,
          announcements (title, price, images),
          lead_qualifications (
            purchase_timeline,
            payment_preference,
            has_trade_in,
            purchase_need,
            qualification_score,
            qualification_level,
            updated_at
          )
        `)
        .eq('seller_id', user.id)
        .order('created_at', { ascending: false })
        .range(from, from + PAGE_SIZE - 1);
      if (error) throw error;
      const mapped = (data || []).map(mapLead);
      setLeads((current) => [...current, ...mapped]);
      setPage(nextPage);
      setHasMore(from + mapped.length < totalCount);
    } catch (error) {
      console.error('Erro ao carregar mais leads:', error);
      toast.error('Não foi possível carregar mais leads.');
    } finally {
      setLoadingMore(false);
    }
  }, [hasMore, loadingMore, page, totalCount, user]);

  useEffect(() => {
    void fetchLeads();
  }, [fetchLeads]);

  useEffect(() => {
    if (!observerTarget.current || !hasMore || filterStatus !== 'all' || qualificationFilter !== 'all' || search || period !== 'all') return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting && !loadingMore && !isLoading) void loadMoreLeads();
    });
    observer.observe(observerTarget.current);
    return () => observer.disconnect();
  }, [filterStatus, hasMore, isLoading, loadMoreLeads, loadingMore, period, qualificationFilter, search]);

  const updateLeadStatus = async (leadId: string, newStatus: LeadStatus) => {
    const currentLead = leads.find((lead) => lead.id === leadId);
    if (!currentLead || currentLead.status === newStatus) return;
    setUpdatingIds((current) => new Set(current).add(leadId));
    try {
      const { error } = await supabase
        .from('leads')
        .update({ status: newStatus })
        .eq('id', leadId)
        .eq('seller_id', user?.id);
      if (error) throw error;
      setLeads((current) => current.map((lead) => (lead.id === leadId ? { ...lead, status: newStatus } : lead)));
      setSelectedLead((current) => (current?.id === leadId ? { ...current, status: newStatus } : current));
      setStatusCounts((current) => ({
        ...current,
        [currentLead.status]: Math.max(0, current[currentLead.status] - 1),
        [newStatus]: current[newStatus] + 1,
      }));
      toast.success('Etapa comercial atualizada.');
    } catch (error) {
      console.error('Erro ao atualizar status:', error);
      toast.error('Não foi possível atualizar este lead.');
    } finally {
      setUpdatingIds((current) => {
        const next = new Set(current);
        next.delete(leadId);
        return next;
      });
    }
  };

  const applyBulkStatus = async () => {
    if (!selectedIds.size || !user) return;
    const ids = Array.from(selectedIds);
    setUpdatingIds(new Set(ids));
    try {
      const { error } = await supabase
        .from('leads')
        .update({ status: bulkStatus })
        .in('id', ids)
        .eq('seller_id', user.id);
      if (error) throw error;
      setLeads((current) => current.map((lead) => (selectedIds.has(lead.id) ? { ...lead, status: bulkStatus } : lead)));
      setSelectedLead((current) => (current && selectedIds.has(current.id) ? { ...current, status: bulkStatus } : current));
      setSelectedIds(new Set());
      await fetchStatusCounts();
      toast.success(`${ids.length} lead(s) atualizado(s).`);
    } catch (error) {
      console.error('Erro ao atualizar leads em massa:', error);
      toast.error('Não foi possível aplicar a ação em massa.');
    } finally {
      setUpdatingIds(new Set());
    }
  };

  const filteredLeads = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase('pt-BR');
    const cutoff = period === 'all' ? null : subDays(new Date(), Number(period));
    return leads
      .filter((lead) => filterStatus === 'all' || lead.status === filterStatus)
      .filter((lead) => qualificationFilter === 'all' || (lead.qualification?.level || 'unqualified') === qualificationFilter)
      .filter((lead) => !cutoff || new Date(lead.created_at) >= cutoff)
      .filter((lead) => {
        if (!normalizedSearch) return true;
        const qualificationValues = lead.is_locked
          ? []
          : [
              getPurchaseTimelineLabel(lead.qualification?.purchaseTimeline || null),
              getPaymentPreferenceLabel(lead.qualification?.paymentPreference || null),
              lead.qualification?.purchaseNeed,
            ];
        const searchableValues = lead.is_locked
          ? [lead.announcement_title]
          : [lead.buyer_name, lead.buyer_email, lead.buyer_phone, lead.announcement_title, lead.initial_message, ...qualificationValues];
        return searchableValues
          .filter(Boolean)
          .some((value) => String(value).toLocaleLowerCase('pt-BR').includes(normalizedSearch));
      })
      .sort((a, b) => {
        const delta = new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        return sortOrder === 'newest' ? delta : -delta;
      });
  }, [filterStatus, leads, period, qualificationFilter, search, sortOrder]);

  const selectableVisibleLeads = filteredLeads.filter((lead) => !lead.is_locked);
  const selectedVisibleCount = selectableVisibleLeads.filter((lead) => selectedIds.has(lead.id)).length;
  const allVisibleSelected = selectableVisibleLeads.length > 0 && selectedVisibleCount === selectableVisibleLeads.length;
  const activePipeline = statusCounts[LEAD_STATUS.CONTACTED] + statusCounts[LEAD_STATUS.NEGOTIATING];
  const conversionRate = totalCount ? (statusCounts[LEAD_STATUS.CLOSED] / totalCount) * 100 : 0;

  const toggleAllVisible = () => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (allVisibleSelected) selectableVisibleLeads.forEach((lead) => next.delete(lead.id));
      else selectableVisibleLeads.forEach((lead) => next.add(lead.id));
      return next;
    });
  };

  const exportCsv = () => {
    const rows = filteredLeads.map((lead) => [
      lead.is_locked ? 'Contato bloqueado' : lead.buyer_name,
      lead.is_locked ? 'Protegido pelo plano' : lead.buyer_email,
      lead.is_locked ? 'Protegido pelo plano' : lead.buyer_phone,
      lead.is_locked ? 'Protegido pelo plano' : lead.buyer_cep,
      getStatusConfig(lead.status).label,
      lead.announcement_title,
      lead.announcement_price || '',
      format(new Date(lead.created_at), 'dd/MM/yyyy HH:mm'),
      lead.is_locked ? 'Conteúdo protegido pelo plano' : lead.initial_message,
      lead.is_locked ? 'Protegido pelo plano' : getLeadQualificationLevelLabel(lead.qualification?.level || 'unqualified'),
      lead.is_locked ? 'Protegido pelo plano' : getPurchaseTimelineLabel(lead.qualification?.purchaseTimeline || null),
      lead.is_locked ? 'Protegido pelo plano' : getPaymentPreferenceLabel(lead.qualification?.paymentPreference || null),
      lead.is_locked ? 'Protegido pelo plano' : getTradeInLabel(lead.qualification?.hasTradeIn ?? null),
      lead.is_locked ? 'Protegido pelo plano' : lead.qualification?.purchaseNeed || 'Nao informado',
    ]);
    const header = ['Nome', 'E-mail', 'Telefone', 'CEP', 'Status', 'Produto', 'Valor', 'Data', 'Mensagem', 'Qualificacao', 'Prazo de compra', 'Pagamento', 'Item para troca', 'Necessidade'];
    const csv = [header, ...rows].map((row) => row.map(csvCell).join(';')).join('\r\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `leads-agro-bw-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const goToChat = (chatId: string) => navigate('/minha-conta/mensagens', { state: { chatId } });

  if (isLoading) {
    return (
      <div className="flex h-96 items-center justify-center rounded-3xl border border-slate-200 bg-white">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-8">
      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="relative px-5 py-6 sm:px-7">
          <div className="pointer-events-none absolute right-0 top-0 h-40 w-72 bg-[radial-gradient(circle_at_top_right,rgba(22,163,74,0.12),transparent_68%)]" />
          <div className="relative flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.22em] text-emerald-700">
                <Handshake className="h-3.5 w-3.5" /> Gestor comercial
              </div>
              <h1 className="text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">Leads dos seus anúncios</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
                Organize contatos, acompanhe negociações e responda compradores sem perder oportunidades.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => void fetchLeads()} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50">
                <RefreshCw className="h-4 w-4" /> Atualizar
              </button>
              <button onClick={exportCsv} disabled={!filteredLeads.length} className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-bold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40">
                <Download className="h-4 w-4" /> Exportar CSV
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {[
          { label: 'Total de leads', value: totalCount, helper: 'contatos recebidos', icon: Users, tone: 'text-slate-950', box: 'bg-white' },
          { label: 'Aguardando contato', value: statusCounts[LEAD_STATUS.NEW], helper: 'pedem resposta rápida', icon: Inbox, tone: 'text-sky-700', box: 'bg-sky-50/70' },
          { label: 'Pipeline ativo', value: activePipeline, helper: 'em atendimento ou negociação', icon: TrendingUp, tone: 'text-cyan-700', box: 'bg-cyan-50/70' },
          { label: 'Conversão', value: `${conversionRate.toFixed(1)}%`, helper: `${statusCounts[LEAD_STATUS.CLOSED]} negócios fechados`, icon: CheckCircle2, tone: 'text-emerald-700', box: 'bg-emerald-50/70' },
        ].map((item) => (
          <div key={item.label} className={`rounded-2xl border border-slate-200 p-4 shadow-sm sm:p-5 ${item.box}`}>
            <div className="flex items-center justify-between gap-3">
              <p className="text-[10px] font-black uppercase tracking-[0.17em] text-slate-500">{item.label}</p>
              <item.icon className={`h-4 w-4 ${item.tone}`} />
            </div>
            <p className={`mt-3 text-2xl font-black sm:text-3xl ${item.tone}`}>{item.value}</p>
            <p className="mt-1 hidden text-xs text-slate-500 sm:block">{item.helper}</p>
          </div>
        ))}
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 p-4 sm:p-5">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="relative w-full xl:max-w-md">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por nome, telefone, e-mail ou produto" className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-4 text-sm text-slate-800 outline-none transition focus:border-emerald-400 focus:bg-white focus:ring-4 focus:ring-emerald-50" />
            </div>
            <div className="flex flex-wrap gap-2">
              <div className="flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3">
                <CalendarDays className="h-4 w-4 text-slate-400" />
                <select value={period} onChange={(event) => setPeriod(event.target.value as PeriodFilter)} className="bg-transparent text-sm font-semibold text-slate-700 outline-none">
                  <option value="all">Todo o período</option>
                  <option value="7">Últimos 7 dias</option>
                  <option value="30">Últimos 30 dias</option>
                  <option value="90">Últimos 90 dias</option>
                </select>
              </div>
              <div className="flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3">
                <BadgeCheck className="h-4 w-4 text-slate-400" />
                <select value={qualificationFilter} onChange={(event) => setQualificationFilter(event.target.value as QualificationFilter)} className="bg-transparent text-sm font-semibold text-slate-700 outline-none">
                  <option value="all">Toda qualificacao</option>
                  <option value="qualified">Qualificados</option>
                  <option value="partial">Dados parciais</option>
                  <option value="unqualified">Nao informados</option>
                </select>
              </div>
              <button onClick={() => setSortOrder((current) => current === 'newest' ? 'oldest' : 'newest')} className="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 px-3 text-sm font-bold text-slate-700 hover:bg-slate-50">
                {sortOrder === 'newest' ? <ArrowDownAZ className="h-4 w-4" /> : <ArrowUpAZ className="h-4 w-4" />}
                {sortOrder === 'newest' ? 'Mais recentes' : 'Mais antigos'}
              </button>
            </div>
          </div>

          <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
            <button onClick={() => setFilterStatus('all')} className={`shrink-0 rounded-full border px-3.5 py-2 text-xs font-black transition ${filterStatus === 'all' ? 'border-slate-950 bg-slate-950 text-white' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}>
              Todos <span className="ml-1 opacity-70">{totalCount}</span>
            </button>
            {(Object.entries(statusDisplayMap) as [LeadStatus, (typeof statusDisplayMap)[LeadStatus]][]).map(([status, config]) => (
              <button key={status} onClick={() => setFilterStatus(status)} className={`shrink-0 rounded-full border px-3.5 py-2 text-xs font-black transition ${filterStatus === status ? config.badge : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}>
                {config.shortLabel} <span className="ml-1 opacity-70">{statusCounts[status]}</span>
              </button>
            ))}
          </div>
        </div>

        {selectedIds.size > 0 && (
          <div className="flex flex-col gap-3 border-b border-emerald-100 bg-emerald-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <p className="text-sm font-bold text-emerald-800">{selectedIds.size} lead(s) selecionado(s)</p>
            <div className="flex gap-2">
              <select value={bulkStatus} onChange={(event) => setBulkStatus(event.target.value as LeadStatus)} className="min-w-0 flex-1 rounded-lg border border-emerald-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 sm:min-w-48">
                {(Object.entries(statusDisplayMap) as [LeadStatus, (typeof statusDisplayMap)[LeadStatus]][]).map(([status, config]) => <option key={status} value={status}>{config.label}</option>)}
              </select>
              <button onClick={() => void applyBulkStatus()} className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-black text-white hover:bg-emerald-700">Aplicar</button>
              <button onClick={() => setSelectedIds(new Set())} className="rounded-lg border border-emerald-200 bg-white px-3 py-2 text-xs font-bold text-emerald-800">Limpar</button>
            </div>
          </div>
        )}

        {filteredLeads.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100"><Search className="h-6 w-6 text-slate-400" /></div>
            <h3 className="mt-4 font-black text-slate-900">Nenhum lead encontrado</h3>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">Ajuste os filtros ou aguarde novos compradores entrarem em contato com seus anúncios.</p>
          </div>
        ) : (
          <>
            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full min-w-[980px] table-fixed">
                <thead className="bg-slate-50/80 text-left">
                  <tr className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">
                    <th className="w-12 px-5 py-4"><input type="checkbox" checked={allVisibleSelected} onChange={toggleAllVisible} className="h-4 w-4 rounded border-slate-300 accent-emerald-600" /></th>
                    <th className="w-[22%] px-3 py-4">Dados do lead</th>
                    <th className="w-[19%] px-3 py-4">Status</th>
                    <th className="w-[27%] px-3 py-4">Produto</th>
                    <th className="w-[14%] px-3 py-4">Valor</th>
                    <th className="w-[12%] px-3 py-4">Data</th>
                    <th className="w-16 px-3 py-4 text-center">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredLeads.map((lead) => {
                    const isLocked = !!lead.is_locked;
                    const config = getStatusConfig(lead.status);
                    return (
                      <tr key={lead.id} className="group transition hover:bg-emerald-50/30">
                        <td className="px-5 py-4 align-middle"><input type="checkbox" disabled={isLocked} checked={selectedIds.has(lead.id)} onChange={() => setSelectedIds((current) => { const next = new Set(current); next.has(lead.id) ? next.delete(lead.id) : next.add(lead.id); return next; })} className="h-4 w-4 rounded border-slate-300 accent-emerald-600 disabled:cursor-not-allowed disabled:opacity-30" /></td>
                        <td className="px-3 py-4 align-middle">
                          <button onClick={() => setSelectedLead(lead)} className="w-full text-left">
                            <div className="flex items-center gap-3">
                              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-black text-slate-600">{isLocked ? <LockKeyhole className="h-4 w-4" /> : (lead.buyer_name || '?').slice(0, 1).toUpperCase()}</div>
                              <div className="min-w-0">
                                <p className="truncate text-sm font-black text-slate-900">{isLocked ? 'Contato bloqueado' : lead.buyer_name}</p>
                                <p className="mt-0.5 truncate text-xs text-slate-500">{isLocked ? 'Dados protegidos pelo plano' : lead.buyer_phone || lead.buyer_email}</p>
                                {!isLocked && (
                                  <span className={`mt-2 inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-wide ${getQualificationConfig(lead).badge}`}>
                                    <span className={`h-1.5 w-1.5 rounded-full ${getQualificationConfig(lead).dot}`} />
                                    {getQualificationConfig(lead).label}
                                  </span>
                                )}
                              </div>
                            </div>
                          </button>
                        </td>
                        <td className="px-3 py-4 align-middle">
                          <select value={lead.status} disabled={isLocked || updatingIds.has(lead.id)} onChange={(event) => void updateLeadStatus(lead.id, event.target.value as LeadStatus)} className={`w-full rounded-xl border px-3 py-2 text-xs font-black outline-none disabled:cursor-not-allowed disabled:opacity-60 ${config.badge}`}>
                            {(Object.entries(statusDisplayMap) as [LeadStatus, (typeof statusDisplayMap)[LeadStatus]][]).map(([status, option]) => <option key={status} value={status}>{option.label}</option>)}
                          </select>
                        </td>
                        <td className="px-3 py-4 align-middle">
                          <button onClick={() => setSelectedLead(lead)} className="flex w-full items-center gap-3 text-left">
                            <div className="h-12 w-16 shrink-0 overflow-hidden rounded-lg bg-slate-100">{lead.announcement_image ? <img src={lead.announcement_image} alt="" className="h-full w-full object-cover" /> : <FileText className="m-auto mt-4 h-4 w-4 text-slate-400" />}</div>
                            <div className="min-w-0"><p className="line-clamp-2 text-sm font-bold leading-5 text-slate-800">{lead.announcement_title || 'Anúncio indisponível'}</p><p className="mt-0.5 text-xs text-slate-400">AGRO BW</p></div>
                          </button>
                        </td>
                        <td className="px-3 py-4 align-middle"><p className="text-sm font-black text-slate-900">{formatCurrency(lead.announcement_price)}</p><p className="text-[10px] uppercase tracking-wider text-slate-400">Interesse de compra</p></td>
                        <td className="px-3 py-4 align-middle"><p className="text-sm font-bold text-slate-700">{format(new Date(lead.created_at), 'dd/MM/yyyy')}</p><p className="mt-0.5 text-xs text-slate-400">{format(new Date(lead.created_at), 'HH:mm')}</p></td>
                        <td className="px-3 py-4 text-center align-middle"><button onClick={() => setSelectedLead(lead)} aria-label="Ver detalhes do lead" className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700"><ChevronRight className="h-4 w-4" /></button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="divide-y divide-slate-100 lg:hidden">
              {filteredLeads.map((lead) => {
                const config = getStatusConfig(lead.status);
                const isLocked = !!lead.is_locked;
                return (
                  <article key={lead.id} className="p-4">
                    <div className="flex items-start gap-3">
                      <input type="checkbox" disabled={isLocked} checked={selectedIds.has(lead.id)} onChange={() => setSelectedIds((current) => { const next = new Set(current); next.has(lead.id) ? next.delete(lead.id) : next.add(lead.id); return next; })} className="mt-1 h-4 w-4 rounded accent-emerald-600 disabled:cursor-not-allowed disabled:opacity-30" />
                      <button onClick={() => setSelectedLead(lead)} className="min-w-0 flex-1 text-left">
                        <div className="flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="truncate font-black text-slate-900">{isLocked ? 'Contato bloqueado' : lead.buyer_name}</h3><p className="mt-1 line-clamp-1 text-xs text-slate-500">{lead.announcement_title}</p></div><span className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-black ${config.badge}`}>{config.shortLabel}</span></div>
                        {!isLocked && (
                          <span className={`mt-2 inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-wide ${getQualificationConfig(lead).badge}`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${getQualificationConfig(lead).dot}`} />
                            {getQualificationConfig(lead).label}
                          </span>
                        )}
                        <div className="mt-3 flex items-center gap-3 rounded-xl bg-slate-50 p-3"><div className="h-12 w-16 shrink-0 overflow-hidden rounded-lg bg-slate-200">{lead.announcement_image && <img src={lead.announcement_image} alt="" className="h-full w-full object-cover" />}</div><div className="min-w-0"><p className="truncate text-sm font-bold text-slate-800">{formatCurrency(lead.announcement_price)}</p><p className="mt-1 text-xs text-slate-400">{format(new Date(lead.created_at), "dd 'de' MMM, HH:mm", { locale: ptBR })}</p></div></div>
                      </button>
                    </div>
                    <div className="mt-3 flex gap-2 pl-7"><select value={lead.status} disabled={isLocked || updatingIds.has(lead.id)} onChange={(event) => void updateLeadStatus(lead.id, event.target.value as LeadStatus)} className={`min-w-0 flex-1 rounded-xl border px-3 py-2 text-xs font-black disabled:cursor-not-allowed disabled:opacity-60 ${config.badge}`}>{(Object.entries(statusDisplayMap) as [LeadStatus, (typeof statusDisplayMap)[LeadStatus]][]).map(([status, option]) => <option key={status} value={status}>{option.label}</option>)}</select><button onClick={() => setSelectedLead(lead)} className="rounded-xl border border-slate-200 px-3 text-slate-600"><ChevronRight className="h-4 w-4" /></button></div>
                  </article>
                );
              })}
            </div>
          </>
        )}

        <div className="flex flex-col items-center justify-between gap-3 border-t border-slate-100 px-5 py-4 sm:flex-row">
          <p className="text-xs text-slate-500">Exibindo {filteredLeads.length} de {totalCount} lead(s)</p>
          {hasMore && <button onClick={() => void loadMoreLeads()} disabled={loadingMore} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-xs font-black text-slate-700 hover:bg-slate-50 disabled:opacity-50">{loadingMore && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Carregar mais</button>}
          <div ref={observerTarget} className="h-px w-px" />
        </div>
      </section>

      {selectedLead && (
        <div className="fixed inset-0 z-[70] flex justify-end bg-slate-950/35 backdrop-blur-[2px]" onMouseDown={(event) => { if (event.currentTarget === event.target) setSelectedLead(null); }}>
          <aside className="h-full w-full max-w-lg overflow-y-auto bg-white shadow-2xl">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white/95 px-5 py-4 backdrop-blur">
              <div><p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-700">Detalhes do lead</p><h2 className="mt-1 text-lg font-black text-slate-950">Oportunidade comercial</h2></div>
              <button onClick={() => setSelectedLead(null)} className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200"><X className="h-5 w-5" /></button>
            </div>
            <div className="space-y-5 p-5 sm:p-6">
              <div className="rounded-2xl bg-slate-950 p-5 text-white">
                <div className="flex items-start justify-between gap-4"><div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10"><UserRound className="h-6 w-6 text-emerald-300" /></div><span className={`rounded-full border px-3 py-1.5 text-xs font-black ${getStatusConfig(selectedLead.status).badge}`}>{getStatusConfig(selectedLead.status).label}</span></div>
                <h3 className="mt-5 text-xl font-black">{selectedLead.is_locked ? 'Contato bloqueado' : selectedLead.buyer_name}</h3>
                <p className="mt-1 text-sm text-slate-400">Lead recebido {formatDistanceToNow(new Date(selectedLead.created_at), { addSuffix: true, locale: ptBR })}</p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  { icon: Mail, label: 'E-mail', value: selectedLead.is_locked ? 'Protegido pelo plano' : selectedLead.buyer_email },
                  { icon: Phone, label: 'Telefone', value: selectedLead.is_locked ? 'Protegido pelo plano' : selectedLead.buyer_phone || 'Não informado' },
                  { icon: MapPin, label: 'CEP', value: selectedLead.is_locked ? 'Protegido pelo plano' : selectedLead.buyer_cep || 'Não informado' },
                  { icon: CalendarDays, label: 'Recebido em', value: format(new Date(selectedLead.created_at), 'dd/MM/yyyy, HH:mm') },
                ].map((item) => <div key={item.label} className="rounded-2xl border border-slate-200 p-4"><item.icon className="h-4 w-4 text-emerald-600" /><p className="mt-3 text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">{item.label}</p><p className="mt-1 break-words text-sm font-bold text-slate-800">{item.value}</p></div>)}
              </div>

              <div className="rounded-2xl border border-slate-200 p-4">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Produto de interesse</p>
                <div className="mt-3 flex gap-3"><div className="h-20 w-24 shrink-0 overflow-hidden rounded-xl bg-slate-100">{selectedLead.announcement_image ? <img src={selectedLead.announcement_image} alt="" className="h-full w-full object-cover" /> : <ExternalLink className="m-auto mt-7 h-5 w-5 text-slate-400" />}</div><div className="min-w-0"><p className="line-clamp-2 font-black text-slate-900">{selectedLead.announcement_title || 'Anúncio indisponível'}</p><p className="mt-2 text-sm font-black text-emerald-700">{formatCurrency(selectedLead.announcement_price)}</p></div></div>
              </div>

              <div className="rounded-2xl border border-slate-200 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Qualificacao da oportunidade</p>
                    <p className="mt-1 text-xs text-slate-500">Informacoes declaradas pelo comprador.</p>
                  </div>
                  {!selectedLead.is_locked && (
                    <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[9px] font-black uppercase tracking-wide ${getQualificationConfig(selectedLead).badge}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${getQualificationConfig(selectedLead).dot}`} />
                      {getQualificationConfig(selectedLead).label}
                    </span>
                  )}
                </div>

                {selectedLead.is_locked ? (
                  <p className="mt-4 text-sm leading-6 text-slate-500">Os dados de qualificacao estao protegidos conforme a regra vigente do plano.</p>
                ) : selectedLead.qualification ? (
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    {[
                      { label: 'Prazo de compra', value: getPurchaseTimelineLabel(selectedLead.qualification.purchaseTimeline) },
                      { label: 'Pagamento', value: getPaymentPreferenceLabel(selectedLead.qualification.paymentPreference) },
                      { label: 'Item para troca', value: getTradeInLabel(selectedLead.qualification.hasTradeIn) },
                      { label: 'Respostas', value: `${selectedLead.qualification.score} de 4` },
                    ].map((item) => (
                      <div key={item.label} className="rounded-xl bg-slate-50 p-3">
                        <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">{item.label}</p>
                        <p className="mt-1 text-sm font-bold text-slate-800">{item.value}</p>
                      </div>
                    ))}
                    {selectedLead.qualification.purchaseNeed && (
                      <div className="rounded-xl bg-slate-50 p-3 sm:col-span-2">
                        <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">Necessidade informada</p>
                        <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{selectedLead.qualification.purchaseNeed}</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="mt-4 text-sm leading-6 text-slate-500">O comprador nao preencheu o questionario opcional.</p>
                )}
              </div>

              <div className="rounded-2xl border border-slate-200 p-4">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Mensagem inicial</p>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-600">{selectedLead.is_locked ? 'Os dados deste contato estão bloqueados conforme a regra vigente do plano.' : selectedLead.initial_message || 'Nenhuma mensagem informada.'}</p>
              </div>

              <LeadProposalComposer
                leadId={selectedLead.id}
                isLocked={selectedLead.is_locked}
                onOpenChat={() => goToChat(selectedLead.chat_id)}
              />

              <div className="rounded-2xl border border-slate-200 p-4">
                <label className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Etapa comercial</label>
                <select value={selectedLead.status} disabled={selectedLead.is_locked || updatingIds.has(selectedLead.id)} onChange={(event) => void updateLeadStatus(selectedLead.id, event.target.value as LeadStatus)} className={`mt-3 w-full rounded-xl border px-3 py-3 text-sm font-black disabled:cursor-not-allowed disabled:opacity-60 ${getStatusConfig(selectedLead.status).badge}`}>{(Object.entries(statusDisplayMap) as [LeadStatus, (typeof statusDisplayMap)[LeadStatus]][]).map(([status, option]) => <option key={status} value={status}>{option.label}</option>)}</select>
              </div>

              <button onClick={() => goToChat(selectedLead.chat_id)} disabled={selectedLead.is_locked} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-5 py-3.5 text-sm font-black text-white shadow-lg shadow-emerald-100 transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"><MessageSquare className="h-4 w-4" />{selectedLead.is_locked ? 'Contato indisponível' : 'Abrir conversa'}</button>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
};

export default LeadsView;
