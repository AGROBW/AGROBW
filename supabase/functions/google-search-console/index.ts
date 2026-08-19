import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.48.1';
import { getCorsHeaders, handleCorsPreflightBrowser } from '../_shared/cors.ts';
import { checkRateLimit, rateLimitResponse } from '../_shared/rateLimit.ts';
import {
  extractBearerToken,
  isAdminAal2Profile,
  logSecurityEvent,
} from '../_shared/security.ts';
import {
  buildSearchConsoleDateRange,
  buildMetricComparison,
  buildPreviousSearchConsoleDateRange,
  buildPageSpeedRecommendations,
  buildSeoOpportunities,
  evaluateIndexMonitorItem,
  normalizeInspectionUrl,
  normalizeMetric,
  normalizePageSpeedStrategy,
  normalizePeriod,
  normalizeSearchConsoleAction,
  summarizeIndexMonitor,
  scoreToPercent,
  type SearchConsolePeriod,
} from './core.ts';

const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const SEARCH_CONSOLE_SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';
const PAGESPEED_SCOPE = 'openid';
const SEARCH_ANALYTICS_BASE = 'https://www.googleapis.com/webmasters/v3/sites';
const URL_INSPECTION_ENDPOINT = 'https://searchconsole.googleapis.com/v1/urlInspection/index:inspect';
const PAGESPEED_ENDPOINT = 'https://pagespeedonline.googleapis.com/pagespeedonline/v5/runPagespeed';

type ServiceAccount = {
  client_email: string;
  private_key: string;
};

type SearchAnalyticsRow = {
  keys?: string[];
  clicks?: number;
  impressions?: number;
  ctr?: number;
  position?: number;
};

const jsonResponse = (req: Request, body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...getCorsHeaders(req),
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'private, no-store',
    },
  });

const base64Url = (value: Uint8Array | string) => {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
};

const decodeBase64Json = (encoded: string): ServiceAccount => {
  const binary = atob(encoded.replace(/\s+/g, ''));
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  const parsed = JSON.parse(new TextDecoder().decode(bytes));

  if (typeof parsed?.client_email !== 'string' || typeof parsed?.private_key !== 'string') {
    throw new Error('invalid_service_account');
  }

  return { client_email: parsed.client_email, private_key: parsed.private_key };
};

const importPrivateKey = async (pem: string) => {
  const base64 = pem
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s+/g, '');
  const binary = atob(base64);
  const keyBytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));

  return crypto.subtle.importKey(
    'pkcs8',
    keyBytes,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
};

const fetchWithTimeout = async (url: string, init: RequestInit, timeoutMs = 10_000) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
};

const getGoogleAccessToken = async (account: ServiceAccount, scope = SEARCH_CONSOLE_SCOPE) => {
  const now = Math.floor(Date.now() / 1000);
  const encodedHeader = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const encodedClaims = base64Url(JSON.stringify({
    iss: account.client_email,
    scope,
    aud: TOKEN_ENDPOINT,
    iat: now,
    exp: now + 3600,
  }));
  const unsignedJwt = `${encodedHeader}.${encodedClaims}`;
  const privateKey = await importPrivateKey(account.private_key);
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    privateKey,
    new TextEncoder().encode(unsignedJwt),
  );
  const assertion = `${unsignedJwt}.${base64Url(new Uint8Array(signature))}`;

  const response = await fetchWithTimeout(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });

  if (!response.ok) throw new Error('google_token_failed');
  const payload = await response.json();
  if (typeof payload?.access_token !== 'string') throw new Error('google_token_missing');
  return payload.access_token as string;
};

