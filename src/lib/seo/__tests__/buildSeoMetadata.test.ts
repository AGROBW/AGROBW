import { describe, expect, it } from 'vitest';
import {
  buildSeoMetadata,
  applyBrandSuffix,
  stripHtml,
  BRAND_NAME,
} from '../buildSeoMetadata';
import {
  isDefaultOgImage,
  resolveSeoImageUrl,
  DEFAULT_OG_IMAGE_URL,
} from '../../siteConfig';

const CANONICAL_ORIGIN = 'https://agrobw.com.br';

describe('buildSeoMetadata', () => {
  it('remove HTML da descrição', () => {
    const meta = buildSeoMetadata({
      title: 'Título',
      description: '<p>Compre <strong>tratores</strong> &amp; insumos<script>alert(1)</script></p>',
      path: '/x',
    });
    expect(meta.description).not.toContain('<');
    expect(meta.description).not.toContain('>');
    expect(meta.description).not.toMatch(/script/i);
    expect(meta.description).toContain('tratores');
  });

  it('limita a descrição final a no máximo 160 caracteres', () => {
    const longWords = Array.from({ length: 80 }, (_, i) => `palavra${i}`).join(' ');
    const meta = buildSeoMetadata({ title: 'T', description: longWords, path: '/x' });
    expect(meta.description.length).toBeLessThanOrEqual(160);
  });

  it('mantém o título final (com sufixo de marca) dentro de 70 caracteres', () => {
    const longTitle =
      'Anúncios de máquinas agrícolas usadas e seminovas com entrega em todo o Brasil rural';
    const meta = buildSeoMetadata({ title: longTitle, description: 'd', path: '/x' });
    const finalTitle = applyBrandSuffix(meta.title);
    expect(finalTitle.length).toBeLessThanOrEqual(70);
    // preserva palavras inteiras (não corta no meio de uma palavra, exceto reticências)
    expect(meta.title).not.toMatch(/\w…\w/);
  });

  it('não duplica "AGRO BW" quando o título já contém a marca', () => {
    const meta = buildSeoMetadata({ title: 'Fale com a AGRO BW', description: 'd', path: '/contato' });
    const finalTitle = applyBrandSuffix(meta.title);
    const occurrences = finalTitle.split(BRAND_NAME).length - 1;
    expect(occurrences).toBe(1);
    expect(finalTitle.length).toBeLessThanOrEqual(70);
  });

  it('gera canonical sempre no domínio agrobw.com.br', () => {
    const meta = buildSeoMetadata({ title: 'T', description: 'd', path: '/contato' });
    expect(meta.canonical).toBe(`${CANONICAL_ORIGIN}/contato`);
  });

  it('força o domínio canônico e descarta query/hash de path absoluto externo', () => {
    const meta = buildSeoMetadata({
      title: 'T',
      description: 'd',
      path: 'https://malicioso.example.com/loja/x?a=1#topo',
    });
    expect(new URL(meta.canonical).origin).toBe(CANONICAL_ORIGIN);
    expect(meta.canonical).toBe(`${CANONICAL_ORIGIN}/loja/x`);
  });

  it('remove query string e hash do canonical (path relativo)', () => {
    const meta = buildSeoMetadata({
      title: 'T',
      description: 'd',
      path: '/anuncios?categoria=maquinas&utm_source=x#lista',
    });
    expect(meta.canonical).toBe(`${CANONICAL_ORIGIN}/anuncios`);
  });

  it('mantém a imagem padrão como padrão (recebe dimensões 1200x630)', () => {
    const meta = buildSeoMetadata({ title: 'T', description: 'd', path: '/x' });
    expect(meta.image).toBe(DEFAULT_OG_IMAGE_URL);
    expect(isDefaultOgImage(meta.image)).toBe(true);
  });

  it('imagem externa não é tratada como padrão (não recebe dimensões fixas)', () => {
    const external = 'https://cdn.supabase.co/storage/v1/object/public/ads/foto.png';
    const meta = buildSeoMetadata({ title: 'T', description: 'd', path: '/x', image: external });
    expect(meta.image).toBe(external);
    expect(isDefaultOgImage(meta.image)).toBe(false);
  });

  it('usa a imagem social padrão /og-default.png quando nenhuma é informada', () => {
    const meta = buildSeoMetadata({ title: 'T', description: 'd', path: '/x' });
    expect(meta.image).toBe(`${CANONICAL_ORIGIN}/og-default.png`);
  });

  it('preserva noIndex (padrão false, respeita true)', () => {
    expect(buildSeoMetadata({ title: 'T', description: 'd', path: '/x' }).noIndex).toBe(false);
    expect(buildSeoMetadata({ title: 'T', description: 'd', path: '/x', noIndex: true }).noIndex).toBe(true);
  });
});

describe('resolveSeoImageUrl', () => {
  it('preserva URLs de imagens externas', () => {
    const external = 'https://cdn.supabase.co/storage/v1/object/public/ads/foto.png';
    expect(resolveSeoImageUrl(external)).toBe(external);
  });

  it('ancora caminhos relativos no domínio canônico e usa padrão quando vazio', () => {
    expect(resolveSeoImageUrl('/agrobw-logo.png')).toBe(`${CANONICAL_ORIGIN}/agrobw-logo.png`);
    expect(resolveSeoImageUrl(null)).toBe(DEFAULT_OG_IMAGE_URL);
  });
});

describe('stripHtml', () => {
  it('remove tags e colapsa espaços', () => {
    expect(stripHtml('<h1>Olá</h1>   <p>mundo</p>')).toBe('Olá mundo');
  });
});
