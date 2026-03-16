import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.48.1';

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

  console.log('=== test-mp-connection: nova requisicao ===');
  console.log('Method:', req.method);
  console.log('Headers:', Object.fromEntries(req.headers.entries()));

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

    console.log('Authorization header recebido:', authHeader ? 'presente' : 'ausente');

    if (!authHeader.startsWith('Bearer ')) {
      console.error('Authorization header ausente ou invalido');
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
    console.log('Token extraido (50 chars):', `${token.slice(0, 50)}...`);
    console.log('Token length:', token.length);

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);
    const authClient = createClient(supabaseUrl, supabaseAnonKey);

    const anonAuthResult = await authClient.auth.getUser(token);

    console.log('Resultado auth.getUser(token) com ANON_KEY:', {
      hasUser: Boolean(anonAuthResult.data.user),
      authError: anonAuthResult.error?.message ?? null,
    });

    let user = anonAuthResult.data.user;
    let authValidationSource: 'anon' | 'service_role' = 'anon';
    let authError = anonAuthResult.error;

    if (authError || !user) {
      console.warn('Falha ao validar JWT com ANON_KEY. Tentando novamente com SERVICE_ROLE_KEY...');

      const serviceAuthResult = await supabaseAdmin.auth.getUser(token);

      console.log('Resultado auth.getUser(token) com SERVICE_ROLE_KEY:', {
        hasUser: Boolean(serviceAuthResult.data.user),
        authError: serviceAuthResult.error?.message ?? null,
      });

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

    console.log('Usuario autenticado:', {
      id: user.id,
      email: user.email,
      roleFromMetadata,
      authValidationSource,
    });

    const { data: userProfile, error: profileError } = await supabaseAdmin
      .from('users')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();

    console.log('Resultado lookup public.users:', {
      hasProfile: Boolean(userProfile),
      roleFromTable: userProfile?.role ?? null,
      profileError: profileError?.message ?? null,
    });

    const isAdmin =
      roleFromMetadata === 'admin' || (userProfile?.role ?? null) === 'admin';

    console.log('Validacao admin:', {
      roleFromMetadata,
      roleFromTable: userProfile?.role ?? null,
      isAdmin,
    });

    if (profileError) {
      console.error('Erro ao consultar public.users:', profileError);
    }

    if (!isAdmin) {
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

    console.log('Testing Mercado Pago connection...');

    const mpResponse = await fetch('https://api.mercadopago.com/v1/me', {
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
        details: `Mercado Pago responded with ${mpResponse.status}`,
        message: `Erro ${mpResponse.status}: ${mpResponse.statusText}`,
      });
    }

    const mpData = await mpResponse.json();

    console.log('Mercado Pago connection successful:', {
      id: mpData.id,
      email: mpData.email,
      country: mpData.site_id,
    });

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
