import React, { useEffect, useMemo, useState } from 'react';
import {
  ExternalLink,
  Handshake,
  Mail,
  MessageCircle,
  PauseCircle,
  PlayCircle,
  RefreshCw,
  Save,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../../src/lib/supabaseClient';
import { useAuth } from '../../src/contexts/AuthContext';

type SponsorStatus = 'active' | 'paused' | 'expired';
type SponsorTargetType = 'site' | 'whatsapp';
type SponsorLeadStatus = 'new' | 'contacted' | 'qualified' | 'closed' | 'archived';

interface SiteSponsor {
  id: string;
  company_name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  segment: string;
  logo_url: string | null;
  banner_url: string | null;
  target_type: SponsorTargetType;
  target_url: string | null;
  slot_position: number | null;
  status: SponsorStatus;
  starts_at: string;
  ends_at: string | null;
  notes: string | null;
  created_at: string;
}

interface SponsorLandingStats {
  total_slots: number;
  occupied_slots: number;
  available_slots: number;
  active_sponsors: number;
  active_announcements: number;
  active_stores: number;
  generated_leads: number;
}

interface SponsorInterestLeadRecord {
  id: string;
  company_name: string;
  contact_name: string;
  email: string;
  phone: string | null;
  segment: string;
  message: string | null;
  preferred_channel: 'whatsapp' | 'email';
  status: SponsorLeadStatus;
  created_at: string;
}

const emptyForm = {
  id: null as string | null,
  companyName: '',
  contactName: '',
  email: '',
  phone: '',
  segment: '',
  logoUrl: '',
  bannerUrl: '',
  targetType: 'site' as SponsorTargetType,
  targetUrl: '',
  slotPosition: '',
  status: 'active' as SponsorStatus,
  startsAt: '',
  endsAt: '',
  notes: '',
};

const statusLabelMap: Record<SponsorStatus, string> = {
  active: 'Ativo',
  paused: 'Pausado',
  expired: 'Encerrado',
};

const targetTypeLabelMap: Record<SponsorTargetType, string> = {
  site: 'Site',
  whatsapp: 'WhatsApp',
};

const sponsorLeadStatusLabelMap: Record<SponsorLeadStatus, string> = {
  new: 'Novo',
  contacted: 'Contactado',
  qualified: 'Qualificado',
  closed: 'Fechado',
  archived: 'Arquivado',
};

const toDatetimeLocalValue = (value: string | null | undefined) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return offsetDate.toISOString().slice(0, 16);
};

const toIsoOrNull = (value: string) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const formatDate = (value: string | null) => {
  if (!value) return 'Sem fim definido';
  return new Date(value).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
};

const getDefaultStart = () => {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
};

