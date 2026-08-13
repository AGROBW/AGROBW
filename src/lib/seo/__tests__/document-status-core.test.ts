import { describe, it, expect } from 'vitest';
import {
  classifyRoute,
  normalizePathname,
  isValidSlug,
  isValidUuid,
  isCanonicalCategory,
  mapOutcomeToStatus,
  buildStatusHeaders,
  resolveRouteStatus,
  CANONICAL_CATEGORY_SLUGS,
  STATIC_ROUTES,
  PRIVATE_TREE_PREFIXES,
  PRIVATE_EXACT_ROUTES,
} from '../../../../server/document-status-core.mjs';

const UUID = 'e6067e9b-5547-4fde-8b6a-c0c80f230d1a';

const kindOf = (p: string) => classifyRoute(p).kind;
const statusOf = (p: string) => classifyRoute(p).status;

describe('document-status-core: rotas estáticas públicas → 200 sem banco', () => {
  const routes = [
    '/', '/anuncios', '/categorias', '/planos', '/vitrine', '/patrocinador',
    '/lojas-parceiras', '/contato', '/noticias', '/quem-somos', '/termos-de-uso',
    '/privacidade', '/politica-de-cookies', '/politica-de-precos', '/login',
    '/cadastro', '/redefinir-senha',
  ];
  it.each(routes)('%s → static 200', (p) => {
    const r = classifyRoute(p);
    expect(r.kind).toBe('static');
    expect(r.needsDb).toBe(false);
    expect(r.status).toBe(200);
  });
  it('lista STATIC_ROUTES cobre exatamente as rotas fixas testadas', () => {
    expect([...STATIC_ROUTES].sort()).toEqual([...routes].sort());
  });
});

describe('document-status-core: rotas privadas/técnicas → 200 passthrough sem banco', () => {
  const privates = [
    '/minha-conta', '/minha-conta/favoritos', '/admin', '/admin/login', '/admin/users',
    '/admin/mfa', '/anunciar', '/mensagens', '/favoritos',
  ];
  it.each(privates)('%s → private 200', (p) => {
    const r = classifyRoute(p);
    expect(r.kind).toBe('private');
    expect(r.needsDb).toBe(false);
    expect(r.status).toBe(200);
  });

  const technical = ['/api', '/api/og-loja', '/api/sitemap', '/assets/app.js', '/robots.txt', '/sitemap.xml', '/favicon.ico', '/meta-oauth-callback.html'];
  it.each(technical)('%s → excluded, sem banco, 404 (nunca soft-200)', (p) => {
    const r = classifyRoute(p);
    expect(r.kind).toBe('excluded');
    expect(r.needsDb).toBe(false);
    expect(r.status).toBe(404);
  });

  it('prefixo privado não casa nome parecido (/minha-contaX)', () => {
    expect(kindOf('/minha-contaX')).toBe('unknown');
    expect(statusOf('/minha-contaX')).toBe(404);
  });

  // Hardening: rotas privadas EXATAS não aceitam descendentes.
  it.each(['/anunciar', '/mensagens', '/favoritos'])('exata %s → private 200', (p) => {
    const r = classifyRoute(p);
    expect(r.kind).toBe('private');
    expect(r.status).toBe(200);
  });
  it.each(['/anunciar/x', '/mensagens/x', '/favoritos/x', '/anunciar/nova/coisa'])(
    'descendente de rota exata %s → 404 (cai no catch-all do React)',
    (p) => {
      const r = classifyRoute(p);
      expect(r.needsDb).toBe(false);
      expect(r.status).toBe(404);
    },
  );
  it.each(['/admin/users', '/admin/settings', '/minha-conta/anuncios', '/minha-conta/favoritos'])(
    'descendente de árvore privada %s → private 200',
    (p) => {
      expect(classifyRoute(p).kind).toBe('private');
      expect(classifyRoute(p).status).toBe(200);
    },
  );
  it.each(['/admin-falso', '/minha-conta-falsa', '/anunciar-x', '/favoritosx'])(
    'nome parecido %s → 404 (não é privada)',
    (p) => {
      expect(classifyRoute(p).kind).not.toBe('private');
      expect(classifyRoute(p).status).toBe(404);
    },
  );
  it('as duas famílias privadas expõem apenas o esperado', () => {
    expect(PRIVATE_TREE_PREFIXES).toEqual(['/minha-conta', '/admin']);
    expect([...PRIVATE_EXACT_ROUTES].sort()).toEqual(['/anunciar', '/favoritos', '/mensagens']);
  });
});

describe('document-status-core: categorias (classificação pura, sem banco)', () => {
  it.each(CANONICAL_CATEGORY_SLUGS)('/categoria/%s → 200 category', (slug) => {
    const r = classifyRoute(`/categoria/${slug}`);
    expect(r.kind).toBe('category');
    expect(r.needsDb).toBe(false);
    expect(r.status).toBe(200);
  });
  it('exatamente 6 categorias canônicas', () => {
    expect(CANONICAL_CATEGORY_SLUGS.slice().sort()).toEqual(
      ['animais', 'imoveis', 'insumos', 'maquinas', 'sementes', 'servicos'],
    );
  });
  it.each(['inexistente', 'tratores', 'Animais', 'animais2', 'anim ais'])(
    '/categoria/%s (não canônica/malformada) → 404 sem banco',
    (slug) => {
      const r = classifyRoute(`/categoria/${slug}`);
      expect(r.kind).toBe('category-invalid');
      expect(r.needsDb).toBe(false);
      expect(r.status).toBe(404);
    },
  );
});

