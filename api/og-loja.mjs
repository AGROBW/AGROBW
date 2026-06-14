import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

const DEFAULT_TITLE = 'AGRO BW | Marketplace Rural';
const DEFAULT_DESCRIPTION =
  'Marketplace rural para comprar, vender e anunciar no agronegócio com mais visibilidade.';
const OG_IMAGE_FILE = '/og-default.png';

const escapeHtml = (value) =>
  String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

const buildBaseUrl = (req) => {
  const proto = (req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return `${proto}://${host}`;
};

// Remove as tags OG/Twitter/título/description estáticas do index.html para
// substituí-las pelas da loja (o crawler usa a primeira ocorrência; deixar as
// duas geraria conflito).
const stripDefaultHeadTags = (html) =>
  html
    .replace(/<title>[\s\S]*?<\/title>/i, '')
    .replace(/<meta[^>]+(?:property|name)=["'](?:og:[^"']*|twitter:[^"']*|description)["'][^>]*>/gi, '');

export default async function handler(req, res) {
  const slug = String(req.query?.slug || '').trim();
  const baseUrl = buildBaseUrl(req);

  let html = '';
  try {
    const indexResponse = await fetch(`${baseUrl}/index.html`);
    html = await indexResponse.text();
  } catch {
    res.status(302).setHeader('Location', '/lojas-parceiras');
    res.end();
    return;
  }

  const serveRaw = () => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=60');
    res.status(200).send(html);
  };

  const hasEnv = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

  // Busca: imagem OG do painel (sempre) + a loja (quando houver slug).
  let store = null;
  let ogImageUrl = null;
  let queryError = null;
  if (hasEnv) {
    try {
      const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      });

      if (slug) {
        const [storeRes, layoutRes] = await Promise.all([
          supabase
            .from('seller_stores')
            .select('slug, store_name, description, is_active, is_store_feature_enabled, is_paused_due_to_plan')
            .eq('slug', slug)
            .maybeSingle(),
          supabase.from('layout_settings').select('og_default_image_url').limit(1).maybeSingle(),
        ]);
        store = storeRes.data;
        queryError = storeRes.error?.message || layoutRes.error?.message || null;
        ogImageUrl = layoutRes.data?.og_default_image_url || null;
      } else {
        const { data: layoutData, error } = await supabase
          .from('layout_settings')
          .select('og_default_image_url')
          .limit(1)
          .maybeSingle();
        ogImageUrl = layoutData?.og_default_image_url || null;
        queryError = error?.message || null;
      }
    } catch (err) {
      store = null;
      queryError = String(err?.message || err);
    }
  }

  // Modo debug: /api/og-loja?slug=...&debug=1  → diagnóstico em JSON (não cacheado).
  if (req.query?.debug === '1') {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({
      slug: slug || null,
      hasEnv,
      storeFound: Boolean(store),
      storeFlags: store
        ? {
            is_active: store.is_active,
            is_store_feature_enabled: store.is_store_feature_enabled,
            is_paused_due_to_plan: store.is_paused_due_to_plan,
          }
        : null,
      ogImageUrl,
      queryError,
    });
    return;
  }

  if (!hasEnv) {
    serveRaw();
    return;
  }

  // Imagem do card: prioriza a configurada no painel admin; senão o arquivo estático.
  const image = ogImageUrl || `${baseUrl}${OG_IMAGE_FILE}`;

  const isPublicStore =
    store && store.is_active && store.is_store_feature_enabled && !store.is_paused_due_to_plan;

  // Slug informado mas loja inexistente/indisponível: SPA cru ("loja não encontrada").
  if (slug && !isPublicStore) {
    serveRaw();
    return;
  }

  let title;
  let description;
  let url;

  if (isPublicStore) {
    title = `${store.store_name} | Loja Parceira AGRO BW`;
    const rawDescription =
      (store.description && store.description.trim()) ||
      `Conheça a loja ${store.store_name}, veja anúncios disponíveis e negocie oportunidades no agronegócio pela AGRO BW.`;
    description = rawDescription.slice(0, 200);
    url = `${baseUrl}/loja/${store.slug}`;
  } else {
    // Home (sem slug).
    title = DEFAULT_TITLE;
    description = DEFAULT_DESCRIPTION;
    url = `${baseUrl}/`;
  }

  const ogBlock = `
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}" />
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <meta property="og:type" content="website" />
    <meta property="og:url" content="${escapeHtml(url)}" />
    <meta property="og:locale" content="pt_BR" />
    <meta property="og:site_name" content="AGRO BW" />
    <meta property="og:image" content="${escapeHtml(image)}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtml(title)}" />
    <meta name="twitter:description" content="${escapeHtml(description)}" />
    <meta name="twitter:image" content="${escapeHtml(image)}" />
  `;

  const finalHtml = stripDefaultHeadTags(html).replace('</head>', `${ogBlock}</head>`);

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=300, stale-while-revalidate=600');
  res.status(200).send(finalHtml);
}
