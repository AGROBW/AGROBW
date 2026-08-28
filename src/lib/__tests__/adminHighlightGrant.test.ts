import { describe, expect, it } from 'vitest';
import {
  calculateAdminHighlightExpiry,
  getActiveAdminHighlightType,
  getAdminHighlightTypeLabel,
} from '../adminHighlightGrant';

const NOW = Date.parse('2026-08-28T12:00:00.000Z');

describe('adminHighlightGrant', () => {
  it.each([
    ['3', '2026-08-31T12:00:00.000Z'],
    ['7', '2026-09-04T12:00:00.000Z'],
    ['15', '2026-09-12T12:00:00.000Z'],
    ['30', '2026-09-27T12:00:00.000Z'],
  ] as const)('calcula o periodo de %s dias', (period, expected) => {
    expect(calculateAdminHighlightExpiry(period, '', NOW)).toEqual({
      expiresAt: expected,
      error: null,
    });
  });

  it('aceita uma data personalizada futura', () => {
    expect(
      calculateAdminHighlightExpiry('custom', '2026-09-10T10:30:00.000Z', NOW)
    ).toEqual({
      expiresAt: '2026-09-10T10:30:00.000Z',
      error: null,
    });
  });

  it.each([
    ['', 'Informe a data e hora de encerramento.'],
    ['valor-invalido', 'A data informada é inválida.'],
    ['2026-08-27T12:00:00.000Z', 'O encerramento precisa estar no futuro.'],
    ['2027-01-01T12:00:00.000Z', 'O destaque administrativo pode durar no máximo 90 dias.'],
  ])('rejeita data personalizada %s', (value, error) => {
    expect(calculateAdminHighlightExpiry('custom', value, NOW)).toEqual({
      expiresAt: null,
      error,
    });
  });

  it('identifica o destaque ativo e prioriza Home em estado legado inconsistente', () => {
    expect(getActiveAdminHighlightType({ highlight_home: true })).toBe('home');
    expect(getActiveAdminHighlightType({ highlight_category: true })).toBe('category');
    expect(getActiveAdminHighlightType({ highlight_home: true, highlight_category: true })).toBe('home');
    expect(getActiveAdminHighlightType({})).toBeNull();
  });

  it('fornece os rótulos públicos dos tipos', () => {
    expect(getAdminHighlightTypeLabel('home')).toBe('Home');
    expect(getAdminHighlightTypeLabel('category')).toBe('Categoria');
  });
});
