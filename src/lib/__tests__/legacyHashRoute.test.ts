import { describe, expect, it } from 'vitest';
import { getLegacyHashRouteDestination } from '../legacyHashRoute';

describe('legacy hash route redirect', () => {
  it('converte links antigos sem alterar ancoras comuns', () => {
    expect(getLegacyHashRouteDestination(
      'https://agrobw.com.br',
      '#/minha-conta/mensagens?guest=contact-1',
    )).toBe('https://agrobw.com.br/minha-conta/mensagens?guest=contact-1');
    expect(getLegacyHashRouteDestination('https://agrobw.com.br', '#detalhes')).toBeNull();
  });
});
