
import React, { useState, useEffect, useMemo } from 'react';
import { ArrowRight, ArrowUp, ChevronDown, ChevronRight, Info, Loader2 } from 'lucide-react';
import { usePrivacyPage, PRIVACY_PAGE_FALLBACK } from '../src/hooks/usePrivacyPage';

const PrivacyView: React.FC = () => {
  const { content, isLoading } = usePrivacyPage();
  const data = content || PRIVACY_PAGE_FALLBACK;

  const [activeSection, setActiveSection] = useState<string>('');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Criar array de seções a partir dos dados estruturados do banco
  const sections = useMemo(() => [
    { id: 'section1', title: data.section1_title, content: data.section1_content },
    { id: 'section2', title: data.section2_title, content: data.section2_content },
    { id: 'section3', title: data.section3_title, content: data.section3_content },
    { id: 'section4', title: data.section4_title, content: data.section4_content },
    { id: 'section5', title: data.section5_title, content: data.section5_content },
    { id: 'section6', title: data.section6_title, content: data.section6_content },
  ], [data]);

  useEffect(() => {
    const handleScroll = () => {
      const sectionElements = sections.map(s => document.getElementById(s.id));
      const scrollPosition = window.scrollY + 200;

      const currentSection = sections.find((section, index) => {
        const currentElement = section ? document.getElementById(section.id) : null;
        if (!currentElement) return false;
        const nextSection = sections[index + 1];
        const nextElement = nextSection ? document.getElementById(nextSection.id) : null;
        if (nextSection) {
          return scrollPosition >= currentElement.offsetTop && (!nextElement || scrollPosition < nextElement.offsetTop);
        }
        return scrollPosition >= currentElement.offsetTop;
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
        behavior: 'smooth'
      });
      setIsMobileMenuOpen(false);
    }
  };

  if (isLoading) {
    return (
      <div className="bg-gray-50 min-h-screen flex items-center justify-center">
        <Loader2 className="w-12 h-12 text-green-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="bg-gray-50 min-h-screen pb-20">
      {/* Page Header */}
      <section className="bg-white border-b border-slate-100 pt-12 pb-8">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
            <div className="max-w-3xl">
              <span className="text-green-700 text-xs font-semibold uppercase tracking-[0.2em] mb-2 block">Transparência & Segurança</span>
              <h1 className="text-xl font-semibold text-slate-900">Política de Privacidade</h1>
              <p className="text-slate-500 mt-3 text-sm font-medium leading-relaxed">
                Sua privacidade é prioridade. Esta política explica como coletamos, usamos e protegemos seus dados pessoais conforme a LGPD.
              </p>
              <p className="text-slate-400 mt-3 text-xs font-semibold uppercase tracking-wider">
                Última atualização: <span className="text-slate-600">{data.last_updated_date}</span>
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Mobile Sticky Navigation */}
      <div className="lg:hidden sticky top-20 z-40 bg-white border-b border-slate-100">
        <button 
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className="w-full flex items-center justify-between px-4 py-3 text-slate-700 font-semibold"
        >
          <span>Navegar Tópicos</span>
          <ChevronDown className={`w-5 h-5 transition-transform ${isMobileMenuOpen ? 'rotate-180' : ''}`} strokeWidth={1.5} />
        </button>
        {isMobileMenuOpen && (
          <div className="bg-white border-t border-slate-100 px-4 py-3 space-y-1">
            {sections.map(section => (
              <button 
                key={section.id}
                onClick={() => scrollToSection(section.id)}
                className={`w-full text-left px-4 py-2 rounded-lg text-sm font-semibold ${activeSection === section.id ? 'bg-green-50 text-green-700' : 'text-slate-500'}`}
              >
                {section.title}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Main Content Grid */}
      <section className="max-w-7xl mx-auto px-4 mt-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* Column 1: Sticky Navigation Index (Desktop) */}
          <aside className="hidden lg:block lg:col-span-4">
            <div className="sticky top-32 space-y-2">
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-4 ml-4">Índice de Privacidade</h3>
              {sections.map((section) => (
                <button
                  key={section.id}
                  onClick={() => scrollToSection(section.id)}
                  className={`w-full text-left px-4 py-3 rounded-lg transition-all duration-300 group flex items-center justify-between ${
                    activeSection === section.id 
                    ? 'bg-green-700 text-white translate-x-1' 
                    : 'hover:bg-white text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <span className="font-semibold text-sm">{section.title}</span>
                  <ChevronRight className={`w-4 h-4 transition-transform group-hover:translate-x-1 ${activeSection === section.id ? 'opacity-100' : 'opacity-0'}`} strokeWidth={1.5} />
                </button>
              ))}
              
              <div className="mt-8 p-5 bg-green-50 rounded-xl border border-green-100">
                <h4 className="text-green-900 font-semibold mb-3 text-sm">Proteção LGPD</h4>
                <p className="text-green-700 text-xs leading-relaxed mb-6">
                  Seus dados são protegidos por criptografia de nível bancário. Você tem total controle sobre suas informações.
                </p>
                <button className="inline-block bg-white text-green-700 px-4 h-9 leading-9 rounded-lg font-semibold text-xs transition-all">
                  Baixar Manual de Privacidade
                </button>
              </div>
            </div>
          </aside>

          {/* Column 2: Privacy Content Body */}
          <article className="lg:col-span-8 bg-white rounded-xl p-6 md:p-10 border border-slate-100">
            <div className="space-y-16">
              {sections.map((section) => (
                <div key={section.id} id={section.id} className="scroll-mt-32">
                  <div className="flex items-center gap-4 mb-6">
                    <span className="w-1.5 h-6 bg-green-600 rounded-full"></span>
                    <h2 className="text-xl font-semibold text-slate-900">
                      {section.title}
                    </h2>
                  </div>

                  {/* Main Content */}
                  <div className="text-slate-600 leading-relaxed whitespace-pre-line">
                    {section.content}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-12 pt-8 border-t border-slate-100 text-center">
              <p className="text-slate-500 font-semibold mb-3">Tem alguma dúvida específica?</p>
              <p className="text-slate-400 text-sm max-w-md mx-auto">
                Se você não encontrou a informação que procurava ou quer saber mais sobre como cuidamos dos seus dados, entre em contato com nossa equipe.
              </p>
              <div className="mt-8">
                <a 
                  href="mailto:privacidade@bwagro.com.br" 
                  className="inline-flex items-center gap-2 text-green-700 font-semibold text-sm hover:underline"
                >
                  privacidade@bwagro.com.br
                  <ArrowRight className="w-4 h-4" strokeWidth={1.5} />
                </a>
              </div>
            </div>
          </article>
        </div>
      </section>

      {/* Floating Back to Top Button */}
      <button 
        onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        className="fixed bottom-6 right-6 w-10 h-10 bg-white text-slate-900 rounded-lg border border-slate-100 flex items-center justify-center hover:bg-green-700 hover:text-white transition-all z-50 group"
      >
        <ArrowUp className="w-4 h-4 group-hover:-translate-y-1 transition-transform" strokeWidth={1.5} />
      </button>
    </div>
  );
};

export default PrivacyView;
