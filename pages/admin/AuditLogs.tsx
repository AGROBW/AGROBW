import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownCircle,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Filter,
  Search,
  Shield,
  TrendingUp,
  User as UserIcon,
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
  resource_id: string | null;
  old_value: any;
  new_value: any;
  reason: string | null;
  ip_address: string | null;
  user_agent: string | null;
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

const likelyMojibakePattern = /Ã|Â|â|ðŸ|�/;
const mojibakeReplacements: Array<[RegExp, string]> = [
  [/Ã¡/g, 'á'],
  [/Ã /g, 'à'],
  [/Ã¢/g, 'â'],
  [/Ã£/g, 'ã'],
  [/Ã¤/g, 'ä'],
  [/Ã©/g, 'é'],
  [/Ãª/g, 'ê'],
  [/Ã¨/g, 'è'],
  [/Ã­/g, 'í'],
  [/Ã¬/g, 'ì'],
  [/Ã³/g, 'ó'],
  [/Ã²/g, 'ò'],
  [/Ã´/g, 'ô'],
  [/Ãµ/g, 'õ'],
  [/Ã¶/g, 'ö'],
  [/Ãº/g, 'ú'],
  [/Ã¹/g, 'ù'],
  [/Ã»/g, 'û'],
  [/Ã¼/g, 'ü'],
  [/Ã§/g, 'ç'],
  [/Ã\u0081/g, 'Á'],
  [/Ã\u0080/g, 'À'],
  [/Ã\u0082/g, 'Â'],
  [/Ã\u0083/g, 'Ã'],
  [/Ã\u0089/g, 'É'],
  [/Ã\u008A/g, 'Ê'],
  [/Ã\u008D/g, 'Í'],
  [/Ã\u0093/g, 'Ó'],
  [/Ã\u0094/g, 'Ô'],
  [/Ã\u0095/g, 'Õ'],
  [/Ã\u009A/g, 'Ú'],
  [/Ã\u0087/g, 'Ç'],
  [/Â /g, ' '],
];

const normalizeAuditText = (value?: string | null, fallback = '') => {
  if (!value) {
    return fallback;
  }

  if (!likelyMojibakePattern.test(value)) {
    return value;
  }

  let normalized = value;
  mojibakeReplacements.forEach(([pattern, replacement]) => {
    normalized = normalized.replace(pattern, replacement);
  });

  return normalized;
};

const normalizeAuditPayload = (value: any): any => {
  if (typeof value === 'string') {
    return normalizeAuditText(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizeAuditPayload(item));
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [key, normalizeAuditPayload(nestedValue)]),
    );
  }

  return value;
};

