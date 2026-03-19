import React, { useEffect, useState } from 'react';
import { Bot, Link2, Save, Send } from 'lucide-react';
import type { NewsArticleRecord, NewsArticleStatus, NewsSettingsRecord } from '../../../types';

export interface NewsArticleDraftForm {
  id?: string;
  ingestionId?: string | null;
  sourceUrl: string;
  originalPortalName: string;
  originalTitle: string;
  originalPublishedAt: string;
  title: string;
  subtitle: string;
  summary: string;
  content: string;
  agroImpact: string;
  referencesBlock: string;
  featuredImageUrl: string;
  status: NewsArticleStatus;
}

interface NewsArticleFormProps {
  initialArticle?: NewsArticleRecord | null;
  settings?: NewsSettingsRecord | null;
  onCapture: (url: string) => Promise<{ portalName: string; referencesBlock: string }>;
  onSaveDraft: (payload: NewsArticleDraftForm) => Promise<void>;
  onPublish: (payload: NewsArticleDraftForm) => Promise<void>;
}

const buildInitialState = (article?: NewsArticleRecord | null): NewsArticleDraftForm => ({
  id: article?.id,
  ingestionId: article?.ingestionId ?? null,
  sourceUrl: article?.sourceUrl || '',
  originalPortalName: article?.originalPortalName || '',
  originalTitle: article?.originalTitle || '',
  originalPublishedAt: article?.originalPublishedAt ? article.originalPublishedAt.slice(0, 10) : '',
  title: article?.title || '',
  subtitle: article?.subtitle || '',
  summary: article?.summary || '',
  content: article?.content || '',
  agroImpact: article?.agroImpact || '',
  referencesBlock: article?.referencesBlock || '',
  featuredImageUrl: article?.featuredImageUrl || '',
  status: article?.status || 'draft',
});

