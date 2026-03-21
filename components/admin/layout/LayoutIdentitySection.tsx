import React from 'react';
import { TypeOutline } from 'lucide-react';

type LayoutIdentityFormData = {
  siteTagline: string;
  headerBrandText: string;
  footerBrandText: string;
  loginBrandText: string;
  seoTitle: string;
  seoDescription: string;
};

interface LayoutIdentitySectionProps {
  formData: LayoutIdentityFormData;
  onChange: (field: keyof LayoutIdentityFormData, value: string) => void;
}

const inputClassName = 'rounded-xl border border-slate-200 px-4 py-3 text-sm';

const LayoutIdentitySection: React.FC<LayoutIdentitySectionProps> = ({ formData, onChange }) => {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6">
      <div className="mb-5 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
          <TypeOutline className="h-5 w-5" strokeWidth={2} />
        </div>
        <div>
          <h3 className="text-lg font-bold text-slate-900">Textos de identidade</h3>
          <p className="text-sm text-slate-500">Controle onde o nome e os textos institucionais aparecem.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <input className={inputClassName} value={formData.headerBrandText} onChange={(e) => onChange('headerBrandText', e.target.value)} placeholder="Texto do header" />
        <input className={inputClassName} value={formData.footerBrandText} onChange={(e) => onChange('footerBrandText', e.target.value)} placeholder="Texto do footer" />
        <input className={inputClassName} value={formData.loginBrandText} onChange={(e) => onChange('loginBrandText', e.target.value)} placeholder="Texto do login" />
        <input className={inputClassName} value={formData.seoTitle} onChange={(e) => onChange('seoTitle', e.target.value)} placeholder="Titulo SEO" />
        <textarea className={`${inputClassName} md:col-span-2`} rows={3} value={formData.siteTagline} onChange={(e) => onChange('siteTagline', e.target.value)} placeholder="Tagline institucional" />
        <textarea className={`${inputClassName} md:col-span-2`} rows={4} value={formData.seoDescription} onChange={(e) => onChange('seoDescription', e.target.value)} placeholder="Descricao padrao para metadata e compartilhamento" />
      </div>
    </div>
  );
};

export default LayoutIdentitySection;