const querySearchAnalytics = async (
  accessToken: string,
  siteUrl: string,
  period: ReturnType<typeof buildSearchConsoleDateRange>,
  dimensions: string[] = [],
  rowLimit = 25_000,
  type = 'web',
) => {
  const response = await fetchWithTimeout(
    `${SEARCH_ANALYTICS_BASE}/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        startDate: period.startDate,
        endDate: period.endDate,
        dimensions,
        rowLimit,
        dataState: 'final',
        type,
      }),
    },
  );

  if (!response.ok) throw new Error('search_console_query_failed');
  const payload = await response.json();
  return Array.isArray(payload?.rows) ? (payload.rows as SearchAnalyticsRow[]) : [];
};

const normalizeRow = (row: SearchAnalyticsRow) => ({
  clicks: normalizeMetric(row.clicks),
  impressions: normalizeMetric(row.impressions),
  ctr: normalizeMetric(row.ctr),
  position: normalizeMetric(row.position),
});

const fetchSitemaps = async (accessToken: string, siteUrl: string) => {
  const response = await fetchWithTimeout(
    `${SEARCH_ANALYTICS_BASE}/${encodeURIComponent(siteUrl)}/sitemaps`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!response.ok) throw new Error('sitemaps_query_failed');
  const payload = await response.json();
  return Array.isArray(payload?.sitemap) ? payload.sitemap : [];
};

const inspectUrl = async (accessToken: string, siteUrl: string, inspectionUrl: string) => {
  const response = await fetchWithTimeout(URL_INSPECTION_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ inspectionUrl, siteUrl, languageCode: 'pt-BR' }),
  });
  if (!response.ok) throw new Error('url_inspection_failed');
  return response.json();
};

const auditNumericValue = (audits: Record<string, Record<string, unknown>>, id: string) => {
  const value = Number(audits[id]?.numericValue);
  return Number.isFinite(value) ? value : null;
};

const fieldMetric = (experience: Record<string, unknown> | null | undefined, id: string) => {
  const metrics = experience?.metrics as Record<string, Record<string, unknown>> | undefined;
  const metric = metrics?.[id];
  if (!metric) return null;
  const percentile = Number(metric.percentile);
  return {
    value: Number.isFinite(percentile) ? percentile : null,
    category: typeof metric.category === 'string' ? metric.category : null,
  };
};

const runPageSpeed = async (
  url: string,
  strategy: 'mobile' | 'desktop',
  apiKey: string,
  accessToken: string,
) => {
  const params = new URLSearchParams({ url, strategy, locale: 'pt_BR' });
  ['performance', 'accessibility', 'best-practices', 'seo'].forEach((category) => params.append('category', category));
  if (apiKey) params.set('key', apiKey);

  const response = await fetchWithTimeout(`${PAGESPEED_ENDPOINT}?${params.toString()}`, {
    headers: apiKey ? {} : { Authorization: `Bearer ${accessToken}` },
  }, 60_000);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 429) throw new Error('pagespeed_quota_exceeded');
    if (response.status === 403) throw new Error('pagespeed_access_denied');
    throw new Error('pagespeed_query_failed');
  }
  const lighthouse = payload?.lighthouseResult || {};
  const audits = (lighthouse.audits || {}) as Record<string, Record<string, unknown>>;
  const categories = lighthouse.categories || {};
  const pageExperience = payload?.loadingExperience || null;
  const originExperience = payload?.originLoadingExperience || null;
  const selectedExperience = pageExperience?.metrics ? pageExperience : originExperience;

  return {
    url,
    finalUrl: lighthouse.finalUrl || payload?.id || url,
    strategy,
    analyzedAt: payload?.analysisUTCTimestamp || lighthouse.fetchTime || new Date().toISOString(),
    scores: {
      performance: scoreToPercent(categories.performance?.score),
      accessibility: scoreToPercent(categories.accessibility?.score),
      bestPractices: scoreToPercent(categories['best-practices']?.score),
      seo: scoreToPercent(categories.seo?.score),
    },
    lab: {
      lcpMs: auditNumericValue(audits, 'largest-contentful-paint'),
      cls: auditNumericValue(audits, 'cumulative-layout-shift'),
      tbtMs: auditNumericValue(audits, 'total-blocking-time'),
      fcpMs: auditNumericValue(audits, 'first-contentful-paint'),
      speedIndexMs: auditNumericValue(audits, 'speed-index'),
    },
    field: {
      source: pageExperience?.metrics ? 'page' : originExperience?.metrics ? 'origin' : 'none',
      overallCategory: selectedExperience?.overall_category || null,
      lcp: fieldMetric(selectedExperience, 'LARGEST_CONTENTFUL_PAINT_MS'),
      inp: fieldMetric(selectedExperience, 'INTERACTION_TO_NEXT_PAINT'),
      cls: fieldMetric(selectedExperience, 'CUMULATIVE_LAYOUT_SHIFT_SCORE'),
    },
    recommendations: buildPageSpeedRecommendations(audits),
    warnings: Array.isArray(lighthouse.runWarnings) ? lighthouse.runWarnings.slice(0, 3).map(String) : [],
  };
};

type MonitorCandidate = {
  url: string;
  type: 'announcement' | 'news' | 'store';
  label: string;
};

const loadMonitorCandidates = async (
  supabaseAdmin: ReturnType<typeof createClient>,
): Promise<{ candidates: MonitorCandidate[]; partial: boolean }> => {
  const now = new Date().toISOString();
  const settled = await Promise.allSettled([
    supabaseAdmin
      .from('announcements')
      .select('id,title,updated_at')
      .eq('status', 'ACTIVE')
      .or(`expires_at.is.null,expires_at.gt.${now}`)
      .order('updated_at', { ascending: false })
      .limit(2),
    supabaseAdmin
      .from('news_articles')
      .select('slug,title,updated_at')
      .eq('status', 'published')
      .order('updated_at', { ascending: false })
      .limit(2),
    supabaseAdmin
      .from('seller_stores')
      .select('slug,store_name,updated_at')
      .eq('is_active', true)
      .eq('is_store_feature_enabled', true)
      .or('is_paused_due_to_plan.is.null,is_paused_due_to_plan.eq.false')
      .order('updated_at', { ascending: false })
      .limit(2),
  ]);

  const rows = <T>(index: number): T[] => {
    const result = settled[index];
    if (result?.status !== 'fulfilled' || result.value.error || !Array.isArray(result.value.data)) return [];
    return result.value.data as T[];
  };
  const candidates: MonitorCandidate[] = [
    ...rows<{ id: string; title: string | null }>(0).map((item) => ({
      url: `https://agrobw.com.br/anuncio/${item.id}`,
      type: 'announcement' as const,
      label: item.title || 'Anúncio sem título',
    })),
    ...rows<{ slug: string; title: string | null }>(1).map((item) => ({
      url: `https://agrobw.com.br/noticias/${item.slug}`,
      type: 'news' as const,
      label: item.title || 'Notícia sem título',
    })),
    ...rows<{ slug: string; store_name: string | null }>(2).map((item) => ({
      url: `https://agrobw.com.br/loja/${item.slug}`,
      type: 'store' as const,
      label: item.store_name || 'Loja parceira',
    })),
  ];

  return {
    candidates,
    partial: settled.some((result) => result.status === 'rejected' || Boolean(result.value?.error)),
  };
};

