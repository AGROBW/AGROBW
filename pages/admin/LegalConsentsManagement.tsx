import React, { useEffect, useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Download,
  FileCheck,
  Filter,
  Search,
  ShieldCheck,
  UserCheck,
} from 'lucide-react';
import { supabase } from '../../src/lib/supabaseClient';
import { toast } from 'sonner';
import { appError, appWarn } from '../../src/utils/appLogger';

interface LegalConsentRow {
  id: string;
  user_id: string;
  user_name: string;
  user_email: string;
  user_document: string | null;
  consent_type: string;
  document_version: string;
  document_title: string;
  document_url: string;
  accepted_at: string;
  revoked_at: string | null;
  source: string;
  user_agent: string | null;
  ip_address: string | null;
  metadata: Record<string, unknown> | null;
  total_count?: number;
}

interface ExportLegalConsentRow {
  user_name: string;
  user_email: string;
  user_document: string | null;
  consent_type: string;
  document_version: string;
  document_title: string;
  document_url: string;
  accepted_at: string;
  revoked_at: string | null;
  source: string;
  ip_address: string | null;
  user_agent: string | null;
  metadata: Record<string, unknown> | null;
}

const PAGE_SIZE = 20;

const CONSENT_TYPE_OPTIONS = [
  { value: 'all', label: 'Todos os tipos' },
  { value: 'terms_of_use', label: 'Termos de Uso' },
  { value: 'privacy_policy', label: 'Política de Privacidade' },
  { value: 'marketing_opt_in', label: 'Marketing' },
  { value: 'contact_terms', label: 'Contato' },
];

const SOURCE_OPTIONS = [
  { value: 'all', label: 'Todas as origens' },
  { value: 'register', label: 'Cadastro' },
  { value: 'contact_modal', label: 'Contato' },
  { value: 'profile', label: 'Perfil / Reaceite' },
  { value: 'admin', label: 'Admin' },
];

const formatDateTime = (value: string | null) => {
  if (!value) return '-';
  return new Date(value).toLocaleString('pt-BR');
};

const formatConsentType = (value: string) => {
  switch (value) {
    case 'terms_of_use':
      return 'Termos de Uso';
    case 'privacy_policy':
      return 'Política de Privacidade';
    case 'marketing_opt_in':
      return 'Marketing';
    case 'contact_terms':
      return 'Contato';
    default:
      return value || 'Não informado';
  }
};

const formatSource = (value: string) => {
  switch (value) {
    case 'register':
      return 'Cadastro';
    case 'contact_modal':
      return 'Contato';
    case 'profile':
      return 'Perfil';
    case 'admin':
      return 'Admin';
    default:
      return value || 'Não informado';
  }
};

const normalizeJoinedUser = (value: unknown) => {
  if (Array.isArray(value)) {
    return (value[0] as { name?: string; email?: string; document?: string } | undefined) || null;
  }

  if (value && typeof value === 'object') {
    return value as { name?: string; email?: string; document?: string };
  }

  return null;
};

