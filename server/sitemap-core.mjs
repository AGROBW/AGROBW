// Núcleo PURO do sitemap (sem I/O, sem Supabase, sem Vercel). Centraliza rotas
// estáticas, categorias canônicas, slugs reservados, elegibilidade, lastmod,
// dedupe, ordenação determinística e montagem do XML. Importável por
// api/sitemap.mjs (runtime) e por testes em src/ (Vitest).
//
// IMPORTANTE: fica FORA de api/ de propósito — arquivos .js/.mjs dentro de api/
// podem ser tratados como funções serverless pela Vercel.

export const CANONICAL_SITE_URL = 'https://agrobw.com.br';

// Limites preventivos (protocolo sitemap: 50.000 URLs / 50 MB).
export const MAX_URLS = 45000;
export const MAX_BYTES = 45 * 1024 * 1024;

// Rotas públicas estáticas indexáveis (sem lastmod artificial).
export const STATIC_ROUTES = [
  '/',
  '/anuncios',
  '/categorias',
  '/planos',
  '/vitrine',
  '/lojas-parceiras',
  '/noticias',
  '/quem-somos',
  '/contato',
  '/termos-de-uso',
  '/privacidade',
  '/politica-de-cookies',
  '/politica-de-precos',
];

// Seis grupos canônicos de categorias → /categoria/:slug.
export const CATEGORY_SLUGS = [
  'animais',
  'maquinas',
  'insumos',
  'imoveis',
  'servicos',
  'sementes',
];

// Slugs CMS que NÃO entram como /p/:slug: reservados do sistema + páginas com
// rota dedicada (evita duplicar canonical).
export const RESERVED_CMS_SLUGS = new Set([
  'admin',
  'api',
  'auth',
  'dashboard',
  'login',
  'register',
  'settings',
  'p',
  'pages',
  'termos-de-uso',
  'privacidade',
  'quem-somos',
  'contato',
  'politica-de-cookies',
  'politica-de-precos',
]);

// Content-Type e política de cache (headers do handler, mantidos aqui como
// fonte única testável).
export const SITEMAP_CONTENT_TYPE = 'application/xml; charset=utf-8';
export const CACHE_CONTROL = 'public, max-age=0, must-revalidate';

// Determina o modo a partir do nº de falhas sobre o total de consultas.
export const resolveSitemapMode = (failures, total) => {
  if (!Number.isFinite(total) || total <= 0) return 'fallback';
  if (failures <= 0) return 'live';
  if (failures >= total) return 'fallback';
  return 'partial';
};

// Cache de CDN por modo: live cacheia por 1h; partial/fallback só 60s (evita
// prender uma resposta incompleta por muito tempo).
export const cdnCacheControlFor = (mode) =>
  mode === 'live'
    ? 'public, s-maxage=3600, stale-while-revalidate=86400'
    : 'public, s-maxage=60, stale-while-revalidate=300';

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isValidSlug = (slug) =>
  typeof slug === 'string' && slug.length <= 200 && SLUG_RE.test(slug) && !UUID_RE.test(slug);
export const isValidUuid = (id) => typeof id === 'string' && UUID_RE.test(id);

export const escapeXml = (value) =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

// Normaliza lastmod: ISO válido ou null. NUNCA usa new Date() como fallback.
export const normalizeLastmod = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

// -------- Elegibilidade (regras públicas reais) --------

export const isEligibleAnnouncement = (row, nowMs = Date.now()) => {
  if (!row || row.status !== 'ACTIVE' || !isValidUuid(row.id) || !isValidSlug(row.slug)) return false;
  if (row.expires_at == null) return true;
  const expiresMs = new Date(row.expires_at).getTime();
  // Data inválida → tratado como sem expiração (espelha isTimestampExpired).
  if (Number.isNaN(expiresMs)) return true;
  return expiresMs > nowMs;
};

export const isEligibleStore = (row) =>
  !!row &&
  row.is_active === true &&
  row.is_store_feature_enabled === true &&
  (row.is_paused_due_to_plan === false || row.is_paused_due_to_plan == null) &&
  isValidSlug(row.slug);

export const isEligibleNews = (row) =>
  !!row && row.status === 'published' && isValidSlug(row.slug);

export const isEligibleCms = (row) =>
  !!row &&
  row.is_published === true &&
  isValidSlug(row.slug) &&
  !RESERVED_CMS_SLUGS.has(row.slug);

// -------- Mapeamento linha → entrada { path, lastmod? } --------

