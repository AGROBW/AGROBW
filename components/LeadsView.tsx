import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Mail, Phone, MapPin, Calendar, TrendingUp, CheckCircle, XCircle, Clock, Loader2, ExternalLink, MessageSquare } from 'lucide-react';
import { useAuth } from '../src/contexts/AuthContext';
import { supabase } from '../src/lib/supabaseClient';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useNavigate } from 'react-router-dom';

const PAGE_SIZE = 20; // Número de leads por página

interface Lead {
  id: string;
  chat_id: string;
  announcement_id: string;
  buyer_id: string;
  seller_id: string;
  buyer_name: string;
  buyer_email: string;
  buyer_phone: string;
  buyer_cep: string;
  initial_message: string;
  status: 'novo' | 'contatado' | 'negociando' | 'fechado' | 'perdido';
  created_at: string;
  announcement_title?: string;
  announcement_price?: number;
  announcement_image?: string;
}

const statusConfig = {
  novo: { label: 'Novo', color: 'bg-blue-100 text-blue-700', icon: Clock },
  contatado: { label: 'Contatado', color: 'bg-yellow-100 text-yellow-700', icon: Phone },
  negociando: { label: 'Negociando', color: 'bg-purple-100 text-purple-700', icon: TrendingUp },
  fechado: { label: 'Fechado', color: 'bg-green-100 text-green-700', icon: CheckCircle },
  perdido: { label: 'Perdido', color: 'bg-red-100 text-red-700', icon: XCircle }
};

// Função helper para buscar config de status com fallback seguro
const getStatusConfig = (status: string | undefined | null) => {
  if (!status) return statusConfig.novo;
  
  // Normalizar para minúsculas e remover espaços (defensivo)
  const normalizedStatus = status.toLowerCase().trim() as keyof typeof statusConfig;
  
  // Retornar config ou fallback para 'novo'
  return statusConfig[normalizedStatus] || statusConfig.novo;
};

