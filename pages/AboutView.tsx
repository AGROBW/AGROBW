import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Target, Telescope, Gem, Loader2 } from 'lucide-react';
import { useAboutPage, ABOUT_PAGE_FALLBACK } from '../src/hooks/useAboutPage';

const AboutView: React.FC = () => {
  const { content, isLoading } = useAboutPage();
  const [scrolled, setScrolled] = useState(false);

  // Usar fallback se não houver dados
  const data = content || ABOUT_PAGE_FALLBACK;

  useEffect(() => {
    const handleScroll = () => {
      if (window.scrollY > 100) setScrolled(true);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <Loader2 className="w-12 h-12 text-green-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="bg-white min-h-screen">
      {/* Hero Section */}
      <section className="relative h-[60vh] md:h-[80vh] flex items-center overflow-hidden">
        <div 
          className="absolute inset-0 bg-cover bg-center transition-transform duration-[10s] scale-105"
          style={{ backgroundImage: `url(https://images.unsplash.com/photo-1500382017468-9049fed747ef?q=80&w=1600&auto=format&fit=crop)` }}
        >
          <div className="absolute inset-0 bg-gradient-to-b from-slate-900/60 via-slate-900/40 to-white"></div>
        </div>
        <div className="max-w-7xl mx-auto px-4 relative z-10 text-center text-white">
          <h1 className="text-4xl md:text-7xl font-black mb-6 font-display leading-tight drop-shadow-2xl animate-in slide-in-from-bottom duration-1000">
            BWAGRO: Conectando quem produz ao futuro do agronegócio
          </h1>
          <p className="text-xl md:text-2xl text-slate-100 max-w-3xl mx-auto font-medium opacity-90 drop-shadow-md">
            A plataforma líder que transforma o mercado rural com transparência e tecnologia.
          </p>
        </div>
      </section>

      {/* Stats Section - Floating over Hero */}
      <section className="max-w-5xl mx-auto px-4 -mt-20 relative z-20">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="bg-white rounded-[2.5rem] p-10 shadow-2xl shadow-slate-200/50 text-center border border-slate-50 transform hover:-translate-y-2 transition-transform duration-500">
            <div className="text-5xl font-black text-green-700 mb-2 font-display">
              {data.stat_users_value}
            </div>
            <p className="text-slate-400 font-black uppercase tracking-widest text-[10px]">{data.stat_users_label}</p>
          </div>
          <div className="bg-white rounded-[2.5rem] p-10 shadow-2xl shadow-slate-200/50 text-center border border-slate-50 transform hover:-translate-y-2 transition-transform duration-500">
            <div className="text-5xl font-black text-green-700 mb-2 font-display">
              {data.stat_ads_value}
            </div>
            <p className="text-slate-400 font-black uppercase tracking-widest text-[10px]">{data.stat_ads_label}</p>
          </div>
          <div className="bg-white rounded-[2.5rem] p-10 shadow-2xl shadow-slate-200/50 text-center border border-slate-50 transform hover:-translate-y-2 transition-transform duration-500">
            <div className="text-5xl font-black text-green-700 mb-2 font-display">
              {data.stat_revenue_value}
            </div>
            <p className="text-slate-400 font-black uppercase tracking-widest text-[10px]">{data.stat_revenue_label}</p>
          </div>
        </div>
      </section>

      {/* History Section - Z-Pattern */}
      <section className="py-32 max-w-7xl mx-auto px-4 overflow-hidden">
        <div className="flex flex-col lg:flex-row items-center gap-16">
          <div className="flex-1 space-y-8 animate-in slide-in-from-left duration-1000">
            <div className="inline-block bg-green-50 text-green-700 text-[10px] font-black px-4 py-2 rounded-full uppercase tracking-widest">
              Fundada em 2020
            </div>
            <h2 className="text-4xl md:text-5xl font-black text-slate-900 font-display leading-tight">
              {data.history_title}
            </h2>
            <div className="w-20 h-2 bg-green-600 rounded-full"></div>
            <p className="text-lg text-slate-500 leading-relaxed font-medium">
              {data.history_text}
            </p>
          </div>
          <div className="flex-1 relative animate-in slide-in-from-right duration-1000">
            <div className="absolute -inset-4 bg-green-100 rounded-[3rem] -rotate-3"></div>
            <img 
              src={data.history_image_url || 'https://images.unsplash.com/photo-1464226184884-fa280b87c399?q=80&w=800&auto=format&fit=crop'} 
              alt="Produtor Rural" 
              className="relative rounded-[3rem] shadow-2xl z-10 w-full h-[500px] object-cover"
            />
          </div>
        </div>
      </section>

      {/* Pillars Section - 3 Columns */}
      <section className="py-32 bg-slate-50">
        <div className="max-w-7xl mx-auto px-4">
          <div className="text-center mb-20">
            <h2 className="text-3xl font-black text-slate-900 mb-4 font-display">Nossos Pilares</h2>
            <p className="text-slate-500">O que nos guia todos os dias no campo e na cidade.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
            {/* Missão */}
            <div className="bg-white rounded-[2.5rem] p-12 shadow-sm border border-slate-100 text-center group hover:bg-green-700 transition-colors duration-500">
              <div className="text-6xl mb-8 group-hover:scale-110 transition-transform duration-500">
                <Target className="w-16 h-16 mx-auto text-green-700 group-hover:text-white transition-colors" strokeWidth={1.5} />
              </div>
              <h3 className="text-2xl font-black text-slate-900 mb-6 font-display group-hover:text-white transition-colors">{data.mission_title}</h3>
              <p className="text-slate-500 group-hover:text-green-50 transition-colors leading-relaxed">
                {data.mission_text}
              </p>
            </div>
            {/* Visão */}
            <div className="bg-white rounded-[2.5rem] p-12 shadow-sm border border-slate-100 text-center group hover:bg-green-700 transition-colors duration-500">
              <div className="text-6xl mb-8 group-hover:scale-110 transition-transform duration-500">
                <Telescope className="w-16 h-16 mx-auto text-green-700 group-hover:text-white transition-colors" strokeWidth={1.5} />
              </div>
              <h3 className="text-2xl font-black text-slate-900 mb-6 font-display group-hover:text-white transition-colors">{data.vision_title}</h3>
              <p className="text-slate-500 group-hover:text-green-50 transition-colors leading-relaxed">
                {data.vision_text}
              </p>
            </div>
            {/* Valores */}
            <div className="bg-white rounded-[2.5rem] p-12 shadow-sm border border-slate-100 text-center group hover:bg-green-700 transition-colors duration-500">
              <div className="text-6xl mb-8 group-hover:scale-110 transition-transform duration-500">
                <Gem className="w-16 h-16 mx-auto text-green-700 group-hover:text-white transition-colors" strokeWidth={1.5} />
              </div>
              <h3 className="text-2xl font-black text-slate-900 mb-6 font-display group-hover:text-white transition-colors">{data.values_title}</h3>
              <p className="text-slate-500 group-hover:text-green-50 transition-colors leading-relaxed">
                {data.values_text}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Technical Differences */}
      <section className="py-32 max-w-7xl mx-auto px-4">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-20 items-center">
          <div className="order-2 lg:order-1 grid grid-cols-1 gap-8">
            <div className="flex gap-6 items-start">
              <div className="w-14 h-14 bg-green-100 text-green-700 rounded-2xl flex items-center justify-center flex-shrink-0 font-black text-xl">
                01
              </div>
              <div>
                <h4 className="text-xl font-black text-slate-900 mb-2 font-display">{data.diff1_title}</h4>
                <p className="text-slate-500 leading-relaxed">{data.diff1_text}</p>
              </div>
            </div>
            <div className="flex gap-6 items-start">
              <div className="w-14 h-14 bg-green-100 text-green-700 rounded-2xl flex items-center justify-center flex-shrink-0 font-black text-xl">
                02
              </div>
              <div>
                <h4 className="text-xl font-black text-slate-900 mb-2 font-display">{data.diff2_title}</h4>
                <p className="text-slate-500 leading-relaxed">{data.diff2_text}</p>
              </div>
            </div>
            <div className="flex gap-6 items-start">
              <div className="w-14 h-14 bg-green-100 text-green-700 rounded-2xl flex items-center justify-center flex-shrink-0 font-black text-xl">
                03
              </div>
              <div>
                <h4 className="text-xl font-black text-slate-900 mb-2 font-display">{data.diff3_title}</h4>
                <p className="text-slate-500 leading-relaxed">{data.diff3_text}</p>
              </div>
            </div>
          </div>
          <div className="order-1 lg:order-2">
            <h2 className="text-4xl md:text-5xl font-black text-slate-900 mb-8 font-display leading-tight">
              Por que a BWAGRO é <span className="text-green-700">diferente?</span>
            </h2>
            <p className="text-lg text-slate-500 mb-10 leading-relaxed font-medium">
              Não somos apenas um site de anúncios. Somos uma ferramenta estratégica para quem vive o agronegócio. Cada linha de código é pensada para suportar a robustez das operações rurais.
            </p>
            <div className="flex gap-4">
               <div className="flex -space-x-4">
                  {[1,2,3,4].map(i => (
                    <div key={i} className="w-12 h-12 rounded-full border-4 border-white overflow-hidden bg-slate-200">
                      <img src={`https://i.pravatar.cc/150?u=${i+10}`} className="w-full h-full object-cover" />
                    </div>
                  ))}
               </div>
               <div className="text-sm font-bold text-slate-400 self-center">
                  +10.000 produtores confiando.
               </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Final */}
      <section className="py-32 bg-green-700 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-1/3 h-full bg-slate-900/10 skew-x-12 translate-x-10"></div>
        <div className="max-w-5xl mx-auto px-4 text-center relative z-10">
          <h2 className="text-4xl md:text-6xl font-black text-white mb-8 font-display leading-tight">
            Faça parte da nossa história
          </h2>
          <p className="text-green-50 text-xl mb-12 max-w-2xl mx-auto opacity-90 leading-relaxed">
            Comece hoje mesmo a transformar o jeito que você faz negócios no campo. Anuncie grátis e conecte-se com compradores reais.
          </p>
          <div className="flex flex-col sm:flex-row gap-6 justify-center">
            <Link 
              to="/anunciar" 
              className="bg-slate-900 text-white px-12 py-6 rounded-[2rem] font-black text-xl hover:bg-slate-800 transition-all shadow-2xl hover:scale-105 active:scale-95"
            >
              Começar a Anunciar Agora
            </Link>
            <Link 
              to="/anuncios" 
              className="bg-white/10 backdrop-blur-md border border-white/20 text-white px-12 py-6 rounded-[2rem] font-black text-xl hover:bg-white/20 transition-all"
            >
              Explorar Ofertas
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
};

export default AboutView;
