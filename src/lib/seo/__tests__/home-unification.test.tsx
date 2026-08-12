import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  HOME_SEO_TITLE_BASE,
  HOME_SEO_DESCRIPTION,
  HOME_SEO_TITLE_FULL,
  BRAND_SUFFIX,
} from '../../../../server/home-seo.mjs';
import { applyBrandSuffix } from '../buildSeoMetadata';
import { renderStoreOgHtml } from '../../../../api/og-loja.mjs';
import LayoutIdentitySection from '../../../../components/admin/layout/LayoutIdentitySection';
import LayoutBrandSection from '../../../../components/admin/layout/LayoutBrandSection';

const CANON = 'https://agrobw.com.br';

describe('home-seo: fonte canônica única (import seguro Vite + Node)', () => {
  it('constantes são strings não vazias', () => {
    expect(typeof HOME_SEO_TITLE_BASE).toBe('string');
    expect(HOME_SEO_TITLE_BASE.length).toBeGreaterThan(0);
    expect(HOME_SEO_DESCRIPTION.length).toBeGreaterThan(0);
    expect(HOME_SEO_TITLE_FULL).toBe(`${HOME_SEO_TITLE_BASE}${BRAND_SUFFIX}`);
  });

  it('título final do navegador (SeoHead) === og:title social (og-loja)', () => {
    // Navegador: SeoHead aplica applyBrandSuffix ao título-base.
    expect(applyBrandSuffix(HOME_SEO_TITLE_BASE)).toBe(HOME_SEO_TITLE_FULL);
  });
});

describe('Home social (og-loja) usa a mesma fonte', () => {
  const homeOg = renderStoreOgHtml({ html: '<head></head>', store: null, ogImageUrl: null, baseUrl: CANON });

  it('og:title e <title> = HOME_SEO_TITLE_FULL (idêntico ao navegador)', () => {
    expect(homeOg).toContain(`<title>${HOME_SEO_TITLE_FULL}</title>`);
    expect(homeOg).toContain(`<meta property="og:title" content="${HOME_SEO_TITLE_FULL}" />`);
  });

  it('descrição social === descrição do navegador (mesma constante)', () => {
    expect(homeOg).toContain(HOME_SEO_DESCRIPTION);
    expect(homeOg).toContain(`<meta property="og:description" content="${HOME_SEO_DESCRIPTION}" />`);
  });

  it('loja social permanece correta (título específico da loja)', () => {
    const storeOg = renderStoreOgHtml({
      html: '<head></head>',
      store: { store_name: 'Loja X', slug: 'loja-x', description: 'd' },
      ogImageUrl: null,
      baseUrl: CANON,
    });
    expect(storeOg).toContain('Loja X | Loja Parceira AGRO BW');
    expect(storeOg).toContain(`${CANON}/loja/loja-x`);
    expect(storeOg).not.toContain(HOME_SEO_TITLE_FULL);
  });
});

describe('painel de Layout: campos SEO legados não são mais editáveis', () => {
  const identityProps: any = {
    formData: {
      siteTagline: 'tag', headerBrandText: 'h', footerBrandText: 'f', loginBrandText: 'l',
      seoTitle: 'legado-titulo', seoDescription: 'legado-desc',
    },
    onChange: () => {},
  };
  const brandProps: any = {
    formData: {
      siteName: 's', siteShortName: 'ss', siteTagline: 'tag', headerBrandText: 'h', footerBrandText: 'f',
      loginBrandText: 'l', seoTitle: 'legado-titulo', seoDescription: 'legado-desc',
      logoUrl: '', logoLightUrl: '', logoDarkUrl: '', faviconUrl: '', defaultAdImageUrl: '',
    },
    onChange: () => {},
    onUpload: async () => {},
    uploadingField: null,
  };

  it('LayoutIdentitySection: sem inputs de SEO, com nota', () => {
    const html = renderToStaticMarkup(<LayoutIdentitySection {...identityProps} />);
    expect(html).not.toContain('Titulo SEO');
    expect(html).not.toContain('Descricao padrao para metadata');
    expect(html).not.toContain('legado-titulo');
    expect(html).not.toContain('legado-desc');
    expect(html).toContain('definidos individualmente por página');
  });

  it('LayoutBrandSection: sem inputs de SEO, com nota', () => {
    const html = renderToStaticMarkup(<LayoutBrandSection {...brandProps} />);
    expect(html).not.toContain('Titulo SEO');
    expect(html).not.toContain('Descricao SEO padrao');
    expect(html).not.toContain('legado-titulo');
    expect(html).not.toContain('legado-desc');
    expect(html).toContain('definidos individualmente por página');
  });
});
