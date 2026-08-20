import React from 'react';
import { ArrowRight } from 'lucide-react';
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
      title="Notícias do Agro"
      subtitle="Informação prática sobre mercado, produção e tecnologia no campo"
      eyebrow="Conteúdo para decidir melhor"
      items={news}
      isLoading={isLoading}
      emptyMessage="Nenhuma notícia disponível no momento."
      skeletonCount={3}
      sectionClassName="border-y py-8 lg:py-10"
      sectionStyle={{
        borderColor: 'rgba(226,232,240,0.7)',
        backgroundColor: `color-mix(in srgb, ${settings.backgroundColor} 86%, white)`,
      }}
      headerAction={
        <Link
          to="/noticias"
          className="inline-flex items-center gap-2 text-sm font-semibold transition hover:underline"
          style={{ color: settings.primaryColor }}
        >
          Ver todas as notícias
          <ArrowRight className="h-4 w-4" strokeWidth={1.8} />
        </Link>
      }
      renderItem={(item) => <NewsCard key={item.id} news={item} />}
    />
  );
};

export default NewsGrid;
