import { describe, expect, it } from 'vitest';
import type { Plan } from '../../hooks/usePlans';
import { getContextualUpsellRecommendation } from '../contextualUpsell';

const plan = (id: string, position: number, overrides: Partial<Plan> = {}): Plan => ({
  id,
  name: id,
  description: null,
  billing_model: 'recurring',
  card_eyebrow: null,
  price_caption: null,
  footer_caption: null,
  show_footer_card: true,
  monthly_price: 0,
  yearly_price: 0,
  has_yearly_billing: true,
  features: [],
  display_features: [],
  is_popular: false,
  button_text: 'Contratar',
  comparison: {},
  max_ads: 2,
  ad_duration_days: 30,
  expired_deletion_days: 30,
  lead_contact_limit_days: 2,
  lead_contact_limit_days_monthly: 2,
  lead_contact_limit_days_yearly: 2,
  plan_validity_days_monthly: 30,
  plan_validity_days_yearly: 365,
  category_highlights_count: 0,
  category_highlight_days: null,
  home_highlight_count: 0,
  home_highlight_days: null,
  has_verification_badge: false,
  has_seller_store: false,
  has_email_marketing: false,
  has_commercial_intelligence: false,
  commercial_intelligence_requests_per_month: 0,
  social_campaigns_per_month: 0,
  radar_max_alerts: 1,
  radar_has_radius: false,
  radar_has_keywords: false,
  radar_has_price_filter: false,
  notes: null,
  position,
  is_active: true,
  show_in_public_pricing: true,
  is_default_signup_plan: false,
  is_downgrade_plan: false,
  created_at: '',
  updated_at: '',
  ...overrides,
});

describe('getContextualUpsellRecommendation', () => {
  it('escolhe o menor plano que realmente aumenta o limite de anuncios', () => {
    const current = plan('atual', 1, { max_ads: 2 });
    const insufficient = plan('insuficiente', 2, { max_ads: 2 });
    const solution = plan('solucao', 3, { max_ads: 5 });
    const premium = plan('premium', 4, { max_ads: 20 });

    const result = getContextualUpsellRecommendation({
      context: 'ad_limit', plans: [premium, solution, insufficient, current], currentPlan: current, adsLimit: 2,
    });

    expect(result?.targetPlan?.id).toBe('solucao');
  });

  it('nao oferece checkout de anuncios para assinatura recorrente ativa', () => {
    const current = plan('atual', 1, { max_ads: 2, billing_model: 'recurring' });
    const next = plan('proximo', 2, { max_ads: 10, billing_model: 'recurring' });
    expect(getContextualUpsellRecommendation({
      context: 'ad_limit',
      plans: [current, next],
      currentPlan: current,
      adsLimit: 2,
      hasActiveRecurringSubscription: true,
    })).toBeNull();
  });

  it('nao oferece upgrade de lead para quem ja possui plano elegivel', () => {
    const current = plan('atual', 1, { is_downgrade_plan: false });
    const next = plan('proximo', 2, { monthly_price: 100 });
    expect(getContextualUpsellRecommendation({ context: 'lead_locked', plans: [current, next], currentPlan: current })).toBeNull();
  });

  it('oferece o plano publico pago mais barato para quem esta em downgrade', () => {
    const current = plan('downgrade', 99, { is_downgrade_plan: true });
    const hidden = plan('interno', 2, { monthly_price: 10, show_in_public_pricing: false });
    const expensive = plan('caro', 3, { monthly_price: 150 });
    const affordable = plan('adequado', 4, { monthly_price: 80 });
    const result = getContextualUpsellRecommendation({ context: 'lead_locked', plans: [current, hidden, expensive, affordable], currentPlan: current });
    expect(result?.targetPlan?.id).toBe('adequado');
  });

  it('ignora planos inativos e de downgrade', () => {
    const current = plan('atual', 1, { max_ads: 1 });
    const inactive = plan('inativo', 2, { max_ads: 10, is_active: false });
    const downgrade = plan('downgrade', 3, { max_ads: 10, is_downgrade_plan: true });
    const hidden = plan('oculto', 4, { max_ads: 10, show_in_public_pricing: false });
    expect(getContextualUpsellRecommendation({ context: 'ad_limit', plans: [current, inactive, downgrade, hidden], currentPlan: current })).toBeNull();
  });

  it('ignora plano cuja visibilidade publica nao esteja confirmada', () => {
    const internal = plan('interno', 1, {
      max_ads: 10,
      show_in_public_pricing: undefined as unknown as boolean,
    });
    expect(getContextualUpsellRecommendation({
      context: 'ad_limit',
      plans: [internal],
      currentPlan: null,
      adsLimit: 0,
    })).toBeNull();
  });

  it('trata limite zero como bloqueado e encontra capacidade publica', () => {
    const current = plan('zero', 1, { max_ads: 0 });
    const target = plan('um', 2, { max_ads: 1, monthly_price: 25 });
    expect(getContextualUpsellRecommendation({ context: 'ad_limit', plans: [current, target], currentPlan: current, adsLimit: 0 })?.targetPlan?.id).toBe('um');
  });

  it('nao recomenda upgrade quando a capacidade e ilimitada', () => {
    const current = plan('ilimitado', 1, { max_ads: null });
    expect(getContextualUpsellRecommendation({ context: 'ad_limit', plans: [current], currentPlan: current, adsLimit: null })).toBeNull();
  });
});
