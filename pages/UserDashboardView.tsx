import React, { useState, useEffect, useMemo } from 'react';
import { Routes, Route, Link, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Bell, Camera, CreditCard, DollarSign, Download, Edit3, Eye, FileText, Heart, Inbox, LayoutGrid, LogOut, Map, MapPin, MessageSquare, PauseCircle, ShieldCheck, Trash2, User, TrendingUp, Package, Sparkles } from 'lucide-react';
import { AdStatus, Message, Ad, AdMetrics } from '../types';
import { LEAD_STATUS } from '../constants/status';
import { useAuth } from '../src/contexts/AuthContext';
import { useUserAds } from '../src/hooks/useAds';
import { useChats } from '../src/hooks/useMessages';
import { useNotificationsCount } from '../src/hooks/useNotificationsCount';
import { useSubscription } from '../src/hooks/useSubscription';
import { supabase } from '../src/lib/supabaseClient';
import { useInvoices } from '../src/hooks/useInvoices';
import PlanGuard from '../components/PlanGuard';
import MessagesView from '../components/MessagesView';
import LeadsView from '../components/LeadsView';
import HighlightConfirmationModal from '../components/HighlightConfirmationModal';
import VerifiedBadge from '../components/VerifiedBadge';
import toast from 'react-hot-toast';
import { useDashboardStats } from '../src/hooks/useDashboardStats';
import { 
  DashboardStatsCard, 
  ReachModule, 
  PriceIntelligenceModule, 
  PlanModule 
} from '../components/DashboardModules';