const escapeHtml = (value: unknown) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const LegalConsentsManagement: React.FC = () => {
  const [rows, setRows] = useState<LegalConsentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [consentTypeFilter, setConsentTypeFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  const summary = useMemo(() => {
    const uniqueUsers = new Set(rows.map((row) => row.user_id)).size;
    const contactOriginCount = rows.filter((row) => row.source === 'contact_modal').length;
    const reacceptCount = rows.filter((row) => row.source === 'profile').length;

    return {
      uniqueUsers,
      contactOriginCount,
      reacceptCount,
    };
  }, [rows]);

  const buildFilterParams = () => ({
    p_search: searchTerm.trim() || null,
    p_consent_type: consentTypeFilter === 'all' ? null : consentTypeFilter,
    p_source: sourceFilter === 'all' ? null : sourceFilter,
    p_date_from: dateFrom ? new Date(`${dateFrom}T00:00:00`).toISOString() : null,
    p_date_to: dateTo ? new Date(`${dateTo}T23:59:59.999`).toISOString() : null,
  });

  const fetchFallbackRows = async (withPagination: boolean): Promise<LegalConsentRow[]> => {
    const trimmedSearch = searchTerm.trim();
    let matchingUserIds: string[] = [];

    if (trimmedSearch) {
      const { data: matchingUsers, error: matchingUsersError } = await supabase
        .from('users')
        .select('id')
        .or(`name.ilike.%${trimmedSearch}%,email.ilike.%${trimmedSearch}%,document.ilike.%${trimmedSearch}%`);

      if (matchingUsersError) {
        throw matchingUsersError;
      }

      matchingUserIds = (matchingUsers || []).map((user) => user.id);
    }

    let query = supabase
      .from('user_legal_consents')
      .select(
        'id,user_id,consent_type,document_version,document_title,document_url,accepted_at,revoked_at,source,user_agent,ip_address,metadata,users!inner(name,email,document)',
        withPagination ? { count: 'exact' } : undefined,
      )
      .order('accepted_at', { ascending: false });

    if (withPagination) {
      query = query.range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
    }

    if (consentTypeFilter !== 'all') {
      query = query.eq('consent_type', consentTypeFilter);
    }

    if (sourceFilter !== 'all') {
      query = query.eq('source', sourceFilter);
    }

    if (dateFrom) {
      query = query.gte('accepted_at', new Date(`${dateFrom}T00:00:00`).toISOString());
    }

    if (dateTo) {
      query = query.lte('accepted_at', new Date(`${dateTo}T23:59:59.999`).toISOString());
    }

    if (trimmedSearch) {
      const consentSearchParts = [
        `document_version.ilike.%${trimmedSearch}%`,
        `document_title.ilike.%${trimmedSearch}%`,
      ];

      if (matchingUserIds.length > 0) {
        consentSearchParts.push(`user_id.in.(${matchingUserIds.join(',')})`);
      }

      query = query.or(consentSearchParts.join(','));
    }

    const { data, error, count } = await query;

    if (error) {
      throw error;
    }

    const normalizedRows = ((((data as unknown[]) || []) as Array<Record<string, unknown>>).map((row) => {
      const joinedUser = normalizeJoinedUser(row.users);

      return {
        id: String(row.id),
        user_id: String(row.user_id),
        user_name: joinedUser?.name || 'Usuário sem nome',
        user_email: joinedUser?.email || 'Sem e-mail',
        user_document: joinedUser?.document || null,
        consent_type: String(row.consent_type || ''),
        document_version: String(row.document_version || ''),
        document_title: String(row.document_title || ''),
        document_url: String(row.document_url || ''),
        accepted_at: String(row.accepted_at || ''),
        revoked_at: row.revoked_at ? String(row.revoked_at) : null,
        source: String(row.source || ''),
        user_agent: row.user_agent ? String(row.user_agent) : null,
        ip_address: row.ip_address ? String(row.ip_address) : null,
        metadata: (row.metadata as Record<string, unknown> | null) || null,
        total_count: count || 0,
      } satisfies LegalConsentRow;
    })) as LegalConsentRow[];

    if (withPagination) {
      setTotalCount(count || 0);
    }

    return normalizedRows;
  };

  const loadConsents = async () => {
    setLoading(true);

    try {
      const { data, error } = await supabase.rpc('admin_list_user_legal_consents', {
        ...buildFilterParams(),
        p_page: page,
        p_page_size: PAGE_SIZE,
      });

      if (error) {
        appWarn('[LegalConsentsManagement] RPC principal falhou, usando fallback direto na tabela', { error });
        const fallbackRows = await fetchFallbackRows(true);
        setRows(fallbackRows);
        return;
      }

      const nextRows = ((data as LegalConsentRow[] | null) || []).map((row) => ({
        ...row,
        metadata: row.metadata || null,
      }));

      setRows(nextRows);
      setTotalCount(nextRows[0]?.total_count || 0);
    } catch (error) {
      appError('[LegalConsentsManagement] Erro ao carregar consentimentos', error, {
        page,
        searchTerm,
        consentTypeFilter,
        sourceFilter,
      });
      toast.error('Erro ao carregar consentimentos legais.');
      setRows([]);
      setTotalCount(0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadConsents();
  }, [page, searchTerm, consentTypeFilter, sourceFilter, dateFrom, dateTo]);

  useEffect(() => {
    setExpandedRowId(null);
  }, [page, searchTerm, consentTypeFilter, sourceFilter, dateFrom, dateTo]);

  const fetchExportRows = async (): Promise<ExportLegalConsentRow[]> => {
    try {
      const { data, error } = await supabase.rpc('admin_export_user_legal_consents', buildFilterParams());

      if (error) {
        appWarn('[LegalConsentsManagement] RPC de exportação falhou, usando fallback direto na tabela', { error });
        const fallbackRows = await fetchFallbackRows(false);
        return fallbackRows.map((row) => ({
          user_name: row.user_name,
          user_email: row.user_email,
          user_document: row.user_document,
          consent_type: row.consent_type,
          document_version: row.document_version,
          document_title: row.document_title,
          document_url: row.document_url,
          accepted_at: row.accepted_at,
          revoked_at: row.revoked_at,
          source: row.source,
          ip_address: row.ip_address,
          user_agent: row.user_agent,
          metadata: row.metadata,
        }));
      }

      return (data || []) as ExportLegalConsentRow[];
    } catch (error) {
      appError('[LegalConsentsManagement] Erro ao buscar dados para exportação', error, {
        searchTerm,
        consentTypeFilter,
        sourceFilter,
      });
      throw error;
    }
  };

  const handleExportPdf = async () => {
    try {
      const exportRows = await fetchExportRows();

      if (exportRows.length === 0) {
        toast.error('Nenhum consentimento encontrado para exportar.');
        return;
      }

      const filtersApplied = [
        consentTypeFilter !== 'all' ? `Tipo: ${CONSENT_TYPE_OPTIONS.find((item) => item.value === consentTypeFilter)?.label}` : null,
        sourceFilter !== 'all' ? `Origem: ${SOURCE_OPTIONS.find((item) => item.value === sourceFilter)?.label}` : null,
        dateFrom ? `De: ${dateFrom}` : null,
        dateTo ? `Até: ${dateTo}` : null,
        searchTerm.trim() ? `Busca: ${searchTerm.trim()}` : null,
      ].filter(Boolean);

      const rowsHtml = exportRows
        .map(
          (row) => `
            <tr>
              <td>${escapeHtml(row.user_name)}</td>
              <td>${escapeHtml(row.user_email)}</td>
              <td>${escapeHtml(row.user_document || '-')}</td>
              <td>${escapeHtml(formatConsentType(row.consent_type))}</td>
              <td>${escapeHtml(row.document_version)}</td>
              <td>${escapeHtml(row.document_title)}</td>
              <td>${escapeHtml(formatSource(row.source))}</td>
              <td>${escapeHtml(formatDateTime(row.accepted_at))}</td>
              <td>${escapeHtml(row.ip_address || '-')}</td>
            </tr>
            <tr class="detail-row">
              <td colspan="9">
                <div><strong>URL:</strong> ${escapeHtml(row.document_url)}</div>
                <div><strong>Revogado em:</strong> ${escapeHtml(formatDateTime(row.revoked_at))}</div>
                <div><strong>User-Agent:</strong> ${escapeHtml(row.user_agent || 'Não informado')}</div>
                <div><strong>Metadata:</strong><pre>${escapeHtml(JSON.stringify(row.metadata || {}, null, 2))}</pre></div>
              </td>
            </tr>
          `,
        )
        .join('');

      const reportWindow = window.open('', '_blank', 'width=1200,height=900');

      if (!reportWindow) {
        toast.error('Não foi possível abrir a visualização do PDF.');
        return;
      }

      const dateLabel = new Date().toLocaleString('pt-BR');

      reportWindow.document.open();
      reportWindow.document.write(`
        <!DOCTYPE html>
        <html lang="pt-BR">
          <head>
            <meta charset="UTF-8" />
            <title>Consentimentos legais</title>
            <style>
              body { font-family: Arial, sans-serif; margin: 24px; color: #0f172a; }
              h1 { margin: 0 0 8px; font-size: 24px; }
              .subtitle { margin-bottom: 16px; color: #475569; font-size: 14px; }
              .filters { margin-bottom: 20px; padding: 12px 16px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; font-size: 12px; }
              table { width: 100%; border-collapse: collapse; font-size: 12px; }
              th, td { border: 1px solid #e2e8f0; padding: 8px 10px; text-align: left; vertical-align: top; }
              th { background: #f8fafc; font-size: 11px; text-transform: uppercase; letter-spacing: .08em; color: #475569; }
              .detail-row td { background: #fcfcfd; font-size: 11px; color: #334155; }
              pre { white-space: pre-wrap; word-break: break-word; margin: 6px 0 0; background: #0f172a; color: #e2e8f0; padding: 10px; border-radius: 8px; }
              @media print { body { margin: 12px; } }
            </style>
          </head>
          <body>
            <h1>Consentimentos legais</h1>
            <div class="subtitle">Relatório gerado em ${escapeHtml(dateLabel)}</div>
            <div class="filters">
              <div><strong>Total de registros:</strong> ${exportRows.length}</div>
              <div><strong>Filtros aplicados:</strong> ${escapeHtml(filtersApplied.length > 0 ? filtersApplied.join(' | ') : 'Nenhum filtro específico')}</div>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Usuário</th>
                  <th>E-mail</th>
                  <th>Documento</th>
                  <th>Tipo</th>
                  <th>Versão</th>
                  <th>Documento legal</th>
                  <th>Origem</th>
                  <th>Aceito em</th>
                  <th>IP</th>
                </tr>
              </thead>
              <tbody>${rowsHtml}</tbody>
            </table>
            <script>
              window.onload = function () {
                setTimeout(function () {
                  window.print();
                }, 150);
              };
            </script>
          </body>
        </html>
      `);
      reportWindow.document.close();

      toast.success('Relatório em PDF preparado com sucesso.');
    } catch (error) {
      appError('[LegalConsentsManagement] Erro ao exportar PDF', error, {
        searchTerm,
        consentTypeFilter,
        sourceFilter,
      });
      toast.error('Não foi possível exportar os consentimentos agora.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-900">Consentimentos legais</h1>
          <p className="mt-1 text-sm text-slate-500">
            Consulte os aceites jurídicos registrados no cadastro, nos contatos e nos reaceites de documentos.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            void handleExportPdf();
          }}
          className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50"
        >
          <Download className="h-4 w-4" />
          Exportar PDF
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-emerald-50 p-3 text-emerald-600">
              <FileCheck className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">Registros</p>
              <p className="text-2xl font-black text-slate-900">{totalCount}</p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-sky-50 p-3 text-sky-600">
              <UserCheck className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">Usuários nesta página</p>
              <p className="text-2xl font-black text-slate-900">{summary.uniqueUsers}</p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-amber-50 p-3 text-amber-600">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">Reaceites nesta página</p>
              <p className="text-2xl font-black text-slate-900">{summary.reacceptCount}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <Filter className="h-4 w-4 text-slate-500" />
          <h2 className="text-sm font-black uppercase tracking-[0.22em] text-slate-500">Filtros</h2>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <label className="mb-2 block text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
              Buscar usuário ou versão
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(event) => {
                  setPage(0);
                  setSearchTerm(event.target.value);
                }}
                placeholder="Nome, e-mail, documento, versão..."
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-11 pr-4 text-sm font-medium text-slate-700 outline-none transition focus:border-emerald-300 focus:bg-white"
              />
            </div>
          </div>

          <div>
            <label className="mb-2 block text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Tipo</label>
            <select
              value={consentTypeFilter}
              onChange={(event) => {
                setPage(0);
                setConsentTypeFilter(event.target.value);
              }}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700 outline-none transition focus:border-emerald-300 focus:bg-white"
            >
              {CONSENT_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-2 block text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Origem</label>
            <select
              value={sourceFilter}
              onChange={(event) => {
                setPage(0);
                setSourceFilter(event.target.value);
              }}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700 outline-none transition focus:border-emerald-300 focus:bg-white"
            >
              {SOURCE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-2 block text-xs font-bold uppercase tracking-[0.18em] text-slate-400">De</label>
              <input
                type="date"
                value={dateFrom}
                onChange={(event) => {
                  setPage(0);
                  setDateFrom(event.target.value);
                }}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700 outline-none transition focus:border-emerald-300 focus:bg-white"
              />
            </div>
            <div>
              <label className="mb-2 block text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Até</label>
              <input
                type="date"
                value={dateTo}
                onChange={(event) => {
                  setPage(0);
                  setDateTo(event.target.value);
                }}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700 outline-none transition focus:border-emerald-300 focus:bg-white"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="text-base font-black text-slate-900">Histórico de consentimentos</h2>
          <p className="mt-1 text-sm text-slate-500">
            Origem de contato nesta página: <strong className="text-slate-700">{summary.contactOriginCount}</strong>
          </p>
        </div>

        {loading ? (
          <div className="px-5 py-16 text-center text-sm font-medium text-slate-500">Carregando consentimentos...</div>
        ) : rows.length === 0 ? (
          <div className="px-5 py-16 text-center text-sm font-medium text-slate-500">
            Nenhum consentimento encontrado com os filtros atuais.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100">
              <thead className="bg-slate-50/80">
                <tr className="text-left text-xs font-black uppercase tracking-[0.18em] text-slate-400">
                  <th className="px-5 py-4">Usuário</th>
                  <th className="px-5 py-4">Tipo</th>
                  <th className="px-5 py-4">Documento</th>
                  <th className="px-5 py-4">Origem</th>
                  <th className="px-5 py-4">Aceito em</th>
                  <th className="px-5 py-4"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((row) => {
                  const isExpanded = expandedRowId === row.id;

                  return (
                    <React.Fragment key={row.id}>
                      <tr className="align-top">
                        <td className="px-5 py-4">
                          <div className="min-w-[220px]">
                            <p className="font-bold text-slate-900">{row.user_name || 'Usuário sem nome'}</p>
                            <p className="mt-1 text-sm text-slate-500">{row.user_email}</p>
                            <p className="mt-1 text-xs text-slate-400">{row.user_document || 'Sem documento'}</p>
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <span className="inline-flex rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">
                            {formatConsentType(row.consent_type)}
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          <div className="min-w-[220px]">
                            <p className="font-semibold text-slate-800">{row.document_title}</p>
                            <p className="mt-1 text-xs text-slate-500">{row.document_version}</p>
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <span className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
                            {formatSource(row.source)}
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          <p className="text-sm font-medium text-slate-700">{formatDateTime(row.accepted_at)}</p>
                        </td>
                        <td className="px-5 py-4 text-right">
                          <button
                            type="button"
                            onClick={() => setExpandedRowId(isExpanded ? null : row.id)}
                            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
                          >
                            Detalhes
                            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          </button>
                        </td>
                      </tr>

                      {isExpanded && (
                        <tr>
                          <td colSpan={6} className="bg-slate-50/60 px-5 py-5">
                            <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                                <h3 className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">
                                  Evidências do registro
                                </h3>
                                <dl className="mt-4 space-y-3 text-sm">
                                  <div>
                                    <dt className="font-semibold text-slate-500">URL do documento</dt>
                                    <dd className="mt-1">
                                      <a href={`#${row.document_url}`} className="font-bold text-emerald-700 hover:underline">
                                        {row.document_url}
                                      </a>
                                    </dd>
                                  </div>
                                  <div>
                                    <dt className="font-semibold text-slate-500">IP</dt>
                                    <dd className="mt-1 text-slate-700">{row.ip_address || 'Não capturado'}</dd>
                                  </div>
                                  <div>
                                    <dt className="font-semibold text-slate-500">User-Agent</dt>
                                    <dd className="mt-1 break-all text-slate-700">{row.user_agent || 'Não informado'}</dd>
                                  </div>
                                  <div>
                                    <dt className="font-semibold text-slate-500">Revogado em</dt>
                                    <dd className="mt-1 text-slate-700">{formatDateTime(row.revoked_at)}</dd>
                                  </div>
                                </dl>
                              </div>

                              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                                <h3 className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">
                                  Metadados
                                </h3>
                                <pre className="mt-4 overflow-x-auto rounded-2xl bg-slate-950 p-4 text-xs text-slate-100">
                                  {JSON.stringify(row.metadata || {}, null, 2)}
                                </pre>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex flex-col gap-3 border-t border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm font-medium text-slate-500">
            Página <strong className="text-slate-700">{page + 1}</strong> de{' '}
            <strong className="text-slate-700">{totalPages}</strong>
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((current) => Math.max(current - 1, 0))}
              disabled={page === 0}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" />
              Anterior
            </button>
            <button
              type="button"
              onClick={() => setPage((current) => (current + 1 < totalPages ? current + 1 : current))}
              disabled={page + 1 >= totalPages}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Próxima
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LegalConsentsManagement;