const buildIndexMonitor = async (
  supabaseAdmin: ReturnType<typeof createClient>,
  accessToken: string,
  siteUrl: string,
) => {
  const { candidates, partial: candidatesPartial } = await loadMonitorCandidates(supabaseAdmin);
  const settled = await Promise.allSettled(
    candidates.map(async (candidate) => {
      const inspection = await inspectUrl(accessToken, siteUrl, candidate.url);
      const index = inspection?.inspectionResult?.indexStatusResult || {};
      return evaluateIndexMonitorItem({
        ...candidate,
        verdict: index.verdict,
        coverageState: index.coverageState,
        robotsTxtState: index.robotsTxtState,
        indexingState: index.indexingState,
        pageFetchState: index.pageFetchState,
        googleCanonical: index.googleCanonical,
        userCanonical: index.userCanonical,
        lastCrawlTime: index.lastCrawlTime,
      });
    }),
  );
  const items = settled.flatMap((result) => result.status === 'fulfilled' ? [result.value] : []);
  return summarizeIndexMonitor(
    items,
    new Date().toISOString(),
    candidatesPartial || settled.some((result) => result.status === 'rejected'),
  );
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return handleCorsPreflightBrowser(req);
  if (req.method !== 'POST') return jsonResponse(req, { success: false, error: 'Method not allowed' }, 405);

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const serviceAccountB64 = Deno.env.get('GOOGLE_SEARCH_CONSOLE_SERVICE_ACCOUNT_B64') || '';
    const siteUrl = Deno.env.get('GOOGLE_SEARCH_CONSOLE_SITE_URL') || '';
    const pageSpeedApiKey = Deno.env.get('GOOGLE_PAGESPEED_API_KEY') || '';

    if (!supabaseUrl || !anonKey || !serviceRoleKey || !serviceAccountB64 || !siteUrl) {
      return jsonResponse(req, { success: false, error: 'Integração não configurada' }, 503);
    }

    const token = extractBearerToken(req);
    if (!token) return jsonResponse(req, { success: false, error: 'Unauthorized' }, 401);

    const authClient = createClient(supabaseUrl, anonKey);
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
    const { data: { user }, error: authError } = await authClient.auth.getUser(token);

    if (authError || !user) return jsonResponse(req, { success: false, error: 'Unauthorized' }, 401);

    const { data: userProfile } = await supabaseAdmin
      .from('users')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();

    if (!isAdminAal2Profile(userProfile, token)) {
      await logSecurityEvent(supabaseAdmin, {
        req,
        attemptedRoute: '/functions/v1/google-search-console',
        attemptedAction: 'google_search_console_forbidden',
        userId: user.id,
        email: user.email ?? null,
        severity: 'warning',
        reason: 'Usuário sem permissão tentou consultar a Search Console.',
      });
      return jsonResponse(req, { success: false, error: 'Admin access required' }, 403);
    }

    const rateLimit = await checkRateLimit(supabaseAdmin, user.id, 'google-search-console');
    if (!rateLimit.allowed) return rateLimitResponse(getCorsHeaders(req), rateLimit.resetAt);

    const body = await req.json().catch(() => ({}));
    const action = normalizeSearchConsoleAction(body?.action);
    if (!action) return jsonResponse(req, { success: false, error: 'Ação inválida' }, 400);

    const periodDays = normalizePeriod(body?.periodDays);
    if (action === 'overview' && !periodDays) {
      return jsonResponse(req, { success: false, error: 'Período inválido' }, 400);
    }

    const account = decodeBase64Json(serviceAccountB64);

    if (action === 'pagespeed') {
      const pageSpeedUrl = normalizeInspectionUrl(body?.url);
      const strategy = normalizePageSpeedStrategy(body?.strategy);
      if (!pageSpeedUrl || !strategy) {
        return jsonResponse(req, { success: false, error: 'Informe uma URL válida e a estratégia mobile ou desktop' }, 400);
      }
      const pageSpeedToken = pageSpeedApiKey ? '' : await getGoogleAccessToken(account, PAGESPEED_SCOPE);
      return jsonResponse(req, {
        success: true,
        pageSpeed: await runPageSpeed(pageSpeedUrl, strategy, pageSpeedApiKey, pageSpeedToken),
      });
    }

    const googleToken = await getGoogleAccessToken(account);

    if (action === 'inspect-url') {
      const inspectionUrl = normalizeInspectionUrl(body?.inspectionUrl);
      if (!inspectionUrl) {
        return jsonResponse(req, { success: false, error: 'Informe uma URL válida do domínio agrobw.com.br' }, 400);
      }

      const inspection = await inspectUrl(googleToken, siteUrl, inspectionUrl);
      const index = inspection?.inspectionResult?.indexStatusResult || {};
      const mobile = inspection?.inspectionResult?.mobileUsabilityResult || {};
      const richResults = inspection?.inspectionResult?.richResultsResult || {};

      return jsonResponse(req, {
        success: true,
        inspection: {
          url: inspectionUrl,
          inspectionResultLink: inspection?.inspectionResult?.inspectionResultLink || null,
          index: {
            verdict: index.verdict || 'VERDICT_UNSPECIFIED',
            coverageState: index.coverageState || null,
            robotsTxtState: index.robotsTxtState || null,
            indexingState: index.indexingState || null,
            lastCrawlTime: index.lastCrawlTime || null,
            pageFetchState: index.pageFetchState || null,
            googleCanonical: index.googleCanonical || null,
            userCanonical: index.userCanonical || null,
            crawledAs: index.crawledAs || null,
            sitemap: Array.isArray(index.sitemap) ? index.sitemap : [],
            referringUrls: Array.isArray(index.referringUrls) ? index.referringUrls.slice(0, 10) : [],
          },
          mobile: { verdict: mobile.verdict || 'VERDICT_UNSPECIFIED' },
          richResults: {
            verdict: richResults.verdict || 'VERDICT_UNSPECIFIED',
            detectedItems: Array.isArray(richResults.detectedItems)
              ? richResults.detectedItems.map((item: Record<string, unknown>) => ({
                  richResultType: item.richResultType || null,
                  items: Array.isArray(item.items) ? item.items.length : 0,
                }))
              : [],
          },
        },
        fetchedAt: new Date().toISOString(),
      });
    }

    const normalizedPeriod = periodDays as SearchConsolePeriod;
    const dateRange = buildSearchConsoleDateRange(normalizedPeriod);
    const previousDateRange = buildPreviousSearchConsoleDateRange(dateRange, normalizedPeriod);

    const [summaryRows, dateRows, queryRows, pageRows] = await Promise.all([
      querySearchAnalytics(googleToken, siteUrl, dateRange, [], 1),
      querySearchAnalytics(googleToken, siteUrl, dateRange, ['date']),
      querySearchAnalytics(googleToken, siteUrl, dateRange, ['query'], 50),
      querySearchAnalytics(googleToken, siteUrl, dateRange, ['page'], 50),
    ]);

    const optionalResults = await Promise.allSettled([
      querySearchAnalytics(googleToken, siteUrl, dateRange, ['device'], 10),
      querySearchAnalytics(googleToken, siteUrl, dateRange, ['country'], 10),
      querySearchAnalytics(googleToken, siteUrl, dateRange, ['searchAppearance'], 20),
      fetchSitemaps(googleToken, siteUrl),
      ...['image', 'video', 'news', 'discover', 'googleNews'].map((type) =>
        querySearchAnalytics(googleToken, siteUrl, dateRange, [], 1, type)
      ),
      querySearchAnalytics(googleToken, siteUrl, previousDateRange, [], 1),
      querySearchAnalytics(googleToken, siteUrl, previousDateRange, ['page'], 50),
      buildIndexMonitor(supabaseAdmin, googleToken, siteUrl),
    ]);

    const optionalValue = <T>(index: number, fallback: T): T =>
      optionalResults[index]?.status === 'fulfilled'
        ? (optionalResults[index] as PromiseFulfilledResult<T>).value
        : fallback;

    const deviceRows = optionalValue<SearchAnalyticsRow[]>(0, []);
    const countryRows = optionalValue<SearchAnalyticsRow[]>(1, []);
    const appearanceRows = optionalValue<SearchAnalyticsRow[]>(2, []);
    const sitemaps = optionalValue<Array<Record<string, unknown>>>(3, []);
    const previousSummaryRows = optionalValue<SearchAnalyticsRow[]>(9, []);
    const previousPageRows = optionalValue<SearchAnalyticsRow[]>(10, []);
    const indexMonitor = optionalValue<ReturnType<typeof summarizeIndexMonitor>>(11, {
      checkedAt: new Date().toISOString(), checked: 0, healthy: 0, attention: 0, critical: 0, partial: true, items: [],
    });
    const summary = normalizeRow(summaryRows[0] || {});
    const previousSummary = normalizeRow(previousSummaryRows[0] || {});
    const normalizedQueries = queryRows.map((row) => ({ key: row.keys?.[0] || '', ...normalizeRow(row) }));
    const normalizedPages = pageRows.map((row) => ({ key: row.keys?.[0] || '', ...normalizeRow(row) }));
    const normalizedPreviousPages = previousPageRows.map((row) => ({ key: row.keys?.[0] || '', ...normalizeRow(row) }));
    const searchTypes = [
      { type: 'web', label: 'Web', metric: normalizeRow(summaryRows[0] || {}) },
      ...['image', 'video', 'news', 'discover', 'googleNews'].map((type, index) => ({
        type,
        label: ({ image: 'Imagens', video: 'Vídeos', news: 'Notícias', discover: 'Discover', googleNews: 'Google Notícias' } as Record<string, string>)[type],
        metric: normalizeRow(optionalValue<SearchAnalyticsRow[]>(index + 4, [])[0] || {}),
      })),
    ];

    return jsonResponse(req, {
      success: true,
      property: siteUrl,
      period: dateRange,
      summary,
      comparison: previousSummaryRows.length > 0
        ? {
            available: true,
            period: previousDateRange,
            ...buildMetricComparison(summary, previousSummary),
          }
        : { available: false, period: previousDateRange, previous: null, changes: null },
      opportunities: buildSeoOpportunities({
        queries: normalizedQueries,
        pages: normalizedPages,
        previousPages: normalizedPreviousPages,
      }),
      indexMonitor,
      series: dateRows.map((row) => ({ date: row.keys?.[0] || '', ...normalizeRow(row) })),
      topQueries: normalizedQueries.slice(0, 10).map(({ key, ...row }) => ({ query: key, ...row })),
      topPages: normalizedPages.slice(0, 10).map(({ key, ...row }) => ({ page: key, ...row })),
      devices: deviceRows.map((row) => ({ device: row.keys?.[0] || '', ...normalizeRow(row) })),
      countries: countryRows.map((row) => ({ country: row.keys?.[0] || '', ...normalizeRow(row) })),
      searchAppearances: appearanceRows.map((row) => ({ appearance: row.keys?.[0] || '', ...normalizeRow(row) })),
      searchTypes,
      sitemaps: sitemaps.map((sitemap) => ({
        path: sitemap.path || '',
        type: sitemap.type || null,
        isPending: Boolean(sitemap.isPending),
        isSitemapsIndex: Boolean(sitemap.isSitemapsIndex),
        lastSubmitted: sitemap.lastSubmitted || null,
        lastDownloaded: sitemap.lastDownloaded || null,
        warnings: normalizeMetric(sitemap.warnings),
        errors: normalizeMetric(sitemap.errors),
        contents: Array.isArray(sitemap.contents)
          ? sitemap.contents.map((content: Record<string, unknown>) => ({
              type: content.type || null,
              submitted: normalizeMetric(content.submitted),
              indexed: normalizeMetric(content.indexed),
            }))
          : [],
      })),
      partial: optionalResults.some((result) => result.status === 'rejected'),
      fetchedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[google-search-console] Consulta indisponível', error instanceof Error ? error.name : 'unknown');
    if (error instanceof Error && error.message === 'pagespeed_quota_exceeded') {
      return jsonResponse(req, { success: false, error: 'A cota do PageSpeed foi atingida. Tente novamente amanhã.' }, 429);
    }
    if (error instanceof Error && error.message === 'pagespeed_access_denied') {
      return jsonResponse(req, { success: false, error: 'O PageSpeed ainda não está autorizado no projeto Google.' }, 503);
    }
    if (error instanceof Error && error.message === 'pagespeed_query_failed') {
      return jsonResponse(req, { success: false, error: 'O Google não conseguiu analisar esta página agora.' }, 502);
    }
    return jsonResponse(req, { success: false, error: 'Não foi possível consultar o Google Search Console agora' }, 502);
  }
});
