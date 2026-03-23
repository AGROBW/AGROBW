import React from 'react';
import { ArrowRight } from 'lucide-react';
import { NewsItem } from '../types';
import { getNewsEditorialCategoryStyle } from '../src/utils/newsEditorialCategory';

interface NewsCardProps {
  news: NewsItem;
}

const NewsCard: React.FC<NewsCardProps> = ({ news }) => {
  const badgeStyle = getNewsEditorialCategoryStyle(news.category);
  const linkColor = badgeStyle.color === '#ffffff' ? '#0f766e' : badgeStyle.color;
  const formattedDate = news.date
    ? new Date(news.date).toLocaleDateString('pt-BR')
    : '';

  return (
    <a
      href={news.link}
      className="group block h-full overflow-hidden rounded-xl border border-slate-100 bg-white transition-all duration-300"
    >
      <div className="relative h-40 overflow-hidden">
        <img
          src={news.imageUrl}
          alt={news.title}
          className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-110"
        />
        <div
          className="absolute left-3 top-3 z-10 rounded-md px-2.5 py-1 text-[10px] font-semibold uppercase tracking-widest"
          style={{ background: badgeStyle.background, color: badgeStyle.color }}
        >
          {news.category}
        </div>
        <div className="absolute inset-0 bg-black/5 transition-colors group-hover:bg-transparent" />
      </div>

        <div className="p-5">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          {formattedDate}
        </p>
        <h3 className="mb-2 line-clamp-2 text-sm font-semibold leading-tight text-slate-800 transition-colors group-hover:opacity-90">
          {news.title}
        </h3>
        <p className="line-clamp-2 text-sm leading-relaxed text-slate-500">
          {news.summary}
        </p>

        <div
          className="mt-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest opacity-0 transition-opacity group-hover:opacity-100"
          style={{ color: linkColor }}
        >
          Ler notícia completa
          <ArrowRight className="h-4 w-4" strokeWidth={1.5} />
        </div>
      </div>
    </a>
  );
};

export default NewsCard;
