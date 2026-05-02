/**
 * PAINEL DE BI - DASHBOARD ADMINISTRATIVO
 * 
 * Métricas implementadas:
 * 
 * BLOCO FINANCEIRO (6 KPIs):
 * 1. MRR (Monthly Recurring Revenue)
 * 2. Ticket Médio
 * 3. Receita por Plano (%)
 * 4. Faturamento Total
 * 5. Notas Fiscais
 * 6. Taxa de Churn Financeiro (%)
 * 
 * BLOCO MARKETING E CONVERSÃO (4 KPIs):
 * 7. CAC (Custo de Aquisição de Cliente)
 * 8. Taxa de Conversão Grátis para Pago
 * 9. Taxa de Churn de Clientes
 * 10. Taxa de Conversão de Leads
 * 
 * BLOCO TRÁFEGO E INVENTÁRIO (2 KPIs):
 * 11. Total de Anúncios Ativos
 * 12. Total de Visitas Mensais
 * 
 * BLOCO MODERAÇÃO (2 funcionalidades):
 * 13. Análise de Anúncios (Dashboard)
 * 14. Colocar em Análise (UNDER_REVIEW)
 */

import React, { useState, useEffect } from 'react';
import { 
  DollarSign,
  TrendingUp,
  TrendingDown,
  Users,
  FileText,
  Eye,
  Target,
  PieChart as PieChartIcon,
  AlertCircle,
  ShoppingBag,
  MousePointerClick,
  Receipt,
  Percent,
  Save,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Clock,
  Search,
  Filter,
  ChevronDown,
  Activity
} from 'lucide-react';
import { supabase } from '../../src/lib/supabaseClient';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend } from 'recharts';
import { useAdminAudit } from '../../src/hooks/useAdminAudit';

// ==========================================
// TYPES & INTERFACES
// ==========================================

interface FinancialMetrics {
  mrr: number; // MRR atual
  avgTicket: number; // Ticket médio
  totalRevenue: number; // Faturamento total
  invoiceCount: number; // Número de notas fiscais
  financialChurn: number; // Taxa de churn financeiro (%)
  revenueByPlan: Array<{
name: string;
    mrr: number;
    percentage: number;
    activeUsers: number;
  }>;
}

interface MarketingMetrics {
  cac: number; // CAC
  freeToPaid: number; // Taxa conversão grátis→pago (%)
  customerChurn: number; // Taxa churn de clientes (%)
  leadConversion: number; // Taxa conversão de leads (%)
  monthlyMarketingCost: number; // Custo de marketing (input manual)
  newPaidCustomers: number; // Novos clientes pagantes
}

interface TrafficMetrics {
  totalActiveAds: number; // Anúncios ativos
  monthlyVisits: number; // Visitas mensais
  totalPageViews: number; // Total de page views
  avgSessionDuration: number; // Duração média sessão (segundos)
}

interface ModerationItem {
  id: string;
  title: string;
  user: string;
  category: string;
  createdAt: string;
  status: 'PENDING' | 'UNDER_REVIEW' | 'ACTIVE' | 'REJECTED';
  views: number;
}

// ==========================================
// MAIN COMPONENT
// ==========================================

