import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.48.1';

interface PreferenceRequest {
  planId: string;
  billingCycle: 'monthly' | 'yearly';
  userId: string;
}

interface PlanRecord {
  id: string;
  name: string;
  description: string | null;
  monthly_price: number;
  yearly_price: number;
  is_active: boolean;
  button_text: string;
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

const resolveAmount = (plan: PlanRecord, billingCycle: 'monthly' | 'yearly') => {
  const amount = billingCycle === 'yearly' ? plan.yearly_price : plan.monthly_price;
  return Number(amount || 0);
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
      return jsonResponse(
        {
          success: false,
          error: 'Configuracao incompleta do Supabase',
          details: 'Missing SUPABASE_URL, SUPABASE_ANON_KEY or SUPABASE_SERVICE_ROLE_KEY',
        },
        500
      );
    }

    const authHeader = req.headers.get('Authorization') || req.headers.get('authorization') || '';
    if (!authHeader.startsWith('Bearer ')) {
      return jsonResponse(
        {
          success: false,
          error: 'Unauthorized',
          details: 'Expected Authorization: Bearer <JWT>',
        },
        401
      );
    }

    const token = authHeader.slice('Bearer '.length).trim();
    const authClient = createClient(supabaseUrl, supabaseAnonKey);
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);

    const {
      data: { user },
      error: authError,
    } = await authClient.auth.getUser(token);

    if (authError || !user) {
      return jsonResponse(
        {
          success: false,
          error: 'Invalid token',
          details: authError?.message || 'User not found',
        },
        401
      );
    }

    const body: PreferenceRequest = await req.json();
    const { planId, billingCycle, userId } = body;

    if (!planId || !billingCycle || userId !== user.id) {
      return jsonResponse(
        {
          success: false,
          error: 'Invalid request data',
        },
        400
      );
    }

    const { data: plan, error: planError } = await supabaseAdmin
      .from('plans')
      .select('id, name, description, monthly_price, yearly_price, is_active, button_text')
      .eq('id', planId)
      .maybeSingle();

    if (planError || !plan) {
      return jsonResponse(
        {
          success: false,
          error: 'Plano nao encontrado',
          details: planError?.message || 'Plan not found',
        },
        404
      );
    }

    if (!plan.is_active) {
      return jsonResponse(
        {
          success: false,
          error: 'Plano inativo',
        },
        400
      );
    }

    const amount = resolveAmount(plan as PlanRecord, billingCycle);
    if (amount <= 0) {
      return jsonResponse(
        {
          success: false,
          error: 'Plano sem valor valido para checkout',
          details: `billingCycle=${billingCycle}`,
        },
        400
      );
    }

    const { data: credentials, error: credentialsError } = await supabaseAdmin
      .from('payment_settings')
      .select('mp_access_token, is_production')
      .eq('id', '00000000-0000-0000-0000-000000000005')
      .single();

    if (credentialsError || !credentials?.mp_access_token) {
      return jsonResponse(
        {
          success: false,
          error: 'Mercado Pago nao configurado',
          details: credentialsError?.message || 'payment_settings not found',
        },
        500
      );
    }

    const { data: profile } = await supabaseAdmin
      .from('users')
      .select('email, name')
      .eq('id', user.id)
      .maybeSingle();

    const externalReference = `${user.id}|${plan.id}|${billingCycle}`;
    const projectFunctionsBaseUrl = `${supabaseUrl}/functions/v1`;
    const siteUrl = Deno.env.get('SITE_URL') || 'https://bwagro.com.br';

    const preference = {
      items: [
        {
          id: plan.id,
          title: `${plan.name} - ${billingCycle === 'monthly' ? 'Mensal' : 'Anual'}`,
          description: plan.description || `Assinatura ${plan.name}`,
          quantity: 1,
          unit_price: amount,
          currency_id: 'BRL',
        },
      ],
      payer: {
        email: profile?.email || user.email || '',
      },
      external_reference: externalReference,
      back_urls: {
        success: `${siteUrl}/#/dashboard?payment=success`,
        failure: `${siteUrl}/#/pricing?payment=failure`,
        pending: `${siteUrl}/#/dashboard?payment=pending`,
      },
      notification_url: `${projectFunctionsBaseUrl}/webhook-mercadopago`,
      metadata: {
        user_id: user.id,
        plan_id: plan.id,
        billing_cycle: billingCycle,
      },
    };

    const mpResponse = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${credentials.mp_access_token}`,
      },
      body: JSON.stringify(preference),
    });

    if (!mpResponse.ok) {
      const errorData = await mpResponse.json().catch(() => ({}));
      console.error('Mercado Pago error:', errorData);

      return jsonResponse(
        {
          success: false,
          error: 'Failed to create preference',
          details: errorData,
        },
        500
      );
    }

    const mpData = await mpResponse.json();

    await supabaseAdmin.from('admin_audit_logs').insert({
      admin_id: user.id,
      admin_email: profile?.email || user.email || 'unknown@unknown',
      admin_name: profile?.name || user.email || 'Unknown User',
      action: 'CHECKOUT_CREATED',
      resource_type: 'PLAN',
      resource_id: plan.id,
      new_value: {
        preference_id: mpData.id,
        amount,
        billing_cycle: billingCycle,
      },
      reason: 'Preferencia de pagamento criada com sucesso',
    });

    return jsonResponse({
      success: true,
      preferenceId: mpData.id,
      initPoint: mpData.init_point,
      sandboxInitPoint: mpData.sandbox_init_point,
      amount,
      planName: plan.name,
    });
  } catch (error) {
    console.error('Edge function error:', error);

    return jsonResponse(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      500
    );
  }
});
