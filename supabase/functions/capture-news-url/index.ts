import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.48.1';
import { getCorsHeaders, handleCorsPreflightBrowser } from '../_shared/cors.ts';
import { isAdminAal2Profile, logSecurityEvent, extractBearerToken } from '../_shared/security.ts';
import { checkRateLimit, rateLimitResponse } from '../_shared/rateLimit.ts';
import { validateCaptureNewsUrlInput } from '../_shared/validation.ts';

/**
 * VULN-003 fix: Blocklist de hosts/IPs privados para prevenir SSRF.
 * Bloqueia: loopback, link-local (AWS metadata), RFC1918 (redes privadas),
 * IPv6 privado e protocolos não-HTTP.
 */
const BLOCKED_HOST_PATTERN =
  /^(localhost|127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|169\.254\.|0\.0\.0\.0|::1|fc00:|fe80:|\[::1\])/i;

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);

/**
 * Valida que a URL não aponta para um endpoint interno/privado.
 * Lança Error com mensagem descritiva se a URL for inválida/bloqueada.
 */
const validateSafeUrl = (rawUrl: string): URL => {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error('URL inválida ou mal formada');
  }

  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
    throw new Error(`Protocolo não permitido: ${parsed.protocol}`);
  }

  if (BLOCKED_HOST_PATTERN.test(parsed.hostname)) {
    throw new Error('Endereço de destino não permitido (host privado/reservado)');
  }

  // Bloquear números de porta incomuns (possivel SSRF em serviços internos)
  const port = parsed.port ? Number(parsed.port) : (parsed.protocol === 'https:' ? 443 : 80);
  const BLOCKED_PORTS = new Set([22, 25, 110, 143, 587, 993, 995, 3306, 5432, 6379, 8080, 8443, 9200, 27017]);
  if (BLOCKED_PORTS.has(port)) {
    throw new Error(`Porta não permitida: ${port}`);
  }

  return parsed;
};

const jsonResponse = (req: Request, body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...getCorsHeaders(req),
      'Content-Type': 'application/json',
    },
  });

const trimToNull = (value?: string | null) => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

const decodeHtml = (value: string) =>
  value
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&nbsp;/gi, ' ');

const stripHtml = (value: string) =>
  decodeHtml(value.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' '))
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const extractMetaContent = (html: string, key: string, attr: 'property' | 'name' = 'property') => {
  const pattern = new RegExp(
    `<meta[^>]+${attr}=["']${key}["'][^>]+content=["']([^"']+)["'][^>]*>|<meta[^>]+content=["']([^"']+)["'][^>]+${attr}=["']${key}["'][^>]*>`,
    'i'
  );
  const match = html.match(pattern);
  return trimToNull(match?.[1] || match?.[2] || null);
};

const extractTitleTag = (html: string) => {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return trimToNull(match ? stripHtml(match[1]) : null);
};

const extractHeading = (html: string, tag: 'h1' | 'h2') => {
  const match = html.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return trimToNull(match ? stripHtml(match[1]) : null);
};

const extractDateValue = (html: string) => {
  const candidates = [
    extractMetaContent(html, 'article:published_time'),
    extractMetaContent(html, 'og:published_time'),
    extractMetaContent(html, 'pubdate', 'name'),
    extractMetaContent(html, 'publish-date', 'name'),
    extractMetaContent(html, 'date', 'name'),
  ];

  const timeMatch = html.match(/<time[^>]+datetime=["']([^"']+)["'][^>]*>/i);
  if (timeMatch?.[1]) {
    candidates.push(timeMatch[1]);
  }

  return candidates.find(Boolean) || null;
};

const extractParagraphs = (html: string) => {
  const paragraphMatches = [...html.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)];
  return paragraphMatches
    .map((match) => stripHtml(match[1] || ''))
    .map((value) => value.trim())
    .filter((value) => value.length > 40);
};

