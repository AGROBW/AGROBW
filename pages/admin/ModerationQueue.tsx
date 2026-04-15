import React, { useEffect, useState } from 'react';
import { AlertTriangle, Check, ChevronLeft, ChevronRight, Eye, Filter, PencilLine, Search, Star, X } from 'lucide-react';
import { supabase } from '../../src/lib/supabaseClient';
import { useAdminAudit, ADMIN_ACTIONS, RESOURCE_TYPES } from '../../src/hooks/useAdminAudit';
import { toast } from 'sonner';
import { CATEGORY_HIERARCHY, getCategoryGroupBySlug, getGroupCategorySlugs } from '../../src/lib/categoryHierarchy';

interface PendingAnnouncement {
  id: string;
  title: string;
  description: string;
  category?: string;
  category_slug?: string;
  price: number;
  status: string;
  created_at: string;
  user_id: string;
  city?: string | null;
  state?: string | null;
  product_condition?: string | null;
  availability?: string | null;
  accepts_trade?: boolean | null;
  has_warranty?: boolean | null;
  has_invoice?: boolean | null;
  owner?: { name: string; email: string; phone: string };
  images?: string[];
}

interface PendingTechnicalDetail {
  label: string;
  value: string;
  icon_name?: string | null;
}

interface PendingEditRequest {
  id: string;
  announcement_id: string;
  user_id: string;
  payload: Record<string, any>;
  technical_details: PendingTechnicalDetail[];
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  announcement?: PendingAnnouncement | null;
  requester?: { name: string; email: string; phone: string };
  current_technical_details?: PendingTechnicalDetail[];
}

type ModerationTab = 'announcements' | 'edits';
const PAGE_SIZE = 20;

