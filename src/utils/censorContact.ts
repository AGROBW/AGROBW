/**
 * Sistema de Censura Automática de Dados de Contato
 * 
 * Detecta e substitui números de telefone, e-mails e links externos
 * em textos de anúncios para proteção da plataforma.
 */

// Texto de substituição
const REPLACEMENT_TEXT = '[CONTATO PROTEGIDO]';

/**
 * Regex para detectar telefones brasileiros
 * Formatos suportados:
 * - (64) 99342-4812
 * - 64 99342-4812
 * - 64993424812
 * - 064 9 9342-4812
 * - +55 64 9 9342-4812
 * - 11-98765-4321
 * - etc.
 */
const PHONE_PATTERNS = [
  // Formato: (XX) XXXXX-XXXX ou (XX) XXXX-XXXX
  /\(?\d{2,3}\)?\s*\d{4,5}[-\s]?\d{4}/gi,
  
  // Formato: XX XXXXX-XXXX ou XX XXXX-XXXX (com espaços)
  /\b\d{2,3}\s+\d{4,5}[-\s]?\d{4}\b/gi,
  
  // Formato: XXXXXXXXXXX (11 dígitos juntos) ou XXXXXXXXXX (10 dígitos)
  /\b\d{10,11}\b/gi,
  
  // Formato internacional: +55 XX XXXXX-XXXX
  /\+55\s*\(?\d{2,3}\)?\s*\d{4,5}[-\s]?\d{4}/gi,
  
  // Formato com código de país sem +: 55 XX XXXXX-XXXX
  /\b55\s*\(?\d{2,3}\)?\s*\d{4,5}[-\s]?\d{4}\b/gi,
  
  // Formato com zero na frente: 0XX XXXXX-XXXX
  /\b0\d{2,3}\s*\d{4,5}[-\s]?\d{4}\b/gi,
];

/**
 * Regex para detectar e-mails
 * Formato: usuario@provedor.com.br
 */
const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi;

/**
 * Regex para detectar links e URLs
 * Formatos suportados:
 * - http://site.com
 * - https://site.com
 * - www.site.com
 * - site.com.br
 */
const LINK_PATTERNS = [
  // URLs com protocolo
  /https?:\/\/[^\s]+/gi,
  
  // URLs iniciando com www
  /www\.[^\s]+/gi,
  
  // Domínios genéricos (site.com, site.com.br)
  /\b[a-zA-Z0-9-]+\.(com|com\.br|net|org|br|gov\.br|edu\.br|app|io|co|xyz|online|site|store|shop|blog)\b/gi,
];

/**
 * Regex para detectar menções a redes sociais
 * Formatos suportados:
 * - @username
 * - instagram.com/username
 * - facebook.com/username
 * - whatsapp, telegram, discord, etc.
 */
const SOCIAL_PATTERNS = [
  // Menções com @
  /@[a-zA-Z0-9._]+/gi,
  
  // Nomes de redes sociais (menções diretas)
  /\b(instagram|insta|facebook|face|whatsapp|whats|zap|telegram|tele|discord|twitter|tiktok|linkedin)\b/gi,
  
  // URLs de redes sociais específicas
  /(instagram\.com|facebook\.com|fb\.com|wa\.me|t\.me|discord\.gg|twitter\.com|tiktok\.com|linkedin\.com)\/[^\s]*/gi,
];

/**
 * Censura números de telefone no texto
 */
export function censorPhones(text: string): string {
  let censored = text;
  
  PHONE_PATTERNS.forEach(pattern => {
    censored = censored.replace(pattern, (match) => {
      // Evitar censurar números que não são telefones (ex: anos, códigos)
      // Telefone deve ter pelo menos 8 dígitos
      const digitsOnly = match.replace(/\D/g, '');
      if (digitsOnly.length >= 8) {
        return REPLACEMENT_TEXT;
      }
      return match;
    });
  });
  
  return censored;
}

/**
 * Censura e-mails no texto
 */
export function censorEmails(text: string): string {
  return text.replace(EMAIL_PATTERN, REPLACEMENT_TEXT);
}

/**
 * Censura links e URLs no texto
 */
export function censorLinks(text: string): string {
  let censored = text;
  
  LINK_PATTERNS.forEach(pattern => {
    censored = censored.replace(pattern, REPLACEMENT_TEXT);
  });
  
  return censored;
}

/**
 * Censura menções a redes sociais no texto
 */
export function censorSocialMedia(text: string): string {
  let censored = text;
  
  SOCIAL_PATTERNS.forEach(pattern => {
    censored = censored.replace(pattern, REPLACEMENT_TEXT);
  });
  
  return censored;
}

/**
 * Verifica se o texto contém algum dado de contato
 */
export function hasContactData(text: string): boolean {
  if (!text) return false;
  
  // Verifica telefones
  for (const pattern of PHONE_PATTERNS) {
    const matches = text.match(pattern);
    if (matches) {
      for (const match of matches) {
        const digitsOnly = match.replace(/\D/g, '');
        if (digitsOnly.length >= 8) {
          return true;
        }
      }
    }
  }
  
  // Verifica e-mails
  if (EMAIL_PATTERN.test(text)) return true;
  
  // Verifica links
  for (const pattern of LINK_PATTERNS) {
    if (pattern.test(text)) return true;
  }
  
  // Verifica redes sociais
  for (const pattern of SOCIAL_PATTERNS) {
    if (pattern.test(text)) return true;
  }
  
  return false;
}

/**
 * Função principal: censura todos os tipos de contato no texto
 */
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
    hadContactData
  };
}

/**
 * Função auxiliar para limpar o texto antes de salvar no banco
 * (para uso no frontend antes do submit)
 */
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
    hadContactInDescription: descriptionResult.hadContactData
  };
}
