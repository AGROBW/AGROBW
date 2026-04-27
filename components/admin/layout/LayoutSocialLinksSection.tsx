import React from 'react';
import { Facebook, Instagram, Linkedin, MessageCircle, Music2, Youtube } from 'lucide-react';

type LayoutSocialLinksFormData = {
  facebookUrl: string;
  instagramUrl: string;
  youtubeUrl: string;
  linkedinUrl: string;
  whatsappUrl: string;
  commercialWhatsappNumber: string;
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
      <div className="mb-6">
        <h3 className="text-lg font-bold text-slate-900">Redes sociais</h3>
        <p className="text-sm text-slate-500">
          Separe o contato comercial usado na landing de Patrocinador das redes exibidas no rodapé.
        </p>
      </div>

      <div className="mb-6 rounded-2xl border border-emerald-100 bg-emerald-50/70 p-5">
        <div className="mb-4">
          <p className="text-[11px] font-black uppercase tracking-[0.2em] text-emerald-700">Contato comercial</p>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            Este bloco é usado para abrir a conversa da landing de Patrocinador e em outros fluxos comerciais diretos.
          </p>
        </div>

        <label className="block">
          <span className="mb-3 inline-flex items-center gap-3 text-sm font-medium text-slate-700">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-emerald-600 shadow-sm">
              <MessageCircle className="h-4 w-4" strokeWidth={1.8} />
            </span>
            WhatsApp comercial
          </span>
          <input
            className={inputClassName}
            value={formData.commercialWhatsappNumber}
            onChange={(e) => onChange('commercialWhatsappNumber', e.target.value)}
            placeholder="5562999999999"
          />
          <p className="mt-2 text-xs leading-5 text-slate-500">
            Informe com DDI e DDD. Exemplo: 5562999999999.
          </p>
        </label>
      </div>

      <div className="mb-4">
        <p className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">Redes exibidas no rodapé</p>
        <p className="mt-1 text-sm leading-6 text-slate-500">
          Esses links controlam os ícones públicos do site. Campos vazios não serão mostrados.
        </p>
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
            {field === 'whatsappUrl' ? (
              <p className="mt-2 text-xs leading-5 text-slate-500">
                Use apenas um número válido ou link oficial do WhatsApp. Este campo serve como apoio e compatibilidade.
              </p>
            ) : null}
          </label>
        ))}
      </div>
    </div>
  );
};

export default LayoutSocialLinksSection;
