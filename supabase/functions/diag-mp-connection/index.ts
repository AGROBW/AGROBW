import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, apikey',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  return new Response(
    JSON.stringify({
      success: false,
      error: 'DIAG-2026-03-16',
      details: 'diag-mp-connection-ok',
    }),
    {
      status: 418,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
      },
    }
  );
});
