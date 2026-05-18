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

const getClientIp = (req: Request): string | null => {
  const forwardedFor = req.headers.get('x-forwarded-for');
  if (forwardedFor) {
    return forwardedFor.split(',')[0]?.trim() || null;
  }

  return req.headers.get('x-real-ip') || req.headers.get('cf-connecting-ip') || null;
};

export const logSecurityEvent = async (
  supabaseAdmin: SupabaseClient,
  params: SecurityEventParams
) => {
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
