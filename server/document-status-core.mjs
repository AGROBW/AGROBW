// Núcleo PURO de classificação de rota e status HTTP para o Lote 3 (404/410/503
// reais). SEM I/O, SEM Supabase, SEM Vercel. Decide, a partir do pathname, se a
// rota é estática/privada/técnica/categoria/dinâmica/desconhecida e qual status
// aplicar. Conteúdo dinâmico depende de uma consulta (feita fora daqui, na Fase 2);
// este núcleo só mapeia o RESULTADO simbólico da consulta em status.
//
// Regras aprovadas (matriz final):
//   estática válida / categoria canônica / dinâmico elegível → 200
//   categoria desconhecida / conteúdo ausente ou oculto por RLS / rota
//     totalmente desconhecida → 404
//   falha/timeout de infraestrutura → 503 (NUNCA 404/410)
//   410 → NÃO implementar sem tombstone confiável (ausente nesta fase)
//
// Reusa CATEGORY_SLUGS/RESERVED_CMS_SLUGS do sitemap-core para consistência.

import { CATEGORY_SLUGS, RESERVED_CMS_SLUGS } from './sitemap-core.mjs';

export const CANONICAL_CATEGORY_SLUGS = [...CATEGORY_SLUGS];
const CANONICAL_CATEGORY_SET = new Set(CANONICAL_CATEGORY_SLUGS);

// Rotas públicas estáticas fixas (sempre 200). /admin/login é coberto pelo
// prefixo privado /admin (também passthrough 200).
export const STATIC_ROUTES = new Set([
  '/',
  '/anuncios',
  '/categorias',
  '/planos',
  '/vitrine',
  '/patrocinador',
  '/lojas-parceiras',
  '/contato',
  '/noticias',
  '/quem-somos',
  '/termos-de-uso',
  '/privacidade',
  '/politica-de-cookies',
  '/politica-de-precos',
  '/login',
  '/cadastro',
  '/redefinir-senha',
]);

// Privadas/autenticadas: passthrough 200 (SPA + auth client-side). NUNCA podem
// virar 404 por falta de sessão. Duas famílias (conforme App.tsx):
//  - árvore: aceitam subrotas (/admin/* e /minha-conta/*);
//  - exatas: só a rota literal (/anunciar, /mensagens, /favoritos). Um
//    descendente como /anunciar/x NÃO existe e deve cair no catch-all → 404.
export const PRIVATE_TREE_PREFIXES = ['/minha-conta', '/admin'];
export const PRIVATE_EXACT_ROUTES = new Set(['/anunciar', '/mensagens', '/favoritos']);

// Técnicas/estáticas que ficam FORA do validador (servidas pela plataforma).
const EXCLUDED_EXACT = new Set(['/robots.txt', '/sitemap.xml', '/favicon.ico', '/meta-oauth-callback.html']);

// Slug restritivo: minúsculas/dígitos com hífens simples internos, sem
// acento/maiúscula/_/./%/espaço/barra, sem hífen no início/fim/duplicado.
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SLUG_MAX = 200;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isValidSlug = (slug) =>
  typeof slug === 'string' && slug.length > 0 && slug.length <= SLUG_MAX && SLUG_RE.test(slug);

export const isValidUuid = (id) => typeof id === 'string' && UUID_RE.test(id);

export const isCanonicalCategory = (slug) => CANONICAL_CATEGORY_SET.has(slug);

// Normaliza para o pathname: remove hash e query; se vier URL absoluta, extrai o
// caminho. Query/hash NUNCA alteram a classificação.
export const normalizePathname = (input) => {
  if (typeof input !== 'string' || input.length === 0) return '/';
  let p = input;

  const hashIdx = p.indexOf('#');
  if (hashIdx !== -1) p = p.slice(0, hashIdx);
  const queryIdx = p.indexOf('?');
  if (queryIdx !== -1) p = p.slice(0, queryIdx);

  const schemeIdx = p.indexOf('://');
  if (schemeIdx !== -1) {
    const afterScheme = p.slice(schemeIdx + 3);
    const slashIdx = afterScheme.indexOf('/');
    p = slashIdx === -1 ? '/' : afterScheme.slice(slashIdx);
  }

  if (p === '' || p[0] !== '/') p = `/${p}`;
  return p;
};

const isExcluded = (path) =>
  path === '/api' || path.startsWith('/api/') || path.startsWith('/assets/') || EXCLUDED_EXACT.has(path);

const isPrivate = (path) =>
  PRIVATE_EXACT_ROUTES.has(path) ||
  PRIVATE_TREE_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));

