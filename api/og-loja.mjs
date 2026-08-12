import { createClient } from '@supabase/supabase-js';
import sitemapHandler from '../server/sitemap-handler.mjs';
import { createDocumentStatusHandler, fetchTrustedIndexHtml } from '../server/document-status-handler.mjs';
import { CANONICAL_ORIGIN } from '../server/trusted-origin.mjs';

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

// Remove as tags OG/Twitter/título/description estáticas do index.html para
// substituí-las pelas da loja (o crawler usa a primeira ocorrência; deixar as
// duas geraria conflito).
const stripDefaultHeadTags = (html) =>
  html
    .replace(/<title>[\s\S]*?<\/title>/i, '')
    .replace(/<meta[^>]+(?:property|name)=["'](?:og:[^"']*|twitter:[^"']*|description)["'][^>]*>/gi, '');

// Monta o HTML com o <head> OG a partir de dados de loja JÁ carregados (ou home
// quando store=null). Puro/reutilizável: usado pelo fluxo OG legado e pelo modo
// `document` (que passa a loja já validada, evitando consulta duplicada).
export const renderStoreOgHtml = ({ html, store, ogImageUrl, baseUrl }) => {
  const image = ogImageUrl || `${baseUrl}${OG_IMAGE_FILE}`;

  let title;
  let description;
  let url;

  if (store) {
    title = `${store.store_name} | Loja Parceira AGRO BW`;
    const rawDescription =
      (store.description && store.description.trim()) ||
      `Conheça a loja ${store.store_name}, veja anúncios disponíveis e negocie oportunidades no agronegócio pela AGRO BW.`;
    description = rawDescription.slice(0, 200);
    url = `${baseUrl}/loja/${store.slug}`;
  } else {
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

  return stripDefaultHeadTags(html).replace('</head>', `${ogBlock}</head>`);
};

// Fluxo OG original (inalterado): prerender de <head> para crawlers sociais.
async function handleOgRequest(req, res) {
  const slug = String(req.query?.slug || '').trim();

  // Index.html buscado numa origem confiável (env, nunca Host) e com timeout real
  // (não pendura). Mantém o fallback 302 legado em caso de falha.
  let html = '';
  try {
    html = await fetchTrustedIndexHtml();
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
        ogImageUrl = layoutRes.data?.og_default_image_url || null;
      } else {
        const { data: layoutData } = await supabase
          .from('layout_settings')
          .select('og_default_image_url')
          .limit(1)
          .maybeSingle();
        ogImageUrl = layoutData?.og_default_image_url || null;
      }
    } catch {
      store = null;
    }
  }

  if (!hasEnv) {
    serveRaw();
    return;
  }

  const isPublicStore =
    store && store.is_active && store.is_store_feature_enabled && !store.is_paused_due_to_plan;

  // Slug informado mas loja inexistente/indisponível: SPA cru ("loja não encontrada").
  if (slug && !isPublicStore) {
    serveRaw();
    return;
  }

  const finalHtml = renderStoreOgHtml({
    html,
    store: isPublicStore ? store : null,
    ogImageUrl,
    baseUrl: CANONICAL_ORIGIN,
  });

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=300, stale-while-revalidate=600');
  res.status(200).send(finalHtml);
}

// Handler de status de documento (Fase 2A), reusando esta function. Recebe o
// renderizador de OG da loja para produzir o card específico a partir dos dados
// já validados (sem consulta duplicada).
const documentStatusHandler = createDocumentStatusHandler({ renderStoreOg: renderStoreOgHtml });

// Dispatcher de SEO: esta function pública é reutilizada para servir sitemap e,
// agora, validação de status de documento — evitando novas Serverless Functions
// (limite de 12 no plano Hobby). Cada modo é acionado por um marcador interno
// EXATO; sem marcador (ou valor diferente) segue o fluxo OG original, sem
// misturar headers XML e HTML.
export const createSeoDispatcher = ({ sitemap, og, document }) =>
  async function handler(req, res) {
    if (req.query?._seo_route === 'sitemap') {
      return sitemap(req, res);
    }
    if (req.query?._seo_route === 'document' && document) {
      return document(req, res);
    }
    return og(req, res);
  };

export default createSeoDispatcher({
  sitemap: sitemapHandler,
  og: handleOgRequest,
  document: documentStatusHandler,
});
