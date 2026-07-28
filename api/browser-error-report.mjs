const MAX_BODY_SIZE = 24_000;      // limite do context serializado
const MAX_RAW_BODY = 32_000;       // limite do corpo bruto (antes de processar)

// Origens oficiais (produção). Previews da Vercel (*.vercel.app) e localhost são aceitos abaixo.
const ALLOWED_ORIGINS = new Set([
  'https://agrobw.com.br',
  'https://www.agrobw.com.br',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
]);

const isAllowedOrigin = (origin) => {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.has(origin)) return true;
  try {
    const host = new URL(origin).hostname;
    return host.endsWith('.vercel.app'); // previews de produção da Vercel
  } catch {
    return false;
  }
};

// --- Redação de PII (SEGUNDA BARREIRA no servidor) ---
// O cliente já redige antes de enviar; aqui protegemos contra clientes antigos,
// requisições modificadas ou falhas futuras no filtro do navegador.
const REDACTED = '[REDACTED]';
const MAX_REDACT_DEPTH = 6;
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

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

const normalizeKey = (key) => String(key).toLowerCase().replace(/[^a-z0-9]/g, '');

const isSensitiveKey = (key) => {
  const k = normalizeKey(key);
  if (SENSITIVE_KEYS.has(k)) return true;
  if (k.endsWith('token')) return true;
  if (k.includes('password') || k.includes('senha')) return true;
  if (k.startsWith('authorization')) return true; // authorizationHeader, NÃO author/authEvent
  return false;
};

const maskEmails = (value) => (typeof value === 'string' ? value.replace(EMAIL_RE, REDACTED) : value);

const redactValue = (value, depth = 0) => {
  if (depth > MAX_REDACT_DEPTH) return '[REDACTED_DEPTH]';
  if (typeof value === 'string') return maskEmails(value);
  if (Array.isArray(value)) return value.map((item) => redactValue(item, depth + 1));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [key, val] of Object.entries(value)) {
      out[key] = isSensitiveKey(key) ? REDACTED : redactValue(val, depth + 1);
    }
    return out;
  }
  return value;
};

const normalizeText = (value, fallback = '') => {
  if (typeof value !== 'string') return fallback;
  return value.trim();
};

const truncate = (value, maxLength) => {
  const text = normalizeText(value);
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
};

// Redige o context recursivamente e só então limita o tamanho.
const sanitizeContext = (context) => {
  if (!context || typeof context !== 'object') return null;

  try {
    const redacted = redactValue(context);
    const raw = JSON.stringify(redacted);
    if (raw.length <= MAX_BODY_SIZE) {
      return JSON.parse(raw);
    }
    return {
      truncated: true,
      preview: raw.slice(0, MAX_BODY_SIZE),
    };
  } catch {
    return { serialization_error: true };
  }
};

export default async function handler(req, res) {
  // 1) Só POST
  if (req.method !== 'POST') {
    res.status(405).json({ success: false, error: 'Method not allowed' });
    return;
  }

  // 2) Origin validada (produção + www + previews Vercel + localhost)
  if (!isAllowedOrigin(req.headers.origin)) {
    res.status(403).end();
    return;
  }

  // 3) Limite de corpo bruto ANTES de processar
  const contentLength = Number(req.headers['content-length'] || 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_RAW_BODY) {
    res.status(413).end();
    return;
  }

  // Tratamento silencioso: qualquer falha aqui não deve estourar (evita loop no cliente).
  try {
    const level = req.body?.level === 'warn' ? 'warn' : 'error';
    // message e location também passam pela máscara de e-mail (2ª barreira)
    const message = maskEmails(truncate(req.body?.message, 300)) || 'Browser error report';
    const timestamp = normalizeText(req.body?.timestamp, new Date().toISOString());
    const location = req.body?.location && typeof req.body.location === 'object'
      ? {
          href: maskEmails(truncate(req.body.location.href, 500)),
          pathname: maskEmails(truncate(req.body.location.pathname, 300)),
        }
      : null;
    const userAgent = truncate(req.body?.userAgent, 500);
    const context = sanitizeContext(req.body?.context); // redige recursivamente + limita tamanho

    // IP do usuário NÃO é registrado (removido forwardedFor por LGPD/minimização).
    const logPayload = {
      timestamp,
      location,
      userAgent,
      context,
    };

    if (level === 'warn') {
      console.warn(`[BrowserReport] ${message}`, logPayload);
    } else {
      console.error(`[BrowserReport] ${message}`, logPayload);
    }
  } catch {
    // silencioso
  }

  res.status(204).end();
}
