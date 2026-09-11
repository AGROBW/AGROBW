import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertCircle,
  DollarSign,
  Eye,
  PieChart as PieChartIcon,
  RefreshCw,
  Save,
  ShoppingBag,
  Target,
  TrendingDown,
  TrendingUp,
  UserPlus,
  Users,
} from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { supabase } from '../../src/lib/supabaseClient';
import { appError } from '../../src/utils/appLogger';

type DashboardPeriodDays = 7 | 15 | 30;
type DashboardSection = 'financial' | 'acquisition' | 'platform';

type DashboardErrors = Record<DashboardSection, string | null>;

interface RevenueByPlanItem {
  name: string;
  revenue: number;
  percentage: number;
  customers: number;
}

interface FinancialMetrics {
  confirmedRevenue: number;
  averageTicket: number;
  payingCustomers: number;
  financialChurn: number;
  revenueByPlan: RevenueByPlanItem[];
}

interface AcquisitionMetrics {
  cac: number;
  registrationRate: number;
  paidConversionRate: number;
  customerChurn: number;
  marketingCostInPeriod: number;
  newPaidCustomers: number;
  newUsers: number;
  uniqueVisitors: number;
}

interface PlatformMetrics {
  uniqueVisitors: number;
  publishedAds: number;
  activeAdsCurrent: number;
}

interface MarketingCostRow {
  month_year: string;
  total_cost: number | string | null;
}

const PLAN_COLORS = ['#10b981', '#2563eb', '#7c3aed', '#f59e0b', '#ef4444', '#14b8a6'];
const PERIOD_OPTIONS: { value: DashboardPeriodDays; label: string }[] = [
  { value: 7, label: 'Semanal' },
  { value: 15, label: 'Quinzenal' },
  { value: 30, label: 'Mensal' },
];

const formatCurrency = (value: number) =>
  value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
  });

const formatInteger = (value: number) => value.toLocaleString('pt-BR');

const formatPercent = (value: number) => `${value.toFixed(2)}%`;

const normalizePlanLabel = (label: string) =>
  label
    .replace(/\s+/g, ' ')
    .trim();

const toDateOnly = (value: Date) => value.toISOString().split('T')[0];

const startOfMonth = (value: Date) => {
  const result = new Date(value);
  result.setDate(1);
  result.setHours(0, 0, 0, 0);
  return result;
};

const endOfMonth = (value: Date) => {
  const result = new Date(value.getFullYear(), value.getMonth() + 1, 0);
  result.setHours(23, 59, 59, 999);
  return result;
};

