export interface UpgradePlanCandidate {
  id: string;
  position: number;
  is_active: boolean;
  is_downgrade_plan: boolean;
}

export const getNextRecommendedUpgradePlan = <T extends UpgradePlanCandidate>(
  plans: T[],
  currentPlan: T | null,
): T | null => {
  if (!currentPlan) return null;

  const eligiblePlans = plans
    .filter((plan) => plan.is_active && !plan.is_downgrade_plan && plan.id !== currentPlan.id)
    .sort((a, b) => a.position - b.position);

  if (currentPlan.is_downgrade_plan) {
    return eligiblePlans[0] || null;
  }

  return eligiblePlans.find((plan) => plan.position > currentPlan.position) || null;
};
