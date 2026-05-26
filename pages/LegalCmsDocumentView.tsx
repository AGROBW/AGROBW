import React, { useEffect, useMemo, useState } from 'react';
import { ArrowUp, ChevronRight, Download, Loader2 } from 'lucide-react';
import { Navigate, useLocation, useParams } from 'react-router-dom';
import { usePages, InstitutionalPage } from '../src/hooks/usePages';
import { sanitizeRichTextHtml } from '../src/utils/sanitizeRichTextHtml';
import { useLayout } from '../src/contexts/LayoutContext';

const extractSections = (html: string) => {
  if (typeof window === 'undefined' || typeof DOMParser === 'undefined') {
    return {
      introHtml: '',
      sections: [],
    };
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div>${html}</div>`, 'text/html');
  const root = doc.body.firstElementChild;
  const headings = Array.from(root?.querySelectorAll('h2') || []);

  let introHtml = '';
  let firstHeading = root?.firstElementChild || null;

  while (firstHeading && firstHeading.tagName.toLowerCase() !== 'h2') {
    introHtml += firstHeading.outerHTML;
    firstHeading = firstHeading.nextElementSibling;
  }

  const sections = headings.map((heading, index) => {
    const title = (heading.textContent || '').trim();
    const id = `section-${index + 1}`;

    let htmlContent = '';
    let sibling = heading.nextElementSibling;

    while (sibling && sibling.tagName.toLowerCase() !== 'h2') {
      htmlContent += sibling.outerHTML;
      sibling = sibling.nextElementSibling;
    }

    return {
      id,
      title,
      content: htmlContent.trim(),
    };
  });

  return {
    introHtml: introHtml.trim(),
    sections,
  };
};

const getDocumentPresentation = (slug: string) => {
  if (slug === 'politica-de-cookies') {
    return {
      eyebrow: 'Políticas da Plataforma',
      fallbackTitle: 'Política de Cookies',
      sideTitle: 'Precisa de esclarecimentos?',
      sideText:
        'Nossa equipe pode orientar sobre cookies, sessão, preferências e tecnologias utilizadas no site.',
      sideCta: 'Central de Atendimento',
      footerText:
        'Ao continuar navegando e utilizando recursos essenciais da BWAGRO, você reconhece as regras desta Política.',
      downloadLabel: 'Baixar Política (PDF)',
    };
  }

  return {
    eyebrow: 'Políticas da Plataforma',
    fallbackTitle: 'Política de Preços',
    sideTitle: 'Precisa de apoio comercial?',
    sideText:
      'Nossa equipe pode esclarecer regras de planos, destaques, cancelamento, vigência e reembolso.',
    sideCta: 'Falar com suporte',
    footerText:
      'As condições comerciais aplicáveis devem sempre ser lidas em conjunto com a oferta vigente no momento da contratação.',
    downloadLabel: 'Baixar Política (PDF)',
  };
};

const LegalCmsDocumentView: React.FC = () => {
  const { slug: routeSlug } = useParams<{ slug: string }>();
  const location = useLocation();
  const { settings } = useLayout();
  const { getPageBySlug } = usePages();

  const slug = useMemo(() => {
    if (routeSlug) return routeSlug;
    if (location.pathname === '/politica-de-cookies') return 'politica-de-cookies';
    if (location.pathname === '/politica-de-precos') return 'politica-de-precos';
    return '';
  }, [location.pathname, routeSlug]);

  const [page, setPage] = useState<InstitutionalPage | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [activeSection, setActiveSection] = useState<string>('');

  useEffect(() => {
    let cancelled = false;

    const fetchPage = async () => {
      if (!slug) {
        setNotFound(true);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setNotFound(false);

      const data = await getPageBySlug(slug);

      if (cancelled) return;

      if (!data) {
        setNotFound(true);
        setPage(null);
      } else {
        setPage(data);
      }

      setIsLoading(false);
    };

    void fetchPage();

    return () => {
      cancelled = true;
    };
  }, [getPageBySlug, slug]);

  const sanitizedContent = useMemo(
    () => sanitizeRichTextHtml(page?.content || ''),
    [page?.content],
  );

  const { introHtml, sections } = useMemo(() => extractSections(sanitizedContent), [sanitizedContent]);
  const presentation = useMemo(() => getDocumentPresentation(slug), [slug]);

  useEffect(() => {
    const handleScroll = () => {
      const sectionElements = sections.map((section) => document.getElementById(section.id));
      const scrollPosition = window.scrollY + 200;

      const currentSection = sectionElements.find((sectionElement, index) => {
        if (!sectionElement) return false;
        const nextSection = sectionElements[index + 1];
        if (nextSection) {
          return scrollPosition >= sectionElement.offsetTop && scrollPosition < nextSection.offsetTop;
        }
        return scrollPosition >= sectionElement.offsetTop;
      });

      if (currentSection) {
        setActiveSection(currentSection.id);
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [sections]);

  const scrollToSection = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      window.scrollTo({
        top: element.offsetTop - 100,
        behavior: 'smooth',
      });
    }
  };

  const handlePrint = () => {
    window.print();
  };

  if (isLoading) {
    return (
      <div className="bg-gray-50 min-h-screen flex items-center justify-center">
        <Loader2 className="w-12 h-12 animate-spin" style={{ color: settings.primaryColor }} />
      </div>
    );
  }

  if (notFound || !page) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="bg-gray-50 min-h-screen pb-20">
      <section className="bg-white border-b border-slate-100 pt-12 pb-8">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
            <div>
              <span className="text-xs font-semibold uppercase tracking-[0.2em] mb-2 block" style={{ color: settings.primaryColor }}>
                {presentation.eyebrow}
              </span>
              <h1 className="text-xl font-semibold text-slate-900">{page.title || presentation.fallbackTitle}</h1>
              <p className="text-slate-400 mt-2 text-sm font-medium">
                Última atualização:{' '}
                <span className="text-slate-600">
                  {new Date(page.updated_at).toLocaleDateString('pt-BR', {
                    day: '2-digit',
                    month: 'long',
                    year: 'numeric',
                  })}
                </span>
              </p>
            </div>
            <button
              onClick={handlePrint}
              className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 h-9 rounded-lg font-semibold transition-all"
            >
              <Download className="w-4 h-4" strokeWidth={1.5} />
              {presentation.downloadLabel}
            </button>
          </div>
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-4 mt-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <aside className="lg:col-span-4">
            <div className="sticky top-32 space-y-2">
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-4 ml-4">Neste Documento</h3>
              {sections.map((section) => (
                <button
                  key={section.id}
                  onClick={() => scrollToSection(section.id)}
                  className={`w-full text-left px-4 py-3 rounded-lg transition-all duration-300 group flex items-center justify-between ${
                    activeSection === section.id
                      ? 'text-white translate-x-1'
                      : 'hover:bg-white text-slate-500 hover:text-slate-800'
                  }`}
                  style={activeSection === section.id ? { backgroundColor: settings.primaryColor } : undefined}
                >
                  <span className="font-semibold text-sm">{section.title}</span>
                  <ChevronRight
                    className={`w-4 h-4 transition-transform group-hover:translate-x-1 ${
                      activeSection === section.id ? 'opacity-100' : 'opacity-0'
                    }`}
                    strokeWidth={1.5}
                  />
                </button>
              ))}

              <div
                className="mt-8 p-5 rounded-xl border"
                style={{
                  backgroundColor: `color-mix(in srgb, ${settings.primaryColor} 8%, white)`,
                  borderColor: `color-mix(in srgb, ${settings.primaryColor} 18%, white)`,
                }}
              >
                <h4 className="font-semibold mb-3 text-sm" style={{ color: settings.textColor }}>
                  {presentation.sideTitle}
                </h4>
                <p className="text-xs leading-relaxed mb-6" style={{ color: settings.secondaryColor }}>
                  {presentation.sideText}
                </p>
                <a
                  href="/contato"
                  className="inline-block bg-white px-4 h-9 leading-9 rounded-lg font-semibold text-xs transition-all"
                  style={{ color: settings.primaryColor }}
                >
                  {presentation.sideCta}
                </a>
              </div>
            </div>
          </aside>

          <article className="lg:col-span-8 bg-white rounded-xl p-6 md:p-10 border border-slate-100">
            <div className="prose prose-slate max-w-none prose-headings:font-semibold prose-p:text-slate-600 prose-p:leading-relaxed prose-li:text-slate-600 prose-strong:text-slate-900">
              {introHtml ? (
                <div
                  className="mb-10 text-slate-600 space-y-4"
                  dangerouslySetInnerHTML={{ __html: introHtml }}
                />
              ) : null}

              {sections.map((section) => (
                <div key={section.id} id={section.id} className="scroll-mt-32 mb-16 last:mb-0">
                  <h2 className="text-xl font-semibold text-slate-900 mb-4 flex items-center gap-3">
                    <span className="w-1.5 h-6 rounded-full" style={{ backgroundColor: settings.primaryColor }}></span>
                    {section.title}
                  </h2>
                  <div
                    className="text-slate-600 space-y-4"
                    dangerouslySetInnerHTML={{ __html: section.content }}
                  />
                </div>
              ))}
            </div>

            <div className="mt-12 pt-8 border-t border-slate-100 text-center">
              <p className="text-slate-400 text-sm italic">{presentation.footerText}</p>
            </div>
          </article>
        </div>
      </section>

      <button
        onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        className="fixed bottom-6 right-6 w-10 h-10 bg-white text-slate-900 rounded-lg border border-slate-100 flex items-center justify-center transition-all z-50 group"
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = settings.primaryColor;
          e.currentTarget.style.color = '#ffffff';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = '#ffffff';
          e.currentTarget.style.color = '';
        }}
      >
        <ArrowUp className="w-4 h-4 group-hover:-translate-y-1 transition-transform" strokeWidth={1.5} />
      </button>
    </div>
  );
};

export default LegalCmsDocumentView;
