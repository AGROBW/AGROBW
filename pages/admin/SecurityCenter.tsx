import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  KeyRound,
  RefreshCw,
  Route,
  Shield,
  ShieldAlert,
  TimerReset,
  Wifi,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
} from 'recharts';
import { supabase } from '../../src/lib/supabaseClient';
import { toast } from 'sonner';
import { appError } from '../../src/utils/appLogger';

type SecuritySeverity = 'all' | 'info' | 'warning' | 'critical' | 'blocked';
type SecurityCategory = 'all' | 'admin_auth' | 'access_control' | 'rate_limit' | 'input_abuse' | 'application';
type SecurityWindowDays = 1 | 7 | 30;

interface SecurityEventRow {
  id: string;
  user_id: string | null;
  email: string | null;
  attempted_route: string;
  attempted_action: string | null;
  ip_address: string | null;
  user_agent: string | null;
  severity: Exclude<SecuritySeverity, 'all'>;
  reason: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

interface SecurityTrendPoint {
  bucket: string;
  events: number;
  blocked: number;
  critical: number;
}

interface SecuritySummary {
  totalEvents: number;
  blockedEvents: number;
  criticalEvents: number;
  warningEvents: number;
  adminLoginFailures: number;
  captchaFailures: number;
  mfaFailures: number;
  rateLimitedEvents: number;
  unauthorizedAccessEvents: number;
  suspiciousIps: number;
  targetedEmails: number;
  uniqueRoutes: number;
  lastEventAt: string | null;
}

interface SecurityCountItem {
  ip?: string;
  route?: string;
  action?: string;
  email?: string;
  events: number;
  blocked?: number;
  criticalOrBlocked?: number;
  lastSeenAt?: string | null;
}

interface SecurityOverview {
  windowDays: number;
  generatedAt: string;
  summary: SecuritySummary;
  topIps: SecurityCountItem[];
  topRoutes: SecurityCountItem[];
  topActions: SecurityCountItem[];
  topTargetedEmails: SecurityCountItem[];
  trend: SecurityTrendPoint[];
}

const PERIOD_OPTIONS: Array<{ value: SecurityWindowDays; label: string }> = [
  { value: 1, label: '24h' },
  { value: 7, label: '7 dias' },
  { value: 30, label: '30 dias' },
];

const SEVERITY_OPTIONS: Array<{ value: SecuritySeverity; label: string }> = [
  { value: 'all', label: 'Todas' },
  { value: 'blocked', label: 'Bloqueadas' },
  { value: 'critical', label: 'Criticas' },
  { value: 'warning', label: 'Alertas' },
  { value: 'info', label: 'Informativas' },
];

const CATEGORY_OPTIONS: Array<{ value: SecurityCategory; label: string }> = [
  { value: 'all', label: 'Todas as categorias' },
  { value: 'admin_auth', label: 'Login e MFA admin' },
  { value: 'access_control', label: 'Controle de acesso' },
  { value: 'rate_limit', label: 'Rate limiting' },
  { value: 'input_abuse', label: 'Entrada e SSRF' },
  { value: 'application', label: 'Aplicacao' },
];

const emptyOverview: SecurityOverview = {
  windowDays: 1,
  generatedAt: new Date().toISOString(),
  summary: {
    totalEvents: 0,
    blockedEvents: 0,
    criticalEvents: 0,
    warningEvents: 0,
    adminLoginFailures: 0,
    captchaFailures: 0,
    mfaFailures: 0,
    rateLimitedEvents: 0,
    unauthorizedAccessEvents: 0,
    suspiciousIps: 0,
    targetedEmails: 0,
    uniqueRoutes: 0,
    lastEventAt: null,
  },
  topIps: [],
  topRoutes: [],
  topActions: [],
  topTargetedEmails: [],
  trend: [],
};

const toPeriodStartIso = (days: SecurityWindowDays) => {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - (days - 1));
  return date.toISOString();
};

const formatDateTime = (value?: string | null) => {
  if (!value) return 'N/A';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'N/A';
  return parsed.toLocaleString('pt-BR');
};

