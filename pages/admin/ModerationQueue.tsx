import React, { useEffect, useState } from 'react';
import { AlertTriangle, Check, ChevronLeft, ChevronRight, Eye, Filter, PencilLine, Search, X } from 'lucide-react';
import { supabase } from '../../src/lib/supabaseClient';
import { useAdminAudit, ADMIN_ACTIONS, RESOURCE_TYPES } from '../../src/hooks/useAdminAudit';
import { toast } from 'sonner';
import { CATEGORY_HIERARCHY, getCategoryGroupBySlug, getGroupCategorySlugs } from '../../src/lib/categoryHierarchy';
import { formatPublicationModerationReasons, parsePublicationModerationReasons } from '../../src/utils/publicationModeration';
import { appError, appWarn } from '../../src/utils/appLogger';

interface PendingAnnouncement {
  id: string;
  title: string;
  description: string;
  category?: string;
  category_id?: string | null;
  category_slug?: string;
  sub_category_id?: string | null;
  sub_category_label?: string | null;
  price: number;
  unit_price?: number | null;
  quantity?: number | null;
  unit?: string | null;
  currency?: string | null;
  status: string;
  created_at: string;
  user_id: string;
  city?: string | null;
  state?: string | null;
  cep?: string | null;
  product_condition?: string | null;
  availability?: string | null;
  accepts_trade?: boolean | null;
  has_warranty?: boolean | null;
  warranty_details?: string | null;
  has_invoice?: boolean | null;
  video_url?: string | null;
  video_storage_path?: string | null;
  video_thumbnail_url?: string | null;
  video_thumbnail_storage_path?: string | null;
  video_duration_seconds?: number | null;
  video_size_bytes?: number | null;
  is_premium?: boolean | null;
  whatsapp?: string | null;
  publication_review_reasons?: unknown;
  publication_review_severity?: string | null;
  community_reports_count?: number | null;
  community_report_reasons?: unknown;
  community_reported_to_review_at?: string | null;
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

interface PublicationModerationRuleRecord {
  id: string;
  name: string;
  description?: string | null;
  rule_kind: 'keyword' | 'regex' | 'category' | 'min_description_length' | 'contact_info' | 'external_link' | 'require_image';
  action: 'review' | 'block';
  target: 'title' | 'description' | 'both' | 'category' | 'images';
  pattern?: string | null;
  is_active: boolean;
}

type ModerationTab = 'announcements' | 'edits';
const PAGE_SIZE = 20;
const ANNOUNCEMENT_EDIT_SELECT =
  'id,title,description,price,unit_price,quantity,unit,currency,category_id,category_slug,sub_category_id,sub_category_label,status,created_at,user_id,city,state,cep,product_condition,availability,accepts_trade,has_warranty,warranty_details,has_invoice,images,video_url,video_storage_path,video_thumbnail_url,video_thumbnail_storage_path,video_duration_seconds,video_size_bytes,is_premium,whatsapp,publication_review_reasons,publication_review_severity';
const EDITABLE_ANNOUNCEMENT_FIELDS = new Set([
  'title',
  'description',
  'price',
  'unit_price',
  'quantity',
  'unit',
  'currency',
  'category_id',
  'category_slug',
  'sub_category_id',
  'sub_category_label',
  'city',
  'state',
  'cep',
  'product_condition',
  'availability',
  'accepts_trade',
  'has_warranty',
  'warranty_details',
  'has_invoice',
  'images',
  'video_url',
  'video_storage_path',
  'video_thumbnail_url',
  'video_thumbnail_storage_path',
  'video_duration_seconds',
  'video_size_bytes',
  'is_premium',
  'whatsapp',
]);

const sanitizeAnnouncementPayload = (payload: Record<string, any> = {}) =>
  Object.fromEntries(
    Object.entries(payload).filter(([key, value]) => EDITABLE_ANNOUNCEMENT_FIELDS.has(key) && value !== undefined)
  );

const getOriginalAnnouncementStatusFromRequest = (request: PendingEditRequest) => {
  const rawStatus = String(request.payload?.__original_announcement_status || request.announcement?.status || 'ACTIVE').trim().toUpperCase();
  return rawStatus || 'ACTIVE';
};

const splitRulePatterns = (value?: string | null) =>
  String(value || '')
    .split(/[\n,;]+/)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

const getRuleMessage = (rule: PublicationModerationRuleRecord) => rule.description?.trim() || rule.name;

const getModerationRuleMatches = (
  rules: PublicationModerationRuleRecord[],
  content: {
    title?: string | null;
    description?: string | null;
    categorySlug?: string | null;
    images?: string[] | null;
  }
) => {
  const title = String(content.title || '');
  const description = String(content.description || '');
  const categorySlug = String(content.categorySlug || '').trim().toLowerCase();
  const images = Array.isArray(content.images) ? content.images : [];
  const titleLower = title.toLowerCase();
  const descriptionLower = description.toLowerCase();
  const result = {
    title: [] as string[],
    description: [] as string[],
    category: [] as string[],
    images: [] as string[],
  };

  for (const rule of rules.filter((item) => item.is_active)) {
    const patterns = splitRulePatterns(rule.pattern);
    let matchedTitle = false;
    let matchedDescription = false;
    let matchedCategory = false;
    let matchedImages = false;

    if (rule.rule_kind === 'keyword' && patterns.length > 0) {
      matchedTitle =
        (rule.target === 'title' || rule.target === 'both') &&
        patterns.some((pattern) => titleLower.includes(pattern));
      matchedDescription =
        (rule.target === 'description' || rule.target === 'both') &&
        patterns.some((pattern) => descriptionLower.includes(pattern));
    } else if (rule.rule_kind === 'regex' && patterns.length > 0) {
      for (const pattern of patterns) {
        try {
          const regex = new RegExp(pattern, 'i');
          if ((rule.target === 'title' || rule.target === 'both') && regex.test(title)) {
            matchedTitle = true;
          }
          if ((rule.target === 'description' || rule.target === 'both') && regex.test(description)) {
            matchedDescription = true;
          }
        } catch {
          continue;
        }
      }
    } else if (rule.rule_kind === 'category' && patterns.length > 0) {
      matchedCategory = patterns.includes(categorySlug);
    } else if (rule.rule_kind === 'min_description_length') {
      const minLength = Number(String(rule.pattern || '').replace(/\D/g, '')) || 0;
      matchedDescription = minLength > 0 && description.trim().length < minLength;
    } else if (rule.rule_kind === 'contact_info') {
      const regex = /(\+?\d[\d\s().-]{7,}\d|[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})/i;
      matchedTitle = regex.test(title);
      matchedDescription = regex.test(description);
    } else if (rule.rule_kind === 'external_link') {
      const regex = /(https?:\/\/|www\.|\.com\b|\.com\.br\b|\.net\b|\.br\b)/i;
      matchedTitle = regex.test(title);
      matchedDescription = regex.test(description);
    } else if (rule.rule_kind === 'require_image') {
      matchedImages = images.length === 0;
    }

    const message = getRuleMessage(rule);
    if (matchedTitle) result.title.push(message);
    if (matchedDescription) result.description.push(message);
    if (matchedCategory) result.category.push(message);
    if (matchedImages) result.images.push(message);
  }

  result.title = Array.from(new Set(result.title));
  result.description = Array.from(new Set(result.description));
  result.category = Array.from(new Set(result.category));
  result.images = Array.from(new Set(result.images));

  return result;
};

const conditionLabels: Record<string, string> = {
  novo: 'Novo',
  seminovo: 'Seminovo',
  usado: 'Usado',
};

const availabilityLabels: Record<string, string> = {
  pronta_entrega: 'Pronta entrega',
  sob_encomenda: 'Sob encomenda',
  consultar_estoque: 'Consultar estoque',
};

const getValueOrFallback = (value: unknown, fallback = 'Não informado') => {
  if (typeof value === 'boolean') return value ? 'Sim' : 'Não';
  const normalized = String(value ?? '').trim();
  return normalized || fallback;
};

const formatCondition = (value: unknown) => {
  const normalized = String(value ?? '').trim();
  return conditionLabels[normalized] || getValueOrFallback(normalized);
};

const formatAvailability = (value: unknown) => {
  const normalized = String(value ?? '').trim();
  return availabilityLabels[normalized] || getValueOrFallback(normalized);
};

const formatVideoDuration = (value: unknown) => {
  const totalSeconds = Number(value || 0);
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) return 'Duracao nao informada';
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return minutes > 0 ? `${minutes}min ${String(seconds).padStart(2, '0')}s` : `${seconds}s`;
};