const ModerationQueue: React.FC = () => {
  const { logAction } = useAdminAudit();
  const [activeTab, setActiveTab] = useState<ModerationTab>('announcements');
  const [announcements, setAnnouncements] = useState<PendingAnnouncement[]>([]);
  const [editRequests, setEditRequests] = useState<PendingEditRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [totalAnnouncementsCount, setTotalAnnouncementsCount] = useState(0);
  const [totalEditRequestsCount, setTotalEditRequestsCount] = useState(0);
  const [filterCategory, setFilterCategory] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<PendingAnnouncement | null>(null);
  const [selectedEditRequest, setSelectedEditRequest] = useState<PendingEditRequest | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [showRejectModal, setShowRejectModal] = useState(false);

  useEffect(() => setPage(0), [activeTab, filterCategory, searchTerm]);
  useEffect(() => { void (activeTab === 'announcements' ? loadPendingAnnouncements() : loadPendingEditRequests()); }, [activeTab, page, filterCategory, searchTerm]);

  const totalCount = activeTab === 'announcements' ? totalAnnouncementsCount : totalEditRequestsCount;
  const totalPages = Math.ceil(Math.max(totalCount, 1) / PAGE_SIZE);

  const fetchOwnersMap = async (ids: string[]) => {
    if (ids.length === 0) return new Map<string, PendingAnnouncement['owner']>();
    const { data, error } = await supabase.from('users').select('id,name,email,phone').in('id', ids);
    if (error) throw error;
    return new Map((data || []).map((owner) => [owner.id, { name: owner.name, email: owner.email, phone: owner.phone }]));
  };

  const fetchAnnouncementsMap = async (ids: string[]) => {
    if (ids.length === 0) return new Map<string, PendingAnnouncement>();
    const { data, error } = await supabase
      .from('announcements')
      .select('id,title,description,category_slug,price,status,created_at,user_id,city,state,product_condition,availability,accepts_trade,has_warranty,has_invoice,images')
      .in('id', ids);
    if (error) throw error;
    return new Map(((data || []) as PendingAnnouncement[]).map((item) => [item.id, item]));
  };

  const fetchTechnicalDetailsMap = async (announcementIds: string[]) => {
    if (announcementIds.length === 0) return new Map<string, PendingTechnicalDetail[]>();

    const { data, error } = await supabase
      .from('announcement_technical_details')
      .select('announcement_id,label,value,icon_name')
      .in('announcement_id', announcementIds);

    if (error) throw error;

    const map = new Map<string, PendingTechnicalDetail[]>();
    for (const item of data || []) {
      const current = map.get(item.announcement_id) || [];
      current.push({
        label: item.label,
        value: item.value,
        icon_name: item.icon_name,
      });
      map.set(item.announcement_id, current);
    }

    return map;
  };

  const loadPendingAnnouncements = async () => {
    setLoading(true);
    try {
      let query = supabase.from('announcements').select('*', { count: 'exact' }).eq('status', 'PENDING').order('created_at', { ascending: false }).range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
      if (filterCategory !== 'all') {
        const groupedCategorySlugs = getGroupCategorySlugs(filterCategory);
        if (groupedCategorySlugs.length > 0) query = query.in('category_slug', groupedCategorySlugs);
      }
      if (searchTerm) query = query.or(`title.ilike.%${searchTerm}%,description.ilike.%${searchTerm}%`);
      const { data, error, count } = await query;
      if (error) throw error;
      const rows = (data || []) as PendingAnnouncement[];
      const ownersMap = await fetchOwnersMap(Array.from(new Set(rows.map((item) => item.user_id).filter(Boolean))));
      setAnnouncements(rows.map((item) => ({ ...item, owner: item.user_id ? ownersMap.get(item.user_id) : undefined })));
      setTotalAnnouncementsCount(count || 0);
    } catch (error) {
      console.error('[ModerationQueue] Erro ao carregar anuncios:', error);
      toast.error('Erro ao carregar anuncios pendentes');
    } finally {
      setLoading(false);
    }
  };

  const loadPendingEditRequests = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.from('announcement_edit_requests').select('*').eq('status', 'pending').order('created_at', { ascending: false });
      if (error) throw error;
      let rows = ((data || []) as any[]).map((item) => ({ ...item, technical_details: Array.isArray(item.technical_details) ? item.technical_details : [] })) as PendingEditRequest[];
      const announcementMap = await fetchAnnouncementsMap(Array.from(new Set(rows.map((item) => item.announcement_id))));
      const technicalDetailsMap = await fetchTechnicalDetailsMap(Array.from(new Set(rows.map((item) => item.announcement_id))));
      const ownersMap = await fetchOwnersMap(Array.from(new Set(rows.map((item) => item.user_id))));
      rows = rows.map((item) => ({
        ...item,
        announcement: announcementMap.get(item.announcement_id) || null,
        requester: ownersMap.get(item.user_id),
        current_technical_details: technicalDetailsMap.get(item.announcement_id) || [],
      }));
      if (filterCategory !== 'all') {
        const grouped = getGroupCategorySlugs(filterCategory);
        rows = rows.filter((item) => grouped.includes(String(item.payload?.category_slug || item.announcement?.category_slug || '')));
      }
      if (searchTerm.trim()) {
        const term = searchTerm.trim().toLowerCase();
        rows = rows.filter((item) => String(item.payload?.title || item.announcement?.title || '').toLowerCase().includes(term) || String(item.payload?.description || item.announcement?.description || '').toLowerCase().includes(term));
      }
      setTotalEditRequestsCount(rows.length);
      setEditRequests(rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE));
    } catch (error) {
      console.error('[ModerationQueue] Erro ao carregar edicoes:', error);
      toast.error('Erro ao carregar edicoes pendentes');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (announcement: PendingAnnouncement) => {
    try {
      const { error } = await supabase.from('announcements').update({ status: 'ACTIVE' }).eq('id', announcement.id);
      if (error) throw error;
      await logAction({ action: ADMIN_ACTIONS.APPROVE_AD, resourceType: RESOURCE_TYPES.ANNOUNCEMENT, resourceId: announcement.id, oldValue: { status: announcement.status }, newValue: { status: 'ACTIVE' }, reason: `Anuncio "${announcement.title}" aprovado apos revisao manual` });
      toast.success('Anuncio aprovado com sucesso');
      await loadPendingAnnouncements();
    } catch (error) {
      console.error('[ModerationQueue] Erro ao aprovar:', error);
      toast.error('Erro ao aprovar anuncio');
    }
  };

  const handleFeature = async (announcement: PendingAnnouncement) => {
    try {
      const { error } = await supabase.from('announcements').update({ status: 'ACTIVE' }).eq('id', announcement.id);
      if (error) throw error;
      await logAction({ action: ADMIN_ACTIONS.FEATURE_AD, resourceType: RESOURCE_TYPES.ANNOUNCEMENT, resourceId: announcement.id, oldValue: { status: announcement.status }, newValue: { status: 'ACTIVE' }, reason: `Anuncio "${announcement.title}" aprovado com prioridade manual` });
      toast.success('Anuncio aprovado');
      await loadPendingAnnouncements();
    } catch (error) {
      console.error('[ModerationQueue] Erro ao destacar:', error);
      toast.error('Erro ao destacar anuncio');
    }
  };

  const handleApproveEditRequest = async (request: PendingEditRequest) => {
    if (!request.announcement) return toast.error('Anuncio original nao encontrado');
    try {
      const { data: authData } = await supabase.auth.getUser();
      const reviewerId = authData.user?.id || null;
      const { data: updatedAnnouncement, error: announcementError } = await supabase
        .from('announcements')
        .update(request.payload || {})
        .eq('id', request.announcement_id)
        .select('id,title,description,category_slug,price,status,created_at,user_id,images')
        .single();
      if (announcementError) throw announcementError;
      await supabase.from('announcement_technical_details').delete().eq('announcement_id', request.announcement_id);
      const details = (request.technical_details || []).map((detail) => ({ announcement_id: request.announcement_id, label: detail.label, value: detail.value, icon_name: detail.icon_name || 'Circle' }));
      if (details.length > 0) {
        const { error: detailsError } = await supabase.from('announcement_technical_details').insert(details);
        if (detailsError) throw detailsError;
      }
      const { error: requestError } = await supabase.from('announcement_edit_requests').update({ status: 'approved', reviewed_at: new Date().toISOString(), reviewed_by: reviewerId, rejection_reason: null }).eq('id', request.id);
      if (requestError) throw requestError;
      await logAction({
        action: ADMIN_ACTIONS.APPROVE_AD_EDIT,
        resourceType: RESOURCE_TYPES.ANNOUNCEMENT,
        resourceId: request.announcement_id,
        oldValue: {
          title: request.announcement.title,
          description: request.announcement.description,
          price: request.announcement.price,
          category_slug: request.announcement.category_slug,
          images: request.announcement.images || [],
          technical_details: request.current_technical_details || [],
        },
        newValue: {
          ...(updatedAnnouncement || request.payload),
          technical_details: request.technical_details || [],
        },
        reason: `Edicao do anuncio "${request.announcement.title}" aprovada pela moderacao`,
      });
      toast.success('Edicao aprovada e aplicada');
      setSelectedEditRequest(null);
      await loadPendingEditRequests();
    } catch (error) {
      console.error('[ModerationQueue] Erro ao aprovar edicao:', error);
      toast.error('Erro ao aprovar edicao');
    }
  };

  const handleReject = async () => {
    if (!rejectionReason.trim()) return toast.error('Informe o motivo da rejeicao');
    try {
      if (selectedEditRequest) {
        const { data: authData } = await supabase.auth.getUser();
        const reviewerId = authData.user?.id || null;
        const { error } = await supabase.from('announcement_edit_requests').update({ status: 'rejected', rejection_reason: rejectionReason, reviewed_at: new Date().toISOString(), reviewed_by: reviewerId }).eq('id', selectedEditRequest.id);
        if (error) throw error;
        const { data: notificationRecord, error: notificationError } = await supabase.from('notifications').insert({
          user_id: selectedEditRequest.user_id,
          type: 'ad_edit_rejected',
          title: 'Sua alteracao nao foi aprovada',
          content: `A equipe revisou a alteracao do anuncio "${selectedEditRequest.announcement?.title || 'seu anuncio'}" e ela foi rejeitada. Motivo: ${rejectionReason}`,
          link: '/minha-conta/anuncios',
          is_read: false,
        }).select('id').single();
        if (notificationError) {
          console.error('[ModerationQueue] Erro ao criar notificacao de rejeicao da edicao:', notificationError);
        } else {
          const recipientEmail = selectedEditRequest.requester?.email?.trim() || null;
          const recipientName = selectedEditRequest.requester?.name?.trim() || 'Cliente';
          const { error: emailJobError } = await supabase.from('plan_alert_email_jobs').insert({
            notification_id: notificationRecord.id,
            user_id: selectedEditRequest.user_id,
            recipient_email: recipientEmail,
            recipient_name: recipientName,
            alert_kind: 'edit_rejected',
            notification_title: 'Sua alteracao nao foi aprovada',
            notification_content: `A equipe revisou a alteracao do anuncio "${selectedEditRequest.announcement?.title || 'seu anuncio'}" e ela foi rejeitada. Motivo: ${rejectionReason}`,
            link: '/minha-conta/anuncios',
            status: recipientEmail ? 'pending' : 'skipped',
            last_error: recipientEmail ? null : 'Usuario sem e-mail valido',
          });

          if (emailJobError) {
            console.error('[ModerationQueue] Erro ao criar job de e-mail para rejeicao da edicao:', emailJobError);
          }
        }
        await logAction({ action: ADMIN_ACTIONS.REJECT_AD_EDIT, resourceType: RESOURCE_TYPES.ANNOUNCEMENT, resourceId: selectedEditRequest.announcement_id, oldValue: selectedEditRequest.payload, newValue: { status: 'rejected', rejection_reason: rejectionReason }, reason: `Edicao rejeitada: ${rejectionReason}` });
        toast.success('Edicao rejeitada');
        setSelectedEditRequest(null);
        await loadPendingEditRequests();
      } else if (selectedAnnouncement) {
        const rejectedAt = new Date().toISOString();
        const { error } = await supabase.from('announcements').update({ status: 'REJECTED', rejection_reason: rejectionReason, rejected_at: rejectedAt }).eq('id', selectedAnnouncement.id);
        if (error) throw error;
        await logAction({ action: ADMIN_ACTIONS.REJECT_AD, resourceType: RESOURCE_TYPES.ANNOUNCEMENT, resourceId: selectedAnnouncement.id, oldValue: { status: selectedAnnouncement.status }, newValue: { status: 'REJECTED', rejection_reason: rejectionReason, rejected_at: rejectedAt }, reason: `Anuncio "${selectedAnnouncement.title}" rejeitado: ${rejectionReason}` });
        toast.success('Anuncio rejeitado');
        setSelectedAnnouncement(null);
        await loadPendingAnnouncements();
      }
      setShowRejectModal(false);
      setRejectionReason('');
    } catch (error) {
      console.error('[ModerationQueue] Erro ao rejeitar:', error);
      toast.error('Erro ao rejeitar item');
    }
  };

  const getAnnouncementGroupLabel = (announcement: PendingAnnouncement) => getCategoryGroupBySlug(announcement.category_slug)?.name || announcement.category || announcement.category_slug || 'Categoria';
  const getEditRequestGroupLabel = (request: PendingEditRequest) => getCategoryGroupBySlug(String(request.payload?.category_slug || request.announcement?.category_slug || ''))?.name || request.announcement?.category || 'Categoria';
  const getEditHighlights = (request: PendingEditRequest) => {
    const current = request.announcement; if (!current) return ['Anuncio indisponivel'];
    const next = request.payload || {}; const changes: string[] = [];
    if ((next.title || '') !== (current.title || '')) changes.push('Titulo');
    if ((next.description || '') !== (current.description || '')) changes.push('Descricao');
    if (Number(next.price ?? current.price) !== Number(current.price)) changes.push('Preco');
    if ((next.category_slug || current.category_slug || '') !== (current.category_slug || '')) changes.push('Categoria');
    if (JSON.stringify(next.images || current.images || []) !== JSON.stringify(current.images || [])) changes.push('Midia');
    if ((request.technical_details || []).length > 0) changes.push('Ficha tecnica');
    return changes.length > 0 ? changes : ['Dados gerais'];
  };

  const buildEditComparisonRows = (request: PendingEditRequest) => {
    const current = request.announcement;
    if (!current) return [];

    const next = request.payload || {};
    const rows: Array<{ label: string; before: string; after: string }> = [];

    const pushRow = (label: string, beforeValue: unknown, afterValue: unknown) => {
      const before = String(beforeValue ?? '').trim();
      const after = String(afterValue ?? '').trim();
      if (before !== after) {
        rows.push({
          label,
          before: before || 'Nao informado',
          after: after || 'Nao informado',
        });
      }
    };

    pushRow('Titulo', current.title, next.title ?? current.title);
    pushRow('Descricao', current.description, next.description ?? current.description);
    pushRow('Preco', current.price, next.price ?? current.price);
    pushRow('Categoria', current.category_slug, next.category_slug ?? current.category_slug);
    pushRow('Cidade', current.city ?? '', next.city ?? current.city ?? '');
    pushRow('Estado', current.state ?? '', next.state ?? current.state ?? '');
    pushRow('Condicao', current.product_condition ?? '', next.product_condition ?? current.product_condition ?? '');
    pushRow('Disponibilidade', current.availability ?? '', next.availability ?? current.availability ?? '');
    pushRow('Aceita troca', current.accepts_trade ? 'Sim' : 'Nao', next.accepts_trade ? 'Sim' : 'Nao');
    pushRow('Garantia', current.has_warranty ? 'Sim' : 'Nao', next.has_warranty ? 'Sim' : 'Nao');
    pushRow('Nota fiscal', current.has_invoice ? 'Sim' : 'Nao', next.has_invoice ? 'Sim' : 'Nao');

    const currentImages = Array.isArray(current.images) ? current.images.length : 0;
    const nextImages = Array.isArray(next.images) ? next.images.length : currentImages;
    pushRow('Midia', `${currentImages} arquivo(s)`, `${nextImages} arquivo(s)`);

    const currentTechnical = new Map((request.current_technical_details || []).map((item) => [item.label, item.value]));
    const nextTechnical = new Map((request.technical_details || []).map((item) => [item.label, item.value]));
    const labels = new Set([...currentTechnical.keys(), ...nextTechnical.keys()]);
    for (const label of labels) {
      pushRow(`Ficha tecnica: ${label}`, currentTechnical.get(label) || '', nextTechnical.get(label) || '');
    }

    return rows;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="mt-1 text-3xl font-black text-slate-900">Fila de Moderacao</h1>
          <p className="mt-1 text-slate-500">{activeTab === 'announcements' ? `${totalAnnouncementsCount} anuncio${totalAnnouncementsCount !== 1 ? 's' : ''} aguardando aprovacao` : `${totalEditRequestsCount} edicao${totalEditRequestsCount !== 1 ? 'oes' : ''} aguardando aprovacao`}</p>
        </div>
        <button onClick={() => void (activeTab === 'announcements' ? loadPendingAnnouncements() : loadPendingEditRequests())} className="rounded-lg bg-green-500 px-4 py-2 font-semibold text-white hover:bg-green-600">Atualizar</button>
      </div>

      <div className="flex flex-wrap gap-3">
        <button type="button" onClick={() => setActiveTab('announcements')} className={`inline-flex items-center gap-2 rounded-2xl px-4 py-2 text-sm font-black ${activeTab === 'announcements' ? 'bg-slate-900 text-white' : 'border border-slate-200 bg-white text-slate-600'}`}>Novos anuncios <span className={`rounded-full px-2 py-0.5 text-[11px] ${activeTab === 'announcements' ? 'bg-white/15 text-white' : 'bg-slate-100 text-slate-600'}`}>{totalAnnouncementsCount}</span></button>
        <button type="button" onClick={() => setActiveTab('edits')} className={`inline-flex items-center gap-2 rounded-2xl px-4 py-2 text-sm font-black ${activeTab === 'edits' ? 'bg-slate-900 text-white' : 'border border-slate-200 bg-white text-slate-600'}`}>Edicoes <span className={`rounded-full px-2 py-0.5 text-[11px] ${activeTab === 'edits' ? 'bg-white/15 text-white' : 'bg-slate-100 text-slate-600'}`}>{totalEditRequestsCount}</span></button>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-col gap-4 md:flex-row">
          <div className="flex-1"><div className="relative"><Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" /><input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder={activeTab === 'announcements' ? 'Buscar por titulo ou descricao...' : 'Buscar alteracoes por titulo ou descricao...'} className="w-full rounded-lg border border-slate-200 py-2 pl-10 pr-4 focus:outline-none focus:ring-2 focus:ring-green-500" /></div></div>
          <div className="flex items-center gap-2"><Filter className="h-5 w-5 text-slate-400" /><select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} className="rounded-lg border border-slate-200 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-green-500"><option value="all">Todas as Categorias</option>{CATEGORY_HIERARCHY.map((group) => <option key={group.slug} value={group.slug}>{group.name}</option>)}</select></div>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          {activeTab === 'announcements' ? (
            <table className="w-full">
              <thead className="border-b border-slate-200 bg-slate-50"><tr><th className="px-6 py-3 text-left text-xs font-black uppercase tracking-wider text-slate-600">Anuncio</th><th className="px-6 py-3 text-left text-xs font-black uppercase tracking-wider text-slate-600">Categoria</th><th className="px-6 py-3 text-left text-xs font-black uppercase tracking-wider text-slate-600">Anunciante</th><th className="px-6 py-3 text-left text-xs font-black uppercase tracking-wider text-slate-600">Data</th><th className="px-6 py-3 text-left text-xs font-black uppercase tracking-wider text-slate-600">Acoes</th></tr></thead>
              <tbody className="divide-y divide-slate-200">
                {loading ? <tr><td colSpan={5} className="px-6 py-12 text-center"><div className="flex items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-b-2 border-green-600"></div></div></td></tr> : announcements.length === 0 ? <tr><td colSpan={5} className="px-6 py-12 text-center text-slate-500">Nenhum anuncio pendente de moderacao</td></tr> : announcements.map((announcement) => (
                  <tr key={announcement.id} className="transition-colors hover:bg-slate-50">
                    <td className="px-6 py-4"><div className="flex items-start gap-3"><div className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-lg bg-slate-100">{announcement.images?.[0] ? <img src={announcement.images[0]} alt={announcement.title} className="h-full w-full object-cover" /> : <div className="flex h-full w-full items-center justify-center text-slate-400"><AlertTriangle className="h-6 w-6" /></div>}</div><div className="min-w-0 flex-1"><p className="truncate font-semibold text-slate-900">{announcement.title}</p><p className="line-clamp-2 text-sm text-slate-500">{announcement.description}</p><p className="mt-1 text-sm font-bold text-green-600">R$ {announcement.price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p></div></div></td>
                    <td className="px-6 py-4"><span className="inline-flex rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-800">{getAnnouncementGroupLabel(announcement)}</span></td>
                    <td className="px-6 py-4"><div className="text-sm"><p className="font-semibold text-slate-900">{announcement.owner?.name}</p><p className="text-slate-500">{announcement.owner?.email}</p></div></td>
                    <td className="px-6 py-4 text-sm text-slate-500">{new Date(announcement.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
                    <td className="px-6 py-4"><div className="flex items-center gap-2"><button onClick={() => void handleApprove(announcement)} className="rounded-lg p-2 text-green-600 hover:bg-green-50" title="Aprovar"><Check className="h-5 w-5" /></button><button onClick={() => { setSelectedEditRequest(null); setSelectedAnnouncement(announcement); setShowRejectModal(true); }} className="rounded-lg p-2 text-red-600 hover:bg-red-50" title="Rejeitar"><X className="h-5 w-5" /></button><button onClick={() => void handleFeature(announcement)} className="rounded-lg p-2 text-yellow-600 hover:bg-yellow-50" title="Aprovar e destacar"><Star className="h-5 w-5" /></button><button onClick={() => window.open(`/#/anuncio/${announcement.id}`, '_blank')} className="rounded-lg p-2 text-slate-600 hover:bg-slate-50" title="Visualizar"><Eye className="h-5 w-5" /></button></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <table className="w-full">
              <thead className="border-b border-slate-200 bg-slate-50"><tr><th className="px-6 py-3 text-left text-xs font-black uppercase tracking-wider text-slate-600">Anuncio</th><th className="px-6 py-3 text-left text-xs font-black uppercase tracking-wider text-slate-600">Alteracoes</th><th className="px-6 py-3 text-left text-xs font-black uppercase tracking-wider text-slate-600">Anunciante</th><th className="px-6 py-3 text-left text-xs font-black uppercase tracking-wider text-slate-600">Data</th><th className="px-6 py-3 text-left text-xs font-black uppercase tracking-wider text-slate-600">Acoes</th></tr></thead>
              <tbody className="divide-y divide-slate-200">
                {loading ? <tr><td colSpan={5} className="px-6 py-12 text-center"><div className="flex items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-b-2 border-green-600"></div></div></td></tr> : editRequests.length === 0 ? <tr><td colSpan={5} className="px-6 py-12 text-center text-slate-500">Nenhuma edicao pendente de moderacao</td></tr> : editRequests.map((request) => {
                  const currentTitle = request.announcement?.title || 'Anuncio indisponivel';
                  const proposedTitle = request.payload?.title || currentTitle;
                  const currentPrice = Number(request.announcement?.price || 0);
                  const proposedPrice = Number(request.payload?.price ?? currentPrice);
                  return (
                    <tr key={request.id} className="transition-colors hover:bg-slate-50">
                      <td className="px-6 py-4"><div className="space-y-1"><div className="flex items-center gap-2"><span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-black text-amber-700"><PencilLine className="h-3.5 w-3.5" />Edicao</span><span className="inline-flex rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-800">{getEditRequestGroupLabel(request)}</span></div><p className="font-semibold text-slate-900">{currentTitle}</p>{proposedTitle !== currentTitle ? <p className="text-sm text-slate-500">Novo titulo: <span className="font-semibold text-slate-700">{proposedTitle}</span></p> : null}{proposedPrice !== currentPrice ? <p className="text-sm text-slate-500">Preco: <span className="font-semibold text-slate-700">R$ {currentPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span> para <span className="font-semibold text-green-700">R$ {proposedPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span></p> : null}</div></td>
                      <td className="px-6 py-4"><div className="flex max-w-xs flex-wrap gap-2">{getEditHighlights(request).map((change) => <span key={change} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">{change}</span>)}</div></td>
                      <td className="px-6 py-4"><div className="text-sm"><p className="font-semibold text-slate-900">{request.requester?.name}</p><p className="text-slate-500">{request.requester?.email}</p></div></td>
                      <td className="px-6 py-4 text-sm text-slate-500">{new Date(request.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
                      <td className="px-6 py-4"><div className="flex items-center gap-2"><button onClick={() => void handleApproveEditRequest(request)} className="rounded-lg p-2 text-green-600 hover:bg-green-50" title="Aprovar edicao"><Check className="h-5 w-5" /></button><button onClick={() => { setSelectedAnnouncement(null); setSelectedEditRequest(request); setShowRejectModal(true); }} className="rounded-lg p-2 text-red-600 hover:bg-red-50" title="Rejeitar edicao"><X className="h-5 w-5" /></button><button onClick={() => setSelectedEditRequest(request)} className="rounded-lg p-2 text-slate-600 hover:bg-slate-50" title="Ver antes e depois"><Eye className="h-5 w-5" /></button></div></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {totalPages > 1 ? <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-6 py-4"><p className="text-sm text-slate-500">Pagina {page + 1} de {totalPages} ({totalCount} total)</p><div className="flex items-center gap-2"><button onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0} className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"><ChevronLeft className="h-5 w-5" /></button><button onClick={() => setPage(Math.min(totalPages - 1, page + 1))} disabled={page >= totalPages - 1} className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"><ChevronRight className="h-5 w-5" /></button></div></div> : null}

      {showRejectModal ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"><div className="w-full max-w-md rounded-2xl bg-white p-6"><h3 className="mb-4 text-xl font-bold text-slate-900">{selectedEditRequest ? 'Rejeitar Edicao' : 'Rejeitar Anuncio'}</h3><p className="mb-4 text-slate-600">Informe o motivo da rejeicao. Esta mensagem ficara registrada para a equipe.</p><textarea value={rejectionReason} onChange={(e) => setRejectionReason(e.target.value)} placeholder="Ex: descricao inconsistente, midia inadequada, categoria incorreta..." className="min-h-[120px] w-full rounded-lg border border-slate-200 p-3 focus:outline-none focus:ring-2 focus:ring-red-500" /><div className="mt-6 flex items-center gap-3"><button onClick={() => { setShowRejectModal(false); setRejectionReason(''); setSelectedAnnouncement(null); setSelectedEditRequest(null); }} className="flex-1 rounded-lg border border-slate-200 px-4 py-2 font-semibold text-slate-600 hover:bg-slate-50">Cancelar</button><button onClick={() => void handleReject()} disabled={!rejectionReason.trim()} className="flex-1 rounded-lg bg-red-500 px-4 py-2 font-semibold text-white hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-50">Confirmar rejeicao</button></div></div></div> : null}

      {selectedEditRequest && !showRejectModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-5xl rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">Revisao de edicao</p>
                <h3 className="mt-1 text-2xl font-black text-slate-900">{selectedEditRequest.announcement?.title || 'Anuncio indisponivel'}</h3>
                <p className="mt-1 text-sm text-slate-500">
                  Compare o anuncio atual com a versao enviada pelo anunciante antes de aprovar.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedEditRequest(null)}
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
                title="Fechar"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-6 grid gap-6 lg:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">Versao atual</p>
                <div className="mt-4 space-y-3 text-sm text-slate-700">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Titulo</p>
                    <p className="mt-1 font-semibold text-slate-900">{selectedEditRequest.announcement?.title || 'Nao informado'}</p>
                  </div>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Descricao</p>
                    <p className="mt-1 whitespace-pre-wrap">{selectedEditRequest.announcement?.description || 'Nao informado'}</p>
                  </div>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Ficha tecnica</p>
                    <div className="mt-2 space-y-2">
                      {(selectedEditRequest.current_technical_details || []).length > 0 ? (
                        selectedEditRequest.current_technical_details?.map((detail) => (
                          <div key={`current-${detail.label}`} className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                            <p className="text-xs font-semibold text-slate-400">{detail.label}</p>
                            <p className="mt-1 text-sm text-slate-700">{detail.value}</p>
                          </div>
                        ))
                      ) : (
                        <p className="text-sm text-slate-500">Sem ficha tecnica cadastrada.</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-5">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-700">Versao proposta</p>
                <div className="mt-4 space-y-3 text-sm text-slate-700">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Titulo</p>
                    <p className="mt-1 font-semibold text-slate-900">{selectedEditRequest.payload?.title || selectedEditRequest.announcement?.title || 'Nao informado'}</p>
                  </div>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Descricao</p>
                    <p className="mt-1 whitespace-pre-wrap">{selectedEditRequest.payload?.description || selectedEditRequest.announcement?.description || 'Nao informado'}</p>
                  </div>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Ficha tecnica</p>
                    <div className="mt-2 space-y-2">
                      {(selectedEditRequest.technical_details || []).length > 0 ? (
                        selectedEditRequest.technical_details?.map((detail) => (
                          <div key={`next-${detail.label}`} className="rounded-xl border border-emerald-200 bg-white px-3 py-2">
                            <p className="text-xs font-semibold text-slate-400">{detail.label}</p>
                            <p className="mt-1 text-sm text-slate-700">{detail.value}</p>
                          </div>
                        ))
                      ) : (
                        <p className="text-sm text-slate-500">Sem ficha tecnica proposta.</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">Resumo do que muda</p>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {buildEditComparisonRows(selectedEditRequest).map((row) => (
                  <div key={row.label} className="rounded-xl border border-slate-200 p-4">
                    <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">{row.label}</p>
                    <p className="mt-2 text-sm text-slate-500">Antes: <span className="font-semibold text-slate-700">{row.before}</span></p>
                    <p className="mt-1 text-sm text-slate-500">Depois: <span className="font-semibold text-emerald-700">{row.after}</span></p>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setSelectedEditRequest(null)}
                className="rounded-lg border border-slate-200 px-4 py-2 font-semibold text-slate-600 hover:bg-slate-50"
              >
                Fechar
              </button>
              <button
                type="button"
                onClick={() => {
                  setSelectedAnnouncement(null);
                  setShowRejectModal(true);
                }}
                className="rounded-lg bg-red-500 px-4 py-2 font-semibold text-white hover:bg-red-600"
              >
                Rejeitar
              </button>
              <button
                type="button"
                onClick={() => void handleApproveEditRequest(selectedEditRequest)}
                className="rounded-lg bg-green-600 px-4 py-2 font-semibold text-white hover:bg-green-700"
              >
                Aprovar e aplicar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default ModerationQueue;