const timeAgo = (value?: string | null) => {
  if (!value) return 'agora';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'agora';

  const diffMs = Date.now() - parsed.getTime();
  const diffMinutes = Math.floor(diffMs / 60000);
  if (diffMinutes <= 0) return 'agora';
  if (diffMinutes < 60) return `${diffMinutes} min atr`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} h atr`;

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} d atr`;
};

const normalizeSearch = (value: string) => value.trim().toLowerCase();

const getCategory = (event: SecurityEventRow): SecurityCategory => {
  const action = String(event.attempted_action || '').toLowerCase();

  if (action.startsWith('admin_login_') || action.startsWith('admin_mfa_')) {
    return 'admin_auth';
  }

  if (action.includes('forbidden') || action === 'unauthorized_access' || action.includes('non_admin')) {
    return 'access_control';
  }

  if (action.includes('rate_limited') || action === 'admin_login_blocked') {
    return 'rate_limit';
  }

  if (action.includes('ssrf') || action.includes('captcha')) {
    return 'input_abuse';
  }

  return 'application';
};

const getCategoryLabel = (category: SecurityCategory) => {
  switch (category) {
    case 'admin_auth':
      return 'Login/MFA';
    case 'access_control':
      return 'Acesso';
    case 'rate_limit':
      return 'Rate limit';
    case 'input_abuse':
      return 'Entrada/SSRF';
    case 'application':
      return 'Aplicacao';
    default:
      return 'Todas';
  }
};

const getSeverityClasses = (severity: SecurityEventRow['severity']) => {
  switch (severity) {
    case 'blocked':
      return 'bg-rose-50 text-rose-700 border border-rose-200';
    case 'critical':
      return 'bg-amber-50 text-amber-700 border border-amber-200';
    case 'warning':
      return 'bg-sky-50 text-sky-700 border border-sky-200';
    default:
      return 'bg-emerald-50 text-emerald-700 border border-emerald-200';
  }
};

const SummaryCard = ({
  icon: Icon,
  label,
  value,
  helper,
  tone = 'default',
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  helper: string;
  tone?: 'default' | 'danger' | 'warning' | 'success';
}) => {
  const toneClasses =
    tone === 'danger'
      ? 'from-rose-50 to-white text-rose-700'
      : tone === 'warning'
        ? 'from-amber-50 to-white text-amber-700'
        : tone === 'success'
          ? 'from-emerald-50 to-white text-emerald-700'
          : 'from-slate-50 to-white text-slate-700';

  return (
    <div className={`rounded-3xl border border-slate-200 bg-gradient-to-br ${toneClasses} p-5 shadow-sm`}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-500">{label}</p>
          <p className="mt-2 text-3xl font-black text-slate-900">{value}</p>
        </div>
        <div className="rounded-2xl border border-white bg-white/90 p-3 shadow-sm">
          <Icon className="h-5 w-5" />
        </div>
      </div>
      <p className="mt-3 text-xs font-medium text-slate-500">{helper}</p>
    </div>
  );
};

