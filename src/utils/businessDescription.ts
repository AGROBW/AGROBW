const MAX_BUSINESS_DESCRIPTION_LENGTH = 500;

const DIRECT_CONTACT_PATTERNS = [
  /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i,
  /https?:\/\/[^\s]+/i,
  /www\.[^\s]+/i,
  /\b[a-z0-9-]+\.(com|com\.br|net|org|br|gov\.br|edu\.br|app|io|co|xyz|online|site|store|shop|blog)\b/i,
  /\(?\d{2,3}\)?\s*\d{4,5}[-\s]?\d{4}/,
  /\b\d{10,13}\b/,
  /\+?55\s*\(?\d{2,3}\)?\s*\d{4,5}[-\s]?\d{4}/,
  /@[a-z0-9._-]+/i,
];

const BLOCKED_CONTACT_TERMS = [
  'whatsapp',
  'whats',
  'zap',
  'telegram',
  'instagram',
  'insta',
  'facebook',
  'linkedin',
  'twitter',
  'xcom',
  'tiktok',
  'discord',
  'gmail',
  'hotmail',
  'outlook',
  'yahoo',
  'email',
  'e-mail',
  'arroba',
  'telefone',
  'celular',
  'fone',
  'contato',
  'chama',
  'ligue',
  'dm',
  'direct',
  'wame',
  'site',
  'link',
];

const normalizeInspectionText = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

const collapseInspectionText = (value: string) =>
  normalizeInspectionText(value).replace(/[^a-z0-9]/g, '');

export const getBusinessDescriptionValidationError = (value: string): string | null => {
  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  if (trimmed.length > MAX_BUSINESS_DESCRIPTION_LENGTH) {
    return `Use no máximo ${MAX_BUSINESS_DESCRIPTION_LENGTH} caracteres.`;
  }

  const normalized = normalizeInspectionText(trimmed);
  const collapsed = collapseInspectionText(trimmed);

  if (DIRECT_CONTACT_PATTERNS.some((pattern) => pattern.test(trimmed))) {
    return 'A descrição do negócio não pode conter telefone, e-mail, links ou redes sociais.';
  }

  if (BLOCKED_CONTACT_TERMS.some((term) => normalized.includes(term) || collapsed.includes(term.replace(/[^a-z0-9]/g, '')))) {
    return 'Remova qualquer forma de contato da descrição do negócio.';
  }

  return null;
};

export const isBusinessDescriptionValid = (value: string): boolean =>
  !getBusinessDescriptionValidationError(value);

export { MAX_BUSINESS_DESCRIPTION_LENGTH };
