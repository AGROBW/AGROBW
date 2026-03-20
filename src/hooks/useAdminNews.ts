import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import type {
  NewsArticleRecord,
  NewsArticleStatus,
  NewsGenerationJobRecord,
  NewsIngestionRecord,
  NewsSettingsRecord,
  NewsSourceCaptureType,
  NewsSourceRecord,
} from '../../types';

type DashboardData = {
  totalArticles: number;
  totalDrafts: number;
  totalPublished: number;
  latestArticles: NewsArticleRecord[];
  latestPublished: NewsArticleRecord[];
  topSources: NewsSourceRecord[];
};

type ArticlePayload = {
  id?: string;
  ingestionId?: string | null;
  sourceUrl?: string | null;
  originalPortalName?: string | null;
  originalTitle?: string | null;
  originalPublishedAt?: string | null;
  title: string;
  subtitle?: string | null;
  summary?: string | null;
  content?: string | null;
  agroImpact?: string | null;
  referencesBlock?: string | null;
  slug?: string | null;
  status: NewsArticleStatus;
  featuredImageUrl?: string | null;
};

type CaptureResult = {
  error: string | null;
  data: NewsIngestionRecord | null;
};

type GenerateResult = {
  error: string | null;
  data: {
    id: string;
    ingestionId?: string | null;
    title: string;
    subtitle: string;
    summary: string;
    content: string;
    agroImpact: string;
    referencesBlock: string;
    slug: string;
    status: NewsArticleStatus;
    featuredImageUrl?: string | null;
  } | null;
};

type SourcePayload = {
  id?: string;
  name: string;
  domain: string;
  notes?: string | null;
  isActive: boolean;
  captureType: NewsSourceCaptureType;
};

const slugify = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);

const mapArticle = (row: any): NewsArticleRecord => ({
  id: row.id,
  ingestionId: row.ingestion_id ?? null,
  legacyNewsId: row.legacy_news_id ?? null,
  title: row.title,
  subtitle: row.subtitle ?? null,
  summary: row.summary ?? null,
  content: row.content ?? null,
  agroImpact: row.agro_impact ?? null,
  referencesBlock: row.references_block ?? null,
  slug: row.slug,
  status: row.status,
  featuredImageUrl: row.featured_image_url ?? null,
  featuredImagePath: row.featured_image_path ?? null,
  publishedAt: row.published_at ?? null,
  createdBy: row.created_by ?? null,
  updatedBy: row.updated_by ?? null,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  sourceUrl: row.news_ingestions?.source_url ?? null,
  originalPortalName: row.news_ingestions?.original_portal_name ?? null,
  originalTitle: row.news_ingestions?.original_title ?? null,
  originalPublishedAt: row.news_ingestions?.original_published_at ?? null,
  sourceName: row.news_sources?.name ?? null,
});

