import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Mail, Phone, MapPin, Calendar, TrendingUp, CheckCircle, XCircle, Clock, Loader2, ExternalLink, MessageSquare } from 'lucide-react';
import { useAuth } from '../src/contexts/AuthContext';
import { supabase } from '../src/lib/supabaseClient';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useNavigate } from 'react-router-dom';

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
  status: 'new' | 'contacted' | 'negotiating' | 'closed' | 'lost';
  created_at: string;
  announcement_title?: string;
  announcement_price?: number;
  announcement_image?: string;
}

const statusConfig = {
  new: { label: 'Novo', color: 'bg-blue-100 text-blue-700', icon: Clock },
  contacted: { label: 'Contatado', color: 'bg-yellow-100 text-yellow-700', icon: Phone },
  negotiating: { label: 'Negociando', color: 'bg-purple-100 text-purple-700', icon: TrendingUp },
  closed: { label: 'Fechado', color: 'bg-green-100 text-green-700', icon: CheckCircle },
  lost: { label: 'Perdido', color: 'bg-red-100 text-red-700', icon: XCircle }
};

// Função helper para buscar config de status com fallback seguro
const getStatusConfig = (status: string | undefined | null) => {
  if (!status) return statusConfig.new;
  
  // Normalizar para minúsculas e remover espaços
  const normalizedStatus = status.toLowerCase().trim();
  
  // Mapear possíveis variações para os status corretos
  const statusMap: Record<string, keyof typeof statusConfig> = {
    'new': 'new',
    'novo': 'new',
    'contacted': 'contacted',
    'contatado': 'contacted',
    'negotiating': 'negotiating',
    'negociando': 'negotiating',
    'closed': 'closed',
    'fechado': 'closed',
    'lost': 'lost',
    'perdido': 'lost'
  };
  
  const mappedStatus = statusMap[normalizedStatus];
  return statusConfig[mappedStatus] || statusConfig.new;
};

const LeadsView: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    fetchLeads();
  }, [user]);

  const fetchLeads = async () => {
    if (!user) return;

    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('leads')
        .select(`
          *,
          announcements (
            title,
            price,
            images
          )
        `)
        .eq('seller_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const mappedLeads: Lead[] = data.map((lead: any) => ({
        ...lead,
        announcement_title: lead.announcements?.title,
        announcement_price: lead.announcements?.price,
        announcement_image: lead.announcements?.images?.[0]
      }));

      setLeads(mappedLeads);
    } catch (error) {
      console.error('Erro ao buscar leads:', error);
    } finally {
      setIsLoading(false);
    }
  };

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

  // Normalizar status para comparação segura
  const normalizeStatus = (status: string | undefined | null): string => {
    if (!status) return 'new';
    const normalized = status.toLowerCase().trim();
    const statusMap: Record<string, string> = {
      'new': 'new',
      'novo': 'new',
      'contacted': 'contacted',
      'contatado': 'contacted',
      'negotiating': 'negotiating',
      'negociando': 'negotiating',
      'closed': 'closed',
      'fechado': 'closed',
      'lost': 'lost',
      'perdido': 'lost'
    };
    return statusMap[normalized] || 'new';
  };

  const filteredLeads = leads.filter(lead => {
    if (filterStatus === 'all') return true;
    return normalizeStatus(lead.status) === filterStatus;
  });

  const stats = {
    total: leads.length,
    new: leads.filter(l => normalizeStatus(l.status) === 'new').length,
    contacted: leads.filter(l => normalizeStatus(l.status) === 'contacted').length,
    negotiating: leads.filter(l => normalizeStatus(l.status) === 'negotiating').length,
    closed: leads.filter(l => normalizeStatus(l.status) === 'closed').length,
    lost: leads.filter(l => normalizeStatus(l.status) === 'lost').length,
    conversionRate: leads.length > 0
      ? ((leads.filter(l => normalizeStatus(l.status) === 'closed').length / leads.length) * 100).toFixed(1)
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
          <p className="text-2xl font-black text-blue-700">{stats.new}</p>
        </div>
        
        <div className="bg-yellow-50 rounded-xl border border-yellow-200 p-4">
          <p className="text-xs text-yellow-600 font-bold uppercase mb-1">Contatados</p>
          <p className="text-2xl font-black text-yellow-700">{stats.contacted}</p>
        </div>
        
        <div className="bg-purple-50 rounded-xl border border-purple-200 p-4">
          <p className="text-xs text-purple-600 font-bold uppercase mb-1">Negociando</p>
          <p className="text-2xl font-black text-purple-700">{stats.negotiating}</p>
        </div>
        
        <div className="bg-green-50 rounded-xl border border-green-200 p-4">
          <p className="text-xs text-green-600 font-bold uppercase mb-1">Fechados</p>
          <p className="text-2xl font-black text-green-700">{stats.closed}</p>
        </div>
        
        <div className="bg-red-50 rounded-xl border border-red-200 p-4">
          <p className="text-xs text-red-600 font-bold uppercase mb-1">Perdidos</p>
          <p className="text-2xl font-black text-red-700">{stats.lost}</p>
        </div>
        
        <div className="bg-slate-900 rounded-xl p-4 text-white">
          <p className="text-xs opacity-75 font-bold uppercase mb-1">Conversão</p>
          <p className="text-2xl font-black">{stats.conversionRate}%</p>
        </div>
      </div>

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
          <div className="divide-y divide-slate-200">
            {filteredLeads.map((lead) => {
              const config = getStatusConfig(lead.status);
              const StatusIcon = config.icon;
              
              return (
                <motion.div
                  key={lead.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="p-6 hover:bg-slate-50 transition-colors cursor-pointer"
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

                        {normalizeStatus(lead.status) !== 'closed' && normalizeStatus(lead.status) !== 'lost' && (
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
                            <option value="new">Marcar como Novo</option>
                            <option value="contacted">Marcar como Contatado</option>
                            <option value="negotiating">Marcar como Negociando</option>
                            <option value="closed">Marcar como Fechado</option>
                            <option value="lost">Marcar como Perdido</option>
                          </select>
                        )}
                      </div>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default LeadsView;
