import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  Check,
  CheckCircle2,
  Clock3,
  Download,
  FileText,
  Loader2,
  RefreshCw,
  ShoppingBag,
  Sparkles,
  X,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import type { Ad, SellerStore } from '../../types';
import {
  getEffectiveCatalogStatus,
  useSellerStoreCatalog,
  type SellerStoreCatalogExport,
  type SellerStoreCatalogExportStatus,
} from '../../src/hooks/useSellerStoreCatalog';
import type {
  SellerStoreCatalogCoverAlignment,
  SellerStoreCatalogPriceMode,
} from '../../src/lib/sellerStoreCatalog/documentModel';

type SellerStoreCatalogPanelProps = {
  hasStoreAccess: boolean;
  ownerUserId: string | null | undefined;
  store: SellerStore | null;
  announcements: Ad[];
  isLoadingAnnouncements: boolean;
};

const PRICE_OPTIONS: Array<{
  value: SellerStoreCatalogPriceMode;
  label: string;
  description: string;
}> = [
  { value: 'show', label: 'Mostrar preços', description: 'Exibe os valores atuais dos anúncios.' },
  { value: 'consult', label: 'Sob consulta', description: 'Substitui todos os valores por “Consulte o vendedor”.' },
  { value: 'hide', label: 'Ocultar preços', description: 'Cria um catálogo institucional sem valores.' },
];

const COVER_ALIGNMENT_OPTIONS: Array<{ value: SellerStoreCatalogCoverAlignment; label: string }> = [
  { value: 'left', label: 'Esquerda' },
  { value: 'center', label: 'Centro' },
  { value: 'right', label: 'Direita' },
];

const STATUS_LABELS: Record<SellerStoreCatalogExportStatus, string> = {
  queued: 'Na fila',
  processing: 'Gerando PDF',
  ready: 'Pronto',
  failed: 'Falhou',
  cancelled: 'Cancelado',
  expired: 'Expirado',
};

const STATUS_STYLES: Record<SellerStoreCatalogExportStatus, string> = {
  queued: 'bg-amber-50 text-amber-800 ring-amber-200',
  processing: 'bg-sky-50 text-sky-800 ring-sky-200',
  ready: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  failed: 'bg-rose-50 text-rose-800 ring-rose-200',
  cancelled: 'bg-slate-100 text-slate-600 ring-slate-200',
  expired: 'bg-slate-100 text-slate-600 ring-slate-200',
};

const formatDateTime = (value: string) => new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
}).format(new Date(value));

const formatFileSize = (bytes: number | null) => {
  if (!bytes) return null;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
};

const CatalogStatusIcon: React.FC<{ status: SellerStoreCatalogExportStatus }> = ({ status }) => {
  if (status === 'processing') return <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />;
  if (status === 'ready') return <CheckCircle2 className="h-4 w-4" aria-hidden="true" />;
  if (status === 'failed') return <XCircle className="h-4 w-4" aria-hidden="true" />;
  return <Clock3 className="h-4 w-4" aria-hidden="true" />;
};

