import { describe, it, expect, vi } from 'vitest';
import {
  createDocumentStatusHandler,
  loadIndexWithTimeout,
  loadCanonicalIndexHtml,
  fetchTrustedIndexHtml,
  isAppIndexHtml,
  withUserAgentVary,
} from '../../../../server/document-status-handler.mjs';
import { createSitemapHandler } from '../../../../server/sitemap-handler.mjs';
import { CANONICAL_ORIGIN } from '../../../../server/trusted-origin.mjs';
import { createSeoDispatcher, renderStoreOgHtml } from '../../../../api/og-loja.mjs';

// HTML que SIMULA a proteção de deployment/login da Vercel: 200, sem o marcador
// root real da aplicação. Nunca deve ser servido como SPA nem receber OG.
const LOGIN_HTML = '<!doctype html><html><head><title>Login</title></head><body><form>Vercel Authentication</form></body></html>';

const UUID = 'e6067e9b-5547-4fde-8b6a-c0c80f230d1a';
const AD_SLUG = 'trator-john-deere-6145j-buriti-alegre-go';
const ENV_OK = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'anon' };
const NOW = () => Date.parse('2026-08-11T12:00:00Z');
const INDEX_HTML = '<html><head></head><body><div id="root"></div></body></html>';

// Cliente Supabase falso: conta from(table), respeita abortSignal e suporta
// data/error/throw/hang por tabela.
const makeFakeClient = (spec: Record<string, any>) => {
  const calls: Record<string, number> = {};
  return {
    calls,
    from(table: string) {
      calls[table] = (calls[table] || 0) + 1;
      let sig: AbortSignal | null = null;
      const b: any = {
        select: () => b,
        eq: () => b,
        limit: () => b,
        abortSignal: (s: AbortSignal) => { sig = s; return b; },
        maybeSingle: () => {
          const r = spec[table] || { data: null };
          if (r.throw) return Promise.reject(r.throw);
          if (r.hang) {
            return new Promise((_resolve, reject) => {
              const abort = () => { const e = new Error('aborted'); (e as any).name = 'AbortError'; reject(e); };
              if (sig?.aborted) abort();
              else sig?.addEventListener('abort', abort);
            });
          }
          return Promise.resolve({ data: r.data ?? null, error: r.error ?? null });
        },
      };
      return b;
    },
  };
};

const makeRes = () => {
  const headers: Record<string, string> = {};
  return {
    statusCode: 0,
    body: undefined as unknown,
    setHeader(k: string, v: string) { headers[k.toLowerCase()] = v; },
    getHeader(k: string) { return headers[k.toLowerCase()]; },
    status(c: number) { this.statusCode = c; return this; },
    send(b: unknown) { this.body = b; return this; },
    end(b?: unknown) { if (b !== undefined) this.body = b; return this; },
  };
};

const baseDeps = (over: any = {}) => ({
  env: ENV_OK,
  now: NOW,
  fetchIndexHtml: async () => INDEX_HTML,
  isSocialCrawler: () => false,
  renderStoreOg: ({ store }: any) => `<html>OG:${store.slug}</html>`,
  logger: { warn: vi.fn() },
  ...over,
});

const run = async (handler: any, path: string | undefined, method = 'GET') => {
  const res = makeRes();
  await handler({ method, query: path === undefined ? {} : { path } }, res);
  return res;
};

// ---------- rotas sem banco ----------

describe('document-handler: rotas sem consulta ao banco', () => {
  it.each(['/', '/anuncios', '/categoria/animais', '/planos', '/minha-conta', '/admin/users', '/anunciar'])(
    '%s → 200 sem tocar no banco',
    async (path) => {
      const createClient = vi.fn(() => makeFakeClient({}));
      const handler = createDocumentStatusHandler(baseDeps({ createClient }));
      const res = await run(handler, path);
      expect(res.statusCode).toBe(200);
      expect(res.getHeader('Content-Type')).toBe('text/html; charset=utf-8');
      expect(createClient).not.toHaveBeenCalled();
      expect(res.body).toBe(INDEX_HTML);
    },
  );

  it.each(['/desconhecida', '/anuncio/NAO_VALIDO', '/categoria/inexistente', '/p/politica-de-cookies', '/loja/BAD SLUG', '/api', '/assets'])(
    '%s → 404 sem tocar no banco, com X-Robots-Tag noindex',
    async (path) => {
      const createClient = vi.fn(() => makeFakeClient({}));
      const handler = createDocumentStatusHandler(baseDeps({ createClient }));
      const res = await run(handler, path);
      expect(res.statusCode).toBe(404);
      expect(res.getHeader('X-Robots-Tag')).toBe('noindex');
      expect(createClient).not.toHaveBeenCalled();
    },
  );
});