describe('document-status-core: conteúdo dinâmico (formato)', () => {
  it('anúncio com UUID válido → dynamic/ad/needsDb', () => {
    const r = classifyRoute(`/anuncio/${UUID}`);
    expect(r).toMatchObject({ kind: 'dynamic', type: 'ad', needsDb: true, id: UUID });
    expect(r.status).toBeUndefined();
  });
  it.each(['nao-uuid', '123', UUID.slice(0, -1), `${UUID}x`])(
    '/anuncio/%s (UUID inválido) → 404 sem banco',
    (id) => {
      const r = classifyRoute(`/anuncio/${id}`);
      expect(r.kind).toBe('invalid');
      expect(r.needsDb).toBe(false);
      expect(r.status).toBe(404);
    },
  );

  it('loja/notícia/CMS com slug válido → dynamic/needsDb', () => {
    expect(classifyRoute('/loja/evolucao-metalurgica')).toMatchObject({ kind: 'dynamic', type: 'store', needsDb: true, slug: 'evolucao-metalurgica' });
    expect(classifyRoute('/noticias/preco-do-milho')).toMatchObject({ kind: 'dynamic', type: 'news', needsDb: true });
    expect(classifyRoute('/p/politica-de-privacidade')).toMatchObject({ kind: 'dynamic', type: 'cms', needsDb: true });
  });

  it.each(['/loja/Loja X', '/loja/-x', '/loja/x-', '/loja/a--b', '/noticias/COM_MAIUS', '/p/pt.br'])(
    '%s (slug inválido) → 404 sem banco',
    (p) => {
      const r = classifyRoute(p);
      expect(r.kind).toBe('invalid');
      expect(r.needsDb).toBe(false);
      expect(r.status).toBe(404);
    },
  );

  it.each(['/p/politica-de-cookies', '/p/politica-de-precos', '/p/termos-de-uso', '/p/privacidade', '/p/admin', '/p/api'])(
    '%s (slug CMS reservado) → 404 sem banco',
    (p) => {
      const r = classifyRoute(p);
      expect(r.kind).toBe('cms-reserved');
      expect(r.needsDb).toBe(false);
      expect(r.status).toBe(404);
    },
  );
});

describe('document-status-core: rota desconhecida', () => {
  it.each(['/xyz', '/anuncio', '/loja', '/noticias/', '/p', '/categoria', '/foo/bar/baz'])(
    '%s → unknown 404 sem banco',
    (p) => {
      const r = classifyRoute(p);
      expect(r.needsDb).toBe(false);
      expect(r.status).toBe(404);
    },
  );
});

describe('document-status-core: barra final (Fase 1 = 404; canonicalização fica p/ Fase 2)', () => {
  // Registro explícito: nesta fase NÃO normalizamos silenciosamente para 200.
  it.each(['/anuncios/', '/categoria/animais/', '/loja/x/', '/p/z/'])(
    '%s (com barra final) → 404 nesta fase',
    (p) => {
      expect(classifyRoute(p).status).toBe(404);
      expect(classifyRoute(p).needsDb).toBe(false);
    },
  );
});

describe('document-status-core: query/hash não alteram a classificação', () => {
  it('categoria válida com query/hash continua 200', () => {
    expect(statusOf('/categoria/animais?utm=x#topo')).toBe(200);
  });
  it('anúncio com query/hash preserva UUID', () => {
    expect(classifyRoute(`/anuncio/${UUID}?ref=1#a`)).toMatchObject({ type: 'ad', needsDb: true });
  });
  it('normalizePathname remove query/hash e aceita URL absoluta', () => {
    expect(normalizePathname('/loja/x?a=1#b')).toBe('/loja/x');
    expect(normalizePathname('https://agrobw.com.br/p/y?z=1')).toBe('/p/y');
    expect(normalizePathname('')).toBe('/');
    expect(normalizePathname('anuncios')).toBe('/anuncios');
  });
});

describe('document-status-core: segurança (traversal, encoding, vazios)', () => {
  it.each([
    '/p/..',
    '/p/../../etc/passwd',
    '/loja/a%2Fb',
    '/loja/a%2fb',
    '/anuncio/%2e%2e',
    '/p/a%00b',
    '/loja/',
    '/p/',
    '/anuncio/',
    '/loja/a b',
    '/p/a\\b',
    '/categoria/%2e%2e',
  ])('%s → não consulta banco e nunca 200', (p) => {
    const r = classifyRoute(p);
    expect(r.needsDb).toBe(false);
    expect(r.status).not.toBe(200);
    expect([404]).toContain(r.status);
  });

  it('validadores rejeitam entradas maliciosas', () => {
    expect(isValidSlug('')).toBe(false);
    expect(isValidSlug('a/b')).toBe(false);
    expect(isValidSlug('a%2Fb')).toBe(false);
    expect(isValidSlug('..')).toBe(false);
    expect(isValidSlug('Ab')).toBe(false);
    expect(isValidSlug('a--b')).toBe(false);
    expect(isValidSlug('a-b-c')).toBe(true);
    expect(isValidUuid('nope')).toBe(false);
    expect(isValidUuid(UUID)).toBe(true);
    expect(isCanonicalCategory('animais')).toBe(true);
    expect(isCanonicalCategory('inexistente')).toBe(false);
  });
});