const formatCommunityReportSummary = (value: unknown) => {
  if (!Array.isArray(value)) return '';

  const parts = value
    .map((item) => {
      const reason = String((item as any)?.reason || '').trim();
      const count = Number((item as any)?.count || 0);
      if (!reason || count <= 0) return '';

      const labelMap: Record<string, string> = {
        inappropriate_content: 'Conteúdo impróprio',
        wrong_category: 'Categoria incorreta',
        fraud_or_scam: 'Possível golpe',
        false_information: 'Informação falsa',
        prohibited_item: 'Item proibido',
        duplicate_or_spam: 'Duplicado ou spam',
        other: 'Outro motivo',
      };

      return `${labelMap[reason] || reason} (${count})`;
    })
    .filter(Boolean);

  return parts.join(' | ');
};

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
  const [publicationRules, setPublicationRules] = useState<PublicationModerationRuleRecord[]>([]);

  useEffect(() => setPage(0), [activeTab, filterCategory, searchTerm]);
  useEffect(() => { void (activeTab === 'announcements' ? loadPendingAnnouncements() : loadPendingEditRequests()); }, [activeTab, page, filterCategory, searchTerm]);
  useEffect(() => { void loadPublicationRules(); }, []);

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
      .select(ANNOUNCEMENT_EDIT_SELECT)
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
      const { data, error } = await supabase.rpc('admin_list_moderation_queue_announcements');
      if (error) throw error;

      let rows = (data || []) as PendingAnnouncement[];

      if (filterCategory !== 'all') {
        const groupedCategorySlugs = getGroupCategorySlugs(filterCategory);
        if (groupedCategorySlugs.length > 0) {
          rows = rows.filter((item) => groupedCategorySlugs.includes(String(item.category_slug || '')));
        }
      }

      if (searchTerm.trim()) {
        const normalizedSearch = searchTerm.trim().toLowerCase();
        rows = rows.filter((item) =>
          String(item.title || '').toLowerCase().includes(normalizedSearch) ||
          String(item.description || '').toLowerCase().includes(normalizedSearch)
        );
      }

      setTotalAnnouncementsCount(rows.length);

      const paginatedRows = rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
      const ownersMap = await fetchOwnersMap(Array.from(new Set(paginatedRows.map((item) => item.user_id).filter(Boolean))));
      setAnnouncements(paginatedRows.map((item) => ({ ...item, owner: item.user_id ? ownersMap.get(item.user_id) : undefined })));
      } catch (error) {
      appError('[ModerationQueue] Erro ao carregar anuncios', error, { page, searchTerm, filterCategory });
      toast.error('Erro ao carregar anuncios pendentes');
    } finally {
      setLoading(false);
    }
  };

  const loadPublicationRules = async () => {
    try {
      const { data, error } = await supabase
        .from('publication_moderation_rules')
        .select('id,name,description,rule_kind,action,target,pattern,is_active')
        .eq('is_active', true)
        .order('created_at', { ascending: true });

      if (error) throw error;
      setPublicationRules((data || []) as PublicationModerationRuleRecord[]);
    } catch (error) {
      appWarn('[ModerationQueue] Nao foi possivel carregar regras de publicacao para destaque visual', { error });
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
      appError('[ModerationQueue] Erro ao carregar edicoes', error, { page, searchTerm, filterCategory });
      toast.error('Erro ao carregar edicoes pendentes');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (announcement: PendingAnnouncement) => {
    try {
      const { data: rpcResult, error: rpcError } = await supabase.rpc('admin_set_announcement_status', {
        p_announcement_id: announcement.id,
        p_status: 'ACTIVE',
        p_reason: 'Aprovado manualmente pela equipe de moderação.',
      });
      if (rpcError) throw rpcError;

      const persistedAnnouncement = Array.isArray(rpcResult) ? rpcResult[0] : rpcResult;
      if (!persistedAnnouncement || persistedAnnouncement.status !== 'ACTIVE') {
        throw new Error('O anúncio não foi confirmado como ativo no banco após a aprovação.');
      }

      await logAction({ action: ADMIN_ACTIONS.APPROVE_AD, resourceType: RESOURCE_TYPES.ANNOUNCEMENT, resourceId: announcement.id, oldValue: { status: announcement.status }, newValue: { status: 'ACTIVE' }, reason: `Anuncio "${announcement.title}" aprovado apos revisao manual` });
      toast.success('Anuncio aprovado com sucesso');
      await loadPendingAnnouncements();
      } catch (error) {
      appError('[ModerationQueue] Erro ao aprovar anúncio', error, { announcementId: announcement.id });
      toast.error('Erro ao aprovar anuncio');
    }
  };

  const handleApproveEditRequest = async (request: PendingEditRequest) => {
    if (!request.announcement) return toast.error('Anuncio original nao encontrado');
    try {
      const { data: authData } = await supabase.auth.getUser();
      const reviewerId = authData.user?.id || null;
      const sanitizedPayload = sanitizeAnnouncementPayload(request.payload || {});
      const originalAnnouncementStatus = getOriginalAnnouncementStatusFromRequest(request);
      let updatedAnnouncement: PendingAnnouncement | null = request.announcement;

      if (Object.keys(sanitizedPayload).length > 0) {
        const { data: updateData, error: announcementError } = await supabase
          .from('announcements')
          .update(sanitizedPayload)
          .eq('id', request.announcement_id)
          .select(ANNOUNCEMENT_EDIT_SELECT)
          .maybeSingle();

        if (announcementError) throw announcementError;

        updatedAnnouncement = (updateData as PendingAnnouncement | null) || null;

        if (!updatedAnnouncement) {
          const { data: fetchedAnnouncement, error: fetchError } = await supabase
            .from('announcements')
            .select(ANNOUNCEMENT_EDIT_SELECT)
            .eq('id', request.announcement_id)
            .maybeSingle();

          if (fetchError) throw fetchError;
          updatedAnnouncement = (fetchedAnnouncement as PendingAnnouncement | null) || null;
        }

        if (!updatedAnnouncement) {
          throw new Error('Anuncio original nao encontrado ou sem permissao para atualizacao.');
        }

        if (!updateData) {
            appWarn('[ModerationQueue] Update da edicao nao retornou linha; seguindo com anuncio buscado como fallback.', {
              announcementId: request.announcement_id,
            });
        }
      }

      const restoreApprovedAnnouncementPayload =
        originalAnnouncementStatus === 'ACTIVE'
          ? {
              status: 'ACTIVE',
              publication_review_admin_override: true,
              publication_review_severity: null,
              publication_review_reasons: [],
              publication_review_checked_at: new Date().toISOString(),
            }
          : originalAnnouncementStatus === 'REJECTED'
            ? {
                status: 'ACTIVE',
                publication_review_admin_override: true,
                publication_review_severity: null,
                publication_review_reasons: [],
                publication_review_checked_at: new Date().toISOString(),
                rejection_reason: null,
                rejected_at: null,
                reanalysis_available_at: null,
              }
          : {
              status: originalAnnouncementStatus,
              publication_review_admin_override: false,
              publication_review_severity: null,
              publication_review_reasons: [],
              publication_review_checked_at: new Date().toISOString(),
            };

      const { error: restoreApprovedStatusError } = await supabase
        .from('announcements')
        .update(restoreApprovedAnnouncementPayload)
        .eq('id', request.announcement_id);

      if (restoreApprovedStatusError) throw restoreApprovedStatusError;

      await supabase.from('announcement_technical_details').delete().eq('announcement_id', request.announcement_id);
      const details = (request.technical_details || []).map((detail) => ({ announcement_id: request.announcement_id, label: detail.label, value: detail.value, icon_name: detail.icon_name || 'Circle' }));
      if (details.length > 0) {
        const { error: detailsError } = await supabase.from('announcement_technical_details').insert(details);
        if (detailsError) throw detailsError;
      }
      const { error: requestError } = await supabase.from('announcement_edit_requests').update({
        status: 'approved',
        reviewed_at: new Date().toISOString(),
        reviewed_by: reviewerId,
        rejection_reason: null,
        reanalysis_available_at: null,
      }).eq('id', request.id);
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
          ...(updatedAnnouncement || sanitizedPayload),
          technical_details: request.technical_details || [],
        },
        reason: `Edicao do anuncio "${request.announcement.title}" aprovada pela moderacao`,
      });
      toast.success('Edicao aprovada e aplicada');
      setSelectedEditRequest(null);
      await loadPendingEditRequests();
      } catch (error) {
      appError('[ModerationQueue] Erro ao aprovar edicao', error, { requestId: request.id, announcementId: request.announcement_id });
      toast.error('Erro ao aprovar edicao');
    }
  };

  const handleReject = async () => {
    if (!rejectionReason.trim()) return toast.error('Informe o motivo da rejeicao');
    try {
      const reanalysisAvailableAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      if (selectedEditRequest) {
        const { data: authData } = await supabase.auth.getUser();
        const reviewerId = authData.user?.id || null;
        const originalAnnouncementStatus = getOriginalAnnouncementStatusFromRequest(selectedEditRequest);
        const restoreRejectedAnnouncementPayload =
          originalAnnouncementStatus === 'ACTIVE'
            ? {
                status: 'ACTIVE',
                publication_review_admin_override: true,
                publication_review_severity: null,
                publication_review_reasons: [],
                publication_review_checked_at: new Date().toISOString(),
              }
            : originalAnnouncementStatus === 'REJECTED'
              ? {
                  status: 'REJECTED',
                  publication_review_admin_override: false,
                  publication_review_severity: null,
                  publication_review_reasons: [],
                  publication_review_checked_at: new Date().toISOString(),
                  rejection_reason: rejectionReason,
                  rejected_at: new Date().toISOString(),
                  reanalysis_available_at: reanalysisAvailableAt,
                }
            : {
                status: originalAnnouncementStatus,
                publication_review_admin_override: false,
                publication_review_severity: null,
                publication_review_reasons: [],
                publication_review_checked_at: new Date().toISOString(),
              };

        const { error: restoreRejectedStatusError } = await supabase
          .from('announcements')
          .update(restoreRejectedAnnouncementPayload)
          .eq('id', selectedEditRequest.announcement_id);

        if (restoreRejectedStatusError) throw restoreRejectedStatusError;

        const { error } = await supabase.from('announcement_edit_requests').update({
          status: 'rejected',
          rejection_reason: rejectionReason,
          reanalysis_available_at: reanalysisAvailableAt,
          reviewed_at: new Date().toISOString(),
          reviewed_by: reviewerId
        }).eq('id', selectedEditRequest.id);
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
          appError('[ModerationQueue] Erro ao criar notificacao de rejeicao da edicao', notificationError, {
            requestId: selectedEditRequest.id,
            userId: selectedEditRequest.user_id,
          });
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
            appError('[ModerationQueue] Erro ao criar job de e-mail para rejeicao da edicao', emailJobError, {
              requestId: selectedEditRequest.id,
              userId: selectedEditRequest.user_id,
            });
          }
        }
        await logAction({ action: ADMIN_ACTIONS.REJECT_AD_EDIT, resourceType: RESOURCE_TYPES.ANNOUNCEMENT, resourceId: selectedEditRequest.announcement_id, oldValue: selectedEditRequest.payload, newValue: { status: 'rejected', rejection_reason: rejectionReason }, reason: `Edicao rejeitada: ${rejectionReason}` });
        toast.success('Edicao rejeitada');
        setSelectedEditRequest(null);
        await loadPendingEditRequests();
      } else if (selectedAnnouncement) {
        const rejectedAt = new Date().toISOString();
        const { error } = await supabase.from('announcements').update({
          status: 'REJECTED',
          rejection_reason: rejectionReason,
          rejected_at: rejectedAt,
          reanalysis_available_at: reanalysisAvailableAt,
        }).eq('id', selectedAnnouncement.id);
        if (error) throw error;
        await logAction({ action: ADMIN_ACTIONS.REJECT_AD, resourceType: RESOURCE_TYPES.ANNOUNCEMENT, resourceId: selectedAnnouncement.id, oldValue: { status: selectedAnnouncement.status }, newValue: { status: 'REJECTED', rejection_reason: rejectionReason, rejected_at: rejectedAt, reanalysis_available_at: reanalysisAvailableAt }, reason: `Anuncio "${selectedAnnouncement.title}" rejeitado: ${rejectionReason}` });
        toast.success('Anuncio rejeitado');
        setSelectedAnnouncement(null);
        await loadPendingAnnouncements();
      }
      setShowRejectModal(false);
      setRejectionReason('');
      } catch (error) {
      appError('[ModerationQueue] Erro ao rejeitar', error, {
        requestId: selectedEditRequest?.id || null,
        announcementId: selectedEditRequest?.announcement_id || null,
      });
      toast.error('Erro ao rejeitar item');
    }
  };

  const getAnnouncementGroupLabel = (announcement: PendingAnnouncement) => getCategoryGroupBySlug(announcement.category_slug)?.name || announcement.category || announcement.category_slug || 'Categoria';
  const getPublicationReviewLabel = (announcement: PendingAnnouncement) => {
    const reasons = parsePublicationModerationReasons(announcement.publication_review_reasons);
    return reasons.length > 0 ? formatPublicationModerationReasons(reasons) : '';
  };
  const getEditRequestGroupLabel = (request: PendingEditRequest) => getCategoryGroupBySlug(String(request.payload?.category_slug || request.announcement?.category_slug || ''))?.name || request.announcement?.category || 'Categoria';
  const getEditHighlights = (request: PendingEditRequest) => {
    const current = request.announcement; if (!current) return ['Anúncio indisponível'];
    const next = request.payload || {}; const changes: string[] = [];
    if ((next.title || '') !== (current.title || '')) changes.push('Título');
    if ((next.description || '') !== (current.description || '')) changes.push('Descrição');
    if (Number(next.price ?? current.price) !== Number(current.price)) changes.push('Preço');
    if ((next.category_slug || current.category_slug || '') !== (current.category_slug || '')) changes.push('Categoria');
    if ((next.sub_category_label || current.sub_category_label || '') !== (current.sub_category_label || '')) changes.push('Subcategoria');
    if (
      (next.product_condition ?? current.product_condition ?? '') !== (current.product_condition ?? '') ||
      (next.availability ?? current.availability ?? '') !== (current.availability ?? '') ||
      Boolean(next.accepts_trade ?? current.accepts_trade) !== Boolean(current.accepts_trade) ||
      Boolean(next.has_warranty ?? current.has_warranty) !== Boolean(current.has_warranty) ||
      (next.warranty_details ?? current.warranty_details ?? '') !== (current.warranty_details ?? '') ||
      Boolean(next.has_invoice ?? current.has_invoice) !== Boolean(current.has_invoice)
    ) changes.push('Informações comerciais');
    if (JSON.stringify(next.images || current.images || []) !== JSON.stringify(current.images || [])) changes.push('Mídia');
    if ((request.technical_details || []).length > 0) changes.push('Ficha técnica');
    return changes.length > 0 ? changes : ['Dados gerais'];
  };

  const getProposedValue = (request: PendingEditRequest, field: string) => {
    if (Object.prototype.hasOwnProperty.call(request.payload || {}, field)) {
      return request.payload?.[field];
    }
    return request.announcement?.[field as keyof PendingAnnouncement];
  };

  const formatCategory = (slug?: unknown) => {
    const normalized = String(slug ?? '').trim();
    if (!normalized) return 'Não informado';
    return getCategoryGroupBySlug(normalized)?.name || normalized;
  };

  const buildCategoryRows = (request: PendingEditRequest, variant: 'current' | 'proposed') => {
    const source = request.announcement;
    const value = (field: string) => variant === 'current' ? source?.[field as keyof PendingAnnouncement] : getProposedValue(request, field);

    return [
      { label: 'Categoria', value: formatCategory(value('category_slug')) },
      { label: 'Subcategoria', value: getValueOrFallback(value('sub_category_label')) },
    ];
  };

  const buildCommercialRows = (request: PendingEditRequest, variant: 'current' | 'proposed') => {
    const source = request.announcement;
    const value = (field: string) => variant === 'current' ? source?.[field as keyof PendingAnnouncement] : getProposedValue(request, field);
    return [
      { label: 'Condição do item', value: formatCondition(value('product_condition')) },
      { label: 'Disponibilidade', value: formatAvailability(value('availability')) },
      { label: 'Aceita troca', value: getValueOrFallback(Boolean(value('accepts_trade'))) },
      { label: 'Possui garantia', value: getValueOrFallback(Boolean(value('has_warranty'))) },
      { label: 'Detalhes da garantia', value: getValueOrFallback(value('warranty_details')) },
      { label: 'Emite nota fiscal', value: getValueOrFallback(Boolean(value('has_invoice'))) },
      { label: 'WhatsApp comercial', value: getValueOrFallback(value('whatsapp')) },
    ];
  };

  const buildAnnouncementOverviewRows = (announcement?: PendingAnnouncement | null) => {
    if (!announcement) return [];

    return [
      { label: 'Categoria', value: getAnnouncementGroupLabel(announcement) },
      { label: 'Subcategoria', value: getValueOrFallback(announcement.sub_category_label) },
      { label: 'Cidade', value: getValueOrFallback(announcement.city) },
      { label: 'Estado', value: getValueOrFallback(announcement.state) },
      { label: 'CEP', value: getValueOrFallback(announcement.cep) },
      { label: 'Quantidade', value: getValueOrFallback(announcement.quantity) },
      { label: 'Unidade', value: getValueOrFallback(announcement.unit) },
      { label: 'Preco unitario', value: `R$ ${Number(announcement.unit_price || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` },
      { label: 'Preco total', value: `R$ ${Number(announcement.price || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` },
      { label: 'Moeda', value: getValueOrFallback(announcement.currency) },
      { label: 'Anunciante', value: getValueOrFallback(announcement.owner?.name) },
      { label: 'Email', value: getValueOrFallback(announcement.owner?.email) },
      { label: 'WhatsApp comercial', value: getValueOrFallback(announcement.whatsapp) },
      { label: 'Data de envio', value: getValueOrFallback(new Date(announcement.created_at).toLocaleString('pt-BR')) },
    ];
  };

  const getAnnouncementMediaPoster = (announcement?: PendingAnnouncement | null) =>
    announcement?.video_thumbnail_url || announcement?.images?.[0] || undefined;

  const getRequestMedia = (request: PendingEditRequest, variant: 'current' | 'proposed') => {
    const value = (field: string) =>
      variant === 'current'
        ? request.announcement?.[field as keyof PendingAnnouncement]
        : getProposedValue(request, field);

    return {
      images: Array.isArray(value('images')) ? (value('images') as string[]) : [],
      videoUrl: String(value('video_url') || '').trim(),
      videoThumbnailUrl: String(value('video_thumbnail_url') || '').trim(),
      videoDurationSeconds: Number(value('video_duration_seconds') || 0),
    };
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
          before: before || 'Não informado',
          after: after || 'Não informado',
        });
      }
    };

    pushRow('Título', current.title, next.title ?? current.title);
    pushRow('Descrição', current.description, next.description ?? current.description);
    pushRow('Preço', current.price, next.price ?? current.price);
    pushRow('Categoria', formatCategory(current.category_slug), formatCategory(next.category_slug ?? current.category_slug));
    pushRow('Subcategoria', current.sub_category_label ?? '', next.sub_category_label ?? current.sub_category_label ?? '');
    pushRow('Cidade', current.city ?? '', next.city ?? current.city ?? '');
    pushRow('Estado', current.state ?? '', next.state ?? current.state ?? '');
    pushRow('Condição do item', formatCondition(current.product_condition), formatCondition(next.product_condition ?? current.product_condition));
    pushRow('Disponibilidade', formatAvailability(current.availability), formatAvailability(next.availability ?? current.availability));
    pushRow('Aceita troca', current.accepts_trade ? 'Sim' : 'Não', (next.accepts_trade ?? current.accepts_trade) ? 'Sim' : 'Não');
    pushRow('Garantia', current.has_warranty ? 'Sim' : 'Não', (next.has_warranty ?? current.has_warranty) ? 'Sim' : 'Não');
    pushRow('Detalhes da garantia', current.warranty_details ?? '', next.warranty_details ?? current.warranty_details ?? '');
    pushRow('Nota fiscal', current.has_invoice ? 'Sim' : 'Não', (next.has_invoice ?? current.has_invoice) ? 'Sim' : 'Não');
    pushRow('WhatsApp comercial', current.whatsapp ?? '', next.whatsapp ?? current.whatsapp ?? '');

    const currentImages = Array.isArray(current.images) ? current.images.length : 0;
    const nextImages = Array.isArray(next.images) ? next.images.length : currentImages;
    pushRow('Mídia', `${currentImages} arquivo(s)`, `${nextImages} arquivo(s)`);

    const currentTechnical = new Map((request.current_technical_details || []).map((item) => [item.label, item.value]));
    const nextTechnical = new Map((request.technical_details || []).map((item) => [item.label, item.value]));
    const labels = new Set([...currentTechnical.keys(), ...nextTechnical.keys()]);
    for (const label of labels) {
      pushRow(`Ficha técnica: ${label}`, currentTechnical.get(label) || '', nextTechnical.get(label) || '');
    }

    return rows;
  };

  const selectedAnnouncementRuleMatches = selectedAnnouncement
    ? getModerationRuleMatches(publicationRules, {
        title: selectedAnnouncement.title,
        description: selectedAnnouncement.description,
        categorySlug: selectedAnnouncement.category_slug,
        images: selectedAnnouncement.images,
      })
    : null;

  const selectedEditRequestCurrentRuleMatches = selectedEditRequest?.announcement
    ? getModerationRuleMatches(publicationRules, {
        title: selectedEditRequest.announcement.title,
        description: selectedEditRequest.announcement.description,
        categorySlug: selectedEditRequest.announcement.category_slug,
        images: selectedEditRequest.announcement.images,
      })
    : null;

  const selectedEditRequestProposedRuleMatches = selectedEditRequest
    ? getModerationRuleMatches(publicationRules, {
        title: selectedEditRequest.payload?.title || selectedEditRequest.announcement?.title,
        description: selectedEditRequest.payload?.description || selectedEditRequest.announcement?.description,
        categorySlug: selectedEditRequest.payload?.category_slug || selectedEditRequest.announcement?.category_slug,
        images: Array.isArray(selectedEditRequest.payload?.images)
          ? selectedEditRequest.payload.images
          : selectedEditRequest.announcement?.images,
      })
    : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="mt-1 text-3xl font-black text-slate-900">Fila de Moderacao</h1>
          <p className="mt-1 text-slate-500">{activeTab === 'announcements' ? `${totalAnnouncementsCount} anuncio${totalAnnouncementsCount !== 1 ? 's' : ''} aguardando analise ou aprovacao` : `${totalEditRequestsCount} edicao${totalEditRequestsCount !== 1 ? 'oes' : ''} aguardando aprovacao`}</p>
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
                    <td className="px-6 py-4"><div className="flex items-start gap-3"><div className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-lg bg-slate-100">{announcement.images?.[0] ? <img src={announcement.images[0]} alt={announcement.title} className="h-full w-full object-cover" /> : <div className="flex h-full w-full items-center justify-center text-slate-400"><AlertTriangle className="h-6 w-6" /></div>}</div><div className="min-w-0 flex-1"><p className="truncate font-semibold text-slate-900">{announcement.title}</p><p className="line-clamp-2 text-sm text-slate-500">{announcement.description}</p><p className="mt-1 text-sm font-bold text-green-600">R$ {announcement.price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>{getPublicationReviewLabel(announcement) ? <p className="mt-2 rounded-lg bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700">Regra: {getPublicationReviewLabel(announcement)}</p> : null}{(announcement.community_reports_count || 0) > 0 ? <div className="mt-2 space-y-1"><p className="inline-flex rounded-lg bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-700">{announcement.community_reports_count} denúncia(s) da comunidade</p>{formatCommunityReportSummary(announcement.community_report_reasons) ? <p className="text-xs text-slate-500">{formatCommunityReportSummary(announcement.community_report_reasons)}</p> : null}</div> : null}</div></div></td>
                    <td className="px-6 py-4"><span className="inline-flex rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-800">{getAnnouncementGroupLabel(announcement)}</span></td>
                    <td className="px-6 py-4"><div className="text-sm"><p className="font-semibold text-slate-900">{announcement.owner?.name}</p><p className="text-slate-500">{announcement.owner?.email}</p></div></td>
                    <td className="px-6 py-4 text-sm text-slate-500">{new Date(announcement.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
                    <td className="px-6 py-4"><div className="flex items-center gap-2"><button onClick={() => void handleApprove(announcement)} className="rounded-lg p-2 text-green-600 hover:bg-green-50" title="Aprovar"><Check className="h-5 w-5" /></button><button onClick={() => { setSelectedEditRequest(null); setSelectedAnnouncement(announcement); setShowRejectModal(true); }} className="rounded-lg p-2 text-red-600 hover:bg-red-50" title="Rejeitar"><X className="h-5 w-5" /></button><button onClick={() => { setSelectedEditRequest(null); setSelectedAnnouncement(announcement); }} className="rounded-lg p-2 text-slate-600 hover:bg-slate-50" title="Visualizar conteúdo moderado"><Eye className="h-5 w-5" /></button></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <table className="w-full">
              <thead className="border-b border-slate-200 bg-slate-50"><tr><th className="px-6 py-3 text-left text-xs font-black uppercase tracking-wider text-slate-600">Anuncio</th><th className="px-6 py-3 text-left text-xs font-black uppercase tracking-wider text-slate-600">Alteracoes</th><th className="px-6 py-3 text-left text-xs font-black uppercase tracking-wider text-slate-600">Anunciante</th><th className="px-6 py-3 text-left text-xs font-black uppercase tracking-wider text-slate-600">Data</th><th className="px-6 py-3 text-left text-xs font-black uppercase tracking-wider text-slate-600">Acoes</th></tr></thead>
              <tbody className="divide-y divide-slate-200">
                {loading ? <tr><td colSpan={5} className="px-6 py-12 text-center"><div className="flex items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-b-2 border-green-600"></div></div></td></tr> : editRequests.length === 0 ? <tr><td colSpan={5} className="px-6 py-12 text-center text-slate-500">Nenhuma edição pendente de moderação</td></tr> : editRequests.map((request) => {
                  const currentTitle = request.announcement?.title || 'Anúncio indisponível';
                  const proposedTitle = request.payload?.title || currentTitle;
                  const currentPrice = Number(request.announcement?.price || 0);
                  const proposedPrice = Number(request.payload?.price ?? currentPrice);
                  return (
                    <tr key={request.id} className="transition-colors hover:bg-slate-50">
                      <td className="px-6 py-4"><div className="space-y-1"><div className="flex items-center gap-2"><span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-black text-amber-700"><PencilLine className="h-3.5 w-3.5" />Edição</span><span className="inline-flex rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-800">{getEditRequestGroupLabel(request)}</span></div><p className="font-semibold text-slate-900">{currentTitle}</p>{proposedTitle !== currentTitle ? <p className="text-sm text-slate-500">Novo título: <span className="font-semibold text-slate-700">{proposedTitle}</span></p> : null}{proposedPrice !== currentPrice ? <p className="text-sm text-slate-500">Preço: <span className="font-semibold text-slate-700">R$ {currentPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span> para <span className="font-semibold text-green-700">R$ {proposedPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span></p> : null}</div></td>
                      <td className="px-6 py-4"><div className="flex max-w-xs flex-wrap gap-2">{getEditHighlights(request).map((change) => <span key={change} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">{change}</span>)}</div></td>
                      <td className="px-6 py-4"><div className="text-sm"><p className="font-semibold text-slate-900">{request.requester?.name}</p><p className="text-slate-500">{request.requester?.email}</p></div></td>
                      <td className="px-6 py-4 text-sm text-slate-500">{new Date(request.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
                      <td className="px-6 py-4"><div className="flex items-center gap-2"><button onClick={() => void handleApproveEditRequest(request)} className="rounded-lg p-2 text-green-600 hover:bg-green-50" title="Aprovar edição"><Check className="h-5 w-5" /></button><button onClick={() => { setSelectedAnnouncement(null); setSelectedEditRequest(request); setShowRejectModal(true); }} className="rounded-lg p-2 text-red-600 hover:bg-red-50" title="Rejeitar edição"><X className="h-5 w-5" /></button><button onClick={() => setSelectedEditRequest(request)} className="rounded-lg p-2 text-slate-600 hover:bg-slate-50" title="Ver antes e depois"><Eye className="h-5 w-5" /></button></div></td>
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

      {selectedAnnouncement && !selectedEditRequest && !showRejectModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">Revisão de anúncio novo</p>
                <h3 className="mt-1 text-2xl font-black text-slate-900">{selectedAnnouncement.title}</h3>
                <p className="mt-1 text-sm text-slate-500">
                  Visualize o conteúdo que acionou a moderação antes de aprovar ou rejeitar.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedAnnouncement(null)}
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
                title="Fechar"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-amber-700">Motivo da análise</p>
              <p className="mt-2 text-sm font-medium text-amber-900">
                {getPublicationReviewLabel(selectedAnnouncement) || 'Regras de publicação acionadas. Revise os campos destacados abaixo.'}
              </p>
            </div>

            <div className="mt-6 grid gap-6 lg:grid-cols-[0.8fr,1.2fr]">
              <div className="space-y-4">
                <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
                  <div className="aspect-[4/3] bg-slate-100">
                    {getAnnouncementMediaPoster(selectedAnnouncement) ? (
                      <img src={getAnnouncementMediaPoster(selectedAnnouncement)} alt={selectedAnnouncement.title} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full items-center justify-center text-slate-400">
                        <AlertTriangle className="h-10 w-10" />
                      </div>
                    )}
                  </div>
                  <div className="border-t border-slate-200 p-4">
                    <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Resumo</p>
                    <div className="mt-3 grid gap-2 text-sm text-slate-600">
                      <p><span className="font-semibold text-slate-900">Categoria:</span> {getAnnouncementGroupLabel(selectedAnnouncement)}</p>
                      <p><span className="font-semibold text-slate-900">Anunciante:</span> {selectedAnnouncement.owner?.name || 'Não informado'}</p>
                      <p><span className="font-semibold text-slate-900">Preço:</span> R$ {selectedAnnouncement.price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                      <p><span className="font-semibold text-slate-900">Data:</span> {new Date(selectedAnnouncement.created_at).toLocaleString('pt-BR')}</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                {selectedAnnouncement.video_url ? (
                  <div className="rounded-2xl border border-slate-200 bg-white p-5">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Video enviado</p>
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-bold text-slate-600">
                        {formatVideoDuration(selectedAnnouncement.video_duration_seconds)}
                      </span>
                    </div>
                    <div className="mt-3 overflow-hidden rounded-2xl border border-slate-200 bg-slate-950">
                      <video
                        src={selectedAnnouncement.video_url}
                        controls
                        playsInline
                        preload="metadata"
                        poster={getAnnouncementMediaPoster(selectedAnnouncement)}
                        className="aspect-video w-full bg-slate-950 object-contain"
                      />
                    </div>
                  </div>
                ) : null}

                <div className={`rounded-2xl border p-5 ${selectedAnnouncementRuleMatches?.title.length ? 'border-amber-300 bg-amber-50/60' : 'border-slate-200 bg-white'}`}>
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Título</p>
                  <p className="mt-2 text-lg font-semibold text-slate-900">{selectedAnnouncement.title || 'Não informado'}</p>
                  {selectedAnnouncementRuleMatches?.title.length ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {selectedAnnouncementRuleMatches.title.map((reason) => (
                        <span key={`announcement-title-${reason}`} className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">
                          {reason}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>

                <div className={`rounded-2xl border p-5 ${selectedAnnouncementRuleMatches?.description.length ? 'border-amber-300 bg-amber-50/60' : 'border-slate-200 bg-white'}`}>
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Descrição</p>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{selectedAnnouncement.description || 'Não informado'}</p>
                  {selectedAnnouncementRuleMatches?.description.length ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {selectedAnnouncementRuleMatches.description.map((reason) => (
                        <span key={`announcement-description-${reason}`} className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">
                          {reason}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className={`rounded-2xl border p-5 ${selectedAnnouncementRuleMatches?.category.length ? 'border-amber-300 bg-amber-50/60' : 'border-slate-200 bg-white'}`}>
                    <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Categoria</p>
                    <p className="mt-2 text-sm font-semibold text-slate-900">{getAnnouncementGroupLabel(selectedAnnouncement)}</p>
                    {selectedAnnouncementRuleMatches?.category.length ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {selectedAnnouncementRuleMatches.category.map((reason) => (
                          <span key={`announcement-category-${reason}`} className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">
                            {reason}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>

                  <div className={`rounded-2xl border p-5 ${selectedAnnouncementRuleMatches?.images.length ? 'border-amber-300 bg-amber-50/60' : 'border-slate-200 bg-white'}`}>
                    <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Mídia</p>
                    <p className="mt-2 text-sm font-semibold text-slate-900">{Array.isArray(selectedAnnouncement.images) ? `${selectedAnnouncement.images.length} arquivo(s)` : '0 arquivo(s)'}</p>
                    {selectedAnnouncementRuleMatches?.images.length ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {selectedAnnouncementRuleMatches.images.map((reason) => (
                          <span key={`announcement-images-${reason}`} className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">
                            {reason}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-5">
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Detalhes completos do anuncio</p>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {buildAnnouncementOverviewRows(selectedAnnouncement).map((item) => (
                      <div key={`announcement-overview-${item.label}`} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                        <p className="text-xs font-semibold text-slate-400">{item.label}</p>
                        <p className="mt-1 text-sm font-semibold text-slate-900">{item.value}</p>
                      </div>
                    ))}
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                      <p className="text-xs font-semibold text-slate-400">Condicao do item</p>
                      <p className="mt-1 text-sm font-semibold text-slate-900">{formatCondition(selectedAnnouncement.product_condition)}</p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                      <p className="text-xs font-semibold text-slate-400">Disponibilidade</p>
                      <p className="mt-1 text-sm font-semibold text-slate-900">{formatAvailability(selectedAnnouncement.availability)}</p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                      <p className="text-xs font-semibold text-slate-400">Aceita troca</p>
                      <p className="mt-1 text-sm font-semibold text-slate-900">{getValueOrFallback(Boolean(selectedAnnouncement.accepts_trade))}</p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                      <p className="text-xs font-semibold text-slate-400">Possui garantia</p>
                      <p className="mt-1 text-sm font-semibold text-slate-900">{getValueOrFallback(Boolean(selectedAnnouncement.has_warranty))}</p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 sm:col-span-2">
                      <p className="text-xs font-semibold text-slate-400">Detalhes da garantia</p>
                      <p className="mt-1 text-sm font-semibold text-slate-900">{getValueOrFallback(selectedAnnouncement.warranty_details)}</p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                      <p className="text-xs font-semibold text-slate-400">Emite nota fiscal</p>
                      <p className="mt-1 text-sm font-semibold text-slate-900">{getValueOrFallback(Boolean(selectedAnnouncement.has_invoice))}</p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                      <p className="text-xs font-semibold text-slate-400">Midia enviada</p>
                      <p className="mt-1 text-sm font-semibold text-slate-900">
                        {Array.isArray(selectedAnnouncement.images) ? `${selectedAnnouncement.images.length} imagem(ns)` : '0 imagem(ns)'}
                        {selectedAnnouncement.video_url ? ' + 1 video' : ''}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setSelectedAnnouncement(null)}
                className="rounded-lg border border-slate-200 px-4 py-2 font-semibold text-slate-600 hover:bg-slate-50"
              >
                Fechar
              </button>
              <button
                type="button"
                onClick={() => setShowRejectModal(true)}
                className="rounded-lg bg-red-500 px-4 py-2 font-semibold text-white hover:bg-red-600"
              >
                Rejeitar
              </button>
              <button
                type="button"
                onClick={() => void handleApprove(selectedAnnouncement)}
                className="rounded-lg bg-green-600 px-4 py-2 font-semibold text-white hover:bg-green-700"
              >
                Aprovar
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {selectedEditRequest && !showRejectModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">Revisão de edição</p>
                <h3 className="mt-1 text-2xl font-black text-slate-900">{selectedEditRequest.announcement?.title || 'Anúncio indisponível'}</h3>
                <p className="mt-1 text-sm text-slate-500">
                  Compare o anúncio atual com a versão enviada pelo anunciante antes de aprovar.
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

            <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-amber-700">Motivo da análise</p>
              <p className="mt-2 text-sm font-medium text-amber-900">
                {getPublicationReviewLabel(selectedEditRequest.announcement || ({} as PendingAnnouncement)) || 'As regras de publicação foram acionadas. Revise os campos destacados na versão proposta.'}
              </p>
            </div>

            <div className="mt-6 grid gap-6 lg:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">Versão atual</p>
                <div className="mt-4 space-y-3 text-sm text-slate-700">
                  {(() => {
                    const currentMedia = getRequestMedia(selectedEditRequest, 'current');
                    return currentMedia.videoUrl ? (
                      <div>
                        <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Video atual</p>
                        <div className="mt-2 overflow-hidden rounded-2xl border border-slate-200 bg-slate-950">
                          <video
                            src={currentMedia.videoUrl}
                            controls
                            playsInline
                            preload="metadata"
                            poster={currentMedia.videoThumbnailUrl || currentMedia.images[0] || undefined}
                            className="aspect-video w-full bg-slate-950 object-contain"
                          />
                        </div>
                        <p className="mt-2 text-xs text-slate-500">{formatVideoDuration(currentMedia.videoDurationSeconds)}</p>
                      </div>
                    ) : null;
                  })()}
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Título</p>
                    <p className="mt-1 font-semibold text-slate-900">{selectedEditRequest.announcement?.title || 'Não informado'}</p>
                    {selectedEditRequestCurrentRuleMatches?.title.length ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {selectedEditRequestCurrentRuleMatches.title.map((reason) => (
                          <span key={`current-title-${reason}`} className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">{reason}</span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Descrição</p>
                    <p className="mt-1 whitespace-pre-wrap">{selectedEditRequest.announcement?.description || 'Não informado'}</p>
                    {selectedEditRequestCurrentRuleMatches?.description.length ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {selectedEditRequestCurrentRuleMatches.description.map((reason) => (
                          <span key={`current-description-${reason}`} className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">{reason}</span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Categoria e subcategoria</p>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      {buildCategoryRows(selectedEditRequest, 'current').map((item) => (
                        <div key={`current-category-${item.label}`} className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                          <p className="text-xs font-semibold text-slate-400">{item.label}</p>
                          <p className="mt-1 text-sm font-semibold text-slate-700">{item.value}</p>
                        </div>
                      ))}
                    </div>
                    {selectedEditRequestCurrentRuleMatches?.category.length ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {selectedEditRequestCurrentRuleMatches.category.map((reason) => (
                          <span key={`current-category-rule-${reason}`} className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">{reason}</span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Informações comerciais da loja</p>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      {buildCommercialRows(selectedEditRequest, 'current').map((item) => (
                        <div key={`current-commercial-${item.label}`} className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                          <p className="text-xs font-semibold text-slate-400">{item.label}</p>
                          <p className="mt-1 text-sm text-slate-700">{item.value}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Especificações técnicas</p>
                    <div className="mt-2 space-y-2">
                      {(selectedEditRequest.current_technical_details || []).length > 0 ? (
                        selectedEditRequest.current_technical_details?.map((detail) => (
                          <div key={`current-${detail.label}`} className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                            <p className="text-xs font-semibold text-slate-400">{detail.label}</p>
                            <p className="mt-1 text-sm text-slate-700">{detail.value}</p>
                          </div>
                        ))
                      ) : (
                        <p className="text-sm text-slate-500">Sem especificações técnicas cadastradas.</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-5">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-700">Versão proposta</p>
                <div className="mt-4 space-y-3 text-sm text-slate-700">
                  {(() => {
                    const proposedMedia = getRequestMedia(selectedEditRequest, 'proposed');
                    return proposedMedia.videoUrl ? (
                      <div>
                        <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Video proposto</p>
                        <div className="mt-2 overflow-hidden rounded-2xl border border-emerald-200 bg-slate-950">
                          <video
                            src={proposedMedia.videoUrl}
                            controls
                            playsInline
                            preload="metadata"
                            poster={proposedMedia.videoThumbnailUrl || proposedMedia.images[0] || undefined}
                            className="aspect-video w-full bg-slate-950 object-contain"
                          />
                        </div>
                        <p className="mt-2 text-xs text-slate-500">{formatVideoDuration(proposedMedia.videoDurationSeconds)}</p>
                      </div>
                    ) : null;
                  })()}
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Título</p>
                    <p className="mt-1 font-semibold text-slate-900">{selectedEditRequest.payload?.title || selectedEditRequest.announcement?.title || 'Não informado'}</p>
                    {selectedEditRequestProposedRuleMatches?.title.length ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {selectedEditRequestProposedRuleMatches.title.map((reason) => (
                          <span key={`proposed-title-${reason}`} className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">{reason}</span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Descrição</p>
                    <p className="mt-1 whitespace-pre-wrap">{selectedEditRequest.payload?.description || selectedEditRequest.announcement?.description || 'Não informado'}</p>
                    {selectedEditRequestProposedRuleMatches?.description.length ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {selectedEditRequestProposedRuleMatches.description.map((reason) => (
                          <span key={`proposed-description-${reason}`} className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">{reason}</span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Categoria e subcategoria</p>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      {buildCategoryRows(selectedEditRequest, 'proposed').map((item) => (
                        <div key={`next-category-${item.label}`} className="rounded-xl border border-emerald-200 bg-white px-3 py-2">
                          <p className="text-xs font-semibold text-slate-400">{item.label}</p>
                          <p className="mt-1 text-sm font-semibold text-slate-700">{item.value}</p>
                        </div>
                      ))}
                    </div>
                    {selectedEditRequestProposedRuleMatches?.category.length ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {selectedEditRequestProposedRuleMatches.category.map((reason) => (
                          <span key={`proposed-category-rule-${reason}`} className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">{reason}</span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Informações comerciais da loja</p>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      {buildCommercialRows(selectedEditRequest, 'proposed').map((item) => (
                        <div key={`next-commercial-${item.label}`} className="rounded-xl border border-emerald-200 bg-white px-3 py-2">
                          <p className="text-xs font-semibold text-slate-400">{item.label}</p>
                          <p className="mt-1 text-sm text-slate-700">{item.value}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Especificações técnicas</p>
                    <div className="mt-2 space-y-2">
                      {(selectedEditRequest.technical_details || []).length > 0 ? (
                        selectedEditRequest.technical_details?.map((detail) => (
                          <div key={`next-${detail.label}`} className="rounded-xl border border-emerald-200 bg-white px-3 py-2">
                            <p className="text-xs font-semibold text-slate-400">{detail.label}</p>
                            <p className="mt-1 text-sm text-slate-700">{detail.value}</p>
                          </div>
                        ))
                      ) : (
                        <p className="text-sm text-slate-500">Sem especificações técnicas propostas.</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">Resumo do que muda</p>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {buildEditComparisonRows(selectedEditRequest).length > 0 ? buildEditComparisonRows(selectedEditRequest).map((row) => (
                  <div key={row.label} className="rounded-xl border border-slate-200 p-4">
                    <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">{row.label}</p>
                    <p className="mt-2 text-sm text-slate-500">Antes: <span className="font-semibold text-slate-700">{row.before}</span></p>
                    <p className="mt-1 text-sm text-slate-500">Depois: <span className="font-semibold text-emerald-700">{row.after}</span></p>
                  </div>
                )) : (
                  <p className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500 md:col-span-2">
                    Nenhuma diferença textual encontrada. Revise também imagens, vídeos e anexos antes de aprovar.
                  </p>
                )}
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
