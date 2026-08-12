import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { classifyPageQuery } from '../../../hooks/usePages';
import NotFoundView, { buildNotFoundSeo } from '../../../../pages/NotFoundView';
import ContentUnavailable from '../../../../components/ContentUnavailable';
import { getLegalUnavailableProps } from '../../../../pages/LegalCmsDocumentView';

const ORIGIN = 'https://agrobw.com.br';

describe('classifyPageQuery: ausência ≠ falha transitória', () => {
  it('erro presente → error (mesmo com data null)', () => {
    expect(classifyPageQuery(null, { message: 'network' })).toBe('error');
    expect(classifyPageQuery(null, { code: '08006' })).toBe('error');
    expect(classifyPageQuery({ slug: 'x' }, { message: 'timeout' })).toBe('error');
  });
  it('sem erro e sem linha → not_found', () => {
    expect(classifyPageQuery(null, null)).toBe('not_found');
    expect(classifyPageQuery(undefined, null)).toBe('not_found');
  });
  it('linha presente sem erro → found', () => {
    expect(classifyPageQuery({ slug: 'sobre', is_published: true }, null)).toBe('found');
  });
});

describe('buildNotFoundSeo: noindex + canonical da URL solicitada (nunca /404)', () => {
  it('noIndex sempre true', () => {
    expect(buildNotFoundSeo('/qualquer/rota').noIndex).toBe(true);
    expect(buildNotFoundSeo('/').noIndex).toBe(true);
  });
  it('canonical = a própria URL ausente (nunca /404)', () => {
    expect(buildNotFoundSeo('/foo/bar').canonical).toBe(`${ORIGIN}/foo/bar`);
    expect(buildNotFoundSeo('/foo/bar').canonical).not.toBe(`${ORIGIN}/404`);
    expect(buildNotFoundSeo('/').canonical).toBe(`${ORIGIN}/`);
  });
  it('canonical descarta query/hash da URL solicitada', () => {
    expect(buildNotFoundSeo('/foo?x=1#top').canonical).toBe(`${ORIGIN}/foo`);
  });
  it('nunca gera canonical fixo /404 para qualquer entrada', () => {
    for (const p of ['/a', '/b/c', '/anuncio/xxx', '/loja/y', '/']) {
      expect(buildNotFoundSeo(p).canonical).not.toContain('/404');
    }
  });
});

describe('NotFoundView (404 real, noindex, sem redirect)', () => {
  const html = renderToStaticMarkup(
    <MemoryRouter>
      <NotFoundView />
    </MemoryRouter>,
  );
  it('mostra 404 e mensagem', () => {
    expect(html).toContain('404');
    expect(html).toContain('Página não encontrada');
  });
  it('oferece links de navegação (sem redirect automático)', () => {
    expect(html).toContain('href="/"');
    expect(html).toContain('href="/anuncios"');
    expect(html).toContain('href="/categorias"');
  });
});

describe('ContentUnavailable (estado neutro, sem noindex, sem redirect)', () => {
  it('usa título/mensagem padrão', () => {
    const html = renderToStaticMarkup(<ContentUnavailable />);
    expect(html).toContain('Conteúdo temporariamente indisponível');
    expect(html).toContain('Tentar novamente');
    expect(html).not.toContain('404');
  });
  it('aceita título/mensagem customizados (documentos legais)', () => {
    const html = renderToStaticMarkup(
      <ContentUnavailable title="Documento temporariamente indisponível" message="msg custom" />,
    );
    expect(html).toContain('Documento temporariamente indisponível');
    expect(html).toContain('msg custom');
  });
  it('showRetry=false oculta o botão "Tentar novamente"', () => {
    expect(renderToStaticMarkup(<ContentUnavailable />)).toContain('Tentar novamente');
    expect(renderToStaticMarkup(<ContentUnavailable showRetry={false} />)).not.toContain('Tentar novamente');
  });
});

describe('LegalCms: not_found e error são estados DISTINTOS (Opção A)', () => {
  it('not_found → "Documento em atualização", sem retry', () => {
    const p = getLegalUnavailableProps('not_found');
    expect(p.title).toBe('Documento em atualização');
    expect(p.message).toMatch(/sendo preparado/i);
    expect(p.showRetry).toBe(false);
  });
  it('error → "Documento temporariamente indisponível", com retry', () => {
    const p = getLegalUnavailableProps('error');
    expect(p.title).toBe('Documento temporariamente indisponível');
    expect(p.message).toMatch(/tente novamente/i);
    expect(p.showRetry).toBe(true);
  });
  it('renderiza mensagens diferentes para cada estado (index,follow por padrão)', () => {
    const nf = renderToStaticMarkup(<ContentUnavailable {...getLegalUnavailableProps('not_found')} canonicalPath="/politica-de-cookies" />);
    const er = renderToStaticMarkup(<ContentUnavailable {...getLegalUnavailableProps('error')} canonicalPath="/politica-de-cookies" />);
    expect(nf).toContain('Documento em atualização');
    expect(nf).not.toContain('Tentar novamente');
    expect(er).toContain('Documento temporariamente indisponível');
    expect(er).toContain('Tentar novamente');
    expect(nf).not.toBe(er);
  });
});
