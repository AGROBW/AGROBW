import {
  clearAdminAuthCookies,
  createSupabaseClients,
  ensureSameOriginPost,
  json,
  parseJsonBody,
  setAdminAuthCookies,
} from './_shared.mjs';

const buildForwardedHeaders = (req) => {
  const forwardedHeaders = {};
  const passthroughNames = [
    'user-agent',
    'cf-connecting-ip',
    'x-real-ip',
    'x-forwarded-for',
    'origin',
  ];

  for (const headerName of passthroughNames) {
    const headerValue = req.headers[headerName];
    if (!headerValue) continue;

    forwardedHeaders[headerName] = Array.isArray(headerValue) ? headerValue.join(', ') : String(headerValue);
  }

  return forwardedHeaders;
};

const invokeAdminLoginFunction = async (req, payload) => {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

  const response = await fetch(`${supabaseUrl}/functions/v1/admin-login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${supabaseAnonKey}`,
      ...buildForwardedHeaders(req),
    },
    body: JSON.stringify(payload),
  });

  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  return { response, data };
};

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
    const { response, data } = await invokeAdminLoginFunction(req, body);

    if (!response.ok || !data?.success || !data?.session?.accessToken || !data?.session?.refreshToken) {
      clearAdminAuthCookies(res);
      json(res, response.status || 400, data || {
        success: false,
        error: 'Nao foi possivel concluir o acesso.',
      });
      return;
    }

    setAdminAuthCookies(res, data.session);
    json(res, 200, data);
  } catch (error) {
    console.error('[api/admin-auth/login] unexpected error:', error);
    clearAdminAuthCookies(res);
    json(res, 500, {
      success: false,
      error: 'Nao foi possivel concluir o acesso agora. Tente novamente em instantes.',
    });
  }
}
