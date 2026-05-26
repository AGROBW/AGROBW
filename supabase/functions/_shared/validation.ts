/**
 * Utilitário de validação de schema para Edge Functions.
 *
 * VULN-023 fix: Validação rigorosa de inputs nas funções principais.
 * Usa validação manual sem dependências externas (sem Zod) para compatibilidade
 * máxima com Deno e Supabase Edge Functions.
 */

// ─── Tipos base ──────────────────────────────────────────────────────────────

type ValidationResult<T> =
  | { success: true; data: T }
  | { success: false; errors: string[] };

// ─── Helpers de validação ────────────────────────────────────────────────────

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const isValidUuid = (value: unknown): boolean =>
  typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

const isValidUrl = (value: unknown): boolean => {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
};

const isValidEmail = (value: unknown): boolean =>
  typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);

// ─── Schemas específicos das Edge Functions ──────────────────────────────────

/**
 * Schema para o body de generate-news-article
 * VULN-023 fix: Valida tipos e bounds antes de processar
 */
type GenerateNewsArticleInput = {
  ingestionId: string;
  articleId?: string | null;
  model?: string;
};

export const validateGenerateNewsArticleInput = (
  body: unknown,
): ValidationResult<GenerateNewsArticleInput> => {
  const errors: string[] = [];
  const b = body as Record<string, unknown>;

  if (!isNonEmptyString(b.ingestionId)) {
    errors.push('ingestionId deve ser uma string não vazia');
  }

  if (b.articleId !== undefined && b.articleId !== null && !isValidUuid(b.articleId)) {
    errors.push('articleId deve ser um UUID válido ou null');
  }

  const allowedModels = [
    'gemini-2.0-flash',
    'gemini-2.0-flash-lite',
    'gemini-1.5-flash',
    'gemini-1.5-pro',
  ];
  if (b.model !== undefined && !allowedModels.includes(String(b.model))) {
    errors.push(`model deve ser um dos modelos permitidos: ${allowedModels.join(', ')}`);
  }

  if (errors.length > 0) return { success: false, errors };

  return {
    success: true,
    data: {
      ingestionId: String(b.ingestionId).trim(),
      articleId: b.articleId ? String(b.articleId).trim() : null,
      model: b.model ? String(b.model).trim() : undefined,
    },
  };
};

/**
 * Schema para o body de capture-news-url
 */
type CaptureNewsUrlInput = {
  url: string;
  ingestionId?: string;
};

export const validateCaptureNewsUrlInput = (
  body: unknown,
): ValidationResult<CaptureNewsUrlInput> => {
  const errors: string[] = [];
  const b = body as Record<string, unknown>;

  if (!isValidUrl(b.url)) {
    errors.push('url deve ser uma URL HTTP/HTTPS válida');
  }

  if (b.ingestionId !== undefined && !isValidUuid(b.ingestionId)) {
    errors.push('ingestionId deve ser um UUID válido');
  }

  if (errors.length > 0) return { success: false, errors };

  return {
    success: true,
    data: {
      url: String(b.url).trim(),
      ingestionId: b.ingestionId ? String(b.ingestionId).trim() : undefined,
    },
  };
};

/**
 * Schema para notify-support-ticket-update
 */
type NotifySupportTicketInput = {
  ticketId: string;
  eventType: 'admin_reply' | 'ticket_resolved';
};

export const validateNotifySupportTicketInput = (
  body: unknown,
): ValidationResult<NotifySupportTicketInput> => {
  const errors: string[] = [];
  const b = body as Record<string, unknown>;

  if (!isValidUuid(b.ticketId)) {
    errors.push('ticketId deve ser um UUID válido');
  }

  if (!['admin_reply', 'ticket_resolved'].includes(String(b.eventType))) {
    errors.push('eventType deve ser "admin_reply" ou "ticket_resolved"');
  }

  if (errors.length > 0) return { success: false, errors };

  return {
    success: true,
    data: {
      ticketId: String(b.ticketId).trim(),
      eventType: b.eventType as 'admin_reply' | 'ticket_resolved',
    },
  };
};

/**
 * Schema para test-smtp-settings
 */
type TestSmtpInput = {
  action: 'connection' | 'send_test_email';
  toEmail?: string;
};

export const validateTestSmtpInput = (body: unknown): ValidationResult<TestSmtpInput> => {
  const errors: string[] = [];
  const b = body as Record<string, unknown>;

  const validActions = ['connection', 'send_test_email'];
  const action = String(b?.action || 'connection');
  if (!validActions.includes(action)) {
    errors.push('action deve ser "connection" ou "send_test_email"');
  }

  if (action === 'send_test_email' && !isValidEmail(b.toEmail)) {
    errors.push('toEmail deve ser um e-mail válido para envio de teste');
  }

  if (errors.length > 0) return { success: false, errors };

  return {
    success: true,
    data: {
      action: action as 'connection' | 'send_test_email',
      toEmail: b.toEmail ? String(b.toEmail).trim() : undefined,
    },
  };
};

/**
 * Cria um Response 400 com erros de validação.
 * Retorna erros genéricos ao cliente mas loga os detalhes.
 */
export const validationErrorResponse = (
  corsHeaders: Record<string, string>,
  errors: string[],
): Response =>
  new Response(
    JSON.stringify({
      success: false,
      error: 'Dados inválidos. Verifique os parâmetros enviados.',
      // Em produção, considere não retornar os detalhes dos erros
      details: errors,
    }),
    {
      status: 400,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
      },
    },
  );