export const announcementToEntry = (row) => ({
  path: `/anuncio/${row.slug}`,
  lastmod: normalizeLastmod(row.updated_at || row.created_at),
});

export const storeToEntry = (row) => ({
  path: `/loja/${row.slug}`,
  lastmod: normalizeLastmod(row.updated_at || row.created_at),
});

export const newsToEntry = (row) => ({
  path: `/noticias/${row.slug}`,
  lastmod: normalizeLastmod(row.updated_at || row.published_at),
});

export const cmsToEntry = (row) => ({
  path: `/p/${row.slug}`,
  lastmod: normalizeLastmod(row.updated_at),
});

// Entradas estáticas (rotas fixas + categorias canônicas), sem lastmod.
export const buildStaticEntries = () => [
  ...STATIC_ROUTES.map((path) => ({ path })),
  ...CATEGORY_SLUGS.map((slug) => ({ path: `/categoria/${slug}` })),
];

// Filtra e mapeia os conjuntos dinâmicos crus em entradas elegíveis.
export const mapEligibleEntries = (
  { announcements = [], stores = [], news = [], cms = [] } = {},
  nowMs = Date.now(),
) => {
  const entries = [];
  for (const row of announcements) if (isEligibleAnnouncement(row, nowMs)) entries.push(announcementToEntry(row));
  for (const row of stores) if (isEligibleStore(row)) entries.push(storeToEntry(row));
  for (const row of news) if (isEligibleNews(row)) entries.push(newsToEntry(row));
  for (const row of cms) if (isEligibleCms(row)) entries.push(cmsToEntry(row));
  return entries;
};

export const dedupeEntries = (entries) => {
  const map = new Map();
  for (const entry of entries) {
    if (entry && typeof entry.path === 'string' && !map.has(entry.path)) {
      map.set(entry.path, entry);
    }
  }
  return Array.from(map.values());
};

export const sortEntries = (entries) =>
  [...entries].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

const byteLength = (value) =>
  typeof Buffer !== 'undefined'
    ? Buffer.byteLength(value, 'utf8')
    : new TextEncoder().encode(value).length;

// Orçamento de coleta compartilhado entre consultas paralelas. Limita o volume
// total agregado (não por tabela) e sinaliza quando o teto foi atingido.
export const createBudget = (max) => {
  let used = 0;
  let hit = false;
  return {
    // Operação ATÔMICA: aceita apenas até o saldo restante e retorna a
    // quantidade aceita. used nunca ultrapassa max. Marca hit quando descarta
    // linhas (accepted < want) ou quando o saldo zera após uma reserva.
    take(n) {
      const want = Math.max(0, n || 0);
      const remaining = Math.max(0, max - used);
      const accepted = Math.min(want, remaining);
      used += accepted;
      if (accepted < want || (want > 0 && used >= max)) hit = true;
      return accepted;
    },
    remaining() {
      return Math.max(0, max - used);
    },
    markHit() {
      hit = true;
    },
    get hit() {
      return hit;
    },
    get used() {
      return used;
    },
  };
};

// Monta o XML final: dedupe + ordenação determinística + tetos MAX_URLS/MAX_BYTES.
// Retorna { xml, count, truncated }. truncated=true quando nem todas as entradas
// couberam (por quantidade ou bytes) — nunca truncar silenciosamente.
export const buildSitemapXml = (rawEntries = [], options = {}) => {
  const siteUrl = (options.siteUrl || CANONICAL_SITE_URL).replace(/\/+$/, '');
  const maxUrls = options.maxUrls ?? MAX_URLS;
  const maxBytes = options.maxBytes ?? MAX_BYTES;

  const entries = sortEntries(dedupeEntries(rawEntries));

  const header =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
  const footer = '</urlset>\n';

  let body = '';
  let size = byteLength(header) + byteLength(footer);
  let count = 0;

  for (const entry of entries) {
    if (count >= maxUrls) break;
    const routePath = entry.path.startsWith('/') ? entry.path : `/${entry.path}`;
    const loc = `${siteUrl}${routePath}`;
    const lastmod = entry.lastmod ? normalizeLastmod(entry.lastmod) : null;
    const block =
      '  <url>\n' +
      `    <loc>${escapeXml(loc)}</loc>\n` +
      (lastmod ? `    <lastmod>${escapeXml(lastmod)}</lastmod>\n` : '') +
      '  </url>\n';
    const blockSize = byteLength(block);
    if (size + blockSize > maxBytes) break;
    body += block;
    size += blockSize;
    count += 1;
  }

  return { xml: header + body + footer, count, truncated: count < entries.length };
};
