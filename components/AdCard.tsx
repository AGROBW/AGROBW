
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { MapPin, Eye, Heart, Sparkles, Store } from 'lucide-react';
import { Ad } from '../types';
import { useAuth } from '../src/contexts/AuthContext';
import { useFavorites } from '../src/hooks/useFavorites';
import VerifiedBadge from './VerifiedBadge';
import { supabase } from '../src/lib/supabaseClient';
import { detectUserState } from '../src/utils/geoLocation';
import { useLayout } from '../src/contexts/LayoutContext';

interface AdCardProps {
  ad: Ad;
  highlightDisplayMode?: 'auto' | 'home' | 'category' | 'none';
}

const AdCard: React.FC<AdCardProps> = ({ ad, highlightDisplayMode = 'auto' }) => {
  const { user } = useAuth();
  const { toggleFavorite, isFavorited } = useFavorites();
  const { settings } = useLayout();
  const [isFav, setIsFav] = useState(false);
  const [isToggling, setIsToggling] = useState(false);
  
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
  const formattedPrice = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(priceValue);

  // Verificar se o destaque está ativo (não expirado)
  const isCategoryHighlightActive = ad.highlightCategory && (!ad.highlightCategoryUntil || new Date(ad.highlightCategoryUntil) > new Date());
  const isHomeHighlightActive = ad.highlightHome && (!ad.highlightHomeUntil || new Date(ad.highlightHomeUntil) > new Date());
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

  return (
    <div className={`group bg-white rounded-xl overflow-hidden transition-all duration-300 flex flex-col h-full relative ${
      hasActiveHighlight || hasOfficialStore
        ? 'border-2 shadow-lg' 
        : 'border border-slate-100'
    }`} style={cardStyle}>
      {/* Badge de Destaque */}
      <div className="absolute top-4 left-4 z-10 flex max-w-[calc(100%-4rem)] flex-col gap-2">
        {hasActiveHighlight && (
          <div
            className="flex items-center gap-1 text-[10px] font-black uppercase px-3 py-1.5 rounded-full shadow-lg animate-pulse w-fit"
            style={
              shouldShowHomeHighlight
                ? { background: `linear-gradient(90deg, ${settings.accentColor}, color-mix(in srgb, ${settings.accentColor} 82%, white))`, color: settings.secondaryColor }
                : { background: 'linear-gradient(90deg, #dbeafe, #eff6ff)', color: '#1d4ed8' }
            }
          >
            <Sparkles className="w-3 h-3" strokeWidth={2.5} />
            {shouldShowHomeHighlight ? 'HOME' : 'CATEGORIA'}
          </div>
        )}
        {hasOfficialStore && (
          <div className="flex items-center gap-1 text-[10px] font-black uppercase px-3 py-1.5 rounded-full shadow-lg w-fit bg-gradient-to-r from-emerald-100 to-teal-50 text-emerald-800">
            <Store className="w-3 h-3" strokeWidth={2.5} />
            LOJA OFICIAL
          </div>
        )}
      </div>
      
      {ad.isPremium && !hasActiveHighlight && (
        <div className="absolute top-4 left-4 z-10 bg-yellow-400 text-yellow-900 text-[10px] font-black uppercase px-2 py-1 rounded shadow-sm">
          Premium
        </div>
      )}
      
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
      <div className="relative h-48 overflow-hidden">
        <img 
          src={ad.images[0]} 
          alt={ad.title} 
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
        />
        <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 via-black/40 to-transparent">
          <p className="text-white text-xs font-semibold flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5" strokeWidth={1.5} style={{ color: settings.primaryColor }} />
            {ad.location.city} - {ad.location.state}
          </p>
        </div>
      </div>

      {/* Content */}
      <div className="p-5 flex flex-col flex-grow">
        <h3 className="text-sm font-semibold text-slate-800 mb-3 line-clamp-2 leading-tight transition-colors h-10 group-hover:opacity-90" style={{ color: 'var(--brand-text)' }}>
          {ad.title}
        </h3>
        
        {/* Vendedor Verificado */}
        {ad.seller?.document_verified && (
          <div className="flex items-center gap-1.5 mb-3">
            <VerifiedBadge variant="small" />
          </div>
        )}

        <div className="flex items-center justify-between mt-auto pt-3 border-t border-slate-100">
          <div>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-0.5">Investimento</p>
            <p className="text-base font-semibold tracking-tight" style={{ color: settings.primaryColor }}>{formattedPrice}</p>
          </div>
          <div className="flex flex-col items-end">
             <div className="flex items-center gap-1 text-slate-400 text-[11px] font-semibold">
               <Eye className="w-4 h-4" strokeWidth={1.5} />
               {ad.views.toLocaleString()}
             </div>
          </div>
        </div>
      </div>
      
      <div className="px-5 pb-5 mt-auto">
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
                      console.error('[Analytics] Erro ao registrar clique:', error.message);
                    }
                  } else {
                    console.log('[Analytics] Clique registrado:', userState);
                  }
                });
              }
            }).catch(err => {
              // Silencioso - não prejudicar UX se analytics falhar
              console.error('[Analytics] Erro na captura:', err);
            });
          }}
          className="block w-full text-center h-10 leading-10 text-white rounded-lg text-sm font-semibold transition-all"
          style={{ backgroundColor: settings.secondaryColor }}
        >
          Ver Detalhes
        </Link>
      </div>
    </div>
  );
};

export default AdCard;
