import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Routes, Route, Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertCircle, Bell, Camera, CheckCircle2, ChevronDown, Clock3, CreditCard, DollarSign, Download, Edit3, ExternalLink, Eye, FileText, Heart, Inbox, LayoutGrid, LifeBuoy, Lock, LogOut, Map, MapPin, MessageSquare, PauseCircle, Radar, Receipt, ShieldCheck, Trash2, User, TrendingUp, Package, Sparkles, Store } from 'lucide-react';
import { AdStatus, Message, Ad, AdMetrics, Notification, PaymentRecord } from '../types';
import { LEAD_STATUS } from '../constants/status';
import { useAuth } from '../src/contexts/AuthContext';
import { deleteAnnouncementWithRelations, useUserAds } from '../src/hooks/useAds';
import { useNotificationsCount } from '../src/hooks/useNotificationsCount';
import { useSubscription } from '../src/hooks/useSubscription';
import { supabase } from '../src/lib/supabaseClient';
import { useInvoices } from '../src/hooks/useInvoices';
import { usePayments } from '../src/hooks/usePayments';
import { useHighlightBoosters } from '../src/hooks/useHighlightBoosters';
import { useHighlightSettings } from '../src/hooks/useHighlightSettings';
import { useMySellerStore } from '../src/hooks/useSellerStore';
import HighlightBoosterCard from '../components/boosters/HighlightBoosterCard';
import PlanGuard from '../components/PlanGuard';
import MessagesView from '../components/MessagesView';
import LeadsView from '../components/LeadsView';
import RadarView from '../components/RadarView';
import { getBusinessDescriptionValidationError, MAX_BUSINESS_DESCRIPTION_LENGTH } from '../src/utils/businessDescription';
import { isTimestampActive, syncTrustedTime } from '../src/lib/trustedTime';
import HighlightConfirmationModal from '../components/HighlightConfirmationModal';
import VerifiedBadge from '../components/VerifiedBadge';
import { usePlans } from '../src/hooks/usePlans';
import HelpCenterView from './HelpCenterView';
import FavoritesView from './FavoritesView';
import SeoHead from '../components/SeoHead';
import toast from 'react-hot-toast';
import { toast as sonnerToast } from 'sonner';
import { useDashboardStats } from '../src/hooks/useDashboardStats';
import { usePersistentState } from '../src/hooks/usePersistentState';
import { updateUserCoordinates } from '../services/geoService';
import { initiatePlatformPlanCheckout } from '../services/paymentCheckoutService';
import { calculateYearlyTotal, getCustomPlanContactLink, isCustomPlan } from '../services/paymentUtils';
import { useLayout } from '../src/contexts/LayoutContext';
import { getPrimaryImageFromList } from '../src/utils/imageFallback';
import { DEFAULT_HIGHLIGHT_COOLDOWN_DAYS, formatHighlightCooldownDaysLabel, getEffectiveHighlightCooldownDays } from '../src/utils/highlightCooldown';
import { appError, appWarn } from '../src/utils/appLogger';
import { 
  DashboardStatsCard, 
  PerformanceAttentionModule,
  PerformanceRankingModule,
  ReachModule, 
  PriceIntelligenceModule, 
  PlanModule 
} from '../components/DashboardModules';
import { initiateBoosterCheckout } from '../services/paymentCheckoutService';
import SellerStoreDashboard from '../components/dashboard/SellerStoreDashboard';
import CommercialIntelligenceDashboard from '../components/dashboard/CommercialIntelligenceDashboard';

const Icons = {
  Dashboard: () => <LayoutGrid className="w-5 h-5" strokeWidth={1.5} />,
  Plan: () => <CreditCard className="w-5 h-5" strokeWidth={1.5} />,
  Ads: () => <FileText className="w-5 h-5" strokeWidth={1.5} />,
  Messages: () => <MessageSquare className="w-5 h-5" strokeWidth={1.5} />,
  Leads: () => <Inbox className="w-5 h-5" strokeWidth={1.5} />,
  Favorites: () => <Heart className="w-5 h-5" strokeWidth={1.5} />,
  Radar: () => <Radar className="w-5 h-5" strokeWidth={1.5} />,
  Finance: () => <DollarSign className="w-5 h-5" strokeWidth={1.5} />,
  Commercial: () => <TrendingUp className="w-5 h-5" strokeWidth={1.5} />,
  Help: () => <LifeBuoy className="w-5 h-5" strokeWidth={1.5} />,
  Profile: () => <User className="w-5 h-5" strokeWidth={1.5} />,
  Store: () => <Store className="w-5 h-5" strokeWidth={1.5} />,
  Logout: () => <LogOut className="w-5 h-5" strokeWidth={1.5} />,
};

const PERFORMANCE_PANEL_ALLOWED_PLANS = new Set(['safra', 'produtor', 'loja parceira']);
const normalizePlanLabel = (value: string) =>
  value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
const isLegacySignupPlanName = (planName: string) =>
  ['start', 'start agro', 'safra', 'semente', 'seed'].includes(normalizePlanLabel(planName || ''));

const AdsSkeletonList = ({ count = 3 }: { count?: number }) => (
  <div className="space-y-2">
    {Array.from({ length: count }).map((_, index) => (
      <div
        key={`ads-skeleton-${index}`}
        className="flex h-20 animate-pulse items-center gap-4 rounded-[22px] border border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] px-4 py-3 shadow-[0_18px_45px_-38px_rgba(15,23,42,0.2)]"
      >
        <div className="h-[60px] w-[60px] flex-shrink-0 rounded-2xl bg-slate-100" />
        <div className="flex-1 min-w-0 space-y-2">
          <div className="h-3 w-2/3 bg-slate-100 rounded" />
          <div className="h-3 w-1/2 bg-slate-100 rounded" />
          <div className="h-3 w-1/3 bg-slate-100 rounded" />
        </div>
        <div className="flex items-center gap-2">
          <div className="h-6 w-16 bg-slate-100 rounded" />
          <div className="h-6 w-6 bg-slate-100 rounded" />
          <div className="h-6 w-6 bg-slate-100 rounded" />
        </div>
      </div>
    ))}
  </div>
);

type ProfileSectionCardProps = {
  title: string;
  description: string;
  icon: React.ReactNode;
  color?: 'emerald' | 'blue' | 'amber' | 'slate';
  children: React.ReactNode;
};

