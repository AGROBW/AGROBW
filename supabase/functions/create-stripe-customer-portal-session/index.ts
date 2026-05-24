import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.48.1';
import { logSecurityEvent } from '../_shared/security.ts';

interface PortalRequest {
  returnPath?: string;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, apikey',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const jsonResponse = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });

const stripeRequest = async (
  secretKey: string,
  path: string,
  body: URLSearchParams,
) => {
  const response = await fetch(`https://api.stripe.com${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });

  const payload = await response.json().catch(() => null);

  return {
    ok: response.ok,
    status: response.status,
    payload,
  };
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
    return jsonResponse({ success: false, error: 'Configuracao incompleta do Supabase' }, 500);
  }

  const authHeader = req.headers.get('Authorization') || req.headers.get('authorization') || '';
  const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey);
  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);

  if (!authHeader.startsWith('Bearer ')) {
    await logSecurityEvent(supabaseAdmin, {
      req,
      attemptedRoute: '/functions/v1/create-stripe-customer-portal-session',
      attemptedAction: 'stripe_portal_missing_bearer',
      reason: 'Authorization header ausente ou sem Bearer token.',
    });
    return jsonResponse({ success: false, error: 'Unauthorized' }, 401);
  }

  const token = authHeader.slice('Bearer '.length).trim();
  const {
    data: { user },
    error: authError,
  } = await supabaseAuth.auth.getUser(token);

  if (authError || !user) {
    await logSecurityEvent(supabaseAdmin, {
      req,
      attemptedRoute: '/functions/v1/create-stripe-customer-portal-session',
      attemptedAction: 'stripe_portal_invalid_jwt',
      reason: authError?.message || 'JWT invalido.',
    });
    return jsonResponse({ success: false, error: 'Invalid token', details: authError?.message || 'User not found' }, 401);
  }

  try {
    const body: PortalRequest = await req.json().catch(() => ({}));

    const { data: settings, error: settingsError } = await supabaseAdmin
      .from('payment_settings')
      .select('stripe_secret_key')
      .eq('id', '00000000-0000-0000-0000-000000000005')
      .single();

    if (settingsError || !settings?.stripe_secret_key) {
      return jsonResponse(
        {
          success: false,
          error: 'Stripe sem secret key configurada.',
          details: settingsError?.message || 'payment_settings.stripe_secret_key vazio',
        },
        400
      );
    }

    const { data: subscriptionContext } = await supabaseAdmin
      .from('user_subscriptions')
      .select('provider_customer_id, provider_subscription_id, provider, status')
      .eq('user_id', user.id)
      .eq('provider', 'stripe')
      .not('provider_customer_id', 'is', null)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const customerId = String(subscriptionContext?.provider_customer_id || '').trim();

    if (!customerId) {
      return jsonResponse(
        {
          success: false,
          error: 'Nenhum cliente Stripe vinculado a esta conta ainda.',
          details: 'A primeira assinatura Stripe precisa ser confirmada antes de abrir o portal.',
        },
        400
      );
    }

    const siteUrl = Deno.env.get('SITE_URL') || 'https://bwagro.com.br';
    const returnPath = String(body.returnPath || '/minha-conta/financeiro');
    const returnUrl = `${siteUrl}${returnPath.startsWith('/') ? returnPath : `/${returnPath}`}`;

    const params = new URLSearchParams();
    params.set('customer', customerId);
    params.set('return_url', returnUrl);

    const stripeResult = await stripeRequest(settings.stripe_secret_key, '/v1/billing_portal/sessions', params);

    if (!stripeResult.ok || !stripeResult.payload?.url) {
      return jsonResponse(
        {
          success: false,
          error: 'Falha ao criar sessao do portal Stripe.',
          details: stripeResult.payload || `HTTP ${stripeResult.status}`,
        },
        500
      );
    }

    return jsonResponse({
      success: true,
      provider: 'stripe',
      url: stripeResult.payload.url,
      customerId,
    });
  } catch (error) {
    console.error('Stripe portal session error:', error);
    return jsonResponse(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      500
    );
  }
});
