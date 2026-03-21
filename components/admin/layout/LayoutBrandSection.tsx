import React from 'react';
import { ImageIcon, Type } from 'lucide-react';

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
};

interface LayoutBrandSectionProps {
  formData: LayoutBrandFormData;
  onChange: (field: keyof LayoutBrandFormData, value: string) => void;
}

const inputClassName = 'rounded-xl border border-slate-200 px-4 py-3 text-sm';

const LayoutBrandSection: React.FC<LayoutBrandSectionProps> = ({ formData, onChange }) => {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6">
      <div className="mb-5 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-50 text-green-700">
          <ImageIcon className="h-5 w-5" strokeWidth={2} />
        </div>
        <div>
          <h3 className="text-lg font-bold text-slate-900">Marca</h3>
          <p className="text-sm text-slate-500">Controle nome, logo e favicon usados pela plataforma.</p>
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
        <input className={`${inputClassName} md:col-span-2`} value={formData.logoUrl} onChange={(e) => onChange('logoUrl', e.target.value)} placeholder="URL da logo principal" />
        <input className={inputClassName} value={formData.logoLightUrl} onChange={(e) => onChange('logoLightUrl', e.target.value)} placeholder="URL da logo clara" />
        <input className={inputClassName} value={formData.logoDarkUrl} onChange={(e) => onChange('logoDarkUrl', e.target.value)} placeholder="URL da logo escura" />
        <input className={`${inputClassName} md:col-span-2`} value={formData.faviconUrl} onChange={(e) => onChange('faviconUrl', e.target.value)} placeholder="URL do favicon" />
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
