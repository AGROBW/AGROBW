import React from 'react';
import { ImageIcon, Loader2, UploadCloud } from 'lucide-react';

export type PageImageField =
  | 'loginHeroImageUrl'
  | 'registerHeroImageUrl'
  | 'pricingHeroImageUrl'
  | 'pricingStoreImageUrl'
  | 'pricingFieldImageUrl'
  | 'sponsorHeroImageUrl'
  | 'sponsorHarvestImageUrl'
  | 'sponsorFieldImageUrl'
  | 'sponsorFinalCtaImageUrl'
  | 'ogDefaultImageUrl';

type PageImagesFormData = {
  loginHeroImageUrl: string;
  registerHeroImageUrl: string;
  pricingHeroImageUrl: string;
  pricingStoreImageUrl: string;
  pricingFieldImageUrl: string;
  sponsorHeroImageUrl: string;
  sponsorHarvestImageUrl: string;
  sponsorFieldImageUrl: string;
  sponsorFinalCtaImageUrl: string;
  ogDefaultImageUrl: string;
};

interface LayoutPageImagesSectionProps {
  formData: PageImagesFormData;
  onChange: (field: PageImageField, value: string) => void;
  onUpload: (field: PageImageField, file: File) => Promise<void>;
  uploadingField: PageImageField | null;
}

const AUTH_IMAGES: Array<{ field: PageImageField; label: string; helper: string }> = [
  {
    field: 'registerHeroImageUrl',
    label: 'Cadastro',
    helper: 'Imagem lateral da tela de cadastro, incluindo a arte do celular com QR Code. Resolucao recomendada: 1600 x 2000 px.',
  },
  {
    field: 'loginHeroImageUrl',
    label: 'Login',
    helper: 'Imagem lateral principal da tela de login. Resolucao recomendada: 1600 x 2000 px.',
  },
];

const PRICING_IMAGES: Array<{ field: PageImageField; label: string; helper: string }> = [
  {
    field: 'pricingHeroImageUrl',
    label: 'Hero (fundo principal)',
    helper: 'Imagem de fundo da secao topo da pagina de Planos.',
  },
  {
    field: 'pricingStoreImageUrl',
    label: 'Loja Parceira',
    helper: 'Foto da secao "Sua marca em uma vitrine propria".',
  },
  {
    field: 'pricingFieldImageUrl',
    label: 'CTA Final',
    helper: 'Imagem de fundo da secao de chamada final da pagina de Planos.',
  },
];

const SPONSOR_IMAGES: Array<{ field: PageImageField; label: string; helper: string }> = [
  {
    field: 'sponsorHeroImageUrl',
    label: 'Hero (fundo principal)',
    helper: 'Imagem de fundo do topo da pagina de Patrocinadores.',
  },
  {
    field: 'sponsorHarvestImageUrl',
    label: 'Secao Diferenciais',
    helper: 'Foto do bloco de diferenciais/colheitadeira.',
  },
  {
    field: 'sponsorFieldImageUrl',
    label: 'Formulario / CTA',
    helper: 'Imagem de fundo do formulario de reserva de patrocinio.',
  },
  {
    field: 'sponsorFinalCtaImageUrl',
    label: 'CTA final',
    helper: 'Imagem de fundo da ultima chamada da pagina de Patrocinadores.',
  },
];

const SHARE_IMAGES: Array<{ field: PageImageField; label: string; helper: string }> = [
  {
    field: 'ogDefaultImageUrl',
    label: 'Imagem de compartilhamento (Open Graph)',
    helper:
      'Imagem exibida no card ao compartilhar o site/lojas no Facebook, WhatsApp, X etc. Use PNG ou JPG (NAO use SVG) em 1200 x 630 px.',
  },
];

