import React from 'react';
import { Copy, Eye, FileUp, Pencil, Trash2 } from 'lucide-react';
import type { NewsArticleRecord } from '../../../types';

interface NewsArticlesTableProps {
  title: string;
  emptyText: string;
  articles: NewsArticleRecord[];
  onEdit: (article: NewsArticleRecord) => void;
  onDuplicate?: (article: NewsArticleRecord) => void;
  onDelete: (article: NewsArticleRecord) => void;
  onPublish?: (article: NewsArticleRecord) => void;
  onUnpublish?: (article: NewsArticleRecord) => void;
  onView?: (article: NewsArticleRecord) => void;
}

const NewsArticlesTable: React.FC<NewsArticlesTableProps> = ({
  title,
  emptyText,
  articles,
  onEdit,
  onDuplicate,
  onDelete,
  onPublish,
  onUnpublish,
  onView,
}) => (
  <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
    <h3 className="text-lg font-black text-slate-900">{title}</h3>
    <div className="mt-5 overflow-x-auto">
      <table className="min-w-full">
        <thead>
          <tr className="border-b border-slate-100 text-left text-xs font-black uppercase tracking-[0.16em] text-slate-400">
            <th className="px-3 py-3">Titulo</th>
            <th className="px-3 py-3">Fonte</th>
            <th className="px-3 py-3">Data</th>
            <th className="px-3 py-3">Status</th>
            <th className="px-3 py-3 text-right">Acoes</th>
          </tr>
        </thead>
        <tbody>
          {articles.length === 0 ? (
            <tr>
              <td colSpan={5} className="px-3 py-10 text-center text-sm text-slate-500">
                {emptyText}
              </td>
            </tr>
          ) : (
            articles.map((article) => (
              <tr key={article.id} className="border-b border-slate-50 last:border-b-0">
                <td className="px-3 py-4">
                  <div>
                    <p className="font-semibold text-slate-900">{article.title || article.originalTitle || 'Materia sem titulo'}</p>
                    <p className="mt-1 text-xs text-slate-500">{article.slug}</p>
                  </div>
                </td>
                <td className="px-3 py-4 text-sm text-slate-600">{article.originalPortalName || 'Sem fonte'}</td>
                <td className="px-3 py-4 text-sm text-slate-600">
                  {new Date(article.updatedAt).toLocaleDateString('pt-BR')}
                </td>
                <td className="px-3 py-4">
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold uppercase text-slate-600">
                    {article.status}
                  </span>
                </td>
                <td className="px-3 py-4">
                  <div className="flex justify-end gap-2">
                    <button onClick={() => onEdit(article)} className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50" title="Editar">
                      <Pencil className="h-4 w-4" />
                    </button>
                    {onDuplicate ? (
                      <button onClick={() => onDuplicate(article)} className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50" title="Duplicar">
                        <Copy className="h-4 w-4" />
                      </button>
                    ) : null}
                    {onPublish ? (
                      <button onClick={() => onPublish(article)} className="rounded-lg border border-green-200 p-2 text-green-700 hover:bg-green-50" title="Publicar">
                        <FileUp className="h-4 w-4" />
                      </button>
                    ) : null}
                    {onUnpublish ? (
                      <button onClick={() => onUnpublish(article)} className="rounded-lg border border-amber-200 p-2 text-amber-700 hover:bg-amber-50" title="Despublicar">
                        <Eye className="h-4 w-4" />
                      </button>
                    ) : null}
                    {onView ? (
                      <button onClick={() => onView(article)} className="rounded-lg border border-blue-200 p-2 text-blue-700 hover:bg-blue-50" title="Visualizar">
                        <Eye className="h-4 w-4" />
                      </button>
                    ) : null}
                    <button onClick={() => onDelete(article)} className="rounded-lg border border-red-200 p-2 text-red-700 hover:bg-red-50" title="Excluir">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  </div>
);

export default NewsArticlesTable;
