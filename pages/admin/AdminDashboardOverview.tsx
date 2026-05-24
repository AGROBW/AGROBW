import React, { useEffect, useState } from 'react';
import {
  Activity,
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

interface RevenueByPlanItem {
  name: string;
  mrr: number;
  percentage: number;
  activeUsers: number;
}

interface FinancialMetrics {
  mrr: number;
  recurringArpa: number;
  totalRevenue: number;
  financialChurn: number;
  activePaidCustomers: number;
  revenueByPlan: RevenueByPlanItem[];
}

interface AcquisitionMetrics {
  cac: number;
  registrationRate: number;
  paidConversionRate: number;
  customerChurn: number;
  monthlyMarketingCost: number;
  newPaidCustomers30d: number;
  newUsers30d: number;
  uniqueVisitors30d: number;
}

interface PlatformMetrics {
  activeAds: number;
  uniqueVisitors30d: number;
}

const PLAN_COLORS = ['#10b981', '#2563eb', '#7c3aed', '#f59e0b', '#ef4444', '#14b8a6'];

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

const AdminDashboardOverview: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [financialMetrics, setFinancialMetrics] = useState<FinancialMetrics | null>(null);
  const [acquisitionMetrics, setAcquisitionMetrics] = useState<AcquisitionMetrics | null>(null);
  const [platformMetrics, setPlatformMetrics] = useState<PlatformMetrics | null>(null);
  const [marketingCostInput, setMarketingCostInput] = useState('');
  const [savingCost, setSavingCost] = useState(false);

  useEffect(() => {
    void loadAllMetrics();
  }, []);

  const loadAllMetrics = async () => {
    setLoading(true);
    try {
      await Promise.all([
        loadFinancialMetrics(),
        loadAcquisitionMetrics(),
        loadPlatformMetrics(),
      ]);
    } catch (error) {
      appError('[Dashboard BI] Erro ao carregar metricas', error);
    } finally {
      setLoading(false);
    }
  };

  const loadFinancialMetrics = async () => {
    try {
      const [{ data: mrrData }, { data: revenueByPlanData }, { data: paymentsData }, { data: churnData }] =
        await Promise.all([
          supabase
            .from('v_mrr_monthly')
            .select('*')
            .order('month_year', { ascending: false })
            .limit(1)
            .single(),
          supabase.from('v_revenue_by_plan').select('*'),
          supabase.from('payments').select('amount').eq('status', 'approved'),
          supabase
            .from('v_churn_monthly')
            .select('*')
            .order('month_year', { ascending: false })
            .limit(1)
            .single(),
        ]);

      const currentMRR = Number(mrrData?.total_mrr ?? 0);
      const activePaidCustomers = Number(mrrData?.active_subscribers ?? 0);
      const recurringArpa = activePaidCustomers > 0 ? currentMRR / activePaidCustomers : 0;
      const totalRevenue =
        paymentsData?.reduce((sum, item) => sum + Number(item.amount ?? 0), 0) ?? 0;

      const revenueByPlan = (revenueByPlanData ?? [])
        .map((item) => ({
          name: normalizePlanLabel(item.plan_name ?? 'Plano'),
          mrr: Number(item.total_mrr ?? 0),
          percentage: Number(item.mrr_percentage ?? 0),
          activeUsers: Number(item.active_users ?? 0),
        }))
        .filter((item) => item.mrr > 0)
        .sort((a, b) => b.mrr - a.mrr);

      setFinancialMetrics({
        mrr: currentMRR,
        recurringArpa,
        totalRevenue,
        financialChurn: Number(churnData?.churn_rate_percentage ?? 0),
        activePaidCustomers,
        revenueByPlan,
      });
    } catch (error) {
      appError('[Dashboard BI] Erro ao carregar metricas financeiras', error);
    }
  };

  const loadAcquisitionMetrics = async () => {
    try {
      const [{ data: cacData }, { data: registrationData }, { data: paidConversionData }, { data: customerChurnData }] =
        await Promise.all([
          supabase
            .from('v_cac_monthly')
            .select('*')
            .order('month_year', { ascending: false })
            .limit(1)
            .single(),
          supabase.from('v_registration_conversion_30d').select('*').single(),
          supabase.from('v_paid_conversion_30d').select('*').single(),
          supabase.from('v_customer_churn_30d').select('*').single(),
        ]);

      const monthlyMarketingCost = Number(cacData?.marketing_cost ?? 0);

      setMarketingCostInput(monthlyMarketingCost.toFixed(2));
      setAcquisitionMetrics({
        cac: Number(cacData?.cac ?? 0),
        registrationRate: Number(registrationData?.registration_rate_percentage ?? 0),
        paidConversionRate: Number(paidConversionData?.conversion_rate_percentage ?? 0),
        customerChurn: Number(customerChurnData?.customer_churn_percentage ?? 0),
        monthlyMarketingCost,
        newPaidCustomers30d: Number(paidConversionData?.new_paid_customers_30d ?? 0),
        newUsers30d: Number(registrationData?.new_users_30d ?? 0),
        uniqueVisitors30d: Number(registrationData?.unique_visitors_30d ?? 0),
      });
    } catch (error) {
      appError('[Dashboard BI] Erro ao carregar metricas de aquisicao', error);
    }
  };

  const loadPlatformMetrics = async () => {
    try {
      const [{ count: activeAdsCount }, { data: visitsData }] = await Promise.all([
        supabase
          .from('announcements')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'ACTIVE'),
        supabase
          .from('website_visits')
          .select('unique_visitors')
          .gte(
            'visit_date',
            new Date(Date.now() - 29 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
          ),
      ]);

      const uniqueVisitors30d =
        visitsData?.reduce((sum, row) => sum + Number(row.unique_visitors ?? 0), 0) ?? 0;

      setPlatformMetrics({
        activeAds: activeAdsCount ?? 0,
        uniqueVisitors30d,
      });
    } catch (error) {
      appError('[Dashboard BI] Erro ao carregar metricas de plataforma', error);
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
      const currentMonth = `${new Date().toISOString().slice(0, 7)}-01`;
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

      await loadAcquisitionMetrics();
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
            <div key={index} className="h-44 animate-pulse rounded-2xl border border-slate-200 bg-white" />
          ))}
        </div>
      </div>
    );
  }

  const planMix = financialMetrics?.revenueByPlan ?? [];

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900">Dashboard de BI</h1>
          <p className="mt-1 text-sm text-slate-500">
            Indicadores financeiros, de aquisicao e de plataforma para tomada de decisao.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void loadAllMetrics()}
          className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-slate-800"
        >
          <RefreshCw className="h-4 w-4" />
          Atualizar
        </button>
      </div>

      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <DollarSign className="h-5 w-5 text-emerald-600" />
          <h2 className="text-xl font-black text-slate-900">Financeiro</h2>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
          <KPICard
            title="MRR"
            value={formatCurrency(financialMetrics?.mrr ?? 0)}
            subtitle="Receita recorrente mensal ativa"
            icon={<TrendingUp className="h-6 w-6 text-emerald-700" />}
            colorClass="bg-emerald-100"
          />

          <KPICard
            title="ARPA Recorrente"
            value={formatCurrency(financialMetrics?.recurringArpa ?? 0)}
            subtitle={`Media recorrente por ${formatInteger(financialMetrics?.activePaidCustomers ?? 0)} cliente(s) pagante(s)`}
            icon={<Users className="h-6 w-6 text-violet-700" />}
            colorClass="bg-violet-100"
            extra={
              planMix.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {planMix.map((plan) => (
                    <span
                      key={plan.name}
                      className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-700"
                    >
                      {plan.name}: {plan.percentage.toFixed(1)}%
                    </span>
                  ))}
                </div>
              ) : null
            }
          />

          <KPICard
            title="Receita Total Acumulada"
            value={formatCurrency(financialMetrics?.totalRevenue ?? 0)}
            subtitle="Soma historica de pagamentos confirmados"
            icon={<DollarSign className="h-6 w-6 text-blue-700" />}
            colorClass="bg-blue-100"
          />

          <KPICard
            title="Churn Financeiro"
            value={formatPercent(financialMetrics?.financialChurn ?? 0)}
            subtitle="MRR perdida no periodo mais recente"
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
              Distribuicao do MRR recorrente entre os planos pagos ativos.
            </p>

            {planMix.length > 0 ? (
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie
                    data={planMix}
                    dataKey="mrr"
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
                Sem dados suficientes para distribuir MRR por plano.
              </div>
            )}
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-6 py-4">
              <h3 className="text-lg font-black text-slate-900">Detalhamento por plano</h3>
              <p className="mt-1 text-sm text-slate-500">
                MRR, participacao e clientes ativos por plano recorrente.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Plano</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Clientes ativos</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">MRR</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">% do total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {planMix.length > 0 ? (
                    planMix.map((plan) => (
                      <tr key={plan.name} className="hover:bg-slate-50">
                        <td className="px-6 py-4 text-sm font-semibold text-slate-900">{plan.name}</td>
                        <td className="px-6 py-4 text-sm text-slate-600">{formatInteger(plan.activeUsers)}</td>
                        <td className="px-6 py-4 text-sm font-bold text-emerald-600">{formatCurrency(plan.mrr)}</td>
                        <td className="px-6 py-4 text-sm text-slate-600">{plan.percentage.toFixed(2)}%</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} className="px-6 py-10 text-center text-sm text-slate-400">
                        Nenhum plano pago recorrente com MRR ativo no momento.
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
            title="CAC"
            value={formatCurrency(acquisitionMetrics?.cac ?? 0)}
            subtitle={`${formatInteger(acquisitionMetrics?.newPaidCustomers30d ?? 0)} novo(s) cliente(s) pagante(s) no periodo`}
            icon={<DollarSign className="h-6 w-6 text-orange-700" />}
            colorClass="bg-orange-100"
            extra={
              <div className="space-y-2 border-t border-slate-200 pt-4">
                <label className="block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Custo de marketing do mes
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
                    {savingCost ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            }
          />

          <KPICard
            title="Taxa de Cadastro"
            value={formatPercent(acquisitionMetrics?.registrationRate ?? 0)}
            subtitle={`${formatInteger(acquisitionMetrics?.newUsers30d ?? 0)} cadastro(s) sobre ${formatInteger(acquisitionMetrics?.uniqueVisitors30d ?? 0)} visitante(s) nos ultimos 30 dias`}
            icon={<UserPlus className="h-6 w-6 text-emerald-700" />}
            colorClass="bg-emerald-100"
          />

          <KPICard
            title="Conversao para Pago"
            value={formatPercent(acquisitionMetrics?.paidConversionRate ?? 0)}
            subtitle={`${formatInteger(acquisitionMetrics?.newPaidCustomers30d ?? 0)} cliente(s) pagos sobre ${formatInteger(acquisitionMetrics?.newUsers30d ?? 0)} novo(s) usuario(s)`}
            icon={<TrendingUp className="h-6 w-6 text-blue-700" />}
            colorClass="bg-blue-100"
          />

          <KPICard
            title="Churn de Clientes"
            value={formatPercent(acquisitionMetrics?.customerChurn ?? 0)}
            subtitle="Clientes perdidos sobre a base paga no inicio dos ultimos 30 dias"
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
            title="Visitantes do Site (30 dias)"
            value={formatInteger(platformMetrics?.uniqueVisitors30d ?? 0)}
            subtitle="Visitantes unicos acumulados nos ultimos 30 dias"
            icon={<Eye className="h-6 w-6 text-indigo-700" />}
            colorClass="bg-indigo-100"
          />

          <KPICard
            title="Anuncios Ativos"
            value={formatInteger(platformMetrics?.activeAds ?? 0)}
            subtitle="Inventario atual de anuncios ativos na plataforma"
            icon={<ShoppingBag className="h-6 w-6 text-purple-700" />}
            colorClass="bg-purple-100"
          />
        </div>
      </section>
    </div>
  );
};

export default AdminDashboardOverview;
