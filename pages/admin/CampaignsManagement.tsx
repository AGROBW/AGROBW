import React, { useEffect, useMemo, useState } from 'react';
import {
  Eye,
  FileUp,
  Mail,
  RefreshCw,
  Save,
  Send,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../../src/lib/supabaseClient';

type AudienceType = 'newsletter' | 'platform_users' | 'imported';
type CampaignStatus = 'draft' | 'queued' | 'sending' | 'completed' | 'failed' | 'paused';

interface CampaignRecord {
  id: string;
  name: string;
  subject: string;
  preview_text: string | null;
  html_content: string;
  audience_type: AudienceType;
  imported_emails: string[];
  status: CampaignStatus;
  total_recipients: number;
  sent_count: number;
  failed_count: number;
  skipped_count: number;
  queued_at: string | null;
  last_sent_at: string | null;
  created_at: string;
}

const emptyCampaign = {
  id: null as string | null,
  name: '',
  subject: '',
  previewText: '',
  htmlContent: '',
  audienceType: 'newsletter' as AudienceType,
  importedEmails: [] as string[],
};

const emailRegex = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

const parseEmails = (value: string) => {
  const matches = value.match(emailRegex) || [];
  return Array.from(
    new Set(
      matches
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean),
    ),
  );
};

const statusLabelMap: Record<CampaignStatus, string> = {
  draft: 'Rascunho',
  queued: 'Na fila',
  sending: 'Enviando',
  completed: 'Concluída',
  failed: 'Falhou',
  paused: 'Pausada',
};

const audienceLabelMap: Record<AudienceType, string> = {
  newsletter: 'Inscritos na newsletter',
  platform_users: 'Usuários da plataforma',
  imported: 'Lista importada',
};

