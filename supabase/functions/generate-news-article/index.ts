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

const NEWS_EDITORIAL_CATEGORIES = [
  'Mercado',
  'Graos',
  'Pecuaria',
  'Maquinas',
  'Insumos',
  'Clima',
  'Politica Agro',
  'Credito Rural',
  'Tecnologia',
  'Logistica',
  'Sustentabilidade',
] as const;

const normalizeText = (value?: string | null) =>
  (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

const normalizeEditorialCategory = (value?: string | null) => {
  if (!value) return null;
  const normalized = normalizeText(value);
  return NEWS_EDITORIAL_CATEGORIES.find((category) => normalizeText(category) === normalized) || null;
};

const classifyEditorialCategory = (input: {
  title?: string | null;
  subtitle?: string | null;
  summary?: string | null;
  content?: string | null;
  portalName?: string | null;
}) => {
  const text = normalizeText([input.title, input.subtitle, input.summary, input.content, input.portalName].filter(Boolean).join(' '));
  const groups = [
    { category: 'Graos', keywords: ['soja', 'milho', 'safra', 'colheita', 'trigo', 'cafe', 'arroz', 'farelo'] },
    { category: 'Pecuaria', keywords: ['boi', 'gado', 'pecuaria', 'frigorifico', 'leite', 'suino', 'aves'] },
    { category: 'Maquinas', keywords: ['trator', 'colheitadeira', 'pulverizador', 'maquina', 'implemento'] },
    { category: 'Insumos', keywords: ['fertilizante', 'adubo', 'defensivo', 'semente', 'insumo'] },
    { category: 'Clima', keywords: ['chuva', 'seca', 'clima', 'estiagem', 'temperatura'] },
    { category: 'Politica Agro', keywords: ['governo', 'congresso', 'plano safra', 'tributo', 'reforma'] },
    { category: 'Credito Rural', keywords: ['credito rural', 'financiamento', 'bndes', 'juros', 'seguro rural'] },
    { category: 'Tecnologia', keywords: ['tecnologia', 'agtech', 'inovacao', 'drone', 'automacao'] },
    { category: 'Logistica', keywords: ['porto', 'frete', 'escoamento', 'ferrovia', 'rodovia'] },
    { category: 'Sustentabilidade', keywords: ['sustentabilidade', 'carbono', 'ambiental', 'regenerativa'] },
  ] as const;

  for (const group of groups) {
    if (group.keywords.some((keyword) => text.includes(normalizeText(keyword)))) {
      return group.category;
    }
  }

  return 'Mercado';
};

const slugify = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);

const ensureUniqueSlug = async (
  supabaseAdmin: ReturnType<typeof createClient>,
  baseSlug: string,
  articleId?: string | null
) => {
  let candidate = baseSlug || `materia-${crypto.randomUUID().slice(0, 8)}`;
  let attempt = 1;

  while (true) {
    const { data } = await supabaseAdmin
      .from('news_articles')
      .select('id')
      .eq('slug', candidate)
      .maybeSingle();

    if (!data || data.id === articleId) {
      return candidate;
    }

    attempt += 1;
    candidate = `${baseSlug}-${attempt}`;
  }
};

