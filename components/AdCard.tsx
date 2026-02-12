
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { MapPin, Eye, Heart } from 'lucide-react';
import { Ad } from '../types';
import { useAuth } from '../src/contexts/AuthContext';
import { useFavorites } from '../src/hooks/useFavorites';

interface AdCardProps {
  ad: Ad;
}

const AdCard: React.FC<AdCardProps> = ({ ad }) => {
  const { user } = useAuth();
  const { toggleFavorite, isFavorited } = useFavorites();
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
      const result = await toggleFavorite(ad.id);
      setIsFav(result.isFavorited);
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

  return (
    <div className="group bg-white rounded-xl overflow-hidden transition-all duration-300 border border-slate-100 flex flex-col h-full relative">
      {ad.isPremium && (
        <div className="absolute top-4 left-4 z-10 bg-yellow-400 text-yellow-900 text-[10px] font-black uppercase px-2 py-1 rounded shadow-sm">
          Destaque
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
            <MapPin className="w-3.5 h-3.5 text-green-400" strokeWidth={1.5} />
            {ad.location.city} - {ad.location.state}
          </p>
        </div>
      </div>

      {/* Content */}
      <div className="p-5 flex flex-col flex-grow">
        <h3 className="text-sm font-semibold text-slate-800 mb-3 line-clamp-2 leading-tight group-hover:text-green-700 transition-colors h-10">
          {ad.title}
        </h3>
        
        <div className="flex items-center justify-between mt-auto pt-3 border-t border-slate-100">
          <div>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-0.5">Investimento</p>
            <p className="text-base font-semibold text-green-700 tracking-tight">{formattedPrice}</p>
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
          className="block w-full text-center h-10 leading-10 bg-slate-900 text-white rounded-lg text-sm font-semibold hover:bg-green-700 transition-all"
        >
          Ver Detalhes
        </Link>
      </div>
    </div>
  );
};

export default AdCard;
