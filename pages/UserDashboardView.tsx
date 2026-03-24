import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Routes, Route, Link, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertCircle, Bell, Camera, CheckCircle2, Clock3, CreditCard, DollarSign, Download, Edit3, ExternalLink, Eye, FileText, Heart, Inbox, LayoutGrid, LifeBuoy, LogOut, Map, MapPin, MessageSquare, PauseCircle, Radar, Receipt, ShieldCheck, Trash2, User, TrendingUp, Package, Sparkles } from 'lucide-react';
import { AdStatus, Message, Ad, AdMetrics, PaymentRecord } from '../types';
import { LEAD_STATUS } from '../constants/status';
import { useAuth } from '../src/contexts/AuthContext';
import { deleteAnnouncementWithRelations, useUserAds } from '../src/hooks/useAds';
import { useChats } from '../src/hooks/useMessages';
import { useNotificationsCount } from '../src/hooks/useNotificationsCount';
import { useSubscription } from '../src/hooks/useSubscription';
import { supabase } from '../src/lib/supabaseClient';
import { useInvoices } from '../src/hooks/useInvoices';
import { usePayments } from '../src/hooks/usePayments';
import { useHighlightBoosters } from '../src/hooks/useHighlightBoosters';
import HighlightBoosterCard from '../components/boosters/HighlightBoosterCard';
import PlanGuard from '../components/PlanGuard';
import MessagesView from '../components/MessagesView';
import LeadsView from '../components/LeadsView';
import RadarView from '../components/RadarView';
import { getBusinessDescriptionValidationError, MAX_BUSINESS_DESCRIPTION_LENGTH } from '../src/utils/businessDescription';
import HighlightConfirmationModal from '../components/HighlightConfirmationModal';
import RecommendedUpgradeModal from '../components/finance/RecommendedUpgradeModal';
import VerifiedBadge from '../components/VerifiedBadge';
import { usePlans } from '../src/hooks/usePlans';
import HelpCenterView from './HelpCenterView';
import FavoritesView from './FavoritesView';
import toast from 'react-hot-toast';
import { useDashboardStats } from '../src/hooks/useDashboardStats';
import { 
  DashboardStatsCard, 
  ReachModule, 
  PriceIntelligenceModule, 
  PlanModule 
} from '../components/DashboardModules';
import { initiateBoosterCheckout } from '../services/mercadoPagoService';

const Icons = {
  Dashboard: () => <LayoutGrid className="w-5 h-5" strokeWidth={1.5} />,
  Ads: () => <FileText className="w-5 h-5" strokeWidth={1.5} />,
  Messages: () => <MessageSquare className="w-5 h-5" strokeWidth={1.5} />,
  Leads: () => <Inbox className="w-5 h-5" strokeWidth={1.5} />,
  Favorites: () => <Heart className="w-5 h-5" strokeWidth={1.5} />,
  Radar: () => <Radar className="w-5 h-5" strokeWidth={1.5} />,
  Finance: () => <DollarSign className="w-5 h-5" strokeWidth={1.5} />,
  Help: () => <LifeBuoy className="w-5 h-5" strokeWidth={1.5} />,
  Profile: () => <User className="w-5 h-5" strokeWidth={1.5} />,
  Logout: () => <LogOut className="w-5 h-5" strokeWidth={1.5} />,
};

