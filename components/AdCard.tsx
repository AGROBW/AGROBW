
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { MapPin, Heart } from 'lucide-react';
import { Ad } from '../types';
import { useAuth } from '../src/contexts/AuthContext';
import { useFavorites } from '../src/hooks/useFavorites';
import { supabase } from '../src/lib/supabaseClient';
import { detectUserState } from '../src/utils/geoLocation';
import { useLayout } from '../src/contexts/LayoutContext';
import { getPrimaryImageFromList } from '../src/utils/imageFallback';
import { isTimestampActive, syncTrustedTime } from '../src/lib/trustedTime';
import { debugLog } from '../src/utils/debugLog';
import { appWarn } from '../src/utils/appLogger';

interface AdCardProps {
  ad: Ad;
  highlightDisplayMode?: 'auto' | 'home' | 'category' | 'none';
  variant?: 'default' | 'compact';
}

const AdCard: React.FC<AdCardProps> = ({ ad, highlightDisplayMode = 'auto', variant = 'default' }) => {
  const { user } = useAuth();
  const { toggleFavorite, isFavorited } = useFavorites();
  const { settings } = useLayout();
  const [isFav, setIsFav] = useState(false);
  const [isToggling, setIsToggling] = useState(false);
  const [, setTrustedTimeVersion] = useState(0);
  
  useEffect(() => {
    let isActive = true;
    const checkFavorite = async () => {
      if (!user || !isFavorited) return;
      try {
        const result = await Promise.resolve(isFavorited(ad.id));
        if (isActive) {
          setIsFav(!!result);
        }
      } catch {
        // silencioso para evitar tela branca por erro isolado
      }
    };
    checkFavorite();
    return () => {
      isActive = false;
    };
  }, [ad.id, user, isFavorited]);

  useEffect(() => {
    let isMounted = true;

    void syncTrustedTime().then(() => {
      if (isMounted) {
        setTrustedTimeVersion((current) => current + 1);
      }
    });

    return () => {
      isMounted = false;
    };
  }, []);
  
  const handleFavoriteClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (!user || !toggleFavorite) return;
    
    setIsToggling(true);
    try {
      // Passar o preço atual ao favoritar
      const currentPrice = (ad as any).unit_price || ad.price;
      const result = await toggleFavorite(ad.id, currentPrice);
      setIsFav(!isFav); // Toggle local
    } finally {
      setIsToggling(false);
    }
  };
  
  // Suporta tanto price quanto unit_price
  const priceValue = (ad as any).unit_price || ad.price;
  const isPriceOnRequest = !!ad.priceNegotiable;
  const formattedPrice = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(priceValue);
  const displayPrice = isPriceOnRequest ? 'Sob consulta' : formattedPrice;
  const primaryImage = getPrimaryImageFromList(ad.images, settings.defaultAdImageUrl);

  // Verificar se o destaque está ativo (não expirado)
  const isCategoryHighlightActive = Boolean(ad.highlightCategory) && isTimestampActive(ad.highlightCategoryUntil);
  const isHomeHighlightActive = Boolean(ad.highlightHome) && isTimestampActive(ad.highlightHomeUntil);
  const shouldShowHomeHighlight =
    highlightDisplayMode === 'home'
      ? true
      : highlightDisplayMode === 'category'
        ? false
        : highlightDisplayMode === 'none'
          ? false
          : isHomeHighlightActive;
  const shouldShowCategoryHighlight =
    highlightDisplayMode === 'category'
      ? true
      : highlightDisplayMode === 'home'
        ? false
        : highlightDisplayMode === 'none'
          ? false
          : isCategoryHighlightActive;
  const hasActiveHighlight = shouldShowCategoryHighlight || shouldShowHomeHighlight;
  const hasOfficialStore = !!ad.seller?.store?.slug;
  const categoryHighlightStyle = {
    borderColor: '#93c5fd',
    boxShadow: '0 12px 30px -18px rgba(59, 130, 246, 0.28)',
  } as const;
  const officialStoreCardStyle = {
    borderColor: '#34d399',
    boxShadow: '0 12px 30px -18px rgba(16, 185, 129, 0.28)',
  } as const;
  const cardStyle = shouldShowHomeHighlight
    ? { borderColor: settings.accentColor, boxShadow: `0 12px 30px -18px ${settings.accentColor}66` }
    : shouldShowCategoryHighlight
      ? categoryHighlightStyle
      : hasOfficialStore
        ? officialStoreCardStyle
        : undefined;
  const isCompact = variant === 'compact';

  return (
    <div className={`group bg-white rounded-xl overflow-hidden transition-all duration-300 flex flex-col h-full relative ${
      hasActiveHighlight || hasOfficialStore
        ? 'border-2 shadow-lg' 
        : 'border border-slate-100'
    }`} style={cardStyle}>
      {/* Botão de Favoritar */}
      <button
        onClick={handleFavoriteClick}
        disabled={isToggling}
        className="absolute top-4 right-4 z-10 p-2 bg-white/90 hover:bg-white rounded-full shadow-md transition-all group/fav disabled:opacity-50"
      >
        <Heart 
          className={`w-5 h-5 transition-all ${
            isFav 
              ? 'fill-red-500 text-red-500' 
              : 'text-slate-600 group-hover/fav:text-red-500'
          }`} 
          strokeWidth={1.5} 
        />
      </button>
      
      {/* Image Wrapper */}
      <div className={`relative overflow-hidden ${isCompact ? 'h-36' : 'h-48'}`}>
        <img 
          src={primaryImage} 
          alt={ad.title} 
          loading="lazy"
          decoding="async"
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
        />
        <div className={`absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent ${isCompact ? 'p-3' : 'p-4'}`}>
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-white text-xs font-semibold flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5" strokeWidth={1.5} style={{ color: settings.primaryColor }} />
              {ad.location.city} - {ad.location.state}
            </p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className={`flex flex-grow flex-col ${isCompact ? 'p-3.5' : 'p-5'}`}>
        <h3 className={`font-semibold text-slate-800 line-clamp-2 leading-tight transition-colors group-hover:opacity-90 ${isCompact ? 'mb-2 h-9 text-[13px]' : 'mb-3 h-10 text-sm'}`} style={{ color: 'var(--brand-text)' }}>
          {ad.title}
        </h3>
        
        <div className={`mt-auto border-t border-slate-100 ${isCompact ? 'pt-2.5' : 'pt-3'}`}>
          <div>
            {!isCompact ? <p className="mb-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">Investimento</p> : null}
            <p className={`${isCompact ? 'text-sm' : 'text-base'} font-semibold tracking-tight`} style={{ color: settings.primaryColor }}>{displayPrice}</p>
          </div>
        </div>
      </div>
      
      <div className={`mt-auto ${isCompact ? 'px-3.5 pb-3.5' : 'px-5 pb-5'}`}>
        <Link 
          to={`/anuncio/${ad.id}`}
          onClick={() => {
            // Captura de cliques por estado para analytics (fire-and-forget)
            detectUserState().then(userState => {
              if (userState) {
                // Fire-and-forget: não await, não bloquear navegação
                supabase.rpc('register_click_by_state', {
                  p_announcement_id: ad.id,
                  p_state: userState
                }).then(({ error }) => {
                  if (error) {
                    const isDeletedAnnouncementClick =
                      error.code === '23503' ||
                      error.message?.includes('announcement_clicks_by_state') ||
                      error.message?.includes('foreign key constraint');

                    if (!isDeletedAnnouncementClick) {
                      appWarn('[Analytics] Nao foi possivel registrar clique', {
                        message: error.message,
                      });
                    }
                  } else {
        debugLog('[Analytics] Clique registrado:', userState);
                  }
                });
              }
            }).catch(err => {
              // Silencioso - não prejudicar UX se analytics falhar
              appWarn('[Analytics] Nao foi possivel capturar estado do clique', {
                error: err,
              });
            });
          }}
          className={`block w-full rounded-lg text-center font-semibold text-white transition-all ${isCompact ? 'h-9 text-xs leading-9' : 'h-10 text-sm leading-10'}`}
          style={{ backgroundColor: settings.secondaryColor }}
        >
          Ver Detalhes
        </Link>
      </div>
    </div>
  );
};

export default AdCard;
