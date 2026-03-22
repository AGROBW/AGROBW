import React from 'react';
import { Facebook, Instagram, Linkedin, MessageCircle, Music2, Youtube } from 'lucide-react';

type LayoutSocialLinksFormData = {
  facebookUrl: string;
  instagramUrl: string;
  youtubeUrl: string;
  linkedinUrl: string;
  whatsappUrl: string;
  tiktokUrl: string;
};

interface LayoutSocialLinksSectionProps {
  formData: LayoutSocialLinksFormData;
  onChange: (field: keyof LayoutSocialLinksFormData, value: string) => void;
}

const inputClassName = 'w-full rounded-xl border border-slate-200 px-4 py-3 text-sm';

const socials = [
  { field: 'facebookUrl', label: 'Facebook', placeholder: 'https://facebook.com/sua-pagina', icon: Facebook },
  { field: 'instagramUrl', label: 'Instagram', placeholder: 'https://instagram.com/seu-perfil', icon: Instagram },
  { field: 'youtubeUrl', label: 'YouTube', placeholder: 'https://youtube.com/@seucanal', icon: Youtube },
  { field: 'linkedinUrl', label: 'LinkedIn', placeholder: 'https://linkedin.com/company/sua-marca', icon: Linkedin },
  { field: 'whatsappUrl', label: 'WhatsApp', placeholder: 'https://wa.me/5562999999999', icon: MessageCircle },
  { field: 'tiktokUrl', label: 'TikTok', placeholder: 'https://tiktok.com/@seuperfil', icon: Music2 },
] as const;

const LayoutSocialLinksSection: React.FC<LayoutSocialLinksSectionProps> = ({ formData, onChange }) => {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6">
      <div className="mb-5">
        <h3 className="text-lg font-bold text-slate-900">Redes sociais</h3>
        <p className="text-sm text-slate-500">Controle os ícones exibidos no rodapé. Campos vazios não serão mostrados.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {socials.map(({ field, label, placeholder, icon: Icon }) => (
          <label key={field} className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
            <span className="mb-3 inline-flex items-center gap-3 text-sm font-medium text-slate-700">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-slate-600 shadow-sm">
                <Icon className="h-4 w-4" strokeWidth={1.8} />
              </span>
              {label}
            </span>
            <input
              className={inputClassName}
              value={formData[field]}
              onChange={(e) => onChange(field, e.target.value)}
              placeholder={placeholder}
            />
          </label>
        ))}
      </div>
    </div>
  );
};

export default LayoutSocialLinksSection;
