import React, { useEffect, useMemo, useState } from 'react';
import { Eye, LayoutTemplate, Pencil, Plus, RotateCcw, Save, Sparkles, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { SitePopup, SitePopupAudience, SitePopupPageScope } from '../../types';
import { useAdminAudit, ADMIN_ACTIONS, RESOURCE_TYPES } from '../../src/hooks/useAdminAudit';
import { useSitePopups } from '../../src/hooks/useSitePopups';
import {
  DEFAULT_SITE_POPUP_DRAFT,
  SITE_POPUP_PLACEHOLDERS,
  SITE_POPUP_SAMPLE_VALUES,
  SitePopupDraft,
  cloneSitePopupDraft,
  renderSitePopupText,
} from '../../src/lib/sitePopupTemplates';

const audienceLabels: Record<SitePopupAudience, string> = {
  visitors: 'Visitantes',
  authenticated: 'Usuarios logados',
  all: 'Todos',
};

const pageScopeLabels: Record<SitePopupPageScope, string> = {
  site: 'Site inteiro',
  home: 'Somente home',
  plans: 'Pagina de planos',
  custom: 'Pagina especifica',
};

const mapPopupToDraft = (popup: SitePopup): SitePopupDraft => ({
  name: popup.name,
  title: popup.title,
  message: popup.message,
  supportText: popup.supportText,
  primaryButtonLabel: popup.primaryButtonLabel,
  primaryButtonLink: popup.primaryButtonLink,
  delaySeconds: popup.delaySeconds,
  isActive: popup.isActive,
  showOnce: popup.showOnce,
  audience: popup.audience,
  pageScope: popup.pageScope,
  customPath: popup.customPath || '',
  displayOrder: popup.displayOrder ?? 0,
  startsAt: popup.startsAt ? popup.startsAt.slice(0, 16) : '',
  endsAt: popup.endsAt ? popup.endsAt.slice(0, 16) : '',
});

const SitePopupsManagement: React.FC = () => {
  const { popups, isLoading, savePopup, togglePopupStatus, deletePopup } = useSitePopups();
  const { logAction } = useAdminAudit();
  const [selectedPopupId, setSelectedPopupId] = useState<string | null>(null);
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [form, setForm] = useState<SitePopupDraft>(cloneSitePopupDraft(DEFAULT_SITE_POPUP_DRAFT));
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isCreatingNew) {
      return;
    }

    if (selectedPopupId) {
      const selectedPopup = popups.find((item) => item.id === selectedPopupId);
      if (selectedPopup) {
        setForm(mapPopupToDraft(selectedPopup));
        return;
      }
    }

    if (!selectedPopupId && popups.length === 0) {
      setForm(cloneSitePopupDraft(DEFAULT_SITE_POPUP_DRAFT));
    }
  }, [isCreatingNew, popups, selectedPopupId]);

  useEffect(() => {
    if (!isCreatingNew && !selectedPopupId && popups.length > 0) {
      setSelectedPopupId(popups[0].id);
    }
  }, [isCreatingNew, popups, selectedPopupId]);

  const selectedPopup = useMemo(
    () => popups.find((item) => item.id === selectedPopupId) || null,
    [popups, selectedPopupId],
  );

  const previewValues = SITE_POPUP_SAMPLE_VALUES;

  const handleChange = (field: keyof SitePopupDraft, value: string | boolean | number) => {
    setForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleCreateNew = () => {
    setIsCreatingNew(true);
    setSelectedPopupId(null);
    setForm(cloneSitePopupDraft(DEFAULT_SITE_POPUP_DRAFT));
  };

  const handleEditPopup = (popup: SitePopup) => {
    setIsCreatingNew(false);
    setSelectedPopupId(popup.id);
    setForm(mapPopupToDraft(popup));
  };

  const handleRestoreDefault = () => {
    setForm((prev) => ({
      ...prev,
      ...cloneSitePopupDraft(DEFAULT_SITE_POPUP_DRAFT),
      isActive: prev.isActive,
      delaySeconds: prev.delaySeconds,
      audience: prev.audience,
      pageScope: prev.pageScope,
      showOnce: prev.showOnce,
    }));

    toast.success('Texto padrao restaurado para este pop-up.');
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.title.trim() || !form.message.trim() || !form.primaryButtonLabel.trim()) {
      toast.error('Preencha nome interno, titulo, mensagem e texto do botao.');
      return;
    }

    if (!form.primaryButtonLink.trim()) {
      toast.error('Informe o link de destino do botao principal.');
      return;
    }

    setIsSaving(true);

    const previousValue = selectedPopup;
    const { error } = await savePopup(form as Omit<SitePopup, 'id' | 'createdAt' | 'updatedAt' | 'updatedBy'>, selectedPopupId);

    if (error) {
      toast.error('Nao foi possivel salvar o pop-up.', {
        description: error,
      });
      setIsSaving(false);
      return;
    }

    await logAction({
      action: ADMIN_ACTIONS.UPDATE_PAGE_CONTENT,
      resourceType: RESOURCE_TYPES.SYSTEM,
      resourceId: selectedPopupId,
      oldValue: previousValue as any,
      newValue: form as any,
      reason: selectedPopupId
        ? 'Pop-up do site atualizado pelo painel administrativo'
        : 'Novo pop-up do site criado pelo painel administrativo',
    });

    setIsCreatingNew(false);
    toast.success(selectedPopupId ? 'Pop-up atualizado com sucesso.' : 'Pop-up criado com sucesso.');
    setIsSaving(false);
  };

  const handleToggleActivation = async (popup: SitePopup) => {
    const shouldActivate = !popup.isActive;
    const { error } = await togglePopupStatus(popup.id, shouldActivate);

    if (error) {
      toast.error('Nao foi possivel atualizar o status do pop-up.', {
        description: error,
      });
      return;
    }

    await logAction({
      action: ADMIN_ACTIONS.UPDATE_PAGE_CONTENT,
      resourceType: RESOURCE_TYPES.SYSTEM,
      resourceId: popup.id,
      oldValue: popup as any,
      newValue: { ...popup, isActive: shouldActivate } as any,
      reason: shouldActivate
        ? 'Pop-up do site ativado pelo painel administrativo'
        : 'Pop-up do site desativado pelo painel administrativo',
    });

    toast.success(shouldActivate ? 'Pop-up ativado com sucesso.' : 'Pop-up desativado com sucesso.');
  };

  const handleDeletePopup = async (popup: SitePopup) => {
    const confirmed = window.confirm(`Deseja excluir o pop-up "${popup.name}"? Essa ação não poderá ser desfeita.`);
    if (!confirmed) return;

    const { error } = await deletePopup(popup.id);

    if (error) {
      toast.error('Nao foi possivel excluir o pop-up.', {
        description: error,
      });
      return;
    }

    await logAction({
      action: ADMIN_ACTIONS.DELETE_PAGE,
      resourceType: RESOURCE_TYPES.SYSTEM,
      resourceId: popup.id,
      oldValue: popup as any,
      newValue: null,
      reason: 'Pop-up do site excluido pelo painel administrativo',
    });

    if (selectedPopupId === popup.id) {
      const remainingPopups = popups.filter((item) => item.id !== popup.id);
      if (remainingPopups.length > 0) {
        handleEditPopup(remainingPopups[0]);
      } else {
        handleCreateNew();
      }
    }

    toast.success('Pop-up excluido com sucesso.');
  };

  return (
    <div className="space-y-6">
      <div className="rounded-[28px] border border-slate-200 bg-[linear-gradient(135deg,#ffffff_0%,#f8fafc_72%,rgba(22,163,74,0.08)_100%)] p-6 shadow-[0_24px_60px_-42px_rgba(15,23,42,0.4)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.28em] text-emerald-700">
              Pop-ups do site
            </div>
            <div>
              <h2 className="text-2xl font-black text-slate-950">Campanhas de pop-up para visitantes e usuarios</h2>
              <p className="max-w-3xl text-sm leading-6 text-slate-500">
                Crie campanhas de boas-vindas e comunicacao promocional sem depender de codigo. Agora voce pode manter
                varios pop-ups ativos ao mesmo tempo, controlar pagina, vigencia e acompanhar desempenho.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleCreateNew}
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
            >
              <Plus className="h-4 w-4" />
              Novo pop-up
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-bold text-white shadow-[0_20px_45px_-28px_rgba(15,23,42,0.85)] transition hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Save className="h-4 w-4" />
              {isSaving ? 'Salvando...' : 'Salvar pop-up'}
            </button>
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.35fr]">
        <div className="space-y-4 rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_24px_60px_-42px_rgba(15,23,42,0.4)]">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.28em] text-slate-500">Biblioteca</p>
              <h3 className="mt-1 text-lg font-black text-slate-950">Pop-ups cadastrados</h3>
            </div>
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">
              {popups.length} item(ns)
            </div>
          </div>

          <div className="space-y-3">
            {isLoading ? (
              <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                Carregando pop-ups...
              </div>
            ) : popups.length === 0 ? (
              <div className="rounded-[24px] border border-dashed border-slate-300 bg-slate-50/70 p-5 text-sm leading-6 text-slate-500">
                Nenhum pop-up cadastrado ainda. Use o modelo de boas-vindas ao lado para criar a primeira campanha.
              </div>
            ) : (
              popups.map((popup) => (
                <div
                  key={popup.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => handleEditPopup(popup)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      handleEditPopup(popup);
                    }
                  }}
                  className={`w-full rounded-[24px] border p-4 text-left transition ${
                    popup.id === selectedPopupId
                      ? 'border-emerald-200 bg-[linear-gradient(135deg,rgba(22,163,74,0.08)_0%,#ffffff_75%)] shadow-[0_22px_50px_-40px_rgba(22,163,74,0.65)]'
                      : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-2">
                      <p className="text-sm font-black text-slate-950">{popup.name}</p>
                      <p className="line-clamp-2 text-sm leading-6 text-slate-500">{popup.title}</p>
                    </div>
                    <span
                      className={`inline-flex min-w-[76px] items-center justify-center rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] ${
                        popup.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {popup.isActive ? 'Ativo' : 'Rascunho'}
                    </span>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">
                      {audienceLabels[popup.audience]}
                    </span>
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">
                      {pageScopeLabels[popup.pageScope]}
                    </span>
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">
                      {popup.delaySeconds}s
                    </span>
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">
                      ordem {popup.displayOrder}
                    </span>
                  </div>

                  {popup.pageScope === 'custom' && popup.customPath ? (
                    <p className="mt-2 text-xs font-semibold text-slate-500">Pagina: {popup.customPath}</p>
                  ) : null}

                  {(popup.startsAt || popup.endsAt) ? (
                    <p className="mt-2 text-xs font-semibold text-slate-500">
                      {popup.startsAt ? `De ${new Date(popup.startsAt).toLocaleString('pt-BR')}` : 'Sem inicio'}
                      {' · '}
                      {popup.endsAt ? `Ate ${new Date(popup.endsAt).toLocaleString('pt-BR')}` : 'Sem fim'}
                    </p>
                  ) : null}

                  <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
                      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Views</p>
                      <p className="mt-1 text-sm font-black text-slate-950">{popup.metrics?.views ?? 0}</p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
                      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Cliques</p>
                      <p className="mt-1 text-sm font-black text-slate-950">{popup.metrics?.clicks ?? 0}</p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
                      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Fechamentos</p>
                      <p className="mt-1 text-sm font-black text-slate-950">{popup.metrics?.dismissals ?? 0}</p>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        handleEditPopup(popup);
                      }}
                      className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        void handleToggleActivation(popup);
                      }}
                      className={`inline-flex items-center justify-center rounded-xl px-3 py-2 text-xs font-bold transition ${
                        popup.isActive
                          ? 'bg-slate-950 text-white hover:bg-slate-900'
                          : 'bg-emerald-600 text-white hover:bg-emerald-700'
                      }`}
                    >
                      {popup.isActive ? 'Desativar' : 'Ativar'}
                    </button>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        void handleDeletePopup(popup);
                      }}
                      className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700 transition hover:border-rose-300 hover:bg-rose-100"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Excluir
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_24px_60px_-42px_rgba(15,23,42,0.4)]">
            <div className="mb-6 flex items-center justify-between gap-4">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.28em] text-slate-500">Editor</p>
                <h3 className="mt-1 text-lg font-black text-slate-950">
                  {selectedPopupId ? 'Editar pop-up' : 'Novo pop-up'}
                </h3>
              </div>
              <button
                type="button"
                onClick={handleRestoreDefault}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
              >
                <RotateCcw className="h-4 w-4" />
                Restaurar texto padrao
              </button>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <label className="space-y-2">
                <span className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Nome interno</span>
                <input
                  type="text"
                  value={form.name}
                  onChange={(event) => handleChange('name', event.target.value)}
                  className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold text-slate-900 shadow-sm outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-100"
                  placeholder="Ex.: Boas-vindas | Plano Semente"
                />
              </label>

              <label className="space-y-2">
                <span className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Atraso (segundos)</span>
                <input
                  type="number"
                  min={0}
                  max={120}
                  value={form.delaySeconds}
                  onChange={(event) => handleChange('delaySeconds', Math.max(0, Number(event.target.value) || 0))}
                  className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold text-slate-900 shadow-sm outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-100"
                />
              </label>

              <label className="space-y-2">
                <span className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Ordem de exibicao</span>
                <input
                  type="number"
                  min={0}
                  value={form.displayOrder}
                  onChange={(event) => handleChange('displayOrder', Math.max(0, Number(event.target.value) || 0))}
                  className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold text-slate-900 shadow-sm outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-100"
                />
              </label>

              <label className="space-y-2 lg:col-span-2">
                <span className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Titulo</span>
                <input
                  type="text"
                  value={form.title}
                  onChange={(event) => handleChange('title', event.target.value)}
                  className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold text-slate-900 shadow-sm outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-100"
                />
              </label>

              <label className="space-y-2 lg:col-span-2">
                <span className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Mensagem principal</span>
                <textarea
                  value={form.message}
                  onChange={(event) => handleChange('message', event.target.value)}
                  rows={4}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-900 shadow-sm outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-100"
                />
              </label>

              <label className="space-y-2 lg:col-span-2">
                <span className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Mensagem curta de apoio</span>
                <textarea
                  value={form.supportText}
                  onChange={(event) => handleChange('supportText', event.target.value)}
                  rows={3}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-900 shadow-sm outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-100"
                />
              </label>

              <label className="space-y-2">
                <span className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">CTA / botao</span>
                <input
                  type="text"
                  value={form.primaryButtonLabel}
                  onChange={(event) => handleChange('primaryButtonLabel', event.target.value)}
                  className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold text-slate-900 shadow-sm outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-100"
                />
              </label>

              <label className="space-y-2">
                <span className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Link / acao</span>
                <input
                  type="text"
                  value={form.primaryButtonLink}
                  onChange={(event) => handleChange('primaryButtonLink', event.target.value)}
                  className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold text-slate-900 shadow-sm outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-100"
                  placeholder="/cadastro"
                />
              </label>

              <label className="space-y-2">
                <span className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Publico</span>
                <select
                  value={form.audience}
                  onChange={(event) => handleChange('audience', event.target.value as SitePopupAudience)}
                  className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold text-slate-900 shadow-sm outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-100"
                >
                  {Object.entries(audienceLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-2">
                <span className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Pagina alvo</span>
                <select
                  value={form.pageScope}
                  onChange={(event) => handleChange('pageScope', event.target.value as SitePopupPageScope)}
                  className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold text-slate-900 shadow-sm outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-100"
                >
                  {Object.entries(pageScopeLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>

              {form.pageScope === 'custom' ? (
                <label className="space-y-2 lg:col-span-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Caminho da pagina</span>
                  <input
                    type="text"
                    value={form.customPath}
                    onChange={(event) => handleChange('customPath', event.target.value)}
                    className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold text-slate-900 shadow-sm outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-100"
                    placeholder="/planos ou /anuncios"
                  />
                </label>
              ) : null}

              <label className="space-y-2">
                <span className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Inicio da vigencia</span>
                <input
                  type="datetime-local"
                  value={form.startsAt}
                  onChange={(event) => handleChange('startsAt', event.target.value)}
                  className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold text-slate-900 shadow-sm outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-100"
                />
              </label>

              <label className="space-y-2">
                <span className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Fim da vigencia</span>
                <input
                  type="datetime-local"
                  value={form.endsAt}
                  onChange={(event) => handleChange('endsAt', event.target.value)}
                  className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold text-slate-900 shadow-sm outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-100"
                />
              </label>
            </div>

            <div className="mt-6 grid gap-3 rounded-[24px] border border-slate-200 bg-slate-50/70 p-4 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => handleChange('showOnce', !form.showOnce)}
                className={`rounded-2xl border px-4 py-3 text-left transition ${
                  form.showOnce
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                    : 'border-slate-200 bg-white text-slate-600'
                }`}
              >
                <p className="text-sm font-black">Exibir apenas uma vez</p>
                <p className="mt-1 text-xs leading-5">
                  {form.showOnce
                    ? 'Depois de fechar ou clicar, o navegador nao ve mais este pop-up.'
                    : 'O pop-up pode reaparecer em novas visitas.'}
                </p>
              </button>

              <button
                type="button"
                onClick={() => handleChange('isActive', !form.isActive)}
                className={`rounded-2xl border px-4 py-3 text-left transition ${
                  form.isActive
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                    : 'border-slate-200 bg-white text-slate-600'
                }`}
              >
                <p className="text-sm font-black">Ativar apos salvar</p>
                <p className="mt-1 text-xs leading-5">
                  {form.isActive
                    ? 'Este pop-up entra na fila de campanhas elegiveis do site.'
                    : 'Salva como rascunho sem exibir no site.'}
                </p>
              </button>
            </div>

            <div className="mt-6 rounded-[24px] border border-amber-200 bg-amber-50/80 p-4 text-sm leading-6 text-amber-900">
              <strong className="font-black">Placeholders dinamicos:</strong>
              <div className="mt-3 flex flex-wrap gap-2">
                {SITE_POPUP_PLACEHOLDERS.map((placeholder) => (
                  <span
                    key={placeholder.key}
                    className="rounded-full border border-amber-200 bg-white px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em]"
                  >
                    {placeholder.key}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_24px_60px_-42px_rgba(15,23,42,0.4)]">
            <div className="mb-5 flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
                <Eye className="h-5 w-5" />
              </div>
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.28em] text-slate-500">Previa</p>
                <h3 className="mt-1 text-lg font-black text-slate-950">Como o visitante vera o pop-up</h3>
              </div>
            </div>

            <div className="overflow-hidden rounded-[28px] border border-slate-200 shadow-[0_28px_70px_-48px_rgba(15,23,42,0.5)]">
              <div className="bg-[linear-gradient(135deg,#0f172a_0%,#14532d_100%)] px-6 pb-6 pt-7 text-white">
                <div className="inline-flex items-center gap-2 rounded-full border border-emerald-300/35 bg-emerald-400/10 px-3 py-1 text-[11px] font-black uppercase tracking-[0.24em] text-emerald-100">
                  <Sparkles className="h-3.5 w-3.5" />
                  Preview do pop-up
                </div>
                <h4 className="mt-4 text-2xl font-black leading-tight">
                  {renderSitePopupText(form.title, previewValues) || 'Titulo do pop-up'}
                </h4>
                <p className="mt-3 text-sm leading-6 text-emerald-50/90">
                  {renderSitePopupText(form.message, previewValues) || 'Mensagem principal do pop-up.'}
                </p>
              </div>

              <div className="space-y-5 px-6 py-6">
                {form.supportText ? (
                  <div className="rounded-[22px] border border-emerald-100 bg-emerald-50/70 p-4 text-sm leading-6 text-emerald-950">
                    {renderSitePopupText(form.supportText, previewValues)}
                  </div>
                ) : null}

                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <button
                    type="button"
                    className="inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-bold text-white"
                  >
                    {renderSitePopupText(form.primaryButtonLabel, previewValues) || 'Texto do botao'}
                  </button>
                  <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                    {form.delaySeconds}s | {audienceLabels[form.audience]} | {pageScopeLabels[form.pageScope]}
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-5 rounded-[24px] border border-slate-200 bg-slate-50/70 p-4 text-sm leading-6 text-slate-500">
              <div className="mb-2 flex items-center gap-2 text-slate-900">
                <LayoutTemplate className="h-4 w-4 text-emerald-600" />
                <strong className="font-black">Escopo desta fase</strong>
              </div>
              <p>
                O sistema escolhe o primeiro pop-up elegivel com base na ordem, na vigencia e na pagina alvo. Tambem
                registra visualizacoes, cliques e fechamentos para voce medir a campanha.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SitePopupsManagement;
