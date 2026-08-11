import { createClient } from '@supabase/supabase-js';
import {
  buildStaticEntries,
  mapEligibleEntries,
  buildSitemapXml,
  createBudget,
  resolveSitemapMode,
  cdnCacheControlFor,
  SITEMAP_CONTENT_TYPE,
  CACHE_CONTROL,
  MAX_URLS,
} from './sitemap-core.mjs';

// Handler/factory do sitemap dinâmico. Vive FORA de api/ (não é uma Serverless
// Function própria — o limite do plano Hobby é 12). É importado e despachado
// pela function pública api/og-loja.mjs mediante marcador interno.
// Usa apenas anon + RLS, nunca service role. Nunca lança: falhas caem para estático.

export const PAGE_SIZE = 1000;
export const MAX_PAGES = 60; // teto anti-loop por tabela
export const QUERY_TIMEOUT_MS = 5000;
// Orçamento GLOBAL de coleta (sobre o conjunto final, não por tabela).
export const GLOBAL_MAX_ROWS = MAX_URLS;

// Filtros no banco (defesa em profundidade — o núcleo revalida tudo depois).
// nowIso sem milissegundos para não introduzir '.' no valor do filtro PostgREST.
export const buildQueries = (nowIso) => [
  {
    key: 'announcements',
    table: 'announcements',
    columns: 'id, updated_at, created_at, status, expires_at',
    orderColumn: 'id',
    applyFilters: (q) => q.eq('status', 'ACTIVE').or(`expires_at.is.null,expires_at.gt.${nowIso}`),
  },
  {
    key: 'stores',
    table: 'seller_stores',
    columns: 'slug, updated_at, created_at, is_active, is_store_feature_enabled, is_paused_due_to_plan',
    orderColumn: 'slug',
    applyFilters: (q) =>
      q
        .eq('is_active', true)
        .eq('is_store_feature_enabled', true)
        .or('is_paused_due_to_plan.is.null,is_paused_due_to_plan.eq.false'),
  },
  {
    key: 'news',
    table: 'news_articles',
    columns: 'slug, updated_at, published_at, status',
    orderColumn: 'slug',
    applyFilters: (q) => q.eq('status', 'published'),
  },
  {
    key: 'cms',
    table: 'institutional_pages',
    columns: 'slug, updated_at, is_published',
    orderColumn: 'slug',
    applyFilters: (q) => q.eq('is_published', true),
  },
];

// Busca paginada estável (.order + .range) com orçamento global compartilhado.
// Para quando a página vem incompleta, quando o orçamento acaba, ou ao atingir
// maxPages (proteção contra loop). Lança em erro para o allSettled tratar.
export const createPaginatedFetcher = ({ pageSize = PAGE_SIZE, maxPages = MAX_PAGES } = {}) =>
  async function fetchAllRows(client, cfg, ctx = {}) {
    const { signal, budget } = ctx;
    const rows = [];

    for (let page = 0; page < maxPages; page += 1) {
      if (budget && budget.remaining() <= 0) break;

      const from = page * pageSize;
      const to = from + pageSize - 1;

      let query = client
        .from(cfg.table)
        .select(cfg.columns)
        .order(cfg.orderColumn, { ascending: true })
        .range(from, to);
      if (signal) query = query.abortSignal(signal);
      if (cfg.applyFilters) query = cfg.applyFilters(query);

      const { data, error } = await query;
      if (error) throw error;

      const batch = data || [];
      if (budget) {
        // Reserva atômica: só adiciona o que couber no orçamento global.
        const accepted = budget.take(batch.length);
        if (accepted > 0) rows.push(...batch.slice(0, accepted));
        if (accepted < batch.length) break; // orçamento esgotou no meio do lote
      } else {
        rows.push(...batch);
      }

      if (batch.length < pageSize) break;
    }

    return rows;
  };

const SOURCE_KEYS = ['announcements', 'stores', 'news', 'cms'];
const unavailableSources = () =>
  SOURCE_KEYS.reduce((acc, key) => ((acc[key] = 'unavailable'), acc), {});