const AdminDashboardOverview: React.FC = () => {
  // Estado
  const [loading, setLoading] = useState(true);
  const [financialMetrics, setFinancialMetrics] = useState<FinancialMetrics | null>(null);
  const [marketingMetrics, setMarketingMetrics] = useState<MarketingMetrics | null>(null);
  const [trafficMetrics, setTrafficMetrics] = useState<TrafficMetrics | null>(null);
  const [moderationQueue, setModerationQueue] = useState<ModerationItem[]>([]);
  
  // Input manual de custo de marketing
  const [marketingCostInput, setMarketingCostInput] = useState<string>('');
  const [savingCost, setSavingCost] = useState(false);
  
  // Filtros de moderação
  const [moderationFilter, setModerationFilter] = useState<'ALL' | 'PENDING' | 'UNDER_REVIEW'>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  
  // Hook de auditoria
  const { logAction } = useAdminAudit();

  // ==========================================
  // USE EFFECTS
  // ==========================================

  useEffect(() => {
    loadAllMetrics();
  }, []);

  // ==========================================
  // LOAD DATA FUNCTIONS
  // ==========================================

  const loadAllMetrics = async () => {
    setLoading(true);
    try {
      await Promise.all([
        loadFinancialMetrics(),
        loadMarketingMetrics(),
        loadTrafficMetrics(),
        loadModerationQueue()
      ]);
    } catch (error) {
      console.error('[Dashboard] Erro ao carregar métricas:', error);
    } finally {
      setLoading(false);
    }
  };

  // 1. MÉTRICAS FINANCEIRAS
  const loadFinancialMetrics = async () => {
    try {
      // MRR Atual (do mês corrente)
      const { data: mrrData, error: mrrError } = await supabase
        .from('v_mrr_monthly')
        .select('*')
        .order('month_year', { ascending: false })
        .limit(1)
        .single();

      const currentMRR = mrrData?.total_mrr || 0;

      // Receita por Plano
      const { data: revenueByPlan, error: revError } = await supabase
        .from('v_revenue_by_plan')
        .select('*');

      // Ticket Médio = MRR Total / Número de Assinantes Ativos
      const totalActiveSubscribers = mrrData?.active_subscribers || 1;
      const avgTicket = currentMRR / totalActiveSubscribers;

      // Faturamento Total (histórico completo)
      const { data: allHistory } = await supabase
        .from('subscription_history')
        .select('mrr_contribution')
        .eq('was_paid', true);

      const totalRevenue = allHistory?.reduce((sum, item) => sum + Number(item.mrr_contribution), 0) || 0;

      // Número de Notas Fiscais (invoices)
      const { count: invoiceCount } = await supabase
        .from('invoices')
        .select('*', { count: 'exact', head: true });

      // Taxa de Churn Financeiro (mês atual)
      const { data: churnData } = await supabase
        .from('v_churn_monthly')
        .select('*')
        .order('month_year', { ascending: false })
        .limit(1)
        .single();

      const financialChurn = churnData?.churn_rate_percentage || 0;

      setFinancialMetrics({
        mrr: currentMRR,
        avgTicket,
        totalRevenue,
        invoiceCount: invoiceCount || 0,
        financialChurn,
        revenueByPlan: revenueByPlan?.map(item => ({
          name: item.plan_name,
          mrr: Number(item.total_mrr),
          percentage: Number(item.mrr_percentage),
          activeUsers: item.active_users
        })) || []
      });
    } catch (error) {
      console.error('[Dashboard] Erro ao carregar métricas financeiras:', error);
    }
  };

  // 2. MÉTRICAS DE MARKETING
  const loadMarketingMetrics = async () => {
    try {
      // CAC (do mês atual)
      const { data: cacData } = await supabase
        .from('v_cac_monthly')
        .select('*')
        .order('month_year', { ascending: false })
        .limit(1)
        .single();

      const cac = cacData?.cac || 0;
      const monthlyMarketingCost = cacData?.marketing_cost || 0;
      const newPaidCustomers = cacData?.new_paid_customers || 0;

      // Taxa de Conversão Grátis para Pago
      const { data: conversionData } = await supabase
        .from('v_free_to_paid_conversion')
        .select('*')
        .single();

      const freeToPaid = conversionData?.conversion_rate_percentage || 0;

      // Taxa de Churn de Clientes (número de clientes, não MRR)
      const { count: activeThisMonthCount } = await supabase
        .from('user_subscriptions')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'active')
        .gte('current_period_start', new Date(new Date().setDate(1)).toISOString()); // Início do mês

      const activeThisMonth = activeThisMonthCount || 0;

      const { count: churnedCustomersCount } = await supabase
        .from('subscription_history')
        .select('*', { count: 'exact', head: true })
        .in('event_type', ['canceled', 'expired'])
        .gte('created_at', new Date(new Date().setDate(1)).toISOString());

      const churnedCustomers = churnedCustomersCount || 0;
      const customerChurn = activeThisMonth > 0 ? (churnedCustomers / activeThisMonth) * 100 : 0;

      // Taxa de Conversão de Leads
      const { data: leadConvData } = await supabase
        .from('v_lead_conversion_rate')
        .select('*')
        .single();

      const leadConversion = leadConvData?.conversion_rate_percentage || 0;

      setMarketingMetrics({
        cac,
        freeToPaid,
        customerChurn,
        leadConversion,
        monthlyMarketingCost,
        newPaidCustomers
      });

      // Setar input com valor atual
      setMarketingCostInput(monthlyMarketingCost.toFixed(2));
    } catch (error) {
      console.error('[Dashboard] Erro ao carregar métricas de marketing:', error);
    }
  };

  // 3. MÉTRICAS DE TRÁFEGO
  const loadTrafficMetrics = async () => {
    try {
      // Total de Anúncios Ativos
      const { count: totalActiveAds } = await supabase
        .from('announcements')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'ACTIVE');

      // Visitas do Mês
      const firstDayOfMonth = new Date(new Date().setDate(1)).toISOString().split('T')[0];
      const { data: visitsData } = await supabase
        .from('website_visits')
        .select('total_visits, page_views, avg_session_duration')
        .gte('visit_date', firstDayOfMonth);

      const monthlyVisits = visitsData?.reduce((sum, day) => sum + (day.total_visits || 0), 0) || 0;
      const totalPageViews = visitsData?.reduce((sum, day) => sum + (day.page_views || 0), 0) || 0;
      const avgSessionDuration = visitsData && visitsData.length > 0
        ? visitsData.reduce((sum, day) => sum + (day.avg_session_duration || 0), 0) / visitsData.length
        : 0;

      setTrafficMetrics({
        totalActiveAds: totalActiveAds || 0,
        monthlyVisits,
        totalPageViews,
        avgSessionDuration
      });
    } catch (error) {
      console.error('[Dashboard] Erro ao carregar métricas de tráfego:', error);
    }
  };

  // 4. FILA DE MODERAÇÃO
  const loadModerationQueue = async () => {
    try {
      const { data: announcements } = await supabase
        .from('announcements')
        .select(`
          id,
          title,
          category_slug,
          status,
          views,
          created_at,
          user_id,
          users!inner (
            name,
            email
          )
        `)
        .in('status', ['PENDING', 'UNDER_REVIEW'])
        .order('created_at', { ascending: false })
        .limit(50);

      const mapped: ModerationItem[] = announcements?.map(item => ({
        id: item.id,
        title: item.title,
        user: (item.users as any)?.name || (item.users as any)?.email || 'Desconhecido',
        category: item.category_slug || 'Outros',
        createdAt: item.created_at,
        status: item.status as any,
        views: item.views || 0
      })) || [];

      setModerationQueue(mapped);
    } catch (error) {
      console.error('[Dashboard] Erro ao carregar fila de moderação:', error);
    }
  };

  // ==========================================
  // ACTION HANDLERS
  // ==========================================

  // Salvar Custo de Marketing
  const handleSaveMarketingCost = async () => {
    const cost = parseFloat(marketingCostInput);
    if (isNaN(cost) || cost < 0) {
      alert('Por favor, insira um valor válido');
      return;
    }

    setSavingCost(true);
    try {
      const currentMonth = new Date().toISOString().split('T')[0].slice(0, 7) + '-01'; // YYYY-MM-01

      const { error } = await supabase
        .from('marketing_costs')
        .upsert({
          month_year: currentMonth,
          total_cost: cost
        }, {
          onConflict: 'month_year'
        });

      if (error) throw error;

      alert('Custo de marketing atualizado com sucesso!');
      await loadMarketingMetrics(); // Recarregar CAC
    } catch (error) {
      console.error('[Dashboard] Erro ao salvar custo:', error);
      alert('Erro ao salvar custo de marketing');
    } finally {
      setSavingCost(false);
    }
  };

  // Aprovar Anúncio
  const handleApproveAd = async (adId: string, adTitle: string) => {
    if (!confirm(`Aprovar anúncio "${adTitle}"?`)) return;

    try {
      const { error } = await supabase
        .from('announcements')
        .update({
          status: 'ACTIVE',
          publication_review_admin_override: true,
          publication_review_severity: null,
          publication_review_reasons: [],
          publication_review_checked_at: new Date().toISOString(),
        })
        .eq('id', adId);

      if (error) throw error;

      // Auditoria
      await logAction({
        action: 'APPROVE_AD',
        resourceType: 'announcement',
        resourceId: adId,
        oldValue: { status: 'PENDING' },
        newValue: { status: 'ACTIVE' },
        reason: 'Aprovado via Dashboard Admin'
      });

      alert('Anúncio aprovado com sucesso!');
      await loadModerationQueue();
    } catch (error) {
      console.error('[Dashboard] Erro ao aprovar anúncio:', error);
      alert('Erro ao aprovar anúncio');
    }
  };

  // Rejeitar Anúncio
  const handleRejectAd = async (adId: string, adTitle: string) => {
    const reason = prompt(`Rejeitar anúncio "${adTitle}"\n\nMotivo da rejeição:`);
    if (!reason) return;

    try {
      const { error } = await supabase
        .from('announcements')
        .update({ status: 'REJECTED' })
        .eq('id', adId);

      if (error) throw error;

      // Auditoria
      await logAction({
        action: 'REJECT_AD',
        resourceType: 'announcement',
        resourceId: adId,
        oldValue: { status: 'PENDING' },
        newValue: { status: 'REJECTED' },
        reason
      });

      alert('Anúncio rejeitado');
      await loadModerationQueue();
    } catch (error) {
      console.error('[Dashboard] Erro ao rejeitar anúncio:', error);
      alert('Erro ao rejeitar anúncio');
    }
  };

  // Colocar em Análise (UNDER_REVIEW)
  const handlePlaceUnderReview = async (adId: string, adTitle: string) => {
    const reason = prompt(`Colocar anúncio "${adTitle}" em análise\n\nMotivo:`);
    if (!reason) return;

    try {
      const { error } = await supabase
        .from('announcements')
        .update({ status: 'UNDER_REVIEW' })
        .eq('id', adId);

      if (error) throw error;

      // Auditoria OBRIGATÓRIA
      await logAction({
        action: 'PLACE_UNDER_REVIEW',
        resourceType: 'announcement',
        resourceId: adId,
        oldValue: { status: 'PENDING' },
        newValue: { status: 'UNDER_REVIEW' },
        reason
      });

      alert('Anúncio colocado em análise');
      await loadModerationQueue();
    } catch (error) {
      console.error('[Dashboard] Erro ao colocar em análise:', error);
      alert('Erro ao atualizar status');
    }
  };

  // ==========================================
  // FILTERED DATA
  // ==========================================

  const filteredModeration = moderationQueue.filter(item => {
    const matchesFilter = moderationFilter === 'ALL' || item.status === moderationFilter;
    const matchesSearch = searchTerm === '' || 
      item.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.user.toLowerCase().includes(searchTerm.toLowerCase());
    
    return matchesFilter && matchesSearch;
  });

  // ==========================================
  // RENDER HELPERS
  // ==========================================

  const KPICard: React.FC<{
    title: string;
    value: string | number;
    icon: React.ReactNode;
    color: string;
    trend?: number; // % de crescimento (positivo ou negativo)
    subtitle?: string;
  }> = ({ title, value, icon, color, trend, subtitle }) => (
    <div className="bg-white rounded-xl border border-slate-200 p-6 hover:shadow-lg transition-shadow">
      <div className="flex items-start justify-between mb-4">
        <div className={`w-12 h-12 rounded-xl ${color} bg-opacity-10 flex items-center justify-center`}>
          <div className={`${color.replace('bg-', 'text-')}`}>
            {icon}
          </div>
        </div>
        
        {trend !== undefined && (
          <div className={`flex items-center gap-1 text-sm font-semibold ${
            trend >= 0 ? 'text-green-600' : 'text-red-600'
          }`}>
            {trend >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
            {Math.abs(trend)}%
          </div>
        )}
      </div>

      <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-1">
        {title}
      </h3>
      <p className="text-3xl font-black text-slate-900 mb-1">
        {value}
      </p>
      {subtitle && (
        <p className="text-xs text-slate-400">
          {subtitle}
        </p>
      )}
    </div>
  );

  // Loading State
  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-black text-slate-900">Dashboard BI</h1>
          <div className="flex items-center gap-2">
            <RefreshCw className="w-5 h-5 text-slate-400 animate-spin" />
            <span className="text-sm text-slate-500">Carregando métricas...</span>
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {Array.from({ length: 12 }).map((_, idx) => (
            <div key={idx} className="bg-white rounded-xl border border-slate-200 p-6 animate-pulse">
              <div className="w-12 h-12 bg-slate-200 rounded-xl mb-4"></div>
              <div className="h-4 bg-slate-200 rounded w-2/3 mb-2"></div>
              <div className="h-8 bg-slate-200 rounded w-1/2"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ==========================================
  // MAIN RENDER
  // ==========================================

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black text-slate-900">Dashboard de BI</h1>
          <p className="text-sm text-slate-500 mt-1">
            Visão completa das métricas financeiras, marketing e operacionais
          </p>
        </div>
        
        <button
          onClick={loadAllMetrics}
          className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Atualizar
        </button>
      </div>

      {/* ==========================================
          BLOCO 1: MÉTRICAS FINANCEIRAS (6 KPIs)
          ========================================== */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <DollarSign className="w-5 h-5 text-green-600" />
          <h2 className="text-xl font-black text-slate-900">Métricas Financeiras</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* 1. MRR */}
          <KPICard
            title="MRR (Monthly Recurring Revenue)"
            value={`R$ ${financialMetrics?.mrr.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
            icon={<TrendingUp className="w-6 h-6" />}
            color="bg-green-600"
            subtitle="Receita recorrente mensal"
          />

          {/* 2. Ticket Médio */}
          <KPICard
            title="Ticket Médio"
            value={`R$ ${financialMetrics?.avgTicket.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
            icon={<DollarSign className="w-6 h-6" />}
            color="bg-blue-600"
            subtitle="Receita por cliente"
          />

          {/* 3. Faturamento Total */}
          <KPICard
            title="Faturamento Total"
            value={`R$ ${financialMetrics?.totalRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
            icon={<Receipt className="w-6 h-6" />}
            color="bg-purple-600"
            subtitle="Histórico completo"
          />

          {/* 4. Notas Fiscais */}
          <KPICard
            title="Notas Fiscais Emitidas"
            value={financialMetrics?.invoiceCount || 0}
            icon={<FileText className="w-6 h-6" />}
            color="bg-indigo-600"
            subtitle="Total de NFes"
          />

          {/* 5. Taxa de Churn Financeiro */}
          <KPICard
            title="Churn Financeiro"
            value={`${financialMetrics?.financialChurn.toFixed(2)}%`}
            icon={<TrendingDown className="w-6 h-6" />}
            color="bg-red-600"
            subtitle="MRR perdida no mês"
          />

          {/* 6. Receita por Plano - Placeholder para gráfico */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 hover:shadow-lg transition-shadow">
            <div className="flex items-center gap-2 mb-4">
              <PieChartIcon className="w-5 h-5 text-amber-600" />
              <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">
                Receita por Plano
              </h3>
            </div>
            
            {financialMetrics && financialMetrics.revenueByPlan.length > 0 ? (
              <ResponsiveContainer width="100%" height={150}>
                <PieChart>
                  <Pie
                    data={financialMetrics.revenueByPlan}
                    dataKey="percentage"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={60}
                    label={(entry) => `${entry.name}: ${((entry.percent ?? 0) * 100).toFixed(1)}%`}
                  >
                    {financialMetrics.revenueByPlan.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={['#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', '#ef4444'][index % 5]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-slate-400 text-center py-8">Sem dados de planos</p>
            )}
          </div>
        </div>

        {/* Tabela de Receita por Plano */}
        {financialMetrics && financialMetrics.revenueByPlan.length > 0 && (
          <div className="mt-4 bg-white rounded-xl border border-slate-200 overflow-hidden">
            <table className="w-full">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Plano</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Usuários Ativos</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">MRR</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">% do Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {financialMetrics.revenueByPlan.map((plan, idx) => (
                  <tr key={idx} className="hover:bg-slate-50">
                    <td className="px-6 py-4 text-sm font-semibold text-slate-900">{plan.name}</td>
                    <td className="px-6 py-4 text-sm text-slate-600">{plan.activeUsers}</td>
                    <td className="px-6 py-4 text-sm font-bold text-green-600">
                      R$ {plan.mrr.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600">{plan.percentage.toFixed(2)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ==========================================
          BLOCO 2: MARKETING E CONVERSÃO (4 KPIs)
          ========================================== */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <Target className="w-5 h-5 text-blue-600" />
          <h2 className="text-xl font-black text-slate-900">Marketing e Conversão</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* 7. CAC (com input manual) */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 hover:shadow-lg transition-shadow">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-12 h-12 rounded-xl bg-orange-600 bg-opacity-10 flex items-center justify-center">
                <DollarSign className="w-6 h-6 text-orange-600" />
              </div>
            </div>

            <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-1">
              CAC (Custo Aquisição)
            </h3>
            <p className="text-3xl font-black text-slate-900 mb-2">
              R$ {marketingMetrics?.cac.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </p>
            <p className="text-xs text-slate-400 mb-4">
              {marketingMetrics?.newPaidCustomers} novos clientes pagantes
            </p>

            {/* Input manual de custo */}
            <div className="pt-4 border-t border-slate-200">
              <label className="block text-xs font-semibold text-slate-600 mb-2">
                Custo de Marketing Mensal
              </label>
              <div className="flex gap-2">
                <input
                  type="number"
                  value={marketingCostInput}
                  onChange={(e) => setMarketingCostInput(e.target.value)}
                  placeholder="0.00"
                  className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
                <button
                  onClick={handleSaveMarketingCost}
                  disabled={savingCost}
                  className="px-3 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors disabled:opacity-50"
                  title="Salvar custo"
                >
                  {savingCost ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>

          {/* 8. Taxa Conversão Grátis→Pago */}
          <KPICard
            title="Conversão Grátis → Pago"
            value={`${marketingMetrics?.freeToPaid.toFixed(2)}%`}
            icon={<TrendingUp className="w-6 h-6" />}
            color="bg-green-600"
            subtitle="Upgrades de plano"
          />

          {/* 9. Taxa Churn de Clientes */}
          <KPICard
            title="Churn de Clientes"
            value={`${marketingMetrics?.customerChurn.toFixed(2)}%`}
            icon={<Users className="w-6 h-6" />}
            color="bg-red-600"
            subtitle="Clientes perdidos no mês"
          />

          {/* 10. Taxa Conversão de Leads */}
          <KPICard
            title="Conversão de Leads"
            value={`${marketingMetrics?.leadConversion.toFixed(2)}%`}
            icon={<MousePointerClick className="w-6 h-6" />}
            color="bg-blue-600"
            subtitle="Cliques em contato / Views"
          />
        </div>
      </section>

      {/* ==========================================
          BLOCO 3: TRÁFEGO E INVENTÁRIO (2 KPIs)
          ========================================== */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <Activity className="w-5 h-5 text-purple-600" />
          <h2 className="text-xl font-black text-slate-900">Tráfego e Inventário</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* 11. Total Anúncios Ativos */}
          <KPICard
            title="Anúncios Ativos"
            value={trafficMetrics?.totalActiveAds || 0}
            icon={<ShoppingBag className="w-6 h-6" />}
            color="bg-purple-600"
            subtitle="Inventário disponível"
          />

          {/* 12. Total Visitas Mensais */}
          <KPICard
            title="Visitas Mensais"
            value={trafficMetrics?.monthlyVisits.toLocaleString('pt-BR') || 0}
            icon={<Eye className="w-6 h-6" />}
            color="bg-indigo-600"
            subtitle={`${trafficMetrics?.totalPageViews.toLocaleString('pt-BR')} page views`}
          />

          {/* Duração Média de Sessão */}
          <KPICard
            title="Duração Média Sessão"
            value={`${Math.floor((trafficMetrics?.avgSessionDuration || 0) / 60)}m ${Math.floor((trafficMetrics?.avgSessionDuration || 0) % 60)}s`}
            icon={<Clock className="w-6 h-6" />}
            color="bg-cyan-600"
            subtitle="Tempo médio no site"
          />

          {/* Taxa de Aproveitamento (placeholder) */}
          <KPICard
            title="Taxa Aproveitamento"
            value="--"
            icon={<Percent className="w-6 h-6" />}
            color="bg-teal-600"
            subtitle="Em desenvolvimento"
          />
        </div>
      </section>

      {/* ==========================================
          BLOCO 4: MODERAÇÃO (2 funcionalidades)
          ========================================== */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-amber-600" />
            <h2 className="text-xl font-black text-slate-900">Fila de Moderação</h2>
            <span className="px-2 py-1 bg-amber-100 text-amber-700 text-xs font-bold rounded-full">
              {filteredModeration.length}
            </span>
          </div>

          <div className="flex items-center gap-3">
            {/* Filtro */}
            <select
              value={moderationFilter}
              onChange={(e) => setModerationFilter(e.target.value as any)}
              className="px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
            >
              <option value="ALL">Todos</option>
              <option value="PENDING">Pendentes</option>
              <option value="UNDER_REVIEW">Em Análise</option>
            </select>

            {/* Busca */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar anúncio..."
                className="pl-10 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 w-64"
              />
            </div>
          </div>
        </div>

        {/* Tabela de Moderação */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          {filteredModeration.length === 0 ? (
            <div className="text-center py-12">
              <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-3" />
              <p className="text-sm text-slate-500">Nenhum anúncio pendente de moderação</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Anúncio</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Usuário</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Categoria</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Views</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Data</th>
                    <th className="px-6 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {filteredModeration.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50">
                      <td className="px-6 py-4">
                        <p className="text-sm font-semibold text-slate-900 line-clamp-2">
                          {item.title}
                        </p>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600">
                        {item.user}
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600">
                        {item.category}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold ${
                          item.status === 'PENDING' 
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-blue-100 text-blue-700'
                        }`}>
                          {item.status === 'PENDING' ? (
                            <>
                              <Clock className="w-3 h-3" />
                              Pendente
                            </>
                          ) : (
                            <>
                              <Search className="w-3 h-3" />
                              Em Análise
                            </>
                          )}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600">
                        {item.views}
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600">
                        {new Date(item.createdAt).toLocaleDateString('pt-BR')}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {/* Botão: Colocar em Análise */}
                          {item.status === 'PENDING' && (
                            <button
                              onClick={() => handlePlaceUnderReview(item.id, item.title)}
                              className="p-2 hover:bg-blue-50 text-blue-600 rounded-lg transition-colors"
                              title="Colocar em Análise"
                            >
                              <Search className="w-4 h-4" />
                            </button>
                          )}

                          {/* Botão: Aprovar */}
                          <button
                            onClick={() => handleApproveAd(item.id, item.title)}
                            className="p-2 hover:bg-green-50 text-green-600 rounded-lg transition-colors"
                            title="Aprovar"
                          >
                            <CheckCircle2 className="w-4 h-4" />
                          </button>

                          {/* Botão: Rejeitar */}
                          <button
                            onClick={() => handleRejectAd(item.id, item.title)}
                            className="p-2 hover:bg-red-50 text-red-600 rounded-lg transition-colors"
                            title="Rejeitar"
                          >
                            <XCircle className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </div>
  );
};

export default AdminDashboardOverview;
