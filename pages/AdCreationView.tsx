
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CATEGORIES } from '../constants';
import { AdStatus } from '../types';
import { CATEGORY_HIERARCHY, getCategoryGroupBySlug, getCategoryGroupForCategorySlug } from '../src/lib/categoryHierarchy';
import { usePlanCheck } from '../src/hooks/usePlanCheck';
import { useSubscription } from '../src/hooks/useSubscription';
import { useAuth } from '../src/contexts/AuthContext';
import { supabase } from '../src/lib/supabaseClient';
import { toast } from 'sonner';
import {
  Trash2,
  GripVertical,
  AlertCircle,
  Eye,
  Heart,
  MapPin,
  X,
  PawPrint,
  Cog,
  Leaf,
  Home,
  Wrench,
  Sprout,
  Package,
  Building2,
  Trees,
  LucideIcon,
} from 'lucide-react';
import { censorContactData } from '../src/utils/censorContact';
import { useLayout } from '../src/contexts/LayoutContext';
import { getPrimaryImageFromList } from '../src/utils/imageFallback';
import { evaluatePublicationModeration, formatPublicationModerationReasons } from '../src/utils/publicationModeration';
import { updateAnnouncementCoordinates } from '../services/geoService';
import imageCompression from 'browser-image-compression';
import { compressAnnouncementVideo, formatVideoSize, VideoCompressionError } from '../src/utils/videoCompression';
import { motion } from 'framer-motion';
import { DndContext, PointerSensor, useSensor, useSensors, closestCenter } from '@dnd-kit/core';
import { SortableContext, useSortable, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

type Step = 'CATEGORY' | 'DETAILS' | 'MEDIA' | 'PRICING' | 'REVIEW' | 'SUCCESS';
type ImageItem = {
  id: string;
  previewUrl: string;
  publicUrl?: string;
  storagePath?: string;
  uploading: boolean;
  progress: number;
  originalFile?: File;
};

type VideoItem = {
  id: string;
  previewUrl: string;
  publicUrl?: string;
  storagePath?: string;
  uploading: boolean;
  progress: number;
  durationSeconds?: number;
  sizeBytes?: number;
};

type AnnouncementEditRequestRecord = {
  id: string;
  payload: Record<string, any>;
  technical_details?: Array<{ label: string; value: string; icon_name?: string | null }> | null;
  status: 'pending' | 'approved' | 'rejected';
};

const STORE_PRODUCT_CONDITIONS = [
  { value: 'novo', label: 'Novo' },
  { value: 'seminovo', label: 'Seminovo' },
  { value: 'usado', label: 'Usado' },
] as const;

const STORE_AVAILABILITY_OPTIONS = [
  { value: 'pronta_entrega', label: 'Pronta entrega' },
  { value: 'sob_encomenda', label: 'Sob encomenda' },
  { value: 'consultar_estoque', label: 'Consultar estoque' },
] as const;

const slugify = (value: string) => value
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '');

const SortableImageItem: React.FC<{
  item: ImageItem;
  index: number;
  onRemove: (item: ImageItem) => void;
}> = ({ item, index, onRemove }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition
  } as React.CSSProperties;

  return (
    <motion.div
      ref={setNodeRef}
      style={style}
      layout
      className={`relative aspect-square rounded-2xl overflow-hidden border-2 shadow-sm transition-all ${isDragging ? 'border-green-600' : 'border-slate-200'} ${index === 0 ? 'ring-2 ring-green-500 border-green-500' : ''}`}
    >
      <img src={item.previewUrl || item.publicUrl} className="w-full h-full object-cover" />
      {index === 0 && (
        <div className="absolute top-2 left-2 bg-green-600 text-white text-[9px] font-black px-2 py-0.5 rounded uppercase border border-yellow-300 shadow">CAPA</div>
      )}
      {item.uploading && (
        <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
          <div className="w-10 h-10 border-2 border-white border-t-transparent rounded-full animate-spin" />
        </div>
      )}
      {item.uploading && (
        <div className="absolute bottom-0 left-0 right-0 bg-black/40 p-2">
          <div className="w-full h-1.5 bg-white/30 rounded-full overflow-hidden">
            <div
              className="h-full bg-green-400 transition-all"
              style={{ width: `${Math.max(5, item.progress)}%` }}
            />
          </div>
          <p className="mt-1 text-[10px] text-white font-bold text-center">{item.progress}%</p>
        </div>
      )}
      <button
        type="button"
        onClick={() => onRemove(item)}
        className="absolute top-2 right-2 bg-white/90 p-2 rounded-full text-slate-700 hover:text-red-600"
        aria-label="Remover imagem"
      >
        <Trash2 className="w-4 h-4" />
      </button>
      <button
        type="button"
        className="absolute bottom-2 left-2 bg-white/90 p-2 rounded-full text-slate-700 cursor-grab active:cursor-grabbing"
        aria-label="Arrastar imagem"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="w-4 h-4" />
      </button>
    </motion.div>
  );
};

const PreviewAnnouncementModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  previewAd: any;
  defaultAdImageUrl?: string | null;
}> = ({ isOpen, onClose, previewAd, defaultAdImageUrl }) => {
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const mainImage = getPrimaryImageFromList(previewAd.images, defaultAdImageUrl);
  const previewVideoUrl = previewAd.videoPreviewUrl || previewAd.videoUrl || '';
  const formattedPrice = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(previewAd.price || 0);
  const displayPrice = previewAd.priceNegotiable || previewAd.acceptsTrade ? 'Sob consulta' : formattedPrice;
  const previewDescription = censorContactData(previewAd.description || '').censored;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-3xl overflow-hidden rounded-[2rem] bg-white shadow-2xl max-h-[90vh]"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 z-20 inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/95 text-slate-600 shadow hover:text-slate-900"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="grid max-h-[90vh] grid-cols-1 overflow-y-auto lg:grid-cols-[0.95fr,0.85fr]">
          <div className="flex flex-col justify-between bg-slate-950 p-6 text-white lg:p-7">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.22em] text-green-300">
                Preview da Publicacao
              </p>
              <h2 className="mt-3 text-2xl font-black leading-tight lg:text-3xl">
                {previewAd.title || 'Titulo do anuncio'}
              </h2>
              <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-sm text-white/90">
                <MapPin className="w-4 h-4 text-green-300" />
                {previewAd.location?.city || 'Cidade'} - {previewAd.location?.state || 'UF'}
              </div>
            </div>

            <div className="mt-6 space-y-4">
              <div className="rounded-2xl bg-white/10 p-4">
                <p className="text-[11px] font-black uppercase tracking-[0.18em] text-green-200">
                  Investimento
                </p>
                <p className="mt-2 text-2xl font-black text-green-300 lg:text-3xl">{displayPrice}</p>
                <p className="mt-1 text-sm text-white/70">
                  {previewAd.quantity || 1} {previewAd.unit || 'Unidade'}
                </p>
              </div>

              <div className="rounded-2xl border border-white/10 p-4">
                <p className="text-[11px] font-black uppercase tracking-[0.18em] text-white/50">
                  Descricao
                </p>
                <div className="mt-3 max-h-64 overflow-y-auto rounded-xl border border-white/10 bg-black/10 p-3">
                  <p className="whitespace-pre-line text-sm leading-6 text-white/80">
                    {previewDescription || 'Descricao do anuncio nao informada.'}
                  </p>
                </div>
              </div>

              {previewVideoUrl ? (
                <div className="rounded-2xl border border-white/10 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[11px] font-black uppercase tracking-[0.18em] text-white/50">
                      Video do anuncio
                    </p>
                    {previewAd.videoDurationSeconds ? (
                      <span className="rounded-full bg-white/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-green-200">
                        {previewAd.videoDurationSeconds}s
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-3 overflow-hidden rounded-xl border border-white/10 bg-black/30">
                    <video
                      src={previewVideoUrl}
                      controls
                      playsInline
                      preload="metadata"
                      poster={mainImage || undefined}
                      className="aspect-video w-full bg-slate-950 object-contain"
                    />
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          <div className="bg-slate-50 p-5 lg:p-6">
            <div className="mx-auto max-w-[320px] overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl">
              <div className="relative h-48 bg-slate-200 lg:h-52">
                {mainImage ? (
                  <img src={mainImage} alt={previewAd.title} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center text-sm font-semibold text-slate-500">
                    Nenhuma imagem enviada
                  </div>
                )}
                <button
                  type="button"
                  className="absolute right-4 top-4 inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-slate-600 shadow"
                >
                  <Heart className="w-5 h-5" strokeWidth={1.5} />
                </button>
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 via-black/35 to-transparent p-4">
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-white">
                    <MapPin className="w-3.5 h-3.5 text-green-400" strokeWidth={1.5} />
                    {previewAd.location?.city || 'Cidade'} - {previewAd.location?.state || 'UF'}
                  </p>
                </div>
              </div>

              <div className="p-4">
                <h3 className="line-clamp-2 min-h-[3rem] text-base font-bold text-slate-900">
                  {previewAd.title || 'Titulo do anuncio'}
                </h3>
                <div className="mt-3 flex items-end justify-between border-t border-slate-100 pt-3">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
                      Investimento
                    </p>
                    <p className="mt-1 text-xl font-black text-green-700">{displayPrice}</p>
                  </div>
                  <div className="flex items-center gap-1 text-xs font-semibold text-slate-400">
                    <Eye className="w-4 h-4" strokeWidth={1.5} />
                    0
                  </div>
                </div>
                <div className="mt-4 rounded-xl bg-slate-900 py-3 text-center text-sm font-bold text-white">
                  Ver Detalhes
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const AdCreationView: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { settings } = useLayout();
  const { handleAction } = usePlanCheck();
  const { subscription, usage, canCreateAd, adLimitMessage, refreshUsage } = useSubscription();
  
  // A rota jÃ¡ Ã© protegida pelo RequireAuth no App.tsx.
  if (!user) return null;

  const [currentStep, setCurrentStep] = useState<Step>('CATEGORY');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploadingImages, setIsUploadingImages] = useState(false);
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);
  const [imageItems, setImageItems] = useState<ImageItem[]>([]);
  const [draftAdId, setDraftAdId] = useState<string | null>(null);
  const [isLoadingEditAd, setIsLoadingEditAd] = useState(false);
  const [pendingTechnicalDetails, setPendingTechnicalDetails] = useState<Array<{ label: string; value: string }>>([]);
  const isMountedRef = useRef(true);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const videoInputRef = useRef<HTMLInputElement | null>(null);
  const isCreatingDraft = useRef(false);
  const draftIdRef = useRef<string | null>(null);
  const loadedEditAdIdRef = useRef<string | null>(null);
  const hasPublishedSuccessfullyRef = useRef(false);
  const isCleaningDraftRef = useRef(false);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );
  const [dbCategories, setDbCategories] = useState<Array<{ id: string; name: string; slug: string; icon?: string | null; technical_fields_schema?: any[] }>>([]);
  const [dbSubcategories, setDbSubcategories] = useState<Array<{ id: string; category_id: string; name: string; slug: string }>>([]);
  const [technicalFieldsSchema, setTechnicalFieldsSchema] = useState<any[]>([]);
  const [videoItem, setVideoItem] = useState<VideoItem | null>(null);
  const [formData, setFormData] = useState<any>({
    title: '',
    description: '',
    price: 0,
    priceNegotiable: false,
    categoryGroupSlug: '',
    categoryId: '',
    categorySlug: '',
    subCategoryId: '',
    subCategoryLabel: '',
    quantity: 1,
    unit: 'Unidade',
    unitPrice: 0,
    currency: 'BRL',
    location: { cep: '', city: '', state: '' },
    productCondition: '',
    availability: '',
    acceptsTrade: false,
    hasWarranty: false,
    warrantyDetails: '',
    hasInvoice: false,
    technical: {},
    images: [],
    videoUrl: '',
    videoStoragePath: '',
    videoDurationSeconds: 0,
    videoSizeBytes: 0,
    isPremium: false
  });
  const editAdId = searchParams.get('edit');
  const isEditingExistingAd = Boolean(editAdId);
  const hasStoreListingAccess = !!subscription?.plans?.has_seller_store;
  const normalizeTechnicalLabel = (value: string) => slugify(value).replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  const hasConservationStateField = technicalFieldsSchema.some((field: any) =>
    normalizeTechnicalLabel(field.label || field.key || '') === 'estado_de_conservacao'
  );
  const shouldShowStoreProductCondition = hasStoreListingAccess && !hasConservationStateField;
  const selectedCategoryGroup = getCategoryGroupBySlug(formData.categoryGroupSlug || formData.categorySlug);
  const availableSpecificCategories = selectedCategoryGroup
    ? selectedCategoryGroup.categorySlugs
        .map((slug) => dbCategories.find((category) => category.slug === slug))
        .filter(Boolean) as Array<{ id: string; name: string; slug: string; icon?: string | null; technical_fields_schema?: any[] }>
    : [];
  const topLevelCategoryGroups = CATEGORY_HIERARCHY.map((group) => {
    const matchingVisualCategory = CATEGORIES.find((category) =>
      group.aliases.includes(category.slug) || category.slug === group.slug
    );

    return {
      id: group.slug,
      slug: group.slug,
      name: group.name,
      icon: matchingVisualCategory?.icon,
    };
  });

  const ensureAdCreationAllowed = () => {
    if (isEditingExistingAd || draftIdRef.current || draftAdId) {
      return true;
    }

    if (!canCreateAd) {
      toast.error('Limite de anuncios atingido', {
        description: adLimitMessage
      });
      return false;
    }

    return true;
  };

  useEffect(() => {
    if (!user) return;

    setFormData((prev: any) => {
      const nextLocation = {
        cep: prev.location?.cep || user.cep || '',
        city: prev.location?.city || user.cidade || '',
        state: prev.location?.state || user.estado || ''
      };

      if (
        nextLocation.cep === prev.location?.cep &&
        nextLocation.city === prev.location?.city &&
        nextLocation.state === prev.location?.state
      ) {
        return prev;
      }

      return {
        ...prev,
        location: nextLocation
      };
    });
  }, [user]);

  // PersistÃªncia de rascunho
  const categoryIconMap: Record<string, LucideIcon> = {
    animais: PawPrint,
    maquinas: Cog,
    insumos: Leaf,
    imoveis: Home,
    servicos: Wrench,
    sementes: Sprout,
    pecas: Wrench,
    'maquinas-equipamentos': Cog,
    implementos: Wrench,
    fazendas: Building2,
    'imoveis-rurais': Home,
    'armazenagem-de-produtos': Building2,
    'alimentos-em-geral': Package,
    'arvores-adultas-mudas': Trees,
    'tratores-agricolas': Cog,
    'maquinas-pesadas': Cog,
    'fertilizantes-agricolas': Leaf,
    'colheitadeiras-colhedoras': Cog,
    'alimentos-para-nutricao-animal': PawPrint,
  };

  const resolveCategoryIcon = (category: { slug: string; name: string }) => {
    const normalizedSlug = category.slug?.toLowerCase() || '';
    const normalizedName = category.name?.toLowerCase() || '';

    const directMatch = categoryIconMap[normalizedSlug];
    if (directMatch) return directMatch;

    if (normalizedSlug.includes('animal') || normalizedName.includes('animal')) return PawPrint;
    if (normalizedSlug.includes('maquina') || normalizedSlug.includes('trator') || normalizedSlug.includes('colheit')) return Cog;
    if (normalizedSlug.includes('insumo') || normalizedSlug.includes('fertiliz') || normalizedSlug.includes('nutricao')) return Leaf;
    if (normalizedSlug.includes('imove') || normalizedSlug.includes('fazenda')) return Home;
    if (normalizedSlug.includes('servic')) return Wrench;
    if (normalizedSlug.includes('sement') || normalizedSlug.includes('muda') || normalizedSlug.includes('arvore')) return Sprout;
    if (normalizedSlug.includes('armazen')) return Building2;

    return Package;
  };

  useEffect(() => {
    const draft = localStorage.getItem('bwagro_ad_draft');
    if (draft) setFormData(JSON.parse(draft));
    const draftId = localStorage.getItem('bwagro_ad_draft_id');
    if (draftId && !editAdId) setDraftAdId(draftId);
  }, []);

  useEffect(() => {
    const loadEditAnnouncement = async () => {
      if (!editAdId || !user?.id) return;
      if (loadedEditAdIdRef.current === editAdId) return;

      setIsLoadingEditAd(true);

      try {
        const { data: adData, error: adError } = await supabase
          .from('announcements')
          .select(`
            *,
            announcement_technical_details (label, value)
          `)
          .eq('id', editAdId)
          .eq('user_id', user.id)
          .maybeSingle();

        if (adError) throw adError;
        if (!adData) {
          toast.error('AnÃºncio nÃ£o encontrado para ediÃ§Ã£o.');
          navigate('/minha-conta/anuncios');
          return;
        }

        const { data: pendingEditRequestData } = await supabase
          .from('announcement_edit_requests')
          .select('id,payload,technical_details,status')
          .eq('announcement_id', editAdId)
          .eq('user_id', user.id)
          .eq('status', 'pending')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle<AnnouncementEditRequestRecord>();

        const fetchedTechnicalDetails = Array.isArray(adData.announcement_technical_details)
          ? adData.announcement_technical_details
          : [];
        const requestPayload = pendingEditRequestData?.payload || {};
        const sourceTechnicalDetails = Array.isArray(pendingEditRequestData?.technical_details) && pendingEditRequestData.technical_details.length > 0
          ? pendingEditRequestData.technical_details
          : fetchedTechnicalDetails;

        const technicalDetails = sourceTechnicalDetails.reduce((acc: Record<string, string>, item: { label: string; value: string }) => {
          const matchingField = (dbCategories.find((category) => category.id === adData.category_id)?.technical_fields_schema || [])
            .find((field: any) => normalizeTechnicalLabel(field.label || field.key || '') === normalizeTechnicalLabel(item.label));

          const targetKey = matchingField?.key || normalizeTechnicalLabel(item.label);

          if (targetKey) acc[targetKey] = item.value;

          return acc;
        }, {});

        const nextFormData = {
          title: requestPayload.title ?? adData.title ?? '',
          description: requestPayload.description ?? adData.description ?? '',
          price: Number(requestPayload.price ?? adData.price ?? 0),
          priceNegotiable: Boolean(requestPayload.accepts_trade ?? adData.accepts_trade),
          categoryGroupSlug: getCategoryGroupForCategorySlug(requestPayload.category_slug || adData.category_slug)?.slug || getCategoryGroupBySlug(requestPayload.category_slug || adData.category_slug)?.slug || requestPayload.category_slug || adData.category_slug || '',
          categoryId: requestPayload.category_id || adData.category_id || '',
          categorySlug: requestPayload.category_slug || adData.category_slug || '',
          subCategoryId: requestPayload.sub_category_id || adData.sub_category_id || '',
          subCategoryLabel: requestPayload.sub_category_label || adData.sub_category_label || '',
          quantity: Number(requestPayload.quantity ?? adData.quantity ?? 1),
          unit: requestPayload.unit || adData.unit || 'Unidade',
          unitPrice: Number(requestPayload.unit_price ?? adData.unit_price ?? adData.price ?? 0),
          currency: requestPayload.currency || adData.currency || 'BRL',
          location: {
            cep: requestPayload.cep || adData.cep || '',
            city: requestPayload.city || adData.city || '',
            state: requestPayload.state || adData.state || ''
          },
          productCondition: requestPayload.product_condition || adData.product_condition || '',
          availability: requestPayload.availability || adData.availability || '',
          acceptsTrade: Boolean(requestPayload.accepts_trade ?? adData.accepts_trade),
          hasWarranty: Boolean(requestPayload.has_warranty ?? adData.has_warranty),
          warrantyDetails: requestPayload.warranty_details || adData.warranty_details || '',
          hasInvoice: Boolean(requestPayload.has_invoice ?? adData.has_invoice),
          technical: technicalDetails,
          images: Array.isArray(requestPayload.images) ? requestPayload.images : Array.isArray(adData.images) ? adData.images : [],
          videoUrl: requestPayload.video_url || adData.video_url || '',
          videoStoragePath: requestPayload.video_storage_path || adData.video_storage_path || '',
          videoDurationSeconds: Number(requestPayload.video_duration_seconds ?? adData.video_duration_seconds ?? 0),
          videoSizeBytes: Number(requestPayload.video_size_bytes ?? adData.video_size_bytes ?? 0),
          isPremium: Boolean(requestPayload.is_premium ?? adData.is_premium)
        };

        setFormData(nextFormData);
        setImageItems(
          (Array.isArray(nextFormData.images) ? nextFormData.images : []).map((url: string, index: number) => ({
            id: `${adData.id}-image-${index}`,
            previewUrl: url,
            publicUrl: url,
            uploading: false,
            progress: 100
          }))
        );
        setVideoItem(
          nextFormData.videoUrl
            ? {
                id: `${adData.id}-video`,
                previewUrl: nextFormData.videoUrl,
                publicUrl: nextFormData.videoUrl,
                storagePath: nextFormData.videoStoragePath || undefined,
                uploading: false,
                progress: 100,
                durationSeconds: Number(nextFormData.videoDurationSeconds || 0) || undefined,
                sizeBytes: Number(nextFormData.videoSizeBytes || 0) || undefined,
              }
            : null
        );
        setDraftAdId(null);
        setPendingTechnicalDetails(sourceTechnicalDetails);
        draftIdRef.current = null;
        loadedEditAdIdRef.current = adData.id;
        localStorage.setItem('bwagro_ad_draft', JSON.stringify(nextFormData));
        localStorage.removeItem('bwagro_ad_draft_id');
        if (pendingEditRequestData?.id) {
          toast.info('Voce esta editando uma alteracao ja pendente. Ao salvar, a solicitacao existente sera atualizada.');
        }
        setCurrentStep('DETAILS');
      } catch (error) {
        console.error('[AdCreation] Erro ao carregar anÃºncio para ediÃ§Ã£o:', error);
        toast.error('NÃ£o foi possÃ­vel carregar o anÃºncio para ediÃ§Ã£o.');
      } finally {
        if (isMountedRef.current) {
          setIsLoadingEditAd(false);
        }
      }
    };

    void loadEditAnnouncement();
  }, [editAdId, user?.id, navigate, dbCategories]);

  useEffect(() => {
    if (pendingTechnicalDetails.length === 0 || technicalFieldsSchema.length === 0) return;

    setFormData((prev: any) => {
      const nextTechnical = { ...(prev.technical || {}) };

      for (const detail of pendingTechnicalDetails) {
        const matchingField = technicalFieldsSchema.find((field: any) =>
          normalizeTechnicalLabel(field.label || field.key || '') === normalizeTechnicalLabel(detail.label)
        );

        const targetKey = matchingField?.key || normalizeTechnicalLabel(detail.label);
        if (!targetKey) continue;

        nextTechnical[targetKey] = detail.value;
      }

      return {
        ...prev,
        technical: nextTechnical
      };
    });
  }, [pendingTechnicalDetails, technicalFieldsSchema]);

  // CÃ¡lculo automÃ¡tico: price = quantity * unitPrice
  useEffect(() => {
    const calculatedPrice = (formData.quantity || 1) * (formData.unitPrice || 0);
    // SÃ³ atualiza se o valor calculado for diferente do atual
    if (calculatedPrice !== formData.price) {
      setFormData(prev => ({ ...prev, price: calculatedPrice }));
    }
  }, [formData.quantity, formData.unitPrice]);

  useEffect(() => {
    const loadCategories = async () => {
      const { data, error } = await supabase
        .from('categories')
        .select('id,name,slug,icon,technical_fields_schema')
        .eq('is_active', true)
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true });
      if (!error && data) {
        setDbCategories(data as Array<{ id: string; name: string; slug: string; icon?: string | null; technical_fields_schema?: any[] }>);
      }
    };
    loadCategories();
  }, []);

  // Atualizar schema de campos tÃ©cnicos quando categoria mudar
  useEffect(() => {
    if (formData.categoryId) {
      const selectedCategory = dbCategories.find(cat => cat.id === formData.categoryId);
      console.log('[Debug] Categoria selecionada:', selectedCategory?.name, selectedCategory?.slug);
      
      if (selectedCategory?.technical_fields_schema) {
        console.log('[Debug] Schema de campos tÃ©cnicos carregado:', selectedCategory.technical_fields_schema);
        setTechnicalFieldsSchema(selectedCategory.technical_fields_schema);
      } else {
        console.log('[Debug] Nenhum schema de campos tÃ©cnicos definido para esta categoria');
        setTechnicalFieldsSchema([]);
      }
    } else {
      setTechnicalFieldsSchema([]);
    }
  }, [formData.categoryId, dbCategories]);

  useEffect(() => {
    if (!shouldShowStoreProductCondition && formData.productCondition) {
      setFormData((prev: any) => ({
        ...prev,
        productCondition: '',
      }));
    }
  }, [shouldShowStoreProductCondition, formData.productCondition]);

  const categoryIcons: Record<string, string> = {
    animais: 'ðŸ‚',
    maquinas: 'âš™ï¸',
    insumos: 'ðŸ§ª',
    imoveis: 'ðŸ¡',
    servicos: 'ðŸ› ï¸',
    sementes: 'ðŸŒ±',
    pecas: 'ðŸ”©',
    'maquinas-equipamentos': 'ðŸšœ',
    implementos: 'ðŸ§°',
    fazendas: 'ðŸŒ¾',
    'imoveis-rurais': 'ðŸ¡',
    'armazenagem-de-produtos': 'ðŸ¬',
    'alimentos-em-geral': 'ðŸ¥•',
    'arvores-adultas-mudas': 'ðŸŒ³',
    'tratores-agricolas': 'ðŸšœ',
    'maquinas-pesadas': 'ðŸš§',
    'fertilizantes-agricolas': 'ðŸ§«',
    'colheitadeiras-colhedoras': 'ðŸŒ¾',
    'alimentos-para-nutricao-animal': 'ðŸ„'
  };

  useEffect(() => {
    const loadSubcategories = async () => {
      if (!formData.categoryId) {
        setDbSubcategories([]);
        return;
      }
      const { data, error } = await supabase
        .from('category_subcategories')
        .select('id,category_id,name,slug')
        .eq('category_id', formData.categoryId)
        .eq('is_active', true)
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true });
      if (!error && data) {
        setDbSubcategories(data as Array<{ id: string; category_id: string; name: string; slug: string }>);
      } else {
        setDbSubcategories([]);
      }
    };
    loadSubcategories();
  }, [formData.categoryId]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const cleanupAbandonedDraft = async () => {
    if (isCleaningDraftRef.current) return;
    if (isEditingExistingAd) return;
    if (hasPublishedSuccessfullyRef.current) return;

    const pendingDraftId = draftIdRef.current || draftAdId || localStorage.getItem('bwagro_ad_draft_id');
    if (!pendingDraftId) {
      localStorage.removeItem('bwagro_ad_draft');
      localStorage.removeItem('bwagro_ad_draft_id');
      return;
    }

    isCleaningDraftRef.current = true;

    try {
      await supabase
        .from('announcements')
        .delete()
        .eq('id', pendingDraftId)
        .eq('status', AdStatus.PENDING);
    } catch (error) {
      console.error('[Draft] Erro ao limpar rascunho abandonado:', error);
    } finally {
      localStorage.removeItem('bwagro_ad_draft');
      localStorage.removeItem('bwagro_ad_draft_id');
      draftIdRef.current = null;
      if (isMountedRef.current) {
        setDraftAdId(null);
      }
      isCleaningDraftRef.current = false;
    }
  };

  useEffect(() => {
    return () => {
      void cleanupAbandonedDraft();
    };
  }, [isEditingExistingAd, draftAdId]);

  useEffect(() => {
    localStorage.setItem('bwagro_ad_draft', JSON.stringify(formData));
  }, [formData]);

  useEffect(() => {
    if (imageItems.length === 0 && Array.isArray(formData.images) && formData.images.length > 0) {
      setImageItems(formData.images.slice(0, 9).map((url: string, index: number) => ({
        id: `${Date.now()}-${index}`,
        previewUrl: url,
        publicUrl: url,
        storagePath: extractStoragePath(url) || undefined,
        uploading: false,
        progress: 100
      })));
    }
  }, [formData.images, imageItems.length]);

  useEffect(() => {
    if (!videoItem && formData.videoUrl) {
      setVideoItem({
        id: 'draft-video',
        previewUrl: formData.videoUrl,
        publicUrl: formData.videoUrl,
        storagePath: formData.videoStoragePath || undefined,
        uploading: false,
        progress: 100,
        durationSeconds: formData.videoDurationSeconds || undefined,
        sizeBytes: formData.videoSizeBytes || undefined,
      });
    }
  }, [formData.videoDurationSeconds, formData.videoSizeBytes, formData.videoStoragePath, formData.videoUrl, videoItem]);

  useEffect(() => {
    return () => {
      imageItems.forEach(item => {
        if (item.previewUrl?.startsWith('blob:')) {
          URL.revokeObjectURL(item.previewUrl);
        }
      });
    };
  }, [imageItems]);

  const maskCep = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 8);
    if (digits.length <= 5) return digits;
    return `${digits.slice(0, 5)}-${digits.slice(5)}`;
  };

  const handleCepLookup = async (cleanCep: string) => {
    if (cleanCep.length === 8) {
      try {
        const response = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
        const data = await response.json();
        if (!data.erro) {
          setFormData(prev => ({
            ...prev,
            location: { ...prev.location, cep: maskCep(cleanCep), city: data.localidade, state: data.uf }
          }));
        }
      } catch (e) { console.error("CEP error"); }
    }
  };

  const handleCepChange = (value: string) => {
    const masked = maskCep(value);
    setFormData(prev => ({
      ...prev,
      location: { ...prev.location, cep: masked }
    }));
    const cleanCep = masked.replace(/\D/g, '');
    if (cleanCep.length === 8) handleCepLookup(cleanCep);
  };

  const handleCepBlur = () => {
    const cleanCep = (formData.location?.cep || '').replace(/\D/g, '');
    if (cleanCep.length === 8) handleCepLookup(cleanCep);
  };

  const isUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

  const resolveCategoryId = async () => {
    if (isUuid(formData.categoryId)) return formData.categoryId;
    if (!formData.categorySlug) {
      toast.error('Erro interno: Slug da categoria ausente. Recarregue a pÃ¡gina.');
      return null;
    }
    const { data, error } = await supabase
      .from('categories')
      .select('id')
      .eq('slug', formData.categorySlug)
      .single();
    if (error || !data?.id) {
      toast.error('Categoria nÃ£o encontrada no banco.');
      return null;
    }
    return data.id as string;
  };

  const resolveSubCategoryId = async (categoryId: string | null) => {
    if (!formData.subCategoryId) return null;
    if (isUuid(formData.subCategoryId)) return formData.subCategoryId;
    if (!categoryId) return null;

    const slug = formData.subCategoryId;
    const { data, error } = await supabase
      .from('category_subcategories')
      .select('id')
      .eq('category_id', categoryId)
      .eq('slug', slug)
      .limit(1)
      .maybeSingle();

    if (error || !data?.id) return null;
    return data.id as string;
  };

  const handleCategorySelect = async (group: { slug: string }) => {
    setFormData(prev => ({
      ...prev,
      categoryGroupSlug: group.slug,
      categoryId: '',
      categorySlug: '',
      subCategoryId: '',
      subCategoryLabel: ''
    }));
    setCurrentStep('DETAILS');
  };

  const handleSpecificCategorySelect = (categoryId: string) => {
    const selectedCategory = availableSpecificCategories.find((category) => category.id === categoryId);

    setFormData((prev: any) => ({
      ...prev,
      categoryId: selectedCategory?.id || '',
      categorySlug: selectedCategory?.slug || '',
      subCategoryId: '',
      subCategoryLabel: ''
    }));
  };

  const extractStoragePath = (publicUrl: string) => {
    const marker = '/ads-images/';
    const index = publicUrl.indexOf(marker);
    if (index === -1) return null;
    return publicUrl.substring(index + marker.length);
  };

  const buildCurrentDraftMedia = (
    override?: Partial<{
      images: string[];
      videoUrl: string | null;
      videoStoragePath: string | null;
      videoDurationSeconds: number | null;
      videoSizeBytes: number | null;
    }>
  ) => ({
    images: override?.images ?? (Array.isArray(formData.images) ? formData.images : []),
    videoUrl: override?.videoUrl ?? (hasStoreListingAccess ? formData.videoUrl || null : null),
    videoStoragePath: override?.videoStoragePath ?? (hasStoreListingAccess ? formData.videoStoragePath || null : null),
    videoDurationSeconds:
      override?.videoDurationSeconds ?? (hasStoreListingAccess ? (formData.videoDurationSeconds || null) : null),
    videoSizeBytes: override?.videoSizeBytes ?? (hasStoreListingAccess ? (formData.videoSizeBytes || null) : null),
  });

  const buildTechnicalDetailsPayload = () =>
    technicalFieldsSchema
      .filter((field) => formData.technical?.[field.key] && String(formData.technical[field.key]).trim() !== '')
      .map((field) => ({
        label: field.label,
        value: String(formData.technical[field.key]),
        icon_name: field.icon || 'Circle'
      }));

  const ensureDraftAd = async (media: ReturnType<typeof buildCurrentDraftMedia>) => {
    if (!user?.id) return null;
    if (isEditingExistingAd) return null;
    if (!ensureAdCreationAllowed()) return null;
    if (draftIdRef.current) return draftIdRef.current;

    // Singleton pattern: se jÃ¡ estÃ¡ criando, aguarda o ID
    if (isCreatingDraft.current) {
      console.log('[Draft] Aguardando criaÃ§Ã£o do rascunho...');
      // Aguarda atÃ© 5 segundos pelo ID (50 tentativas x 100ms)
      for (let i = 0; i < 50; i++) {
        await new Promise(resolve => setTimeout(resolve, 100));
        if (draftIdRef.current) {
          console.log('[Draft] ID encontrado apÃ³s aguardar:', draftIdRef.current);
          return draftIdRef.current;
        }
      }
      console.error('[Draft] Timeout ao aguardar ID do rascunho (5s)');
      return null;
    }

    // Bloquear outras tentativas
    isCreatingDraft.current = true;
    console.log('[Draft] Iniciando criaÃ§Ã£o de rascunho Ãºnico...');

    const numericPrice = parseFloat(String(formData.price || 0).replace(/[^0-9.,]/g, '').replace(/\./g, '').replace(',', '.'));
    const numericUnitPrice = parseFloat(String(formData.unitPrice || 0).replace(/[^0-9.,]/g, '').replace(/\./g, '').replace(',', '.'));
    const resolvedCategoryId = await resolveCategoryId();
    const resolvedSubCategoryId = await resolveSubCategoryId(resolvedCategoryId);

    if (!resolvedCategoryId) {
      isCreatingDraft.current = false;
      return null;
    }
    const payload = {
      title: formData.title || 'Rascunho',
      description: formData.description || 'Rascunho',
      price: Number.isNaN(numericPrice) ? 0 : numericPrice,
      unit_price: Number.isNaN(numericUnitPrice) ? 0 : numericUnitPrice,
      quantity: Number.isNaN(Number(formData.quantity)) ? 0 : Number(formData.quantity),
      unit: formData.unit || 'Unidade',
      currency: formData.currency || 'BRL',
      category_id: resolvedCategoryId,
      category_slug: formData.categorySlug,
      sub_category_id: resolvedSubCategoryId,
      sub_category_label: formData.subCategoryLabel || null,
      city: formData.location?.city || 'A definir',
      state: formData.location?.state || '--',
      cep: (formData.location?.cep || '').replace(/\D/g, '') || null,
      product_condition: shouldShowStoreProductCondition ? formData.productCondition || null : null,
      availability: hasStoreListingAccess ? formData.availability || null : null,
      accepts_trade: hasStoreListingAccess ? !!formData.acceptsTrade : false,
      has_warranty: hasStoreListingAccess ? !!formData.hasWarranty : false,
      warranty_details: hasStoreListingAccess && formData.hasWarranty ? (formData.warrantyDetails || null) : null,
      has_invoice: hasStoreListingAccess ? !!formData.hasInvoice : false,
      images: media.images,
      video_url: media.videoUrl,
      video_storage_path: media.videoStoragePath,
      video_duration_seconds: media.videoDurationSeconds,
      video_size_bytes: media.videoSizeBytes,
      user_id: user.id,
      status: AdStatus.PENDING,
      is_premium: !!formData.isPremium,
      whatsapp: user?.whatsapp || user?.phone || null
    };

    const { data, error } = await supabase
      .from('announcements')
      .insert(payload)
      .select('id')
      .single();

    console.log('[Draft] Resposta do insert:', { data, error });
    if (error) {
      console.error('[Draft] Erro detalhado:', error.message, error.details, error.hint);
    }

    if (error) {
      isCreatingDraft.current = false;
      toast.error('Falha ao salvar rascunho.', { description: error.message });
      return null;
    }

    const newId = data?.id ?? null;
    if (newId) {
      draftIdRef.current = newId;
      setDraftAdId(newId);
      localStorage.setItem('bwagro_ad_draft_id', newId);
      console.log('[Draft] Rascunho criado com sucesso:', newId);
    }
    
    // Liberar bloqueio
    isCreatingDraft.current = false;
    return newId;
  };

  const compressImage = async (file: File) => {
    const options = {
      maxSizeMB: 1,
      maxWidthOrHeight: 1200,
      useWebWorker: true,
      initialQuality: 0.8,
      fileType: 'image/webp'
    };
    try {
      const compressed = await imageCompression(file, options);
      const nextName = file.name.replace(/\.[^/.]+$/, '.webp');
      const compressedFile = new File([compressed], nextName, { type: 'image/webp' });
      return compressedFile;
    } catch (err) {
      console.error('[Ads] Erro ao comprimir imagem:', err);
      return file;
    }
  };

  const extractVideoStoragePath = (publicUrl: string) => {
    const marker = '/announcement-videos/';
    const index = publicUrl.indexOf(marker);
    if (index === -1) return null;
    return publicUrl.substring(index + marker.length);
  };

  const syncDraftMedia = async (media: ReturnType<typeof buildCurrentDraftMedia>) => {
    if (isEditingExistingAd) return;
    const currentDraftId = await ensureDraftAd(media);
    const images = media.images;
    if (!currentDraftId) {
      console.warn('[Ads] Rascunho nÃ£o salvo, mas fotos permanecem no estado local.');
      return;
    }
    const { error } = await supabase
      .from('announcements')
      .update({ images })
      .eq('id', currentDraftId);

    const { error: videoError } = await supabase
      .from('announcements')
      .update({
        video_url: media.videoUrl,
        video_storage_path: media.videoStoragePath,
        video_duration_seconds: media.videoDurationSeconds,
        video_size_bytes: media.videoSizeBytes,
      })
      .eq('id', currentDraftId);

    if (error) {
      console.error('[Ads] Erro ao atualizar imagens do rascunho:', error);
    }
    if (videoError) {
      console.error('[Ads] Erro ao atualizar video do rascunho:', videoError);
    }
  };

  const handleImagesSelected = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    if (!user?.id) {
      toast.error('SessÃ£o invÃ¡lida. FaÃ§a login novamente.');
      return;
    }

    if (!ensureAdCreationAllowed()) {
      return;
    }

    const availableSlots = 9 - imageItems.length;
    const fileArray = Array.from(files).slice(0, Math.max(availableSlots, 0));
    
    console.log('[Debug Ads] Iniciando upload', { files: fileArray.length, categoryId: formData.categoryId });

    if (fileArray.length === 0) {
      toast.error('Limite de 9 imagens atingido.');
      return;
    }

    if (files.length > fileArray.length) {
      toast.info('Algumas imagens foram ignoradas para respeitar o limite de 9.');
    }

    // CRIAR PREVIEW INSTANTÃ‚NEO ANTES DE QUALQUER AWAIT
    const previewItems = fileArray.map(file => ({
      id: `${Date.now()}-${file.name}-${Math.random().toString(36).slice(2, 7)}`,
      previewUrl: URL.createObjectURL(file),
      uploading: true,
      progress: 0,
      originalFile: file
    }));

    if (isMountedRef.current) {
      setImageItems(prev => [...prev, ...previewItems]);
      setIsUploadingImages(true);
    }

    // VALIDAR CATEGORIA APÃ“S MOSTRAR PREVIEW
    if (!formData.categoryId) {
      const resolvedCategoryId = await resolveCategoryId();
      if (!resolvedCategoryId) {
        toast.error('Selecione uma categoria antes de enviar imagens.');
        if (isMountedRef.current) {
          setImageItems(prev => prev.filter(item => !previewItems.find(p => p.id === item.id)));
          setIsUploadingImages(false);
        }
        return;
      }
      setFormData(prev => ({ ...prev, categoryId: resolvedCategoryId }));
    }

    try {
      for (let i = 0; i < previewItems.length; i += 1) {
        const { id: itemId, originalFile } = previewItems[i];
        if (!originalFile) continue;

        const compressedFile = await compressImage(originalFile);
        const ensuredName = compressedFile.name.endsWith('.webp')
          ? compressedFile.name
          : `${compressedFile.name}.webp`;

        const progressTimer = setInterval(() => {
          if (!isMountedRef.current) {
            clearInterval(progressTimer);
            return;
          }
          // Agrupa atualizaÃ§Ã£o em um Ãºnico render
          setImageItems(prev => {
            const updated = prev.map(item => 
              item.id === itemId && item.progress < 90
                ? { ...item, progress: Math.min(item.progress + 7, 90) }
                : item
            );
            return updated;
          });
        }, 300);

        const safeName = ensuredName.replace(/[^a-zA-Z0-9_.-]/g, '_');
        const userSlug = slugify(user?.name || user?.email || 'usuario');
        const categorySlug = formData.categorySlug || 'categoria';
        const subCategoryLabel = formData.subCategoryLabel || '';
        const subCategorySlug = subCategoryLabel ? slugify(subCategoryLabel) : 'outros';
        const filePath = `${userSlug}/${categorySlug}/${subCategorySlug}/${Date.now()}-${user.id}-${safeName}`;

        const { error: uploadError } = await supabase.storage
          .from('ads-images')
          .upload(filePath, compressedFile, { upsert: false });

        if (uploadError) {
          console.error('[Ads] Erro ao enviar imagem:', uploadError);
          const isPermission = /permission|rls|not allowed|denied|unauthorized|400/i.test(uploadError.message || '');
          toast.error(
            isPermission ? 'PermissÃ£o negada no envio.' : 'Falha ao enviar imagem.',
            { description: isPermission ? 'Tente novamente ou verifique sua conexÃ£o.' : uploadError.message }
          );
          clearInterval(progressTimer);
          if (isMountedRef.current) {
            setImageItems(prev => prev.filter(item => item.id !== itemId));
          }
          continue;
        }

        const { data } = supabase.storage
          .from('ads-images')
          .getPublicUrl(filePath);

        if (data?.publicUrl) {
          clearInterval(progressTimer);
          if (isMountedRef.current) {
            setImageItems(prev => prev.map(item => item.id === itemId
              ? { ...item, uploading: false, publicUrl: data.publicUrl, storagePath: filePath, progress: 100 }
              : item
            ));

            setFormData(prev => {
              const nextImages = [...(prev.images || []), data.publicUrl];
              void syncDraftMedia(buildCurrentDraftMedia({ images: nextImages }));
              return { ...prev, images: nextImages };
            });
          }
        } else {
          clearInterval(progressTimer);
          if (isMountedRef.current) {
            setImageItems(prev => prev.filter(item => item.id !== itemId));
          }
        }
      }
    } catch (err: any) {
      console.error('[Ads] Erro inesperado no upload:', err);
      toast.error('Falha ao enviar imagens.', { description: 'Tente novamente.' });
    } finally {
      if (isMountedRef.current) {
        setIsUploadingImages(false);
      }
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleVideoSelected = async (files: FileList | null) => {
    if (!hasStoreListingAccess) {
      toast.error('O envio de video esta disponivel apenas para Loja Parceira.');
      return;
    }

    const file = files?.[0];
    if (!file) return;

    if (!user?.id) {
      toast.error('Sessao invalida. Faca login novamente.');
      return;
    }

    if (!ensureAdCreationAllowed()) {
      return;
    }

    const previewUrl = URL.createObjectURL(file);
    const localVideoId = `${Date.now()}-video-${Math.random().toString(36).slice(2, 7)}`;

    setVideoItem({
      id: localVideoId,
      previewUrl,
      uploading: true,
      progress: 5,
    });

    try {
      const compressed = await compressAnnouncementVideo(file);

      setVideoItem((current) =>
        current
          ? {
              ...current,
              progress: 35,
              durationSeconds: compressed.durationSeconds,
              sizeBytes: compressed.sizeBytes,
            }
          : current
      );

      const userSlug = slugify(user?.name || user?.email || 'usuario');
      const categorySlug = formData.categorySlug || 'categoria';
      const safeName = compressed.file.name.replace(/[^a-zA-Z0-9_.-]/g, '_');
      const filePath = `${user.id}/${userSlug}/${categorySlug}/${Date.now()}-${safeName}`;

      const { error: uploadError } = await supabase.storage
        .from('announcement-videos')
        .upload(filePath, compressed.file, { upsert: false });

      if (uploadError) {
        throw new Error(uploadError.message);
      }

      const { data } = supabase.storage
        .from('announcement-videos')
        .getPublicUrl(filePath);

      if (!data?.publicUrl) {
        throw new Error('Nao foi possivel obter a URL publica do video.');
      }

      const previousVideoPath = formData.videoStoragePath || videoItem?.storagePath;

      setVideoItem({
        id: localVideoId,
        previewUrl: data.publicUrl,
        publicUrl: data.publicUrl,
        storagePath: filePath,
        uploading: false,
        progress: 100,
        durationSeconds: compressed.durationSeconds,
        sizeBytes: compressed.sizeBytes,
      });

      setFormData((prev: any) => {
        const nextFormData = {
          ...prev,
          videoUrl: data.publicUrl,
          videoStoragePath: filePath,
          videoDurationSeconds: compressed.durationSeconds,
          videoSizeBytes: compressed.sizeBytes,
        };

        void syncDraftMedia(
          buildCurrentDraftMedia({
            images: Array.isArray(nextFormData.images) ? nextFormData.images : [],
            videoUrl: nextFormData.videoUrl,
            videoStoragePath: nextFormData.videoStoragePath,
            videoDurationSeconds: nextFormData.videoDurationSeconds,
            videoSizeBytes: nextFormData.videoSizeBytes,
          })
        );

        return nextFormData;
      });

      if (previousVideoPath && previousVideoPath !== filePath) {
        await supabase.storage.from('announcement-videos').remove([previousVideoPath]);
      }

      if (compressed.sizeBytes > 12 * 1024 * 1024) {
        toast.success('Video enviado com sucesso.', {
          description: 'A compressao foi aplicada, mas o arquivo final permaneceu acima do alvo ideal de 12MB.',
        });
      } else {
        toast.success('Video otimizado e enviado com sucesso.');
      }
    } catch (error: any) {
      if (previewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(previewUrl);
      }

      setVideoItem(null);
      const message =
        error instanceof VideoCompressionError
          ? error.message
          : error?.message || 'Nao foi possivel preparar o video para o anuncio.';

      toast.error('Falha ao enviar video.', {
        description: message,
      });
    } finally {
      if (videoInputRef.current) {
        videoInputRef.current.value = '';
      }
    }
  };

  const handleRemoveVideo = async () => {
    if (videoItem?.previewUrl?.startsWith('blob:')) {
      URL.revokeObjectURL(videoItem.previewUrl);
    }

    const storagePath = videoItem?.storagePath || (formData.videoUrl ? extractVideoStoragePath(formData.videoUrl) : null);
    setVideoItem(null);

    setFormData((prev: any) => {
      const nextFormData = {
        ...prev,
        videoUrl: '',
        videoStoragePath: '',
        videoDurationSeconds: 0,
        videoSizeBytes: 0,
      };

      void syncDraftMedia(
        buildCurrentDraftMedia({
          images: Array.isArray(nextFormData.images) ? nextFormData.images : [],
          videoUrl: null,
          videoStoragePath: null,
          videoDurationSeconds: null,
          videoSizeBytes: null,
        })
      );

      return nextFormData;
    });

    if (storagePath) {
      const { error } = await supabase.storage.from('announcement-videos').remove([storagePath]);
      if (error) {
        console.error('[Ads] Erro ao remover video:', error);
      }
    }
  };

  const handleDragEnd = (event: any) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    setImageItems(prev => {
      const oldIndex = prev.findIndex(item => item.id === active.id);
      const newIndex = prev.findIndex(item => item.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return prev;
      const newItems = arrayMove(prev, oldIndex, newIndex);

      const orderedUrls = newItems
        .map(item => item.publicUrl)
        .filter(Boolean) as string[];

      setFormData(current => ({ ...current, images: orderedUrls }));
      void syncDraftMedia(buildCurrentDraftMedia({ images: orderedUrls }));
      return newItems;
    });
  };

  const handleRemoveImage = async (item: ImageItem) => {
    if (item.previewUrl?.startsWith('blob:')) {
      URL.revokeObjectURL(item.previewUrl);
    }

    setImageItems(prev => prev.filter(img => img.id !== item.id));

    if (item.publicUrl) {
      setFormData(prev => {
        const nextImages = (prev.images || []).filter((url: string) => url !== item.publicUrl);
        void syncDraftMedia(buildCurrentDraftMedia({ images: nextImages }));
        return { ...prev, images: nextImages };
      });
    }

    const storagePath = item.storagePath || (item.publicUrl ? extractStoragePath(item.publicUrl) : null);
    if (storagePath) {
      const { error } = await supabase.storage
        .from('ads-images')
        .remove([storagePath]);
      if (error) {
        console.error('[Ads] Erro ao remover imagem:', error);
      }
    }
  };

  const buildAnnouncementExpiresAt = () => {
    const durationDays = subscription?.plans?.ad_duration_days;
    if (durationDays === null || durationDays === undefined) return null;
    if (durationDays <= 0) return null;

    const expiresAt = new Date();
    expiresAt.setUTCDate(expiresAt.getUTCDate() + durationDays);
    return expiresAt.toISOString();
  };

  const handleSubmitAd = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    
    console.log('[Publish] Iniciando publicaÃ§Ã£o com dados:', {
      categoryId: formData.categoryId,
      technical: formData.technical,
      technicalFieldsSchemaLength: technicalFieldsSchema.length
    });
    
    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError) {
        console.error('[Ads] Erro ao obter usuÃ¡rio autenticado:', authError);
        toast.error('NÃ£o foi possÃ­vel validar seu login.');
        return;
      }

      const authUserId = authData?.user?.id;
      const userId = authUserId || user?.id;

      if (!userId) {
        console.error('[Ads] user.id nulo, cancelando insert');
        toast.error('SessÃ£o invÃ¡lida. FaÃ§a login novamente.');
        return;
      }

      if (!formData.categoryId) {
        toast.error('Selecione uma categoria para continuar.');
        return;
      }

      const cleanCep = (formData.location?.cep || '').replace(/\D/g, '');
      const numericPrice = parseFloat(String(formData.price || 0).replace(/[^0-9.,]/g, '').replace(/\./g, '').replace(',', '.'));
      const numericUnitPrice = parseFloat(String(formData.unitPrice || 0).replace(/[^0-9.,]/g, '').replace(/\./g, '').replace(',', '.'));
      const resolvedCategoryId = await resolveCategoryId();
      const resolvedSubCategoryId = await resolveSubCategoryId(resolvedCategoryId);

      if (!resolvedCategoryId) {
        toast.error('Categoria invÃ¡lida. Atualize a pÃ¡gina e tente novamente.');
        return;
      }

      // Validar localizaÃ§Ã£o antes de publicar
      if (!formData.location?.city || formData.location.city === 'A definir' || !formData.location?.state || formData.location.state === '--') {
        toast.error('Preencha a localizaÃ§Ã£o completa antes de publicar.', { description: 'Informe o CEP para autocompletar cidade e estado.' });
        return;
      }

      const editablePayload = {
        title: formData.title,
        description: formData.description,
        price: Number.isNaN(numericPrice) ? 0 : numericPrice,
        unit_price: Number.isNaN(numericUnitPrice) ? 0 : numericUnitPrice,
        quantity: Number.isNaN(Number(formData.quantity)) ? 0 : Number(formData.quantity),
        unit: formData.unit || 'Unidade',
        currency: formData.currency || 'BRL',
        category_id: resolvedCategoryId,
        category_slug: formData.categorySlug,
        sub_category_id: resolvedSubCategoryId,
        sub_category_label: formData.subCategoryLabel || null,
        city: formData.location?.city || null,
        state: formData.location?.state || null,
        cep: cleanCep || null,
      product_condition: shouldShowStoreProductCondition ? formData.productCondition || null : null,
        availability: hasStoreListingAccess ? formData.availability || null : null,
        accepts_trade: hasStoreListingAccess ? !!formData.acceptsTrade : false,
        has_warranty: hasStoreListingAccess ? !!formData.hasWarranty : false,
        warranty_details: hasStoreListingAccess && formData.hasWarranty ? (formData.warrantyDetails || null) : null,
        has_invoice: hasStoreListingAccess ? !!formData.hasInvoice : false,
        images: Array.isArray(formData.images) ? formData.images : [],
        video_url: hasStoreListingAccess ? (formData.videoUrl || null) : null,
        video_storage_path: hasStoreListingAccess ? (formData.videoStoragePath || null) : null,
        video_duration_seconds: hasStoreListingAccess ? (formData.videoDurationSeconds || null) : null,
        video_size_bytes: hasStoreListingAccess ? (formData.videoSizeBytes || null) : null,
        is_premium: !!formData.isPremium,
        whatsapp: user?.whatsapp || user?.phone || null
      };

      const technicalDetailsPayload = buildTechnicalDetailsPayload();
      const moderationResult = await evaluatePublicationModeration({
        title: editablePayload.title,
        description: editablePayload.description,
        categorySlug: editablePayload.category_slug,
        images: editablePayload.images,
      });

      if (moderationResult?.blocked) {
        toast.error('Anúncio bloqueado pelas regras de publicação.', {
          description: formatPublicationModerationReasons(moderationResult.reasons),
        });
        return;
      }

      if (isEditingExistingAd && editAdId) {
        const { data: existingRequest } = await supabase
          .from('announcement_edit_requests')
          .select('id')
          .eq('announcement_id', editAdId)
          .eq('user_id', userId)
          .eq('status', 'pending')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle<{ id: string }>();

        const requestData = {
          announcement_id: editAdId,
          user_id: userId,
          payload: editablePayload,
          technical_details: technicalDetailsPayload,
          status: 'pending' as const,
          rejection_reason: null,
          reviewed_at: null,
          reviewed_by: null
        };

        const requestResult = existingRequest?.id
          ? await supabase
              .from('announcement_edit_requests')
              .update(requestData)
              .eq('id', existingRequest.id)
              .select('id')
              .single()
          : await supabase
              .from('announcement_edit_requests')
              .insert(requestData)
              .select('id')
              .single();

        if (requestResult.error) {
          toast.error('Erro ao enviar alteracoes para analise.', { description: requestResult.error.message });
          return;
        }

        hasPublishedSuccessfullyRef.current = true;
        localStorage.removeItem('bwagro_ad_draft');
        localStorage.removeItem('bwagro_ad_draft_id');
        setDraftAdId(null);
        draftIdRef.current = null;
        toast.success('Alteracoes enviadas para analise da equipe.');
        navigate('/minha-conta/anuncios');
        return;
      }

      const payload = {
        ...editablePayload,
        user_id: userId,
        status: moderationResult?.reviewRequired ? AdStatus.PENDING : AdStatus.ACTIVE,
        expires_at: buildAnnouncementExpiresAt(),
      };

      let data = null;
      let error = null;

      // Se existe rascunho, SEMPRE usar update
      if (draftAdId) {
        console.log('[Publish] Atualizando rascunho:', draftAdId);
        
        const updateResult = await supabase
          .from('announcements')
          .update(payload)
          .eq('id', draftAdId)
          .select('*')
          .maybeSingle();

        data = updateResult.data;
        error = updateResult.error;

        if (error) {
          console.error('[Publish] Erro no update:', error);
        }
      } else {
        // Sem rascunho, fazer insert direto
        console.log('[Publish] Criando novo anÃºncio (sem rascunho)');
        const insertResult = await supabase
          .from('announcements')
          .insert(payload)
          .select('*')
          .maybeSingle();

        data = insertResult.data;
        error = insertResult.error;

        if (error) {
          console.error('[Publish] Erro no insert:', error);
        }
      }

      console.log('[Publish] Resultado final:', { data, error });

      if (error) {
        toast.error('Erro ao publicar anÃºncio.', { description: error.message });
        return;
      }

      if (!data?.id) {
        toast.error('Erro ao obter ID do anÃºncio publicado.');
        return;
      }

      const announcementId = data.id;
      console.log('[Publish] AnÃºncio publicado com sucesso:', announcementId);

      if (cleanCep) {
        const geoUpdated = await updateAnnouncementCoordinates(
          announcementId,
          cleanCep,
          supabase,
          {
            city: formData.location?.city,
            state: formData.location?.state
          },
          {
            cep: user?.cep,
            street: user?.logradouro,
            number: user?.numero,
            neighborhood: user?.bairro,
            city: user?.cidade,
            state: user?.estado
          }
        );
        if (!geoUpdated) {
          console.warn('[Ads] NÃ£o foi possÃ­vel atualizar coordenadas do anÃºncio apÃ³s publicaÃ§Ã£o:', announcementId);
        }
      }
      console.log('[Debug] Dados tÃ©cnicos para salvar:', formData.technical);
      console.log('[Debug] Schema de campos tÃ©cnicos:', technicalFieldsSchema);

      // Salvar especificaÃ§Ãµes tÃ©cnicas na tabela announcement_technical_details
      if (technicalDetailsPayload.length > 0) {
        // Limpar detalhes tÃ©cnicos antigos (caso seja ediÃ§Ã£o)
        const { error: deleteError } = await supabase
          .from('announcement_technical_details')
          .delete()
          .eq('announcement_id', announcementId);

        if (deleteError) {
          console.warn('[Publish] Aviso ao limpar detalhes antigos:', deleteError);
        } else {
          console.log('[Publish] Detalhes tÃ©cnicos antigos removidos (se existiam)');
        }

        const technicalDetailsToInsert = technicalDetailsPayload.map(detail => ({
          announcement_id: announcementId,
          label: detail.label,
          value: detail.value,
          icon_name: detail.icon_name || 'Circle'
        }));

        console.log('[Debug] Detalhes tÃ©cnicos a serem inseridos:', technicalDetailsToInsert);

        if (technicalDetailsToInsert.length > 0) {
          const { error: detailsError } = await supabase
            .from('announcement_technical_details')
            .insert(technicalDetailsToInsert);

          if (detailsError) {
            console.error('[Publish] Erro ao salvar especificaÃ§Ãµes tÃ©cnicas:', detailsError);
            toast.error('Erro ao salvar especificaÃ§Ãµes tÃ©cnicas', { description: detailsError.message });
          } else {
            console.log('[Publish] EspecificaÃ§Ãµes tÃ©cnicas salvas com sucesso:', technicalDetailsToInsert.length, 'registros');
          }
        } else {
          console.log('[Publish] Nenhuma especificaÃ§Ã£o tÃ©cnica para salvar (campos vazios)');
        }
      } else {
        console.log('[Publish] Schema vazio ou dados tÃ©cnicos nÃ£o disponÃ­veis');
      }

      hasPublishedSuccessfullyRef.current = true;
      localStorage.removeItem('bwagro_ad_draft');
      localStorage.removeItem('bwagro_ad_draft_id');
      setDraftAdId(null);
      setCurrentStep('SUCCESS');
      if (moderationResult?.reviewRequired || String(data.status).toUpperCase() === 'PENDING') {
        toast.success('Anúncio enviado para análise da equipe.', {
          description: formatPublicationModerationReasons(moderationResult?.reasons || []),
        });
      } else {
        toast.success('Anúncio publicado com sucesso.');
      }
      navigate('/minha-conta/anuncios');
    } catch (error: any) {
      console.error('[Publish] Erro inesperado ao publicar anÃºncio:', error);
      toast.error('Erro ao publicar anÃºncio', {
        description: error.message || 'Tente novamente mais tarde.'
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const steps: Step[] = ['CATEGORY', 'DETAILS', 'MEDIA', 'PRICING', 'REVIEW'];
  const currentStepIndex = steps.indexOf(currentStep);
  const handleBack = () => {
    if (currentStepIndex <= 0) return;
    setCurrentStep(steps[currentStepIndex - 1]);
  };

  const renderStep = () => {
    switch (currentStep) {
      case 'CATEGORY':
        return (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
            {topLevelCategoryGroups.map(cat => {
              const Icon = resolveCategoryIcon(cat);

              return (
              <button
                key={cat.id}
                onClick={() => handleCategorySelect(cat)}
                className={`p-8 rounded-[2rem] border-2 transition-all text-center group ${selectedCategoryGroup?.slug === cat.slug ? 'border-green-600 bg-green-50 shadow-lg' : 'border-slate-100 hover:border-green-200 hover:bg-slate-50'}`}
              >
                {cat.icon ? (
                  <div className="hidden">
                    {cat.icon || categoryIcons[cat.slug] || 'ðŸ“¦'}
                  </div>
                ) : (
                  <div className="hidden">
                    {CATEGORIES.find(base => base.slug === cat.slug)?.icon || categoryIcons[cat.slug] || 'ðŸ“¦'}
                  </div>
                )}
                <div className="mb-4 flex justify-center">
                  <div className={`flex h-14 w-14 items-center justify-center rounded-2xl border transition-all ${selectedCategoryGroup?.slug === cat.slug ? 'border-green-200 bg-white text-green-700 shadow-sm' : 'border-slate-200 bg-slate-50 text-slate-600 group-hover:border-green-200 group-hover:bg-white group-hover:text-green-700'}`}>
                    <Icon className="h-7 w-7" strokeWidth={1.8} />
                  </div>
                </div>
                <div className="font-black text-slate-800">{cat.name}</div>
              </button>
            );
            })}
          </div>
        );

      case 'DETAILS':
        return (
          <div className="space-y-8 max-w-2xl mx-auto">
            <div className="grid grid-cols-1 gap-6">
              <div>
                <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Categoria</label>
                <select
                  value={formData.categoryId}
                  onChange={e => handleSpecificCategorySelect(e.target.value)}
                  className="w-full bg-slate-50 border-none rounded-2xl px-6 py-4 focus:ring-2 focus:ring-green-600 outline-none"
                >
                  <option value="">Selecione uma categoria</option>
                  {availableSpecificCategories.map(category => (
                    <option key={category.id} value={category.id}>{category.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Subcategoria</label>
                <select
                  value={formData.subCategoryId}
                  onChange={e => {
                    const selectedFromDb = dbSubcategories.find(sub => sub.id === e.target.value)
                    const selectedLabel = selectedFromDb
                      ? selectedFromDb.name
                      : ''
                    setFormData({
                      ...formData,
                      subCategoryId: e.target.value,
                      subCategoryLabel: selectedLabel
                    })
                  }}
                  className="w-full bg-slate-50 border-none rounded-2xl px-6 py-4 focus:ring-2 focus:ring-green-600 outline-none"
                >
                  <option value="">Selecione uma subcategoria</option>
                  {dbSubcategories.map(sub => (
                    <option key={sub.id} value={sub.id}>{sub.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Título do Anúncio</label>
                <input 
                  type="text" 
                  value={formData.title}
                  onChange={e => setFormData({...formData, title: e.target.value})}
                  onBlur={e => {
                    const result = censorContactData(e.target.value);
                    if (result.hadContactData) {
                      setFormData({...formData, title: result.censored});
                      toast.error('Por sua segurança, removemos dados de contato do título', {
                        description: 'Use o chat oficial da plataforma para negociar',
                        duration: 5000
                      });
                    }
                  }}
                  className="w-full bg-slate-50 border-none rounded-2xl px-6 py-4 focus:ring-2 focus:ring-green-600 outline-none" 
                  placeholder="Ex: Trator John Deere 6125J - Único Dono"
                />
              </div>

              {/* Campos Dinâmicos baseados no Schema */}
              {technicalFieldsSchema.length > 0 && (
                <div>
                  <h3 className="text-sm font-black text-slate-700 mb-4">Especificações Técnicas</h3>
                  <div className="grid grid-cols-2 gap-4">
                    {technicalFieldsSchema.map((field, index) => (
                      <div key={index}>
                        <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">
                          {field.label}
                        </label>
                        {field.type === 'text' && (
                          <input 
                            type="text" 
                            value={formData.technical?.[field.key] || ''}
                            onChange={e => setFormData({...formData, technical: {...formData.technical, [field.key]: e.target.value}})}
                            className="w-full bg-slate-50 border-none rounded-xl px-4 py-3 focus:ring-2 focus:ring-green-600 outline-none" 
                            placeholder={field.placeholder || ''}
                          />
                        )}
                        {field.type === 'number' && (
                          <input 
                            type="number" 
                            value={formData.technical?.[field.key] || ''}
                            onChange={e => setFormData({...formData, technical: {...formData.technical, [field.key]: e.target.value}})}
                            className="w-full bg-slate-50 border-none rounded-xl px-4 py-3 focus:ring-2 focus:ring-green-600 outline-none" 
                            placeholder={field.placeholder || '0'}
                          />
                        )}
                        {field.type === 'select' && field.options && (
                          <select 
                            value={formData.technical?.[field.key] || ''}
                            onChange={e => setFormData({...formData, technical: {...formData.technical, [field.key]: e.target.value}})}
                            className="w-full bg-slate-50 border-none rounded-xl px-4 py-3 focus:ring-2 focus:ring-green-600 outline-none"
                          >
                            <option value="">Selecione...</option>
                            {field.options.map((opt: string, i: number) => (
                              <option key={i} value={opt}>{opt}</option>
                            ))}
                          </select>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Descrição Completa</label>
                <textarea 
                  rows={6}
                  value={formData.description}
                  onChange={e => setFormData({...formData, description: e.target.value})}
                  onBlur={e => {
                    const result = censorContactData(e.target.value);
                    if (result.hadContactData) {
                      setFormData({...formData, description: result.censored});
                      toast.error('Por sua segurança, removemos dados de contato da descrição', {
                        description: 'Use o chat oficial da plataforma para negociar',
                        duration: 5000
                      });
                    }
                  }}
                  className="w-full bg-slate-50 border-none rounded-2xl px-6 py-4 focus:ring-2 focus:ring-green-600 outline-none resize-none" 
                  placeholder="Descreva detalhes do produto, histórico e condições de conservação..."
                ></textarea>
              </div>

              {hasStoreListingAccess && (
                <div className="rounded-[2rem] border border-emerald-100 bg-emerald-50/60 p-6 space-y-5">
                  <div className="flex items-start gap-3">
                    <div className="rounded-2xl bg-white p-3 text-emerald-700 shadow-sm">
                      <Building2 className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-base font-black text-slate-900">Informações comerciais da loja</h3>
                      <p className="mt-1 text-sm leading-6 text-slate-600">
                        Esses campos deixam o anúncio com mais cara de catálogo profissional e ajudam o comprador a entender a operação da sua loja.
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {shouldShowStoreProductCondition && (
                      <div>
                        <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Condição do item</label>
                        <select
                          value={formData.productCondition}
                          onChange={e => setFormData({ ...formData, productCondition: e.target.value })}
                          className="w-full bg-white border border-emerald-100 rounded-2xl px-6 py-4 focus:ring-2 focus:ring-green-600 outline-none"
                        >
                          <option value="">Selecione...</option>
                          {STORE_PRODUCT_CONDITIONS.map((option) => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                          ))}
                        </select>
                      </div>
                    )}
                    <div>
                      <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Disponibilidade</label>
                      <select
                        value={formData.availability}
                        onChange={e => setFormData({ ...formData, availability: e.target.value })}
                        className="w-full bg-white border border-emerald-100 rounded-2xl px-6 py-4 focus:ring-2 focus:ring-green-600 outline-none"
                      >
                        <option value="">Selecione...</option>
                        {STORE_AVAILABILITY_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <label className="flex items-center gap-3 rounded-2xl border border-emerald-100 bg-white px-4 py-4 text-sm font-bold text-slate-700">
                      <input
                        type="checkbox"
                        checked={!!formData.acceptsTrade}
                        onChange={e => setFormData({ ...formData, acceptsTrade: e.target.checked })}
                        className="h-4 w-4 rounded border-slate-300 text-green-600 focus:ring-green-600"
                      />
                      Aceita troca
                    </label>
                    <label className="flex items-center gap-3 rounded-2xl border border-emerald-100 bg-white px-4 py-4 text-sm font-bold text-slate-700">
                      <input
                        type="checkbox"
                        checked={!!formData.hasInvoice}
                        onChange={e => setFormData({ ...formData, hasInvoice: e.target.checked })}
                        className="h-4 w-4 rounded border-slate-300 text-green-600 focus:ring-green-600"
                      />
                      Emite nota fiscal
                    </label>
                    <label className="flex items-center gap-3 rounded-2xl border border-emerald-100 bg-white px-4 py-4 text-sm font-bold text-slate-700">
                      <input
                        type="checkbox"
                        checked={!!formData.hasWarranty}
                        onChange={e => setFormData({
                          ...formData,
                          hasWarranty: e.target.checked,
                          warrantyDetails: e.target.checked ? formData.warrantyDetails : ''
                        })}
                        className="h-4 w-4 rounded border-slate-300 text-green-600 focus:ring-green-600"
                      />
                      Oferece garantia
                    </label>
                  </div>

                  {formData.hasWarranty && (
                    <div>
                      <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Detalhes da garantia</label>
                      <input
                        type="text"
                        value={formData.warrantyDetails}
                        onChange={e => setFormData({ ...formData, warrantyDetails: e.target.value })}
                        className="w-full bg-white border border-emerald-100 rounded-2xl px-6 py-4 focus:ring-2 focus:ring-green-600 outline-none"
                        placeholder="Ex: Garantia de motor por 90 dias ou conforme avaliação"
                      />
                    </div>
                  )}
                </div>
              )}

              <div>
                <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Informe a quantidade</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <input
                    type="number"
                    min={1}
                    value={formData.quantity}
                    onChange={e => setFormData({ ...formData, quantity: Number(e.target.value) })}
                    className="w-full bg-slate-50 border-none rounded-2xl px-6 py-4 focus:ring-2 focus:ring-green-600 outline-none"
                    placeholder="1"
                  />
                  <select
                    value={formData.unit}
                    onChange={e => setFormData({ ...formData, unit: e.target.value })}
                    className="w-full bg-slate-50 border-none rounded-2xl px-6 py-4 focus:ring-2 focus:ring-green-600 outline-none"
                  >
                    {['Unidade', 'Kg', 'Arroba', 'Litros', 'Toneladas', 'Cabeças'].map(unit => (
                      <option key={unit} value={unit}>{unit}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <button onClick={handleBack} className="w-full py-5 border border-slate-200 text-slate-600 rounded-2xl font-black hover:bg-slate-50 transition-all">Voltar</button>
              <button onClick={() => setCurrentStep('MEDIA')} className="w-full py-5 bg-slate-900 text-white rounded-2xl font-black shadow-xl hover:bg-slate-800 transition-all">Próxima Etapa: Mídia</button>
            </div>
          </div>
        );

      case 'MEDIA':
        return (
          <div className="max-w-2xl mx-auto space-y-8">
            <label htmlFor="ad-images-input" className="border-4 border-dashed border-slate-100 rounded-[2.5rem] p-12 text-center hover:border-green-200 transition-colors bg-slate-50/50 cursor-pointer block relative">
              <div className="text-6xl mb-4">📸</div>
              <h3 className="text-lg font-black text-slate-800">Clique ou arraste suas fotos aqui</h3>
              <p className="text-slate-400 text-sm mt-2">Formatos aceitos: JPG, PNG. Tamanho máximo de 5MB por foto.</p>
              <input
                id="ad-images-input"
                type="file"
                multiple
                accept="image/*"
                onChange={e => handleImagesSelected(e.target.files)}
                className="sr-only"
                ref={fileInputRef}
              />
              {isUploadingImages && (
                <p className="mt-3 text-xs text-slate-500">Enviando imagens...</p>
              )}
            </label>
            {hasStoreListingAccess && (
              <div className="rounded-[2.5rem] border border-emerald-100 bg-emerald-50/70 p-6 sm:p-8">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-[11px] font-black uppercase tracking-[0.22em] text-emerald-600">Loja Parceira</p>
                    <h3 className="mt-2 text-xl font-black text-slate-900">Vídeo institucional do anúncio</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-500">
                      Envie 1 vídeo de até 60 segundos. A plataforma tenta otimizar o arquivo para algo próximo de 12MB antes de salvar.
                    </p>
                  </div>
                  <label
                    htmlFor="ad-video-input"
                    className="inline-flex cursor-pointer items-center justify-center rounded-2xl bg-slate-900 px-5 py-3 text-sm font-black text-white transition hover:bg-slate-800"
                  >
                    Escolher vídeo
                  </label>
                  <input
                    id="ad-video-input"
                    type="file"
                    accept="video/mp4,video/quicktime,video/webm"
                    onChange={e => handleVideoSelected(e.target.files)}
                    className="sr-only"
                    ref={videoInputRef}
                  />
                </div>

                {videoItem ? (
                  <div className="mt-6 overflow-hidden rounded-[2rem] border border-emerald-100 bg-white shadow-sm">
                    <div className="relative bg-slate-950">
                      <video
                        src={videoItem.previewUrl || videoItem.publicUrl}
                        controls={!videoItem.uploading}
                        muted={videoItem.uploading}
                        className="aspect-video w-full bg-slate-950 object-contain"
                        poster={formData.images?.[0] || undefined}
                      />
                      {videoItem.uploading && (
                        <div className="absolute inset-0 flex items-center justify-center bg-slate-950/55">
                          <div className="w-12 h-12 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-sm font-black text-slate-900">Vídeo pronto para o anúncio</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {videoItem.durationSeconds ? `${videoItem.durationSeconds}s` : 'Duração em processamento'}
                          {videoItem.sizeBytes ? ` • ${formatVideoSize(videoItem.sizeBytes)}` : ''}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={handleRemoveVideo}
                        className="inline-flex items-center justify-center rounded-2xl border border-slate-200 px-4 py-2.5 text-sm font-black text-slate-600 transition hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                      >
                        Remover vídeo
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-6 rounded-[2rem] border border-dashed border-emerald-200 bg-white/80 p-6 text-sm text-slate-500">
                    Nenhum vídeo enviado. Esse recurso aparece apenas para anúncios publicados por Loja Parceira.
                  </div>
                )}
              </div>
            )}
            {imageItems.length > 0 && (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext items={imageItems.map(item => item.id)}>
                  <div className="grid grid-cols-3 gap-4">
                    {imageItems.map((item, index) => (
                      <SortableImageItem key={item.id} item={item} index={index} onRemove={handleRemoveImage} />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            )}
            <div className="flex flex-col sm:flex-row gap-3">
              <button onClick={handleBack} className="w-full py-5 border border-slate-200 text-slate-600 rounded-2xl font-black hover:bg-slate-50 transition-all">Voltar</button>
              <button onClick={() => setCurrentStep('PRICING')} className="w-full py-5 bg-slate-900 text-white rounded-2xl font-black shadow-xl hover:bg-slate-800 transition-all">Próxima Etapa: Preço e Local</button>
            </div>
          </div>
        );

      case 'PRICING':
        return (
          <div className="max-w-2xl mx-auto space-y-10">
            <div className="bg-white p-8 rounded-[2rem] border border-slate-100 shadow-sm space-y-6">
              <div>
                <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-3">Valor Unitário (R$)</label>
                <div className="grid grid-cols-1 sm:grid-cols-[1fr_120px] gap-4">
                  <div className="relative">
                    <span className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400 font-bold">R$</span>
                    <input 
                      type="number" 
                      value={formData.unitPrice}
                      onChange={e => setFormData({...formData, unitPrice: Number(e.target.value)})}
                      className="w-full bg-slate-50 border-none rounded-2xl pl-16 pr-6 py-5 text-2xl font-black text-slate-900 outline-none focus:ring-2 focus:ring-green-600" 
                      placeholder="0,00"
                    />
                  </div>
                  <input
                    value={formData.currency}
                    disabled
                    className="w-full bg-slate-100 border-none rounded-2xl px-4 py-5 text-sm font-bold text-slate-500"
                  />
                </div>
                
                {/* Exibição do Valor Total Calculado */}
                {formData.unitPrice > 0 && (
                  <div className="mt-4 p-4 bg-green-50 border-2 border-green-200 rounded-xl">
                    <p className="text-xs font-black text-green-700 uppercase tracking-widest mb-1">Valor Total na Vitrine</p>
                    <p className="text-2xl font-black text-green-900">
                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(formData.price || 0)}
                    </p>
                    <p className="text-xs text-green-600 mt-1">
                      {formData.quantity} {formData.unit} × R$ {formData.unitPrice.toFixed(2)}
                    </p>
                  </div>
                )}
                
                <label className="mt-4 flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={!!formData.priceNegotiable}
                    onChange={e => setFormData({
                      ...formData,
                      priceNegotiable: e.target.checked,
                      acceptsTrade: e.target.checked,
                    })}
                    className="w-5 h-5 rounded border-slate-300 text-green-600 focus:ring-green-500"
                  />
                  <span className="text-sm font-bold text-slate-600">Preço sob consulta / Aceita troca</span>
                </label>
              </div>

              <div className="pt-6 border-t border-slate-50 grid grid-cols-2 gap-6">
                <div className="col-span-2">
                  <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">CEP Localização</label>
                  <input 
                    type="text" 
                    maxLength={9}
                    value={formData.location.cep}
                    onChange={e => handleCepChange(e.target.value)}
                    onBlur={handleCepBlur}
                    className="w-full bg-slate-50 border-none rounded-xl px-6 py-4 focus:ring-2 focus:ring-green-600 outline-none" 
                    placeholder="00000-000"
                  />
                </div>
                <div>
                   <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Cidade</label>
                   <input
                     value={formData.location.city}
                     onChange={e => setFormData(prev => ({ ...prev, location: { ...prev.location, city: e.target.value } }))}
                     className="w-full bg-slate-100 border-none rounded-xl px-6 py-4 text-slate-700"
                     placeholder="Cidade"
                   />
                </div>
                <div>
                   <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Estado</label>
                   <input
                     value={formData.location.state}
                     onChange={e => setFormData(prev => ({ ...prev, location: { ...prev.location, state: e.target.value } }))}
                     className="w-full bg-slate-100 border-none rounded-xl px-6 py-4 text-slate-700"
                     placeholder="UF"
                     maxLength={2}
                   />
                </div>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <button onClick={handleBack} className="w-full py-5 border border-slate-200 text-slate-600 rounded-2xl font-black hover:bg-slate-50 transition-all">Voltar</button>
              <button onClick={() => setCurrentStep('REVIEW')} className="w-full py-5 bg-slate-900 text-white rounded-2xl font-black shadow-xl hover:bg-slate-800 transition-all">Revisar Anúncio</button>
            </div>
          </div>
        );

      case 'REVIEW':
        const previewAd = {
          ...formData,
          id: 'preview',
          status: AdStatus.ACTIVE,
          views: 0,
          createdAt: new Date().toISOString(),
          userId: 'u1',
          whatsapp: '11999999999',
          location: { city: formData.location.city || 'Cidade', state: formData.location.state || 'UF' },
          videoPreviewUrl: videoItem?.previewUrl || formData.videoUrl || '',
          videoDurationSeconds: videoItem?.durationSeconds || formData.videoDurationSeconds || 0,
        };
        return (
          <div className="flex flex-col lg:flex-row gap-12 items-start max-w-5xl mx-auto">
            <div className="flex-1 space-y-8">
              <div className="bg-green-50 p-8 rounded-[2rem] border border-green-100">
                <h3 className="text-xl font-black text-green-900 mb-2">Quase lá!</h3>
                <p className="text-green-700">Verifique se todas as informações estão corretas. Seu anúncio será publicado instantaneamente.</p>
              </div>

              {/* Alerta de limite atingido */}
              {!canCreateAd && subscription && (
                <div className="bg-red-50 border-2 border-red-200 p-6 rounded-2xl">
                  <div className="flex items-start gap-4">
                    <AlertCircle className="w-6 h-6 text-red-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-lg font-bold text-red-900 mb-2">Limite de anúncios atingido</h4>
                      <p className="text-sm text-red-800 mb-3">{adLimitMessage}</p>
                      <p className="text-xs text-red-700 mb-3">
                        <strong>Anúncios usados neste ciclo:</strong> {usage.adsUsed} de {usage.adsLimit}
                      </p>
                      <button
                        onClick={() => navigate('/planos')}
                        className="px-4 py-2 bg-red-600 text-white rounded-lg font-bold hover:bg-red-700 transition text-sm"
                      >
                        Ver Planos
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <div className="space-y-4">
                <button 
                  onClick={async () => {
                    if (!canCreateAd) {
                      toast.error('Limite de anúncios atingido', {
                        description: adLimitMessage
                      });
                      return;
                    }
                    await handleSubmitAd();
                    await refreshUsage(); // Atualizar contadores após publicar
                  }}
                  className="w-full py-6 bg-green-700 text-white rounded-[2rem] font-black text-xl shadow-2xl shadow-green-900/20 hover:bg-green-800 transition-all active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed"
                  disabled={isSubmitting || isUploadingImages || !canCreateAd}
                >
                  {isUploadingImages ? 'Aguardando uploads...' : isSubmitting ? 'Publicando...' : 'Publicar Anúncio Agora'}
                </button>
                <button onClick={handleBack} className="w-full py-4 text-slate-400 font-bold hover:text-slate-600 transition-all">Voltar</button>
              </div>
            </div>
            <div className="w-full lg:w-[400px]">
               <div className="sticky top-28">
                  <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4 ml-2">Visualização no App</p>
                  <div className="group bg-white rounded-xl overflow-hidden transition-all duration-300 flex flex-col h-full relative border border-slate-100">
                    <div className="absolute top-4 right-4 z-10 p-2 bg-white/90 rounded-full shadow-md">
                      <Heart className="w-5 h-5 text-slate-500" strokeWidth={1.5} />
                    </div>
                    <div className="relative h-48 overflow-hidden">
                      {previewAd.images?.[0] ? (
                        <img
                          src={getPrimaryImageFromList(previewAd.images, settings.defaultAdImageUrl)}
                          alt={previewAd.title}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full bg-slate-200 flex items-center justify-center text-sm font-semibold text-slate-500">
                          Nenhuma imagem enviada
                        </div>
                      )}
                      <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 via-black/40 to-transparent">
                        <p className="text-white text-xs font-semibold flex items-center gap-1.5">
                          <MapPin className="w-3.5 h-3.5 text-green-400" strokeWidth={1.5} />
                          {previewAd.location.city} - {previewAd.location.state}
                        </p>
                      </div>
                    </div>
                    <div className="p-5 flex flex-col flex-grow">
                      <h3 className="text-sm font-semibold text-slate-800 mb-3 line-clamp-2 leading-tight h-10">
                        {previewAd.title}
                      </h3>
                      <div className="flex items-center justify-between mt-auto pt-3 border-t border-slate-100">
                        <div>
                          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-0.5">Investimento</p>
                          <p className="text-base font-semibold text-green-700 tracking-tight">
                            {new Intl.NumberFormat('pt-BR', {
                              style: 'currency',
                              currency: 'BRL',
                            }).format(previewAd.price || 0)}
                          </p>
                        </div>
                        <div className="flex flex-col items-end">
                          <div className="flex items-center gap-1 text-slate-400 text-[11px] font-semibold">
                            <Eye className="w-4 h-4" strokeWidth={1.5} />
                            0
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="px-5 pb-5 mt-auto">
                      <button
                        type="button"
                        onClick={() => setIsPreviewModalOpen(true)}
                        className="block w-full text-center h-10 leading-10 bg-slate-900 text-white rounded-lg text-sm font-semibold hover:bg-green-700 transition-all"
                      >
                        Ver Detalhes
                      </button>
                    </div>
                  </div>
               </div>
            </div>
            <PreviewAnnouncementModal
              isOpen={isPreviewModalOpen}
              onClose={() => setIsPreviewModalOpen(false)}
              previewAd={previewAd}
              defaultAdImageUrl={settings.defaultAdImageUrl}
            />
          </div>
        );

      case 'SUCCESS':
        return (
          <div className="max-w-xl mx-auto text-center py-20">
            <div className="w-32 h-32 bg-green-100 text-green-700 rounded-full flex items-center justify-center mx-auto mb-10 text-6xl shadow-xl shadow-green-100">
               ✅
            </div>
            <h1 className="text-4xl font-black text-slate-900 font-display mb-4">Anúncio Publicado!</h1>
            <p className="text-slate-500 text-lg mb-12">Seu anúncio já está no ar e visível para milhares de produtores rurais.</p>
            <div className="flex flex-col gap-4">
               <button onClick={() => navigate('/anuncios')} className="w-full py-5 bg-green-700 text-white rounded-2xl font-black shadow-lg">Ver Meus Anúncios</button>
               <button onClick={() => { setFormData({title: '', description: '', price: 0, location: {cep:'', city:'', state:''}, images:[], videoUrl:'', videoStoragePath:'', videoDurationSeconds:0, videoSizeBytes:0}); setVideoItem(null); setCurrentStep('CATEGORY'); }} className="w-full py-5 border-2 border-slate-100 text-slate-600 rounded-2xl font-black">Anunciar Outro Produto</button>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="bg-gray-50 min-h-screen pb-32">
      <div className="max-w-7xl mx-auto px-4 pt-10">
        <div className="bg-yellow-50 border border-yellow-200 rounded-2xl p-5 text-sm text-yellow-900">
          <strong className="block text-xs font-black uppercase tracking-widest mb-2">ATENÇÃO!</strong>
          <p>
            Preencha os dados do anúncio com veracidade. Informações falsas podem resultar em bloqueio do anúncio e da conta.
          </p>
        </div>
      </div>
      {/* Stepper Progress Header */}
      {currentStep !== 'SUCCESS' && (
        <div className="bg-white border-b border-gray-100 mb-12 py-8">
          <div className="max-w-7xl mx-auto px-4">
            <div className="flex justify-between items-center relative">
              {/* Progress Line */}
              <div className="absolute left-0 top-1/2 w-full h-1 bg-slate-100 -translate-y-1/2 z-0"></div>
              <div 
                className="absolute left-0 top-1/2 h-1 bg-green-600 -translate-y-1/2 z-0 transition-all duration-500"
                style={{ width: `${(currentStepIndex / (steps.length - 1)) * 100}%` }}
              ></div>
              
              {steps.map((s, i) => (
                <div key={s} className="relative z-10 flex flex-col items-center">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm transition-all duration-300 ${i <= currentStepIndex ? 'bg-green-600 text-white shadow-lg shadow-green-200 scale-110' : 'bg-white border-2 border-slate-100 text-slate-300'}`}>
                    {i + 1}
                  </div>
                  <span className={`hidden md:block absolute -bottom-8 whitespace-nowrap text-[10px] font-black uppercase tracking-widest ${i <= currentStepIndex ? 'text-green-700' : 'text-slate-300'}`}>
                    {s === 'CATEGORY' ? 'Categoria' : s === 'DETAILS' ? 'Dados' : s === 'MEDIA' ? 'Fotos' : s === 'PRICING' ? 'Preço' : 'Revisão'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4">
        {renderStep()}
      </div>
    </div>
  );
};

export default AdCreationView;

