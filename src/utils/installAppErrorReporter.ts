import { setAppErrorReporter } from './appLogger';

const REPORTER_ENDPOINT = '/api/browser-error-report';
const WARN_DEDUP_WINDOW_MS = 60_000;
const ERROR_DEDUP_WINDOW_MS = 15_000;
const MAX_MESSAGE_LENGTH = 300;
const sentCache = new Map<string, number>();

const trimString = (value: string, maxLength: number) =>
  value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;

// --- Redação de PII antes do envio ---
const REDACTED = '[REDACTED]';
const MAX_REDACT_DEPTH = 6;
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

// Chaves sensíveis por NOME NORMALIZADO (exato), não por substring genérica.
// Evita falso-positivo em authEvent/authenticated/author.
const SENSITIVE_KEYS = new Set([
  'password', 'senha',
  'token', 'accesstoken', 'refreshtoken', 'idtoken',
  'authorization', 'auth', 'bearer',
  'cookie', 'cookies',
  'cpf', 'cnpj', 'document', 'documento', 'rg',
  'email', 'emailaddress',
  'phone', 'telefone', 'celular', 'whatsapp',
  'secret', 'apikey',
]);

const normalizeKey = (key: string) => key.toLowerCase().replace(/[^a-z0-9]/g, '');

const isSensitiveKey = (key: string) => {
  const k = normalizeKey(key);
  if (SENSITIVE_KEYS.has(k)) return true;
  if (k.endsWith('token')) return true;               // accessToken, refreshToken, idToken...
  if (k.includes('password') || k.includes('senha')) return true;
  if (k.startsWith('authorization')) return true;     // authorizationHeader (mas NÃO author/authEvent)
  return false;
};

const maskEmails = (value: string) => value.replace(EMAIL_RE, REDACTED);

const redactValue = (value: unknown, depth = 0): unknown => {
  if (depth > MAX_REDACT_DEPTH) return '[REDACTED_DEPTH]';
  if (typeof value === 'string') return maskEmails(value);
  if (Array.isArray(value)) return value.map((item) => redactValue(item, depth + 1));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      out[key] = isSensitiveKey(key) ? REDACTED : redactValue(val, depth + 1);
    }
    return out;
  }
  return value;
};

const getDedupeWindow = (level: 'warn' | 'error') =>
  level === 'warn' ? WARN_DEDUP_WINDOW_MS : ERROR_DEDUP_WINDOW_MS;

const shouldSend = (level: 'warn' | 'error', message: string) => {
  const key = `${level}:${message}`;
  const now = Date.now();
  const lastSentAt = sentCache.get(key) ?? 0;
  if (now - lastSentAt < getDedupeWindow(level)) {
    return false;
  }

  sentCache.set(key, now);

  if (sentCache.size > 200) {
    for (const [cacheKey, timestamp] of sentCache.entries()) {
      if (now - timestamp > WARN_DEDUP_WINDOW_MS * 5) {
        sentCache.delete(cacheKey);
      }
    }
  }

  return true;
};

const getLocation = () => {
  if (typeof window === 'undefined') return null;
  return {
    href: maskEmails(window.location.href),
    pathname: maskEmails(window.location.pathname),
  };
};

export const installAppErrorReporter = () => {
  if (typeof window === 'undefined') return;

  setAppErrorReporter(({ level, message, context }) => {
    const normalizedMessage = maskEmails(
      trimString(String(message || 'Erro sem mensagem'), MAX_MESSAGE_LENGTH)
    );

    if (!shouldSend(level, normalizedMessage)) {
      return;
    }

    let body: string;
    try {
      const payload = {
        level,
        message: normalizedMessage,
        context: context ? redactValue(context) : null,
        location: getLocation(),
        userAgent: navigator.userAgent,
        timestamp: new Date().toISOString(),
      };
      body = JSON.stringify(payload);
    } catch {
      // Contexto não-serializável (ex.: referência circular) -> não envia, sem loop.
      return;
    }

    try {
      if (typeof navigator.sendBeacon === 'function') {
        const blob = new Blob([body], { type: 'application/json' });
        if (navigator.sendBeacon(REPORTER_ENDPOINT, blob)) {
          return;
        }
      }
    } catch {
      // fallback para fetch
    }

    void fetch(REPORTER_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body,
      keepalive: true,
    }).catch(() => {
      // silencioso para nao gerar loop de erro
    });
  });
};
