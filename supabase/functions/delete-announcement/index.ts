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

const deleteAnnouncementRelations = async (
  supabaseAdmin: ReturnType<typeof createClient>,
  announcementId: string
) => {
  const { data: chats, error: chatsError } = await supabaseAdmin
    .from('chats')
    .select('id')
    .eq('announcement_id', announcementId);

  if (chatsError) {
    throw chatsError;
  }

  const chatIds = (chats || []).map((chat: { id: string }) => chat.id);

  const simpleDeletes = [
    'announcement_clicks_by_state',
    'announcement_technical_details',
    'favorites',
    'leads',
    'announcement_metrics',
    'lead_conversions',
    'opportunities',
    'opportunity_matches',
    'price_drop_notifications',
  ] as const;

  for (const table of simpleDeletes) {
    const { error } = await supabaseAdmin.from(table).delete().eq('announcement_id', announcementId);
    if (error) {
      throw error;
    }
  }

  if (chatIds.length > 0) {
    const { error: messagesError } = await supabaseAdmin.from('messages').delete().in('chat_id', chatIds);
    if (messagesError) {
      throw messagesError;
    }

    const { error: leadsByChatError } = await supabaseAdmin.from('leads').delete().in('chat_id', chatIds);
    if (leadsByChatError) {
      throw leadsByChatError;
    }

    const { error: chatsDeleteError } = await supabaseAdmin
      .from('chats')
      .delete()
      .in('id', chatIds);

    if (chatsDeleteError) {
      throw chatsDeleteError;
    }
  }
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

    const body = await req.json().catch(() => ({}));
    const announcementId = String(body.announcementId || '').trim();

    if (!announcementId) {
      return jsonResponse({ success: false, error: 'announcementId is required' }, 400);
    }

    const { data: announcement, error: announcementError } = await supabaseAdmin
      .from('announcements')
      .select('id, user_id')
      .eq('id', announcementId)
      .maybeSingle();

    if (announcementError || !announcement) {
      return jsonResponse({ success: false, error: 'Announcement not found' }, 404);
    }

    const { data: userProfile } = await supabaseAdmin
      .from('users')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();

    const isAdmin = (userProfile?.role || '').toLowerCase() === 'admin';
    const isOwner = announcement.user_id === user.id;

    if (!isAdmin && !isOwner) {
      return jsonResponse({ success: false, error: 'Forbidden' }, 403);
    }

    await deleteAnnouncementRelations(supabaseAdmin, announcementId);

    const { error: deleteError } = await supabaseAdmin
      .from('announcements')
      .delete()
      .eq('id', announcementId);

    if (deleteError) {
      return jsonResponse(
        {
          success: false,
          error: 'Failed to delete announcement',
          details: deleteError.message,
        },
        409
      );
    }

    return jsonResponse({
      success: true,
      announcementId,
    });
  } catch (error) {
    console.error('[delete-announcement] unexpected error:', error);
    return jsonResponse(
      {
        success: false,
        error: 'Unexpected error while deleting announcement',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      500
    );
  }
});