describe('document-status-core: mapeamento de resultado → status', () => {
  it('found/not_found/error/timeout → 200/404/503', () => {
    expect(mapOutcomeToStatus('found')).toBe(200);
    expect(mapOutcomeToStatus('not_found')).toBe(404);
    expect(mapOutcomeToStatus('transient_error')).toBe(503);
    expect(mapOutcomeToStatus('timeout')).toBe(503);
  });
  it('qualquer outcome desconhecido → 503 (nunca 404)', () => {
    expect(mapOutcomeToStatus('anything')).toBe(503);
    expect(mapOutcomeToStatus(undefined as unknown as string)).toBe(503);
    expect(mapOutcomeToStatus(null as unknown as string)).toBe(503);
  });
  it('resolveRouteStatus: dinâmico sem outcome vira 503 (nunca 404)', () => {
    const r = resolveRouteStatus(`/anuncio/${UUID}`);
    expect(r.status).toBe(503);
  });
  it('resolveRouteStatus: dinâmico found→200, not_found→404, timeout→503', () => {
    expect(resolveRouteStatus(`/anuncio/${UUID}`, 'found').status).toBe(200);
    expect(resolveRouteStatus(`/anuncio/${UUID}`, 'not_found').status).toBe(404);
    expect(resolveRouteStatus(`/anuncio/${UUID}`, 'timeout').status).toBe(503);
  });
});

describe('document-status-core: política de headers', () => {
  it('200: text/html, sem X-Robots-Tag, sem X-Sitemap-*', () => {
    const h = buildStatusHeaders(200);
    expect(h['Content-Type']).toBe('text/html; charset=utf-8');
    expect(h['X-Robots-Tag']).toBeUndefined();
    expect(Object.keys(h).some((k) => /x-sitemap/i.test(k))).toBe(false);
  });
  it('404: X-Robots-Tag noindex + text/html', () => {
    const h = buildStatusHeaders(404);
    expect(h['X-Robots-Tag']).toBe('noindex');
    expect(h['Content-Type']).toBe('text/html; charset=utf-8');
  });
  it('503: Retry-After 60, Cache-Control no-store, X-Robots-Tag noindex, nofollow', () => {
    const h = buildStatusHeaders(503);
    expect(h['Retry-After']).toBe('60');
    expect(h['Cache-Control']).toBe('no-store');
    expect(h['X-Robots-Tag']).toBe('noindex, nofollow');
  });
});

describe('document-status-core: ausência total de 410 e de dados internos', () => {
  it('nenhuma classificação/status é 410', () => {
    const samples = [
      '/', '/anuncios', '/categoria/animais', '/categoria/xyz', `/anuncio/${UUID}`,
      '/anuncio/bad', '/loja/x', '/loja/BAD', '/noticias/y', '/p/z', '/p/admin',
      '/desconhecida', '/minha-conta', '/admin', '/api/x', '/robots.txt',
    ];
    for (const p of samples) {
      const s = classifyRoute(p).status;
      if (s !== undefined) expect(s).not.toBe(410);
    }
    for (const o of ['found', 'not_found', 'transient_error', 'timeout', 'x']) {
      expect(mapOutcomeToStatus(o)).not.toBe(410);
    }
    // buildStatusHeaders nunca produz política de 410 (usa 503 no inesperado)
    expect(buildStatusHeaders(410)['Retry-After']).toBe('60');
  });

  it('resultados não contêm segredo/SQL/erro interno', () => {
    const serialized = JSON.stringify([
      classifyRoute(`/anuncio/${UUID}`),
      classifyRoute('/loja/x'),
      resolveRouteStatus('/p/z', 'transient_error'),
      buildStatusHeaders(200),
      buildStatusHeaders(404),
      buildStatusHeaders(503),
    ]);
    expect(serialized.toLowerCase()).not.toContain('supabase');
    expect(serialized.toLowerCase()).not.toContain('apikey');
    expect(serialized.toLowerCase()).not.toContain('select ');
    expect(serialized).not.toContain('postgres://');
    expect(serialized.toLowerCase()).not.toContain('error:');
  });

  it('famílias privadas expõem apenas o esperado', () => {
    expect(PRIVATE_TREE_PREFIXES).toEqual(['/minha-conta', '/admin']);
    expect([...PRIVATE_EXACT_ROUTES].sort()).toEqual(['/anunciar', '/favoritos', '/mensagens']);
  });
});
