import React, { useEffect, useState } from 'react';
import { useParams, Navigate } from 'react-router-dom';
import { usePages, InstitutionalPage as Page } from '../src/hooks/usePages';
import { Loader2, FileX } from 'lucide-react';
import Header from '../components/Header';
import Footer from '../components/Footer';

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

  // Loading state
  if (isLoading) {
    return (
      <>
        <Header />
        <main className="min-h-screen bg-slate-50 flex items-center justify-center">
          <div className="text-center">
            <Loader2 className="w-12 h-12 text-green-600 animate-spin mx-auto mb-4" />
            <p className="text-slate-600">Carregando página...</p>
          </div>
        </main>
        <Footer />
      </>
    );
  }

  // 404 - Redirect to home
  if (notFound || !page) {
    return <Navigate to="/" replace />;
  }

  return (
    <>
      <Header />
      
      <main className="min-h-screen bg-slate-50 py-12">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <article className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            {/* Header */}
            <div className="border-b border-slate-200 bg-gradient-to-br from-green-50 to-white p-8">
              <h1 className="text-3xl md:text-4xl font-bold text-slate-900 mb-2">
                {page.title}
              </h1>
              <p className="text-sm text-slate-500">
                Última atualização:{' '}
                {new Date(page.updated_at).toLocaleDateString('pt-BR', {
                  day: '2-digit',
                  month: 'long',
                  year: 'numeric'
                })}
              </p>
            </div>

            {/* Conteúdo */}
            <div className="p-8">
              <div
                className="prose prose-slate prose-lg max-w-none
                  prose-headings:font-bold prose-headings:text-slate-900
                  prose-h1:text-3xl prose-h1:mb-4
                  prose-h2:text-2xl prose-h2:mt-8 prose-h2:mb-3
                  prose-h3:text-xl prose-h3:mt-6 prose-h3:mb-2
                  prose-p:text-slate-700 prose-p:leading-relaxed prose-p:mb-4
                  prose-a:text-green-600 prose-a:font-semibold hover:prose-a:text-green-700
                  prose-strong:text-slate-900 prose-strong:font-bold
                  prose-ul:list-disc prose-ul:pl-6 prose-ul:mb-4
                  prose-ol:list-decimal prose-ol:pl-6 prose-ol:mb-4
                  prose-li:text-slate-700 prose-li:mb-2"
                dangerouslySetInnerHTML={{ __html: page.content }}
              />
            </div>
          </article>
        </div>
      </main>

      <Footer />
    </>
  );
};

export default InstitutionalPage;
