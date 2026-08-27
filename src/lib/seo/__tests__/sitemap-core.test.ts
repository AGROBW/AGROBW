import { describe, it, expect, vi } from 'vitest';
import {
  buildSitemapXml,
  buildStaticEntries,
  mapEligibleEntries,
  dedupeEntries,
  sortEntries,
  escapeXml,
  normalizeLastmod,
  createBudget,
  isEligibleAnnouncement,
  isEligibleStore,
  isEligibleNews,
  isEligibleCms,
  resolveSitemapMode,
  cdnCacheControlFor,
  RESERVED_CMS_SLUGS,
  MAX_URLS,
  CANONICAL_SITE_URL,
} from '../../../../server/sitemap-core.mjs';
import {
  createPaginatedFetcher,
  createSitemapHandler,
  buildQueries,
  GLOBAL_MAX_ROWS,
} from '../../../../server/sitemap-handler.mjs';
import handlerDefault from '../../../../server/sitemap-handler.mjs';
import { createSeoDispatcher } from '../../../../api/og-loja.mjs';
import ogDefault from '../../../../api/og-loja.mjs';

const ORIGIN = 'https://agrobw.com.br';
const UUID = 'e6067e9b-5547-4fde-8b6a-c0c80f230d1a';

// ---------- helpers ----------

// Cliente Supabase falso: builder encadeável e "awaitable" (thenable) que
// resolve a página conforme o offset do .range(). Registra chamadas de range.
const makeFakeClient = (tablePages: Record<string, Array<{ data?: any[]; error?: any }>>) => {
  const rangeCalls: Array<[string, number, number]> = [];
  const client = {
    rangeCalls,
    from(table: string) {
      const state = { from: 0, to: 0 };
      const builder: any = {
        select: () => builder,
        order: () => builder,
        eq: () => builder,
        or: () => builder,
        abortSignal: () => builder,
        range: (from: number, to: number) => {
          state.from = from;
          state.to = to;
          rangeCalls.push([table, from, to]);
          return builder;
        },
        then: (resolve: any, reject: any) => {
          const pages = tablePages[table] || [];
          const idx = Math.floor(state.from / 1000);
          const page = pages[idx] || { data: [] };
          const result = page.error ? { data: null, error: page.error } : { data: page.data || [], error: null };
          return Promise.resolve(result).then(resolve, reject);
        },
      };
      return builder;
    },
  };
  return client;
};

const makeRes = () => {
  const headers: Record<string, string> = {};
  return {
    statusCode: 0,
    body: undefined as unknown,
    ended: false,
    setHeader(k: string, v: string) { headers[k.toLowerCase()] = v; },
    getHeader(k: string) { return headers[k.toLowerCase()]; },
    status(c: number) { this.statusCode = c; return this; },
    send(b: unknown) { this.body = b; this.ended = true; return this; },
    end(b?: unknown) { if (b !== undefined) this.body = b; this.ended = true; return this; },
  };
};

const rows = (n: number, make: (i: number) => any) => Array.from({ length: n }, (_, i) => make(i));
const uuidAt = (i: number) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`;

// ---------- XML e estrutura ----------

describe('sitemap-core: XML e estrutura', () => {
  it('emite declaração XML e urlset', () => {
    const { xml } = buildSitemapXml(buildStaticEntries());
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    expect(xml.trimEnd().endsWith('</urlset>')).toBe(true);
  });

  it('escapa caracteres especiais em loc', () => {
    expect(escapeXml(`a&b<c>d"e'f`)).toBe('a&amp;b&lt;c&gt;d&quot;e&apos;f');
    const { xml } = buildSitemapXml([{ path: '/p/a&b' }]);
    expect(xml).toContain('<loc>https://agrobw.com.br/p/a&amp;b</loc>');
    expect(xml).not.toContain('/p/a&b<');
  });

  it('categorias saem em /categoria/:slug e nunca como ?categoria=', () => {
    const { xml } = buildSitemapXml(buildStaticEntries());
    expect(xml).toContain(`${ORIGIN}/categoria/animais`);
    expect(xml).toContain(`${ORIGIN}/categoria/sementes`);
    expect(xml).not.toContain('?categoria=');
  });

  it('inclui rotas estáticas novas do Lote 1A', () => {
    const { xml } = buildSitemapXml(buildStaticEntries());
    expect(xml).toContain(`${ORIGIN}/politica-de-cookies`);
    expect(xml).toContain(`${ORIGIN}/politica-de-precos`);
  });

  it('não vaza chaves/segredos no XML', () => {
    const { xml } = buildSitemapXml(buildStaticEntries());
    expect(xml.toLowerCase()).not.toContain('apikey');
    expect(xml.toLowerCase()).not.toContain('supabase');
    expect(xml).not.toContain('service_role');
  });
});

