// Domínio canônico fixo. NUNCA derivado de env — evita que deployments de
// preview da Vercel (ou qualquer outro host) gerem canonical/og fora do
// domínio oficial.
export const CANONICAL_SITE_URL = 'https://agrobw.com.br';

// URL do site para finalidades gerais (ex.: redirect de auth), que pode variar
// por ambiente via VITE_APP_URL. Não use isto para canonical.
export const DEFAULT_SITE_URL =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_APP_URL) ||
  CANONICAL_SITE_URL;

// Imagem social padrão única (deve existir em /public com 1200x630).
export const DEFAULT_OG_IMAGE_PATH = '/og-default.png';
export const DEFAULT_OG_IMAGE_URL = `${CANONICAL_SITE_URL}${DEFAULT_OG_IMAGE_PATH}`;

// Só a imagem padrão tem dimensões conhecidas (1200x630). Imagens dinâmicas
// (anúncios/notícias/lojas) não devem declarar dimensões fixas.
export const isDefaultOgImage = (imageUrl: string): boolean => imageUrl === DEFAULT_OG_IMAGE_URL;

// URL absoluta para finalidades gerais (ancorada no DEFAULT_SITE_URL/env).
// Mantida para compatibilidade com fluxos como o redirect de redefinição de senha.
export const buildAbsoluteSiteUrl = (path = '/') => {
  try {
    return new URL(path, DEFAULT_SITE_URL).toString();
  } catch {
    return DEFAULT_SITE_URL;
  }
};

// Canonical / og:url DETERMINÍSTICO: sempre no domínio canônico e apenas com o
// pathname — query string e hash são descartados, evitando que parâmetros de
// rastreamento, filtros ou fragmentos gerem canonicals divergentes. Força o
// host agrobw.com.br mesmo com entrada absoluta de outro domínio.
export const buildCanonicalSiteUrl = (pathOrUrl = '/') => {
  try {
    const parsed = new URL(pathOrUrl, CANONICAL_SITE_URL);
    return new URL(parsed.pathname, CANONICAL_SITE_URL).toString();
  } catch {
    return CANONICAL_SITE_URL;
  }
};

// Resolve a imagem social: caminhos relativos são ancorados no domínio canônico;
// URLs absolutas externas (ex.: Supabase Storage) são preservadas. Sem imagem
// válida, retorna a imagem padrão.
export const resolveSeoImageUrl = (image?: string | null) => {
  const value = (image || '').trim();
  try {
    return new URL(value || DEFAULT_OG_IMAGE_PATH, CANONICAL_SITE_URL).toString();
  } catch {
    return new URL(DEFAULT_OG_IMAGE_PATH, CANONICAL_SITE_URL).toString();
  }
};
