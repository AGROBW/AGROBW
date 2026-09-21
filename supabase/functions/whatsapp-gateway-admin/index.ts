import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.48.1';
import { getCorsHeaders, handleCorsPreflightBrowser } from '../_shared/cors.ts';
import { extractBearerToken, isAdminAal2Profile, logSecurityEvent } from '../_shared/security.ts';
import {
  parseWhatsappGatewayAdminAction,
} from '../_shared/whatsappGateway.ts';
import { dispatchWhatsappGatewayRequest } from '../_shared/whatsappGatewayDispatch.ts';

const MAX_REQUEST_BYTES = 2048;

const jsonResponse = (req: Request, body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
  });

serve(async (req) => {
  if (req.method === 'OPTIONS') return handleCorsPreflightBrowser(req);
  if (req.method !== 'POST') {
    return jsonResponse(req, { success: false, error: 'Metodo nao permitido.' }, 405);
  }

  const contentLength = Number(req.headers.get('content-length') || 0);
  if (contentLength > MAX_REQUEST_BYTES) {
    return jsonResponse(req, { success: false, error: 'Requisicao excede o limite permitido.' }, 413);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return jsonResponse(req, { success: false, error: 'Configuracao indisponivel.' }, 500);
  }

  const token = extractBearerToken(req);
  if (!token) return jsonResponse(req, { success: false, error: 'Nao autorizado.' }, 401);

  const supabaseAuth = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let adminUser: { id: string; email?: string } | null = null;
  let adminAuditLogId: string | null = null;
  let auditOperation: string | null = null;
  let auditRequestId: string | null = null;
  try {
    const { data: authData, error: authError } = await supabaseAuth.auth.getUser(token);
    if (authError || !authData.user) {
      return jsonResponse(req, { success: false, error: 'Nao autorizado.' }, 401);
    }
    adminUser = { id: authData.user.id, email: authData.user.email };

    const { data: profile, error: profileError } = await supabaseAdmin
      .from('users')
      .select('role, is_admin, name, email')
      .eq('id', authData.user.id)
      .maybeSingle();
    if (profileError || !isAdminAal2Profile(profile, token)) {
      await logSecurityEvent(supabaseAdmin, {
        req,
        attemptedRoute: '/functions/v1/whatsapp-gateway-admin',
        attemptedAction: 'whatsapp_gateway_admin_access_denied',
        reason: 'A operacao exige administrador autenticado com AAL2.',
        userId: authData.user.id,
        email: authData.user.email,
      });
      return jsonResponse(req, { success: false, error: 'Acesso administrativo com MFA obrigatorio.' }, 403);
    }

    const rawBody = await req.text();
    if (new TextEncoder().encode(rawBody).byteLength > MAX_REQUEST_BYTES) {
      return jsonResponse(req, { success: false, error: 'Requisicao excede o limite permitido.' }, 413);
    }
    let body: { action?: unknown } | null = null;
    try {
      body = JSON.parse(rawBody) as { action?: unknown };
    } catch {
      return jsonResponse(req, { success: false, error: 'Corpo da requisicao invalido.' }, 400);
    }
    const action = parseWhatsappGatewayAdminAction(body?.action);
    if (!action) return jsonResponse(req, { success: false, error: 'Operacao invalida.' }, 400);

    const maxRequests = action === 'test_message' ? 3 : 10;
    const windowSeconds = action === 'test_message' ? 300 : 60;
    const { data: rateLimit, error: rateLimitError } = await supabaseAdmin.rpc('check_rate_limit', {
      p_user_id: authData.user.id,
      p_action: `whatsapp-gateway-${action}`,
      p_max_requests: maxRequests,
      p_window_seconds: windowSeconds,
    });
    if (rateLimitError) {
      console.error('[whatsapp-gateway-admin] rate limit unavailable', rateLimitError.code);
      return jsonResponse(req, { success: false, error: 'Protecao de frequencia indisponivel.' }, 503);
    }
    const rateLimitResult = Array.isArray(rateLimit) ? rateLimit[0] : rateLimit;
    if (rateLimitResult?.allowed === false) {
      return jsonResponse(req, { success: false, error: 'Limite de testes atingido. Aguarde e tente novamente.' }, 429);
    }

    const { data: settings, error: settingsError } = await supabaseAdmin
      .from('whatsapp_gateway_settings')
      .select('base_url, send_path, health_path, auth_type, auth_secret, default_recipient_phone')
      .eq('id', '00000000-0000-0000-0000-000000000020')
      .maybeSingle();
    if (settingsError || !settings) {
      return jsonResponse(req, { success: false, error: 'Configuracao da Central WhatsApp nao encontrada.' }, 409);
    }
    if (!settings.base_url || !settings.auth_secret) {
      return jsonResponse(req, { success: false, error: 'Salve a URL e a credencial antes de testar.' }, 409);
    }
    if (action === 'test_message' && !settings.default_recipient_phone) {
      return jsonResponse(req, { success: false, error: 'Salve o numero administrativo antes de enviar o teste.' }, 409);
    }

    const requestId = crypto.randomUUID();
    auditOperation = action;
    auditRequestId = requestId;
    const { data: auditLog, error: auditError } = await supabaseAdmin
      .from('admin_audit_logs')
      .insert({
        admin_id: authData.user.id,
        admin_email: authData.user.email || profile.email || 'email-indisponivel',
        admin_name: profile.name || authData.user.email || 'Administrador',
        action: 'TEST_WHATSAPP_GATEWAY',
        resource_type: 'integration_settings',
        resource_id: '00000000-0000-0000-0000-000000000020',
        new_value: {
          operation: action,
          request_id: requestId,
          status: 'started',
        },
        reason: action === 'health'
          ? 'Verificacao server-side de saude da Central WhatsApp'
          : 'Mensagem server-side de teste da Central WhatsApp',
        user_agent: req.headers.get('user-agent'),
      })
      .select('id')
      .single();
    if (auditError || !auditLog?.id) {
      console.error('[whatsapp-gateway-admin] audit unavailable', auditError?.code);
      return jsonResponse(req, { success: false, error: 'Auditoria administrativa indisponivel.' }, 503);
    }
    adminAuditLogId = auditLog.id;

    const dispatchResult = await dispatchWhatsappGatewayRequest(
      {
        baseUrl: settings.base_url,
        sendPath: settings.send_path,
        healthPath: settings.health_path,
        authType: settings.auth_type,
        authSecret: settings.auth_secret,
      },
      action === 'health'
        ? { kind: 'health', requestId }
        : {
            kind: 'text',
            requestId,
            idempotencyKey: requestId,
            recipientPhone: settings.default_recipient_phone,
            message: 'Teste de integracao da Central WhatsApp BW Agro. Nenhuma acao e necessaria.',
            source: 'bwagro_admin_test',
            eventType: 'message_send',
          },
    );

    if (!dispatchResult.ok) {
      await supabaseAdmin
        .from('admin_audit_logs')
        .update({
          new_value: {
            operation: action,
            request_id: requestId,
            status: 'rejected',
            http_status: dispatchResult.httpStatus,
          },
        })
        .eq('id', adminAuditLogId);
      console.warn('[whatsapp-gateway-admin] upstream rejected request', {
        action,
        requestId,
        status: dispatchResult.httpStatus,
      });
      return jsonResponse(req, {
        success: false,
        action,
        requestId,
        httpStatus: dispatchResult.httpStatus,
        error: 'O gateway recusou a solicitacao.',
      }, 502);
    }

    await supabaseAdmin
      .from('admin_audit_logs')
      .update({
        new_value: {
          operation: action,
          request_id: requestId,
          status: 'accepted',
          http_status: dispatchResult.httpStatus,
        },
      })
      .eq('id', adminAuditLogId);

    return jsonResponse(req, {
      success: true,
      action,
      requestId,
      httpStatus: dispatchResult.httpStatus,
      checkedAt: new Date().toISOString(),
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'UNKNOWN_ERROR';
    console.error('[whatsapp-gateway-admin] request failed', reason);
    if (adminAuditLogId) {
      await supabaseAdmin
        .from('admin_audit_logs')
        .update({
          new_value: {
            operation: auditOperation,
            request_id: auditRequestId,
            status: 'failed',
            error_code: reason.slice(0, 80),
          },
        })
        .eq('id', adminAuditLogId);
    }
    if (adminUser) {
      await logSecurityEvent(supabaseAdmin, {
        req,
        attemptedRoute: '/functions/v1/whatsapp-gateway-admin',
        attemptedAction: 'whatsapp_gateway_admin_request_failed',
        severity: 'warning',
        reason: reason.slice(0, 160),
        userId: adminUser.id,
        email: adminUser.email,
      });
    }
    const isNetworkSafetyBlock = reason === 'GATEWAY_PRIVATE_ADDRESS_BLOCKED'
      || reason === 'UNSAFE_GATEWAY_BASE_URL'
      || reason === 'UNSAFE_GATEWAY_PATH'
      || reason === 'GATEWAY_HOST_NOT_ALLOWED';
    return jsonResponse(req, {
      success: false,
      error: isNetworkSafetyBlock
        ? 'Destino do gateway recusado pela politica de seguranca.'
        : 'Nao foi possivel acessar o gateway externo.',
    }, isNetworkSafetyBlock ? 400 : 502);
  }
});