// ---------- matriz dinâmica 200/404/503 ----------

describe('document-handler: conteúdo dinâmico 200/404/503', () => {
  const cases = [
    { type: 'anúncio', path: `/anuncio/${AD_SLUG}`, table: 'announcements', found: { id: UUID, slug: AD_SLUG, status: 'ACTIVE', expires_at: null } },
    { type: 'notícia', path: '/noticias/materia-x', table: 'news_articles', found: { slug: 'materia-x', status: 'published' } },
    { type: 'CMS', path: '/p/sobre', table: 'institutional_pages', found: { slug: 'sobre', is_published: true } },
  ];

  it.each(cases)('$type encontrado → 200', async ({ path, table, found }) => {
    const handler = createDocumentStatusHandler(baseDeps({ createClient: () => makeFakeClient({ [table]: { data: found } }) }));
    const res = await run(handler, path);
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe(INDEX_HTML);
  });

  it.each(cases)('$type ausente/oculto por RLS (null) → 404', async ({ path, table }) => {
    const handler = createDocumentStatusHandler(baseDeps({ createClient: () => makeFakeClient({ [table]: { data: null } }) }));
    const res = await run(handler, path);
    expect(res.statusCode).toBe(404);
    expect(res.getHeader('X-Robots-Tag')).toBe('noindex');
  });

  it.each(cases)('$type com erro PostgREST → 503', async ({ path, table }) => {
    const logger = { warn: vi.fn() };
    const handler = createDocumentStatusHandler(baseDeps({ logger, createClient: () => makeFakeClient({ [table]: { error: { message: 'boom' } } }) }));
    const res = await run(handler, path);
    expect(res.statusCode).toBe(503);
    expect(res.getHeader('Retry-After')).toBe('60');
    expect(res.getHeader('Cache-Control')).toBe('no-store');
    expect(res.getHeader('X-Robots-Tag')).toBe('noindex, nofollow');
  });

  it('anúncio ACTIVE porém expirado → 404', async () => {
    const handler = createDocumentStatusHandler(baseDeps({
      createClient: () => makeFakeClient({ announcements: { data: { id: UUID, slug: AD_SLUG, status: 'ACTIVE', expires_at: '2020-01-01T00:00:00Z' } } }),
    }));
    const res = await run(handler, `/anuncio/${AD_SLUG}`);
    expect(res.statusCode).toBe(404);
  });

  it('URL legada com UUID → 308 para o slug, preservando query pública', async () => {
    const handler = createDocumentStatusHandler(baseDeps({
      createClient: () => makeFakeClient({ announcements: { data: { id: UUID, slug: AD_SLUG, status: 'ACTIVE', expires_at: null } } }),
    }));
    const res = makeRes();
    await handler({
      method: 'GET',
      query: {
        _seo_route: 'document',
        path: `/anuncio/${UUID}`,
        identifier: UUID,
        utm_source: 'whatsapp',
        ref: ['a', 'b'],
      },
    }, res);
    expect(res.statusCode).toBe(308);
    expect(res.getHeader('Location')).toBe(
      `https://agrobw.com.br/anuncio/${AD_SLUG}?utm_source=whatsapp&ref=a&ref=b`,
    );
    expect(res.getHeader('Cache-Control')).toBe('public, max-age=3600');
    expect(res.getHeader('Vary')).toBe('User-Agent');
  });

  it('HEAD da URL legada → mesmo 308, sem corpo', async () => {
    const handler = createDocumentStatusHandler(baseDeps({
      createClient: () => makeFakeClient({ announcements: { data: { id: UUID, slug: AD_SLUG, status: 'ACTIVE', expires_at: null } } }),
    }));
    const res = await run(handler, `/anuncio/${UUID}`, 'HEAD');
    expect(res.statusCode).toBe(308);
    expect(res.getHeader('Location')).toBe(`https://agrobw.com.br/anuncio/${AD_SLUG}`);
    expect(res.body).toBeUndefined();
  });

  it('timeout real (query pendente + abort) → 503, sem pendurar', async () => {
    const handler = createDocumentStatusHandler(baseDeps({
      queryTimeoutMs: 20,
      createClient: () => makeFakeClient({ announcements: { hang: true } }),
    }));
    const res = await run(handler, `/anuncio/${UUID}`);
    expect(res.statusCode).toBe(503);
  });
});

