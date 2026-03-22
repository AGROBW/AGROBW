import React, { useEffect, useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { usePages, InstitutionalPage as Page } from '../src/hooks/usePages';

const InstitutionalPage: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const { getPageBySlug } = usePages();

  const [page, setPage] = useState<Page | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    const fetchPage = async () => {
      if (!slug) {
        setNotFound(true);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      try {
        const data = await getPageBySlug(slug);
        if (!data) {
          setNotFound(true);
        } else {
          setPage(data);
        }
      } catch (error) {
        console.error('Erro ao carregar página:', error);
        setNotFound(true);
      } finally {
        setIsLoading(false);
      }
    };

    fetchPage();
  }, [slug, getPageBySlug]);

  if (isLoading) {
    return (
      <main className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="mx-auto mb-4 h-12 w-12 animate-spin text-green-600" />
          <p className="text-slate-600">Carregando página...</p>
        </div>
      </main>
    );
  }

  if (notFound || !page) {
    return <Navigate to="/" replace />;
  }

  return (
    <main className="min-h-screen bg-slate-50 py-12">
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
              dangerouslySetInnerHTML={{ __html: page.content }}
            />
          </div>
        </article>
      </div>
    </main>
  );
};

export default InstitutionalPage;
