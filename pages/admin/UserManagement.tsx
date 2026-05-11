import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { 
  Search, 
  ChevronLeft, 
  ChevronRight,
  Edit,
  BadgeCheck,
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
  Users,
  CreditCard,
  Store,
  Trash2,
  Loader2
} from 'lucide-react';
import { supabase } from '../../src/lib/supabaseClient';
import { useAdminAudit, ADMIN_ACTIONS, RESOURCE_TYPES } from '../../src/hooks/useAdminAudit';
import { toast } from 'sonner';
import { adminDeleteAnnouncementWithNotification } from '../../src/hooks/useAds';

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
  document_verified?: boolean;
  document_review_status?: 'not_submitted' | 'pending' | 'approved' | 'rejected' | null;
  document_review_notes?: string | null;
  document_reviewed_at?: string | null;
  document_reviewed_by?: string | null;
  suspension_reason: string | null;
  suspended_at: string | null;
  created_at: string;
  last_login: string | null; // Sincronizado via trigger do auth.users.last_sign_in_at
  start_plan_consumed_at?: string | null;
  plan_name?: string; // Nome do plano ativo (extraÃ­do de user_subscriptions)
  active_subscription_id?: string | null;
  active_plan_id?: string | null;
  active_period_start?: string | null;
  active_period_end?: string | null;
  user_subscriptions?: Array<{
    id: string;
    plan_id: string;
    status: string;
    current_period_start: string | null;
    current_period_end: string | null;
    plans: {
      name: string;
    };
  }>;
  _count?: {
    announcements: number;
  };
}

interface SubscriptionRow {
  id: string;
  user_id: string;
  user_name: string;
  user_email: string;
  plan_name: string;
  status: string;
  current_period_start: string | null;
  current_period_end: string | null;
  monthly_price: number;
  has_seller_store: boolean;
  is_store_paused: boolean;
}

interface ManagedAnnouncement {
  id: string;
  title: string;
  status: string;
  price: number | null;
  created_at: string;
  expires_at: string | null;
  views: number | null;
}

const formatDateCell = (value: string | null) => {
  if (!value) return '-';
  return new Date(value).toLocaleDateString('pt-BR');
};

const getSubscriptionStatusMeta = (status: string, endDate: string | null) => {
  const isExpired = !!endDate && new Date(endDate) <= new Date();

  if (status === 'canceled') {
    return {
      label: 'Cancelada',
      className: 'bg-rose-100 text-rose-700',
    };
  }

  if (isExpired) {
    return {
      label: 'Vencida',
      className: 'bg-amber-100 text-amber-700',
    };
  }

  if (status === 'active') {
    return {
      label: 'Ativa',
      className: 'bg-emerald-100 text-emerald-700',
    };
  }

  return {
    label: status,
    className: 'bg-slate-100 text-slate-700',
  };
};

const getSubscriptionTypeMeta = (monthlyPrice: number) => {
  if (monthlyPrice > 0) {
    return {
      label: 'Pago',
      className: 'bg-sky-100 text-sky-700',
    };
  }

  return {
    label: 'Gratuito',
    className: 'bg-slate-100 text-slate-700',
  };
};

const formatDateInputValue = (value: Date | string | null | undefined) => {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
};

const addDurationToDate = (startDateValue: string, amount: number, unit: 'days' | 'months' | 'years') => {
  const startDate = new Date(`${startDateValue}T12:00:00`);
  if (Number.isNaN(startDate.getTime())) return '';

  const safeAmount = Math.max(1, Number.isFinite(amount) ? amount : 1);
  const endDate = new Date(startDate);

  if (unit === 'days') {
    endDate.setDate(endDate.getDate() + safeAmount);
  } else if (unit === 'months') {
    endDate.setMonth(endDate.getMonth() + safeAmount);
  } else {
    endDate.setFullYear(endDate.getFullYear() + safeAmount);
  }

  return formatDateInputValue(endDate);
};

const toPeriodStartIso = (dateValue: string) => new Date(`${dateValue}T00:00:00`).toISOString();
const toPeriodEndIso = (dateValue: string) => new Date(`${dateValue}T23:59:59.999`).toISOString();

