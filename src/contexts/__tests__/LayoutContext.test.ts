import { describe, it, expect, beforeEach } from 'vitest';
import { applyLayoutSettingsToDocument } from '../LayoutContext';

// Constrói um LayoutSettings mínimo (só os campos usados por
// applyLayoutSettingsToDocument). Inclui campos SEO de propósito para provar que
// NÃO são mais aplicados ao document.title/description.
const makeSettings = (over: Record<string, unknown> = {}) =>
  ({
    faviconUrl: '/fav-custom.png',
    primaryColor: '#111111',
    secondaryColor: '#222222',
    accentColor: '#333333',
    backgroundColor: '#444444',
    surfaceColor: '#555555',
    textColor: '#666666',
    mutedTextColor: '#777777',
    successColor: '#00aa00',
    warningColor: '#aaaa00',
    errorColor: '#aa0000',
    seoTitle: 'TITULO SEO DO SITE',
    seoDescription: 'DESCRICAO SEO DO SITE',
    siteName: 'AGRO BW',
    siteTagline: 'tagline',
    ...over,
  }) as any;

describe('LayoutContext: não disputa metadados públicos com o SeoHead', () => {
  beforeEach(() => {
    document.title = '';
    document.querySelectorAll('meta[name="description"]').forEach((m) => m.remove());
    document.querySelectorAll("link[rel='icon']").forEach((l) => l.remove());
  });

  it('NÃO sobrescreve document.title definido pela página', () => {
    document.title = 'Página não encontrada | AGRO BW';
    applyLayoutSettingsToDocument(makeSettings());
    expect(document.title).toBe('Página não encontrada | AGRO BW');
    expect(document.title).not.toContain('TITULO SEO DO SITE');
  });

  it('NÃO sobrescreve meta[name="description"] definida pela página', () => {
    const meta = document.createElement('meta');
    meta.setAttribute('name', 'description');
    meta.setAttribute('content', 'Descrição específica da página');
    document.head.appendChild(meta);

    applyLayoutSettingsToDocument(makeSettings());

    expect(document.querySelector('meta[name="description"]')!.getAttribute('content')).toBe(
      'Descrição específica da página',
    );
  });

  it('NÃO cria meta description quando ausente (deixa para o SeoHead)', () => {
    applyLayoutSettingsToDocument(makeSettings());
    expect(document.querySelector('meta[name="description"]')).toBeNull();
  });

  it('ainda aplica favicon e variáveis de tema (responsabilidade do layout)', () => {
    applyLayoutSettingsToDocument(makeSettings({ faviconUrl: '/fav-x.png', primaryColor: '#123456' }));
    expect(document.querySelector("link[rel='icon']")?.getAttribute('href')).toBe('/fav-x.png');
    expect(document.documentElement.style.getPropertyValue('--brand-primary')).toBe('#123456');
  });
});