const SellerStoreCatalogPanel: React.FC<SellerStoreCatalogPanelProps> = ({
  hasStoreAccess,
  ownerUserId,
  store,
  announcements,
  isLoadingAnnouncements,
}) => {
  const storeEligible = Boolean(
    hasStoreAccess
    && store?.isActive
    && store.isStoreFeatureEnabled
    && !store.isPausedDueToPlan,
  );
  const {
    exports: catalogExports,
    isLoading,
    isRefreshing,
    isCreating,
    busyExportId,
    error,
    isRuntimeEnabled,
    refresh,
    createExport,
    cancelExport,
    prepareDownload,
  } = useSellerStoreCatalog(Boolean(store), ownerUserId);
  const catalogEnabled = storeEligible && isRuntimeEnabled;
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [catalogTitle, setCatalogTitle] = useState('');
  const [catalogSubtitle, setCatalogSubtitle] = useState('');
  const [priceMode, setPriceMode] = useState<SellerStoreCatalogPriceMode>('show');
  const [coverAlignment, setCoverAlignment] = useState<SellerStoreCatalogCoverAlignment>('center');
  const selectionInitialized = useRef(false);
  const titleInitializedForStore = useRef<string | null>(null);

  useEffect(() => {
    const availableIds = new Set(announcements.map((announcement) => announcement.id));
    if (!selectionInitialized.current && announcements.length) {
      setSelectedIds(announcements.slice(0, 200).map((announcement) => announcement.id));
      selectionInitialized.current = true;
      return;
    }
    setSelectedIds((current) => current.filter((id) => availableIds.has(id)));
  }, [announcements]);

  useEffect(() => {
    if (!store || titleInitializedForStore.current === store.id) return;
    setCatalogTitle(`${store.storeName} | Catálogo`);
    setCoverAlignment(
      typeof store.coverPositionX === 'number' && store.coverPositionX < 34
        ? 'left'
        : typeof store.coverPositionX === 'number' && store.coverPositionX > 66
          ? 'right'
          : 'center',
    );
    titleInitializedForStore.current = store.id;
  }, [store]);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const allSelected = announcements.length > 0 && selectedIds.length === Math.min(announcements.length, 100);
  const latestOpenExport = catalogExports.find((item) => item.status === 'queued' || item.status === 'processing');
  const coverImageUrl = store?.coverUrl || store?.coverMobileUrl || null;
  const coverObjectPosition = `${coverAlignment} center`;
  const readyCatalogCount = catalogExports.filter((item) => getEffectiveCatalogStatus(item) === 'ready').length;
  const selectedPriceLabel = PRICE_OPTIONS.find((option) => option.value === priceMode)?.label ?? 'Mostrar preços';
  const selectedAlignmentLabel = COVER_ALIGNMENT_OPTIONS.find((option) => option.value === coverAlignment)?.label ?? 'Centro';

  const toggleAnnouncement = (announcementId: string) => {
    setSelectedIds((current) => (
      current.includes(announcementId)
        ? current.filter((id) => id !== announcementId)
        : current.length < 100 ? [...current, announcementId] : current
    ));
  };

  const toggleAll = () => {
    setSelectedIds(allSelected ? [] : announcements.slice(0, 200).map((announcement) => announcement.id));
  };

  const handleCreate = async () => {
    if (!catalogEnabled) {
      toast.error('Ative e salve sua Loja Parceira antes de gerar um catálogo.');
      return;
    }
    if (!selectedIds.length) {
      toast.error('Selecione pelo menos um anúncio.');
      return;
    }
    if (catalogTitle.trim().length < 3) {
      toast.error('Informe um título com pelo menos 3 caracteres.');
      return;
    }
    if (catalogSubtitle.trim() && catalogSubtitle.trim().length < 3) {
      toast.error('O subtítulo deve ter pelo menos 3 caracteres ou ficar vazio.');
      return;
    }

    try {
      await createExport({
        announcementIds: selectedIds,
        catalogTitle,
        catalogSubtitle,
        priceMode,
        coverAlignment,
      });
      toast.success('Catálogo adicionado à fila de geração.');
    } catch (createError) {
      toast.error(createError instanceof Error ? createError.message : 'Não foi possível gerar o catálogo.');
    }
  };

  const handleCancel = async (exportId: string) => {
    try {
      await cancelExport(exportId);
      toast.success('Geração cancelada.');
    } catch (cancelError) {
      toast.error(cancelError instanceof Error ? cancelError.message : 'Não foi possível cancelar a geração.');
    }
  };

  const handleDownload = async (catalog: SellerStoreCatalogExport) => {
    try {
      const download = await prepareDownload(catalog.id);
      const anchor = document.createElement('a');
      anchor.href = download.signedUrl;
      anchor.download = download.filename;
      anchor.rel = 'noopener';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    } catch (downloadError) {
      toast.error(downloadError instanceof Error ? downloadError.message : 'Não foi possível baixar o catálogo.');
    }
  };

  const renderCoverPreview = (sizeClass: string) => (
    <div className={`relative aspect-[210/297] overflow-hidden rounded-[1.15rem] bg-[#071722] text-white shadow-lg shadow-slate-900/10 ${sizeClass}`}>
      <div className="absolute inset-x-0 top-0 h-[41%] overflow-hidden bg-slate-800">
        {coverImageUrl ? (
          <>
            <img
              src={coverImageUrl}
              alt=""
              className="absolute -inset-3 h-[calc(100%+1.5rem)] w-[calc(100%+1.5rem)] scale-110 object-cover opacity-45 blur-xl"
            />
            <img
              src={coverImageUrl}
              alt="Prévia do enquadramento da capa"
              className="absolute inset-3 h-[calc(100%-1.5rem)] w-[calc(100%-1.5rem)] object-contain drop-shadow-lg transition-[object-position] duration-300"
              style={{ objectPosition: coverObjectPosition }}
            />
          </>
        ) : (
          <div className="flex h-full items-center justify-center text-[8px] font-black uppercase tracking-[0.25em] text-emerald-300">AGRO BW</div>
        )}
      </div>
      <div className="absolute left-[9%] top-[5%] flex items-center gap-1.5 rounded-lg border border-white/20 bg-slate-950/70 p-1.5 backdrop-blur">
        <div className="flex h-7 w-7 items-center justify-center overflow-hidden rounded-md bg-white p-1 text-[6px] font-black text-emerald-700">
          {store?.logoUrl ? <img src={store.logoUrl} alt="" className="h-full w-full object-contain" /> : 'LOJA'}
        </div>
        <span className="text-[5px] font-black uppercase tracking-[0.16em]">Loja Parceira</span>
      </div>
      <div className="absolute inset-x-[9%] top-[47%]">
        <p className="text-[5px] font-black uppercase tracking-[0.2em] text-lime-200">Catálogo de oportunidades</p>
        <h4 className="mt-2 line-clamp-3 font-serif text-[clamp(0.7rem,1.5vw,1.05rem)] font-bold leading-[1.02]">{catalogTitle || 'Título do catálogo'}</h4>
        {catalogSubtitle ? <p className="mt-2 line-clamp-2 text-[6px] leading-relaxed text-slate-300">{catalogSubtitle}</p> : null}
        <div className="mt-3 flex items-start gap-1.5">
          <span className="mt-1 h-0.5 w-5 bg-emerald-400" />
          <div><strong className="block text-[6px]">{store?.storeName || 'Sua loja'}</strong><span className="text-[5px] text-slate-400">{[store?.city, store?.state].filter(Boolean).join(' - ')}</span></div>
        </div>
      </div>
      <div className="absolute inset-x-[9%] bottom-[5%] flex items-center justify-between border-t border-white/10 pt-1.5 text-[5px] text-slate-400"><strong className="text-emerald-300">AGRO BW</strong><span>agrobw.com.br</span></div>
    </div>
  );

  return (
    <section className="space-y-4">
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#062a29] via-[#063b35] to-[#052d2d] px-5 py-5 text-white shadow-sm sm:px-7">
        <div className="absolute -right-16 -top-28 h-72 w-72 rounded-full border border-emerald-300/25" />
        <div className="absolute right-10 top-5 h-36 w-36 rounded-full border border-lime-200/15" />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-2xl">
            <span className="inline-flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.24em] text-emerald-300">
              <Sparkles className="h-4 w-4" strokeWidth={1.6} />
              Catálogo inteligente
            </span>
            <h2 className="mt-2 text-2xl font-black tracking-tight md:text-3xl">
              Transforme sua vitrine em um PDF pronto para vender.
            </h2>
            <p className="mt-2 max-w-xl text-sm leading-5 text-emerald-50/80">
              Escolha os anúncios, defina como os preços aparecem e gere um material profissional para imprimir ou compartilhar com clientes.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:min-w-[320px]">
            <div className="flex items-center gap-3 rounded-xl border border-white/15 bg-white/10 px-4 py-3 backdrop-blur">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-400/15 text-emerald-200"><ShoppingBag className="h-5 w-5" /></span>
              <div><p className="text-xl font-black text-white">{announcements.length}</p><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-100/60">anúncios ativos</p></div>
            </div>
            <div className="flex items-center gap-3 rounded-xl border border-white/15 bg-white/10 px-4 py-3 backdrop-blur">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-400/15 text-emerald-200"><FileText className="h-5 w-5" /></span>
              <div><p className="text-xl font-black text-white">{readyCatalogCount}</p><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-100/60">catálogos prontos</p></div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(340px,0.95fr)] xl:items-start">
        <div className="space-y-4">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-sm font-black text-emerald-700">1</span>
              <div><h3 className="text-base font-black text-slate-900">Informações do catálogo</h3><p className="mt-0.5 text-xs text-slate-500">Defina um título e, se quiser, adicione um subtítulo para a próxima safra.</p></div>
            </div>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <label className="space-y-2"><span className="text-xs font-bold text-slate-700">Título do catálogo</span><input value={catalogTitle} onChange={(event) => setCatalogTitle(event.target.value)} maxLength={120} disabled={!catalogEnabled} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 disabled:bg-slate-100" placeholder="Catálogo de oportunidades" /></label>
              <label className="space-y-2"><span className="text-xs font-bold text-slate-700">Subtítulo opcional</span><input value={catalogSubtitle} onChange={(event) => setCatalogSubtitle(event.target.value)} maxLength={240} disabled={!catalogEnabled} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 disabled:bg-slate-100" placeholder="Uma seleção para a próxima safra" /></label>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start gap-3"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-sm font-black text-emerald-700">2</span><div><h3 className="text-base font-black text-slate-900">Aparência da capa</h3><p className="mt-0.5 text-xs text-slate-500">Escolha a imagem, defina o alinhamento e como os preços serão exibidos.</p></div></div>
            <div className="mt-5 grid gap-5 lg:grid-cols-[185px_minmax(0,1fr)]">
              <div className="flex items-center justify-center rounded-2xl bg-slate-100 p-3">{renderCoverPreview('w-full max-w-[170px]')}</div>
              <div>
                <p className="text-xs font-black uppercase tracking-[0.16em] text-emerald-700">Prévia da capa</p>
                <p className="mt-2 text-xs leading-5 text-slate-500">Esta imagem será utilizada na capa do catálogo. Em imagens panorâmicas, o alinhamento define qual lado fica em foco quando sobra espaço na composição.</p>
                <p className="mt-1 text-[11px] leading-5 text-slate-400">Em imagens panorâmicas que já ocupam toda a largura, a diferença entre os alinhamentos pode ser sutil ou inexistente.</p>
                <fieldset className="mt-4"><legend className="text-xs font-bold text-slate-700">Alinhamento da imagem</legend><div className="mt-2 grid grid-cols-3 gap-2" role="group" aria-label="Enquadramento da imagem da capa">{COVER_ALIGNMENT_OPTIONS.map((option) => { const selected = coverAlignment === option.value; return <button key={option.value} type="button" onClick={() => setCoverAlignment(option.value)} disabled={!catalogEnabled} aria-pressed={selected} className={`rounded-xl border px-3 py-2.5 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-50 ${selected ? 'border-emerald-500 bg-emerald-50 text-emerald-800 ring-2 ring-emerald-100' : 'border-slate-200 text-slate-600 hover:border-emerald-300'}`}>{option.label}</button>; })}</div></fieldset>
                <fieldset className="mt-4 border-t border-slate-100 pt-4"><legend className="text-xs font-bold text-slate-700">Como exibir os preços</legend><div className="mt-2 grid gap-2 sm:grid-cols-3">{PRICE_OPTIONS.map((option) => { const selected = priceMode === option.value; return <button key={option.value} type="button" onClick={() => setPriceMode(option.value)} disabled={!catalogEnabled} aria-pressed={selected} className={`rounded-xl border p-3 text-left transition disabled:cursor-not-allowed disabled:opacity-60 ${selected ? 'border-emerald-500 bg-emerald-50 ring-2 ring-emerald-100' : 'border-slate-200 bg-white hover:border-emerald-200'}`}><span className="flex items-center justify-between gap-2 text-xs font-black text-slate-900">{option.label}{selected ? <Check className="h-4 w-4 text-emerald-700" /> : null}</span><span className="mt-1 block text-[10px] leading-4 text-slate-500">{option.description}</span></button>; })}</div></fieldset>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-start gap-3"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-sm font-black text-emerald-700">3</span><div><h3 className="text-base font-black text-slate-900">Produtos selecionados</h3><p className="mt-0.5 text-xs text-slate-500">{selectedIds.length} de {announcements.length} anúncio(s) farão parte do catálogo.</p></div></div>
              <button type="button" onClick={toggleAll} disabled={!catalogEnabled || !announcements.length} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 transition hover:border-emerald-300 hover:text-emerald-700 disabled:opacity-50">{allSelected ? 'Limpar seleção' : 'Selecionar todos'}</button>
            </div>
            <div className="mt-4 max-h-[360px] space-y-2 overflow-y-auto pr-1">
              {isLoadingAnnouncements ? Array.from({ length: 3 }).map((_, index) => <div key={index} className="h-16 animate-pulse rounded-xl bg-slate-100" />) : announcements.length === 0 ? <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">Publique pelo menos um anúncio ativo para montar seu catálogo.</div> : announcements.map((announcement) => { const selected = selectedSet.has(announcement.id); return <button key={announcement.id} type="button" onClick={() => toggleAnnouncement(announcement.id)} disabled={!catalogEnabled} aria-pressed={selected} className={`flex w-full items-center gap-3 rounded-xl border p-2.5 text-left transition disabled:cursor-not-allowed ${selected ? 'border-emerald-200 bg-emerald-50/30' : 'border-slate-100 bg-slate-50/60 opacity-70'}`}><span className="h-11 w-14 shrink-0 overflow-hidden rounded-lg bg-slate-100">{announcement.images?.[0] ? <img src={announcement.images[0]} alt="" className="h-full w-full object-cover" /> : <span className="flex h-full items-center justify-center text-slate-400"><FileText className="h-4 w-4" /></span>}</span><span className="min-w-0 flex-1"><span className="block truncate text-xs font-black text-slate-900">{announcement.title}</span><span className="mt-1 block truncate text-[11px] text-slate-500">{announcement.location.city} - {announcement.location.state}</span></span><span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${selected ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-300 text-transparent'}`}><Check className="h-3.5 w-3.5" /></span></button>; })}
            </div>
          </section>
        </div>

        <aside className="space-y-4 xl:sticky xl:top-5">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700"><FileText className="h-4 w-4" /></span><div><h3 className="text-base font-black text-slate-900">Resumo do catálogo</h3><p className="mt-0.5 text-xs text-slate-500">Confira as informações e gere seu PDF.</p></div></div>
            <div className="mt-4 grid grid-cols-[90px_minmax(0,1fr)] gap-4 rounded-2xl border border-emerald-100 bg-emerald-50/30 p-3">
              {renderCoverPreview('w-[90px]')}
              <dl className="space-y-3 py-1 text-xs"><div className="flex items-center justify-between gap-3"><dt className="text-slate-500">Produtos</dt><dd className="font-black text-slate-900">{selectedIds.length} selecionado(s)</dd></div><div className="flex items-center justify-between gap-3"><dt className="text-slate-500">Preços</dt><dd className="font-black text-emerald-700">{selectedPriceLabel}</dd></div><div className="flex items-center justify-between gap-3"><dt className="text-slate-500">Capa</dt><dd className="font-black text-slate-900">{selectedAlignmentLabel}</dd></div></dl>
            </div>
            {!catalogEnabled ? <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs leading-5 text-amber-900">{!store ? 'Salve os dados da sua Loja Parceira para liberar o gerador.' : !storeEligible ? 'A loja precisa estar ativa e vinculada a um plano Loja Parceira válido.' : 'O gerador de catálogos está temporariamente indisponível durante a liberação acompanhada.'}</div> : null}
            <button type="button" onClick={() => void handleCreate()} disabled={!catalogEnabled || isCreating || !selectedIds.length || catalogTitle.trim().length < 3} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-black text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50">{isCreating ? <Loader2 className="h-5 w-5 animate-spin" /> : <BookOpen className="h-5 w-5" />}{isCreating ? 'Adicionando à fila...' : `Gerar catálogo com ${selectedIds.length} anúncio(s)`}</button>
            <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2.5 text-[11px] leading-4 text-slate-500">O catálogo usa uma fotografia dos dados atuais. Alterações futuras nos anúncios não modificam PDFs já gerados.</p>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3"><div className="flex items-start gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700"><Clock3 className="h-4 w-4" /></span><div><h3 className="text-base font-black text-slate-900">Seus catálogos</h3><p className="mt-0.5 text-xs text-slate-500">Histórico dos últimos 12 arquivos gerados.</p></div></div><button type="button" onClick={() => void refresh().catch((refreshError) => toast.error(refreshError.message))} disabled={isRefreshing} aria-label="Atualizar histórico de catálogos" className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:border-emerald-300 hover:text-emerald-700 disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} /></button></div>
            {latestOpenExport ? <div aria-live="polite" className="mt-4 rounded-xl border border-sky-200 bg-sky-50 p-3"><div className="flex items-start gap-2.5"><Loader2 className="mt-0.5 h-4 w-4 animate-spin text-sky-700" /><div><p className="text-xs font-black text-sky-950">{latestOpenExport.status === 'queued' ? 'Seu catálogo está na fila' : 'Estamos montando seu PDF'}</p><p className="mt-1 text-[11px] leading-4 text-sky-800">O status é atualizado automaticamente.</p></div></div></div> : null}
            {error ? <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">{error}</div> : null}
            <div className="mt-4 max-h-[520px] space-y-3 overflow-y-auto pr-1">
              {isLoading ? Array.from({ length: 3 }).map((_, index) => <div key={index} className="h-28 animate-pulse rounded-xl bg-slate-100" />) : catalogExports.length === 0 ? <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-5 py-7 text-center"><BookOpen className="mx-auto h-7 w-7 text-slate-300" /><p className="mt-3 text-sm font-bold text-slate-700">Nenhum catálogo gerado ainda</p><p className="mt-1 text-xs leading-5 text-slate-500">Sua primeira versão aparecerá aqui com acesso privado por 30 dias.</p></div> : catalogExports.map((catalog) => { const effectiveStatus = getEffectiveCatalogStatus(catalog); const isBusy = busyExportId === catalog.id; const fileSize = formatFileSize(catalog.fileSizeBytes); return <article key={catalog.id} className="rounded-xl border border-slate-200 bg-white p-3.5"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="truncate text-xs font-black text-slate-900">{catalog.catalogTitle}</p><p className="mt-1 text-[10px] text-slate-500">{formatDateTime(catalog.createdAt)}</p></div><span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[10px] font-black ring-1 ring-inset ${STATUS_STYLES[effectiveStatus]}`}><CatalogStatusIcon status={effectiveStatus} />{STATUS_LABELS[effectiveStatus]}</span></div><div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-slate-500"><span>{catalog.announcementIds.length} anúncio(s)</span><span>Capa: {COVER_ALIGNMENT_OPTIONS.find((option) => option.value === catalog.coverAlignment)?.label ?? 'Centro'}</span>{catalog.pageCount ? <span>{catalog.pageCount} página(s)</span> : null}{fileSize ? <span>{fileSize}</span> : null}{catalog.attempts > 0 ? <span>Tentativa {catalog.attempts}/{catalog.maxAttempts}</span> : null}</div>{effectiveStatus === 'failed' ? <p className="mt-2 rounded-lg bg-rose-50 px-2.5 py-2 text-[11px] leading-4 text-rose-800">Não foi possível concluir este arquivo. Gere uma nova versão ou tente novamente mais tarde.</p> : null}{effectiveStatus === 'ready' ? <p className="mt-2 text-[10px] text-slate-500">Download disponível até {formatDateTime(catalog.expiresAt)}.</p> : null}<div className="mt-3 flex gap-2">{effectiveStatus === 'ready' ? <button type="button" onClick={() => void handleDownload(catalog)} disabled={isBusy} className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-slate-950 px-3 py-2 text-[11px] font-black text-white transition hover:bg-emerald-700 disabled:opacity-50">{isBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}Baixar PDF</button> : null}{catalog.status === 'queued' ? <button type="button" onClick={() => void handleCancel(catalog.id)} disabled={isBusy} className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-[11px] font-bold text-slate-600 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-50">{isBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}Cancelar</button> : null}</div></article>; })}
            </div>
          </section>
        </aside>
      </div>
    </section>
  );
};

export default SellerStoreCatalogPanel;