// ---------- config ausente / createClient lançando ----------

describe('document-handler: indisponibilidade de configuração → 503', () => {
  it('config ausente (sem env) → 503 (dinâmico)', async () => {
    const createClient = vi.fn();
    const handler = createDocumentStatusHandler(baseDeps({ env: {}, createClient }));
    const res = await run(handler, `/anuncio/${UUID}`);
    expect(res.statusCode).toBe(503);
    expect(createClient).not.toHaveBeenCalled();
  });

  it('createClient lançando (com segredo) → 503, sem vazar', async () => {
    const logger = { warn: vi.fn() };
    const handler = createDocumentStatusHandler(baseDeps({
      logger,
      createClient: () => { throw new Error('postgres://user:S3CRET@host'); },
    }));
    const res = await run(handler, `/anuncio/${UUID}`);
    expect(res.statusCode).toBe(503);
    expect(String(res.body)).not.toContain('S3CRET');
    const logged = logger.warn.mock.calls.flat().join(' ');
    expect(logged).not.toContain('S3CRET');
    expect(logged).not.toContain('postgres://');
  });
});

// ---------- métodos + index.html ----------

describe('document-handler: métodos e index.html', () => {
  it('HEAD → mesmo status/headers, corpo vazio', async () => {
    const handler = createDocumentStatusHandler(baseDeps());
    const res = await run(handler, '/desconhecida', 'HEAD');
    expect(res.statusCode).toBe(404);
    expect(res.getHeader('X-Robots-Tag')).toBe('noindex');
    expect(res.body).toBeUndefined();
  });

  it('POST → 405 com Allow: GET, HEAD', async () => {
    const handler = createDocumentStatusHandler(baseDeps());
    const res = await run(handler, '/', 'POST');
    expect(res.statusCode).toBe(405);
    expect(res.getHeader('Allow')).toBe('GET, HEAD');
  });

  it('falha ao carregar index.html → 503 (nunca 404/redirect)', async () => {
    const handler = createDocumentStatusHandler(baseDeps({ fetchIndexHtml: async () => { throw new Error('x'); } }));
    const res = await run(handler, '/');
    expect(res.statusCode).toBe(503);
    expect(res.getHeader('Retry-After')).toBe('60');
    expect(String(res.body)).toContain('noindex');
    expect(String(res.body)).not.toContain('<div id="root">');
  });
});

// ---------- loja: navegador vs crawler, consulta única, layout opcional ----------

