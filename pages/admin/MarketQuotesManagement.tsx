import React, { useMemo, useState } from 'react';
import { CheckCircle2, Clock3, Database, Loader2, Plus, RefreshCw, Save, ShieldCheck, Trash2, TrendingUp, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { AdminMarketQuoteSource, CommodityTarget, SourceProvider, useMarketQuotesAdmin } from '../../src/hooks/useMarketQuotesAdmin';

const commodityLabels: Record<CommodityTarget, string> = {
  soja: 'Soja',
  milho: 'Milho',
  boi: 'Boi Gordo',
  cafe: 'Café Arábica',
};

type MarketQuoteSourceForm = {
  id: string;
  name: string;
  provider: SourceProvider;
  source_url: string;
  commodity_target: CommodityTarget;
  provider_label: string;
  is_active: boolean;
  auto_approve_enabled: boolean;
  refresh_interval_minutes: number;
};

const emptyForm: MarketQuoteSourceForm = {
  id: '',
  name: '',
  provider: 'cepea',
  source_url: '',
  commodity_target: 'soja',
  provider_label: 'CEPEA',
  is_active: true,
  auto_approve_enabled: false,
  refresh_interval_minutes: 60,
};

const formatDateTime = (value?: string | null) => {
  if (!value) return 'Ainda não';
  return new Date(value).toLocaleString('pt-BR');
};

const formatReferenceDate = (value?: string | null) => {
  if (!value) return 'Sem data';
  return new Date(`${value}T00:00:00`).toLocaleDateString('pt-BR');
};

const statusLabel: Record<string, string> = {
  active: 'Ativa',
  no_data: 'Sem dados',
  error: 'Erro',
  parsing_error: 'Erro de parsing',
};

const MarketQuotesManagement: React.FC = () => {
  const {
    cepeaIndicatorMap,
    sources,
    latestTempBySource,
    tempHistoryBySource,
    publishedQuoteBySource,
    isLoading,
    isSaving,
    isValidating,
    isPublishing,
    isRejecting,
    saveSource,
    validateSource,
    publishTempItem,
    rejectTempItem,
    deleteSource,
  } = useMarketQuotesAdmin();

  const [formData, setFormData] = useState<MarketQuoteSourceForm>(emptyForm);
  const [showForm, setShowForm] = useState(false);

  const activeSourcesCount = useMemo(() => sources.filter((item) => item.is_active).length, [sources]);

  const handleEdit = (source: AdminMarketQuoteSource) => {
    setFormData({
      id: source.id,
      name: source.name,
      provider: source.provider,
      source_url: source.source_url,
      commodity_target: source.commodity_target,
      provider_label: source.provider_label || (source.provider === 'cepea' ? 'CEPEA' : ''),
      is_active: source.is_active,
      auto_approve_enabled: source.auto_approve_enabled,
      refresh_interval_minutes: source.refresh_interval_minutes,
    });
    setShowForm(true);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    try {
      await saveSource({
        id: formData.id || undefined,
        name: formData.name,
        provider: formData.provider,
        source_url: formData.source_url,
        commodity_target: formData.commodity_target,
        provider_label: formData.provider_label || null,
        is_active: formData.is_active,
        auto_approve_enabled: formData.auto_approve_enabled,
        refresh_interval_minutes: formData.refresh_interval_minutes,
      });
      toast.success(formData.id ? 'Fonte atualizada com sucesso.' : 'Fonte cadastrada com sucesso.');
      setFormData(emptyForm);
      setShowForm(false);
    } catch (error: any) {
      toast.error(error.message || 'Erro ao salvar fonte.');
    }
  };

  const handleValidate = async (source: AdminMarketQuoteSource) => {
    try {
      const result = await validateSource(source);
      const foundCount = Number(result?.foundCount || 0);
      if (foundCount > 0 && result?.autoApproved) {
        toast.success(`${commodityLabels[source.commodity_target]} coletada, aprovada automaticamente e publicada no ticker.`);
        return;
      }
      toast.success(
        foundCount > 0
          ? `${commodityLabels[source.commodity_target]} encontrada e enviada para validação.`
          : `Nenhum valor confiável foi encontrado para ${commodityLabels[source.commodity_target]}.`
      );
    } catch (error: any) {
      toast.error(error.message || 'Erro ao validar fonte.');
    }
  };

  const handlePublish = async (source: AdminMarketQuoteSource) => {
    try {
      await publishTempItem(source);
      toast.success(`${commodityLabels[source.commodity_target]} publicada no ticker com sucesso.`);
    } catch (error: any) {
      toast.error(error.message || 'Erro ao publicar cotação.');
    }
  };

  const handleReject = async (source: AdminMarketQuoteSource) => {
    try {
      await rejectTempItem(source);
      toast.success(`${commodityLabels[source.commodity_target]} rejeitada na validação.`);
    } catch (error: any) {
      toast.error(error.message || 'Erro ao rejeitar cotação.');
    }
  };

  const handleDelete = async (source: AdminMarketQuoteSource) => {
    if (!window.confirm(`Excluir a fonte "${source.name}"?`)) return;

    try {
      await deleteSource(source.id);
      toast.success('Fonte removida com sucesso.');
    } catch (error: any) {
      toast.error(error.message || 'Erro ao excluir fonte.');
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 text-green-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold uppercase tracking-[0.22em] text-emerald-700">
              <TrendingUp className="h-3.5 w-3.5" />
              Pipeline CEPEA
            </div>
            <h2 className="mt-4 text-2xl font-black text-slate-900">Coleta e validação de cotações</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              O sistema gera a URL do widget CEPEA a partir do indicador oficial, coleta no backend, salva no staging e só publica no ticker depois da sua aprovação.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setFormData(emptyForm);
              setShowForm((current) => !current);
            }}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-green-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-green-700"
          >
            <Plus className="h-4 w-4" />
            Nova fonte
          </button>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-slate-500">Fontes ativas</p>
            <p className="mt-2 text-3xl font-black text-slate-900">{activeSourcesCount}</p>
            <p className="mt-1 text-sm text-slate-500">Atualização prevista em baixa frequência, com aprovação manual ou automática por fonte.</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-slate-500">Fluxo seguro</p>
            <p className="mt-2 text-lg font-bold text-slate-900">Coletar → validar → aprovar/publicar</p>
            <p className="mt-1 text-sm text-slate-500">Você pode manter revisão manual ou liberar autoaprovação por fonte.</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-slate-500">Crédito exibido</p>
            <p className="mt-2 text-lg font-bold text-slate-900">Fonte: CEPEA</p>
            <p className="mt-1 text-sm text-slate-500">A referência da fonte segue junto para o frontend usar no ticker.</p>
          </div>
        </div>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4">
          <div>
            <h3 className="text-lg font-black text-slate-900">{formData.id ? 'Editar fonte' : 'Nova fonte estruturada'}</h3>
            <p className="text-sm text-slate-500">Para CEPEA, a URL é gerada automaticamente a partir do indicador oficial.</p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2">
              <span className="text-sm font-semibold text-slate-700">Nome interno da fonte</span>
              <input
                value={formData.name}
                onChange={(event) => setFormData((current) => ({ ...current, name: event.target.value }))}
                className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:border-green-500 focus:outline-none"
                placeholder="Ex.: CEPEA - Milho"
                required
              />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-semibold text-slate-700">Nome público da fonte</span>
              <input
                value={formData.provider_label}
                onChange={(event) => setFormData((current) => ({ ...current, provider_label: event.target.value }))}
                className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:border-green-500 focus:outline-none"
                placeholder="Ex.: CEPEA"
              />
            </label>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <label className="space-y-2">
              <span className="text-sm font-semibold text-slate-700">Fonte</span>
              <select
                value={formData.provider}
                onChange={(event) =>
                  setFormData((current) => ({
                    ...current,
                    provider: event.target.value as SourceProvider,
                    provider_label: event.target.value === 'cepea' ? 'CEPEA' : current.provider_label,
                  }))
                }
                className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:border-green-500 focus:outline-none"
              >
                <option value="cepea">CEPEA</option>
                <option value="custom">Custom</option>
              </select>
            </label>

            <label className="space-y-2">
              <span className="text-sm font-semibold text-slate-700">Commodity</span>
              <select
                value={formData.commodity_target}
                onChange={(event) =>
                  setFormData((current) => ({
                    ...current,
                    commodity_target: event.target.value as CommodityTarget,
                  }))
                }
                className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:border-green-500 focus:outline-none"
              >
                <option value="soja">Soja</option>
                <option value="milho">Milho</option>
                <option value="boi">Boi Gordo</option>
                <option value="cafe">Café Arábica</option>
              </select>
            </label>

            <label className="space-y-2">
              <span className="text-sm font-semibold text-slate-700">Indicador CEPEA</span>
              <input
                value={cepeaIndicatorMap[formData.commodity_target]}
                readOnly
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600"
              />
            </label>
          </div>

          <label className="space-y-2 block">
            <span className="text-sm font-semibold text-slate-700">URL da fonte</span>
            <input
              type="url"
              value={formData.provider === 'cepea' ? `https://www.cepea.org.br/br/widgetproduto.js.php?output=html&id_indicador[]=${cepeaIndicatorMap[formData.commodity_target]}` : formData.source_url}
              onChange={(event) => setFormData((current) => ({ ...current, source_url: event.target.value }))}
              readOnly={formData.provider === 'cepea'}
              className={`w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:border-green-500 focus:outline-none ${formData.provider === 'cepea' ? 'bg-slate-50 text-slate-600' : ''}`}
              placeholder="https://exemplo.com/cotacoes"
            />
          </label>

          <div className="grid gap-4 md:grid-cols-[220px_1fr]">
            <label className="space-y-2">
              <span className="text-sm font-semibold text-slate-700">Intervalo (minutos)</span>
              <input
                type="number"
                min={15}
                step={15}
                value={formData.refresh_interval_minutes}
                onChange={(event) =>
                  setFormData((current) => ({
                    ...current,
                    refresh_interval_minutes: Number(event.target.value || 60),
                  }))
                }
                className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:border-green-500 focus:outline-none"
              />
            </label>

            <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
              <input
                type="checkbox"
                checked={formData.is_active}
                onChange={(event) => setFormData((current) => ({ ...current, is_active: event.target.checked }))}
                className="h-4 w-4 rounded border-slate-300 text-green-600 focus:ring-green-500"
              />
              <div>
                <p className="text-sm font-semibold text-slate-800">Fonte ativa</p>
                <p className="text-xs text-slate-500">Será considerada pelo job futuro, mas a produção continua exigindo aprovação manual.</p>
              </div>
            </label>
          </div>

          <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
            <input
              type="checkbox"
              checked={formData.auto_approve_enabled}
              onChange={(event) =>
                setFormData((current) => ({ ...current, auto_approve_enabled: event.target.checked }))
              }
              className="h-4 w-4 rounded border-slate-300 text-green-600 focus:ring-green-500"
            />
            <div>
              <p className="text-sm font-semibold text-slate-800">Autoaprovar e publicar</p>
              <p className="text-xs text-slate-500">
                Quando ligado, toda coleta válida desta fonte já sai do staging e entra no ticker automaticamente.
              </p>
            </div>
          </label>

          <div className="flex items-center gap-3 pt-2">
            <button
              type="submit"
              disabled={isSaving}
              className="inline-flex items-center gap-2 rounded-xl bg-green-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-60"
            >
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Salvar fonte
            </button>
            <button
              type="button"
              onClick={() => {
                setFormData(emptyForm);
                setShowForm(false);
              }}
              className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      <div className="space-y-4">
        {sources.map((source) => {
          const stagedItem = latestTempBySource[source.id];
          const historyItems = tempHistoryBySource[source.id] || [];
          const publishedQuote = publishedQuoteBySource[source.id];

          return (
            <div key={source.id} className="rounded-2xl border border-slate-200 bg-white p-6">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-lg font-black text-slate-900">{source.name}</h3>
                    <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">
                      {commodityLabels[source.commodity_target]}
                    </span>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${source.is_active ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'}`}>
                      {source.is_active ? 'Ativa' : 'Inativa'}
                    </span>
                    {source.auto_approve_enabled ? (
                      <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-700">
                        Autoaprovação ligada
                      </span>
                    ) : null}
                    {source.last_status ? (
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                        {statusLabel[source.last_status] || source.last_status}
                      </span>
                    ) : null}
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-slate-500">
                    <span>Provider: {source.provider.toUpperCase()}</span>
                    {source.cepea_indicator_id ? <span>ID indicador: {source.cepea_indicator_id}</span> : null}
                    <span>Última validação: {formatDateTime(source.last_validation_at)}</span>
                    <span>Última publicação: {formatDateTime(source.last_sync_at)}</span>
                    <span>Atualização alvo: a cada {source.refresh_interval_minutes} min</span>
                    <span>Modo: {source.auto_approve_enabled ? 'Automático' : 'Manual'}</span>
                  </div>

                  <p className="mt-2 break-all text-sm text-slate-500">
                    {source.generated_url || source.source_url}
                  </p>

                  {source.last_error ? <p className="mt-3 text-sm text-amber-700">Último aviso: {source.last_error}</p> : null}
                </div>

                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => handleValidate(source)}
                    disabled={isValidating === source.id}
                    className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                  >
                    {isValidating === source.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    Coletar e validar
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePublish(source)}
                    disabled={!stagedItem || isPublishing === source.id}
                    className="inline-flex items-center gap-2 rounded-xl bg-green-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-60"
                  >
                    {isPublishing === source.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />}
                    Aprovar e publicar
                  </button>
                  <button
                    type="button"
                    onClick={() => handleReject(source)}
                    disabled={!stagedItem || isRejecting === source.id}
                    className="inline-flex items-center gap-2 rounded-xl border border-amber-200 px-4 py-2.5 text-sm font-semibold text-amber-700 hover:bg-amber-50 disabled:opacity-60"
                  >
                    {isRejecting === source.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                    Rejeitar
                  </button>
                  <button
                    type="button"
                    onClick={() => handleEdit(source)}
                    className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(source)}
                    className="inline-flex items-center gap-2 rounded-xl border border-red-200 px-4 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-50"
                  >
                    <Trash2 className="h-4 w-4" />
                    Excluir
                  </button>
                </div>
              </div>

              <div className="mt-5 grid gap-4 lg:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.22em] text-slate-500">Validação atual</p>
                      <p className="mt-1 text-sm text-slate-600">O staging guarda o valor antes de ele virar produção.</p>
                    </div>
                    <div className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600">
                      <ShieldCheck className="h-3.5 w-3.5 text-green-600" />
                      {stagedItem?.status || 'Sem staging'}
                    </div>
                  </div>

                  {stagedItem ? (
                    <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-bold text-slate-900">{stagedItem.produto}</p>
                        {stagedItem.status === 'pending' ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700">
                            <Clock3 className="h-3.5 w-3.5" />
                            Aguardando aprovação
                          </span>
                        ) : stagedItem.status === 'approved' ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-1 text-xs font-semibold text-green-700">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Aprovado
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-700">
                            <XCircle className="h-3.5 w-3.5" />
                            Rejeitado
                          </span>
                        )}
                      </div>
                      <p className="mt-2 text-2xl font-black text-slate-900">
                        R$ {Number(stagedItem.preco || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-4 text-xs text-slate-500">
                        <span>Referência: {formatReferenceDate(stagedItem.data_referencia)}</span>
                        <span>Fonte: {stagedItem.fonte}</span>
                      </div>
                      {stagedItem.error_message ? <p className="mt-3 text-sm text-amber-700">{stagedItem.error_message}</p> : null}
                    </div>
                  ) : (
                    <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500">
                      Clique em <strong>Coletar e validar</strong> para salvar um registro em <strong>market_quotes_temp</strong>.
                    </div>
                  )}

                  <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs font-bold uppercase tracking-[0.22em] text-slate-500">Histórico de coletas</p>
                        <p className="mt-1 text-sm text-slate-500">Últimas 5 coletas registradas para esta fonte.</p>
                      </div>
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                        {historyItems.length} registro(s)
                      </span>
                    </div>

                    {historyItems.length > 0 ? (
                      <div className="mt-4 space-y-3">
                        {historyItems.map((item) => {
                          const isPublishedRecord =
                            !!publishedQuote &&
                            publishedQuote.reference_date === item.data_referencia &&
                            Number(publishedQuote.price) === Number(item.preco);

                          return (
                          <div
                            key={item.id}
                            className={`rounded-xl border px-4 py-3 ${
                              isPublishedRecord ? 'border-green-300 bg-green-50' : 'border-slate-200 bg-slate-50'
                            }`}
                          >
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <div>
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="text-sm font-semibold text-slate-900">{item.produto}</p>
                                  {isPublishedRecord ? (
                                    <span className="rounded-full bg-green-600 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-white">
                                      Publicado no ticker
                                    </span>
                                  ) : null}
                                </div>
                                <p className="mt-1 text-xs text-slate-500">
                                  Coletado em {formatDateTime(item.created_at)} • Referência {formatReferenceDate(item.data_referencia)}
                                </p>
                              </div>
                              <div className="text-right">
                                <p className="text-sm font-black text-slate-900">
                                  R$ {Number(item.preco || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </p>
                                <span
                                  className={`mt-1 inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                                    item.status === 'approved'
                                      ? 'bg-green-100 text-green-700'
                                      : item.status === 'rejected'
                                        ? 'bg-slate-200 text-slate-700'
                                        : 'bg-amber-100 text-amber-700'
                                  }`}
                                >
                                  {item.status === 'approved' ? 'Aprovado' : item.status === 'rejected' ? 'Rejeitado' : 'Pendente'}
                                </span>
                              </div>
                            </div>
                            {item.error_message ? <p className="mt-2 text-xs text-amber-700">{item.error_message}</p> : null}
                          </div>
                        )})}
                      </div>
                    ) : (
                      <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">
                        Nenhuma coleta registrada ainda para esta fonte.
                      </div>
                    )}
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs font-bold uppercase tracking-[0.22em] text-slate-500">Como este fluxo funciona</p>
                  <div className="mt-4 space-y-4">
                    <div className="flex gap-3">
                      <div className="mt-1 h-8 w-8 rounded-full bg-white flex items-center justify-center text-xs font-black text-green-700">1</div>
                      <div>
                        <p className="text-sm font-semibold text-slate-900">CEPEA usa URL estruturada</p>
                        <p className="text-sm text-slate-500">O sistema ignora URL manual e gera o widget usando o <code>id_indicador</code> oficial.</p>
                      </div>
                    </div>
                    <div className="flex gap-3">
                      <div className="mt-1 h-8 w-8 rounded-full bg-white flex items-center justify-center text-xs font-black text-green-700">2</div>
                      <div>
                        <p className="text-sm font-semibold text-slate-900">A coleta vai para market_quotes_temp</p>
                        <p className="text-sm text-slate-500">O valor entra como <strong>pending</strong> e fica pronto para revisão no admin.</p>
                      </div>
                    </div>
                    <div className="flex gap-3">
                      <div className="mt-1 h-8 w-8 rounded-full bg-white flex items-center justify-center text-xs font-black text-green-700">3</div>
                      <div>
                        <p className="text-sm font-semibold text-slate-900">A aprovação publica no market_quotes</p>
                        <p className="text-sm text-slate-500">A variação é calculada contra o valor anterior da mesma commodity e o ticker exibe o crédito da fonte.</p>
                      </div>
                    </div>
                    <div className="rounded-xl border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-500">
                      <div className="flex items-center gap-2 font-semibold text-slate-700">
                        <XCircle className="h-4 w-4" />
                        Próxima etapa
                      </div>
                      <p className="mt-2">
                        O intervalo já fica salvo. Depois a gente liga o job horário para coletar automaticamente todas as fontes CEPEA ativas.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        {sources.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center text-slate-500">
            Nenhuma fonte cadastrada ainda. Cadastre a primeira fonte CEPEA para validar soja, milho, boi ou café.
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default MarketQuotesManagement;
