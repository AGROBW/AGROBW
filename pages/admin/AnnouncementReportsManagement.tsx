import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Eye, Loader2, ShieldAlert, Trash2, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../../src/lib/supabaseClient';
import { appError, appWarn } from '../../src/utils/appLogger';
import { useAdminAudit, ADMIN_ACTIONS, RESOURCE_TYPES } from '../../src/hooks/useAdminAudit';

interface ReportedAnnouncementRow {
  id: string;
  title: string;
  description: string;
  category_slug?: string | null;
  price: number | null;
  status: string;
  created_at: string;
  user_id: string;
  owner_name: string;
  owner_email?: string | null;
  images: string[];
  community_reports_count: number;
  community_report_reasons: Array<{ reason: string; count: number }>;
  community_reported_to_review_at?: string | null;
}

interface ReportedAnnouncementDetails {
  announcement: {
    id: string;
    title: string;
    description: string;
    price: number | null;
    status: string;
    category_slug?: string | null;
    created_at: string;
    images: string[];
    community_reports_count: number;
    community_report_reasons: Array<{ reason: string; count: number }>;
    community_reported_to_review_at?: string | null;
    publication_review_reasons?: unknown;
    owner: {
      id: string;
      name: string;
      email?: string | null;
      phone?: string | null;
    };
  };
  reports: Array<{
    id: string;
    reason: string;
    details?: string | null;
    status: string;
    created_at: string;
    reporter: {
      id: string;
      name: string;
      email?: string | null;
    };
  }>;
}

const REPORT_REASON_LABELS: Record<string, string> = {
  inappropriate_content: 'Conteúdo impróprio',
  wrong_category: 'Categoria incorreta',
  fraud_or_scam: 'Possível golpe',
  false_information: 'Informação falsa',
  prohibited_item: 'Item proibido',
  duplicate_or_spam: 'Duplicado ou spam',
  other: 'Outro motivo',
};

const formatDateTime = (value?: string | null) => {
  if (!value) return 'Não informado';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString('pt-BR');
};

const formatReasonSummary = (items: Array<{ reason: string; count: number }> = []) =>
  items.map((item) => `${REPORT_REASON_LABELS[item.reason] || item.reason} (${item.count})`).join(' | ');

const normalizeReportedAnnouncementRow = (item: any): ReportedAnnouncementRow => ({
  ...item,
  images: Array.isArray(item.images) ? item.images : [],
  community_report_reasons: Array.isArray(item.community_report_reasons) ? item.community_report_reasons : [],
});

const loadReportedAnnouncementsFallback = async (): Promise<ReportedAnnouncementRow[]> => {
  const { data: announcements, error } = await supabase
    .from('announcements')
    .select('id,title,description,category_slug,price,status,created_at,user_id,images,community_reports_count,community_report_reasons,community_reported_to_review_at')
    .not('community_reported_to_review_at', 'is', null)
    .order('community_reported_to_review_at', { ascending: false });

  if (error) throw error;

  const ownerIds = Array.from(new Set(((announcements || []) as any[]).map((item) => item.user_id).filter(Boolean)));
  const ownerMap = new Map<string, { name: string; email?: string | null }>();

  if (ownerIds.length > 0) {
    const { data: owners, error: ownersError } = await supabase
      .from('users')
      .select('id,name,email')
      .in('id', ownerIds);

    if (ownersError) throw ownersError;

    for (const owner of owners || []) {
      ownerMap.set(owner.id, {
        name: owner.name || 'Anunciante',
        email: owner.email || null,
      });
    }
  }

  return ((announcements || []) as any[]).map((item) =>
    normalizeReportedAnnouncementRow({
      ...item,
      owner_name: ownerMap.get(item.user_id)?.name || 'Anunciante',
      owner_email: ownerMap.get(item.user_id)?.email || null,
    }),
  );
};

