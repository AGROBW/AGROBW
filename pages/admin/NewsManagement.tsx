import React, { useMemo, useState } from 'react';
import { BarChart3, FileText, Globe, Newspaper, Settings, Share2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAdminNews } from '../../src/hooks/useAdminNews';
import type { NewsArticleRecord, NewsSettingsRecord, NewsSourceRecord } from '../../types';
import NewsDashboardPanel from '../../components/admin/news/NewsDashboardPanel';
import NewsArticleForm, { NewsArticleDraftForm } from '../../components/admin/news/NewsArticleForm';
import NewsArticlesTable from '../../components/admin/news/NewsArticlesTable';
import NewsSourcesPanel from '../../components/admin/news/NewsSourcesPanel';
import NewsSettingsPanel from '../../components/admin/news/NewsSettingsPanel';
import NewsSocialPanel from '../../components/admin/news/NewsSocialPanel';

type NewsTab = 'dashboard' | 'new' | 'drafts' | 'published' | 'sources' | 'social' | 'settings';

const NewsManagement: React.FC = () => {
  const {
    dashboard,
    articles,
    sources,
    settings,
    socialSettings,
    socialPublications,
    isLoading,
    error,
    createCapture,
    generateArticleFromIngestion,
    saveArticle,
    publishArticle,
    unpublishArticle,
    duplicateArticle,
    deleteArticle,
    upsertSource,
    deleteSource,
    saveSocialSettings,
    startMetaInstagramConnection,
    completeMetaInstagramConnection,
    validateMetaInstagramConnection,
    saveSettings,
  } = useAdminNews();
  const [activeTab, setActiveTab] = useState<NewsTab>('dashboard');
  const [editingArticle, setEditingArticle] = useState<NewsArticleRecord | null>(null);

  const draftArticles = useMemo(
    () => articles.filter((article) => article.status !== 'published'),
    [articles]
  );
  const publishedArticles = useMemo(
    () => articles.filter((article) => article.status === 'published'),
    [articles]
  );

  const handleCapture = async (url: string) => {
    try {
      const result = await createCapture(url);
      if (result.error || !result.data) {
        throw new Error(result.error || 'Falha ao capturar URL');
      }
      toast.success('Conteudo capturado com sucesso.');
      return {
        ingestionId: result.data.id,
        sourceUrl: result.data.sourceUrl,
        originalPortalName: result.data.originalPortalName || new URL(url).hostname,
        originalTitle: result.data.originalTitle || '',
        originalPublishedAt: result.data.originalPublishedAt || '',
        featuredImageUrl: result.data.featuredImageUrl || '',
        extractedText: result.data.extractedText || '',
        captureStatus: result.data.captureStatus,
        captureError: result.data.captureError || null,
      };
    } catch (err: any) {
      toast.error(err.message || 'Nao foi possivel capturar a URL.');
      return null;
    }
  };

  const handleGenerate = async (payload: Pick<NewsArticleDraftForm, 'id' | 'ingestionId'>) => {
    if (!payload.ingestionId) {
      toast.error('Capture a noticia antes de gerar a materia.');
      return null;
    }

    const result = await generateArticleFromIngestion(payload.ingestionId, payload.id);
    if (result.error || !result.data) {
      toast.error(result.error || 'Nao foi possivel gerar a materia.');
      return null;
    }

    toast.success('Base editorial gerada com IA e salva como rascunho.');
    return result.data;
  };

  const handleSaveDraft = async (payload: NewsArticleDraftForm) => {
    const { error } = await saveArticle(payload);
    if (error) {
      toast.error(error);
      return;
    }
    toast.success('Materia salva como rascunho.');
    setEditingArticle(null);
    setActiveTab('drafts');
  };

  const handlePublish = async (payload: NewsArticleDraftForm) => {
    const { error } = await saveArticle({ ...payload, status: 'published' });
    if (error) {
      toast.error(error);
      return;
    }
    toast.success('Materia publicada com sucesso.');
    setEditingArticle(null);
    setActiveTab('published');
  };

  const tabs = [
    { id: 'dashboard' as NewsTab, label: 'Dashboard', icon: BarChart3 },
    { id: 'new' as NewsTab, label: 'Nova Materia', icon: Newspaper },
    { id: 'drafts' as NewsTab, label: 'Rascunhos', icon: FileText },
    { id: 'published' as NewsTab, label: 'Publicadas', icon: Globe },
    { id: 'sources' as NewsTab, label: 'Fontes', icon: Newspaper },
    { id: 'social' as NewsTab, label: 'Rede Social', icon: Share2 },
    { id: 'settings' as NewsTab, label: 'Configuracoes', icon: Settings },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-green-500 to-green-700 text-white shadow-lg shadow-green-500/30">
          <Newspaper className="h-5 w-5" strokeWidth={2.2} />
        </div>
        <div>
          <h1 className="text-2xl font-black text-slate-900">Modulo de Noticias</h1>
          <p className="text-sm text-slate-500">
            Capture fontes, gere materias autorais, revise e publique no mural do site.
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-1.5">
        <div className="flex flex-wrap gap-1">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  if (tab.id === 'new' && !editingArticle) {
                    setEditingArticle(null);
                  }
                  setActiveTab(tab.id);
                }}
                className={`inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-all ${
                  isActive ? 'bg-green-500 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {isLoading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
          Carregando modulo de noticias...
        </div>
      ) : null}

      {!isLoading && activeTab === 'dashboard' ? (
        <NewsDashboardPanel
          stats={dashboard}
          latestArticles={dashboard.latestArticles}
          latestPublished={dashboard.latestPublished}
          topSources={dashboard.topSources}
          onCreateNew={() => {
            setEditingArticle(null);
            setActiveTab('new');
          }}
        />
      ) : null}

      {!isLoading && activeTab === 'new' ? (
        <NewsArticleForm
          initialArticle={editingArticle}
          settings={settings as NewsSettingsRecord | null}
          onCapture={handleCapture}
          onGenerate={handleGenerate}
          onSaveDraft={handleSaveDraft}
          onPublish={handlePublish}
        />
      ) : null}

      {!isLoading && activeTab === 'drafts' ? (
        <NewsArticlesTable
          title="Rascunhos"
          emptyText="Nenhuma materia em rascunho."
          articles={draftArticles}
          onEdit={(article) => {
            setEditingArticle(article);
            setActiveTab('new');
          }}
          onDuplicate={async (article) => {
            const result = await duplicateArticle(article);
            if (result.error) {
              toast.error(result.error);
              return;
            }
            toast.success('Materia duplicada com sucesso.');
          }}
          onDelete={async (article) => {
            const result = await deleteArticle(article);
            if (result.error) {
              toast.error(result.error);
              return;
            }
            toast.success('Materia excluida com sucesso.');
          }}
          onPublish={async (article) => {
            const result = await publishArticle(article);
            if (result.error) {
              toast.error(result.error);
              return;
            }
            toast.success('Materia publicada com sucesso.');
          }}
        />
      ) : null}

      {!isLoading && activeTab === 'published' ? (
        <NewsArticlesTable
          title="Publicadas"
          emptyText="Nenhuma materia publicada."
          articles={publishedArticles}
          onEdit={(article) => {
            setEditingArticle(article);
            setActiveTab('new');
          }}
          onDelete={async (article) => {
            const result = await deleteArticle(article);
            if (result.error) {
              toast.error(result.error);
              return;
            }
            toast.success('Materia excluida com sucesso.');
          }}
          onUnpublish={async (article) => {
            const result = await unpublishArticle(article);
            if (result.error) {
              toast.error(result.error);
              return;
            }
            toast.success('Materia retornou para rascunho.');
          }}
          onView={(article) => {
            window.open(`/#/noticias/${article.slug}`, '_blank', 'noopener,noreferrer');
          }}
        />
      ) : null}

      {!isLoading && activeTab === 'sources' ? (
        <NewsSourcesPanel
          sources={sources as NewsSourceRecord[]}
          onSave={async (payload) => {
            const result = await upsertSource(payload);
            if (result.error) {
              toast.error(result.error);
              return;
            }
            toast.success('Fonte salva com sucesso.');
          }}
          onDelete={async (source) => {
            const result = await deleteSource(source.id);
            if (result.error) {
              toast.error(result.error);
              return;
            }
            toast.success('Fonte excluida com sucesso.');
          }}
        />
      ) : null}

      {!isLoading && activeTab === 'settings' ? (
        <NewsSettingsPanel
          settings={settings}
          onSave={async (payload) => {
            const result = await saveSettings(payload);
            if (result.error) {
              toast.error(result.error);
              return;
            }
            toast.success('Configuracoes salvas com sucesso.');
          }}
        />
      ) : null}

      {!isLoading && activeTab === 'social' ? (
        <NewsSocialPanel
          settings={socialSettings}
          publications={socialPublications}
          onStartMetaConnect={startMetaInstagramConnection}
          onCompleteMetaConnect={completeMetaInstagramConnection}
          onValidateMetaConnect={validateMetaInstagramConnection}
          onSave={async (payload) => {
            const result = await saveSocialSettings(payload);
            if (result.error) {
              toast.error(result.error);
              return;
            }
            toast.success('Configurações de rede social salvas com sucesso.');
          }}
        />
      ) : null}
    </div>
  );
};

export default NewsManagement;
