import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.48.1';
import { getCorsHeaders, handleCorsPreflightBrowser } from '../_shared/cors.ts';
import {
  extractAuthenticatorAssuranceLevel,
  isAdminProfile,
  logSecurityEvent,
} from '../_shared/security.ts';

type CaptchaProvider = 'turnstile' | 'hcaptcha' | 'mock';

interface AdminLoginRequest {
  email?: string;
  password?: string;
  captchaToken?: string | null;
  captchaProvider?: CaptchaProvider | null;
}

interface AdminLoginRateLimitStatus {
  attempts_used: number;
  remaining_attempts: number;
  is_blocked: boolean;
  blocked_until: string | null;
  time_until_unblock_seconds: number;
  should_show_captcha: boolean;
  server_now: string;
}

interface PendingAdminMfaTicket {
  token: string;
  expiresAt: string;
}

const defaultRateLimitStatus = (): AdminLoginRateLimitStatus => ({
  attempts_used: 0,
  remaining_attempts: 5,
  is_blocked: false,
  blocked_until: null,
  time_until_unblock_seconds: 0,
  should_show_captcha: false,
  server_now: new Date().toISOString(),
});

const bytesToHex = (bytes: Uint8Array) =>
  Array.from(bytes)
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');

const bytesToBase64Url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');

const hashTicket = async (value: string) => {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return bytesToHex(new Uint8Array(digest));
};

const issuePendingAdminMfaTicket = async (
  supabaseAdmin: any,
  userId: string,
  req: Request,
): Promise<PendingAdminMfaTicket> => {
  const now = Date.now();
  const rawBytes = crypto.getRandomValues(new Uint8Array(32));
  const token = bytesToBase64Url(rawBytes);
  const tokenHash = await hashTicket(token);
  const expiresAt = new Date(now + 15 * 60 * 1000).toISOString();

  await supabaseAdmin
    .from('admin_mfa_login_tickets')
    .delete()
    .eq('user_id', userId);

  const { error: insertError } = await supabaseAdmin
    .from('admin_mfa_login_tickets')
    .insert({
      user_id: userId,
      token_hash: tokenHash,
      expires_at: expiresAt,
      user_agent: req.headers.get('user-agent'),
      ip_address: getClientIp(req),
    });

  if (insertError) {
    throw new Error(insertError.message || 'Falha ao iniciar a verificacao em duas etapas.');
  }

  return { token, expiresAt };
};

const jsonResponse = (req: Request, body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...getCorsHeaders(req),
      'Content-Type': 'application/json',
    },
  });

const normalizeEmail = (value?: string | null) => String(value || '').trim().toLowerCase();

const getClientIp = (req: Request): string | null =>
  req.headers.get('cf-connecting-ip') ||
  req.headers.get('x-real-ip') ||
  req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
  null;

const isLocalSupabaseRuntime = () => {
  const supabaseUrl = String(Deno.env.get('SUPABASE_URL') || '').trim().toLowerCase();
  return /localhost|127\.0\.0\.1|0\.0\.0\.0/.test(supabaseUrl);
};

const readRequestBody = async (req: Request): Promise<AdminLoginRequest> => {
  try {
    return (await req.json()) as AdminLoginRequest;
  } catch {
    return {};
  }
};

const getRateLimitStatus = async (
  supabaseAdmin: any,
  email: string,
): Promise<AdminLoginRateLimitStatus> => {
  if (!email) {
    return defaultRateLimitStatus();
  }

  const { data, error } = await supabaseAdmin.rpc('get_admin_login_rate_limit_status', {
    p_email: email,
  });

  if (error) {
    throw new Error(error.message || 'Falha ao validar limite de tentativas.');
  }

  const status = Array.isArray(data) ? data[0] : data;
  return (status as AdminLoginRateLimitStatus | null) || defaultRateLimitStatus();
};

const registerLoginAttempt = async (
  supabaseAdmin: any,
  email: string,
  success: boolean,
  reason: string,
  userAgent: string | null,
): Promise<AdminLoginRateLimitStatus> => {
  if (!email) {
    return defaultRateLimitStatus();
  }

  const { data, error } = await supabaseAdmin.rpc('register_admin_login_attempt', {
    p_email: email,
    p_success: success,
    p_reason: reason,
    p_user_agent: userAgent,
  });

  if (error) {
    throw new Error(error.message || 'Falha ao registrar tentativa de login.');
  }

  const status = Array.isArray(data) ? data[0] : data;
  return (status as AdminLoginRateLimitStatus | null) || defaultRateLimitStatus();
};

