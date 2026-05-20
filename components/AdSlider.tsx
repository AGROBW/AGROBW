import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../src/lib/supabaseClient';
import { useAuth } from '../src/contexts/AuthContext';
import { appError } from '../src/utils/appLogger';
import { ensureSiteAnalyticsSessionId, getSiteAnalyticsDeviceType } from '../src/lib/siteAnalyticsSession';
import { detectUserState } from '../src/utils/geoLocation';

interface HomeBannerSlide {
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

interface SponsorCarouselSlideRow {
  id: string;
  company_name: string;
  segment: string;
  banner_url: string;
  target_type: 'site' | 'whatsapp';
  target_url: string;
  home_badge_text: string;
  home_title: string;
  home_subtitle: string;
  home_button_text: string;
  home_carousel_sort_order: number | null;
}

type SliderItem =
  | {
      id: string;
      badge_text: string;
      title: string;
      subtitle: string;
      button_text: string;
      image_url: string;
      sort_order: number;
      slide_type: 'banner';
      button_link: string;
    }
  | {
      id: string;
      badge_text: string;
      title: string;
      subtitle: string;
      button_text: string;
      image_url: string;
      sort_order: number;
      slide_type: 'sponsor';
      sponsor_id: string;
      sponsor_target_type: 'site' | 'whatsapp';
      sponsor_target_url: string;
    };

const fallbackSlides: SliderItem[] = [
  {
    id: 'fallback',
    badge_text: 'Destaque BWAGRO',
    title: 'Bem-vindo à BWAGRO',
    subtitle: 'Conectando o produtor rural às melhores oportunidades.',
    button_text: 'Ver anúncios',
    button_link: '/anuncios',
    image_url: 'https://images.unsplash.com/photo-1500382017468-9049fed747ef?q=80&w=1600&auto=format&fit=crop',
    sort_order: 0,
    slide_type: 'banner',
  },
];

const normalizeExternalUrl = (url?: string | null) => {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
};

const buildSponsorDestination = (targetType: 'site' | 'whatsapp', targetUrl?: string | null) => {
  if (!targetUrl) return null;

  if (targetType === 'whatsapp') {
    const digitsOnly = targetUrl.replace(/\D/g, '');
    if (digitsOnly.length >= 10 && digitsOnly.length <= 15) {
      return `https://wa.me/${digitsOnly}`;
    }
  }

  return normalizeExternalUrl(targetUrl);
};

const AdSlider: React.FC = () => {
  const { user } = useAuth();
  const [current, setCurrent] = useState(0);
  const [slides, setSlides] = useState<SliderItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const sessionId = useMemo(() => ensureSiteAnalyticsSessionId(), []);
  const trackedSponsorImpressionsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    let isMounted = true;

    const fetchSlides = async () => {
      setIsLoading(true);

      try {
        const [bannerResult, sponsorResult] = await Promise.all([
          supabase
            .from('home_banners')
            .select('id, badge_text, title, subtitle, button_text, button_link, image_url, sort_order, is_active')
            .eq('is_active', true)
            .order('sort_order', { ascending: true }),
          supabase.rpc('get_public_home_carousel_sponsors'),
        ]);

        if (bannerResult.error) throw bannerResult.error;
        if (sponsorResult.error) throw sponsorResult.error;

        const bannerSlides: SliderItem[] = ((bannerResult.data || []) as HomeBannerSlide[]).map((banner) => ({
          id: `banner-${banner.id}`,
          badge_text: banner.badge_text,
          title: banner.title,
          subtitle: banner.subtitle,
          button_text: banner.button_text,
          button_link: banner.button_link,
          image_url: banner.image_url,
          sort_order: banner.sort_order,
          slide_type: 'banner',
        }));

        const sponsorSlides: SliderItem[] = ((sponsorResult.data || []) as SponsorCarouselSlideRow[])
          .filter((sponsor) => Boolean(buildSponsorDestination(sponsor.target_type, sponsor.target_url)))
          .map((sponsor) => ({
            id: `sponsor-${sponsor.id}`,
            badge_text: sponsor.home_badge_text,
            title: sponsor.home_title,
            subtitle: sponsor.home_subtitle,
            button_text: sponsor.home_button_text,
            image_url: sponsor.banner_url,
            sort_order: sponsor.home_carousel_sort_order ?? 999,
            slide_type: 'sponsor',
            sponsor_id: sponsor.id,
            sponsor_target_type: sponsor.target_type,
            sponsor_target_url: sponsor.target_url,
          }));

        const mergedSlides = [...bannerSlides, ...sponsorSlides].sort((left, right) => {
          if (left.sort_order !== right.sort_order) {
            return left.sort_order - right.sort_order;
          }

          if (left.slide_type !== right.slide_type) {
            return left.slide_type === 'banner' ? -1 : 1;
          }

          return left.id.localeCompare(right.id);
        });

        if (!isMounted) return;

        setSlides(mergedSlides.length > 0 ? mergedSlides : fallbackSlides);
      } catch (error) {
        appError('[AdSlider] Erro ao carregar slides da home', error);

        if (!isMounted) return;
        setSlides(fallbackSlides);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    void fetchSlides();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (current > 0 && current >= slides.length) {
      setCurrent(0);
    }
  }, [current, slides.length]);

  const nextSlide = useCallback(() => {
    setCurrent((prev) => (prev === slides.length - 1 ? 0 : prev + 1));
  }, [slides.length]);

  const prevSlide = useCallback(() => {
    setCurrent((prev) => (prev === 0 ? slides.length - 1 : prev - 1));
  }, [slides.length]);

  useEffect(() => {
    if (slides.length === 0) return;
    const timer = setInterval(nextSlide, 6000);
    return () => clearInterval(timer);
  }, [nextSlide, slides.length]);

  useEffect(() => {
    const activeSlide = slides[current];

    if (!activeSlide || activeSlide.slide_type !== 'sponsor') {
      return;
    }

    if (trackedSponsorImpressionsRef.current.has(activeSlide.sponsor_id)) {
      return;
    }

    trackedSponsorImpressionsRef.current.add(activeSlide.sponsor_id);

    void supabase
      .rpc('record_site_sponsor_impression', {
        p_sponsor_id: activeSlide.sponsor_id,
        p_session_id: sessionId,
        p_page_path: '/',
        p_slot_position: activeSlide.sort_order,
        p_user_id: user?.id ?? null,
        p_user_city: user?.cidade ?? null,
        p_user_state: user?.estado ?? null,
        p_device_type: getSiteAnalyticsDeviceType(),
        p_placement_key: 'home_carousel',
      })
      .then(({ error }) => {
        if (error) {
          appError('[AdSlider] Erro ao registrar impressão do patrocinador na home', error, {
            sponsorId: activeSlide.sponsor_id,
          });
        }
      });
  }, [current, sessionId, slides, user?.cidade, user?.estado, user?.id]);

  const handleSponsorClick = async (slide: Extract<SliderItem, { slide_type: 'sponsor' }>) => {
    const destination = buildSponsorDestination(slide.sponsor_target_type, slide.sponsor_target_url);

    if (!destination) {
      toast.error('O link deste patrocinador está indisponível no momento.');
      return;
    }

    const fallbackState = !user?.estado ? await detectUserState() : null;

    void supabase
      .rpc('record_site_sponsor_click', {
        p_sponsor_id: slide.sponsor_id,
        p_session_id: sessionId,
        p_page_path: '/',
        p_slot_position: slide.sort_order,
        p_user_id: user?.id ?? null,
        p_user_city: user?.cidade ?? null,
        p_user_state: user?.estado ?? fallbackState ?? null,
        p_device_type: getSiteAnalyticsDeviceType(),
        p_placement_key: 'home_carousel',
      })
      .then(({ error }) => {
        if (error) {
          appError('[AdSlider] Erro ao registrar clique do patrocinador na home', error, {
            sponsorId: slide.sponsor_id,
          });
        }
      });

    window.open(destination, '_blank', 'noopener,noreferrer');
  };

  if (isLoading) {
    return <div className="relative w-full overflow-hidden bg-slate-100 animate-pulse aspect-[3/1] min-h-[280px] md:min-h-0" />;
  }

  return (
    <section className="relative w-full overflow-hidden bg-slate-950 aspect-[3/1] min-h-[280px] md:min-h-0">
      {slides.map((slide, index) => (
        <div
          key={slide.id}
          className={`absolute inset-0 transition-opacity duration-1000 ease-in-out ${
            index === current ? 'opacity-100 z-10' : 'opacity-0 z-0'
          }`}
        >
          <div className="absolute inset-0 overflow-hidden">
            <img
              src={slide.image_url}
              alt={slide.title}
              className="absolute inset-0 h-full w-full object-cover object-center transition-transform duration-[10s] ease-linear transform scale-100 hover:scale-110"
              loading={index === 0 ? 'eager' : 'lazy'}
              decoding="async"
              fetchPriority={index === 0 ? 'high' : 'auto'}
            />
            <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/30 to-transparent" />
          </div>

          <div className="relative h-full max-w-7xl mx-auto px-6 md:px-10 lg:px-14 flex flex-col justify-center items-start text-white">
            <div
              className={`max-w-[540px] lg:max-w-[620px] transform transition-all duration-700 delay-300 ${
                index === current ? 'translate-y-0 opacity-100' : 'translate-y-10 opacity-0'
              }`}
            >
              <span className="inline-block px-3 py-1 bg-green-600 text-xs font-semibold tracking-widest uppercase rounded mb-3">
                {slide.badge_text}
              </span>
              <h2 className="text-xl md:text-2xl lg:text-[2rem] font-semibold mb-3 leading-tight">{slide.title}</h2>
              <p className="text-sm md:text-base text-gray-200 mb-6 max-w-xl">{slide.subtitle}</p>
              <div className="flex gap-4">
                {slide.slide_type === 'banner' ? (
                  <a
                    href={slide.button_link}
                    className="bg-green-600 hover:bg-green-700 text-white px-5 h-10 rounded-lg font-semibold transition-all flex items-center gap-2 group"
                  >
                    {slide.button_text}
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" strokeWidth={1.5} />
                  </a>
                ) : (
                  <button
                    type="button"
                    onClick={() => void handleSponsorClick(slide)}
                    className="bg-green-600 hover:bg-green-700 text-white px-5 h-10 rounded-lg font-semibold transition-all flex items-center gap-2 group"
                  >
                    {slide.button_text}
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" strokeWidth={1.5} />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      ))}

      {slides.length > 1 && (
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

      {slides.length > 1 && (
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-20 flex gap-2">
          {slides.map((_, index) => (
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
    </section>
  );
};

export default AdSlider;