// ---------- elegibilidade ----------

describe('sitemap-core: elegibilidade', () => {
  const now = Date.parse('2026-08-11T12:00:00Z');

  it('anúncio: ACTIVE não expirado entra; expirado/não-ACTIVE/id inválido saem', () => {
    const base = { id: UUID, slug: 'trator-john-deere', status: 'ACTIVE' };
    expect(isEligibleAnnouncement({ ...base, expires_at: null }, now)).toBe(true);
    expect(isEligibleAnnouncement({ ...base, expires_at: '2999-01-01T00:00:00Z' }, now)).toBe(true);
    expect(isEligibleAnnouncement({ ...base, expires_at: '2020-01-01T00:00:00Z' }, now)).toBe(false);
    expect(isEligibleAnnouncement({ ...base, status: 'PAUSED', expires_at: null }, now)).toBe(false);
    expect(isEligibleAnnouncement({ ...base, id: 'nao-uuid', expires_at: null }, now)).toBe(false);
    expect(isEligibleAnnouncement({ ...base, slug: '', expires_at: null }, now)).toBe(false);
  });

  it('loja: precisa is_active + feature + não pausada + slug válido', () => {
    const base = { slug: 'loja-x', is_active: true, is_store_feature_enabled: true, is_paused_due_to_plan: false };
    expect(isEligibleStore(base)).toBe(true);
    expect(isEligibleStore({ ...base, is_paused_due_to_plan: null })).toBe(true);
    expect(isEligibleStore({ ...base, is_paused_due_to_plan: true })).toBe(false);
    expect(isEligibleStore({ ...base, is_active: false })).toBe(false);
    expect(isEligibleStore({ ...base, is_store_feature_enabled: false })).toBe(false);
    expect(isEligibleStore({ ...base, slug: 'Loja X' })).toBe(false);
  });

  it('notícia: só published com slug válido', () => {
    expect(isEligibleNews({ slug: 'materia-1', status: 'published' })).toBe(true);
    expect(isEligibleNews({ slug: 'materia-1', status: 'draft' })).toBe(false);
    expect(isEligibleNews({ slug: '', status: 'published' })).toBe(false);
  });

  it('CMS: is_published + slug válido + não reservado', () => {
    expect(isEligibleCms({ slug: 'sobre-parcerias', is_published: true })).toBe(true);
    expect(isEligibleCms({ slug: 'sobre-parcerias', is_published: false })).toBe(false);
    for (const reserved of ['politica-de-cookies', 'politica-de-precos', 'termos-de-uso', 'privacidade', 'admin', 'p']) {
      expect(RESERVED_CMS_SLUGS.has(reserved)).toBe(true);
      expect(isEligibleCms({ slug: reserved, is_published: true })).toBe(false);
    }
  });

  it('mapEligibleEntries filtra e gera paths corretos', () => {
    const entries = mapEligibleEntries(
      {
        announcements: [
          { id: UUID, slug: 'trator-john-deere', status: 'ACTIVE', expires_at: null, updated_at: '2026-08-01T00:00:00Z' },
          { id: UUID.replace('e', 'a'), slug: 'anuncio-expirado', status: 'ACTIVE', expires_at: '2020-01-01T00:00:00Z' },
        ],
        stores: [{ slug: 'loja-x', is_active: true, is_store_feature_enabled: true, is_paused_due_to_plan: false }],
        news: [{ slug: 'materia-1', status: 'published' }],
        cms: [
          { slug: 'sobre', is_published: true },
          { slug: 'politica-de-cookies', is_published: true },
        ],
      },
      now,
    );
    expect(entries.map((e) => e.path).sort()).toEqual([
      '/anuncio/trator-john-deere',
      '/loja/loja-x',
      '/noticias/materia-1',
      '/p/sobre',
    ]);
  });
});

// ---------- lastmod ----------

