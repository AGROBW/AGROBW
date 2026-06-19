import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.48.1';
import { extractBearerToken, isAdminAal2Profile } from '../_shared/security.ts';
import { getCorsHeaders } from '../_shared/cors.ts';

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  const jsonResponse = (body: Record<string, unknown>, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const metaAppId = Deno.env.get('META_APP_ID');

    if (!supabaseUrl || !anonKey || !serviceRoleKey || !metaAppId) {
      return jsonResponse({ success: false, error: 'Missing Supabase or Meta secrets' }, 500);
    }

    const authClient = createClient(supabaseUrl, anonKey);
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    const token = extractBearerToken(req);
    if (!token) {
      return jsonResponse({ success: false, error: 'Unauthorized' }, 401);
    }
    const {
      data: { user },
      error: authError,
    } = await authClient.auth.getUser(token);

    if (authError || !user) {
      return jsonResponse({ success: false, error: 'Unauthorized' }, 401);
    }

    const { data: userProfile } = await supabaseAdmin
      .from('users')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();

    if (!isAdminAal2Profile(userProfile, token)) {
      return jsonResponse({ success: false, error: 'Admin access required' }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const explicitOrigin = String(body.appOrigin || '').trim().replace(/\/+$/, '');
    const state = crypto.randomUUID();
    const appBaseUrl =
      explicitOrigin || Deno.env.get('APP_URL')?.replace(/\/+$/, '') || '';

    if (!appBaseUrl) {
      return jsonResponse({ success: false, error: 'APP_URL or appOrigin is required' }, 500);
    }

    const redirectUri = `${appBaseUrl}/meta-oauth-callback.html`;
    const scope = [
      'pages_show_list',
      'pages_read_engagement',
      'instagram_basic',
      'instagram_content_publish',
      'business_management',
    ].join(',');

    const authUrl = `https://www.facebook.com/v23.0/dialog/oauth?client_id=${encodeURIComponent(
      metaAppId,
    )}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${encodeURIComponent(
      state,
    )}&scope=${encodeURIComponent(scope)}`;

    return jsonResponse({
      success: true,
      data: {
        authUrl,
        state,
        redirectUri,
      },
    });
  } catch (error) {
    console.error('[start-meta-social-connection] unexpected error:', error);
    return jsonResponse(
      {
        success: false,
        error: 'Unexpected error while starting Meta connection',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      500,
    );
  }
});
