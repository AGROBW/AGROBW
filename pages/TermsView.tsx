import React, { useState, useEffect, useMemo } from 'react';
import { ArrowUp, ChevronRight, Download, Loader2 } from 'lucide-react';
import { useTermsPage, TERMS_PAGE_FALLBACK } from '../src/hooks/useTermsPage';
import { useLayout } from '../src/contexts/LayoutContext';

const TermsView: React.FC = () => {
  const { content, isLoading } = useTermsPage();
  const { settings } = useLayout();
  const data = content || TERMS_PAGE_FALLBACK;

  const [activeSection, setActiveSection] = useState<string>('');

  const sections = useMemo(
    () => (data.sections || []).filter((section) => section.title.trim()),
    [data.sections],
  );

  useEffect(() => {
    if (!sections.length) {
      setActiveSection('');
      return;
    }

    setActiveSection((current) =>
      sections.some((section) => section.id === current) ? current : sections[0].id,
    );
  }, [sections]);

  useEffect(() => {
    const handleScroll = () => {
      const sectionElements = sections.map((section) => document.getElementById(section.id));
      const scrollPosition = window.scrollY + 200;

      const currentSection = sectionElements.find((section, index) => {
        if (!section) return false;
        const nextSection = sectionElements[index + 1];
        if (nextSection) {
          return scrollPosition >= section.offsetTop && scrollPosition < nextSection.offsetTop;
        }
        return scrollPosition >= section.offsetTop;
      });

      if (currentSection) {
        setActiveSection(currentSection.id);
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [sections]);

  const handlePrint = () => {
    window.print();
  };

  const scrollToSection = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      window.scrollTo({
        top: element.offsetTop - 100,
        behavior: 'smooth',
      });
    }
  };

  if (isLoading) {
    return (
      <div className="bg-gray-50 min-h-screen flex items-center justify-center">
        <Loader2 className="w-12 h-12 animate-spin" style={{ color: settings.primaryColor }} />
      </div>
    );
  }

  return (
    <div className="bg-gray-50 min-h-screen pb-20">
      <section className="bg-white border-b border-slate-100 pt-12 pb-8">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
            <div>
              <span
                className="text-xs font-semibold uppercase tracking-[0.2em] mb-2 block"
                style={{ color: settings.primaryColor }}
              >
                Politicas da Plataforma
              </span>
              <h1 className="text-xl font-semibold text-slate-900">Termos de Uso</h1>
              <p className="text-slate-400 mt-2 text-sm font-medium">
                Ultima atualizacao: <span className="text-slate-600">{data.last_updated_date}</span>
              </p>
            </div>
            <button
              onClick={handlePrint}
              className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 h-9 rounded-lg font-semibold transition-all"
            >
              <Download className="w-4 h-4" strokeWidth={1.5} />
              Baixar Termos (PDF)
            </button>
          </div>
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-4 mt-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <aside className="lg:col-span-4">
            <div className="sticky top-32 space-y-1">
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3 ml-3">
                Neste Documento
              </h3>
              {sections.map((section, index) => (
                <button
                  key={section.id}
                  onClick={() => scrollToSection(section.id)}
                  className={`w-full text-left px-3 py-2.5 rounded-md transition-all duration-200 group flex items-start justify-between gap-3 ${
                    activeSection === section.id
                      ? 'text-slate-800'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                  style={
                    activeSection === section.id
                      ? {
                          backgroundColor: `color-mix(in srgb, ${settings.primaryColor} 8%, white)`,
                        }
                      : undefined
                  }
                >
                  <span className="font-semibold text-[13px] leading-6">
                    {section.title || `${index + 1}. ${section.label}`}
                  </span>
                  <ChevronRight
                    className={`w-3.5 h-3.5 mt-1 transition-transform group-hover:translate-x-1 ${
                      activeSection === section.id ? 'opacity-60' : 'opacity-0'
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
                  Precisa de esclarecimentos?
                </h4>
                <p className="text-xs leading-relaxed mb-6" style={{ color: settings.secondaryColor }}>
                  Nossa equipe juridica e de suporte esta a disposicao para tirar suas duvidas sobre como operamos.
                </p>
                <a
                  href="/contato"
                  className="inline-block bg-white px-4 h-9 leading-9 rounded-lg font-semibold text-xs transition-all"
                  style={{ color: settings.primaryColor }}
                >
                  Central de Atendimento
                </a>
              </div>
            </div>
          </aside>

          <article className="lg:col-span-8 bg-white rounded-xl p-6 md:p-10 border border-slate-100">
            <div className="prose prose-slate max-w-none prose-headings:font-semibold prose-p:text-slate-600 prose-p:leading-relaxed prose-li:text-slate-600 prose-strong:text-slate-900">
              {sections.map((section) => (
                <div key={section.id} id={section.id} className="scroll-mt-32 mb-16 last:mb-0">
                  <h2 className="text-xl font-semibold text-slate-900 mb-4 flex items-center gap-3">
                    <span className="w-1.5 h-6 rounded-full" style={{ backgroundColor: settings.primaryColor }}></span>
                    {section.title}
                  </h2>
                  <div className="text-slate-600 space-y-4 whitespace-pre-line">{section.content}</div>
                </div>
              ))}
            </div>

            <div className="mt-12 pt-8 border-t border-slate-100 text-center">
              <p className="text-slate-400 text-sm italic">
                Ao continuar utilizando a AGRO BW, voce declara estar de acordo com todas as disposições acima.
              </p>
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

export default TermsView;