const Icons = {
  Dashboard: () => <LayoutGrid className="w-5 h-5" strokeWidth={1.5} />,
  Ads: () => <FileText className="w-5 h-5" strokeWidth={1.5} />,
  Messages: () => <MessageSquare className="w-5 h-5" strokeWidth={1.5} />,
  Leads: () => <Inbox className="w-5 h-5" strokeWidth={1.5} />,
  Favorites: () => <Heart className="w-5 h-5" strokeWidth={1.5} />,
  Notifications: () => <Bell className="w-5 h-5" strokeWidth={1.5} />,
  Finance: () => <DollarSign className="w-5 h-5" strokeWidth={1.5} />,
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
  const { subscription, usage, isLoading: subscriptionLoading } = useSubscription();
  const [userAds, setUserAds] = useState<Ad[]>([]);
  const [userAdsLoading, setUserAdsLoading] = useState(false);
  const { invoices, isLoading: invoicesLoading } = useInvoices();
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
      
      const { data, error } = await supabase
        .from('leads')
        .select('id', { count: 'exact', head: true })
        .eq('seller_id', user.id)
        .eq('status', LEAD_STATUS.NEW);
      
      if (!error && data) {
        setNewLeadsCount(data.length || 0);
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

  // Função auxiliar para formatar CPF ou CNPJ
  const formatDocument = (doc: string): string => {
    const cleanDoc = doc.replace(/\D/g, '');
    
    if (cleanDoc.length === 11) {
      // CPF: 000.000.000-00
      return cleanDoc.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
    } else if (cleanDoc.length === 14) {
      // CNPJ: 00.000.000/0000-00
      return cleanDoc.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
    }
    
    return cleanDoc; // Retorna sem formatação se não for CPF nem CNPJ
  };

  // Função para extrair CPF/CNPJ de texto usando regex
  const extractDocumentFromText = (text: string): string | null => {
    // Remover quebras de linha e múltiplos espaços, mas manter espaços únicos
    const normalizedText = text.replace(/[\r\n]+/g, ' ').replace(/\s{2,}/g, ' ');
    
    // Regex flexível para CNPJ: aceita separadores opcionais (., -, /, espaço)
    // Exemplos: 61.232.149/0001-90, 61232149/0001-90, 61 232 149/0001-90
    const cnpjRegex = /\d{2}[.\s]?\d{3}[.\s]?\d{3}[/\s]?\d{4}[-\s]?\d{2}/g;
    
    // Regex flexível para CPF: aceita separadores opcionais (., -, espaço)
    // Exemplos: 029.177.601-92, 029177601-92, 029 177 601-92
    const cpfRegex = /\d{3}[.\s]?\d{3}[.\s]?\d{3}[-\s]?\d{2}/g;
    
    // Buscar CNPJ primeiro (14 dígitos) - prioridade para empresas
    const cnpjMatches = normalizedText.match(cnpjRegex);
    if (cnpjMatches && cnpjMatches.length > 0) {
      // Remover todos os caracteres não numéricos
      const cnpj = cnpjMatches[0].replace(/\D/g, '');
      if (cnpj.length === 14) {
        console.log('[OCR] CNPJ encontrado:', cnpjMatches[0], '→', cnpj);
        return cnpj;
      }
    }
    
    // Buscar CPF (11 dígitos)
    const cpfMatches = normalizedText.match(cpfRegex);
    if (cpfMatches && cpfMatches.length > 0) {
      // Remover todos os caracteres não numéricos
      const cpf = cpfMatches[0].replace(/\D/g, '');
      if (cpf.length === 11) {
        console.log('[OCR] CPF encontrado:', cpfMatches[0], '→', cpf);
        return cpf;
      }
    }
    
    console.log('[OCR] Nenhum CPF/CNPJ encontrado no texto');
    return null;
  };

  // Função para validar documento via OCR.space API
  const validateDocumentWithOCR = async (file: File): Promise<{
    success: boolean;
    message: string;
    extractedDocument?: string;
  }> => {
    try {
      // Preparar FormData para enviar à API
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
          message: '❌ Não foi possível extrair texto do documento. Verifique a qualidade da imagem.'
        };
      }

      console.log('[OCR] Texto extraído:', parsedText);

      // Extrair CPF/CNPJ do texto
      const extractedDocument = extractDocumentFromText(parsedText);

      if (!extractedDocument) {
        return {
          success: false,
          message: '❌ Não foi possível identificar CPF ou CNPJ no documento.'
        };
      }

      console.log('[OCR] Documento extraído:', extractedDocument);

      // Comparar com documento do usuário
      const userDocument = user?.document?.replace(/\D/g, ''); // Remover formatação

      if (!userDocument) {
        return {
          success: false,
          message: '⚠️ Você ainda não cadastrou seu CPF/CNPJ no perfil.',
          extractedDocument
        };
      }

      // Verificar correspondência
      if (extractedDocument === userDocument) {
        return {
          success: true,
          message: '✅ Documento validado com sucesso! Os dados conferem.',
          extractedDocument
        };
      } else {
        return {
          success: false,
          message: `❌ Os dados do documento não batem com o seu perfil. Documento extraído: ${formatDocument(extractedDocument)} | Cadastrado: ${formatDocument(userDocument)}`,
          extractedDocument
        };
      }

    } catch (error: any) {
      console.error('[OCR] Erro:', error);
      return {
        success: false,
        message: `❌ Erro ao validar documento: ${error.message}`
      };
    }
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
      console.error('Erro ao fazer upload do avatar:', error);
      toast.error(error.message || 'Erro ao atualizar foto de perfil');
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  // Função para upload de documentos
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
      toast.error('O documento deve ter no máximo 10MB');
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

      toast.success('Documento enviado! Iniciando validação...');
      setIsUploadingDocument(false);
      
      // Verificar se é PDF grande (>1MB) - análise manual
      const isPDF = file.type === 'application/pdf';
      const isPDFTooLarge = isPDF && file.size > 1 * 1024 * 1024; // 1MB
      
      if (isPDFTooLarge) {
        // PDF grande: análise manual
        const { error: updateError } = await supabase
          .from('users')
          .update({ 
            document_path: filePath,
            document_verified: null
          })
          .eq('id', user.id);

        if (updateError) throw updateError;
        
        setUploadSuccess('📄 PDF enviado! Por ser um arquivo grande, aguarde análise manual da equipe.');
      } else {
        // Imagens ou PDFs pequenos: validação OCR automática
        setIsValidatingDocument(true);
        
        const validationResult = await validateDocumentWithOCR(file);
        setValidationResult(validationResult);
        
        if (validationResult.success) {
          // Atualizar document_path com validação aprovada
          const { error: updateError } = await supabase
            .from('users')
            .update({ 
              document_path: filePath,
              document_verified: true
            })
            .eq('id', user.id);

          if (updateError) console.error('Erro ao atualizar status:', updateError);
          
          // Atualizar contexto de autenticação para refletir mudança sem reload
          await refreshStats();
          
          // Toast especial de sucesso com celebração
          toast.success(
            '🎉 Parabéns! Sua identidade foi confirmada e você agora é um Vendedor Verificado.',
            {
              duration: 6000,
              style: {
                background: '#059669',
                color: '#fff',
                fontWeight: 'bold',
                padding: '16px',
              },
              icon: '🎊',
            }
          );
          
          setUploadSuccess(`✅ ${isPDF ? 'PDF' : 'Documento'} validado e enviado com sucesso!`);
        } else {
          // Salvar mesmo se não validado (para revisão manual)
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
      
      // Limpar mensagens após 10 segundos
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
    { label: 'Favoritos', path: '/favoritos', icon: <Icons.Favorites />, badge: 0 },
    { label: 'Notificações', path: '/minha-conta/notificacoes', icon: <Icons.Notifications />, badge: notificationsCount },
    { label: 'Financeiro', path: '/minha-conta/financeiro', icon: <Icons.Finance />, badge: 0 },
    { label: 'Perfil', path: '/minha-conta/perfil', icon: <Icons.Profile />, badge: 0 },
  ];

  const handleLogout = async () => {
    await signOut();
    navigate('/login');
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
    <div className="bg-white p-6 rounded-xl border border-slate-100">
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
    const { chats: filteredChats, isLoading: chatsLoading } = useChats(selectedAdId);

    if (!userAds) return null;

    // Filtrar anúncios ativos com preço para o seletor
    const activeAdsWithPrice = userAds.filter(
      ad => ad.status === AdStatus.ACTIVE && ad.price > 0
    );

    // Encontrar título do anúncio selecionado
    const selectedAd = selectedAdId 
      ? activeAdsWithPrice.find(ad => ad.id === selectedAdId)
      : null;

    return (
      <div className="space-y-6 animate-in fade-in duration-500 pb-20">
        {/* Grid Superior: 4 Cards de Estatísticas */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <DashboardStatsCard
            icon={<FileText className="w-6 h-6" strokeWidth={1.5} />}
            label="Anúncios Ativos"
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
            label="Visualizações"
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
          {/* Coluna Esquerda: Módulo de Alcance (2/3) */}
          <div className="lg:col-span-2">
            <ReachModule 
              clicksByState={dashboardStats?.clicks_by_state || []}
              loading={dashboardLoading}
            />
          </div>

          {/* Coluna Direita: Módulo de Plano (1/3) */}
          <div className="lg:col-span-1">
            <PlanModule
              planName={subscription?.plans?.name || user?.plan || 'Start Agro'}
              adsUsed={usage.adsUsed}
              adsLimit={usage.adsLimit}
              categoryHighlightsUsed={usage.categoryHighlightsUsed}
              categoryHighlightsLimit={usage.categoryHighlightsLimit}
              homeHighlightsUsed={usage.homeHighlightsUsed}
              homeHighlightsLimit={usage.homeHighlightsLimit}
              periodEndDate={usage.periodEndDate}
              loading={subscriptionLoading}
              rpcAdsCount={dashboardStats?.total_ads}
              rpcHomeHighlights={dashboardStats?.home_highlights}
            />
          </div>
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
                    ? 'Nenhuma conversa iniciada para este anúncio ainda'
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
    const [activeTab, setActiveTab] = useState<'all' | 'active' | 'pending' | 'paused' | 'blocked'>('all');
    const [searchTerm, setSearchTerm] = useState('');
    const [itemsPerPage, setItemsPerPage] = useState(10);
    const [deleteModalOpen, setDeleteModalOpen] = useState(false);
    const [adToDelete, setAdToDelete] = useState<Ad | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const [highlightModalOpen, setHighlightModalOpen] = useState(false);
    const [adForHighlight, setAdForHighlight] = useState<{id: string, title: string} | null>(null);
    const [highlightType, setHighlightType] = useState<'category' | 'home'>('category');

    const counts = useMemo(() => {
      const active = ads.filter(a => a.status === AdStatus.ACTIVE).length;
      const pending = ads.filter(a => a.status === AdStatus.PENDING).length;
      const paused = ads.filter(a => a.status === AdStatus.PAUSED).length;
      const blocked = ads.filter(a => a.status === AdStatus.BLOCKED).length;
      return {
        all: ads.length,
        active,
        pending,
        paused,
        blocked
      };
    }, [ads]);

    const filteredAds = useMemo(() => {
      const normalized = searchTerm.trim().toLowerCase();
      const byTab = ads.filter(ad => {
        if (activeTab === 'active') return ad.status === AdStatus.ACTIVE;
        if (activeTab === 'pending') return ad.status === AdStatus.PENDING;
        if (activeTab === 'paused') return ad.status === AdStatus.PAUSED;
        if (activeTab === 'blocked') return ad.status === AdStatus.BLOCKED;
        return true;
      });

      if (!normalized) return byTab;
      return byTab.filter(ad => ad.title.toLowerCase().includes(normalized) || ad.id.toLowerCase().includes(normalized));
    }, [ads, activeTab, searchTerm]);

    const pagedAds = useMemo(() => filteredAds.slice(0, itemsPerPage), [filteredAds, itemsPerPage]);

    const tabs = [
      { id: 'all', label: 'Todos', count: counts.all },
      { id: 'active', label: 'Ativos', count: counts.active },
      { id: 'pending', label: 'Em Análise', count: counts.pending },
      { id: 'paused', label: 'Pausados', count: counts.paused },
      { id: 'blocked', label: 'Excluídos', count: counts.blocked }
    ] as const;

    const statusLabel: Record<string, string> = {
      [AdStatus.ACTIVE]: 'Ativo',
      [AdStatus.PAUSED]: 'Pausado',
      [AdStatus.PENDING]: 'Em Análise',
      [AdStatus.BLOCKED]: 'Excluído',
      [AdStatus.EXPIRED]: 'Expirado',
      [AdStatus.SOLD]: 'Vendido'
    };

    // Handlers para ações
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

    const handleDeleteClick = (ad: Ad) => {
      setAdToDelete(ad);
      setDeleteModalOpen(true);
    };

    const handleConfirmDelete = async () => {
      if (!adToDelete) return;
      
      setIsDeleting(true);
      try {
        const { error } = await supabase
          .from('announcements')
          .delete()
          .eq('id', adToDelete.id);

        if (error) throw error;

        toast.success('Anúncio excluído com sucesso');
        setDeleteModalOpen(false);
        setAdToDelete(null);
        // Atualizar lista
        window.location.reload();
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
                {tab.label}
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
                  className="bg-white border border-slate-200 rounded-lg px-4 py-3 flex items-center gap-4 h-20"
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
                    <p className="text-xs text-slate-500 truncate">
                      Código: {ad.id} | Cadastrado em: {new Date(ad.createdAt).toLocaleDateString('pt-BR')} às {new Date(ad.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
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
                      <button 
                        onClick={() => handleHighlightClick(ad, 'category')}
                        className="p-2 rounded-lg hover:bg-blue-50 hover:text-blue-700 transition-colors" 
                        title="Aplicar destaque"
                      >
                        <Sparkles className="w-4 h-4" strokeWidth={1.5} />
                      </button>
                      {/* Botão Editar */}
                      <Link
                        to={`/anunciar?edit=${ad.id}`}
                        className="p-2 rounded-lg hover:bg-slate-50 hover:text-green-700 transition-colors" 
                        title="Editar anúncio"
                      >
                        <Edit3 className="w-4 h-4" strokeWidth={1.5} />
                      </Link>
                      {/* Botão Pausar/Reativar */}
                      <button 
                        onClick={() => handleTogglePause(ad)}
                        className={`p-2 rounded-lg transition-colors ${
                          ad.status === AdStatus.PAUSED 
                            ? 'hover:bg-green-50 hover:text-green-700' 
                            : 'hover:bg-slate-50 hover:text-slate-700'
                        }`}
                        title={ad.status === AdStatus.PAUSED ? 'Reativar' : 'Pausar'}
                      >
                        <PauseCircle className="w-4 h-4" strokeWidth={1.5} />
                      </button>
                      {/* Botão Excluir */}
                      <button 
                        onClick={() => handleDeleteClick(ad)}
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

  const FinanceDashboard = () => {
    const nextInvoice = invoices.find((inv) => inv.status !== 'PAID') || invoices[0];
    
    // Buscar nome do plano da assinatura
    const planName = subscription?.plans?.name || 'Semente';
    const planPrice = subscription?.plans ? 0 : 0; // Preço será calculado via RPC ou tabela de preços
    
    // Formatar data de vencimento
    const periodEnd = subscription?.current_period_end 
      ? new Date(subscription.current_period_end).toLocaleDateString('pt-BR')
      : 'N/A';
    
    // Créditos do usuário
    const userCredits = user?.credits || 0;
    
    // Verificar se é plano Impulso para mostrar banner de upgrade
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
      // Redirecionar para página de planos com ID do plano atual
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

          {/* Card: Próxima Fatura */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-slate-900/5 text-slate-700 flex items-center justify-center">
              <DollarSign className="w-5 h-5" strokeWidth={1.5} />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Próxima Fatura</p>
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
          
          {/* Card: Meus Créditos */}
          <div className="bg-gradient-to-br from-green-50 to-emerald-50 p-4 rounded-xl border border-green-200 flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-green-700 text-white flex items-center justify-center">
              <Sparkles className="w-5 h-5" strokeWidth={1.5} />
            </div>
            <div>
              <p className="text-xs font-semibold text-green-700 uppercase tracking-wider">Meus Créditos</p>
              <p className="text-sm font-bold text-green-900">{userCredits}</p>
            </div>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Gestão de Assinatura</h3>
              <p className="text-sm text-slate-500">Acompanhe seu plano, altere forma de pagamento e visualize benefícios.</p>
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
                  <li>• Relatórios avançados de performance</li>
                  <li>• Prioridade na busca e destaque premium</li>
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
                  <th className="px-4 py-3 font-semibold text-right">Ações</th>
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
                      <span className="text-xs text-slate-400">PDF indisponível</span>
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

  const ProfileDashboard = () => {
    const userName = user?.name || user?.email || 'Usuário';
    const userCity = user?.location || 'Localização não informada';

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
              <span className="text-xs font-semibold px-2 py-1 rounded-full bg-slate-100 text-slate-600">Vendedor Verificado</span>
            </div>
            <p className="text-sm text-slate-500 flex items-center gap-2 mt-1">
              <MapPin className="w-4 h-4" strokeWidth={1.5} />
              {userCity}
            </p>
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
                <label className="text-xs font-semibold text-slate-500">Nome / Razão Social</label>
                <input
                  className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm"
                  value={user?.name || ''}
                  readOnly
                />
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
              <textarea className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm resize-none" rows={3} placeholder="Conte um pouco sobre sua atuação." />
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <div className="flex items-center gap-2 text-slate-900">
              <Map className="w-4 h-4" strokeWidth={1.5} />
              <h4 className="text-sm font-semibold">Localização e Contato</h4>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-500">CEP</label>
                <input
                  className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm"
                  value={user?.cep || ''}
                  readOnly
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-500">WhatsApp</label>
                <input
                  className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm"
                  value={user?.whatsapp || user?.phone || ''}
                  readOnly
                />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-500">Endereço Completo</label>
              <input
                className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm"
                value={
                  user?.logradouro
                    ? `${user.logradouro}${user.numero ? `, ${user.numero}` : ''}${user.bairro ? ` - ${user.bairro}` : ''}${user.cidade ? `, ${user.cidade}` : ''}${user.estado ? `/${user.estado}` : ''}`
                    : ''
                }
                readOnly
              />
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
                <input type="password" className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-500">Nova Senha</label>
                <input type="password" className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm" />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <label className="text-xs font-semibold text-slate-500">Confirmação</label>
                <input type="password" className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm" />
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
                
                {/* Resultado da Validação OCR */}
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
                            <span className="text-white text-xs font-bold">✓</span>
                          </div>
                        ) : (
                          <div className="w-5 h-5 rounded-full bg-red-500 flex items-center justify-center">
                            <span className="text-white text-xs font-bold">✕</span>
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
                            💡 Dica: Certifique-se de que a imagem está nítida e o documento está bem enquadrado.
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
                <img src={user?.avatar} alt="" />
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
          <Route path="/financeiro" element={<FinanceDashboard />} />
          <Route path="/perfil" element={<ProfileDashboard />} />
          <Route path="*" element={<HomeDashboard />} />
        </Routes>
      </main>
    </div>
  );
};

export default UserDashboardView;