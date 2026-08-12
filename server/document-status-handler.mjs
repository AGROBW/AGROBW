import { createClient } from '@supabase/supabase-js';
import { classifyRoute, mapOutcomeToStatus, buildStatusHeaders } from './document-status-core.mjs';
import {
  isEligibleAnnouncement,
  isEligibleStore,
  isEligibleNews,
  isEligibleCms,
} from './sitemap-core.mjs';
import { CANONICAL_ORIGIN } from './trusted-origin.mjs';

// Handler server-side de status HTTP real por documento (Lote 3, Fase 2A). Vive
// FORA de api/ (não é uma Serverless Function própria — limite de 12 no Hobby);
// é despachado pela function pública api/og-loja.mjs no modo `_seo_route=document`.
// Usa apenas anon + RLS, nunca service role. Nunca lança; falhas → 503 seguro.
// Nunca emite 410.

export const QUERY_TIMEOUT_MS = 5000;
export const INDEX_TIMEOUT_MS = 3000;

const NEUTRAL_503_HTML =
  '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="robots" content="noindex, nofollow"><title>Serviço temporariamente indisponível</title></head><body></body></html>';

// Detector padrão de crawler social (mesma lista social do rewrite OG, sem
// motores de busca — anti-cloaking).
const SOCIAL_UA_RE =
  /(facebookexternalhit|facebot|twitterbot|whatsapp|linkedinbot|slackbot|telegrambot|discordbot|pinterest|redditbot|embedly|skypeuripreview|vkshare|qwantify|bitlybot)/i;

// Marcador estável do index.html REAL da aplicação (container root do projeto).
// response.ok NÃO é suficiente: a proteção de deployment da Vercel (página de
// login/SSO) e páginas de erro/terceiros retornam 200 sem este marcador e nunca
// devem receber OG nem ser servidas como SPA válida.
export const APP_INDEX_MARKER = /<div[^>]*\bid=["']root["']/i;

export const isAppIndexHtml = (html) => typeof html === 'string' && APP_INDEX_MARKER.test(html);

// Busca o index.html na origem CANÔNICA (sempre agrobw.com.br; nunca headers nem
// VERCEL_URL), recebendo o signal do timeout. Injetável para testes.
const defaultFetchIndexHtml = async (origin, signal) => {
  const response = await fetch(`${origin}/index.html`, { signal });
  if (!response || !response.ok) throw new Error('index_unavailable');
  return response.text();
};

// Carrega o index.html com timeout REAL: AbortController próprio + race contra um
// timer, garantindo encerramento mesmo que o fetch injetado ignore o signal.
// clearTimeout no finally. Lança em timeout/erro.
export const loadIndexWithTimeout = async (fetchImpl, origin, timeoutMs) => {
  const controller = new AbortController();
  let timer;
  const timeout = new Promise((_resolve, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      const error = new Error('index_timeout');
      error.name = 'TimeoutError';
      reject(error);
    }, timeoutMs);
  });
  try {
    return await Promise.race([
      Promise.resolve().then(() => fetchImpl(origin, controller.signal)),
      timeout,
    ]);
  } finally {
    clearTimeout(timer);
  }
};

// Carrega e VALIDA o index.html canônico: origem sempre CANONICAL_ORIGIN, timeout
// real e exigência do marcador root. Rejeita (lança) se ausente/inválido — o
// chamador decide (document → 503; OG legado → fallback 302). Compartilhado.
export const loadCanonicalIndexHtml = (fetchImpl = defaultFetchIndexHtml, timeoutMs = INDEX_TIMEOUT_MS) =>
  loadIndexWithTimeout(fetchImpl, CANONICAL_ORIGIN, timeoutMs).then((html) => {
    if (!isAppIndexHtml(html)) throw new Error('index_invalid');
    return html;
  });

