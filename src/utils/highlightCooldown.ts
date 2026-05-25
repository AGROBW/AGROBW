export const DEFAULT_HIGHLIGHT_COOLDOWN_DAYS = 15;

export const getEffectiveHighlightCooldownDays = (value?: number | null) => {
  if (!Number.isFinite(value)) {
    return DEFAULT_HIGHLIGHT_COOLDOWN_DAYS;
  }

  return Math.max(0, Math.floor(Number(value)));
};

export const formatHighlightCooldownDaysLabel = (value?: number | null) => {
  const days = getEffectiveHighlightCooldownDays(value);
  return `${days} ${days === 1 ? 'dia' : 'dias'}`;
};