const extractOutputText = (responseJson: Record<string, unknown>) => {
  const outputText = responseJson.output_text;
  if (typeof outputText === 'string' && outputText.trim()) {
    return outputText.trim();
  }

  const output = Array.isArray(responseJson.output) ? responseJson.output : [];
  const texts = output
    .flatMap((item: any) => (Array.isArray(item?.content) ? item.content : []))
    .map((part: any) => part?.text || part?.value || '')
    .filter(Boolean);

  return texts.join('\n').trim();
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const geminiApiKey = Deno.env.get('GEMINI_API_KEY');

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return jsonResponse({ success: false, error: 'Missing Supabase secrets' }, 500);
    }

    if (!geminiApiKey) {
      return jsonResponse({ success: false, error: 'Missing GEMINI_API_KEY' }, 500);
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
    const ingestionId = String(body.ingestionId || '').trim();
    const articleId = trimToNull(String(body.articleId || '').trim());

    if (!ingestionId) {
      return jsonResponse({ success: false, error: 'ingestionId is required' }, 400);
    }

    const { data: ingestion, error: ingestionError } = await supabaseAdmin
      .from('news_ingestions')
      .select('*')
      .eq('id', ingestionId)
      .maybeSingle();

    if (ingestionError || !ingestion) {
      return jsonResponse({ success: false, error: 'Capture not found' }, 404);
    }

    if (!trimToNull(ingestion.extracted_text)) {
      return jsonResponse(
        {
          success: false,
          error: 'Capture does not contain extracted text',
          details: 'Capture the URL successfully before generating the article.',
        },
        400
      );
    }

    const { data: settings } = await supabaseAdmin
      .from('news_settings')
      .select('*')
      .limit(1)
      .maybeSingle();

    const nowIso = new Date().toISOString();
    const model = trimToNull(settings?.openai_model) || 'gemini-2.5-flash';
    const defaultStatus = settings?.default_generated_status || 'draft';
    const portalName = trimToNull(ingestion.original_portal_name) || 'fonte original';
    const originalDate = trimToNull(ingestion.original_published_at) || 'data nao informada';
    const referencesTemplate =
      trimToNull(settings?.references_template) ||
      'Fonte original consultada: {{portal_name}} | {{source_url}} | Publicado em {{original_published_at}}';

    const prompt = `
Voce e editor de noticias da BWAGRO.

Objetivo:
- Criar uma materia nova, original e autoral com base factual na noticia de origem.
- Foco total no agronegocio brasileiro.
- Tom jornalistico profissional, claro e confiavel.
- Nunca copie frases literais da noticia original.
- Nao invente dados. Se algo nao estiver claro, nao afirme.
- O conteudo deve ser util para produtores, distribuidores, cooperativas, traders e empresas do agro.

Regras adicionais:
- Gere titulo forte e objetivo.
- Gere subtitulo curto.
- Gere resumo em linha com a regra: ${settings?.summary_rule || 'Gerar resumo em ate 320 caracteres.'}
- Gere um bloco "Impacto no Agro" pratico e orientado ao negocio.
- Classifique a materia em apenas uma categoria editorial dentre estas opcoes: ${NEWS_EDITORIAL_CATEGORIES.join(', ')}.
- O conteudo principal deve ser estruturado em paragrafos, sem markdown.
- Nao inclua o bloco de referencias na resposta. Isso sera montado pelo sistema.

Prompt editorial padrao:
${settings?.default_prompt || ''}

Dados da fonte:
- Portal: ${portalName}
- Titulo original: ${ingestion.original_title || 'nao informado'}
- Data original: ${originalDate}
- URL: ${ingestion.source_url}

Texto extraido:
${String(ingestion.extracted_text).slice(0, Number(settings?.max_extracted_characters || 12000))}
    `.trim();

    const { data: job } = await supabaseAdmin
      .from('news_generation_jobs')
      .insert({
        article_id: articleId,
        ingestion_id: ingestion.id,
        status: 'processing',
        prompt_snapshot: prompt,
        model,
        response_payload: {},
        updated_at: nowIso,
      })
      .select('id')
      .single();

    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
      method: 'POST',
      headers: {
        'x-goog-api-key': geminiApiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: prompt,
              },
            ],
          },
        ],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'object',
            properties: {
              editorialCategory: {
                type: 'string',
                enum: [...NEWS_EDITORIAL_CATEGORIES],
              },
              title: { type: 'string' },
              subtitle: { type: 'string' },
              summary: { type: 'string' },
              content: { type: 'string' },
              agroImpact: { type: 'string' },
            },
            required: ['editorialCategory', 'title', 'subtitle', 'summary', 'content', 'agroImpact'],
          },
        },
      }),
      }
    );

    const responseJson = await geminiResponse.json().catch(() => ({}));

    if (!geminiResponse.ok) {
      const errorMessage =
        (responseJson as any)?.error?.message ||
        (responseJson as any)?.message ||
        'Gemini request failed';

      if (job?.id) {
        await supabaseAdmin
          .from('news_generation_jobs')
          .update({
            status: 'failed',
            error_message: errorMessage,
            response_payload: responseJson,
            updated_at: new Date().toISOString(),
          })
          .eq('id', job.id);
      }

      return jsonResponse({ success: false, error: errorMessage }, 502);
    }

    const candidateText =
      (responseJson as any)?.candidates?.[0]?.content?.parts
        ?.map((part: any) => part?.text || '')
        .filter(Boolean)
        .join('\n')
        .trim() || '';
    const outputText = candidateText || extractOutputText(responseJson as Record<string, unknown>);
    const generated = JSON.parse(outputText || '{}');

    if (
      !trimToNull(generated.title) ||
      !trimToNull(generated.summary) ||
      !trimToNull(generated.content)
    ) {
      if (job?.id) {
        await supabaseAdmin
          .from('news_generation_jobs')
          .update({
            status: 'failed',
            error_message: 'Structured output incomplete',
            response_payload: responseJson,
            updated_at: new Date().toISOString(),
          })
          .eq('id', job.id);
      }

      return jsonResponse(
        {
          success: false,
          error: 'Structured output incomplete',
        },
        500
      );
    }

    const referencesBlock = referencesTemplate
      .replaceAll('{{portal_name}}', portalName)
      .replaceAll('{{source_url}}', ingestion.source_url || '')
      .replaceAll('{{original_published_at}}', originalDate)
      .replaceAll('{{original_title}}', ingestion.original_title || '');

    const slug = await ensureUniqueSlug(
      supabaseAdmin,
      slugify(generated.title),
      articleId
    );

    const articlePayload = {
      ingestion_id: ingestion.id,
      editorial_category:
        normalizeEditorialCategory(generated.editorialCategory) ||
        classifyEditorialCategory({
          title: generated.title,
          subtitle: generated.subtitle,
          summary: generated.summary,
          content: generated.content,
          portalName,
        }),
      title: trimToNull(generated.title),
      subtitle: trimToNull(generated.subtitle),
      summary: trimToNull(generated.summary),
      content: trimToNull(generated.content),
      agro_impact: settings?.show_agro_impact ? trimToNull(generated.agroImpact) : null,
      references_block: referencesBlock,
      slug,
      status: defaultStatus,
      featured_image_url: trimToNull(ingestion.featured_image_url),
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    };

    const articleQuery = articleId
      ? supabaseAdmin.from('news_articles').update(articlePayload).eq('id', articleId).select('*').single()
      : supabaseAdmin
          .from('news_articles')
          .insert({
            ...articlePayload,
            created_by: user.id,
          })
          .select('*')
          .single();

    const { data: article, error: articleError } = await articleQuery;

    if (articleError || !article) {
      if (job?.id) {
        await supabaseAdmin
          .from('news_generation_jobs')
          .update({
            status: 'failed',
            error_message: articleError?.message || 'Failed to persist article',
            response_payload: responseJson,
            updated_at: new Date().toISOString(),
          })
          .eq('id', job.id);
      }

      return jsonResponse({ success: false, error: articleError?.message || 'Failed to save article' }, 500);
    }

    if (job?.id) {
      await supabaseAdmin
        .from('news_generation_jobs')
        .update({
          article_id: article.id,
          status: 'completed',
          response_payload: responseJson,
          updated_at: new Date().toISOString(),
        })
        .eq('id', job.id);
    }

    return jsonResponse({
      success: true,
      data: {
        id: article.id,
        ingestionId: article.ingestion_id ?? null,
        editorialCategory: article.editorial_category ?? 'Mercado',
        title: article.title,
        subtitle: article.subtitle ?? '',
        summary: article.summary ?? '',
        content: article.content ?? '',
        agroImpact: article.agro_impact ?? '',
        referencesBlock: article.references_block ?? '',
        slug: article.slug,
        status: article.status,
        featuredImageUrl: article.featured_image_url ?? null,
      },
      jobId: job?.id ?? null,
    });
  } catch (error) {
    console.error('[generate-news-article] unexpected error:', error);
    return jsonResponse(
      {
        success: false,
        error: 'Erro inesperado ao gerar a materia',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      500
    );
  }
});