describe('document-handler: loja (validação unificada + OG)', () => {
  const STORE = { slug: 'loja-x', store_name: 'Loja X', description: 'desc', is_active: true, is_store_feature_enabled: true, is_paused_due_to_plan: false };

  it('loja elegível + navegador → 200 SPA cru (sem OG, sem 2ª consulta)', async () => {
    const renderStoreOg = vi.fn(({ html }) => html);
    const client = makeFakeClient({ seller_stores: { data: STORE } });
    const handler = createDocumentStatusHandler(baseDeps({ isSocialCrawler: () => false, renderStoreOg, createClient: () => client }));
    const res = await run(handler, '/loja/loja-x');
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe(INDEX_HTML);
    expect(renderStoreOg).not.toHaveBeenCalled();
    expect(client.calls['seller_stores']).toBe(1);
    expect(client.calls['layout_settings']).toBeUndefined();
    expect(res.getHeader('Vary')).toBe('User-Agent'); // navegador
  });

  it('loja elegível + crawler → 200 com OG específico; UMA consulta a seller_stores', async () => {
    const renderStoreOg = vi.fn(({ store }) => `<html>OG:${store.slug}</html>`);
    const client = makeFakeClient({ seller_stores: { data: STORE }, layout_settings: { data: { og_default_image_url: 'https://cdn/x.png' } } });
    const handler = createDocumentStatusHandler(baseDeps({ isSocialCrawler: () => true, renderStoreOg, createClient: () => client }));
    const res = await run(handler, '/loja/loja-x');
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe('<html>OG:loja-x</html>');
    expect(client.calls['seller_stores']).toBe(1); // consulta única da loja
    expect(renderStoreOg).toHaveBeenCalledTimes(1);
    expect(renderStoreOg.mock.calls[0][0].ogImageUrl).toBe('https://cdn/x.png');
    expect(res.getHeader('Vary')).toBe('User-Agent'); // crawler → mesma URL, corpo diferente
  });

  it('mesma URL: navegador (SPA) e crawler (OG) geram corpos diferentes, ambos com Vary', async () => {
    const client1 = makeFakeClient({ seller_stores: { data: STORE } });
    const nav = createDocumentStatusHandler(baseDeps({ isSocialCrawler: () => false, renderStoreOg: ({ html }) => html, createClient: () => client1 }));
    const rNav = await run(nav, '/loja/loja-x');
    const client2 = makeFakeClient({ seller_stores: { data: STORE }, layout_settings: { data: null } });
    const cra = createDocumentStatusHandler(baseDeps({ isSocialCrawler: () => true, renderStoreOg: ({ store }) => `<html>OG:${store.slug}</html>`, createClient: () => client2 }));
    const rCra = await run(cra, '/loja/loja-x');
    expect(rNav.body).not.toBe(rCra.body);
    expect(String(rNav.body)).not.toContain('OG:loja-x'); // navegador: SPA sem OG específico
    expect(String(rCra.body)).toContain('OG:loja-x'); // crawler: OG específico
    expect(rNav.getHeader('Vary')).toBe('User-Agent');
    expect(rCra.getHeader('Vary')).toBe('User-Agent');
  });

  it('loja inelegível (null) → 404 tanto navegador quanto crawler', async () => {
    for (const crawler of [false, true]) {
      const client = makeFakeClient({ seller_stores: { data: null } });
      const handler = createDocumentStatusHandler(baseDeps({ isSocialCrawler: () => crawler, createClient: () => client }));
      const res = await run(handler, '/loja/inexistente');
      expect(res.statusCode).toBe(404);
      expect(res.getHeader('X-Robots-Tag')).toBe('noindex');
    }
  });

  it('loja pausada → 404 (RLS/elegibilidade)', async () => {
    const client = makeFakeClient({ seller_stores: { data: { ...STORE, is_paused_due_to_plan: true } } });
    const handler = createDocumentStatusHandler(baseDeps({ isSocialCrawler: () => true, createClient: () => client }));
    const res = await run(handler, '/loja/loja-x');
    expect(res.statusCode).toBe(404);
  });

  it('loja com erro → 503 tanto navegador quanto crawler', async () => {
    for (const crawler of [false, true]) {
      const client = makeFakeClient({ seller_stores: { error: { message: 'x' } } });
      const handler = createDocumentStatusHandler(baseDeps({ isSocialCrawler: () => crawler, createClient: () => client }));
      const res = await run(handler, '/loja/loja-x');
      expect(res.statusCode).toBe(503);
    }
  });

  it('falha de layout_settings mantém 200 e usa og-default (ogImageUrl null)', async () => {
    const renderStoreOg = vi.fn(({ store }) => `<html>OG:${store.slug}</html>`);
    const client = makeFakeClient({ seller_stores: { data: STORE }, layout_settings: { throw: new Error('layout down') } });
    const handler = createDocumentStatusHandler(baseDeps({ isSocialCrawler: () => true, renderStoreOg, createClient: () => client }));
    const res = await run(handler, '/loja/loja-x');
    expect(res.statusCode).toBe(200);
    expect(renderStoreOg).toHaveBeenCalledTimes(1);
    expect(renderStoreOg.mock.calls[0][0].ogImageUrl).toBeNull();
    expect(client.calls['seller_stores']).toBe(1);
  });
});

// ---------- segurança / ausência de 410 ----------