const ProfileSectionCard: React.FC<ProfileSectionCardProps> = ({
  title,
  description,
  icon,
  color = 'emerald',
  children
}) => {
  const colorMap = {
    emerald: { bg: 'bg-emerald-50', border: 'border-emerald-200', icon: 'bg-emerald-100 text-emerald-700' },
    blue: { bg: 'bg-blue-50', border: 'border-blue-200', icon: 'bg-blue-100 text-blue-700' },
    amber: { bg: 'bg-amber-50', border: 'border-amber-200', icon: 'bg-amber-100 text-amber-700' },
    slate: { bg: 'bg-slate-50', border: 'border-slate-200', icon: 'bg-slate-100 text-slate-700' },
  };
  const colors = colorMap[color];

  return (
    <div className={`space-y-5 rounded-3xl border ${colors.border} ${colors.bg} p-6 shadow-md`}>
      <div className="flex items-start gap-4">
        <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${colors.icon} shadow-sm flex-shrink-0`}>
          {icon}
        </div>
        <div>
          <h3 className="text-lg font-bold text-slate-900">{title}</h3>
          <p className="mt-1 text-sm text-slate-600">{description}</p>
        </div>
      </div>
      <div className="space-y-4">{children}</div>
    </div>
  );
};

const UserDashboardView: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, stats, signOut, refreshStats } = useAuth();
  const { settings } = useLayout();
  const { ads, isLoading: adsLoading } = useUserAds();
  const { messagesCount, notificationsCount, isLoading: countsLoading } = useNotificationsCount();
  const {
    subscription,
    usage,
    isLoading: subscriptionLoading,
    canCreateAd,
    effectiveLeadContactLimitDays,
    adLimitMessage,
    refreshUsage,
    refetch: refetchSubscription,
  } = useSubscription();
  const [userAds, setUserAds] = useState<Ad[]>([]);
  const [userAdsLoading, setUserAdsLoading] = useState(false);
  const {
    payments,
    lastApprovedPayment,
    availableInvoicesCount,
    pendingFiscalDocumentsCount,
    isLoading: paymentsLoading,
  } = usePayments();
  const {
    boosters,
    purchases: boosterPurchases,
    summary: boosterSummary,
    isLoading: boostersLoading,
    refresh: refreshBoosters,
  } = useHighlightBoosters();
  const { settings: highlightSettings } = useHighlightSettings();
  const [newLeadsCount, setNewLeadsCount] = useState(0);
  const lastGrowthNotificationIdRef = useRef<string | null>(null);
  const lastRenewalNotificationIdRef = useRef<string | null>(null);
  const sidebarNavRef = useRef<HTMLDivElement | null>(null);
  const [showSidebarScrollHint, setShowSidebarScrollHint] = useState(false);
  const normalizedPlanName = normalizePlanLabel(subscription?.plans?.name || '');
  const hasPerformancePanelAccess = PERFORMANCE_PANEL_ALLOWED_PLANS.has(normalizedPlanName);
  const isDowngradedBasicPlan = normalizedPlanName === 'básico' || normalizedPlanName === 'basico';
  const isCommercialIntelligenceEnabled = Boolean(settings.commercialIntelligenceEnabled);
  const highlightCooldownDays = getEffectiveHighlightCooldownDays(
    highlightSettings?.highlightCooldownDays ?? DEFAULT_HIGHLIGHT_COOLDOWN_DAYS
  );
  const highlightCooldownLabel = formatHighlightCooldownDaysLabel(highlightCooldownDays);

  const formatCycleBoundaryDate = (value?: string | null) => {
    if (!value) return 'data indisponível';
    return new Date(value).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });
  };

  // Estados para upload
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [isUploadingDocument, setIsUploadingDocument] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const [isValidatingDocument, setIsValidatingDocument] = useState(false);
  const [validationResult, setValidationResult] = useState<{
    status: 'approved' | 'manual_review' | 'error';
    message: string;
  } | null>(null);
  const [documentRetryAvailableAt, setDocumentRetryAvailableAt] = useState<string | null>(user?.document_retry_available_at || null);
  const [documentLastFailureReason, setDocumentLastFailureReason] = useState<string | null>(user?.document_last_failure_reason || null);
  const hasSellerStoreAccess = Boolean(subscription?.plans?.has_seller_store);
  const { store: mySellerStore } = useMySellerStore();
  const showSellerStoreMenu = hasSellerStoreAccess || Boolean(mySellerStore);
  
  const isPremium = user?.plan && user.plan !== 'seed';
  const dashboardSeo = useMemo(() => {
    const dashboardRoutes: Array<{ match: string; title: string; description: string }> = [
      {
        match: '/minha-conta/meu-plano',
        title: 'Meu Plano',
        description: 'Acompanhe capacidade, créditos e recursos liberados no seu plano atual da AGRO BW.',
      },
      {
        match: '/minha-conta/financeiro',
        title: 'Financeiro',
        description: 'Gerencie cobranças, vigência e histórico financeiro dos seus planos na AGRO BW.',
      },
      {
        match: '/minha-conta/assinatura',
        title: 'Financeiro',
        description: 'Gerencie cobranças, vigência e histórico financeiro dos seus planos na AGRO BW.',
      },
      {
        match: '/minha-conta/meus-planos',
        title: 'Financeiro',
        description: 'Gerencie cobranças, vigência e histórico financeiro dos seus planos na AGRO BW.',
      },
      {
        match: '/minha-conta/anuncios',
        title: 'Meus Anúncios',
        description: 'Acompanhe seus anúncios, destaques e desempenho na AGRO BW.',
      },
      {
        match: '/minha-conta/mensagens',
        title: 'Mensagens',
        description: 'Acesse suas conversas e contatos recebidos pela AGRO BW.',
      },
      {
        match: '/minha-conta/leads',
        title: 'Leads',
        description: 'Visualize os interessados nos seus anúncios e acompanhe as negociações.',
      },
      {
        match: '/minha-conta/favoritos',
        title: 'Favoritos',
        description: 'Revise anúncios salvos e oportunidades favoritas na AGRO BW.',
      },
      {
        match: '/minha-conta/radar',
        title: 'Radar de Oportunidades',
        description: 'Explore oportunidades relevantes para sua operação dentro da AGRO BW.',
      },
      {
        match: '/minha-conta/inteligencia-comercial',
        title: 'Inteligência Comercial',
        description: 'Acesse análises e dados estratégicos para apoiar suas decisões comerciais.',
      },
      {
        match: '/minha-conta/minha-loja',
        title: 'Minha Loja',
        description: 'Gerencie a vitrine da sua loja parceira e os anúncios publicados.',
      },
      {
        match: '/minha-conta/ajuda',
        title: 'Central de Ajuda',
        description: 'Encontre suporte e respostas para dúvidas sobre sua conta.',
      },
      {
        match: '/minha-conta/perfil',
        title: 'Perfil',
        description: 'Atualize seus dados de perfil e configurações da conta.',
      },
    ];

    const currentRoute =
      dashboardRoutes.find((route) => location.pathname.startsWith(route.match)) || {
        title: 'Minha Conta',
        description: 'Acompanhe plano, anúncios, mensagens e oportunidades na sua conta AGRO BW.',
      };

    return {
      title: currentRoute.title,
      description: currentRoute.description,
    };
  }, [location.pathname]);

  // Buscar contagem de novos leads
  useEffect(() => {
    const fetchNewLeadsCount = async () => {
      if (!user?.id) return;
      
      const { count, error } = await supabase
        .from('leads')
        .select('id', { count: 'exact', head: true })
        .eq('seller_id', user.id)
        .eq('status', LEAD_STATUS.NEW);
      
      if (!error) {
        setNewLeadsCount(count || 0);
      }
    };
    
    fetchNewLeadsCount();
    
    // Atualizar a cada 30 segundos
    const interval = setInterval(fetchNewLeadsCount, 30000);
    return () => clearInterval(interval);
  }, [user?.id]);

  useEffect(() => {
    let isActive = true;
    const loadUserAds = async () => {
      if (!user?.id) {
        if (isActive) setUserAds([]);
        return;
      }
      if (isActive) setUserAdsLoading(true);
      const { data } = await supabase
        .from('announcements')
        .select('*')
        .eq('user_id', user.id);
      if (isActive) {
        setUserAds((data as Ad[]) || []);
        setUserAdsLoading(false);
      }
    };
    loadUserAds();
    return () => {
      isActive = false;
    };
  }, [user?.id]);

  useEffect(() => {
    setDocumentRetryAvailableAt(user?.document_retry_available_at || null);
    setDocumentLastFailureReason(user?.document_last_failure_reason || null);
  }, [user?.document_retry_available_at, user?.document_last_failure_reason]);

  useEffect(() => {
    if (!user?.id || location.pathname !== '/minha-conta') return;

    let cancelled = false;

    const maybeGenerateGrowthNotification = async () => {
      const { data, error } = await supabase.rpc('generate_growth_conversion_notification_for_user', {
        p_user_id: user.id,
      });

      if (error) {
        appError('[UserDashboardView] Erro ao gerar notificação de conversão', error, {
          userId: user.id,
          route: location.pathname,
        });
        return;
      }

      if (cancelled || !data?.success || !data?.created) return;

      const notificationId = String(data.notification_id || '');
      if (notificationId && lastGrowthNotificationIdRef.current === notificationId) return;

      lastGrowthNotificationIdRef.current = notificationId || `${data.title}-${data.announcement_id || 'growth'}`;

      sonnerToast.success(data.title || 'Oportunidade AGRO BW', {
        description:
          `${data.content || 'Seu anúncio ganhou tração e pode render ainda mais com um upgrade.'} Abra "Financeiro" para revisar o plano atual e ver as próximas opções.`,
        duration: 9000,
      });
    };

    void maybeGenerateGrowthNotification();

    return () => {
      cancelled = true;
    };
  }, [user?.id, location.pathname, navigate]);

  useEffect(() => {
    if (!user?.id || location.pathname !== '/minha-conta') return;

    let cancelled = false;

    const maybeGenerateRenewalNotification = async () => {
      const { data, error } = await supabase.rpc('generate_renewal_notification_for_user', {
        p_user_id: user.id,
      });

      if (error) {
        appError('[UserDashboardView] Erro ao gerar notificação de renovação', error, {
          userId: user.id,
          route: location.pathname,
        });
        return;
      }

      if (cancelled || !data?.success || !data?.created || data?.showToast === false) return;

      const notificationId = String(data.notification_id || '');
      if (notificationId && lastRenewalNotificationIdRef.current === notificationId) return;

      lastRenewalNotificationIdRef.current = notificationId || `${data.title}-${data.stage || 'renewal'}`;

      sonnerToast.error(data.title || 'Renovação AGRO BW', {
        description:
          `${data.content || 'Seu plano pago está perto do vencimento. Abra "Financeiro" para revisar o próximo ciclo e manter os benefícios ativos.'}`,
        duration: 9000,
      });
    };

    void maybeGenerateRenewalNotification();

    return () => {
      cancelled = true;
    };
  }, [user?.id, location.pathname]);

  useEffect(() => {
    const element = sidebarNavRef.current;
    if (!element) {
      setShowSidebarScrollHint(false);
      return;
    }

    const updateHint = () => {
      const canScroll = element.scrollHeight > element.clientHeight + 8;
      const nearBottom = element.scrollTop + element.clientHeight >= element.scrollHeight - 12;
      setShowSidebarScrollHint(canScroll && !nearBottom);
    };

    updateHint();
    element.addEventListener('scroll', updateHint);
    window.addEventListener('resize', updateHint);

    return () => {
      element.removeEventListener('scroll', updateHint);
      window.removeEventListener('resize', updateHint);
    };
  }, [showSellerStoreMenu, location.pathname]);

  // Função para slugificar nome do usuário
  const slugify = (text: string): string => {
    return text
      .toString()
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '_') // Espaços -> underscores
      .replace(/[^\w\-]+/g, '') // Remove caracteres especiais
      .replace(/\_\_+/g, '_') // Múltiplos underscores -> um
      .replace(/^-+/, '') // Remove hífen do início
      .replace(/-+$/, ''); // Remove hífen do fim
  };

  const getUserInitials = (name?: string | null) => {
    const parts = String(name || '')
      .trim()
      .split(/\s+/)
      .filter(Boolean);

    if (parts.length === 0) return 'U';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();

    return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase();
  };

  // Função para validar documento via Edge Function segura
  const validateDocumentWithOCR = async (file: File): Promise<{
    success: boolean;
    message: string;
    extractedDocument?: string;
  }> => {
    try {
      const formData = new FormData();
      formData.append('file', file);
      const { data, error } = await supabase.functions.invoke('validate-document', {
        body: formData,
      });

      if (error) {
        throw new Error(error.message || 'Erro ao comunicar com o servidor de validacao');
      }

      return {
        success: Boolean(data?.success),
        message: String(data?.message || 'Não foi possível validar o documento.'),
        extractedDocument: typeof data?.extractedDocument === 'string' ? data.extractedDocument : undefined,
      };

    } catch (error: any) {
      appError('[OCR] Erro ao validar documento via Edge Function', error, {
        userId: user?.id ?? null,
        fileName: file.name,
        fileType: file.type,
      });
      return {
        success: false,
        message: `Erro ao validar documento: ${error.message}`
      };
    }
  };

  const isDocumentRetryBlocked = Boolean(documentRetryAvailableAt && isTimestampActive(documentRetryAvailableAt));

  const getDocumentRetryBlockedMessage = () => {
    if (!documentRetryAvailableAt) {
      return documentLastFailureReason || 'Sua verificação documental está temporariamente bloqueada.';
    }

    const retryDate = new Date(documentRetryAvailableAt);
    const retryLabel = Number.isNaN(retryDate.getTime())
      ? documentRetryAvailableAt
      : retryDate.toLocaleString('pt-BR');

    return `${documentLastFailureReason || 'Não foi possível validar seu documento automaticamente.'} Você poderá tentar novamente em ${retryLabel}.`;
  };

  // Função para upload de avatar
  const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !user) return;

    // Validar tipo de arquivo
    if (!file.type.startsWith('image/')) {
      toast.error('Por favor, selecione uma imagem válida');
      return;
    }

    // Validar tamanho (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error('A imagem deve ter no máximo 5MB');
      return;
    }

    setIsUploadingAvatar(true);
    
    try {
      // Segurança (S-HIGH-2): pasta = auth.uid() (imutável), nunca slug do nome.
      const fileExt = file.name.split('.').pop();
      const filePath = `${user.id}/perfil.${fileExt}`;

      // Upload para o Supabase Storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file, {
          upsert: true, // Substituir arquivo existente
          contentType: file.type
        });

      if (uploadError) throw uploadError;

      // Obter URL pública
      const { data: urlData } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);

      // Atualizar coluna avatar na tabela users
      const { error: updateError } = await supabase
        .from('users')
        .update({ avatar: urlData.publicUrl })
        .eq('id', user.id);

      if (updateError) throw updateError;

      // Forçar atualização do contexto (recarregar usuário)
      window.location.reload();
      
      toast.success('Foto de perfil atualizada com sucesso!');
    } catch (error: any) {
      appError('Erro ao fazer upload do avatar', error, {
        userId: user.id,
      });
      toast.error(error.message || 'Erro ao atualizar foto de perfil');
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  // Função para upload de documentos
  const handleDocumentUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !user) return;

    await syncTrustedTime();

    const { data: retryRows, error: retryStatusError } = await supabase.rpc('get_my_document_verification_retry_status');
    if (!retryStatusError) {
      const retryStatus = Array.isArray(retryRows) ? retryRows[0] : retryRows;
      setDocumentRetryAvailableAt(retryStatus?.document_retry_available_at || null);
      setDocumentLastFailureReason(retryStatus?.document_last_failure_reason || null);

      if (retryStatus?.can_retry === false) {
        toast.error(
          retryStatus?.document_retry_available_at
            ? `${retryStatus?.document_last_failure_reason || 'Não foi possível validar seu documento automaticamente.'} Você poderá tentar novamente em ${new Date(retryStatus.document_retry_available_at).toLocaleString('pt-BR')}.`
            : (retryStatus?.document_last_failure_reason || 'Sua verificação documental está temporariamente bloqueada.')
        );
        event.target.value = '';
        return;
      }
    }

    if (documentRetryAvailableAt && isTimestampActive(documentRetryAvailableAt)) {
      toast.error(getDocumentRetryBlockedMessage());
      event.target.value = '';
      return;
    }

    // Validar tipo de arquivo (PDF, JPG, PNG)
    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
    if (!allowedTypes.includes(file.type)) {
      toast.error('Por favor, selecione um PDF ou imagem (JPG/PNG)');
      return;
    }

    // Validar tamanho (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      toast.error('O documento deve ter no máximo 10MB');
      return;
    }

    setIsUploadingDocument(true);
    setValidationResult(null);
    
    try {
      const lastDotIndex = file.name.lastIndexOf('.');
      const baseName = (lastDotIndex > 0 ? file.name.slice(0, lastDotIndex) : file.name) || 'documento';
      const extension = lastDotIndex > 0 ? file.name.slice(lastDotIndex).toLowerCase() : '';
      const safeFileName = file.name
        .replace(/\.[^/.]+$/, '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, '_')
        .replace(/[^a-zA-Z0-9._-]/g, '_');
      const safeBaseName = safeFileName || baseName;
      const filePath = `${user.id}/${Date.now()}-${safeBaseName}${extension}`;

      // Upload para o Supabase Storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('verification_docs')
        .upload(filePath, file, {
          upsert: false,
          contentType: file.type
        });

      if (uploadError) throw uploadError;

      toast.success('Documento enviado! Iniciando validação...');
      setIsUploadingDocument(false);
      
      // Verificar se é PDF grande (>1MB) - análise manual
      const isPDF = file.type === 'application/pdf';
      const isPDFTooLarge = isPDF && file.size > 1 * 1024 * 1024; // 1MB
      
      if (isPDFTooLarge) {
        const { data: resultRows, error: completionError } = await supabase.rpc(
          'complete_my_document_verification_upload',
          {
            p_document_path: filePath,
            p_result: 'pending',
            p_failure_reason: null,
          }
        );

        if (completionError) throw completionError;

        const result = Array.isArray(resultRows) ? resultRows[0] : resultRows;
        setDocumentRetryAvailableAt(result?.document_retry_available_at || null);
        setDocumentLastFailureReason(result?.document_last_failure_reason || null);
        await refreshStats();
        setUploadSuccess('PDF enviado. Por ser um arquivo grande, aguarde a análise manual da equipe.');
      } else {
        // Imagens ou PDFs pequenos: validação OCR automática
        setIsValidatingDocument(true);
        
      const validationResult = await validateDocumentWithOCR(file);
        setValidationResult(
          validationResult.success
            ? {
                status: 'approved',
                message: validationResult.message,
              }
            : {
                status: 'manual_review',
                message: 'Não foi possível concluir a validação automática. Seu documento foi encaminhado para análise da equipe de segurança.',
              }
        );
        
        if (validationResult.success) {
          const { data: resultRows, error: completionError } = await supabase.rpc(
            'complete_my_document_verification_upload',
            {
              p_document_path: filePath,
              p_result: 'approved',
              p_failure_reason: null,
            }
          );

          if (completionError) throw completionError;

          const result = Array.isArray(resultRows) ? resultRows[0] : resultRows;
          setDocumentRetryAvailableAt(result?.document_retry_available_at || null);
          setDocumentLastFailureReason(result?.document_last_failure_reason || null);
          
          // Atualizar contexto de autenticação para refletir mudança sem reload
          await refreshStats();
          
          // Toast especial de sucesso com celebração
          toast.success(
            'Parabéns! Sua identidade foi confirmada, e você agora é um Vendedor Verificado.',
            {
              duration: 6000,
              style: {
                background: '#059669',
                color: '#fff',
                fontWeight: 'bold',
                padding: '16px',
              },
              icon: '?',
            }
          );
          
          setUploadSuccess(`${isPDF ? 'PDF' : 'Documento'} validado e enviado com sucesso.`);
        } else {
          const { data: resultRows, error: completionError } = await supabase.rpc(
            'complete_my_document_verification_upload',
            {
              p_document_path: filePath,
              p_result: 'pending',
              p_failure_reason: null,
            }
          );

          if (completionError) throw completionError;

          const result = Array.isArray(resultRows) ? resultRows[0] : resultRows;
          setDocumentRetryAvailableAt(result?.document_retry_available_at || null);
          setDocumentLastFailureReason(result?.document_last_failure_reason || null);
          await refreshStats();
          toast.success('Documento enviado para análise da equipe de segurança.');
          setUploadSuccess('Documento recebido. Nossa equipe de segurança fará a análise e você será avisado aqui na plataforma.');
        }
        
        setIsValidatingDocument(false);
      }
      
      // Limpar mensagens após 10 segundos
      setTimeout(() => {
        setUploadSuccess(null);
        setValidationResult(null);
      }, 10000);
      
    } catch (error: any) {
      appError('Erro ao fazer upload do documento', error, {
        userId: user.id,
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
      });
      setValidationResult({
        success: false,
        message: error.message || 'Erro ao enviar documento',
      });
      toast.error(error.message || 'Erro ao enviar documento');
    } finally {
      setIsUploadingDocument(false);
      setIsValidatingDocument(false);
      event.target.value = '';
    }
  };

  const menuItems = [
    { label: 'Painel de Performance', path: '/minha-conta', icon: <Icons.Dashboard />, badge: 0 },
    { label: 'Meu Plano', path: '/minha-conta/meu-plano', icon: <Icons.Plan />, badge: 0 },
    { label: 'Meus Anúncios', path: '/minha-conta/anuncios', icon: <Icons.Ads />, badge: 0 },
    { label: 'Mensagens', path: '/minha-conta/mensagens', icon: <Icons.Messages />, badge: messagesCount },
    ...(showSellerStoreMenu ? [{ label: 'Minha Loja', path: '/minha-conta/minha-loja', icon: <Icons.Store />, badge: 0 }] : []),
    { label: 'Leads', path: '/minha-conta/leads', icon: <Icons.Leads />, badge: newLeadsCount },
    { label: 'Favoritos', path: '/minha-conta/favoritos', icon: <Icons.Favorites />, badge: 0 },
    { label: 'Radar de Oportunidades', path: '/minha-conta/radar', icon: <Icons.Radar />, badge: 0 },
    ...(isCommercialIntelligenceEnabled
      ? [{ label: 'Inteligência Comercial', path: '/minha-conta/inteligencia-comercial', icon: <Icons.Commercial />, badge: 0 }]
      : []),
    { label: 'Financeiro', path: '/minha-conta/financeiro', icon: <Icons.Finance />, badge: 0 },
    { label: 'Central de Ajuda', path: '/minha-conta/ajuda', icon: <Icons.Help />, badge: 0 },
    { label: 'Perfil', path: '/minha-conta/perfil', icon: <Icons.Profile />, badge: 0 },
  ];

  const handleLogout = async () => {
    await signOut();
    navigate('/login');
  };

  const handleBoosterPurchase = async () => {
    const booster = boosters[0];

    if (!booster) {
      toast.error('Nenhum booster disponivel no momento.');
      return;
    }

    if (!user?.id) {
      toast.error('Voce precisa estar logado para comprar um booster.');
      return;
    }

    if (boosterSummary.requiresPaidPlan && boosterSummary.hasEligiblePaidPlan === false) {
      toast.error(boosterSummary.blockedReason || 'Booster disponivel apenas para assinantes com plano pago ativo.');
      return;
    }

    if (!boosterSummary.canPurchase) {
      toast.error('Voce atingiu o limite de 2 boosters a cada 30 dias.');
      return;
    }

    toast.loading('Preparando checkout do booster...', { id: 'booster-dashboard-checkout' });

    try {
      const result = await initiateBoosterCheckout({
        boosterId: booster.id,
        boosterName: booster.name,
        boosterDescription: booster.description || booster.name,
        amount: booster.monthlyPrice,
        userId: user.id,
      });

      toast.dismiss('booster-dashboard-checkout');

      if (result.success) {
        toast.success('Redirecionando para checkout...');
        await refreshBoosters();
      } else {
        toast.error(result.error || 'Erro ao processar checkout do booster.');
      }
    } catch (error) {
      toast.dismiss('booster-dashboard-checkout');
      appError('[UserDashboard] Erro ao iniciar checkout do booster', error, {
        userId: user.id,
        boosterId: booster.id,
        boosterName: booster.name,
      });
      toast.error('Erro inesperado ao processar checkout do booster.');
    }
  };

  // --- WIDGET COMPONENTS ---

  const MiniTile = ({ label, value, icon, color = "green" }: { label: string, value: string | number, icon: React.ReactNode, color?: string }) => (
    <div className="flex items-center gap-4 rounded-[22px] border border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] p-4 shadow-[0_18px_45px_-38px_rgba(15,23,42,0.22)] transition-all hover:bg-slate-50">
      <div className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-green-700/10 text-green-700 shadow-sm`}>
        {icon}
      </div>
      <div>
        <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">{label}</p>
        <h3 className="text-2xl font-bold text-gray-900 leading-tight">{value}</h3>
      </div>
    </div>
  );

  const HeatmapWidget = ({ metrics }: { metrics: AdMetrics }) => (
    <div className="flex h-full flex-col rounded-[24px] border border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] p-6 shadow-[0_22px_60px_-40px_rgba(15,23,42,0.28)]">
      <div className="flex justify-between items-center mb-6">
        <h4 className="text-sm font-bold text-gray-900">Alcance por Região</h4>
        <Icons.Dashboard />
      </div>
      
      <div className="flex-grow flex flex-col xl:flex-row gap-6 items-center">
          <div className="w-full xl:w-1/2 aspect-square bg-slate-50/50 rounded-lg p-4 border border-slate-100 flex items-center justify-center">
           <Map className="w-16 h-16 text-green-600/60" strokeWidth={1.5} />
        </div>

        <div className="w-full xl:w-1/2 space-y-3">
          {metrics.clicksByState.slice(0, 4).map((s) => (
            <div key={s.state} className="flex flex-col gap-1.5">
              <div className="flex justify-between text-[11px] font-bold text-gray-600">
                <span>{s.state}</span>
                <span className="text-gray-900">{s.count} cliques</span>
              </div>
              <div className="h-1 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-green-700 transition-all duration-1000" style={{ width: `${(s.count / metrics.clicksByState[0].count) * 100}%` }}></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const PriceThermometer = ({ ad, metrics }: { ad: Ad, metrics: AdMetrics }) => (
    <div className="rounded-[24px] border border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] p-6 shadow-[0_22px_60px_-40px_rgba(15,23,42,0.28)]">
      <div className="flex justify-between items-center mb-6">
        <h4 className="text-sm font-bold text-gray-900">Análise de Preço</h4>
        <div className="text-[10px] font-bold text-green-700 px-2 py-0.5 bg-green-50 rounded uppercase">Competitivo</div>
      </div>

      <div className="space-y-6">
        <div className="flex justify-between">
           <div>
             <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Seu Valor</p>
             <p className="text-xl font-bold text-gray-900">R$ {ad.price.toLocaleString('pt-BR')}</p>
           </div>
           <div className="text-right">
             <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Média Mercado</p>
             <p className="text-lg font-semibold text-gray-600">R$ {metrics.marketAvgPrice.toLocaleString('pt-BR')}</p>
           </div>
        </div>

        <div className="relative pt-6">
           <div className="h-1 w-full bg-slate-100 rounded-full overflow-hidden flex">
              <div className="h-full w-1/3 bg-green-400"></div>
              <div className="h-full w-1/3 bg-yellow-300"></div>
              <div className="h-full w-1/3 bg-red-400"></div>
           </div>
           <div 
            className="absolute top-0 flex flex-col items-center transition-all duration-1000"
            style={{ left: `${metrics.pricePosition === 'LOW' ? '15%' : metrics.pricePosition === 'MED' ? '50%' : '85%'}` }}
           >
              <div className="bg-gray-900 text-white text-[9px] font-bold px-2 py-0.5 rounded-sm mb-1 whitespace-nowrap">
                R$ {ad.price.toLocaleString('pt-BR')}
              </div>
              <div className="w-0.5 h-6 bg-gray-900"></div>
           </div>
        </div>
      </div>
    </div>
  );

  const HomeDashboard = () => {
    const [selectedAdId, setSelectedAdId] = React.useState<string | null>(null);
    const { stats: dashboardStats, loading: dashboardLoading } = useDashboardStats(selectedAdId);

    if (!userAds) return null;

    // Filtrar anúncios ativos com preço para o seletor
    const activeAdsWithPrice = userAds.filter(
      ad => ad.status === AdStatus.ACTIVE && ad.price > 0
    );

    return (
      <div className="space-y-6 animate-in fade-in duration-500 pb-20">
        {/* Grid Superior: 4 Cards de Estatísticas */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 min-[1400px]:grid-cols-4">
          <DashboardStatsCard
            icon={<FileText className="w-6 h-6" strokeWidth={1.5} />}
            label="Anúncios Ativos"
            value={dashboardStats?.total_ads || 0}
            bgColor="bg-blue-50"
            iconColor="text-blue-600"
            loading={dashboardLoading}
          />
          <DashboardStatsCard
            icon={<Heart className="w-6 h-6" strokeWidth={1.5} />}
            label="Favoritos recebidos"
            value={dashboardStats?.total_favorites || 0}
            bgColor="bg-rose-50"
            iconColor="text-rose-600"
            loading={dashboardLoading}
          />
          <DashboardStatsCard
            icon={<Eye className="w-6 h-6" strokeWidth={1.5} />}
            label="Visualizações"
            value={dashboardStats?.total_views.toLocaleString('pt-BR') || '0'}
            bgColor="bg-purple-50"
            iconColor="text-purple-600"
            loading={dashboardLoading}
          />
          <DashboardStatsCard
            icon={<TrendingUp className="w-6 h-6" strokeWidth={1.5} />}
            label="Taxa de Conversão"
            value={`${Number(dashboardStats?.conversion_rate || 0).toFixed(1)}%`}
            bgColor="bg-amber-50"
            iconColor="text-amber-600"
            loading={dashboardLoading}
          />
        </div>

        <div className="grid grid-cols-1 gap-6">
          <ReachModule 
            clicksByState={dashboardStats?.clicks_by_state || []}
            loading={dashboardLoading}
          />
        </div>

        <div className="grid grid-cols-1 gap-6">
          <PerformanceRankingModule
            topAdsByViews={dashboardStats?.top_ads_by_views || []}
            topAdsByLeads={dashboardStats?.top_ads_by_leads || []}
            totalFavorites={dashboardStats?.total_favorites || 0}
            loading={dashboardLoading}
          />
        </div>

        <div className="grid grid-cols-1 gap-6">
          <PerformanceAttentionModule
            attentionAds={dashboardStats?.attention_ads || []}
            loading={dashboardLoading}
          />
        </div>

        {/* Módulo de Inteligência de Preço (Full Width) */}
        <div className="grid grid-cols-1">
          <PriceIntelligenceModule
            priceAnalysis={dashboardStats?.price_analysis || null}
            loading={dashboardLoading}
            ads={activeAdsWithPrice}
            selectedAdId={selectedAdId}
            onAdChange={setSelectedAdId}
          />
        </div>

      </div>
    );
  };

  const PerformancePanelLocked = () => {
    const title = isDowngradedBasicPlan
      ? 'Seu plano atual não inclui o Painel de Performance'
      : 'O Painel de Performance está disponível exclusivamente nos planos Safra, Produtor e Loja Parceira.';

    const description = isDowngradedBasicPlan
      ? 'Faça upgrade para voltar a acompanhar seus resultados'
      : 'Faça upgrade e acompanhe o desempenho dos seus anúncios com métricas e insights estratégicos para apoiar suas decisões e gerar mais oportunidades de venda.';

    return (
      <div className="space-y-6 animate-in fade-in duration-500 pb-20">
        <div className="rounded-[28px] border border-emerald-100 bg-[linear-gradient(135deg,#ffffff_0%,#f0fdf4_55%,#ecfeff_100%)] p-6 shadow-[0_26px_70px_-44px_rgba(16,185,129,0.35)] sm:p-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-2xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-white/80 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.24em] text-emerald-700 shadow-sm">
                <Lock className="h-3.5 w-3.5" strokeWidth={1.8} />
                Painel premium
              </div>
              <h1 className="mt-4 text-2xl font-black text-slate-900 sm:text-3xl">{title}</h1>
              <p className="mt-3 max-w-xl text-sm leading-6 text-slate-600 sm:text-base">
                {description}
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Link
                to="/planos"
                className="inline-flex items-center justify-center rounded-2xl bg-green-700 px-5 py-3 text-sm font-bold text-white shadow-[0_20px_40px_-24px_rgba(22,163,74,0.8)] transition-all hover:bg-green-800"
              >
                Fazer upgrade
              </Link>
              <Link
                to="/minha-conta/financeiro"
                className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition-all hover:border-slate-300 hover:bg-slate-50"
              >
                Ver financeiro
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const AdsDashboard = () => {
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = usePersistentState<'all' | 'active' | 'pending' | 'paused' | 'rejected' | 'blocked' | 'expired'>(
      'user-dashboard:ads-active-tab',
      'all'
    );
    const [searchTerm, setSearchTerm] = usePersistentState('user-dashboard:ads-search', '');
    const [itemsPerPage, setItemsPerPage] = usePersistentState('user-dashboard:ads-items-per-page', 10);
    const [isBoosterExpanded, setIsBoosterExpanded] = usePersistentState('user-dashboard:ads-booster-expanded', false);
    const [removedAdIds, setRemovedAdIds] = useState<string[]>([]);
      const [deleteModalOpen, setDeleteModalOpen] = useState(false);
      const [adToDelete, setAdToDelete] = useState<Ad | null>(null);
      const [adForModerationDetails, setAdForModerationDetails] = useState<Ad | null>(null);
      const [expandedModerationSections, setExpandedModerationSections] = useState<Record<string, boolean>>({});
      const [isDeleting, setIsDeleting] = useState(false);
    const [highlightModalOpen, setHighlightModalOpen] = useState(false);
    const [adForHighlight, setAdForHighlight] = useState<{
      id: string;
      title: string;
      hasActiveCategoryHighlight: boolean;
      hasActiveHomeHighlight: boolean;
    } | null>(null);
    const [highlightType, setHighlightType] = useState<'category' | 'home'>('category');

    const visibleAds = useMemo(() => {
      return ads.filter(ad => !removedAdIds.includes(ad.id));
    }, [ads, removedAdIds]);

    const hasPendingEditReview = (ad: Ad) => ad.latestEditRequestStatus === 'pending';
    const getPrimaryDisplayStatus = (ad: Ad) => {
      if (hasPendingEditReview(ad) && ad.status === AdStatus.ACTIVE) return 'EDIT_PENDING';
      if (ad.status === AdStatus.PENDING) return AdStatus.PENDING;
      if (ad.status === AdStatus.REJECTED) return AdStatus.REJECTED;
      if (ad.status === AdStatus.PAUSED) return AdStatus.PAUSED;
      if (ad.status === AdStatus.EXPIRED) return AdStatus.EXPIRED;
      return AdStatus.ACTIVE;
    };

    const counts = useMemo(() => {
        const active = visibleAds.filter(a => a.status === AdStatus.ACTIVE).length;
        const pending = visibleAds.filter(a => a.status === AdStatus.PENDING || hasPendingEditReview(a)).length;
        const paused = visibleAds.filter(a => a.status === AdStatus.PAUSED).length;
        const rejected = visibleAds.filter(a => a.status === AdStatus.REJECTED).length;
        const expired = visibleAds.filter(a => a.status === AdStatus.EXPIRED).length;
        return {
          all: visibleAds.length,
          active,
          pending,
          paused,
          rejected,
          expired,
          blocked: expired
        };
      }, [visibleAds]);

    const filteredAds = useMemo(() => {
      const normalized = searchTerm.trim().toLowerCase();
        const byTab = visibleAds.filter(ad => {
          if (activeTab === 'active') return ad.status === AdStatus.ACTIVE;
          if (activeTab === 'pending') return ad.status === AdStatus.PENDING || hasPendingEditReview(ad);
          if (activeTab === 'paused') return ad.status === AdStatus.PAUSED;
          if (activeTab === 'rejected') return ad.status === AdStatus.REJECTED;
          if (activeTab === 'expired') return ad.status === AdStatus.EXPIRED;
          if (activeTab === 'blocked') return ad.status === AdStatus.EXPIRED;
          return true;
        });

      if (!normalized) return byTab;
      return byTab.filter(ad => ad.title.toLowerCase().includes(normalized) || ad.id.toLowerCase().includes(normalized));
    }, [visibleAds, activeTab, searchTerm]);

    const pagedAds = useMemo(() => filteredAds.slice(0, itemsPerPage), [filteredAds, itemsPerPage]);

    const tabs = [
      { id: 'all', label: 'Todos', count: counts.all },
      { id: 'active', label: 'Ativos', count: counts.active },
      { id: 'pending', label: 'Em Análise', count: counts.pending },
      { id: 'paused', label: 'Pausados', count: counts.paused },
      { id: 'rejected', label: 'Reprovados', count: counts.rejected },
      { id: 'blocked', label: 'Excluídos', count: counts.blocked }
    ] as const;

    const statusLabel: Record<string, string> = {
      EDIT_PENDING: 'Edições em análise',
      [AdStatus.ACTIVE]: 'Ativo',
      [AdStatus.PAUSED]: 'Pausado',
      [AdStatus.PENDING]: 'Em Análise',
      [AdStatus.REJECTED]: 'Reprovado',
      [AdStatus.BLOCKED]: 'Excluído',
      [AdStatus.EXPIRED]: 'Expirado',
      [AdStatus.SOLD]: 'Vendido'
    };

    const statusToneClass: Record<string, string> = {
      EDIT_PENDING: 'text-amber-700',
      [AdStatus.ACTIVE]: 'text-green-700',
      [AdStatus.PAUSED]: 'text-slate-500',
      [AdStatus.PENDING]: 'text-amber-700',
      [AdStatus.REJECTED]: 'text-rose-700',
      [AdStatus.BLOCKED]: 'text-slate-500',
      [AdStatus.EXPIRED]: 'text-slate-500',
      [AdStatus.SOLD]: 'text-slate-500'
    };

    // Handlers para ações
    const getAdDurationLabel = (ad: Ad) => {
      if (!ad.expiresAt) {
        return 'Expiração não informada';
      }

      const expiresAt = new Date(ad.expiresAt);

      if (Number.isNaN(expiresAt.getTime())) {
      return `Expira em ${ad.expiresAt}`;
      }

      return `Expira em ${expiresAt.toLocaleDateString('pt-BR')}`;
    };

    const getAdLifetimeLabel = (ad: Ad) => {
      if (!ad.expiresAt) {
        return 'Expiração não informada';
      }

      const expiresAt = new Date(ad.expiresAt);

      if (Number.isNaN(expiresAt.getTime())) {
        return `Expira em ${ad.expiresAt}`;
      }

      return `Expira em ${expiresAt.toLocaleDateString('pt-BR')}`;
    };

    const getHighlightLifetimeLabel = (ad: Ad) => {
      const categoryUntil = (ad as any).highlight_category_until || (ad as any).highlightCategoryUntil;
      const homeUntil = (ad as any).highlight_home_until || (ad as any).highlightHomeUntil;
      const parts: string[] = [];

      if (categoryUntil && isTimestampActive(categoryUntil)) {
        const categoryDate = new Date(categoryUntil);
        parts.push(
          Number.isNaN(categoryDate.getTime())
            ? `Categoria até ${categoryUntil}`
            : `Categoria até ${categoryDate.toLocaleDateString('pt-BR')}`
        );
      }

      if (homeUntil && isTimestampActive(homeUntil)) {
        const homeDate = new Date(homeUntil);
        parts.push(
          Number.isNaN(homeDate.getTime())
            ? `Home até ${homeUntil}`
            : `Home até ${homeDate.toLocaleDateString('pt-BR')}`
        );
      }

      return parts.join(' | ');
    };

    const getHighlightCooldownDaysRemaining = (availableAfter?: string | null) => {
      if (!availableAfter) {
        return null;
      }

      const availableDate = new Date(availableAfter);
      if (Number.isNaN(availableDate.getTime())) {
        return null;
      }

      const remainingMs = availableDate.getTime() - Date.now();
      if (remainingMs <= 0) {
        return null;
      }

      return Math.ceil(remainingMs / (1000 * 60 * 60 * 24));
    };

    const getHighlightCooldownLabel = (ad: Ad) => {
      const categoryUntil = (ad as any).highlight_category_until || (ad as any).highlightCategoryUntil;
      const homeUntil = (ad as any).highlight_home_until || (ad as any).highlightHomeUntil;
      const hasActiveCategoryHighlight = isTimestampActive(categoryUntil);
      const hasActiveHomeHighlight = isTimestampActive(homeUntil);
      const parts: string[] = [];

      if (!hasActiveCategoryHighlight) {
        const categoryDaysRemaining = getHighlightCooldownDaysRemaining(ad.highlightCategoryAvailableAfter);
        if (categoryDaysRemaining) {
          parts.push(`Destaque de categoria disponível novamente em ${categoryDaysRemaining} ${categoryDaysRemaining === 1 ? 'dia' : 'dias'}.`);
        }
      }

      if (!hasActiveHomeHighlight) {
        const homeDaysRemaining = getHighlightCooldownDaysRemaining(ad.highlightHomeAvailableAfter);
        if (homeDaysRemaining) {
          parts.push(`Destaque de Home disponível novamente em ${homeDaysRemaining} ${homeDaysRemaining === 1 ? 'dia' : 'dias'}.`);
        }
      }

      return parts.join(' | ');
    };

    const getExpiredRetentionLabel = (ad: Ad) => {
      if (!ad.deletionScheduledAt) {
        return 'Exclusão automática conforme o prazo do plano';
      }

      const deletionDate = new Date(ad.deletionScheduledAt);

      if (Number.isNaN(deletionDate.getTime())) {
      return `Exclusão automática em ${ad.deletionScheduledAt}`;
      }

      return `Exclusão automática em ${deletionDate.toLocaleDateString('pt-BR')}`;
    };

    const getRejectedStatusLabel = (ad: Ad) => {
      if (!ad.rejectedAt) {
        return 'Anúncio reprovado pela moderação';
      }

      const rejectedDate = new Date(ad.rejectedAt);
      if (Number.isNaN(rejectedDate.getTime())) {
        return `Anúncio reprovado em ${ad.rejectedAt}`;
      }

      return `Anúncio reprovado em ${rejectedDate.toLocaleDateString('pt-BR')}`;
    };

    const formatRetryDateTime = (value?: string | null) => {
      if (!value) return '';

      const retryDate = new Date(value);
      if (Number.isNaN(retryDate.getTime())) {
        return value;
      }

      return retryDate.toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    };

    const isReanalysisBlocked = (value?: string | null) => Boolean(value && isTimestampActive(value));

    const getReanalysisBlockedLabel = (ad: Ad) => {
      if (ad.status === AdStatus.REJECTED && isReanalysisBlocked(ad.reanalysisAvailableAt)) {
        return `Novo envio disponível em ${formatRetryDateTime(ad.reanalysisAvailableAt)}`;
      }

      if (ad.latestEditRequestStatus === 'rejected' && isReanalysisBlocked(ad.latestEditReanalysisAvailableAt)) {
        return `Nova alteração disponível em ${formatRetryDateTime(ad.latestEditReanalysisAvailableAt)}`;
      }

      return '';
    };

      const getAdStatusSupportingLabel = (ad: Ad) => {
        if (ad.status === AdStatus.REJECTED) {
          return getRejectedStatusLabel(ad);
      }

      if (ad.status === AdStatus.EXPIRED) {
        return getExpiredRetentionLabel(ad);
      }

      if (hasPendingEditReview(ad) && ad.status === AdStatus.ACTIVE) {
        return 'Alterações enviadas para análise com anúncio ativo';
      }

        return `Anúncio ${getAdLifetimeLabel(ad).toLowerCase()}`;
      };

      const getModerationSummaryLabel = (ad: Ad) => {
        if (ad.status === AdStatus.REJECTED) {
          return 'Ver motivo da reprovação';
        }

        if (ad.latestEditRequestStatus === 'rejected') {
          return 'Ver detalhes da última alteração rejeitada';
        }

        if (ad.communityReportedToReviewAt) {
          return 'Ver detalhes da análise por denúncias';
        }

        return '';
      };

      const hasModerationDetails = (ad: Ad) =>
        Boolean(
          ad.status === AdStatus.REJECTED ||
          ad.latestEditRequestStatus === 'rejected' ||
          ad.communityReportedToReviewAt ||
          ad.rejectionReason ||
          ad.latestEditRejectionReason
        );

      useEffect(() => {
        if (!adForModerationDetails) {
          setExpandedModerationSections({});
          return;
        }

        setExpandedModerationSections({
          rejection: Boolean(adForModerationDetails.status === AdStatus.REJECTED && adForModerationDetails.rejectionReason),
          lastEdit: Boolean(adForModerationDetails.latestEditRequestStatus === 'rejected' && adForModerationDetails.latestEditRejectionReason),
          community: Boolean(adForModerationDetails.communityReportedToReviewAt),
          retry: Boolean(getReanalysisBlockedLabel(adForModerationDetails)),
        });
      }, [adForModerationDetails]);

      const toggleModerationSection = (sectionKey: string) => {
        setExpandedModerationSections((current) => ({
          ...current,
          [sectionKey]: !current[sectionKey],
        }));
      };

      const getModerationSections = (ad: Ad) => {
        const sections: Array<{
          key: string;
          title: string;
          summary: string;
          accent: string;
          accentText: string;
          content: React.ReactNode;
        }> = [];

        const retryLabel = getReanalysisBlockedLabel(ad);

        if (ad.status === AdStatus.REJECTED && ad.rejectionReason) {
          sections.push({
            key: 'rejection',
            title: 'Motivo da reprovação',
            summary: 'Entenda por que o anúncio foi reprovado pela moderação.',
            accent: 'border-rose-200 bg-rose-50',
            accentText: 'text-rose-700',
            content: (
              <div className="space-y-4">
                <p className="text-sm leading-6 text-rose-900">{ad.rejectionReason}</p>
                {retryLabel ? (
                  <div className="rounded-xl border border-rose-200/80 bg-white/70 px-3 py-3">
                    <p className="text-[11px] font-black uppercase tracking-[0.16em] text-rose-700">Novo envio disponível</p>
                    <p className="mt-2 flex items-start gap-2 text-sm leading-6 text-rose-900">
                      <Clock3 className="mt-0.5 h-4 w-4 flex-shrink-0" strokeWidth={1.8} />
                      <span>{retryLabel}</span>
                    </p>
                  </div>
                ) : null}
              </div>
            ),
          });
        }

        if (ad.latestEditRequestStatus === 'rejected' && ad.latestEditRejectionReason) {
          sections.push({
            key: 'lastEdit',
            title: 'Última alteração rejeitada',
            summary: 'Mostra o motivo aplicado na última edição enviada.',
            accent: 'border-amber-200 bg-amber-50',
            accentText: 'text-amber-700',
            content: (
              <div className="space-y-4">
                <p className="text-sm leading-6 text-amber-900">{ad.latestEditRejectionReason}</p>
                {retryLabel ? (
                  <div className="rounded-xl border border-amber-200/80 bg-white/70 px-3 py-3">
                    <p className="text-[11px] font-black uppercase tracking-[0.16em] text-amber-700">Nova alteração disponível</p>
                    <p className="mt-2 flex items-start gap-2 text-sm leading-6 text-amber-900">
                      <Clock3 className="mt-0.5 h-4 w-4 flex-shrink-0" strokeWidth={1.8} />
                      <span>{retryLabel}</span>
                    </p>
                  </div>
                ) : null}
              </div>
            ),
          });
        }

        if (ad.communityReportedToReviewAt) {
          sections.push({
            key: 'community',
            title: 'Análise por denúncias',
            summary: 'O anúncio entrou em revisão após denúncias da comunidade.',
            accent: 'border-sky-200 bg-sky-50',
            accentText: 'text-sky-700',
            content: (
              <p className="text-sm leading-6 text-sky-900">
                Este anúncio está em análise por denúncias da comunidade e só pode ser liberado pela equipe administrativa.
              </p>
            ),
          });
        }

        if (
          retryLabel &&
          !(ad.status === AdStatus.REJECTED && ad.rejectionReason) &&
          !(ad.latestEditRequestStatus === 'rejected' && ad.latestEditRejectionReason)
        ) {
          sections.push({
            key: 'retry',
            title: 'Prazo para novo envio',
            summary: 'Indica quando um novo envio ou alteração será liberado.',
            accent: 'border-amber-200 bg-amber-50/70',
            accentText: 'text-amber-700',
            content: (
              <p className="flex items-start gap-2 text-sm leading-6 text-amber-900">
                <Clock3 className="mt-0.5 h-4 w-4 flex-shrink-0" strokeWidth={1.8} />
                <span>{retryLabel}</span>
              </p>
            ),
          });
        }

        return sections;
      };

    const handleTogglePause = async (ad: Ad) => {
      if (ad.communityReportedToReviewAt) {
        sonnerToast.error('Este anúncio está em análise por denúncias da comunidade e só pode ser liberado pela equipe administrativa.');
        return;
      }

      const newStatus = ad.status === AdStatus.ACTIVE ? AdStatus.PAUSED : AdStatus.ACTIVE;
      const pausedAdReactivationMessage =
        adLimitMessage ||
        'Nao ha espaco disponivel no seu plano atual para reativar este anuncio. Desative outro anuncio ativo ou faca upgrade para liberar mais vagas.';

      try {
        if (ad.status === AdStatus.PAUSED) {
          const { data: capacityRows, error: capacityError } = await supabase.rpc('get_my_active_ad_capacity_status');

          if (!capacityError) {
            const capacityStatus = Array.isArray(capacityRows) ? capacityRows[0] : capacityRows;
            const canReactivatePausedAd = Boolean(capacityStatus?.can_publish_new);

            if (!canReactivatePausedAd) {
              sonnerToast.error(pausedAdReactivationMessage);
              return;
            }
          } else if (
            usage.adsLimit !== null &&
            usage.adsLimit !== undefined &&
            usage.adsUsed >= usage.adsLimit
          ) {
            sonnerToast.error(pausedAdReactivationMessage);
            return;
          }
        }

        const { error } = await supabase
          .from('announcements')
          .update({ status: newStatus })
          .eq('id', ad.id);

        if (error) {
          const normalizedError = `${error.message || ''} ${error.details || ''} ${error.hint || ''}`.toLowerCase();
          const limitReached =
            newStatus === AdStatus.ACTIVE &&
            (
              normalizedError.includes('limite') ||
              normalizedError.includes('maximo') ||
              normalizedError.includes('active announcements') ||
              normalizedError.includes('simultaneous active ad')
            );

          sonnerToast.error(
            limitReached
              ? pausedAdReactivationMessage
              : 'Erro ao alterar status do anúncio'
          );
          return;
        }

        sonnerToast.success(newStatus === AdStatus.PAUSED ? 'Anúncio pausado' : 'Anúncio reativado');
        await refreshUsage();
        window.location.reload();
      } catch (error: any) {
        const normalizedError = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase();
        const limitReached =
          newStatus === AdStatus.ACTIVE &&
          (
            normalizedError.includes('limite') ||
            normalizedError.includes('maximo') ||
            normalizedError.includes('active announcements') ||
            normalizedError.includes('simultaneous active ad')
          );

        sonnerToast.error(
          limitReached
            ? pausedAdReactivationMessage
            : 'Erro ao alterar status do anúncio'
        );
      }
    };

    const handleRepublishExpiredAd = async (ad: Ad) => {
      const expiredAdReactivationMessage =
        adLimitMessage ||
        'Nao ha espaco disponivel no seu plano atual para reativar este anuncio. Desative outro anuncio ativo ou faca upgrade para liberar mais vagas.';

      const { data, error } = await supabase.rpc('reactivate_expired_announcement', {
        p_announcement_id: ad.id
      });

      if (error) {
        const normalizedError = `${error.message || ''} ${error.details || ''} ${error.hint || ''}`.toLowerCase();
        const limitReached =
          normalizedError.includes('limite') ||
          normalizedError.includes('vaga') ||
          normalizedError.includes('espaco') ||
          normalizedError.includes('maximo') ||
          normalizedError.includes('active announcements') ||
          normalizedError.includes('simultaneous active ad');

        sonnerToast.error(limitReached ? expiredAdReactivationMessage : 'Erro ao reativar anuncio');
        return;
      }

      if (!data?.success) {
        const normalizedError = `${data?.error || ''}`.toLowerCase();
        const limitReached =
          normalizedError.includes('limite') ||
          normalizedError.includes('vaga') ||
          normalizedError.includes('espaco') ||
          normalizedError.includes('maximo');

        sonnerToast.error(limitReached ? expiredAdReactivationMessage : (data?.error || 'Nao foi possivel reativar o anuncio'));
        return;
      }

      sonnerToast.success(data?.message || 'Anuncio reativado com sucesso');
      await refreshUsage();
      window.location.reload();
    };

    const handleDeleteClick = (ad: Ad) => {
      setAdToDelete(ad);
      setDeleteModalOpen(true);
    };

    const handleConfirmDelete = async () => {
      if (!adToDelete) return;
      
      setIsDeleting(true);
      try {
        await deleteAnnouncementWithRelations(adToDelete.id);

        toast.success('Anúncio excluído com sucesso');
        setRemovedAdIds((current) =>
          current.includes(adToDelete.id) ? current : [...current, adToDelete.id]
        );
        setDeleteModalOpen(false);
        setAdToDelete(null);
      } catch (error: any) {
        toast.error('Erro ao excluir anúncio: ' + error.message);
      } finally {
        setIsDeleting(false);
      }
    };

    const handleHighlightClick = (ad: Ad, type: 'category' | 'home') => {
      const hasCategoryHighlight = Boolean((ad as any).highlight_category || ad.highlightCategory);
      const hasHomeHighlight = Boolean((ad as any).highlight_home || ad.highlightHome);
      const categoryUntil = (ad as any).highlight_category_until || (ad as any).highlightCategoryUntil;
      const homeUntil = (ad as any).highlight_home_until || (ad as any).highlightHomeUntil;
      const hasActiveCategoryHighlight = hasCategoryHighlight && isTimestampActive(categoryUntil);
      const hasActiveHomeHighlight = hasHomeHighlight && isTimestampActive(homeUntil);
      const isBlocked = (type === 'category' && hasActiveHomeHighlight) || (type === 'home' && hasActiveCategoryHighlight);
      const isSameTypeAlreadyActive =
        (type === 'category' && hasActiveCategoryHighlight) ||
        (type === 'home' && hasActiveHomeHighlight);

      if (isBlocked) {
        toast.error(
          type === 'category'
        ? 'Destaque bloqueado: este anúncio já está destacado na Home e não pode receber destaque em Categoria ao mesmo tempo.'
        : 'Destaque bloqueado: este anúncio já está destacado em Categoria e não pode receber destaque na Home ao mesmo tempo.'
        );
        return;
      }

      if (isSameTypeAlreadyActive) {
        toast.error(
          type === 'category'
            ? `Este anúncio já está com destaque em Categoria ativo. Ele só poderá receber novo destaque em Categoria ${highlightCooldownLabel} após o vencimento do período atual.`
            : `Este anúncio já está com destaque na Home ativo. Ele só poderá receber novo destaque na Home ${highlightCooldownLabel} após o vencimento do período atual.`
        );
        return;
      }

      setAdForHighlight({
        id: ad.id,
        title: ad.title,
        hasActiveCategoryHighlight,
        hasActiveHomeHighlight,
      });
      setHighlightType(type);
      setHighlightModalOpen(true);
    };

    return (
      <div className="space-y-6">
        <div className="rounded-[24px] border border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] p-4 shadow-[0_22px_60px_-40px_rgba(15,23,42,0.3)] sm:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`h-10 px-3.5 rounded-xl text-sm font-semibold border transition-all shadow-sm ${
                  activeTab === tab.id
                    ? 'border-slate-900 bg-slate-900 text-white shadow-[0_18px_30px_-20px_rgba(15,23,42,0.9)]'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                {tab.id === 'blocked' ? 'Vencidos' : tab.label}
                <span className={`ml-2 text-xs font-semibold ${activeTab === tab.id ? 'text-slate-100' : 'text-slate-500'}`}>
                  {tab.count}
                </span>
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center lg:w-auto lg:justify-end">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por título ou código"
              className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-slate-700 shadow-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-green-600/20 sm:w-64"
            />
            <select
              value={itemsPerPage}
              onChange={(e) => setItemsPerPage(Number(e.target.value))}
              className="h-10 rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-green-600/20"
            >
              <option value={5}>5 por página</option>
              <option value={10}>10 por página</option>
              <option value={20}>20 por página</option>
            </select>
          </div>
        </div>
        </div>

        {boosters[0] && (
          <>
          <style>{`
            @keyframes boosterHaloPulse {
              0%, 100% { box-shadow: 0 0 0 0 rgba(245,158,11,0), 0 22px 60px -42px rgba(245,158,11,0.35); }
              50% { box-shadow: 0 0 0 6px rgba(245,158,11,0.18), 0 22px 60px -38px rgba(245,158,11,0.55); }
            }
            .booster-halo { animation: boosterHaloPulse 2.4s ease-in-out infinite; }
            @media (prefers-reduced-motion: reduce) { .booster-halo { animation: none; } }
          `}</style>
          <div className={`rounded-[24px] border border-amber-200 bg-[linear-gradient(180deg,#ffffff_0%,#fff7ed_100%)] p-5 shadow-[0_22px_60px_-42px_rgba(245,158,11,0.35)] ${isBoosterExpanded ? '' : 'booster-halo'}`}>
            <button
              type="button"
              onClick={() => setIsBoosterExpanded((prev) => !prev)}
              className="flex w-full items-start justify-between gap-4 text-left"
            >
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-600">Booster avulso</p>
                <h3 className="mt-1 text-base font-semibold text-slate-900">Compre mais créditos de destaque sem trocar de plano</h3>
                <p className="mt-1 text-sm text-slate-500">
                  Clique para {isBoosterExpanded ? 'ocultar' : 'ver'} detalhes e comprar o combo.
                </p>
              </div>
              <div className="flex items-center gap-3">
                <div className="rounded-xl border border-amber-100 bg-white/80 px-3 py-2 text-xs text-slate-600 shadow-sm">
                  Limite de {boosters[0].maxPurchasesPer30Days} compra(s) a cada 30 dias
                </div>
                <span className={`inline-flex h-10 w-10 items-center justify-center rounded-xl border border-amber-100 bg-white/80 text-slate-600 shadow-sm transition-transform ${isBoosterExpanded ? 'rotate-180' : ''}`}>
                  <ChevronDown className="h-4 w-4" strokeWidth={1.75} />
                </span>
              </div>
            </button>

            <AnimatePresence initial={false}>
              {isBoosterExpanded && (
                <motion.div
                  initial={{ opacity: 0, height: 0, marginTop: 0 }}
                  animate={{ opacity: 1, height: 'auto', marginTop: 16 }}
                  exit={{ opacity: 0, height: 0, marginTop: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <HighlightBoosterCard
                    booster={boosters[0]}
                    summary={boosterSummary}
                    onPurchase={handleBoosterPurchase}
                    loading={boostersLoading}
                    compact
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          </>
        )}

        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="space-y-2"
          >
            {adsLoading ? (
              <AdsSkeletonList count={5} />
            ) : pagedAds.length === 0 ? (
              <div className="rounded-[24px] border border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] p-10 text-center shadow-[0_22px_60px_-40px_rgba(15,23,42,0.3)]">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#dcfce7_0%,#dbeafe_100%)] text-slate-600 shadow-sm">
                  <Inbox className="w-5 h-5" strokeWidth={1.5} />
                </div>
                <p className="text-sm font-semibold text-slate-700 mb-2">Você não possui anúncios nesta categoria no momento</p>
                <p className="text-sm text-slate-500 mb-6">Crie um anúncio para começar a gerar oportunidades.</p>
                <Link
                  to="/anunciar"
                  className="inline-flex items-center justify-center h-10 rounded-xl bg-green-700 px-4 text-sm font-semibold text-white shadow-[0_18px_30px_-20px_rgba(22,163,74,0.75)] transition-colors hover:bg-green-800"
                >
                  Anunciar Agora
                </Link>
              </div>
            ) : (
              pagedAds.map((ad) => (
                <div
                  key={ad.id}
                  role="link"
                  tabIndex={0}
                  onClick={() => navigate(`/anuncio/${ad.id}`)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      navigate(`/anuncio/${ad.id}`);
                    }
                  }}
                  className="flex h-20 cursor-pointer items-center gap-4 rounded-[22px] border border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] px-4 py-3 shadow-[0_18px_45px_-38px_rgba(15,23,42,0.32)] transition-all hover:-translate-y-0.5 hover:shadow-[0_24px_55px_-36px_rgba(15,23,42,0.35)]"
                >
                  <div className="h-[60px] w-[60px] flex-shrink-0 overflow-hidden rounded-2xl bg-slate-100 shadow-sm">
                    <img src={getPrimaryImageFromList(ad.images, settings.defaultAdImageUrl)} alt={ad.title} className="w-full h-full object-cover" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-slate-900 truncate">{ad.title}</p>
                      {(() => {
                        const hasCategory = (ad as any).highlight_category || (ad as any).highlightCategory;
                        const hasHome = (ad as any).highlight_home || (ad as any).highlightHome;
                        const categoryUntil = (ad as any).highlight_category_until || ad.highlightCategoryUntil;
                        const homeUntil = (ad as any).highlight_home_until || ad.highlightHomeUntil;
                        const hasActiveCategoryHighlight = hasCategory && isTimestampActive(categoryUntil);
                        const hasActiveHomeHighlight = hasHome && isTimestampActive(homeUntil);
                        
                        return (
                          <>
                            {hasActiveCategoryHighlight && (
                        <div className="flex-shrink-0 flex items-center gap-1 rounded-lg border border-blue-100 bg-blue-50 px-2 py-0.5 shadow-sm" title="Destacado na categoria">
                                <TrendingUp className="w-3 h-3 text-blue-600" strokeWidth={2} />
                                <span className="text-[9px] font-bold text-blue-700 uppercase tracking-tight">Cat</span>
                              </div>
                            )}
                            {hasActiveHomeHighlight && (
                              <div className="flex-shrink-0 flex items-center gap-1 rounded-lg border border-amber-100 bg-amber-50 px-2 py-0.5 shadow-sm" title="Destacado na home">
                                <Sparkles className="w-3 h-3 text-amber-600" strokeWidth={2} />
                                <span className="text-[9px] font-bold text-amber-700 uppercase tracking-tight">Home</span>
                              </div>
                            )}
                          </>
                        );
                      })()}
                    </div>
                    <p className="hidden text-xs text-slate-500 truncate">
                      Código: {ad.id} | Cadastrado em: {new Date(ad.createdAt).toLocaleDateString('pt-BR')} às {new Date(ad.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                    <p className="text-xs text-slate-500 truncate">
                            Cadastrado em: {new Date(ad.createdAt).toLocaleDateString('pt-BR')} às {new Date(ad.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} | {getAdStatusSupportingLabel(ad)}
                      {getHighlightLifetimeLabel(ad) ? ` | Destaque ${getHighlightLifetimeLabel(ad).replace('Categoria', 'categoria').replace('Home', 'home')}` : ''}
                    </p>
                    {getHighlightCooldownLabel(ad) ? (
                      <p className="text-[11px] font-medium text-amber-700 truncate">
                        {getHighlightCooldownLabel(ad)}
                      </p>
                    ) : null}
                    <p className="text-xs text-slate-500">
                      Visitas: {ad.views} | Valor: {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(ad.price)}
                    </p>
                  </div>

                  <div className="flex items-center gap-4">
                    <span className={`text-xs font-semibold ${statusToneClass[getPrimaryDisplayStatus(ad)] || 'text-slate-500'}`}>
                      {statusLabel[getPrimaryDisplayStatus(ad)] || 'Status'}
                    </span>
                    <div className="flex items-center gap-1 text-slate-400">
                      {/* Botão de Destaques */}
                      {ad.status !== AdStatus.EXPIRED && ad.status !== AdStatus.REJECTED && (
                        <>
                        {(() => {
                          const hasCategoryHighlight = Boolean((ad as any).highlight_category || ad.highlightCategory);
                          const hasHomeHighlight = Boolean((ad as any).highlight_home || ad.highlightHome);
                          const categoryUntil = (ad as any).highlight_category_until || ad.highlightCategoryUntil;
                          const homeUntil = (ad as any).highlight_home_until || ad.highlightHomeUntil;
                          const hasActiveCategoryHighlight = hasCategoryHighlight && isTimestampActive(categoryUntil);
                          const hasActiveHomeHighlight = hasHomeHighlight && isTimestampActive(homeUntil);
                          const categoryCooldownLabel = !hasActiveCategoryHighlight ? getHighlightCooldownLabel({
                            ...ad,
                            highlightHomeAvailableAfter: null,
                          }) : '';
                          const homeCooldownLabel = !hasActiveHomeHighlight ? getHighlightCooldownLabel({
                            ...ad,
                            highlightCategoryAvailableAfter: null,
                          }) : '';
                          const isCategoryOnCooldown = Boolean(ad.highlightCategoryAvailableAfter && getHighlightCooldownDaysRemaining(ad.highlightCategoryAvailableAfter));
                          const isHomeOnCooldown = Boolean(ad.highlightHomeAvailableAfter && getHighlightCooldownDaysRemaining(ad.highlightHomeAvailableAfter));
                          const categoryBlocked = hasActiveHomeHighlight || hasActiveCategoryHighlight || isCategoryOnCooldown;
                          const homeBlocked = hasActiveCategoryHighlight || hasActiveHomeHighlight || isHomeOnCooldown;
                          const categoryTitle = hasActiveCategoryHighlight
                            ? `Este anúncio já está com destaque em Categoria ativo. Novo destaque em Categoria só fica disponível ${highlightCooldownLabel} após o vencimento.`
                            : isCategoryOnCooldown
                              ? categoryCooldownLabel
                              : hasActiveHomeHighlight
                                ? 'Indisponível enquanto o destaque na Home estiver ativo.'
                                : 'Aplicar destaque de categoria.';
                          const homeTitle = hasActiveHomeHighlight
                            ? `Este anúncio já está com destaque na Home ativo. Novo destaque na Home só fica disponível ${highlightCooldownLabel} após o vencimento.`
                            : isHomeOnCooldown
                              ? homeCooldownLabel
                            : hasActiveCategoryHighlight
                              ? 'Indisponível enquanto o destaque em Categoria estiver ativo.'
                              : 'Aplicar destaque na Home.';

                          return (
                            <>
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleHighlightClick(ad, 'category');
                          }}
                          disabled={categoryBlocked}
                          className={`p-2 rounded-lg transition-colors ${
                            categoryBlocked
                              ? 'cursor-not-allowed text-slate-300'
                              : 'hover:bg-blue-50 hover:text-blue-700'
                          }`} 
                          title={categoryTitle}
                        >
                          <TrendingUp className="w-4 h-4" strokeWidth={1.5} />
                        </button>
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleHighlightClick(ad, 'home');
                          }}
                          disabled={homeBlocked}
                          className={`p-2 rounded-lg transition-colors ${
                            homeBlocked
                              ? 'cursor-not-allowed text-slate-300'
                              : 'hover:bg-amber-50 hover:text-amber-700'
                          }`} 
                          title={homeTitle}
                        >
                          <Sparkles className="w-4 h-4" strokeWidth={1.5} />
                        </button>
                            </>
                          );
                        })()}
                        </>
                      )}
                      {/* Botão Editar */}
                      {(() => {
                        const inReview =
                          ad.status === AdStatus.PENDING
                          || String(ad.status) === 'UNDER_REVIEW'
                          || hasPendingEditReview(ad); // EDIT_PENDING: já há edição em análise
                        const editBlocked =
                          inReview
                          || (ad.status === AdStatus.REJECTED && isReanalysisBlocked(ad.reanalysisAvailableAt))
                          || (ad.latestEditRequestStatus === 'rejected' && isReanalysisBlocked(ad.latestEditReanalysisAvailableAt));
                        const editBlockedTitle = inReview
                          ? 'Em análise pela moderação — edição disponível após aprovação ou rejeição.'
                          : ad.status === AdStatus.REJECTED
                            ? getReanalysisBlockedLabel(ad) || 'Novo envio temporariamente bloqueado'
                            : getReanalysisBlockedLabel(ad) || 'Nova alteração temporariamente bloqueada';

                        return (
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          if (editBlocked) {
                            sonnerToast.error(editBlockedTitle);
                            return;
                          }
                          navigate(`/anunciar?edit=${ad.id}`);
                        }}
                        disabled={editBlocked}
                        className={`p-2 rounded-lg transition-colors ${
                          editBlocked
                            ? 'cursor-not-allowed text-slate-300'
                            : 'hover:bg-slate-50 hover:text-green-700'
                        }`} 
                        title={editBlocked ? editBlockedTitle : 'Editar anúncio'}
                      >
                        <Edit3 className="w-4 h-4" strokeWidth={1.5} />
                      </button>
                        );
                      })()}
                      {hasModerationDetails(ad) ? (
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setAdForModerationDetails(ad);
                          }}
                          className="p-2 rounded-lg transition-colors hover:bg-slate-50 hover:text-slate-700"
                          title={getModerationSummaryLabel(ad) || 'Ver detalhes da moderação'}
                        >
                          <AlertCircle className="w-4 h-4" strokeWidth={1.5} />
                        </button>
                      ) : null}
                      {/* Botão Pausar/Reativar */}
                      {ad.status === AdStatus.EXPIRED ? (
                        <button 
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleRepublishExpiredAd(ad);
                          }}
                          className="p-2 rounded-lg hover:bg-green-50 hover:text-green-700 transition-colors"
                          title="Reativar anuncio"
                        >
                          <CreditCard className="w-4 h-4" strokeWidth={1.5} />
                        </button>
                      ) : ad.status !== AdStatus.REJECTED ? (
                      (() => {
                        const moderationLockedByCommunityReports = Boolean(ad.communityReportedToReviewAt);
                        const moderationLockedTitle = moderationLockedByCommunityReports
                          ? 'Este anúncio está em análise por denúncias da comunidade e só pode ser liberado pela equipe administrativa.'
                          : (ad.status === AdStatus.PAUSED ? 'Reativar' : 'Pausar');

                        return (
                      <button 
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleTogglePause(ad);
                        }}
                        disabled={moderationLockedByCommunityReports}
                        className={`p-2 rounded-lg transition-colors ${
                          moderationLockedByCommunityReports
                            ? 'cursor-not-allowed text-slate-300'
                            : ad.status === AdStatus.PAUSED 
                              ? 'hover:bg-green-50 hover:text-green-700' 
                              : 'hover:bg-slate-50 hover:text-slate-700'
                        }`}
                        title={moderationLockedTitle}
                      >
                        <PauseCircle className="w-4 h-4" strokeWidth={1.5} />
                      </button>
                        );
                      })()
                      ) : null}
                      {/* Botão Excluir */}
                      <button 
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleDeleteClick(ad);
                        }}
                        className="p-2 rounded-lg hover:bg-red-50 hover:text-red-600 transition-colors" 
                        title="Excluir anúncio"
                      >
                        <Trash2 className="w-4 h-4" strokeWidth={1.5} />
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </motion.div>
        </AnimatePresence>

        {/* Modal de Confirmação de Exclusão */}
        {deleteModalOpen && adToDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
                        <h3 className="text-xl font-bold text-slate-900 mb-3">Confirmar Exclusão</h3>
                        <p className="text-sm text-slate-600 mb-2">Tem certeza que deseja excluir este anúncio?</p>
              <p className="text-sm font-semibold text-slate-800 mb-6 bg-slate-50 p-3 rounded-lg">
                {adToDelete.title}
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setDeleteModalOpen(false);
                    setAdToDelete(null);
                  }}
                  disabled={isDeleting}
                  className="flex-1 px-4 py-2 rounded-lg font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 transition disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleConfirmDelete}
                  disabled={isDeleting}
                  className="flex-1 px-4 py-2 rounded-lg font-bold text-white bg-red-600 hover:bg-red-700 transition disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isDeleting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Excluindo...
                    </>
                  ) : (
                            'Confirmar Exclusão'
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {adForModerationDetails && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 backdrop-blur-sm p-4">
            <div className="w-full max-w-lg rounded-[26px] border border-slate-200 bg-white shadow-[0_32px_80px_-40px_rgba(15,23,42,0.55)]">
              <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-5">
                <div className="min-w-0">
                  <p className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-400">Detalhes da moderação</p>
                  <h3 className="mt-2 truncate text-lg font-black text-slate-950">{adForModerationDetails.title}</h3>
                  <p className="mt-1 text-sm text-slate-500">
                    {statusLabel[adForModerationDetails.status] || 'Status'} • Código {adForModerationDetails.id}
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">
                      {getModerationSections(adForModerationDetails).length} item(ns)
                    </span>
                    <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.18em] ${
                      adForModerationDetails.status === AdStatus.REJECTED
                        ? 'border-rose-200 bg-rose-50 text-rose-700'
                        : adForModerationDetails.communityReportedToReviewAt
                          ? 'border-sky-200 bg-sky-50 text-sky-700'
                          : 'border-amber-200 bg-amber-50 text-amber-700'
                    }`}>
                      {statusLabel[adForModerationDetails.status] || 'Status'}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setAdForModerationDetails(null)}
                  className="rounded-xl p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
                  title="Fechar"
                >
                  <span className="sr-only">Fechar</span>
                  <span className="block text-xl leading-none">×</span>
                </button>
              </div>

              <div className="max-h-[min(62vh,520px)] overflow-y-auto px-6 py-5">
                <div className="space-y-3">
                  {getModerationSections(adForModerationDetails).map((section) => {
                    const isExpanded = Boolean(expandedModerationSections[section.key]);

                    return (
                      <div key={section.key} className={`overflow-hidden rounded-2xl border ${section.accent}`}>
                        <button
                          type="button"
                          onClick={() => toggleModerationSection(section.key)}
                          className="flex w-full items-start justify-between gap-4 px-4 py-4 text-left"
                        >
                          <div className="min-w-0">
                            <p className={`text-[11px] font-black uppercase tracking-[0.18em] ${section.accentText}`}>
                              {section.title}
                            </p>
                            <p className="mt-2 text-sm text-slate-600">{section.summary}</p>
                          </div>
                          <span className={`mt-0.5 text-lg font-bold transition-transform ${section.accentText} ${isExpanded ? 'rotate-180' : ''}`}>
                            ^
                          </span>
                        </button>

                        {isExpanded ? (
                          <div className="border-t border-black/5 px-4 py-4">
                            {section.content}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="flex justify-end border-t border-slate-100 px-6 py-4">
                <button
                  type="button"
                  onClick={() => setAdForModerationDetails(null)}
                  className="inline-flex h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal de Destaques */}
        {highlightModalOpen && adForHighlight && (
          <HighlightConfirmationModal
            isOpen={highlightModalOpen}
            onClose={() => {
              setHighlightModalOpen(false);
              setAdForHighlight(null);
            }}
            announcementId={adForHighlight.id}
            announcementTitle={adForHighlight.title}
            highlightType={highlightType}
            hasActiveCategoryHighlight={adForHighlight.hasActiveCategoryHighlight}
            hasActiveHomeHighlight={adForHighlight.hasActiveHomeHighlight}
            onSuccess={() => {
              refreshUsage();
              window.location.reload();
            }}
          />
        )}
      </div>
    );
  };

  const LegacyFinanceDashboard = () => <Navigate to="/minha-conta/financeiro" replace />;

  const MyPlanDashboard = () => {
    const currentPlan = subscription?.plans || null;
    const hasActivePlan = Boolean(subscription && usage.periodEndDate && usage.periodEndDate.getTime() > Date.now());
    const isOneTimePlan = subscription?.billing_model !== 'recurring';
    const activeBooster = boosters[0] || null;
    const adLimitReached =
      usage.adsLimit !== null &&
      usage.adsLimit !== undefined &&
      usage.adsUsed >= usage.adsLimit;
    const adLimitExceeded =
      usage.adsLimit !== null &&
      usage.adsLimit !== undefined &&
      usage.adsUsed > usage.adsLimit;

    const toneClasses: Record<string, { text: string; fill: string; track: string; icon: string }> = {
      green: {
        text: 'text-emerald-700',
        fill: 'bg-emerald-500',
        track: 'bg-emerald-100',
        icon: 'text-emerald-600',
      },
      amber: {
        text: 'text-amber-700',
        fill: 'bg-amber-500',
        track: 'bg-amber-100',
        icon: 'text-amber-600',
      },
      warning: {
        text: 'text-rose-700',
        fill: 'bg-rose-500',
        track: 'bg-rose-100',
        icon: 'text-rose-600',
      },
      slate: {
        text: 'text-slate-600',
        fill: 'bg-slate-400',
        track: 'bg-slate-100',
        icon: 'text-slate-500',
      },
    };

    const getUsageText = (used: number, limit: number | null | undefined, displayAsBalance?: boolean) => {
      if (limit === null || limit === undefined) {
        return displayAsBalance ? `${used} disponível(is)` : `${used} em uso`;
      }

      return `${used} de ${limit}`;
    };

    const getUsagePercentage = (used: number, limit: number | null | undefined, displayAsBalance?: boolean) => {
      if (limit === null || limit === undefined || limit <= 0) {
        return displayAsBalance && used > 0 ? 100 : 0;
      }

      return Math.max(0, Math.min((used / limit) * 100, 100));
    };

    const planUsageItems = [
      {
        key: 'ads',
        label: 'Anúncios ativos',
        icon: <FileText className="h-4 w-4" strokeWidth={1.7} />,
        used: usage.adsUsed,
        limit: usage.adsLimit,
        helper:
          usage.adsLimit === null || usage.adsLimit === undefined
            ? 'Seu plano atual permite publicações sem limite configurado.'
            : adLimitExceeded
              ? 'Você está acima da capacidade atual. Novas publicações e reativações ficam bloqueadas até abrir vaga ou fazer upgrade.'
              : canCreateAd
                ? 'Ainda há vagas disponíveis para novas publicações neste plano.'
                : 'Abra vaga ou faça upgrade para voltar a publicar novos anúncios.',
        tone: adLimitExceeded ? 'warning' : adLimitReached ? 'amber' : 'green',
      },
      {
        key: 'category-highlights',
        label: 'Destaques em categoria',
        icon: <TrendingUp className="h-4 w-4" strokeWidth={1.7} />,
        used: usage.categoryHighlightsUsed,
        limit: usage.categoryHighlightsLimit,
        helper: usage.categoryHighlightsLimit > 0
          ? `${Math.max(usage.categoryHighlightsLimit - usage.categoryHighlightsUsed, 0)} crédito(s) do plano disponível(is) neste ciclo.`
          : 'Seu plano atual não inclui créditos diretos de destaque em categoria.',
        tone: usage.categoryHighlightsUsed >= usage.categoryHighlightsLimit && usage.categoryHighlightsLimit > 0 ? 'amber' : 'green',
      },
      {
        key: 'home-highlights',
        label: 'Destaques na Home',
        icon: <Sparkles className="h-4 w-4" strokeWidth={1.7} />,
        used: usage.homeHighlightsUsed,
        limit: usage.homeHighlightsLimit,
        helper: usage.homeHighlightsLimit > 0
          ? `${Math.max(usage.homeHighlightsLimit - usage.homeHighlightsUsed, 0)} crédito(s) do plano disponível(is) neste ciclo.`
          : 'Seu plano atual não inclui créditos diretos de destaque na Home.',
        tone: usage.homeHighlightsUsed >= usage.homeHighlightsLimit && usage.homeHighlightsLimit > 0 ? 'amber' : 'green',
      },
      {
        key: 'booster-category',
        label: 'Booster categoria',
        icon: <Package className="h-4 w-4" strokeWidth={1.7} />,
        used: usage.categoryHighlightsBoosterRemaining,
        limit: activeBooster?.categoryCredits ?? Math.max(usage.categoryHighlightsBoosterRemaining, 1),
        helper: usage.categoryHighlightsBoosterRemaining > 0
          ? `Saldo extra atual: ${usage.categoryHighlightsBoosterRemaining} crédito(s) de booster em categoria.`
          : 'Sem saldo extra de booster em categoria no momento.',
        tone: usage.categoryHighlightsBoosterRemaining > 0 ? 'green' : 'slate',
        displayAsBalance: true,
      },
      {
        key: 'booster-home',
        label: 'Booster Home',
        icon: <Package className="h-4 w-4" strokeWidth={1.7} />,
        used: usage.homeHighlightsBoosterRemaining,
        limit: activeBooster?.homeCredits ?? Math.max(usage.homeHighlightsBoosterRemaining, 1),
        helper: usage.homeHighlightsBoosterRemaining > 0
          ? `Saldo extra atual: ${usage.homeHighlightsBoosterRemaining} crédito(s) de booster na Home.`
          : 'Sem saldo extra de booster na Home no momento.',
        tone: usage.homeHighlightsBoosterRemaining > 0 ? 'green' : 'slate',
        displayAsBalance: true,
      },
      {
        key: 'booster-window',
        label: 'Janela de compra de booster',
        icon: <Inbox className="h-4 w-4" strokeWidth={1.7} />,
        used: boosterSummary.purchasesLast30Days,
        limit: activeBooster?.maxPurchasesPer30Days ?? 2,
        helper: boosterSummary.canPurchase
          ? `${Math.max((activeBooster?.maxPurchasesPer30Days ?? 2) - boosterSummary.purchasesLast30Days, 0)} compra(s) restante(s) nos últimos 30 dias.`
          : 'Limite de compras de booster atingido nos últimos 30 dias.',
        tone: boosterSummary.canPurchase ? 'green' : 'amber',
      },
    ] as const;

    const planFeatureItems = [
      {
        label: 'Selo verificado',
        enabled: Boolean(currentPlan?.has_verification_badge),
        helper: currentPlan?.has_verification_badge
          ? 'Seu plano habilita a validação documental e o selo no perfil.'
          : 'Disponível a partir dos planos que incluem validação documental.',
      },
      {
        label: 'Loja parceira',
        enabled: Boolean(currentPlan?.has_seller_store),
        helper: currentPlan?.has_seller_store
          ? 'Sua conta pode operar uma vitrine própria dentro da plataforma.'
          : 'Faça upgrade para liberar uma página de loja parceira.',
      },
      {
        label: 'E-mail marketing',
        enabled: Boolean(currentPlan?.has_email_marketing),
        helper: currentPlan?.has_email_marketing
          ? 'Seu plano inclui campanhas e comunicações promocionais.'
          : 'Esse recurso não está disponível no plano atual.',
      },
      {
        label: 'Inteligência comercial',
        enabled: Boolean(currentPlan?.has_commercial_intelligence),
        helper: currentPlan?.has_commercial_intelligence
          ? `${currentPlan?.commercial_intelligence_requests_per_month || 0} consulta(s) comercial(is) disponível(is) por mês.`
          : 'Disponível nos planos com módulo de inteligência comercial.',
      },
    ];

    if (subscriptionLoading) {
      return (
        <div className="space-y-6">
          <div className="animate-pulse rounded-[24px] border border-slate-200 bg-white p-6 shadow-[0_22px_60px_-40px_rgba(15,23,42,0.3)]">
            <div className="h-4 w-32 rounded bg-slate-100" />
            <div className="mt-4 h-8 w-52 rounded bg-slate-100" />
            <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="h-28 rounded-2xl bg-slate-100" />
              <div className="h-28 rounded-2xl bg-slate-100" />
            </div>
          </div>
        </div>
      );
    }

    if (!currentPlan || !subscription) {
      return (
        <div className="space-y-6">
          <section className="rounded-[24px] border border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] p-6 shadow-[0_22px_60px_-40px_rgba(15,23,42,0.3)]">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Meu Plano</p>
            <h3 className="mt-2 text-2xl font-bold text-slate-900">Nenhum plano ativo no momento</h3>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
              Quando você contratar um plano, esta área vai mostrar capacidade, créditos e recursos liberados na sua conta.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => navigate('/minha-conta/financeiro')}
                className="inline-flex h-11 items-center justify-center rounded-2xl bg-green-700 px-5 text-sm font-semibold text-white shadow-[0_18px_30px_-20px_rgba(22,163,74,0.75)] transition hover:bg-green-800"
              >
                Ver planos e cobrança
              </button>
              <button
                type="button"
                onClick={() => navigate('/planos')}
                className="inline-flex h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Abrir tabela pública
              </button>
            </div>
          </section>
        </div>
      );
    }

    return (
      <div className="space-y-6">
        <section className="rounded-[24px] border border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] p-6 shadow-[0_22px_60px_-40px_rgba(15,23,42,0.3)]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Meu Plano</p>
              <h3 className="mt-2 text-2xl font-bold text-slate-900">{currentPlan.name}</h3>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">
                  {isOneTimePlan ? 'Cobrança avulsa' : 'Cobrança recorrente'}
                </span>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">
                  Válido até {formatCycleBoundaryDate(subscription.current_period_end)}
                </span>
                {subscription.source === 'promotion' || subscription.promotion_code_id ? (
                  <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
                    Período promocional
                  </span>
                ) : null}
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => navigate('/minha-conta/financeiro')}
                className="inline-flex h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Ver cobrança
              </button>
              <button
                type="button"
                onClick={() => navigate('/minha-conta/financeiro')}
                className="inline-flex h-11 items-center justify-center rounded-2xl bg-green-700 px-5 text-sm font-semibold text-white shadow-[0_18px_30px_-20px_rgba(22,163,74,0.75)] transition hover:bg-green-800"
              >
                Alterar plano
              </button>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-[20px] border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Status</p>
              <p className="mt-2 text-lg font-semibold text-slate-900">{hasActivePlan ? 'Ativo' : 'Expirado'}</p>
            </div>
            <div className="rounded-[20px] border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Anúncios ativos</p>
              <p className="mt-2 text-lg font-semibold text-slate-900">
                {usage.adsUsed}
                {usage.adsLimit !== null && usage.adsLimit !== undefined ? ` / ${usage.adsLimit}` : ' / ilimitado'}
              </p>
            </div>
            <div className="rounded-[20px] border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Vigência atual</p>
              <p className="mt-2 text-lg font-semibold text-slate-900">{formatCycleBoundaryDate(subscription.current_period_end)}</p>
            </div>
            <div className="rounded-[20px] border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Janela de leads</p>
              <p className="mt-2 text-lg font-semibold text-slate-900">
                {effectiveLeadContactLimitDays ? `${effectiveLeadContactLimitDays} dias` : 'Não informado'}
              </p>
            </div>
          </div>
        </section>

        {adLimitExceeded ? (
          <section className="rounded-[24px] border border-amber-200 bg-[linear-gradient(135deg,#fff7ed_0%,#ffffff_55%,#fef3c7_100%)] p-5 shadow-[0_18px_45px_-38px_rgba(245,158,11,0.22)]">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">Capacidade do plano</p>
            <h4 className="mt-2 text-lg font-semibold text-slate-900">Você está acima do limite do plano atual</h4>
            <p className="mt-2 text-sm leading-6 text-slate-600">{adLimitMessage}</p>
          </section>
        ) : null}

        <section className="rounded-[24px] border border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] p-6 shadow-[0_22px_60px_-40px_rgba(15,23,42,0.3)]">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Capacidade e créditos</p>
              <h3 className="mt-1 text-lg font-semibold text-slate-900">Como o plano está sendo usado agora</h3>
            </div>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">
              {currentPlan.name}
            </span>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-4 xl:grid-cols-2">
            {planUsageItems.map((item) => {
              const tone = toneClasses[item.tone];
              const percentage = getUsagePercentage(item.used, item.limit, item.displayAsBalance);

              return (
                <article key={item.key} className="rounded-[20px] border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex items-start gap-3">
                    <span className={`inline-flex h-9 w-9 items-center justify-center rounded-xl bg-slate-50 ${tone.icon}`}>
                      {item.icon}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-slate-900">{item.label}</p>
                      <p className={`mt-1 text-sm font-semibold ${tone.text}`}>
                        {getUsageText(item.used, item.limit, item.displayAsBalance)}
                      </p>
                    </div>
                  </div>

                  <div className={`mt-4 h-2 overflow-hidden rounded-full ${tone.track}`}>
                    <div
                      className={`h-full rounded-full ${tone.fill}`}
                      style={{ width: `${percentage}%` }}
                    />
                  </div>

                  <p className="mt-3 text-xs leading-5 text-slate-500">{item.helper}</p>
                </article>
              );
            })}
          </div>
        </section>

        <section className="rounded-[24px] border border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] p-6 shadow-[0_22px_60px_-40px_rgba(15,23,42,0.3)]">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Recursos incluídos</p>
          <h3 className="mt-1 text-lg font-semibold text-slate-900">O que o plano libera na sua conta</h3>

          <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
            {planFeatureItems.map((feature) => (
              <div key={feature.label} className="rounded-[20px] border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-start gap-3">
                  <span className={`inline-flex h-9 w-9 items-center justify-center rounded-xl ${feature.enabled ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
                    {feature.enabled ? <CheckCircle2 className="h-4 w-4" strokeWidth={1.8} /> : <AlertCircle className="h-4 w-4" strokeWidth={1.8} />}
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{feature.label}</p>
                    <p className={`mt-1 text-xs font-semibold ${feature.enabled ? 'text-emerald-700' : 'text-slate-500'}`}>
                      {feature.enabled ? 'Disponível neste plano' : 'Não incluso no plano atual'}
                    </p>
                    <p className="mt-2 text-xs leading-5 text-slate-500">{feature.helper}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    );
  };

  const FinanceDashboard = () => {
    const { plansRaw } = usePlans();
    const [isPlanChangePanelOpen, setIsPlanChangePanelOpen] = useState(false);
    const [changingPlanId, setChangingPlanId] = useState<string | null>(null);

    const activeManagedStatuses = new Set(['active', 'trialing', 'past_due']);
    const activePlans = useMemo(
      () =>
        plansRaw
          .filter((plan) => plan.is_active && !plan.is_downgrade_plan)
          .sort((a, b) => a.position - b.position),
      [plansRaw]
    );
    const hasExplicitSignupPlan = useMemo(
      () => activePlans.some((plan) => plan.is_default_signup_plan),
      [activePlans]
    );
    const currentPlanRecord = useMemo(() => {
      if (!subscription?.plan_id) return null;
      return activePlans.find((plan) => plan.id === subscription.plan_id) || null;
    }, [activePlans, subscription?.plan_id]);
    const latestPayment = payments[0] || lastApprovedPayment || null;
    const effectiveBillingCycle = subscription?.billing_cycle === 'yearly' ? 'yearly' : 'monthly';
    const currentBillingModel = (
      subscription?.billing_model ||
      latestPayment?.billingModel ||
      currentPlanRecord?.billing_model ||
      'one_time'
    ) as 'one_time' | 'recurring';
    const isCurrentPlanRecurring = currentBillingModel === 'recurring';
    const hasActiveManagedPlan = Boolean(
      subscription &&
        activeManagedStatuses.has(subscription.status) &&
        (!subscription.current_period_end || new Date(subscription.current_period_end).getTime() > Date.now())
    );
    const hasActiveRecurringSubscription = hasActiveManagedPlan && isCurrentPlanRecurring;
    const paymentFeedback = new URLSearchParams(location.search).get('payment');
    const planName =
      currentPlanRecord?.name ||
      subscription?.plans?.name ||
      latestPayment?.planName ||
      latestPayment?.itemName ||
      'Sem plano ativo';

    const formatCurrency = (value: number, currency = 'BRL') =>
      new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency,
      }).format(value || 0);

    const formatDateTime = (value?: string | null) => {
      if (!value) return 'Não disponível';
      return new Date(value).toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    };

    const renewalDate = subscription?.current_period_end
      ? formatDateTime(subscription.current_period_end)
      : 'Não disponível';

    const currentRenewalAmount =
      latestPayment?.amount ||
      (currentPlanRecord
        ? effectiveBillingCycle === 'yearly'
          ? calculateYearlyTotal(Number(currentPlanRecord.monthly_price ?? 0), Number(currentPlanRecord.yearly_price ?? 0))
          : Number(currentPlanRecord.monthly_price ?? 0)
        : 0);

    const manageablePlans = useMemo(
      () =>
        activePlans.filter((plan) => {
          if (currentPlanRecord?.id && plan.id === currentPlanRecord.id && hasActiveRecurringSubscription) {
            return false;
          }

          const isSignupPlan = hasExplicitSignupPlan
            ? plan.is_default_signup_plan
            : isLegacySignupPlanName(plan.name || '');

          if (hasActiveManagedPlan && isSignupPlan) return false;

          return true;
        }),
      [activePlans, currentPlanRecord?.id, hasExplicitSignupPlan, hasActiveManagedPlan, hasActiveRecurringSubscription]
    );

    const paymentStatusLabel: Record<PaymentRecord['status'], string> = {
      pending: 'Pendente',
      approved: 'Pago',
      paid: 'Pago',
      authorized: 'Autorizado',
      in_process: 'Em análise',
      in_mediation: 'Em disputa',
      rejected: 'Falhou',
      cancelled: 'Cancelado',
      refunded: 'Estornado',
      chargeback: 'Chargeback',
      expired: 'Expirado',
      unknown: 'Indefinido',
    };

    const paymentStatusClass: Record<PaymentRecord['status'], string> = {
      pending: 'bg-amber-50 text-amber-700',
      approved: 'bg-emerald-50 text-emerald-700',
      paid: 'bg-emerald-50 text-emerald-700',
      authorized: 'bg-sky-50 text-sky-700',
      in_process: 'bg-slate-100 text-slate-700',
      in_mediation: 'bg-orange-50 text-orange-700',
      rejected: 'bg-rose-50 text-rose-700',
      cancelled: 'bg-slate-100 text-slate-600',
      refunded: 'bg-slate-100 text-slate-600',
      chargeback: 'bg-rose-50 text-rose-700',
      expired: 'bg-slate-100 text-slate-600',
      unknown: 'bg-slate-100 text-slate-600',
    };

    const fiscalStatusLabel: Record<string, string> = {
      issued: 'Emitida',
      processing: 'Em emissão',
      failed: 'Falha',
      not_requested: 'Não aplicável',
      queued: 'Na fila',
      manual: 'Manual',
    };

    const fiscalStatusClass: Record<string, string> = {
      issued: 'bg-emerald-50 text-emerald-700',
      processing: 'bg-amber-50 text-amber-700',
      failed: 'bg-rose-50 text-rose-700',
      not_requested: 'bg-slate-100 text-slate-600',
      queued: 'bg-sky-50 text-sky-700',
      manual: 'bg-violet-50 text-violet-700',
    };

    const openUrl = (url?: string | null) => {
      if (!url) {
        toast.error('Link indisponível.');
        return;
      }

      window.open(url, '_blank', 'noopener,noreferrer');
    };

    const downloadReceipt = (payment: PaymentRecord) => {
      if (payment.receiptUrl) {
        openUrl(payment.receiptUrl);
        return;
      }

      if (payment.invoicePdfUrl) {
        openUrl(payment.invoicePdfUrl);
        return;
      }

      toast.error('Nenhum comprovante disponível para este pagamento.');
    };

    const getPlanCheckoutVerb = (plan: (typeof activePlans)[number]) =>
      plan.billing_model === 'recurring' ? 'Contratar' : 'Comprar';

    const getPlanPriceSuffix = (plan: (typeof activePlans)[number]) => {
      if (plan.billing_model === 'recurring') {
        return effectiveBillingCycle === 'yearly' ? '/ano' : '/mês';
      }

      return effectiveBillingCycle === 'yearly' ? '/vigência anual' : '/vigência mensal';
    };

    const getPaymentKindLabel = (payment: PaymentRecord) => {
      if (payment.itemType === 'booster') {
        return 'Compra avulsa';
      }

      if (payment.billingModel === 'recurring') {
        return payment.billingCycle === 'yearly' ? 'Plano com cobrança recorrente anual' : 'Plano com cobrança recorrente mensal';
      }

      return payment.billingCycle === 'yearly' ? 'Compra avulsa anual' : 'Compra avulsa mensal';
    };

    const getManagedPlanActionLabel = (plan: (typeof activePlans)[number]) => {
      if (isCustomPlan(plan.name)) {
        return 'Falar com comercial';
      }

      if (!hasActiveManagedPlan) {
        return `${getPlanCheckoutVerb(plan)} ${effectiveBillingCycle === 'yearly' ? 'Anual' : 'Mensal'}`;
      }

      if (!currentPlanRecord) {
        return 'Solicitar ajuste';
      }

      if (isCurrentPlanRecurring) {
        return plan.position > currentPlanRecord.position ? 'Solicitar upgrade' : 'Solicitar downgrade';
      }

      if (currentPlanRecord.id === plan.id && subscription?.billing_cycle === effectiveBillingCycle) {
        return 'Comprar novamente agora';
      }

      return 'Trocar agora';
    };

    const getManagedPlanSupportText = (plan: (typeof activePlans)[number]) => {
      if (isCustomPlan(plan.name)) {
        return 'Plano com atendimento consultivo. Fale com a equipe para receber a proposta adequada.';
      }

      if (!hasActiveRecurringSubscription) {
        return `Nova contratação com cobrança ${effectiveBillingCycle === 'yearly' ? 'anual' : 'mensal'} via Asaas.`;
      }

      return 'Ajustes em planos com cobrança recorrente em andamento são tratados pela equipe para evitar cobranças duplicadas.';
    };

    const getManagedPlanSupportTextResolved = (plan: (typeof activePlans)[number]) => {
      if (isCustomPlan(plan.name)) {
        return 'Plano com atendimento consultivo. Fale com a equipe para receber a proposta adequada.';
      }

      if (!hasActiveManagedPlan) {
        return plan.billing_model === 'recurring'
          ? `Nova contratação com cobrança ${effectiveBillingCycle === 'yearly' ? 'anual' : 'mensal'} via Asaas.`
          : `Compra avulsa com vigência ${effectiveBillingCycle === 'yearly' ? 'anual' : 'mensal'} via Asaas.`;
      }

      if (!isCurrentPlanRecurring) {
        return 'Sua conta já possui um plano avulso vigente. Se precisar trocar antes do vencimento, fale com a equipe para evitar sobreposição de vigência.';
      }

      return 'Ajustes em planos com cobrança recorrente em andamento são tratados pela equipe para evitar cobranças duplicadas.';
    };

    const getManagedPlanSupportTextResolvedSafe = (plan: (typeof activePlans)[number]) => {
      if (isCustomPlan(plan.name)) {
        return 'Plano com atendimento consultivo. Fale com a equipe para receber a proposta adequada.';
      }

      if (!hasActiveManagedPlan) {
        return plan.billing_model === 'recurring'
          ? `Nova contratação com cobrança ${effectiveBillingCycle === 'yearly' ? 'anual' : 'mensal'} via Asaas.`
          : `Compra avulsa com vigência ${effectiveBillingCycle === 'yearly' ? 'anual' : 'mensal'} via Asaas.`;
      }

      if (!isCurrentPlanRecurring) {
        if (currentPlanRecord?.id === plan.id && subscription?.billing_cycle === effectiveBillingCycle) {
          return 'Uma nova compra renova a vigência imediatamente e soma os créditos remanescentes de destaque ao novo pacote do mesmo plano.';
        }

        return 'Ao comprar este plano agora, ele substitui o plano atual imediatamente. Os créditos remanescentes de destaque em Categoria e Home são preservados e somados ao novo plano.';
      }

      return 'Ajustes em planos com cobrança recorrente em andamento ainda são tratados pela equipe para evitar cobranças duplicadas.';
    };

    const handleManagedPlanActionResolved = async (plan: (typeof activePlans)[number]) => {
      if (isCustomPlan(plan.name)) {
        window.open(getCustomPlanContactLink(plan.name), '_blank', 'noopener,noreferrer');
        return;
      }

      if (!user?.id) {
        toast.error('Faça login para continuar.');
        return;
      }

      if (hasActiveManagedPlan && isCurrentPlanRecurring) {
        sonnerToast.message(
          isCurrentPlanRecurring
            ? 'Upgrades, downgrades e cancelamentos de planos com cobrança recorrente em andamento são conduzidos pela equipe para evitar duplicidade de cobrança.'
            : 'Sua conta já possui um plano avulso vigente. Para ajustar o plano antes do vencimento, fale com a equipe.'
        );
        navigate('/minha-conta/ajuda');
        return;
      }

      return handleManagedPlanAction(plan);
    };

    const handleManagedPlanAction = async (plan: (typeof activePlans)[number]) => {
      if (isCustomPlan(plan.name)) {
        window.open(getCustomPlanContactLink(plan.name), '_blank', 'noopener,noreferrer');
        return;
      }

      if (!user?.id) {
        toast.error('Faça login para continuar.');
        return;
      }

      if (hasActiveRecurringSubscription) {
        sonnerToast.message('Upgrades, downgrades e cancelamentos de planos com cobrança recorrente em andamento são conduzidos pela equipe para evitar duplicidade de cobrança.');
        navigate('/minha-conta/ajuda');
        return;
      }

      setChangingPlanId(plan.id);

      try {
        const amount =
          effectiveBillingCycle === 'yearly'
            ? calculateYearlyTotal(Number(plan.monthly_price ?? 0), Number(plan.yearly_price ?? 0))
            : Number(plan.monthly_price ?? 0);

        const result = await initiatePlatformPlanCheckout({
          planId: plan.id,
          planName: plan.name,
          planDescription: plan.description || `Plano ${plan.name}`,
          billingCycle: effectiveBillingCycle,
          amount,
          userId: user.id,
        });

        if (!result.success) {
          toast.error(result.error || 'Não foi possível iniciar o checkout via Asaas.');
          return;
        }

        toast.success('Redirecionando para o checkout Asaas...');
      } catch (error: any) {
        appError('[FinanceDashboard] erro ao processar checkout Asaas', error, {
          userId: user.id,
          targetPlanId: plan.id,
        });
        toast.error(error?.message || 'Erro ao processar a contratação.');
      } finally {
        setChangingPlanId(null);
      }
    };

    return (
      <div className="space-y-6">
        {paymentFeedback === 'success' ? (
          <div className="rounded-[24px] border border-emerald-200 bg-[linear-gradient(135deg,#f0fdf4_0%,#ffffff_50%,#dcfce7_100%)] p-5 shadow-[0_18px_45px_-38px_rgba(34,197,94,0.28)]">
            <div className="flex flex-col gap-2">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">Pagamento confirmado</p>
              <h3 className="text-lg font-semibold text-slate-900">Recebemos a confirmação do checkout.</h3>
              <p className="text-sm text-slate-600">
                O histórico financeiro já foi atualizado. Se o plano ainda estiver exibindo dados antigos, atualize a página após alguns segundos.
              </p>
            </div>
          </div>
        ) : null}

        {paymentFeedback === 'pending' ? (
          <div className="rounded-[24px] border border-amber-200 bg-[linear-gradient(135deg,#fffbeb_0%,#ffffff_50%,#fde68a_100%)] p-5 shadow-[0_18px_45px_-38px_rgba(245,158,11,0.28)]">
            <div className="flex flex-col gap-2">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-700">Pagamento pendente</p>
              <h3 className="text-lg font-semibold text-slate-900">A cobrança ainda está aguardando confirmação.</h3>
              <p className="text-sm text-slate-600">
                Você pode acompanhar a compensação e os documentos fiscais no histórico financeiro desta página.
              </p>
            </div>
          </div>
        ) : null}

        {paymentFeedback === 'failure' ? (
          <div className="rounded-[24px] border border-rose-200 bg-[linear-gradient(135deg,#fff1f2_0%,#ffffff_55%,#fecdd3_100%)] p-5 shadow-[0_18px_45px_-38px_rgba(244,63,94,0.25)]">
            <div className="flex flex-col gap-2">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-rose-700">Pagamento não concluído</p>
              <h3 className="text-lg font-semibold text-slate-900">Não conseguimos confirmar essa cobrança.</h3>
              <p className="text-sm text-slate-600">
                Tente novamente ou entre em contato com a equipe caso precise de suporte para finalizar a contratação.
              </p>
            </div>
          </div>
        ) : null}

        {paymentFeedback === 'cancelled' ? (
          <div className="rounded-[24px] border border-slate-200 bg-[linear-gradient(135deg,#f8fafc_0%,#ffffff_55%,#e2e8f0_100%)] p-5 shadow-[0_18px_45px_-38px_rgba(15,23,42,0.18)]">
            <div className="flex flex-col gap-2">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Checkout cancelado</p>
              <h3 className="text-lg font-semibold text-slate-900">A contratação não foi alterada.</h3>
              <p className="text-sm text-slate-600">
                Você pode retomar a contratação quando quiser a partir desta mesma tela.
              </p>
            </div>
          </div>
        ) : null}

        {isCurrentPlanRecurring && hasActiveManagedPlan ? (
          <div className="rounded-[24px] border border-sky-200 bg-[linear-gradient(135deg,#eff6ff_0%,#ffffff_60%,#dbeafe_100%)] p-5 shadow-[0_18px_45px_-38px_rgba(59,130,246,0.24)]">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="max-w-2xl">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-700">Gestão do plano</p>
                <h3 className="text-lg font-semibold text-slate-900">Seu plano com cobrança recorrente já está ativo</h3>
                <p className="mt-1 text-sm text-slate-600">
                  Upgrades, downgrades e cancelamentos de planos com cobrança recorrente em andamento seguem intermediados pela equipe para evitar duplicidade de cobrança. Toda a gestão continua centralizada aqui em Financeiro.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => navigate('/minha-conta/ajuda')}
                  className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
                >
                  Abrir Central de Ajuda
                </button>
                <button
                  type="button"
                  onClick={() => window.location.assign('/planos')}
                  className="inline-flex h-10 items-center justify-center rounded-xl bg-green-700 px-4 text-sm font-semibold text-white shadow-[0_18px_30px_-20px_rgba(22,163,74,0.75)] transition hover:bg-green-800"
                >
                  Ver tabela pública de planos
                </button>
              </div>
            </div>
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <section className="rounded-[24px] border border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] p-6 shadow-[0_22px_60px_-40px_rgba(15,23,42,0.3)]">
            <div className="flex items-start gap-4">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-green-700/10 text-green-700 shadow-sm">
                <CreditCard className="w-5 h-5" strokeWidth={1.5} />
              </div>
              <div className="flex-1">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Resumo do plano</p>
                <h3 className="mt-1 text-lg font-semibold text-slate-900">{planName}</h3>
                <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Contratado em</p>
                    <p className="mt-1 text-sm font-medium text-slate-900">
                      {subscription?.created_at ? formatDateTime(subscription.created_at) : 'Não disponível'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Ciclo da contratação</p>
                    <p className="mt-1 text-sm font-medium text-slate-900">
                      {effectiveBillingCycle === 'yearly' ? 'Anual' : 'Mensal'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Status</p>
                    <p className="mt-1 text-sm font-medium text-slate-900">
                      {hasActiveManagedPlan ? 'Ativo' : 'Sem plano ativo'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Documentos fiscais</p>
                    <p className="mt-1 text-sm font-medium text-slate-900">
                      {availableInvoicesCount} disponível(is) · {pendingFiscalDocumentsCount} em emissão
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-[24px] border border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] p-6 shadow-[0_22px_60px_-40px_rgba(15,23,42,0.3)]">
            <div className="flex items-start gap-4">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-900/5 text-slate-700 shadow-sm">
                <Receipt className="w-5 h-5" strokeWidth={1.5} />
              </div>
              <div className="flex-1">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  {isCurrentPlanRecurring ? 'Dados do próximo ciclo' : 'Dados de vigência'}
                </p>
                <h3 className="mt-1 text-lg font-semibold text-slate-900">
                  {isCurrentPlanRecurring ? 'Próximo ciclo' : 'Plano válido até'}
                </h3>
                <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Data</p>
                    <p className="mt-1 text-sm font-medium text-slate-900">{renewalDate}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                      {isCurrentPlanRecurring ? 'Valor do próximo ciclo' : 'Valor da compra'}
                    </p>
                    <p className="mt-1 text-sm font-medium text-slate-900">
                      {currentRenewalAmount > 0 ? formatCurrency(currentRenewalAmount, latestPayment?.currency || 'BRL') : 'Não disponível'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Método de pagamento</p>
                    <p className="mt-1 text-sm font-medium text-slate-900">
                      {latestPayment?.paymentMethod || (latestPayment?.provider === 'asaas' ? 'Checkout Asaas' : 'Não informado')}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                      Último pagamento
                    </p>
                    <p className="mt-1 text-sm font-medium text-slate-900">
                      {latestPayment ? paymentStatusLabel[latestPayment.status] : 'Sem registro'}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>

        <section className="rounded-[24px] border border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] p-6 shadow-[0_22px_60px_-40px_rgba(15,23,42,0.3)]">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Alterar plano</p>
              <h3 className="text-lg font-semibold text-slate-900">
                {hasActiveManagedPlan ? 'Solicitações de ajuste do plano atual' : 'Contratar outro plano'}
              </h3>
            </div>
            <p className="max-w-2xl text-sm text-slate-500">
              {hasActiveManagedPlan
                ? isCurrentPlanRecurring
                  ? 'Os botões abaixo deixam a alteração solicitada a partir desta própria tela. A equipe fecha o ajuste para evitar conflito de cobrança em planos com cobrança recorrente em andamento.'
                  : 'Enquanto o plano avulso atual estiver vigente, novas compras ficam bloqueadas para evitar sobreposição. Se precisar trocar antes do vencimento, fale com a equipe.'
                : 'Se você ainda não possui plano ativo, a contratação é iniciada diretamente pelo checkout hospedado do Asaas.'}
            </p>
          </div>

          <div className="mt-4">
            <button
              type="button"
              onClick={() => setIsPlanChangePanelOpen((current) => !current)}
              className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              {isPlanChangePanelOpen ? 'Ocultar opções de plano' : 'Alterar plano'}
            </button>
          </div>

          {isPlanChangePanelOpen && (
            manageablePlans.length === 0 ? (
              <div className="mt-5 rounded-[20px] border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-500">
                Nenhum outro plano ativo está disponível para alteração no momento.
              </div>
            ) : (
              <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
                {manageablePlans.map((plan) => {
                  const displayPrice =
                    effectiveBillingCycle === 'yearly'
                      ? calculateYearlyTotal(Number(plan.monthly_price ?? 0), Number(plan.yearly_price ?? 0))
                      : Number(plan.monthly_price ?? 0);

                  return (
                    <div
                      key={plan.id}
                      className="rounded-[22px] border border-slate-200 bg-white p-5 shadow-sm"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                            {plan.card_eyebrow?.trim() || 'Plano BWAGRO'}
                          </p>
                          <h4 className="mt-2 text-lg font-semibold text-slate-900">{plan.name}</h4>
                          <p className="mt-1 text-sm text-slate-600">
                            {plan.description || 'Plano disponível para ajuste do seu plano atual.'}
                          </p>
                        </div>
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">
                          {effectiveBillingCycle === 'yearly' ? 'Ciclo anual' : 'Ciclo mensal'}
                        </span>
                      </div>

                      <div className="mt-4 flex items-end gap-2">
                        <span className="text-2xl font-bold text-slate-900">{formatCurrency(displayPrice)}</span>
                        <span className="pb-0.5 text-sm text-slate-500">
                          {getPlanPriceSuffix(plan)}
                        </span>
                      </div>

                      <p className="mt-3 text-sm text-slate-500">{getManagedPlanSupportTextResolvedSafe(plan)}</p>

                      <div className="mt-4 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => void handleManagedPlanActionResolved(plan)}
                          disabled={Boolean(changingPlanId)}
                          className="inline-flex h-10 items-center justify-center rounded-xl bg-green-700 px-4 text-sm font-semibold text-white shadow-[0_18px_30px_-20px_rgba(22,163,74,0.75)] transition hover:bg-green-800 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {changingPlanId === plan.id ? 'Processando...' : getManagedPlanActionLabel(plan)}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          )}
        </section>

        <section className="overflow-hidden rounded-[24px] border border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] shadow-[0_22px_60px_-40px_rgba(15,23,42,0.3)]">
          <div className="flex flex-col gap-2 border-b border-slate-100 px-6 py-5 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Histórico financeiro</p>
              <h3 className="text-lg font-semibold text-slate-900">Pagamentos e renovações</h3>
            </div>
            <p className="text-sm text-slate-500">
              Consulte status, comprovantes e documentos fiscais de cada cobrança.
            </p>
          </div>

          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr className="text-left text-slate-500">
                  <th className="px-6 py-3 font-semibold">Item</th>
                  <th className="px-6 py-3 font-semibold">Data</th>
                  <th className="px-6 py-3 font-semibold">Valor</th>
                  <th className="px-6 py-3 font-semibold">Status</th>
                  <th className="px-6 py-3 font-semibold">Fiscal</th>
                  <th className="px-6 py-3 font-semibold text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paymentsLoading ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-8 text-center text-sm text-slate-500">
                      Carregando pagamentos...
                    </td>
                  </tr>
                ) : payments.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-8 text-center text-sm text-slate-500">
                      Nenhum pagamento encontrado.
                    </td>
                  </tr>
                ) : (
                  payments.map((payment) => (
                    <tr key={payment.id} className="text-slate-700">
                      <td className="px-6 py-4">
                        <div>
                          <p className="font-semibold text-slate-900">
                            {payment.itemName || payment.planName || payment.description || 'Plano BWAGRO'}
                          </p>
                          <p className="text-xs text-slate-500">
                            {getPaymentKindLabel(payment)}
                          </p>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-slate-500">{formatDateTime(payment.paidAt || payment.createdAt)}</td>
                      <td className="px-6 py-4 font-semibold text-slate-900">
                        {formatCurrency(payment.amount, payment.currency)}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${paymentStatusClass[payment.status]}`}>
                          {paymentStatusLabel[payment.status]}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${fiscalStatusClass[payment.invoiceStatus] || 'bg-slate-100 text-slate-600'}`}>
                          {fiscalStatusLabel[payment.invoiceStatus] || 'Não aplicável'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => downloadReceipt(payment)}
                            disabled={!payment.receiptUrl && !payment.invoicePdfUrl}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-slate-500"
                            title={!payment.receiptUrl && !payment.invoicePdfUrl ? 'Comprovante indisponível' : 'Baixar comprovante'}
                          >
                            <Download className="h-4 w-4" strokeWidth={1.5} />
                          </button>
                          <button
                            onClick={() => openUrl(payment.invoicePdfUrl)}
                            disabled={!payment.invoicePdfUrl}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-slate-50 hover:text-green-700 disabled:cursor-not-allowed disabled:opacity-40"
                            title="Abrir nota fiscal"
                          >
                            <ExternalLink className="h-4 w-4" strokeWidth={1.5} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="space-y-3 p-4 md:hidden">
            {paymentsLoading ? (
              <div className="py-4 text-center text-xs text-slate-500">Carregando pagamentos...</div>
            ) : payments.length === 0 ? (
              <div className="py-4 text-center text-xs text-slate-500">Nenhum pagamento encontrado.</div>
            ) : (
              payments.map((payment) => (
                <div key={payment.id} className="space-y-3 rounded-2xl border border-slate-200 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">
                        {payment.itemName || payment.planName || payment.description || 'Plano BWAGRO'}
                      </p>
                      <p className="text-xs text-slate-500">{formatDateTime(payment.paidAt || payment.createdAt)}</p>
                    </div>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${paymentStatusClass[payment.status]}`}>
                      {paymentStatusLabel[payment.status]}
                    </span>
                  </div>
                  <p className="text-sm font-semibold text-slate-900">
                    {formatCurrency(payment.amount, payment.currency)}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => downloadReceipt(payment)}
                      disabled={!payment.receiptUrl && !payment.invoicePdfUrl}
                      title={!payment.receiptUrl && !payment.invoicePdfUrl ? 'Comprovante indisponível' : undefined}
                      className="h-9 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Comprovante
                    </button>
                    <button
                      onClick={() => openUrl(payment.invoicePdfUrl)}
                      disabled={!payment.invoicePdfUrl}
                      className="h-9 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {payment.invoicePdfUrl ? 'Nota fiscal' : 'NF pendente'}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    );
  };
  const ProfileDashboard = () => {
    const userName = user?.name || user?.email || 'Usuário';
    const userCity = user?.location || 'Localização não informada';
    const [isSavingProfile, setIsSavingProfile] = useState(false);
    const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
    const [profileForm, setProfileForm] = useState({
      name: '',
      businessDescription: '',
      whatsapp: '',
      cep: '',
      logradouro: '',
      numero: '',
      complemento: '',
      bairro: '',
      cidade: '',
      estado: '',
    });
    const [passwordForm, setPasswordForm] = useState({
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    });
    const [selectedProfileTab, setSelectedProfileTab] = usePersistentState<'identity' | 'contact' | 'security' | 'verification'>(
      'user-dashboard-profile-tab',
      'identity'
    );
    const [latestVerificationNotification, setLatestVerificationNotification] = useState<Notification | null>(null);
    const [profileErrors, setProfileErrors] = useState<Record<string, string>>({});
    const [isLoadingCep, setIsLoadingCep] = useState(false);
    const lastLookedUpCepRef = useRef('');

    // Calcular percentual de preenchimento do perfil
    const calculateProfileCompletion = () => {
      const requiredFields = ['name', 'whatsapp', 'cep', 'logradouro', 'numero', 'bairro', 'cidade', 'estado'];
      const filledFields = requiredFields.filter((field) => profileForm[field as keyof typeof profileForm]?.trim());
      return Math.round((filledFields.length / requiredFields.length) * 100);
    };

    const profileCompletion = calculateProfileCompletion();
    const isProfileComplete = profileCompletion === 100;

    // Status de cada seção
    const getSectionStatus = (section: 'identity' | 'contact' | 'security' | 'verification') => {
      switch (section) {
        case 'identity':
          return profileForm.name?.trim() && profileForm.businessDescription?.trim() ? 'complete' : 'incomplete';
        case 'contact':
          return profileForm.whatsapp?.trim() && profileForm.cep?.trim() && profileForm.cidade?.trim() ? 'complete' : 'incomplete';
        case 'security':
          return 'neutral';
        case 'verification':
          return user?.document_verified ? 'complete' : 'incomplete';
      }
    };

    useEffect(() => {
      setProfileForm({
        name: user?.name || '',
        businessDescription: user?.business_description || '',
        whatsapp: user?.phone || '',
        cep: user?.cep || '',
        logradouro: user?.logradouro || '',
        numero: user?.numero || '',
        complemento: user?.complemento || '',
        bairro: user?.bairro || '',
        cidade: user?.cidade || '',
        estado: user?.estado || '',
      });
    }, [
      user?.name,
      user?.business_description,
      user?.phone,
      user?.cep,
      user?.logradouro,
      user?.numero,
      user?.complemento,
      user?.bairro,
      user?.cidade,
      user?.estado,
    ]);

    useEffect(() => {
      let isActive = true;

      const loadLatestVerificationNotification = async () => {
        if (!user?.id) {
          if (isActive) setLatestVerificationNotification(null);
          return;
        }

        const { data, error } = await supabase
          .from('notifications')
          .select('id,type,title,content,created_at,is_read,link')
          .eq('user_id', user.id)
          .eq('type', 'account_verification')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (error) {
          appWarn('[Profile] Nao foi possivel carregar a ultima notificacao de verificacao', {
            userId: user.id,
            error,
          });
          return;
        }

        if (!isActive) return;

        setLatestVerificationNotification(
          data
            ? {
                id: data.id,
                type: data.type,
                title: data.title,
                content: data.content,
                timestamp: data.created_at,
                isRead: data.is_read,
                link: data.link || undefined,
              }
            : null
        );
      };

      void loadLatestVerificationNotification();

      return () => {
        isActive = false;
      };
    }, [user?.id, user?.document_review_status, user?.document_reviewed_at, user?.document_last_failure_reason]);

    const handleProfileFieldChange = (field: keyof typeof profileForm, value: string) => {
      const normalizedValue = field === 'cep'
        ? value.replace(/\D/g, '').slice(0, 8).replace(/^(\d{5})(\d{0,3}).*/, (_, first, second) => second ? `${first}-${second}` : first)
        : field === 'businessDescription'
          ? value.slice(0, MAX_BUSINESS_DESCRIPTION_LENGTH)
          : value;

      if (field === 'cep' && normalizedValue.replace(/\D/g, '').length < 8) {
        lastLookedUpCepRef.current = '';
      }

      setProfileForm((prev) => ({
        ...prev,
        [field]: normalizedValue,
      }));
      setProfileErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        if (field === 'businessDescription') {
          const descriptionError = getBusinessDescriptionValidationError(normalizedValue);
          if (descriptionError) {
            next.businessDescription = descriptionError;
          }
        }
        return next;
      });

      if (field === 'cep') {
        const cleanCep = normalizedValue.replace(/\D/g, '');
        if (cleanCep.length === 8 && cleanCep !== lastLookedUpCepRef.current) {
          void lookupCep(cleanCep);
        }
      }
    };

    const handlePasswordFieldChange = (field: keyof typeof passwordForm, value: string) => {
      setPasswordForm((prev) => ({
        ...prev,
        [field]: value,
      }));
    };

    const resetPasswordForm = () => {
      setPasswordForm({
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
      });
    };

    const validatePasswordChange = () => {
      if (!passwordForm.currentPassword || !passwordForm.newPassword || !passwordForm.confirmPassword) {
        sonnerToast.error('Preencha todos os campos de senha para alterar seu acesso');
        return false;
      }

      if (passwordForm.newPassword !== passwordForm.confirmPassword) {
        sonnerToast.error('A nova senha e a confirmacao nao conferem');
        return false;
      }

      if (passwordForm.newPassword.length < 8) {
        sonnerToast.error('A nova senha deve ter pelo menos 8 caracteres');
        return false;
      }

      if (passwordForm.currentPassword === passwordForm.newPassword) {
        sonnerToast.error('Escolha uma nova senha diferente da senha atual');
        return false;
      }

      return true;
    };

    const lookupCep = async (cleanCep: string) => {
      if (cleanCep.length !== 8 || cleanCep === lastLookedUpCepRef.current) return;

      setIsLoadingCep(true);
      lastLookedUpCepRef.current = cleanCep;

      try {
        const response = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
        const data = await response.json();

        if (data.erro) {
          lastLookedUpCepRef.current = '';
          setProfileErrors((prev) => ({
            ...prev,
            cep: 'CEP não encontrado.',
          }));
          return;
        }

        setProfileForm((prev) => ({
          ...prev,
          cep: cleanCep.replace(/^(\d{5})(\d{3})$/, '$1-$2'),
          logradouro: data.logradouro || prev.logradouro,
          complemento: data.complemento || prev.complemento,
          bairro: data.bairro || prev.bairro,
          cidade: data.localidade || prev.cidade,
          estado: data.uf || prev.estado,
        }));

        setProfileErrors((prev) => {
          const next = { ...prev };
          delete next.cep;
          delete next.logradouro;
          delete next.bairro;
          delete next.cidade;
          delete next.estado;
          return next;
        });
      } catch (error) {
        appError('Erro ao buscar CEP', error, {
          userId: user?.id ?? null,
          cep: cleanCep,
        });
        lastLookedUpCepRef.current = '';
        setProfileErrors((prev) => ({
          ...prev,
          cep: 'Não foi possível consultar o CEP agora.',
        }));
      } finally {
        setIsLoadingCep(false);
      }
    };

    const handleCepBlur = async () => {
      const cleanCep = profileForm.cep.replace(/\D/g, '');
      if (cleanCep.length === 8) {
        await lookupCep(cleanCep);
      }
    };

    const getProfileInputClass = (field?: keyof typeof profileForm) =>
      `h-11 w-full rounded-xl border px-3.5 text-sm shadow-sm transition-colors focus:outline-none focus:ring-2 ${
        field && profileErrors[field]
          ? 'border-red-300 bg-red-50 focus:border-red-300 focus:ring-red-100'
          : 'border-slate-200 bg-white focus:border-green-600 focus:ring-green-100'
      }`;

    const requiredLabelClass = 'text-xs font-semibold text-slate-500 flex items-center gap-1';

    const validateProfileForm = () => {
      const nextErrors: Record<string, string> = {};

      if (!profileForm.name.trim()) nextErrors.name = 'Informe o nome ou razão social.';
      const businessDescriptionError = getBusinessDescriptionValidationError(profileForm.businessDescription);
      if (businessDescriptionError) nextErrors.businessDescription = businessDescriptionError;
      if (!profileForm.whatsapp.trim()) nextErrors.whatsapp = 'Informe um WhatsApp.';
      if (profileForm.cep.replace(/\D/g, '').length !== 8) nextErrors.cep = 'Informe um CEP válido.';
      if (!profileForm.logradouro.trim()) nextErrors.logradouro = 'Informe o logradouro.';
      if (!profileForm.numero.trim()) nextErrors.numero = 'Informe o número.';
      if (!profileForm.bairro.trim()) nextErrors.bairro = 'Informe o bairro.';
      if (!profileForm.cidade.trim()) nextErrors.cidade = 'Informe a cidade.';
      if (!profileForm.estado.trim()) nextErrors.estado = 'Informe o estado.';

      setProfileErrors(nextErrors);
      return Object.keys(nextErrors).length === 0;
    };

    const handleSaveProfile = async () => {
      if (!user?.id || !user?.email) {
        sonnerToast.error('Usuário não autenticado');
        return;
      }

      if (!validateProfileForm()) {
        sonnerToast.error('Preencha os campos obrigatórios do perfil');
        return;
      }

      const normalizedProfile = {
        name: profileForm.name.trim(),
        businessDescription: profileForm.businessDescription.trim(),
        whatsapp: profileForm.whatsapp.trim(),
        cep: profileForm.cep.trim(),
        logradouro: profileForm.logradouro.trim(),
        numero: profileForm.numero.trim(),
        complemento: profileForm.complemento.trim(),
        bairro: profileForm.bairro.trim(),
        cidade: profileForm.cidade.trim(),
        estado: profileForm.estado.trim(),
      };

      const originalProfile = {
        name: user.name?.trim() || '',
        businessDescription: user.business_description?.trim() || '',
        whatsapp: user.phone?.trim() || '',
        cep: user.cep?.trim() || '',
        logradouro: user.logradouro?.trim() || '',
        numero: user.numero?.trim() || '',
        complemento: user.complemento?.trim() || '',
        bairro: user.bairro?.trim() || '',
        cidade: user.cidade?.trim() || '',
        estado: user.estado?.trim() || '',
      };

      const hasProfileChanges = JSON.stringify(normalizedProfile) !== JSON.stringify(originalProfile);
      const wantsPasswordChange = Boolean(
        passwordForm.currentPassword || passwordForm.newPassword || passwordForm.confirmPassword
      );

      if (!hasProfileChanges && !wantsPasswordChange) {
        sonnerToast.info('Nenhuma alteração pendente para salvar');
        return;
      }

      if (wantsPasswordChange) {
        sonnerToast.info('Use o botao "Atualizar senha" na aba Seguranca e acesso para alterar sua senha com seguranca');
      }

      if (!hasProfileChanges) {
        return;
      }

      setIsSavingProfile(true);

      try {
        const location =
          normalizedProfile.cidade && normalizedProfile.estado
            ? `${normalizedProfile.cidade}, ${normalizedProfile.estado}`
            : normalizedProfile.cidade || '';

        const { data: updatedProfile, error: profileError } = await supabase
          .from('users')
          .update({
            name: normalizedProfile.name,
            business_description: normalizedProfile.businessDescription || null,
            phone: normalizedProfile.whatsapp,
            cep: normalizedProfile.cep,
            logradouro: normalizedProfile.logradouro,
            numero: normalizedProfile.numero,
            complemento: normalizedProfile.complemento,
            bairro: normalizedProfile.bairro,
            cidade: normalizedProfile.cidade,
            estado: normalizedProfile.estado,
            location,
          })
          .eq('id', user.id)
          .select('id')
          .maybeSingle();

        if (profileError) {
          throw profileError;
        }

        if (hasProfileChanges && !updatedProfile) {
          throw new Error('Não foi possível confirmar a atualização do perfil');
        }

        const cleanCep = profileForm.cep.replace(/\D/g, '');
        if (cleanCep.length === 8) {
          const geoUpdated = await updateUserCoordinates(user.id, cleanCep, supabase, {
            street: profileForm.logradouro,
            number: profileForm.numero,
            neighborhood: profileForm.bairro,
            city: profileForm.cidade,
            state: profileForm.estado
          });
          if (!geoUpdated) {
            appWarn('[Profile] Não foi possível atualizar coordenadas do usuário após salvar o perfil', {
              userId: user.id,
              cep: cleanCep,
              cidade: profileForm.cidade,
              estado: profileForm.estado,
            });
          }
        }

        await refreshStats();
        sonnerToast.success('Perfil atualizado com sucesso');
      } catch (error) {
        appError('Erro ao salvar perfil', error, {
          userId: user.id,
        });
        const errorMessage =
          error instanceof Error ? error.message : 'Não foi possível salvar as alterações do perfil';
        sonnerToast.error(errorMessage || 'Não foi possível salvar as alterações do perfil');
      } finally {
        setIsSavingProfile(false);
      }
    };

    const handleUpdatePassword = async () => {
      if (!user?.email) {
        sonnerToast.error('Usuario nao autenticado');
        return;
      }

      if (!validatePasswordChange()) {
        return;
      }

      setIsUpdatingPassword(true);

      try {
        const { error: reAuthError } = await supabase.auth.signInWithPassword({
          email: user.email,
          password: passwordForm.currentPassword,
        });

        if (reAuthError) {
          sonnerToast.error('Senha atual incorreta');
          return;
        }

        const { error: passwordError } = await supabase.auth.updateUser({
          password: passwordForm.newPassword,
        });

        if (passwordError) {
          throw passwordError;
        }

        resetPasswordForm();
        sonnerToast.success('Senha atualizada com sucesso');
      } catch (error) {
        appError('Erro ao atualizar senha', error, {
          userId: user.id,
        });
        const errorMessage =
          error instanceof Error ? error.message : 'Nao foi possivel atualizar sua senha';
        sonnerToast.error(errorMessage || 'Nao foi possivel atualizar sua senha');
      } finally {
        setIsUpdatingPassword(false);
      }
    };

    const profileTabs = [
      {
        id: 'identity' as const,
        label: 'Dados principais',
        description: 'Nome, documento e descrição do negócio.',
        icon: <User className="h-4 w-4" strokeWidth={1.5} />,
      },
      {
        id: 'contact' as const,
        label: 'Localização e contato',
        description: 'Endereço, cidade, estado e WhatsApp.',
        icon: <Map className="h-4 w-4" strokeWidth={1.5} />,
      },
      {
        id: 'security' as const,
        label: 'Segurança e acesso',
        description: 'Atualize sua senha de acesso.',
        icon: <ShieldCheck className="h-4 w-4" strokeWidth={1.5} />,
      },
      {
        id: 'verification' as const,
        label: 'Selo verificado',
        description: 'Envio e acompanhamento documental.',
        icon: <FileText className="h-4 w-4" strokeWidth={1.5} />,
      },
    ];

    const identitySection = (
      <ProfileSectionCard
        title="Dados principais"
        description="Atualize a identidade pública exibida no seu painel e nos seus anúncios."
        icon={<User className="h-5 w-5" strokeWidth={1.5} />}
        color="emerald"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className={requiredLabelClass}>Nome / Razão Social <span className="text-red-500">*</span></label>
            <input
              className={getProfileInputClass('name')}
              value={profileForm.name}
              onChange={(event) => handleProfileFieldChange('name', event.target.value)}
            />
            {profileErrors.name && <p className="text-xs text-red-600">{profileErrors.name}</p>}
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-500">CPF / CNPJ</label>
            <input
              className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm shadow-sm"
              value={user?.document || ''}
              readOnly
            />
          </div>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-semibold text-slate-500">Descrição do Negócio</label>
          <textarea
            className={`w-full resize-none rounded-xl border bg-white px-3.5 py-3 text-sm shadow-sm transition-colors focus:outline-none focus:ring-2 ${
              profileErrors.businessDescription
                ? 'border-red-300 bg-red-50 focus:border-red-300 focus:ring-red-100'
                : 'border-slate-200 focus:border-green-600 focus:ring-green-100'
            }`}
            rows={4}
            placeholder="Descreva sua atuação, região e diferencial sem incluir telefone, e-mail, links ou redes sociais."
            value={profileForm.businessDescription}
            onChange={(event) => handleProfileFieldChange('businessDescription', event.target.value)}
          />
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] text-slate-500">
              Esse texto aparece no bloco do vendedor da página do anúncio.
            </p>
            <span className="text-[11px] font-medium text-slate-400">
              {profileForm.businessDescription.length}/{MAX_BUSINESS_DESCRIPTION_LENGTH}
            </span>
          </div>
          {profileErrors.businessDescription && <p className="text-xs text-red-600">{profileErrors.businessDescription}</p>}
        </div>
      </ProfileSectionCard>
    );

    const contactSection = (
      <ProfileSectionCard
        title="Localização e contato"
        description="Mantenha seu endereço e WhatsApp atualizados para acelerar negociações."
        icon={<Map className="h-5 w-5" strokeWidth={1.5} />}
        color="blue"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className={requiredLabelClass}>CEP <span className="text-red-500">*</span></label>
            <input
              className={getProfileInputClass('cep')}
              value={profileForm.cep}
              onChange={(event) => handleProfileFieldChange('cep', event.target.value)}
              onBlur={handleCepBlur}
              placeholder="00000-000"
            />
            {isLoadingCep && <p className="text-xs text-slate-500">Buscando endereço pelo CEP...</p>}
            {profileErrors.cep && <p className="text-xs text-red-600">{profileErrors.cep}</p>}
          </div>
          <div className="space-y-1">
            <label className={requiredLabelClass}>WhatsApp <span className="text-red-500">*</span></label>
            <input
              className={getProfileInputClass('whatsapp')}
              value={profileForm.whatsapp}
              onChange={(event) => handleProfileFieldChange('whatsapp', event.target.value)}
            />
            {profileErrors.whatsapp && <p className="text-xs text-red-600">{profileErrors.whatsapp}</p>}
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1 sm:col-span-2">
            <label className={requiredLabelClass}>Logradouro <span className="text-red-500">*</span></label>
            <input
              className={getProfileInputClass('logradouro')}
              value={profileForm.logradouro}
              onChange={(event) => handleProfileFieldChange('logradouro', event.target.value)}
            />
            {profileErrors.logradouro && <p className="text-xs text-red-600">{profileErrors.logradouro}</p>}
          </div>
          <div className="space-y-1">
            <label className={requiredLabelClass}>Número <span className="text-red-500">*</span></label>
            <input
              className={getProfileInputClass('numero')}
              value={profileForm.numero}
              onChange={(event) => handleProfileFieldChange('numero', event.target.value)}
            />
            {profileErrors.numero && <p className="text-xs text-red-600">{profileErrors.numero}</p>}
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-500">Complemento</label>
            <input
              className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm shadow-sm"
              value={profileForm.complemento}
              onChange={(event) => handleProfileFieldChange('complemento', event.target.value)}
            />
          </div>
          <div className="space-y-1">
            <label className={requiredLabelClass}>Bairro <span className="text-red-500">*</span></label>
            <input
              className={getProfileInputClass('bairro')}
              value={profileForm.bairro}
              onChange={(event) => handleProfileFieldChange('bairro', event.target.value)}
            />
            {profileErrors.bairro && <p className="text-xs text-red-600">{profileErrors.bairro}</p>}
          </div>
          <div className="space-y-1">
            <label className={requiredLabelClass}>Cidade <span className="text-red-500">*</span></label>
            <input
              className={getProfileInputClass('cidade')}
              value={profileForm.cidade}
              onChange={(event) => handleProfileFieldChange('cidade', event.target.value)}
            />
            {profileErrors.cidade && <p className="text-xs text-red-600">{profileErrors.cidade}</p>}
          </div>
          <div className="space-y-1">
            <label className={requiredLabelClass}>Estado <span className="text-red-500">*</span></label>
            <input
              className={getProfileInputClass('estado')}
              value={profileForm.estado}
              onChange={(event) => handleProfileFieldChange('estado', event.target.value)}
            />
            {profileErrors.estado && <p className="text-xs text-red-600">{profileErrors.estado}</p>}
          </div>
        </div>
      </ProfileSectionCard>
    );

    const securitySection = (
      <ProfileSectionCard
        title="Segurança e acesso"
        description="Atualize sua senha sempre que quiser reforçar a proteção da sua conta."
        icon={<ShieldCheck className="h-5 w-5" strokeWidth={1.5} />}
        color="slate"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-500">Senha Atual</label>
            <input
              type="password"
              className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm shadow-sm"
              value={passwordForm.currentPassword}
              onChange={(event) => handlePasswordFieldChange('currentPassword', event.target.value)}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-500">Nova Senha</label>
            <input
              type="password"
              className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm shadow-sm"
              value={passwordForm.newPassword}
              onChange={(event) => handlePasswordFieldChange('newPassword', event.target.value)}
            />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <label className="text-xs font-semibold text-slate-500">Confirmação</label>
            <input
              type="password"
              className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm shadow-sm"
              value={passwordForm.confirmPassword}
              onChange={(event) => handlePasswordFieldChange('confirmPassword', event.target.value)}
            />
          </div>
        </div>
        <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs leading-5 text-slate-500">
            Para sua seguranca, a troca de senha exige a confirmacao da senha atual e acontece separadamente do salvamento dos dados do perfil.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <button
              type="button"
              onClick={handleUpdatePassword}
              disabled={isUpdatingPassword}
              className="inline-flex h-11 items-center justify-center rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isUpdatingPassword ? 'Atualizando senha...' : 'Atualizar senha'}
            </button>
            <button
              type="button"
              onClick={resetPasswordForm}
              disabled={isUpdatingPassword}
              className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600 shadow-sm transition hover:border-slate-300 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Limpar campos
            </button>
          </div>
        </div>
      </ProfileSectionCard>
    );

    const verificationUpdate = latestVerificationNotification
      ? latestVerificationNotification
      : user?.document_review_status === 'pending'
        ? {
            id: 'document-review-pending-fallback',
            type: 'account_verification' as const,
            title: 'Documento enviado para análise',
            content:
              'Recebemos seu documento com sucesso. Ele foi encaminhado para análise da nossa equipe de segurança e verificação. Você será avisado aqui na plataforma assim que a revisão for concluída.',
            timestamp: user?.document_last_attempt_at || user?.document_reviewed_at || new Date().toISOString(),
            isRead: true,
          }
        : null;

    const verificationSection = (
      <PlanGuard requiredFeature="has_verification_badge">
        <ProfileSectionCard
          title="Central de Verificação"
          description="Envie seu documento e acompanhe o status da validação documental."
          icon={<FileText className="h-5 w-5" strokeWidth={1.5} />}
          color="amber"
        >
          {verificationUpdate ? (
            <div
              className={`mb-4 rounded-2xl border px-4 py-4 text-left ${
                user?.document_review_status === 'approved'
                  ? 'border-green-200 bg-green-50'
                  : user?.document_review_status === 'pending'
                    ? 'border-sky-200 bg-sky-50'
                    : 'border-amber-200 bg-amber-50'
              }`}
            >
              <p
                className={`text-xs font-black uppercase tracking-[0.18em] ${
                  user?.document_review_status === 'approved'
                    ? 'text-green-700'
                    : user?.document_review_status === 'pending'
                      ? 'text-sky-700'
                      : 'text-amber-700'
                }`}
              >
                Última atualização da verificação
              </p>
              <p className="mt-2 text-sm font-semibold text-slate-900">{verificationUpdate.title}</p>
              <p className="mt-2 text-sm leading-6 text-slate-700">{verificationUpdate.content}</p>
              <p className="mt-3 text-xs text-slate-500">
                {new Date(verificationUpdate.timestamp).toLocaleString('pt-BR')}
              </p>
            </div>
          ) : null}

          <div className="rounded-[22px] border border-dashed border-slate-200 bg-white p-5 text-center shadow-sm">
            <input
              type="file"
              className="hidden"
              id="doc-upload"
              accept=".pdf,.jpg,.jpeg,.png"
              onChange={handleDocumentUpload}
              disabled={isUploadingDocument || isValidatingDocument || isDocumentRetryBlocked}
            />
            <label
              htmlFor="doc-upload"
              className={`inline-flex items-center gap-2 text-sm font-semibold cursor-pointer transition-colors ${
                isUploadingDocument || isValidatingDocument || isDocumentRetryBlocked
                  ? 'text-slate-400 cursor-not-allowed'
                  : 'text-green-700 hover:text-green-800'
              }`}
            >
              {isUploadingDocument ? (
                <>
                  <div className="w-4 h-4 border-2 border-green-700 border-t-transparent rounded-full animate-spin" />
                  Enviando documento...
                </>
              ) : isValidatingDocument ? (
                <>
                  <div className="w-4 h-4 border-2 border-blue-700 border-t-transparent rounded-full animate-spin" />
                  Validando com OCR...
                </>
              ) : isDocumentRetryBlocked ? (
                <>
                  <Clock3 className="w-4 h-4" strokeWidth={1.5} />
                  Nova tentativa bloqueada por 24h
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4" strokeWidth={1.5} />
                  Enviar Documento (RG/CNH ou Contrato Social)
                </>
              )}
            </label>
            <p className="mt-2 text-xs text-slate-500">
              Seus dados são protegidos por criptografia. Documentos e PDFs pequenos (&lt;1MB) são validados automaticamente via OCR.
            </p>

            {isDocumentRetryBlocked && (
              <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-left">
                <p className="text-xs font-semibold text-amber-800">Nova tentativa temporariamente bloqueada</p>
                <p className="mt-1 text-xs text-amber-700">{getDocumentRetryBlockedMessage()}</p>
              </div>
            )}

            {uploadSuccess && (
              <div className="mt-3 rounded-xl border border-green-200 bg-green-50 p-3">
                <p className="text-xs font-semibold text-green-700">{uploadSuccess}</p>
              </div>
            )}

            {validationResult && (
              <div
                className={`mt-3 rounded-xl border p-3 ${
                  validationResult.status === 'approved'
                    ? 'border-green-200 bg-green-50'
                    : validationResult.status === 'manual_review'
                      ? 'border-sky-200 bg-sky-50'
                      : 'border-red-200 bg-red-50'
                }`}
              >
                <div className="flex items-start gap-2">
                  <div className="mt-0.5 flex-shrink-0">
                    {validationResult.status === 'approved' ? (
                      <div className="flex h-5 w-5 items-center justify-center rounded-full bg-green-500">
                        <span className="text-xs font-bold text-white">?</span>
                      </div>
                    ) : validationResult.status === 'manual_review' ? (
                      <div className="flex h-5 w-5 items-center justify-center rounded-full bg-sky-500">
                        <Clock3 className="h-3 w-3 text-white" strokeWidth={2.5} />
                      </div>
                    ) : (
                      <div className="flex h-5 w-5 items-center justify-center rounded-full bg-red-500">
                        <span className="text-xs font-bold text-white">?</span>
                      </div>
                    )}
                  </div>
                  <div className="flex-1 text-left">
                    <p
                      className={`text-xs font-semibold ${
                        validationResult.status === 'approved'
                          ? 'text-green-700'
                          : validationResult.status === 'manual_review'
                            ? 'text-sky-700'
                            : 'text-red-700'
                      }`}
                    >
                      {validationResult.message}
                    </p>
                    {validationResult.status === 'manual_review' && (
                      <p className="mt-2 text-xs text-slate-600">
                        Você não precisa reenviar agora. A equipe de segurança continuará a verificação manualmente.
                      </p>
                    )}
                    {validationResult.status === 'error' && (
                      <p className="mt-2 text-xs text-slate-600">
                        Dica: certifique-se de que a imagem está nítida e o documento está bem enquadrado.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </ProfileSectionCard>
      </PlanGuard>
    );

    const activeProfileSection = {
      identity: identitySection,
      contact: contactSection,
      security: securitySection,
      verification: verificationSection,
    }[selectedProfileTab];

    return (
      <div className="space-y-6">
        <div className="flex flex-col gap-4 rounded-[24px] border border-slate-200 bg-[linear-gradient(135deg,#ffffff_0%,#f8fafc_46%,#ecfdf5_100%)] p-5 shadow-[0_24px_60px_-40px_rgba(15,23,42,0.34)] sm:flex-row sm:items-center">
          <div className="relative">
            {user?.avatar ? (
              <img
                src={user.avatar}
                alt={userName}
                className="h-16 w-16 rounded-2xl object-cover shadow-sm ring-4 ring-white"
              />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#16a34a_0%,#15803d_38%,#0f172a_100%)] text-lg font-black tracking-[0.08em] text-white shadow-sm ring-4 ring-white">
                {getUserInitials(user?.name)}
              </div>
            )}
            <label
              htmlFor="avatar-upload"
              className="absolute -bottom-2 -right-2 flex h-8 w-8 items-center justify-center rounded-xl bg-slate-900 text-white shadow-[0_14px_24px_-16px_rgba(15,23,42,0.9)] cursor-pointer transition-colors hover:bg-slate-800"
              title="Alterar foto de perfil"
            >
              {isUploadingAvatar ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <Camera className="w-4 h-4" strokeWidth={1.5} />
              )}
            </label>
            <input
              id="avatar-upload"
              type="file"
              accept="image/*"
              onChange={handleAvatarUpload}
              className="hidden"
              disabled={isUploadingAvatar}
            />
          </div>
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-3">
              <h3 className="text-lg font-bold text-slate-900">{userName}</h3>
              {user?.document_verified && (
                <span className="rounded-full border border-emerald-100 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 shadow-sm">
                  Vendedor Verificado
                </span>
              )}
            </div>
            <p className="mt-1 flex items-center gap-2 text-sm text-slate-500">
              <MapPin className="w-4 h-4" strokeWidth={1.5} />
              {userCity}
            </p>
          </div>
          <div className="sm:self-start">
            <button
              onClick={handleSaveProfile}
              disabled={isSavingProfile}
              className="h-10 rounded-xl bg-green-700 px-4 text-sm font-semibold text-white shadow-[0_18px_30px_-20px_rgba(22,163,74,0.75)] disabled:cursor-not-allowed disabled:opacity-50 hover:bg-green-800"
            >
              {isSavingProfile ? 'Salvando...' : 'Salvar alterações'}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 2xl:grid-cols-[236px_minmax(0,1fr)] 2xl:items-start">
          <aside className="h-fit rounded-[28px] border border-slate-200 bg-white/90 p-3 shadow-[0_22px_60px_-40px_rgba(15,23,42,0.2)] 2xl:sticky 2xl:top-24">
            <nav className="space-y-2">
              {profileTabs.map((tab) => {
                const isSelected = selectedProfileTab === tab.id;
                const status = getSectionStatus(tab.id);
                let selectedClasses = '';
                let iconClasses = '';
                let textClasses = '';
                if (isSelected) {
                  if (tab.id === 'identity') {
                    selectedClasses = 'border-emerald-300 bg-gradient-to-br from-emerald-50 to-emerald-100 shadow-md';
                    iconClasses = 'bg-emerald-100 text-emerald-700';
                    textClasses = 'text-emerald-900';
                  } else if (tab.id === 'contact') {
                    selectedClasses = 'border-blue-300 bg-gradient-to-br from-blue-50 to-blue-100 shadow-md';
                    iconClasses = 'bg-blue-100 text-blue-700';
                    textClasses = 'text-blue-900';
                  } else if (tab.id === 'security') {
                    selectedClasses = 'border-slate-300 bg-gradient-to-br from-slate-50 to-slate-100 shadow-md';
                    iconClasses = 'bg-slate-100 text-slate-700';
                    textClasses = 'text-slate-900';
                  } else if (tab.id === 'verification') {
                    selectedClasses = 'border-amber-300 bg-gradient-to-br from-amber-50 to-amber-100 shadow-md';
                    iconClasses = 'bg-amber-100 text-amber-700';
                    textClasses = 'text-amber-900';
                  }
                }
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setSelectedProfileTab(tab.id)}
                    className={`flex min-w-[220px] items-start gap-3 rounded-2xl border px-4 py-3 text-left transition-all 2xl:min-w-0 2xl:w-full ${
                      isSelected
                        ? selectedClasses
                        : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900'
                    }`}
                  >
                    <span className={`mt-0.5 flex h-9 w-9 items-center justify-center rounded-xl flex-shrink-0 ${iconClasses || 'bg-slate-100 text-slate-500'}`}>
                      {tab.icon}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={`block text-sm font-semibold ${textClasses}`}>{tab.label}</span>
                      <span className="block text-xs leading-5 text-slate-500">{tab.description}</span>
                    </span>
                  </button>
                );
              })}
            </nav>
          </aside>

          <div className="min-h-[500px]">
            {activeProfileSection}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex min-h-screen bg-[linear-gradient(180deg,#f8fafc_0%,#f1f5f9_100%)] font-sans text-slate-900">
      <SeoHead
        title={dashboardSeo.title}
        description={dashboardSeo.description}
        canonicalPath={location.pathname}
        noIndex
      />
      <aside className="sticky top-0 hidden h-screen w-[220px] flex-col border-r border-slate-800/80 bg-[#0f172a] px-3 py-5 text-slate-100 shadow-[30px_0_60px_-45px_rgba(15,23,42,0.75)] lg:flex xl:w-[236px] 2xl:w-72 2xl:px-5 2xl:py-6">
        <div className="mb-6 rounded-[24px] border border-white/10 bg-white/5 px-3 py-4 backdrop-blur 2xl:mb-8 2xl:px-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-2xl bg-[linear-gradient(135deg,#16a34a_0%,#15803d_100%)] text-base font-black text-white shadow-[0_18px_35px_-18px_rgba(22,163,74,0.8)]">
              {user?.avatar ? (
                <img src={user.avatar} alt={user.name || 'Usuário'} className="h-full w-full object-cover" />
              ) : (
                <span>{(user?.name || 'A').charAt(0).toUpperCase()}</span>
              )}
            </div>
            <div className="min-w-0">
              <span className="block text-[10px] font-semibold uppercase tracking-[0.22em] text-emerald-300/90 2xl:text-[11px] 2xl:tracking-[0.24em]">
                Painel AGRO BW
              </span>
              <span className="block text-base font-bold text-white">Operação do usuário</span>
            </div>
          </div>
        </div>

        <div className="relative min-h-0 flex-grow">
          <nav
            ref={sidebarNavRef}
            className="h-full space-y-1.5 overflow-y-auto pr-1 [scrollbar-color:rgba(148,163,184,0.4)_transparent] [scrollbar-width:thin]"
          >
            {menuItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                title={item.label}
                aria-label={item.label}
                className={`group relative flex items-center justify-between rounded-2xl border px-3 py-2.5 text-[13px] transition-all xl:px-3.5 2xl:px-4 2xl:py-3 2xl:text-sm ${
                  location.pathname === item.path
                    ? 'border-emerald-400/30 bg-[linear-gradient(135deg,rgba(22,163,74,0.22)_0%,rgba(15,23,42,0.08)_100%)] text-white shadow-[0_18px_35px_-24px_rgba(22,163,74,0.65)]'
                    : 'border-transparent text-slate-300/88 hover:border-white/10 hover:bg-white/5 hover:text-white'
                }`}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl transition-all xl:h-9 xl:w-9 ${
                      location.pathname === item.path
                        ? 'bg-white/10 text-emerald-300'
                        : 'bg-white/5 text-slate-400 group-hover:bg-white/10 group-hover:text-emerald-200'
                    }`}
                  >
                    {item.icon}
                  </span>
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate">{item.label}</span>
                    {item.path === '/minha-conta' && !hasPerformancePanelAccess ? (
                      <span
                        className="inline-flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border border-amber-300/25 bg-amber-400/15 text-amber-200"
                        title="Disponível nos planos pagos"
                        aria-label="Disponível nos planos pagos"
                      >
                        <Lock className="h-3 w-3" strokeWidth={1.8} />
                      </span>
                    ) : null}
                  </span>
                </div>
                {item.badge > 0 && (
                  <span className="ml-2 flex h-5 min-w-[20px] flex-shrink-0 items-center justify-center rounded-full bg-[#f59e0b] px-1.5 text-[10px] font-bold text-slate-950 shadow-[0_10px_20px_-12px_rgba(245,158,11,0.9)] xl:px-2 xl:text-xs">
                    {item.badge}
                  </span>
                )}
              </Link>
            ))}
          </nav>

          {showSidebarScrollHint ? (
            <div className="pointer-events-none absolute inset-x-0 bottom-0 rounded-b-[22px] bg-gradient-to-t from-[#0f172a] via-[#0f172a]/95 to-transparent px-3 pb-1 pt-12">
              <div className="mx-auto flex w-fit items-center gap-1 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.24em] text-slate-300">
                <span>Role para ver mais</span>
                <ChevronDown className="h-3.5 w-3.5" strokeWidth={2.2} />
              </div>
            </div>
          ) : null}
        </div>

        <div className="mt-6 border-t border-white/10 pt-6">
          <button 
            onClick={handleLogout}
            title="Sair"
            aria-label="Sair"
            className="flex w-full items-center gap-3 rounded-2xl border border-transparent px-3 py-2.5 text-[13px] font-medium text-slate-300 transition-all hover:border-red-400/20 hover:bg-red-500/10 hover:text-red-200 xl:px-3.5 2xl:px-4 2xl:py-3 2xl:text-sm"
          >
            <Icons.Logout />
            <span>Sair</span>
          </button>
        </div>
      </aside>

      <main className="mx-auto w-full max-w-7xl flex-grow px-4 py-6 lg:px-6 lg:py-8 xl:px-7 2xl:px-8">
        <header className="mb-6 flex flex-col gap-4 rounded-[28px] border border-slate-200/80 bg-white/85 px-5 py-5 shadow-[0_24px_60px_-42px_rgba(15,23,42,0.45)] backdrop-blur md:flex-row md:items-center md:justify-between lg:px-6 xl:px-7">
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.26em] text-emerald-700">
              Painel do usuário
            </p>
            <div className="flex items-center gap-2 mb-1">
              <h2 className="text-2xl font-bold text-slate-900">Olá, {user?.name.split(' ')[0]}</h2>
              {user?.document_verified && <VerifiedBadge variant="small" />}
            </div>
            <p className="text-sm text-slate-500">Acompanhe seus negócios e oportunidades rurais.</p>
          </div>
        </header>

        <Routes>
          <Route path="/" element={hasPerformancePanelAccess ? <HomeDashboard /> : <PerformancePanelLocked />} />
          <Route path="/anuncios" element={<AdsDashboard />} />
          <Route path="/mensagens" element={<MessagesView />} />
          <Route path="/leads" element={<LeadsView />} />
          <Route path="/favoritos" element={<FavoritesView embedded />} />
          <Route path="/radar" element={<RadarView />} />
          <Route
            path="/inteligencia-comercial"
            element={
              isCommercialIntelligenceEnabled ? (
                <CommercialIntelligenceDashboard />
              ) : (
                <Navigate to="/minha-conta" replace />
              )
            }
          />
          <Route path="/meu-plano" element={<MyPlanDashboard />} />
          <Route path="/financeiro" element={<FinanceDashboard />} />
          <Route path="/assinatura" element={<Navigate to="/minha-conta/financeiro" replace />} />
          <Route path="/meus-planos" element={<Navigate to="/minha-conta/financeiro" replace />} />
          <Route
            path="/minha-loja"
            element={
              showSellerStoreMenu ? (
                <SellerStoreDashboard hasStoreAccess={hasSellerStoreAccess} />
              ) : (
                <Navigate to="/minha-conta/financeiro" replace />
              )
            }
          />
          <Route path="/ajuda" element={<HelpCenterView />} />
          <Route path="/perfil" element={<ProfileDashboard />} />
          <Route path="*" element={<HomeDashboard />} />
        </Routes>
      </main>
    </div>
  );
};

export default UserDashboardView;

