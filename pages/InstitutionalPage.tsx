import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { usePages, InstitutionalPage as Page } from '../src/hooks/usePages';
import { sanitizeRichTextHtml } from '../src/utils/sanitizeRichTextHtml';
import PageSeo from '../components/PageSeo';
import { buildSeoMetadata } from '../src/lib/seo/buildSeoMetadata';
import { buildBreadcrumbJsonLd, buildWebPageJsonLd } from '../src/lib/seo/jsonLd';
import NotFoundView from './NotFoundView';
import ContentUnavailable from '../components/ContentUnavailable';

type FetchStatus = 'loading' | 'found' | 'not_found' | 'error';

const InstitutionalPage: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const { getPageBySlug } = usePages();

  const [page, setPage] = useState<Page | null>(null);
  const [status, setStatus] = useState<FetchStatus>('loading');

  useEffect(() => {
    let cancelled = false;

    const fetchPage = async () => {
      if (!slug) {
        if (!cancelled) setStatus('not_found');
        return;
      }

      setStatus('loading');
      const result = await getPageBySlug(slug);
      if (cancelled) return;

      if (result.status === 'found') {
        setPage(result.page);
        setStatus('found');
      } else {
        // 'not_found' → NotFoundView (404); 'error' → indisponível (nunca 404).
        setStatus(result.status);
      }
    };

    void fetchPage();
    return () => {
      cancelled = true;
    };
  }, [slug, getPageBySlug]);

  if (status === 'loading') {
    return (
      <main className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="mx-auto mb-4 h-12 w-12 animate-spin text-green-600" />
          <p className="text-slate-600">Carregando página...</p>
        </div>
      </main>
    );
  }

  if (status === 'error') {
    // Erro transitório numa página /p/:slug: canonical da própria rota + noIndex
    // (o servidor devolve 503 para este caso dinâmico).
    return <ContentUnavailable canonicalPath={`/p/${slug ?? ''}`} noIndex />;
  }

  if (status === 'not_found' || !page) {
    return <NotFoundView />;
  }

  const sanitizedContent = sanitizeRichTextHtml(page.content);

  const canonicalPath = `/p/${page.slug || slug}`;
  const seo = buildSeoMetadata({
    title: page.meta_title || page.title,
    description: page.content || `${page.title} — página institucional da AGRO BW.`,
    path: canonicalPath,
  });
  const seoJsonLd = [
    buildWebPageJsonLd({ name: page.title, description: seo.description, path: canonicalPath }),
    buildBreadcrumbJsonLd([
      { name: 'Início', path: '/' },
      { name: page.title, path: canonicalPath },
    ]),
  ];

  return (
    <main className="min-h-screen bg-slate-50 py-12">
      <PageSeo meta={seo} jsonLdId="institutional-page" jsonLd={seoJsonLd} />
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
        <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 bg-gradient-to-br from-green-50 to-white p-8">
            <h1 className="mb-2 text-3xl font-bold text-slate-900 md:text-4xl">{page.title}</h1>
            <p className="text-sm text-slate-500">
              Última atualização:{' '}
              {new Date(page.updated_at).toLocaleDateString('pt-BR', {
                day: '2-digit',
                month: 'long',
                year: 'numeric',
              })}
            </p>
          </div>

          <div className="p-8">
            <div
              className="prose prose-lg max-w-none prose-slate
                prose-headings:font-bold prose-headings:text-slate-900
                prose-h1:mb-4 prose-h1:text-3xl
                prose-h2:mb-3 prose-h2:mt-8 prose-h2:text-2xl
                prose-h3:mb-2 prose-h3:mt-6 prose-h3:text-xl
                prose-p:mb-4 prose-p:leading-relaxed prose-p:text-slate-700
                prose-a:font-semibold prose-a:text-green-600 hover:prose-a:text-green-700
                prose-strong:font-bold prose-strong:text-slate-900
                prose-ul:mb-4 prose-ul:list-disc prose-ul:pl-6
                prose-ol:mb-4 prose-ol:list-decimal prose-ol:pl-6
                prose-li:mb-2 prose-li:text-slate-700"
              dangerouslySetInnerHTML={{ __html: sanitizedContent }}
            />
          </div>
        </article>
      </div>
    </main>
  );
};

export default InstitutionalPage;
