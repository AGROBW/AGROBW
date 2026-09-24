import React, { useEffect, useMemo, useRef, useState } from 'react';
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  AlertTriangle,
  ExternalLink,
  Eye,
  FileText,
  Globe,
  Image,
  LayoutDashboard,
  MapPin,
  Palette,
  Save,
  ShoppingBag,
  Store,
  UploadCloud,
  UserRound,
  X,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '../../src/contexts/AuthContext';
import { slugifyStoreValue, useMySellerStore } from '../../src/hooks/useSellerStore';
import type { Ad } from '../../types';
import { supabase } from '../../src/lib/supabaseClient';
import { optimizeStoreCoverImage } from '../../src/utils/storeCoverImage';
import SellerStoreCatalogPanel from './SellerStoreCatalogPanel';

type SellerStoreDashboardProps = {
  hasStoreAccess: boolean;
};

const STORE_DESCRIPTION_MAX_LENGTH = 280;

type StoreDashboardTab = 'overview' | 'showcase' | 'catalog' | 'appearance' | 'publication';

const STORE_DASHBOARD_TABS: Array<{
  id: StoreDashboardTab;
  label: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
}> = [
  { id: 'overview', label: 'Visão geral', icon: LayoutDashboard },
  { id: 'showcase', label: 'Vitrine', icon: ShoppingBag },
  { id: 'catalog', label: 'Catálogo', icon: FileText },
  { id: 'appearance', label: 'Aparência', icon: Palette },
  { id: 'publication', label: 'Publicação', icon: Globe },
];

const extractStoreAssetPath = (publicUrl?: string | null) => {
  if (!publicUrl) return null;

  const marker = '/seller-stores/';
  const index = publicUrl.indexOf(marker);

  if (index === -1) return null;

  const pathWithQuery = publicUrl.substring(index + marker.length);
  return pathWithQuery.split('?')[0] || null;
};

