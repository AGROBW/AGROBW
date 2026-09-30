import React, { useState } from 'react';
import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Download,
  ExternalLink,
  FileText,
  Globe2,
  MessageCircle,
  Minus,
  MousePointerClick,
  Percent,
  QrCode,
  RefreshCw,
  Share2,
  ShoppingBag,
  Users,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { SellerStore } from '../../types';
import {
  useSellerStoreInsights,
  type SellerStoreInsightsPeriod,
} from '../../src/hooks/useSellerStoreInsights';

type SellerStoreInsightsPanelProps = {
  hasStoreAccess: boolean;
  store: SellerStore | null;
};

const PERIOD_OPTIONS: Array<{ value: SellerStoreInsightsPeriod; label: string }> = [
  { value: 7, label: '7 dias' },
  { value: 30, label: '30 dias' },
  { value: 90, label: '90 dias' },
];

const SOURCE_LABELS: Record<string, string> = {
  direct: 'Acesso direto',
  internal: 'Navegação AGRO BW',
  google: 'Google',
  whatsapp: 'WhatsApp',
  social: 'Redes sociais',
  catalog_pdf: 'Catálogo PDF',
  other: 'Outros',
};

const numberFormatter = new Intl.NumberFormat('pt-BR');
const percentFormatter = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

const formatShortDate = (value: string) => {
  const [, month, day] = value.split('-');
  return month && day ? `${day}/${month}` : value;
};

