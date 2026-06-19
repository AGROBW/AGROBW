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

    const body = await req.json().catch(() => ({}));
    const code = String(body.code || '').trim();
    const redirectUri = String(body.redirectUri || '').trim();

    if (!code || !redirectUri) {
      return jsonResponse({ success: false, error: 'code and redirectUri are required' }, 400);
    }

    const shortTokenUrl = new URL(`https://graph.facebook.com/${graphVersion}/oauth/access_token`);
    shortTokenUrl.searchParams.set('client_id', metaAppId);
    shortTokenUrl.searchParams.set('redirect_uri', redirectUri);
    shortTokenUrl.searchParams.set('client_secret', metaAppSecret);
    shortTokenUrl.searchParams.set('code', code);

    const shortTokenResponse = await fetch(shortTokenUrl);
    const shortTokenJson = await shortTokenResponse.json().catch(() => ({}));

    if (!shortTokenResponse.ok || !(shortTokenJson as any)?.access_token) {
      return jsonResponse(
        {
          success: false,
          error: (shortTokenJson as any)?.error?.message || 'Unable to generate short-lived Meta token',
          response: shortTokenJson,
        },
        502,
      );
    }

    const shortLivedToken = String((shortTokenJson as any).access_token);
    const longTokenUrl = new URL(`https://graph.facebook.com/${graphVersion}/oauth/access_token`);
    longTokenUrl.searchParams.set('grant_type', 'fb_exchange_token');
    longTokenUrl.searchParams.set('client_id', metaAppId);
    longTokenUrl.searchParams.set('client_secret', metaAppSecret);
    longTokenUrl.searchParams.set('fb_exchange_token', shortLivedToken);

    const longTokenResponse = await fetch(longTokenUrl);
    const longTokenJson = await longTokenResponse.json().catch(() => ({}));

    if (!longTokenResponse.ok || !(longTokenJson as any)?.access_token) {
      return jsonResponse(
        {
          success: false,
          error: (longTokenJson as any)?.error?.message || 'Unable to exchange Meta token',
          response: longTokenJson,
        },
        502,
      );
    }

    const longLivedUserToken = String((longTokenJson as any).access_token);
    const expiresIn = Number((longTokenJson as any).expires_in || 0);
    const expiresAt = expiresIn > 0 ? new Date(Date.now() + expiresIn * 1000).toISOString() : null;

    const pagesUrl = new URL(`https://graph.facebook.com/${graphVersion}/me/accounts`);
    pagesUrl.searchParams.set('fields', 'id,name,access_token,instagram_business_account{id,username}');
    pagesUrl.searchParams.set('access_token', longLivedUserToken);

    const pagesResponse = await fetch(pagesUrl);
    const pagesJson = await pagesResponse.json().catch(() => ({}));

    if (!pagesResponse.ok || !Array.isArray((pagesJson as any)?.data)) {
      return jsonResponse(
        {
          success: false,
          error: (pagesJson as any)?.error?.message || 'Unable to load Facebook pages from Meta',
          response: pagesJson,
        },
        502,
      );
    }

    const pages = ((pagesJson as any).data as any[]).filter(
      (page) => page?.instagram_business_account?.id && page?.access_token,
    );

    if (pages.length === 0) {
      return jsonResponse(
        {
          success: false,
          error: 'Nenhuma pagina com conta profissional do Instagram conectada foi encontrada.',
          response: pagesJson,
        },
        400,
      );
    }

    const page = pages[0];
    const instagramAccount = page.instagram_business_account;
    const nowIso = new Date().toISOString();

    const { error: updateError } = await supabaseAdmin
      .from('news_social_settings')
      .update({
        instagram_enabled: true,
        instagram_username: instagramAccount?.username ?? null,
        instagram_business_account_id: instagramAccount?.id ?? null,
        instagram_access_token: page.access_token ?? null,
        meta_user_access_token: longLivedUserToken,
        facebook_page_id: page.id ?? null,
        facebook_page_name: page.name ?? null,
        facebook_page_access_token: page.access_token ?? null,
        instagram_connection_status: 'connected',
        instagram_connected_at: nowIso,
        instagram_token_expires_at: expiresAt,
        instagram_token_last_validated_at: nowIso,
        updated_at: nowIso,
      })
      .not('id', 'is', null);

    if (updateError) {
      return jsonResponse({ success: false, error: updateError.message }, 500);
    }

    return jsonResponse({
      success: true,
      data: {
        facebookPageId: page.id ?? null,
        facebookPageName: page.name ?? null,
        instagramBusinessAccountId: instagramAccount?.id ?? null,
        instagramUsername: instagramAccount?.username ?? null,
        expiresAt,
      },
    });
  } catch (error) {
    console.error('[complete-meta-social-connection] unexpected error:', error);
    return jsonResponse(
      {
        success: false,
        error: 'Unexpected error while completing Meta connection',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      500,
    );
  }
});
