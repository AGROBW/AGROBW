import React, { useEffect, useMemo, useState } from 'react';
import { Megaphone, Loader2, Check, X, MapPin, Tag, Clock3 } from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '../../src/lib/supabaseClient';
import { buildAbsoluteSiteUrl } from '../../src/lib/siteConfig';

// Escapa texto para uso seguro em conteúdo/atributos HTML (anti-injection no e-mail).
const escapeHtml = (value: unknown) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

// Só aceita URLs http/https; qualquer outra coisa (javascript:, data:, etc.) é descartada.
const safeHttpUrl = (value: unknown) => {
  const s = String(value ?? '').trim();
  return /^https?:\/\//i.test(s) ? s : '';
};

const buildCampaignTemplate = (snap: Record<string, any>) => {
  const title = escapeHtml(snap?.title || 'Anúncio');
  const price = Number(snap?.price);
  const priceLabel = Number.isFinite(price)
    ? price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
    : '';
  const location = escapeHtml([snap?.city, snap?.state].filter(Boolean).join(', '));
  const link = escapeHtml(safeHttpUrl(snap?.detail_path ? buildAbsoluteSiteUrl(snap.detail_path) : buildAbsoluteSiteUrl('/')) || buildAbsoluteSiteUrl('/'));
  const image = escapeHtml(safeHttpUrl(snap?.image_url));
  return `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#0f172a">
  ${image ? `<img src="${image}" alt="${title}" style="width:100%;border-radius:12px"/>` : ''}
  <h2 style="margin:16px 0 8px">${title}</h2>
  ${priceLabel ? `<p style="font-size:20px;font-weight:bold;color:#16a34a;margin:0 0 4px">${priceLabel}</p>` : ''}
  ${location ? `<p style="color:#64748b;margin:0 0 16px">${location}</p>` : ''}
  <a href="${link}" style="display:inline-block;background:#16a34a;color:#fff;text-decoration:none;padding:12px 24px;border-radius:10px;font-weight:bold">Ver anúncio</a>
  <p style="margin:24px 0 0;font-size:12px;color:#94a3b8;border-top:1px solid #e2e8f0;padding-top:16px">
    Você recebe este e-mail por ter consentido em receber divulgações de anúncios e campanhas selecionadas.
    <a href="{{unsubscribe_url}}" style="color:#64748b">Não quero mais receber estas divulgações</a>.
  </p>
</div>`;
};

interface CampaignRequestRow {
  id: string;
  user_id: string;
  announcement_id: string | null;
  announcement_snapshot: Record<string, any>;
  requested_subject: string | null;
  requested_message: string | null;
  status: string;
  rejection_reason: string | null;
  admin_notes: string | null;
  campaign_id: string | null;
  created_at: string;
  reviewed_at: string | null;
}

type StatusFilter = 'pending_review' | 'all';

const STATUS_META: Record<string, { label: string; cls: string }> = {
  pending_review: { label: 'Em análise', cls: 'bg-amber-50 text-amber-700' },
  approved: { label: 'Aprovada', cls: 'bg-emerald-50 text-emerald-700' },
  preparing: { label: 'Em preparação', cls: 'bg-sky-50 text-sky-700' },
  queued: { label: 'Na fila', cls: 'bg-sky-50 text-sky-700' },
  sending: { label: 'Enviando', cls: 'bg-sky-50 text-sky-700' },
  completed: { label: 'Concluída', cls: 'bg-emerald-50 text-emerald-700' },
  rejected: { label: 'Rejeitada', cls: 'bg-rose-50 text-rose-700' },
  failed: { label: 'Falhou', cls: 'bg-rose-50 text-rose-700' },
  cancelled: { label: 'Cancelada', cls: 'bg-slate-100 text-slate-500' },
};

const formatCurrency = (value: unknown) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return '-';
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
};