const ComparisonBadge: React.FC<{ value: number | null; suffix?: string }> = ({ value, suffix = '%' }) => {
  if (value === null) {
    return (
      <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-black text-emerald-700">
        Novo
      </span>
    );
  }

  const isPositive = value > 0;
  const isNegative = value < 0;
  const Icon = isPositive ? ArrowUpRight : isNegative ? ArrowDownRight : Minus;
  const tone = isPositive
    ? 'bg-emerald-50 text-emerald-700'
    : isNegative
      ? 'bg-rose-50 text-rose-700'
      : 'bg-slate-100 text-slate-500';

  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-black ${tone}`}>
      <Icon className="h-3.5 w-3.5" strokeWidth={2} />
      {value > 0 ? '+' : ''}{percentFormatter.format(value)}{suffix}
    </span>
  );
};

const MetricCard: React.FC<{
  label: string;
  value: string;
  helper: string;
  change: number | null;
  changeSuffix?: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  tone: 'emerald' | 'blue' | 'amber' | 'slate';
}> = ({ label, value, helper, change, changeSuffix, icon: Icon, tone }) => {
  const tones = {
    emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
    blue: 'bg-sky-50 text-sky-700 ring-sky-100',
    amber: 'bg-amber-50 text-amber-700 ring-amber-100',
    slate: 'bg-slate-100 text-slate-700 ring-slate-200',
  };

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_12px_35px_-30px_rgba(15,23,42,0.45)]">
      <div className="flex items-start justify-between gap-3">
        <span className={`inline-flex h-10 w-10 items-center justify-center rounded-xl ring-1 ${tones[tone]}`}>
          <Icon className="h-5 w-5" strokeWidth={1.8} />
        </span>
        <ComparisonBadge value={change} suffix={changeSuffix} />
      </div>
      <p className="mt-5 text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">{label}</p>
      <p className="mt-1 text-3xl font-black tracking-tight text-slate-950">{value}</p>
      <p className="mt-2 text-xs leading-5 text-slate-500">{helper}</p>
    </article>
  );
};

const InsightsSkeleton = () => (
  <div className="space-y-5" aria-label="Carregando indicadores da loja">
    <div className="h-40 animate-pulse rounded-3xl bg-slate-200" />
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="h-44 animate-pulse rounded-2xl bg-slate-100" />
      ))}
    </div>
    <div className="grid gap-5 xl:grid-cols-[1.45fr,0.75fr]">
      <div className="h-80 animate-pulse rounded-2xl bg-slate-100" />
      <div className="h-80 animate-pulse rounded-2xl bg-slate-100" />
    </div>
  </div>
);

const SellerStoreInsightsPanel: React.FC<SellerStoreInsightsPanelProps> = ({ hasStoreAccess, store }) => {
  const [period, setPeriod] = useState<SellerStoreInsightsPeriod>(30);
  const insightsEnabled = Boolean(
    hasStoreAccess &&
    store?.isStoreFeatureEnabled &&
    !store?.isPausedDueToPlan,
  );
  const { data, isLoading, error, availabilityReason, refresh } = useSellerStoreInsights(period, 5, insightsEnabled);

  if (!insightsEnabled) {
    return (
      <div className="overflow-hidden rounded-3xl border border-amber-200 bg-[linear-gradient(135deg,#fffbeb_0%,#ffffff_62%)] p-6 sm:p-8">
        <div className="flex max-w-2xl flex-col items-start gap-4">
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
            <BarChart3 className="h-6 w-6" strokeWidth={1.7} />
          </span>
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-amber-700">Recurso Loja Parceira</p>
            <h2 className="mt-2 text-2xl font-black text-slate-950">Indicadores disponíveis com a loja ativa</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Ative o plano Loja Parceira e publique sua loja para acompanhar visitas, contatos, origens e produtos com maior interesse.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (isLoading && !data) return <InsightsSkeleton />;

  if (availabilityReason) {
    const availabilityMessages = {
      STORE_NOT_FOUND: 'Configure sua Loja Parceira antes de consultar os indicadores.',
      PLAN_REQUIRED: 'Este painel está disponível somente com uma assinatura Loja Parceira ativa.',
      STORE_FEATURE_PAUSED: 'Os indicadores estão pausados enquanto a publicação da loja estiver indisponível.',
      AVAILABLE: 'Os indicadores estão disponíveis.',
    };
    return (
      <div className="rounded-3xl border border-amber-200 bg-amber-50 p-6 text-center sm:p-8">
        <BarChart3 className="mx-auto h-8 w-8 text-amber-600" strokeWidth={1.6} />
        <h2 className="mt-3 text-xl font-black text-slate-950">Indicadores indisponíveis</h2>
        <p className="mt-2 text-sm text-slate-600">{availabilityMessages[availabilityReason]}</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-3xl border border-rose-200 bg-rose-50 p-6 text-center sm:p-8">
        <BarChart3 className="mx-auto h-8 w-8 text-rose-500" strokeWidth={1.6} />
        <h2 className="mt-3 text-xl font-black text-slate-950">Não foi possível carregar os indicadores</h2>
        <p className="mt-2 text-sm text-slate-600">{error || 'Tente novamente em alguns instantes.'}</p>
        <button
          type="button"
          onClick={() => void refresh()}
          className="mt-5 inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-slate-800"
        >
          <RefreshCw className="h-4 w-4" strokeWidth={1.8} />
          Tentar novamente
        </button>
      </div>
    );
  }

  const summary = data.summary;
  const comparison = data.comparison;
  const attributedCoverage = data.sourceCoverage.totalVisitors > 0
    ? Math.min(100, (data.sourceCoverage.attributedVisitors / data.sourceCoverage.totalVisitors) * 100)
    : 0;

  const activityCards = [
    { label: 'WhatsApp', value: summary.whatsappClicks, icon: MessageCircle, color: 'text-emerald-700 bg-emerald-50' },
    { label: 'Contato AGRO BW', value: summary.platformContacts, icon: MousePointerClick, color: 'text-sky-700 bg-sky-50' },
    { label: 'Cliques no site', value: summary.websiteClicks, icon: Globe2, color: 'text-cyan-700 bg-cyan-50' },
    { label: 'Compartilhamentos', value: summary.storeShares, icon: Share2, color: 'text-amber-700 bg-amber-50' },
    { label: 'Catálogos gerados', value: summary.catalogsGenerated, icon: FileText, color: 'text-slate-700 bg-slate-100' },
    { label: 'Downloads de catálogo', value: summary.catalogDownloads, icon: Download, color: 'text-blue-700 bg-blue-50' },
    { label: 'Acessos por QR Code', value: summary.catalogQrOpens, icon: QrCode, color: 'text-cyan-700 bg-cyan-50' },
  ];

  return (
    <div className="space-y-5">
      <section className="relative overflow-hidden rounded-3xl bg-[radial-gradient(circle_at_88%_12%,rgba(16,185,129,0.28),transparent_30%),linear-gradient(135deg,#071b1b_0%,#0b2930_50%,#0f172a_100%)] p-6 text-white sm:p-8">
        <div className="pointer-events-none absolute -right-14 -top-16 h-48 w-48 rounded-full border border-emerald-400/20" />
        <div className="pointer-events-none absolute -right-4 -top-8 h-32 w-32 rounded-full border border-emerald-400/15" />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <span className="inline-flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.24em] text-emerald-300">
              <BarChart3 className="h-4 w-4" strokeWidth={1.8} />
              Inteligência da loja
            </span>
            <h2 className="mt-3 text-2xl font-black tracking-tight sm:text-3xl">Seu desempenho em uma visão clara.</h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-slate-300">
              Entenda como compradores encontram sua loja, quais produtos despertam interesse e quantas visitas avançam para contato.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="inline-flex rounded-xl border border-white/10 bg-white/10 p-1 backdrop-blur-sm" aria-label="Período dos indicadores">
              {PERIOD_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setPeriod(option.value)}
                  aria-pressed={period === option.value}
                  className={`rounded-lg px-3 py-2 text-xs font-black transition ${period === option.value ? 'bg-emerald-400 text-emerald-950' : 'text-slate-200 hover:bg-white/10'}`}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => void refresh()}
              disabled={isLoading}
              aria-label="Atualizar indicadores"
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/10 text-white transition hover:bg-white/20 disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} strokeWidth={1.8} />
            </button>
          </div>
        </div>
        <p className="relative mt-5 text-[11px] font-semibold text-slate-400">
          Atualizado em {new Date(data.generatedAt).toLocaleString('pt-BR')}
        </p>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Visitas à loja"
          value={numberFormatter.format(summary.storeVisits)}
          helper={`Sessões únicas nos últimos ${period} dias`}
          change={comparison.storeVisits.changePercent}
          icon={Users}
          tone="emerald"
        />
        <MetricCard
          label="Produtos abertos"
          value={numberFormatter.format(summary.announcementOpens)}
          helper="Pessoas que avançaram da vitrine para um anúncio"
          change={comparison.announcementOpens.changePercent}
          icon={ShoppingBag}
          tone="blue"
        />
        <MetricCard
          label="Ações de contato"
          value={numberFormatter.format(summary.contactActions)}
          helper="Sessões com contato por WhatsApp ou plataforma"
          change={comparison.contactActions.changePercent}
          icon={MessageCircle}
          tone="amber"
        />
        <MetricCard
          label="Conversão"
          value={`${percentFormatter.format(summary.conversionRate)}%`}
          helper="Percentual de visitantes que iniciaram contato"
          change={comparison.conversionRate.changePercentagePoints}
          changeSuffix=" p.p."
          icon={Percent}
          tone="slate"
        />
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(300px,0.75fr)]">
        <div className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-700">Evolução diária</p>
              <h3 className="mt-1 text-xl font-black text-slate-950">Da visita ao contato</h3>
            </div>
            <div className="flex flex-wrap gap-3 text-[11px] font-bold text-slate-500">
              <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-500" /> Visitas</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-sky-500" /> Produtos</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-amber-500" /> Contatos</span>
            </div>
          </div>
          <div
            className="mt-6 h-72 w-full"
            role="img"
            aria-label={`Evolução diária de visitas, produtos abertos e contatos nos últimos ${period} dias`}
          >
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.daily} margin={{ top: 8, right: 6, left: -24, bottom: 0 }}>
                <defs>
                  <linearGradient id="storeVisitsGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.28} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="date" tickFormatter={formatShortDate} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} minTickGap={24} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <Tooltip labelFormatter={(label) => `Data: ${formatShortDate(String(label))}`} contentStyle={{ borderRadius: 14, borderColor: '#e2e8f0', fontSize: 12 }} />
                <Area type="monotone" dataKey="storeVisits" name="Visitas" stroke="#10b981" strokeWidth={2.5} fill="url(#storeVisitsGradient)" />
                <Area type="monotone" dataKey="announcementOpens" name="Produtos abertos" stroke="#0ea5e9" strokeWidth={2} fillOpacity={0} />
                <Area type="monotone" dataKey="contactActions" name="Contatos" stroke="#f59e0b" strokeWidth={2} fillOpacity={0} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-6">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-700">Origem das visitas</p>
          <h3 className="mt-1 text-xl font-black text-slate-950">Como encontram sua loja</h3>
          {data.sources.length > 0 ? (
            <div
              className="mt-6 h-52"
              role="img"
              aria-label="Distribuição das visitas por canal de origem"
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.sources.map((source) => ({ ...source, label: SOURCE_LABELS[source.sourceChannel] || source.sourceChannel }))} layout="vertical" margin={{ top: 0, right: 8, left: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                  <XAxis type="number" allowDecimals={false} hide />
                  <YAxis type="category" dataKey="label" width={108} tick={{ fontSize: 11, fill: '#475569' }} axisLine={false} tickLine={false} />
                  <Tooltip formatter={(value) => [numberFormatter.format(Number(value)), 'Visitantes']} contentStyle={{ borderRadius: 14, borderColor: '#e2e8f0', fontSize: 12 }} />
                  <Bar dataKey="visitors" name="Visitantes" fill="#10b981" radius={[0, 8, 8, 0]} barSize={16} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="mt-6 flex h-52 items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-5 text-center text-sm leading-6 text-slate-500">
              As origens aparecerão após as próximas visitas à loja.
            </div>
          )}
          <div className="mt-4">
            <div className="flex items-center justify-between text-xs font-bold text-slate-500">
              <span>Cobertura de atribuição</span>
              <span>{percentFormatter.format(attributedCoverage)}%</span>
            </div>
            <div
              className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100"
              role="progressbar"
              aria-label="Cobertura de atribuição das visitas"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(attributedCoverage)}
            >
              <div className="h-full rounded-full bg-emerald-500" style={{ width: `${attributedCoverage}%` }} />
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
        <div className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-700">Produtos em destaque</p>
              <h3 className="mt-1 text-xl font-black text-slate-950">Anúncios com maior interesse</h3>
            </div>
            <ExternalLink className="h-5 w-5 text-slate-300" strokeWidth={1.7} />
          </div>
          {data.topAnnouncements.length > 0 ? (
            <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200">
              {data.topAnnouncements.map((announcement, index) => (
                <div key={announcement.announcementId} className="grid grid-cols-[auto,minmax(0,1fr),auto] items-center gap-3 border-b border-slate-100 px-4 py-3 last:border-b-0">
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-xs font-black text-slate-500">{index + 1}</span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-slate-900">{announcement.title}</p>
                    <p className="mt-1 text-xs text-slate-500">{numberFormatter.format(announcement.opens)} abertura(s) · {numberFormatter.format(announcement.contacts)} contato(s)</p>
                  </div>
                  <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-black text-emerald-700">{percentFormatter.format(announcement.conversionRate)}%</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-5 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-5 py-10 text-center text-sm text-slate-500">Ainda não há interações suficientes para formar o ranking.</div>
          )}
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-6">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-700">Ações comerciais</p>
          <h3 className="mt-1 text-xl font-black text-slate-950">Sinais gerados pela loja</h3>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
            {activityCards.map(({ label, value, icon: Icon, color }) => (
              <div key={label} className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-3.5">
                <span className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${color}`}>
                  <Icon className="h-4 w-4" strokeWidth={1.8} />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-[11px] font-bold text-slate-500">{label}</p>
                  <p className="text-lg font-black text-slate-950">{numberFormatter.format(value)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <p className="px-1 text-xs leading-5 text-slate-400">
        Os indicadores são agregados e não exibem dados pessoais dos visitantes. Comparações usam o período imediatamente anterior com a mesma duração.
      </p>
    </div>
  );
};

export default SellerStoreInsightsPanel;