const NewsArticleForm: React.FC<NewsArticleFormProps> = ({
  initialArticle,
  settings,
  onCapture,
  onSaveDraft,
  onPublish,
}) => {
  const [form, setForm] = useState<NewsArticleDraftForm>(buildInitialState(initialArticle));
  const [capturing, setCapturing] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [publishing, setPublishing] = useState(false);

  useEffect(() => {
    setForm(buildInitialState(initialArticle));
  }, [initialArticle]);

  const setValue = (field: keyof NewsArticleDraftForm, value: string | NewsArticleStatus | null | undefined) => {
    setForm((prev) => ({ ...prev, [field]: value ?? '' }));
  };

  const handleCapture = async () => {
    if (!form.sourceUrl.trim()) return;
    setCapturing(true);
    const result = await onCapture(form.sourceUrl);
    setForm((prev) => ({
      ...prev,
      originalPortalName: prev.originalPortalName || result.portalName,
      referencesBlock: prev.referencesBlock || result.referencesBlock,
    }));
    setCapturing(false);
  };

  const handleGeneratePlaceholder = () => {
    const sourceName = form.originalPortalName || 'fonte informada';
    const sourceTitle = form.originalTitle || 'materia capturada';
    const generatedSummary =
      form.summary ||
      `Conteudo original redigido com base factual em ${sourceName}, mantendo foco no agronegocio brasileiro.`;
    const generatedContent =
      form.content ||
      `Esta materia foi preparada a partir da noticia "${sourceTitle}", com reescrita original e abordagem editorial voltada ao agronegocio brasileiro.\n\nDesenvolva aqui os fatos principais, contexto economico, impacto na cadeia produtiva e os proximos desdobramentos do tema.`;

    setForm((prev) => ({
      ...prev,
      title: prev.title || sourceTitle,
      subtitle: prev.subtitle || 'Nova leitura editorial com foco no agro brasileiro.',
      summary: generatedSummary,
      content: generatedContent,
      agroImpact:
        prev.agroImpact ||
        (settings?.showAgroImpact
          ? 'Explique aqui como esse fato pode afetar produtores, distribuidores, cooperativas e o mercado agro.'
          : ''),
      referencesBlock:
        prev.referencesBlock ||
        settings?.referencesTemplate
          ?.replace('{{portal_name}}', sourceName)
          .replace('{{source_url}}', form.sourceUrl || '')
          .replace('{{original_published_at}}', form.originalPublishedAt || 'data nao informada') ||
        '',
    }));
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="text-lg font-black text-slate-900">Captura da fonte</h3>
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[1fr,auto]">
          <input
            value={form.sourceUrl}
            onChange={(event) => setValue('sourceUrl', event.target.value)}
            placeholder="Cole a URL da noticia original"
            className="h-12 rounded-xl border border-slate-200 px-4 text-sm"
          />
          <button
            type="button"
            onClick={handleCapture}
            disabled={capturing}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 py-3 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-60"
          >
            <Link2 className="h-4 w-4" />
            {capturing ? 'Capturando...' : 'Capturar Conteudo'}
          </button>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
          <input value={form.originalTitle} onChange={(event) => setValue('originalTitle', event.target.value)} placeholder="Titulo original" className="h-11 rounded-xl border border-slate-200 px-4 text-sm" />
          <input value={form.originalPortalName} onChange={(event) => setValue('originalPortalName', event.target.value)} placeholder="Veiculo / fonte" className="h-11 rounded-xl border border-slate-200 px-4 text-sm" />
          <input value={form.originalPublishedAt} onChange={(event) => setValue('originalPublishedAt', event.target.value)} type="date" className="h-11 rounded-xl border border-slate-200 px-4 text-sm" />
          <input value={form.featuredImageUrl} onChange={(event) => setValue('featuredImageUrl', event.target.value)} placeholder="Imagem destacada (URL)" className="h-11 rounded-xl border border-slate-200 px-4 text-sm" />
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-black text-slate-900">Redacao assistida</h3>
            <p className="text-sm text-slate-500">Preencha manualmente ou use a base pronta para revisao editorial.</p>
          </div>
          <button
            type="button"
            onClick={handleGeneratePlaceholder}
            className="inline-flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 px-4 py-2 text-sm font-bold text-green-700 hover:bg-green-100"
          >
            <Bot className="h-4 w-4" />
            Gerar base com IA
          </button>
        </div>

        <div className="grid grid-cols-1 gap-4">
          <input value={form.title} onChange={(event) => setValue('title', event.target.value)} placeholder="Titulo novo" className="h-12 rounded-xl border border-slate-200 px-4 text-sm" />
          <input value={form.subtitle} onChange={(event) => setValue('subtitle', event.target.value)} placeholder="Subtitulo" className="h-11 rounded-xl border border-slate-200 px-4 text-sm" />
          <textarea value={form.summary} onChange={(event) => setValue('summary', event.target.value)} placeholder="Resumo" rows={3} className="rounded-2xl border border-slate-200 px-4 py-3 text-sm" />
          <textarea value={form.content} onChange={(event) => setValue('content', event.target.value)} placeholder="Conteudo da materia" rows={10} className="rounded-2xl border border-slate-200 px-4 py-3 text-sm" />
          {settings?.showAgroImpact ? (
            <textarea value={form.agroImpact} onChange={(event) => setValue('agroImpact', event.target.value)} placeholder="Bloco Impacto no Agro" rows={4} className="rounded-2xl border border-slate-200 px-4 py-3 text-sm" />
          ) : null}
          <textarea value={form.referencesBlock} onChange={(event) => setValue('referencesBlock', event.target.value)} placeholder="Referencias / fonte original" rows={4} className="rounded-2xl border border-slate-200 px-4 py-3 text-sm" />
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={async () => {
            setSavingDraft(true);
            await onSaveDraft({ ...form, status: 'draft' });
            setSavingDraft(false);
          }}
          className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-3 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-60"
        >
          <Save className="h-4 w-4" />
          {savingDraft ? 'Salvando...' : 'Salvar Rascunho'}
        </button>
        <button
          type="button"
          onClick={async () => {
            setPublishing(true);
            await onPublish({ ...form, status: 'published' });
            setPublishing(false);
          }}
          className="inline-flex items-center gap-2 rounded-xl bg-green-600 px-5 py-3 text-sm font-bold text-white hover:bg-green-700 disabled:opacity-60"
        >
          <Send className="h-4 w-4" />
          {publishing ? 'Publicando...' : 'Publicar'}
        </button>
      </div>
    </div>
  );
};

export default NewsArticleForm;
