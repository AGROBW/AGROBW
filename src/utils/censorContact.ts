const REPLACEMENT_TEXT = '[CONTATO PROTEGIDO]';

const CONTACT_KEYWORD_PATTERN = /\b(tel(?:efone)?|cel(?:ular)?|fone|contato|whats(?:app)?|zap)\b/gi;

const PHONE_PATTERNS = [
  /\+55\s*\(?\d{2,3}\)?\s*\d{4,5}[-\s]?\d{4}/gi,
  /\b55\s*\(?\d{2,3}\)?\s*\d{4,5}[-\s]?\d{4}\b/gi,
  /\b0\d{2,3}\s*\d{4,5}[-\s]?\d{4}\b/gi,
  /\(?\d{2,3}\)?\s*\d{4,5}[-\s]?\d{4}/gi,
  /\b\d{2,3}\s+\d{4,5}[-\s]?\d{4}\b/gi,
  /\b\d{10,11}\b/gi,
];

const GENERIC_PHONE_SEQUENCE_PATTERN = /(?:\+?\d[\d\s().-]{6,}\d)/gi;
const KEYWORD_PHONE_PATTERN = /\b(?:tel(?:efone)?|cel(?:ular)?|fone|contato|whats(?:app)?|zap)\b[:\s-]*(?:\+?\d[\d\s().-]{6,}\d)/gi;
const SPACED_DIGITS_PATTERN = /(?:\b\d(?:[\s.-]*\d){7,}\b)/gi;

const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi;

const LINK_PATTERNS = [
  /https?:\/\/[^\s]+/gi,
  /www\.[^\s]+/gi,
  /\b[a-zA-Z0-9-]+\.(com|com\.br|net|org|br|gov\.br|edu\.br|app|io|co|xyz|online|site|store|shop|blog)\b/gi,
];

const SOCIAL_PATTERNS = [
  /@[a-zA-Z0-9._]+/gi,
  /\b(instagram|insta|facebook|face|whatsapp|whats|zap|telegram|tele|discord|twitter|tiktok|linkedin)\b/gi,
  /(instagram\.com|facebook\.com|fb\.com|wa\.me|t\.me|discord\.gg|twitter\.com|tiktok\.com|linkedin\.com)\/[^\s]*/gi,
];

function replaceIfPhoneLike(match: string): string {
  const digitsOnly = match.replace(/\D/g, '');
  return digitsOnly.length >= 8 ? REPLACEMENT_TEXT : match;
}

export function censorPhones(text: string): string {
  let censored = text;

  censored = censored.replace(KEYWORD_PHONE_PATTERN, replaceIfPhoneLike);

  PHONE_PATTERNS.forEach((pattern) => {
    censored = censored.replace(pattern, replaceIfPhoneLike);
  });

  censored = censored.replace(GENERIC_PHONE_SEQUENCE_PATTERN, replaceIfPhoneLike);
  censored = censored.replace(SPACED_DIGITS_PATTERN, replaceIfPhoneLike);

  return censored;
}

export function censorEmails(text: string): string {
  return text.replace(EMAIL_PATTERN, REPLACEMENT_TEXT);
}

export function censorLinks(text: string): string {
  let censored = text;

  LINK_PATTERNS.forEach((pattern) => {
    censored = censored.replace(pattern, REPLACEMENT_TEXT);
  });

  return censored;
}

export function censorSocialMedia(text: string): string {
  let censored = text;

  SOCIAL_PATTERNS.forEach((pattern) => {
    censored = censored.replace(pattern, REPLACEMENT_TEXT);
  });

  censored = censored.replace(CONTACT_KEYWORD_PATTERN, REPLACEMENT_TEXT);

  return censored;
}

export function hasContactData(text: string): boolean {
  if (!text) return false;

  for (const pattern of [KEYWORD_PHONE_PATTERN, ...PHONE_PATTERNS, GENERIC_PHONE_SEQUENCE_PATTERN, SPACED_DIGITS_PATTERN]) {
    const matches = text.match(pattern);
    if (matches) {
      for (const match of matches) {
        if (match.replace(/\D/g, '').length >= 8) {
          return true;
        }
      }
    }
  }

  if (EMAIL_PATTERN.test(text)) return true;

  for (const pattern of LINK_PATTERNS) {
    if (pattern.test(text)) return true;
  }

  for (const pattern of SOCIAL_PATTERNS) {
    if (pattern.test(text)) return true;
  }

  return CONTACT_KEYWORD_PATTERN.test(text);
}

export function censorContactData(text: string): {
  censored: string;
  hadContactData: boolean;
} {
  if (!text) {
    return { censored: text, hadContactData: false };
  }

  const hadContactData = hasContactData(text);

  let censored = text;
  censored = censorPhones(censored);
  censored = censorEmails(censored);
  censored = censorLinks(censored);
  censored = censorSocialMedia(censored);

  return {
    censored,
    hadContactData,
  };
}

export function sanitizeAnnouncementText(title: string, description: string): {
  title: string;
  description: string;
  hadContactInTitle: boolean;
  hadContactInDescription: boolean;
} {
  const titleResult = censorContactData(title);
  const descriptionResult = censorContactData(description);

  return {
    title: titleResult.censored,
    description: descriptionResult.censored,
    hadContactInTitle: titleResult.hadContactData,
    hadContactInDescription: descriptionResult.hadContactData,
  };
}
