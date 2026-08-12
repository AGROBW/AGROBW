// Fonte CANÔNICA ÚNICA do SEO da Home, compartilhada por pages/Home.tsx (SeoHead,
// bundle Vite) e api/og-loja.mjs (OG social, Function Node). Garante que
// navegador, Google e compartilhamento social usem exatamente o MESMO título e
// descrição — sem divergência silenciosa entre superfícies.
//
// Módulo puro, sem APIs de Node nem de browser (nada de import.meta/env, fs,
// window/document) → seguro para o bundle do Vite e para o runtime da Function.

// Título-base: o SeoHead (client) acrescenta " | AGRO BW" via applyBrandSuffix.
export const HOME_SEO_TITLE_BASE = 'Marketplace rural para comprar e vender no agronegócio';

// Descrição única (navegador, Google e OG social).
export const HOME_SEO_DESCRIPTION =
  'Encontre anúncios rurais, negocie com produtores e lojas parceiras e anuncie grátis no marketplace da AGRO BW.';

export const BRAND_SUFFIX = ' | AGRO BW';

// Título final já com o sufixo de marca — usado pelo og:title social (og-loja),
// deve ser idêntico ao applyBrandSuffix(HOME_SEO_TITLE_BASE) do SeoHead
// (garantido por teste).
export const HOME_SEO_TITLE_FULL = `${HOME_SEO_TITLE_BASE}${BRAND_SUFFIX}`;
