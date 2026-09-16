import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.48.1';
import { getCorsHeadersInternal } from '../_shared/cors.ts';

const corsHeaders = getCorsHeadersInternal();

const jsonResponse = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const timingSafeEqual = (expected: string, received: string) => {
  let mismatch = expected.length === received.length ? 0 : 1;
  const length = Math.max(expected.length, received.length);
  for (let index = 0; index < length; index += 1) {
    mismatch |= (expected.charCodeAt(index) || 0) ^ (received.charCodeAt(index) || 0);
  }
  return mismatch === 0;
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ success: false, error: 'Metodo nao permitido.' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const cronSecret = Deno.env.get('CONTEXTUAL_UPSELL_CRON_SECRET');
  if (!supabaseUrl || !serviceRoleKey || !cronSecret) {
    return jsonResponse({ success: false, error: 'Configuracao indisponivel.' }, 500);
  }

  const requestSecret = req.headers.get('x-cron-secret') || '';
  if (!requestSecret || !timingSafeEqual(cronSecret, requestSecret)) {
    return jsonResponse({ success: false, error: 'Nao autorizado.' }, 401);
  }

  try {
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await supabaseAdmin.rpc('purge_contextual_upsell_data');
    if (error) {
      console.error('[purge-contextual-upsell-data] purge failed', error.code);
      return jsonResponse({ success: false, error: 'Nao foi possivel aplicar a retencao.' }, 500);
    }

    const result = Array.isArray(data) ? data[0] : data;
    return jsonResponse({
      success: true,
      eventsDeleted: Number(result?.events_deleted || 0),
      recoveryDeleted: Number(result?.recovery_deleted || 0),
    });
  } catch (error) {
    console.error(
      '[purge-contextual-upsell-data] unexpected failure',
      error instanceof Error ? error.name : 'UNKNOWN_ERROR',
    );
    return jsonResponse({ success: false, error: 'Falha inesperada na retencao.' }, 500);
  }
});
