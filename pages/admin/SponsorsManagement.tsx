import React, { useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  ExternalLink,
  Handshake,
  Mail,
  MessageCircle,
  PauseCircle,
  PlayCircle,
  RefreshCw,
  Save,
  Send,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../../src/lib/supabaseClient';
import { useAuth } from '../../src/contexts/AuthContext';
import { getTrustedNowMs, syncTrustedTime } from '../../src/lib/trustedTime';

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
  metric_recipient_emails: string[] | null;
  metric_auto_send_enabled: boolean;
  metric_auto_send_frequency: 'weekly' | 'monthly';
  metric_auto_send_day: number;
  metric_auto_last_queued_at: string | null;
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

interface SponsorMetricRegionRow {
  region: string;
  clicks: number;
}

interface SponsorMetricReportRow {
  sponsor_id: string;
  sponsor_name: string;
  period_start: string;
  period_end: string;
  impressions: number;
  clicks: number;
  ctr: number;
  primary_region: string;
  top_regions: SponsorMetricRegionRow[] | null;
}

interface SponsorMetricEmailJobRow {
  id: string;
  sponsor_id: string;
  sponsor_name: string;
  period_start: string;
  period_end: string;
  recipient_email: string;
  recipient_name: string | null;
  status: 'pending' | 'processing' | 'sent' | 'failed' | 'skipped';
  attempts: number;
  last_error: string | null;
  queued_at: string;
  sent_at: string | null;
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
  metricRecipientEmails: '',
  metricAutoSendEnabled: false,
  metricAutoSendFrequency: 'weekly' as 'weekly' | 'monthly',
  metricAutoSendDay: '1',
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

const autoSendFrequencyLabelMap: Record<'weekly' | 'monthly', string> = {
  weekly: 'Semanal',
  monthly: 'Mensal',
};

const weeklyDayOptions = [
  { value: '1', label: 'Segunda-feira' },
  { value: '2', label: 'Terça-feira' },
  { value: '3', label: 'Quarta-feira' },
  { value: '4', label: 'Quinta-feira' },
  { value: '5', label: 'Sexta-feira' },
  { value: '6', label: 'Sábado' },
  { value: '7', label: 'Domingo' },
];

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

const getDefaultReportEnd = () => {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
};

const getDefaultReportStart = () => {
  const date = new Date();
  date.setDate(date.getDate() - 7);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
};

const parseRecipients = (value: string) =>
  Array.from(
    new Set(
      value
        .split(/[\n,;]+/)
        .map((item) => item.trim().toLowerCase())
        .filter((item) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(item)),
    ),
  );

const formatDateTime = (value: string) =>
  new Date(value).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

const SponsorsManagement: React.FC = () => {
  const { user } = useAuth();
  const [sponsors, setSponsors] = useState<SiteSponsor[]>([]);
  const [sponsorLeads, setSponsorLeads] = useState<SponsorInterestLeadRecord[]>([]);
  const [metricEmailJobs, setMetricEmailJobs] = useState<SponsorMetricEmailJobRow[]>([]);
  const [stats, setStats] = useState<SponsorLandingStats | null>(null);
  const [form, setForm] = useState({ ...emptyForm, startsAt: getDefaultStart() });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [updatingLeadId, setUpdatingLeadId] = useState<string | null>(null);
  const [reportSponsorId, setReportSponsorId] = useState('');
  const [reportPeriodStart, setReportPeriodStart] = useState(getDefaultReportStart());
  const [reportPeriodEnd, setReportPeriodEnd] = useState(getDefaultReportEnd());
  const [reportRecipients, setReportRecipients] = useState('');
  const [reportData, setReportData] = useState<SponsorMetricReportRow | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportSending, setReportSending] = useState(false);
  const [automationRunning, setAutomationRunning] = useState(false);

  const activeSponsors = useMemo(
    () =>
      sponsors.filter((sponsor) => {
        const now = getTrustedNowMs();
        const startsAt = new Date(sponsor.starts_at).getTime();
        const endsAt = sponsor.ends_at ? new Date(sponsor.ends_at).getTime() : null;
        return sponsor.status === 'active' && startsAt <= now && (!endsAt || endsAt >= now);
      }),
    [sponsors],
  );

  const selectedReportSponsor = useMemo(
    () => sponsors.find((item) => item.id === reportSponsorId) || null,
    [reportSponsorId, sponsors],
  );

  const metricHistory = useMemo(() => {
    if (!reportSponsorId) return metricEmailJobs;
    return metricEmailJobs.filter((job) => job.sponsor_id === reportSponsorId);
  }, [metricEmailJobs, reportSponsorId]);

  const loadSponsors = async () => {
    try {
      setLoading(true);
      await syncTrustedTime();

      const [sponsorsResult, statsResult, sponsorLeadsResult, metricJobsResult] = await Promise.all([
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
        supabase
          .from('sponsor_metric_email_jobs')
          .select('id, sponsor_id, sponsor_name, period_start, period_end, recipient_email, recipient_name, status, attempts, last_error, queued_at, sent_at, created_at')
          .order('created_at', { ascending: false })
          .limit(40),
      ]);

      if (sponsorsResult.error) throw sponsorsResult.error;
      if (statsResult.error) throw statsResult.error;
      if (sponsorLeadsResult.error) throw sponsorLeadsResult.error;
      if (metricJobsResult.error) throw metricJobsResult.error;

      setSponsors((sponsorsResult.data || []) as SiteSponsor[]);
      setSponsorLeads((sponsorLeadsResult.data || []) as SponsorInterestLeadRecord[]);
      setMetricEmailJobs((metricJobsResult.data || []) as SponsorMetricEmailJobRow[]);
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

  useEffect(() => {
    if (!sponsors.length) return;

    const selectedSponsor = sponsors.find((item) => item.id === reportSponsorId);
    const fallbackSponsor = selectedSponsor || sponsors[0];

    if (!selectedSponsor && fallbackSponsor) {
      setReportSponsorId(fallbackSponsor.id);
    }

    if (!reportRecipients.trim() && fallbackSponsor) {
      const savedRecipients = (fallbackSponsor.metric_recipient_emails || []).join('\n');
      if (savedRecipients) {
        setReportRecipients(savedRecipients);
      } else if (fallbackSponsor.email) {
        setReportRecipients(fallbackSponsor.email);
      }
    }
  }, [reportRecipients, reportSponsorId, sponsors]);

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
      metricRecipientEmails: (sponsor.metric_recipient_emails || []).join('\n'),
      metricAutoSendEnabled: Boolean(sponsor.metric_auto_send_enabled),
      metricAutoSendFrequency: sponsor.metric_auto_send_frequency || 'weekly',
      metricAutoSendDay: String(sponsor.metric_auto_send_day || 1),
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
        metric_recipient_emails: parseRecipients(form.metricRecipientEmails),
        metric_auto_send_enabled: form.metricAutoSendEnabled,
        metric_auto_send_frequency: form.metricAutoSendFrequency,
        metric_auto_send_day: Number(form.metricAutoSendDay || 1),
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
      await syncTrustedTime();

      const payload =
        status === 'expired'
          ? { status, ends_at: new Date(getTrustedNowMs()).toISOString() }
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

  const generateMetricsReport = async () => {
    const periodStart = toIsoOrNull(reportPeriodStart);
    const periodEnd = toIsoOrNull(reportPeriodEnd);

    if (!reportSponsorId) {
      toast.error('Selecione um patrocinador antes de gerar o relatório.');
      return;
    }

    if (!periodStart || !periodEnd) {
      toast.error('Informe um período válido para gerar o relatório.');
      return;
    }

    if (new Date(periodEnd).getTime() <= new Date(periodStart).getTime()) {
      toast.error('A data final precisa ser maior do que a data inicial.');
      return;
    }

    try {
      setReportLoading(true);
      const { data, error } = await supabase.rpc('get_site_sponsor_metrics_report', {
        p_sponsor_id: reportSponsorId,
        p_period_start: periodStart,
        p_period_end: periodEnd,
      });

      if (error) throw error;

      const row = Array.isArray(data) ? data[0] : data;
      if (!row) {
        toast.error('Não foi possível gerar o relatório agora.');
        return;
      }

      setReportData({
        sponsor_id: row.sponsor_id,
        sponsor_name: row.sponsor_name,
        period_start: row.period_start,
        period_end: row.period_end,
        impressions: Number(row.impressions ?? 0),
        clicks: Number(row.clicks ?? 0),
        ctr: Number(row.ctr ?? 0),
        primary_region: row.primary_region ?? 'Região não identificada',
        top_regions: Array.isArray(row.top_regions) ? row.top_regions : [],
      });

      toast.success('Relatório gerado com sucesso.');
    } catch (error) {
      console.error('[SponsorsManagement] Erro ao gerar relatório de métricas:', error);
      toast.error('Não foi possível gerar o relatório do patrocinador.');
    } finally {
      setReportLoading(false);
    }
  };

  const sendMetricsReport = async () => {
    if (!reportData) {
      toast.error('Gere o relatório antes de enviar por e-mail.');
      return;
    }

    const recipients = parseRecipients(reportRecipients);
    if (!recipients.length) {
      toast.error('Informe pelo menos um e-mail válido para envio.');
      return;
    }

    try {
      setReportSending(true);
      const jobsPayload = recipients.map((recipientEmail) => ({
        sponsor_id: reportData.sponsor_id,
        sponsor_name: reportData.sponsor_name,
        period_start: reportData.period_start,
        period_end: reportData.period_end,
        recipient_email: recipientEmail,
        recipient_name: null,
        report_payload: {
          impressions: reportData.impressions,
          clicks: reportData.clicks,
          ctr: reportData.ctr,
          primaryRegion: reportData.primary_region,
          topRegions: reportData.top_regions || [],
        },
        requested_by: user?.id || null,
      }));

      const { error: insertError } = await supabase.from('sponsor_metric_email_jobs').insert(jobsPayload);
      if (insertError) throw insertError;

      const { data: dispatchData, error: dispatchError } = await supabase.functions.invoke('sync-sponsor-metric-emails', {
        body: { limit: Math.max(recipients.length, 1) },
      });

      if (dispatchError) {
        toast.success('Relatório enfileirado com sucesso. O envio será concluído assim que o processador estiver disponível.');
        await loadSponsors();
        return;
      }

      const sentCount = Number(dispatchData?.sentCount ?? 0);
      const failedCount = Number(dispatchData?.failedCount ?? 0);
      toast.success(
        sentCount > 0
          ? `Relatório enviado com sucesso para ${sentCount} destinatário(s).`
          : failedCount > 0
            ? 'O relatório foi enfileirado, mas houve falhas no envio. Revise o monitoramento de e-mails.'
            : 'Relatório processado com sucesso.',
      );
      await loadSponsors();
    } catch (error) {
      console.error('[SponsorsManagement] Erro ao enviar relatório de métricas:', error);
      toast.error('Não foi possível enviar o relatório agora.');
    } finally {
      setReportSending(false);
    }
  };

  const processSponsorMetricAutomation = async () => {
    try {
      setAutomationRunning(true);
      const { data, error } = await supabase.functions.invoke('sync-sponsor-metric-emails', {
        body: {
          limit: 100,
          queue_due: true,
        },
      });

      if (error) throw error;

      const queuedCount = Number(data?.queuedCount ?? 0);
      const sentCount = Number(data?.sentCount ?? 0);

      if (queuedCount === 0 && sentCount === 0) {
        toast.success('Nenhum relatório automático estava vencido para processamento agora.');
      } else {
        toast.success(`Automação processada: ${queuedCount} relatório(s) enfileirado(s) e ${sentCount} envio(s) concluído(s).`);
      }

      await loadSponsors();
    } catch (error) {
      console.error('[SponsorsManagement] Erro ao processar automação de relatórios:', error);
      toast.error('Não foi possível processar a automação dos relatórios agora.');
    } finally {
      setAutomationRunning(false);
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

            <label className="space-y-2">
              <span className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Destinatários dos relatórios</span>
              <textarea
                value={form.metricRecipientEmails}
                onChange={(event) => setForm((current) => ({ ...current, metricRecipientEmails: event.target.value }))}
                className="min-h-[110px] w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-emerald-500"
                placeholder="email@empresa.com.br&#10;marketing@empresa.com.br"
              />
              <p className="text-xs text-slate-400">
                Salve aqui os e-mails padrão que devem receber os relatórios de métricas deste patrocinador.
              </p>
            </label>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="mb-4 flex items-start justify-between gap-4">
                <div>
                  <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Automação dos relatórios</p>
                  <p className="mt-1 text-sm text-slate-600">
                    Configure o envio automático semanal ou mensal usando os destinatários salvos acima.
                  </p>
                </div>
                <label className="inline-flex items-center gap-2 text-sm font-bold text-slate-700">
                  <input
                    type="checkbox"
                    checked={form.metricAutoSendEnabled}
                    onChange={(event) => setForm((current) => ({ ...current, metricAutoSendEnabled: event.target.checked }))}
                    className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                  />
                  Ativar automação
                </label>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Frequência</span>
                  <select
                    value={form.metricAutoSendFrequency}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        metricAutoSendFrequency: event.target.value as 'weekly' | 'monthly',
                        metricAutoSendDay:
                          event.target.value === 'monthly'
                            ? String(Math.min(Number(current.metricAutoSendDay || '1'), 28))
                            : String(Math.min(Number(current.metricAutoSendDay || '1'), 7)),
                      }))
                    }
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-emerald-500"
                    disabled={!form.metricAutoSendEnabled}
                  >
                    <option value="weekly">Semanal</option>
                    <option value="monthly">Mensal</option>
                  </select>
                </label>

                <label className="space-y-2">
                  <span className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">
                    {form.metricAutoSendFrequency === 'weekly' ? 'Dia da semana' : 'Dia do mês'}
                  </span>
                  <select
                    value={form.metricAutoSendDay}
                    onChange={(event) => setForm((current) => ({ ...current, metricAutoSendDay: event.target.value }))}
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-emerald-500"
                    disabled={!form.metricAutoSendEnabled}
                  >
                    {form.metricAutoSendFrequency === 'weekly'
                      ? weeklyDayOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))
                      : Array.from({ length: 28 }).map((_, index) => (
                          <option key={index + 1} value={index + 1}>
                            Dia {index + 1}
                          </option>
                        ))}
                  </select>
                </label>
              </div>
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
                        {(sponsor.metric_recipient_emails || []).length > 0 ? (
                          <p className="mt-1 text-xs text-slate-400">
                            Relatórios: {(sponsor.metric_recipient_emails || []).length} destinatário(s) salvo(s)
                          </p>
                        ) : null}
                        {sponsor.metric_auto_send_enabled ? (
                          <p className="mt-1 text-xs text-slate-400">
                            Automação: {autoSendFrequencyLabelMap[sponsor.metric_auto_send_frequency]} ·{' '}
                            {sponsor.metric_auto_send_frequency === 'weekly'
                              ? weeklyDayOptions.find((item) => item.value === String(sponsor.metric_auto_send_day))?.label || `Dia ${sponsor.metric_auto_send_day}`
                              : `dia ${sponsor.metric_auto_send_day} do mês`}
                            {sponsor.metric_auto_last_queued_at ? ` · última fila em ${formatDateTime(sponsor.metric_auto_last_queued_at)}` : ''}
                          </p>
                        ) : null}
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
            <p className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-400">Histórico de relatórios</p>
            <h2 className="mt-1 text-lg font-black text-slate-950">
              {selectedReportSponsor ? `Envios de ${selectedReportSponsor.company_name}` : 'Últimos relatórios enviados'}
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
              Acompanhe quem recebeu o relatório, o período analisado e o status mais recente do envio.
            </p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-500">
            {metricHistory.length} registro(s)
          </span>
        </div>

        <div className="overflow-hidden rounded-3xl border border-slate-200">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px]">
              <thead className="border-b border-slate-200 bg-slate-50">
                <tr>
                  <th className="px-5 py-3 text-left text-[11px] font-black uppercase tracking-[0.2em] text-slate-500">Patrocinador</th>
                  <th className="px-5 py-3 text-left text-[11px] font-black uppercase tracking-[0.2em] text-slate-500">Período</th>
                  <th className="px-5 py-3 text-left text-[11px] font-black uppercase tracking-[0.2em] text-slate-500">Destinatário</th>
                  <th className="px-5 py-3 text-left text-[11px] font-black uppercase tracking-[0.2em] text-slate-500">Status</th>
                  <th className="px-5 py-3 text-left text-[11px] font-black uppercase tracking-[0.2em] text-slate-500">Envio</th>
                  <th className="px-5 py-3 text-left text-[11px] font-black uppercase tracking-[0.2em] text-slate-500">Observações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-14 text-center">
                      <div className="mx-auto h-8 w-8 animate-spin rounded-full border-b-2 border-emerald-600" />
                    </td>
                  </tr>
                ) : metricHistory.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-14 text-center text-slate-500">
                      Nenhum relatório de patrocinador foi gerado ainda para este filtro.
                    </td>
                  </tr>
                ) : (
                  metricHistory.map((job) => (
                    <tr key={job.id} className="hover:bg-slate-50">
                      <td className="px-5 py-4 text-sm">
                        <p className="font-bold text-slate-950">{job.sponsor_name}</p>
                      </td>
                      <td className="px-5 py-4 text-sm text-slate-600">
                        {formatDateTime(job.period_start)} até {formatDateTime(job.period_end)}
                      </td>
                      <td className="px-5 py-4 text-sm text-slate-600">
                        <p className="font-semibold text-slate-900">{job.recipient_name || 'Destinatário manual'}</p>
                        <p>{job.recipient_email}</p>
                      </td>
                      <td className="px-5 py-4">
                        <span
                          className={`rounded-full px-2.5 py-1 text-[11px] font-black ${
                            job.status === 'sent'
                              ? 'bg-emerald-50 text-emerald-700'
                              : job.status === 'failed'
                                ? 'bg-red-50 text-red-700'
                                : job.status === 'skipped'
                                  ? 'bg-amber-50 text-amber-700'
                                  : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {job.status === 'sent'
                            ? 'Enviado'
                            : job.status === 'failed'
                              ? 'Falhou'
                              : job.status === 'skipped'
                                ? 'Ignorado'
                                : job.status === 'processing'
                                  ? 'Processando'
                                  : 'Pendente'}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-sm text-slate-600">
                        {job.sent_at ? formatDateTime(job.sent_at) : formatDateTime(job.created_at)}
                      </td>
                      <td className="px-5 py-4 text-sm text-slate-600">
                        <div className="max-w-[320px] whitespace-pre-line break-words">
                          {job.last_error || `Tentativas: ${job.attempts}`}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
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

      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-400">Relatórios de métricas</p>
            <h2 className="mt-1 text-lg font-black text-slate-950">Gerador manual para patrocinadores</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
              Gere o resumo de impressões, cliques, CTR e região principal do público interessado para cada patrocinador e envie manualmente por e-mail quando solicitado.
            </p>
          </div>
          <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-xs font-bold text-emerald-700">
            Admin-only: as métricas não ficam visíveis para o patrocinador na plataforma.
          </div>
        </div>

        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
          <div className="text-sm text-slate-600">
            Use este botão para processar os relatórios automáticos que estiverem vencidos hoje, com base nas configurações salvas em cada patrocinador.
          </div>
          <button
            type="button"
            onClick={() => void processSponsorMetricAutomation()}
            disabled={automationRunning}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-black text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {automationRunning ? <RefreshCw className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Processar automação de hoje
          </button>
        </div>

        <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
            <div className="grid gap-4">
              <label className="space-y-2">
                <span className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Patrocinador</span>
                <select
                  value={reportSponsorId}
                  onChange={(event) => {
                    const nextId = event.target.value;
                    setReportSponsorId(nextId);
                    const selected = sponsors.find((item) => item.id === nextId);
                    const savedRecipients = (selected?.metric_recipient_emails || []).join('\n');
                    if (savedRecipients) {
                      setReportRecipients(savedRecipients);
                    } else if (selected?.email) {
                      setReportRecipients(selected.email);
                    }
                  }}
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-emerald-500"
                >
                  <option value="">Selecione</option>
                  {sponsors.map((sponsor) => (
                    <option key={sponsor.id} value={sponsor.id}>
                      {sponsor.company_name}
                    </option>
                  ))}
                </select>
              </label>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Início do período</span>
                  <input
                    type="datetime-local"
                    value={reportPeriodStart}
                    onChange={(event) => setReportPeriodStart(event.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-emerald-500"
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Fim do período</span>
                  <input
                    type="datetime-local"
                    value={reportPeriodEnd}
                    onChange={(event) => setReportPeriodEnd(event.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-emerald-500"
                  />
                </label>
              </div>

              <label className="space-y-2">
                <span className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Destinatários</span>
                <textarea
                  value={reportRecipients}
                  onChange={(event) => setReportRecipients(event.target.value)}
                  className="min-h-[110px] w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-emerald-500"
                  placeholder="email@empresa.com.br&#10;marketing@empresa.com.br"
                />
                <p className="text-xs text-slate-400">
                  Você pode separar por vírgula, ponto e vírgula ou quebra de linha.
                  {selectedReportSponsor?.metric_recipient_emails?.length
                    ? ' Estes destinatários já estão salvos no patrocinador selecionado.'
                    : ''}
                </p>
              </label>

              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => void generateMetricsReport()}
                  disabled={reportLoading}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 py-3 text-sm font-black text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {reportLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <BarChart3 className="h-4 w-4" />}
                  Gerar relatório
                </button>
                <button
                  type="button"
                  onClick={() => void sendMetricsReport()}
                  disabled={reportSending || !reportData}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-black text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {reportSending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Enviar por e-mail
                </button>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Prévia do relatório</p>
                <h3 className="mt-1 text-base font-black text-slate-950">
                  {reportData?.sponsor_name || 'Selecione um patrocinador e gere a análise'}
                </h3>
              </div>
              {reportData ? (
                <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-black text-slate-500">
                  {formatDateTime(reportData.period_start)} até {formatDateTime(reportData.period_end)}
                </span>
              ) : null}
            </div>

            {!reportData ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center">
                <p className="font-black text-slate-900">Nenhum relatório gerado ainda.</p>
                <p className="mt-2 text-sm text-slate-500">
                  Escolha um patrocinador, defina o período e gere a prévia antes do envio.
                </p>
              </div>
            ) : (
              <div className="space-y-5">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Impressões</p>
                    <p className="mt-2 text-3xl font-black text-slate-950">{reportData.impressions}</p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Cliques</p>
                    <p className="mt-2 text-3xl font-black text-slate-950">{reportData.clicks}</p>
                  </div>
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                    <p className="text-[11px] font-black uppercase tracking-[0.18em] text-emerald-700">CTR</p>
                    <p className="mt-2 text-3xl font-black text-emerald-800">{reportData.ctr.toFixed(2).replace('.', ',')}%</p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Região principal</p>
                    <p className="mt-2 text-lg font-black text-slate-950">{reportData.primary_region}</p>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white">
                  <div className="border-b border-slate-200 px-4 py-3">
                    <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Top regiões por clique</p>
                  </div>
                  {reportData.top_regions && reportData.top_regions.length > 0 ? (
                    <div className="divide-y divide-slate-200">
                      {reportData.top_regions.map((region) => (
                        <div key={`${region.region}-${region.clicks}`} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                          <span className="font-bold text-slate-900">{region.region}</span>
                          <span className="font-black text-emerald-700">{region.clicks} clique(s)</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="px-4 py-6 text-sm text-slate-500">
                      Ainda não houve cliques suficientes no período para compor um ranking regional.
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SponsorsManagement;
