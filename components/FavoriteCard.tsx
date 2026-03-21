import React, { useState } from 'react';
import { Favorite } from '../types';
import { MapPin, Clock, Eye, Trash2, ExternalLink, TrendingDown } from 'lucide-react';
import { motion } from 'framer-motion';
import { useFavorites } from '../src/hooks/useFavorites';
import { useLayout } from '../src/contexts/LayoutContext';

interface FavoriteCardProps {
  favorite: Favorite;
  userId: string;
  isSelected: boolean;
  onSelect: (id: string) => void;
  onRemove: () => void;
}

export const FavoriteCard: React.FC<FavoriteCardProps> = ({ 
  favorite, 
  userId, 
  isSelected, 
  onSelect,
  onRemove 
}) => {
  const [isRemoving, setIsRemoving] = useState(false);
  const { toggleFavorite } = useFavorites();
  const { settings } = useLayout();
  const { ad } = favorite;
  
  // Calcular diferença de preço
  const currentPrice = ad.price;
  const priceAtFavorite = favorite.priceAtFavorite;
  const priceDifference = priceAtFavorite - currentPrice;
  const hasPriceReduction = currentPrice < priceAtFavorite;
  
  const isUnavailable = ad.status === 'SOLD' || ad.status === 'PAUSED' || ad.status === 'BLOCKED';
  
  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(price);
  };
  
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
  };
  
  const handleRemove = async () => {
    setIsRemoving(true);
    await toggleFavorite(ad.id, currentPrice);
    setTimeout(() => {
      onRemove();
    }, 300);
  };
  
  return (
    <motion.div
      layout
      initial={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ duration: 0.3 }}
      className={`bg-white rounded-xl border overflow-hidden transition-all hover:shadow-md ${
        isUnavailable ? 'grayscale opacity-60' : ''
      } ${isSelected ? 'ring-2 ring-green-700' : ''}`}
      style={isSelected ? { boxShadow: `0 0 0 2px ${settings.primaryColor}` } : undefined}
    >
      {/* Imagem */}
      <div className="relative aspect-square">
        <img 
          src={ad.images[0]} 
          alt={ad.title}
          className="w-full h-full object-cover"
        />
        
        {/* Badge de Preço Atual */}
        <div className="absolute top-3 right-3 text-white px-3 py-1 rounded-full text-sm font-semibold shadow-lg" style={{ backgroundColor: settings.primaryColor }}>
          {formatPrice(currentPrice)}
        </div>
        
        {/* Badge de Economia - Mostra apenas se o preço atual for menor */}
        {hasPriceReduction && !isUnavailable && (
          <div className="absolute top-3 left-3 text-white px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-lg animate-pulse" style={{ background: `linear-gradient(90deg, ${settings.primaryColor}, color-mix(in srgb, ${settings.primaryColor} 78%, white))` }}>
            <TrendingDown className="w-4 h-4" strokeWidth={2} />
            <div className="flex flex-col leading-none">
              <span className="text-[10px] opacity-90">Baixou</span>
              <span className="text-sm">{formatPrice(priceDifference)}</span>
            </div>
          </div>
        )}
        
        {/* Overlay de Status */}
        {isUnavailable && (
          <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
            <span className="bg-white text-slate-900 px-4 py-2 rounded-lg font-semibold text-sm">
              {ad.status === 'SOLD' ? 'VENDIDO' : ad.status === 'PAUSED' ? 'PAUSADO' : 'INDISPONÍVEL'}
            </span>
          </div>
        )}
        
        {/* Checkbox de Seleção */}
        <div className="absolute bottom-3 left-3">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => onSelect(favorite.id)}
            className="w-5 h-5 rounded border-2 border-white bg-white/90 cursor-pointer"
            style={{ accentColor: settings.primaryColor }}
          />
        </div>
        
        {/* Botão de Remover */}
        <button
          onClick={handleRemove}
          className="absolute bottom-3 right-3 p-2 bg-white/90 hover:bg-red-50 rounded-lg transition-colors group"
        >
          <Trash2 className="w-4 h-4 text-slate-600 group-hover:text-red-600" strokeWidth={1.5} />
        </button>
      </div>
      
      {/* Conteúdo */}
      <div className="p-4">
        {/* Título */}
        <h3 className="font-semibold text-slate-900 mb-2 line-clamp-2 leading-tight">
          {ad.title}
        </h3>
        
        {/* Informações Técnicas */}
        {ad.technicalDetails && ad.technicalDetails.length > 0 && (
          <div className="flex items-center gap-2 mb-2 text-xs text-slate-600">
            <Clock className="w-3.5 h-3.5" strokeWidth={1.5} />
            <span>{ad.technicalDetails[0].value}</span>
          </div>
        )}
        
        {/* Localização */}
        <div className="flex items-center gap-1.5 text-xs text-slate-600 mb-3">
          <MapPin className="w-3.5 h-3.5" strokeWidth={1.5} />
          <span>{ad.location.city}, {ad.location.state}</span>
        </div>
        
        {/* Footer */}
        <div className="flex items-center justify-between pt-3 border-t">
          <div className="flex items-center gap-1 text-xs text-slate-500">
            <Eye className="w-3.5 h-3.5" strokeWidth={1.5} />
            <span>{ad.views}</span>
          </div>
          
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">
              Fav. {formatDate(favorite.favoritedAt)}
            </span>
            <a
              href={`/anuncio/${ad.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1.5 hover:bg-slate-100 rounded transition-colors"
            >
              <ExternalLink className="w-4 h-4 text-slate-600" strokeWidth={1.5} />
            </a>
          </div>
        </div>
        
        {/* Indicador de mudança de preço */}
        {hasPriceReduction && !isUnavailable && (
          <div className="mt-3 pt-3 border-t">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500">Preço ao favoritar:</span>
              <span className="font-semibold text-slate-700 line-through">
                {formatPrice(priceAtFavorite)}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs mt-1">
              <span className="font-semibold" style={{ color: settings.primaryColor }}>Economia:</span>
              <span className="font-bold" style={{ color: settings.primaryColor }}>
                {formatPrice(priceDifference)}
              </span>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
};