// Conveniência compartilhada com o OG legado.
export const fetchTrustedIndexHtml = ({
  timeoutMs = INDEX_TIMEOUT_MS,
  fetchImpl = defaultFetchIndexHtml,
} = {}) => loadCanonicalIndexHtml(fetchImpl, timeoutMs);

const defaultIsSocialCrawler = (req) => SOCIAL_UA_RE.test(String(req?.headers?.['user-agent'] || ''));

// Executa UMA consulta anon por tipo e devolve um resultado SIMBÓLICO
// (found/not_found/transient_error/timeout) + dados da loja quando aplicável.
// Nunca propaga erro cru/URL/credencial.
const queryOutcome = async (client, route, signal, nowMs) => {
  try {
    if (route.type === 'ad') {
      const { data, error } = await client
        .from('announcements')
        .select('id, status, expires_at')
        .eq('id', route.id)
        .abortSignal(signal)
        .maybeSingle();
      if (error) return { outcome: 'transient_error' };
      return data && isEligibleAnnouncement(data, nowMs) ? { outcome: 'found' } : { outcome: 'not_found' };
    }

    if (route.type === 'store') {
      const { data, error } = await client
        .from('seller_stores')
        .select('slug, store_name, description, is_active, is_store_feature_enabled, is_paused_due_to_plan')
        .eq('slug', route.slug)
        .abortSignal(signal)
        .maybeSingle();
      if (error) return { outcome: 'transient_error' };
      return data && isEligibleStore(data) ? { outcome: 'found', store: data } : { outcome: 'not_found' };
    }

    if (route.type === 'news') {
      const { data, error } = await client
        .from('news_articles')
        .select('slug, status')
        .eq('slug', route.slug)
        .abortSignal(signal)
        .maybeSingle();
      if (error) return { outcome: 'transient_error' };
      return data && isEligibleNews(data) ? { outcome: 'found' } : { outcome: 'not_found' };
    }

    if (route.type === 'cms') {
      const { data, error } = await client
        .from('institutional_pages')
        .select('slug, is_published')
        .eq('slug', route.slug)
        .abortSignal(signal)
        .maybeSingle();
      if (error) return { outcome: 'transient_error' };
      return data && isEligibleCms(data) ? { outcome: 'found' } : { outcome: 'not_found' };
    }

    return { outcome: 'not_found' };
  } catch (err) {
    if ((err && err.name === 'AbortError') || signal?.aborted) return { outcome: 'timeout' };
    return { outcome: 'transient_error' };
  }
};

// Consulta OPCIONAL da imagem OG do painel. Falha aqui NUNCA muda o status da
// loja (found permanece 200); apenas cai para o fallback og-default.png.
const fetchOgImageUrl = async (client, queryTimeoutMs) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), queryTimeoutMs);
  try {
    const { data } = await client
      .from('layout_settings')
      .select('og_default_image_url')
      .limit(1)
      .abortSignal(controller.signal)
      .maybeSingle();
    return data?.og_default_image_url || null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
};

// Acrescenta "User-Agent" ao Vary de forma DEDUPLICADA, preservando qualquer
// valor Vary preexistente. Helper específico do modo document — o corpo pode
// variar entre SPA (navegador) e OG (crawler social) para a mesma URL, então a
// resposta precisa declarar Vary p/ o cache não misturar variantes. NÃO é usado
// pelo sitemap nem pelo OG legado.
export const withUserAgentVary = (headers = {}) => {
  const existing = headers.Vary ?? headers.vary ?? '';
  const tokens = String(existing)
    .split(',')
    .map((token) => token.trim())
    .filter(Boolean);
  const hasUserAgent = tokens.some((token) => token.toLowerCase() === 'user-agent');
  const merged = hasUserAgent ? tokens : [...tokens, 'User-Agent'];
  return { ...headers, Vary: merged.join(', ') };
};