// Cada dinâmico casa UM único segmento após a base ([^/]+ barra encoding/traversal
// que introduzam barras; o validador de slug/uuid rejeita o resto).
const RE_AD = /^\/anuncio\/([^/]+)$/;
const RE_STORE = /^\/loja\/([^/]+)$/;
const RE_NEWS = /^\/noticias\/([^/]+)$/;
const RE_CMS = /^\/p\/([^/]+)$/;
const RE_CATEGORY = /^\/categoria\/([^/]+)$/;

/**
 * Classifica o pathname. Retorna:
 *  { kind, needsDb, status?, type?, id?, slug? }
 * - needsDb=false → status já definido (200 ou 404); NUNCA consulta banco.
 * - needsDb=true  → rota dinâmica elegível em formato; status vem de
 *   mapOutcomeToStatus(outcome) após a consulta (Fase 2).
 * 410 nunca é produzido.
 */
export const classifyRoute = (input) => {
  const path = normalizePathname(input);

  if (isExcluded(path)) return { kind: 'excluded', needsDb: false, status: 200 };
  if (STATIC_ROUTES.has(path)) return { kind: 'static', needsDb: false, status: 200 };
  if (isPrivate(path)) return { kind: 'private', needsDb: false, status: 200 };

  let match;

  if ((match = RE_CATEGORY.exec(path))) {
    const slug = match[1];
    if (isValidSlug(slug) && isCanonicalCategory(slug)) {
      return { kind: 'category', needsDb: false, status: 200, slug };
    }
    // Categoria desconhecida/malformada → 404 SEM consultar banco.
    return { kind: 'category-invalid', needsDb: false, status: 404 };
  }

  if ((match = RE_AD.exec(path))) {
    const id = match[1];
    return isValidUuid(id)
      ? { kind: 'dynamic', needsDb: true, type: 'ad', id }
      : { kind: 'invalid', needsDb: false, status: 404 };
  }

  if ((match = RE_STORE.exec(path))) {
    const slug = match[1];
    return isValidSlug(slug)
      ? { kind: 'dynamic', needsDb: true, type: 'store', slug }
      : { kind: 'invalid', needsDb: false, status: 404 };
  }

  if ((match = RE_NEWS.exec(path))) {
    const slug = match[1];
    return isValidSlug(slug)
      ? { kind: 'dynamic', needsDb: true, type: 'news', slug }
      : { kind: 'invalid', needsDb: false, status: 404 };
  }

  if ((match = RE_CMS.exec(path))) {
    const slug = match[1];
    if (!isValidSlug(slug)) return { kind: 'invalid', needsDb: false, status: 404 };
    // Slug reservado/dedicado nunca é uma página /p/ → 404 SEM banco.
    if (RESERVED_CMS_SLUGS.has(slug)) return { kind: 'cms-reserved', needsDb: false, status: 404 };
    return { kind: 'dynamic', needsDb: true, type: 'cms', slug };
  }

  return { kind: 'unknown', needsDb: false, status: 404 };
};

// Mapeia o resultado SIMBÓLICO da consulta (nunca um erro cru) em status.
// Qualquer valor não reconhecido cai em 503 (seguro) — jamais 404.
export const mapOutcomeToStatus = (outcome) => {
  switch (outcome) {
    case 'found':
      return 200;
    case 'not_found':
      return 404;
    case 'transient_error':
    case 'timeout':
      return 503;
    default:
      return 503;
  }
};

// Política de headers/cache por status. Sem credenciais, sem detalhe interno.
// 410 nunca é emitido; status inesperado usa a política 503 (segura).
export const buildStatusHeaders = (status) => {
  const HTML = 'text/html; charset=utf-8';
  if (status === 200) {
    return {
      'Content-Type': HTML,
      'Cache-Control': 'public, max-age=0, must-revalidate',
      'Vercel-CDN-Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
    };
  }
  if (status === 404) {
    return {
      'Content-Type': HTML,
      'Cache-Control': 'public, max-age=0, must-revalidate',
      'Vercel-CDN-Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
      'X-Robots-Tag': 'noindex',
    };
  }
  // 503 (e qualquer status inesperado): indisponibilidade temporária, retryable.
  return {
    'Content-Type': HTML,
    'Cache-Control': 'no-store',
    'Retry-After': '60',
    'X-Robots-Tag': 'noindex, nofollow',
  };
};

/**
 * Conveniência para a Fase 2/testes: resolve status + headers a partir do
 * pathname e (quando a rota é dinâmica) do resultado simbólico da consulta.
 * Rotas não-dinâmicas ignoram `outcome`. Rotas dinâmicas sem `outcome` são
 * tratadas como indisponíveis (503), nunca 404.
 */
export const resolveRouteStatus = (input, outcome) => {
  const route = classifyRoute(input);
  const status = route.needsDb
    ? mapOutcomeToStatus(outcome === undefined ? 'transient_error' : outcome)
    : route.status;
  return { ...route, status, headers: buildStatusHeaders(status) };
};
