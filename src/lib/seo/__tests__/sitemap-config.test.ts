import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// Testes de CONFIGURAÇÃO da etapa 2.3: garantem que /sitemap.xml passou a ser
// dinâmico (via og-loja), que o gerador legado foi removido e que o build não
// recria o arquivo estático. Lê os arquivos reais do repositório.

const ROOT = process.cwd();
const read = (rel: string) => fs.readFileSync(path.resolve(ROOT, rel), 'utf8');
const exists = (rel: string) => fs.existsSync(path.resolve(ROOT, rel));

const pkg = JSON.parse(read('package.json'));
const vercel = JSON.parse(read('vercel.json'));
const rewrites: Array<{ source: string; destination: string }> = vercel.rewrites || [];

const SITEMAP_DESTINATION = '/api/og-loja?_seo_route=sitemap';

describe('sitemap 2.3: build e gerador legado', () => {
  it('package.json não executa o gerador legado', () => {
    expect(pkg.scripts.build).toBe('vite build');
    expect(pkg.scripts.build).not.toContain('generate-sitemap');
    const allScripts = Object.values(pkg.scripts || {}).join(' ');
    expect(allScripts).not.toContain('generate-sitemap');
  });

  it('scripts/generate-sitemap.mjs foi removido', () => {
    expect(exists('scripts/generate-sitemap.mjs')).toBe(false);
  });

  it('public/sitemap.xml está ausente', () => {
    expect(exists('public/sitemap.xml')).toBe(false);
  });
});

describe('sitemap 2.3: rewrites da Vercel', () => {
  const findRewrite = (source: string) => rewrites.find((r) => r.source === source);

  it('/sitemap.xml tem rewrite dinâmica direta para og-loja', () => {
    const r = findRewrite('/sitemap.xml');
    expect(r).toBeDefined();
    expect(r?.destination).toBe(SITEMAP_DESTINATION);
  });

  it('/api/sitemap continua disponível, direto para og-loja', () => {
    const r = findRewrite('/api/sitemap');
    expect(r).toBeDefined();
    expect(r?.destination).toBe(SITEMAP_DESTINATION);
  });

  it('ambas as rotas apontam diretamente (sem rewrite encadeada)', () => {
    for (const source of ['/sitemap.xml', '/api/sitemap']) {
      expect(findRewrite(source)?.destination).toBe(SITEMAP_DESTINATION);
    }
  });

  it('a rewrite de /sitemap.xml vem ANTES do passthrough e do catch-all', () => {
    const idxSitemap = rewrites.findIndex((r) => r.source === '/sitemap.xml');
    const idxIndex = rewrites.findIndex((r) => r.destination === '/index.html');
    expect(idxSitemap).toBeGreaterThanOrEqual(0);
    expect(idxIndex).toBeGreaterThanOrEqual(0);
    expect(idxSitemap).toBeLessThan(idxIndex);
  });

  it('o catch-all (document) continua EXCLUINDO sitemap.xml (não cai no fallback dinâmico)', () => {
    // Fase 2B: o fallback dinâmico (catch-all → modo document) é o ÚLTIMO rewrite.
    const catchAll = rewrites[rewrites.length - 1];
    expect(catchAll.destination).toContain('_seo_route=document');
    expect(catchAll.source).toContain('sitemap'); // 'sitemap\\.xml' (ponto escapado)
    expect(new RegExp(`^${catchAll.source}$`).test('/sitemap.xml')).toBe(false);
    // e /sitemap.xml tem sua própria rewrite explícita (dispatcher do sitemap)
    expect(rewrites.find((r) => r.source === '/sitemap.xml')?.destination).toContain('_seo_route=sitemap');
  });
});

describe('sitemap 2.3: robots.txt', () => {
  it('aponta para a URL canônica /sitemap.xml (inalterado)', () => {
    const robots = read('public/robots.txt');
    expect(robots).toContain('Sitemap: https://agrobw.com.br/sitemap.xml');
  });
});
