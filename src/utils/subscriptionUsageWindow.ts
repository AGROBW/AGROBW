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
  isAnnualContract: boolean
) => {
  if (!plan) {
    return null;
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
