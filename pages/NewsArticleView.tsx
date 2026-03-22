import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { supabase } from '../src/lib/supabaseClient';
import { useLayout } from '../src/contexts/LayoutContext';

const NewsArticleView: React.FC = () => {
  const { slug } = useParams();
  const { settings } = useLayout();
  const [article, setArticle] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchArticle = async () => {
      setIsLoading(true);
      const { data } = await supabase
        .from('news_articles')
        .select(`
          *,
          news_article_sources (
            source_url,
            portal_name,
            original_title,
            original_published_at
          ),
          news_ingestions (
            original_portal_name
          )
        `)
        .eq('slug', slug)
        .eq('status', 'published')
        .maybeSingle();

      setArticle(data || null);
      setIsLoading(false);
    };

    fetchArticle();
  }, [slug]);

  if (isLoading) {
    return <div className="min-h-screen bg-slate-50 p-10 text-center text-slate-500">Carregando matéria...</div>;
  }

  if (!article) {
    return <div className="min-h-screen bg-slate-50 p-10 text-center text-slate-500">Matéria não encontrada.</div>;
  }

  const sources = article.news_article_sources || [];

  return (
    <div className="min-h-screen bg-slate-50 py-16">
      <div className="mx-auto max-w-4xl px-4">
        <Link to="/noticias" className="mb-8 inline-flex items-center gap-2 text-sm font-bold text-slate-600" style={{ ['--news-link-color' as any]: settings.primaryColor }}>
          <ChevronLeft className="h-4 w-4" />
          Voltar para notícias
        </Link>

        <article className="overflow-hidden rounded-[2rem] border border-slate-100 bg-white shadow-sm">
          {article.featured_image_url ? (
            <div className="h-72 bg-slate-100 md:h-[420px]">
              <img src={article.featured_image_url} alt={article.title} className="h-full w-full object-cover" />
            </div>
          ) : null}

          <div className="p-8 md:p-10">
            <p className="text-xs font-black uppercase tracking-[0.25em]" style={{ color: settings.primaryColor }}>
              {article.news_ingestions?.original_portal_name || 'Notícias AGRO BW'}
            </p>
            <h1 className="mt-4 text-4xl font-black leading-tight text-slate-900">{article.title}</h1>
            {article.subtitle ? <p className="mt-4 text-lg text-slate-500">{article.subtitle}</p> : null}
            <div className="mt-6 text-sm text-slate-400">
              {article.published_at ? new Date(article.published_at).toLocaleDateString('pt-BR') : ''}
            </div>

            {article.summary ? (
              <div className="mt-8 rounded-2xl border border-slate-100 bg-slate-50 px-5 py-4 text-base leading-relaxed text-slate-700">
                {article.summary}
              </div>
            ) : null}

            {article.content ? (
              <div className="prose prose-slate mt-8 max-w-none whitespace-pre-line text-slate-700">
                {article.content}
              </div>
            ) : null}

            {article.agro_impact ? (
              <div className="mt-10 rounded-2xl border px-6 py-5" style={{ borderColor: `color-mix(in srgb, ${settings.primaryColor} 18%, white)`, backgroundColor: `color-mix(in srgb, ${settings.primaryColor} 8%, white)` }}>
                <h2 className="text-lg font-black text-slate-900">Impacto no Agro</h2>
                <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-slate-700">{article.agro_impact}</p>
              </div>
            ) : null}

            <div className="mt-10 rounded-2xl border border-slate-100 bg-slate-50 px-6 py-5">
              <h2 className="text-lg font-black text-slate-900">Fontes e referências</h2>
              {article.references_block ? (
                <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-slate-700">{article.references_block}</p>
              ) : null}
              {sources.length > 0 ? (
                <ul className="mt-4 space-y-2 text-sm text-slate-600">
                  {sources.map((source: any, index: number) => (
                    <li key={`${source.source_url}-${index}`}>
                      <a href={source.source_url} target="_blank" rel="noreferrer" className="font-semibold hover:underline" style={{ color: settings.primaryColor }}>
                        {source.portal_name || source.source_url}
                      </a>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </div>
        </article>
      </div>
    </div>
  );
};

export default NewsArticleView;
