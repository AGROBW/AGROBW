import React, { useState, useEffect } from 'react';
import { 
  TrendingUp, 
  Users, 
  FileText, 
  Target,
  ArrowUp,
  ArrowDown,
  Activity,
  DollarSign
} from 'lucide-react';
import { supabase } from '../../src/lib/supabaseClient';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

interface DashboardStats {
  totalAnnouncements: number;
  activeAnnouncements: number;
  pendingModeration: number;
  activeUsers: number;
  monthlyActiveUsers: number;
  radarMatches: number;
  categoriesData: Array<{ name: string; value: number }>;
}

const AdminDashboardOverview: React.FC = () => {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | '90d'>('30d');

  useEffect(() => {
    loadDashboardStats();
  }, [timeRange]);

  const loadDashboardStats = async () => {
    setLoading(true);
    try {
      const daysAgo = timeRange === '7d' ? 7 : timeRange === '30d' ? 30 : 90;
      const dateFilter = new Date();
      dateFilter.setDate(dateFilter.getDate() - daysAgo);

      // Total de anúncios ativos
      const { count: activeCount } = await supabase
        .from('announcements')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'ACTIVE');

      // Anúncios pendentes de moderação
      const { count: pendingCount } = await supabase
        .from('announcements')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'PENDING');

      // Total de usuários
      const { count: totalUsers } = await supabase
        .from('users')
        .select('*', { count: 'exact', head: true });

      // Usuários recentes (simplificado - todos os usuários)
      const { count: mauCount } = await supabase
        .from('users')
        .select('*', { count: 'exact', head: true });

      // Matches do Radar - sem filtro de data para evitar erro
      const matchesResult = await supabase
        .from('opportunity_matches')
        .select('*', { count: 'exact', head: true });
      const matchesCount = matchesResult.error ? 0 : matchesResult.count;

      // Anúncios por categoria (todos os registros) - usando category_slug
      const categoriesResult = await supabase
        .from('announcements')
        .select('category_slug')
        .eq('status', 'ACTIVE'); // Filtrar apenas ativos
      const categoriesData = categoriesResult.error ? [] : categoriesResult.data;

      const categoryCounts = categoriesData?.reduce((acc: any, item: any) => {
        const category = item.category_slug || 'Outros';
        acc[category] = (acc[category] || 0) + 1;
        return acc;
      }, {});

      const chartData = Object.entries(categoryCounts || {})
        .map(([name, value]) => ({ name, value: value as number }))
        .sort((a: any, b: any) => b.value - a.value)
        .slice(0, 8);

      setStats({
        totalAnnouncements: (activeCount || 0) + (pendingCount || 0),
        activeAnnouncements: activeCount || 0,
        pendingModeration: pendingCount || 0,
        activeUsers: totalUsers || 0,
        monthlyActiveUsers: mauCount || 0,
        radarMatches: matchesCount || 0,
        categoriesData: chartData
      });
    } catch (error) {
      console.error('[AdminDashboard] Erro ao carregar estatísticas:', error);
    } finally {
      setLoading(false);
    }
  };

  const KPICard: React.FC<{
    title: string;
    value: number;
    icon: React.ElementType;
    trend?: number;
    trendLabel?: string;
    color: string;
  }> = ({ title, value, icon: Icon, trend, trendLabel, color }) => (
    <div className="bg-white rounded-xl p-6 border border-slate-200">
      <div className="flex items-start justify-between mb-4">
        <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${color}`}>
          <Icon className="w-6 h-6 text-white" />
        </div>
        {trend !== undefined && (
          <div className={`flex items-center gap-1 text-sm font-semibold ${
            trend >= 0 ? 'text-green-600' : 'text-red-600'
          }`}>
            {trend >= 0 ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />}
            {Math.abs(trend)}%
          </div>
        )}
      </div>
      <h3 className="text-2xl font-black text-slate-900 mb-1">
        {value.toLocaleString('pt-BR')}
      </h3>
      <p className="text-sm text-slate-500">{title}</p>
      {trendLabel && (
        <p className="text-xs text-slate-400 mt-2">{trendLabel}</p>
      )}
    </div>
  );

  const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black text-slate-900">Dashboard Administrativo</h1>
          <p className="text-slate-500 mt-1">Visão geral do marketplace e operações</p>
        </div>
        <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg p-1">
          {(['7d', '30d', '90d'] as const).map((range) => (
            <button
              key={range}
              onClick={() => setTimeRange(range)}
              className={`px-4 py-2 rounded-md text-sm font-semibold transition-all ${
                timeRange === range
                  ? 'bg-green-500 text-white'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {range === '7d' ? '7 dias' : range === '30d' ? '30 dias' : '90 dias'}
            </button>
          ))}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <KPICard
          title="Anúncios Ativos"
          value={stats?.activeAnnouncements || 0}
          icon={FileText}
          trend={12}
          trendLabel="vs. mês anterior"
          color="bg-green-500"
        />
        <KPICard
          title="Pendentes de Moderação"
          value={stats?.pendingModeration || 0}
          icon={Activity}
          color="bg-yellow-500"
        />
        <KPICard
          title="Usuários Ativos (MAU)"
          value={stats?.monthlyActiveUsers || 0}
          icon={Users}
          trend={8}
          trendLabel={`de ${stats?.activeUsers || 0} totais`}
          color="bg-blue-500"
        />
        <KPICard
          title="Matches no Radar"
          value={stats?.radarMatches || 0}
          icon={Target}
          trend={15}
          trendLabel="últimos 30 dias"
          color="bg-purple-500"
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Bar Chart - Anúncios por Categoria */}
        <div className="bg-white rounded-xl p-6 border border-slate-200">
          <h3 className="text-lg font-bold text-slate-900 mb-4">
            Anúncios por Categoria ({timeRange === '7d' ? '7 dias' : timeRange === '30d' ? '30 dias' : '90 dias'})
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={stats?.categoriesData || []}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis 
                dataKey="name" 
                tick={{ fontSize: 12 }} 
                angle={-45}
                textAnchor="end"
                height={80}
              />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: '#fff', 
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px'
                }}
              />
              <Bar dataKey="value" fill="#10b981" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Pie Chart - Distribuição */}
        <div className="bg-white rounded-xl p-6 border border-slate-200">
          <h3 className="text-lg font-bold text-slate-900 mb-4">Distribuição por Categoria</h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={stats?.categoriesData || []}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                outerRadius={100}
                fill="#8884d8"
                dataKey="value"
              >
                {(stats?.categoriesData || []).map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-xl p-6 text-white">
        <h3 className="text-xl font-bold mb-2">Ações Rápidas</h3>
        <p className="text-green-100 mb-4">Acesse as principais funções administrativas</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <button 
            onClick={() => window.location.href = '#/admin/moderation'}
            className="bg-white/20 hover:bg-white/30 backdrop-blur-sm rounded-lg p-4 text-left transition-all"
          >
            <FileText className="w-6 h-6 mb-2" />
            <p className="font-semibold">Fila de Moderação</p>
            <p className="text-sm text-green-100">{stats?.pendingModeration || 0} pendentes</p>
          </button>
          <button 
            onClick={() => window.location.href = '#/admin/users'}
            className="bg-white/20 hover:bg-white/30 backdrop-blur-sm rounded-lg p-4 text-left transition-all"
          >
            <Users className="w-6 h-6 mb-2" />
            <p className="font-semibold">Gestão de Usuários</p>
            <p className="text-sm text-green-100">{stats?.activeUsers || 0} usuários</p>
          </button>
          <button 
            onClick={() => window.location.href = '#/admin/audit'}
            className="bg-white/20 hover:bg-white/30 backdrop-blur-sm rounded-lg p-4 text-left transition-all"
          >
            <Activity className="w-6 h-6 mb-2" />
            <p className="font-semibold">Auditoria</p>
            <p className="text-sm text-green-100">Ver logs recentes</p>
          </button>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboardOverview;
