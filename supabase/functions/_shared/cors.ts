/**
 * Utilitário CORS seguro para Supabase Edge Functions
 *
 * Substitui o inseguro `Access-Control-Allow-Origin: *` por uma allowlist
 * de origens conhecidas. Edge Functions de webhook (Asaas, Fiscal) devem
 * usar corsHeadersWebhook, que bloqueia origens de browser completamente.
 *
 * VULN-002 fix: CORS wildcard removido
 */

/** Origens permitidas para chamadas do frontend */
const ALLOWED_BROWSER_ORIGINS: readonly string[] = [
  'https://bwagro.vercel.app',
  'https://bwagro.com.br',
  'https://www.bwagro.com.br',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
  // Previews do Vercel (apenas em desenvolvimento/staging)
  // 'https://*.vercel.app', ← Não usar glob — muito permissivo
];

/** Verifica se a origem está na allowlist */
const resolveAllowedOrigin = (req: Request): string => {
  const origin = req.headers.get('Origin') || '';
  if (ALLOWED_BROWSER_ORIGINS.includes(origin)) {
    return origin;
  }
  // Fallback para a origem principal — navegadores exigem um valor explícito
  return ALLOWED_BROWSER_ORIGINS[0];
};

/**
 * Headers CORS para endpoints do frontend autenticado.
 * Retorna headers dinâmicos baseados na origem da requisição.
 */
export const getCorsHeaders = (req: Request): Record<string, string> => ({
  'Access-Control-Allow-Origin': resolveAllowedOrigin(req),
  'Access-Control-Allow-Headers':
    'Content-Type, Authorization, X-Client-Info, apikey',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Vary': 'Origin',
});

/**
 * Headers CORS para endpoints de webhook (Asaas, Fiscal, MercadoPago).
 * Webhooks são chamados diretamente por servidores externos, nunca por browsers —
 * portanto bloqueamos origens de browser completamente.
 */
export const getCorsHeadersWebhook = (): Record<string, string> => ({
  'Access-Control-Allow-Origin': 'null', // Bloqueia browsers
  'Access-Control-Allow-Methods': 'POST',
  'Access-Control-Allow-Headers': 'Content-Type, x-webhook-secret, asaas-access-token',
});

/**
 * Headers CORS para endpoints internos (cron jobs, automações).
 * Só aceita chamadas sem Origin (servidor a servidor).
 */
export const getCorsHeadersInternal = (): Record<string, string> => ({
  'Access-Control-Allow-Origin': 'null',
  'Access-Control-Allow-Methods': 'POST',
  'Access-Control-Allow-Headers': 'Content-Type, x-internal-secret, x-cron-secret',
});

/** Resposta para requisições OPTIONS (preflight) */
export const handleCorsPreflightBrowser = (req: Request): Response =>
  new Response('ok', { headers: getCorsHeaders(req) });

export const handleCorsPreflightWebhook = (): Response =>
  new Response('ok', { headers: getCorsHeadersWebhook() });

/** Helper para criar respostas JSON com headers CORS corretos */
export const jsonResponseWithCors = (
  req: Request,
  body: Record<string, unknown>,
  status = 200,
): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...getCorsHeaders(req),
      'Content-Type': 'application/json',
    },
  });
