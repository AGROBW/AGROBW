import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.48.1';
import { getCorsHeadersInternal } from '../_shared/cors.ts';

const RETENTION_DAYS = 180;
const corsHeaders = getCorsHeadersInternal();

const jsonResponse = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
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
  const cronSecret = Deno.env.get('SELLER_STORE_INSIGHTS_CRON_SECRET');
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
    const { data, error } = await supabaseAdmin.rpc('purge_seller_store_insight_events', {
      p_retention_days: RETENTION_DAYS,
    });
    if (error) {
      console.error('[purge-seller-store-insights] purge failed', error.code || 'FAILED');
      return jsonResponse({ success: false, error: 'Nao foi possivel aplicar a retencao.' }, 500);
    }

    return jsonResponse({
      success: true,
      retentionDays: RETENTION_DAYS,
      deletedCount: Number(data || 0),
      completedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error(
      '[purge-seller-store-insights] unexpected failure',
      error instanceof Error ? error.name : 'UNKNOWN_ERROR',
    );
    return jsonResponse({ success: false, error: 'Falha inesperada na retencao.' }, 500);
  }
});
