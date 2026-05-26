import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Facebook, Instagram, Linkedin, Mail, MessageCircle, Music2, Phone, Youtube } from 'lucide-react';
import { toast } from 'sonner';
import { useLayout } from '../src/contexts/LayoutContext';
import { supabase } from '../src/lib/supabaseClient';

const normalizeExternalUrl = (url?: string | null) => {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
};

const normalizeWhatsAppUrl = (url?: string | null) => {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;

  const digitsOnly = trimmed.replace(/\D/g, '');
  if (digitsOnly.length >= 10 && digitsOnly.length <= 15 && !/[a-z]/i.test(trimmed)) {
    return `https://wa.me/${digitsOnly}`;
  }

  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
};

const Footer: React.FC = () => {
  const { settings } = useLayout();
  const [newsletterEmail, setNewsletterEmail] = useState('');
  const [isSubmittingNewsletter, setIsSubmittingNewsletter] = useState(false);
  const brandName = settings.footerBrandText || settings.siteName;

  const socialLinks = [
    { label: 'Facebook', href: normalizeExternalUrl(settings.facebookUrl), icon: Facebook },
    { label: 'Instagram', href: normalizeExternalUrl(settings.instagramUrl), icon: Instagram },
    { label: 'YouTube', href: normalizeExternalUrl(settings.youtubeUrl), icon: Youtube },
    { label: 'LinkedIn', href: normalizeExternalUrl(settings.linkedinUrl), icon: Linkedin },
    { label: 'WhatsApp', href: normalizeWhatsAppUrl(settings.whatsappUrl), icon: MessageCircle },
    { label: 'TikTok', href: normalizeExternalUrl(settings.tiktokUrl), icon: Music2 },
  ].filter((item) => Boolean(item.href));

  const handleNewsletterSubmit = async () => {
    const email = newsletterEmail.trim().toLowerCase();

    if (!email) {
      toast.error('Digite seu e-mail para receber novidades.');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      toast.error('Digite um e-mail valido.');
      return;
    }

    try {
      setIsSubmittingNewsletter(true);

      const { data, error } = await supabase.rpc('subscribe_newsletter', {
        p_email: email,
        p_source: 'footer',
      });

      if (error) {
        throw error;
      }

      if (data === 'existing') {
        toast.success('Este e-mail ja esta cadastrado para receber novidades.');
      } else {
        toast.success('Cadastro realizado com sucesso. Voce vai receber nossas novidades.');
      }

      setNewsletterEmail('');
    } catch (error) {
      console.error('[Footer] Erro ao cadastrar e-mail na newsletter:', error);
      toast.error('Nao foi possivel cadastrar seu e-mail agora. Tente novamente.');
    } finally {
      setIsSubmittingNewsletter(false);
    }
  };

  return (
    <footer className="pb-8 text-slate-300" style={{ backgroundColor: settings.secondaryColor }}>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
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
                {settings.siteTagline ||
                  'Conectando o campo ao mercado com tecnologia, transparencia e as melhores oportunidades para o produtor rural brasileiro.'}
              </p>

              {socialLinks.length > 0 ? (
                <div className="flex flex-wrap gap-3">
                  {socialLinks.map(({ label, href, icon: Icon }) => (
                    <a
                      key={label}
                      href={href || undefined}
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
              ) : null}
            </div>

            <div>
              <h4 className="mb-4 font-semibold text-white">Plataforma</h4>
              <ul className="space-y-3 text-sm">
                <li>
                  <Link to="/categorias" className="transition-colors hover:opacity-80" style={{ color: settings.accentColor }}>
                    Categorias
                  </Link>
                </li>
                <li>
                  <Link to="/anunciar" className="transition-colors hover:opacity-80" style={{ color: settings.accentColor }}>
                    Anunciar Gratis
                  </Link>
                </li>
                <li>
                  <Link to="/planos" className="transition-colors hover:opacity-80" style={{ color: settings.accentColor }}>
                    Planos Premium
                  </Link>
                </li>
                <li>
                  <Link to="/anuncios" className="transition-colors hover:opacity-80" style={{ color: settings.accentColor }}>
                    Todos os anuncios
                  </Link>
                </li>
              </ul>
            </div>

            <div>
              <h4 className="mb-4 font-semibold text-white">Institucional</h4>
              <ul className="space-y-3 text-sm">
                <li>
                  <Link to="/quem-somos" className="transition-colors hover:opacity-80" style={{ color: settings.accentColor }}>
                    Quem Somos
                  </Link>
                </li>
                <li>
                  <Link to="/termos-de-uso" className="transition-colors hover:opacity-80" style={{ color: settings.accentColor }}>
                    Termos de Uso
                  </Link>
                </li>
                <li>
                  <Link to="/privacidade" className="transition-colors hover:opacity-80" style={{ color: settings.accentColor }}>
                    Privacidade
                  </Link>
                </li>
                <li>
                  <Link to="/politica-de-cookies" className="transition-colors hover:opacity-80" style={{ color: settings.accentColor }}>
                    Politica de Cookies
                  </Link>
                </li>
                <li>
                  <Link to="/politica-de-precos" className="transition-colors hover:opacity-80" style={{ color: settings.accentColor }}>
                    Politica de Precos
                  </Link>
                </li>
                <li>
                  <Link to="/contato" className="transition-colors hover:opacity-80" style={{ color: settings.accentColor }}>
                    Contato
                  </Link>
                </li>
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
                    value={newsletterEmail}
                    onChange={(event) => setNewsletterEmail(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        void handleNewsletterSubmit();
                      }
                    }}
                    className="h-9 w-full rounded-l-lg border-none px-3 text-sm outline-none"
                    style={{ backgroundColor: 'rgba(255,255,255,0.08)' }}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      void handleNewsletterSubmit();
                    }}
                    disabled={isSubmittingNewsletter}
                    className="h-9 rounded-r-lg px-4 text-sm font-semibold text-white"
                    style={{ backgroundColor: settings.primaryColor }}
                  >
                    {isSubmittingNewsletter ? '...' : 'Ok'}
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
          <div className="flex flex-wrap items-center gap-2">

              {/* Visa */}
              <div className="inline-flex h-8 items-center rounded-md px-3"
                style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', backdropFilter: 'blur(6px)' }}>
                <svg viewBox="0 0 780 500" aria-label="Visa" className="h-4 w-auto" style={{ width: 38 }}>
                  <rect width="780" height="500" fill="transparent"/>
                  <path d="M293.2 348.7l33.4-195.6h53.4L346.6 348.7H293.2z" fill="#fff"/>
                  <path d="M518.6 157.3c-10.6-4-27.2-8.3-47.9-8.3-52.8 0-90 26.5-90.3 64.5-.3 28.1 26.6 43.7 46.9 53.1 20.8 9.6 27.8 15.7 27.7 24.3-.1 13.1-16.6 19.1-32 19.1-21.4 0-32.8-3-50.4-10.5l-6.9-3.1-7.5 43.6c12.5 5.4 35.6 10.2 59.5 10.4 56.2 0 92.6-26.2 93-66.8.2-22.2-14-39.2-44.8-53.2-18.7-9.1-30.1-15.1-30-24.3 0-8.1 9.7-16.9 30.5-16.9 17.5-.3 30.1 3.5 40 7.4l4.8 2.3 7.4-42.6z" fill="#fff"/>
                  <path d="M615.8 153.1h-41.3c-12.8 0-22.3 3.5-27.9 16.2l-79.2 178.4h56l11.2-29.3 68.3.1c1.6 6.8 6.5 29.2 6.5 29.2h49.6l-43.2-194.6zm-65.7 124.3c4.4-11.2 21.2-54.4 21.2-54.4-.3.5 4.4-11.3 7-18.5l3.6 16.7s10.1 46.2 12.2 56.2h-44z" fill="#fff"/>
                  <path d="M236.7 153.1l-52.3 133.5-5.6-27c-9.7-31.2-40-65-73.9-81.9l47.9 171h56.5l84-195.6h-56.6z" fill="#fff"/>
                  <path d="M131.7 153.1H44.1l-.7 4c68.1 16.5 113.2 56.3 131.9 104.1l-19-91.2c-3.3-12.6-12.7-16.5-24.6-16.9z" fill="#F9A533"/>
                </svg>
              </div>

              {/* Mastercard */}
              <div className="inline-flex h-8 items-center gap-1.5 rounded-md px-2.5"
                style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', backdropFilter: 'blur(6px)' }}>
                <div className="relative h-5 w-8 flex-shrink-0">
                  <span className="absolute left-0 top-0 h-5 w-5 rounded-full" style={{ background: '#EB001B' }} />
                  <span className="absolute right-0 top-0 h-5 w-5 rounded-full" style={{ background: '#F79E1B', opacity: 0.95 }} />
                  <span className="absolute left-1/2 top-0 h-5 w-2.5 -translate-x-1/2 rounded-sm" style={{ background: 'linear-gradient(to right, #FF5F00, #FF5F00)', mixBlendMode: 'multiply', opacity: 0.9 }} />
                </div>
                <span className="text-xs font-bold tracking-tight text-white/90" style={{ fontFamily: 'Arial, sans-serif', letterSpacing: '-0.02em' }}>mastercard</span>
              </div>

              {/* Pix */}
              <div className="inline-flex h-8 items-center gap-1.5 rounded-md px-2.5"
                style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', backdropFilter: 'blur(6px)' }}>
                <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 flex-shrink-0" fill="none">
                  <path
                    d="M9.2 3.8 12 6.6l2.8-2.8a2.2 2.2 0 0 1 3.1 0l2.3 2.3a2.2 2.2 0 0 1 0 3.1L17.4 12l2.8 2.8a2.2 2.2 0 0 1 0 3.1l-2.3 2.3a2.2 2.2 0 0 1-3.1 0L12 17.4l-2.8 2.8a2.2 2.2 0 0 1-3.1 0l-2.3-2.3a2.2 2.2 0 0 1 0-3.1L6.6 12 3.8 9.2a2.2 2.2 0 0 1 0-3.1l2.3-2.3a2.2 2.2 0 0 1 3.1 0Z"
                    fill="#32BCAD"
                    strokeWidth="0"
                  />
                </svg>
                <span className="text-xs font-bold tracking-tight" style={{ color: '#32BCAD' }}>Pix</span>
              </div>

              {/* Boleto */}
              <div className="inline-flex h-8 items-center gap-1.5 rounded-md px-2.5"
                style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', backdropFilter: 'blur(6px)' }}>
                <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 flex-shrink-0" fill="none">
                  <rect x="2" y="4" width="2.5" height="16" fill="white" rx="0.5"/>
                  <rect x="5.5" y="4" width="1" height="16" fill="white" rx="0.5"/>
                  <rect x="7.5" y="4" width="2" height="16" fill="white" rx="0.5"/>
                  <rect x="10.5" y="4" width="1" height="16" fill="white" rx="0.5"/>
                  <rect x="12.5" y="4" width="2.5" height="16" fill="white" rx="0.5"/>
                  <rect x="16" y="4" width="1" height="16" fill="white" rx="0.5"/>
                  <rect x="18" y="4" width="2" height="16" fill="white" rx="0.5"/>
                  <rect x="21" y="4" width="1" height="16" fill="white" rx="0.5"/>
                </svg>
                <span className="text-xs font-bold tracking-tight text-white/90">Boleto</span>
              </div>

            </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
