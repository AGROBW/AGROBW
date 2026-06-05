import {
  clearAdminAuthCookies,
  createSupabaseClients,
  ensureSameOriginPost,
  isAdminProfile,
  json,
  loadAdminProfile,
  normalizeAdminSession,
  parseJsonBody,
  setAdminAuthCookies,
} from './_shared.mjs';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Cache-Control', 'no-store');
    res.status(204).end();
    return;
  }

  if (req.method !== 'POST') {
    json(res, 405, { success: false, error: 'Metodo nao permitido.' });
    return;
  }

  if (!ensureSameOriginPost(req, res)) {
    return;
  }

  try {
    const body = await parseJsonBody(req);
    const accessToken = String(body?.accessToken || '').trim();
    const refreshToken = String(body?.refreshToken || '').trim();

    if (!accessToken || !refreshToken) {
      clearAdminAuthCookies(res);
      json(res, 400, { success: false, error: 'Sessao administrativa invalida.' });
      return;
    }

    const { supabaseAuth, supabaseAdmin } = createSupabaseClients();
    const normalizedSession = await normalizeAdminSession(supabaseAuth, accessToken, refreshToken);

    if (!normalizedSession.success || !normalizedSession.user?.id || !normalizedSession.session) {
      clearAdminAuthCookies(res);
      json(res, 401, { success: false, error: 'Sessao administrativa invalida.' });
      return;
    }

    const { data: profile, error: profileError } = await loadAdminProfile(supabaseAdmin, normalizedSession.user.id);
    if (profileError || !isAdminProfile(profile) || profile?.is_suspended) {
      clearAdminAuthCookies(res);
      json(res, 403, { success: false, error: 'Acesso administrativo indisponivel.' });
      return;
    }

    setAdminAuthCookies(res, normalizedSession.session);
    json(res, 200, { success: true });
  } catch (error) {
    console.error('[api/admin-auth/sync-session] unexpected error:', error);
    clearAdminAuthCookies(res);
    json(res, 500, {
      success: false,
      error: 'Nao foi possivel sincronizar a sessao administrativa.',
    });
  }
}
