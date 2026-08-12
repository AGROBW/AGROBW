import React from 'react';
import { Clock, RefreshCw } from 'lucide-react';
import PageSeo from './PageSeo';
import { buildSeoMetadata } from '../src/lib/seo/buildSeoMetadata';

// Estado neutro para FALHA TRANSITÓRIA (rede/Supabase) e para documentos legais
// fixos sem conteúdo. NÃO é 404. Aplica metadados PRÓPRIOS (título/description/
// canonical/robots) para não conservar os da página anterior durante a
// navegação SPA. O status HTTP (200 rota fixa; 503 dinâmico com erro) é decidido
// no servidor.
//  - /p/:slug com erro transitório: canonicalPath da rota atual + noIndex.
//  - documentos legais (Opção A): canonicalPath da rota legal + index,follow.
type ContentUnavailableProps = {
  title?: string;
  message?: string;
  canonicalPath?: string;
  noIndex?: boolean;
  showRetry?: boolean;
};

const ContentUnavailable: React.FC<ContentUnavailableProps> = ({
  title = 'Conteúdo temporariamente indisponível',
  message = 'Não foi possível carregar este conteúdo agora. Tente novamente em instantes.',
  canonicalPath = '/',
  noIndex = false,
  showRetry = true,
}) => {
  const seo = buildSeoMetadata({
    title,
    description: message,
    path: canonicalPath,
    noIndex,
  });

  return (
    <main className="min-h-[60vh] flex flex-col items-center justify-center bg-slate-50 px-4 py-16 text-center">
      <PageSeo meta={seo} />
      <Clock className="h-12 w-12 text-slate-400" strokeWidth={1.5} />
      <h1 className="mt-6 text-2xl font-bold text-slate-900">{title}</h1>
      <p className="mt-2 max-w-md text-sm leading-6 text-slate-500">{message}</p>
      {showRetry ? (
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-8 inline-flex items-center gap-2 rounded-2xl bg-green-600 px-5 py-3 text-sm font-bold text-white hover:bg-green-700"
        >
          <RefreshCw className="h-4 w-4" strokeWidth={2} />
          Tentar novamente
        </button>
      ) : null}
    </main>
  );
};

export default ContentUnavailable;