const UserManagement: React.FC = () => {
  const { logAction } = useAdminAudit();
  const location = useLocation();
  const [activeTab, setActiveTab] = useState<'users' | 'subscriptions'>('users');
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterVerification, setFilterVerification] = useState<string>('all');
  const [subscriptions, setSubscriptions] = useState<SubscriptionRow[]>([]);
  const [subscriptionsLoading, setSubscriptionsLoading] = useState(false);
  const [subscriptionsPage, setSubscriptionsPage] = useState(0);
  const [subscriptionsTotalCount, setSubscriptionsTotalCount] = useState(0);
  const [subscriptionSearchTerm, setSubscriptionSearchTerm] = useState('');
  const [subscriptionStatusFilter, setSubscriptionStatusFilter] = useState<string>('all');
  const [subscriptionTypeFilter, setSubscriptionTypeFilter] = useState<string>('all');
  const [subscriptionWindowFilter, setSubscriptionWindowFilter] = useState<string>('all');
  const [subscriptionStoreFilter, setSubscriptionStoreFilter] = useState<string>('all');
  const [subscriptionSummary, setSubscriptionSummary] = useState({
    paidActive: 0,
    freeActive: 0,
    expiredPaid: 0,
    expiringSoon: 0,
    pausedStores: 0,
  });
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showSuspendModal, setShowSuspendModal] = useState(false);
  const [showUnsuspendModal, setShowUnsuspendModal] = useState(false);
  const [showDeleteAnnouncementModal, setShowDeleteAnnouncementModal] = useState(false);
  const [suspensionReason, setSuspensionReason] = useState('');
  const [unsuspensionReason, setUnsuspensionReason] = useState('');
  const [announcementDeleteReason, setAnnouncementDeleteReason] = useState('');
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<ManagedAnnouncement | null>(null);
  const [userAnnouncements, setUserAnnouncements] = useState<ManagedAnnouncement[]>([]);
  const [userAnnouncementsLoading, setUserAnnouncementsLoading] = useState(false);
  const [isDeletingAnnouncement, setIsDeletingAnnouncement] = useState(false);
  const [newPlan, setNewPlan] = useState<string>('');
  const [newRole, setNewRole] = useState<string>('');
  const [planPeriodStart, setPlanPeriodStart] = useState(formatDateInputValue(new Date()));
  const [planDurationAmount, setPlanDurationAmount] = useState(1);
  const [planDurationUnit, setPlanDurationUnit] = useState<'days' | 'months' | 'years'>('months');
  const [planPeriodEnd, setPlanPeriodEnd] = useState(addDurationToDate(formatDateInputValue(new Date()), 1, 'months'));
  const [isSavingUserEdit, setIsSavingUserEdit] = useState(false);
  const [availablePlans, setAvailablePlans] = useState<Array<{
    id: string;
    name: string;
    monthly_price: number;
    plan_validity_days_monthly: number | null;
    plan_validity_days_yearly: number | null;
    is_default_signup_plan: boolean;
  }>>([]);

  const PAGE_SIZE = 20;

  useEffect(() => {
    loadPlans();
  }, []);

  useEffect(() => {
    if (activeTab === 'users') {
      loadUsers();
    }
  }, [activeTab, page, searchTerm, filterStatus, filterVerification]);

  useEffect(() => {
    if (activeTab === 'subscriptions') {
      loadSubscriptions();
    }
  }, [
    activeTab,
    subscriptionsPage,
    subscriptionSearchTerm,
    subscriptionStatusFilter,
    subscriptionTypeFilter,
    subscriptionWindowFilter,
    subscriptionStoreFilter,
  ]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const query = params.get('q') || '';

    if (query !== searchTerm) {
      setPage(0);
      setSearchTerm(query);
    }
  }, [location.search]);

  // Debug: Log do usuÃ¡rio selecionado no modal de detalhes
  useEffect(() => {
    if (showDetailsModal && selectedUser) {
      console.log('[UserManagement] ðŸ“‹ Dados do usuÃ¡rio selecionado:', {
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

  useEffect(() => {
    if (!showDetailsModal || !selectedUser?.id) {
      setUserAnnouncements([]);
      setUserAnnouncementsLoading(false);
      return;
    }

    void loadUserAnnouncements(selectedUser.id);
  }, [showDetailsModal, selectedUser?.id]);

  const loadPlans = async () => {
    try {
      const { data, error } = await supabase
        .from('plans')
        .select('id, name, monthly_price, plan_validity_days_monthly, plan_validity_days_yearly, is_default_signup_plan')
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
            id,
            plan_id,
            status,
            current_period_start,
            current_period_end,
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

      // Filtro de suspensÃ£o
      if (filterStatus === 'suspended') {
        query = query.eq('is_suspended', true);
      } else if (filterStatus === 'active') {
        query = query.eq('is_suspended', false);
      }

      if (filterVerification === 'verified') {
        query = query.eq('document_verified', true);
      } else if (filterVerification === 'not_verified') {
        query = query.or('document_verified.is.null,document_verified.eq.false');
      }

      const { data, error, count } = await query;

      if (error) {
        console.error('[UserManagement] Erro na query:', error);
        throw error;
      }

      // ðŸ” DEBUG: Log completo dos dados brutos de TODOS os usuÃ¡rios
      console.log('[UserManagement] ðŸ” DADOS BRUTOS DE TODOS OS USUÃRIOS:', 
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

      // ðŸ” DEBUG: Log completo dos dados brutos
      console.log('[UserManagement] Dados brutos da query (primeiro usuÃ¡rio):', {
        total: data?.length,
        firstUser: data?.[0],
        subscriptions: data?.[0]?.user_subscriptions
      });

      // Flattening: Extrair plano ativo e buscar contagem de anÃºncios
      const usersWithCounts = await Promise.all(
        (data || []).map(async (user) => {
          // Buscar contagem de anÃºncios (Ãºnica sub-query necessÃ¡ria)
          const { count: announcementCount } = await supabase
            .from('announcements')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', user.id);

          // Extrair plano ativo da subscription (flattening relacional)
          // Supabase retorna user_subscriptions como array, mesmo com 1 resultado
          let planName: string | null = null;
          let activeSubscription: any = null;
          
          if (user.user_subscriptions && Array.isArray(user.user_subscriptions)) {
            activeSubscription = user.user_subscriptions.find(
              (sub: any) => sub && sub.status === 'active'
            );
            
            if (activeSubscription?.plans) {
              // plans pode ser objeto Ãºnico ou array dependendo da configuraÃ§Ã£o
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
            active_subscription_id: activeSubscription?.id || null,
            active_plan_id: activeSubscription?.plan_id || null,
            active_period_start: activeSubscription?.current_period_start || null,
            active_period_end: activeSubscription?.current_period_end || null,
            _count: { announcements: announcementCount || 0 }
          };
        })
      );

      // Log resumido para validaÃ§Ã£o
      console.log('[UserManagement] âœ… UsuÃ¡rios carregados:', usersWithCounts.length);

      setUsers(usersWithCounts);
      setTotalCount(count || 0);
    } catch (error) {
      console.error('[UserManagement] Erro ao carregar usuÃ¡rios:', error);
      toast.error('Erro ao carregar usuários.');
    } finally {
      setLoading(false);
    }
  };

  const loadSubscriptions = async () => {
    setSubscriptionsLoading(true);

    try {
      const now = new Date();
      const nowIso = now.toISOString();
      const sevenDaysAheadIso = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
      const trimmedSearch = subscriptionSearchTerm.trim();

      let matchingUserIds: string[] | null = null;

      if (trimmedSearch) {
        const { data: matchingUsers, error: matchingUsersError } = await supabase
          .from('users')
          .select('id')
          .or(`name.ilike.%${trimmedSearch}%,email.ilike.%${trimmedSearch}%`);

        if (matchingUsersError) throw matchingUsersError;

        matchingUserIds = (matchingUsers || []).map((user) => user.id);

        if (matchingUserIds.length === 0) {
          setSubscriptionSummary((current) => current);
          setSubscriptions([]);
          setSubscriptionsTotalCount(0);
          setSubscriptionsLoading(false);
          return;
        }
      }

      const [
        paidActiveResponse,
        freeActiveResponse,
        expiredPaidResponse,
        expiringSoonResponse,
        pausedStoresResponse,
      ] = await Promise.all([
        supabase
          .from('user_subscriptions')
          .select('id, plans!inner(monthly_price)', { count: 'exact', head: true })
          .eq('status', 'active')
          .gt('current_period_end', nowIso)
          .gt('plans.monthly_price', 0),
        supabase
          .from('user_subscriptions')
          .select('id, plans!inner(monthly_price)', { count: 'exact', head: true })
          .eq('status', 'active')
          .gt('current_period_end', nowIso)
          .eq('plans.monthly_price', 0),
        supabase
          .from('user_subscriptions')
          .select('id, plans!inner(monthly_price)', { count: 'exact', head: true })
          .lte('current_period_end', nowIso)
          .gt('plans.monthly_price', 0),
        supabase
          .from('user_subscriptions')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'active')
          .gt('current_period_end', nowIso)
          .lte('current_period_end', sevenDaysAheadIso),
        supabase
          .from('seller_stores')
          .select('id', { count: 'exact', head: true })
          .eq('is_paused_due_to_plan', true),
      ]);

      setSubscriptionSummary({
        paidActive: paidActiveResponse.count || 0,
        freeActive: freeActiveResponse.count || 0,
        expiredPaid: expiredPaidResponse.count || 0,
        expiringSoon: expiringSoonResponse.count || 0,
        pausedStores: pausedStoresResponse.count || 0,
      });

      let query = supabase
        .from('user_subscriptions')
        .select(`
          id,
          user_id,
          status,
          current_period_start,
          current_period_end,
          users!inner(name,email),
          plans!inner(name,monthly_price,has_seller_store)
        `, { count: 'exact' })
        .order('current_period_end', { ascending: true, nullsFirst: false })
        .range(subscriptionsPage * PAGE_SIZE, (subscriptionsPage + 1) * PAGE_SIZE - 1);

      if (matchingUserIds) {
        query = query.in('user_id', matchingUserIds);
      }

      if (subscriptionStatusFilter !== 'all') {
        query = query.eq('status', subscriptionStatusFilter);
      }

      if (subscriptionTypeFilter === 'paid') {
        query = query.gt('plans.monthly_price', 0);
      } else if (subscriptionTypeFilter === 'free') {
        query = query.eq('plans.monthly_price', 0);
      }

      if (subscriptionWindowFilter === 'expiring_7') {
        query = query.eq('status', 'active').gt('current_period_end', nowIso).lte('current_period_end', sevenDaysAheadIso);
      } else if (subscriptionWindowFilter === 'expired') {
        query = query.lte('current_period_end', nowIso);
      } else if (subscriptionWindowFilter === 'active') {
        query = query.eq('status', 'active').gt('current_period_end', nowIso);
      }

      if (subscriptionStoreFilter === 'store_active') {
        query = query.eq('plans.has_seller_store', true);
      } else if (subscriptionStoreFilter === 'store_paused') {
        query = query.eq('plans.has_seller_store', true);
      }

      const { data, error, count } = await query;

      if (error) throw error;

      const rows = (data as any[]) || [];
      const userIds = Array.from(new Set(rows.map((row) => row.user_id).filter(Boolean)));
      const { data: storesData, error: storesError } = userIds.length
        ? await supabase
            .from('seller_stores')
            .select('user_id,is_paused_due_to_plan')
            .in('user_id', userIds)
        : { data: [], error: null as any };

      if (storesError) throw storesError;

      const pausedStoreUserIds = new Set(
        (storesData || [])
          .filter((store: any) => store.is_paused_due_to_plan)
          .map((store: any) => store.user_id)
      );

      let mapped = rows.map((row) => ({
        id: row.id,
        user_id: row.user_id,
        user_name: row.users?.name || 'Não informado',
        user_email: row.users?.email || 'Sem e-mail',
        plan_name: row.plans?.name || 'Sem plano',
        status: row.status,
        current_period_start: row.current_period_start,
        current_period_end: row.current_period_end,
        monthly_price: Number(row.plans?.monthly_price || 0),
        has_seller_store: !!row.plans?.has_seller_store,
        is_store_paused: pausedStoreUserIds.has(row.user_id),
      })) as SubscriptionRow[];

      if (subscriptionStoreFilter === 'store_active') {
        mapped = mapped.filter((row) => row.has_seller_store && !row.is_store_paused);
      } else if (subscriptionStoreFilter === 'store_paused') {
        mapped = mapped.filter((row) => row.is_store_paused);
      }

      setSubscriptions(mapped);
      setSubscriptionsTotalCount(
        subscriptionStoreFilter === 'store_active' || subscriptionStoreFilter === 'store_paused'
          ? mapped.length
          : count || 0
      );
    } catch (error) {
      console.error('[UserManagement] Erro ao carregar assinaturas:', error);
      toast.error('Erro ao carregar assinaturas');
    } finally {
      setSubscriptionsLoading(false);
    }
  };

  const loadUserAnnouncements = async (userId: string) => {
    setUserAnnouncementsLoading(true);

    try {
      const { data, error } = await supabase
        .from('announcements')
        .select('id,title,status,price,unit_price,created_at,expires_at,views')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const mappedAnnouncements: ManagedAnnouncement[] = (data || []).map((announcement: any) => ({
        id: announcement.id,
        title: announcement.title,
        status: announcement.status,
        price: announcement.price !== null && announcement.price !== undefined
          ? Number(announcement.price)
          : announcement.unit_price !== null && announcement.unit_price !== undefined
            ? Number(announcement.unit_price)
            : null,
        created_at: announcement.created_at,
        expires_at: announcement.expires_at || null,
        views: announcement.views ?? 0,
      }));

      setUserAnnouncements(mappedAnnouncements);
    } catch (error) {
      console.error('[UserManagement] Erro ao carregar anÃºncios do usuÃ¡rio:', error);
      toast.error('Erro ao carregar anúncios do usuário.');
      setUserAnnouncements([]);
    } finally {
      setUserAnnouncementsLoading(false);
    }
  };

  const getAnnouncementStatusMeta = (status: string) => {
    const normalizedStatus = (status || '').toUpperCase();

    if (normalizedStatus === 'ACTIVE') {
      return { label: 'Ativo', className: 'bg-emerald-100 text-emerald-700' };
    }

    if (normalizedStatus === 'PAUSED') {
      return { label: 'Pausado', className: 'bg-slate-100 text-slate-700' };
    }

    if (normalizedStatus === 'PENDING') {
      return { label: 'Pendente', className: 'bg-amber-100 text-amber-700' };
    }

    if (normalizedStatus === 'EXPIRED') {
      return { label: 'Vencido', className: 'bg-rose-100 text-rose-700' };
    }

    if (normalizedStatus === 'BLOCKED') {
      return { label: 'Bloqueado', className: 'bg-red-100 text-red-700' };
    }

    return { label: status || 'Sem status', className: 'bg-slate-100 text-slate-700' };
  };

  const openDeleteAnnouncementModal = (announcement: ManagedAnnouncement) => {
    setSelectedAnnouncement(announcement);
    setAnnouncementDeleteReason('');
    setShowDeleteAnnouncementModal(true);
  };

  const closeDeleteAnnouncementModal = () => {
    if (isDeletingAnnouncement) return;
    setShowDeleteAnnouncementModal(false);
    setSelectedAnnouncement(null);
    setAnnouncementDeleteReason('');
  };

  const handleDeleteAnnouncement = async () => {
    if (!selectedUser || !selectedAnnouncement || !announcementDeleteReason.trim()) {
      toast.error('Informe o motivo da exclusão do anúncio.');
      return;
    }

    setIsDeletingAnnouncement(true);

    try {
      await adminDeleteAnnouncementWithNotification(
        selectedAnnouncement.id,
        announcementDeleteReason.trim(),
      );

      await logAction({
        action: ADMIN_ACTIONS.DELETE_AD,
        resourceType: RESOURCE_TYPES.ANNOUNCEMENT,
        resourceId: selectedAnnouncement.id,
        oldValue: {
          announcement: selectedAnnouncement,
          owner_user_id: selectedUser.id,
          owner_name: selectedUser.name,
        },
        newValue: {
          deleted: true,
        },
        reason: `Anúncio "${selectedAnnouncement.title}" excluído na Gestão de Usuários. Motivo: ${announcementDeleteReason.trim()}`,
      });

      toast.success('Anúncio excluído com sucesso.');

      setUserAnnouncements((current) =>
        current.filter((announcement) => announcement.id !== selectedAnnouncement.id)
      );
      setUsers((current) =>
        current.map((user) =>
          user.id === selectedUser.id
            ? {
                ...user,
                _count: {
                  announcements: Math.max((user._count?.announcements || 0) - 1, 0),
                },
              }
            : user
        )
      );
      setSelectedUser((current) =>
        current
          ? {
              ...current,
              _count: {
                announcements: Math.max((current._count?.announcements || 0) - 1, 0),
              },
            }
          : current
      );

      closeDeleteAnnouncementModal();
    } catch (error: any) {
      console.error('[UserManagement] Erro ao excluir anúncio:', error);
      toast.error(error?.message || 'Erro ao excluir anúncio.');
    } finally {
      setIsDeletingAnnouncement(false);
    }
  };

  const handleUpdatePlan = async () => {
    if (!selectedUser || !newPlan) {
      toast.error('Selecione um plano para continuar');
      return false;
    }

    try {
      const selectedPlan = availablePlans.find((plan) => plan.id === newPlan);
      if (!selectedPlan) {
        toast.error('Plano selecionado não encontrado.');
        return false;
      }

      if (selectedPlan.is_default_signup_plan && selectedUser.start_plan_consumed_at) {
        toast.error('Este usuário já consumiu o plano inicial do cadastro. Escolha um plano pago diferente para a reativação.');
        return false;
      }

      if (!planPeriodStart || !planPeriodEnd || new Date(`${planPeriodEnd}T23:59:59.999`) <= new Date(`${planPeriodStart}T00:00:00`)) {
        toast.error('Informe um período válido para o plano.');
        return false;
      }

      const periodStartIso = toPeriodStartIso(planPeriodStart);
      const periodEndIso = toPeriodEndIso(planPeriodEnd);

      const { data, error } = await supabase.rpc('admin_update_user_plan_period', {
        p_user_id: selectedUser.id,
        p_plan_id: selectedPlan.id,
        p_period_start: periodStartIso,
        p_period_end: periodEndIso,
        p_billing_cycle: planDurationUnit === 'years' ? 'yearly' : 'monthly',
      });

      if (error) throw error;

      await logAction({
        action: ADMIN_ACTIONS.UPDATE_PLAN,
        resourceType: RESOURCE_TYPES.SUBSCRIPTION,
        resourceId: selectedUser.id,
        oldValue: {
          plan: selectedUser.plan_name,
          subscription_id: selectedUser.active_subscription_id,
          period_start: selectedUser.active_period_start,
          period_end: selectedUser.active_period_end,
        },
        newValue: {
          plan: selectedPlan.name,
          period_start: periodStartIso,
          period_end: periodEndIso,
          duration_amount: planDurationAmount,
          duration_unit: planDurationUnit,
          rpc_result: data,
        },
        reason: `Plano de ${selectedUser.name} alterado de ${selectedUser.plan_name || 'sem plano ativo'} para ${selectedPlan.name} com vigência administrativa de ${formatDateCell(periodStartIso)} até ${formatDateCell(periodEndIso)}`
      });

      toast.success(`Plano alterado para ${selectedPlan.name}`);
      return true;
    } catch (error) {
      console.error('[UserManagement] Erro ao atualizar plano:', error);
      toast.error('Erro ao atualizar plano');
      return false;
    }
  };

  const handleUpdateRole = async () => {
    if (!selectedUser || !newRole) return false;
    if (selectedUser.role === newRole && selectedUser.is_admin === (newRole === 'admin')) {
      return true;
    }

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
      return true;
    } catch (error) {
      console.error('[UserManagement] Erro ao atualizar role:', error);
      toast.error('Erro ao atualizar permissões.');
      return false;
    }
  };

  const handleSaveUserChanges = async () => {
    if (!selectedUser || isSavingUserEdit) return;

    setIsSavingUserEdit(true);
    try {
      const planUpdated = await handleUpdatePlan();
      if (!planUpdated) return;

      const roleUpdated = await handleUpdateRole();
      if (!roleUpdated) return;

      setShowEditModal(false);
      await loadUsers();
      if (activeTab === 'subscriptions') {
        await loadSubscriptions();
      }
    } finally {
      setIsSavingUserEdit(false);
    }
  };

  const handleSuspendUser = async () => {
    if (!selectedUser || !suspensionReason.trim()) {
      toast.error('Informe o motivo da suspensão.');
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

      toast.success('Usuário suspenso com sucesso.');
      setShowSuspendModal(false);
      setSuspensionReason('');
      loadUsers();
    } catch (error) {
      console.error('[UserManagement] Erro ao suspender:', error);
      toast.error('Erro ao suspender usuário.');
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

      toast.success('Suspensão removida.');
      loadUsers();
    } catch (error) {
      console.error('[UserManagement] Erro ao remover suspensão:', error);
      toast.error('Erro ao remover suspensão.');
    }
  };

  const handleBlockUser = async () => {
    if (!selectedUser || !suspensionReason.trim()) {
      toast.error('Informe o motivo do bloqueio');
      return;
    }

    try {
      const blockedAtIso = new Date().toISOString();
      const oldValue = {
        is_suspended: selectedUser.is_suspended,
        suspension_reason: selectedUser.suspension_reason
      };

      const { error } = await supabase
        .from('users')
        .update({
          is_suspended: true,
          suspension_reason: suspensionReason,
          suspended_at: blockedAtIso
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
          suspension_reason: suspensionReason,
          suspended_at: blockedAtIso
        },
        reason: `Usuário ${selectedUser.name} bloqueado: ${suspensionReason}`
      });

      toast.success('Usuário bloqueado com sucesso.');
      setShowSuspendModal(false);
      setSuspensionReason('');
      setSelectedUser((current) =>
        current
          ? {
              ...current,
              is_suspended: true,
              suspension_reason: suspensionReason,
              suspended_at: blockedAtIso
            }
          : current
      );
      loadUsers();
    } catch (error) {
      console.error('[UserManagement] Erro ao bloquear usuário:', error);
      toast.error('Erro ao bloquear usuário.');
    }
  };

  const handleUnblockUser = async () => {
    if (!selectedUser || !unsuspensionReason.trim()) {
      toast.error('Informe o motivo do desbloqueio');
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
          is_suspended: false,
          suspension_reason: null
        })
        .eq('id', selectedUser.id);

      if (error) throw error;

      await logAction({
        action: ADMIN_ACTIONS.UNSUSPEND_USER,
        resourceType: RESOURCE_TYPES.USER,
        resourceId: selectedUser.id,
        oldValue,
        newValue: {
          is_suspended: false,
          suspension_reason: null
        },
        reason: `Bloqueio de ${selectedUser.name} removido. Motivo: ${unsuspensionReason}`
      });

      toast.success('Usuário desbloqueado com sucesso.');
      setShowUnsuspendModal(false);
      setUnsuspensionReason('');
      setSelectedUser((current) =>
        current
          ? {
              ...current,
              is_suspended: false,
              suspension_reason: null
            }
          : current
      );
      loadUsers();
    } catch (error) {
      console.error('[UserManagement] Erro ao desbloquear usuário:', error);
      toast.error('Erro ao desbloquear usuário.');
    }
  };

  const notifyVerificationStatusChange = async (user: User, verified: boolean) => {
    const title = verified ? 'Seu selo verificado foi liberado' : 'Seu selo verificado foi removido';
    const content = verified
      ? 'A equipe administrativa liberou manualmente o selo verificado para sua conta.'
      : 'A equipe administrativa removeu o selo verificado da sua conta. Se precisar, envie novamente sua documentacao para analise.';

    const { error } = await supabase.from('notifications').insert({
      user_id: user.id,
      type: 'SYSTEM',
      title,
      content,
      link: '/minha-conta/perfil',
      is_read: false,
    });

    if (error) {
      console.error('[UserManagement] Erro ao criar notificacao de selo verificado:', error);
    }
  };

  const handleToggleVerifiedBadge = async (user: User) => {
    const shouldVerify = !Boolean(user.document_verified);
    const nextReviewStatus = shouldVerify ? 'approved' : 'rejected';
    const nextReviewNotes = shouldVerify
      ? 'Selo concedido manualmente pela administracao.'
      : 'Selo removido manualmente pela administracao.';

    try {
      const { data: authData } = await supabase.auth.getUser();
      const reviewerId = authData.user?.id || null;
      const nowIso = new Date().toISOString();

      const { error } = await supabase
        .from('users')
        .update({
          document_verified: shouldVerify,
          document_review_status: nextReviewStatus,
          document_review_notes: nextReviewNotes,
          document_reviewed_at: nowIso,
          document_reviewed_by: reviewerId,
        })
        .eq('id', user.id);

      if (error) throw error;

      await notifyVerificationStatusChange(user, shouldVerify);
      await logAction({
        action: ADMIN_ACTIONS.VERIFY_USER,
        resourceType: RESOURCE_TYPES.USER,
        resourceId: user.id,
        oldValue: {
          document_verified: user.document_verified ?? false,
          document_review_status: user.document_review_status ?? null,
          document_review_notes: user.document_review_notes ?? null,
        },
        newValue: {
          document_verified: shouldVerify,
          document_review_status: nextReviewStatus,
          document_review_notes: nextReviewNotes,
        },
        reason: shouldVerify
          ? `Selo verificado concedido manualmente para ${user.name}`
          : `Selo verificado removido manualmente de ${user.name}`,
      });

      toast.success(
        shouldVerify ? 'Selo verificado concedido com sucesso.' : 'Selo verificado removido com sucesso.'
      );

      if (selectedUser?.id === user.id) {
        setSelectedUser((current) =>
          current
            ? {
                ...current,
                document_verified: shouldVerify,
                document_review_status: nextReviewStatus,
                document_review_notes: nextReviewNotes,
                document_reviewed_at: nowIso,
                document_reviewed_by: reviewerId,
              }
            : current
        );
      }

      await loadUsers();
    } catch (error) {
      console.error('[UserManagement] Erro ao alterar selo verificado:', error);
      toast.error('Erro ao alterar selo verificado do usuário.');
    }
  };

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  const subscriptionsTotalPages = Math.ceil(subscriptionsTotalCount / PAGE_SIZE);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black text-slate-900">Gestão de Usuários</h1>
          <p className="text-slate-500 mt-1">
            {activeTab === 'users'
              ? `${totalCount} usuário${totalCount !== 1 ? 's' : ''} cadastrado${totalCount !== 1 ? 's' : ''}`
              : `${subscriptionsTotalCount} assinatura${subscriptionsTotalCount !== 1 ? 's' : ''} encontrada${subscriptionsTotalCount !== 1 ? 's' : ''}`}
          </p>
        </div>
        <button
          onClick={activeTab === 'users' ? loadUsers : loadSubscriptions}
          className="px-4 py-2 bg-green-500 text-white rounded-lg font-semibold hover:bg-green-600 transition-colors"
        >
          Atualizar
        </button>
      </div>

      <div className="flex gap-2 rounded-xl border border-slate-200 bg-white p-1.5">
        {[
          { id: 'users', label: 'Usuários', icon: Users },
          { id: 'subscriptions', label: 'Assinaturas', icon: CreditCard },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;

          return (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id as 'users' | 'subscriptions');
                setPage(0);
                setSubscriptionsPage(0);
              }}
              className={`inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-all ${
                isActive ? 'bg-green-500 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {activeTab === 'users' ? (
        <>
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
            onChange={(e) => {
              setPage(0);
              setFilterStatus(e.target.value);
            }}
            className="px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
          >
            <option value="all">Todos os Status</option>
            <option value="active">Ativos</option>
            <option value="suspended">Suspensos</option>
          </select>

          <select
            value={filterVerification}
            onChange={(e) => {
              setPage(0);
              setFilterVerification(e.target.value);
            }}
            className="px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
          >
            <option value="all">Todos os selos</option>
            <option value="verified">Com selo verificado</option>
            <option value="not_verified">Sem selo verificado</option>
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
                            {user.document_verified ? <BadgeCheck className="w-4 h-4 text-emerald-600" /> : null}
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
                        onClick={() => {
                          setSelectedUser(user);
                          setShowDetailsModal(true);
                        }}
                        className="text-green-600 hover:underline font-semibold"
                      >
                        {user._count?.announcements || 0} anúncio{user._count?.announcements !== 1 ? 's' : ''}
                      </button>
                    </td>
                    <td className="px-6 py-4">
                      {user.is_suspended ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-800">
                          <AlertTriangle className="w-3 h-3" />
                          Bloqueado
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
                            const currentPlan = availablePlans.find((plan) => plan.id === user.active_plan_id || plan.name === user.plan_name);
                            const periodStart = formatDateInputValue(user.active_period_start || new Date());
                            const periodEnd = formatDateInputValue(user.active_period_end) || addDurationToDate(periodStart, 1, 'months');

                            setSelectedUser(user);
                            setNewPlan(currentPlan?.id || '');
                            setNewRole(user.role);
                            setPlanPeriodStart(periodStart);
                            setPlanDurationAmount(1);
                            setPlanDurationUnit('months');
                            setPlanPeriodEnd(periodEnd);
                            setShowEditModal(true);
                          }}
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="Editar"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        {user.is_suspended ? (
                          <button
                            onClick={() => {
                              setSelectedUser(user);
                              setUnsuspensionReason('');
                              setShowUnsuspendModal(true);
                            }}
                            className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                            title="Desbloquear"
                          >
                            <CheckCircle className="w-4 h-4" />
                          </button>
                        ) : (
                          <button
                            onClick={() => {
                              setSelectedUser(user);
                              setSuspensionReason('');
                              setShowSuspendModal(true);
                            }}
                            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="Bloquear"
                          >
                            <Ban className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          onClick={() => void handleToggleVerifiedBadge(user)}
                          className={`p-2 rounded-lg transition-colors ${
                            user.document_verified
                              ? 'text-amber-600 hover:bg-amber-50'
                              : 'text-emerald-600 hover:bg-emerald-50'
                          }`}
                          title={user.document_verified ? 'Remover selo verificado' : 'Conceder selo verificado'}
                        >
                          <BadgeCheck className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => {
                            setSelectedUser(user);
                            setShowDetailsModal(true);
                          }}
                          className="p-2 text-slate-600 hover:bg-slate-50 rounded-lg transition-colors"
                          title="Ver detalhes"
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

        </>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            {[
              { label: 'Pagas ativas', value: subscriptionSummary.paidActive, icon: CreditCard, tone: 'bg-sky-50 text-sky-700 border-sky-200' },
              { label: 'Gratuitas ativas', value: subscriptionSummary.freeActive, icon: Users, tone: 'bg-slate-50 text-slate-700 border-slate-200' },
              { label: 'Pagas vencidas', value: subscriptionSummary.expiredPaid, icon: AlertTriangle, tone: 'bg-amber-50 text-amber-700 border-amber-200' },
              { label: 'Vencem em 7 dias', value: subscriptionSummary.expiringSoon, icon: Clock, tone: 'bg-violet-50 text-violet-700 border-violet-200' },
              { label: 'Lojas pausadas', value: subscriptionSummary.pausedStores, icon: Store, tone: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
            ].map((card) => {
              const Icon = card.icon;

              return (
                <div key={card.label} className={`rounded-2xl border p-4 ${card.tone}`}>
                  <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-white/70">
                    <Icon className="h-5 w-5" />
                  </div>
                  <p className="text-sm font-semibold">{card.label}</p>
                  <p className="mt-1 text-3xl font-black">{card.value}</p>
                </div>
              );
            })}
          </div>

          <div className="bg-white rounded-xl p-4 border border-slate-200">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              <div className="xl:col-span-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input
                    type="text"
                    value={subscriptionSearchTerm}
                    onChange={(e) => {
                      setSubscriptionsPage(0);
                      setSubscriptionSearchTerm(e.target.value);
                    }}
                    placeholder="Buscar por nome ou e-mail..."
                    className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>
              </div>

              <select
                value={subscriptionStatusFilter}
                onChange={(e) => {
                  setSubscriptionsPage(0);
                  setSubscriptionStatusFilter(e.target.value);
                }}
                className="px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                <option value="all">Todos os status</option>
                <option value="active">Ativas</option>
                <option value="canceled">Canceladas</option>
              </select>

              <select
                value={subscriptionTypeFilter}
                onChange={(e) => {
                  setSubscriptionsPage(0);
                  setSubscriptionTypeFilter(e.target.value);
                }}
                className="px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                <option value="all">Pago e gratuito</option>
                <option value="paid">Somente pagos</option>
                <option value="free">Somente gratuitos</option>
              </select>

              <select
                value={subscriptionWindowFilter}
                onChange={(e) => {
                  setSubscriptionsPage(0);
                  setSubscriptionWindowFilter(e.target.value);
                }}
                className="px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                <option value="all">Toda a janela</option>
                <option value="active">Ativas agora</option>
                <option value="expiring_7">Vencem em 7 dias</option>
                <option value="expired">Vencidas</option>
              </select>

              <select
                value={subscriptionStoreFilter}
                onChange={(e) => {
                  setSubscriptionsPage(0);
                  setSubscriptionStoreFilter(e.target.value);
                }}
                className="px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                <option value="all">Todas as lojas</option>
                <option value="store_active">Com loja ativa</option>
                <option value="store_paused">Loja pausada</option>
              </select>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px]">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-black text-slate-600 uppercase tracking-wider">Usuário</th>
                    <th className="px-6 py-3 text-left text-xs font-black text-slate-600 uppercase tracking-wider">Plano</th>
                    <th className="px-6 py-3 text-left text-xs font-black text-slate-600 uppercase tracking-wider">Tipo</th>
                    <th className="px-6 py-3 text-left text-xs font-black text-slate-600 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-black text-slate-600 uppercase tracking-wider">Início</th>
                    <th className="px-6 py-3 text-left text-xs font-black text-slate-600 uppercase tracking-wider">Vencimento</th>
                    <th className="px-6 py-3 text-left text-xs font-black text-slate-600 uppercase tracking-wider">Loja</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {subscriptionsLoading ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-12 text-center">
                        <div className="flex items-center justify-center">
                          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div>
                        </div>
                      </td>
                    </tr>
                  ) : subscriptions.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-12 text-center text-slate-500">
                        Nenhuma assinatura encontrada com os filtros atuais
                      </td>
                    </tr>
                  ) : (
                    subscriptions.map((subscription) => {
                      const statusMeta = getSubscriptionStatusMeta(subscription.status, subscription.current_period_end);
                      const typeMeta = getSubscriptionTypeMeta(subscription.monthly_price);

                      return (
                        <tr key={subscription.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-6 py-4">
                            <div>
                              <p className="font-semibold text-slate-900">{subscription.user_name}</p>
                              <p className="text-sm text-slate-500">{subscription.user_email}</p>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <p className="font-semibold text-slate-900">{subscription.plan_name}</p>
                            <p className="text-xs text-slate-500">
                              {subscription.monthly_price > 0 ? `R$ ${subscription.monthly_price.toFixed(2)}/mês` : 'Plano sem cobrança'}
                            </p>
                          </td>
                          <td className="px-6 py-4">
                            <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${typeMeta.className}`}>
                              {typeMeta.label}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusMeta.className}`}>
                              {statusMeta.label}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-sm text-slate-600">{formatDateCell(subscription.current_period_start)}</td>
                          <td className="px-6 py-4 text-sm text-slate-600">{formatDateCell(subscription.current_period_end)}</td>
                          <td className="px-6 py-4">
                            {subscription.is_store_paused ? (
                              <span className="inline-flex rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700">
                                Loja pausada
                              </span>
                            ) : subscription.has_seller_store ? (
                              <span className="inline-flex rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                                Loja ativa
                              </span>
                            ) : (
                              <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                                Sem loja
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {subscriptionsTotalPages > 1 && (
              <div className="border-t border-slate-200 px-6 py-4 flex items-center justify-between">
                <p className="text-sm text-slate-500">Página {subscriptionsPage + 1} de {subscriptionsTotalPages}</p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setSubscriptionsPage(Math.max(0, subscriptionsPage - 1))}
                    disabled={subscriptionsPage === 0}
                    className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-50"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() => setSubscriptionsPage(Math.min(subscriptionsTotalPages - 1, subscriptionsPage + 1))}
                    disabled={subscriptionsPage >= subscriptionsTotalPages - 1}
                    className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-50"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* Edit Modal */}
      {showEditModal && selectedUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6">
            <h3 className="text-xl font-bold text-slate-900 mb-4">Editar usu&aacute;rio: {selectedUser.name}</h3>
            
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
                    <option key={plan.id} value={plan.id}>
                      {plan.name}
                      {plan.is_default_signup_plan ? ' (plano inicial do cadastro)' : ''}
                      {' - R$ '}
                      {plan.monthly_price.toFixed(2)}/m&ecirc;s
                    </option>
                  ))}
                </select>
                <p className="mt-2 text-xs text-slate-500">
                  Planos marcados como iniciais de cadastro sao reservados ao primeiro acesso do usuario e continuam bloqueados depois que esse beneficio ja foi consumido.
                </p>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="mb-4">
                  <p className="text-sm font-bold text-slate-900">Per&iacute;odo do plano</p>
                  <p className="text-xs text-slate-500">
                    Os benef&iacute;cios do plano escolhido passam a respeitar este in&iacute;cio e vencimento.
                  </p>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">In&iacute;cio</label>
                    <input
                      type="date"
                      value={planPeriodStart}
                      onChange={(e) => {
                        const nextStart = e.target.value;
                        setPlanPeriodStart(nextStart);
                        setPlanPeriodEnd(addDurationToDate(nextStart, planDurationAmount, planDurationUnit));
                      }}
                      className="w-full border border-slate-200 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-green-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Fim</label>
                    <input
                      type="date"
                      value={planPeriodEnd}
                      onChange={(e) => setPlanPeriodEnd(e.target.value)}
                      className="w-full border border-slate-200 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-green-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Dura&ccedil;&atilde;o</label>
                    <input
                      type="number"
                      min={1}
                      value={planDurationAmount}
                      onChange={(e) => {
                        const nextAmount = Math.max(1, Number(e.target.value) || 1);
                        setPlanDurationAmount(nextAmount);
                        setPlanPeriodEnd(addDurationToDate(planPeriodStart, nextAmount, planDurationUnit));
                      }}
                      className="w-full border border-slate-200 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-green-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Unidade</label>
                    <select
                      value={planDurationUnit}
                      onChange={(e) => {
                        const nextUnit = e.target.value as 'days' | 'months' | 'years';
                        setPlanDurationUnit(nextUnit);
                        setPlanPeriodEnd(addDurationToDate(planPeriodStart, planDurationAmount, nextUnit));
                      }}
                      className="w-full border border-slate-200 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-green-500"
                    >
                      <option value="days">Dia(s)</option>
                      <option value="months">M&ecirc;s(es)</option>
                      <option value="years">Ano(s)</option>
                    </select>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 mb-1">Selo Verificado</p>
                    <span className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-semibold ${
                      selectedUser.document_verified ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'
                    }`}>
                      <BadgeCheck className="w-4 h-4" />
                      {selectedUser.document_verified ? 'Ativo' : 'Nao concedido'}
                    </span>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Perfil e permissões</label>
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-green-500"
                >
                  <option value="user">Usuário (padrão)</option>
                  <option value="editor">Editor (moderador)</option>
                  <option value="admin">Administrador (acesso total)</option>
                </select>
              </div>
            </div>

            <div className="flex items-center gap-3 mt-6">
              <button
                onClick={() => setShowEditModal(false)}
                disabled={isSavingUserEdit}
                className="flex-1 px-4 py-2 border border-slate-200 text-slate-600 rounded-lg font-semibold hover:bg-slate-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveUserChanges}
                disabled={isSavingUserEdit}
                className="flex-1 px-4 py-2 bg-green-500 text-white rounded-lg font-semibold hover:bg-green-600 transition-colors disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSavingUserEdit ? 'Salvando...' : 'Salvar altera\u00e7\u00f5es'}
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
              <h3 className="text-xl font-bold text-slate-900">Detalhes do usuário</h3>
              <button
                onClick={() => setShowDetailsModal(false)}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-6">
              {/* Informações pessoais */}
              <div className="bg-slate-50 rounded-xl p-4">
                <h4 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
                  <Users className="w-4 h-4 text-green-600" />
                  Informações pessoais
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

              {/* Plano e permissões */}
              <div className="bg-slate-50 rounded-xl p-4">
                <h4 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
                  <Target className="w-4 h-4 text-blue-600" />
                  Plano e permissões
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
                    <p className="text-xs text-slate-500 mb-1">Total de anúncios</p>
                    <p className="text-2xl font-bold text-slate-900">{selectedUser._count?.announcements || 0}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 mb-1">Status</p>
                    <span className={`inline-block px-3 py-1 rounded-full text-sm font-semibold ${
                      selectedUser.is_suspended ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'
                    }`}>
                      {selectedUser.is_suspended ? 'Bloqueado' : 'Ativo'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Datas */}
              <div className="bg-slate-50 rounded-xl p-4">
                <h4 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-slate-600" />
                  Informações de registro
                </h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-slate-500 mb-1">Cadastro</p>
                    <p className="font-semibold text-slate-900">
                      {new Date(selectedUser.created_at).toLocaleDateString('pt-BR')}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 mb-1">Último login</p>
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

              {/* Motivo do bloqueio (se aplicável) */}
                {selectedUser.is_suspended && selectedUser.suspension_reason && (
                  <div className="bg-red-50 rounded-xl p-4 border border-red-200">
                    <h4 className="font-semibold text-red-900 mb-2 flex items-center gap-2">
                      <AlertCircle className="w-4 h-4" />
                      Motivo do bloqueio
                    </h4>
                    <p className="text-sm text-red-800">{selectedUser.suspension_reason}</p>
                  </div>
                )}

                <div className="bg-slate-50 rounded-xl p-4">
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <h4 className="font-semibold text-slate-900 flex items-center gap-2">
                      <Store className="w-4 h-4 text-emerald-600" />
                      Anúncios do usuário
                    </h4>
                    <span className="text-xs font-semibold text-slate-500">
                      {userAnnouncements.length} registro(s)
                    </span>
                  </div>

                  {userAnnouncementsLoading ? (
                    <div className="flex items-center justify-center py-8 text-sm text-slate-500 gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Carregando anúncios...
                    </div>
                  ) : userAnnouncements.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-300 bg-white p-5 text-center text-sm text-slate-500">
                      Este usuário não possui anúncios cadastrados.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {userAnnouncements.map((announcement) => {
                        const statusMeta = getAnnouncementStatusMeta(announcement.status);

                        return (
                          <div
                            key={announcement.id}
                            className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="font-semibold text-slate-900 truncate">{announcement.title}</p>
                                <p className="text-xs text-slate-500 mt-1">
                                  ID: {announcement.id}
                                </p>
                              </div>
                              <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${statusMeta.className}`}>
                                {statusMeta.label}
                              </span>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4 text-sm text-slate-600">
                              <div>
                                <p className="text-xs text-slate-500 mb-1">Preço</p>
                                <p className="font-semibold text-slate-900">
                                  {announcement.price !== null
                                    ? announcement.price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                                    : 'Não informado'}
                                </p>
                              </div>
                              <div>
                                <p className="text-xs text-slate-500 mb-1">Criado em</p>
                                <p className="font-semibold text-slate-900">{formatDateCell(announcement.created_at)}</p>
                              </div>
                              <div>
                                <p className="text-xs text-slate-500 mb-1">Views</p>
                                <p className="font-semibold text-slate-900">{announcement.views || 0}</p>
                              </div>
                            </div>

                            <div className="mt-4 flex justify-end">
                              <button
                                type="button"
                                onClick={() => openDeleteAnnouncementModal(announcement)}
                                className="inline-flex items-center gap-2 rounded-lg border border-red-200 px-3 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-50"
                              >
                                <Trash2 className="w-4 h-4" />
                                Excluir anúncio
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

            <div className="flex items-center gap-3 mt-6">
              <button
                onClick={() => void handleToggleVerifiedBadge(selectedUser)}
                className={`px-4 py-2 rounded-lg font-semibold transition-colors ${
                  selectedUser.document_verified
                    ? 'bg-amber-100 text-amber-800 hover:bg-amber-200'
                    : 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                }`}
              >
                {selectedUser.document_verified ? 'Remover selo' : 'Conceder selo'}
              </button>
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

        {showDeleteAnnouncementModal && selectedUser && selectedAnnouncement && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl max-w-lg w-full p-6">
              <h3 className="text-xl font-bold text-slate-900 mb-2">Excluir anúncio</h3>
              <p className="text-sm text-slate-600 mb-4">
                Você está excluindo o anúncio <strong>{selectedAnnouncement.title}</strong> do usuário <strong>{selectedUser.name}</strong>.
              </p>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-2 mb-4 text-sm">
                <p><span className="font-semibold text-slate-700">ID:</span> {selectedAnnouncement.id}</p>
                <p><span className="font-semibold text-slate-700">Status:</span> {getAnnouncementStatusMeta(selectedAnnouncement.status).label}</p>
                <p><span className="font-semibold text-slate-700">Criado em:</span> {formatDateCell(selectedAnnouncement.created_at)}</p>
              </div>

              <textarea
                value={announcementDeleteReason}
                onChange={(e) => setAnnouncementDeleteReason(e.target.value)}
                placeholder="Informe o motivo da exclusão (obrigatório)..."
                className="w-full border border-slate-200 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-red-500 min-h-[120px]"
              />

              <div className="flex items-center gap-3 mt-6">
                <button
                  onClick={closeDeleteAnnouncementModal}
                  disabled={isDeletingAnnouncement}
                  className="flex-1 px-4 py-2 border border-slate-200 text-slate-600 rounded-lg font-semibold hover:bg-slate-50 transition-colors disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleDeleteAnnouncement}
                  disabled={!announcementDeleteReason.trim() || isDeletingAnnouncement}
                  className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 bg-red-500 text-white rounded-lg font-semibold hover:bg-red-600 transition-colors disabled:opacity-50"
                >
                  {isDeletingAnnouncement ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Excluindo...
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-4 h-4" />
                      Excluir anúncio
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
  
        {/* Suspend Modal */}
        {showSuspendModal && selectedUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6">
            <h3 className="text-xl font-bold text-slate-900 mb-4">Bloquear usuário</h3>
            <p className="text-slate-600 mb-4">
              Bloquear: <strong>{selectedUser.name}</strong>
            </p>
            <textarea
              value={suspensionReason}
              onChange={(e) => setSuspensionReason(e.target.value)}
              placeholder="Motivo do bloqueio (obrigatório)..."
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
                onClick={handleBlockUser}
                disabled={!suspensionReason.trim()}
                className="flex-1 px-4 py-2 bg-red-500 text-white rounded-lg font-semibold hover:bg-red-600 transition-colors disabled:opacity-50"
              >
                Bloquear usuário
              </button>
            </div>
          </div>
        </div>
      )}

        {showUnsuspendModal && selectedUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6">
            <h3 className="text-xl font-bold text-slate-900 mb-4">Desbloquear usuário</h3>
            <p className="text-slate-600 mb-4">
              Desbloquear: <strong>{selectedUser.name}</strong>
            </p>
            <textarea
              value={unsuspensionReason}
              onChange={(e) => setUnsuspensionReason(e.target.value)}
              placeholder="Motivo do desbloqueio (obrigatório)..."
              className="w-full border border-slate-200 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-green-500 min-h-[100px]"
            />
            <div className="flex items-center gap-3 mt-6">
              <button
                onClick={() => {
                  setShowUnsuspendModal(false);
                  setUnsuspensionReason('');
                }}
                className="flex-1 px-4 py-2 border border-slate-200 text-slate-600 rounded-lg font-semibold hover:bg-slate-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleUnblockUser}
                disabled={!unsuspensionReason.trim()}
                className="flex-1 px-4 py-2 bg-green-500 text-white rounded-lg font-semibold hover:bg-green-600 transition-colors disabled:opacity-50"
              >
                Desbloquear usuário
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserManagement;

