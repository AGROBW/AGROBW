import { describe, expect, it } from 'vitest';
import { getNextRecommendedUpgradePlan, UpgradePlanCandidate } from '../recommendedUpgradePlan';

type TestPlan = UpgradePlanCandidate & { name: string };

const plan = (
  id: string,
  position: number,
  overrides: Partial<TestPlan> = {},
): TestPlan => ({
  id,
  name: id,
  position,
  is_active: true,
  is_downgrade_plan: false,
  ...overrides,
});

describe('getNextRecommendedUpgradePlan', () => {
  it('ignora completamente o plano de downgrade', () => {
    const current = plan('loja-parceira', 4);
    const downgrade = plan('basico', 5, { is_downgrade_plan: true });

    expect(getNextRecommendedUpgradePlan([current, downgrade], current)).toBeNull();
  });

  it('seleciona apenas o próximo plano ativo superior', () => {
    const current = plan('safra', 2);
    const inactive = plan('inativo', 3, { is_active: false });
    const next = plan('produtor', 4);
    const downgrade = plan('basico', 5, { is_downgrade_plan: true });

    expect(getNextRecommendedUpgradePlan([downgrade, next, inactive, current], current)).toBe(next);
  });

  it('não recomenda plano inferior ao plano atual', () => {
    const lower = plan('safra', 2);
    const current = plan('loja-parceira', 4);

    expect(getNextRecommendedUpgradePlan([lower, current], current)).toBeNull();
  });

  it('permite sair do plano de downgrade para o primeiro plano comercial ativo', () => {
    const downgrade = plan('basico', 99, { is_downgrade_plan: true });
    const firstCommercial = plan('gratuito', 1);
    const nextCommercial = plan('safra', 2);

    expect(
      getNextRecommendedUpgradePlan([nextCommercial, downgrade, firstCommercial], downgrade),
    ).toBe(firstCommercial);
  });

  it('não recomenda nada sem identificar o plano atual', () => {
    expect(getNextRecommendedUpgradePlan([plan('safra', 2)], null)).toBeNull();
  });
});