const SponsorsManagement: React.FC = () => {
  const { user } = useAuth();
  const [sponsors, setSponsors] = useState<SiteSponsor[]>([]);
  const [sponsorLeads, setSponsorLeads] = useState<SponsorInterestLeadRecord[]>([]);
  const [stats, setStats] = useState<SponsorLandingStats | null>(null);
  const [form, setForm] = useState({ ...emptyForm, startsAt: getDefaultStart() });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [updatingLeadId, setUpdatingLeadId] = useState<string | null>(null);

  const activeSponsors = useMemo(
    () =>
      sponsors.filter((sponsor) => {
        const now = Date.now();
        const startsAt = new Date(sponsor.starts_at).getTime();
        const endsAt = sponsor.ends_at ? new Date(sponsor.ends_at).getTime() : null;
        return sponsor.status === 'active' && startsAt <= now && (!endsAt || endsAt >= now);
      }),
    [sponsors],
  );

  const loadSponsors = async () => {
    try {
      setLoading(true);
      const [sponsorsResult, statsResult, sponsorLeadsResult] = await Promise.all([
        supabase
          .from('site_sponsors')
          .select('*')
          .order('slot_position', { ascending: true, nullsFirst: false })
          .order('created_at', { ascending: false }),
        supabase.rpc('get_public_sponsor_landing_stats'),
        supabase
          .from('sponsor_interest_leads')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(20),
      ]);

      if (sponsorsResult.error) throw sponsorsResult.error;
      if (statsResult.error) throw statsResult.error;
      if (sponsorLeadsResult.error) throw sponsorLeadsResult.error;

      setSponsors((sponsorsResult.data || []) as SiteSponsor[]);
      setSponsorLeads((sponsorLeadsResult.data || []) as SponsorInterestLeadRecord[]);
      const rows = (statsResult.data || []) as SponsorLandingStats[];
      setStats(rows[0] || null);
    } catch (error) {
      console.error('[SponsorsManagement] Erro ao carregar patrocinadores:', error);
      toast.error('Não foi possível carregar patrocinadores agora.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadSponsors();
  }, []);

  const resetForm = () => {
    setForm({ ...emptyForm, startsAt: getDefaultStart() });
  };

  const fillForm = (sponsor: SiteSponsor) => {
    setForm({
      id: sponsor.id,
      companyName: sponsor.company_name,
      contactName: sponsor.contact_name || '',
      email: sponsor.email || '',
      phone: sponsor.phone || '',
      segment: sponsor.segment,
      logoUrl: sponsor.logo_url || '',
      bannerUrl: sponsor.banner_url || '',
      targetType: sponsor.target_type,
      targetUrl: sponsor.target_url || '',
      slotPosition: sponsor.slot_position ? String(sponsor.slot_position) : '',
      status: sponsor.status,
      startsAt: toDatetimeLocalValue(sponsor.starts_at),
      endsAt: toDatetimeLocalValue(sponsor.ends_at),
      notes: sponsor.notes || '',
    });
  };

  const saveSponsor = async () => {
    if (!form.companyName.trim() || !form.segment.trim()) {
      toast.error('Preencha o nome da empresa e o segmento do patrocinador.');
      return;
    }

    const startsAt = toIsoOrNull(form.startsAt);
    const endsAt = toIsoOrNull(form.endsAt);

    if (!startsAt) {
      toast.error('Informe uma data de início válida.');
      return;
    }

    if (endsAt && new Date(endsAt).getTime() <= new Date(startsAt).getTime()) {
      toast.error('A data de fim precisa ser maior que a data de início.');
      return;
    }

    if (!form.id && form.status === 'active' && activeSponsors.length >= 6) {
      toast.error('As 6 vagas atuais já estão ocupadas. Pause ou encerre um patrocinador antes de ativar outro.');
      return;
    }

    try {
      setSaving(true);
      const payload = {
        company_name: form.companyName.trim(),
        contact_name: form.contactName.trim() || null,
        email: form.email.trim().toLowerCase() || null,
        phone: form.phone.trim() || null,
        segment: form.segment.trim(),
        logo_url: form.logoUrl.trim() || null,
        banner_url: form.bannerUrl.trim() || null,
        target_type: form.targetType,
        target_url: form.targetUrl.trim() || null,
        slot_position: form.slotPosition ? Number(form.slotPosition) : null,
        status: form.status,
        starts_at: startsAt,
        ends_at: endsAt,
        notes: form.notes.trim() || null,
      };

      const result = form.id
        ? await supabase.from('site_sponsors').update(payload).eq('id', form.id).select('id').single()
        : await supabase
            .from('site_sponsors')
            .insert({ ...payload, created_by: user?.id || null })
            .select('id')
            .single();

      if (result.error) throw result.error;

      toast.success(form.id ? 'Patrocinador atualizado com sucesso.' : 'Patrocinador cadastrado com sucesso.');
      resetForm();
      await loadSponsors();
    } catch (error) {
      console.error('[SponsorsManagement] Erro ao salvar patrocinador:', error);
      const message = error instanceof Error ? error.message : 'Não foi possível salvar o patrocinador.';
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const updateSponsorStatus = async (sponsor: SiteSponsor, status: SponsorStatus) => {
    try {
      const payload =
        status === 'expired'
          ? { status, ends_at: new Date().toISOString() }
          : { status };

      const { error } = await supabase
        .from('site_sponsors')
        .update(payload)
        .eq('id', sponsor.id)
        .select('id')
        .single();

      if (error) throw error;
      toast.success(status === 'active' ? 'Patrocinador ativado.' : 'Vaga liberada com sucesso.');
      await loadSponsors();
    } catch (error) {
      console.error('[SponsorsManagement] Erro ao alterar status:', error);
      const message = error instanceof Error ? error.message : 'Não foi possível alterar o status.';
      toast.error(message);
    }
  };

  const removeSponsor = async (sponsor: SiteSponsor) => {
    const confirmed = window.confirm(`Remover definitivamente o patrocinador ${sponsor.company_name}?`);
    if (!confirmed) return;

    try {
      const { error } = await supabase.from('site_sponsors').delete().eq('id', sponsor.id);
      if (error) throw error;
      toast.success('Patrocinador removido com sucesso.');
      await loadSponsors();
    } catch (error) {
      console.error('[SponsorsManagement] Erro ao remover patrocinador:', error);
      toast.error('Não foi possível remover o patrocinador.');
    }
  };

  const updateLeadStatus = async (leadId: string, status: SponsorLeadStatus) => {
    try {
      setUpdatingLeadId(leadId);
      const { error } = await supabase
        .from('sponsor_interest_leads')
        .update({ status })
        .eq('id', leadId)
        .select('id')
        .single();

      if (error) throw error;

      setSponsorLeads((current) =>
        current.map((lead) => (lead.id === leadId ? { ...lead, status } : lead)),
      );
      toast.success('Status do lead atualizado com sucesso.');
    } catch (error) {
      console.error('[SponsorsManagement] Erro ao atualizar lead de patrocinador:', error);
      toast.error('Não foi possível atualizar o status do lead.');
    } finally {
      setUpdatingLeadId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.22em] text-emerald-700">
              <Handshake className="h-3.5 w-3.5" />
              Patrocinadores
            </div>
            <h1 className="text-2xl font-black text-slate-950">Gestão de vagas do Patrocinador</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
              Cadastre, pause ou encerre patrocinadores. A página pública usa estes dados para exibir vagas disponíveis em tempo real.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadSponsors()}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
          >
            <RefreshCw className="h-4 w-4" />
            Atualizar
          </button>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-4">
          {[
            { label: 'Vagas totais', value: stats?.total_slots ?? 6 },
            { label: 'Ocupadas agora', value: stats?.occupied_slots ?? activeSponsors.length },
            { label: 'Disponíveis agora', value: stats?.available_slots ?? Math.max(6 - activeSponsors.length, 0) },
            { label: 'Patrocinadores ativos', value: stats?.active_sponsors ?? activeSponsors.length },
          ].map((item) => (
            <div key={item.label} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">{item.label}</p>
              <p className="mt-2 text-2xl font-black text-slate-950">{item.value}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-400">Cadastro</p>
              <h2 className="mt-1 text-lg font-black text-slate-950">
                {form.id ? 'Editar patrocinador' : 'Novo patrocinador'}
              </h2>
            </div>
            {form.id && (
              <button
                type="button"
                onClick={resetForm}
                className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50"
              >
                Novo
              </button>
            )}
          </div>

          <div className="grid gap-4">
            <label className="space-y-2">
              <span className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Empresa</span>
              <input
                value={form.companyName}
                onChange={(event) => setForm((current) => ({ ...current, companyName: event.target.value }))}
                className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-emerald-500"
                placeholder="Nome da empresa"
              />
            </label>

            <label className="space-y-2">
              <span className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Segmento</span>
              <input
                value={form.segment}
                onChange={(event) => setForm((current) => ({ ...current, segment: event.target.value }))}
                className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-emerald-500"
                placeholder="Ex.: Máquinas agrícolas"
              />
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-2">
                <span className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Responsável</span>
                <input
                  value={form.contactName}
                  onChange={(event) => setForm((current) => ({ ...current, contactName: event.target.value }))}
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-emerald-500"
                  placeholder="Nome do contato"
                />
              </label>
              <label className="space-y-2">
                <span className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Status</span>
                <select
                  value={form.status}
                  onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as SponsorStatus }))}
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-emerald-500"
                >
                  <option value="active">Ativo</option>
                  <option value="paused">Pausado</option>
                  <option value="expired">Encerrado</option>
                </select>
              </label>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-2">
                <span className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">E-mail</span>
                <input
                  value={form.email}
                  onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-emerald-500"
                  placeholder="contato@empresa.com"
                />
              </label>
              <label className="space-y-2">
                <span className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Telefone</span>
                <input
                  value={form.phone}
                  onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))}
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-emerald-500"
                  placeholder="WhatsApp ou telefone"
                />
              </label>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-2">
                <span className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Início</span>
                <input
                  type="datetime-local"
                  value={form.startsAt}
                  onChange={(event) => setForm((current) => ({ ...current, startsAt: event.target.value }))}
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-emerald-500"
                />
              </label>
              <label className="space-y-2">
                <span className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Fim</span>
                <input
                  type="datetime-local"
                  value={form.endsAt}
                  onChange={(event) => setForm((current) => ({ ...current, endsAt: event.target.value }))}
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-emerald-500"
                />
              </label>
            </div>

            <div className="grid gap-4 sm:grid-cols-[0.7fr_1.3fr]">
              <label className="space-y-2">
                <span className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Vaga</span>
                <select
                  value={form.slotPosition}
                  onChange={(event) => setForm((current) => ({ ...current, slotPosition: event.target.value }))}
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-emerald-500"
                >
                  <option value="">Automática</option>
                  {Array.from({ length: 6 }).map((_, index) => (
                    <option key={index + 1} value={index + 1}>
                      Vaga {index + 1}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-2">
                <span className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Tipo de destino</span>
                <select
                  value={form.targetType}
                  onChange={(event) => setForm((current) => ({ ...current, targetType: event.target.value as SponsorTargetType }))}
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-emerald-500"
                >
                  <option value="site">Site</option>
                  <option value="whatsapp">WhatsApp</option>
                </select>
              </label>
            </div>

            <label className="space-y-2">
              <span className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Link de destino</span>
              <input
                value={form.targetUrl}
                onChange={(event) => setForm((current) => ({ ...current, targetUrl: event.target.value }))}
                className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-emerald-500"
                placeholder="https://site.com ou https://wa.me/..."
              />
            </label>

            <label className="space-y-2">
              <span className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Logo</span>
              <input
                value={form.logoUrl}
                onChange={(event) => setForm((current) => ({ ...current, logoUrl: event.target.value }))}
                className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-emerald-500"
                placeholder="URL da logo"
              />
            </label>

            <label className="space-y-2">
              <span className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Banner</span>
              <input
                value={form.bannerUrl}
                onChange={(event) => setForm((current) => ({ ...current, bannerUrl: event.target.value }))}
                className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-emerald-500"
                placeholder="URL do banner"
              />
            </label>

            <label className="space-y-2">
              <span className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Observações internas</span>
              <textarea
                value={form.notes}
                onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
                className="min-h-[90px] w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-emerald-500"
                placeholder="Anotações visíveis apenas para o admin"
              />
            </label>

            <button
              type="button"
              onClick={() => void saveSponsor()}
              disabled={saving}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-black text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Salvar patrocinador
            </button>
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-400">Lista</p>
              <h2 className="mt-1 text-lg font-black text-slate-950">Patrocinadores cadastrados</h2>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-500">
              {sponsors.length} registro(s)
            </span>
          </div>

          {loading ? (
            <div className="flex min-h-[220px] items-center justify-center text-sm font-bold text-slate-400">
              Carregando patrocinadores...
            </div>
          ) : sponsors.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center">
              <p className="font-black text-slate-900">Nenhum patrocinador cadastrado.</p>
              <p className="mt-2 text-sm text-slate-500">Cadastre o primeiro patrocinador para ocupar uma vaga pública.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {sponsors.map((sponsor) => (
                <div
                  key={sponsor.id}
                  className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="flex min-w-0 gap-4">
                      <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-slate-100">
                        {sponsor.logo_url ? (
                          <img src={sponsor.logo_url} alt={sponsor.company_name} className="h-full w-full object-contain p-2" />
                        ) : (
                          <Handshake className="h-6 w-6 text-slate-400" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate font-black text-slate-950">{sponsor.company_name}</p>
                          <span
                            className={`rounded-full px-2.5 py-1 text-[11px] font-black ${
                              sponsor.status === 'active'
                                ? 'bg-emerald-50 text-emerald-700'
                                : sponsor.status === 'paused'
                                  ? 'bg-amber-50 text-amber-700'
                                  : 'bg-slate-100 text-slate-500'
                            }`}
                          >
                            {statusLabelMap[sponsor.status]}
                          </span>
                          {sponsor.slot_position && (
                            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-black text-slate-500">
                              Vaga {sponsor.slot_position}
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-sm text-slate-500">{sponsor.segment}</p>
                        <p className="mt-1 text-xs text-slate-400">
                          {formatDate(sponsor.starts_at)} até {formatDate(sponsor.ends_at)}
                        </p>
                        <p className="mt-1 text-xs text-slate-400">
                          Destino: {targetTypeLabelMap[sponsor.target_type]}
                          {sponsor.target_url && (
                            <a
                              href={sponsor.target_url}
                              target="_blank"
                              rel="noreferrer"
                              className="ml-2 inline-flex items-center gap-1 text-emerald-700 hover:underline"
                            >
                              abrir
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          )}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => fillForm(sponsor)}
                        className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
                      >
                        Editar
                      </button>
                      {sponsor.status === 'active' ? (
                        <button
                          type="button"
                          onClick={() => void updateSponsorStatus(sponsor, 'paused')}
                          className="inline-flex items-center gap-1 rounded-xl border border-amber-200 px-3 py-2 text-xs font-bold text-amber-700 hover:bg-amber-50"
                        >
                          <PauseCircle className="h-3.5 w-3.5" />
                          Pausar
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => void updateSponsorStatus(sponsor, 'active')}
                          className="inline-flex items-center gap-1 rounded-xl border border-emerald-200 px-3 py-2 text-xs font-bold text-emerald-700 hover:bg-emerald-50"
                        >
                          <PlayCircle className="h-3.5 w-3.5" />
                          Ativar
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => void updateSponsorStatus(sponsor, 'expired')}
                        className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50"
                      >
                        Encerrar
                      </button>
                      <button
                        type="button"
                        onClick={() => void removeSponsor(sponsor)}
                        className="inline-flex items-center gap-1 rounded-xl border border-red-200 px-3 py-2 text-xs font-bold text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Remover
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-400">Leads da landing</p>
            <h2 className="mt-1 text-lg font-black text-slate-950">Interessados em patrocínio</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
              Todos os envios feitos na seção “Fale com a equipe” da página Patrocinador ficam organizados aqui para acompanhamento comercial.
            </p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-500">
            {sponsorLeads.length} lead(s)
          </span>
        </div>

        <div className="overflow-hidden rounded-3xl border border-slate-200">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px]">
              <thead className="border-b border-slate-200 bg-slate-50">
                <tr>
                  <th className="px-5 py-3 text-left text-[11px] font-black uppercase tracking-[0.2em] text-slate-500">Empresa</th>
                  <th className="px-5 py-3 text-left text-[11px] font-black uppercase tracking-[0.2em] text-slate-500">Contato</th>
                  <th className="px-5 py-3 text-left text-[11px] font-black uppercase tracking-[0.2em] text-slate-500">Segmento</th>
                  <th className="px-5 py-3 text-left text-[11px] font-black uppercase tracking-[0.2em] text-slate-500">Canal</th>
                  <th className="px-5 py-3 text-left text-[11px] font-black uppercase tracking-[0.2em] text-slate-500">Status</th>
                  <th className="px-5 py-3 text-left text-[11px] font-black uppercase tracking-[0.2em] text-slate-500">Mensagem</th>
                  <th className="px-5 py-3 text-left text-[11px] font-black uppercase tracking-[0.2em] text-slate-500">Data</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-14 text-center">
                      <div className="mx-auto h-8 w-8 animate-spin rounded-full border-b-2 border-emerald-600" />
                    </td>
                  </tr>
                ) : sponsorLeads.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-14 text-center text-slate-500">
                      Nenhum lead de patrocinador foi recebido ainda.
                    </td>
                  </tr>
                ) : (
                  sponsorLeads.map((lead) => (
                    <tr key={lead.id} className="hover:bg-slate-50">
                      <td className="px-5 py-4">
                        <p className="font-bold text-slate-950">{lead.company_name}</p>
                      </td>
                      <td className="px-5 py-4 text-sm text-slate-600">
                        <p className="font-semibold text-slate-900">{lead.contact_name}</p>
                        <p>{lead.email}</p>
                        {lead.phone ? <p>{lead.phone}</p> : null}
                      </td>
                      <td className="px-5 py-4 text-sm text-slate-600">{lead.segment}</td>
                      <td className="px-5 py-4 text-sm text-slate-600">
                        <span className="inline-flex items-center gap-1.5">
                          {lead.preferred_channel === 'whatsapp' ? (
                            <MessageCircle className="h-4 w-4 text-emerald-600" />
                          ) : (
                            <Mail className="h-4 w-4 text-sky-600" />
                          )}
                          {lead.preferred_channel === 'whatsapp' ? 'WhatsApp' : 'E-mail'}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <select
                          value={lead.status}
                          onChange={(event) => void updateLeadStatus(lead.id, event.target.value as SponsorLeadStatus)}
                          disabled={updatingLeadId === lead.id}
                          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 outline-none focus:border-emerald-500 disabled:opacity-60"
                        >
                          <option value="new">{sponsorLeadStatusLabelMap.new}</option>
                          <option value="contacted">{sponsorLeadStatusLabelMap.contacted}</option>
                          <option value="qualified">{sponsorLeadStatusLabelMap.qualified}</option>
                          <option value="closed">{sponsorLeadStatusLabelMap.closed}</option>
                          <option value="archived">{sponsorLeadStatusLabelMap.archived}</option>
                        </select>
                      </td>
                      <td className="px-5 py-4 text-sm text-slate-600">
                        <div className="max-w-[300px] whitespace-pre-line break-words">
                          {lead.message || 'Sem mensagem adicional.'}
                        </div>
                      </td>
                      <td className="px-5 py-4 text-sm text-slate-600">
                        {new Date(lead.created_at).toLocaleString('pt-BR', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SponsorsManagement;