const verifyTurnstileCaptcha = async (token: string, secret: string, remoteIp: string | null) => {
  const form = new URLSearchParams();
  form.set('secret', secret);
  form.set('response', token);
  if (remoteIp) {
    form.set('remoteip', remoteIp);
  }

  const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: form.toString(),
  });

  const payload = await response.json().catch(() => null);
  return {
    ok: Boolean(payload?.success),
    details: payload,
  };
};

const verifyHcaptcha = async (token: string, secret: string, remoteIp: string | null) => {
  const form = new URLSearchParams();
  form.set('secret', secret);
  form.set('response', token);
  if (remoteIp) {
    form.set('remoteip', remoteIp);
  }

  const response = await fetch('https://hcaptcha.com/siteverify', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: form.toString(),
  });

  const payload = await response.json().catch(() => null);
  return {
    ok: Boolean(payload?.success),
    details: payload,
  };
};

const verifyCaptcha = async (
  req: Request,
  captchaProvider: CaptchaProvider | null | undefined,
  captchaToken: string | null | undefined,
): Promise<{ ok: boolean; reason?: string }> => {
  const normalizedToken = String(captchaToken || '').trim();
  const provider = captchaProvider || null;

  if (!normalizedToken || !provider) {
    return { ok: false, reason: 'missing' };
  }

  if (provider === 'mock') {
    const allowDevMock =
      isLocalSupabaseRuntime() &&
      String(Deno.env.get('ALLOW_DEV_MOCK_CAPTCHA') || '').toLowerCase() === 'true';

    if (allowDevMock && normalizedToken === 'mock-token-dev') {
      return { ok: true };
    }

    return { ok: false, reason: 'mock_not_allowed' };
  }

  const remoteIp = getClientIp(req);

  if (provider === 'turnstile') {
    const secret = Deno.env.get('TURNSTILE_SECRET_KEY');
    if (!secret) {
      return { ok: false, reason: 'secret_missing' };
    }

    const verification = await verifyTurnstileCaptcha(normalizedToken, secret, remoteIp);
    return verification.ok ? { ok: true } : { ok: false, reason: 'invalid' };
  }

  const secret = Deno.env.get('HCAPTCHA_SECRET_KEY');
  if (!secret) {
    return { ok: false, reason: 'secret_missing' };
  }

  const verification = await verifyHcaptcha(normalizedToken, secret, remoteIp);
  return verification.ok ? { ok: true } : { ok: false, reason: 'invalid' };
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCorsPreflightBrowser(req);
  }

  if (req.method !== 'POST') {
    return jsonResponse(req, { success: false, errorCode: 'METHOD_NOT_ALLOWED', error: 'Metodo nao permitido.' }, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
    return jsonResponse(
      req,
      {
        success: false,
        errorCode: 'SERVER_MISCONFIGURED',
        error: 'Nao foi possivel validar o acesso agora.',
      },
      500,
    );
  }

  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const body = await readRequestBody(req);
  const email = normalizeEmail(body.email);
  const password = String(body.password || '');
  const userAgent = req.headers.get('user-agent');

  if (!email || !password) {
    return jsonResponse(
      req,
      {
        success: false,
        errorCode: 'INVALID_INPUT',
        error: 'Nao foi possivel validar o acesso. Confira seus dados e tente novamente.',
      },
      400,
    );
  }

  try {
    const rateLimitStatus = await getRateLimitStatus(supabaseAdmin, email);

    if (rateLimitStatus.is_blocked || rateLimitStatus.remaining_attempts <= 0) {
      await logSecurityEvent(supabaseAdmin, {
        req,
        attemptedRoute: '/functions/v1/admin-login',
        attemptedAction: 'admin_login_blocked',
        severity: 'blocked',
        reason: 'Tentativa bloqueada por limite de tentativas.',
        email,
        metadata: {
          rateLimitStatus,
        },
      });

      return jsonResponse(
        req,
        {
          success: false,
          errorCode: 'RATE_LIMITED',
          error: 'Bloqueado por seguranca. Tente novamente mais tarde.',
          rateLimitStatus,
        },
        429,
      );
    }

    if (rateLimitStatus.should_show_captcha) {
      if (!String(body.captchaToken || '').trim()) {
        return jsonResponse(
          req,
          {
            success: false,
            errorCode: 'CAPTCHA_REQUIRED',
            error: 'Complete a verificacao de seguranca para continuar.',
            rateLimitStatus,
          },
          400,
        );
      }

      const captchaCheck = await verifyCaptcha(req, body.captchaProvider || null, body.captchaToken || null);
      if (!captchaCheck.ok) {
        await logSecurityEvent(supabaseAdmin, {
          req,
          attemptedRoute: '/functions/v1/admin-login',
          attemptedAction: 'admin_login_captcha_failed',
          severity: 'warning',
          reason: `Captcha invalido ou indisponivel: ${captchaCheck.reason || 'unknown'}`,
          email,
        });

        return jsonResponse(
          req,
          {
            success: false,
            errorCode: captchaCheck.reason === 'secret_missing' ? 'CAPTCHA_UNAVAILABLE' : 'CAPTCHA_INVALID',
            error: 'Nao foi possivel validar a verificacao de seguranca. Tente novamente.',
            rateLimitStatus,
          },
          400,
        );
      }
    }

    const { data: authData, error: authError } = await supabaseAuth.auth.signInWithPassword({
      email,
      password,
    });

    if (authError || !authData.user || !authData.session) {
      const updatedStatus = await registerLoginAttempt(
        supabaseAdmin,
        email,
        false,
        'Falha na autenticacao por e-mail e senha.',
        userAgent,
      );

      await logSecurityEvent(supabaseAdmin, {
        req,
        attemptedRoute: '/functions/v1/admin-login',
        attemptedAction: 'admin_login_invalid_credentials',
        severity: 'warning',
        reason: authError?.message || 'Credenciais invalidas.',
        email,
        metadata: {
          rateLimitStatus: updatedStatus,
        },
      });

      return jsonResponse(
        req,
        {
          success: false,
          errorCode: 'INVALID_CREDENTIALS',
          error: 'Nao foi possivel validar o acesso. Confira seus dados e tente novamente.',
          rateLimitStatus: updatedStatus,
        },
        401,
      );
    }

    const { data: userData, error: userDataError } = await supabaseAdmin
      .from('users')
      .select('id, role, is_admin, is_suspended')
      .eq('id', authData.user.id)
      .maybeSingle();

    if (userDataError || !userData || userData.is_suspended || !isAdminProfile(userData)) {
      const updatedStatus = await registerLoginAttempt(
        supabaseAdmin,
        email,
        false,
        userData?.is_suspended ? 'Conta suspensa tentou acessar o painel.' : 'Conta sem permissao tentou acessar o painel.',
        userAgent,
      );

      await logSecurityEvent(supabaseAdmin, {
        req,
        attemptedRoute: '/functions/v1/admin-login',
        attemptedAction: 'admin_login_non_admin_or_suspended',
        severity: 'critical',
        reason: userData?.is_suspended
          ? 'Conta suspensa tentou acessar o painel.'
          : 'Conta sem permissao tentou acessar o painel.',
        email,
        userId: authData.user.id,
        metadata: {
          rateLimitStatus: updatedStatus,
        },
      });

      return jsonResponse(
        req,
        {
          success: false,
          errorCode: 'INVALID_CREDENTIALS',
          error: 'Nao foi possivel validar o acesso. Confira seus dados e tente novamente.',
          rateLimitStatus: updatedStatus,
        },
        401,
      );
    }

    const currentAal = extractAuthenticatorAssuranceLevel(authData.session.access_token) || 'aal1';
    const pendingMfaTicket =
      currentAal === 'aal2'
        ? null
        : await issuePendingAdminMfaTicket(supabaseAdmin, authData.user.id, req);
    const nextRateLimitStatus =
      currentAal === 'aal2'
        ? await registerLoginAttempt(
            supabaseAdmin,
            email,
            true,
            'Login administrativo concluido com MFA valido.',
            userAgent,
          )
        : rateLimitStatus;

    return jsonResponse(req, {
      success: true,
      session: {
        accessToken: authData.session.access_token,
        refreshToken: authData.session.refresh_token,
        expiresAt: authData.session.expires_at,
        expiresIn: authData.session.expires_in,
        tokenType: authData.session.token_type,
      },
      admin: {
        userId: authData.user.id,
        currentLevel: currentAal,
        requiresMfa: currentAal !== 'aal2',
      },
      pendingMfaTicket,
      rateLimitStatus: nextRateLimitStatus,
    });
  } catch (error) {
    console.error('[admin-login] unexpected error:', error);

    return jsonResponse(
      req,
      {
        success: false,
        errorCode: 'SERVER_ERROR',
        error: 'Nao foi possivel concluir o acesso agora. Tente novamente em instantes.',
      },
      500,
    );
  }
});
