import { describe, expect, it } from 'vitest';
import {
  countLeadQualificationAnswers,
  createEmptyLeadQualification,
  getLeadQualificationLevel,
  getLeadQualificationLevelLabel,
  getPaymentPreferenceLabel,
  getPurchaseTimelineLabel,
  getTradeInLabel,
  hasLeadQualificationAnswers,
  normalizeLeadQualification,
} from '../leadQualification';

describe('leadQualification', () => {
  it('keeps the questionnaire optional', () => {
    const input = createEmptyLeadQualification();
    expect(countLeadQualificationAnswers(input)).toBe(0);
    expect(hasLeadQualificationAnswers(input)).toBe(false);
    expect(getLeadQualificationLevel(0)).toBe('unqualified');
  });

  it('ignores a need containing only whitespace', () => {
    const input = { ...createEmptyLeadQualification(), purchaseNeed: '   ' };
    expect(countLeadQualificationAnswers(input)).toBe(0);
  });

  it('classifies one or two answers as partial', () => {
    const input = {
      ...createEmptyLeadQualification(),
      purchaseTimeline: '30_days' as const,
      hasTradeIn: false,
    };
    expect(countLeadQualificationAnswers(input)).toBe(2);
    expect(getLeadQualificationLevel(2)).toBe('partial');
  });

  it('classifies three or four answers as qualified', () => {
    const input = {
      purchaseTimeline: 'immediate' as const,
      paymentPreference: 'financing' as const,
      hasTradeIn: true,
      purchaseNeed: 'Preciso financiar uma colheitadeira.',
    };
    expect(countLeadQualificationAnswers(input)).toBe(4);
    expect(getLeadQualificationLevel(3)).toBe('qualified');
    expect(getLeadQualificationLevel(4)).toBe('qualified');
  });

  it('provides stable labels for the panel', () => {
    expect(getPurchaseTimelineLabel('immediate')).toBe('Compra imediata');
    expect(getPaymentPreferenceLabel('consortium')).toBe('Consorcio');
    expect(getTradeInLabel(true)).toBe('Possui item para troca');
    expect(getTradeInLabel(null)).toBe('Nao informado');
    expect(getLeadQualificationLevelLabel('qualified')).toBe('Lead qualificado');
  });

  const qualificationRow = {
      purchase_timeline: '90_days',
      payment_preference: 'cash',
      has_trade_in: false,
      purchase_need: 'Uso na propriedade',
      qualification_score: 4,
      qualification_level: 'qualified',
      updated_at: '2026-08-25T12:00:00Z',
  };

  const normalizedQualification = {
      purchaseTimeline: '90_days',
      paymentPreference: 'cash',
      hasTradeIn: false,
      purchaseNeed: 'Uso na propriedade',
      score: 4,
      level: 'qualified',
      updatedAt: '2026-08-25T12:00:00Z',
  };

  it('normalizes a PostgREST one-to-one object', () => {
    expect(normalizeLeadQualification(qualificationRow)).toEqual(normalizedQualification);
  });

  it('keeps compatibility with an array-shaped embedded relation', () => {
    expect(normalizeLeadQualification([qualificationRow])).toEqual(normalizedQualification);
  });

  it('normalizes absent embedded relations', () => {
    expect(normalizeLeadQualification(null)).toBeNull();
    expect(normalizeLeadQualification([])).toBeNull();
  });

  it('falls back to the score when the level is invalid', () => {
    expect(normalizeLeadQualification({
      ...qualificationRow,
      qualification_score: 2,
      qualification_level: 'unexpected',
    })?.level).toBe('partial');
  });
});