describe('document-handler: segurança e ausência de 410', () => {
  const FORBIDDEN = [/apikey/i, /service_role/i, /\/rest\/v1/i, /\/auth\/v1/i, /\bselect\s/i, /postgres:\/\//i, /eyJ[A-Za-z0-9_-]{6}/];

  it('nenhuma resposta é 410; corpo/headers sem chave/endpoint/SQL', async () => {
    const samples = ['/', '/desconhecida', `/anuncio/${UUID}`, '/loja/x', '/p/z'];
    for (const path of samples) {
      const handler = createDocumentStatusHandler(baseDeps({ createClient: () => makeFakeClient({}) }));
      const res = await run(handler, path);
      expect(res.statusCode).not.toBe(410);
      const serialized = `${res.statusCode} ${String(res.body)}`;
      for (const re of FORBIDDEN) expect(re.test(serialized)).toBe(false);
    }
  });

  it('imagem PÚBLICA de Storage do Supabase é permitida em og:image (não é segredo)', () => {
    const storageImg = 'https://dockpbyzrvgewgdoaibn.supabase.co/storage/v1/object/public/layout_assets/og.png';
    const out = renderStoreOgHtml({ html: '<head></head>', store: { store_name: 'X', slug: 'x' }, ogImageUrl: storageImg, baseUrl: CANONICAL_ORIGIN });
    expect(out).toContain(storageImg); // legítimo, preservado
    // mas nenhum padrão sensível:
    for (const re of FORBIDDEN) expect(re.test(out)).toBe(false);
  });

  it('slug/UUID inválido nunca consulta o banco', async () => {
    const createClient = vi.fn(() => makeFakeClient({}));
    const handler = createDocumentStatusHandler(baseDeps({ createClient }));
    for (const p of ['/anuncio/NAO_VALIDO', '/loja/-x', '/p/pt.br', '/noticias/COM_MAIUS']) {
      await run(handler, p);
    }
    expect(createClient).not.toHaveBeenCalled();
  });
});

// ---------- Vary: User-Agent (anti-mistura de cache) ----------

describe('withUserAgentVary: dedup e preservação', () => {
  it('adiciona User-Agent quando ausente', () => {
    expect(withUserAgentVary({}).Vary).toBe('User-Agent');
    expect(withUserAgentVary({ 'Content-Type': 'text/html' }).Vary).toBe('User-Agent');
  });
  it('preserva Vary existente e acrescenta User-Agent', () => {
    expect(withUserAgentVary({ Vary: 'Accept-Encoding' }).Vary).toBe('Accept-Encoding, User-Agent');
  });
  it('não duplica User-Agent (case-insensitive)', () => {
    expect(withUserAgentVary({ Vary: 'User-Agent' }).Vary).toBe('User-Agent');
    expect(withUserAgentVary({ Vary: 'user-agent' }).Vary).toBe('user-agent');
    expect(withUserAgentVary({ Vary: 'Accept, USER-AGENT' }).Vary).toBe('Accept, USER-AGENT');
  });
  it('preserva os demais headers', () => {
    const out = withUserAgentVary({ 'Content-Type': 'text/html; charset=utf-8', 'X-Robots-Tag': 'noindex' });
    expect(out['Content-Type']).toBe('text/html; charset=utf-8');
    expect(out['X-Robots-Tag']).toBe('noindex');
    expect(out.Vary).toBe('User-Agent');
  });
});

describe('sitemap não recebe Vary: User-Agent por esta mudança', () => {
  it('resposta do sitemap (fallback) não declara Vary', async () => {
    const handler = createSitemapHandler({ env: {}, now: () => Date.now(), createClient: () => ({}) as any });
    const res = makeRes();
    await handler({ method: 'GET' }, res);
    expect(res.statusCode).toBe(200);
    expect(res.getHeader('Content-Type')).toBe('application/xml; charset=utf-8');
    expect(res.getHeader('Vary')).toBeUndefined();
  });
});

// ---------- dispatcher (og-loja) ----------

describe('og-loja dispatcher: marcador document isolado', () => {
  const mk = () => ({ sitemap: vi.fn(async () => {}), og: vi.fn(async () => {}), document: vi.fn(async () => {}) });

  it('_seo_route=document → document handler', async () => {
    const s = mk();
    await createSeoDispatcher(s)({ method: 'GET', query: { _seo_route: 'document', path: '/x' } }, makeRes());
    expect(s.document).toHaveBeenCalledTimes(1);
    expect(s.sitemap).not.toHaveBeenCalled();
    expect(s.og).not.toHaveBeenCalled();
  });

  it('_seo_route=sitemap → sitemap (continua XML)', async () => {
    const s = mk();
    await createSeoDispatcher(s)({ method: 'GET', query: { _seo_route: 'sitemap' } }, makeRes());
    expect(s.sitemap).toHaveBeenCalledTimes(1);
    expect(s.document).not.toHaveBeenCalled();
  });

  it('sem marcador → OG legado', async () => {
    const s = mk();
    await createSeoDispatcher(s)({ method: 'GET', query: {} }, makeRes());
    expect(s.og).toHaveBeenCalledTimes(1);
    expect(s.document).not.toHaveBeenCalled();
  });

  it('marcador diferente → OG legado (não document)', async () => {
    const s = mk();
    await createSeoDispatcher(s)({ method: 'GET', query: { _seo_route: 'outro' } }, makeRes());
    expect(s.og).toHaveBeenCalledTimes(1);
    expect(s.document).not.toHaveBeenCalled();
  });
});

// ---------- renderStoreOgHtml (sem regressão de OG) ----------

describe('renderStoreOgHtml: OG da loja e OG da home', () => {
  it('loja → título/URL/imagem específicos', () => {
    const out = renderStoreOgHtml({ html: '<head></head>', store: { store_name: 'Loja X', slug: 'loja-x', description: 'd' }, ogImageUrl: null, baseUrl: 'https://agrobw.com.br' });
    expect(out).toContain('Loja X | Loja Parceira AGRO BW');
    expect(out).toContain('https://agrobw.com.br/loja/loja-x');
    expect(out).toContain('https://agrobw.com.br/og-default.png');
  });
  it('home (store null) → título canônico da Home (fonte compartilhada)', () => {
    const out = renderStoreOgHtml({ html: '<head></head>', store: null, ogImageUrl: null, baseUrl: 'https://agrobw.com.br' });
    expect(out).toContain('Marketplace rural para comprar e vender no agronegócio | AGRO BW');
  });
  it('usa a imagem OG do painel quando fornecida', () => {
    const out = renderStoreOgHtml({ html: '<head></head>', store: { store_name: 'Y', slug: 'y' }, ogImageUrl: 'https://cdn/y.png', baseUrl: 'https://agrobw.com.br' });
    expect(out).toContain('https://cdn/y.png');
  });
});

// ---------- índice canônico + validação de marcador root ----------

describe('index canônico e validação de marcador root', () => {
  it('isAppIndexHtml aceita só HTML com o container root real', () => {
    expect(isAppIndexHtml(INDEX_HTML)).toBe(true);
    expect(isAppIndexHtml('<div id="root"></div>')).toBe(true);
    expect(isAppIndexHtml("<div class='x' id='root'></div>")).toBe(true);
    expect(isAppIndexHtml(LOGIN_HTML)).toBe(false); // proteção/login da Vercel
    expect(isAppIndexHtml('<html>erro 500</html>')).toBe(false);
    expect(isAppIndexHtml('')).toBe(false);
    expect(isAppIndexHtml(null as unknown as string)).toBe(false);
  });

  it('loadCanonicalIndexHtml busca SEMPRE na origem canônica', async () => {
    const seen: string[] = [];
    const out = await loadCanonicalIndexHtml(async (origin: string) => { seen.push(origin); return INDEX_HTML; }, 50);
    expect(seen[0]).toBe(CANONICAL_ORIGIN);
    expect(out).toBe(INDEX_HTML);
  });

  it('loadCanonicalIndexHtml rejeita HTML 200 sem marcador (login da Vercel)', async () => {
    await expect(loadCanonicalIndexHtml(async () => LOGIN_HTML, 50)).rejects.toBeTruthy();
  });

  it('fetchTrustedIndexHtml (OG legado) rejeita HTML inválido → sem injeção de OG', async () => {
    await expect(fetchTrustedIndexHtml({ fetchImpl: async () => LOGIN_HTML })).rejects.toBeTruthy();
  });
});

describe('document-handler: origem interna confiável (nunca Host/x-forwarded-host)', () => {
  const STORE = { slug: 'loja-x', store_name: 'Loja X', description: 'd', is_active: true, is_store_feature_enabled: true, is_paused_due_to_plan: false };

  it('Host/x-forwarded-host maliciosos nunca são usados no fetch do index', async () => {
    const seen: string[] = [];
    const fetchIndexHtml = vi.fn(async (origin: string) => { seen.push(origin); return INDEX_HTML; });
    const handler = createDocumentStatusHandler(baseDeps({ env: {}, fetchIndexHtml }));
    const res = makeRes();
    await handler({ method: 'GET', query: { path: '/' }, headers: { host: 'evil.com', 'x-forwarded-host': 'evil.com' } }, res);
    expect(res.statusCode).toBe(200);
    expect(seen[0]).toBe(CANONICAL_ORIGIN);
    expect(seen[0]).not.toContain('evil.com');
  });

  it('VERCEL_URL presente NÃO altera a origem (sempre canônica)', async () => {
    const seen: string[] = [];
    const fetchIndexHtml = vi.fn(async (origin: string) => { seen.push(origin); return INDEX_HTML; });
    const handler = createDocumentStatusHandler(baseDeps({ env: { VERCEL_URL: 'bwagro-abc.vercel.app' }, fetchIndexHtml }));
    await handler({ method: 'GET', query: { path: '/' }, headers: { host: 'evil.com' } }, makeRes());
    expect(seen[0]).toBe(CANONICAL_ORIGIN);
    expect(seen[0]).not.toContain('vercel.app');
  });

  it('sem VERCEL_URL → usa https://agrobw.com.br/index.html', async () => {
    const seen: string[] = [];
    const fetchIndexHtml = vi.fn(async (origin: string) => { seen.push(origin); return INDEX_HTML; });
    const handler = createDocumentStatusHandler(baseDeps({ env: {}, fetchIndexHtml }));
    await handler({ method: 'GET', query: { path: '/' } }, makeRes());
    expect(seen[0]).toBe(CANONICAL_ORIGIN);
  });

  it('index 200 sem marcador root (login da Vercel) → document 503, sem OG', async () => {
    const renderStoreOg = vi.fn(({ html }: any) => html);
    const client = makeFakeClient({ seller_stores: { data: STORE } });
    const handler = createDocumentStatusHandler(baseDeps({
      isSocialCrawler: () => true,
      renderStoreOg,
      createClient: () => client,
      fetchIndexHtml: async () => LOGIN_HTML,
    }));
    const res = await run(handler, '/loja/loja-x');
    expect(res.statusCode).toBe(503);
    expect(res.getHeader('Retry-After')).toBe('60');
    expect(renderStoreOg).not.toHaveBeenCalled(); // nunca injeta OG em página de login
    expect(String(res.body)).not.toContain('Vercel Authentication');
  });

  it('Host malicioso nunca aparece em canonical/og:* (baseUrl canônico)', async () => {
    const renderStoreOg = vi.fn(({ store }: any) => `OG:${store.slug}`);
    const client = makeFakeClient({ seller_stores: { data: STORE }, layout_settings: { data: null } });
    const handler = createDocumentStatusHandler(baseDeps({ isSocialCrawler: () => true, renderStoreOg, createClient: () => client }));
    await handler({ method: 'GET', query: { path: '/loja/loja-x' }, headers: { host: 'evil.com', 'x-forwarded-host': 'evil.com' } }, makeRes());
    expect(renderStoreOg.mock.calls[0][0].baseUrl).toBe(CANONICAL_ORIGIN);
  });
});

describe('document-handler: timeout real do index.html', () => {
  it('index pendente sofre timeout real → 503 (mesmo ignorando o signal)', async () => {
    const fetchIndexHtml = () => new Promise<string>(() => {}); // nunca resolve, ignora signal
    const handler = createDocumentStatusHandler(baseDeps({ indexTimeoutMs: 20, fetchIndexHtml }));
    const res = await run(handler, '/');
    expect(res.statusCode).toBe(503);
    expect(res.getHeader('Retry-After')).toBe('60');
    expect(res.getHeader('Cache-Control')).toBe('no-store');
    expect(res.getHeader('X-Robots-Tag')).toBe('noindex, nofollow');
  });

  it('duas requisições concorrentes têm timers/controllers independentes → ambas 503', async () => {
    const fetchIndexHtml = () => new Promise<string>(() => {});
    const handler = createDocumentStatusHandler(baseDeps({ indexTimeoutMs: 20, fetchIndexHtml }));
    const [r1, r2] = await Promise.all([run(handler, '/a'), run(handler, '/b')]);
    expect(r1.statusCode).toBe(503);
    expect(r2.statusCode).toBe(503);
  });

  it('loadIndexWithTimeout resolve e limpa o timer', async () => {
    const spy = vi.spyOn(global, 'clearTimeout');
    const out = await loadIndexWithTimeout(async () => 'HTML', CANONICAL_ORIGIN, 50);
    expect(out).toBe('HTML');
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('loadIndexWithTimeout rejeita em timeout e limpa o timer', async () => {
    const spy = vi.spyOn(global, 'clearTimeout');
    await expect(loadIndexWithTimeout(() => new Promise(() => {}), CANONICAL_ORIGIN, 20)).rejects.toBeTruthy();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
