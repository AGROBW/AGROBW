import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.48.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, apikey',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const jsonResponse = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
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
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return jsonResponse({ success: false, error: 'Missing Supabase secrets' }, 500);
    }

    const authClient = createClient(supabaseUrl, anonKey);
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    const authHeader = req.headers.get('Authorization') || '';
    if (!authHeader.startsWith('Bearer ')) {
      return jsonResponse({ success: false, error: 'Unauthorized' }, 401);
    }

    const token = authHeader.slice(7).trim();
    const {
      data: { user },
      error: authError,
    } = await authClient.auth.getUser(token);

    if (authError || !user) {
      return jsonResponse({ success: false, error: 'Invalid JWT', details: authError?.message }, 401);
    }

    const { data: userProfile } = await supabaseAdmin
      .from('users')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();

    if ((userProfile?.role || '').toLowerCase() !== 'admin') {
      return jsonResponse({ success: false, error: 'Admin access required' }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const sourceUrl = String(body.url || '').trim();

    if (!sourceUrl) {
      return jsonResponse({ success: false, error: 'url is required' }, 400);
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(sourceUrl);
    } catch {
      return jsonResponse({ success: false, error: 'Invalid URL' }, 400);
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
      redirect: 'follow',
    });

    if (!response.ok) {
      return jsonResponse(
        {
          success: false,
          error: 'Nao foi possivel ler a URL informada',
          details: `HTTP ${response.status}`,
        },
        502
      );
    }

    const html = await response.text();
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
      finalUrl: response.url,
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
        created_by: user.id,
      })
      .select('*')
      .single();

    if (ingestionError || !ingestion) {
      return jsonResponse({ success: false, error: ingestionError?.message || 'Capture failed' }, 500);
    }

    return jsonResponse({
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
  } catch (error) {
    console.error('[capture-news-url] unexpected error:', error);
    return jsonResponse(
      {
        success: false,
        error: 'Erro inesperado ao capturar a URL',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      500
    );
  }
});
