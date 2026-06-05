import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.48.1';
import { getCorsHeaders, handleCorsPreflightBrowser } from '../_shared/cors.ts';
import { extractBearerToken, isAdminProfile, logSecurityEvent } from '../_shared/security.ts';

type AdminMfaTicketAction = 'validate' | 'consume';

interface AdminMfaTicketRequest {
  action?: AdminMfaTicketAction | null;
  ticket?: string | null;
}

const jsonResponse = (req: Request, body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...getCorsHeaders(req),
      'Content-Type': 'application/json',
    },
  });

const readRequestBody = async (req: Request): Promise<AdminMfaTicketRequest> => {
  try {
    return (await req.json()) as AdminMfaTicketRequest;
  } catch {
    return {};
  }
};

const hashTicket = async (ticket: string) => {
  const bytes = new TextEncoder().encode(ticket);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
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

    const { data: profile } = await supabaseAdmin
      .from('users')
      .select('role, is_admin')
      .eq('id', authData.user.id)
      .maybeSingle();

    if (!isAdminProfile(profile)) {
      return jsonResponse(req, { success: false, error: 'Acesso negado.' }, 403);
    }

    const body = await readRequestBody(req);
    const action: AdminMfaTicketAction = body.action === 'consume' ? 'consume' : 'validate';
    const rawTicket = String(body.ticket || '').trim();

    if (!rawTicket) {
      return jsonResponse(req, { success: false, error: 'Verificacao invalida.' }, 400);
    }

    const ticketHash = await hashTicket(rawTicket);

    const { data: ticketRow, error: ticketError } = await supabaseAdmin
      .from('admin_mfa_login_tickets')
      .select('id, user_id, expires_at, consumed_at')
      .eq('token_hash', ticketHash)
      .eq('user_id', authData.user.id)
      .maybeSingle();

    if (ticketError) {
      throw ticketError;
    }

    const isExpired =
      !ticketRow?.expires_at || Number.isNaN(Date.parse(String(ticketRow.expires_at))) || Date.parse(String(ticketRow.expires_at)) <= Date.now();

    if (!ticketRow || ticketRow.consumed_at || isExpired) {
      await logSecurityEvent(supabaseAdmin, {
        req,
        attemptedRoute: '/functions/v1/admin-mfa-ticket',
        attemptedAction: action === 'consume' ? 'admin_mfa_ticket_consume_failed' : 'admin_mfa_ticket_validate_failed',
        severity: 'warning',
        reason: 'Ticket de MFA invalido, expirado ou ja utilizado.',
        userId: authData.user.id,
        email: authData.user.email,
      });

      return jsonResponse(req, { success: false, error: 'Verificacao invalida.' }, 403);
    }

    if (action === 'consume') {
      const { error: consumeError } = await supabaseAdmin
        .from('admin_mfa_login_tickets')
        .update({ consumed_at: new Date().toISOString() })
        .eq('id', ticketRow.id);

      if (consumeError) {
        throw consumeError;
      }
    }

    return jsonResponse(req, {
      success: true,
      action,
      expiresAt: ticketRow.expires_at,
    });
  } catch (error) {
    console.error('[admin-mfa-ticket] unexpected error:', error);
    return jsonResponse(req, { success: false, error: 'Nao foi possivel validar a verificacao.' }, 500);
  }
});
