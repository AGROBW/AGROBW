import React from 'react';
import { Link } from 'react-router-dom';
import { Facebook, Instagram, Linkedin, Mail, MessageCircle, Music2, Phone, Youtube } from 'lucide-react';
import { useLayout } from '../src/contexts/LayoutContext';

const normalizeExternalUrl = (url?: string | null) => {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
};

const Footer: React.FC = () => {
  const { settings } = useLayout();
  const brandName = settings.footerBrandText || settings.siteName;
  const socialLinks = [
    { label: 'Facebook', href: normalizeExternalUrl(settings.facebookUrl), icon: Facebook },
    { label: 'Instagram', href: normalizeExternalUrl(settings.instagramUrl), icon: Instagram },
    { label: 'YouTube', href: normalizeExternalUrl(settings.youtubeUrl), icon: Youtube },
    { label: 'LinkedIn', href: normalizeExternalUrl(settings.linkedinUrl), icon: Linkedin },
    { label: 'WhatsApp', href: normalizeExternalUrl(settings.whatsappUrl), icon: MessageCircle },
    { label: 'TikTok', href: normalizeExternalUrl(settings.tiktokUrl), icon: Music2 },
  ].filter((item) => Boolean(item.href));

  return (
    <footer className="pb-8 text-slate-300" style={{ backgroundColor: settings.secondaryColor }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="border-t border-white/10 pt-12">
          <div className="mb-12 grid grid-cols-1 gap-8 md:grid-cols-4">
            <div className="col-span-1 md:col-span-1">
              <Link to="/" className="mb-4 flex items-center gap-2">
                {settings.logoLightUrl || settings.logoUrl ? (
                  <img
                    src={settings.logoLightUrl || settings.logoUrl || ''}
                    alt={brandName}
                    className="h-9 w-auto max-w-[170px] object-contain"
                  />
                ) : (
                  <>
                    <div
                      className="flex h-9 w-9 items-center justify-center rounded-lg"
                      style={{ backgroundColor: settings.primaryColor }}
                    >
                      <span className="text-xl font-semibold text-white">
                        {(settings.siteShortName || settings.siteName || 'A').charAt(0)}
                      </span>
                    </div>
                    <span className="text-xl font-semibold tracking-tight text-white">{brandName}</span>
                  </>
                )}
              </Link>

              <p className="mb-6 text-sm leading-relaxed">
                {settings.siteTagline || 'Conectando o campo ao mercado com tecnologia, transparência e as melhores oportunidades para o produtor rural brasileiro.'}
              </p>

              {socialLinks.length > 0 && (
                <div className="flex flex-wrap gap-3">
                  {socialLinks.map(({ label, href, icon: Icon }) => (
                    <a
                      key={label}
                      href={href}
                      target="_blank"
                      rel="noreferrer"
                      className="flex h-9 w-9 items-center justify-center rounded-lg transition-colors hover:bg-white/15"
                      style={{ backgroundColor: 'rgba(255,255,255,0.08)' }}
                    >
                      <span className="sr-only">{label}</span>
                      <Icon className="h-5 w-5" strokeWidth={1.5} />
                    </a>
                  ))}
                </div>
              )}
            </div>

            <div>
              <h4 className="mb-4 font-semibold text-white">Plataforma</h4>
              <ul className="space-y-3 text-sm">
                <li><Link to="/anuncios" className="transition-colors hover:opacity-80" style={{ color: settings.accentColor }}>Todos os anúncios</Link></li>
                <li><Link to="/categorias" className="transition-colors hover:opacity-80" style={{ color: settings.accentColor }}>Categorias</Link></li>
                <li><Link to="/anunciar" className="transition-colors hover:opacity-80" style={{ color: settings.accentColor }}>Anunciar Grátis</Link></li>
                <li><Link to="/planos" className="transition-colors hover:opacity-80" style={{ color: settings.accentColor }}>Planos Premium</Link></li>
              </ul>
            </div>

            <div>
              <h4 className="mb-4 font-semibold text-white">Institucional</h4>
              <ul className="space-y-3 text-sm">
                <li><Link to="/quem-somos" className="transition-colors hover:opacity-80" style={{ color: settings.accentColor }}>Quem Somos</Link></li>
                <li><Link to="/termos-de-uso" className="transition-colors hover:opacity-80" style={{ color: settings.accentColor }}>Termos de Uso</Link></li>
                <li><Link to="/privacidade" className="transition-colors hover:opacity-80" style={{ color: settings.accentColor }}>Privacidade</Link></li>
                <li><Link to="/contato" className="transition-colors hover:opacity-80" style={{ color: settings.accentColor }}>Contato</Link></li>
              </ul>
            </div>

            <div>
              <h4 className="mb-4 font-semibold text-white">Fale Conosco</h4>
              <ul className="space-y-3 text-sm">
                <li className="flex items-center gap-3">
                  <Phone className="h-4 w-4" style={{ color: settings.primaryColor }} strokeWidth={1.5} />
                  0800 123 4567
                </li>
                <li className="flex items-center gap-3">
                  <Mail className="h-4 w-4" style={{ color: settings.primaryColor }} strokeWidth={1.5} />
                  suporte@bwagro.com.br
                </li>
              </ul>

              <div className="mt-8">
                <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-500">Receba novidades</p>
                <div className="flex">
                  <input
                    type="email"
                    placeholder="Seu e-mail"
                    className="h-9 w-full rounded-l-lg border-none px-3 text-sm outline-none"
                    style={{ backgroundColor: 'rgba(255,255,255,0.08)' }}
                  />
                  <button
                    className="h-9 rounded-r-lg px-4 text-sm font-semibold text-white"
                    style={{ backgroundColor: settings.primaryColor }}
                  >
                    Ok
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col items-center justify-between gap-4 border-t border-slate-800 pt-8 md:flex-row">
          <p className="text-xs text-slate-500">
            &copy; 2024 {brandName}. Todos os direitos reservados. CNPJ: 00.000.000/0001-00
          </p>
          <div className="flex gap-6 opacity-50 grayscale">
            <img src="https://upload.wikimedia.org/wikipedia/commons/b/b5/PayPal.svg" alt="PayPal" className="h-4" />
            <img src="https://upload.wikimedia.org/wikipedia/commons/5/5e/Visa_Inc._logo.svg" alt="Visa" className="h-4" />
            <img src="https://upload.wikimedia.org/wikipedia/commons/a/a4/Mastercard_2019_logo.svg" alt="Mastercard" className="h-4" />
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
