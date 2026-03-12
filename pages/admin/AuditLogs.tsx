import React, { useState, useEffect } from 'react';
import { 
  Shield, 
  Search, 
  Filter,
  ChevronLeft, 
  ChevronRight,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  TrendingUp,
  User as UserIcon
} from 'lucide-react';
import { supabase } from '../../src/lib/supabaseClient';
import { toast } from 'sonner';

interface AuditLog {
  id: string;
  admin_id: string;
  admin_name: string;
  admin_email: string;
  action: string;
  resource_type: string;
  resource_id: string;
  old_value: any;
  new_value: any;
  reason: string;
  ip_address: string;
  user_agent: string;
  created_at: string;
}

interface ActionStats {
  action_name: string;
  action_count: number;
}

interface AdminStats {
  admin_name: string;
  admin_email: string;
  action_count: number;
}

const AuditLogs: React.FC = () => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [filterAction, setFilterAction] = useState<string>('all');
  const [filterResource, setFilterResource] = useState<string>('all');
  const [filterAdmin, setFilterAdmin] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [actionStats, setActionStats] = useState<ActionStats[]>([]);
  const [adminStats, setAdminStats] = useState<AdminStats[]>([]);
  const [criticalActionsCount, setCriticalActionsCount] = useState(0);

  const PAGE_SIZE = 20;

  useEffect(() => {
    loadLogs();
    loadStats();
  }, [page, filterAction, filterResource, filterAdmin, searchTerm]);

  const loadLogs = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('v_recent_admin_actions')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      if (filterAction !== 'all') {
        query = query.eq('action', filterAction);
      }

      if (filterResource !== 'all') {
        query = query.eq('resource_type', filterResource);
      }

      if (filterAdmin !== 'all') {
        query = query.eq('admin_email', filterAdmin);
      }

      if (searchTerm) {
        query = query.or(`reason.ilike.%${searchTerm}%,resource_id.ilike.%${searchTerm}%`);
      }

      const { data, error, count } = await query;

      if (error) throw error;

      setLogs(data || []);
      setTotalCount(count || 0);
    } catch (error) {
      console.error('[AuditLogs] Erro ao carregar logs:', error);
      toast.error('Erro ao carregar logs de auditoria');
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    try {
      // Action stats
      const { data: actionData } = await supabase
        .from('v_admin_action_stats')
        .select('*')
        .order('action_count', { ascending: false })
        .limit(5);

      setActionStats(actionData || []);

      // Admin stats (top 5 most active)
      const { data: adminData } = await supabase
        .from('v_recent_admin_actions')
        .select('admin_name, admin_email');

      if (adminData) {
        const adminCountMap = new Map<string, { name: string; email: string; count: number }>();
        
        adminData.forEach((log) => {
          const key = log.admin_email;
          if (adminCountMap.has(key)) {
            adminCountMap.get(key)!.count++;
          } else {
            adminCountMap.set(key, {
              name: log.admin_name,
              email: log.admin_email,
              count: 1
            });
          }
        });

        const adminStatsArray = Array.from(adminCountMap.values())
          .sort((a, b) => b.count - a.count)
          .slice(0, 5);

        setAdminStats(adminStatsArray);
      }

      // Critical actions count (last 24h)
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      const { count: criticalCount } = await supabase
        .from('admin_audit_logs')
        .select('*', { count: 'exact', head: true })
        .in('action', ['DELETE_USER', 'SUSPEND_USER', 'DELETE_AD', 'BAN_USER'])
        .gte('created_at', yesterday.toISOString());

      setCriticalActionsCount(criticalCount || 0);
    } catch (error) {
      console.error('[AuditLogs] Erro ao carregar estatísticas:', error);
    }
  };

  const toggleExpandRow = (id: string) => {
    setExpandedRow(expandedRow === id ? null : id);
  };

  const getActionColor = (action: string) => {
    if (action.includes('DELETE') || action.includes('SUSPEND')) {
      return 'bg-red-100 text-red-800';
    }
    if (action.includes('APPROVE') || action.includes('CREATE')) {
      return 'bg-green-100 text-green-800';
    }
    if (action.includes('UPDATE') || action.includes('EDIT')) {
      return 'bg-blue-100 text-blue-800';
    }
    return 'bg-slate-100 text-slate-800';
  };

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black text-slate-900">Auditoria & Segurança</h1>
          <p className="text-slate-500 mt-1">{totalCount} ações registradas</p>
        </div>
        <button
          onClick={() => {
            loadLogs();
            loadStats();
          }}
          className="px-4 py-2 bg-green-500 text-white rounded-lg font-semibold hover:bg-green-600 transition-colors"
        >
          Atualizar
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Total Actions */}
        <div className="bg-white rounded-xl p-6 border border-slate-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-500 uppercase">Total de Ações</p>
              <p className="text-3xl font-black text-slate-900 mt-2">{totalCount}</p>
            </div>
            <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center">
              <Shield className="w-6 h-6 text-green-600" />
            </div>
          </div>
        </div>

        {/* Critical Actions (24h) */}
        <div className="bg-white rounded-xl p-6 border border-slate-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-500 uppercase">Ações Críticas (24h)</p>
              <p className="text-3xl font-black text-slate-900 mt-2">{criticalActionsCount}</p>
            </div>
            <div className="w-12 h-12 bg-red-100 rounded-xl flex items-center justify-center">
              <AlertTriangle className="w-6 h-6 text-red-600" />
            </div>
          </div>
        </div>

        {/* Active Admins */}
        <div className="bg-white rounded-xl p-6 border border-slate-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-500 uppercase">Admins Ativos</p>
              <p className="text-3xl font-black text-slate-900 mt-2">{adminStats.length}</p>
            </div>
            <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
              <UserIcon className="w-6 h-6 text-blue-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Stats Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Top Actions */}
        <div className="bg-white rounded-xl p-6 border border-slate-200">
          <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-green-600" />
            Top 5 Ações Mais Frequentes
          </h3>
          <div className="space-y-3">
            {actionStats.map((stat, idx) => (
              <div key={idx} className="flex items-center justify-between">
                <span className="text-sm text-slate-600">{stat.action_name}</span>
                <span className="text-sm font-bold text-slate-900">{stat.action_count} ações</span>
              </div>
            ))}
          </div>
        </div>

        {/* Most Active Admins */}
        <div className="bg-white rounded-xl p-6 border border-slate-200">
          <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
            <UserIcon className="w-5 h-5 text-blue-600" />
            Top 5 Admins Mais Ativos
          </h3>
          <div className="space-y-3">
            {adminStats.map((stat, idx) => (
              <div key={idx} className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-900">{stat.name}</p>
                  <p className="text-xs text-slate-500">{stat.email}</p>
                </div>
                <span className="text-sm font-bold text-slate-900">{stat.count} ações</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl p-4 border border-slate-200">
        <div className="flex flex-col md:flex-row gap-4">
          {/* Search */}
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar por motivo ou ID do recurso..."
                className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
          </div>

          {/* Filters */}
          <div className="flex items-center gap-2">
            <Filter className="w-5 h-5 text-slate-400" />
            <select
              value={filterAction}
              onChange={(e) => setFilterAction(e.target.value)}
              className="px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              <option value="all">Todas as Ações</option>
              <option value="APPROVE_AD">Aprovar Anúncio</option>
              <option value="REJECT_AD">Rejeitar Anúncio</option>
              <option value="DELETE_AD">Deletar Anúncio</option>
              <option value="SUSPEND_USER">Suspender Usuário</option>
              <option value="UPDATE_PLAN">Alterar Plano</option>
              <option value="UPDATE_USER_ROLE">Alterar Role</option>
            </select>
          </div>

          <select
            value={filterResource}
            onChange={(e) => setFilterResource(e.target.value)}
            className="px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
          >
            <option value="all">Todos os Recursos</option>
            <option value="announcement">Anúncios</option>
            <option value="user">Usuários</option>
            <option value="subscription">Assinaturas</option>
          </select>
        </div>
      </div>

      {/* Logs Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-black text-slate-600 uppercase tracking-wider">
                  Data/Hora
                </th>
                <th className="px-6 py-3 text-left text-xs font-black text-slate-600 uppercase tracking-wider">
                  Admin
                </th>
                <th className="px-6 py-3 text-left text-xs font-black text-slate-600 uppercase tracking-wider">
                  Ação
                </th>
                <th className="px-6 py-3 text-left text-xs font-black text-slate-600 uppercase tracking-wider">
                  Recurso
                </th>
                <th className="px-6 py-3 text-left text-xs font-black text-slate-600 uppercase tracking-wider">
                  Motivo
                </th>
                <th className="px-6 py-3 text-left text-xs font-black text-slate-600 uppercase tracking-wider">
                  Detalhes
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center">
                    <div className="flex items-center justify-center">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div>
                    </div>
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                    Nenhum log encontrado
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <React.Fragment key={log.id}>
                    <tr className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4 text-sm text-slate-600">
                        {new Date(log.created_at).toLocaleString('pt-BR')}
                      </td>
                      <td className="px-6 py-4">
                        <div>
                          <p className="font-semibold text-slate-900">{log.admin_name}</p>
                          <p className="text-xs text-slate-500">{log.admin_email}</p>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${getActionColor(log.action)}`}>
                          {log.action}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">{log.resource_type}</p>
                          <p className="text-xs text-slate-500 font-mono">{log.resource_id.substring(0, 8)}...</p>
                        </div>
                      </td>
                      <td className="px-6 py-4 max-w-xs">
                        <p className="text-sm text-slate-600 truncate">{log.reason}</p>
                      </td>
                      <td className="px-6 py-4">
                        <button
                          onClick={() => toggleExpandRow(log.id)}
                          className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                        >
                          {expandedRow === log.id ? (
                            <ChevronUp className="w-4 h-4" />
                          ) : (
                            <ChevronDown className="w-4 h-4" />
                          )}
                        </button>
                      </td>
                    </tr>
                    {expandedRow === log.id && (
                      <tr className="bg-slate-50">
                        <td colSpan={6} className="px-6 py-4">
                          <div className="space-y-4">
                            <div>
                              <h4 className="font-bold text-slate-900 mb-2">Informações Completas</h4>
                              <div className="grid grid-cols-2 gap-4">
                                <div>
                                  <p className="text-xs font-semibold text-slate-500 uppercase">IP Address</p>
                                  <p className="text-sm text-slate-900 font-mono">{log.ip_address || 'N/A'}</p>
                                </div>
                                <div>
                                  <p className="text-xs font-semibold text-slate-500 uppercase">User Agent</p>
                                  <p className="text-sm text-slate-900 truncate">{log.user_agent || 'N/A'}</p>
                                </div>
                              </div>
                            </div>

                            {log.old_value && (
                              <div>
                                <h4 className="font-bold text-slate-900 mb-2">Valor Anterior</h4>
                                <pre className="bg-white border border-slate-200 rounded-lg p-3 text-xs overflow-x-auto">
                                  {JSON.stringify(log.old_value, null, 2)}
                                </pre>
                              </div>
                            )}

                            {log.new_value && (
                              <div>
                                <h4 className="font-bold text-slate-900 mb-2">Novo Valor</h4>
                                <pre className="bg-white border border-slate-200 rounded-lg p-3 text-xs overflow-x-auto">
                                  {JSON.stringify(log.new_value, null, 2)}
                                </pre>
                              </div>
                            )}

                            <div>
                              <h4 className="font-bold text-slate-900 mb-2">Motivo Completo</h4>
                              <p className="text-sm text-slate-600 bg-white border border-slate-200 rounded-lg p-3">
                                {log.reason}
                              </p>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="border-t border-slate-200 px-6 py-4 flex items-center justify-between">
            <p className="text-sm text-slate-500">
              Página {page + 1} de {totalPages}
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(Math.max(0, page - 1))}
                disabled={page === 0}
                className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-50"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button
                onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
                disabled={page >= totalPages - 1}
                className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-50"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AuditLogs;