const uniqueSlug = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCorsPreflightBrowser(req);
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return jsonResponse(req, { success: false, error: 'Serviço indisponível' }, 500);
    }

    const authClient = createClient(supabaseUrl, anonKey);
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    // Verificar autenticação
    const token = extractBearerToken(req);
    if (!token) {
      await logSecurityEvent(supabaseAdmin, {
        req,
        attemptedRoute: '/functions/v1/capture-news-url',
        attemptedAction: 'capture_url_missing_bearer',
        reason: 'Authorization header ausente ou sem Bearer token.',
      });
      return jsonResponse(req, { success: false, error: 'Unauthorized' }, 401);
    }

    const {
      data: { user },
      error: authError,
    } = await authClient.auth.getUser(token);

    if (authError || !user) {
      await logSecurityEvent(supabaseAdmin, {
        req,
        attemptedRoute: '/functions/v1/capture-news-url',
        attemptedAction: 'capture_url_invalid_jwt',
        reason: authError?.message || 'JWT inválido.',
      });
      return jsonResponse(req, { success: false, error: 'Unauthorized' }, 401);
    }

    const { data: userProfile } = await supabaseAdmin
      .from('users')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();

    if (!isAdminAal2Profile(userProfile, token)) {
      await logSecurityEvent(supabaseAdmin, {
        req,
        attemptedRoute: '/functions/v1/capture-news-url',
        attemptedAction: 'capture_url_forbidden',
        userId: user.id,
        email: user.email ?? null,
        severity: 'warning',
        reason: 'Usuário não-admin tentou capturar URL.',
      });
      return jsonResponse(req, { success: false, error: 'Admin access required' }, 403);
    }

    // VULN-007 fix: Rate limiting para proteger o serviço de captura
    const rateLimit = await checkRateLimit(supabaseAdmin, user.id, 'capture-news-url');
    if (!rateLimit.allowed) {
      await logSecurityEvent(supabaseAdmin, {
        req,
        attemptedRoute: '/functions/v1/capture-news-url',
        attemptedAction: 'capture_url_rate_limited',
        userId: user.id,
        email: user.email ?? null,
        severity: 'warning',
        reason: 'Rate limit excedido para captura de URLs.',
      });
      return rateLimitResponse(getCorsHeaders(req), rateLimit.resetAt);
    }

    const rawBody = await req.json().catch(() => ({}));

    // VULN-023 fix: Valida schema antes de processar
    const validation = validateCaptureNewsUrlInput(rawBody);
    if (!validation.success) {
      return jsonResponse(req, { success: false, error: 'URL inválida ou parâmetros incorretos' }, 400);
    }

    const { url: sourceUrl } = validation.data;

    // VULN-003 fix: Validar URL contra SSRF antes de fazer o fetch
    let parsedUrl: URL;
    try {
      parsedUrl = validateSafeUrl(sourceUrl);
    } catch (err) {
      await logSecurityEvent(supabaseAdmin, {
        req,
        attemptedRoute: '/functions/v1/capture-news-url',
        attemptedAction: 'capture_url_ssrf_blocked',
        userId: user.id,
        email: user.email ?? null,
        severity: 'warning',
        reason: err instanceof Error ? err.message : 'URL bloqueada por política de segurança.',
        metadata: { attemptedUrl: sourceUrl },
      });
      return jsonResponse(req, { success: false, error: err instanceof Error ? err.message : 'URL não permitida' }, 400);
    }

    const { data: settings } = await supabaseAdmin
      .from('news_settings')
      .select('max_extracted_characters')
      .limit(1)
      .maybeSingle();

    const response = await fetch(sourceUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (compatible; BWAGRONewsBot/1.0; +https://bwagro.com.br)',
        Accept: 'text/html,application/xhtml+xml',
      },
      // Não seguir redirects automaticamente — verificar destino antes
      redirect: 'manual',
    });

    // Se houve redirect, verificar que o destino também é seguro
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location') || '';
      try {
        validateSafeUrl(location);
      } catch {
        return jsonResponse(req, {
          success: false,
          error: 'URL redirecionou para um destino não permitido',
        }, 400);
      }
      // Se o redirect for seguro, seguir manualmente
      const finalResponse = await fetch(location, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; BWAGRONewsBot/1.0; +https://bwagro.com.br)',
          Accept: 'text/html,application/xhtml+xml',
        },
        redirect: 'error',
      });
      if (!finalResponse.ok) {
        return jsonResponse(req, {
          success: false,
          error: 'Não foi possível ler a URL informada',
        }, 502);
      }
      const html = await finalResponse.text();
      return processHtmlAndSave(req, supabaseAdmin, html, parsedUrl, sourceUrl, user.id, settings);
    }

    if (!response.ok) {
      return jsonResponse(req, {
        success: false,
        error: 'Não foi possível ler a URL informada',
      }, 502);
    }

    const html = await response.text();
    return processHtmlAndSave(req, supabaseAdmin, html, parsedUrl, sourceUrl, user.id, settings);
  } catch (error) {
    console.error('[capture-news-url] unexpected error:', error);
    return jsonResponse(
      req,
      { success: false, error: 'Erro inesperado ao capturar a URL' },
      500
    );
  }
});

