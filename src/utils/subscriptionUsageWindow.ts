export type SubscriptionUsageWindow = {
  usageStart: Date;
  usageEnd: Date;
  isAnnualContract: boolean;
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
