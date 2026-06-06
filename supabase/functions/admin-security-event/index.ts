import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.48.1';
import { getCorsHeaders, handleCorsPreflightBrowser } from '../_shared/cors.ts';
import { extractBearerToken, isAdminProfile, logSecurityEvent } from '../_shared/security.ts';

type AllowedAdminSecurityAction =
  | 'admin_mfa_enrollment_failed'
  | 'admin_mfa_challenge_failed'
  | 'admin_mfa_verify_failed'
  | 'admin_mfa_duplicate_factor_detected';

type AdminSecurityEventRequest = {
  action?: AllowedAdminSecurityAction | null;
  reason?: string | null;
  metadata?: Record<string, unknown> | null;
};

const ALLOWED_ACTIONS = new Set<AllowedAdminSecurityAction>([
  'admin_mfa_enrollment_failed',
  'admin_mfa_challenge_failed',
  'admin_mfa_verify_failed',
  'admin_mfa_duplicate_factor_detected',
]);

const jsonResponse = (req: Request, body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...getCorsHeaders(req),
      'Content-Type': 'application/json',
    },
  });

const readRequestBody = async (req: Request): Promise<AdminSecurityEventRequest> => {
  try {
    return (await req.json()) as AdminSecurityEventRequest;
  } catch {
    return {};
  }
};

const sanitizeReason = (value: string | null | undefined) =>
  String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 240);

const sanitizeMetadata = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).slice(0, 12).map(([key, entryValue]) => {
      if (
        entryValue === null ||
        typeof entryValue === 'string' ||
        typeof entryValue === 'number' ||
        typeof entryValue === 'boolean'
      ) {
        return [key, entryValue];
      }

      return [key, JSON.stringify(entryValue).slice(0, 200)];
    }),
  );
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCorsPreflightBrowser(req);
  }

  if (req.method !== 'POST') {
    return jsonResponse(req, { success: false, error: 'Metodo nao permitido.' }, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
    return jsonResponse(req, { success: false, error: 'Configuracao indisponivel.' }, 500);
  }

  const token = extractBearerToken(req);
  if (!token) {
    return jsonResponse(req, { success: false, error: 'Nao autorizado.' }, 401);
  }

  const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const { data: authData, error: authError } = await supabaseAuth.auth.getUser(token);
    if (authError || !authData.user) {
      return jsonResponse(req, { success: false, error: 'Nao autorizado.' }, 401);
    }

    const { data: profile, error: profileError } = await supabaseAdmin
      .from('users')
      .select('role, is_admin')
      .eq('id', authData.user.id)
      .maybeSingle();

    if (profileError || !isAdminProfile(profile)) {
      return jsonResponse(req, { success: false, error: 'Acesso negado.' }, 403);
    }

    const body = await readRequestBody(req);
    const action = String(body.action || '').trim() as AllowedAdminSecurityAction;
    if (!ALLOWED_ACTIONS.has(action)) {
      return jsonResponse(req, { success: false, error: 'Evento invalido.' }, 400);
    }

    const reason =
      sanitizeReason(body.reason) ||
      'Nao foi possivel concluir a verificacao do administrador.';

    await logSecurityEvent(supabaseAdmin, {
      req,
      attemptedRoute: '/admin/mfa',
      attemptedAction: action,
      severity: 'warning',
      reason,
      userId: authData.user.id,
      email: authData.user.email,
      metadata: sanitizeMetadata(body.metadata),
    });

    return jsonResponse(req, { success: true });
  } catch (error) {
    console.error('[admin-security-event] unexpected error:', error);
    return jsonResponse(req, { success: false, error: 'Nao foi possivel registrar o evento.' }, 500);
  }
});
