/**
 * =====================================================
 * Supabase Edge Function: webhook-mercadopago
 * =====================================================
 * 
 * Esta função processa webhooks do Mercado Pago.
 * Deve ser criada via Supabase CLI:
 * 
 * 1. Criar função: supabase functions new webhook-mercadopago
 * 2. Copiar este código para: supabase/functions/webhook-mercadopago/index.ts
 * 3. Deploy: supabase functions deploy webhook-mercadopago
 * 4. Configurar URL no Mercado Pago: https://xxx.supabase.co/functions/v1/webhook-mercadopago
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.48.1';

interface WebhookBody {
  action: string;
  api_version: string;
  data: {
    id: string;
  };
  date_created: string;
  id: number;
  live_mode: boolean;
  type: string;
  user_id: string;
}

serve(async (req) => {
  // CORS Headers
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-signature, x-request-id',
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

    // Parse request body
    const body: WebhookBody = await req.json();

    console.log('Webhook received:', {
      type: body.type,
      action: body.action,
      id: body.data?.id,
    });

    // Registrar webhook no log
    const { error: logError } = await supabase.from('webhook_logs').insert({
      provider: 'mercadopago',
      event_type: body.action,
      payload: body,
      status_code: 200,
      processed: false,
    });

    if (logError) {
      console.error('Failed to log webhook:', logError);
    }

    // Processar apenas eventos de pagamento
    if (body.type !== 'payment') {
      console.log('Ignoring non-payment event:', body.type);
      return new Response('OK - ignored', { 
        status: 200, 
        headers: corsHeaders 
      });
    }

    // Buscar credenciais do Mercado Pago
    const { data: credentials, error: credError } = await supabase
      .from('payment_settings')
      .select('mp_access_token, mp_webhook_secret, is_production')
      .eq('id', '00000000-0000-0000-0000-000000000005')
      .single();

    if (credError || !credentials?.mp_access_token) {
      console.error('Mercado Pago not configured');
      return new Response('Configuration error', { 
        status: 500, 
        headers: corsHeaders 
      });
    }

    // Validar assinatura do webhook (opcional mas recomendado)
    const signature = req.headers.get('x-signature');
    const requestId = req.headers.get('x-request-id');

    if (credentials.mp_webhook_secret && signature) {
      // Implementar validação de assinatura do MP
      // https://www.mercadopago.com.br/developers/pt/docs/your-integrations/notifications/webhooks#validar-notificacoes
      console.log('Validating signature:', signature);
      // TODO: Validar assinatura HMAC SHA256
    }

    // Buscar detalhes do pagamento na API do MP
    const paymentId = body.data.id;
    const mpApiUrl = `https://api.mercadopago.com/v1/payments/${paymentId}`;

    const paymentResponse = await fetch(mpApiUrl, {
      headers: {
        'Authorization': `Bearer ${credentials.mp_access_token}`,
      },
    });

    if (!paymentResponse.ok) {
      console.error('Failed to fetch payment from MP:', paymentResponse.status);
      return new Response('Failed to fetch payment', { 
        status: 500, 
        headers: corsHeaders 
      });
    }

    const payment = await paymentResponse.json();

    console.log('Payment details:', {
      id: payment.id,
      status: payment.status,
      status_detail: payment.status_detail,
      external_reference: payment.external_reference,
      transaction_amount: payment.transaction_amount,
    });

    // Processar apenas pagamentos aprovados
    if (payment.status === 'approved') {
      console.log('Processing approved payment:', paymentId);

      try {
        // Chamar função RPC para processar pagamento
        const { data: subscriptionId, error: processError } = await supabase
          .rpc('process_approved_payment', {
            p_mp_payment_id: payment.id.toString(),
            p_mp_external_reference: payment.external_reference,
            p_amount: payment.transaction_amount,
            p_mp_status: payment.status,
            p_mp_status_detail: payment.status_detail || null,
          });

        if (processError) {
          console.error('Failed to process payment:', processError);
          
          // Atualizar log como erro
          await supabase.from('webhook_logs').update({
            processed: false,
            error_message: processError.message,
          }).eq('payload->>id', body.id.toString());

          return new Response('Processing error', { 
            status: 500, 
            headers: corsHeaders 
          });
        }

        console.log('Payment processed successfully. Subscription ID:', subscriptionId);

        // Atualizar log como processado
        await supabase.from('webhook_logs').update({
          processed: true,
          processed_at: new Date().toISOString(),
        }).eq('payload->>id', body.id.toString());

        // Criar notificação para o usuário (opcional)
        const externalRefParts = payment.external_reference.split('|');
        const userId = externalRefParts[0];

        if (userId) {
          await supabase.from('notifications').insert({
            user_id: userId,
            type: 'payment_approved',
            title: 'Pagamento Aprovado! 🎉',
            message: 'Sua assinatura foi ativada com sucesso. Aproveite todos os recursos do seu plano!',
            link: '/#/dashboard',
          });
        }

        return new Response('Payment processed', { 
          status: 200, 
          headers: corsHeaders 
        });

      } catch (err) {
        console.error('Error processing approved payment:', err);
        return new Response('Processing error', { 
          status: 500, 
          headers: corsHeaders 
        });
      }
    } 
    else if (payment.status === 'rejected' || payment.status === 'cancelled') {
      console.log('Payment rejected/cancelled:', paymentId);

      // Criar notificação de falha (opcional)
      const externalRefParts = payment.external_reference?.split('|') || [];
      const userId = externalRefParts[0];

      if (userId) {
        await supabase.from('notifications').insert({
          user_id: userId,
          type: 'payment_failed',
          title: 'Pagamento Recusado',
          message: `Seu pagamento foi recusado. Status: ${payment.status_detail}. Tente novamente com outro método de pagamento.`,
          link: '/#/pricing',
        });
      }

      return new Response('Payment rejected', { 
        status: 200, 
        headers: corsHeaders 
      });
    }
    else {
      console.log('Payment pending or other status:', payment.status);
      return new Response('Payment pending', { 
        status: 200, 
        headers: corsHeaders 
      });
    }

  } catch (error) {
    console.error('Webhook error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

/**
 * =====================================================
 * Como Configurar Este Webhook
 * =====================================================
 * 
 * 1. Deploy da Edge Function:
 *    supabase functions deploy webhook-mercadopago
 * 
 * 2. Configurar no Mercado Pago:
 *    - Acessar: https://www.mercadopago.com.br/developers/panel/webhooks
 *    - Clicar em "Adicionar novo webhook"
 *    - URL: https://xxx.supabase.co/functions/v1/webhook-mercadopago
 *    - Eventos selecionados: 
 *      ✓ Pagamentos
 *      ✓ Assinaturas (se aplicável)
 *    - Salvar
 * 
 * 3. Testar Webhook:
 *    - Fazer um pagamento de teste
 *    - Verificar logs: supabase functions logs webhook-mercadopago
 *    - Verificar tabela: SELECT * FROM webhook_logs ORDER BY received_at DESC LIMIT 10;
 * 
 * 4. Validação de Assinatura (Recomendado):
 *    - Copiar o Secret do webhook no painel MP
 *    - Salvar em payment_settings.mp_webhook_secret
 *    - Implementar validação HMAC SHA256 (ver docs MP)
 * 
 * =====================================================
 * Fluxo do Webhook
 * =====================================================
 * 
 * 1. MP envia notificação → Edge Function
 * 2. Registra log em webhook_logs
 * 3. Busca detalhes do pagamento via API MP
 * 4. Se aprovado → chama process_approved_payment()
 * 5. Cria/atualiza user_subscriptions
 * 6. Cria notificação para usuário
 * 7. Marca log como processado
 * 
 * =====================================================
 * Monitoramento
 * =====================================================
 * 
 * -- Ver webhooks recebidos
 * SELECT * FROM webhook_logs 
 * WHERE provider = 'mercadopago' 
 * ORDER BY received_at DESC LIMIT 50;
 * 
 * -- Ver webhooks não processados
 * SELECT * FROM webhook_logs 
 * WHERE processed = false 
 * ORDER BY received_at DESC;
 * 
 * -- Ver assinaturas criadas hoje
 * SELECT * FROM user_subscriptions 
 * WHERE created_at >= CURRENT_DATE 
 * ORDER BY created_at DESC;
 * 
 * =====================================================
 */