const applyHeaders = (res, { mode, truncated, sources }) => {
  res.setHeader('Content-Type', SITEMAP_CONTENT_TYPE);
  res.setHeader('X-Sitemap-Mode', mode);
  res.setHeader('X-Sitemap-Truncated', truncated ? 'true' : 'false');
  res.setHeader('X-Sitemap-Sources', SOURCE_KEYS.map((key) => `${key}=${sources[key]}`).join(','));
  res.setHeader('Cache-Control', CACHE_CONTROL);
  res.setHeader('Vercel-CDN-Cache-Control', cdnCacheControlFor(mode));
};

// Factory com dependências injetáveis (testável sem rede).
export const createSitemapHandler = (deps = {}) => {
  const {
    createClient: createClientFn = createClient,
    logger = console,
    now = () => Date.now(),
    env = process.env,
    fetchAllRows = createPaginatedFetcher(),
    queryTimeoutMs = QUERY_TIMEOUT_MS,
  } = deps;

  const getClient = () => {
    const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL || '';
    const key = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || '';
    if (!url || !key) return null;
    return createClientFn(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  };

  const collect = async (client, nowMs) => {
    const nowIso = new Date(nowMs).toISOString().replace(/\.\d{3}Z$/, 'Z');
    const queries = buildQueries(nowIso);
    const dynamic = { announcements: [], stores: [], news: [], cms: [] };
    const budget = createBudget(GLOBAL_MAX_ROWS);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), queryTimeoutMs);

    try {
      const settled = await Promise.allSettled(
        queries.map((cfg) =>
          fetchAllRows(client, cfg, { signal: controller.signal, budget }).then((rows) => ({
            key: cfg.key,
            rows,
          })),
        ),
      );

      const sources = { announcements: 'error', stores: 'error', news: 'error', cms: 'error' };
      let failures = 0;
      settled.forEach((result, index) => {
        const key = queries[index].key;
        if (result.status === 'fulfilled') {
          dynamic[result.value.key] = result.value.rows;
          sources[key] = 'ok';
        } else {
          failures += 1;
          sources[key] = 'error';
          // Log seguro: só o identificador da consulta. Jamais reason/URL/SQL/credencial.
          logger.warn(`[sitemap] consulta ${key} indisponivel`);
        }
      });

      return { dynamic, failures, total: queries.length, collectionTruncated: budget.hit, sources };
    } finally {
      clearTimeout(timer);
    }
  };

  return async function handler(req, res) {
    const method = req.method || 'GET';

    if (method !== 'GET' && method !== 'HEAD') {
      res.setHeader('Allow', 'GET, HEAD');
      res.status(405).end();
      return;
    }

    const nowMs = now();
    let mode = 'fallback';
    let dynamicEntries = [];
    let collectionTruncated = false;
    let sources = unavailableSources();

    // getClient() também fica sob o try: config inválida ou createClient lançando
    // resultam em fallback 200, sem exceção escapando e sem vazar detalhe.
    try {
      const client = getClient();
      if (client) {
        const result = await collect(client, nowMs);
        mode = resolveSitemapMode(result.failures, result.total);
        collectionTruncated = result.collectionTruncated;
        dynamicEntries = mapEligibleEntries(result.dynamic, nowMs);
        sources = result.sources;
      }
    } catch {
      // Blindagem final: nunca lançar. Cai para estático, log genérico.
      mode = 'fallback';
      dynamicEntries = [];
      collectionTruncated = false;
      sources = unavailableSources();
      logger.warn('[sitemap] indisponivel');
    }

    const assembled = buildSitemapXml([...buildStaticEntries(), ...dynamicEntries]);
    const truncated = collectionTruncated || assembled.truncated;
    // Uma resposta truncada nunca é "live": rebaixa para partial (cache curto).
    if (truncated && mode === 'live') mode = 'partial';

    applyHeaders(res, { mode, truncated, sources });

    if (method === 'HEAD') {
      res.status(200).end();
      return;
    }

    res.status(200).send(assembled.xml);
  };
};

export default createSitemapHandler();
