import type { Plan } from '../hooks/usePlans';

export type ContextualUpsellContext =
  | 'ad_limit'
  | 'lead_locked';

export type ContextualUpsellOfferKind = 'plan';
export type ContextualUpsellEventType = 'impression' | 'click' | 'dismiss' | 'checkout_started';

export interface ContextualUpsellRecommendation {
  context: ContextualUpsellContext;
  offerKind: ContextualUpsellOfferKind;
  targetPlan: Plan | null;
  eyebrow: string;
  title: string;
  description: string;
  actionLabel: string;
}

const sortEligiblePlans = (plans: Plan[], currentPlan: Plan | null) =>
  plans
    .filter((plan) => plan.is_active && plan.show_in_public_pricing === true && !plan.is_downgrade_plan && plan.id !== currentPlan?.id)
    .filter((plan) => !currentPlan || currentPlan.is_downgrade_plan || plan.position > currentPlan.position)
    .sort((a, b) => {
      const priceDifference = Number(a.monthly_price || 0) - Number(b.monthly_price || 0);
      return priceDifference !== 0 ? priceDifference : a.position - b.position;
    });

const firstPlanMatching = (
  plans: Plan[],
  currentPlan: Plan | null,
  predicate: (plan: Plan) => boolean,
) => sortEligiblePlans(plans, currentPlan).find(predicate) || null;

export const getContextualUpsellRecommendation = ({
  context,
  plans,
  currentPlan,
  adsLimit,
  hasActiveRecurringSubscription = false,
}: {
  context: ContextualUpsellContext;
  plans: Plan[];
  currentPlan: Plan | null;
  adsLimit?: number | null;
  hasActiveRecurringSubscription?: boolean;
}): ContextualUpsellRecommendation | null => {
  let targetPlan: Plan | null = null;

  if (context === 'ad_limit') {
    if (hasActiveRecurringSubscription) return null;
    if (adsLimit === null && currentPlan?.max_ads === null) return null;
    const currentLimit = adsLimit ?? currentPlan?.max_ads ?? 0;
    targetPlan = firstPlanMatching(
      plans,
      currentPlan,
      (plan) => plan.max_ads === null || (plan.max_ads ?? 0) > currentLimit,
    );
  } else if (context === 'lead_locked') {
    if (currentPlan && !currentPlan.is_downgrade_plan) return null;
    targetPlan = sortEligiblePlans(plans, currentPlan)
      .find((plan) => Number(plan.monthly_price || 0) > 0 || Number(plan.yearly_price || 0) > 0) || null;
  }

  if (!targetPlan) return null;

  const content: Record<ContextualUpsellContext, Omit<ContextualUpsellRecommendation, 'context' | 'offerKind' | 'targetPlan'>> = {
    ad_limit: {
      eyebrow: 'Capacidade de anuncios',
      title: `Abra mais espaco com o plano ${targetPlan.name}`,
      description: 'A recomendacao considera o menor plano ativo que aumenta sua capacidade de publicacao.',
      actionLabel: 'Conhecer plano',
    },
    lead_locked: {
      eyebrow: 'Contato protegido',
      title: `Desbloqueie os contatos com ${targetPlan.name}`,
      description: 'O plano recomendado restabelece o acesso aos dados de contato sem alterar o historico dos seus leads.',
      actionLabel: 'Ver opcao de upgrade',
    },
  };

  return { context, offerKind: 'plan', targetPlan, ...content[context] };
};
