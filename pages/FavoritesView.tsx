import React, { useMemo, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { GitCompare, Heart, Inbox, Loader2, TrendingDown } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { FavoriteCard } from '../components/FavoriteCard';
import { useAuth } from '../src/contexts/AuthContext';
import { useFavorites } from '../src/hooks/useFavorites';

type FavoritesViewProps = {
  embedded?: boolean;
};

export const FavoritesView: React.FC<FavoritesViewProps> = ({ embedded = false }) => {
  const navigate = useNavigate();
  const { user, isLoading: authLoading } = useAuth();
  const { favorites, isLoading: favoritesLoading, refreshFavorites } = useFavorites();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const stats = useMemo(() => {
    let withPriceReduction = 0;
    let unavailable = 0;

    favorites.forEach((fav) => {
      if (fav.ad.price < fav.priceAtFavorite) {
        withPriceReduction++;
      }

      if (['SOLD', 'PAUSED', 'BLOCKED', 'EXPIRED'].includes(fav.ad.status)) {
        unavailable++;
      }
    });

    return {
      total: favorites.length,
      withPriceReduction,
      unavailable,
    };
  }, [favorites]);

  const handleSelect = (id: string) => {
    setSelectedIds((prev) => {
      if (prev.includes(id)) {
        return prev.filter((selectedId) => selectedId !== id);
      }

      if (prev.length >= 4) {
        return prev;
      }

      return [...prev, id];
    });
  };

  const handleRemove = async () => {
    await refreshFavorites();
  };

  const handleCompare = () => {
    const canCompare = selectedIds.length >= 2 && selectedIds.length <= 4;
    if (canCompare) {
      alert(`Comparando ${selectedIds.length} anúncios selecionados`);
    }
  };

  const handleSelectAll = () => {
    if (selectedIds.length === favorites.length) {
      setSelectedIds([]);
      return;
    }

    setSelectedIds(favorites.slice(0, 4).map((favorite) => favorite.id));
  };

  if (authLoading || favoritesLoading) {
    const loader = (
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="w-8 h-8 text-green-600 animate-spin" />
        <p className="text-sm text-slate-600">Carregando favoritos...</p>
      </div>
    );

    return embedded ? (
      <div className="bg-white border border-slate-200 rounded-2xl p-12 flex items-center justify-center">
        {loader}
      </div>
    ) : (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">{loader}</div>
    );
  }

  if (!user) {
    const loginBlock = (
      <div className="text-center space-y-4">
        <Heart className="w-16 h-16 text-slate-300 mx-auto" />
        <div>
          <p className="text-lg font-semibold text-slate-700 mb-2">Faça login para acessar seus favoritos</p>
          <p className="text-sm text-slate-500">Você precisa estar autenticado para visualizar seus favoritos.</p>
        </div>
        <button
          onClick={() => navigate('/login')}
          className="px-6 py-2.5 bg-green-700 text-white font-semibold rounded-lg hover:bg-green-800 transition-colors"
        >
          Fazer login
        </button>
      </div>
    );

    return embedded ? (
      <div className="bg-white border border-slate-200 rounded-2xl p-12">{loginBlock}</div>
    ) : (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">{loginBlock}</div>
    );
  }

  const content = (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-2xl p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Meus Favoritos</h1>
            <p className="text-sm text-slate-500 mt-2">
              Acompanhe os anúncios salvos, variações de preço e indisponibilidades em um só lugar.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full lg:w-auto">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 min-w-[150px]">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Favoritos</p>
              <p className="text-xl font-bold text-slate-900 mt-1">{stats.total}</p>
            </div>
            <div className="rounded-2xl border border-green-100 bg-green-50 px-4 py-3 min-w-[150px]">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-green-700">Preço reduzido</p>
              <p className="text-xl font-bold text-green-700 mt-1">{stats.withPriceReduction}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 min-w-[150px]">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Indisponíveis</p>
              <p className="text-xl font-bold text-slate-900 mt-1">{stats.unavailable}</p>
            </div>
          </div>
        </div>
      </div>

      {favorites.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={handleSelectAll}
              className="text-sm text-slate-600 hover:text-green-700 font-medium transition-colors"
            >
              {selectedIds.length === favorites.length ? 'Desmarcar todos' : 'Selecionar todos'}
            </button>

            {selectedIds.length > 0 && (
              <span className="text-sm text-slate-500">
                {selectedIds.length} selecionado{selectedIds.length > 1 ? 's' : ''}
              </span>
            )}
          </div>

          {selectedIds.length >= 2 && selectedIds.length <= 4 && (
            <button
              onClick={handleCompare}
              className="inline-flex items-center gap-2 px-4 py-2 bg-green-700 text-white text-sm font-semibold rounded-xl hover:bg-green-800 transition-colors"
            >
              <GitCompare className="w-4 h-4" strokeWidth={1.5} />
              Comparar selecionados ({selectedIds.length})
            </button>
          )}
        </div>
      )}

      {favorites.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-12 flex flex-col items-center justify-center text-center text-slate-500">
          <Inbox className="w-14 h-14 mb-4 text-slate-300" strokeWidth={1.5} />
          <h3 className="text-lg font-semibold text-slate-700 mb-2">Nenhum favorito ainda</h3>
          <p className="text-sm max-w-md mb-6">
            Explore nossos anúncios e clique no ícone de coração para salvar seus favoritos aqui.
          </p>
          <button
            onClick={() => navigate('/anuncios')}
            className="px-6 py-2.5 bg-green-700 text-white font-semibold rounded-xl hover:bg-green-800 transition-colors"
          >
            Explorar anúncios
          </button>
        </div>
      ) : (
        <AnimatePresence mode="popLayout">
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {favorites.map((favorite) => (
              <FavoriteCard
                key={favorite.id}
                favorite={favorite}
                userId={user.id}
                isSelected={selectedIds.includes(favorite.id)}
                onSelect={handleSelect}
                onRemove={handleRemove}
                compact
              />
            ))}
          </div>
        </AnimatePresence>
      )}

      {favorites.length > 0 && stats.withPriceReduction > 0 && (
        <div className="rounded-2xl border border-green-100 bg-green-50 p-5 flex items-start gap-3">
          <TrendingDown className="w-5 h-5 text-green-700 mt-0.5" strokeWidth={1.5} />
          <div>
            <p className="text-sm font-semibold text-slate-900">Você tem anúncios com preço reduzido</p>
            <p className="text-sm text-slate-600 mt-1">
              Acompanhe seus favoritos com desconto para agir mais rápido quando surgir uma boa oportunidade.
            </p>
          </div>
        </div>
      )}
    </div>
  );

  if (embedded) {
    return content;
  }

  return <div className="min-h-screen bg-slate-50 py-8"><div className="container mx-auto px-4">{content}</div></div>;
};

export default FavoritesView;
