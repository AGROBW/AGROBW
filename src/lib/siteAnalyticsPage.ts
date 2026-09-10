import { isAnnouncementUuid } from './announcementUrl';

export type SiteAnalyticsPage = {
  pageType: string;
  pageLabel: string;
  entityId: string | null;
  entityKey: string | null;
};

const staticMap: Record<string, { pageType: string; pageLabel: string }> = {
  '/': { pageType: 'home', pageLabel: 'Home' },
  '/anuncios': { pageType: 'ads_listing', pageLabel: 'Listagem de anúncios' },
  '/categorias': { pageType: 'categories', pageLabel: 'Categorias' },
  '/planos': { pageType: 'pricing', pageLabel: 'Planos' },
  '/lojas-parceiras': { pageType: 'partner_stores', pageLabel: 'Lojas parceiras' },
  '/contato': { pageType: 'contact', pageLabel: 'Contato' },
  '/quem-somos': { pageType: 'about', pageLabel: 'Quem somos' },
  '/privacidade': { pageType: 'privacy', pageLabel: 'Privacidade' },
  '/politica-de-cookies': { pageType: 'cookies_policy', pageLabel: 'Politica de cookies' },
  '/politica-de-precos': { pageType: 'pricing_policy', pageLabel: 'Politica de precos' },
  '/termos-de-uso': { pageType: 'terms', pageLabel: 'Termos de uso' },
  '/noticias': { pageType: 'news_listing', pageLabel: 'Notícias' },
  '/login': { pageType: 'login', pageLabel: 'Login' },
  '/cadastro': { pageType: 'register', pageLabel: 'Cadastro' },
};

export const describeSiteAnalyticsPage = (pathname: string): SiteAnalyticsPage => {
  const normalized = pathname || '/';

  if (normalized.startsWith('/anuncio/')) {
    const identifier = normalized.split('/')[2] || null;
    return {
      pageType: 'announcement',
      pageLabel: 'Detalhe do anúncio',
      entityId: isAnnouncementUuid(identifier) ? identifier : null,
      entityKey: identifier && !isAnnouncementUuid(identifier) ? identifier : null,
    };
  }

  if (normalized.startsWith('/loja/')) {
    return {
      pageType: 'storefront',
      pageLabel: 'Loja parceira',
      entityId: null,
      entityKey: normalized.split('/')[2] || null,
    };
  }

  if (normalized.startsWith('/noticias/')) {
    return {
      pageType: 'news_article',
      pageLabel: 'Notícia',
      entityId: null,
      entityKey: normalized.split('/')[2] || null,
    };
  }

  if (normalized.startsWith('/minha-conta')) {
    return {
      pageType: 'account',
      pageLabel: 'Minha conta',
      entityId: null,
      entityKey: null,
    };
  }

  return {
    pageType: staticMap[normalized]?.pageType || 'page',
    pageLabel: staticMap[normalized]?.pageLabel || normalized,
    entityId: null,
    entityKey: null,
  };
};