/** Extrai metadados do HTML e persiste a ingestion no banco */
async function processHtmlAndSave(
  req: Request,
  supabaseAdmin: ReturnType<typeof createClient>,
  html: string,
  parsedUrl: URL,
  sourceUrl: string,
  userId: string,
  settings: { max_extracted_characters?: number | null } | null,
): Promise<Response> {
  const domain = parsedUrl.hostname.replace(/^www\./i, '').toLowerCase();
  const portalName =
    extractMetaContent(html, 'og:site_name') ||
    domain.split('.').slice(0, -1).join('.').replace(/[-_]/g, ' ') ||
    domain;
    const originalTitle =
      extractMetaContent(html, 'og:title') ||
      extractMetaContent(html, 'twitter:title', 'name') ||
      extractHeading(html, 'h1') ||
      extractTitleTag(html);
    const featuredImageUrl =
      extractMetaContent(html, 'og:image') || extractMetaContent(html, 'twitter:image', 'name');
    const originalPublishedAt = extractDateValue(html);
    const paragraphs = extractParagraphs(html);
    const maxChars = Number(settings?.max_extracted_characters || 12000);
    const extractedText = paragraphs.join('\n\n').slice(0, maxChars);
    const description =
      extractMetaContent(html, 'description', 'name') ||
      extractMetaContent(html, 'og:description') ||
      null;

    const { data: existingSource } = await supabaseAdmin
      .from('news_sources')
      .select('*')
      .ilike('domain', domain)
      .maybeSingle();

    let sourceId = existingSource?.id || null;

    if (existingSource?.id) {
      await supabaseAdmin
        .from('news_sources')
        .update({
          usage_count: Number(existingSource.usage_count || 0) + 1,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingSource.id);
    } else {
      const { data: newSource } = await supabaseAdmin
        .from('news_sources')
        .insert({
          name: portalName
            .split(' ')
            .filter(Boolean)
            .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
            .join(' '),
          domain,
          capture_type: 'manual_url',
          is_active: true,
          notes: 'Fonte criada automaticamente a partir de captura manual por URL.',
          usage_count: 1,
        })
        .select('id')
        .maybeSingle();

      sourceId = newSource?.id || null;
    }

  const extractedMetadata = {
    domain,
    finalUrl: sourceUrl,
    description,
    paragraphsCount: paragraphs.length,
    suggestedSlug: originalTitle ? uniqueSlug(originalTitle) : null,
  };

    const { data: ingestion, error: ingestionError } = await supabaseAdmin
      .from('news_ingestions')
      .insert({
        source_id: sourceId,
        source_url: sourceUrl,
        original_title: originalTitle,
        original_portal_name: portalName,
        original_published_at: originalPublishedAt,
        featured_image_url: featuredImageUrl,
        extracted_text: extractedText,
        extracted_metadata: extractedMetadata,
        capture_status: extractedText ? 'captured' : 'failed',
        capture_error: extractedText ? null : 'Nenhum texto util foi extraido da pagina.',
        created_by: userId,
      })
      .select('*')
      .single();

  if (ingestionError || !ingestion) {
    return jsonResponse(req, { success: false, error: 'Capture failed' }, 500);
  }

  return jsonResponse(req, {
    success: true,
    data: {
      id: ingestion.id,
      sourceId: ingestion.source_id ?? null,
      sourceUrl: ingestion.source_url,
      originalTitle: ingestion.original_title ?? null,
      originalPortalName: ingestion.original_portal_name ?? null,
      originalPublishedAt: ingestion.original_published_at ?? null,
      originalAuthor: ingestion.original_author ?? null,
      featuredImageUrl: ingestion.featured_image_url ?? null,
      extractedText: ingestion.extracted_text ?? null,
      extractedMetadata: ingestion.extracted_metadata ?? null,
      captureStatus: ingestion.capture_status,
      captureError: ingestion.capture_error ?? null,
      createdBy: ingestion.created_by ?? null,
      createdAt: ingestion.created_at,
      updatedAt: ingestion.updated_at,
    },
  });
}
