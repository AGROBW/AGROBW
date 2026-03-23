import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import type {
  NewsArticleRecord,
  NewsArticleStatus,
  NewsGenerationJobRecord,
  NewsIngestionRecord,
  NewsSocialPublicationRecord,
  NewsSocialSettingsRecord,
  NewsSettingsRecord,
  NewsSourceCaptureType,
  NewsSourceRecord,
} from '../../types';
import { classifyNewsEditorialCategory, normalizeEditorialCategory } from '../utils/newsEditorialCategory';

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
  editorialCategory?: string | null;
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
    editorialCategory?: string | null;
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
  editorialCategory:
    normalizeEditorialCategory(row.editorial_category) ||
    classifyNewsEditorialCategory({
      title: row.title,
      subtitle: row.subtitle,
      summary: row.summary,
      content: row.content,
      portalName: row.news_ingestions?.original_portal_name,
    }),
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

const mapSocialSettings = (row: any): NewsSocialSettingsRecord => ({
  id: row.id,
  instagramEnabled: row.instagram_enabled,
  instagramUsername: row.instagram_username ?? null,
  instagramBusinessAccountId: row.instagram_business_account_id ?? null,
  instagramAccessToken: row.instagram_access_token ?? null,
  metaUserAccessToken: row.meta_user_access_token ?? null,
  facebookPageId: row.facebook_page_id ?? null,
  facebookPageName: row.facebook_page_name ?? null,
  facebookPageAccessToken: row.facebook_page_access_token ?? null,
  instagramConnectionStatus: row.instagram_connection_status ?? null,
  instagramConnectedAt: row.instagram_connected_at ?? null,
  instagramTokenExpiresAt: row.instagram_token_expires_at ?? null,
  instagramTokenLastValidatedAt: row.instagram_token_last_validated_at ?? null,
  defaultInstagramStoryImageUrl: row.default_instagram_story_image_url ?? null,
  defaultInstagramStoryImagePath: row.default_instagram_story_image_path ?? null,
  linkedinEnabled: row.linkedin_enabled,
  linkedinProfileType: row.linkedin_profile_type,
  linkedinProfileLabel: row.linkedin_profile_label ?? null,
  linkedinAuthorUrn: row.linkedin_author_urn ?? null,
  linkedinAccessToken: row.linkedin_access_token ?? null,
  defaultLinkedinImageUrl: row.default_linkedin_image_url ?? null,
  defaultLinkedinImagePath: row.default_linkedin_image_path ?? null,
  autoPublishInstagramStory: row.auto_publish_instagram_story,
  autoPublishLinkedinPost: row.auto_publish_linkedin_post,
  instagramStoryTemplate: row.instagram_story_template ?? null,
  linkedinPostTemplate: row.linkedin_post_template ?? null,
  articleUrlBase: row.article_url_base ?? null,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const mapSocialPublication = (row: any): NewsSocialPublicationRecord => ({
  id: row.id,
  articleId: row.article_id,
  platform: row.platform,
  publicationType: row.publication_type,
  status: row.status,
  targetLabel: row.target_label ?? null,
  articleTitle: row.article_title ?? null,
  articleSlug: row.article_slug ?? null,
  externalPublicationId: row.external_publication_id ?? null,
  externalPublicationUrl: row.external_publication_url ?? null,
  caption: row.caption ?? null,
  requestPayload: row.request_payload ?? null,
  responsePayload: row.response_payload ?? null,
  errorMessage: row.error_message ?? null,
  publishedAt: row.published_at ?? null,
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
  const [socialSettings, setSocialSettings] = useState<NewsSocialSettingsRecord | null>(null);
  const [socialPublications, setSocialPublications] = useState<NewsSocialPublicationRecord[]>([]);
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

  const fetchSocialSettings = async () => {
    const { data, error } = await supabase.from('news_social_settings').select('*').limit(1).maybeSingle();
    if (error) throw error;
    setSocialSettings(data ? mapSocialSettings(data) : null);
  };

  const fetchSocialPublications = async () => {
    const { data, error } = await supabase
      .from('news_social_publications')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(30);
    if (error) throw error;
    setSocialPublications((data || []).map(mapSocialPublication));
  };

  const refreshAll = async (options?: { silent?: boolean }) => {
    if (!options?.silent) {
      setIsLoading(true);
    }
    setError(null);
    try {
      await Promise.all([
        fetchDashboard(),
        fetchArticles(),
        fetchSources(),
        fetchSettings(),
        fetchJobs(),
        fetchSocialSettings(),
        fetchSocialPublications(),
      ]);
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

  const saveSocialSettings = async (payload: Partial<NewsSocialSettingsRecord>) => {
    const currentId = socialSettings?.id;
    const hasField = <K extends keyof NewsSocialSettingsRecord>(field: K) =>
      Object.prototype.hasOwnProperty.call(payload, field);
    const dbPayload = {
      instagram_enabled: hasField('instagramEnabled')
        ? payload.instagramEnabled
        : socialSettings?.instagramEnabled ?? false,
      instagram_username: hasField('instagramUsername')
        ? payload.instagramUsername
        : socialSettings?.instagramUsername ?? null,
      instagram_business_account_id: hasField('instagramBusinessAccountId')
        ? payload.instagramBusinessAccountId
        : socialSettings?.instagramBusinessAccountId ?? null,
      instagram_access_token: hasField('instagramAccessToken')
        ? payload.instagramAccessToken
        : socialSettings?.instagramAccessToken ?? null,
      default_instagram_story_image_url: hasField('defaultInstagramStoryImageUrl')
        ? payload.defaultInstagramStoryImageUrl
        : socialSettings?.defaultInstagramStoryImageUrl ?? null,
      default_instagram_story_image_path: hasField('defaultInstagramStoryImagePath')
        ? payload.defaultInstagramStoryImagePath
        : socialSettings?.defaultInstagramStoryImagePath ?? null,
      linkedin_enabled: hasField('linkedinEnabled')
        ? payload.linkedinEnabled
        : socialSettings?.linkedinEnabled ?? false,
      linkedin_profile_type: hasField('linkedinProfileType')
        ? payload.linkedinProfileType
        : socialSettings?.linkedinProfileType ?? 'organization',
      linkedin_profile_label: hasField('linkedinProfileLabel')
        ? payload.linkedinProfileLabel
        : socialSettings?.linkedinProfileLabel ?? null,
      linkedin_author_urn: hasField('linkedinAuthorUrn')
        ? payload.linkedinAuthorUrn
        : socialSettings?.linkedinAuthorUrn ?? null,
      linkedin_access_token: hasField('linkedinAccessToken')
        ? payload.linkedinAccessToken
        : socialSettings?.linkedinAccessToken ?? null,
      default_linkedin_image_url: hasField('defaultLinkedinImageUrl')
        ? payload.defaultLinkedinImageUrl
        : socialSettings?.defaultLinkedinImageUrl ?? null,
      default_linkedin_image_path: hasField('defaultLinkedinImagePath')
        ? payload.defaultLinkedinImagePath
        : socialSettings?.defaultLinkedinImagePath ?? null,
      auto_publish_instagram_story: hasField('autoPublishInstagramStory')
        ? payload.autoPublishInstagramStory
        : socialSettings?.autoPublishInstagramStory ?? false,
      auto_publish_linkedin_post: hasField('autoPublishLinkedinPost')
        ? payload.autoPublishLinkedinPost
        : socialSettings?.autoPublishLinkedinPost ?? true,
      instagram_story_template: hasField('instagramStoryTemplate')
        ? payload.instagramStoryTemplate
        : socialSettings?.instagramStoryTemplate ?? null,
      linkedin_post_template: hasField('linkedinPostTemplate')
        ? payload.linkedinPostTemplate
        : socialSettings?.linkedinPostTemplate ?? null,
      article_url_base: hasField('articleUrlBase')
        ? payload.articleUrlBase
        : socialSettings?.articleUrlBase ?? null,
      updated_at: new Date().toISOString(),
    };

    const query = currentId
      ? supabase.from('news_social_settings').update(dbPayload).eq('id', currentId)
      : supabase.from('news_social_settings').insert(dbPayload);

    const { error } = await query;
    if (error) return { error: error.message };
    await refreshAll({ silent: true });
    return { error: null };
  };

  const buildArticleUrl = (slug: string) => {
    const explicitBase = socialSettings?.articleUrlBase?.trim();
    if (explicitBase) {
      return `${explicitBase.replace(/\/+$/, '')}/${slug}`;
    }

    if (typeof window !== 'undefined') {
      return `${window.location.origin}/#/noticias/${slug}`;
    }

    return `/noticias/${slug}`;
  };

  const applyTemplate = (template: string | null | undefined, article: NewsArticleRecord) => {
    const url = buildArticleUrl(article.slug);
    return (template || '')
      .replaceAll('{{title}}', article.title || '')
      .replaceAll('{{summary}}', article.summary || '')
      .replaceAll('{{url}}', url);
  };

  const queueSocialPublications = async (article: NewsArticleRecord) => {
    if (!socialSettings) return;

    const rows: any[] = [];
    const instagramImageUrl =
      socialSettings.defaultInstagramStoryImageUrl || article.featuredImageUrl || null;
    const linkedinImageUrl =
      socialSettings.defaultLinkedinImageUrl || article.featuredImageUrl || null;

    if (socialSettings.instagramEnabled && socialSettings.autoPublishInstagramStory) {
      const canPublishInstagram =
        Boolean(socialSettings.instagramAccessToken) &&
        Boolean(socialSettings.instagramBusinessAccountId) &&
        socialSettings.instagramConnectionStatus !== 'expired' &&
        Boolean(instagramImageUrl);

      rows.push({
        article_id: article.id,
        platform: 'instagram',
        publication_type: 'story',
        status: canPublishInstagram ? 'queued' : 'disabled',
        target_label: socialSettings.instagramUsername ?? null,
        article_title: article.title,
        article_slug: article.slug,
        caption: applyTemplate(socialSettings.instagramStoryTemplate, article),
        request_payload: {
          articleTitle: article.title,
          articleSlug: article.slug,
          articleUrl: buildArticleUrl(article.slug),
          imageUrl: instagramImageUrl,
        },
        error_message: canPublishInstagram
          ? null
          : 'Instagram precisa de Business Account ID, access token e uma arte padr�o ou imagem destacada para publicar story.',
        updated_at: new Date().toISOString(),
      });
    }

    if (socialSettings.linkedinEnabled && socialSettings.autoPublishLinkedinPost) {
      rows.push({
        article_id: article.id,
        platform: 'linkedin',
        publication_type: 'post',
        status: socialSettings.linkedinAccessToken ? 'queued' : 'disabled',
        target_label: socialSettings.linkedinProfileLabel ?? null,
        article_title: article.title,
        article_slug: article.slug,
        caption: applyTemplate(socialSettings.linkedinPostTemplate, article),
        request_payload: {
          articleTitle: article.title,
          articleSlug: article.slug,
          articleUrl: buildArticleUrl(article.slug),
          imageUrl: linkedinImageUrl,
          authorUrn: socialSettings.linkedinAuthorUrn,
          profileType: socialSettings.linkedinProfileType,
        },
        error_message: socialSettings.linkedinAccessToken
          ? null
          : 'LinkedIn sem access token configurado.',
        updated_at: new Date().toISOString(),
      });
    }

    if (rows.length === 0) return;

    const { error } = await supabase.from('news_social_publications').upsert(rows, {
      onConflict: 'article_id,platform',
    });

    if (error) {
      console.error('[useAdminNews] Erro ao enfileirar publicações sociais:', error);
    } else {
      await fetchSocialPublications();

      const hasLinkedinQueued = rows.some((row) => row.platform === 'linkedin' && row.status === 'queued');
      if (hasLinkedinQueued) {
        const invokeResult = await supabase.functions.invoke('publish-news-social', {
          method: 'POST',
          body: {
            articleId: article.id,
            platform: 'linkedin',
          },
        });

        if (invokeResult.error) {
          console.error('[useAdminNews] Erro ao disparar publicação social:', invokeResult.error);
        } else {
          await fetchSocialPublications();
        }
      }

      const hasInstagramQueued = rows.some((row) => row.platform === 'instagram' && row.status === 'queued');
      if (hasInstagramQueued) {
        const invokeResult = await supabase.functions.invoke('publish-news-social', {
          method: 'POST',
          body: {
            articleId: article.id,
            platform: 'instagram',
          },
        });

        if (invokeResult.error) {
          console.error('[useAdminNews] Erro ao disparar publicação do Instagram:', invokeResult.error);
          try {
            const errorBody = await invokeResult.error.context?.json?.();
            console.error('[useAdminNews] Corpo da resposta de publish-news-social (Instagram):', errorBody);
          } catch {
            try {
              const errorText = await invokeResult.error.context?.text?.();
              console.error('[useAdminNews] Corpo da resposta de publish-news-social (Instagram):', errorText);
            } catch {
              console.error('[useAdminNews] Erro ao ler corpo da resposta de publish-news-social (Instagram)');
            }
          }
        } else {
          await fetchSocialPublications();
        }
      }
    }
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
      editorial_category:
        normalizeEditorialCategory(payload.editorialCategory) ||
        classifyNewsEditorialCategory({
          title: payload.title,
          subtitle: payload.subtitle,
          summary: payload.summary,
          content: payload.content,
          portalName: payload.originalPortalName,
        }),
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

      await queueSocialPublications({
        id: articleId,
        ingestionId: payload.ingestionId ?? null,
        editorialCategory: payload.editorialCategory ?? null,
        title: payload.title,
        subtitle: payload.subtitle ?? null,
        summary: payload.summary ?? null,
        content: payload.content ?? null,
        agroImpact: payload.agroImpact ?? null,
        referencesBlock: payload.referencesBlock ?? null,
        slug,
        status: payload.status,
        featuredImageUrl: payload.featuredImageUrl ?? null,
        featuredImagePath: null,
        publishedAt,
        createdAt: nowIso,
        updatedAt: nowIso,
        sourceUrl: payload.sourceUrl ?? null,
        originalPortalName: payload.originalPortalName ?? null,
        originalTitle: payload.originalTitle ?? null,
        originalPublishedAt: payload.originalPublishedAt ?? null,
        sourceName: null,
      });
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
      editorialCategory: article.editorialCategory,
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
      editorialCategory: article.editorialCategory,
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

  const startMetaInstagramConnection = async () => {
    const { data, error } = await supabase.functions.invoke('start-meta-social-connection', {
      method: 'POST',
      body: {
        appOrigin: typeof window !== 'undefined' ? window.location.origin : null,
      },
    });

    if (error || !data?.success) {
      return {
        error: data?.error || error?.message || 'Nao foi possivel iniciar a conexao com a Meta.',
        data: null,
      };
    }

    return {
      error: null,
      data: data.data as { authUrl: string; state: string; redirectUri: string },
    };
  };

  const completeMetaInstagramConnection = async (code: string, state: string, redirectUri: string) => {
    const { data, error } = await supabase.functions.invoke('complete-meta-social-connection', {
      method: 'POST',
      body: {
        code,
        state,
        redirectUri,
      },
    });

    if (error || !data?.success) {
      return {
        error: data?.error || error?.message || 'Nao foi possivel concluir a conexao com a Meta.',
        data: null,
      };
    }

    await fetchSocialSettings();
    return {
      error: null,
      data: data.data as {
        facebookPageId: string;
        facebookPageName: string;
        instagramBusinessAccountId: string;
        instagramUsername: string | null;
        expiresAt: string | null;
      },
    };
  };

  const validateMetaInstagramConnection = async () => {
    const { data, error } = await supabase.functions.invoke('validate-meta-social-connection', {
      method: 'POST',
      body: {},
    });

    if (error || !data?.success) {
      return {
        error: data?.error || error?.message || 'Nao foi possivel validar a conexao da Meta.',
        data: null,
      };
    }

    await fetchSocialSettings();
    return { error: null, data: data.data as { status: string; expiresAt: string | null } };
  };

  return {
    dashboard,
    articles,
    sources,
    settings,
    socialSettings,
    socialPublications,
    jobs,
    isLoading,
    error,
    refreshAll,
    fetchArticles,
    upsertSource,
    deleteSource,
    saveSocialSettings,
    startMetaInstagramConnection,
    completeMetaInstagramConnection,
    validateMetaInstagramConnection,
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
