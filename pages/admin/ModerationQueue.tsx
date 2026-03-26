import React, { useState, useEffect } from 'react';
import { 
  Check, 
  X, 
  Star, 
  Eye, 
  ChevronLeft, 
  ChevronRight,
  Filter,
  Search,
  AlertTriangle
} from 'lucide-react';
import { supabase } from '../../src/lib/supabaseClient';
import { useAdminAudit, ADMIN_ACTIONS, RESOURCE_TYPES } from '../../src/hooks/useAdminAudit';
import { toast } from 'sonner';
import {
  CATEGORY_HIERARCHY,
  getCategoryGroupBySlug,
  getGroupCategorySlugs
} from '../../src/lib/categoryHierarchy';

interface PendingAnnouncement {
  id: string;
  title: string;
  description: string;
  category: string;
  category_slug?: string;
  price: number;
  type: 'VENDA' | 'COMPRA';
  status: string;
  created_at: string;
  owner_id: string;
  owner?: {
    name: string;
    email: string;
    phone: string;
  };
  images?: string[];
}

const ModerationQueue: React.FC = () => {
  const { logAction } = useAdminAudit();
  const [announcements, setAnnouncements] = useState<PendingAnnouncement[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<PendingAnnouncement | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  
  const PAGE_SIZE = 20;

  useEffect(() => {
    loadPendingAnnouncements();
  }, [page, filterCategory, searchTerm]);

  const loadPendingAnnouncements = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('announcements')
        .select(`
          *,
          owner:users!announcements_owner_id_fkey (
            name,
            email,
            phone
          )
        `, { count: 'exact' })
        .eq('status', 'PENDING')
        .order('created_at', { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      if (filterCategory !== 'all') {
        const groupedCategorySlugs = getGroupCategorySlugs(filterCategory);
        if (groupedCategorySlugs.length > 0) {
          query = query.in('category_slug', groupedCategorySlugs);
        }
      }

      if (searchTerm) {
        query = query.or(`title.ilike.%${searchTerm}%,description.ilike.%${searchTerm}%`);
      }

      const { data, error, count } = await query;

      if (error) throw error;

      setAnnouncements(data || []);
      setTotalCount(count || 0);
    } catch (error) {
      console.error('[ModerationQueue] Erro ao carregar anúncios:', error);
      toast.error('Erro ao carregar anúncios pendentes');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (announcement: PendingAnnouncement) => {
    try {
      // 1. Buscar dados antigos
      const oldValue = {
        status: announcement.status,
        approved_at: null
      };

      // 2. Atualizar status
      const { error } = await supabase
        .from('announcements')
        .update({ 
          status: 'ACTIVE',
          approved_at: new Date().toISOString()
        })
        .eq('id', announcement.id);

      if (error) throw error;

      // 3. Registrar auditoria (OBRIGATÓRIO)
      await logAction({
        action: ADMIN_ACTIONS.APPROVE_AD,
        resourceType: RESOURCE_TYPES.ANNOUNCEMENT,
        resourceId: announcement.id,
        oldValue,
        newValue: {
          status: 'ACTIVE',
          approved_at: new Date().toISOString()
        },
        reason: `Anúncio "${announcement.title}" aprovado após revisão manual de conteúdo e compliance`
      });

      toast.success('Anúncio aprovado com sucesso!');
      loadPendingAnnouncements();
    } catch (error) {
      console.error('[ModerationQueue] Erro ao aprovar:', error);
      toast.error('Erro ao aprovar anúncio');
    }
  };

  const handleReject = async () => {
    if (!selectedAnnouncement || !rejectionReason.trim()) {
      toast.error('Informe o motivo da rejeição');
      return;
    }

    try {
      // 1. Buscar dados antigos
      const oldValue = {
        status: selectedAnnouncement.status,
        rejection_reason: null
      };

      // 2. Atualizar status
      const { error } = await supabase
        .from('announcements')
        .update({ 
          status: 'REJECTED',
          rejection_reason: rejectionReason,
          rejected_at: new Date().toISOString()
        })
        .eq('id', selectedAnnouncement.id);

      if (error) throw error;

      // 3. Registrar auditoria (OBRIGATÓRIO)
      await logAction({
        action: ADMIN_ACTIONS.REJECT_AD,
        resourceType: RESOURCE_TYPES.ANNOUNCEMENT,
        resourceId: selectedAnnouncement.id,
        oldValue,
        newValue: {
          status: 'REJECTED',
          rejection_reason: rejectionReason,
          rejected_at: new Date().toISOString()
        },
        reason: `Anúncio "${selectedAnnouncement.title}" rejeitado: ${rejectionReason}`
      });

      toast.success('Anúncio rejeitado');
      setShowRejectModal(false);
      setRejectionReason('');
      setSelectedAnnouncement(null);
      loadPendingAnnouncements();
    } catch (error) {
      console.error('[ModerationQueue] Erro ao rejeitar:', error);
      toast.error('Erro ao rejeitar anúncio');
    }
  };

  const handleFeature = async (announcement: PendingAnnouncement) => {
    try {
      // Aprovar e destacar simultaneamente
      const featuredUntil = new Date();
      featuredUntil.setDate(featuredUntil.getDate() + 30); // 30 dias de destaque

      const oldValue = {
        status: announcement.status,
        featured: false
      };

      const { error } = await supabase
        .from('announcements')
        .update({ 
          status: 'ACTIVE',
          featured: true,
          featured_until: featuredUntil.toISOString(),
          approved_at: new Date().toISOString()
        })
        .eq('id', announcement.id);

      if (error) throw error;

      // Registrar auditoria
      await logAction({
        action: ADMIN_ACTIONS.FEATURE_AD,
        resourceType: RESOURCE_TYPES.ANNOUNCEMENT,
        resourceId: announcement.id,
        oldValue,
        newValue: {
          status: 'ACTIVE',
          featured: true,
          featured_until: featuredUntil.toISOString()
        },
        reason: `Anúncio "${announcement.title}" aprovado e destacado por 30 dias`
      });

      toast.success('Anúncio aprovado e destacado!');
      loadPendingAnnouncements();
    } catch (error) {
      console.error('[ModerationQueue] Erro ao destacar:', error);
      toast.error('Erro ao destacar anúncio');
    }
  };

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  const getAnnouncementGroupLabel = (announcement: PendingAnnouncement) => {
    const groupName = getCategoryGroupBySlug(announcement.category_slug)?.name;
    return groupName || announcement.category || announcement.category_slug || 'Categoria';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black text-slate-900">Fila de Moderação</h1>
          <p className="text-slate-500 mt-1">
            {totalCount} anúncio{totalCount !== 1 ? 's' : ''} aguardando aprovação
          </p>
        </div>
        <button
          onClick={loadPendingAnnouncements}
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
                placeholder="Buscar por título ou descrição..."
                className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
          </div>

          {/* Category Filter */}
          <div className="flex items-center gap-2">
            <Filter className="w-5 h-5 text-slate-400" />
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              <option value="all">Todas as Categorias</option>
              {CATEGORY_HIERARCHY.map((group) => (
                <option key={group.slug} value={group.slug}>{group.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Announcements Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-black text-slate-600 uppercase tracking-wider">
                  Anúncio
                </th>
                <th className="px-6 py-3 text-left text-xs font-black text-slate-600 uppercase tracking-wider">
                  Categoria
                </th>
                <th className="px-6 py-3 text-left text-xs font-black text-slate-600 uppercase tracking-wider">
                  Tipo
                </th>
                <th className="px-6 py-3 text-left text-xs font-black text-slate-600 uppercase tracking-wider">
                  Anunciante
                </th>
                <th className="px-6 py-3 text-left text-xs font-black text-slate-600 uppercase tracking-wider">
                  Data
                </th>
                <th className="px-6 py-3 text-left text-xs font-black text-slate-600 uppercase tracking-wider">
                  Ações
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
              ) : announcements.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                    Nenhum anúncio pendente de moderação
                  </td>
                </tr>
              ) : (
                announcements.map((announcement) => (
                  <tr key={announcement.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-start gap-3">
                        <div className="w-16 h-16 bg-slate-100 rounded-lg flex-shrink-0 overflow-hidden">
                          {announcement.images?.[0] ? (
                            <img 
                              src={announcement.images[0]} 
                              alt={announcement.title}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-slate-400">
                              <AlertTriangle className="w-6 h-6" />
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-slate-900 truncate">{announcement.title}</p>
                          <p className="text-sm text-slate-500 line-clamp-2">{announcement.description}</p>
                          <p className="text-sm font-bold text-green-600 mt-1">
                            R$ {announcement.price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800">
                        {getAnnouncementGroupLabel(announcement)}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                        announcement.type === 'VENDA' 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-purple-100 text-purple-800'
                      }`}>
                        {announcement.type}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm">
                        <p className="font-semibold text-slate-900">{announcement.owner?.name}</p>
                        <p className="text-slate-500">{announcement.owner?.email}</p>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-500">
                      {new Date(announcement.created_at).toLocaleDateString('pt-BR', {
                        day: '2-digit',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleApprove(announcement)}
                          className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                          title="Aprovar"
                        >
                          <Check className="w-5 h-5" />
                        </button>
                        <button
                          onClick={() => {
                            setSelectedAnnouncement(announcement);
                            setShowRejectModal(true);
                          }}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Rejeitar"
                        >
                          <X className="w-5 h-5" />
                        </button>
                        <button
                          onClick={() => handleFeature(announcement)}
                          className="p-2 text-yellow-600 hover:bg-yellow-50 rounded-lg transition-colors"
                          title="Aprovar e Destacar"
                        >
                          <Star className="w-5 h-5" />
                        </button>
                        <button
                          onClick={() => window.open(`/anuncio/${announcement.id}`, '_blank')}
                          className="p-2 text-slate-600 hover:bg-slate-50 rounded-lg transition-colors"
                          title="Visualizar"
                        >
                          <Eye className="w-5 h-5" />
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
              Página {page + 1} de {totalPages} ({totalCount} total)
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(Math.max(0, page - 1))}
                disabled={page === 0}
                className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button
                onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
                disabled={page >= totalPages - 1}
                className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Reject Modal */}
      {showRejectModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6">
            <h3 className="text-xl font-bold text-slate-900 mb-4">Rejeitar Anúncio</h3>
            <p className="text-slate-600 mb-4">
              Informe o motivo da rejeição. Esta mensagem será enviada ao anunciante.
            </p>
            <textarea
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="Ex: Imagens de baixa qualidade, descrição incompleta, preço fora do padrão..."
              className="w-full border border-slate-200 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-red-500 min-h-[120px]"
            />
            <div className="flex items-center gap-3 mt-6">
              <button
                onClick={() => {
                  setShowRejectModal(false);
                  setRejectionReason('');
                  setSelectedAnnouncement(null);
                }}
                className="flex-1 px-4 py-2 border border-slate-200 text-slate-600 rounded-lg font-semibold hover:bg-slate-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleReject}
                disabled={!rejectionReason.trim()}
                className="flex-1 px-4 py-2 bg-red-500 text-white rounded-lg font-semibold hover:bg-red-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Rejeitar Anúncio
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ModerationQueue;