const CampaignsManagement: React.FC = () => {
  const [campaigns, setCampaigns] = useState<CampaignRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isQueueing, setIsQueueing] = useState(false);
  const [newsletterAudienceCount, setNewsletterAudienceCount] = useState(0);
  const [platformAudienceCount, setPlatformAudienceCount] = useState(0);
  const [importEmailsText, setImportEmailsText] = useState('');
  const [form, setForm] = useState(emptyCampaign);

  const importedAudienceCount = useMemo(
    () => parseEmails(importEmailsText).length,
    [importEmailsText],
  );

  const previewHtml = useMemo(() => {
    const content =
      form.htmlContent.trim() ||
      `
        <div style="padding:32px;font-family:Arial,sans-serif;color:#0f172a;">
          <p style="margin:0 0 12px;font-size:12px;font-weight:800;letter-spacing:0.18em;text-transform:uppercase;color:#16a34a;">Preview</p>
          <h2 style="margin:0 0 16px;font-size:28px;line-height:1.2;">Sua campanha aparecerá aqui</h2>
          <p style="margin:0;font-size:15px;line-height:1.7;color:#475569;">Cole o HTML da postagem para acompanhar a renderização em tempo real.</p>
        </div>
      `;

    return `
      <!DOCTYPE html>
      <html lang="pt-BR">
        <body style="margin:0;background:#f8fafc;">
          ${content}
        </body>
      </html>
    `.trim();
  }, [form.htmlContent]);

  const loadCampaigns = async () => {
    try {
      setLoading(true);

      const [
        campaignsResult,
        newsletterCountResult,
        platformCountResult,
      ] = await Promise.all([
        supabase
          .from('newsletter_campaigns')
          .select('*')
          .order('created_at', { ascending: false }),
        supabase.rpc('admin_list_newsletter_subscriptions', {
          p_search: null,
          p_status: 'active',
          p_page: 0,
          p_page_size: 1,
        }),
        supabase
          .from('users')
          .select('id', { count: 'exact', head: true })
          .not('email', 'is', null)
          .eq('is_suspended', false),
      ]);

      if (campaignsResult.error) throw campaignsResult.error;
      if (newsletterCountResult.error) throw newsletterCountResult.error;
      if (platformCountResult.error) throw platformCountResult.error;

      setCampaigns((campaignsResult.data || []) as CampaignRecord[]);
      const newsletterRows = (newsletterCountResult.data || []) as Array<{ total_count?: number }>;
      setNewsletterAudienceCount(newsletterRows[0]?.total_count || 0);
      setPlatformAudienceCount(platformCountResult.count || 0);
    } catch (error) {
      console.error('[CampaignsManagement] Erro ao carregar campanhas:', error);
      toast.error('Não foi possível carregar as campanhas agora.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadCampaigns();
  }, []);

  const resetForm = () => {
    setForm(emptyCampaign);
    setImportEmailsText('');
  };

  const fillFormFromCampaign = (campaign: CampaignRecord) => {
    setForm({
      id: campaign.id,
      name: campaign.name,
      subject: campaign.subject,
      previewText: campaign.preview_text || '',
      htmlContent: campaign.html_content,
      audienceType: campaign.audience_type,
      importedEmails: campaign.imported_emails || [],
    });
    setImportEmailsText((campaign.imported_emails || []).join('\n'));
  };

  const handleImportFile = async (file: File) => {
    const text = await file.text();
    const parsed = parseEmails(text);
    setImportEmailsText(parsed.join('\n'));
    toast.success(`${parsed.length} e-mail(s) importado(s) para a campanha.`);
  };

  const saveCampaign = async () => {
    if (!form.name.trim() || !form.subject.trim() || !form.htmlContent.trim()) {
      toast.error('Preencha nome, assunto e conteúdo HTML da campanha.');
      return null;
    }

    const importedEmails = form.audienceType === 'imported' ? parseEmails(importEmailsText) : [];

    if (form.audienceType === 'imported' && importedEmails.length === 0) {
      toast.error('Importe ou cole ao menos um e-mail para a lista importada.');
      return null;
    }

    try {
      setIsSaving(true);

      const payload = {
        name: form.name.trim(),
        subject: form.subject.trim(),
        preview_text: form.previewText.trim() || null,
        html_content: form.htmlContent,
        audience_type: form.audienceType,
        imported_emails: importedEmails,
      };

      const query = form.id
        ? supabase.from('newsletter_campaigns').update(payload).eq('id', form.id).select('*').single()
        : supabase.from('newsletter_campaigns').insert(payload).select('*').single();

      const { data, error } = await query;

      if (error) throw error;

      toast.success(form.id ? 'Campanha atualizada com sucesso.' : 'Campanha criada com sucesso.');

      const savedCampaign = data as CampaignRecord;
      fillFormFromCampaign(savedCampaign);
      await loadCampaigns();
      return savedCampaign;
    } catch (error) {
      console.error('[CampaignsManagement] Erro ao salvar campanha:', error);
      toast.error('Não foi possível salvar a campanha agora.');
      return null;
    } finally {
      setIsSaving(false);
    }
  };

  const queueCampaign = async () => {
    const savedCampaign = await saveCampaign();
    const campaignId = savedCampaign?.id || form.id;

    if (!campaignId) return;

    try {
      setIsQueueing(true);
      const { data, error } = await supabase.rpc('admin_queue_newsletter_campaign', {
        p_campaign_id: campaignId,
      });

      if (error) throw error;

      const queuedCount = Number(data?.queued_now || 0);
      const totalRecipients = Number(data?.total_recipients || 0);

      toast.success(
        queuedCount > 0
          ? `Campanha colocada na fila para ${totalRecipients} destinatário(s).`
          : `Campanha atualizada na fila. Total atual: ${totalRecipients} destinatário(s).`,
      );

      await loadCampaigns();
    } catch (error) {
      console.error('[CampaignsManagement] Erro ao colocar campanha na fila:', error);
      toast.error('Não foi possível colocar a campanha na fila de envio.');
    } finally {
      setIsQueueing(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-3xl font-black text-slate-900">Campanhas</h1>
          <p className="mt-1 text-slate-500">
            Crie campanhas em HTML, escolha o público e coloque os envios na fila da plataforma.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => {
              resetForm();
            }}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
          >
            Nova campanha
          </button>
          <button
            type="button"
            onClick={() => {
              void loadCampaigns();
            }}
            className="inline-flex items-center gap-2 rounded-xl bg-green-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-green-600"
          >
            <RefreshCw className="h-4 w-4" />
            Atualizar
          </button>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_24px_60px_-48px_rgba(15,23,42,0.45)]">
          <div className="mb-6 flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-400">Cadastro</p>
              <h2 className="mt-2 text-2xl font-black text-slate-950">
                {form.id ? 'Editar campanha' : 'Nova campanha'}
              </h2>
            </div>
            {form.id ? (
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-700">
                Rascunho salvo
              </span>
            ) : null}
          </div>

          <div className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-xs font-black uppercase tracking-[0.18em] text-slate-500">
                  Nome
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                  placeholder="Ex.: Safra de abril"
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>

              <div>
                <label className="mb-2 block text-xs font-black uppercase tracking-[0.18em] text-slate-500">
                  Assunto
                </label>
                <input
                  type="text"
                  value={form.subject}
                  onChange={(event) => setForm((current) => ({ ...current, subject: event.target.value }))}
                  placeholder="Assunto do e-mail"
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
            </div>

            <div>
              <label className="mb-2 block text-xs font-black uppercase tracking-[0.18em] text-slate-500">
                Pré-header
              </label>
              <input
                type="text"
                value={form.previewText}
                onChange={(event) => setForm((current) => ({ ...current, previewText: event.target.value }))}
                placeholder="Texto curto que aparece antes da abertura do e-mail"
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>

            <div>
              <label className="mb-2 block text-xs font-black uppercase tracking-[0.18em] text-slate-500">
                Público alvo
              </label>
              <select
                value={form.audienceType}
                onChange={(event) =>
                  setForm((current) => ({ ...current, audienceType: event.target.value as AudienceType }))
                }
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                <option value="newsletter">Inscritos na newsletter</option>
                <option value="platform_users">Usuários da plataforma</option>
                <option value="imported">Lista importada</option>
              </select>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <div className={`rounded-2xl border p-4 ${form.audienceType === 'newsletter' ? 'border-green-300 bg-green-50' : 'border-slate-200 bg-slate-50'}`}>
                <p className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">Newsletter</p>
                <p className="mt-2 text-2xl font-black text-slate-950">{newsletterAudienceCount}</p>
                <p className="mt-1 text-xs text-slate-500">Inscritos ativos no formulário do site</p>
              </div>
              <div className={`rounded-2xl border p-4 ${form.audienceType === 'platform_users' ? 'border-green-300 bg-green-50' : 'border-slate-200 bg-slate-50'}`}>
                <p className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">Usuários</p>
                <p className="mt-2 text-2xl font-black text-slate-950">{platformAudienceCount}</p>
                <p className="mt-1 text-xs text-slate-500">Contas ativas com e-mail cadastrado</p>
              </div>
              <div className={`rounded-2xl border p-4 ${form.audienceType === 'imported' ? 'border-green-300 bg-green-50' : 'border-slate-200 bg-slate-50'}`}>
                <p className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">Importados</p>
                <p className="mt-2 text-2xl font-black text-slate-950">{importedAudienceCount}</p>
                <p className="mt-1 text-xs text-slate-500">E-mails únicos carregados nesta campanha</p>
              </div>
            </div>

            {form.audienceType === 'imported' ? (
              <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-black text-slate-900">Lista importada</p>
                    <p className="text-xs text-slate-500">Cole os e-mails ou importe um arquivo `.csv` ou `.txt`.</p>
                  </div>
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100">
                    <FileUp className="h-4 w-4" />
                    Importar arquivo
                    <input
                      type="file"
                      accept=".csv,.txt"
                      className="hidden"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) {
                          void handleImportFile(file);
                        }
                        event.currentTarget.value = '';
                      }}
                    />
                  </label>
                </div>

                <textarea
                  value={importEmailsText}
                  onChange={(event) => setImportEmailsText(event.target.value)}
                  placeholder="Cole aqui uma lista de e-mails, um por linha, vírgula ou texto livre."
                  className="min-h-[140px] w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
            ) : null}

            <div>
              <label className="mb-2 block text-xs font-black uppercase tracking-[0.18em] text-slate-500">
                Conteúdo HTML
              </label>
              <textarea
                value={form.htmlContent}
                onChange={(event) => setForm((current) => ({ ...current, htmlContent: event.target.value }))}
                placeholder="<table>...</table>"
                className="min-h-[260px] w-full rounded-2xl border border-slate-200 px-4 py-3 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => {
                  void saveCampaign();
                }}
                disabled={isSaving || isQueueing}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              >
                <Save className="h-4 w-4" />
                Salvar campanha
              </button>
              <button
                type="button"
                onClick={() => {
                  void queueCampaign();
                }}
                disabled={isSaving || isQueueing}
                className="inline-flex items-center gap-2 rounded-xl bg-green-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-green-600 disabled:opacity-60"
              >
                <Send className="h-4 w-4" />
                {isQueueing ? 'Colocando na fila...' : 'Salvar e colocar na fila'}
              </button>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_24px_60px_-48px_rgba(15,23,42,0.45)]">
            <div className="mb-4 flex items-center gap-2">
              <Eye className="h-4 w-4 text-green-600" />
              <p className="text-sm font-black text-slate-900">Preview em tempo real</p>
            </div>
            <div className="overflow-hidden rounded-[22px] border border-slate-200 bg-slate-50">
              <iframe title="Preview da campanha" srcDoc={previewHtml} className="h-[560px] w-full bg-white" />
            </div>
          </div>

          <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_24px_60px_-48px_rgba(15,23,42,0.45)]">
            <div className="mb-4 flex items-center gap-2">
              <Users className="h-4 w-4 text-green-600" />
              <p className="text-sm font-black text-slate-900">Resumo do público</p>
            </div>
            <div className="space-y-3 text-sm text-slate-600">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">Origem atual</p>
                <p className="mt-2 text-base font-black text-slate-950">{audienceLabelMap[form.audienceType]}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">Estimativa</p>
                <p className="mt-2 text-base font-black text-slate-950">
                  {form.audienceType === 'newsletter'
                    ? newsletterAudienceCount
                    : form.audienceType === 'platform_users'
                      ? platformAudienceCount
                      : importedAudienceCount}{' '}
                  destinatário(s)
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_24px_60px_-48px_rgba(15,23,42,0.45)]">
        <div className="mb-6 flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-400">Histórico</p>
            <h2 className="mt-2 text-2xl font-black text-slate-950">Campanhas salvas</h2>
          </div>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
            {campaigns.length} campanha(s)
          </span>
        </div>

        <div className="overflow-hidden rounded-3xl border border-slate-200">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px]">
              <thead className="border-b border-slate-200 bg-slate-50">
                <tr>
                  <th className="px-5 py-3 text-left text-[11px] font-black uppercase tracking-[0.2em] text-slate-500">Campanha</th>
                  <th className="px-5 py-3 text-left text-[11px] font-black uppercase tracking-[0.2em] text-slate-500">Público</th>
                  <th className="px-5 py-3 text-left text-[11px] font-black uppercase tracking-[0.2em] text-slate-500">Status</th>
                  <th className="px-5 py-3 text-left text-[11px] font-black uppercase tracking-[0.2em] text-slate-500">Destinatários</th>
                  <th className="px-5 py-3 text-left text-[11px] font-black uppercase tracking-[0.2em] text-slate-500">Entrega</th>
                  <th className="px-5 py-3 text-right text-[11px] font-black uppercase tracking-[0.2em] text-slate-500">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-14 text-center">
                      <div className="mx-auto h-8 w-8 animate-spin rounded-full border-b-2 border-green-600" />
                    </td>
                  </tr>
                ) : campaigns.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-14 text-center text-slate-500">
                      Nenhuma campanha cadastrada ainda.
                    </td>
                  </tr>
                ) : (
                  campaigns.map((campaign) => (
                    <tr key={campaign.id} className="hover:bg-slate-50">
                      <td className="px-5 py-4">
                        <p className="font-bold text-slate-950">{campaign.name}</p>
                        <p className="mt-1 text-sm text-slate-500">{campaign.subject}</p>
                      </td>
                      <td className="px-5 py-4 text-sm text-slate-600">{audienceLabelMap[campaign.audience_type]}</td>
                      <td className="px-5 py-4">
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">
                          {statusLabelMap[campaign.status]}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-sm text-slate-600">{campaign.total_recipients}</td>
                      <td className="px-5 py-4 text-sm text-slate-600">
                        {campaign.sent_count} enviados · {campaign.failed_count} falhas · {campaign.skipped_count} ignorados
                      </td>
                      <td className="px-5 py-4 text-right">
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => fillFormFromCampaign(campaign)}
                            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              fillFormFromCampaign(campaign);
                              void (async () => {
                                try {
                                  setIsQueueing(true);
                                  const { data, error } = await supabase.rpc('admin_queue_newsletter_campaign', {
                                    p_campaign_id: campaign.id,
                                  });
                                  if (error) throw error;
                                  toast.success(`Campanha atualizada na fila. Total: ${Number(data?.total_recipients || 0)} destinatário(s).`);
                                  await loadCampaigns();
                                } catch (error) {
                                  console.error('[CampaignsManagement] Erro ao reenfileirar campanha:', error);
                                  toast.error('Não foi possível colocar a campanha na fila.');
                                } finally {
                                  setIsQueueing(false);
                                }
                              })();
                            }}
                            className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800"
                          >
                            <Mail className="h-3.5 w-3.5" />
                            Enfileirar
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
      </div>
    </div>
  );
};

export default CampaignsManagement;
