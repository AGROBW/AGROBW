import React, { useEffect, useMemo, useState } from 'react';
import {
  ChevronDown,
  Copy,
  Filter,
  PauseCircle,
  PlayCircle,
  RotateCcw,
  Save,
  Search,
  Trash2,
  UserPlus,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../../src/lib/supabaseClient';
import { useAuth } from '../../src/contexts/AuthContext';
import { appError } from '../../src/utils/appLogger';

type InviteCampaignStatus = 'active' | 'inactive';

interface InviteCampaignRecord {
  id: string;
  code: string;
  captor_name: string;
  captor_email?: string | null;
  notes?: string | null;
  status: InviteCampaignStatus;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
}

interface InviteVisitRecord {
  id: string;
  invite_campaign_id: string;
  session_id: string;
  landing_path: string;
  registered_user_id?: string | null;
  created_at: string;
}

interface InvitedUserRecord {
  id: string;
  invite_campaign_id: string;
  invite_code?: string | null;
  invite_attribution_at?: string | null;
  created_at: string;
}

interface InviteCampaignRow extends InviteCampaignRecord {
  lifetime_visits_count: number;
  lifetime_registrations_count: number;
  period_visits_count: number;
  period_registrations_count: number;
  last_visit_at?: string | null;
  last_registration_at?: string | null;
  conversion_rate: number;
}

const emptyForm = {
  id: null as string | null,
  captorName: '',
  captorEmail: '',
  notes: '',
  status: 'active' as InviteCampaignStatus,
};

const statusLabelMap: Record<InviteCampaignStatus, string> = {
  active: 'Ativo',
  inactive: 'Inativo',
};

const formatDateTime = (value?: string | null) => {
  if (!value) return 'Sem dados';

  return new Date(value).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const getTodayDateOnly = () => new Date().toISOString().slice(0, 10);

const addDaysDateOnly = (dateOnly: string, days: number) => {
  const date = new Date(`${dateOnly}T12:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
};

const getDateOnlyFromIso = (value?: string | null) => {
  if (!value) return null;
  return new Date(value).toISOString().slice(0, 10);
};

const InviteCampaignsManagement: React.FC = () => {
  const { user } = useAuth();
  const [campaigns, setCampaigns] = useState<InviteCampaignRecord[]>([]);
  const [visits, setVisits] = useState<InviteVisitRecord[]>([]);
  const [invitedUsers, setInvitedUsers] = useState<InvitedUserRecord[]>([]);
  const [form, setForm] = useState({ ...emptyForm });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | InviteCampaignStatus>('all');
  const [selectedCampaignFilter, setSelectedCampaignFilter] = useState<'all' | string>('all');
  const [dateFrom, setDateFrom] = useState(addDaysDateOnly(getTodayDateOnly(), -30));
  const [dateTo, setDateTo] = useState(getTodayDateOnly());
  const [expandedInviteIds, setExpandedInviteIds] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [invitePendingDelete, setInvitePendingDelete] = useState<InviteCampaignRow | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const pageSize = 5;

  const baseUrl = typeof window !== 'undefined' ? window.location.origin.replace(/\/$/, '') : '';

  const isWithinPeriod = (value?: string | null) => {
    const dateOnly = getDateOnlyFromIso(value);
    if (!dateOnly) return false;
    if (dateFrom && dateOnly < dateFrom) return false;
    if (dateTo && dateOnly > dateTo) return false;
    return true;
  };

  const campaignRows = useMemo<InviteCampaignRow[]>(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    const rows = campaigns.map((campaign) => {
      const campaignVisits = visits.filter((item) => item.invite_campaign_id === campaign.id);
      const campaignRegistrations = invitedUsers.filter((item) => item.invite_campaign_id === campaign.id);
      const periodVisits = campaignVisits.filter((item) => isWithinPeriod(item.created_at));
      const periodRegistrations = campaignRegistrations.filter((item) =>
        isWithinPeriod(item.invite_attribution_at || item.created_at),
      );

      const sortedVisits = [...campaignVisits].sort((a, b) => b.created_at.localeCompare(a.created_at));
      const sortedRegistrations = [...campaignRegistrations].sort((a, b) =>
        (b.invite_attribution_at || b.created_at).localeCompare(a.invite_attribution_at || a.created_at),
      );

      return {
        ...campaign,
        lifetime_visits_count: campaignVisits.length,
        lifetime_registrations_count: campaignRegistrations.length,
        period_visits_count: periodVisits.length,
        period_registrations_count: periodRegistrations.length,
        last_visit_at: sortedVisits[0]?.created_at || null,
        last_registration_at: sortedRegistrations[0]?.invite_attribution_at || sortedRegistrations[0]?.created_at || null,
        conversion_rate: periodVisits.length > 0 ? Number(((periodRegistrations.length / periodVisits.length) * 100).toFixed(1)) : 0,
      };
    });

    return rows.filter((row) => {
      if (statusFilter !== 'all' && row.status !== statusFilter) {
        return false;
      }

      if (selectedCampaignFilter !== 'all' && row.id !== selectedCampaignFilter) {
        return false;
      }

      if (!normalizedSearch) {
        return true;
      }

      const haystack = [row.captor_name, row.captor_email || '', row.code, row.notes || ''].join(' ').toLowerCase();
      return haystack.includes(normalizedSearch);
    });
  }, [campaigns, visits, invitedUsers, searchTerm, statusFilter, selectedCampaignFilter, dateFrom, dateTo]);

  const stats = useMemo(() => {
    return campaignRows.reduce(
      (acc, item) => {
        acc.total += 1;
        acc.periodVisits += item.period_visits_count;
        acc.periodRegistrations += item.period_registrations_count;
        acc.lifetimeVisits += item.lifetime_visits_count;
        acc.lifetimeRegistrations += item.lifetime_registrations_count;
        if (item.status === 'active') {
          acc.active += 1;
        }
        return acc;
      },
      {
        total: 0,
        active: 0,
        periodVisits: 0,
        periodRegistrations: 0,
        lifetimeVisits: 0,
        lifetimeRegistrations: 0,
      },
    );
  }, [campaignRows]);

  const periodConversionRate =
    stats.periodVisits > 0 ? Number(((stats.periodRegistrations / stats.periodVisits) * 100).toFixed(1)) : 0;

  const totalPages = Math.max(1, Math.ceil(campaignRows.length / pageSize));
  const paginatedRows = campaignRows.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const buildInviteLink = (code: string) => `${baseUrl}/cadastro?invite=${encodeURIComponent(code)}`;

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [campaignsResult, visitsResult, usersResult] = await Promise.all([
        supabase
          .from('invite_campaigns')
          .select('id,code,captor_name,captor_email,notes,status,created_by,created_at,updated_at')
          .order('created_at', { ascending: false }),
        supabase
          .from('invite_visits')
          .select('id,invite_campaign_id,session_id,landing_path,registered_user_id,created_at')
          .order('created_at', { ascending: false }),
        supabase
          .from('users')
          .select('id,invite_campaign_id,invite_code,invite_attribution_at,created_at')
          .not('invite_campaign_id', 'is', null),
      ]);

      if (campaignsResult.error) throw campaignsResult.error;
      if (visitsResult.error) throw visitsResult.error;
      if (usersResult.error) throw usersResult.error;

      setCampaigns((campaignsResult.data || []) as InviteCampaignRecord[]);
      setVisits((visitsResult.data || []) as InviteVisitRecord[]);
      setInvitedUsers((usersResult.data || []) as InvitedUserRecord[]);
    } catch (error) {
      appError('[InviteCampaignsManagement] Erro ao carregar convites e metricas', error);
      toast.error('Nao foi possivel carregar as metricas de captacao agora.');
      setCampaigns([]);
      setVisits([]);
      setInvitedUsers([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter, selectedCampaignFilter, dateFrom, dateTo]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const handleSelect = (row: InviteCampaignRow) => {
    setForm({
      id: row.id,
      captorName: row.captor_name,
      captorEmail: row.captor_email || '',
      notes: row.notes || '',
      status: row.status,
    });
  };

  const handleReset = () => {
    setForm({ ...emptyForm });
  };

  const handleResetFilters = () => {
    setSearchTerm('');
    setStatusFilter('all');
    setSelectedCampaignFilter('all');
    setDateFrom(addDaysDateOnly(getTodayDateOnly(), -30));
    setDateTo(getTodayDateOnly());
  };

  const toggleInviteExpanded = (inviteId: string) => {
    setExpandedInviteIds((current) =>
      current.includes(inviteId) ? current.filter((id) => id !== inviteId) : [...current, inviteId],
    );
  };

  const handleSave = async () => {
    if (!form.captorName.trim()) {
      toast.error('Informe o nome do captador.');
      return;
    }

    setIsSaving(true);
    try {
      if (form.id) {
        const { error } = await supabase
          .from('invite_campaigns')
          .update({
            captor_name: form.captorName.trim(),
            captor_email: form.captorEmail.trim() || null,
            notes: form.notes.trim() || null,
            status: form.status,
          })
          .eq('id', form.id);

        if (error) throw error;
        toast.success('Convite atualizado com sucesso.');
      } else {
        const { error } = await supabase.from('invite_campaigns').insert({
          captor_name: form.captorName.trim(),
          captor_email: form.captorEmail.trim() || null,
          notes: form.notes.trim() || null,
          status: form.status,
          created_by: user?.id || null,
        });

        if (error) throw error;
        toast.success('Convite criado com sucesso.');
      }

      handleReset();
      await loadData();
    } catch (error) {
      appError('[InviteCampaignsManagement] Erro ao salvar convite', error, { inviteId: form.id || undefined });
      toast.error('Nao foi possivel salvar o convite.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleStatus = async (row: InviteCampaignRow) => {
    const nextStatus: InviteCampaignStatus = row.status === 'active' ? 'inactive' : 'active';

    try {
      const { error } = await supabase.from('invite_campaigns').update({ status: nextStatus }).eq('id', row.id);

      if (error) throw error;

      toast.success(nextStatus === 'active' ? 'Convite ativado.' : 'Convite pausado.');
      await loadData();

      if (form.id === row.id) {
        setForm((current) => ({ ...current, status: nextStatus }));
      }
    } catch (error) {
      appError('[InviteCampaignsManagement] Erro ao alterar status do convite', error, { inviteId: row.id, nextStatus });
      toast.error('Nao foi possivel atualizar o status.');
    }
  };

  const handleDelete = async (row: InviteCampaignRow) => {
    setInvitePendingDelete(row);
  };

  const handleConfirmDelete = async () => {
    if (!invitePendingDelete) return;

    setIsDeleting(true);
    try {
      const { error } = await supabase.from('invite_campaigns').delete().eq('id', invitePendingDelete.id);

      if (error) throw error;

      toast.success('Convite excluido com sucesso.');

      if (form.id === invitePendingDelete.id) {
        handleReset();
      }

      setInvitePendingDelete(null);
      await loadData();
    } catch (error) {
      appError('[InviteCampaignsManagement] Erro ao excluir convite', error, { inviteId: invitePendingDelete.id });
      toast.error('Nao foi possivel excluir o convite.');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleCopyLink = async (code: string) => {
    try {
      await navigator.clipboard.writeText(buildInviteLink(code));
      toast.success('Link copiado com sucesso.');
    } catch {
      toast.error('Nao foi possivel copiar o link agora.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-[28px] border border-slate-200 bg-[linear-gradient(135deg,#ffffff_0%,#f8fafc_72%,rgba(22,163,74,0.08)_100%)] p-6 shadow-[0_24px_60px_-42px_rgba(15,23,42,0.4)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.28em] text-emerald-700">
              Convites e captacao
            </div>
            <div>
              <h2 className="text-2xl font-black text-slate-950">Links de convite com performance por periodo</h2>
              <p className="max-w-3xl text-sm leading-6 text-slate-500">
                Agora o painel mostra visitas, cadastros e conversao por intervalo de datas, com filtros por captador, campanha e status.
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
              <p className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-500">Convites</p>
              <p className="mt-2 text-2xl font-black text-slate-950">{stats.total}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
              <p className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-500">Ativos</p>
              <p className="mt-2 text-2xl font-black text-slate-950">{stats.active}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
              <p className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-500">Visitas no periodo</p>
              <p className="mt-2 text-2xl font-black text-slate-950">{stats.periodVisits}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
              <p className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-500">Cadastros no periodo</p>
              <p className="mt-2 text-2xl font-black text-slate-950">{stats.periodRegistrations}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
              <p className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-500">Conversao</p>
              <p className="mt-2 text-2xl font-black text-slate-950">{periodConversionRate}%</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.35fr]">
        <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_24px_60px_-42px_rgba(15,23,42,0.4)]">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.28em] text-slate-500">Configuracao</p>
              <h3 className="mt-1 text-lg font-black text-slate-950">{form.id ? 'Editar convite' : 'Novo convite'}</h3>
            </div>
            {form.id ? (
              <button
                type="button"
                onClick={handleReset}
                className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
              >
                Novo
              </button>
            ) : null}
          </div>

          <div className="mt-6 space-y-4">
            <label className="block space-y-2">
              <span className="text-sm font-semibold text-slate-700">Nome do captador</span>
              <input
                type="text"
                value={form.captorName}
                onChange={(event) => setForm((current) => ({ ...current, captorName: event.target.value }))}
                placeholder="Ex.: Joao Silva"
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-400"
              />
            </label>

            <label className="block space-y-2">
              <span className="text-sm font-semibold text-slate-700">E-mail do captador</span>
              <input
                type="email"
                value={form.captorEmail}
                onChange={(event) => setForm((current) => ({ ...current, captorEmail: event.target.value }))}
                placeholder="Opcional"
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-400"
              />
            </label>

            <label className="block space-y-2">
              <span className="text-sm font-semibold text-slate-700">Observacoes</span>
              <textarea
                value={form.notes}
                onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
                rows={4}
                placeholder="Canal, campanha ou observacoes internas"
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-400"
              />
            </label>

            <label className="block space-y-2">
              <span className="text-sm font-semibold text-slate-700">Status</span>
              <select
                value={form.status}
                onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as InviteCampaignStatus }))}
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-400"
              >
                <option value="active">Ativo</option>
                <option value="inactive">Inativo</option>
              </select>
            </label>

            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-bold text-white shadow-[0_20px_45px_-28px_rgba(15,23,42,0.85)] transition hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Save className="h-4 w-4" />
              {isSaving ? 'Salvando...' : form.id ? 'Salvar alteracoes' : 'Criar convite'}
            </button>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_24px_60px_-42px_rgba(15,23,42,0.4)]">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.28em] text-slate-500">Filtros</p>
                <h3 className="mt-1 text-lg font-black text-slate-950">Captador, campanha e periodo</h3>
              </div>
              <button
                type="button"
                onClick={handleResetFilters}
                className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
              >
                <RotateCcw className="h-4 w-4" />
                Limpar
              </button>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              <label className="block space-y-2 xl:col-span-2">
                <span className="text-sm font-semibold text-slate-700">Captador</span>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    placeholder="Buscar por nome, e-mail, codigo..."
                    className="w-full rounded-2xl border border-slate-200 py-3 pl-10 pr-4 text-sm text-slate-900 outline-none transition focus:border-emerald-400"
                  />
                </div>
              </label>

              <label className="block space-y-2">
                <span className="text-sm font-semibold text-slate-700">Campanha</span>
                <select
                  value={selectedCampaignFilter}
                  onChange={(event) => setSelectedCampaignFilter(event.target.value as 'all' | string)}
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-400"
                >
                  <option value="all">Todas</option>
                  {campaigns.map((campaign) => (
                    <option key={campaign.id} value={campaign.id}>
                      {campaign.captor_name} - {campaign.code}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block space-y-2">
                <span className="text-sm font-semibold text-slate-700">Status</span>
                <select
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value as 'all' | InviteCampaignStatus)}
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-400"
                >
                  <option value="all">Todos</option>
                  <option value="active">Ativos</option>
                  <option value="inactive">Inativos</option>
                </select>
              </label>

              <div className="grid gap-4 sm:grid-cols-2 xl:col-span-5">
                <label className="block space-y-2">
                  <span className="text-sm font-semibold text-slate-700">De</span>
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(event) => setDateFrom(event.target.value)}
                    className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-400"
                  />
                </label>
                <label className="block space-y-2">
                  <span className="text-sm font-semibold text-slate-700">Ate</span>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(event) => setDateTo(event.target.value)}
                    className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-400"
                  />
                </label>
              </div>
            </div>
          </div>

          <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_24px_60px_-42px_rgba(15,23,42,0.4)]">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.28em] text-slate-500">Convites ativos e historico</p>
                <h3 className="mt-1 text-lg font-black text-slate-950">Lista filtrada de captadores</h3>
              </div>
              <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">
                <Filter className="h-3.5 w-3.5" />
                {campaignRows.length} item(ns)
              </div>
            </div>

            <div className="mt-6 space-y-4">
              {isLoading ? (
                <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                  Carregando convites...
                </div>
              ) : campaignRows.length === 0 ? (
                <div className="rounded-[24px] border border-dashed border-slate-300 bg-slate-50/70 p-5 text-sm leading-6 text-slate-500">
                  Nenhum convite encontrado com os filtros selecionados.
                </div>
              ) : (
                paginatedRows.map((row) => {
                  const isExpanded = expandedInviteIds.includes(row.id);

                  return (
                  <div
                    key={row.id}
                    className="rounded-[24px] border border-slate-200 bg-white p-5 transition hover:border-slate-300 hover:bg-slate-50"
                  >
                    <div className="flex flex-col gap-4">
                      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-base font-black text-slate-950">{row.captor_name}</p>
                          <span
                            className={`inline-flex items-center rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] ${
                              row.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
                            }`}
                          >
                            {statusLabelMap[row.status]}
                          </span>
                          <span className="text-sm font-semibold text-slate-500">{row.code}</span>
                        </div>

                        <button
                          type="button"
                          onClick={() => toggleInviteExpanded(row.id)}
                          className="inline-flex items-center gap-2 self-start rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                        >
                          {isExpanded ? 'Recolher' : 'Expandir'}
                          <ChevronDown className={`h-4 w-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                        </button>
                      </div>

                      {isExpanded ? (
                        <div className="grid gap-5 xl:grid-cols-[280px_minmax(0,1fr)]">
                      <div className="space-y-4">
                        <div className="space-y-2">
                          {row.captor_email ? <p className="text-sm text-slate-500">{row.captor_email}</p> : null}
                          {row.notes ? (
                            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-600">
                              {row.notes}
                            </div>
                          ) : null}
                        </div>

                        <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
                          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">Criado em</p>
                            <p className="mt-2 text-sm font-semibold text-slate-800">{formatDateTime(row.created_at)}</p>
                          </div>
                          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">Ultima visita</p>
                            <p className="mt-2 text-sm font-semibold text-slate-800">{formatDateTime(row.last_visit_at)}</p>
                          </div>
                          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">Ultimo cadastro</p>
                            <p className="mt-2 text-sm font-semibold text-slate-800">{formatDateTime(row.last_registration_at)}</p>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-4">
                          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">Visitas</p>
                            <p className="mt-2 text-xl font-black text-slate-950">{row.period_visits_count}</p>
                            <p className="mt-1 text-[11px] font-medium text-slate-400">Total: {row.lifetime_visits_count}</p>
                          </div>
                          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">Cadastros</p>
                            <p className="mt-2 text-xl font-black text-slate-950">{row.period_registrations_count}</p>
                            <p className="mt-1 text-[11px] font-medium text-slate-400">Total: {row.lifetime_registrations_count}</p>
                          </div>
                          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">Conversao</p>
                            <p className="mt-2 text-xl font-black text-slate-950">{row.conversion_rate}%</p>
                            <p className="mt-1 text-[11px] font-medium text-slate-400">Periodo filtrado</p>
                          </div>
                          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">Link</p>
                            <p className="mt-2 truncate text-sm font-semibold text-slate-700">{buildInviteLink(row.code)}</p>
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => handleCopyLink(row.code)}
                            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                          >
                            <Copy className="h-4 w-4" />
                            Copiar link
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSelect(row)}
                            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                          >
                            <UserPlus className="h-4 w-4" />
                            Editar
                          </button>
                          <button
                            type="button"
                            onClick={() => handleToggleStatus(row)}
                            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                          >
                            {row.status === 'active' ? <PauseCircle className="h-4 w-4" /> : <PlayCircle className="h-4 w-4" />}
                            {row.status === 'active' ? 'Pausar' : 'Ativar'}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(row)}
                            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-600 transition hover:border-red-300 hover:bg-red-50"
                          >
                            <Trash2 className="h-4 w-4" />
                            Excluir
                          </button>
                        </div>
                      </div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                  );
                })
              )}
            </div>

            {campaignRows.length > pageSize ? (
              <div className="mt-6 flex flex-col gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm font-medium text-slate-500">
                  Pagina {currentPage} de {totalPages}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setCurrentPage((current) => Math.max(1, current - 1))}
                    disabled={currentPage === 1}
                    className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Anterior
                  </button>
                  <button
                    type="button"
                    onClick={() => setCurrentPage((current) => Math.min(totalPages, current + 1))}
                    disabled={currentPage === totalPages}
                    className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Proxima
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {invitePendingDelete ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4">
          <div className="w-full max-w-md rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_30px_80px_-40px_rgba(15,23,42,0.55)]">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 rounded-full border border-red-200 bg-red-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.24em] text-red-700">
                Confirmar exclusao
              </div>
              <div>
                <h3 className="text-xl font-black text-slate-950">Excluir convite de captacao?</h3>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  O convite <strong className="text-slate-800">{invitePendingDelete.code}</strong> de{' '}
                  <strong className="text-slate-800">{invitePendingDelete.captor_name}</strong> sera removido com o historico
                  de visitas associado.
                </p>
              </div>
            </div>

            <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              <p>
                Visitas acumuladas: <strong className="text-slate-900">{invitePendingDelete.lifetime_visits_count}</strong>
              </p>
              <p className="mt-1">
                Cadastros acumulados:{' '}
                <strong className="text-slate-900">{invitePendingDelete.lifetime_registrations_count}</strong>
              </p>
            </div>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setInvitePendingDelete(null)}
                disabled={isDeleting}
                className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void handleConfirmDelete()}
                disabled={isDeleting}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-red-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Trash2 className="h-4 w-4" />
                {isDeleting ? 'Excluindo...' : 'Excluir convite'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default InviteCampaignsManagement;