const SortableStoreAnnouncementCard: React.FC<{
  announcement: Ad;
  index: number;
}> = ({ announcement, index }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: announcement.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`rounded-3xl border bg-white p-4 shadow-sm transition ${
        isDragging ? 'border-emerald-300 shadow-lg shadow-emerald-100' : 'border-slate-200'
      }`}
    >
      <div className="flex items-center gap-4">
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="inline-flex h-12 w-12 shrink-0 cursor-grab items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-sm font-black text-slate-500 active:cursor-grabbing"
          aria-label={`Mover anúncio ${announcement.title}`}
        >
          {index + 1}
        </button>

        <div className="h-20 w-24 shrink-0 overflow-hidden rounded-2xl bg-slate-100">
          {announcement.images?.[0] ? (
            <img src={announcement.images[0]} alt={announcement.title} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-slate-400">
              <ShoppingBag className="h-6 w-6" strokeWidth={1.5} />
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-xs font-black uppercase tracking-[0.22em] text-emerald-700">
            Posição {index + 1}
          </p>
          <h4 className="mt-1 truncate text-base font-black text-slate-900">{announcement.title}</h4>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span>{announcement.location.city} - {announcement.location.state}</span>
            <span className="rounded-full bg-slate-100 px-2 py-1 font-semibold text-slate-600">
              {announcement.views || 0} views
            </span>
            {announcement.highlightHome || announcement.highlightCategory ? (
              <span className="rounded-full bg-emerald-50 px-2 py-1 font-semibold text-emerald-700">
                Com destaque
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
};

const SellerStoreDashboard: React.FC<SellerStoreDashboardProps> = ({ hasStoreAccess }) => {
  const { user } = useAuth();
  const {
    store,
    isLoading,
    isSaving,
    saveStore,
    storeAnnouncements,
    isLoadingAnnouncements,
    isSavingAnnouncementOrder,
    saveAnnouncementOrder,
  } = useMySellerStore();
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [isUploadingCover, setIsUploadingCover] = useState(false);
  const [isUploadingCoverMobile, setIsUploadingCoverMobile] = useState(false);
  // Exclusão ADIADA de assets antigos: só remove do storage APÓS saveStore concluir com
  // sucesso. Fila independente por asset; suporta múltiplas trocas antes de salvar.
  const pendingAssetCleanupRef = useRef<Record<'logoUrl' | 'coverUrl' | 'coverMobileUrl', string[]>>({
    logoUrl: [],
    coverUrl: [],
    coverMobileUrl: [],
  });
  const [orderedAnnouncements, setOrderedAnnouncements] = useState<Ad[]>([]);
  const [activeTab, setActiveTab] = useState<StoreDashboardTab>('overview');
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [formData, setFormData] = useState({
    storeName: '',
    slug: '',
    description: '',
    logoUrl: '',
    coverUrl: '',
    coverMobileUrl: '',
    coverPositionX: 50,
    coverPositionY: 50,
    email: '',
    facebookUrl: '',
    instagramUrl: '',
    linkedinUrl: '',
    websiteUrl: '',
    city: '',
    state: '',
    isActive: true,
  });
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  useEffect(() => {
    if (store) {
      setFormData({
        storeName: store.storeName || '',
        slug: store.slug || '',
        description: store.description || '',
        logoUrl: store.logoUrl || '',
        coverUrl: store.coverUrl || '',
        coverMobileUrl: store.coverMobileUrl || '',
        coverPositionX: typeof store.coverPositionX === 'number' ? store.coverPositionX : 50,
        coverPositionY: typeof store.coverPositionY === 'number' ? store.coverPositionY : 50,
        email: store.email || user?.email || '',
        facebookUrl: store.facebookUrl || '',
        instagramUrl: store.instagramUrl || '',
        linkedinUrl: store.linkedinUrl || '',
        websiteUrl: store.websiteUrl || '',
        city: store.city || user?.cidade || '',
        state: store.state || user?.estado || '',
        isActive: store.isActive,
      });
      return;
    }

    setFormData((current) => ({
      ...current,
      email: current.email || user?.email || '',
      facebookUrl: current.facebookUrl || '',
      instagramUrl: current.instagramUrl || '',
      linkedinUrl: current.linkedinUrl || '',
      websiteUrl: current.websiteUrl || '',
      city: current.city || user?.cidade || '',
      state: current.state || user?.estado || '',
    }));
  }, [store, user]);

  useEffect(() => {
    setOrderedAnnouncements(storeAnnouncements);
  }, [storeAnnouncements]);

  const publicStoreUrl = useMemo(() => {
    const normalizedSlug = formData.slug || slugifyStoreValue(formData.storeName);
    if (!normalizedSlug || typeof window === 'undefined') return null;
    return `${window.location.origin}/loja/${normalizedSlug}`;
  }, [formData.slug, formData.storeName]);

  const storeStatus = useMemo(() => {
    if (!hasStoreAccess) return { label: 'Plano necessário', tone: 'amber' as const };
    if (store?.isPausedDueToPlan) return { label: 'Pausada', tone: 'amber' as const };
    if (!store) return { label: 'Rascunho', tone: 'slate' as const };
    if (!formData.isActive) return { label: 'Oculta', tone: 'slate' as const };
    return { label: 'Publicada', tone: 'emerald' as const };
  }, [formData.isActive, hasStoreAccess, store]);

  const appearanceIssueCount = Number(!formData.logoUrl) + Number(!formData.coverUrl);
  const showcaseIssueCount = isLoadingAnnouncements ? 0 : Number(orderedAnnouncements.length === 0);
  const publicationIssueCount = Number(
    !hasStoreAccess || !!store?.isPausedDueToPlan || !store || !formData.isActive || !publicStoreUrl,
  );

  const primaryAlert = useMemo(() => {
    if (!hasStoreAccess) {
      return { message: 'Seu plano atual não inclui a Loja Parceira.', action: 'Ver planos', href: '/planos' };
    }
    if (store?.isPausedDueToPlan) {
      return {
        message: 'Sua loja está pausada até a renovação do plano.',
        action: 'Renovar plano',
        href: '/planos?source=minha-loja&intent=renewal',
      };
    }
    if (!store) return { message: 'Complete os dados abaixo para criar e publicar sua loja.' };
    if (!formData.isActive) return { message: 'Sua página pública está oculta no momento.' };
    if (!isLoadingAnnouncements && orderedAnnouncements.length === 0) {
      return { message: 'Sua loja está publicada, mas ainda não possui anúncios ativos na vitrine.' };
    }
    return null;
  }, [formData.isActive, hasStoreAccess, isLoadingAnnouncements, orderedAnnouncements.length, store]);

  useEffect(() => {
    if (!isPreviewOpen) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsPreviewOpen(false);
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isPreviewOpen]);

  const handleTabKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const lastIndex = STORE_DASHBOARD_TABS.length - 1;
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? lastIndex
        : event.key === 'ArrowRight'
          ? (index + 1) % STORE_DASHBOARD_TABS.length
          : (index - 1 + STORE_DASHBOARD_TABS.length) % STORE_DASHBOARD_TABS.length;
    const nextTab = STORE_DASHBOARD_TABS[nextIndex];
    setActiveTab(nextTab.id);
    document.getElementById(`store-tab-${nextTab.id}`)?.focus();
  };

  const scrollToEditor = (sectionId: string) => {
    document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleChange = (field: keyof typeof formData, value: string | boolean | number) => {
    setFormData((current) => ({ ...current, [field]: value }));
  };

  const handleStoreNameBlur = () => {
    if (!formData.slug && formData.storeName) {
      handleChange('slug', slugifyStoreValue(formData.storeName));
    }
  };

  // Remove do storage os arquivos antigos enfileirados — chamado SOMENTE após saveStore
  // ter sucesso. Nunca remove o caminho da URL que acabou de ser persistida.
  const flushPendingAssetCleanup = async () => {
    const queues = pendingAssetCleanupRef.current;
    const persistedPaths = new Set(
      [formData.logoUrl, formData.coverUrl, formData.coverMobileUrl]
        .map((url) => extractStoreAssetPath(url))
        .filter((path): path is string => Boolean(path))
    );
    const pathsToRemove = Array.from(
      new Set([...queues.logoUrl, ...queues.coverUrl, ...queues.coverMobileUrl])
    ).filter((path) => Boolean(path) && !persistedPaths.has(path));

    // Zera as filas independentemente do resultado da remoção (evita repetir tentativas).
    pendingAssetCleanupRef.current = { logoUrl: [], coverUrl: [], coverMobileUrl: [] };

    if (pathsToRemove.length === 0) return;
    const { error } = await supabase.storage.from('seller-stores').remove(pathsToRemove);
    if (error) {
      console.warn('[SellerStoreDashboard] Nao foi possivel remover assets antigos da loja:', error);
    }
  };

  const handleSave = async () => {
    try {
      await saveStore(formData, hasStoreAccess);
      toast.success('Loja salva com sucesso.');
      // Exclusão adiada: só agora, com o banco já apontando para as novas URLs, é seguro
      // remover os arquivos antigos. Se saveStore falhar, o catch impede qualquer remoção.
      await flushPendingAssetCleanup();
    } catch (error: any) {
      toast.error(error?.message || 'Não foi possível salvar sua loja.');
    }
  };

  const handleAnnouncementDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    setOrderedAnnouncements((current) => {
      const oldIndex = current.findIndex((announcement) => announcement.id === active.id);
      const newIndex = current.findIndex((announcement) => announcement.id === over.id);

      if (oldIndex === -1 || newIndex === -1) return current;
      return arrayMove(current, oldIndex, newIndex);
    });
  };

  const handleSaveAnnouncementOrder = async () => {
    try {
      await saveAnnouncementOrder(orderedAnnouncements.map((announcement) => announcement.id));
      toast.success('Ordem da vitrine salva com sucesso.');
    } catch (error: any) {
      console.error('[SellerStoreDashboard] Erro ao salvar ordem da vitrine:', error);
      toast.error(error?.message || 'Não foi possível salvar a ordem da vitrine.');
    }
  };

  const uploadStoreAsset = async (
    event: React.ChangeEvent<HTMLInputElement>,
    assetType: 'logoUrl' | 'coverUrl' | 'coverMobileUrl'
  ) => {
    const file = event.target.files?.[0];
    if (!file || !user?.id) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Selecione uma imagem válida.');
      event.target.value = '';
      return;
    }

    const maxSourceSize = assetType === 'logoUrl' ? 5 : 10;
    if (file.size > maxSourceSize * 1024 * 1024) {
      toast.error(`A imagem deve ter no máximo ${maxSourceSize}MB.`);
      event.target.value = '';
      return;
    }

    const setUploading =
      assetType === 'logoUrl'
        ? setIsUploadingLogo
        : assetType === 'coverMobileUrl'
          ? setIsUploadingCoverMobile
          : setIsUploadingCover;
    setUploading(true);

    try {
      const uploadFile = assetType === 'logoUrl'
        ? file
        : await optimizeStoreCoverImage(file, assetType === 'coverMobileUrl' ? 'mobile' : 'desktop');
      const fileExt = assetType === 'logoUrl' ? (file.name.split('.').pop() || 'jpg') : 'webp';
      const fileName =
        assetType === 'logoUrl'
          ? `logo-${Date.now()}.${fileExt}`
          : assetType === 'coverMobileUrl'
            ? `cover-mobile-${Date.now()}.${fileExt}`
            : `cover-${Date.now()}.${fileExt}`;
      const filePath = `${user.id}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('seller-stores')
        .upload(filePath, uploadFile, {
          upsert: false,
          contentType: uploadFile.type,
          cacheControl: '3600',
        });

      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage
        .from('seller-stores')
        .getPublicUrl(filePath);

      setFormData((current) => {
        // Exclusão ADIADA: enfileira o arquivo ANTIGO (nunca o recém-enviado). A remoção
        // do storage só acontece depois que saveStore concluir com sucesso.
        const previousPath = extractStoreAssetPath(current[assetType]);
        if (
          previousPath &&
          previousPath !== filePath &&
          !pendingAssetCleanupRef.current[assetType].includes(previousPath)
        ) {
          pendingAssetCleanupRef.current[assetType].push(previousPath);
        }
        return { ...current, [assetType]: publicUrlData.publicUrl };
      });

      toast.success(
        assetType === 'logoUrl'
          ? 'Logo enviada com sucesso.'
          : assetType === 'coverMobileUrl'
            ? 'Capa mobile otimizada e enviada com sucesso.'
            : 'Capa otimizada e enviada com sucesso.'
      );
    } catch (error: any) {
      console.error('[SellerStoreDashboard] Erro ao fazer upload da imagem da loja:', error);
      toast.error(error?.message || 'Não foi possível enviar a imagem.');
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  };

  if (isLoading) {
    return (
      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-56 rounded bg-slate-100" />
          <div className="h-28 rounded-3xl bg-slate-100" />
          <div className="grid gap-4 md:grid-cols-2">
            <div className="h-14 rounded-2xl bg-slate-100" />
            <div className="h-14 rounded-2xl bg-slate-100" />
            <div className="h-14 rounded-2xl bg-slate-100" />
            <div className="h-14 rounded-2xl bg-slate-100" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <section className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm">
        <header className="relative overflow-hidden border-b border-slate-200 bg-gradient-to-r from-slate-950 via-slate-900 to-emerald-950 px-5 py-5 text-white sm:px-7">
          <div className="absolute inset-y-0 right-0 hidden w-1/3 bg-[radial-gradient(circle_at_top_right,_rgba(74,222,128,0.24),_transparent_62%)] md:block" />
          <div className="relative flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/15 bg-white/10 text-emerald-200">
                  <Store className="h-5 w-5" strokeWidth={1.6} />
                </span>
                <div className="min-w-0">
                  <p className="text-[11px] font-black uppercase tracking-[0.24em] text-emerald-200">Minha loja</p>
                  <h1 className="truncate text-xl font-black tracking-tight sm:text-2xl">
                    {formData.storeName || 'Sua Loja Parceira'}
                  </h1>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-bold ${
                  storeStatus.tone === 'emerald'
                    ? 'bg-emerald-400/15 text-emerald-200'
                    : storeStatus.tone === 'amber'
                      ? 'bg-amber-400/15 text-amber-200'
                      : 'bg-white/10 text-slate-200'
                }`}>
                  {storeStatus.label}
                </span>
              </div>
              <p className="mt-2 truncate text-sm text-slate-300">
                {publicStoreUrl ? publicStoreUrl.replace(/^https?:\/\//, '') : 'Defina o nome e o endereço público da sua loja'}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setIsPreviewOpen(true)}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/10 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"
              >
                <Eye className="h-4 w-4" strokeWidth={1.6} />
                Abrir prévia
              </button>
              {publicStoreUrl && store ? (
                <a
                  href={publicStoreUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200"
                >
                  <ExternalLink className="h-4 w-4" strokeWidth={1.6} />
                  Ver loja
                </a>
              ) : null}
            </div>
          </div>
        </header>

        {primaryAlert ? (
          <div className="flex flex-col gap-3 border-b border-amber-200 bg-amber-50 px-5 py-3 text-sm text-amber-950 sm:flex-row sm:items-center sm:justify-between sm:px-7">
            <div className="flex items-center gap-2.5">
              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" strokeWidth={1.8} />
              <span className="font-semibold">{primaryAlert.message}</span>
            </div>
            {'href' in primaryAlert && primaryAlert.href ? (
              <Link to={primaryAlert.href} className="shrink-0 font-bold text-amber-800 underline decoration-amber-300 underline-offset-4 hover:text-amber-950">
                {primaryAlert.action}
              </Link>
            ) : null}
          </div>
        ) : null}

        <div className="overflow-x-auto border-b border-slate-200 px-3 sm:px-5">
          <div className="flex min-w-max" role="tablist" aria-label="Configurações da loja">
            {STORE_DASHBOARD_TABS.map((tab, index) => {
              const Icon = tab.icon;
              const issueCount = tab.id === 'showcase'
                ? showcaseIssueCount
                : tab.id === 'appearance'
                  ? appearanceIssueCount
                  : tab.id === 'publication'
                    ? publicationIssueCount
                    : 0;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  id={`store-tab-${tab.id}`}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  aria-controls={`store-panel-${tab.id}`}
                  tabIndex={isActive ? 0 : -1}
                  onClick={() => setActiveTab(tab.id)}
                  onKeyDown={(event) => handleTabKeyDown(event, index)}
                  className={`relative inline-flex h-14 items-center gap-2 px-4 text-sm font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-500 ${
                    isActive ? 'text-emerald-700' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <Icon className="h-4 w-4" strokeWidth={1.7} />
                  {tab.label}
                  {issueCount > 0 ? (
                    <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-black text-amber-700">
                      {issueCount}
                    </span>
                  ) : null}
                  {isActive ? <span className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-emerald-500" /> : null}
                </button>
              );
            })}
          </div>
        </div>

        <div className="p-5 sm:p-7">
          <div
            id="store-panel-overview"
            role="tabpanel"
            aria-labelledby="store-tab-overview"
            hidden={activeTab !== 'overview'}
            className="grid gap-5 lg:grid-cols-[1.35fr,0.65fr]"
          >
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-950">
              <div
                className="relative h-32 bg-cover sm:h-36"
                style={{
                  backgroundImage: formData.coverUrl
                    ? `linear-gradient(90deg, rgba(9,15,25,.52), rgba(9,15,25,.12)), url(${formData.coverUrl})`
                    : 'linear-gradient(135deg, #022c22 0%, #064e3b 45%, #0f172a 100%)',
                  backgroundPosition: `${formData.coverPositionX}% ${formData.coverPositionY}%`,
                }}
              >
                <div className="absolute inset-x-0 bottom-0 flex items-end gap-3 p-4 text-white">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl border-2 border-white bg-white text-slate-500 shadow-sm">
                    {formData.logoUrl ? (
                      <img src={formData.logoUrl} alt="" className="h-full w-full object-contain p-1.5" />
                    ) : (
                      <ShoppingBag className="h-6 w-6" strokeWidth={1.5} />
                    )}
                  </div>
                  <div className="min-w-0 pb-0.5">
                    <p className="truncate text-lg font-black">{formData.storeName || 'Sua loja parceira'}</p>
                    <p className="truncate text-xs text-slate-200">
                      {[formData.city, formData.state].filter(Boolean).join(' - ') || 'Localização não informada'}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 lg:grid-cols-1">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Anúncios ativos</p>
                <p className="mt-1 text-2xl font-black text-slate-900">{isLoadingAnnouncements ? '—' : orderedAnnouncements.length}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Identidade visual</p>
                <p className={`mt-1 text-sm font-black ${appearanceIssueCount === 0 ? 'text-emerald-700' : 'text-amber-700'}`}>
                  {appearanceIssueCount === 0 ? 'Completa' : `${appearanceIssueCount} item(ns) pendente(s)`}
                </p>
              </div>
            </div>
          </div>

          <div id="store-panel-showcase" role="tabpanel" aria-labelledby="store-tab-showcase" hidden={activeTab !== 'showcase'}>
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div className="max-w-2xl">
                <p className="text-xs font-black uppercase tracking-[0.24em] text-emerald-700">Vitrine da loja</p>
                <h2 className="mt-2 text-xl font-black text-slate-900">Organize a ordem dos anúncios</h2>
                <p className="mt-1 text-sm leading-6 text-slate-500">Arraste os cards para definir quais anúncios aparecem primeiro na página pública.</p>
              </div>
              <button
                type="button"
                onClick={handleSaveAnnouncementOrder}
                disabled={!hasStoreAccess || !!store?.isPausedDueToPlan || isSavingAnnouncementOrder || orderedAnnouncements.length === 0}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Save className="h-4 w-4" strokeWidth={1.5} />
                {isSavingAnnouncementOrder ? 'Salvando...' : 'Salvar ordem'}
              </button>
            </div>
            {!hasStoreAccess || !!store?.isPausedDueToPlan ? (
              <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">A organização fica disponível quando a Loja Parceira estiver ativa.</div>
            ) : isLoadingAnnouncements ? (
              <div className="mt-5 grid gap-3 md:grid-cols-2">{Array.from({ length: 4 }).map((_, index) => <div key={index} className="h-28 animate-pulse rounded-2xl bg-slate-100" />)}</div>
            ) : orderedAnnouncements.length === 0 ? (
              <div className="mt-5 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-7 text-center text-sm text-slate-500">Você ainda não tem anúncios ativos para organizar.</div>
            ) : (
              <div className="mt-5">
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleAnnouncementDragEnd}>
                  <SortableContext items={orderedAnnouncements.map((announcement) => announcement.id)} strategy={verticalListSortingStrategy}>
                    <div className="space-y-3">
                      {orderedAnnouncements.map((announcement, index) => <SortableStoreAnnouncementCard key={announcement.id} announcement={announcement} index={index} />)}
                    </div>
                  </SortableContext>
                </DndContext>
              </div>
            )}
          </div>

          <div id="store-panel-catalog" role="tabpanel" aria-labelledby="store-tab-catalog" hidden={activeTab !== 'catalog'}>
            <SellerStoreCatalogPanel
              hasStoreAccess={hasStoreAccess}
              ownerUserId={user?.id}
              store={store}
              announcements={orderedAnnouncements}
              isLoadingAnnouncements={isLoadingAnnouncements}
            />
          </div>

          <div id="store-panel-appearance" role="tabpanel" aria-labelledby="store-tab-appearance" hidden={activeTab !== 'appearance'}>
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="mb-3 flex items-center justify-between"><p className="text-sm font-black text-slate-900">Capa desktop</p><span className="text-xs font-semibold text-slate-500">a partir de 1024px</span></div>
                <div className="relative h-24 overflow-hidden rounded-xl bg-slate-900">
                  {formData.coverUrl ? <img src={formData.coverUrl} alt="Prévia da capa desktop" className="h-full w-full object-contain" /> : <div className="flex h-full items-center justify-center text-xs text-slate-300">Capa não enviada</div>}
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="mb-3 flex items-center justify-between"><p className="text-sm font-black text-slate-900">Capa mobile</p><span className="text-xs font-semibold text-slate-500">até 1023px</span></div>
                <div className="relative h-24 overflow-hidden rounded-xl bg-slate-900">
                  {formData.coverMobileUrl || formData.coverUrl ? <img src={formData.coverMobileUrl || formData.coverUrl} alt="Prévia da capa mobile" className="h-full w-full object-contain" /> : <div className="flex h-full items-center justify-center text-xs text-slate-300">Capa não enviada</div>}
                </div>
              </div>
            </div>
            <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-slate-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-slate-600">Logo, capas e enquadramento continuam editáveis na seção de imagens abaixo.</p>
              <button type="button" onClick={() => scrollToEditor('store-appearance-editor')} className="shrink-0 rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-800 transition hover:border-emerald-300 hover:text-emerald-700">Editar imagens</button>
            </div>
          </div>

          <div id="store-panel-publication" role="tabpanel" aria-labelledby="store-tab-publication" hidden={activeTab !== 'publication'}>
            <div className="grid gap-4 lg:grid-cols-[1fr,auto] lg:items-center">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-700">Endereço público</p>
                <p className="mt-2 break-all text-base font-black text-slate-900">{publicStoreUrl || 'O endereço será criado a partir do nome da loja.'}</p>
                <p className="mt-1 text-sm text-slate-500">Status atual: {storeStatus.label}</p>
              </div>
              {publicStoreUrl && store ? <a href={publicStoreUrl} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-800 hover:border-emerald-300 hover:text-emerald-700"><ExternalLink className="h-4 w-4" /> Abrir página</a> : null}
            </div>
            <div className="mt-5 flex flex-col gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div><p className="text-sm font-black text-slate-900">Loja visível publicamente</p><p className="mt-1 text-xs text-slate-500">Desative temporariamente para ocultar a página sem apagar seus dados.</p></div>
              <button
                type="button"
                onClick={() => handleChange('isActive', !formData.isActive)}
                disabled={!hasStoreAccess}
                aria-pressed={formData.isActive}
                className={`inline-flex h-11 shrink-0 items-center rounded-full px-5 text-sm font-bold transition ${formData.isActive ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-600'} disabled:cursor-not-allowed disabled:opacity-50`}
              >
                {formData.isActive ? 'Ativa' : 'Oculta'}
              </button>
            </div>
            <div className="mt-4 flex justify-end">
              <button type="button" onClick={handleSave} disabled={isSaving || !hasStoreAccess || isUploadingLogo || isUploadingCover || isUploadingCoverMobile} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"><Save className="h-4 w-4" />{isSaving ? 'Salvando...' : 'Salvar publicação'}</button>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-8 xl:grid-cols-[1.25fr,0.95fr]">
        <div id="store-data-editor" className="scroll-mt-6 rounded-[2rem] border border-slate-200 bg-white p-8 shadow-sm">
          <div className="mb-6 flex items-start justify-between gap-4">
            <div>
              <h2 className="text-2xl font-black text-slate-900">Dados da loja</h2>
              <p className="mt-1 text-sm text-slate-500">
                Configure o nome, endereço público e informações institucionais que aparecem na sua página.
              </p>
            </div>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving || !hasStoreAccess || isUploadingLogo || isUploadingCover || isUploadingCoverMobile}
              className="inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Save className="h-4 w-4" strokeWidth={1.5} />
              {isSaving ? 'Salvando...' : 'Salvar loja'}
            </button>
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            <label className="space-y-2">
              <span className="text-sm font-semibold text-slate-700">Nome da loja</span>
              <input
                value={formData.storeName}
                onChange={(event) => handleChange('storeName', event.target.value)}
                onBlur={handleStoreNameBlur}
                placeholder="Ex.: Agro Freitas Goiás"
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-semibold text-slate-700">Slug da loja</span>
              <input
                value={formData.slug}
                onChange={(event) => handleChange('slug', slugifyStoreValue(event.target.value))}
                placeholder="agro-freitas-goias"
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm lowercase outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              />
            </label>

            <label className="space-y-2 md:col-span-2">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-semibold text-slate-700">Descrição da loja</span>
                <span className="text-xs font-semibold text-slate-400">
                  {formData.description.length}/{STORE_DESCRIPTION_MAX_LENGTH}
                </span>
              </div>
              <textarea
                value={formData.description}
                onChange={(event) => handleChange('description', event.target.value)}
                maxLength={STORE_DESCRIPTION_MAX_LENGTH}
                rows={5}
                placeholder="Conte quem vocês são, há quanto tempo atuam, quais categorias trabalham e por que os compradores devem confiar na sua loja."
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              />
              <p className="text-xs text-slate-500">
                Use uma apresentação curta e objetiva da empresa, destacando atuação, região e tipo de produto.
              </p>
            </label>

            <div id="store-appearance-editor" className="scroll-mt-6 border-t border-slate-200 pt-6 md:col-span-2">
              <p className="text-xs font-black uppercase tracking-[0.22em] text-emerald-700">Banners e imagens</p>
              <h3 className="mt-2 text-lg font-black text-slate-900">Identidade visual da loja</h3>
              <p className="mt-1 text-sm text-slate-500">Gerencie logo, capas e o enquadramento usado na página pública.</p>
            </div>

            <div className="space-y-2">
              <span className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                <Image className="h-4 w-4 text-slate-400" strokeWidth={1.5} />
                Logo da loja
              </span>
              <label className="flex cursor-pointer items-center justify-between gap-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-4 transition hover:border-emerald-300 hover:bg-emerald-50/50">
                <div>
                  <p className="text-sm font-semibold text-slate-800">
                    {isUploadingLogo ? 'Enviando logo...' : formData.logoUrl ? 'Trocar logo atual' : 'Selecionar imagem do logo'}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">PNG, JPG ou WEBP com até 5MB. Recomendado: 600x600 px, com fundo limpo e boa margem.</p>
                </div>
                <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-emerald-700 shadow-sm">
                  <UploadCloud className="h-5 w-5" strokeWidth={1.5} />
                </div>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/jpg,image/webp"
                  className="hidden"
                  disabled={!hasStoreAccess || isUploadingLogo}
                  onChange={(event) => {
                    void uploadStoreAsset(event, 'logoUrl');
                  }}
                />
              </label>
            </div>

            <div className="space-y-2">
              <span className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                <Image className="h-4 w-4 text-slate-400" strokeWidth={1.5} />
                Capa desktop
              </span>
              <label className="flex cursor-pointer items-center justify-between gap-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-4 transition hover:border-emerald-300 hover:bg-emerald-50/50">
                <div>
                  <p className="text-sm font-semibold text-slate-800">
                    {isUploadingCover ? 'Enviando capa...' : formData.coverUrl ? 'Trocar capa desktop' : 'Selecionar capa desktop'}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">Arte horizontal do banner (a partir de 1024px). Recomendado: 2000x300 px, com o conteúdo principal centralizado. Dimensão exata não é obrigatória.</p>
                </div>
                <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-emerald-700 shadow-sm">
                  <UploadCloud className="h-5 w-5" strokeWidth={1.5} />
                </div>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/jpg,image/webp"
                  className="hidden"
                  disabled={!hasStoreAccess || isUploadingCover}
                  onChange={(event) => {
                    void uploadStoreAsset(event, 'coverUrl');
                  }}
                />
              </label>
            </div>

            <div className="space-y-2">
              <span className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                <Image className="h-4 w-4 text-slate-400" strokeWidth={1.5} />
                Capa mobile/tablet (opcional)
              </span>
              <label className="flex cursor-pointer items-center justify-between gap-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-4 transition hover:border-emerald-300 hover:bg-emerald-50/50">
                <div>
                  <p className="text-sm font-semibold text-slate-800">
                    {isUploadingCoverMobile ? 'Enviando capa mobile...' : formData.coverMobileUrl ? 'Trocar capa mobile' : 'Selecionar capa mobile/tablet'}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">Arte usada até 1023px. Recomendado: 1200x600 px (proporção ~2:1). Dimensão exata não é obrigatória. Se ficar vazia, a página pública usa a capa desktop como fallback.</p>
                </div>
                <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-emerald-700 shadow-sm">
                  <UploadCloud className="h-5 w-5" strokeWidth={1.5} />
                </div>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/jpg,image/webp"
                  className="hidden"
                  disabled={!hasStoreAccess || isUploadingCoverMobile}
                  onChange={(event) => {
                    void uploadStoreAsset(event, 'coverMobileUrl');
                  }}
                />
              </label>
              {formData.coverMobileUrl ? (
                <button
                  type="button"
                  onClick={() =>
                    setFormData((current) => {
                      // Enfileira o arquivo atual; só será removido do storage após salvar
                      // (com cover_mobile_url = NULL) com sucesso.
                      const previousPath = extractStoreAssetPath(current.coverMobileUrl);
                      if (previousPath && !pendingAssetCleanupRef.current.coverMobileUrl.includes(previousPath)) {
                        pendingAssetCleanupRef.current.coverMobileUrl.push(previousPath);
                      }
                      return { ...current, coverMobileUrl: '' };
                    })
                  }
                  className="text-xs font-semibold text-rose-600 transition hover:text-rose-700"
                >
                  Remover capa mobile
                </button>
              ) : null}
            </div>

            <label className="space-y-3 md:col-span-2">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-semibold text-slate-700">Ajuste do fundo decorativo (horizontal)</span>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">
                  {formData.coverPositionX}%
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                step="1"
                value={formData.coverPositionX}
                onChange={(event) => handleChange('coverPositionX', Number(event.target.value))}
                className="h-2 w-full cursor-pointer appearance-none rounded-full bg-slate-200 accent-emerald-600"
              />
              <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                <button
                  type="button"
                  onClick={() => handleChange('coverPositionX', 0)}
                  className="transition hover:text-slate-600"
                >
                  Esquerda
                </button>
                <button
                  type="button"
                  onClick={() => handleChange('coverPositionX', 50)}
                  className="transition hover:text-slate-600"
                >
                  Centro
                </button>
                <button
                  type="button"
                  onClick={() => handleChange('coverPositionX', 100)}
                  className="transition hover:text-slate-600"
                >
                  Direita
                </button>
              </div>
              <p className="text-xs text-slate-500">
                Ajusta apenas o enquadramento do fundo decorativo (desfocado). Não corta a arte principal, que aparece inteira.
              </p>
            </label>

            <label className="space-y-3 md:col-span-2">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-semibold text-slate-700">Ajuste do fundo decorativo (vertical)</span>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">
                  {formData.coverPositionY}%
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                step="1"
                value={formData.coverPositionY}
                onChange={(event) => handleChange('coverPositionY', Number(event.target.value))}
                className="h-2 w-full cursor-pointer appearance-none rounded-full bg-slate-200 accent-emerald-600"
              />
              <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                <button
                  type="button"
                  onClick={() => handleChange('coverPositionY', 0)}
                  className="transition hover:text-slate-600"
                >
                  Topo
                </button>
                <button
                  type="button"
                  onClick={() => handleChange('coverPositionY', 50)}
                  className="transition hover:text-slate-600"
                >
                  Centro
                </button>
                <button
                  type="button"
                  onClick={() => handleChange('coverPositionY', 100)}
                  className="transition hover:text-slate-600"
                >
                  Base
                </button>
              </div>
              <p className="text-xs text-slate-500">
                Ajusta apenas o enquadramento vertical do fundo decorativo (desfocado). A arte principal continua inteira (object-contain).
              </p>
            </label>

            <div className="border-t border-slate-200 pt-6 md:col-span-2">
              <p className="text-xs font-black uppercase tracking-[0.22em] text-emerald-700">Contato e localização</p>
              <h3 className="mt-2 text-lg font-black text-slate-900">Como os clientes encontram sua empresa</h3>
            </div>

            <label className="space-y-2">
              <span className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                <UserRound className="h-4 w-4 text-slate-400" strokeWidth={1.5} />
                E-mail de contato
              </span>
              <input
                value={formData.email}
                onChange={(event) => handleChange('email', event.target.value)}
                placeholder="contato@sualoja.com.br"
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              />
            </label>

            <label className="space-y-2">
              <span className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                <Globe className="h-4 w-4 text-slate-400" strokeWidth={1.5} />
                Site
              </span>
              <input
                value={formData.websiteUrl}
                onChange={(event) => handleChange('websiteUrl', event.target.value)}
                placeholder="https://sualoja.com.br"
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              />
            </label>

            <label className="space-y-2">
              <span className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                <MapPin className="h-4 w-4 text-slate-400" strokeWidth={1.5} />
                Cidade
              </span>
              <input
                value={formData.city}
                onChange={(event) => handleChange('city', event.target.value)}
                placeholder="Itumbiara"
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              />
            </label>

            <label className="space-y-2">
              <span className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                <MapPin className="h-4 w-4 text-slate-400" strokeWidth={1.5} />
                Estado
              </span>
              <input
                value={formData.state}
                onChange={(event) => handleChange('state', event.target.value)}
                placeholder="GO"
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm uppercase outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              />
            </label>
          </div>

        </div>

        <aside className="space-y-6">
          <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-lg font-black text-slate-900">Estratégia recomendada</h3>
            <ul className="mt-4 space-y-3 text-sm leading-6 text-slate-600">
              <li>Use um nome comercial claro e fácil de lembrar para fortalecer a busca da sua marca.</li>
              <li>Adicione uma descrição institucional curta, focando em região atendida, tempo de mercado e tipos de produto.</li>
              <li>Mantenha logo e capa alinhados com sua identidade para transformar seus anúncios em uma vitrine profissional.</li>
            </ul>
          </div>
        </aside>
      </section>

      {isPreviewOpen ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setIsPreviewOpen(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="store-preview-title"
            className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-[2rem] border border-white/20 bg-white shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 sm:px-6">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-700">Prévia da loja</p>
                <h2 id="store-preview-title" className="mt-1 text-lg font-black text-slate-900">Como sua página está se apresentando</h2>
              </div>
              <button
                type="button"
                autoFocus
                onClick={() => setIsPreviewOpen(false)}
                aria-label="Fechar prévia"
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition hover:bg-slate-50 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
              >
                <X className="h-5 w-5" strokeWidth={1.7} />
              </button>
            </div>

            <div className="p-4 sm:p-6">
              <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
                <div
                  className="h-44 bg-cover sm:h-56"
                  style={{
                    backgroundImage: formData.coverUrl
                      ? `linear-gradient(90deg, rgba(9,15,25,.4), rgba(9,15,25,.08)), url(${formData.coverUrl})`
                      : 'linear-gradient(135deg, #022c22 0%, #064e3b 45%, #0f172a 100%)',
                    backgroundPosition: `${formData.coverPositionX}% ${formData.coverPositionY}%`,
                  }}
                />
                <div className="relative px-5 pb-6 sm:px-7">
                  <div className="-mt-10 flex h-20 w-24 items-center justify-center overflow-hidden rounded-3xl border-4 border-white bg-white text-slate-500 shadow-sm">
                    {formData.logoUrl ? (
                      <img src={formData.logoUrl} alt={formData.storeName || 'Logo da loja'} className="h-full w-full object-contain p-2.5" />
                    ) : (
                      <ShoppingBag className="h-8 w-8" strokeWidth={1.5} />
                    )}
                  </div>
                  <div className="mt-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-2xl font-black text-slate-900">{formData.storeName || 'Sua loja parceira'}</h3>
                      <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-emerald-700">Loja Parceira</span>
                    </div>
                    <p className="mt-1 text-sm text-slate-500">{[formData.city, formData.state].filter(Boolean).join(' - ') || 'Localização não informada'}</p>
                    <p className="mt-4 text-sm leading-6 text-slate-600">{formData.description || 'Adicione uma apresentação curta da empresa nos dados da loja.'}</p>
                    <div className="mt-5 flex flex-col gap-3 rounded-2xl bg-slate-50 p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
                      <span className="font-semibold text-slate-700">{orderedAnnouncements.length} anúncio(s) ativo(s)</span>
                      <span className={`font-bold ${formData.isActive ? 'text-emerald-700' : 'text-slate-500'}`}>{formData.isActive ? 'Página publicada' : 'Página oculta'}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default SellerStoreDashboard;