describe('sitemap-core: lastmod', () => {
  it('normaliza datas válidas e retorna null para inválidas/ausentes', () => {
    expect(normalizeLastmod('2026-08-01T10:00:00Z')).toBe('2026-08-01T10:00:00.000Z');
    expect(normalizeLastmod(undefined)).toBeNull();
    expect(normalizeLastmod(null)).toBeNull();
    expect(normalizeLastmod('data-invalida')).toBeNull();
  });

  it('emite <lastmod> quando válido e omite quando ausente', () => {
    const { xml } = buildSitemapXml([
      { path: '/loja/a', lastmod: '2026-08-01T10:00:00Z' },
      { path: '/loja/b' },
    ]);
    expect(xml).toContain('<lastmod>2026-08-01T10:00:00.000Z</lastmod>');
    const blocoB = xml.split('<loc>https://agrobw.com.br/loja/b</loc>')[1] || '';
    expect(blocoB.split('</url>')[0]).not.toContain('<lastmod>');
  });

  it('rotas estáticas nunca recebem lastmod artificial', () => {
    const { xml } = buildSitemapXml(buildStaticEntries());
    const home = xml.split('<loc>https://agrobw.com.br/</loc>')[1].split('</url>')[0];
    expect(home).not.toContain('<lastmod>');
  });
});

// ---------- dedupe, ordenação, truncamento ----------

describe('sitemap-core: dedupe, ordenação, truncamento', () => {
  it('deduplica por path', () => {
    const out = dedupeEntries([{ path: '/x' }, { path: '/x', lastmod: '2026-01-01' }, { path: '/y' }]);
    expect(out.map((e) => e.path)).toEqual(['/x', '/y']);
  });

  it('ordena deterministicamente por path', () => {
    const out = sortEntries([{ path: '/c' }, { path: '/a' }, { path: '/b' }]);
    expect(out.map((e) => e.path)).toEqual(['/a', '/b', '/c']);
  });

  it('inclui todos os registros elegíveis (>1000) e reporta não truncado', () => {
    const announcements = rows(1500, (i) => ({ id: uuidAt(i), slug: `anuncio-${i}`, status: 'ACTIVE', expires_at: null }));
    const entries = mapEligibleEntries({ announcements });
    expect(entries).toHaveLength(1500);
    const { xml, count, truncated } = buildSitemapXml(entries);
    expect(count).toBe(1500);
    expect(truncated).toBe(false);
    expect((xml.match(/<url>/g) || []).length).toBe(1500);
  });

  it('trunca por quantidade (MAX_URLS) e sinaliza truncated=true', () => {
    const entries = rows(MAX_URLS + 1000, (i) => ({ path: `/p/pagina-${i}` }));
    const { count, truncated } = buildSitemapXml(entries);
    expect(count).toBe(MAX_URLS);
    expect(truncated).toBe(true);
  });

  it('trunca por bytes e sinaliza truncated=true, mantendo XML válido', () => {
    const entries = rows(100, (i) => ({ path: `/p/pagina-${i}` }));
    const { xml, count, truncated } = buildSitemapXml(entries, { maxBytes: 400 });
    expect(count).toBeLessThan(100);
    expect(truncated).toBe(true);
    expect(xml).toContain('</urlset>');
  });
});

// ---------- modo e cache ----------

describe('sitemap-core: modo e cache', () => {
  it('resolveSitemapMode', () => {
    expect(resolveSitemapMode(0, 4)).toBe('live');
    expect(resolveSitemapMode(2, 4)).toBe('partial');
    expect(resolveSitemapMode(4, 4)).toBe('fallback');
    expect(resolveSitemapMode(0, 0)).toBe('fallback');
  });

  it('cdnCacheControlFor difere entre live e partial/fallback', () => {
    expect(cdnCacheControlFor('live')).toBe('public, s-maxage=3600, stale-while-revalidate=86400');
    expect(cdnCacheControlFor('partial')).toBe('public, s-maxage=60, stale-while-revalidate=300');
    expect(cdnCacheControlFor('fallback')).toBe('public, s-maxage=60, stale-while-revalidate=300');
  });
});

// ---------- paginação real (fetchAllRows / .range) ----------

