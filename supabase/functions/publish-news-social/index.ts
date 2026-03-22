import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.48.1';

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

const uploadLinkedinImage = async (params: {
  accessToken: string;
  authorUrn: string;
  imageUrl: string;
  linkedinVersion: string;
}) => {
  const initializeResponse = await fetch('https://api.linkedin.com/rest/images?action=initializeUpload', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${params.accessToken}`,
      'X-Restli-Protocol-Version': '2.0.0',
      'Linkedin-Version': params.linkedinVersion,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      initializeUploadRequest: {
        owner: params.authorUrn,
      },
    }),
  });

  const initializeJson = await initializeResponse.json().catch(() => ({}));
  if (!initializeResponse.ok) {
    const errorMessage =
      (initializeJson as any)?.message ||
      (initializeJson as any)?.error ||
      'LinkedIn image upload initialization failed';
    throw new Error(errorMessage);
  }

  const uploadUrl = (initializeJson as any)?.value?.uploadUrl;
  const imageUrn = (initializeJson as any)?.value?.image;
  if (!uploadUrl || !imageUrn) {
    throw new Error('LinkedIn did not return uploadUrl/image for the media asset');
  }

  const imageResponse = await fetch(params.imageUrl);
  if (!imageResponse.ok) {
    throw new Error(`Unable to download LinkedIn image source (${imageResponse.status})`);
  }

  const contentType = imageResponse.headers.get('content-type') || 'image/jpeg';
  const imageBuffer = await imageResponse.arrayBuffer();
  const uploadResponse = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${params.accessToken}`,
      'Content-Type': contentType,
    },
    body: imageBuffer,
  });

  if (!uploadResponse.ok) {
    const uploadText = await uploadResponse.text().catch(() => '');
    throw new Error(uploadText || `LinkedIn image upload failed with status ${uploadResponse.status}`);
  }

  return imageUrn as string;
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const linkedinVersion = Deno.env.get('LINKEDIN_API_VERSION') || '202507';

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

    const { data: userProfile } = await supabaseAdmin
      .from('users')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();

    if ((userProfile?.role || '').toLowerCase() !== 'admin') {
      return jsonResponse({ success: false, error: 'Admin access required' }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const articleId = String(body.articleId || '').trim();
    const platform = String(body.platform || 'linkedin').trim().toLowerCase();

    if (!articleId) {
      return jsonResponse({ success: false, error: 'articleId is required' }, 400);
    }

    const { data: socialSettings, error: socialSettingsError } = await supabaseAdmin
      .from('news_social_settings')
      .select('*')
      .limit(1)
      .maybeSingle();

    if (socialSettingsError || !socialSettings) {
      return jsonResponse({ success: false, error: 'Social settings not found' }, 404);
    }

    const { data: publication, error: publicationError } = await supabaseAdmin
      .from('news_social_publications')
      .select('*')
      .eq('article_id', articleId)
      .eq('platform', platform)
      .maybeSingle();

    if (publicationError || !publication) {
      return jsonResponse({ success: false, error: 'Social publication queue not found' }, 404);
    }

    if (publication.status === 'published') {
      return jsonResponse({ success: true, message: 'Already published', publicationId: publication.id });
    }

    await supabaseAdmin
      .from('news_social_publications')
      .update({
        status: 'processing',
        updated_at: new Date().toISOString(),
      })
      .eq('id', publication.id);

    if (platform === 'linkedin') {
      if (!socialSettings.linkedin_enabled) {
        return jsonResponse({ success: false, error: 'LinkedIn integration is disabled' }, 400);
      }

      if (!socialSettings.linkedin_access_token || !socialSettings.linkedin_author_urn) {
        return jsonResponse({ success: false, error: 'LinkedIn token or author URN not configured' }, 400);
      }

      const commentary = String(publication.caption || '').trim();
      const imageUrl = (publication.request_payload as any)?.imageUrl;
      if (!commentary) {
        await supabaseAdmin
          .from('news_social_publications')
          .update({
            status: 'failed',
            error_message: 'Caption is required to publish on LinkedIn',
            updated_at: new Date().toISOString(),
          })
          .eq('id', publication.id);

        return jsonResponse({ success: false, error: 'Caption is required to publish on LinkedIn' }, 400);
      }

      let imageUrn: string | null = null;
      if (imageUrl) {
        imageUrn = await uploadLinkedinImage({
          accessToken: socialSettings.linkedin_access_token,
          authorUrn: socialSettings.linkedin_author_urn,
          imageUrl,
          linkedinVersion,
        });
      }

      const response = await fetch('https://api.linkedin.com/rest/posts', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${socialSettings.linkedin_access_token}`,
          'X-Restli-Protocol-Version': '2.0.0',
          'Linkedin-Version': linkedinVersion,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          author: socialSettings.linkedin_author_urn,
          commentary,
          visibility: 'PUBLIC',
          distribution: {
            feedDistribution: 'MAIN_FEED',
            targetEntities: [],
            thirdPartyDistributionChannels: [],
          },
          ...(imageUrn
            ? {
                content: {
                  media: {
                    id: imageUrn,
                    altText: String((publication.request_payload as any)?.articleTitle || 'Imagem da noticia'),
                  },
                },
              }
            : {}),
          lifecycleState: 'PUBLISHED',
          isReshareDisabledByAuthor: false,
        }),
      });

      const responseText = await response.text();
      let responseJson: Record<string, unknown> = {};
      try {
        responseJson = responseText ? JSON.parse(responseText) : {};
      } catch {
        responseJson = { raw: responseText };
      }

      if (!response.ok) {
        const errorMessage =
          (responseJson as any)?.message ||
          (responseJson as any)?.error ||
          `LinkedIn request failed with status ${response.status}`;

        await supabaseAdmin
          .from('news_social_publications')
          .update({
            status: 'failed',
            error_message: errorMessage,
            response_payload: responseJson,
            updated_at: new Date().toISOString(),
          })
          .eq('id', publication.id);

        return jsonResponse({ success: false, error: errorMessage, response: responseJson }, 502);
      }

      const externalPublicationId = response.headers.get('x-restli-id');
      await supabaseAdmin
        .from('news_social_publications')
        .update({
          status: 'published',
          external_publication_id: externalPublicationId,
          request_payload: {
            ...(publication.request_payload as any),
            imageUrn,
          },
          response_payload: responseJson,
          published_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', publication.id);

      return jsonResponse({
        success: true,
        publicationId: publication.id,
        externalPublicationId,
        response: responseJson,
      });
    }

    if (platform === 'instagram') {
      if (!socialSettings.instagram_enabled) {
        return jsonResponse({ success: false, error: 'Instagram integration is disabled' }, 400);
      }

      if (!socialSettings.instagram_access_token || !socialSettings.instagram_business_account_id) {
        return jsonResponse({ success: false, error: 'Instagram token or business account ID not configured' }, 400);
      }

      const imageUrl = (publication.request_payload as any)?.imageUrl;
      if (!imageUrl) {
        await supabaseAdmin
          .from('news_social_publications')
          .update({
            status: 'failed',
            error_message: 'Featured image URL is required to publish Instagram story',
            updated_at: new Date().toISOString(),
          })
          .eq('id', publication.id);

        return jsonResponse({ success: false, error: 'Featured image URL is required to publish Instagram story' }, 400);
      }

      const graphVersion = 'v23.0';
      const createContainerResponse = await fetch(
        `https://graph.facebook.com/${graphVersion}/${socialSettings.instagram_business_account_id}/media`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            image_url: imageUrl,
            media_type: 'STORIES',
            access_token: socialSettings.instagram_access_token,
          }),
        },
      );

      const createContainerJson = await createContainerResponse.json().catch(() => ({}));
      if (!createContainerResponse.ok || !(createContainerJson as any)?.id) {
        const errorMessage =
          (createContainerJson as any)?.error?.message ||
          'Instagram container creation failed';

        await supabaseAdmin
          .from('news_social_publications')
          .update({
            status: 'failed',
            error_message: errorMessage,
            response_payload: createContainerJson,
            updated_at: new Date().toISOString(),
          })
          .eq('id', publication.id);

        return jsonResponse({ success: false, error: errorMessage, response: createContainerJson }, 502);
      }

      const creationId = (createContainerJson as any).id;
      const publishResponse = await fetch(
        `https://graph.facebook.com/${graphVersion}/${socialSettings.instagram_business_account_id}/media_publish`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            creation_id: creationId,
            access_token: socialSettings.instagram_access_token,
          }),
        },
      );

      const publishJson = await publishResponse.json().catch(() => ({}));
      if (!publishResponse.ok || !(publishJson as any)?.id) {
        const errorMessage =
          (publishJson as any)?.error?.message ||
          'Instagram story publish failed';

        await supabaseAdmin
          .from('news_social_publications')
          .update({
            status: 'failed',
            error_message: errorMessage,
            request_payload: {
              ...(publication.request_payload as any),
              creationId,
            },
            response_payload: publishJson,
            updated_at: new Date().toISOString(),
          })
          .eq('id', publication.id);

        return jsonResponse({ success: false, error: errorMessage, response: publishJson }, 502);
      }

      const externalPublicationId = (publishJson as any).id;
      await supabaseAdmin
        .from('news_social_publications')
        .update({
          status: 'published',
          external_publication_id: externalPublicationId,
          request_payload: {
            ...(publication.request_payload as any),
            creationId,
          },
          response_payload: publishJson,
          published_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', publication.id);

      return jsonResponse({
        success: true,
        publicationId: publication.id,
        externalPublicationId,
        response: publishJson,
      });
    }

    return jsonResponse({ success: false, error: 'Unsupported platform' }, 400);
  } catch (error) {
    console.error('[publish-news-social] unexpected error:', error);
    return jsonResponse(
      {
        success: false,
        error: 'Unexpected error while publishing social content',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      500,
    );
  }
});
