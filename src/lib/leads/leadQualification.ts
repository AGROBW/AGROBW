export type PurchaseTimeline = 'immediate' | '30_days' | '90_days' | 'researching';
export type PaymentPreference = 'cash' | 'financing' | 'consortium' | 'undecided';
export type LeadQualificationLevel = 'qualified' | 'partial' | 'unqualified';

export interface LeadQualificationInput {
  purchaseTimeline: PurchaseTimeline | null;
  paymentPreference: PaymentPreference | null;
  hasTradeIn: boolean | null;
  purchaseNeed: string;
}

export interface LeadQualification extends LeadQualificationInput {
  score: number;
  level: LeadQualificationLevel;
  updatedAt: string | null;
}

export const PURCHASE_TIMELINE_OPTIONS: Array<{ value: PurchaseTimeline; label: string }> = [
  { value: 'immediate', label: 'Compra imediata' },
  { value: '30_days', label: 'Nos proximos 30 dias' },
  { value: '90_days', label: 'Nos proximos 90 dias' },
  { value: 'researching', label: 'Ainda estou pesquisando' },
];

export const PAYMENT_PREFERENCE_OPTIONS: Array<{ value: PaymentPreference; label: string }> = [
  { value: 'cash', label: 'A vista' },
  { value: 'financing', label: 'Financiamento' },
  { value: 'consortium', label: 'Consorcio' },
  { value: 'undecided', label: 'Ainda nao decidi' },
];

export const createEmptyLeadQualification = (): LeadQualificationInput => ({
  purchaseTimeline: null,
  paymentPreference: null,
  hasTradeIn: null,
  purchaseNeed: '',
});

export const countLeadQualificationAnswers = (input: LeadQualificationInput) =>
  Number(input.purchaseTimeline !== null) +
  Number(input.paymentPreference !== null) +
  Number(input.hasTradeIn !== null) +
  Number(input.purchaseNeed.trim().length > 0);

export const getLeadQualificationLevel = (score: number): LeadQualificationLevel => {
  if (score >= 3) return 'qualified';
  if (score >= 1) return 'partial';
  return 'unqualified';
};

export const hasLeadQualificationAnswers = (input: LeadQualificationInput) =>
  countLeadQualificationAnswers(input) > 0;

const getOptionLabel = <T extends string>(
  options: Array<{ value: T; label: string }>,
  value: T | null,
) => options.find((option) => option.value === value)?.label || 'Nao informado';

export const getPurchaseTimelineLabel = (value: PurchaseTimeline | null) =>
  getOptionLabel(PURCHASE_TIMELINE_OPTIONS, value);

export const getPaymentPreferenceLabel = (value: PaymentPreference | null) =>
  getOptionLabel(PAYMENT_PREFERENCE_OPTIONS, value);

export const getTradeInLabel = (value: boolean | null) => {
  if (value === true) return 'Possui item para troca';
  if (value === false) return 'Nao possui item para troca';
  return 'Nao informado';
};

export const getLeadQualificationLevelLabel = (level: LeadQualificationLevel) => {
  if (level === 'qualified') return 'Lead qualificado';
  if (level === 'partial') return 'Dados parciais';
  return 'Sem qualificacao';
};

export const normalizeLeadQualification = (row: any): LeadQualification | null => {
  const source = Array.isArray(row) ? row[0] : row;
  if (!source) return null;

  const score = Number.isFinite(Number(source.qualification_score))
    ? Math.max(0, Math.min(4, Number(source.qualification_score)))
    : 0;
  const databaseLevel = source.qualification_level as LeadQualificationLevel;
  const level = ['qualified', 'partial', 'unqualified'].includes(databaseLevel)
    ? databaseLevel
    : getLeadQualificationLevel(score);

  return {
    purchaseTimeline: source.purchase_timeline || null,
    paymentPreference: source.payment_preference || null,
    hasTradeIn: typeof source.has_trade_in === 'boolean' ? source.has_trade_in : null,
    purchaseNeed: source.purchase_need || '',
    score,
    level,
    updatedAt: source.updated_at || null,
  };
};