const LayoutPageImagesSection: React.FC<LayoutPageImagesSectionProps> = ({
  formData,
  onChange,
  onUpload,
  uploadingField,
}) => {
  const renderCard = (field: PageImageField, label: string, helper: string) => {
    const value = formData[field];
    const isUploading = uploadingField === field;

    return (
      <div key={field} className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-900">{label}</p>
            <p className="text-xs text-slate-500">{helper}</p>
          </div>
          {value ? (
            <img
              src={value}
              alt={label}
              className="h-12 w-20 flex-shrink-0 rounded-lg border border-slate-200 object-cover"
            />
          ) : (
            <div className="flex h-12 w-20 flex-shrink-0 items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white">
              <ImageIcon className="h-4 w-4 text-slate-300" />
            </div>
          )}
        </div>

        <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-slate-300 bg-white px-4 py-3 text-sm text-slate-600 transition hover:border-green-400 hover:bg-green-50 hover:text-green-700">
          {isUploading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Enviando...
            </>
          ) : (
            <>
              <UploadCloud className="h-4 w-4" /> Enviar imagem
            </>
          )}
          <input
            type="file"
            accept="image/png,image/jpeg,image/jpg,image/webp"
            className="hidden"
            disabled={isUploading}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onUpload(field, file);
              e.target.value = '';
            }}
          />
        </label>

        <input
          type="url"
          placeholder="Ou cole uma URL de imagem..."
          value={value}
          onChange={(e) => onChange(field, e.target.value)}
          className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-2.5 text-xs text-slate-700 placeholder:text-slate-400 focus:border-green-400 focus:outline-none focus:ring-2 focus:ring-green-100"
        />

        {value && (
          <button
            type="button"
            onClick={() => onChange(field, '')}
            className="mt-1 text-xs text-slate-400 hover:text-rose-500"
          >
            Remover imagem
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-5 flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-blue-600 text-white shadow-md shadow-blue-500/30">
          <ImageIcon className="h-4 w-4" />
        </div>
        <div>
          <h3 className="text-base font-black text-slate-900">Imagens das paginas</h3>
          <p className="text-xs text-slate-500">Personalize as imagens das telas de acesso, Planos e Patrocinadores.</p>
        </div>
      </div>

      <div className="mb-5">
        <div className="mb-3 flex items-center gap-2">
          <div className="h-px flex-1 bg-slate-100" />
          <span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Login e Cadastro</span>
          <div className="h-px flex-1 bg-slate-100" />
        </div>
        <div className="mb-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
          Gere as artes em <span className="font-black">1600 x 2000 px</span> para manter o enquadramento consistente.
          Deixe textos, logos, QR Code e elementos principais dentro da area central para evitar cortes no desktop.
        </div>
        <div className="space-y-3">
          {AUTH_IMAGES.map(({ field, label, helper }) => renderCard(field, label, helper))}
        </div>
      </div>

      <div className="mb-5">
        <div className="mb-3 flex items-center gap-2">
          <div className="h-px flex-1 bg-slate-100" />
          <span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Pagina de Planos</span>
          <div className="h-px flex-1 bg-slate-100" />
        </div>
        <div className="space-y-3">
          {PRICING_IMAGES.map(({ field, label, helper }) => renderCard(field, label, helper))}
        </div>
      </div>

      <div>
        <div className="mb-3 flex items-center gap-2">
          <div className="h-px flex-1 bg-slate-100" />
          <span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Pagina de Patrocinadores</span>
          <div className="h-px flex-1 bg-slate-100" />
        </div>
        <div className="space-y-3">
          {SPONSOR_IMAGES.map(({ field, label, helper }) => renderCard(field, label, helper))}
        </div>
      </div>

      <div className="mt-5">
        <div className="mb-3 flex items-center gap-2">
          <div className="h-px flex-1 bg-slate-100" />
          <span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Compartilhamento</span>
          <div className="h-px flex-1 bg-slate-100" />
        </div>
        <div className="mb-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
          Gere a arte em <span className="font-black">1200 x 630 px</span>, formato <span className="font-black">PNG ou JPG</span>.
          O Facebook e o WhatsApp <span className="font-black">nao exibem imagens SVG</span>.
        </div>
        <div className="space-y-3">
          {SHARE_IMAGES.map(({ field, label, helper }) => renderCard(field, label, helper))}
        </div>
      </div>
    </div>
  );
};

export default LayoutPageImagesSection;