const LeadsView: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [isUpdating, setIsUpdating] = useState(false);
  
  // Estados de paginação
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  
  // Ref para o elemento sentinela do IntersectionObserver
  const observerTarget = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchLeads(true);
  }, [user]);

  // IntersectionObserver para scroll infinito
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        // Só carregar mais se não estiver filtrando (filtro 'all')
        // Para filtros específicos, mostrar apenas os já carregados
        if (
          entries[0].isIntersecting && 
          hasMore && 
          !loadingMore && 
          !isLoading &&
          filterStatus === 'all'
        ) {
          loadMoreLeads();
        }
      },
      { threshold: 0.1 }
    );

    if (observerTarget.current) {
      observer.observe(observerTarget.current);
    }

    return () => {
      if (observerTarget.current) {
        observer.unobserve(observerTarget.current);
      }
    };
  }, [hasMore, loadingMore, isLoading, page, filterStatus]);

  const fetchLeads = async (reset: boolean = false) => {
    if (!user) return;

    const currentPage = reset ? 0 : page;
    setIsLoading(reset);
    
    try {
      const from = currentPage * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      const { data, error, count } = await supabase
        .from('leads')
        .select(`
          *,
          announcements (
            title,
            price,
            images
          )
        `, { count: 'exact' })
        .eq('seller_id', user.id)
        .order('created_at', { ascending: false })
        .range(from, to);

      if (error) throw error;

      const mappedLeads: Lead[] = data.map((lead: any) => ({
        ...lead,
        announcement_title: lead.announcements?.title,
        announcement_price: lead.announcements?.price,
        announcement_image: lead.announcements?.images?.[0]
      }));

      if (reset) {
        setLeads(mappedLeads);
        setPage(0);
      } else {
        setLeads(prev => [...prev, ...mappedLeads]);
      }

      // Verificar se há mais páginas
      const totalLoaded = reset ? mappedLeads.length : leads.length + mappedLeads.length;
      setHasMore(count ? totalLoaded < count : false);
      
    } catch (error) {
      console.error('Erro ao buscar leads:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadMoreLeads = useCallback(async () => {
    if (!user || loadingMore || !hasMore) return;

    setLoadingMore(true);
    const nextPage = page + 1;
    
    try {
      const from = nextPage * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      const { data, error, count } = await supabase
        .from('leads')
        .select(`
          *,
          announcements (
            title,
            price,
            images
          )
        `, { count: 'exact' })
        .eq('seller_id', user.id)
        .order('created_at', { ascending: false })
        .range(from, to);

      if (error) throw error;

      const mappedLeads: Lead[] = data.map((lead: any) => ({
        ...lead,
        announcement_title: lead.announcements?.title,
        announcement_price: lead.announcements?.price,
        announcement_image: lead.announcements?.images?.[0]
      }));

      setLeads(prev => [...prev, ...mappedLeads]);
      setPage(nextPage);

      // Verificar se há mais páginas
      const totalLoaded = leads.length + mappedLeads.length;
      setHasMore(count ? totalLoaded < count : false);
      
    } catch (error) {
      console.error('Erro ao carregar mais leads:', error);
    } finally {
      setLoadingMore(false);
    }
  }, [user, page, leads.length, hasMore, loadingMore]);

  const updateLeadStatus = async (leadId: string, newStatus: Lead['status']) => {
    setIsUpdating(true);
    try {
      const { error } = await supabase
        .from('leads')
        .update({ status: newStatus })
        .eq('id', leadId);

      if (error) throw error;

      // Atualizar localmente
      setLeads(prev =>
        prev.map(lead =>
          lead.id === leadId ? { ...lead, status: newStatus } : lead
        )
      );

      if (selectedLead?.id === leadId) {
        setSelectedLead(prev => prev ? { ...prev, status: newStatus } : null);
      }
    } catch (error) {
      console.error('Erro ao atualizar status:', error);
    } finally {
      setIsUpdating(false);
    }
  };

  const goToChat = (chatId: string) => {
    navigate(`/minha-conta/mensagens?chat=${chatId}`);
  };

  const formatTime = (dateString: string) => {
    return formatDistanceToNow(new Date(dateString), {
      addSuffix: true,
      locale: ptBR
    });
  };

  // Normalizar status para comparação segura (apenas lowercase e trim, sem tradução)
  const normalizeStatus = (status: string | undefined | null): string => {
    if (!status) return 'novo';
    return status.toLowerCase().trim();
  };

  const filteredLeads = leads.filter(lead => {
    if (filterStatus === 'all') return true;
    return normalizeStatus(lead.status) === filterStatus;
  });

  const stats = {
    total: leads.length,
    novo: leads.filter(l => normalizeStatus(l.status) === 'novo').length,
    contatado: leads.filter(l => normalizeStatus(l.status) === 'contatado').length,
    negociando: leads.filter(l => normalizeStatus(l.status) === 'negociando').length,
    fechado: leads.filter(l => normalizeStatus(l.status) === 'fechado').length,
    perdido: leads.filter(l => normalizeStatus(l.status) === 'perdido').length,
    conversionRate: leads.length > 0
      ? ((leads.filter(l => normalizeStatus(l.status) === 'fechado').length / leads.length) * 100).toFixed(1)
      : '0'
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 text-green-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Estatísticas */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-xs text-slate-500 font-bold uppercase mb-1">Total</p>
          <p className="text-2xl font-black text-slate-900">{stats.total}</p>
        </div>
        
        <div className="bg-blue-50 rounded-xl border border-blue-200 p-4">
          <p className="text-xs text-blue-600 font-bold uppercase mb-1">Novos</p>
          <p className="text-2xl font-black text-blue-700">{stats.novo}</p>
        </div>
        
        <div className="bg-yellow-50 rounded-xl border border-yellow-200 p-4">
          <p className="text-xs text-yellow-600 font-bold uppercase mb-1">Contatados</p>
          <p className="text-2xl font-black text-yellow-700">{stats.contatado}</p>
        </div>
        
        <div className="bg-purple-50 rounded-xl border border-purple-200 p-4">
          <p className="text-xs text-purple-600 font-bold uppercase mb-1">Negociando</p>
          <p className="text-2xl font-black text-purple-700">{stats.negociando}</p>
        </div>
        
        <div className="bg-green-50 rounded-xl border border-green-200 p-4">
          <p className="text-xs text-green-600 font-bold uppercase mb-1">Fechados</p>
          <p className="text-2xl font-black text-green-700">{stats.fechado}</p>
        </div>
        
        <div className="bg-red-50 rounded-xl border border-red-200 p-4">
          <p className="text-xs text-red-600 font-bold uppercase mb-1">Perdidos</p>
          <p className="text-2xl font-black text-red-700">{stats.perdido}</p>
        </div>
        
        <div className="bg-slate-900 rounded-xl p-4 text-white">
          <p className="text-xs opacity-75 font-bold uppercase mb-1">Conversão</p>
          <p className="text-2xl font-black">{stats.conversionRate}%</p>
        </div>
      </div>

      {/* Info de Paginação */}
      {hasMore && filterStatus === 'all' && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
            <p className="text-sm text-blue-700 font-medium">
              Carregados {leads.length} leads • Rolagem infinita ativada
            </p>
          </div>
        </div>
      )}

      {/* Filtros */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setFilterStatus('all')}
          className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${
            filterStatus === 'all'
              ? 'bg-slate-900 text-white'
              : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
        >
          Todos ({stats.total})
        </button>
        
        {Object.entries(statusConfig).map(([status, config]) => (
          <button
            key={status}
            onClick={() => setFilterStatus(status)}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${
              filterStatus === status
                ? config.color
                : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            {config.label} ({(stats as any)[status]})
          </button>
        ))}
      </div>

      {/* Lista de Leads */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        {filteredLeads.length === 0 ? (
          <div className="p-12 text-center">
            <Clock className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 font-medium">Nenhum lead encontrado</p>
            <p className="text-slate-400 text-sm mt-1">
              {filterStatus === 'all'
                ? 'Aguarde interessados entrarem em contato com seus anúncios'
                : `Nenhum lead com status "${getStatusConfig(filterStatus).label}"`}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-200 max-h-[800px] overflow-y-auto scroll-smooth">
            {filteredLeads.map((lead) => {
              const config = getStatusConfig(lead.status);
              const StatusIcon = config.icon;
              
              return (
                <motion.div
                  key={lead.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="p-6 hover:bg-slate-50 transition-colors cursor-pointer"
                  style={{ contentVisibility: 'auto' }}
                  onClick={() => setSelectedLead(lead)}
                >
                  <div className="flex gap-4">
                    {/* Imagem do Anúncio */}
                    <div className="w-20 h-20 rounded-xl overflow-hidden bg-slate-100 flex-shrink-0">
                      {lead.announcement_image ? (
                        <img
                          src={lead.announcement_image}
                          alt={lead.announcement_title}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-slate-400">
                          <ExternalLink className="w-6 h-6" />
                        </div>
                      )}
                    </div>

                    {/* Informações */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1 min-w-0">
                          <h3 className="font-bold text-slate-900 mb-1 truncate">
                            {lead.buyer_name}
                          </h3>
                          <p className="text-sm text-slate-500 truncate">
                            {lead.announcement_title}
                          </p>
                        </div>

                        <div className="flex items-center gap-2 ml-4">
                          <span className={`px-3 py-1 rounded-full text-xs font-bold ${config.color} flex items-center gap-1`}>
                            <StatusIcon className="w-3 h-3" />
                            {config.label}
                          </span>
                          
                          {lead.announcement_price && (
                            <span className="text-sm font-bold text-green-700 whitespace-nowrap">
                              {new Intl.NumberFormat('pt-BR', {
                                style: 'currency',
                                currency: 'BRL'
                              }).format(lead.announcement_price)}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-500 mb-3">
                        <span className="flex items-center gap-1">
                          <Mail className="w-3 h-3" />
                          {lead.buyer_email}
                        </span>
                        
                        {lead.buyer_phone && (
                          <span className="flex items-center gap-1">
                            <Phone className="w-3 h-3" />
                            {lead.buyer_phone}
                          </span>
                        )}
                        
                        {lead.buyer_cep && (
                          <span className="flex items-center gap-1">
                            <MapPin className="w-3 h-3" />
                            CEP: {lead.buyer_cep}
                          </span>
                        )}
                        
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {formatTime(lead.created_at)}
                        </span>
                      </div>

                      <p className="text-sm text-slate-600 line-clamp-2 mb-3">
                        {lead.initial_message}
                      </p>

                      {/* Ações */}
                      <div className="flex gap-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            goToChat(lead.chat_id);
                          }}
                          className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-bold hover:bg-green-700 transition-colors flex items-center gap-1"
                        >
                          <MessageSquare className="w-3 h-3" />
                          Responder
                        </button>

                        {normalizeStatus(lead.status) !== 'fechado' && normalizeStatus(lead.status) !== 'perdido' && (
                          <select
                            value={normalizeStatus(lead.status)}
                            onChange={(e) => {
                              e.stopPropagation();
                              updateLeadStatus(lead.id, e.target.value as Lead['status']);
                            }}
                            disabled={isUpdating}
                            className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <option value="novo">Marcar como Novo</option>
                            <option value="contatado">Marcar como Contatado</option>
                            <option value="negociando">Marcar como Negociando</option>
                            <option value="fechado">Marcar como Fechado</option>
                            <option value="perdido">Marcar como Perdido</option>
                          </select>
                        )}
                      </div>
                    </div>
                  </div>
                </motion.div>
              );
            })}
            
            {/* Elemento Sentinela para IntersectionObserver */}
            {hasMore && filterStatus === 'all' && (
              <div ref={observerTarget} className="py-8 flex justify-center items-center">
                {loadingMore ? (
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 className="w-6 h-6 text-green-600 animate-spin" />
                    <p className="text-sm text-slate-500 font-medium">Carregando mais leads...</p>
                  </div>
                ) : (
                  <div className="h-4" /> /* spacer para o observer */
                )}
              </div>
            )}
            
            {/* Botão manual para carregar mais quando filtrando */}
            {hasMore && filterStatus !== 'all' && (
              <div className="py-6 flex flex-col items-center gap-3 border-t border-slate-200">
                <p className="text-xs text-slate-500">
                  Filtrando apenas os leads já carregados. Há mais {leads.length > PAGE_SIZE ? 'leads disponíveis' : 'para carregar'}.
                </p>
                <button
                  onClick={() => {
                    setFilterStatus('all');
                    if (hasMore) loadMoreLeads();
                  }}
                  className="px-4 py-2 bg-green-600 text-white text-sm font-bold rounded-lg hover:bg-green-700 transition-colors"
                >
                  Carregar Todos os Leads
                </button>
              </div>
            )}
            
            {/* Mensagem de fim da lista */}
            {!hasMore && filteredLeads.length > 0 && (
              <div className="py-6 text-center border-t border-slate-200">
                <p className="text-xs text-slate-400 font-medium">✓ Todos os leads foram carregados</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default LeadsView;
