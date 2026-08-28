import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Download, Image as ImageIcon, Loader2, X } from 'lucide-react';
import type { Ad } from '../../types';
import {
  AD_ARTWORK_FORMATS,
  AD_ARTWORK_TEMPLATES,
  buildAdArtworkFileName,
  buildAdArtworkLocation,
  formatAdArtworkPrice,
  getDefaultAdArtworkPriceMode,
  type AdArtworkFormat,
  type AdArtworkPriceMode,
  type AdArtworkTemplate,
} from '../../src/lib/adShareArtwork';
import { getAnnouncementPath } from '../../src/lib/announcementUrl';
import { renderAdShareArtwork } from '../../src/utils/adShareArtworkRenderer';

type AdShareArtworkModalProps = {
  ad: Ad | null;
  isOpen: boolean;
  onClose: () => void;
};

const AdShareArtworkModal: React.FC<AdShareArtworkModalProps> = ({ ad, isOpen, onClose }) => {
  const [template, setTemplate] = useState<AdArtworkTemplate>('showcase');
  const [format, setFormat] = useState<AdArtworkFormat>('square');
  const [priceMode, setPriceMode] = useState<AdArtworkPriceMode>('consult');
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [previewUrl, setPreviewUrl] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState('');
  const generatedBlobRef = useRef<Blob | null>(null);

  const images = useMemo(
    () => (ad?.images || []).filter((image): image is string => typeof image === 'string' && Boolean(image.trim())),
    [ad],
  );

  useEffect(() => {
    if (!isOpen || !ad) return;
    setTemplate('showcase');
    setFormat('square');
    setPriceMode(getDefaultAdArtworkPriceMode(ad));
    setSelectedImageIndex(0);
    setError('');
  }, [ad?.id, isOpen]);

  useEffect(() => {
    if (!isOpen || !ad || !images[selectedImageIndex]) return;

    let cancelled = false;
    let nextPreviewUrl = '';
    setIsGenerating(true);
    setError('');

    const timer = window.setTimeout(async () => {
      try {
        const announcementUrl = new URL(getAnnouncementPath(ad), window.location.origin).toString();
        const blob = await renderAdShareArtwork({
          format,
          template,
          imageUrl: images[selectedImageIndex],
          title: ad.title,
          priceLabel: formatAdArtworkPrice(ad.price, priceMode),
          locationLabel: buildAdArtworkLocation(ad.location),
          announcementUrl,
          logoUrl: new URL('/agrobw-logo.png', window.location.origin).toString(),
        });

        if (cancelled) return;
        generatedBlobRef.current = blob;
        nextPreviewUrl = URL.createObjectURL(blob);
        setPreviewUrl((current) => {
          if (current) URL.revokeObjectURL(current);
          return nextPreviewUrl;
        });
      } catch (generationError) {
        if (cancelled) return;
        generatedBlobRef.current = null;
        setError(generationError instanceof Error
          ? generationError.message
          : 'Nao foi possivel gerar a arte agora.');
      } finally {
        if (!cancelled) setIsGenerating(false);
      }
    }, 220);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      if (nextPreviewUrl) URL.revokeObjectURL(nextPreviewUrl);
    };
  }, [ad, format, images, isOpen, priceMode, selectedImageIndex, template]);

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !ad) return null;

  const selectedFormat = AD_ARTWORK_FORMATS.find((item) => item.id === format) || AD_ARTWORK_FORMATS[0];

  const handleDownload = () => {
    const blob = generatedBlobRef.current;
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = buildAdArtworkFileName(ad.title, format, template);
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/70 p-3 backdrop-blur-sm sm:p-5">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="ad-artwork-title"
        className="flex max-h-[94dvh] w-full max-w-6xl flex-col overflow-hidden rounded-[28px] border border-white/10 bg-[#f7f8f6] shadow-[0_40px_100px_-35px_rgba(2,6,23,0.8)]"
      >
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 bg-white px-5 py-4 sm:px-7 sm:py-5">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-green-700">Divulgacao do anuncio</p>
            <h2 id="ad-artwork-title" className="mt-1 text-xl font-black text-slate-950 sm:text-2xl">
              Criar arte personalizada
            </h2>
            <p className="mt-1 truncate text-sm text-slate-500">{ad.title}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
            aria-label="Fechar"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="grid min-h-0 flex-1 overflow-y-auto lg:grid-cols-[minmax(0,0.92fr)_minmax(430px,1.08fr)] lg:overflow-hidden">
          <section className="flex min-h-[430px] items-center justify-center bg-[radial-gradient(circle_at_top,#e2f7e9_0%,#eef2f4_42%,#dce3e8_100%)] p-5 sm:p-8 lg:min-h-0">
            <div className="relative flex h-full max-h-[660px] w-full items-center justify-center">
              {isGenerating && (
                <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-white/65 backdrop-blur-sm">
                  <div className="flex items-center gap-2 rounded-full bg-slate-950 px-4 py-2 text-sm font-bold text-white shadow-xl">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Atualizando previa
                  </div>
                </div>
              )}

              {previewUrl ? (
                <img
                  src={previewUrl}
                  alt="Previa da arte de divulgacao"
                  className="max-h-[660px] max-w-full rounded-2xl object-contain shadow-[0_28px_70px_-28px_rgba(15,23,42,0.65)]"
                  style={{ aspectRatio: `${selectedFormat.width}/${selectedFormat.height}` }}
                />
              ) : (
                <div className="flex aspect-square w-full max-w-md flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white/70 px-8 text-center">
                  <ImageIcon className="h-10 w-10 text-slate-400" />
                  <p className="mt-4 text-sm font-bold text-slate-700">A previa aparecera aqui</p>
                  <p className="mt-1 text-xs text-slate-500">Selecione um anuncio que tenha pelo menos uma foto.</p>
                </div>
              )}
            </div>
          </section>

          <section className="overflow-y-auto bg-white px-5 py-6 sm:px-7">
            <div className="space-y-7">
              <div>
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">1. Escolha o estilo</p>
                    <h3 className="mt-1 text-base font-black text-slate-900">Template automatico</h3>
                  </div>
                  <span className="text-xs font-semibold text-green-700">3 opcoes</span>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  {AD_ARTWORK_TEMPLATES.map((item) => {
                    const active = template === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setTemplate(item.id)}
                        className={`relative rounded-2xl border p-3 text-left transition ${active
                          ? 'border-green-600 bg-green-50 shadow-[0_14px_30px_-24px_rgba(22,163,74,0.8)]'
                          : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'}`}
                      >
                        {active && <Check className="absolute right-2.5 top-2.5 h-4 w-4 text-green-700" />}
                        <span className="block pr-5 text-sm font-black text-slate-900">{item.name}</span>
                        <span className="mt-1 block text-[11px] leading-4 text-slate-500">{item.description}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">2. Escolha onde publicar</p>
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  {AD_ARTWORK_FORMATS.map((item) => {
                    const active = format === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setFormat(item.id)}
                        className={`rounded-2xl border px-3 py-3 text-left transition ${active
                          ? 'border-slate-950 bg-slate-950 text-white'
                          : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'}`}
                      >
                        <span className="block text-sm font-black">{item.name}</span>
                        <span className={`mt-0.5 block text-[11px] ${active ? 'text-slate-300' : 'text-slate-400'}`}>
                          {item.dimensions}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid gap-5 sm:grid-cols-2">
                <div>
                  <label className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400" htmlFor="artwork-price-mode">
                    3. Informacao de preco
                  </label>
                  <select
                    id="artwork-price-mode"
                    value={priceMode}
                    onChange={(event) => setPriceMode(event.target.value as AdArtworkPriceMode)}
                    className="mt-3 h-12 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 outline-none focus:border-green-600 focus:ring-2 focus:ring-green-600/15"
                  >
                    <option value="price" disabled={!ad.price || ad.price <= 0}>Mostrar preco do anuncio</option>
                    <option value="consult">Mostrar Sob consulta</option>
                  </select>
                </div>

                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">4. Foto principal</p>
                  <div className="mt-3 flex min-h-12 gap-2 overflow-x-auto pb-1">
                    {images.map((image, index) => (
                      <button
                        key={`${image}-${index}`}
                        type="button"
                        onClick={() => setSelectedImageIndex(index)}
                        className={`relative h-12 w-16 shrink-0 overflow-hidden rounded-xl border-2 transition ${
                          selectedImageIndex === index ? 'border-green-600' : 'border-transparent'
                        }`}
                        aria-label={`Usar foto ${index + 1}`}
                      >
                        <img src={image} alt="" className="h-full w-full object-cover" />
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-green-100 bg-green-50/70 p-4">
                <p className="text-sm font-bold text-green-950">Pronta para compartilhar</p>
                <p className="mt-1 text-xs leading-5 text-green-800/80">
                  A arte inclui marca AGRO BW, localizacao, QR Code e o link amigavel deste anuncio. Nada e enviado para um novo servidor.
                </p>
              </div>

              {error && (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-700">
                  {error}
                </div>
              )}
            </div>
          </section>
        </div>

        <footer className="flex flex-col-reverse gap-3 border-t border-slate-200 bg-white px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-7">
          <p className="text-xs text-slate-400">Arquivo PNG em {selectedFormat.dimensions}px</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="h-11 rounded-xl border border-slate-200 px-5 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleDownload}
              disabled={isGenerating || !generatedBlobRef.current || Boolean(error)}
              className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-green-600 px-5 text-sm font-black text-white transition hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none"
            >
              {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Baixar PNG
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
};

export default AdShareArtworkModal;

