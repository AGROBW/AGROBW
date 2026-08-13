import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock do @vercel/functions: captura os argumentos de rewrite()/next() para
// inspecionar destino, query e headers da resposta final.
const rewriteMock = vi.fn((url: URL | string, init?: unknown) => ({ kind: 'rewrite', url, init }));
const nextMock = vi.fn((init?: unknown) => ({ kind: 'next', init }));
vi.mock('@vercel/functions', () => ({
  rewrite: (url: URL | string, init?: unknown) => rewriteMock(url, init),
  next: (init?: unknown) => nextMock(init),
}));

import middleware, { config } from '../../../../middleware';
import { SOCIAL_CRAWLER_UAS, isSocialCrawlerUA } from '../socialCrawlerUA';

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

const makeReq = (url: string, ua?: string) =>
  new Request(url, { headers: ua ? { 'user-agent': ua } : {} });

const varyOf = (init: { headers?: HeadersInit }) => new Headers(init.headers).get('Vary');

beforeEach(() => {
  rewriteMock.mockClear();
  nextMock.mockClear();
});

describe('Home Routing Middleware: matcher e variantes', () => {
  it('matcher é EXCLUSIVAMENTE a Home "/"', () => {
    expect(config.matcher).toBe('/');
  });

  it('crawler social → rewrite p/ /api/og-loja com Vary: User-Agent na resposta final', () => {
    const res = middleware(makeReq('https://agrobw.com.br/', 'facebookexternalhit/1.1')) as unknown as {
      kind: string;
    };
    expect(res.kind).toBe('rewrite');
    expect(nextMock).not.toHaveBeenCalled();
    const [url, init] = rewriteMock.mock.calls[0] as [URL, { headers?: HeadersInit }];
    expect(url.pathname).toBe('/api/og-loja');
    expect(varyOf(init)).toBe('User-Agent');
  });

  it('navegador comum → next() com Vary: User-Agent (segue a SPA estática)', () => {
    const res = middleware(makeReq('https://agrobw.com.br/', BROWSER_UA)) as unknown as { kind: string };
    expect(res.kind).toBe('next');
    expect(rewriteMock).not.toHaveBeenCalled();
    const [init] = nextMock.mock.calls[0] as [{ headers?: HeadersInit }];
    expect(varyOf(init)).toBe('User-Agent');
  });

  it('sem User-Agent → tratado como navegador (next)', () => {
    const res = middleware(makeReq('https://agrobw.com.br/')) as unknown as { kind: string };
    expect(res.kind).toBe('next');
  });

  it('crawler em "/index" (expansão do matcher) → next, NÃO vira alias 200 da Home', () => {
    const res = middleware(makeReq('https://agrobw.com.br/index', 'facebookexternalhit/1.1')) as unknown as {
      kind: string;
    };
    expect(res.kind).toBe('next');
    expect(rewriteMock).not.toHaveBeenCalled();
  });
});

describe('Home Middleware: lista de UAs sociais', () => {
  it.each([...SOCIAL_CRAWLER_UAS])('%s (com sufixo real) → rewrite', (bot) => {
    const res = middleware(makeReq('https://agrobw.com.br/', `${bot}/1.0 (+http://exemplo)`)) as unknown as {
      kind: string;
    };
    expect(res.kind).toBe('rewrite');
  });

  it.each([
    ['Googlebot', 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'],
    ['bingbot', 'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)'],
    ['navegador', BROWSER_UA],
  ])('%s (não-social) → next (anti-cloaking: buscadores não recebem OG)', (_n, ua) => {
    const res = middleware(makeReq('https://agrobw.com.br/', ua)) as unknown as { kind: string };
    expect(res.kind).toBe('next');
  });
});

describe('Home Middleware: query string e não-confiança em params públicos', () => {
  it('preserva a query string ao reescrever (tracking utm/fbclid)', () => {
    middleware(makeReq('https://agrobw.com.br/?utm_source=fb&fbclid=123', 'facebookexternalhit'));
    const [url] = rewriteMock.mock.calls[0] as [URL];
    expect(url.pathname).toBe('/api/og-loja');
    expect(url.searchParams.get('utm_source')).toBe('fb');
    expect(url.searchParams.get('fbclid')).toBe('123');
  });

  it('remove _seo_route público (query não troca o modo do dispatcher)', () => {
    middleware(makeReq('https://agrobw.com.br/?_seo_route=sitemap&utm=x', 'facebookexternalhit'));
    const [url] = rewriteMock.mock.calls[0] as [URL];
    expect(url.searchParams.has('_seo_route')).toBe(false);
    expect(url.searchParams.get('utm')).toBe('x'); // demais params preservados
  });

  it('variante decidida por UA, NÃO por parâmetro público (?_og=1 c/ navegador → next)', () => {
    const res = middleware(
      makeReq('https://agrobw.com.br/?_og=1&_seo_route=document', BROWSER_UA),
    ) as unknown as { kind: string };
    expect(res.kind).toBe('next');
    expect(rewriteMock).not.toHaveBeenCalled();
  });
});

describe('isSocialCrawlerUA: unidade', () => {
  it('reconhece UA social real (case-insensitive, com sufixo)', () => {
    expect(
      isSocialCrawlerUA('facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)'),
    ).toBe(true);
    expect(isSocialCrawlerUA('WhatsApp/2.23.20.0')).toBe(true);
  });
  it('não reconhece navegador, Googlebot, nulo/vazio', () => {
    expect(isSocialCrawlerUA(BROWSER_UA)).toBe(false);
    expect(isSocialCrawlerUA('Googlebot/2.1')).toBe(false);
    expect(isSocialCrawlerUA(null)).toBe(false);
    expect(isSocialCrawlerUA(undefined)).toBe(false);
    expect(isSocialCrawlerUA('')).toBe(false);
  });
});
