export type SubscriptionUsageWindow = {
  usageStart: Date;
  usageEnd: Date;
  isAnnualContract: boolean;
};

export type LeadContactPlanLike = {
  lead_contact_limit_days?: number | null;
  lead_contact_limit_days_monthly?: number | null;
  lead_contact_limit_days_yearly?: number | null;
};

export type PlanValidityPlanLike = {
  plan_validity_days_monthly?: number | null;
  plan_validity_days_yearly?: number | null;
};

const ANNUAL_THRESHOLD_DAYS = 45;

const addMonthsUtc = (date: Date, months: number) => {
  const result = new Date(date.getTime());
  result.setUTCMonth(result.getUTCMonth() + months);
  return result;
};

export const getSubscriptionUsageWindow = (
  periodStartIso: string,
  periodEndIso: string,
  referenceDate = new Date()
): SubscriptionUsageWindow => {
  const contractStart = new Date(periodStartIso);
  const contractEnd = new Date(periodEndIso);
  const totalDays = (contractEnd.getTime() - contractStart.getTime()) / (1000 * 60 * 60 * 24);
  const isAnnualContract = totalDays > ANNUAL_THRESHOLD_DAYS;

  if (!isAnnualContract) {
    return {
      usageStart: contractStart,
      usageEnd: contractEnd,
      isAnnualContract,
    };
  }

  let usageStart = contractStart;
  let usageEnd = addMonthsUtc(contractStart, 1);

  while (referenceDate >= usageEnd && usageEnd < contractEnd) {
    usageStart = usageEnd;
    usageEnd = addMonthsUtc(usageEnd, 1);
  }

  if (usageEnd > contractEnd) {
    usageEnd = contractEnd;
  }

  return {
    usageStart,
    usageEnd,
    isAnnualContract,
  };
};

export const getEffectiveLeadContactLimitDays = (
  plan: LeadContactPlanLike | null | undefined,
  isAnnualContract: boolean,
  options?: {
    isPromotion?: boolean;
    periodStartIso?: string | null;
    periodEndIso?: string | null;
  }
) => {
  if (!plan) {
    return null;
  }

  if (options?.isPromotion && options.periodStartIso && options.periodEndIso) {
    const monthlyLimit = plan.lead_contact_limit_days_monthly ?? plan.lead_contact_limit_days ?? null;

    if (monthlyLimit !== null && monthlyLimit !== undefined) {
      const periodStart = new Date(options.periodStartIso);
      const periodEnd = new Date(options.periodEndIso);
      const periodDays = Math.ceil((periodEnd.getTime() - periodStart.getTime()) / (1000 * 60 * 60 * 24));

      if (Number.isFinite(periodDays) && periodDays > 0) {
        const proportionalLimit = Math.ceil(monthlyLimit * (periodDays / 30));
        return Math.min(periodDays, Math.max(monthlyLimit, proportionalLimit));
      }
    }
  }

  const cycleSpecificLimit = isAnnualContract
    ? plan.lead_contact_limit_days_yearly
    : plan.lead_contact_limit_days_monthly;

  if (cycleSpecificLimit !== null && cycleSpecificLimit !== undefined) {
    return cycleSpecificLimit;
  }

  return plan.lead_contact_limit_days ?? null;
};

export const getEffectivePlanValidityDays = (
  plan: PlanValidityPlanLike | null | undefined,
  billingCycle: 'monthly' | 'yearly'
) => {
  if (!plan) {
    return billingCycle === 'yearly' ? 365 : 30;
  }

  const cycleSpecificLimit =
    billingCycle === 'yearly'
      ? plan.plan_validity_days_yearly
      : plan.plan_validity_days_monthly;

  if (cycleSpecificLimit !== null && cycleSpecificLimit !== undefined) {
    return cycleSpecificLimit;
  }

  return billingCycle === 'yearly' ? 365 : 30;
};
