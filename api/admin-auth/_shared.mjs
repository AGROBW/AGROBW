import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
  throw new Error('Missing SUPABASE_URL/SUPABASE_ANON_KEY/SUPABASE_SERVICE_ROLE_KEY');
}

export const ADMIN_ACCESS_COOKIE = 'bwagro_admin_access';
export const ADMIN_REFRESH_COOKIE = 'bwagro_admin_refresh';

const isProductionLike = () =>
  ['production', 'preview'].includes(String(process.env.VERCEL_ENV || '').toLowerCase()) ||
  String(process.env.NODE_ENV || '').toLowerCase() === 'production';

export const createSupabaseClients = () => ({
  supabaseAuth: createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  }),
  supabaseAdmin: createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  }),
});

export const json = (res, status, body, headers = {}) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  for (const [name, value] of Object.entries(headers)) {
    res.setHeader(name, value);
  }

  res.status(status).json(body);
};

export const parseJsonBody = async (req) => {
  if (req.body && typeof req.body === 'object') {
    return req.body;
  }

  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  if (!chunks.length) {
    return {};
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    return {};
  }
};

export const parseCookies = (req) => {
  const rawHeader = String(req.headers.cookie || '');
  return rawHeader.split(';').reduce((accumulator, pair) => {
    const [rawName, ...rest] = pair.split('=');
    const name = String(rawName || '').trim();
    if (!name) {
      return accumulator;
    }

    accumulator[name] = decodeURIComponent(rest.join('=').trim());
    return accumulator;
  }, {});
};

const serializeCookie = (name, value, options = {}) => {
  const parts = [`${name}=${encodeURIComponent(String(value || ''))}`];

  if (options.maxAge !== undefined) {
    parts.push(`Max-Age=${Math.max(0, Number(options.maxAge) || 0)}`);
  }

  parts.push(`Path=${options.path || '/api/admin-auth'}`);

  if (options.httpOnly !== false) {
    parts.push('HttpOnly');
  }

  if (options.secure !== false && isProductionLike()) {
    parts.push('Secure');
  }

  parts.push(`SameSite=${options.sameSite || 'Strict'}`);
  parts.push(`Priority=${options.priority || 'High'}`);

  return parts.join('; ');
};

export const setAdminAuthCookies = (res, session) => {
  const cookies = [
    serializeCookie(ADMIN_ACCESS_COOKIE, session.accessToken, {
      path: '/api/admin-auth',
    }),
    serializeCookie(ADMIN_REFRESH_COOKIE, session.refreshToken, {
      path: '/api/admin-auth',
    }),
  ];

  res.setHeader('Set-Cookie', cookies);
};

export const clearAdminAuthCookies = (res) => {
  res.setHeader('Set-Cookie', [
    serializeCookie(ADMIN_ACCESS_COOKIE, '', {
      path: '/api/admin-auth',
      maxAge: 0,
    }),
    serializeCookie(ADMIN_REFRESH_COOKIE, '', {
      path: '/api/admin-auth',
      maxAge: 0,
    }),
  ]);
};

export const getRequestOrigin = (req) => {
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').trim();
  const proto = String(req.headers['x-forwarded-proto'] || (isProductionLike() ? 'https' : 'http')).trim();

  if (!host || !proto) {
    return null;
  }

  return `${proto}://${host}`;
};

export const isSameOriginRequest = (req) => {
  const expectedOrigin = getRequestOrigin(req);
  if (!expectedOrigin) {
    return true;
  }

  const origin = String(req.headers.origin || '').trim();
  if (origin) {
    return origin === expectedOrigin;
  }

  const referer = String(req.headers.referer || '').trim();
  if (referer) {
    return referer.startsWith(`${expectedOrigin}/`) || referer === expectedOrigin;
  }

  return true;
};

export const ensureSameOriginPost = (req, res) => {
  if (!isSameOriginRequest(req)) {
    json(res, 403, {
      success: false,
      error: 'Nao foi possivel validar a origem da solicitacao.',
    });
    return false;
  }

  return true;
};

export const normalizeAdminSession = async (supabaseAuth, accessToken, refreshToken) => {
  const normalizedAccessToken = String(accessToken || '').trim();
  const normalizedRefreshToken = String(refreshToken || '').trim();

  if (!normalizedAccessToken || !normalizedRefreshToken) {
    return { success: false, error: 'missing_tokens' };
  }

  const {
    data: { user },
    error: userError,
  } = await supabaseAuth.auth.getUser(normalizedAccessToken);

  if (!userError && user) {
    return {
      success: true,
      user,
      session: {
        accessToken: normalizedAccessToken,
        refreshToken: normalizedRefreshToken,
      },
    };
  }

  const { data: sessionData, error: sessionError } = await supabaseAuth.auth.setSession({
    access_token: normalizedAccessToken,
    refresh_token: normalizedRefreshToken,
  });

  if (sessionError || !sessionData?.session || !sessionData.user) {
    return { success: false, error: sessionError?.message || 'invalid_session' };
  }

  return {
    success: true,
    user: sessionData.user,
    session: {
      accessToken: sessionData.session.access_token,
      refreshToken: sessionData.session.refresh_token,
      expiresAt: sessionData.session.expires_at,
      expiresIn: sessionData.session.expires_in,
      tokenType: sessionData.session.token_type,
    },
  };
};

export const isAdminProfile = (profile) => String(profile?.role || '').trim().toLowerCase() === 'admin';

export const loadAdminProfile = async (supabaseAdmin, userId) =>
  supabaseAdmin
    .from('users')
    .select('id, role, is_admin, is_suspended')
    .eq('id', userId)
    .maybeSingle();