const diffInDaysInclusive = (start: Date, end: Date) =>
  Math.floor((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1;

const getOverlapDays = (aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) => {
  const start = Math.max(aStart.getTime(), bStart.getTime());
  const end = Math.min(aEnd.getTime(), bEnd.getTime());

  if (end < start) {
    return 0;
  }

  return diffInDaysInclusive(new Date(start), new Date(end));
};

const EMPTY_DASHBOARD_ERRORS: DashboardErrors = {
  financial: null,
  acquisition: null,
  platform: null,
};

const assertQuerySucceeded = (
  error: { message?: string } | null,
  metricSource: string
) => {
  if (error) {
    throw new Error(`${metricSource}: ${error.message ?? 'consulta indisponivel'}`);
  }
};

const getPeriodRange = (days: DashboardPeriodDays) => {
  const rangeEnd = new Date();
  rangeEnd.setHours(23, 59, 59, 999);

  const rangeStart = new Date();
  rangeStart.setHours(0, 0, 0, 0);
  rangeStart.setDate(rangeStart.getDate() - (days - 1));

  return {
    rangeStart,
    rangeEnd,
    rangeStartIso: rangeStart.toISOString(),
    rangeEndIso: rangeEnd.toISOString(),
  };
};

const getProratedMarketingCost = (
  rows: MarketingCostRow[],
  rangeStart: Date,
  rangeEnd: Date
) =>
  rows.reduce((total, row) => {
    if (!row.month_year) {
      return total;
    }

    const monthStart = new Date(`${row.month_year}T00:00:00`);
    if (Number.isNaN(monthStart.getTime())) {
      return total;
    }

    const monthEnd = endOfMonth(monthStart);
    const overlapDays = getOverlapDays(monthStart, monthEnd, rangeStart, rangeEnd);
    if (overlapDays <= 0) {
      return total;
    }

    const daysInMonth = diffInDaysInclusive(monthStart, monthEnd);
    return total + Number(row.total_cost ?? 0) * (overlapDays / daysInMonth);
  }, 0);

const getCurrentMonthKey = () => `${new Date().toISOString().slice(0, 7)}-01`;

const AdminDashboardOverview: React.FC = () => {
  const [selectedPeriod, setSelectedPeriod] = useState<DashboardPeriodDays>(30);
  const [loading, setLoading] = useState(true);
  const [financialMetrics, setFinancialMetrics] = useState<FinancialMetrics | null>(null);
  const [acquisitionMetrics, setAcquisitionMetrics] = useState<AcquisitionMetrics | null>(null);
  const [platformMetrics, setPlatformMetrics] = useState<PlatformMetrics | null>(null);
  const [marketingCostInput, setMarketingCostInput] = useState('');
  const [savingCost, setSavingCost] = useState(false);
  const [dashboardErrors, setDashboardErrors] = useState<DashboardErrors>(EMPTY_DASHBOARD_ERRORS);

  const selectedPeriodLabel = useMemo(
    () => PERIOD_OPTIONS.find((option) => option.value === selectedPeriod)?.label ?? 'Mensal',
    [selectedPeriod]
  );
  const selectedPeriodHelper = useMemo(
    () => `nos ultimos ${selectedPeriod} dias`,
    [selectedPeriod]
  );
  const failedSections = Object.values(dashboardErrors).filter(Boolean);
  const metricValue = (section: DashboardSection, value: string) =>
    dashboardErrors[section] ? '--' : value;

  useEffect(() => {
    void loadAllMetrics(selectedPeriod);
  }, [selectedPeriod]);

  const loadAllMetrics = async (periodDays: DashboardPeriodDays) => {
    setLoading(true);
    setDashboardErrors(EMPTY_DASHBOARD_ERRORS);
    try {
      const uniqueVisitorsPromise = loadUniqueVisitors(periodDays);
      await Promise.all([
        loadFinancialMetrics(periodDays),
        loadAcquisitionMetrics(periodDays, uniqueVisitorsPromise),
        loadPlatformMetrics(periodDays, uniqueVisitorsPromise),
      ]);
    } catch (error) {
      appError('[Dashboard BI] Erro ao carregar metricas', error, {
        periodDays,
      });
    } finally {
      setLoading(false);
    }
  };

  const loadUniqueVisitors = async (periodDays: DashboardPeriodDays) => {
    const result = await supabase.rpc('get_site_analytics_summary', {
      p_period_days: periodDays,
    });

    assertQuerySucceeded(result.error, 'Analytics do portal');
    return Number(result.data?.[0]?.unique_visitors ?? 0);
  };

  const loadFinancialMetrics = async (periodDays: DashboardPeriodDays) => {
    try {
      const { rangeStart, rangeEnd, rangeStartIso, rangeEndIso } = getPeriodRange(periodDays);

      const [paymentsResult, startingBaseResult, churnResult] =
        await Promise.all([
          supabase
            .from('payments')
            .select('user_id, amount, plan_id, paid_at, created_at, status')
            .eq('status', 'approved')
            .gte('paid_at', rangeStartIso)
            .lte('paid_at', rangeEndIso),
          supabase
            .from('subscription_history')
            .select('user_id, mrr_contribution')
            .gt('plan_monthly_price', 0)
            .lte('period_start', rangeStartIso)
            .gte('period_end', rangeStartIso)
            .in('status', ['active', 'trialing', 'past_due']),
          supabase
            .from('subscription_history')
            .select('mrr_contribution')
            .gt('plan_monthly_price', 0)
            .in('event_type', ['canceled', 'expired'])
            .gte('created_at', rangeStart.toISOString())
            .lte('created_at', rangeEnd.toISOString()),
        ]);

      assertQuerySucceeded(paymentsResult.error, 'Pagamentos');
      assertQuerySucceeded(startingBaseResult.error, 'Base de assinaturas');
      assertQuerySucceeded(churnResult.error, 'Churn financeiro');

      const paymentsData = paymentsResult.data;
      const startingBaseRows = startingBaseResult.data;
      const churnRows = churnResult.data;

      const filteredPayments = paymentsData ?? [];

      const confirmedRevenue = filteredPayments.reduce(
        (sum, payment) => sum + Number(payment.amount ?? 0),
        0
      );

      const planPayments = filteredPayments.filter((payment) => payment.plan_id);
      const payingCustomers = new Set(
        filteredPayments
          .map((payment) => payment.user_id)
          .filter(Boolean)
      ).size;

      const averageTicket = payingCustomers > 0 ? confirmedRevenue / payingCustomers : 0;

      const startingMRR =
        startingBaseRows?.reduce(
          (sum, row) => sum + Number(row.mrr_contribution ?? 0),
          0
        ) ?? 0;
      const churnedMRR =
        churnRows?.reduce(
          (sum, row) => sum + Number(row.mrr_contribution ?? 0),
          0
        ) ?? 0;
      const financialChurn = startingMRR > 0 ? (churnedMRR / startingMRR) * 100 : 0;

      const revenueByPlanAccumulator = new Map<
        string,
        { revenue: number; customers: Set<string> }
      >();

      for (const payment of planPayments) {
        const planId = payment.plan_id as string;
        const existing = revenueByPlanAccumulator.get(planId) ?? {
          revenue: 0,
          customers: new Set<string>(),
        };

        existing.revenue += Number(payment.amount ?? 0);
        if (payment.user_id) {
          existing.customers.add(payment.user_id as string);
        }

        revenueByPlanAccumulator.set(planId, existing);
      }

      const planIds = Array.from(revenueByPlanAccumulator.keys());
      let planNameMap = new Map<string, string>();

      if (planIds.length > 0) {
        const plansResult = await supabase
          .from('plans')
          .select('id, name')
          .in('id', planIds);

        assertQuerySucceeded(plansResult.error, 'Planos');
        const plansData = plansResult.data;

        planNameMap = new Map(
          (plansData ?? []).map((plan) => [plan.id as string, normalizePlanLabel(plan.name ?? 'Plano')])
        );
      }

      const revenueByPlan = Array.from(revenueByPlanAccumulator.entries())
        .map(([planId, item]) => ({
          name: planNameMap.get(planId) ?? 'Plano removido',
          revenue: item.revenue,
          percentage: confirmedRevenue > 0 ? (item.revenue / confirmedRevenue) * 100 : 0,
          customers: item.customers.size,
        }))
        .filter((item) => item.revenue > 0)
        .sort((a, b) => b.revenue - a.revenue);

      setFinancialMetrics({
        confirmedRevenue,
        averageTicket,
        payingCustomers,
        financialChurn,
        revenueByPlan,
      });
    } catch (error) {
      setFinancialMetrics(null);
      setDashboardErrors((current) => ({
        ...current,
        financial: 'Nao foi possivel carregar os indicadores financeiros.',
      }));
      appError('[Dashboard BI] Erro ao carregar metricas financeiras', error, {
        periodDays,
      });
    }
  };

  const loadAcquisitionMetrics = async (
    periodDays: DashboardPeriodDays,
    sharedUniqueVisitors?: Promise<number>
  ) => {
    try {
      setDashboardErrors((current) => ({ ...current, acquisition: null }));
      const { rangeStart, rangeEnd, rangeStartIso, rangeEndIso } = getPeriodRange(periodDays);
      const currentMonthKey = getCurrentMonthKey();
      const firstTouchedMonthKey = toDateOnly(startOfMonth(rangeStart));
      const lastTouchedMonthKey = toDateOnly(startOfMonth(rangeEnd));

      const [
        newUsersResult,
        uniqueVisitors,
        recentPaidResult,
        startingCustomerResult,
        churnedCustomerResult,
        marketingCostResult,
        currentMonthCostResult,
      ] = await Promise.all([
        supabase
          .from('users')
          .select('*', { count: 'exact', head: true })
          .gte('created_at', rangeStartIso)
          .lte('created_at', rangeEndIso),
        sharedUniqueVisitors ?? loadUniqueVisitors(periodDays),
        supabase
          .from('payments')
          .select('user_id')
          .eq('status', 'approved')
          .gte('paid_at', rangeStartIso)
          .lte('paid_at', rangeEndIso),
        supabase
          .from('subscription_history')
          .select('user_id')
          .gt('plan_monthly_price', 0)
          .lte('period_start', rangeStartIso)
          .gte('period_end', rangeStartIso)
          .in('status', ['active', 'trialing', 'past_due']),
        supabase
          .from('subscription_history')
          .select('user_id')
          .gt('plan_monthly_price', 0)
          .in('event_type', ['canceled', 'expired'])
          .gte('created_at', rangeStartIso)
          .lte('created_at', rangeEndIso),
        supabase
          .from('marketing_costs')
          .select('month_year, total_cost')
          .gte('month_year', firstTouchedMonthKey)
          .lte('month_year', lastTouchedMonthKey),
        supabase
          .from('marketing_costs')
          .select('total_cost')
          .eq('month_year', currentMonthKey)
          .maybeSingle(),
      ]);


      assertQuerySucceeded(newUsersResult.error, 'Novos usuarios');
      assertQuerySucceeded(recentPaidResult.error, 'Novos clientes pagantes');
      assertQuerySucceeded(startingCustomerResult.error, 'Base inicial de clientes');
      assertQuerySucceeded(churnedCustomerResult.error, 'Churn de clientes');
      assertQuerySucceeded(marketingCostResult.error, 'Custos de marketing');
      assertQuerySucceeded(currentMonthCostResult.error, 'Custo de marketing atual');

      const newUsers = Number(newUsersResult.count ?? 0);
      const recentPaidRows = recentPaidResult.data;
      const startingCustomerRows = startingCustomerResult.data;
      const churnedCustomerRows = churnedCustomerResult.data;
      const marketingCostRows = marketingCostResult.data;
      const currentMonthCostRow = currentMonthCostResult.data;
      const newPaidCustomers = new Set(
        (recentPaidRows ?? [])
          .map((row) => row.user_id as string | null)
          .filter(Boolean)
      ).size;
      const activeCustomersAtStart = new Set(
        (startingCustomerRows ?? [])
          .map((row) => row.user_id as string | null)
          .filter(Boolean)
      ).size;
      const churnedCustomers = new Set(
        (churnedCustomerRows ?? [])
          .map((row) => row.user_id as string | null)
          .filter(Boolean)
      ).size;

      const marketingCostInPeriod = getProratedMarketingCost(
        ((marketingCostRows ?? []) as MarketingCostRow[]),
        rangeStart,
        rangeEnd
      );

      const currentMonthCost = Number(currentMonthCostRow?.total_cost ?? 0);
      setMarketingCostInput(currentMonthCost.toFixed(2));

      setAcquisitionMetrics({
        cac: newPaidCustomers > 0 ? marketingCostInPeriod / newPaidCustomers : 0,
        registrationRate: uniqueVisitors > 0 ? (newUsers / uniqueVisitors) * 100 : 0,
        paidConversionRate: newUsers > 0 ? (newPaidCustomers / newUsers) * 100 : 0,
        customerChurn:
          activeCustomersAtStart > 0 ? (churnedCustomers / activeCustomersAtStart) * 100 : 0,
        marketingCostInPeriod,
        newPaidCustomers,
        newUsers,
        uniqueVisitors,
      });
    } catch (error) {
      setAcquisitionMetrics(null);
      setDashboardErrors((current) => ({
        ...current,
        acquisition: 'Nao foi possivel carregar os indicadores de aquisicao.',
      }));
      appError('[Dashboard BI] Erro ao carregar metricas de aquisicao', error, {
        periodDays,
      });
    }
  };

  const loadPlatformMetrics = async (
    periodDays: DashboardPeriodDays,
    sharedUniqueVisitors?: Promise<number>
  ) => {
    try {
      setDashboardErrors((current) => ({ ...current, platform: null }));
      const { rangeStartIso, rangeEndIso } = getPeriodRange(periodDays);

      const [publishedAdsResult, activeAdsResult, uniqueVisitors] =
        await Promise.all([
          supabase
            .from('announcements')
            .select('*', { count: 'exact', head: true })
            .gte('created_at', rangeStartIso)
            .lte('created_at', rangeEndIso),
          supabase
            .from('announcements')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'ACTIVE'),
          sharedUniqueVisitors ?? loadUniqueVisitors(periodDays),
        ]);

      assertQuerySucceeded(publishedAdsResult.error, 'Novos anuncios');
      assertQuerySucceeded(activeAdsResult.error, 'Inventario de anuncios');

      setPlatformMetrics({
        uniqueVisitors,
        publishedAds: publishedAdsResult.count ?? 0,
        activeAdsCurrent: activeAdsResult.count ?? 0,
      });
    } catch (error) {
      setPlatformMetrics(null);
      setDashboardErrors((current) => ({
        ...current,
        platform: 'Nao foi possivel carregar os indicadores de trafego e plataforma.',
      }));
      appError('[Dashboard BI] Erro ao carregar metricas de plataforma', error, {
        periodDays,
      });
    }
  };

  const handleSaveMarketingCost = async () => {
    const parsedCost = parseFloat(marketingCostInput);
    if (Number.isNaN(parsedCost) || parsedCost < 0) {
      window.alert('Informe um custo de marketing valido.');
      return;
    }

    setSavingCost(true);
    try {
      const currentMonth = getCurrentMonthKey();
      const { error } = await supabase
        .from('marketing_costs')
        .upsert(
          {
            month_year: currentMonth,
            total_cost: parsedCost,
          },
          { onConflict: 'month_year' }
        );

      if (error) {
        throw error;
      }

      await loadAcquisitionMetrics(selectedPeriod);
      window.alert('Custo de marketing atualizado com sucesso.');
    } catch (error) {
      appError('[Dashboard BI] Erro ao salvar custo de marketing', error, {
        totalCost: parsedCost,
      });
      window.alert('Nao foi possivel salvar o custo de marketing.');
    } finally {
      setSavingCost(false);
    }
  };

  const KPICard: React.FC<{
    title: string;
    value: string;
    subtitle: string;
    icon: React.ReactNode;
    colorClass: string;
    extra?: React.ReactNode;
  }> = ({ title, value, subtitle, icon, colorClass, extra }) => (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition-shadow hover:shadow-lg">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${colorClass}`}>
          {icon}
        </div>
      </div>
      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">{title}</p>
      <p className="mt-2 text-3xl font-black text-slate-900">{value}</p>
      <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
      {extra ? <div className="mt-4">{extra}</div> : null}
    </div>
  );

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-black text-slate-900">Dashboard de BI</h1>
            <p className="mt-1 text-sm text-slate-500">Carregando indicadores estrategicos...</p>
          </div>
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <RefreshCw className="h-4 w-4 animate-spin" />
            Atualizando
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 10 }).map((_, index) => (
            <div
              key={index}
              className="h-44 animate-pulse rounded-2xl border border-slate-200 bg-white"
            />
          ))}
        </div>
      </div>
    );
  }

  const planMix = financialMetrics?.revenueByPlan ?? [];

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 rounded-[30px] border border-slate-200 bg-white px-6 py-6 shadow-[0_24px_80px_-48px_rgba(15,23,42,0.3)] lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.26em] text-emerald-700">
            <Activity className="h-3.5 w-3.5" />
            Dashboard administrativo
          </div>
          <h1 className="mt-4 text-3xl font-black text-slate-900">Dashboard de BI</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
            Indicadores financeiros, de aquisicao e de plataforma atualizados em janela {selectedPeriodLabel.toLowerCase()}.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-1.5">
            {PERIOD_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setSelectedPeriod(option.value)}
                className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
                  selectedPeriod === option.value
                    ? 'bg-slate-950 text-white'
                    : 'text-slate-600 hover:bg-white'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => void loadAllMetrics(selectedPeriod)}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-slate-800"
          >
            <RefreshCw className="h-4 w-4" />
            Atualizar
          </button>
        </div>
      </div>

      {failedSections.length > 0 ? (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-amber-900"
        >
          <AlertCircle className="mt-0.5 h-5 w-5 flex-none" />
          <div>
            <p className="font-bold">Alguns indicadores estao indisponiveis</p>
            <p className="mt-1 text-sm">
              {failedSections.join(' ')} Atualize novamente; os campos afetados aparecem como -- para nao confundir falha de consulta com valor zero.
            </p>
          </div>
        </div>
      ) : null}

      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <DollarSign className="h-5 w-5 text-emerald-600" />
          <h2 className="text-xl font-black text-slate-900">Financeiro</h2>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
          <KPICard
            title="Receita Confirmada"
            value={metricValue('financial', formatCurrency(financialMetrics?.confirmedRevenue ?? 0))}
            subtitle={`Pagamentos aprovados ${selectedPeriodHelper}`}
            icon={<TrendingUp className="h-6 w-6 text-emerald-700" />}
            colorClass="bg-emerald-100"
          />

          <KPICard
            title="Ticket Medio Pago"
            value={metricValue('financial', formatCurrency(financialMetrics?.averageTicket ?? 0))}
            subtitle={`${formatInteger(financialMetrics?.payingCustomers ?? 0)} cliente(s) pagante(s) ${selectedPeriodHelper}`}
            icon={<Users className="h-6 w-6 text-violet-700" />}
            colorClass="bg-violet-100"
          />

          <KPICard
            title="Clientes Pagantes"
            value={metricValue('financial', formatInteger(financialMetrics?.payingCustomers ?? 0))}
            subtitle={`Usuarios com pagamento aprovado ${selectedPeriodHelper}`}
            icon={<DollarSign className="h-6 w-6 text-blue-700" />}
            colorClass="bg-blue-100"
          />

          <KPICard
            title="Churn Financeiro"
            value={metricValue('financial', formatPercent(financialMetrics?.financialChurn ?? 0))}
            subtitle="MRR perdida sobre a base paga no inicio do periodo"
            icon={<TrendingDown className="h-6 w-6 text-rose-700" />}
            colorClass="bg-rose-100"
          />
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <PieChartIcon className="h-5 w-5 text-amber-600" />
              <h3 className="text-lg font-black text-slate-900">Receita por Plano</h3>
            </div>
            <p className="mb-4 text-sm text-slate-500">
              Distribuicao da receita confirmada entre os planos vendidos {selectedPeriodHelper}.
            </p>

            {planMix.length > 0 ? (
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie
                    data={planMix}
                    dataKey="revenue"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={52}
                    outerRadius={88}
                    paddingAngle={3}
                  >
                    {planMix.map((item, index) => (
                      <Cell key={item.name} fill={PLAN_COLORS[index % PLAN_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: number) => formatCurrency(Number(value))}
                    labelFormatter={(label) => `Plano: ${label}`}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-[260px] items-center justify-center text-sm text-slate-400">
                {dashboardErrors.financial
                  ? 'Dados financeiros indisponiveis neste momento.'
                  : 'Sem dados suficientes para distribuir a receita por plano neste periodo.'}
              </div>
            )}
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-6 py-4">
              <h3 className="text-lg font-black text-slate-900">Detalhamento por plano</h3>
              <p className="mt-1 text-sm text-slate-500">
                Receita, participacao e clientes por plano {selectedPeriodHelper}.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                      Plano
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                      Clientes
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                      Receita
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                      % do periodo
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {planMix.length > 0 ? (
                    planMix.map((plan) => (
                      <tr key={plan.name} className="hover:bg-slate-50">
                        <td className="px-6 py-4 text-sm font-semibold text-slate-900">
                          {plan.name}
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-600">
                          {formatInteger(plan.customers)}
                        </td>
                        <td className="px-6 py-4 text-sm font-bold text-emerald-600">
                          {formatCurrency(plan.revenue)}
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-600">
                          {plan.percentage.toFixed(2)}%
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} className="px-6 py-10 text-center text-sm text-slate-400">
                        {dashboardErrors.financial
                          ? 'Dados financeiros indisponiveis neste momento.'
                          : 'Nenhum plano com pagamento aprovado neste periodo.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Target className="h-5 w-5 text-blue-600" />
          <h2 className="text-xl font-black text-slate-900">Aquisicao e Conversao</h2>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
          <KPICard
            title="CAC Estimado"
            value={metricValue('acquisition', formatCurrency(acquisitionMetrics?.cac ?? 0))}
            subtitle={`${formatInteger(acquisitionMetrics?.newPaidCustomers ?? 0)} novo(s) cliente(s) pagante(s) ${selectedPeriodHelper}`}
            icon={<DollarSign className="h-6 w-6 text-orange-700" />}
            colorClass="bg-orange-100"
            extra={
              <div className="space-y-2 border-t border-slate-200 pt-4">
                <p className="text-xs text-slate-500">
                  Base rateada usada no periodo: {formatCurrency(acquisitionMetrics?.marketingCostInPeriod ?? 0)}
                </p>
                <label className="block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Custo de marketing do mes atual
                </label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    value={marketingCostInput}
                    onChange={(event) => setMarketingCostInput(event.target.value)}
                    className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-200"
                    placeholder="0,00"
                  />
                  <button
                    type="button"
                    onClick={() => void handleSaveMarketingCost()}
                    disabled={savingCost}
                    className="inline-flex items-center justify-center rounded-xl bg-orange-600 px-3 text-white transition-colors hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {savingCost ? (
                      <RefreshCw className="h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>
            }
          />

          <KPICard
            title="Taxa de Cadastro"
            value={metricValue('acquisition', formatPercent(acquisitionMetrics?.registrationRate ?? 0))}
            subtitle={`${formatInteger(acquisitionMetrics?.newUsers ?? 0)} cadastro(s) sobre ${formatInteger(acquisitionMetrics?.uniqueVisitors ?? 0)} visitante(s) ${selectedPeriodHelper}`}
            icon={<UserPlus className="h-6 w-6 text-emerald-700" />}
            colorClass="bg-emerald-100"
          />

          <KPICard
            title="Conversao para Pago"
            value={metricValue('acquisition', formatPercent(acquisitionMetrics?.paidConversionRate ?? 0))}
            subtitle={`${formatInteger(acquisitionMetrics?.newPaidCustomers ?? 0)} cliente(s) pagos sobre ${formatInteger(acquisitionMetrics?.newUsers ?? 0)} novo(s) usuario(s)`}
            icon={<TrendingUp className="h-6 w-6 text-blue-700" />}
            colorClass="bg-blue-100"
          />

          <KPICard
            title="Churn de Clientes"
            value={metricValue('acquisition', formatPercent(acquisitionMetrics?.customerChurn ?? 0))}
            subtitle="Clientes perdidos sobre a base paga no inicio do periodo"
            icon={<TrendingDown className="h-6 w-6 text-rose-700" />}
            colorClass="bg-rose-100"
          />
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-purple-600" />
          <h2 className="text-xl font-black text-slate-900">Trafego e Plataforma</h2>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <KPICard
            title="Visitantes do Site"
            value={metricValue('platform', formatInteger(platformMetrics?.uniqueVisitors ?? 0))}
            subtitle={`Visitantes unicos acumulados ${selectedPeriodHelper}`}
            icon={<Eye className="h-6 w-6 text-indigo-700" />}
            colorClass="bg-indigo-100"
          />

          <KPICard
            title="Novos Anuncios"
            value={metricValue('platform', formatInteger(platformMetrics?.publishedAds ?? 0))}
            subtitle={`Novos anuncios cadastrados ${selectedPeriodHelper}`}
            icon={<ShoppingBag className="h-6 w-6 text-purple-700" />}
            colorClass="bg-purple-100"
            extra={
              <div className="rounded-xl bg-slate-50 px-3 py-2 text-xs font-medium text-slate-500">
                Inventario ativo atual: {formatInteger(platformMetrics?.activeAdsCurrent ?? 0)} anuncio(s)
              </div>
            }
          />
        </div>
      </section>
    </div>
  );
};

export default AdminDashboardOverview;
