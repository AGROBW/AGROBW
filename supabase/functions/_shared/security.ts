import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.48.1';

type SecurityEventParams = {
  req: Request;
  attemptedRoute: string;
  attemptedAction: string;
  severity?: 'info' | 'warning' | 'critical' | 'blocked';
  reason: string;
  userId?: string | null;
  email?: string | null;
  metadata?: Record<string, unknown>;
};

/**
 * Obtém o IP real do cliente de forma segura.
 *
 * VULN-012 fix: Não usar x-forwarded-for como primeira opção — pode ser forjado
 * pelo cliente. Quando a aplicação está atrás do Cloudflare, `cf-connecting-ip`
 * é injetado pela borda e não pode ser manipulado pelo usuário final.
 */
const getClientIp = (req: Request): string | null =>
  // Cloudflare injeta este header e ele NÃO pode ser forjado pelo cliente
  req.headers.get('cf-connecting-ip') ||
  // Fallback para Vercel/outros proxies confiáveis
  req.headers.get('x-real-ip') ||
  // x-forwarded-for só como último recurso (pode ser forjado)
  req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
  null;

export const logSecurityEvent = async (
  supabaseAdmin: SupabaseClient,
  params: SecurityEventParams,
): Promise<void> => {
  try {
    await supabaseAdmin.rpc('log_security_event', {
      p_user_id: params.userId ?? null,
      p_email: params.email ?? null,
      p_attempted_route: params.attemptedRoute,
      p_attempted_action: params.attemptedAction,
      p_ip_address: getClientIp(params.req),
      p_user_agent: params.req.headers.get('user-agent'),
      p_severity: params.severity || 'blocked',
      p_reason: params.reason,
      p_metadata: params.metadata ?? {},
    });
  } catch (error) {
    console.error('[security] failed to log security event:', error);
  }
};

/**
 * Verifica se um perfil de usuário tem papel de administrador.
 *
 * VULN-020 fix: Centraliza a lógica de verificação de admin em um único lugar,
 * eliminando duplicação e inconsistências entre funções.
 * Usa apenas `role === 'admin'` como critério canônico.
 */
export const isAdminProfile = (
  profile: { role?: string | null; is_admin?: boolean | null } | null | undefined,
): boolean => {
  if (!profile) return false;
  return (profile.role ?? '').toLowerCase() === 'admin';
};

/**
 * Obtém e valida o token Bearer do header Authorization.
 * Retorna o token ou null se ausente/malformado.
 */
export const extractBearerToken = (req: Request): string | null => {
  const authHeader = req.headers.get('Authorization') || req.headers.get('authorization') || '';
  if (!authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7).trim();
  return token.length > 0 ? token : null;
};
