import React from 'react';
import { Link } from 'react-router-dom';
import { Facebook, Instagram, Mail, Phone } from 'lucide-react';
import { useLayout } from '../src/contexts/LayoutContext';

const Footer: React.FC = () => {
  const { settings } = useLayout();
  const brandName = settings.footerBrandText || settings.siteName;

  return (
    <footer className="pt-16 pb-8 text-slate-300" style={{ backgroundColor: settings.secondaryColor }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-12">
          <div className="col-span-1 md:col-span-1">
            <Link to="/" className="flex items-center gap-2 mb-4">
              {settings.logoLightUrl || settings.logoUrl ? (
                <img
                  src={settings.logoLightUrl || settings.logoUrl || ''}
                  alt={brandName}
                  className="h-9 w-auto max-w-[170px] object-contain"
                />
              ) : (
                <>
                  <div
                    className="w-9 h-9 rounded-lg flex items-center justify-center"
                    style={{ backgroundColor: settings.primaryColor }}
                  >
                    <span className="text-white text-xl font-semibold">
                      {(settings.siteShortName || settings.siteName || 'B').charAt(0)}
                    </span>
                  </div>
                  <span className="text-xl font-semibold tracking-tight text-white">{brandName}</span>
                </>
              )}
            </Link>

            <p className="text-sm leading-relaxed mb-6">
              {settings.siteTagline || 'Conectando o campo ao mercado com tecnologia, transparencia e as melhores oportunidades para o produtor rural brasileiro.'}
            </p>

            <div className="flex space-x-4">
              <a
                href="#"
                className="w-9 h-9 rounded-lg flex items-center justify-center transition-colors"
                style={{ backgroundColor: 'rgba(255,255,255,0.08)' }}
              >
                <span className="sr-only">Facebook</span>
                <Facebook className="h-5 w-5" strokeWidth={1.5} />
              </a>
              <a
                href="#"
                className="w-9 h-9 rounded-lg flex items-center justify-center transition-colors"
                style={{ backgroundColor: 'rgba(255,255,255,0.08)' }}
              >
                <span className="sr-only">Instagram</span>
                <Instagram className="h-5 w-5" strokeWidth={1.5} />
              </a>
            </div>
          </div>

          <div>
            <h4 className="text-white font-semibold mb-4">Plataforma</h4>
            <ul className="space-y-3 text-sm">
              <li><Link to="/anuncios" className="transition-colors hover:opacity-80" style={{ color: settings.accentColor }}>Todos os anuncios</Link></li>
              <li><Link to="/categorias" className="transition-colors hover:opacity-80" style={{ color: settings.accentColor }}>Categorias</Link></li>
              <li><Link to="/anunciar" className="transition-colors hover:opacity-80" style={{ color: settings.accentColor }}>Anunciar Gratis</Link></li>
              <li><Link to="/planos" className="transition-colors hover:opacity-80" style={{ color: settings.accentColor }}>Planos Premium</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="text-white font-semibold mb-4">Institucional</h4>
            <ul className="space-y-3 text-sm">
              <li><Link to="/quem-somos" className="transition-colors hover:opacity-80" style={{ color: settings.accentColor }}>Quem Somos</Link></li>
              <li><Link to="/termos-de-uso" className="transition-colors hover:opacity-80" style={{ color: settings.accentColor }}>Termos de Uso</Link></li>
              <li><Link to="/privacidade" className="transition-colors hover:opacity-80" style={{ color: settings.accentColor }}>Privacidade</Link></li>
              <li><Link to="/contato" className="transition-colors hover:opacity-80" style={{ color: settings.accentColor }}>Contato</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="text-white font-semibold mb-4">Fale Conosco</h4>
            <ul className="space-y-3 text-sm">
              <li className="flex items-center gap-3">
                <Phone className="w-4 h-4" style={{ color: settings.primaryColor }} strokeWidth={1.5} />
                0800 123 4567
              </li>
              <li className="flex items-center gap-3">
                <Mail className="w-4 h-4" style={{ color: settings.primaryColor }} strokeWidth={1.5} />
                suporte@bwagro.com.br
              </li>
            </ul>

            <div className="mt-8">
              <p className="text-xs text-slate-500 uppercase tracking-widest font-semibold mb-3">Receba novidades</p>
              <div className="flex">
                <input
                  type="email"
                  placeholder="Seu e-mail"
                  className="border-none rounded-l-lg px-3 h-9 text-sm w-full outline-none"
                  style={{ backgroundColor: 'rgba(255,255,255,0.08)' }}
                />
                <button className="text-white px-4 h-9 rounded-r-lg text-sm font-semibold" style={{ backgroundColor: settings.primaryColor }}>
                  Ok
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="pt-8 border-t border-slate-800 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-xs text-slate-500">
            &copy; 2024 {brandName}. Todos os direitos reservados. CNPJ: 00.000.000/0001-00
          </p>
          <div className="flex gap-6 grayscale opacity-50">
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
