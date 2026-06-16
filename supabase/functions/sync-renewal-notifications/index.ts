import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.48.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': 'null',  // VULN-002 fix: Internal/cron only
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, apikey, x-cron-secret',
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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse({ success: false, error: 'Serviço indisponível' }, 500);
    }

    const cronSecret = Deno.env.get('RENEWAL_NOTIFICATIONS_CRON_SECRET');
    const requestSecret = req.headers.get('x-cron-secret');

    const timingSafeEqual = (a: string, b: string): boolean => {
      const ab = new TextEncoder().encode(a);
      const bb = new TextEncoder().encode(b);
      if (ab.length !== bb.length) return false;
      let diff = 0;
      for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i];
      return diff === 0;
    };

    if (!cronSecret || !requestSecret || !timingSafeEqual(requestSecret, cronSecret)) {
      return jsonResponse({ success: false, error: 'Unauthorized' }, 401);
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
    const startedAt = new Date().toISOString();

    const { data, error } = await supabaseAdmin.rpc('generate_renewal_notifications_batch');

    if (error) {
      return jsonResponse(
        {
          success: false,
          error: error.message,
          startedAt,
        },
        500
      );
    }

    return jsonResponse({
      success: true,
      startedAt,
      notificationsCreated: Number(data ?? 0),
    });
  } catch (error) {
    return jsonResponse(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      500
    );
  }
});
