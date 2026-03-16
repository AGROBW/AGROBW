/**
 * =====================================================
 * Supabase Edge Function: create-preference
 * =====================================================
 * 
 * Esta função cria uma preferência de pagamento no Mercado Pago.
 * Deve ser criada via Supabase CLI:
 * 
 * 1. Instalar Supabase CLI: npm install -g supabase
 * 2. Criar função: supabase functions new create-preference
 * 3. Copiar este código para: supabase/functions/create-preference/index.ts
 * 4. Deploy: supabase functions deploy create-preference
 * 
 * IMPORTANTE: Configure as seguintes secrets:
 * - supabase secrets set SUPABASE_URL=your-project-url
 * - supabase secrets set SUPABASE_SERVICE_ROLE_KEY=your-service-key
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.48.1';

// Interfaces
interface PreferenceRequest {
  planId: string;
  planName: string;
  planDescription: string;
  billingCycle: 'monthly' | 'yearly';
  amount: number;
  userId: string;
}

interface MercadoPagoPreference {
  items: Array<{
    title: string;
    description: string;
    quantity: number;
    unit_price: number;
    currency_id: string;
  }>;
  payer: {
    email: string;
  };
  external_reference: string;
  back_urls: {
    success: string;
    failure: string;
    pending: string;
  };
  auto_return: string;
  notification_url: string;
}

serve(async (req) => {
  // CORS Headers
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Inicializar Supabase Admin Client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Verificar autenticação
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse request body
    const body: PreferenceRequest = await req.json();
    const { planId, planName, planDescription, billingCycle, amount, userId } = body;

    // Validações
    if (!planId || !amount || userId !== user.id) {
      return new Response(
        JSON.stringify({ error: 'Invalid request data' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Buscar credenciais do Mercado Pago
    const { data: credentials, error: credError } = await supabase
      .from('payment_settings')
      .select('mp_access_token, is_production')
      .eq('id', '00000000-0000-0000-0000-000000000005')
      .single();

    if (credError || !credentials?.mp_access_token) {
      return new Response(
        JSON.stringify({ error: 'Mercado Pago not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Buscar dados do usuário
    const { data: profile } = await supabase
      .from('users')
      .select('email, name')
      .eq('id', user.id)
      .single();

    // Construir external_reference (user_id|plan_id|billing_cycle)
    const externalReference = `${userId}|${planId}|${billingCycle}`;

    // URL base do seu site
    const siteUrl = Deno.env.get('SITE_URL') || 'https://bwagro.com.br';

    // Montar preferência do Mercado Pago
    const preference: MercadoPagoPreference = {
      items: [
        {
          title: `${planName} - ${billingCycle === 'monthly' ? 'Mensal' : 'Anual'}`,
          description: planDescription || `Assinatura ${planName}`,
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
      auto_return: 'approved',
      notification_url: `${siteUrl}/api/webhooks/mercadopago`,
    };

    // Chamar API do Mercado Pago
    const mpApiUrl = credentials.is_production
      ? 'https://api.mercadopago.com/checkout/preferences'
      : 'https://api.mercadopago.com/checkout/preferences';

    const mpResponse = await fetch(mpApiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${credentials.mp_access_token}`,
      },
      body: JSON.stringify(preference),
    });

    if (!mpResponse.ok) {
      const errorData = await mpResponse.json();
      console.error('Mercado Pago error:', errorData);
      return new Response(
        JSON.stringify({ error: 'Failed to create preference', details: errorData }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const mpData = await mpResponse.json();

    // Log de sucesso (opcional)
    await supabase.from('admin_audit_logs').insert({
      admin_id: user.id,
      action: 'CHECKOUT_CREATED',
      resource_type: 'PLAN',
      resource_id: planId,
      new_value: {
        preference_id: mpData.id,
        amount,
        billing_cycle: billingCycle,
      },
      reason: 'Preferência de pagamento criada com sucesso',
    });

    // Retornar init_point (URL de checkout)
    return new Response(
      JSON.stringify({
        success: true,
        preferenceId: mpData.id,
        initPoint: mpData.init_point,
        sandboxInitPoint: mpData.sandbox_init_point,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Edge function error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

/**
 * =====================================================
 * Como Usar Esta Edge Function
 * =====================================================
 * 
 * 1. Deploy:
 *    supabase functions deploy create-preference
 * 
 * 2. Chamar do Frontend:
 *    const { data } = await supabase.functions.invoke('create-preference', {
 *      body: {
 *        planId: 'uuid-do-plano',
 *        planName: 'Premium',
 *        planDescription: 'Plano Premium Mensal',
 *        billingCycle: 'monthly',
 *        amount: 299.90,
 *        userId: user.id
 *      }
 *    });
 * 
 * 3. Redirecionar para checkout:
 *    window.location.href = data.initPoint;
 * 
 * =====================================================
 */
