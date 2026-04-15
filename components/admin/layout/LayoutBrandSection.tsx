import React from 'react';
import { ImageIcon, Loader2, Type, UploadCloud } from 'lucide-react';

type LayoutBrandFormData = {
  siteName: string;
  siteShortName: string;
  siteTagline: string;
  headerBrandText: string;
  footerBrandText: string;
  loginBrandText: string;
  seoTitle: string;
  seoDescription: string;
  logoUrl: string;
  logoLightUrl: string;
  logoDarkUrl: string;
  faviconUrl: string;
  defaultAdImageUrl: string;
};

interface LayoutBrandSectionProps {
  formData: LayoutBrandFormData;
  onChange: (field: keyof LayoutBrandFormData, value: string) => void;
  onUpload: (
    field: 'logoUrl' | 'logoLightUrl' | 'logoDarkUrl' | 'faviconUrl' | 'defaultAdImageUrl',
    file: File,
  ) => Promise<void>;
  uploadingField: 'logoUrl' | 'logoLightUrl' | 'logoDarkUrl' | 'faviconUrl' | 'defaultAdImageUrl' | null;
}

const inputClassName = 'rounded-xl border border-slate-200 px-4 py-3 text-sm';

const uploadTargets: Array<{
  field: 'logoUrl' | 'logoLightUrl' | 'logoDarkUrl' | 'faviconUrl' | 'defaultAdImageUrl';
  label: string;
  helper: string;
  accept: string;
}> = [
  { field: 'logoUrl', label: 'Logo principal', helper: 'Usada na maior parte do site.', accept: 'image/png,image/jpeg,image/jpg,image/webp,image/svg+xml' },
  { field: 'logoLightUrl', label: 'Logo clara', helper: 'Ideal para fundos escuros.', accept: 'image/png,image/jpeg,image/jpg,image/webp,image/svg+xml' },
  { field: 'logoDarkUrl', label: 'Logo escura', helper: 'Ideal para fundos claros.', accept: 'image/png,image/jpeg,image/jpg,image/webp,image/svg+xml' },
  { field: 'faviconUrl', label: 'Favicon', helper: 'Icone da aba do navegador.', accept: 'image/png,image/jpeg,image/jpg,image/webp,image/svg+xml,image/x-icon' },
  { field: 'defaultAdImageUrl', label: 'Imagem padrao dos anuncios', helper: 'Usada quando um anuncio for publicado sem foto.', accept: 'image/png,image/jpeg,image/jpg,image/webp,image/svg+xml' },
];

const LayoutBrandSection: React.FC<LayoutBrandSectionProps> = ({ formData, onChange, onUpload, uploadingField }) => {
  const renderAssetCard = (
    field: 'logoUrl' | 'logoLightUrl' | 'logoDarkUrl' | 'faviconUrl' | 'defaultAdImageUrl',
    label: string,
    helper: string,
    accept: string,
  ) => {
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
            <div className="flex h-14 min-w-[56px] items-center justify-center rounded-xl border border-slate-200 bg-white p-2">
              <img src={value} alt={label} className="max-h-10 max-w-[120px] object-contain" />
            </div>
          ) : (
            <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white text-slate-400">
              <ImageIcon className="h-5 w-5" />
            </div>
          )}
        </div>

        <div className="space-y-3">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
            {isUploading ? 'Enviando...' : 'Selecionar imagem'}
            <input
              type="file"
              accept={accept}
              className="hidden"
              disabled={isUploading}
              onChange={async (e) => {
                const input = e.currentTarget;
                const file = e.target.files?.[0];
                if (!file) return;
                await onUpload(field, file);
                if (input) {
                  input.value = '';
                }
              }}
            />
          </label>
          <input
            className={`${inputClassName} w-full`}
            value={value}
            onChange={(e) => onChange(field, e.target.value)}
            placeholder={`URL da ${label.toLowerCase()}`}
          />
        </div>
      </div>
    );
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6">
      <div className="mb-5 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-50 text-green-700">
          <ImageIcon className="h-5 w-5" strokeWidth={2} />
        </div>
        <div>
          <h3 className="text-lg font-bold text-slate-900">Marca</h3>
          <p className="text-sm text-slate-500">Controle nome, logo, favicon e a imagem padrao dos anuncios.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <input className={inputClassName} value={formData.siteName} onChange={(e) => onChange('siteName', e.target.value)} placeholder="Nome principal do site" />
        <input className={inputClassName} value={formData.siteShortName} onChange={(e) => onChange('siteShortName', e.target.value)} placeholder="Nome curto" />
        <input className={inputClassName} value={formData.headerBrandText} onChange={(e) => onChange('headerBrandText', e.target.value)} placeholder="Texto do header" />
        <input className={inputClassName} value={formData.footerBrandText} onChange={(e) => onChange('footerBrandText', e.target.value)} placeholder="Texto do footer" />
        <input className={inputClassName} value={formData.loginBrandText} onChange={(e) => onChange('loginBrandText', e.target.value)} placeholder="Texto do login" />
        <input className={inputClassName} value={formData.seoTitle} onChange={(e) => onChange('seoTitle', e.target.value)} placeholder="Titulo SEO padrao" />
        <input className={`${inputClassName} md:col-span-2`} value={formData.siteTagline} onChange={(e) => onChange('siteTagline', e.target.value)} placeholder="Slogan / tagline" />
        <textarea className={`${inputClassName} md:col-span-2`} rows={3} value={formData.seoDescription} onChange={(e) => onChange('seoDescription', e.target.value)} placeholder="Descricao SEO padrao" />
      </div>

      <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
        {uploadTargets.map(({ field, label, helper, accept }) => renderAssetCard(field, label, helper, accept))}
      </div>

      <div className="mt-5 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
          <Type className="h-4 w-4" />
          Preview textual da marca
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Header</p>
            <p className="mt-1 text-lg font-black text-slate-900">{formData.headerBrandText || formData.siteName}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Login</p>
            <p className="mt-1 text-lg font-black text-slate-900">{formData.loginBrandText || formData.siteName}</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LayoutBrandSection;
