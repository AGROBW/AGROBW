
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react';
import { supabase } from '../src/lib/supabaseClient';

interface Banner {
  id: string;
  badge_text: string;
  title: string;
  subtitle: string;
  button_text: string;
  button_link: string;
  image_url: string;
  sort_order: number;
  is_active: boolean;
}

const AdSlider: React.FC = () => {
  const [current, setCurrent] = useState(0);
  const [banners, setBanners] = useState<Banner[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Buscar banners ativos do banco de dados
  useEffect(() => {
    const fetchBanners = async () => {
      try {
        const { data, error } = await supabase
          .from('home_banners')
          .select('*')
          .eq('is_active', true)
          .order('sort_order', { ascending: true });

        if (error) throw error;

        if (data && data.length > 0) {
          setBanners(data);
        } else {
          // Fallback: Banner padrão se não houver dados
          setBanners([{
            id: 'fallback',
            badge_text: 'Destaque BWAGRO',
            title: 'Bem-vindo à BWAGRO',
            subtitle: 'Conectando o produtor rural às melhores oportunidades.',
            button_text: 'Ver Anúncios',
            button_link: '#/anuncios',
            image_url: 'https://images.unsplash.com/photo-1500382017468-9049fed747ef?q=80&w=1600&auto=format&fit=crop',
            sort_order: 0,
            is_active: true
          }]);
        }
      } catch (error) {
        console.error('[AdSlider] Erro ao carregar banners:', error);
        // Fallback em caso de erro
        setBanners([{
          id: 'fallback',
          badge_text: 'Destaque BWAGRO',
          title: 'Bem-vindo à BWAGRO',
          subtitle: 'Conectando o produtor rural às melhores oportunidades.',
          button_text: 'Ver Anúncios',
          button_link: '#/anuncios',
          image_url: 'https://images.unsplash.com/photo-1500382017468-9049fed747ef?q=80&w=1600&auto=format&fit=crop',
          sort_order: 0,
          is_active: true
        }]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchBanners();
  }, []);

  const nextSlide = useCallback(() => {
    setCurrent((prev) => (prev === banners.length - 1 ? 0 : prev + 1));
  }, [banners.length]);

  const prevSlide = () => {
    setCurrent((prev) => (prev === 0 ? banners.length - 1 : prev - 1));
  };

  useEffect(() => {
    if (banners.length === 0) return;
    const timer = setInterval(nextSlide, 6000);
    return () => clearInterval(timer);
  }, [nextSlide, banners.length]);

  if (isLoading) {
    return (
      <div className="relative w-full h-[320px] md:h-[400px] bg-slate-100 animate-pulse"></div>
    );
  }

  return (
    <div className="relative w-full h-[320px] md:h-[400px] overflow-hidden">
      {/* Slides */}
      {banners.map((banner, index) => (
        <div
          key={banner.id}
          className={`absolute inset-0 transition-opacity duration-1000 ease-in-out ${
            index === current ? 'opacity-100 z-10' : 'opacity-0 z-0'
          }`}
        >
          {/* Background Image */}
          <div 
            className="absolute inset-0 bg-cover bg-center transition-transform duration-[10s] ease-linear transform scale-100 hover:scale-110"
            style={{ backgroundImage: `url(${banner.image_url})` }}
          >
            <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/30 to-transparent"></div>
          </div>

          {/* Content */}
          <div className="relative h-full max-w-7xl mx-auto px-6 flex flex-col justify-center items-start text-white">
            <div className={`transform transition-all duration-700 delay-300 ${index === current ? 'translate-y-0 opacity-100' : 'translate-y-10 opacity-0'}`}>
              <span className="inline-block px-3 py-1 bg-green-600 text-xs font-semibold tracking-widest uppercase rounded mb-3">
                {banner.badge_text}
              </span>
              <h2 className="text-xl font-semibold mb-3 leading-tight max-w-2xl">
                {banner.title}
              </h2>
              <p className="text-sm text-gray-200 mb-6 max-w-xl">
                {banner.subtitle}
              </p>
              <div className="flex gap-4">
                <a 
                  href={banner.button_link} 
                  className="bg-green-600 hover:bg-green-700 text-white px-5 h-10 rounded-lg font-semibold transition-all flex items-center gap-2 group"
                >
                  {banner.button_text}
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" strokeWidth={1.5} />
                </a>
              </div>
            </div>
          </div>
        </div>
      ))}

      {/* Navigation Arrows */}
      {banners.length > 1 && (
        <>
          <button 
            onClick={prevSlide}
            className="absolute left-4 top-1/2 -translate-y-1/2 z-20 p-2 bg-white/10 hover:bg-white/20 backdrop-blur-md rounded-lg text-white transition-all hidden md:block border border-white/20"
          >
            <ChevronLeft className="w-5 h-5" strokeWidth={1.5} />
          </button>
          <button 
            onClick={nextSlide}
            className="absolute right-4 top-1/2 -translate-y-1/2 z-20 p-2 bg-white/10 hover:bg-white/20 backdrop-blur-md rounded-lg text-white transition-all hidden md:block border border-white/20"
          >
            <ChevronRight className="w-5 h-5" strokeWidth={1.5} />
          </button>
        </>
      )}

      {/* Dots */}
      {banners.length > 1 && (
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-20 flex gap-2">
          {banners.map((_, index) => (
            <button
              key={index}
              onClick={() => setCurrent(index)}
              className={`w-3 h-3 rounded-full transition-all ${
                index === current ? 'bg-green-500 w-8' : 'bg-white/50 hover:bg-white'
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default AdSlider;
