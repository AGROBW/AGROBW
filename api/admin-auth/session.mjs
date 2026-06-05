import {
  ADMIN_ACCESS_COOKIE,
  ADMIN_REFRESH_COOKIE,
  clearAdminAuthCookies,
  createSupabaseClients,
  isAdminProfile,
  json,
  loadAdminProfile,
  normalizeAdminSession,
  parseCookies,
  setAdminAuthCookies,
} from './_shared.mjs';

const decodeBase64Url = (value) => {
  try {
    const normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
    const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
    return Buffer.from(`${normalized}${padding}`, 'base64').toString('utf8');
  } catch {
    return null;
  }
};

const extractAal = (token) => {
  const parts = String(token || '').split('.');
  if (parts.length < 2) return null;

  const decoded = decodeBase64Url(parts[1]);
  if (!decoded) return null;

  try {
    const payload = JSON.parse(decoded);
    return typeof payload?.aal === 'string' ? payload.aal : null;
  } catch {
    return null;
  }
};

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Cache-Control', 'no-store');
    res.status(204).end();
    return;
  }

  if (req.method !== 'GET') {
    json(res, 405, { success: false, error: 'Metodo nao permitido.' });
    return;
  }

  const cookies = parseCookies(req);
  const accessToken = cookies[ADMIN_ACCESS_COOKIE];
  const refreshToken = cookies[ADMIN_REFRESH_COOKIE];

  if (!accessToken || !refreshToken) {
    clearAdminAuthCookies(res);
    json(res, 401, { success: false, error: 'Sessao administrativa indisponivel.' });
    return;
  }

  try {
    const { supabaseAuth, supabaseAdmin } = createSupabaseClients();
    const normalizedSession = await normalizeAdminSession(supabaseAuth, accessToken, refreshToken);

    if (!normalizedSession.success || !normalizedSession.user?.id || !normalizedSession.session) {
      clearAdminAuthCookies(res);
      json(res, 401, { success: false, error: 'Sessao administrativa indisponivel.' });
      return;
    }

    const { data: profile, error: profileError } = await loadAdminProfile(supabaseAdmin, normalizedSession.user.id);
    if (profileError || !isAdminProfile(profile) || profile?.is_suspended) {
      clearAdminAuthCookies(res);
      json(res, 403, { success: false, error: 'Acesso administrativo indisponivel.' });
      return;
    }

    setAdminAuthCookies(res, normalizedSession.session);
    json(res, 200, {
      success: true,
      session: normalizedSession.session,
      admin: {
        userId: normalizedSession.user.id,
        currentLevel: extractAal(normalizedSession.session.accessToken),
        requiresMfa: extractAal(normalizedSession.session.accessToken) !== 'aal2',
      },
    });
  } catch (error) {
    console.error('[api/admin-auth/session] unexpected error:', error);
    clearAdminAuthCookies(res);
    json(res, 500, {
      success: false,
      error: 'Nao foi possivel restaurar a sessao administrativa.',
    });
  }
}
