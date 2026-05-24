export const calculateYearlyTotal = (
  monthlyPrice: number,
  yearlyPrice: number
): number => {
  return yearlyPrice > 0 ? yearlyPrice : monthlyPrice * 12;
};

export const calculateYearlySavings = (
  monthlyPrice: number,
  yearlyPrice: number
): { amount: number; percentage: number } => {
  const monthlyTotal = monthlyPrice * 12;
  const yearlyTotal = calculateYearlyTotal(monthlyPrice, yearlyPrice);
  const savings = monthlyTotal - yearlyTotal;
  const percentage = monthlyTotal > 0 ? (savings / monthlyTotal) * 100 : 0;

  return {
    amount: savings,
    percentage: Math.round(percentage),
  };
};

export const isCustomPlan = (planName: string): boolean => {
  const customPlanNames = ['corporativo', 'enterprise', 'personalizado', 'custom'];
  return customPlanNames.some((name) => planName.toLowerCase().includes(name));
};

export const getCustomPlanContactLink = (planName: string): string => {
  const whatsappNumber = '5511999999999';
  const message = encodeURIComponent(
    `Ola! Tenho interesse no plano ${planName}. Gostaria de mais informacoes.`
  );
  return `https://wa.me/${whatsappNumber}?text=${message}`;
};