describe('api/sitemap: paginação real', () => {
  const cfg = buildQueries('2026-08-11T12:00:00Z')[0]; // announcements (usa .eq + .or)

  it('faz range(0,999) e range(1000,1999) e para na página incompleta', async () => {
    const client = makeFakeClient({
      announcements: [
        { data: rows(1000, (i) => ({ id: uuidAt(i), status: 'ACTIVE' })) },
        { data: rows(500, (i) => ({ id: uuidAt(1000 + i), status: 'ACTIVE' })) },
      ],
    });
    const fetchAllRows = createPaginatedFetcher();
    const budget = createBudget(GLOBAL_MAX_ROWS);
    const out = await fetchAllRows(client, cfg, { budget });
    expect(out).toHaveLength(1500);
    expect((client as any).rangeCalls).toEqual([
      ['announcements', 0, 999],
      ['announcements', 1000, 1999],
    ]);
  });

  it('propaga erro de página intermediária', async () => {
    const client = makeFakeClient({
      announcements: [
        { data: rows(1000, (i) => ({ id: uuidAt(i), status: 'ACTIVE' })) },
        { error: { message: 'boom' } },
      ],
    });
    const fetchAllRows = createPaginatedFetcher();
    await expect(fetchAllRows(client, cfg, { budget: createBudget(GLOBAL_MAX_ROWS) })).rejects.toBeTruthy();
  });

  it('proteção contra loop: para em maxPages', async () => {
    const many = rows(5, () => ({ data: rows(1000, (i) => ({ id: uuidAt(i), status: 'ACTIVE' })) }));
    const client = makeFakeClient({ announcements: many });
    const fetchAllRows = createPaginatedFetcher({ maxPages: 3 });
    const out = await fetchAllRows(client, cfg, {}); // sem budget
    expect(out).toHaveLength(3000);
    expect((client as any).rangeCalls).toHaveLength(3);
  });

  it('orçamento estrito: retorna exatamente o saldo, sem overshoot', async () => {
    const many = rows(10, () => ({ data: rows(1000, (i) => ({ id: uuidAt(i), status: 'ACTIVE' })) }));
    const client = makeFakeClient({ announcements: many });
    const fetchAllRows = createPaginatedFetcher();
    const budget = createBudget(1500);
    const out = await fetchAllRows(client, cfg, { budget });
    expect(out.length).toBe(1500);
    expect(budget.used).toBe(1500);
    expect(budget.hit).toBe(true);
  });

  it('orçamento compartilhado: total agregado entre consultas nunca passa do teto', async () => {
    const pages = rows(10, () => ({ data: rows(1000, (i) => ({ id: uuidAt(i), status: 'ACTIVE' })) }));
    const client = makeFakeClient({ a: pages, b: pages });
    const fetchAllRows = createPaginatedFetcher();
    const budget = createBudget(1500);
    const cfgA = { ...cfg, table: 'a' };
    const cfgB = { ...cfg, table: 'b' };
    const [ra, rb] = await Promise.all([
      fetchAllRows(client, cfgA, { budget }),
      fetchAllRows(client, cfgB, { budget }),
    ]);
    expect(ra.length + rb.length).toBe(1500);
    expect(budget.used).toBe(1500);
    expect(budget.hit).toBe(true);
  });
});

describe('sitemap-core: createBudget atômico', () => {
  it('take() nunca ultrapassa max e marca hit ao descartar', () => {
    const b = createBudget(1500);
    expect(b.take(1000)).toBe(1000);
    expect(b.hit).toBe(false);
    expect(b.take(1000)).toBe(500); // aceita só o saldo
    expect(b.used).toBe(1500);
    expect(b.hit).toBe(true);
    expect(b.take(1000)).toBe(0); // esgotado
    expect(b.used).toBe(1500);
  });
});

// ---------- handler via factory (sem rede) ----------

