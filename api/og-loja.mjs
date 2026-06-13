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

  // Sem slug ou sem Supabase configurado: devolve o SPA cru (tags padrão).
  if (!slug || !SUPABASE_URL || !SUPABASE_ANON_KEY) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=60');
    res.status(200).send(html);
    return;
  }

  let store = null;
  let ogImageUrl = null;
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const [{ data: storeData }, { data: layoutData }] = await Promise.all([
      supabase
        .from('seller_stores')
        .select('slug, store_name, description, logo_url, cover_url, is_active, is_store_feature_enabled, is_paused_due_to_plan')
        .eq('slug', slug)
        .maybeSingle(),
      supabase.from('layout_settings').select('og_default_image_url').limit(1).maybeSingle(),
    ]);
    store = storeData;
    ogImageUrl = layoutData?.og_default_image_url || null;
  } catch {
    store = null;
  }

  // Loja inexistente ou indisponível publicamente: SPA cru (que mostra "loja não encontrada").
  const isPublic =
    store && store.is_active && store.is_store_feature_enabled && !store.is_paused_due_to_plan;

  if (!isPublic) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=60');
    res.status(200).send(html);
    return;
  }

  const title = `${store.store_name} | Loja Parceira AGRO BW`;
  const rawDescription =
    (store.description && store.description.trim()) ||
    `Conheça a loja ${store.store_name}, veja anúncios disponíveis e negocie oportunidades no agronegócio pela AGRO BW.`;
  const description = rawDescription.slice(0, 200);
  // Imagem única de marca AGRO BW para todas as lojas (decisão de produto).
  // Prioriza a imagem configurada no painel admin (Layout); senão usa o arquivo estático.
  const image = ogImageUrl || `${baseUrl}${OG_IMAGE_FILE}`;
  const url = `${baseUrl}/loja/${store.slug}`;

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