const normalizeAuditLog = (log: AuditLog): AuditLog => ({
  ...log,
  admin_name: normalizeAuditText(log.admin_name, 'Administrador'),
  admin_email: normalizeAuditText(log.admin_email, 'Sem e-mail'),
  action: normalizeAuditText(log.action, log.action),
  resource_type: normalizeAuditText(log.resource_type, log.resource_type),
  reason: normalizeAuditText(log.reason),
  ip_address: normalizeAuditText(log.ip_address),
  user_agent: normalizeAuditText(log.user_agent),
  old_value: normalizeAuditPayload(log.old_value),
  new_value: normalizeAuditPayload(log.new_value),
});

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
  const [autoDowngradesCount, setAutoDowngradesCount] = useState(0);

  const PAGE_SIZE = 20;

  useEffect(() => {
    void loadLogs();
    void loadStats();
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

      if (error) {
        // Rede de segurança: se o range pedido ficou fora do conjunto atual
        // (ex.: o filtro reduziu o total enquanto estávamos numa página alta),
        // o PostgREST responde 416. Em vez de quebrar, voltamos à 1ª página.
        if (page > 0 && ((error as any).code === 'PGRST103' || /range/i.test((error as any).message || ''))) {
          setPage(0);
          return;
        }
        throw error;
      }

      setLogs((data || []).map((log) => normalizeAuditLog(log as AuditLog)));
      setTotalCount(count || 0);
    } catch (error) {
      console.error('[AuditLogs] Erro ao carregar logs:', error);
      toast.error('Erro ao carregar logs de auditoria.');
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    try {
      const { data: actionData } = await supabase
        .from('v_admin_action_stats')
        .select('*')
        .order('action_count', { ascending: false })
        .limit(5);

      setActionStats((actionData || []).map((stat) => ({
        ...stat,
        action_name: normalizeAuditText(stat.action_name, stat.action_name),
      })));

      const { data: adminData } = await supabase.from('v_recent_admin_actions').select('admin_name, admin_email');

      if (adminData) {
        const adminCountMap = new Map<string, AdminStats>();

        adminData.forEach((log) => {
          const normalizedEmail = normalizeAuditText(log.admin_email, 'Sem e-mail');
          const normalizedName = normalizeAuditText(log.admin_name, 'Administrador');
          const key = normalizedEmail;

          if (adminCountMap.has(key)) {
            adminCountMap.get(key)!.action_count += 1;
          } else {
            adminCountMap.set(key, {
              admin_name: normalizedName,
              admin_email: normalizedEmail,
              action_count: 1,
            });
          }
        });

        const adminStatsArray = Array.from(adminCountMap.values())
          .sort((a, b) => b.action_count - a.action_count)
          .slice(0, 5);

        setAdminStats(adminStatsArray);
      }

      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      const { count: criticalCount } = await supabase
        .from('admin_audit_logs')
        .select('*', { count: 'exact', head: true })
        .in('action', ['DELETE_USER', 'SUSPEND_USER', 'DELETE_AD', 'BAN_USER'])
        .gte('created_at', yesterday.toISOString());

      setCriticalActionsCount(criticalCount || 0);

      const { count: downgradeCount } = await supabase
        .from('admin_audit_logs')
        .select('*', { count: 'exact', head: true })
        .eq('action', 'SUBSCRIPTION_AUTO_DOWNGRADED')
        .gte('created_at', yesterday.toISOString());

      setAutoDowngradesCount(downgradeCount || 0);
    } catch (error) {
      console.error('[AuditLogs] Erro ao carregar estatísticas:', error);
    }
  };

  const toggleExpandRow = (id: string) => {
    setExpandedRow(expandedRow === id ? null : id);
  };

  const getActionColor = (action: string) => {
    if (action.includes('DOWNGRADED')) {
      return 'bg-amber-100 text-amber-800';
    }

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

  const getActionLabel = (action: string) => {
    switch (action) {
      case 'SUBSCRIPTION_AUTO_DOWNGRADED':
        return 'Downgrade automático';
      case 'APPROVE_AD':
        return 'Aprovar anúncio';
      case 'REJECT_AD':
        return 'Rejeitar anúncio';
      case 'DELETE_AD':
        return 'Excluir anúncio';
      case 'SUSPEND_USER':
        return 'Suspender usuário';
      case 'UPDATE_PLAN':
        return 'Alterar plano';
      case 'UPDATE_USER_ROLE':
        return 'Alterar perfil';
      default:
        return normalizeAuditText(action, action);
    }
  };

  const getActionIcon = (action: string) => {
    if (action.includes('DOWNGRADED')) {
      return <ArrowDownCircle className="h-3.5 w-3.5" />;
    }

    if (action.includes('DELETE') || action.includes('SUSPEND')) {
      return <AlertTriangle className="h-3.5 w-3.5" />;
    }

    if (action.includes('APPROVE') || action.includes('CREATE')) {
      return <Shield className="h-3.5 w-3.5" />;
    }

    return null;
  };

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black text-slate-900">Auditoria e Segurança</h1>
          <p className="mt-1 text-slate-500">{totalCount} ações registradas</p>
        </div>
        <button
          onClick={() => {
            void loadLogs();
            void loadStats();
          }}
          className="rounded-lg bg-green-500 px-4 py-2 font-semibold text-white transition-colors hover:bg-green-600"
        >
          Atualizar
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold uppercase text-slate-500">Total de ações</p>
              <p className="mt-2 text-3xl font-black text-slate-900">{totalCount}</p>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-green-100">
              <Shield className="h-6 w-6 text-green-600" />
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold uppercase text-slate-500">Ações críticas (24h)</p>
              <p className="mt-2 text-3xl font-black text-slate-900">{criticalActionsCount}</p>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-red-100">
              <AlertTriangle className="h-6 w-6 text-red-600" />
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold uppercase text-slate-500">Admins ativos</p>
              <p className="mt-2 text-3xl font-black text-slate-900">{adminStats.length}</p>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-100">
              <UserIcon className="h-6 w-6 text-blue-600" />
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold uppercase text-slate-500">Downgrades automáticos (24h)</p>
              <p className="mt-2 text-3xl font-black text-slate-900">{autoDowngradesCount}</p>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-100">
              <ArrowDownCircle className="h-6 w-6 text-amber-600" />
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <h3 className="mb-4 flex items-center gap-2 text-lg font-bold text-slate-900">
            <TrendingUp className="h-5 w-5 text-green-600" />
            Top 5 ações mais frequentes
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

        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <h3 className="mb-4 flex items-center gap-2 text-lg font-bold text-slate-900">
            <UserIcon className="h-5 w-5 text-blue-600" />
            Top 5 admins mais ativos
          </h3>
          <div className="space-y-3">
            {adminStats.map((stat, idx) => (
              <div key={idx} className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-900">{stat.admin_name}</p>
                  <p className="text-xs text-slate-500">{stat.admin_email}</p>
                </div>
                <span className="text-sm font-bold text-slate-900">{stat.action_count} ações</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-col gap-4 md:flex-row">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => { setSearchTerm(e.target.value); setPage(0); }}
                placeholder="Buscar por motivo ou ID do recurso..."
                className="w-full rounded-lg border border-slate-200 py-2 pl-10 pr-4 focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Filter className="h-5 w-5 text-slate-400" />
            <select
              value={filterAction}
              onChange={(e) => { setFilterAction(e.target.value); setPage(0); }}
              className="rounded-lg border border-slate-200 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              <option value="all">Todas as ações</option>
              <option value="APPROVE_AD">Aprovar anúncio</option>
              <option value="REJECT_AD">Rejeitar anúncio</option>
              <option value="DELETE_AD">Excluir anúncio</option>
              <option value="SUSPEND_USER">Suspender usuário</option>
              <option value="UPDATE_PLAN">Alterar plano</option>
              <option value="UPDATE_USER_ROLE">Alterar perfil</option>
              <option value="SUBSCRIPTION_AUTO_DOWNGRADED">Downgrade automático</option>
            </select>
          </div>

          <select
            value={filterResource}
            onChange={(e) => { setFilterResource(e.target.value); setPage(0); }}
            className="rounded-lg border border-slate-200 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-green-500"
          >
            <option value="all">Todos os recursos</option>
            <option value="announcement">Anúncios</option>
            <option value="user">Usuários</option>
            <option value="subscription">Assinaturas</option>
          </select>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-black uppercase tracking-wider text-slate-600">
                  Data/Hora
                </th>
                <th className="px-6 py-3 text-left text-xs font-black uppercase tracking-wider text-slate-600">
                  Admin
                </th>
                <th className="px-6 py-3 text-left text-xs font-black uppercase tracking-wider text-slate-600">
                  Ação
                </th>
                <th className="px-6 py-3 text-left text-xs font-black uppercase tracking-wider text-slate-600">
                  Recurso
                </th>
                <th className="px-6 py-3 text-left text-xs font-black uppercase tracking-wider text-slate-600">
                  Motivo
                </th>
                <th className="px-6 py-3 text-left text-xs font-black uppercase tracking-wider text-slate-600">
                  Detalhes
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center">
                    <div className="flex items-center justify-center">
                      <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-green-600"></div>
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
                    <tr className="transition-colors hover:bg-slate-50">
                      <td className="px-6 py-4 text-sm text-slate-600">
                        {new Date(log.created_at).toLocaleString('pt-BR')}
                      </td>
                      <td className="px-6 py-4">
                        <div>
                          <p className="font-semibold text-slate-900">{log.admin_name || 'Administrador'}</p>
                          <p className="text-xs text-slate-500">{log.admin_email || 'Sem e-mail'}</p>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${getActionColor(log.action)}`}
                        >
                          {getActionIcon(log.action)}
                          {getActionLabel(log.action)}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">{log.resource_type || 'system'}</p>
                          <p className="font-mono text-xs text-slate-500">
                            {log.resource_id ? `${log.resource_id.substring(0, 8)}...` : 'Sem ID de recurso'}
                          </p>
                        </div>
                      </td>
                      <td className="max-w-xs px-6 py-4">
                        <p className="truncate text-sm text-slate-600">{log.reason || 'Sem motivo informado'}</p>
                      </td>
                      <td className="px-6 py-4">
                        <button
                          onClick={() => toggleExpandRow(log.id)}
                          className="rounded-lg p-2 text-slate-600 transition-colors hover:bg-slate-100"
                        >
                          {expandedRow === log.id ? (
                            <ChevronUp className="h-4 w-4" />
                          ) : (
                            <ChevronDown className="h-4 w-4" />
                          )}
                        </button>
                      </td>
                    </tr>
                    {expandedRow === log.id && (
                      <tr className="bg-slate-50">
                        <td colSpan={6} className="px-6 py-4">
                          <div className="space-y-4">
                            <div>
                              <h4 className="mb-2 font-bold text-slate-900">Informações completas</h4>
                              <div className="grid grid-cols-2 gap-4">
                                <div>
                                  <p className="text-xs font-semibold uppercase text-slate-500">IP Address</p>
                                  <p className="font-mono text-sm text-slate-900">{log.ip_address || 'N/A'}</p>
                                </div>
                                <div>
                                  <p className="text-xs font-semibold uppercase text-slate-500">User Agent</p>
                                  <p className="truncate text-sm text-slate-900">{log.user_agent || 'N/A'}</p>
                                </div>
                              </div>
                            </div>

                            {log.old_value && (
                              <div>
                                <h4 className="mb-2 font-bold text-slate-900">Valor anterior</h4>
                                <pre className="overflow-x-auto rounded-lg border border-slate-200 bg-white p-3 text-xs">
                                  {JSON.stringify(log.old_value, null, 2)}
                                </pre>
                              </div>
                            )}

                            {log.new_value && (
                              <div>
                                <h4 className="mb-2 font-bold text-slate-900">Novo valor</h4>
                                <pre className="overflow-x-auto rounded-lg border border-slate-200 bg-white p-3 text-xs">
                                  {JSON.stringify(log.new_value, null, 2)}
                                </pre>
                              </div>
                            )}

                            <div>
                              <h4 className="mb-2 font-bold text-slate-900">Motivo completo</h4>
                              <p className="rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-600">
                                {log.reason || 'Sem motivo informado'}
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

        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-slate-200 px-6 py-4">
            <p className="text-sm text-slate-500">
              Página {page + 1} de {totalPages}
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(Math.max(0, page - 1))}
                disabled={page === 0}
                className="rounded-lg p-2 text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-50"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button
                onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
                disabled={page >= totalPages - 1}
                className="rounded-lg p-2 text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-50"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AuditLogs;