describe('api/sitemap: handler (factory injetável)', () => {
  const envOk = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'anon-key' };
  const now = () => Date.parse('2026-08-11T12:00:00Z');
  const fakeCreateClient = () => ({}) as any;

  const rowsFor = (key: string) => {
    if (key === 'announcements') return [{ id: UUID, slug: 'trator-john-deere', status: 'ACTIVE', expires_at: null, updated_at: '2026-08-01T00:00:00Z' }];
    if (key === 'stores') return [{ slug: 'loja-x', is_active: true, is_store_feature_enabled: true, is_paused_due_to_plan: false }];
    if (key === 'news') return [{ slug: 'materia-1', status: 'published' }];
    if (key === 'cms') return [{ slug: 'sobre', is_published: true }];
    return [];
  };

  it('export default é uma função (assinatura Vercel)', () => {
    expect(typeof handlerDefault).toBe('function');
  });

  it('4 consultas OK → live, com URLs dinâmicas', async () => {
    const handler = createSitemapHandler({
      env: envOk, now, createClient: fakeCreateClient,
      fetchAllRows: async (_c: any, cfg: any) => rowsFor(cfg.key),
    });
    const res = makeRes();
    await handler({ method: 'GET' }, res);
    expect(res.statusCode).toBe(200);
    expect(res.getHeader('X-Sitemap-Mode')).toBe('live');
    expect(res.getHeader('X-Sitemap-Truncated')).toBe('false');
    expect(res.getHeader('Vercel-CDN-Cache-Control')).toBe('public, s-maxage=3600, stale-while-revalidate=86400');
    expect(String(res.body)).toContain('/anuncio/trator-john-deere');
    expect(String(res.body)).toContain('/loja/loja-x');
    expect(String(res.body)).toContain('/noticias/materia-1');
    expect(String(res.body)).toContain('/p/sobre');
  });

  it('1 consulta falha → partial, mantém os demais conjuntos, log seguro', async () => {
    const logger = { warn: vi.fn() };
    const handler = createSitemapHandler({
      env: envOk, now, createClient: fakeCreateClient, logger,
      fetchAllRows: async (_c: any, cfg: any) => {
        if (cfg.key === 'news') throw new Error('detalhe interno com url secreta');
        return rowsFor(cfg.key);
      },
    });
    const res = makeRes();
    await handler({ method: 'GET' }, res);
    expect(res.getHeader('X-Sitemap-Mode')).toBe('partial');
    expect(res.getHeader('Vercel-CDN-Cache-Control')).toBe('public, s-maxage=60, stale-while-revalidate=300');
    expect(String(res.body)).toContain('/loja/loja-x'); // outros conjuntos preservados
    expect(String(res.body)).not.toContain('/noticias/materia-1'); // o que falhou não entra
    expect(logger.warn).toHaveBeenCalledWith('[sitemap] consulta news indisponivel');
    // Log não vaza detalhe interno
    const logged = logger.warn.mock.calls.flat().join(' ');
    expect(logged).not.toContain('detalhe interno');
    expect(logged).not.toContain('url secreta');
  });

  it('todas falham → fallback estático', async () => {
    const handler = createSitemapHandler({
      env: envOk, now, createClient: fakeCreateClient, logger: { warn: vi.fn() },
      fetchAllRows: async () => { throw new Error('x'); },
    });
    const res = makeRes();
    await handler({ method: 'GET' }, res);
    expect(res.getHeader('X-Sitemap-Mode')).toBe('fallback');
    expect(String(res.body)).toContain('/categoria/animais');
    expect(String(res.body)).not.toContain('/anuncio/trator-john-deere');
  });

  it('AbortError não gera 500 (partial)', async () => {
    const handler = createSitemapHandler({
      env: envOk, now, createClient: fakeCreateClient, logger: { warn: vi.fn() },
      fetchAllRows: async (_c: any, cfg: any) => {
        if (cfg.key === 'announcements') {
          const err = new Error('aborted');
          (err as any).name = 'AbortError';
          throw err;
        }
        return rowsFor(cfg.key);
      },
    });
    const res = makeRes();
    await handler({ method: 'GET' }, res);
    expect(res.statusCode).toBe(200);
    expect(res.getHeader('X-Sitemap-Mode')).toBe('partial');
  });

  it('configuração ausente → fallback (sem chamar fetch)', async () => {
    const fetchSpy = vi.fn();
    const handler = createSitemapHandler({ env: {}, now, createClient: fakeCreateClient, fetchAllRows: fetchSpy });
    const res = makeRes();
    await handler({ method: 'GET' }, res);
    expect(res.getHeader('X-Sitemap-Mode')).toBe('fallback');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('truncamento (orçamento global) → partial + X-Sitemap-Truncated: true', async () => {
    const handler = createSitemapHandler({
      env: envOk, now, createClient: fakeCreateClient,
      fetchAllRows: async (_c: any, cfg: any, ctx: any) => {
        if (cfg.key === 'announcements') ctx.budget.take(GLOBAL_MAX_ROWS); // esgota orçamento
        return rowsFor(cfg.key);
      },
    });
    const res = makeRes();
    await handler({ method: 'GET' }, res);
    expect(res.getHeader('X-Sitemap-Truncated')).toBe('true');
    expect(res.getHeader('X-Sitemap-Mode')).toBe('partial'); // rebaixado de live
  });

  it('createClient lançando (com segredo) → fallback 200, sem vazar no XML nem no log', async () => {
    const logger = { warn: vi.fn() };
    const handler = createSitemapHandler({
      env: envOk, now, logger,
      createClient: () => {
        throw new Error('postgres://user:S3CRET-TOKEN@db.host:5432');
      },
      fetchAllRows: async () => [],
    });
    const res = makeRes();
    await handler({ method: 'GET' }, res);
    expect(res.statusCode).toBe(200);
    expect(res.getHeader('X-Sitemap-Mode')).toBe('fallback');
    expect(String(res.body)).not.toContain('S3CRET-TOKEN');
    const logged = logger.warn.mock.calls.flat().join(' ');
    expect(logged).not.toContain('S3CRET-TOKEN');
    expect(logged).not.toContain('postgres://');
  });

  it('timeout real: timer chama abort(), consulta pendente rejeita → partial 200 sem pendurar', async () => {
    const handler = createSitemapHandler({
      env: envOk, now, createClient: fakeCreateClient, logger: { warn: vi.fn() },
      queryTimeoutMs: 20,
      fetchAllRows: async (_c: any, cfg: any, ctx: any) => {
        if (cfg.key === 'announcements') {
          return await new Promise((_resolve, reject) => {
            const abort = () => {
              const err = new Error('aborted');
              (err as any).name = 'AbortError';
              reject(err);
            };
            if (ctx.signal?.aborted) abort();
            else ctx.signal?.addEventListener('abort', abort);
          });
        }
        return rowsFor(cfg.key);
      },
    });
    const res = makeRes();
    await handler({ method: 'GET' }, res);
    expect(res.statusCode).toBe(200);
    expect(res.getHeader('X-Sitemap-Mode')).toBe('partial');
    expect(String(res.body)).toContain('/loja/loja-x');
  });

  it('X-Sitemap-Sources reflete live/partial/fallback', async () => {
    // live
    let handler = createSitemapHandler({
      env: envOk, now, createClient: fakeCreateClient,
      fetchAllRows: async (_c: any, cfg: any) => rowsFor(cfg.key),
    });
    let res = makeRes();
    await handler({ method: 'GET' }, res);
    expect(res.getHeader('X-Sitemap-Sources')).toBe('announcements=ok,stores=ok,news=ok,cms=ok');

    // partial (cms falha)
    handler = createSitemapHandler({
      env: envOk, now, createClient: fakeCreateClient, logger: { warn: vi.fn() },
      fetchAllRows: async (_c: any, cfg: any) => {
        if (cfg.key === 'cms') throw new Error('x');
        return rowsFor(cfg.key);
      },
    });
    res = makeRes();
    await handler({ method: 'GET' }, res);
    expect(res.getHeader('X-Sitemap-Sources')).toBe('announcements=ok,stores=ok,news=ok,cms=error');

    // fallback (config ausente)
    handler = createSitemapHandler({ env: {}, now, createClient: fakeCreateClient });
    res = makeRes();
    await handler({ method: 'GET' }, res);
    expect(res.getHeader('X-Sitemap-Sources')).toBe(
      'announcements=unavailable,stores=unavailable,news=unavailable,cms=unavailable',
    );
  });

  it('HEAD responde 200 com headers e sem corpo', async () => {
    const handler = createSitemapHandler({ env: {}, now, createClient: fakeCreateClient });
    const res = makeRes();
    await handler({ method: 'HEAD' }, res);
    expect(res.statusCode).toBe(200);
    expect(res.getHeader('Content-Type')).toBe('application/xml; charset=utf-8');
    expect(res.body).toBeUndefined();
  });

  it('POST → 405 com Allow: GET, HEAD', async () => {
    const handler = createSitemapHandler({ env: {}, now, createClient: fakeCreateClient });
    const res = makeRes();
    await handler({ method: 'POST' }, res);
    expect(res.statusCode).toBe(405);
    expect(res.getHeader('Allow')).toBe('GET, HEAD');
  });

  it('GET fallback: Content-Type e Cache-Control corretos, sem ?categoria=', async () => {
    const handler = createSitemapHandler({ env: {}, now, createClient: fakeCreateClient });
    const res = makeRes();
    await handler({ method: 'GET' }, res);
    expect(res.getHeader('Content-Type')).toBe('application/xml; charset=utf-8');
    expect(res.getHeader('Cache-Control')).toBe('public, max-age=0, must-revalidate');
    expect(String(res.body)).toContain('<urlset');
    expect(String(res.body)).not.toContain('?categoria=');
  });
});

// ---------- dispatcher de SEO em api/og-loja.mjs ----------

describe('api/og-loja: dispatcher de SEO', () => {
  it('export default é uma função', () => {
    expect(typeof ogDefault).toBe('function');
  });

  it('_seo_route=sitemap → chama o sitemap, não o OG', async () => {
    const sitemap = vi.fn(async (_req: any, res: any) => res.status(200).send('<urlset/>'));
    const og = vi.fn(async () => {});
    const handler = createSeoDispatcher({ sitemap, og });
    await handler({ method: 'GET', query: { _seo_route: 'sitemap' } }, makeRes());
    expect(sitemap).toHaveBeenCalledTimes(1);
    expect(og).not.toHaveBeenCalled(); // OG (fetch de index.html) nunca roda
  });

  it('sem marcador → mantém o fluxo OG', async () => {
    const sitemap = vi.fn();
    const og = vi.fn(async (_req: any, res: any) => res.status(200).send('<html/>'));
    const handler = createSeoDispatcher({ sitemap, og });
    await handler({ method: 'GET', query: { slug: 'loja-x' } }, makeRes());
    expect(og).toHaveBeenCalledTimes(1);
    expect(sitemap).not.toHaveBeenCalled();
  });

  it('marcador diferente → não ativa o sitemap (segue OG)', async () => {
    const sitemap = vi.fn();
    const og = vi.fn(async () => {});
    const handler = createSeoDispatcher({ sitemap, og });
    await handler({ method: 'GET', query: { _seo_route: 'outro' } }, makeRes());
    expect(sitemap).not.toHaveBeenCalled();
    expect(og).toHaveBeenCalledTimes(1);
  });

  it('fluxo OG não recebe headers X-Sitemap-*', async () => {
    const sitemap = vi.fn();
    const og = vi.fn(async (_req: any, res: any) => {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.status(200).send('<html/>');
    });
    const handler = createSeoDispatcher({ sitemap, og });
    const res = makeRes();
    await handler({ method: 'GET', query: {} }, res);
    expect(res.getHeader('X-Sitemap-Mode')).toBeUndefined();
    expect(res.getHeader('X-Sitemap-Truncated')).toBeUndefined();
    expect(res.getHeader('X-Sitemap-Sources')).toBeUndefined();
    expect(res.getHeader('Content-Type')).toBe('text/html; charset=utf-8');
  });

  it('wiring real: default + _seo_route=sitemap → XML e headers diagnósticos, sem fetch de index.html', async () => {
    const keys = ['SUPABASE_URL', 'VITE_SUPABASE_URL', 'SUPABASE_ANON_KEY', 'VITE_SUPABASE_ANON_KEY'];
    const saved = keys.map((k) => [k, process.env[k]] as const);
    keys.forEach((k) => { process.env[k] = ''; }); // força fallback hermético
    try {
      const res = makeRes();
      await ogDefault({ method: 'GET', query: { _seo_route: 'sitemap' } }, res);
      expect(res.statusCode).toBe(200);
      expect(res.getHeader('Content-Type')).toBe('application/xml; charset=utf-8');
      expect(res.getHeader('X-Sitemap-Mode')).toBe('fallback');
      expect(res.getHeader('X-Sitemap-Truncated')).toBe('false');
      expect(res.getHeader('X-Sitemap-Sources')).toBe(
        'announcements=unavailable,stores=unavailable,news=unavailable,cms=unavailable',
      );
      expect(String(res.body)).toContain('<urlset');
    } finally {
      saved.forEach(([k, v]) => { if (v === undefined) delete process.env[k]; else process.env[k] = v; });
    }
  });
});