const SecurityCenter: React.FC = () => {
  const [windowDays, setWindowDays] = useState<SecurityWindowDays>(1);
  const [severityFilter, setSeverityFilter] = useState<SecuritySeverity>('all');
  const [categoryFilter, setCategoryFilter] = useState<SecurityCategory>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [overview, setOverview] = useState<SecurityOverview>(emptyOverview);
  const [events, setEvents] = useState<SecurityEventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const [realtimeStatus, setRealtimeStatus] = useState<'connecting' | 'live' | 'polling'>('connecting');

  const loadSecurityCenter = async (showLoader = false) => {
    if (showLoader) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }

    try {
      const sinceIso = toPeriodStartIso(windowDays);

      const [{ data: overviewData, error: overviewError }, { data: eventsData, error: eventsError }] =
        await Promise.all([
          supabase.rpc('get_admin_security_overview', { p_days: windowDays }),
          supabase
            .from('security_events')
            .select(
              'id, user_id, email, attempted_route, attempted_action, ip_address, user_agent, severity, reason, metadata, created_at',
            )
            .gte('created_at', sinceIso)
            .order('created_at', { ascending: false })
            .limit(120),
        ]);

      if (overviewError) {
        throw overviewError;
      }

      if (eventsError) {
        throw eventsError;
      }

      setOverview((overviewData as SecurityOverview | null) || emptyOverview);
      setEvents((eventsData as SecurityEventRow[] | null) || []);
      setLastUpdatedAt(new Date().toISOString());
    } catch (error) {
      appError('[SecurityCenter] Erro ao carregar centro de seguranca', error, {
        windowDays,
      });
      toast.error('Nao foi possivel carregar o Centro de Seguranca.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void loadSecurityCenter(true);
  }, [windowDays]);

  useEffect(() => {
    const channel = supabase
      .channel('admin_security_center_events')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'security_events',
        },
        () => {
          setRealtimeStatus('live');
          void loadSecurityCenter(false);
        },
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setRealtimeStatus('live');
          return;
        }

        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          setRealtimeStatus('polling');
        }
      });

    const intervalId = window.setInterval(() => {
      void loadSecurityCenter(false);
    }, 30000);

    return () => {
      window.clearInterval(intervalId);
      supabase.removeChannel(channel);
    };
  }, [windowDays]);

  const filteredEvents = useMemo(() => {
    const normalizedSearch = normalizeSearch(searchTerm);

    return events.filter((event) => {
      if (severityFilter !== 'all' && event.severity !== severityFilter) {
        return false;
      }

      const eventCategory = getCategory(event);
      if (categoryFilter !== 'all' && eventCategory !== categoryFilter) {
        return false;
      }

      if (!normalizedSearch) {
        return true;
      }

      const haystack = [
        event.email || '',
        event.ip_address || '',
        event.attempted_route || '',
        event.attempted_action || '',
        event.reason || '',
        getCategoryLabel(eventCategory),
      ]
        .join(' ')
        .toLowerCase();

      return haystack.includes(normalizedSearch);
    });
  }, [categoryFilter, events, searchTerm, severityFilter]);

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-2 border-slate-200 border-t-emerald-600" />
          <p className="text-sm font-medium text-slate-500">Carregando Centro de Seguranca...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.24em] text-emerald-600">Centro de Seguranca</p>
            <h1 className="mt-2 text-3xl font-black text-slate-900">Monitoramento de acessos e abuso da aplicacao</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-500">
              Aqui voce acompanha login admin, MFA, rate limiting, tentativas bloqueadas, rotas mais visadas e
              sinais de abuso capturados pela propria plataforma.
            </p>
          </div>
          <div className="rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 shadow-sm">
            <div className="flex items-center gap-2 font-semibold text-slate-800">
              <Wifi className="h-4 w-4 text-emerald-600" />
              {realtimeStatus === 'live' ? 'Atualizacao em tempo real ativa' : 'Fallback por polling ativo'}
            </div>
            <p className="mt-1 text-xs text-slate-500">Ultima leitura: {formatDateTime(lastUpdatedAt || overview.generatedAt)}</p>
          </div>
        </div>

        <div className="mt-5 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap gap-2">
            {PERIOD_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setWindowDays(option.value)}
                className={`rounded-2xl px-4 py-2 text-sm font-semibold transition ${
                  windowDays === option.value
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'border border-slate-200 bg-white text-slate-600 hover:border-emerald-200 hover:text-emerald-700'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap gap-3">
            <select
              value={severityFilter}
              onChange={(event) => setSeverityFilter(event.target.value as SecuritySeverity)}
              className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 outline-none transition focus:border-emerald-400"
            >
              {SEVERITY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>

            <select
              value={categoryFilter}
              onChange={(event) => setCategoryFilter(event.target.value as SecurityCategory)}
              className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 outline-none transition focus:border-emerald-400"
            >
              {CATEGORY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>

            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Buscar por e-mail, IP, rota ou motivo"
              className="min-w-[240px] rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 outline-none transition focus:border-emerald-400"
            />

            <button
              type="button"
              onClick={() => void loadSecurityCenter(false)}
              className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-emerald-200 hover:text-emerald-700"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
              Atualizar
            </button>
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-4 md:grid-cols-2">
        <SummaryCard
          icon={ShieldAlert}
          label="Bloqueios"
          value={String(overview.summary.blockedEvents)}
          helper="Eventos bloqueados pela aplicacao no periodo"
          tone="danger"
        />
        <SummaryCard
          icon={Activity}
          label="Falhas de login admin"
          value={String(overview.summary.adminLoginFailures)}
          helper="Credenciais invalidas ou acessos administrativos recusados"
          tone="warning"
        />
        <SummaryCard
          icon={KeyRound}
          label="Captcha + MFA"
          value={String(overview.summary.captchaFailures + overview.summary.mfaFailures)}
          helper="Falhas em captcha e em autenticacao de dois fatores"
          tone="warning"
        />
        <SummaryCard
          icon={TimerReset}
          label="Rate limiting"
          value={String(overview.summary.rateLimitedEvents)}
          helper="Acionamentos de limite por tentativa excessiva"
          tone="success"
        />
      </section>

      <section className="grid gap-6 2xl:grid-cols-[1.6fr_1fr]">
        <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-500">Tendencia</p>
              <h2 className="mt-2 text-xl font-black text-slate-900">Eventos de seguranca na janela selecionada</h2>
            </div>
            <div className="rounded-2xl bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-500">
              {windowDays === 1 ? 'Por hora' : 'Por dia'}
            </div>
          </div>

          <div className="mt-6 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={overview.trend}>
                <defs>
                  <linearGradient id="securityEventsGradient" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.34} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="securityBlockedGradient" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.28} />
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#e2e8f0" strokeDasharray="4 4" vertical={false} />
                <XAxis dataKey="bucket" tick={{ fill: '#64748b', fontSize: 12 }} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{
                    borderRadius: 16,
                    border: '1px solid #e2e8f0',
                    boxShadow: '0 18px 40px -24px rgba(15, 23, 42, 0.26)',
                  }}
                />
                <Area type="monotone" dataKey="events" stroke="#10b981" fill="url(#securityEventsGradient)" strokeWidth={3} />
                <Area type="monotone" dataKey="blocked" stroke="#ef4444" fill="url(#securityBlockedGradient)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-500">Cobertura atual</p>
            <h2 className="mt-2 text-xl font-black text-slate-900">O que ja esta sendo monitorado</h2>
            <ul className="mt-4 space-y-3 text-sm leading-6 text-slate-600">
              <li>- Login admin, captcha, MFA e bloqueios por excesso de tentativas.</li>
              <li>- Acessos recusados a rotas e functions protegidas por permissao.</li>
              <li>- Rate limiting e abuso em endpoints instrumentados da aplicacao.</li>
              <li>- Bloqueios de SSRF e sinais de uso suspeito em funcoes criticas.</li>
            </ul>
            <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-medium text-amber-800">
              DDoS de infraestrutura e regras de WAF/edge ainda dependem de integracao com o provedor externo
              (ex.: Vercel, Cloudflare).
            </div>
          </div>

          <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-500">Saude rapida</p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">IPs unicos</p>
                <p className="mt-2 text-2xl font-black text-slate-900">{overview.summary.suspiciousIps}</p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Rotas atingidas</p>
                <p className="mt-2 text-2xl font-black text-slate-900">{overview.summary.uniqueRoutes}</p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Emails visados</p>
                <p className="mt-2 text-2xl font-black text-slate-900">{overview.summary.targetedEmails}</p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Ultimo evento</p>
                <p className="mt-2 text-sm font-bold text-slate-900">{formatDateTime(overview.summary.lastEventAt)}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-3">
        <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-2 text-slate-900">
            <Shield className="h-5 w-5 text-emerald-600" />
            <h3 className="text-lg font-black">Top IPs</h3>
          </div>
          <div className="mt-5 space-y-4">
            {overview.topIps.length === 0 ? (
              <p className="text-sm text-slate-500">Sem eventos suficientes nesta janela.</p>
            ) : (
              overview.topIps.map((item) => (
                <div key={`ip-${item.ip}`} className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="truncate text-sm font-bold text-slate-900">{item.ip}</p>
                    <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-slate-600 shadow-sm">
                      {item.events} eventos
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-slate-500">
                    {item.blocked || 0} bloqueios · ultimo visto {timeAgo(item.lastSeenAt || null)}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-2 text-slate-900">
            <Route className="h-5 w-5 text-sky-600" />
            <h3 className="text-lg font-black">Rotas mais visadas</h3>
          </div>
          <div className="mt-5 space-y-4">
            {overview.topRoutes.length === 0 ? (
              <p className="text-sm text-slate-500">Sem rotas atacadas no periodo.</p>
            ) : (
              overview.topRoutes.map((item) => (
                <div key={`route-${item.route}`} className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-bold text-slate-900">{item.route}</p>
                    <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-slate-600 shadow-sm">
                      {item.events}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-slate-500">{item.blocked || 0} bloqueios nessa rota</p>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-2 text-slate-900">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            <h3 className="text-lg font-black">Acoes e emails mais atingidos</h3>
          </div>
          <div className="mt-5 space-y-3">
            {overview.topActions.slice(0, 4).map((item) => (
              <div key={`action-${item.action}`} className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="truncate text-sm font-bold text-slate-900">{item.action}</p>
                  <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-slate-600 shadow-sm">
                    {item.events}
                  </span>
                </div>
                <p className="mt-2 text-xs text-slate-500">{item.criticalOrBlocked || 0} criticos/bloqueados</p>
              </div>
            ))}

            {overview.topTargetedEmails.slice(0, 3).map((item) => (
              <div key={`email-${item.email}`} className="rounded-2xl border border-dashed border-slate-200 px-4 py-3">
                <p className="truncate text-sm font-semibold text-slate-900">{item.email}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {item.events} eventos · {item.blocked || 0} bloqueios
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-500">Feed recente</p>
            <h2 className="mt-2 text-xl font-black text-slate-900">Ultimos eventos de seguranca</h2>
          </div>
          <p className="text-sm text-slate-500">{filteredEvents.length} evento(s) apos filtros locais</p>
        </div>

        <div className="mt-6 overflow-hidden rounded-3xl border border-slate-200">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr className="text-left text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
                  <th className="px-4 py-3">Horario</th>
                  <th className="px-4 py-3">Severidade</th>
                  <th className="px-4 py-3">Categoria</th>
                  <th className="px-4 py-3">Acao</th>
                  <th className="px-4 py-3">Origem</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Motivo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {filteredEvents.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-sm text-slate-500">
                      Nenhum evento encontrado com os filtros atuais.
                    </td>
                  </tr>
                ) : (
                  filteredEvents.map((event) => {
                    const category = getCategory(event);

                    return (
                      <tr key={event.id} className="align-top">
                        <td className="px-4 py-4 text-sm font-medium text-slate-700">
                          <div>{formatDateTime(event.created_at)}</div>
                          <div className="mt-1 text-xs text-slate-400">{timeAgo(event.created_at)}</div>
                        </td>
                        <td className="px-4 py-4">
                          <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold capitalize ${getSeverityClasses(event.severity)}`}>
                            {event.severity}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-sm font-semibold text-slate-700">{getCategoryLabel(category)}</td>
                        <td className="px-4 py-4 text-sm font-semibold text-slate-900">{event.attempted_action || 'sem_acao'}</td>
                        <td className="px-4 py-4 text-sm text-slate-600">
                          <div className="font-semibold text-slate-800">{event.ip_address || 'desconhecido'}</div>
                          <div className="mt-1 max-w-[260px] truncate text-xs text-slate-400">{event.attempted_route}</div>
                        </td>
                        <td className="px-4 py-4 text-sm text-slate-600">{event.email || 'anonimo'}</td>
                        <td className="px-4 py-4 text-sm text-slate-600">
                          <div className="max-w-[360px]">{event.reason || 'Sem detalhe adicional.'}</div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
};

export default SecurityCenter;
