const extractDateParts = (value: Date) => {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  const parts = formatter.formatToParts(value);
  const year = Number(parts.find((part) => part.type === 'year')?.value || 0);
  const month = Number(parts.find((part) => part.type === 'month')?.value || 1);
  const day = Number(parts.find((part) => part.type === 'day')?.value || 1);

  return { year, month, day };
};

const pad = (value: number) => String(value).padStart(2, '0');

export const formatSaoPauloDateOnly = (value: Date) => {
  const { year, month, day } = extractDateParts(value);
  return `${year}-${pad(month)}-${pad(day)}`;
};

export const getTodaySaoPauloDateOnly = () => formatSaoPauloDateOnly(new Date());

export const addDaysToDateOnly = (dateOnly: string, days: number) => {
  const [year, month, day] = dateOnly.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0, 0));
  date.setUTCDate(date.getUTCDate() + days);
  return formatSaoPauloDateOnly(date);
};

export const resolveCivilDateInput = (dateOnly?: string | null, instant?: string | null) => {
  if (dateOnly) return dateOnly;
  if (!instant) return '';

  const parsed = new Date(instant);
  if (Number.isNaN(parsed.getTime())) return '';
  return formatSaoPauloDateOnly(parsed);
};

export const civilDateToSaoPauloStartOfDayIso = (dateOnly: string | null | undefined) => {
  if (!dateOnly) return null;
  const [year, month, day] = dateOnly.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day, 3, 0, 0, 0)).toISOString();
};

export const civilDateToSaoPauloEndOfDayIso = (dateOnly: string | null | undefined) => {
  if (!dateOnly) return null;
  const [year, month, day] = dateOnly.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + 1, 2, 59, 59, 999)).toISOString();
};

export const civilDateToLocalDate = (dateOnly: string | null | undefined) => {
  if (!dateOnly) return null;
  const [year, month, day] = dateOnly.split('-').map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day, 12, 0, 0, 0);
};

export const formatCivilDatePtBr = (dateOnly: string | null | undefined) => {
  if (!dateOnly) return 'Sem data definida';
  const [year, month, day] = dateOnly.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0, 0));

  return date.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
};
