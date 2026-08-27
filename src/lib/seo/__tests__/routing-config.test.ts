import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// Testes de ORDEM e CONTEÚDO do roteamento (vercel.json) da Fase 2B.
const ROOT = process.cwd();
const vercel = JSON.parse(fs.readFileSync(path.resolve(ROOT, 'vercel.json'), 'utf8'));
const rewrites: Array<{ source: string; destination: string; has?: unknown }> = vercel.rewrites || [];

const find = (source: string, withHas = false) =>
  rewrites.find((r) => r.source === source && (withHas ? !!r.has : !r.has));
const indexOfSource = (pred: (r: { source: string; destination: string; has?: unknown }) => boolean) =>
  rewrites.findIndex(pred);
// Emula o casamento ANCORADO da Vercel (path-to-regexp) para as fontes regex.
const matches = (source: string, pathname: string) => new RegExp(`^${source}$`).test(pathname);

const PASSTHROUGH_RE = /anuncios\|categorias/;
const passthrough = () => rewrites.find((r) => PASSTHROUGH_RE.test(r.source) && r.destination === '/index.html');
const catchAll = () => rewrites[rewrites.length - 1];

describe('vercel.json: trailingSlash e ausência de redirect manual', () => {
  it('trailingSlash: false (redirect nativo de barra final)', () => {
    expect(vercel.trailingSlash).toBe(false);
  });
  it('NÃO há redirect manual de barra final', () => {
    const redirects: Array<{ source: string }> = vercel.redirects || [];
    expect(redirects.some((r) => /\/$/.test(r.source) || /:path\+\//.test(r.source))).toBe(false);
  });
});

describe('vercel.json: OG/sitemap preservados', () => {
  it('Home OG social NÃO é mais rewrite condicional de UA (agora via middleware.ts)', () => {
    // A rewrite `/` + has(user-agent) foi REMOVIDA: precedência de filesystem na
    // Vercel fazia o index.html físico servir "/" antes da rewrite, então ela
    // nunca disparava. A Home OG passou a ser feita pela Routing Middleware
    // (middleware.ts, matcher "/"), que roda ANTES do filesystem.
    expect(find('/', true)).toBeUndefined();
    // Nenhuma rewrite condicional de user-agent deve restar no vercel.json.
    expect(rewrites.some((r) => JSON.stringify(r.has || '').includes('user-agent'))).toBe(false);
  });
  it('sitemap dispatcher intacto', () => {
    expect(find('/api/sitemap')?.destination).toBe('/api/og-loja?_seo_route=sitemap');
    expect(find('/sitemap.xml')?.destination).toBe('/api/og-loja?_seo_route=sitemap');
  });
  it('rewrite social ISOLADA de /loja foi removida (unificada no document)', () => {
    expect(find('/loja/:slug', true)).toBeUndefined();
    expect(find('/loja/:slug')?.destination).toContain('_seo_route=document');
  });
});

describe('vercel.json: rotas dinâmicas → modo document com captura documentada', () => {
  it.each([
    ['/anuncio/:identifier', '/api/og-loja?_seo_route=document&path=/anuncio/:identifier'],
    ['/loja/:slug', '/api/og-loja?_seo_route=document&path=/loja/:slug'],
    ['/noticias/:slug', '/api/og-loja?_seo_route=document&path=/noticias/:slug'],
    ['/p/:slug', '/api/og-loja?_seo_route=document&path=/p/:slug'],
    ['/categoria/:slug', '/api/og-loja?_seo_route=document&path=/categoria/:slug'],
  ])('%s → %s', (source, destination) => {
    expect(find(source)?.destination).toBe(destination);
  });
});

describe('vercel.json: passthrough explícito e catch-all', () => {
  it('"/" (navegador) → index.html', () => {
    expect(find('/')?.destination).toBe('/index.html');
  });

  it('passthrough de ESTÁTICAS casa rotas válidas e NÃO casa subrotas/desconhecidas', () => {
    const p = passthrough();
    expect(p).toBeDefined();
    for (const ok of ['/anuncios', '/planos', '/politica-de-cookies', '/anunciar', '/favoritos', '/quem-somos']) {
      expect(matches(p!.source, ok)).toBe(true);
    }
    for (const bad of ['/anunciar/x', '/anuncios/x', '/favoritos/x', '/desconhecida', '/minha-conta', '/admin']) {
      expect(matches(p!.source, bad)).toBe(false);
    }
  });

  it('rotas privadas têm passthrough próprio (:path* documentado) → index.html', () => {
    expect(find('/minha-conta/:path*')?.destination).toBe('/index.html');
    expect(find('/admin/:path*')?.destination).toBe('/index.html');
  });

  it('catch-all → document com $1; exclui prefixos api//assets/ e index.html (anti-loop)', () => {
    const c = catchAll();
    expect(c.destination).toBe('/api/og-loja?_seo_route=document&path=/$1');
    // fonte é grupo de captura (documentado) referenciado por $1
    expect(c.source.startsWith('/(')).toBe(true);
    // desconhecidas casam (→ document → 404 unknown)
    expect(matches(c.source, '/rota/desconhecida')).toBe(true);
    // subrotas de api/assets e arquivos técnicos NÃO casam (servidos pela plataforma)
    for (const excl of [
      '/api/x', '/api/og-loja', '/assets/x', '/assets/app.js',
      '/index.html', '/robots.txt', '/sitemap.xml', '/favicon.ico', '/meta-oauth-callback.html',
    ]) {
      expect(matches(c.source, excl)).toBe(false);
    }
  });

  it('/api e /assets EXATOS vão ao document (regex não os barra) e viram 404 no núcleo', () => {
    // A Vercel (path-to-regexp) rejeita âncora "$" no source; o negative-lookahead
    // de prefixo (api/) não barra "/api" exato → ele casa o catch-all e é
    // classificado como excluded → 404 (provado em document-status-core.test.ts).
    const c = catchAll();
    expect(matches(c.source, '/api')).toBe(true);
    expect(matches(c.source, '/assets')).toBe(true);
  });

  it('ordem: dinâmicas < passthrough < catch-all (catch-all é o ÚLTIMO)', () => {
    const iDyn = indexOfSource((r) => r.source === '/anuncio/:identifier');
    const iPass = indexOfSource((r) => PASSTHROUGH_RE.test(r.source) && r.destination === '/index.html');
    const iCatch = rewrites.length - 1;
    expect(iDyn).toBeGreaterThanOrEqual(0);
    expect(iDyn).toBeLessThan(iPass);
    expect(iPass).toBeLessThan(iCatch);
    expect(rewrites[iCatch].destination).toContain('_seo_route=document&path=/$1');
  });
});