const mapSource = (row: any): NewsSourceRecord => ({
  id: row.id,
  name: row.name,
  domain: row.domain,
  notes: row.notes ?? null,
  isActive: row.is_active,
  captureType: row.capture_type,
  usageCount: row.usage_count ?? 0,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const mapSettings = (row: any): NewsSettingsRecord => ({
  id: row.id,
  defaultPrompt: row.default_prompt,
  maxExtractedCharacters: row.max_extracted_characters,
  summaryRule: row.summary_rule,
  showAgroImpact: row.show_agro_impact,
  referencesTemplate: row.references_template,
  defaultGeneratedStatus: row.default_generated_status,
  openaiModel: row.openai_model ?? null,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export const useAdminNews = () => {
  const [dashboard, setDashboard] = useState<DashboardData>({
    totalArticles: 0,
    totalDrafts: 0,
    totalPublished: 0,
    latestArticles: [],
    latestPublished: [],
    topSources: [],
  });
  const [articles, setArticles] = useState<NewsArticleRecord[]>([]);
  const [sources, setSources] = useState<NewsSourceRecord[]>([]);
  const [settings, setSettings] = useState<NewsSettingsRecord | null>(null);
  const [jobs, setJobs] = useState<NewsGenerationJobRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDashboard = async () => {
    const [articlesResult, sourcesResult] = await Promise.all([
      supabase
        .from('news_articles')
        .select('id, status, published_at, created_at, title, slug, summary, featured_image_url, news_ingestions(source_url, original_portal_name, original_title, original_published_at)')
        .order('created_at', { ascending: false }),
      supabase
        .from('news_sources')
        .select('*')
        .order('usage_count', { ascending: false })
        .limit(5),
    ]);

    if (articlesResult.error) {
      throw articlesResult.error;
    }

    if (sourcesResult.error) {
      throw sourcesResult.error;
    }

    const mappedArticles = (articlesResult.data || []).map(mapArticle);
    setDashboard({
      totalArticles: mappedArticles.length,
      totalDrafts: mappedArticles.filter((article) => article.status === 'draft').length,
      totalPublished: mappedArticles.filter((article) => article.status === 'published').length,
      latestArticles: mappedArticles.slice(0, 5),
      latestPublished: mappedArticles.filter((article) => article.status === 'published').slice(0, 5),
      topSources: (sourcesResult.data || []).map(mapSource),
    });
  };

  const fetchArticles = async (status?: NewsArticleStatus) => {
    let query = supabase
      .from('news_articles')
      .select(`
        *,
        news_ingestions (
          source_url,
          original_portal_name,
          original_title,
          original_published_at
        )
      `)
      .order('updated_at', { ascending: false });

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error } = await query;
    if (error) throw error;
    setArticles((data || []).map(mapArticle));
  };

  const fetchSources = async () => {
    const { data, error } = await supabase.from('news_sources').select('*').order('name');
    if (error) throw error;
    setSources((data || []).map(mapSource));
  };

  const fetchSettings = async () => {
    const { data, error } = await supabase.from('news_settings').select('*').limit(1).maybeSingle();
    if (error) throw error;
    setSettings(data ? mapSettings(data) : null);
  };

  const fetchJobs = async () => {
    const { data, error } = await supabase
      .from('news_generation_jobs')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(20);
    if (error) throw error;
    setJobs(
      (data || []).map((row: any) => ({
        id: row.id,
        articleId: row.article_id ?? null,
        ingestionId: row.ingestion_id ?? null,
        status: row.status,
        promptSnapshot: row.prompt_snapshot ?? null,
        model: row.model ?? null,
        responsePayload: row.response_payload ?? null,
        errorMessage: row.error_message ?? null,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }))
    );
  };

  const refreshAll = async (options?: { silent?: boolean }) => {
    if (!options?.silent) {
      setIsLoading(true);
    }
    setError(null);
    try {
      await Promise.all([fetchDashboard(), fetchArticles(), fetchSources(), fetchSettings(), fetchJobs()]);
    } catch (err: any) {
      setError(err.message || 'Erro ao carregar modulo de noticias');
    } finally {
      if (!options?.silent) {
        setIsLoading(false);
      }
    }
  };

  const upsertSource = async (payload: SourcePayload) => {
    const dbPayload = {
      name: payload.name,
      domain: payload.domain.toLowerCase(),
      notes: payload.notes ?? null,
      is_active: payload.isActive,
      capture_type: payload.captureType,
      updated_at: new Date().toISOString(),
    };

    const query = payload.id
      ? supabase.from('news_sources').update(dbPayload).eq('id', payload.id)
      : supabase.from('news_sources').insert(dbPayload);

    const { error } = await query;
    if (error) return { error: error.message };
    await refreshAll({ silent: true });
    return { error: null };
  };

  const deleteSource = async (id: string) => {
    const { error } = await supabase.from('news_sources').delete().eq('id', id);
    if (error) return { error: error.message };
    await refreshAll({ silent: true });
    return { error: null };
  };

  const saveSettings = async (payload: Partial<NewsSettingsRecord>) => {
    const currentId = settings?.id;
    const dbPayload = {
      default_prompt: payload.defaultPrompt ?? settings?.defaultPrompt ?? '',
      max_extracted_characters:
        payload.maxExtractedCharacters ?? settings?.maxExtractedCharacters ?? 12000,
      summary_rule: payload.summaryRule ?? settings?.summaryRule ?? '',
      show_agro_impact: payload.showAgroImpact ?? settings?.showAgroImpact ?? true,
      references_template: payload.referencesTemplate ?? settings?.referencesTemplate ?? '',
      default_generated_status:
        payload.defaultGeneratedStatus ?? settings?.defaultGeneratedStatus ?? 'draft',
      openai_model: payload.openaiModel ?? settings?.openaiModel ?? null,
      updated_at: new Date().toISOString(),
    };

    const query = currentId
      ? supabase.from('news_settings').update(dbPayload).eq('id', currentId)
      : supabase.from('news_settings').insert(dbPayload);

    const { error } = await query;
    if (error) return { error: error.message };
    await refreshAll();
    return { error: null };
  };

  const createCapture = async (sourceUrl: string) => {
    const { data, error } = await supabase.functions.invoke('capture-news-url', {
      method: 'POST',
      body: {
        url: sourceUrl.trim(),
      },
    });

    if (error) {
      try {
        const errorBody = await error.context?.json?.();
        console.error('[useAdminNews] Corpo da resposta de capture-news-url:', errorBody);
      } catch {
        try {
          const errorText = await error.context?.text?.();
          console.error('[useAdminNews] Corpo da resposta de capture-news-url:', errorText);
        } catch {
          console.error('[useAdminNews] Erro ao ler corpo da resposta de capture-news-url');
        }
      }
    }

    if (error || !data?.success) {
      return {
        error: data?.error || error?.message || 'Falha ao capturar URL',
        data: null,
      } as CaptureResult;
    }

    return {
      error: null,
      data: data.data as NewsIngestionRecord,
    } as CaptureResult;
  };

  const generateArticleFromIngestion = async (
    ingestionId: string,
    articleId?: string | null
  ) => {
    const { data, error } = await supabase.functions.invoke('generate-news-article', {
      method: 'POST',
      body: {
        ingestionId,
        articleId: articleId || null,
      },
    });

    if (error) {
      try {
        const errorBody = await error.context?.json?.();
        console.error('[useAdminNews] Corpo da resposta de generate-news-article:', errorBody);
      } catch {
        try {
          const errorText = await error.context?.text?.();
          console.error('[useAdminNews] Corpo da resposta de generate-news-article:', errorText);
        } catch {
          console.error('[useAdminNews] Erro ao ler corpo da resposta de generate-news-article');
        }
      }
    }

    if (error || !data?.success) {
      return {
        error: data?.error || error?.message || 'Falha ao gerar materia com IA',
        data: null,
      } as GenerateResult;
    }

    return {
      error: null,
      data: data.data,
    } as GenerateResult;
  };

  const saveArticle = async (payload: ArticlePayload) => {
    const slug = slugify(payload.slug?.trim() || payload.title);
    const nowIso = new Date().toISOString();
    let ingestionId = payload.ingestionId ?? null;

    if (!ingestionId && payload.sourceUrl) {
      const captureResult = await createCapture(payload.sourceUrl);
      if (captureResult.error || !captureResult.data) {
        return { error: captureResult.error || 'Falha ao criar captura', data: null };
      }
      ingestionId = captureResult.data.id;

      await supabase
        .from('news_ingestions')
        .update({
          original_title: payload.originalTitle ?? payload.title,
          original_portal_name: payload.originalPortalName ?? null,
          original_published_at: payload.originalPublishedAt ?? null,
          updated_at: nowIso,
        })
        .eq('id', ingestionId);
    }

    const dbPayload = {
      ingestion_id: ingestionId,
      title: payload.title,
      subtitle: payload.subtitle ?? null,
      summary: payload.summary ?? null,
      content: payload.content ?? null,
      agro_impact: payload.agroImpact ?? null,
      references_block: payload.referencesBlock ?? null,
      slug,
      status: payload.status,
      featured_image_url: payload.featuredImageUrl ?? null,
      updated_at: nowIso,
    };

    const query = payload.id
      ? supabase.from('news_articles').update(dbPayload).eq('id', payload.id).select().single()
      : supabase.from('news_articles').insert(dbPayload).select().single();

    const { data, error } = await query;
    if (error) return { error: error.message, data: null };

    if (payload.status === 'published') {
      const articleId = data.id;
      const publishedAt = nowIso;

      const articleSourcePayload = {
        article_id: articleId,
        source_id: null,
        source_url: payload.sourceUrl || '',
        portal_name: payload.originalPortalName || null,
        original_title: payload.originalTitle || null,
        original_published_at: payload.originalPublishedAt || null,
        display_order: 0,
      };

      if (payload.sourceUrl) {
        await supabase.from('news_article_sources').delete().eq('article_id', articleId);
        await supabase.from('news_article_sources').insert(articleSourcePayload);
      }

      await supabase
        .from('news_articles')
        .update({ published_at: publishedAt, updated_at: nowIso })
        .eq('id', articleId);
    }

    await refreshAll();
    return { error: null, data };
  };

  const publishArticle = async (article: NewsArticleRecord) => {
    if (!article.referencesBlock?.trim()) {
      return { error: 'A referencia da fonte e obrigatoria para publicar.' };
    }

    return saveArticle({
      id: article.id,
      ingestionId: article.ingestionId,
      sourceUrl: article.sourceUrl,
      originalPortalName: article.originalPortalName,
      originalTitle: article.originalTitle,
      originalPublishedAt: article.originalPublishedAt,
      title: article.title,
      subtitle: article.subtitle,
      summary: article.summary,
      content: article.content,
      agroImpact: article.agroImpact,
      referencesBlock: article.referencesBlock,
      slug: article.slug,
      featuredImageUrl: article.featuredImageUrl,
      status: 'published',
    });
  };

  const unpublishArticle = async (article: NewsArticleRecord) => {
    const { error } = await supabase
      .from('news_articles')
      .update({
        status: 'draft',
        published_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', article.id);
    if (error) return { error: error.message };
    await refreshAll();
    return { error: null };
  };

  const duplicateArticle = async (article: NewsArticleRecord) => {
    return saveArticle({
      ingestionId: article.ingestionId,
      sourceUrl: article.sourceUrl,
      originalPortalName: article.originalPortalName,
      originalTitle: article.originalTitle,
      originalPublishedAt: article.originalPublishedAt,
      title: `${article.title} (Copia)`,
      subtitle: article.subtitle,
      summary: article.summary,
      content: article.content,
      agroImpact: article.agroImpact,
      referencesBlock: article.referencesBlock,
      featuredImageUrl: article.featuredImageUrl,
      status: 'draft',
    });
  };

  const deleteArticle = async (article: NewsArticleRecord) => {
    const { error } = await supabase.from('news_articles').delete().eq('id', article.id);
    if (error) return { error: error.message };
    await refreshAll();
    return { error: null };
  };

  useEffect(() => {
    refreshAll();
  }, []);

  return {
    dashboard,
    articles,
    sources,
    settings,
    jobs,
    isLoading,
    error,
    refreshAll,
    fetchArticles,
    upsertSource,
    deleteSource,
    saveSettings,
    createCapture,
    generateArticleFromIngestion,
    saveArticle,
    publishArticle,
    unpublishArticle,
    duplicateArticle,
    deleteArticle,
  };
};