const loadReportedAnnouncementDetailsFallback = async (
  announcementId: string,
): Promise<ReportedAnnouncementDetails> => {
  const { data: announcement, error: announcementError } = await supabase
    .from('announcements')
    .select('id,title,description,price,status,category_slug,created_at,images,community_reports_count,community_report_reasons,community_reported_to_review_at,publication_review_reasons,user_id')
    .eq('id', announcementId)
    .maybeSingle();

  if (announcementError) throw announcementError;
  if (!announcement) throw new Error('Anúncio não encontrado.');

  const [{ data: owner, error: ownerError }, { data: reports, error: reportsError }] = await Promise.all([
    supabase.from('users').select('id,name,email,phone').eq('id', announcement.user_id).maybeSingle(),
    supabase
      .from('announcement_reports')
      .select('id,reason,details,status,created_at,reporter_user_id')
      .eq('announcement_id', announcementId)
      .eq('status', 'valid')
      .order('created_at', { ascending: false }),
  ]);

  if (ownerError) throw ownerError;
  if (reportsError) throw reportsError;

  const reporterIds = Array.from(new Set(((reports || []) as any[]).map((item) => item.reporter_user_id).filter(Boolean)));
  const reporterMap = new Map<string, { id: string; name: string; email?: string | null }>();

  if (reporterIds.length > 0) {
    const { data: reporters, error: reportersError } = await supabase
      .from('users')
      .select('id,name,email')
      .in('id', reporterIds);

    if (reportersError) throw reportersError;

    for (const reporter of reporters || []) {
      reporterMap.set(reporter.id, {
        id: reporter.id,
        name: reporter.name || 'Usuário',
        email: reporter.email || null,
      });
    }
  }

  return {
    announcement: {
      id: announcement.id,
      title: announcement.title,
      description: announcement.description,
      price: announcement.price,
      status: announcement.status,
      category_slug: announcement.category_slug,
      created_at: announcement.created_at,
      images: Array.isArray(announcement.images) ? announcement.images : [],
      community_reports_count: Number(announcement.community_reports_count || 0),
      community_report_reasons: Array.isArray(announcement.community_report_reasons)
        ? announcement.community_report_reasons
        : [],
      community_reported_to_review_at: announcement.community_reported_to_review_at,
      publication_review_reasons: announcement.publication_review_reasons,
      owner: {
        id: owner?.id || announcement.user_id,
        name: owner?.name || 'Anunciante',
        email: owner?.email || null,
        phone: owner?.phone || null,
      },
    },
    reports: ((reports || []) as any[]).map((item) => ({
      id: item.id,
      reason: item.reason,
      details: item.details,
      status: item.status,
      created_at: item.created_at,
      reporter: reporterMap.get(item.reporter_user_id) || {
        id: item.reporter_user_id,
        name: 'Usuário',
        email: null,
      },
    })),
  };
};

