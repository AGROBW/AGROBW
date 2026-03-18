import React, { useState, useEffect } from 'react';
import { 
  Search, 
  ChevronLeft, 
  ChevronRight,
  Edit,
  Ban,
  CheckCircle,
  Eye,
  Crown,
  AlertTriangle,
  Filter,
  XCircle,
  Clock,
  AlertCircle,
  Target,
  Users
} from 'lucide-react';
import { supabase } from '../../src/lib/supabaseClient';
import { useAdminAudit, ADMIN_ACTIONS, RESOURCE_TYPES } from '../../src/hooks/useAdminAudit';
import { toast } from 'sonner';

interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  document: string; // CPF/CNPJ
  role: 'user' | 'editor' | 'admin';
  plan?: string;
  is_admin: boolean;
  is_suspended: boolean;
  suspension_reason: string | null;
  suspended_at: string | null;
  created_at: string;
  last_login: string | null; // Sincronizado via trigger do auth.users.last_sign_in_at
  plan_name?: string; // Nome do plano ativo (extraído de user_subscriptions)
  user_subscriptions?: Array<{
    status: string;
    plans: {
      name: string;
    };
  }>;
  _count?: {
    announcements: number;
  };
}

const UserManagement: React.FC = () => {
  const { logAction } = useAdminAudit();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showSuspendModal, setShowSuspendModal] = useState(false);
  const [suspensionReason, setSuspensionReason] = useState('');
  const [newPlan, setNewPlan] = useState<string>('');
  const [newRole, setNewRole] = useState<string>('');
  const [availablePlans, setAvailablePlans] = useState<Array<{ id: string; name: string; monthly_price: number }>>([]);

  const PAGE_SIZE = 20;

  useEffect(() => {
    loadUsers();
    loadPlans();
  }, [page, searchTerm, filterStatus]);

  // Debug: Log do usuário selecionado no modal de detalhes
  useEffect(() => {
    if (showDetailsModal && selectedUser) {
      console.log('[UserManagement] 📋 Dados do usuário selecionado:', {
        id: selectedUser.id,
        name: selectedUser.name,
        email: selectedUser.email,
        document: selectedUser.document,
        plan_name: selectedUser.plan_name,
        last_login: selectedUser.last_login,
        is_suspended: selectedUser.is_suspended,
        announcements_count: selectedUser._count?.announcements
      });
    }
  }, [showDetailsModal, selectedUser]);

  const loadPlans = async () => {
    try {
      const { data, error } = await supabase
        .from('plans')
        .select('id, name, monthly_price')
        .eq('is_active', true)
        .order('position', { ascending: true });

      if (error) throw error;
      setAvailablePlans(data || []);
    } catch (error) {
      console.error('[UserManagement] Erro ao carregar planos:', error);
    }
  };

  const loadUsers = async () => {
    setLoading(true);
    try {
      // Query com JOIN relacional (mais eficiente que N+1 queries)
      let query = supabase
        .from('users')
        .select(`
          *,
          user_subscriptions(
            status,
            plans(
              name
            )
          )
        `, { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      if (searchTerm) {
        query = query.or(
          `name.ilike.%${searchTerm}%,email.ilike.%${searchTerm}%,document.ilike.%${searchTerm}%`
        );
      }

      // Filtro de suspensão
      if (filterStatus === 'suspended') {
        query = query.eq('is_suspended', true);
      } else if (filterStatus === 'active') {
        query = query.eq('is_suspended', false);
      }

      const { data, error, count } = await query;

      if (error) {
        console.error('[UserManagement] Erro na query:', error);
        throw error;
      }

      // 🔍 DEBUG: Log completo dos dados brutos de TODOS os usuários
      console.log('[UserManagement] 🔍 DADOS BRUTOS DE TODOS OS USUÁRIOS:', 
        data?.map(u => ({
          id: u.id,
          name: u.name,
          subscriptions_raw: u.user_subscriptions,
          subscriptions_count: u.user_subscriptions?.length || 0,
          // Detalhar cada subscription
          subscriptions_details: u.user_subscriptions?.map((sub: any) => ({
            status: sub.status,
            plan_name: sub.plans?.name || 'NO_PLAN',
            full_sub: sub
          }))
        }))
      );

      // 🔍 DEBUG: Log completo dos dados brutos
      console.log('[UserManagement] Dados brutos da query (primeiro usuário):', {
        total: data?.length,
        firstUser: data?.[0],
        subscriptions: data?.[0]?.user_subscriptions
      });

      // Flattening: Extrair plano ativo e buscar contagem de anúncios
      const usersWithCounts = await Promise.all(
        (data || []).map(async (user) => {
          // Buscar contagem de anúncios (única sub-query necessária)
          const { count: announcementCount } = await supabase
            .from('announcements')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', user.id);

          // Extrair plano ativo da subscription (flattening relacional)
          // Supabase retorna user_subscriptions como array, mesmo com 1 resultado
          let planName: string | null = null;
          
          if (user.user_subscriptions && Array.isArray(user.user_subscriptions)) {
            const activeSubscription = user.user_subscriptions.find(
              (sub: any) => sub && sub.status === 'active'
            );
            
            if (activeSubscription?.plans) {
              // plans pode ser objeto único ou array dependendo da configuração
              if (Array.isArray(activeSubscription.plans)) {
                planName = activeSubscription.plans[0]?.name || null;
              } else if (typeof activeSubscription.plans === 'object') {
                planName = activeSubscription.plans.name || null;
              }
            }
          }

          return {
            ...user,
            plan_name: planName,
            _count: { announcements: announcementCount || 0 }
          };
        })
      );

      // Log resumido para validação
      console.log('[UserManagement] ✅ Usuários carregados:', usersWithCounts.length);

      setUsers(usersWithCounts);
      setTotalCount(count || 0);
    } catch (error) {
      console.error('[UserManagement] Erro ao carregar usuários:', error);
      toast.error('Erro ao carregar usuários');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdatePlan = async () => {
    if (!selectedUser || !newPlan) return;

    try {
      const oldValue = {
        plan: selectedUser.plan
      };

      const { error } = await supabase
        .from('users')
        .update({ plan: newPlan })
        .eq('id', selectedUser.id);

      if (error) throw error;

      await logAction({
        action: ADMIN_ACTIONS.UPDATE_PLAN,
        resourceType: RESOURCE_TYPES.SUBSCRIPTION,
        resourceId: selectedUser.id,
        oldValue,
        newValue: { plan: newPlan },
        reason: `Plano de ${selectedUser.name} alterado de ${selectedUser.plan} para ${newPlan} por decisão administrativa`
      });

      toast.success(`Plano alterado para ${newPlan}`);
      setShowEditModal(false);
      loadUsers();
    } catch (error) {
      console.error('[UserManagement] Erro ao atualizar plano:', error);
      toast.error('Erro ao atualizar plano');
    }
  };

  const handleUpdateRole = async () => {
    if (!selectedUser || !newRole) return;

    try {
      const oldValue = {
        role: selectedUser.role,
        is_admin: selectedUser.is_admin
      };

      const isAdmin = newRole === 'admin';

      const { error } = await supabase
        .from('users')
        .update({ 
          role: newRole,
          is_admin: isAdmin
        })
        .eq('id', selectedUser.id);

      if (error) throw error;

      await logAction({
        action: ADMIN_ACTIONS.UPDATE_USER_ROLE,
        resourceType: RESOURCE_TYPES.USER,
        resourceId: selectedUser.id,
        oldValue,
        newValue: { role: newRole, is_admin: isAdmin },
        reason: `Permissões de ${selectedUser.name} alteradas para ${newRole}`
      });

      toast.success(`Role alterado para ${newRole}`);
      setShowEditModal(false);
      loadUsers();
    } catch (error) {
      console.error('[UserManagement] Erro ao atualizar role:', error);
      toast.error('Erro ao atualizar permissões');
    }
  };

  const handleSuspendUser = async () => {
    if (!selectedUser || !suspensionReason.trim()) {
      toast.error('Informe o motivo da suspensão');
      return;
    }

    try {
      const oldValue = {
        is_suspended: selectedUser.is_suspended,
        suspension_reason: selectedUser.suspension_reason
      };

      const { error } = await supabase
        .from('users')
        .update({ 
          is_suspended: true,
          suspension_reason: suspensionReason,
          suspended_at: new Date().toISOString()
        })
        .eq('id', selectedUser.id);

      if (error) throw error;

      await logAction({
        action: ADMIN_ACTIONS.SUSPEND_USER,
        resourceType: RESOURCE_TYPES.USER,
        resourceId: selectedUser.id,
        oldValue,
        newValue: {
          is_suspended: true,
          suspension_reason: suspensionReason
        },
        reason: `Usuário ${selectedUser.name} suspenso: ${suspensionReason}`
      });

      toast.success('Usuário suspenso com sucesso');
      setShowSuspendModal(false);
      setSuspensionReason('');
      loadUsers();
    } catch (error) {
      console.error('[UserManagement] Erro ao suspender:', error);
      toast.error('Erro ao suspender usuário');
    }
  };

  const handleUnsuspendUser = async (user: User) => {
    try {
      const oldValue = {
        is_suspended: user.is_suspended,
        suspension_reason: user.suspension_reason
      };

      const { error } = await supabase
        .from('users')
        .update({ 
          is_suspended: false,
          suspension_reason: null
        })
        .eq('id', user.id);

      if (error) throw error;

      await logAction({
        action: ADMIN_ACTIONS.SUSPEND_USER,
        resourceType: RESOURCE_TYPES.USER,
        resourceId: user.id,
        oldValue,
        newValue: {
          is_suspended: false,
          suspension_reason: null
        },
        reason: `Suspensão de ${user.name} removida`
      });

      toast.success('Suspensão removida');
      loadUsers();
    } catch (error) {
      console.error('[UserManagement] Erro ao remover suspensão:', error);
      toast.error('Erro ao remover suspensão');
    }
  };

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black text-slate-900">Gestão de Usuários</h1>
          <p className="text-slate-500 mt-1">{totalCount} usuário{totalCount !== 1 ? 's' : ''} cadastrado{totalCount !== 1 ? 's' : ''}</p>
        </div>
        <button
          onClick={loadUsers}
          className="px-4 py-2 bg-green-500 text-white rounded-lg font-semibold hover:bg-green-600 transition-colors"
        >
          Atualizar
        </button>
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
                placeholder="Buscar por nome, email ou telefone..."
                className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
          </div>

          {/* Status Filter */}
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
          >
            <option value="all">Todos os Status</option>
            <option value="active">Ativos</option>
            <option value="suspended">Suspensos</option>
          </select>
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-black text-slate-600 uppercase tracking-wider">
                  Usuário
                </th>
                <th className="px-6 py-3 text-left text-xs font-black text-slate-600 uppercase tracking-wider">
                  Role
                </th>
                <th className="px-6 py-3 text-left text-xs font-black text-slate-600 uppercase tracking-wider">
                  Anúncios
                </th>
                <th className="px-6 py-3 text-left text-xs font-black text-slate-600 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-black text-slate-600 uppercase tracking-wider">
                  Ações
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center">
                    <div className="flex items-center justify-center">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div>
                    </div>
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-slate-500">
                    Nenhum usuário encontrado
                  </td>
                </tr>
              ) : (
                users.map((user) => (
                  <tr key={user.id} className={`hover:bg-slate-50 transition-colors ${user.is_suspended ? 'bg-red-50/50' : ''}`}>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center text-green-600 font-bold">
                          {user.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-semibold text-slate-900 flex items-center gap-2">
                            {user.name}
                            {user.is_admin && <Crown className="w-4 h-4 text-yellow-500" />}
                          </p>
                          <p className="text-sm text-slate-500">{user.email}</p>
                          <p className="text-xs text-slate-400">{user.phone}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                        user.role === 'admin' ? 'bg-red-100 text-red-800' :
                        user.role === 'editor' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-slate-100 text-slate-800'
                      }`}>
                        {user.role}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600">
                      <button
                        onClick={() => window.location.href = `#/admin/users/${user.id}/announcements`}
                        className="text-green-600 hover:underline font-semibold"
                      >
                        {user._count?.announcements || 0} anúncio{user._count?.announcements !== 1 ? 's' : ''}
                      </button>
                    </td>
                    <td className="px-6 py-4">
                      {user.is_suspended ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-800">
                          <AlertTriangle className="w-3 h-3" />
                          Suspenso
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-800">
                          <CheckCircle className="w-3 h-3" />
                          Ativo
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            setSelectedUser(user);
                            setNewPlan(user.plan);
                            setNewRole(user.role);
                            setShowEditModal(true);
                          }}
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="Editar"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        {user.is_suspended ? (
                          <button
                            onClick={() => handleUnsuspendUser(user)}
                            className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                            title="Remover Suspensão"
                          >
                            <CheckCircle className="w-4 h-4" />
                          </button>
                        ) : (
                          <button
                            onClick={() => {
                              setSelectedUser(user);
                              setShowSuspendModal(true);
                            }}
                            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="Suspender"
                          >
                            <Ban className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          onClick={() => {
                            setSelectedUser(user);
                            setShowDetailsModal(true);
                          }}
                          className="p-2 text-slate-600 hover:bg-slate-50 rounded-lg transition-colors"
                          title="Ver Detalhes"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
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

      {/* Edit Modal */}
      {showEditModal && selectedUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6">
            <h3 className="text-xl font-bold text-slate-900 mb-4">Editar Usuário: {selectedUser.name}</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Plano</label>
                <select
                  value={newPlan}
                  onChange={(e) => setNewPlan(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-green-500"
                >
                  <option value="">Selecione um plano</option>
                  {availablePlans.map(plan => (
                    <option key={plan.id} value={plan.name}>
                      {plan.name} - R$ {plan.monthly_price.toFixed(2)}/mês
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Role/Permissões</label>
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-green-500"
                >
                  <option value="user">User (padrão)</option>
                  <option value="editor">Editor (moderador)</option>
                  <option value="admin">Admin (acesso total)</option>
                </select>
              </div>
            </div>

            <div className="flex items-center gap-3 mt-6">
              <button
                onClick={() => setShowEditModal(false)}
                className="flex-1 px-4 py-2 border border-slate-200 text-slate-600 rounded-lg font-semibold hover:bg-slate-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  handleUpdatePlan();
                  handleUpdateRole();
                }}
                className="flex-1 px-4 py-2 bg-green-500 text-white rounded-lg font-semibold hover:bg-green-600 transition-colors"
              >
                Salvar Alterações
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Details Modal */}
      {showDetailsModal && selectedUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-slate-900">Detalhes do Usuário</h3>
              <button
                onClick={() => setShowDetailsModal(false)}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-6">
              {/* Informações Pessoais */}
              <div className="bg-slate-50 rounded-xl p-4">
                <h4 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
                  <Users className="w-4 h-4 text-green-600" />
                  Informações Pessoais
                </h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-slate-500 mb-1">Nome</p>
                    <p className="font-semibold text-slate-900">{selectedUser.name}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 mb-1">Email</p>
                    <p className="font-semibold text-slate-900">{selectedUser.email}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 mb-1">Telefone</p>
                    <p className="font-semibold text-slate-900">{selectedUser.phone || 'Não informado'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 mb-1">CPF/CNPJ</p>
                    <p className="font-semibold text-slate-900">{selectedUser.document || 'Não informado'}</p>
                  </div>
                </div>
              </div>

              {/* Plano e Permissões */}
              <div className="bg-slate-50 rounded-xl p-4">
                <h4 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
                  <Target className="w-4 h-4 text-blue-600" />
                  Plano e Permissões
                </h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-slate-500 mb-1">Plano Atual</p>
                    <span className="inline-block px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm font-semibold">
                      {selectedUser.plan_name || 'Sem plano ativo'}
                    </span>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 mb-1">Tipo de Conta</p>
                    <span className={`inline-block px-3 py-1 rounded-full text-sm font-semibold ${
                      selectedUser.role === 'admin' ? 'bg-purple-100 text-purple-800' :
                      selectedUser.role === 'editor' ? 'bg-blue-100 text-blue-800' :
                      'bg-slate-100 text-slate-800'
                    }`}>
                      {selectedUser.role === 'admin' ? 'Administrador' :
                       selectedUser.role === 'editor' ? 'Editor' : 'Usuário'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Estatísticas */}
              <div className="bg-slate-50 rounded-xl p-4">
                <h4 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
                  <Target className="w-4 h-4 text-amber-600" />
                  Estatísticas
                </h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-slate-500 mb-1">Total de Anúncios</p>
                    <p className="text-2xl font-bold text-slate-900">{selectedUser._count?.announcements || 0}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 mb-1">Status</p>
                    <span className={`inline-block px-3 py-1 rounded-full text-sm font-semibold ${
                      selectedUser.is_suspended ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'
                    }`}>
                      {selectedUser.is_suspended ? 'Suspenso' : 'Ativo'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Datas */}
              <div className="bg-slate-50 rounded-xl p-4">
                <h4 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-slate-600" />
                  Informações de Registro
                </h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-slate-500 mb-1">Cadastro</p>
                    <p className="font-semibold text-slate-900">
                      {new Date(selectedUser.created_at).toLocaleDateString('pt-BR')}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 mb-1">Último Login</p>
                    <p className="font-semibold text-slate-900">
                      {selectedUser.last_login 
                        ? new Date(selectedUser.last_login).toLocaleString('pt-BR', {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })
                        : 'Nunca acessou'
                      }
                    </p>
                  </div>
                </div>
              </div>

              {/* Motivo de Suspensão (se aplicável) */}
              {selectedUser.is_suspended && selectedUser.suspension_reason && (
                <div className="bg-red-50 rounded-xl p-4 border border-red-200">
                  <h4 className="font-semibold text-red-900 mb-2 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4" />
                    Motivo da Suspensão
                  </h4>
                  <p className="text-sm text-red-800">{selectedUser.suspension_reason}</p>
                </div>
              )}
            </div>

            <div className="flex items-center gap-3 mt-6">
              <button
                onClick={() => setShowDetailsModal(false)}
                className="flex-1 px-4 py-2 border border-slate-200 text-slate-600 rounded-lg font-semibold hover:bg-slate-50 transition-colors"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Suspend Modal */}
      {showSuspendModal && selectedUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6">
            <h3 className="text-xl font-bold text-slate-900 mb-4">Suspender Usuário</h3>
            <p className="text-slate-600 mb-4">
              Suspender: <strong>{selectedUser.name}</strong>
            </p>
            <textarea
              value={suspensionReason}
              onChange={(e) => setSuspensionReason(e.target.value)}
              placeholder="Motivo da suspensão (obrigatório)..."
              className="w-full border border-slate-200 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-red-500 min-h-[100px]"
            />
            <div className="flex items-center gap-3 mt-6">
              <button
                onClick={() => {
                  setShowSuspendModal(false);
                  setSuspensionReason('');
                }}
                className="flex-1 px-4 py-2 border border-slate-200 text-slate-600 rounded-lg font-semibold hover:bg-slate-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleSuspendUser}
                disabled={!suspensionReason.trim()}
                className="flex-1 px-4 py-2 bg-red-500 text-white rounded-lg font-semibold hover:bg-red-600 transition-colors disabled:opacity-50"
              >
                Suspender Usuário
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserManagement;
