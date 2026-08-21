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
  mobile_image_url: string | null;
  sort_order: number;
  is_active: boolean;
}

interface SponsorCarouselSlideRow {
  id: string;
  company_name: string;
  segment: string;
  banner_url: string;
  mobile_banner_url: string | null;
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
      mobile_image_url?: string | null;
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
      mobile_image_url?: string | null;
      sort_order: number;
      slide_type: 'sponsor';
      sponsor_id: string;
      sponsor_target_type: 'site' | 'whatsapp';
      sponsor_target_url: string;
    };

const fallbackSlides: SliderItem[] = [
  {
    id: 'fallback',
    badge_text: 'Marketplace do agro',
    title: 'O agro encontra negócios aqui',
    subtitle: 'Máquinas, animais, insumos, imóveis e oportunidades para todo o Brasil.',
    button_text: 'Ver anúncios',
    button_link: '/anuncios',
    image_url: 'https://images.unsplash.com/photo-1500382017468-9049fed747ef?q=80&w=1600&auto=format&fit=crop',
    sort_order: 0,
    slide_type: 'banner',
  },
];

// Trata null, string vazia e espaços como ausência de arte mobile.
const normalizeMobileImageUrl = (url?: string | null): string | null => {
  const trimmed = (url || '').trim();
  return trimmed.length > 0 ? trimmed : null;
};

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
            .select('id, badge_text, title, subtitle, button_text, button_link, image_url, mobile_image_url, sort_order, is_active')
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
          mobile_image_url: banner.mobile_image_url,
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
            mobile_image_url: sponsor.mobile_banner_url,
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
    return <div className="relative h-[100vw] max-h-[430px] w-full animate-pulse overflow-hidden bg-slate-100 min-[1023px]:h-[500px] min-[1023px]:max-h-none" />;
  }

  return (
    <section className="relative h-[100vw] max-h-[430px] w-full overflow-hidden bg-slate-950 min-[1023px]:h-[500px] min-[1023px]:max-h-none">
      {slides.map((slide, index) => (
        <div
          key={slide.id}
          className={`absolute inset-0 transition-opacity duration-1000 ease-in-out ${
            index === current ? 'opacity-100 z-10' : 'opacity-0 z-0'
          }`}
        >
          <div className="absolute inset-0 overflow-hidden">
            {(() => {
              const mobileUrl = normalizeMobileImageUrl(slide.mobile_image_url);
              return (
                <>
                  {/* Fundo decorativo: mesma fonte responsiva, ampliada/desfocada, preenche
                      as faixas quando a arte aparece inteira (object-contain) até 1022px.
                      Oculto no modo desktop (>=1023px), onde a arte principal é object-cover.
                      O modo responsivo mobile/tablet termina em 1022px; a partir de 1023px o
                      carrossel assume exatamente o mesmo modo desktop de 1024px. */}
                  <picture aria-hidden="true">
                    {mobileUrl ? <source media="(max-width: 1022px)" srcSet={mobileUrl} /> : null}
                    <img
                      src={slide.image_url}
                      alt=""
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-0 h-full w-full scale-110 object-cover object-center opacity-100 blur-xl min-[1023px]:hidden"
                      loading={index === 0 ? 'eager' : 'lazy'}
                      decoding="async"
                    />
                  </picture>

                  {/* Arte principal: inteira (object-contain) até 1022px; comportamento
                      desktop preservado a partir de 1023px (object-cover/center + zoom). */}
                  <picture>
                    {mobileUrl ? <source media="(max-width: 1022px)" srcSet={mobileUrl} /> : null}
                    <img
                      src={slide.image_url}
                      alt={slide.title}
                      className="absolute inset-0 h-full w-full object-contain object-center transition-transform duration-[10s] ease-linear transform scale-100 min-[1023px]:hover:scale-110 min-[1023px]:object-cover"
                      loading={index === 0 ? 'eager' : 'lazy'}
                      decoding="async"
                      fetchPriority={index === 0 ? 'high' : 'auto'}
                    />
                  </picture>
                </>
              );
            })()}
            <div className="absolute inset-0 bg-gradient-to-r from-slate-950/85 via-slate-950/45 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-slate-950/75 to-transparent sm:from-slate-950/55" />
          </div>

          <div className="relative mx-auto flex h-full max-w-7xl flex-col items-start justify-end px-4 pb-20 text-white sm:justify-center sm:px-8 lg:px-12 lg:pb-24">
            <div
              className={`max-w-[290px] transform transition-all delay-300 duration-700 sm:max-w-[540px] lg:max-w-[620px] ${
                index === current ? 'translate-y-0 opacity-100' : 'translate-y-10 opacity-0'
              }`}
            >
              <span className="mb-2 inline-block rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.18em] backdrop-blur-md sm:mb-3 sm:px-3 sm:text-[10px] sm:tracking-[0.2em]">
                {slide.badge_text}
              </span>
              <h2 className="mb-2 text-xl font-black leading-tight tracking-[-0.025em] sm:mb-3 sm:text-4xl sm:leading-[1.05] sm:tracking-[-0.035em] lg:text-5xl">{slide.title}</h2>
              <p className="mb-4 line-clamp-2 max-w-[290px] text-xs leading-5 text-slate-200 sm:mb-6 sm:max-w-xl sm:text-base sm:leading-6">{slide.subtitle}</p>
              <div className="flex gap-4">
                {slide.slide_type === 'banner' ? (
                  <a
                    href={slide.button_link}
                    className="group flex h-9 items-center gap-1.5 rounded-lg bg-green-600 px-4 text-xs font-bold text-white transition-all hover:bg-green-700 sm:h-11 sm:gap-2 sm:px-5 sm:text-sm"
                  >
                    {slide.button_text}
                    <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1 sm:h-4 sm:w-4" strokeWidth={1.5} />
                  </a>
                ) : (
                  <button
                    type="button"
                    onClick={() => void handleSponsorClick(slide)}
                    className="group flex h-9 items-center gap-1.5 rounded-lg bg-green-600 px-4 text-xs font-bold text-white transition-all hover:bg-green-700 sm:h-11 sm:gap-2 sm:px-5 sm:text-sm"
                  >
                    {slide.button_text}
                    <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1 sm:h-4 sm:w-4" strokeWidth={1.5} />
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