const StoreCampaignRequestsManagement: React.FC = () => {
  const [requests, setRequests] = useState<CampaignRequestRow[]>([]);
  const [requesters, setRequesters] = useState<Record<string, { name: string | null; email: string | null }>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<StatusFilter>('pending_review');
  const [rejectTarget, setRejectTarget] = useState<CampaignRequestRow | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [actingId, setActingId] = useState<string | null>(null);
  const [prepareTarget, setPrepareTarget] = useState<CampaignRequestRow | null>(null);
  const [prepSubject, setPrepSubject] = useState('');
  const [prepPreview, setPrepPreview] = useState('');
  const [prepHtml, setPrepHtml] = useState('');

  const load = async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from('seller_store_campaign_requests')
      .select('id, user_id, announcement_id, announcement_snapshot, requested_subject, requested_message, status, rejection_reason, admin_notes, campaign_id, created_at, reviewed_at')
      .order('created_at', { ascending: false });

    if (error) {
      toast.error('Erro ao carregar solicitações.');
      setRequests([]);
      setIsLoading(false);
      return;
    }

    const rows = (data as CampaignRequestRow[]) || [];
    setRequests(rows);

    const ids = Array.from(new Set(rows.map((r) => r.user_id)));
    if (ids.length > 0) {
      const { data: users } = await supabase.from('users').select('id, name, email').in('id', ids);
      const map: Record<string, { name: string | null; email: string | null }> = {};
      (users || []).forEach((u: any) => {
        map[u.id] = { name: u.name, email: u.email };
      });
      setRequesters(map);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    void load();
  }, []);

  const visible = useMemo(
    () => (filter === 'all' ? requests : requests.filter((r) => r.status === 'pending_review')),
    [requests, filter]
  );
  const pendingCount = useMemo(() => requests.filter((r) => r.status === 'pending_review').length, [requests]);

  const handleApprove = async (req: CampaignRequestRow) => {
    setActingId(req.id);
    try {
      const { error } = await supabase.rpc('admin_review_store_campaign', {
        p_request_id: req.id,
        p_action: 'approve',
        p_reason: null,
        p_notes: null,
      });
      if (error) {
        toast.error(error.message || 'Erro ao aprovar.');
        return;
      }
      toast.success('Solicitação aprovada.');
      await load();
    } finally {
      setActingId(null);
    }
  };

  const openPrepare = (req: CampaignRequestRow) => {
    const snap = req.announcement_snapshot || {};
    setPrepareTarget(req);
    setPrepSubject(req.requested_subject || `Oportunidade: ${snap.title || 'anúncio'}`);
    setPrepPreview('');
    setPrepHtml(buildCampaignTemplate(snap));
  };

  const handlePrepare = async () => {
    if (!prepareTarget) return;
    if (!prepSubject.trim() || !prepHtml.trim()) {
      toast.error('Preencha assunto e conteúdo.');
      return;
    }
    setActingId(prepareTarget.id);
    try {
      const { error } = await supabase.rpc('admin_prepare_store_campaign', {
        p_request_id: prepareTarget.id,
        p_subject: prepSubject.trim(),
        p_html: prepHtml,
        p_preview: prepPreview.trim() || null,
      });
      if (error) {
        toast.error(error.message || 'Erro ao preparar campanha.');
        return;
      }
      toast.success('Campanha preparada (rascunho). Agora você pode disparar.');
      setPrepareTarget(null);
      await load();
    } finally {
      setActingId(null);
    }
  };

  const handleDispatch = async (req: CampaignRequestRow) => {
    if (!req.campaign_id) return;
    if (!window.confirm('Disparar esta campanha agora? Serão enfileirados apenas usuários com consentimento de divulgações de terceiros ativo.')) {
      return;
    }
    setActingId(req.id);
    try {
      const { data, error } = await supabase.rpc('admin_queue_newsletter_campaign', { p_campaign_id: req.campaign_id });
      if (error) {
        toast.error(error.message || 'Erro ao disparar.');
        return;
      }
      const total = (data as any)?.total_recipients ?? 0;
      toast.success(`Campanha enfileirada para ${total} destinatário(s) elegível(is).`);
      await load();
    } finally {
      setActingId(null);
    }
  };

  const handleReject = async () => {
    if (!rejectTarget) return;
    if (!rejectReason.trim()) {
      toast.error('Informe o motivo da rejeição.');
      return;
    }
    setActingId(rejectTarget.id);
    try {
      const { error } = await supabase.rpc('admin_review_store_campaign', {
        p_request_id: rejectTarget.id,
        p_action: 'reject',
        p_reason: rejectReason.trim(),
        p_notes: null,
      });
      if (error) {
        toast.error(error.message || 'Erro ao rejeitar.');
        return;
      }
      toast.success('Solicitação rejeitada.');
      setRejectTarget(null);
      setRejectReason('');
      await load();
    } finally {
      setActingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Loja Parceira</p>
        <h2 className="mt-2 flex items-center gap-2 text-2xl font-bold text-slate-900">
          <Megaphone className="h-6 w-6 text-emerald-600" /> Campanhas de Loja Parceira
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
          Solicitações de campanha de e-mail vinculadas a anúncios. Revise e aprove/rejeite. A preparação e o disparo
          (com filtro de consentimento) virão na próxima fase.
        </p>
      </section>

      <div className="flex items-center gap-2">
        <button
          onClick={() => setFilter('pending_review')}
          className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
            filter === 'pending_review' ? 'bg-emerald-600 text-white' : 'bg-white text-slate-600 border border-slate-200'
          }`}
        >
          Pendentes {pendingCount > 0 ? `(${pendingCount})` : ''}
        </button>
        <button
          onClick={() => setFilter('all')}
          className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
            filter === 'all' ? 'bg-emerald-600 text-white' : 'bg-white text-slate-600 border border-slate-200'
          }`}
        >
          Todas
        </button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-7 w-7 animate-spin text-emerald-600" />
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-white p-12 text-center text-slate-500">
          Nenhuma solicitação {filter === 'pending_review' ? 'pendente' : ''} no momento.
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map((req) => {
            const snap = req.announcement_snapshot || {};
            const meta = STATUS_META[req.status] || { label: req.status, cls: 'bg-slate-100 text-slate-600' };
            const requester = requesters[req.user_id];
            const isPending = req.status === 'pending_review';
            const busy = actingId === req.id;
            return (
              <div key={req.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex flex-col gap-4 md:flex-row md:items-start">
                  <div className="h-20 w-28 flex-shrink-0 overflow-hidden rounded-xl bg-slate-100">
                    {snap.image_url ? (
                      <img src={snap.image_url} alt={snap.title || 'Anúncio'} className="h-full w-full object-cover" />
                    ) : null}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-bold text-slate-900">{snap.title || 'Anúncio'}</h3>
                      <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${meta.cls}`}>{meta.label}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                      <span className="font-semibold text-slate-700">{formatCurrency(snap.price)}</span>
                      {snap.city ? (
                        <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{snap.city}, {snap.state}</span>
                      ) : null}
                      <span className="inline-flex items-center gap-1"><Clock3 className="h-3.5 w-3.5" />{new Date(req.created_at).toLocaleDateString('pt-BR')}</span>
                      {req.announcement_id ? (
                        <a href={`/anuncio/${req.announcement_id}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-emerald-700 hover:underline">
                          <Tag className="h-3.5 w-3.5" /> ver anúncio
                        </a>
                      ) : null}
                    </div>
                    <p className="mt-2 text-xs text-slate-500">
                      Solicitante: <span className="font-semibold text-slate-700">{requester?.name || '—'}</span>
                      {requester?.email ? ` (${requester.email})` : ''}
                    </p>
                    {req.requested_subject ? (
                      <p className="mt-1 text-xs text-slate-600"><span className="font-semibold">Assunto sugerido:</span> {req.requested_subject}</p>
                    ) : null}
                    {req.requested_message ? (
                      <p className="mt-1 text-xs text-slate-600"><span className="font-semibold">Mensagem:</span> {req.requested_message}</p>
                    ) : null}
                    {req.status === 'rejected' && req.rejection_reason ? (
                      <p className="mt-1 text-xs text-rose-600"><span className="font-semibold">Motivo da rejeição:</span> {req.rejection_reason}</p>
                    ) : null}
                  </div>

                  <div className="flex flex-shrink-0 flex-col gap-2">
                    {isPending ? (
                      <>
                        <button
                          onClick={() => handleApprove(req)}
                          disabled={busy}
                          className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                        >
                          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Aprovar
                        </button>
                        <button
                          onClick={() => { setRejectTarget(req); setRejectReason(''); }}
                          disabled={busy}
                          className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-rose-200 px-4 py-2 text-sm font-bold text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                        >
                          <X className="h-4 w-4" /> Rejeitar
                        </button>
                      </>
                    ) : null}
                    {req.status === 'approved' ? (
                      <button
                        onClick={() => openPrepare(req)}
                        disabled={busy}
                        className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-sky-600 px-4 py-2 text-sm font-bold text-white hover:bg-sky-700 disabled:opacity-50"
                      >
                        <Megaphone className="h-4 w-4" /> Preparar campanha
                      </button>
                    ) : null}
                    {req.status === 'preparing' && req.campaign_id ? (
                      <button
                        onClick={() => handleDispatch(req)}
                        disabled={busy}
                        className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                      >
                        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Disparar campanha
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {rejectTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-slate-900">Rejeitar solicitação</h3>
            <p className="mt-1 text-sm text-slate-500">Anúncio: {rejectTarget.announcement_snapshot?.title || '—'}</p>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder="Motivo da rejeição (será exibido ao solicitante)"
              className="mt-3 w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-100"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => { setRejectTarget(null); setRejectReason(''); }}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleReject}
                disabled={actingId === rejectTarget.id}
                className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 px-4 py-2 text-sm font-bold text-white hover:bg-rose-700 disabled:opacity-50"
              >
                {actingId === rejectTarget.id ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Confirmar rejeição
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {prepareTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-slate-900">Preparar campanha</h3>
            <p className="mt-1 text-sm text-slate-500">
              Anúncio: {prepareTarget.announcement_snapshot?.title || '—'}. Revise o conteúdo; o envio só vai para usuários
              com consentimento de divulgações de terceiros ativo.
            </p>

            <label className="mt-4 block text-sm font-semibold text-slate-700">Assunto</label>
            <input
              type="text"
              value={prepSubject}
              maxLength={200}
              onChange={(e) => setPrepSubject(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100"
            />

            <label className="mt-3 block text-sm font-semibold text-slate-700">Pré-cabeçalho (opcional)</label>
            <input
              type="text"
              value={prepPreview}
              maxLength={200}
              onChange={(e) => setPrepPreview(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100"
            />

            <label className="mt-3 block text-sm font-semibold text-slate-700">Conteúdo (HTML)</label>
            <textarea
              value={prepHtml}
              rows={10}
              onChange={(e) => setPrepHtml(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-2.5 font-mono text-xs focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100"
            />

            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setPrepareTarget(null)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                onClick={handlePrepare}
                disabled={actingId === prepareTarget.id}
                className="inline-flex items-center gap-1.5 rounded-xl bg-sky-600 px-4 py-2 text-sm font-bold text-white hover:bg-sky-700 disabled:opacity-50"
              >
                {actingId === prepareTarget.id ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Salvar campanha (rascunho)
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default StoreCampaignRequestsManagement;
