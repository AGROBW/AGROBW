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
          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex h-9 items-center rounded-full border border-white/10 bg-white/5 px-3">
              <span className="text-sm font-black italic tracking-tight text-[#1A1F71]">VISA</span>
            </div>

            <div className="inline-flex h-9 items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3">
              <div className="relative h-4 w-7">
                <span className="absolute left-0 top-0 h-4 w-4 rounded-full bg-[#EB001B] opacity-95" />
                <span className="absolute right-0 top-0 h-4 w-4 rounded-full bg-[#F79E1B] opacity-95" />
              </div>
              <span className="text-sm font-black tracking-tight text-white">mastercard</span>
            </div>

            <div className="inline-flex h-9 items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3">
              <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 text-[#32BCAD]" fill="none">
                <path
                  d="M9.2 3.8 12 6.6l2.8-2.8a2.2 2.2 0 0 1 3.1 0l2.3 2.3a2.2 2.2 0 0 1 0 3.1L17.4 12l2.8 2.8a2.2 2.2 0 0 1 0 3.1l-2.3 2.3a2.2 2.2 0 0 1-3.1 0L12 17.4l-2.8 2.8a2.2 2.2 0 0 1-3.1 0l-2.3-2.3a2.2 2.2 0 0 1 0-3.1L6.6 12 3.8 9.2a2.2 2.2 0 0 1 0-3.1l2.3-2.3a2.2 2.2 0 0 1 3.1 0Z"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinejoin="round"
                />
              </svg>
              <span className="text-sm font-black tracking-tight text-[#32BCAD]">Pix</span>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
