import React, { useEffect, useMemo, useState } from 'react';
import { Download, Mail, RefreshCw, Search } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../../src/lib/supabaseClient';

interface NewsletterSubscription {
  id: string;
  email: string;
  source: string;
  status: string;
  created_at: string;
  updated_at: string;
  total_count?: number;
}

const PAGE_SIZE = 20;

const NewsletterSubscriptionsManagement: React.FC = () => {
  const [subscriptions, setSubscriptions] = useState<NewsletterSubscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('active');
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(totalCount / PAGE_SIZE)), [totalCount]);

  const loadSubscriptions = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase.rpc('admin_list_newsletter_subscriptions', {
        p_search: searchTerm.trim() || null,
        p_status: statusFilter === 'all' ? null : statusFilter,
        p_page: page,
        p_page_size: PAGE_SIZE,
      });

      if (error) {
        throw error;
      }

      const rows = (data || []) as NewsletterSubscription[];
      setSubscriptions(rows);
      setTotalCount(rows[0]?.total_count || 0);
    } catch (error) {
      console.error('[NewsletterSubscriptionsManagement] Erro ao carregar newsletter:', error);
      toast.error('Não foi possível carregar os e-mails cadastrados.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadSubscriptions();
  }, [page, searchTerm, statusFilter]);

  useEffect(() => {
    setPage(0);
  }, [searchTerm, statusFilter]);

  const handleExportCsv = async () => {
    try {
      const { data, error } = await supabase.rpc('admin_export_newsletter_subscriptions', {
        p_search: searchTerm.trim() || null,
        p_status: statusFilter === 'all' ? null : statusFilter,
      });

      if (error) {
        throw error;
      }

      const rows = (data || []) as Array<{
        email: string;
        source: string;
        status: string;
        created_at: string;
        updated_at: string;
      }>;

      if (rows.length === 0) {
        toast.error('Nenhum e-mail encontrado para exportar.');
        return;
      }

      const csvContent = ['email', ...rows.map((row) => row.email)].join('\n');
      const blob = new Blob([`\uFEFF${csvContent}`], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const dateLabel = new Date().toISOString().slice(0, 10);

      link.href = url;
      link.download = `newsletter-${dateLabel}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success('CSV exportado com sucesso.');
    } catch (error) {
      console.error('[NewsletterSubscriptionsManagement] Erro ao exportar newsletter:', error);
      toast.error('Não foi possível exportar os e-mails agora.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900">Newsletter</h1>
          <p className="mt-1 text-slate-500">
            {totalCount} e-mail{totalCount !== 1 ? 's' : ''} cadastrado{totalCount !== 1 ? 's' : ''}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              void handleExportCsv();
            }}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
          >
            <Download className="h-4 w-4" />
            Exportar CSV
          </button>
          <button
            type="button"
            onClick={() => {
              void loadSubscriptions();
            }}
            className="inline-flex items-center gap-2 rounded-lg bg-green-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-green-600"
          >
            <RefreshCw className="h-4 w-4" />
            Atualizar
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-col gap-4 md:flex-row">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Buscar por e-mail..."
                className="w-full rounded-lg border border-slate-200 py-2 pl-10 pr-4 focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
          </div>

          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className="rounded-lg border border-slate-200 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-green-500"
          >
            <option value="all">Todos os status</option>
            <option value="active">Ativos</option>
            <option value="inactive">Inativos</option>
          </select>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-black uppercase tracking-wider text-slate-600">E-mail</th>
                <th className="px-6 py-3 text-left text-xs font-black uppercase tracking-wider text-slate-600">Origem</th>
                <th className="px-6 py-3 text-left text-xs font-black uppercase tracking-wider text-slate-600">Status</th>
                <th className="px-6 py-3 text-left text-xs font-black uppercase tracking-wider text-slate-600">Cadastro</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {loading ? (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center">
                    <div className="mx-auto h-8 w-8 animate-spin rounded-full border-b-2 border-green-600" />
                  </td>
                </tr>
              ) : subscriptions.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-slate-500">
                    Nenhum e-mail cadastrado encontrado.
                  </td>
                </tr>
              ) : (
                subscriptions.map((subscription) => (
                  <tr key={subscription.id} className="hover:bg-slate-50">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100 text-green-700">
                          <Mail className="h-4 w-4" />
                        </div>
                        <span className="font-semibold text-slate-900">{subscription.email}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600">{subscription.source || 'footer'}</td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                          subscription.status === 'active'
                            ? 'bg-green-100 text-green-800'
                            : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {subscription.status === 'active' ? 'Ativo' : subscription.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600">
                      {new Date(subscription.created_at).toLocaleString('pt-BR', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {totalCount > PAGE_SIZE && (
          <div className="flex items-center justify-between border-t border-slate-200 px-6 py-4">
            <p className="text-sm text-slate-500">
              Página {page + 1} de {totalPages}
            </p>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((current) => Math.max(0, current - 1))}
                disabled={page === 0}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-50"
              >
                Anterior
              </button>
              <button
                type="button"
                onClick={() => setPage((current) => Math.min(totalPages - 1, current + 1))}
                disabled={page >= totalPages - 1}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-50"
              >
                Próxima
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default NewsletterSubscriptionsManagement;
