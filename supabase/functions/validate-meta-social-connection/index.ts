import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.48.1';
import { extractBearerToken, isAdminAal2Profile } from '../_shared/security.ts';
import { getCorsHeaders } from '../_shared/cors.ts';

const graphVersion = 'v23.0';

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
    const metaAppSecret = Deno.env.get('META_APP_SECRET');

    if (!supabaseUrl || !anonKey || !serviceRoleKey || !metaAppId || !metaAppSecret) {
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

    const { data: settings, error: settingsError } = await supabaseAdmin
      .from('news_social_settings')
      .select('*')
      .limit(1)
      .maybeSingle();

    if (settingsError || !settings) {
      return jsonResponse({ success: false, error: 'Social settings not found' }, 404);
    }

    const userToken = settings.meta_user_access_token;
    if (!userToken) {
      await supabaseAdmin
        .from('news_social_settings')
        .update({
          instagram_connection_status: 'disconnected',
          instagram_token_last_validated_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', settings.id);

      return jsonResponse({
        success: true,
        data: {
          status: 'disconnected',
          expiresAt: null,
        },
      });
    }

    const debugUrl = new URL(`https://graph.facebook.com/${graphVersion}/debug_token`);
    debugUrl.searchParams.set('input_token', userToken);
    debugUrl.searchParams.set('access_token', `${metaAppId}|${metaAppSecret}`);

    const debugResponse = await fetch(debugUrl);
    const debugJson = await debugResponse.json().catch(() => ({}));
    const debugData = (debugJson as any)?.data;
    const now = Date.now();

    let status: 'disconnected' | 'connected' | 'expiring_soon' | 'expired' | 'error' = 'error';
    let expiresAt: string | null = null;

    if (!debugResponse.ok || !debugData) {
      status = 'error';
    } else if (!debugData.is_valid) {
      status = 'expired';
      expiresAt = debugData.expires_at
        ? new Date(Number(debugData.expires_at) * 1000).toISOString()
        : null;
    } else {
      expiresAt = debugData.expires_at
        ? new Date(Number(debugData.expires_at) * 1000).toISOString()
        : null;

      if (expiresAt) {
        const diff = new Date(expiresAt).getTime() - now;
        status = diff <= 3 * 24 * 60 * 60 * 1000 ? 'expiring_soon' : 'connected';
      } else {
        status = 'connected';
      }
    }

    let pageData = null as any;
    if (status === 'connected' || status === 'expiring_soon') {
      const pagesUrl = new URL(`https://graph.facebook.com/${graphVersion}/me/accounts`);
      pagesUrl.searchParams.set('fields', 'id,name,access_token,instagram_business_account{id,username}');
      pagesUrl.searchParams.set('access_token', userToken);

      const pagesResponse = await fetch(pagesUrl);
      const pagesJson = await pagesResponse.json().catch(() => ({}));
      const pages = Array.isArray((pagesJson as any)?.data) ? (pagesJson as any).data : [];

      pageData =
        pages.find((page: any) => page?.id === settings.facebook_page_id && page?.instagram_business_account?.id) ||
        pages.find((page: any) => page?.instagram_business_account?.id) ||
        null;

      if (!pageData) {
        status = 'error';
      }
    }

    const nowIso = new Date().toISOString();
    await supabaseAdmin
      .from('news_social_settings')
      .update({
        instagram_username: pageData?.instagram_business_account?.username ?? settings.instagram_username ?? null,
        instagram_business_account_id:
          pageData?.instagram_business_account?.id ?? settings.instagram_business_account_id ?? null,
        instagram_access_token: pageData?.access_token ?? settings.instagram_access_token ?? null,
        facebook_page_id: pageData?.id ?? settings.facebook_page_id ?? null,
        facebook_page_name: pageData?.name ?? settings.facebook_page_name ?? null,
        facebook_page_access_token: pageData?.access_token ?? settings.facebook_page_access_token ?? null,
        instagram_connection_status: status,
        instagram_token_expires_at: expiresAt,
        instagram_token_last_validated_at: nowIso,
        updated_at: nowIso,
      })
      .eq('id', settings.id);

    return jsonResponse({
      success: true,
      data: {
        status,
        expiresAt,
      },
    });
  } catch (error) {
    console.error('[validate-meta-social-connection] unexpected error:', error);
    return jsonResponse(
      {
        success: false,
        error: 'Unexpected error while validating Meta connection',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      500,
    );
  }
});