const AnnouncementReportsManagement: React.FC = () => {
  const { logAction } = useAdminAudit();
  const [rows, setRows] = useState<ReportedAnnouncementRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedAnnouncementId, setSelectedAnnouncementId] = useState<string | null>(null);
  const [details, setDetails] = useState<ReportedAnnouncementDetails | null>(null);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [actionNote, setActionNote] = useState('');
  const [isApproving, setIsApproving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const loadRows = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.rpc('admin_list_reported_announcements');

      if (error) {
        appWarn('[AnnouncementReportsManagement] RPC principal falhou, usando fallback direto nas tabelas', { error });
        const fallbackRows = await loadReportedAnnouncementsFallback();
        setRows(fallbackRows);
        return;
      }

      setRows(((data || []) as any[]).map(normalizeReportedAnnouncementRow));
    } catch (error) {
      appError('[AnnouncementReportsManagement] Erro ao carregar denuncias de anuncios', error);
      toast.error('Não foi possível carregar as denúncias agora.');
      setRows([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadRows();
  }, []);

  useEffect(() => {
    if (!selectedAnnouncementId) {
      setDetails(null);
      setActionNote('');
      return;
    }

    let cancelled = false;

    const loadDetails = async () => {
      setIsLoadingDetails(true);
      try {
        const { data, error } = await supabase.rpc('admin_get_reported_announcement_details', {
          p_announcement_id: selectedAnnouncementId,
        });

        if (error) {
          appWarn('[AnnouncementReportsManagement] RPC de detalhes falhou, usando fallback direto nas tabelas', {
            error,
            announcementId: selectedAnnouncementId,
          });
          const fallbackDetails = await loadReportedAnnouncementDetailsFallback(selectedAnnouncementId);
          if (!cancelled) {
            setDetails(fallbackDetails);
          }
          return;
        }

        if (!cancelled) {
          setDetails(data as ReportedAnnouncementDetails);
        }
      } catch (error) {
        appError('[AnnouncementReportsManagement] Erro ao carregar detalhes da denuncia', error, {
          announcementId: selectedAnnouncementId,
        });
        if (!cancelled) {
          toast.error('Não foi possível abrir os detalhes da denúncia.');
          setSelectedAnnouncementId(null);
          setDetails(null);
        }
      } finally {
        if (!cancelled) {
          setIsLoadingDetails(false);
        }
      }
    };

    void loadDetails();

    return () => {
      cancelled = true;
    };
  }, [selectedAnnouncementId]);

  const filteredRows = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    if (!normalizedSearch) return rows;

    return rows.filter((item) =>
      item.title.toLowerCase().includes(normalizedSearch) ||
      item.owner_name.toLowerCase().includes(normalizedSearch) ||
      String(item.owner_email || '').toLowerCase().includes(normalizedSearch) ||
      String(item.category_slug || '').toLowerCase().includes(normalizedSearch),
    );
  }, [rows, searchTerm]);

  const handleApprove = async () => {
    if (!details?.announcement?.id) return;
    setIsApproving(true);
    try {
      const { data, error } = await supabase.rpc('admin_approve_reported_announcement', {
        p_announcement_id: details.announcement.id,
        p_note: actionNote.trim() || null,
      });

      if (error) throw error;
      if (!data?.success) {
        throw new Error(data?.error || 'Falha ao aprovar anúncio denunciado.');
      }

      await logAction({
        action: ADMIN_ACTIONS.APPROVE_AD,
        resourceType: RESOURCE_TYPES.ANNOUNCEMENT,
        resourceId: details.announcement.id,
        oldValue: {
          status: details.announcement.status,
          communityReportsCount: details.announcement.community_reports_count,
        },
        newValue: {
          status: data.status || 'ACTIVE',
          communityReportsCount: 0,
        },
        reason: actionNote.trim() || 'Anúncio aprovado após revisão de denúncias da comunidade.',
      });

      toast.success('Anúncio aprovado e liberado com sucesso.');
      setSelectedAnnouncementId(null);
      setDetails(null);
      setActionNote('');
      await loadRows();
    } catch (error) {
      appError('[AnnouncementReportsManagement] Erro ao aprovar anuncio denunciado', error, {
        announcementId: details.announcement.id,
      });
      toast.error('Não foi possível aprovar o anúncio agora.');
    } finally {
      setIsApproving(false);
    }
  };

  const handleDelete = async () => {
    if (!details?.announcement?.id) return;
    if (!actionNote.trim()) {
      toast.error('Informe o motivo da exclusão para continuar.');
      return;
    }

    setIsDeleting(true);
    try {
      const { data, error } = await supabase.rpc('admin_delete_announcement_with_notification', {
        p_announcement_id: details.announcement.id,
        p_reason: actionNote.trim(),
      });

      if (error) throw error;
      if (!data?.success) {
        throw new Error(data?.error || 'Falha ao excluir anúncio denunciado.');
      }

      await logAction({
        action: ADMIN_ACTIONS.DELETE_AD,
        resourceType: RESOURCE_TYPES.ANNOUNCEMENT,
        resourceId: details.announcement.id,
        oldValue: {
          status: details.announcement.status,
          communityReportsCount: details.announcement.community_reports_count,
        },
        newValue: { status: 'DELETED' },
        reason: actionNote.trim(),
      });

      toast.success('Anúncio excluído com sucesso.');
      setSelectedAnnouncementId(null);
      setDetails(null);
      setActionNote('');
      await loadRows();
    } catch (error) {
      appError('[AnnouncementReportsManagement] Erro ao excluir anuncio denunciado', error, {
        announcementId: details.announcement.id,
      });
      toast.error('Não foi possível excluir o anúncio agora.');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-rose-600">Fila de denúncias</p>
            <h1 className="mt-2 text-2xl font-black text-slate-900">Anúncios denunciados pela comunidade</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
              Aqui ficam os anúncios que atingiram o limite de 10 denúncias válidas e foram retirados da vitrine para validação administrativa.
            </p>
          </div>
          <div className="w-full max-w-sm">
            <input
              type="search"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Buscar por anúncio, anunciante ou categoria"
              className="h-11 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm shadow-sm outline-none transition focus:border-rose-300 focus:bg-white"
            />
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white shadow-sm">
        {isLoading ? (
          <div className="flex min-h-[260px] items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="flex min-h-[260px] flex-col items-center justify-center gap-3 px-6 text-center">
            <ShieldAlert className="h-10 w-10 text-slate-300" strokeWidth={1.5} />
            <h2 className="text-lg font-bold text-slate-900">Nenhum anúncio denunciado aguardando decisão</h2>
            <p className="max-w-xl text-sm leading-6 text-slate-500">
              Quando um anúncio atingir o limite de denúncias válidas da comunidade, ele aparecerá nesta fila com todos os relatos para análise.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100">
              <thead className="bg-slate-50/70 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                <tr>
                  <th className="px-6 py-4">Anúncio</th>
                  <th className="px-6 py-4">Anunciante</th>
                  <th className="px-6 py-4">Denúncias</th>
                  <th className="px-6 py-4">Enviado para análise</th>
                  <th className="px-6 py-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredRows.map((row) => (
                  <tr key={row.id} className="align-top">
                    <td className="px-6 py-5">
                      <div className="flex gap-4">
                        <div className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-2xl bg-slate-100">
                          {row.images?.[0] ? (
                            <img src={row.images[0]} alt={row.title} className="h-full w-full object-cover" />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-slate-300">
                              <AlertTriangle className="h-6 w-6" strokeWidth={1.5} />
                            </div>
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold text-slate-900">{row.title}</p>
                          <p className="mt-1 line-clamp-2 text-sm text-slate-500">{row.description}</p>
                          <p className="mt-2 text-sm font-semibold text-emerald-700">
                            {typeof row.price === 'number'
                              ? `R$ ${row.price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                              : 'Preço não informado'}
                          </p>
                          {row.category_slug ? (
                            <span className="mt-2 inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                              {row.category_slug}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-5">
                      <p className="text-sm font-semibold text-slate-900">{row.owner_name}</p>
                      <p className="mt-1 text-sm text-slate-500">{row.owner_email || 'Sem e-mail'}</p>
                    </td>
                    <td className="px-6 py-5">
                      <p className="inline-flex rounded-full bg-rose-50 px-3 py-1 text-sm font-semibold text-rose-700">
                        {row.community_reports_count} denúncia(s)
                      </p>
                      <p className="mt-2 text-xs leading-5 text-slate-500">
                        {formatReasonSummary(row.community_report_reasons)}
                      </p>
                    </td>
                    <td className="px-6 py-5 text-sm text-slate-600">
                      {formatDateTime(row.community_reported_to_review_at)}
                    </td>
                    <td className="px-6 py-5">
                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={() => setSelectedAnnouncementId(row.id)}
                          className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:text-slate-900"
                        >
                          <Eye className="h-4 w-4" strokeWidth={1.8} />
                          Visualizar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selectedAnnouncementId ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm">
          <div className="relative flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-[28px] bg-white shadow-[0_40px_100px_-40px_rgba(15,23,42,0.5)]">
            <div className="flex items-start justify-between border-b border-slate-100 px-6 py-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-rose-600">Validação de denúncias</p>
                <h2 className="mt-2 text-xl font-black text-slate-900">
                  {details?.announcement?.title || 'Carregando anúncio...'}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setSelectedAnnouncementId(null)}
                className="rounded-2xl border border-slate-200 p-2 text-slate-500 transition hover:border-slate-300 hover:text-slate-800"
              >
                <XCircle className="h-5 w-5" strokeWidth={1.8} />
              </button>
            </div>

            {isLoadingDetails || !details ? (
              <div className="flex min-h-[360px] items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
              </div>
            ) : (
              <div className="grid min-h-0 flex-1 grid-cols-1 gap-0 overflow-hidden xl:grid-cols-[minmax(0,1.2fr)_minmax(360px,0.8fr)]">
                <div className="min-h-0 overflow-y-auto border-r border-slate-100 px-6 py-6">
                  <div className="grid gap-4 md:grid-cols-[260px_minmax(0,1fr)]">
                    <div className="overflow-hidden rounded-[24px] border border-slate-200 bg-slate-100">
                      {details.announcement.images?.[0] ? (
                        <img
                          src={details.announcement.images[0]}
                          alt={details.announcement.title}
                          className="aspect-[4/3] h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex aspect-[4/3] items-center justify-center text-slate-300">
                          <AlertTriangle className="h-10 w-10" strokeWidth={1.5} />
                        </div>
                      )}
                    </div>
                    <div className="space-y-3">
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Resumo</p>
                        <div className="mt-3 grid gap-3 sm:grid-cols-2">
                          <div>
                            <p className="text-xs text-slate-500">Status atual</p>
                            <p className="text-sm font-semibold text-slate-900">{details.announcement.status}</p>
                          </div>
                          <div>
                            <p className="text-xs text-slate-500">Categoria</p>
                            <p className="text-sm font-semibold text-slate-900">{details.announcement.category_slug || 'Não informada'}</p>
                          </div>
                          <div>
                            <p className="text-xs text-slate-500">Preço</p>
                            <p className="text-sm font-semibold text-emerald-700">
                              {typeof details.announcement.price === 'number'
                                ? `R$ ${details.announcement.price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                                : 'Não informado'}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-slate-500">Enviado para análise</p>
                            <p className="text-sm font-semibold text-slate-900">
                              {formatDateTime(details.announcement.community_reported_to_review_at)}
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="rounded-2xl border border-slate-200 bg-white p-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Anunciante</p>
                        <div className="mt-3 space-y-1 text-sm text-slate-600">
                          <p className="font-semibold text-slate-900">{details.announcement.owner.name}</p>
                          <p>{details.announcement.owner.email || 'Sem e-mail'}</p>
                          <p>{details.announcement.owner.phone || 'Sem telefone'}</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Descrição do anúncio</p>
                    <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">{details.announcement.description}</p>
                  </div>

                  <div className="mt-6 rounded-2xl border border-rose-200 bg-rose-50/70 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-rose-700">Motivos mais denunciados</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {details.announcement.community_report_reasons?.map((item) => (
                        <span
                          key={`${item.reason}-${item.count}`}
                          className="rounded-full border border-rose-200 bg-white px-3 py-1 text-xs font-semibold text-rose-700"
                        >
                          {REPORT_REASON_LABELS[item.reason] || item.reason} ({item.count})
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="min-h-0 overflow-y-auto px-6 py-6">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Relatos individuais</p>
                    <div className="mt-4 space-y-3">
                      {details.reports.length === 0 ? (
                        <p className="text-sm text-slate-500">Nenhuma denúncia válida encontrada para este anúncio.</p>
                      ) : (
                        details.reports.map((report) => (
                          <div key={report.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className="text-sm font-semibold text-slate-900">
                                {REPORT_REASON_LABELS[report.reason] || report.reason}
                              </p>
                              <span className="text-xs text-slate-500">{formatDateTime(report.created_at)}</span>
                            </div>
                            <p className="mt-1 text-xs font-medium text-slate-500">
                              {report.reporter.name} • {report.reporter.email || 'Sem e-mail'}
                            </p>
                            <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                              {report.details?.trim() || 'Nenhum detalhe adicional informado pelo usuário.'}
                            </p>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-4">
                    <label className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                      Observação administrativa
                    </label>
                    <textarea
                      value={actionNote}
                      onChange={(event) => setActionNote(event.target.value)}
                      placeholder="Opcional para aprovar. Obrigatório para excluir o anúncio."
                      className="mt-3 h-28 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-700 outline-none transition focus:border-rose-300 focus:bg-white"
                    />
                    <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                      <button
                        type="button"
                        onClick={handleApprove}
                        disabled={isApproving || isDeleting}
                        className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {isApproving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" strokeWidth={1.8} />}
                        Aprovar anúncio
                      </button>
                      <button
                        type="button"
                        onClick={handleDelete}
                        disabled={isApproving || isDeleting}
                        className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-2xl bg-rose-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" strokeWidth={1.8} />}
                        Excluir anúncio
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default AnnouncementReportsManagement;