const AdsSkeletonList = ({ count = 3 }: { count?: number }) => (
  <div className="space-y-2">
    {Array.from({ length: count }).map((_, index) => (
      <div
        key={`ads-skeleton-${index}`}
        className="bg-white border border-slate-200 rounded-lg px-4 py-3 flex items-center gap-4 h-20 animate-pulse"
      >
        <div className="w-[60px] h-[60px] rounded-lg bg-slate-100 flex-shrink-0" />
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

const UserDashboardView: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, stats, signOut, refreshStats } = useAuth();
  const { ads, isLoading: adsLoading } = useUserAds();
  const { messagesCount, notificationsCount, isLoading: countsLoading } = useNotificationsCount();
  const { subscription, usage, isLoading: subscriptionLoading, refreshUsage } = useSubscription();
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
    usageHistory: boosterUsageHistory,
    summary: boosterSummary,
    isLoading: boostersLoading,
    refresh: refreshBoosters,
  } = useHighlightBoosters();
  const [newLeadsCount, setNewLeadsCount] = useState(0);
  
  // Estados para upload
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [isUploadingDocument, setIsUploadingDocument] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const [isValidatingDocument, setIsValidatingDocument] = useState(false);
  const [validationResult, setValidationResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);
  
  const isPremium = user?.plan && user.plan !== 'seed';

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

  // FunÃ§Ã£o para slugificar nome do usuÃ¡rio
  const slugify = (text: string): string => {
    return text
      .toString()
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '_') // EspaÃ§os -> underscores
      .replace(/[^\w\-]+/g, '') // Remove caracteres especiais
      .replace(/\_\_+/g, '_') // MÃºltiplos underscores -> um
      .replace(/^-+/, '') // Remove hÃ­fen do inÃ­cio
      .replace(/-+$/, ''); // Remove hÃ­fen do fim
  };

  // FunÃ§Ã£o auxiliar para formatar CPF ou CNPJ
  const formatDocument = (doc: string): string => {
    const cleanDoc = doc.replace(/\D/g, '');
    
    if (cleanDoc.length === 11) {
      // CPF: 000.000.000-00
      return cleanDoc.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
    } else if (cleanDoc.length === 14) {
      // CNPJ: 00.000.000/0000-00
      return cleanDoc.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
    }
    
    return cleanDoc; // Retorna sem formataÃ§Ã£o se nÃ£o for CPF nem CNPJ
  };

  // FunÃ§Ã£o para extrair CPF/CNPJ de texto usando regex
  const extractDocumentFromText = (text: string): string | null => {
    // Remover quebras de linha e mÃºltiplos espaÃ§os, mas manter espaÃ§os Ãºnicos
    const normalizedText = text.replace(/[\r\n]+/g, ' ').replace(/\s{2,}/g, ' ');
    
    // Regex flexÃ­vel para CNPJ: aceita separadores opcionais (., -, /, espaÃ§o)
    // Exemplos: 61.232.149/0001-90, 61232149/0001-90, 61 232 149/0001-90
    const cnpjRegex = /\d{2}[.\s]?\d{3}[.\s]?\d{3}[/\s]?\d{4}[-\s]?\d{2}/g;
    
    // Regex flexÃ­vel para CPF: aceita separadores opcionais (., -, espaÃ§o)
    // Exemplos: 029.177.601-92, 029177601-92, 029 177 601-92
    const cpfRegex = /\d{3}[.\s]?\d{3}[.\s]?\d{3}[-\s]?\d{2}/g;
    
    // Buscar CNPJ primeiro (14 dÃ­gitos) - prioridade para empresas
    const cnpjMatches = normalizedText.match(cnpjRegex);
    if (cnpjMatches && cnpjMatches.length > 0) {
      // Remover todos os caracteres nÃ£o numÃ©ricos
      const cnpj = cnpjMatches[0].replace(/\D/g, '');
      if (cnpj.length === 14) {
        console.log('[OCR] CNPJ encontrado:', cnpjMatches[0], 'â†’', cnpj);
        return cnpj;
      }
    }
    
    // Buscar CPF (11 dÃ­gitos)
    const cpfMatches = normalizedText.match(cpfRegex);
    if (cpfMatches && cpfMatches.length > 0) {
      // Remover todos os caracteres nÃ£o numÃ©ricos
      const cpf = cpfMatches[0].replace(/\D/g, '');
      if (cpf.length === 11) {
        console.log('[OCR] CPF encontrado:', cpfMatches[0], 'â†’', cpf);
        return cpf;
      }
    }
    
    console.log('[OCR] Nenhum CPF/CNPJ encontrado no texto');
    return null;
  };

  // FunÃ§Ã£o para validar documento via OCR.space API
  const validateDocumentWithOCR = async (file: File): Promise<{
    success: boolean;
    message: string;
    extractedDocument?: string;
  }> => {
    try {
      // Preparar FormData para enviar Ã  API
      const formData = new FormData();
      formData.append('apikey', 'K85883462288957');
      formData.append('language', 'por');
      formData.append('isOverlayRequired', 'false');
      formData.append('file', file);
      
      // Adicionar filetype para PDFs
      if (file.type === 'application/pdf') {
        formData.append('filetype', 'PDF');
      }

      // Enviar para OCR.space API
      const response = await fetch('https://api.ocr.space/parse/image', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        throw new Error('Erro ao comunicar com a API de OCR');
      }

      const data = await response.json();

      // Verificar se houve erro na API
      if (data.IsErroredOnProcessing) {
        throw new Error(data.ErrorMessage?.[0] || 'Erro ao processar documento');
      }

      // Extrair texto do resultado
      const parsedText = data.ParsedResults?.[0]?.ParsedText;
      
      if (!parsedText) {
        return {
          success: false,
          message: 'âŒ NÃ£o foi possÃ­vel extrair texto do documento. Verifique a qualidade da imagem.'
        };
      }

      console.log('[OCR] Texto extraÃ­do:', parsedText);

      // Extrair CPF/CNPJ do texto
      const extractedDocument = extractDocumentFromText(parsedText);

      if (!extractedDocument) {
        return {
          success: false,
          message: 'âŒ NÃ£o foi possÃ­vel identificar CPF ou CNPJ no documento.'
        };
      }

      console.log('[OCR] Documento extraÃ­do:', extractedDocument);

      // Comparar com documento do usuÃ¡rio
      const userDocument = user?.document?.replace(/\D/g, ''); // Remover formataÃ§Ã£o

      if (!userDocument) {
        return {
          success: false,
          message: 'âš ï¸ VocÃª ainda nÃ£o cadastrou seu CPF/CNPJ no perfil.',
          extractedDocument
        };
      }

      // Verificar correspondÃªncia
      if (extractedDocument === userDocument) {
        return {
          success: true,
          message: 'âœ… Documento validado com sucesso! Os dados conferem.',
          extractedDocument
        };
      } else {
        return {
          success: false,
          message: `âŒ Os dados do documento nÃ£o batem com o seu perfil. Documento extraÃ­do: ${formatDocument(extractedDocument)} | Cadastrado: ${formatDocument(userDocument)}`,
          extractedDocument
        };
      }

    } catch (error: any) {
      console.error('[OCR] Erro:', error);
      return {
        success: false,
        message: `âŒ Erro ao validar documento: ${error.message}`
      };
    }
  };

  // FunÃ§Ã£o para upload de avatar
  const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !user) return;

    // Validar tipo de arquivo
    if (!file.type.startsWith('image/')) {
      toast.error('Por favor, selecione uma imagem vÃ¡lida');
      return;
    }

    // Validar tamanho (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error('A imagem deve ter no mÃ¡ximo 5MB');
      return;
    }

    setIsUploadingAvatar(true);
    
    try {
      const userName = slugify(user.name);
      const fileExt = file.name.split('.').pop();
      const filePath = `${userName}/perfil.${fileExt}`;

      // Upload para o Supabase Storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file, {
          upsert: true, // Substituir arquivo existente
          contentType: file.type
        });

      if (uploadError) throw uploadError;

      // Obter URL pÃºblica
      const { data: urlData } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);

      // Atualizar coluna avatar na tabela users
      const { error: updateError } = await supabase
        .from('users')
        .update({ avatar: urlData.publicUrl })
        .eq('id', user.id);

      if (updateError) throw updateError;

      // ForÃ§ar atualizaÃ§Ã£o do contexto (recarregar usuÃ¡rio)
      window.location.reload();
      
      toast.success('Foto de perfil atualizada com sucesso!');
    } catch (error: any) {
      console.error('Erro ao fazer upload do avatar:', error);
      toast.error(error.message || 'Erro ao atualizar foto de perfil');
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  // FunÃ§Ã£o para upload de documentos
  const handleDocumentUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !user) return;

    // Validar tipo de arquivo (PDF, JPG, PNG)
    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
    if (!allowedTypes.includes(file.type)) {
      toast.error('Por favor, selecione um PDF ou imagem (JPG/PNG)');
      return;
    }

    // Validar tamanho (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      toast.error('O documento deve ter no mÃ¡ximo 10MB');
      return;
    }

    setIsUploadingDocument(true);
    setValidationResult(null);
    
    try {
      const userName = slugify(user.name);
      const fileName = file.name;
      const filePath = `${userName}/${fileName}`;

      // Upload para o Supabase Storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('verification_docs')
        .upload(filePath, file, {
          upsert: true,
          contentType: file.type
        });

      if (uploadError) throw uploadError;

      toast.success('Documento enviado! Iniciando validaÃ§Ã£o...');
      setIsUploadingDocument(false);
      
      // Verificar se Ã© PDF grande (>1MB) - anÃ¡lise manual
      const isPDF = file.type === 'application/pdf';
      const isPDFTooLarge = isPDF && file.size > 1 * 1024 * 1024; // 1MB
      
      if (isPDFTooLarge) {
        // PDF grande: anÃ¡lise manual
        const { error: updateError } = await supabase
          .from('users')
          .update({ 
            document_path: filePath,
            document_verified: null
          })
          .eq('id', user.id);

        if (updateError) throw updateError;
        
        setUploadSuccess('ðŸ“„ PDF enviado! Por ser um arquivo grande, aguarde anÃ¡lise manual da equipe.');
      } else {
        // Imagens ou PDFs pequenos: validaÃ§Ã£o OCR automÃ¡tica
        setIsValidatingDocument(true);
        
        const validationResult = await validateDocumentWithOCR(file);
        setValidationResult(validationResult);
        
        if (validationResult.success) {
          // Atualizar document_path com validaÃ§Ã£o aprovada
          const { error: updateError } = await supabase
            .from('users')
            .update({ 
              document_path: filePath,
              document_verified: true
            })
            .eq('id', user.id);

          if (updateError) console.error('Erro ao atualizar status:', updateError);
          
          // Atualizar contexto de autenticaÃ§Ã£o para refletir mudanÃ§a sem reload
          await refreshStats();
          
          // Toast especial de sucesso com celebraÃ§Ã£o
          toast.success(
            'ðŸŽ‰ ParabÃ©ns! Sua identidade foi confirmada e vocÃª agora Ã© um Vendedor Verificado.',
            {
              duration: 6000,
              style: {
                background: '#059669',
                color: '#fff',
                fontWeight: 'bold',
                padding: '16px',
              },
              icon: 'ðŸŽŠ',
            }
          );
          
          setUploadSuccess(`âœ… ${isPDF ? 'PDF' : 'Documento'} validado e enviado com sucesso!`);
        } else {
          // Salvar mesmo se nÃ£o validado (para revisÃ£o manual)
          const { error: updateError } = await supabase
            .from('users')
            .update({ 
              document_path: filePath,
              document_verified: false
            })
            .eq('id', user.id);

          if (updateError) console.error('Erro ao atualizar status:', updateError);
        }
        
        setIsValidatingDocument(false);
      }
      
      // Limpar mensagens apÃ³s 10 segundos
      setTimeout(() => {
        setUploadSuccess(null);
        setValidationResult(null);
      }, 10000);
      
    } catch (error: any) {
      console.error('Erro ao fazer upload do documento:', error);
      toast.error(error.message || 'Erro ao enviar documento');
    } finally {
      setIsUploadingDocument(false);
      setIsValidatingDocument(false);
    }
  };

  const menuItems = [
    { label: 'Visão Geral', path: '/minha-conta', icon: <Icons.Dashboard />, badge: 0 },
    { label: 'Meus Anúncios', path: '/minha-conta/anuncios', icon: <Icons.Ads />, badge: 0 },
    { label: 'Mensagens', path: '/minha-conta/mensagens', icon: <Icons.Messages />, badge: messagesCount },
    { label: 'Leads', path: '/minha-conta/leads', icon: <Icons.Leads />, badge: newLeadsCount },
    { label: 'Favoritos', path: '/minha-conta/favoritos', icon: <Icons.Favorites />, badge: 0 },
    { label: 'Radar de Oportunidades', path: '/minha-conta/radar', icon: <Icons.Radar />, badge: 0 },
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
      console.error('[UserDashboard] Erro ao iniciar checkout do booster:', error);
      toast.error('Erro inesperado ao processar checkout do booster.');
    }
  };

  // --- WIDGET COMPONENTS ---

  const MiniTile = ({ label, value, icon, color = "green" }: { label: string, value: string | number, icon: React.ReactNode, color?: string }) => (
    <div className="bg-white p-4 rounded-xl border border-slate-100 flex items-center gap-4 transition-all hover:bg-slate-50">
      <div className={`w-11 h-11 flex-shrink-0 flex items-center justify-center rounded-lg bg-green-700/10 text-green-700`}>
        {icon}
      </div>
      <div>
        <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">{label}</p>
        <h3 className="text-2xl font-bold text-gray-900 leading-tight">{value}</h3>
      </div>
    </div>
  );

  const HeatmapWidget = ({ metrics }: { metrics: AdMetrics }) => (
    <div className="bg-white p-6 rounded-xl border border-slate-100 h-full flex flex-col">
      <div className="flex justify-between items-center mb-6">
        <h4 className="text-sm font-bold text-gray-900">Alcance por RegiÃ£o</h4>
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
    <div className="bg-white p-6 rounded-xl border border-slate-100">
      <div className="flex justify-between items-center mb-6">
        <h4 className="text-sm font-bold text-gray-900">AnÃ¡lise de PreÃ§o</h4>
        <div className="text-[10px] font-bold text-green-700 px-2 py-0.5 bg-green-50 rounded uppercase">Competitivo</div>
      </div>

      <div className="space-y-6">
        <div className="flex justify-between">
           <div>
             <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Seu Valor</p>
             <p className="text-xl font-bold text-gray-900">R$ {ad.price.toLocaleString('pt-BR')}</p>
           </div>
           <div className="text-right">
             <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">MÃ©dia Mercado</p>
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
    const { chats: filteredChats, isLoading: chatsLoading } = useChats(selectedAdId);

    if (!userAds) return null;

    // Filtrar anÃºncios ativos com preÃ§o para o seletor
    const activeAdsWithPrice = userAds.filter(
      ad => ad.status === AdStatus.ACTIVE && ad.price > 0
    );

    // Encontrar tÃ­tulo do anÃºncio selecionado
    const selectedAd = selectedAdId 
      ? activeAdsWithPrice.find(ad => ad.id === selectedAdId)
      : null;

    return (
      <div className="space-y-6 animate-in fade-in duration-500 pb-20">
        {/* Grid Superior: 4 Cards de EstatÃ­sticas */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <DashboardStatsCard
            icon={<FileText className="w-6 h-6" strokeWidth={1.5} />}
            label="AnÃºncios Ativos"
            value={dashboardStats?.total_ads || 0}
            bgColor="bg-blue-50"
            iconColor="text-blue-600"
            loading={dashboardLoading}
          />
          <DashboardStatsCard
            icon={<MessageSquare className="w-6 h-6" strokeWidth={1.5} />}
            label="Novas Mensagens"
            value={messagesCount}
            bgColor="bg-green-50"
            iconColor="text-green-600"
            loading={countsLoading}
          />
          <DashboardStatsCard
            icon={<Eye className="w-6 h-6" strokeWidth={1.5} />}
            label="VisualizaÃ§Ãµes"
            value={dashboardStats?.total_views.toLocaleString('pt-BR') || '0'}
            bgColor="bg-purple-50"
            iconColor="text-purple-600"
            loading={dashboardLoading}
          />
          <DashboardStatsCard
            icon={<Inbox className="w-6 h-6" strokeWidth={1.5} />}
            label="Leads Gerados"
            value={dashboardStats?.total_leads || 0}
            bgColor="bg-amber-50"
            iconColor="text-amber-600"
            loading={dashboardLoading}
          />
        </div>

        {/* Layout Principal: 2 Colunas */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Coluna Esquerda: MÃ³dulo de Alcance (2/3) */}
          <div className="lg:col-span-2">
            <ReachModule 
              clicksByState={dashboardStats?.clicks_by_state || []}
              loading={dashboardLoading}
            />
          </div>

          {/* Coluna Direita: MÃ³dulo de Plano (1/3) */}
          <div className="lg:col-span-1">
            {subscription?.plans || subscriptionLoading ? (
              <PlanModule
                planName={subscription?.plans?.name || 'Sem plano ativo'}
                adsUsed={usage.adsUsed}
                adsLimit={usage.adsLimit}
                categoryHighlightsUsed={usage.categoryHighlightsUsed}
                categoryHighlightsLimit={usage.categoryHighlightsLimit}
                homeHighlightsUsed={usage.homeHighlightsUsed}
                homeHighlightsLimit={usage.homeHighlightsLimit}
                periodEndDate={usage.periodEndDate?.toISOString()}
                loading={subscriptionLoading}
                rpcAdsCount={dashboardStats?.total_ads}
                rpcHomeHighlights={dashboardStats?.home_highlights}
              />
            ) : (
              <div className="bg-white rounded-xl border border-slate-200 p-6">
                <div className="flex items-center justify-between mb-6">
                  <h4 className="text-sm font-bold text-slate-900">Plano Atual</h4>
                  <div className="px-3 py-1 bg-slate-100 border border-slate-200 rounded-full">
                    <span className="text-xs font-bold text-slate-700">Sem plano ativo</span>
                  </div>
                </div>
                <div className="space-y-3 text-sm text-slate-600">
                  <p>Esta conta ainda nao possui assinatura vinculada.</p>
                  <p>Assim que o plano Start for atribuido, os limites corretos aparecerao aqui.</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* MÃ³dulo de InteligÃªncia de PreÃ§o (Full Width) */}
        <div className="grid grid-cols-1">
          <PriceIntelligenceModule
            priceAnalysis={dashboardStats?.price_analysis || null}
            loading={dashboardLoading}
            ads={activeAdsWithPrice}
            selectedAdId={selectedAdId}
            onAdChange={setSelectedAdId}
          />
        </div>

        {/* Mensagens Recentes */}
        <div className="bg-white p-6 rounded-xl border border-slate-200">
          <div className="flex items-center justify-between mb-6">
            <h4 className="text-lg font-bold text-slate-900">
              {selectedAd 
                ? `Mensagens: ${selectedAd.title}`
                : 'Mensagens Recentes'
              }
            </h4>
            {selectedAd && (
              <button
                onClick={() => setSelectedAdId(null)}
                className="text-xs text-blue-600 hover:text-blue-700 font-medium transition-colors"
              >
                Ver todas
              </button>
            )}
          </div>
          
          <div className="divide-y divide-slate-50">
            {chatsLoading ? (
              <div className="py-6 text-center">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-slate-200 border-t-blue-600"></div>
                <p className="text-sm text-slate-500 mt-2">Carregando mensagens...</p>
              </div>
            ) : (filteredChats?.length ?? 0) === 0 ? (
              <div className="py-8 text-center">
                <Inbox className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                <p className="text-sm text-slate-500">
                  {selectedAd 
                    ? 'Nenhuma conversa iniciada para este anÃºncio ainda'
                    : 'Nenhuma mensagem encontrada'
                  }
                </p>
              </div>
            ) : (
              filteredChats?.slice(0, 3).map(chat => {
                const otherPartyName = chat?.sellerId === user?.id ? chat?.buyerName : chat?.sellerName
                return (
                  <div key={chat?.id} className="py-4 flex justify-between items-center">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-gradient-to-br from-green-100 to-blue-100 rounded-full flex items-center justify-center">
                        <User className="w-5 h-5 text-green-700" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-slate-900">{otherPartyName || 'Usuário'}</p>
                        <p className="text-xs text-slate-500 line-clamp-1">{chat?.lastMessage || 'Sem mensagens'}</p>
                      </div>
                    </div>
                    <Link to="/minha-conta/mensagens" className="text-xs font-bold text-green-700 uppercase hover:text-green-800 transition-colors">
                      Responder
                    </Link>
                  </div>
                )
              })
            )}
          </div>
        </div>
      </div>
    );
  };

  const AdsDashboard = () => {
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState<'all' | 'active' | 'pending' | 'paused' | 'blocked' | 'expired'>('all');
    const [searchTerm, setSearchTerm] = useState('');
    const [itemsPerPage, setItemsPerPage] = useState(10);
    const [removedAdIds, setRemovedAdIds] = useState<string[]>([]);
    const [deleteModalOpen, setDeleteModalOpen] = useState(false);
    const [adToDelete, setAdToDelete] = useState<Ad | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const [highlightModalOpen, setHighlightModalOpen] = useState(false);
    const [adForHighlight, setAdForHighlight] = useState<{id: string, title: string} | null>(null);
    const [highlightType, setHighlightType] = useState<'category' | 'home'>('category');

    const visibleAds = useMemo(() => {
      return ads.filter(ad => !removedAdIds.includes(ad.id));
    }, [ads, removedAdIds]);

    const counts = useMemo(() => {
      const active = visibleAds.filter(a => a.status === AdStatus.ACTIVE).length;
      const pending = visibleAds.filter(a => a.status === AdStatus.PENDING).length;
      const paused = visibleAds.filter(a => a.status === AdStatus.PAUSED).length;
      const expired = visibleAds.filter(a => a.status === AdStatus.EXPIRED).length;
      return {
        all: visibleAds.length,
        active,
        pending,
        paused,
        expired,
        blocked: expired
      };
    }, [visibleAds]);

    const filteredAds = useMemo(() => {
      const normalized = searchTerm.trim().toLowerCase();
      const byTab = visibleAds.filter(ad => {
        if (activeTab === 'active') return ad.status === AdStatus.ACTIVE;
        if (activeTab === 'pending') return ad.status === AdStatus.PENDING;
        if (activeTab === 'paused') return ad.status === AdStatus.PAUSED;
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
      { id: 'blocked', label: 'ExcluÃ­dos', count: counts.blocked }
    ] as const;

    const statusLabel: Record<string, string> = {
      [AdStatus.ACTIVE]: 'Ativo',
      [AdStatus.PAUSED]: 'Pausado',
      [AdStatus.PENDING]: 'Em Análise',
      [AdStatus.BLOCKED]: 'Excluído',
      [AdStatus.EXPIRED]: 'Expirado',
      [AdStatus.SOLD]: 'Vendido'
    };

    // Handlers para aÃ§Ãµes
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

    const handleTogglePause = async (ad: Ad) => {
      const newStatus = ad.status === AdStatus.ACTIVE ? AdStatus.PAUSED : AdStatus.ACTIVE;
      const { error } = await supabase
        .from('announcements')
        .update({ status: newStatus })
        .eq('id', ad.id);

      if (error) {
        toast.error('Erro ao alterar status do anúncio');
      } else {
        toast.success(newStatus === AdStatus.PAUSED ? 'Anúncio pausado' : 'Anúncio reativado');
        // Atualizar lista
        window.location.reload();
      }
    };

    const handleRepublishExpiredAd = async (ad: Ad) => {
      const { data, error } = await supabase.rpc('reactivate_expired_announcement', {
        p_announcement_id: ad.id
      });

      if (error) {
        toast.error('Erro ao republicar anúncio');
        return;
      }

      if (!data?.success) {
        toast.error(data?.error || 'Não foi possível republicar o anúncio');
        return;
      }

      toast.success(data?.message || 'Anúncio republicado com sucesso');
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
      setAdForHighlight({ id: ad.id, title: ad.title });
      setHighlightType(type);
      setHighlightModalOpen(true);
    };

    return (
      <div className="space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex flex-wrap items-center gap-2">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`h-9 px-3 rounded-lg text-sm font-semibold border transition-all ${
                  activeTab === tab.id
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                }`}
              >
                {tab.id === 'blocked' ? 'Vencidos' : tab.label}
                <span className={`ml-2 text-xs font-semibold ${activeTab === tab.id ? 'text-slate-100' : 'text-slate-500'}`}>
                  {tab.count}
                </span>
              </button>
            ))}
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center gap-3 w-full lg:w-auto lg:justify-end">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por título ou código"
              className="h-9 w-full sm:w-64 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-green-600/20"
            />
            <select
              value={itemsPerPage}
              onChange={(e) => setItemsPerPage(Number(e.target.value))}
              className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-green-600/20"
            >
              <option value={5}>5 por página</option>
              <option value={10}>10 por página</option>
              <option value={20}>20 por página</option>
            </select>
          </div>
        </div>

        {boosters[0] && (
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-600">Booster avulso</p>
                <h3 className="text-base font-semibold text-slate-900">Compre mais creditos de destaque sem trocar de plano</h3>
                <p className="text-sm text-slate-500">
                  O combo usa primeiro o saldo do plano e depois passa a consumir os creditos extras comprados.
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                Limite de {boosters[0].maxPurchasesPer30Days} compra(s) a cada 30 dias
              </div>
            </div>
            <HighlightBoosterCard
              booster={boosters[0]}
              summary={boosterSummary}
              onPurchase={handleBoosterPurchase}
              loading={boostersLoading}
              compact
            />
          </div>
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
              <div className="bg-white border border-slate-200 rounded-lg p-10 text-center">
                <div className="mx-auto mb-4 w-10 h-10 rounded-lg bg-slate-50 text-slate-500 flex items-center justify-center">
                  <Inbox className="w-5 h-5" strokeWidth={1.5} />
                </div>
                <p className="text-sm font-semibold text-slate-700 mb-2">Você não possui anúncios nesta categoria no momento</p>
                <p className="text-sm text-slate-500 mb-6">Crie um anúncio para começar a gerar oportunidades.</p>
                <Link
                  to="/anunciar"
                  className="inline-flex items-center justify-center h-9 px-4 rounded-lg bg-green-700 text-white text-sm font-semibold hover:bg-green-800 transition-colors"
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
                  className="bg-white border border-slate-200 rounded-lg px-4 py-3 flex items-center gap-4 h-20 cursor-pointer hover:shadow-lg transition-shadow"
                >
                  <div className="w-[60px] h-[60px] rounded-lg overflow-hidden bg-slate-100 flex-shrink-0">
                    <img src={ad.images[0]} alt={ad.title} className="w-full h-full object-cover" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-slate-900 truncate">{ad.title}</p>
                      {(() => {
                        const hasCategory = (ad as any).highlight_category || (ad as any).highlightCategory;
                        const hasHome = (ad as any).highlight_home || (ad as any).highlightHome;
                        
                        return (
                          <>
                            {hasCategory && (
                              <div className="flex-shrink-0 flex items-center gap-1 px-2 py-0.5 bg-blue-50 border border-blue-100 rounded-md" title="Destacado na categoria">
                                <TrendingUp className="w-3 h-3 text-blue-600" strokeWidth={2} />
                                <span className="text-[9px] font-bold text-blue-700 uppercase tracking-tight">Cat</span>
                              </div>
                            )}
                            {hasHome && (
                              <div className="flex-shrink-0 flex items-center gap-1 px-2 py-0.5 bg-amber-50 border border-amber-100 rounded-md" title="Destacado na home">
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
                      Cadastrado em: {new Date(ad.createdAt).toLocaleDateString('pt-BR')} as {new Date(ad.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} | {ad.status === AdStatus.EXPIRED ? getExpiredRetentionLabel(ad) : getAdLifetimeLabel(ad)}
                    </p>
                    <p className="text-xs text-slate-500">
                      Visitas: {ad.views} | Valor: {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(ad.price)}
                    </p>
                  </div>

                  <div className="flex items-center gap-4">
                    <span className={`text-xs font-semibold ${ad.status === AdStatus.ACTIVE ? 'text-green-700' : 'text-slate-500'}`}>
                      {statusLabel[ad.status] || 'Status'}
                    </span>
                    <div className="flex items-center gap-1 text-slate-400">
                      {/* Botão de Destaques */}
                      {ad.status !== AdStatus.EXPIRED && (
                        <>
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleHighlightClick(ad, 'category');
                          }}
                          className="p-2 rounded-lg hover:bg-blue-50 hover:text-blue-700 transition-colors" 
                          title="Destaque na categoria"
                        >
                          <TrendingUp className="w-4 h-4" strokeWidth={1.5} />
                        </button>
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleHighlightClick(ad, 'home');
                          }}
                          className="p-2 rounded-lg hover:bg-amber-50 hover:text-amber-700 transition-colors" 
                          title="Destaque na home"
                        >
                          <Sparkles className="w-4 h-4" strokeWidth={1.5} />
                        </button>
                        </>
                      )}
                      {/* Botão Editar */}
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          navigate(`/anunciar?edit=${ad.id}`);
                        }}
                        className="p-2 rounded-lg hover:bg-slate-50 hover:text-green-700 transition-colors" 
                        title="Editar anÃºncio"
                      >
                        <Edit3 className="w-4 h-4" strokeWidth={1.5} />
                      </button>
                      {/* BotÃ£o Pausar/Reativar */}
                      {ad.status === AdStatus.EXPIRED ? (
                        <button 
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleRepublishExpiredAd(ad);
                          }}
                          className="p-2 rounded-lg hover:bg-green-50 hover:text-green-700 transition-colors"
                          title="Republicar com novo credito"
                        >
                          <CreditCard className="w-4 h-4" strokeWidth={1.5} />
                        </button>
                      ) : (
                      <button 
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleTogglePause(ad);
                        }}
                        className={`p-2 rounded-lg transition-colors ${
                          ad.status === AdStatus.PAUSED 
                            ? 'hover:bg-green-50 hover:text-green-700' 
                            : 'hover:bg-slate-50 hover:text-slate-700'
                        }`}
                        title={ad.status === AdStatus.PAUSED ? 'Reativar' : 'Pausar'}
                      >
                        <PauseCircle className="w-4 h-4" strokeWidth={1.5} />
                      </button>
                      )}
                      {/* BotÃ£o Excluir */}
                      <button 
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleDeleteClick(ad);
                        }}
                        className="p-2 rounded-lg hover:bg-red-50 hover:text-red-600 transition-colors" 
                        title="Excluir anÃºncio"
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

        {/* Modal de Confirmação de ExclusÃ£o */}
        {deleteModalOpen && adToDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
              <h3 className="text-xl font-bold text-slate-900 mb-3">Confirmar ExclusÃ£o</h3>
              <p className="text-sm text-slate-600 mb-2">Tem certeza que deseja excluir este anÃºncio?</p>
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
                    'Confirmar ExclusÃ£o'
                  )}
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
            onSuccess={() => {
              refreshUsage();
              window.location.reload();
            }}
          />
        )}
      </div>
    );
  };

  const LegacyFinanceDashboard = () => {
    const { invoices, isLoading: invoicesLoading } = useInvoices();
    const nextInvoice = invoices.find((inv) => inv.status !== 'PAID') || invoices[0];
    
    // Buscar nome do plano da assinatura
    const planName = subscription?.plans?.name || 'Semente';
    const planPrice = subscription?.plans ? 0 : 0; // PreÃ§o serÃ¡ calculado via RPC ou tabela de preÃ§os
    
    // Formatar data de vencimento
    const periodEnd = subscription?.current_period_end 
      ? new Date(subscription.current_period_end).toLocaleDateString('pt-BR')
      : 'N/A';
    
    // CrÃ©ditos do usuÃ¡rio
    const userCredits = user?.credits || 0;
    
    // Verificar se Ã© plano Impulso para mostrar banner de upgrade
    const isBoostPlan = subscription?.plans?.name?.toLowerCase().includes('impulso');

    const statusBadge = (status: string) => {
      if (status === 'PAID') return 'bg-green-100 text-green-700';
      if (status === 'PENDING') return 'bg-yellow-100 text-yellow-700';
      return 'bg-red-100 text-red-700';
    };

    const statusLabel: Record<string, string> = {
      PAID: 'Pago',
      PENDING: 'Pendente',
      OVERDUE: 'Vencido'
    };
    
    const handleManagePlan = () => {
      // Redirecionar para pÃ¡gina de planos com ID do plano atual
      navigate(`/planos?current=${subscription?.plan_id || ''}`);
    };

    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Card: Plano Atual */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-green-700/10 text-green-700 flex items-center justify-center">
              <CreditCard className="w-5 h-5" strokeWidth={1.5} />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Plano Atual</p>
              <p className="text-sm font-semibold text-slate-900">{planName}</p>
            </div>
          </div>

          {/* Card: PrÃ³xima Fatura */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-slate-900/5 text-slate-700 flex items-center justify-center">
              <DollarSign className="w-5 h-5" strokeWidth={1.5} />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">PrÃ³xima Fatura</p>
              <p className="text-sm font-semibold text-slate-900">
                {nextInvoice ? `R$ ${nextInvoice.amount.toLocaleString('pt-BR')}` : 'N/A'}
              </p>
            </div>
          </div>

          {/* Card: Vencimento */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-slate-900/5 text-slate-700 flex items-center justify-center">
              <FileText className="w-5 h-5" strokeWidth={1.5} />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Vencimento</p>
              <p className="text-sm font-semibold text-slate-900">{periodEnd}</p>
            </div>
          </div>
          
          {/* Card: Meus CrÃ©ditos */}
          <div className="bg-gradient-to-br from-green-50 to-emerald-50 p-4 rounded-xl border border-green-200 flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-green-700 text-white flex items-center justify-center">
              <Sparkles className="w-5 h-5" strokeWidth={1.5} />
            </div>
            <div>
              <p className="text-xs font-semibold text-green-700 uppercase tracking-wider">Meus CrÃ©ditos</p>
              <p className="text-sm font-bold text-green-900">{userCredits}</p>
            </div>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">GestÃ£o de Assinatura</h3>
              <p className="text-sm text-slate-500">Acompanhe seu plano, altere forma de pagamento e visualize benefÃ­cios.</p>
            </div>
            <div className="flex gap-2">
              <button className="h-9 px-4 rounded-lg border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                Atualizar Pagamento
              </button>
              <button 
                onClick={handleManagePlan}
                className="h-9 px-4 rounded-lg bg-green-700 text-white text-sm font-semibold hover:bg-green-800"
              >
                Gerenciar Plano
              </button>
            </div>
          </div>
        </div>

        {isBoostPlan && (
          <div className="bg-green-50 border border-green-100 rounded-xl p-5">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <p className="text-xs font-semibold text-green-700 uppercase tracking-wider mb-1">Upgrade</p>
                <h4 className="text-sm font-semibold text-slate-900">Migre para o Plano Business</h4>
                <p className="text-sm text-slate-600">Mais visibilidade e suporte dedicado para acelerar suas vendas.</p>
                <ul className="text-sm text-slate-600 mt-3 space-y-1">
                  <li>â€¢ RelatÃ³rios avanÃ§ados de performance</li>
                  <li>â€¢ Prioridade na busca e destaque premium</li>
                </ul>
              </div>
              <button className="h-9 px-4 rounded-lg bg-green-700 text-white text-sm font-semibold hover:bg-green-800">
                Fazer Upgrade
              </button>
            </div>
          </div>
        )}

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900">Faturas Recentes</h3>
          </div>

          <div className="hidden md:block bg-white border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr className="text-left text-slate-500">
                  <th className="px-4 py-3 font-semibold">Fatura</th>
                  <th className="px-4 py-3 font-semibold">Data</th>
                  <th className="px-4 py-3 font-semibold">Valor</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold text-right">AÃ§Ãµes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {invoicesLoading ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-sm text-slate-500">Carregando faturas...</td>
                  </tr>
                ) : invoices.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-sm text-slate-500">Nenhuma fatura encontrada</td>
                  </tr>
                ) : (
                  invoices.map((inv) => (
                    <tr key={inv.id} className="text-slate-700">
                      <td className="px-4 py-3 font-semibold text-slate-900">{inv.planName}</td>
                      <td className="px-4 py-3 text-slate-500">{new Date(inv.date).toLocaleDateString('pt-BR')}</td>
                      <td className="px-4 py-3 text-slate-900">R$ {inv.amount.toLocaleString('pt-BR')}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-semibold px-2 py-1 rounded-full ${statusBadge(inv.status)}`}>
                          {statusLabel[inv.status]}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {inv.pdfUrl ? (
                          <a
                            href={inv.pdfUrl}
                            className="inline-flex items-center justify-center w-9 h-9 rounded-lg text-slate-500 hover:text-green-700 hover:bg-slate-50 transition-colors"
                            title="Baixar PDF"
                          >
                            <Download className="w-4 h-4" strokeWidth={1.5} />
                          </a>
                        ) : (
                          <span className="text-xs text-slate-400">-</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="md:hidden space-y-3">
            {invoicesLoading ? (
              <div className="text-center text-xs text-slate-500 py-4">Carregando faturas...</div>
            ) : invoices.length === 0 ? (
              <div className="text-center text-xs text-slate-500 py-4">Nenhuma fatura encontrada</div>
            ) : (
              invoices.map((inv) => (
                <div key={inv.id} className="bg-white border border-slate-200 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-semibold text-slate-900">{inv.planName}</p>
                    <span className={`text-xs font-semibold px-2 py-1 rounded-full ${statusBadge(inv.status)}`}>
                      {statusLabel[inv.status]}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">Data: {new Date(inv.date).toLocaleDateString('pt-BR')}</p>
                  <p className="text-xs text-slate-500">Valor: R$ {inv.amount.toLocaleString('pt-BR')}</p>
                  <div className="mt-3">
                    {inv.pdfUrl ? (
                      <a
                        href={inv.pdfUrl}
                        className="inline-flex items-center gap-2 text-sm font-semibold text-green-700"
                      >
                        <Download className="w-4 h-4" strokeWidth={1.5} />
                        Baixar PDF
                      </a>
                    ) : (
                      <span className="text-xs text-slate-400">PDF indisponÃ­vel</span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    );
  };

  const FinanceDashboard = () => {
    const { plansRaw } = usePlans();
    const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false);
    const searchParams = useMemo(() => {
      const candidates = [location.search];
      const hashQuery = window.location.hash.includes('?')
        ? `?${window.location.hash.split('?')[1]}`
        : '';

      if (hashQuery) {
        candidates.push(hashQuery);
      }

      for (const candidate of candidates) {
        const params = new URLSearchParams(candidate);
        if (params.toString()) {
          return params;
        }
      }

      return new URLSearchParams();
    }, [location.search]);

    const paymentFeedback = searchParams.get('payment');
    const planName = subscription?.plans?.name || 'Sem plano ativo';
    const renewalDate = subscription?.current_period_end
      ? new Date(subscription.current_period_end).toLocaleDateString('pt-BR')
      : 'N/A';
    const latestPayment = payments[0] || lastApprovedPayment;
    const fiscalDocuments = payments.filter((payment) => payment.invoiceStatus !== 'not_applicable');
    const activePlans = useMemo(
      () => plansRaw.filter((plan) => plan.is_active).sort((a, b) => a.position - b.position),
      [plansRaw]
    );
    const currentPlanRecord = useMemo(() => {
      if (!subscription?.plan_id) return null;
      return activePlans.find((plan) => plan.id === subscription.plan_id) || null;
    }, [activePlans, subscription?.plan_id]);
    const nextRecommendedPlan = useMemo(() => {
      if (!currentPlanRecord) return null;
      return activePlans.find((plan) => plan.position > currentPlanRecord.position) || null;
    }, [activePlans, currentPlanRecord]);

    const formatCurrency = (value: number, currency = 'BRL') =>
      new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency,
      }).format(value || 0);

    const formatDateTime = (value?: string | null) => {
      if (!value) {
        return 'Nao disponivel';
      }

      return new Date(value).toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    };

    const paymentStatusLabel: Record<PaymentRecord['status'], string> = {
      pending: 'Pendente',
      approved: 'Pago',
      rejected: 'Recusado',
      cancelled: 'Cancelado',
      refunded: 'Estornado',
      in_process: 'Em analise',
      charged_back: 'Chargeback',
    };

    const paymentStatusClass: Record<PaymentRecord['status'], string> = {
      pending: 'bg-amber-100 text-amber-700',
      approved: 'bg-emerald-100 text-emerald-700',
      rejected: 'bg-rose-100 text-rose-700',
      cancelled: 'bg-slate-200 text-slate-700',
      refunded: 'bg-orange-100 text-orange-700',
      in_process: 'bg-sky-100 text-sky-700',
      charged_back: 'bg-red-100 text-red-700',
    };

    const fiscalStatusLabel = {
      pending: 'Em emissao',
      available: 'Disponivel',
      failed: 'Falha',
      not_applicable: 'Nao aplicavel',
    } as const;

    const fiscalStatusClass = {
      pending: 'bg-amber-100 text-amber-700',
      available: 'bg-emerald-100 text-emerald-700',
      failed: 'bg-rose-100 text-rose-700',
      not_applicable: 'bg-slate-100 text-slate-500',
    } as const;

    const handleManagePlan = () => {
      navigate(`/planos?current=${subscription?.plan_id || ''}`);
    };

    const getUpgradeHighlights = () => {
      if (!nextRecommendedPlan) return [];

      const highlights: string[] = [];

      if ((nextRecommendedPlan.max_ads ?? 0) > (currentPlanRecord?.max_ads ?? 0)) {
        const currentAds = currentPlanRecord?.max_ads ?? 0;
        const diff = (nextRecommendedPlan.max_ads ?? 0) - currentAds;
        highlights.push(`Mais ${diff} anúncio${diff > 1 ? 's' : ''} ativo${diff > 1 ? 's' : ''} no plano.`);
      }

      if ((nextRecommendedPlan.category_highlights_count || 0) > (currentPlanRecord?.category_highlights_count || 0)) {
        highlights.push(`Mais destaque em categoria para ampliar a exposição dos anúncios.`);
      }

      if ((nextRecommendedPlan.home_highlight_count || 0) > (currentPlanRecord?.home_highlight_count || 0)) {
        highlights.push(`Entrada na vitrine da home para campanhas mais fortes.`);
      }

      if ((nextRecommendedPlan.radar_max_alerts || 0) > (currentPlanRecord?.radar_max_alerts || 0)) {
        highlights.push(`Radar com mais alertas e filtros avançados para novas oportunidades.`);
      }

      if (highlights.length === 0) {
        return (nextRecommendedPlan.display_features || []).filter(Boolean).slice(0, 3);
      }

      return highlights.slice(0, 3);
    };

    const openUrl = (url?: string | null) => {
      if (!url) {
        return;
      }

      window.open(url, '_blank', 'noopener,noreferrer');
    };

    const downloadReceipt = (payment: PaymentRecord) => {
      if (payment.receiptUrl) {
        openUrl(payment.receiptUrl);
        return;
      }

      const receiptHtml = `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <title>Comprovante BWAGRO - ${payment.providerPaymentId}</title>
    <style>
      body { font-family: Arial, sans-serif; padding: 32px; color: #0f172a; }
      .card { max-width: 720px; margin: 0 auto; border: 1px solid #dbe4ee; border-radius: 16px; padding: 28px; }
      h1 { margin: 0 0 8px; font-size: 24px; }
      p { margin: 0 0 20px; color: #475569; }
      table { width: 100%; border-collapse: collapse; }
      td { padding: 10px 0; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
      td:first-child { width: 220px; color: #64748b; font-weight: 600; }
      .badge { display: inline-block; padding: 6px 10px; border-radius: 999px; background: #dcfce7; color: #166534; font-weight: 700; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>Comprovante digital BWAGRO</h1>
      <p>Registro financeiro da sua assinatura confirmado na plataforma.</p>
      <table>
        <tr><td>Status</td><td><span class="badge">${paymentStatusLabel[payment.status]}</span></td></tr>
        <tr><td>Cliente</td><td>${user?.name || 'Nao informado'}</td></tr>
        <tr><td>E-mail</td><td>${user?.email || 'Nao informado'}</td></tr>
        <tr><td>Item</td><td>${payment.itemName || payment.planName || payment.description || 'Assinatura BWAGRO'}</td></tr>
        <tr><td>Valor</td><td>${formatCurrency(payment.amount, payment.currency)}</td></tr>
        <tr><td>Ciclo</td><td>${payment.itemType === 'booster' ? 'Compra avulsa' : payment.billingCycle === 'yearly' ? 'Anual' : 'Mensal'}</td></tr>
        <tr><td>Forma de pagamento</td><td>${payment.paymentMethod || 'Mercado Pago'}</td></tr>
        <tr><td>ID da transacao</td><td>${payment.providerPaymentId}</td></tr>
        <tr><td>Data de aprovacao</td><td>${formatDateTime(payment.paidAt || payment.createdAt)}</td></tr>
        <tr><td>Referencia</td><td>${payment.externalReference || 'Nao informada'}</td></tr>
      </table>
    </div>
  </body>
</html>`;

      const blob = new Blob([receiptHtml], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `comprovante-bwagro-${payment.providerPaymentId}.html`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    };

    const renderFeedbackBanner = () => {
      if (paymentFeedback === 'success') {
        return (
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="w-11 h-11 rounded-xl bg-emerald-600 text-white flex items-center justify-center flex-shrink-0">
                <CheckCircle2 className="w-5 h-5" strokeWidth={1.75} />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
                  Pagamento confirmado
                </p>
                <h3 className="text-lg font-semibold text-slate-900">
                  Sua assinatura foi ativada com sucesso.
                </h3>
                <p className="text-sm text-slate-600">
                  O comprovante digital e o status fiscal da cobranca ja estao centralizados aqui.
                </p>
              </div>
            </div>
            {lastApprovedPayment && (
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => downloadReceipt(lastApprovedPayment)}
                  className="h-10 px-4 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800"
                >
                  Baixar comprovante
                </button>
                <button
                  onClick={() => openUrl(lastApprovedPayment.invoicePdfUrl)}
                  disabled={!lastApprovedPayment.invoicePdfUrl}
                  className="h-10 px-4 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-white"
                >
                  {lastApprovedPayment.invoicePdfUrl ? 'Baixar nota fiscal' : 'Nota fiscal em emissao'}
                </button>
              </div>
            )}
          </div>
        );
      }

      if (paymentFeedback === 'pending') {
        return (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 flex items-start gap-3">
            <div className="w-11 h-11 rounded-xl bg-amber-500 text-white flex items-center justify-center flex-shrink-0">
              <Clock3 className="w-5 h-5" strokeWidth={1.75} />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-slate-900">Pagamento em processamento</h3>
              <p className="text-sm text-slate-600">
                Assim que o Mercado Pago confirmar a cobranca, o comprovante e a renovacao do plano serao atualizados aqui.
              </p>
            </div>
          </div>
        );
      }

      if (paymentFeedback === 'failure') {
        return (
          <div className="bg-rose-50 border border-rose-200 rounded-2xl p-5 flex items-start gap-3">
            <div className="w-11 h-11 rounded-xl bg-rose-500 text-white flex items-center justify-center flex-shrink-0">
              <AlertCircle className="w-5 h-5" strokeWidth={1.75} />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-slate-900">Nao foi possivel concluir o pagamento</h3>
              <p className="text-sm text-slate-600">
                Revise a forma de pagamento ou tente novamente. O historico abaixo continua disponivel para consulta.
              </p>
            </div>
          </div>
        );
      }

      return null;
    };

    return (
      <div className="space-y-6">
        {renderFeedbackBanner()}

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          <div className="bg-white p-5 rounded-2xl border border-slate-200 flex items-center gap-4">
            <div className="w-11 h-11 rounded-xl bg-green-700/10 text-green-700 flex items-center justify-center">
              <CreditCard className="w-5 h-5" strokeWidth={1.5} />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Plano atual</p>
              <p className="text-sm font-semibold text-slate-900">{planName}</p>
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200 flex items-center gap-4">
            <div className="w-11 h-11 rounded-xl bg-slate-900/5 text-slate-700 flex items-center justify-center">
              <Receipt className="w-5 h-5" strokeWidth={1.5} />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Ultimo pagamento</p>
              <p className="text-sm font-semibold text-slate-900">
                {lastApprovedPayment ? formatCurrency(lastApprovedPayment.amount, lastApprovedPayment.currency) : 'Sem registro'}
              </p>
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200 flex items-center gap-4">
            <div className="w-11 h-11 rounded-xl bg-slate-900/5 text-slate-700 flex items-center justify-center">
              <FileText className="w-5 h-5" strokeWidth={1.5} />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Proxima renovacao</p>
              <p className="text-sm font-semibold text-slate-900">{renewalDate}</p>
            </div>
          </div>

          <div className="bg-gradient-to-br from-green-50 to-emerald-50 p-5 rounded-2xl border border-green-200 flex items-center gap-4">
            <div className="w-11 h-11 rounded-xl bg-green-700 text-white flex items-center justify-center">
              <Sparkles className="w-5 h-5" strokeWidth={1.5} />
            </div>
            <div>
              <p className="text-xs font-semibold text-green-700 uppercase tracking-wider">Documentos fiscais</p>
              <p className="text-sm font-bold text-green-900">
                {availableInvoicesCount} disponivel(is)
              </p>
              <p className="text-xs text-green-700/80">
                {pendingFiscalDocumentsCount} em emissao
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[1.35fr,0.95fr] gap-6">
          <section className="bg-white border border-slate-200 rounded-2xl p-6 space-y-5">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-green-700">
                  Ultimo pagamento confirmado
                </p>
                <h3 className="text-xl font-semibold text-slate-900">
                  {latestPayment?.itemName || latestPayment?.planName || latestPayment?.description || 'Nenhum pagamento aprovado ainda'}
                </h3>
                <p className="text-sm text-slate-500">
                  Central de comprovantes, ciclo da assinatura e documentos fiscais.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={handleManagePlan}
                  className="h-10 px-4 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Gerenciar plano
                </button>
                <button
                  onClick={() => navigate('/planos')}
                  className="h-10 px-4 rounded-xl bg-green-700 text-white text-sm font-semibold hover:bg-green-800"
                >
                  Ver planos
                </button>
              </div>
            </div>

            {latestPayment ? (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Valor pago</p>
                    <p className="mt-2 text-3xl font-bold text-slate-900">
                      {formatCurrency(latestPayment.amount, latestPayment.currency)}
                    </p>
                    <p className="mt-1 text-sm text-slate-500">
                      {latestPayment.itemType === 'booster' ? 'Compra avulsa' : latestPayment.billingCycle === 'yearly' ? 'Ciclo anual' : 'Ciclo mensal'}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 space-y-3">
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Status da cobranca</span>
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${paymentStatusClass[latestPayment.status]}`}>
                        {paymentStatusLabel[latestPayment.status]}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Status fiscal</span>
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${fiscalStatusClass[latestPayment.invoiceStatus]}`}>
                        {fiscalStatusLabel[latestPayment.invoiceStatus]}
                      </span>
                    </div>
                    <div className="text-sm text-slate-600">
                      {latestPayment.statusDetail || 'Pagamento confirmado e vinculado a sua assinatura.'}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  <div className="rounded-2xl border border-slate-200 p-4 space-y-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Data da aprovacao</p>
                      <p className="mt-1 font-semibold text-slate-900">{formatDateTime(latestPayment.paidAt || latestPayment.createdAt)}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Metodo</p>
                      <p className="mt-1 font-semibold text-slate-900">{latestPayment.paymentMethod || 'Mercado Pago'}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">ID da transacao</p>
                      <p className="mt-1 font-semibold text-slate-900 break-all">{latestPayment.providerPaymentId}</p>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-200 p-4 flex flex-col justify-between gap-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Acoes rapidas</p>
                      <p className="mt-1 text-sm text-slate-600">
                        Baixe seu comprovante digital agora e acompanhe a disponibilidade da nota fiscal neste painel.
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => downloadReceipt(latestPayment)}
                        className="h-10 px-4 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800"
                      >
                        Baixar comprovante
                      </button>
                      <button
                        onClick={() => openUrl(latestPayment.invoicePdfUrl)}
                        disabled={!latestPayment.invoicePdfUrl}
                        className="h-10 px-4 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50"
                      >
                        {latestPayment.invoicePdfUrl ? 'Baixar nota fiscal' : 'NF em emissao'}
                      </button>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center">
                <p className="text-sm font-semibold text-slate-900">Nenhum pagamento aprovado encontrado.</p>
                <p className="text-sm text-slate-500 mt-2">
                  Assim que sua primeira assinatura for confirmada, o comprovante e os documentos fiscais aparecerao aqui.
                </p>
              </div>
            )}
          </section>

          <section className="bg-white border border-slate-200 rounded-2xl p-6">
            <div className="flex items-center justify-between gap-4 mb-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Documentos fiscais</p>
                <h3 className="text-lg font-semibold text-slate-900">Notas e anexos da cobranca</h3>
              </div>
            </div>

            <div className="space-y-3">
              {paymentsLoading ? (
                <div className="text-sm text-slate-500 py-8 text-center">Carregando documentos...</div>
              ) : fiscalDocuments.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 p-6 text-center">
                  <p className="text-sm font-semibold text-slate-900">Nenhum documento fiscal registrado.</p>
                  <p className="text-sm text-slate-500 mt-2">
                    Quando a nota fiscal for anexada ao pagamento, ela ficara disponivel para download aqui.
                  </p>
                </div>
              ) : (
                fiscalDocuments.map((payment) => (
                  <div key={`fiscal-${payment.id}`} className="rounded-2xl border border-slate-200 p-4 flex flex-col gap-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">
                          {payment.itemName || payment.planName || payment.description || 'Assinatura BWAGRO'}
                        </p>
                        <p className="text-xs text-slate-500">
                          Pagamento {payment.providerPaymentId}
                        </p>
                      </div>
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${fiscalStatusClass[payment.invoiceStatus]}`}>
                        {fiscalStatusLabel[payment.invoiceStatus]}
                      </span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm text-slate-600">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Data</p>
                        <p className="mt-1">{formatDateTime(payment.paidAt || payment.createdAt)}</p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Numero da nota</p>
                        <p className="mt-1">{payment.invoiceNumber || 'Aguardando emissao'}</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => openUrl(payment.invoicePdfUrl)}
                        disabled={!payment.invoicePdfUrl}
                        className="h-9 px-4 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50"
                      >
                        {payment.invoicePdfUrl ? 'Baixar NF' : 'NF em emissao'}
                      </button>
                      <button
                        onClick={() => downloadReceipt(payment)}
                        className="h-9 px-4 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800"
                      >
                        Comprovante
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>

        {boosters[0] && (
          <section className="bg-white border border-slate-200 rounded-2xl p-6 space-y-5">
            <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-600">Booster de destaques</p>
                <h3 className="text-lg font-semibold text-slate-900">Saldo extra para campanhas pontuais</h3>
                <p className="text-sm text-slate-500">
                  Seus creditos extras continuam validos mesmo sem assinatura ativa e entram em uso so depois do saldo do plano.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <span className="block text-xs uppercase tracking-[0.16em] text-slate-400 font-semibold">Categoria</span>
                  <span className="text-xl font-bold text-slate-900">{boosterSummary.categoryRemaining}</span>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <span className="block text-xs uppercase tracking-[0.16em] text-slate-400 font-semibold">Home</span>
                  <span className="text-xl font-bold text-slate-900">{boosterSummary.homeRemaining}</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-[0.95fr,1.05fr] gap-5">
              <HighlightBoosterCard
                booster={boosters[0]}
                summary={boosterSummary}
                onPurchase={handleBoosterPurchase}
                loading={boostersLoading}
              />

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                <div className="flex items-center justify-between gap-4 mb-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Historico do booster</p>
                    <h4 className="text-base font-semibold text-slate-900">Compras e consumo</h4>
                  </div>
                  <span className="text-xs text-slate-500">
                    {boosterSummary.purchasesLast30Days} compra(s) nos ultimos 30 dias
                  </span>
                </div>

                <div className="space-y-3">
                  {boosterPurchases.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-300 p-5 text-sm text-slate-500">
                      Nenhum booster comprado ainda.
                    </div>
                  ) : (
                    boosterPurchases.slice(0, 3).map((purchase) => (
                      <div key={purchase.id} className="rounded-xl border border-slate-200 bg-white p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <p className="font-semibold text-slate-900">{purchase.boosterName}</p>
                            <p className="text-xs text-slate-500">
                              {new Date(purchase.creditedAt).toLocaleString('pt-BR')}
                            </p>
                          </div>
                          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700">
                            Creditado
                          </span>
                        </div>
                        <div className="mt-3 text-sm text-slate-600">
                          Saldo restante: {purchase.categoryCreditsRemaining}/{purchase.categoryCreditsTotal} categoria · {purchase.homeCreditsRemaining}/{purchase.homeCreditsTotal} home
                        </div>
                      </div>
                    ))
                  )}

                  {boosterUsageHistory.length > 0 && (
                    <p className="text-xs text-slate-500">
                      {boosterUsageHistory.length} compra(s) ja tiveram uso e nao sao reembolsaveis.
                    </p>
                  )}
                </div>
              </div>
            </div>
          </section>
        )}

        {nextRecommendedPlan && (
          <div className="bg-green-50 border border-green-100 rounded-2xl p-5">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <p className="text-xs font-semibold text-green-700 uppercase tracking-wider mb-1">Upgrade recomendado</p>
                <h4 className="text-sm font-semibold text-slate-900">
                  Próximo passo recomendado: {nextRecommendedPlan.name}
                </h4>
                <p className="text-sm text-slate-600">
                  Saia do {currentPlanRecord?.name || planName} para o {nextRecommendedPlan.name} e ganhe mais estrutura para vender.
                </p>
                <ul className="text-sm text-slate-600 mt-3 space-y-1">
                  {getUpgradeHighlights().map((item) => (
                    <li key={item}>- {item}</li>
                  ))}
                </ul>
              </div>
              <button
                onClick={() => setIsUpgradeModalOpen(true)}
                className="h-10 px-4 rounded-xl bg-green-700 text-white text-sm font-semibold hover:bg-green-800"
              >
                Fazer upgrade
              </button>
            </div>
          </div>
        )}

        <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <div className="px-6 py-5 border-b border-slate-100 flex flex-col md:flex-row md:items-center md:justify-between gap-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Historico financeiro</p>
              <h3 className="text-lg font-semibold text-slate-900">Pagamentos e renovacoes</h3>
            </div>
            <p className="text-sm text-slate-500">
              Consulte status, ciclo, comprovantes e notas fiscais de cada cobranca.
            </p>
          </div>

          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr className="text-left text-slate-500">
                  <th className="px-6 py-3 font-semibold">Item</th>
                  <th className="px-6 py-3 font-semibold">Data</th>
                  <th className="px-6 py-3 font-semibold">Valor</th>
                  <th className="px-6 py-3 font-semibold">Status</th>
                  <th className="px-6 py-3 font-semibold">Fiscal</th>
                  <th className="px-6 py-3 font-semibold text-right">Acoes</th>
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
                            {payment.itemName || payment.planName || payment.description || 'Assinatura BWAGRO'}
                          </p>
                          <p className="text-xs text-slate-500">
                            {payment.itemType === 'booster' ? 'Compra avulsa' : payment.billingCycle === 'yearly' ? 'Cobranca anual' : 'Cobranca mensal'}
                          </p>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-slate-500">
                        {formatDateTime(payment.paidAt || payment.createdAt)}
                      </td>
                      <td className="px-6 py-4 font-semibold text-slate-900">
                        {formatCurrency(payment.amount, payment.currency)}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${paymentStatusClass[payment.status]}`}>
                          {paymentStatusLabel[payment.status]}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${fiscalStatusClass[payment.invoiceStatus]}`}>
                          {fiscalStatusLabel[payment.invoiceStatus]}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => downloadReceipt(payment)}
                            className="inline-flex items-center justify-center w-9 h-9 rounded-xl text-slate-500 hover:text-slate-900 hover:bg-slate-50 transition-colors"
                            title="Baixar comprovante"
                          >
                            <Download className="w-4 h-4" strokeWidth={1.5} />
                          </button>
                          <button
                            onClick={() => openUrl(payment.invoicePdfUrl)}
                            disabled={!payment.invoicePdfUrl}
                            className="inline-flex items-center justify-center w-9 h-9 rounded-xl text-slate-500 hover:text-green-700 hover:bg-slate-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                            title="Abrir nota fiscal"
                          >
                            <ExternalLink className="w-4 h-4" strokeWidth={1.5} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="md:hidden p-4 space-y-3">
            {paymentsLoading ? (
              <div className="text-center text-xs text-slate-500 py-4">Carregando pagamentos...</div>
            ) : payments.length === 0 ? (
              <div className="text-center text-xs text-slate-500 py-4">Nenhum pagamento encontrado.</div>
            ) : (
              payments.map((payment) => (
                <div key={payment.id} className="border border-slate-200 rounded-2xl p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">
                        {payment.itemName || payment.planName || payment.description || 'Assinatura BWAGRO'}
                      </p>
                      <p className="text-xs text-slate-500">
                        {formatDateTime(payment.paidAt || payment.createdAt)}
                      </p>
                    </div>
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${paymentStatusClass[payment.status]}`}>
                      {paymentStatusLabel[payment.status]}
                    </span>
                  </div>
                  <p className="text-sm font-semibold text-slate-900">
                    {formatCurrency(payment.amount, payment.currency)}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => downloadReceipt(payment)}
                      className="h-9 px-4 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800"
                    >
                      Comprovante
                    </button>
                    <button
                      onClick={() => openUrl(payment.invoicePdfUrl)}
                      disabled={!payment.invoicePdfUrl}
                      className="h-9 px-4 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {payment.invoicePdfUrl ? 'Nota fiscal' : 'NF pendente'}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        <RecommendedUpgradeModal
          isOpen={isUpgradeModalOpen}
          onClose={() => setIsUpgradeModalOpen(false)}
          currentPlan={currentPlanRecord}
          nextPlan={nextRecommendedPlan}
          userId={user?.id}
        />
      </div>
    );
  };

  const ProfileDashboard = () => {
    const userName = user?.name || user?.email || 'Usuário';
    const userCity = user?.location || 'Localização não informada';
    const [isSavingProfile, setIsSavingProfile] = useState(false);
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
    const [profileErrors, setProfileErrors] = useState<Record<string, string>>({});
    const [isLoadingCep, setIsLoadingCep] = useState(false);
    const lastLookedUpCepRef = useRef('');

    useEffect(() => {
      setProfileForm({
        name: user?.name || '',
        businessDescription: user?.business_description || '',
        whatsapp: user?.whatsapp || user?.phone || '',
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
      user?.whatsapp,
      user?.phone,
      user?.cep,
      user?.logradouro,
      user?.numero,
      user?.complemento,
      user?.bairro,
      user?.cidade,
      user?.estado,
    ]);

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
        console.error('Erro ao buscar CEP:', error);
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
      `h-10 w-full rounded-lg border px-3 text-sm transition-colors focus:outline-none focus:ring-2 ${
        field && profileErrors[field]
          ? 'border-red-300 bg-red-50 focus:border-red-300 focus:ring-red-100'
          : 'border-slate-200 focus:border-green-600 focus:ring-green-100'
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
        toast.error('Usuário não autenticado');
        return;
      }

      if (!validateProfileForm()) {
        toast.error('Preencha os campos obrigatorios do perfil');
        return;
      }

      const wantsPasswordChange = Boolean(
        passwordForm.currentPassword || passwordForm.newPassword || passwordForm.confirmPassword
      );

      if (wantsPasswordChange) {
        if (!passwordForm.currentPassword || !passwordForm.newPassword || !passwordForm.confirmPassword) {
          toast.error('Preencha todos os campos de senha para alterar seu acesso');
          return;
        }

        if (passwordForm.newPassword !== passwordForm.confirmPassword) {
          toast.error('A nova senha e a confirmação não conferem');
          return;
        }

        if (passwordForm.newPassword.length < 6) {
          toast.error('A nova senha deve ter pelo menos 6 caracteres');
          return;
        }
      }

      setIsSavingProfile(true);

      try {
        const location =
          profileForm.cidade && profileForm.estado
            ? `${profileForm.cidade}, ${profileForm.estado}`
            : profileForm.cidade || '';

        const { error: profileError } = await supabase
          .from('users')
          .update({
            name: profileForm.name.trim(),
            business_description: profileForm.businessDescription.trim() || null,
            whatsapp: profileForm.whatsapp.trim(),
            cep: profileForm.cep.trim(),
            logradouro: profileForm.logradouro.trim(),
            numero: profileForm.numero.trim(),
            complemento: profileForm.complemento.trim(),
            bairro: profileForm.bairro.trim(),
            cidade: profileForm.cidade.trim(),
            estado: profileForm.estado.trim(),
            location,
          })
          .eq('id', user.id);

        if (profileError) {
          throw profileError;
        }

        if (wantsPasswordChange) {
          const { error: reAuthError } = await supabase.auth.signInWithPassword({
            email: user.email,
            password: passwordForm.currentPassword,
          });

          if (reAuthError) {
            toast.error('Senha atual incorreta');
            setIsSavingProfile(false);
            return;
          }

          const { error: passwordError } = await supabase.auth.updateUser({
            password: passwordForm.newPassword,
          });

          if (passwordError) {
            throw passwordError;
          }

          setPasswordForm({
            currentPassword: '',
            newPassword: '',
            confirmPassword: '',
          });
        }

        await refreshStats();
        toast.success('Perfil atualizado com sucesso');
      } catch (error: any) {
        console.error('Erro ao salvar perfil:', error);
        toast.error(error?.message || 'Não foi possível salvar as alterações do perfil');
      } finally {
        setIsSavingProfile(false);
      }
    };

    return (
      <div className="space-y-6">
        <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="relative">
            <img
              src={user?.avatar || 'https://i.pravatar.cc/150?u=bwagro'}
              alt={userName}
              className="w-16 h-16 rounded-xl object-cover"
            />
            <label 
              htmlFor="avatar-upload" 
              className="absolute -bottom-2 -right-2 w-7 h-7 rounded-lg bg-slate-900 text-white flex items-center justify-center cursor-pointer hover:bg-slate-800 transition-colors"
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
              <h3 className="text-sm font-semibold text-slate-900">{userName}</h3>
              {user?.document_verified && (
                <span className="text-xs font-semibold px-2 py-1 rounded-full bg-slate-100 text-slate-600">Vendedor Verificado</span>
              )}
            </div>
            <p className="text-sm text-slate-500 flex items-center gap-2 mt-1">
              <MapPin className="w-4 h-4" strokeWidth={1.5} />
              {userCity}
            </p>
          </div>
          <div className="sm:self-start">
            <button
              onClick={handleSaveProfile}
              disabled={isSavingProfile}
              className="h-10 px-4 rounded-xl bg-green-700 text-white text-sm font-semibold hover:bg-green-800 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSavingProfile ? 'Salvando...' : 'Salvar alterações'}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <div className="flex items-center gap-2 text-slate-900">
              <User className="w-4 h-4" strokeWidth={1.5} />
              <h4 className="text-sm font-semibold">Identidade</h4>
            </div>
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
                  className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm"
                  value={user?.document || ''}
                  readOnly
                />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-500">Descrição do Negócio</label>
              <textarea
                className={`w-full rounded-lg border px-3 py-2 text-sm resize-none transition-colors focus:outline-none focus:ring-2 ${
                  profileErrors.businessDescription
                    ? 'border-red-300 bg-red-50 focus:border-red-300 focus:ring-red-100'
                    : 'border-slate-200 focus:border-green-600 focus:ring-green-100'
                }`}
                rows={3}
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
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <div className="flex items-center gap-2 text-slate-900">
              <Map className="w-4 h-4" strokeWidth={1.5} />
              <h4 className="text-sm font-semibold">Localização e Contato</h4>
            </div>
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
                  className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm"
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
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <div className="flex items-center gap-2 text-slate-900">
              <ShieldCheck className="w-4 h-4" strokeWidth={1.5} />
              <h4 className="text-sm font-semibold">Segurança e Acesso</h4>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-500">Senha Atual</label>
                <input
                  type="password"
                  className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm"
                  value={passwordForm.currentPassword}
                  onChange={(event) => handlePasswordFieldChange('currentPassword', event.target.value)}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-500">Nova Senha</label>
                <input
                  type="password"
                  className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm"
                  value={passwordForm.newPassword}
                  onChange={(event) => handlePasswordFieldChange('newPassword', event.target.value)}
                />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <label className="text-xs font-semibold text-slate-500">Confirmação</label>
                <input
                  type="password"
                  className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm"
                  value={passwordForm.confirmPassword}
                  onChange={(event) => handlePasswordFieldChange('confirmPassword', event.target.value)}
                />
              </div>
            </div>
            <div className="flex items-center justify-between border-t border-slate-100 pt-4">
              <div>
                <p className="text-sm font-semibold text-slate-900">Autenticação em Duas Etapas</p>
                <p className="text-xs text-slate-500">Aumente a proteção da sua conta.</p>
              </div>
              <button className="relative inline-flex h-6 w-11 items-center rounded-full bg-slate-200">
                <span className="inline-block h-5 w-5 transform rounded-full bg-white translate-x-1" />
              </button>
            </div>
          </div>

          <PlanGuard requiredFeature="has_verification_badge">
            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
              <div className="flex items-center gap-2 text-slate-900">
                <FileText className="w-4 h-4" strokeWidth={1.5} />
                <h4 className="text-sm font-semibold">Central de Verificação</h4>
              </div>
              <div className="border border-dashed border-slate-200 rounded-lg p-5 text-center">
                <input 
                  type="file" 
                  className="hidden" 
                  id="doc-upload"
                  accept=".pdf,.jpg,.jpeg,.png"
                  onChange={handleDocumentUpload}
                  disabled={isUploadingDocument || isValidatingDocument}
                />
                <label 
                  htmlFor="doc-upload" 
                  className={`inline-flex items-center gap-2 text-sm font-semibold cursor-pointer transition-colors ${
                    isUploadingDocument || isValidatingDocument
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
                  ) : (
                    <>
                      <ShieldCheck className="w-4 h-4" strokeWidth={1.5} />
                      Enviar Documento (RG/CNH ou Contrato Social)
                    </>
                  )}
                </label>
                <p className="text-xs text-slate-500 mt-2">
                  Seus dados são protegidos por criptografia. Documentos e PDFs pequenos (&lt;1MB) são validados automaticamente via OCR.
                </p>
                
                {/* Mensagem de Sucesso Geral */}
                {uploadSuccess && (
                  <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-lg">
                    <p className="text-xs text-green-700 font-semibold">{uploadSuccess}</p>
                  </div>
                )}
                
                {/* Resultado da ValidaÃ§Ã£o OCR */}
                {validationResult && (
                  <div className={`mt-3 p-3 border rounded-lg ${
                    validationResult.success 
                      ? 'bg-green-50 border-green-200' 
                      : 'bg-red-50 border-red-200'
                  }`}>
                    <div className="flex items-start gap-2">
                      <div className="flex-shrink-0 mt-0.5">
                        {validationResult.success ? (
                          <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center">
                            <span className="text-white text-xs font-bold">âœ“</span>
                          </div>
                        ) : (
                          <div className="w-5 h-5 rounded-full bg-red-500 flex items-center justify-center">
                            <span className="text-white text-xs font-bold">âœ•</span>
                          </div>
                        )}
                      </div>
                      <div className="flex-1 text-left">
                        <p className={`text-xs font-semibold ${
                          validationResult.success ? 'text-green-700' : 'text-red-700'
                        }`}>
                          {validationResult.message}
                        </p>
                        {!validationResult.success && (
                          <p className="text-xs text-slate-600 mt-2">
                            ðŸ’¡ Dica: Certifique-se de que a imagem estÃ¡ nÃ­tida e o documento estÃ¡ bem enquadrado.
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </PlanGuard>
        </div>
      </div>
    );
  };

  return (
    <div className="flex min-h-screen bg-[#fcfcfd] font-sans">
      {/* SaaS Sidebar */}
      <aside className="hidden lg:flex w-64 bg-white sticky top-0 h-screen flex-col p-6 border-r border-slate-100">
        <div className="flex items-center gap-3 mb-10">
          <div className="w-8 h-8 bg-green-700 rounded-lg flex items-center justify-center text-white font-bold">T</div>
          <span className="text-lg font-bold text-gray-900">BWAGRO</span>
        </div>

        <nav className="flex-grow space-y-1">
          {menuItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center justify-between px-4 py-2.5 rounded-lg text-sm transition-all group ${
                location.pathname === item.path ? 'bg-green-50 text-green-700 font-semibold' : 'text-gray-500 hover:bg-slate-50 hover:text-gray-900'
              }`}
            >
              <div className="flex items-center gap-3">
                <span className={`${location.pathname === item.path ? 'text-green-700' : 'text-gray-400 group-hover:text-gray-600'}`}>{item.icon}</span>
                {item.label}
              </div>
              {item.badge > 0 && (
                <span className="min-w-[20px] h-5 px-2 bg-green-600 text-white text-xs font-bold rounded-full flex items-center justify-center">
                  {item.badge}
                </span>
              )}
            </Link>
          ))}
        </nav>

        <div className="pt-6 border-t border-slate-100">
          <button 
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-gray-400 font-medium text-sm hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
          >
            <Icons.Logout /> Sair
          </button>
        </div>
      </aside>

      <main className="flex-grow p-6 lg:p-10 max-w-7xl mx-auto w-full">
        <header className="flex justify-between items-center mb-10">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h2 className="text-2xl font-bold text-gray-900">Olá, {user?.name.split(' ')[0]}</h2>
              {user?.document_verified && <VerifiedBadge variant="small" />}
            </div>
            <p className="text-sm text-gray-500">Acompanhe seus negócios e oportunidades rurais.</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="hidden md:flex items-center gap-3 px-3 py-1.5 rounded-lg border border-slate-100">
              <div className="w-7 h-7 bg-slate-200 rounded-full overflow-hidden">
                {user?.avatar ? <img src={user.avatar} alt="" /> : null}
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold text-gray-700">{user?.name}</span>
                {user?.document_verified && <VerifiedBadge variant="icon-only" />}
              </div>
            </div>
          </div>
        </header>

        <Routes>
          <Route path="/" element={<HomeDashboard />} />
          <Route path="/anuncios" element={<AdsDashboard />} />
          <Route path="/mensagens" element={<MessagesView />} />
          <Route path="/leads" element={<LeadsView />} />
          <Route path="/favoritos" element={<FavoritesView embedded />} />
          <Route path="/radar" element={<RadarView />} />
          <Route path="/financeiro" element={<FinanceDashboard />} />
          <Route path="/ajuda" element={<HelpCenterView />} />
          <Route path="/perfil" element={<ProfileDashboard />} />
          <Route path="*" element={<HomeDashboard />} />
        </Routes>
      </main>
    </div>
  );
};

export default UserDashboardView;



