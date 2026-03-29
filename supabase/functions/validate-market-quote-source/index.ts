import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.48.1';
import {
  buildCepeaUrl,
  CommodityKey,
  commodityLabelMap,
  fetchAndParseMarketQuote,
  MarketQuoteSourceRecord,
  saveTempQuote,
  SourceProvider,
  updateSourceStatus,
} from '../_shared/marketQuotes.ts';

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

type RequestBody = {
  sourceId?: string;
  provider?: SourceProvider;
  commodity?: CommodityKey;
  url?: string;
  cepeaIndicatorId?: number | null;
};

const isAdminUser = async (supabaseAdmin: any, userId: string) => {
  const { data: userProfile } = await supabaseAdmin.from('users').select('role, is_admin').eq('id', userId).maybeSingle();
  return !!userProfile?.is_admin || (userProfile?.role || '').toLowerCase() === 'admin';
};

const resolveSource = async (
  supabaseAdmin: any,
  body: RequestBody
): Promise<MarketQuoteSourceRecord> => {
  if (body.sourceId) {
    const { data, error } = await supabaseAdmin
      .from('market_quote_sources')
      .select(
        'id, name, source_url, generated_url, commodity_target, provider, cepea_indicator_id, provider_label, refresh_interval_minutes, is_active'
      )
      .eq('id', body.sourceId)
      .single();

    if (error) {
      throw new Error(`Fonte não encontrada: ${error.message}`);
    }

    return data as MarketQuoteSourceRecord;
  }

  const commodity = body.commodity;
  if (!commodity || !commodityLabelMap[commodity]) {
    throw new Error('Commodity inválida para validação.');
  }

  const provider = body.provider || 'cepea';
  const generatedUrl =
    provider === 'cepea' ? buildCepeaUrl(commodity, Number(body.cepeaIndicatorId || 0) || null) : null;

  return {
    id: crypto.randomUUID(),
    name: `Prévia ${commodityLabelMap[commodity]}`,
    source_url: provider === 'cepea' ? generatedUrl || '' : String(body.url || '').trim(),
    generated_url: generatedUrl,
    commodity_target: commodity,
    provider,
    cepea_indicator_id: Number(body.cepeaIndicatorId || 0) || null,
    provider_label: provider === 'cepea' ? 'CEPEA' : 'Referência de mercado',
    refresh_interval_minutes: 60,
    is_active: true,
  };
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return jsonResponse({ success: false, error: 'Missing Supabase secrets' }, 500);
    }

    const authClient = createClient(supabaseUrl, anonKey);
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    const authHeader = req.headers.get('Authorization') || '';
    if (!authHeader.startsWith('Bearer ')) {
      return jsonResponse({ success: false, error: 'Unauthorized' }, 401);
    }

    const token = authHeader.slice(7).trim();
    const {
      data: { user },
      error: authError,
    } = await authClient.auth.getUser(token);

    if (authError || !user) {
      return jsonResponse({ success: false, error: 'Invalid JWT', details: authError?.message }, 401);
    }

    if (!(await isAdminUser(supabaseAdmin, user.id))) {
      return jsonResponse({ success: false, error: 'Admin access required' }, 403);
    }

    const body = (await req.json().catch(() => ({}))) as RequestBody;
    const source = await resolveSource(supabaseAdmin, body);

    try {
      const parsed = await fetchAndParseMarketQuote(source);
      const tempRecord = body.sourceId ? await saveTempQuote(supabaseAdmin, source, parsed) : null;

      return jsonResponse({
        success: true,
        foundCount: 1,
        provider: source.provider,
        commodity: parsed.commodity,
        generatedUrl: parsed.sourceUrl,
        temp: tempRecord,
        data: {
          commodity: parsed.commodity,
          produto: parsed.produto,
          preco: parsed.preco,
          unidade: parsed.unidade,
          data_referencia: parsed.data_referencia,
          fonte: parsed.fonte,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';

      if (body.sourceId) {
        const lowerMessage = message.toLowerCase();
        let status = 'error';

        if (lowerMessage.includes('nenhuma linha de dados')) status = 'parsing_error';
        else if (lowerMessage.includes('dados insuficientes') || lowerMessage.includes('não encontrada')) status = 'no_data';

        await updateSourceStatus(supabaseAdmin, source.id, {
          last_validation_at: new Date().toISOString(),
          last_status: status,
          last_error: message,
        });
      }

      const statusCode =
        message.includes('HTTP ') ? 502 : message.includes('Dados insuficientes') || message.includes('nenhuma linha') ? 422 : 500;

      return jsonResponse({ success: false, error: message }, statusCode);
    }
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
