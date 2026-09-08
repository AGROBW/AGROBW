import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.48.1';
import { getCorsHeaders, handleCorsPreflightBrowser } from '../_shared/cors.ts';
import { extractBearerToken, isAdminAal2Profile, isAdminProfile, logSecurityEvent } from '../_shared/security.ts';

type AllowedAdminSecurityAction =
  | 'admin_mfa_enrollment_failed'
  | 'admin_mfa_challenge_failed'
  | 'admin_mfa_verify_failed'
  | 'admin_mfa_duplicate_factor_detected'
  // Login administrativo concluido.
  //
  // Antes o navegador chamava `register_admin_login_attempt` direto, com
  // e-mail, sucesso e motivo livres. Nao era so forjar auditoria: essa
  // RPC alimenta o RATE LIMIT do login administrativo — registrar
  // `success = true` para um e-mail alheio reabre a janela de tentativas
  // daquele administrador. Era bypass de rate limit, nao so registro
  // falso.
  //
  // Aqui o e-mail vem do token ja verificado, o sucesso e fixo, e a acao
  // exige AAL2: quem afirma "conclui o MFA" precisa provar o MFA.
  | 'admin_login_completed';

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
  'admin_login_completed',
]);

// Acoes que exigem AAL2. `admin_login_completed` AFIRMA que o MFA foi
// concluido — nao basta ser admin, nem confiar que a chamada veio da tela
// de MFA. O token precisa carregar aal2.
const ACTIONS_REQUIRING_AAL2 = new Set<AllowedAdminSecurityAction>([
  'admin_login_completed',
]);

// Idempotencia por SESSAO, garantida no banco.
//
// A versao anterior fazia check-then-insert aqui: SELECT em
// `security_events` e, se nao achasse, chamava a RPC. Duas requisicoes
// simultaneas passam as duas pelo SELECT antes de qualquer INSERT e
// gravam as duas. Nao era garantia, era corrida.
//
// Agora a chave e o `session_id` do JWT ja verificado, e a unicidade e
// do banco (PRIMARY KEY em `admin_login_completed_keys`). Com isso:
//   · replay da MESMA sessao ............ converge;
//   · outro login, OUTRA sessao, no mesmo
//     minuto ............................ e registrado, como deve.
// A janela por e-mail confundia as duas coisas.
//
// O TOKEN NUNCA E ARMAZENADO. Guardamos SHA-256 hexadecimal do
// `session_id` — que e um identificador de sessao, nao credencial. O
// hash evita que a tabela vire um indice de sessoes ativas.

/** Le o `session_id` do payload de um JWT JA VERIFICADO por getUser. */
const lerSessionId = (token: string): string | null => {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const normalizado = payload.replace(/-/g, '+').replace(/_/g, '/');
    const json = JSON.parse(atob(normalizado.padEnd(Math.ceil(normalizado.length / 4) * 4, '=')));
    const sid = json?.session_id;
    return typeof sid === 'string' && sid.length > 0 ? sid : null;
  } catch {
    return null;
  }
};

/** SHA-256 hexadecimal, 64 caracteres. */
const sha256Hex = async (valor: string): Promise<string> => {
  const dados = new TextEncoder().encode(valor);
  const digest = await crypto.subtle.digest('SHA-256', dados);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
};

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

    // ---- AAL2 obrigatorio para as acoes que afirmam MFA concluido ----
    if (ACTIONS_REQUIRING_AAL2.has(action) && !isAdminAal2Profile(profile, token)) {
      await logSecurityEvent(supabaseAdmin, {
        req,
        attemptedRoute: '/admin/mfa',
        attemptedAction: 'admin_login_completed_sem_aal2',
        severity: 'critical',
        reason: 'Tentativa de registrar login administrativo concluido com token sem AAL2.',
        userId: authData.user.id,
        email: authData.user.email,
        metadata: {},
      });
      return jsonResponse(req, { success: false, error: 'Acesso negado.' }, 403);
    }

    // ---- login concluido: um caminho proprio ----
    if (action === 'admin_login_completed') {
      const email = String(authData.user.email || '').trim().toLowerCase();
      if (!email) {
        return jsonResponse(req, { success: false, error: 'Sessao sem e-mail.' }, 400);
      }

      const sessionId = lerSessionId(token);
      if (!sessionId) {
        return jsonResponse(req, { success: false, error: 'Sessao sem identificador.' }, 400);
      }
      const sessionHash = await sha256Hex(sessionId);

      // UMA chamada, transacional. A unicidade e do banco: sob duas
      // requisicoes simultaneas da mesma sessao, a segunda BLOQUEIA no
      // indice e volta com 'ja_registrado'. Sem check-then-insert.
      const { data: resultado, error: rpcError } = await supabaseAdmin.rpc(
        'register_admin_login_completed',
        {
          p_session_hash: sessionHash,
          p_user_id: authData.user.id,
          p_email: email,
          p_user_agent: req.headers.get('user-agent'),
        },
      );

      if (rpcError) {
        // NAO bloqueia o login: recusar acesso a um administrador por
        // falha de registro seria pior que a falha. Mas tambem NAO
        // responde sucesso limpo — o cliente precisa saber.
        console.error('[admin-security-event] register_admin_login_completed falhou:', rpcError);
        await logSecurityEvent(supabaseAdmin, {
          req,
          attemptedRoute: '/admin/mfa',
          attemptedAction: 'admin_login_audit_failed',
          severity: 'critical',
          reason: 'Falha ao registrar o login administrativo concluido.',
          userId: authData.user.id,
          email,
          metadata: { erro: String(rpcError.message || rpcError).slice(0, 200) },
        });
        return jsonResponse(
          req,
          { success: true, audit: 'falhou', error: 'Registro de auditoria nao concluido.' },
          207,
        );
      }

      // 'registrado' | 'ja_registrado', decidido pelo banco
      return jsonResponse(req, { success: true, audit: String(resultado ?? 'registrado') });
    }

    // ---- demais acoes: sinais de falha, como antes ----
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