// Todas as respostas de CONTEÚDO do modo document passam por aqui e declaram
// Vary: User-Agent (a política de conteúdo do endpoint varia por UA).
const sendResponse = (res, method, status, headers, body) => {
  const finalHeaders = withUserAgentVary(headers);
  for (const [key, value] of Object.entries(finalHeaders)) res.setHeader(key, value);
  if (method === 'HEAD') {
    res.status(status).end();
    return;
  }
  res.status(status).send(body);
};

export const createDocumentStatusHandler = (deps = {}) => {
  const {
    createClient: createClientFn = createClient,
    // fetchIndexHtml(origin, signal) — origem confiável derivada só de env.
    fetchIndexHtml = defaultFetchIndexHtml,
    isSocialCrawler = defaultIsSocialCrawler,
    // Renderizador de OG da loja (injetado por og-loja com os dados já carregados).
    // Fallback identidade: crawler recebe SPA cru (200), sem OG — degradação segura.
    renderStoreOg = ({ html }) => html,
    logger = console,
    now = () => Date.now(),
    env = process.env,
    queryTimeoutMs = QUERY_TIMEOUT_MS,
    indexTimeoutMs = INDEX_TIMEOUT_MS,
  } = deps;

  const getClient = () => {
    const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL || '';
    const key = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || '';
    if (!url || !key) return null;
    return createClientFn(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  };

  return async function handler(req, res) {
    const method = req.method || 'GET';
    if (method !== 'GET' && method !== 'HEAD') {
      res.setHeader('Allow', 'GET, HEAD');
      res.status(405).end();
      return;
    }

    const targetPath = typeof req.query?.path === 'string' && req.query.path ? req.query.path : '/';
    const route = classifyRoute(targetPath);

    // Corpo SPA para todos os status. Index SEMPRE canônico (agrobw.com.br) +
    // timeout real + validação do marcador root. Falha/timeout/HTML inválido
    // (ex.: proteção de deployment/login) → 503 (nunca 404/redirect/OG).
    let html;
    try {
      html = await loadCanonicalIndexHtml(fetchIndexHtml, indexTimeoutMs);
    } catch {
      logger.warn('[document] index indisponivel');
      sendResponse(res, method, 503, buildStatusHeaders(503), NEUTRAL_503_HTML);
      return;
    }

    // Rotas não-dinâmicas: status já definido pela classificação, sem banco.
    if (!route.needsDb) {
      sendResponse(res, method, route.status, buildStatusHeaders(route.status), html);
      return;
    }

    // Dinâmicas: exigem anon client. Config ausente / createClient lançando → 503.
    let client = null;
    try {
      client = getClient();
    } catch {
      client = null;
    }
    if (!client) {
      logger.warn('[document] config indisponivel');
      sendResponse(res, method, 503, buildStatusHeaders(503), html);
      return;
    }

    // Consulta única por requisição, com AbortController PRÓPRIO (não compartilhado).
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), queryTimeoutMs);
    let result;
    try {
      result = await queryOutcome(client, route, controller.signal, now());
    } finally {
      clearTimeout(timer);
    }

    const status = mapOutcomeToStatus(result.outcome);
    if (result.outcome !== 'found' && result.outcome !== 'not_found') {
      logger.warn(`[document] ${route.type} indisponivel`);
    }

    // Loja encontrada + crawler social: HTML com OG específico, reusando os
    // dados já carregados (sem nova consulta a seller_stores).
    let body = html;
    if (status === 200 && route.type === 'store' && result.store && isSocialCrawler(req)) {
      const ogImageUrl = await fetchOgImageUrl(client, queryTimeoutMs);
      try {
        // baseUrl SEMPRE canônico (og:url/og:image nunca do Host da requisição).
        body = renderStoreOg({ html, store: result.store, ogImageUrl, baseUrl: CANONICAL_ORIGIN });
      } catch {
        body = html; // render nunca transforma um 200 encontrado em erro
      }
    }

    sendResponse(res, method, status, buildStatusHeaders(status), body);
  };
};

export default createDocumentStatusHandler();
