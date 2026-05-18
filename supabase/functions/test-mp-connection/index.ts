import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.48.1';
import { logSecurityEvent } from '../_shared/security.ts';

interface TestConnectionResponse {
  success: boolean;
  message: string;
  data?: {
    id: number;
    email: string;
    nickname: string;
    country_id: string;
    first_name?: string;
    last_name?: string;
  };
  error?: string;
  details?: string;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, apikey',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const jsonResponse = (body: TestConnectionResponse | Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
      console.error('Supabase env vars ausentes');
      return jsonResponse(
        {
          success: false,
          error: 'Configuracao incompleta do Supabase',
          details: 'Missing SUPABASE_URL, SUPABASE_ANON_KEY or SUPABASE_SERVICE_ROLE_KEY',
          message: 'Nao foi possivel inicializar a funcao.',
        },
        500
      );
    }

    const authHeader =
      req.headers.get('Authorization') || req.headers.get('authorization') || '';

    if (!authHeader.startsWith('Bearer ')) {
      console.error('Authorization header ausente ou invalido');
      const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);
      await logSecurityEvent(supabaseAdmin, {
        req,
        attemptedRoute: '/functions/v1/test-mp-connection',
        attemptedAction: 'test_mp_connection_missing_bearer',
        reason: 'Authorization header ausente ou sem Bearer token.',
      });
      return jsonResponse(
        {
          success: false,
          error: 'Unauthorized - No bearer token provided',
          details: 'Expected Authorization: Bearer <JWT>',
          message: 'Token JWT nao foi enviado na requisicao.',
        },
        401
      );
    }

    const token = authHeader.slice('Bearer '.length).trim();
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);
    const authClient = createClient(supabaseUrl, supabaseAnonKey);

    const anonAuthResult = await authClient.auth.getUser(token);

    let user = anonAuthResult.data.user;
    let authValidationSource: 'anon' | 'service_role' = 'anon';
    let authError = anonAuthResult.error;

    if (authError || !user) {
      const serviceAuthResult = await supabaseAdmin.auth.getUser(token);

      if (!serviceAuthResult.error && serviceAuthResult.data.user) {
        user = serviceAuthResult.data.user;
        authError = null;
        authValidationSource = 'service_role';
      } else {
        authError = serviceAuthResult.error ?? authError;
      }
    }

    if (authError) {
      console.error('Erro ao validar JWT:', authError);
      await logSecurityEvent(supabaseAdmin, {
        req,
        attemptedRoute: '/functions/v1/test-mp-connection',
        attemptedAction: 'test_mp_connection_invalid_jwt',
        reason: authError.message,
      });
      return jsonResponse(
        {
          success: false,
          error: 'Unauthorized - Invalid JWT',
          details: authError.message,
          message: 'Falha ao validar o token do usuario.',
        },
        401
      );
    }

    if (!user) {
      console.error('Nenhum usuario encontrado no JWT');
      await logSecurityEvent(supabaseAdmin, {
        req,
        attemptedRoute: '/functions/v1/test-mp-connection',
        attemptedAction: 'test_mp_connection_user_missing',
        reason: 'JWT validado sem usuário associado.',
      });
      return jsonResponse(
        {
          success: false,
          error: 'Unauthorized - No user found in JWT',
          details: 'supabase.auth.getUser(token) returned null user',
          message: 'O token foi recebido, mas nao foi associado a um usuario valido.',
        },
        401
      );
    }

    const roleFromMetadata =
      typeof user.app_metadata?.role === 'string' ? user.app_metadata.role : null;

    const { data: userProfile, error: profileError } = await supabaseAdmin
      .from('users')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();

    const isAdmin =
      roleFromMetadata === 'admin' || (userProfile?.role ?? null) === 'admin';

    if (profileError) {
      console.error('Erro ao consultar public.users:', profileError);
    }

    if (!isAdmin) {
      await logSecurityEvent(supabaseAdmin, {
        req,
        attemptedRoute: '/functions/v1/test-mp-connection',
        attemptedAction: 'test_mp_connection_forbidden',
        userId: user.id,
        email: user.email ?? null,
        reason: `Usuario sem role admin tentou testar a conexão do Mercado Pago. role=${userProfile?.role ?? roleFromMetadata ?? 'null'}`,
      });
      return jsonResponse(
        {
          success: false,
          error: 'Forbidden - Admin access required',
          details: `app_metadata.role=${roleFromMetadata ?? 'null'}, public.users.role=${userProfile?.role ?? 'null'}`,
          message: 'O usuario autenticado nao possui permissao de administrador.',
        },
        403
      );
    }

    const { data: credentials, error: credentialsError } = await supabaseAdmin
      .from('payment_settings')
      .select('mp_access_token, is_production')
      .eq('id', '00000000-0000-0000-0000-000000000005')
      .single();

    if (credentialsError || !credentials) {
      console.error('Erro ao buscar payment_settings:', credentialsError);
      return jsonResponse(
        {
          success: false,
          error: 'Credenciais do Mercado Pago nao configuradas',
          details: credentialsError?.message || 'payment_settings not found',
          message: 'Nao foi possivel localizar as credenciais do Mercado Pago.',
        },
        500
      );
    }

    if (!credentials.mp_access_token) {
      return jsonResponse(
        {
          success: false,
          error: 'Access Token nao configurado',
          details: 'payment_settings.mp_access_token is null',
          message: 'Configure o access token do Mercado Pago antes de testar.',
        },
        400
      );
    }

    const mpResponse = await fetch('https://api.mercadolibre.com/users/me', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${credentials.mp_access_token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!mpResponse.ok) {
      const errorData = await mpResponse.json().catch(() => ({}));

      console.error('Mercado Pago API error:', {
        status: mpResponse.status,
        statusText: mpResponse.statusText,
        error: errorData,
      });

      let errorMessage = 'Erro ao conectar com Mercado Pago';

      if (mpResponse.status === 401) {
        errorMessage = 'Access Token invalido ou expirado';
      } else if (mpResponse.status === 403) {
        errorMessage = 'Access Token sem permissoes necessarias';
      } else if (mpResponse.status >= 500) {
        errorMessage = 'Mercado Pago esta temporariamente indisponivel';
      }

      await supabaseAdmin.from('admin_audit_logs').insert({
        admin_id: user.id,
        action: 'MP_CONNECTION_TEST_FAILED',
        resource_type: 'PAYMENT_SETTINGS',
        resource_id: '00000000-0000-0000-0000-000000000005',
        new_value: {
          status: mpResponse.status,
          is_production: credentials.is_production,
        },
        reason: errorMessage,
      });

      return jsonResponse({
        success: false,
        error: errorMessage,
        details: `Mercado Pago responded with ${mpResponse.status} on /users/me`,
        message: `Erro ${mpResponse.status}: ${mpResponse.statusText}`,
      });
    }

    const mpData = await mpResponse.json();

    await supabaseAdmin.from('admin_audit_logs').insert({
      admin_id: user.id,
      action: 'MP_CONNECTION_TEST_SUCCESS',
      resource_type: 'PAYMENT_SETTINGS',
      resource_id: '00000000-0000-0000-0000-000000000005',
      new_value: {
        mp_user_id: mpData.id,
        email: mpData.email,
        is_production: credentials.is_production,
      },
      reason: 'Teste de conexao com Mercado Pago executado com sucesso',
    });

    const response: TestConnectionResponse = {
      success: true,
      message: `Conexao estabelecida com sucesso! Conta: ${mpData.email || mpData.nickname || mpData.id}`,
      data: {
        id: mpData.id,
        email: mpData.email,
        nickname: mpData.nickname,
        country_id: mpData.site_id,
        first_name: mpData.first_name,
        last_name: mpData.last_name,
      },
    };

    return jsonResponse(response);
  } catch (error) {
    console.error('Edge function error:', error);

    return jsonResponse(
      {
        success: false,
        error: 'Erro interno ao testar conexao',
        details: error instanceof Error ? error.message : 'Unknown error',
        message: 'A funcao falhou antes de concluir o teste.',
      },
      500
    );
  }
});
