import React from 'react';
import { FileEdit, Globe2, Newspaper, PenSquare } from 'lucide-react';
import type { NewsArticleRecord, NewsSourceRecord } from '../../../types';
import NewsStatCard from './NewsStatCard';

interface NewsDashboardPanelProps {
  stats: {
    totalArticles: number;
    totalDrafts: number;
    totalPublished: number;
  };
  latestArticles: NewsArticleRecord[];
  latestPublished: NewsArticleRecord[];
  topSources: NewsSourceRecord[];
  onCreateNew: () => void;
}

const NewsDashboardPanel: React.FC<NewsDashboardPanelProps> = ({
  stats,
  latestArticles,
  latestPublished,
  topSources,
  onCreateNew,
}) => {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <NewsStatCard icon={Newspaper} label="Materias geradas" value={stats.totalArticles} />
        <NewsStatCard icon={FileEdit} label="Rascunhos" value={stats.totalDrafts} />
        <NewsStatCard icon={Globe2} label="Publicadas" value={stats.totalPublished} />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.15fr,0.85fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h3 className="text-lg font-black text-slate-900">Ultimas materias criadas</h3>
              <p className="text-sm text-slate-500">Acompanhe o pipeline editorial recente.</p>
            </div>
            <button
              onClick={onCreateNew}
              className="inline-flex items-center gap-2 rounded-xl bg-green-600 px-4 py-2 text-sm font-bold text-white hover:bg-green-700"
            >
              <PenSquare className="h-4 w-4" />
              Nova Materia
            </button>
          </div>

          <div className="space-y-3">
            {latestArticles.length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-500">
                Nenhuma materia criada ainda.
              </p>
            ) : (
              latestArticles.map((article) => (
                <div key={article.id} className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
                  <p className="font-semibold text-slate-900">{article.title}</p>
                  <div className="mt-1 flex flex-wrap gap-3 text-xs text-slate-500">
                    <span>{article.status}</span>
                    <span>{article.originalPortalName || 'Sem fonte'}</span>
                    <span>{new Date(article.updatedAt).toLocaleDateString('pt-BR')}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-lg font-black text-slate-900">Ultimas publicacoes</h3>
            <div className="mt-4 space-y-3">
              {latestPublished.length === 0 ? (
                <p className="text-sm text-slate-500">Nenhuma materia publicada ainda.</p>
              ) : (
                latestPublished.map((article) => (
                  <div key={article.id} className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
                    <p className="font-semibold text-slate-900">{article.title}</p>
                    <p className="mt-1 text-xs text-slate-500">{article.slug}</p>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-lg font-black text-slate-900">Principais fontes</h3>
            <div className="mt-4 space-y-3">
              {topSources.length === 0 ? (
                <p className="text-sm text-slate-500">Nenhuma fonte cadastrada ainda.</p>
              ) : (
                topSources.map((source) => (
                  <div key={source.id} className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
                    <div>
                      <p className="font-semibold text-slate-900">{source.name}</p>
                      <p className="text-xs text-slate-500">{source.domain}</p>
                    </div>
                    <span className="rounded-full bg-slate-200 px-2.5 py-1 text-xs font-bold text-slate-700">
                      {source.usageCount} usos
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default NewsDashboardPanel;
