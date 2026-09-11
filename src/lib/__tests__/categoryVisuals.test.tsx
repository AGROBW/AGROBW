import { describe, expect, it } from 'vitest';
import { Package, PlaneTakeoff } from 'lucide-react';
import {
  CATEGORY_ICON_OPTIONS,
  getCategoryIconComponent,
  getCategoryIconOption,
} from '../categoryVisuals';

describe('categoryVisuals', () => {
  it('oferece uma biblioteca curada sem valores duplicados', () => {
    const values = CATEGORY_ICON_OPTIONS.map((option) => option.value);

    expect(CATEGORY_ICON_OPTIONS.length).toBeGreaterThanOrEqual(40);
    expect(new Set(values).size).toBe(values.length);
  });

  it('inclui o icone de aeronave com termos de busca relacionados', () => {
    const aircraft = getCategoryIconOption('PlaneTakeoff');

    expect(aircraft).toMatchObject({
      value: 'PlaneTakeoff',
      label: 'Aeronave',
    });
    expect(aircraft?.keywords).toContain('aviacao');
    expect(getCategoryIconComponent('PlaneTakeoff')).toBe(PlaneTakeoff);
    expect(getCategoryIconComponent(null, 'aeronaves')).toBe(PlaneTakeoff);
  });

  it('resolve todas as opcoes oferecidas pelo seletor', () => {
    CATEGORY_ICON_OPTIONS.forEach((option) => {
      expect(getCategoryIconComponent(option.value)).toBe(option.Icon);
    });
  });

  it('mantem o pacote como fallback para nomes desconhecidos', () => {
    expect(getCategoryIconComponent('IconeQueNaoExiste', 'grupo-novo')).toBe(Package);
  });
});
