import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.48.1';
import { getCorsHeaders } from '../_shared/cors.ts';

const EXPORT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SIGNED_URL_TTL_SECONDS = 15 * 60;

const safeFilename = (value: unknown) => {
  const normalized = String(value || 'catalogo-agro-bw')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return `${normalized || 'catalogo-agro-bw'}.pdf`;
};

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  const jsonResponse = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ success: false, error: 'Metodo nao permitido.' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return jsonResponse({ success: false, error: 'Servico indisponivel.' }, 500);
  }

  const authHeader = req.headers.get('Authorization') || '';
  if (!authHeader.startsWith('Bearer ')) {
    return jsonResponse({ success: false, error: 'Nao autorizado.' }, 401);
  }
  const token = authHeader.slice(7).trim();
  const authClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authError } = await authClient.auth.getUser(token);
  if (authError || !authData.user) {
    return jsonResponse({ success: false, error: 'Nao autorizado.' }, 401);
  }

  const body = await req.json().catch(() => ({}));
  const exportId = String(body?.exportId || '').trim();
  if (!EXPORT_ID_PATTERN.test(exportId)) {
    return jsonResponse({ success: false, error: 'Exportacao invalida.' }, 400);
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: catalog, error: catalogError } = await supabaseAdmin
    .from('seller_store_catalog_exports')
    .select('id,user_id,status,storage_path,catalog_title,expires_at')
    .eq('id', exportId)
    .eq('user_id', authData.user.id)
    .maybeSingle();

  if (catalogError) return jsonResponse({ success: false, error: 'Falha ao consultar o catalogo.' }, 500);
  if (!catalog) return jsonResponse({ success: false, error: 'Catalogo nao encontrado.' }, 404);
  if (catalog.status !== 'ready' || !catalog.storage_path || Date.parse(catalog.expires_at) <= Date.now()) {
    return jsonResponse({ success: false, error: 'Catalogo indisponivel para download.' }, 409);
  }

  const { data: signed, error: signedError } = await supabaseAdmin.storage
    .from('seller-store-catalogs')
    .createSignedUrl(catalog.storage_path, SIGNED_URL_TTL_SECONDS, {
      download: safeFilename(catalog.catalog_title),
    });
  if (signedError || !signed?.signedUrl) {
    return jsonResponse({ success: false, error: 'Nao foi possivel preparar o download.' }, 500);
  }

  return jsonResponse({
    success: true,
    signedUrl: signed.signedUrl,
    expiresIn: SIGNED_URL_TTL_SECONDS,
    filename: safeFilename(catalog.catalog_title),
  });
});
