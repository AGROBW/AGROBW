import React from 'react';
import { Link } from 'react-router-dom';
import HomeAdsCarousel from './HomeAdsCarousel';
import NewsCard from './NewsCard';
import { useNews } from '../src/hooks/useNews';
import { useLayout } from '../src/contexts/LayoutContext';

const NewsGrid: React.FC = () => {
  const { news, isLoading } = useNews();
  const { settings } = useLayout();

  return (
    <HomeAdsCarousel
      title="Mural de Informações AGRO BW"
      subtitle="Fique por dentro das principais notícias e tendências do agronegócio que impactam o seu dia a dia no campo."
      items={news}
      isLoading={isLoading}
      emptyMessage="Nenhuma notícia disponível no momento."
      skeletonCount={3}
      sectionClassName="border-y py-16"
      sectionStyle={{
        borderColor: 'rgba(226,232,240,0.7)',
        backgroundColor: `color-mix(in srgb, ${settings.backgroundColor} 86%, white)`,
      }}
      headerAction={
        <Link
          to="/noticias"
          className="border-b pb-1 text-sm font-semibold uppercase tracking-widest transition-all"
          style={{ borderColor: settings.secondaryColor, color: settings.secondaryColor }}
        >
          Ver todas as matérias
        </Link>
      }
      renderItem={(item) => <NewsCard key={item.id} news={item} />}
    />
  );
};

export default NewsGrid;
