import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Compass } from 'lucide-react';
import PageSeo from '../components/PageSeo';
import { buildSeoMetadata } from '../src/lib/seo/buildSeoMetadata';

// SEO puro do 404: noindex + canonical da PRÓPRIA URL solicitada (nunca uma URL
// fixa /404 inexistente, que faria todas as páginas ausentes apontarem para ela).
export const buildNotFoundSeo = (pathname: string) =>
  buildSeoMetadata({
    title: 'Página não encontrada',
    description:
      'A página que você procura não existe ou foi removida. Volte para a home ou explore anúncios e categorias na AGRO BW.',
    path: pathname || '/',
    noIndex: true,
  });

// Página real de conteúdo inexistente (404). noindex, sem redirect automático.
// O status HTTP 404 real é emitido pelo servidor (modo document, Fase 2B).
const NotFoundView: React.FC = () => {
  const { pathname } = useLocation();
  const seo = buildNotFoundSeo(pathname);
  return (
  <main className="min-h-[70vh] flex flex-col items-center justify-center bg-slate-50 px-4 py-16 text-center">
    <PageSeo meta={seo} />
    <Compass className="h-12 w-12 text-green-600" strokeWidth={1.5} />
    <p className="mt-6 text-6xl font-black text-slate-300">404</p>
    <h1 className="mt-2 text-2xl font-bold text-slate-900">Página não encontrada</h1>
    <p className="mt-2 max-w-md text-sm leading-6 text-slate-500">
      A página que você procura não existe ou foi removida. Confira o endereço ou continue navegando.
    </p>
    <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
      <Link
        to="/"
        className="rounded-2xl bg-green-600 px-5 py-3 text-sm font-bold text-white hover:bg-green-700"
      >
        Início
      </Link>
      <Link
        to="/anuncios"
        className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50"
      >
        Ver anúncios
      </Link>
      <Link
        to="/categorias"
        className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50"
      >
        Categorias
      </Link>
    </div>
  </main>
  );
};

export default NotFoundView;
