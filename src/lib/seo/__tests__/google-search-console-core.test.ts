import { describe, expect, it } from 'vitest';
import {
  buildSearchConsoleDateRange,
  buildMetricComparison,
  buildPageSpeedRecommendations,
  buildPreviousSearchConsoleDateRange,
  buildSeoOpportunities,
  evaluateIndexMonitorItem,
  normalizeInspectionUrl,
  normalizeMetric,
  normalizePageSpeedStrategy,
  normalizePeriod,
  normalizeSearchConsoleAction,
  summarizeIndexMonitor,
  scoreToPercent,
} from '../../../../supabase/functions/google-search-console/core';

describe('google-search-console core', () => {
  it.each([7, 15, 30])('aceita o período permitido %i', (period) => {
    expect(normalizePeriod(period)).toBe(period);
  });

  it.each([0, 1, 14, 31, 'invalido', null])('rejeita período inválido %s', (period) => {
    expect(normalizePeriod(period)).toBeNull();
  });

  it('considera o atraso de consolidação e inclui exatamente o período solicitado', () => {
    expect(buildSearchConsoleDateRange(7, new Date('2026-08-13T18:00:00Z'))).toEqual({
      startDate: '2026-08-04',
      endDate: '2026-08-10',
      dataDelayDays: 3,
    });
  });

  it('calcula o período anterior sem sobreposição', () => {
    expect(buildPreviousSearchConsoleDateRange({
      startDate: '2026-08-04', endDate: '2026-08-10', dataDelayDays: 3,
    }, 7)).toEqual({
      startDate: '2026-07-28', endDate: '2026-08-03', dataDelayDays: 3,
    });
  });

  it('compara métricas sem inventar percentual quando a base é zero', () => {
    const comparison = buildMetricComparison(
      { clicks: 6, impressions: 20, ctr: 0.3, position: 4 },
      { clicks: 3, impressions: 0, ctr: 0.2, position: 6 },
    );
    expect(comparison.changes).toEqual({
      clicksPercent: 100,
      impressionsPercent: null,
      ctrPoints: 10,
      position: 2,
    });
  });

  it('prioriza oportunidades reais e limita o resultado a cinco itens', () => {
    const opportunities = buildSeoOpportunities({
      queries: [
        { key: 'trator agrícola', clicks: 1, impressions: 30, ctr: 0.01, position: 6 },
        { key: 'sem volume', clicks: 0, impressions: 2, ctr: 0, position: 5 },
      ],
      pages: [
        { key: 'https://agrobw.com.br/anuncio/1', clicks: 0, impressions: 25, ctr: 0, position: 8 },
      ],
      previousPages: [
        { key: 'https://agrobw.com.br/noticias/milho', clicks: 2, impressions: 40, ctr: 0.05, position: 5 },
      ],
    });

    expect(opportunities).toHaveLength(3);
    expect(opportunities.map((item) => item.kind)).toEqual(expect.arrayContaining([
      'quick-win', 'low-ctr', 'declining',
    ]));
    expect(opportunities.find((item) => item.kind === 'low-ctr')?.target).toBe('/anuncio/1');
  });

  it('não cria oportunidades quando ainda não há volume suficiente', () => {
    expect(buildSeoOpportunities({
      queries: [{ key: 'agro', clicks: 0, impressions: 1, ctr: 0, position: 8 }],
      pages: [],
      previousPages: [],
    })).toEqual([]);
  });

  it('normaliza métricas ausentes ou inválidas para zero', () => {
    expect(normalizeMetric(undefined)).toBe(0);
    expect(normalizeMetric('x')).toBe(0);
    expect(normalizeMetric('12.5')).toBe(12.5);
  });

  it.each([
    [undefined, 'overview'],
    [null, 'overview'],
    ['overview', 'overview'],
    ['inspect-url', 'inspect-url'],
    ['outro', null],
  ])('normaliza a ação %s', (input, expected) => {
    expect(normalizeSearchConsoleAction(input)).toBe(expected);
  });

  it('aceita somente URLs HTTPS do domínio canônico para inspeção', () => {
    expect(normalizeInspectionUrl('https://agrobw.com.br/anuncio/abc?origem=painel'))
      .toBe('https://agrobw.com.br/anuncio/abc?origem=painel');
  });

  it.each([
    'http://agrobw.com.br/',
    'https://www.agrobw.com.br/',
    'https://agrobw.com.br.evil.example/',
    'https://user:secret@agrobw.com.br/',
    'https://agrobw.com.br/#secao',
    'javascript:alert(1)',
    'invalida',
  ])('rejeita URL insegura ou externa: %s', (url) => {
    expect(normalizeInspectionUrl(url)).toBeNull();
  });

  it('rejeita valores ausentes e URLs excessivamente longas', () => {
    expect(normalizeInspectionUrl(null)).toBeNull();
    expect(normalizeInspectionUrl(`https://agrobw.com.br/${'a'.repeat(2050)}`)).toBeNull();
  });

  it('classifica página indexada como saudável', () => {
    const item = evaluateIndexMonitorItem({
      url: 'https://agrobw.com.br/anuncio/1', type: 'announcement', label: 'Anúncio',
      verdict: 'PASS', googleCanonical: 'https://agrobw.com.br/anuncio/1',
      userCanonical: 'https://agrobw.com.br/anuncio/1', pageFetchState: 'SUCCESSFUL',
    });
    expect(item.health).toBe('healthy');
    expect(item.issueCode).toBeNull();
  });

  it('trata página ainda não indexada como atenção, sem falso crítico', () => {
    const item = evaluateIndexMonitorItem({
      url: 'https://agrobw.com.br/noticias/nova', type: 'news', label: 'Nova notícia',
      verdict: 'NEUTRAL', coverageState: 'URL is unknown to Google',
    });
    expect(item.health).toBe('attention');
    expect(item.issueCode).toBe('not-indexed-yet');
  });

  it.each([
    { verdict: 'FAIL' },
    { verdict: 'PASS', robotsTxtState: 'DISALLOWED' },
    { verdict: 'PASS', indexingState: 'BLOCKED_BY_META_TAG' },
    { verdict: 'PASS', pageFetchState: 'SOFT_404' },
  ])('classifica bloqueio ou falha de busca como crítico', (state) => {
    expect(evaluateIndexMonitorItem({
      url: 'https://agrobw.com.br/loja/x', type: 'store', label: 'Loja', ...state,
    }).health).toBe('critical');
  });

  it('detecta canonical divergente e resume as contagens', () => {
    const critical = evaluateIndexMonitorItem({
      url: 'https://agrobw.com.br/anuncio/1', type: 'announcement', label: 'Anúncio',
      verdict: 'PASS', googleCanonical: 'https://agrobw.com.br/anuncio/2',
    });
    const attention = evaluateIndexMonitorItem({
      url: 'https://agrobw.com.br/noticias/x', type: 'news', label: 'Notícia', verdict: 'NEUTRAL',
    });
    expect(summarizeIndexMonitor([critical, attention], '2026-08-13T12:00:00Z')).toMatchObject({
      checked: 2, healthy: 0, attention: 1, critical: 1, partial: false,
    });
  });

  it.each([['mobile', 'mobile'], ['desktop', 'desktop'], ['tablet', null], [null, null]])('normaliza estratégia PageSpeed %s', (input, expected) => {
    expect(normalizePageSpeedStrategy(input)).toBe(expected);
  });

  it('converte notas Lighthouse para percentual seguro', () => {
    expect(scoreToPercent(0.934)).toBe(93);
    expect(scoreToPercent(2)).toBe(100);
    expect(scoreToPercent(-1)).toBe(0);
    expect(scoreToPercent(undefined)).toBeNull();
  });

  it('prioriza no máximo quatro recomendações com economia real', () => {
    const recommendations = buildPageSpeedRecommendations({
      image: { id: 'image', title: 'Otimizar imagens', score: 0.2, scoreDisplayMode: 'numeric', details: { overallSavingsBytes: 500000 } },
      js: { id: 'js', title: 'Reduzir JavaScript', score: 0.4, scoreDisplayMode: 'numeric', details: { overallSavingsMs: 1200 } },
      passed: { id: 'passed', title: 'Aprovado', score: 1, scoreDisplayMode: 'binary' },
      manual: { id: 'manual', title: 'Manual', score: 0, scoreDisplayMode: 'manual' },
    });
    expect(recommendations.map((item) => item.id)).toEqual(['js', 'image']);
  });
});
