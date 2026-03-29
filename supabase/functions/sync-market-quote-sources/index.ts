import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.48.1';
import {
  fetchAndParseMarketQuote,
  MarketQuoteSourceRecord,
  saveTempQuote,
  updateSourceStatus,
} from '../_shared/marketQuotes.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
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

const shouldSyncSource = (source: MarketQuoteSourceRecord & { last_validation_at?: string | null }) => {
  if (!source.is_active) return false;
  if (!source.last_validation_at) return true;

  const nextAllowedAt =
    new Date(source.last_validation_at).getTime() + source.refresh_interval_minutes * 60 * 1000;

  return Date.now() >= nextAllowedAt;
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse({ success: false, error: 'Missing Supabase secrets' }, 500);
    }

    const cronSecret = Deno.env.get('MARKET_QUOTES_CRON_SECRET');
    const requestSecret = req.headers.get('x-cron-secret');

    if (!cronSecret || requestSecret !== cronSecret) {
      return jsonResponse({ success: false, error: 'Unauthorized' }, 401);
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
    const { data: sources, error } = await supabaseAdmin
      .from('market_quote_sources')
      .select(
        'id, name, source_url, generated_url, commodity_target, provider, cepea_indicator_id, provider_label, refresh_interval_minutes, is_active, last_validation_at'
      )
      .eq('is_active', true)
      .order('updated_at', { ascending: false });

    if (error) {
      return jsonResponse({ success: false, error: error.message }, 500);
    }

    const dueSources = ((sources as Array<MarketQuoteSourceRecord & { last_validation_at?: string | null }>) || []).filter(
      shouldSyncSource
    );

    const results = [];

    for (const source of dueSources) {
      try {
        const parsed = await fetchAndParseMarketQuote(source);
        await saveTempQuote(supabaseAdmin, source, parsed);

        results.push({
          sourceId: source.id,
          commodity: parsed.commodity,
          status: 'pending',
          price: parsed.preco,
          referenceDate: parsed.data_referencia,
        });
      } catch (sourceError) {
        const message = sourceError instanceof Error ? sourceError.message : 'Unknown error';
        const lowerMessage = message.toLowerCase();
        let status = 'error';

        if (lowerMessage.includes('nenhuma linha de dados')) status = 'parsing_error';
        else if (lowerMessage.includes('dados insuficientes') || lowerMessage.includes('não encontrada')) status = 'no_data';

        await updateSourceStatus(supabaseAdmin, source.id, {
          last_validation_at: new Date().toISOString(),
          last_status: status,
          last_error: message,
        });

        results.push({
          sourceId: source.id,
          commodity: source.commodity_target,
          status,
          error: message,
        });
      }
    }

    return jsonResponse({
      success: true,
      syncedCount: results.length,
      results,
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
