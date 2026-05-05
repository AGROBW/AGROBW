import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, RefreshCw, Save, Search, Shield, ToggleLeft, ToggleRight } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../../src/lib/supabaseClient';

type RuleKind =
  | 'keyword'
  | 'regex'
  | 'category'
  | 'min_description_length'
  | 'contact_info'
  | 'external_link'
  | 'require_image';
type RuleAction = 'review' | 'block';
type RuleTarget = 'title' | 'description' | 'both' | 'category' | 'images';

type PublicationRule = {
  id: string;
  name: string;
  description: string | null;
  rule_kind: RuleKind;
  action: RuleAction;
  target: RuleTarget;
  pattern: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

const emptyForm = {
  id: null as string | null,
  name: '',
  description: '',
  ruleKind: 'keyword' as RuleKind,
  action: 'review' as RuleAction,
  target: 'both' as RuleTarget,
  pattern: '',
  isActive: true,
};

const ruleKindLabels: Record<RuleKind, string> = {
  keyword: 'Palavra-chave',
  regex: 'Expressao regular',
  category: 'Categoria',
  min_description_length: 'Descricao minima',
  contact_info: 'Contato no anuncio',
  external_link: 'Link externo',
  require_image: 'Imagem obrigatoria',
};

const actionLabels: Record<RuleAction, string> = {
  review: 'Enviar para analise',
  block: 'Bloquear publicacao',
};

const targetLabels: Record<RuleTarget, string> = {
  title: 'Titulo',
  description: 'Descricao',
  both: 'Titulo e descricao',
  category: 'Categoria',
  images: 'Imagens',
};

const multiPatternRuleKinds: RuleKind[] = ['keyword', 'regex', 'category'];

const normalizePatternTokens = (value: string) =>
  value
    .split(/[\n,;]+/)
    .map((token) => token.trim())
    .filter(Boolean)
    .filter((token, index, list) => list.findIndex((item) => item.toLowerCase() === token.toLowerCase()) === index);

const joinPatternTokens = (tokens: string[]) => tokens.join('\n');

const getPatternTokensForRule = (ruleKind: RuleKind, value: string) =>
  multiPatternRuleKinds.includes(ruleKind) ? normalizePatternTokens(value) : [];

const getPatternInputLabel = (ruleKind: RuleKind) =>
  multiPatternRuleKinds.includes(ruleKind) ? 'Padroes' : 'Padrao';

const getPatternHelperText = (ruleKind: RuleKind) => {
  if (ruleKind === 'keyword') {
    return 'Cole palavras separadas por virgula, ponto e virgula ou uma por linha.';
  }

  if (ruleKind === 'regex') {
    return 'Cole uma expressao regular por linha, ou separe por virgula e ponto e virgula.';
  }

  if (ruleKind === 'category') {
    return 'Cole slugs de categoria separados por virgula, ponto e virgula ou uma por linha.';
  }

  return 'Use um unico valor para esta regra.';
};

const getPatternPlaceholder = (ruleKind: RuleKind) => {
  if (ruleKind === 'keyword') {
    return 'Ex.: arma, pistola, revolver ou um item por linha';
  }

  if (ruleKind === 'regex') {
    return 'Ex.: \\b(arma|pistola|revolver)\\b';
  }

  if (ruleKind === 'category') {
    return 'Ex.: maquinas\nanimais\ninsumos';
  }

  return 'Palavra, regex, slug da categoria ou numero minimo';
};

const renderRulePatternPreview = (rule: PublicationRule) => {
  const tokens = getPatternTokensForRule(rule.rule_kind, rule.pattern || '');

  if (tokens.length === 0) {
    return rule.pattern || null;
  }

  const visibleTokens = tokens.slice(0, 4);
  const remainingCount = tokens.length - visibleTokens.length;

  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {visibleTokens.map((token) => (
        <span
          key={token.toLowerCase()}
          className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-600"
        >
          {token}
        </span>
      ))}
      {remainingCount > 0 ? (
        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-500">
          +{remainingCount} termo{remainingCount > 1 ? 's' : ''}
        </span>
      ) : null}
    </div>
  );
};

const PublicationRulesManagement: React.FC = () => {
  const [rules, setRules] = useState<PublicationRule[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const filteredRules = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return rules;

    return rules.filter((rule) =>
      [rule.name, rule.description, rule.pattern, ruleKindLabels[rule.rule_kind], actionLabels[rule.action]]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term))
    );
  }, [rules, searchTerm]);

  const patternTokens = useMemo(
    () => getPatternTokensForRule(form.ruleKind, form.pattern),
    [form.ruleKind, form.pattern]
  );

  const loadRules = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('publication_moderation_rules')
      .select('*')
      .order('created_at', { ascending: true });

    if (error) {
      console.error('[PublicationRulesManagement] Erro ao carregar regras:', error);
      toast.error('Erro ao carregar regras de publicacao.');
      setRules([]);
    } else {
      setRules((data || []) as PublicationRule[]);
    }

    setLoading(false);
  };

  useEffect(() => {
    void loadRules();
  }, []);

  const resetForm = () => setForm(emptyForm);

  const editRule = (rule: PublicationRule) => {
    setForm({
      id: rule.id,
      name: rule.name,
      description: rule.description || '',
      ruleKind: rule.rule_kind,
      action: rule.action,
      target: rule.target,
      pattern: rule.pattern || '',
      isActive: rule.is_active,
    });
  };

  const saveRule = async () => {
    if (!form.name.trim()) {
      toast.error('Informe o nome da regra.');
      return;
    }

    const normalizedPattern = multiPatternRuleKinds.includes(form.ruleKind)
      ? joinPatternTokens(patternTokens)
      : form.pattern.trim();

    if (['keyword', 'regex', 'category', 'min_description_length'].includes(form.ruleKind) && !normalizedPattern) {
      toast.error('Informe o padrao da regra.');
      return;
    }

    setSaving(true);

    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      rule_kind: form.ruleKind,
      action: form.action,
      target: form.target,
      pattern: normalizedPattern || null,
      is_active: form.isActive,
    };

    const result = form.id
      ? await supabase.from('publication_moderation_rules').update(payload).eq('id', form.id).select('id').single()
      : await supabase.from('publication_moderation_rules').insert(payload).select('id').single();

    setSaving(false);

    if (result.error) {
      console.error('[PublicationRulesManagement] Erro ao salvar regra:', result.error);
      toast.error('Erro ao salvar regra.', { description: result.error.message });
      return;
    }

    toast.success(form.id ? 'Regra atualizada.' : 'Regra criada.');
    resetForm();
    await loadRules();
  };

  const toggleRule = async (rule: PublicationRule) => {
    const { error } = await supabase
      .from('publication_moderation_rules')
      .update({ is_active: !rule.is_active })
      .eq('id', rule.id);

    if (error) {
      toast.error('Erro ao alterar status da regra.', { description: error.message });
      return;
    }

    await loadRules();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1 text-xs font-black uppercase tracking-[0.22em] text-emerald-700">
            <Shield className="h-4 w-4" />
            Seguranca de publicacao
          </span>
          <h1 className="mt-3 text-3xl font-black text-slate-900">Regras de publicacao</h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-500">
            Configure regras que enviam anuncios suspeitos para analise ou bloqueiam publicacoes de alto risco.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void loadRules()}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-green-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-green-700"
        >
          <RefreshCw className="h-4 w-4" />
          Atualizar
        </button>
      </div>

      <div className="grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-5 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-black text-slate-900">{form.id ? 'Editar regra' : 'Nova regra'}</h2>
              <p className="text-sm text-slate-500">Prefira enviar para analise quando houver risco de falso positivo.</p>
            </div>
            <button
              type="button"
              onClick={resetForm}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
            >
              Limpar
            </button>
          </div>

          <div className="space-y-4">
            <label className="block">
              <span className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500">Nome</span>
              <input
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:ring-2 focus:ring-green-500"
                placeholder="Ex.: Link externo"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500">Descricao/motivo</span>
              <textarea
                value={form.description}
                onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                className="min-h-[76px] w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-green-500"
                placeholder="Mensagem interna exibida na fila de moderacao."
              />
            </label>

            <div className="grid gap-3 md:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500">Tipo</span>
                <select
                  value={form.ruleKind}
                  onChange={(event) => setForm((current) => ({ ...current, ruleKind: event.target.value as RuleKind }))}
                  className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:ring-2 focus:ring-green-500"
                >
                  {Object.entries(ruleKindLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500">Acao</span>
                <select
                  value={form.action}
                  onChange={(event) => setForm((current) => ({ ...current, action: event.target.value as RuleAction }))}
                  className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:ring-2 focus:ring-green-500"
                >
                  {Object.entries(actionLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500">Alvo</span>
                <select
                  value={form.target}
                  onChange={(event) => setForm((current) => ({ ...current, target: event.target.value as RuleTarget }))}
                  className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:ring-2 focus:ring-green-500"
                >
                  {Object.entries(targetLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500">Status</span>
                <select
                  value={form.isActive ? 'active' : 'inactive'}
                  onChange={(event) => setForm((current) => ({ ...current, isActive: event.target.value === 'active' }))}
                  className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:ring-2 focus:ring-green-500"
                >
                  <option value="active">Ativa</option>
                  <option value="inactive">Inativa</option>
                </select>
              </label>
            </div>

            <label className="block">
              <span className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500">
                {getPatternInputLabel(form.ruleKind)}
              </span>
              {multiPatternRuleKinds.includes(form.ruleKind) ? (
                <>
                  <textarea
                    value={form.pattern}
                    onChange={(event) => setForm((current) => ({ ...current, pattern: event.target.value }))}
                    className="min-h-[96px] w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-green-500"
                    placeholder={getPatternPlaceholder(form.ruleKind)}
                  />
                  <p className="mt-1 text-xs text-slate-500">{getPatternHelperText(form.ruleKind)}</p>
                  {patternTokens.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {patternTokens.map((token) => (
                        <span
                          key={token.toLowerCase()}
                          className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700"
                        >
                          {token}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </>
              ) : (
                <>
                  <input
                    value={form.pattern}
                    onChange={(event) => setForm((current) => ({ ...current, pattern: event.target.value }))}
                    className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:ring-2 focus:ring-green-500"
                    placeholder={getPatternPlaceholder(form.ruleKind)}
                  />
                  <p className="mt-1 text-xs text-slate-500">{getPatternHelperText(form.ruleKind)}</p>
                </>
              )}
            </label>

            <button
              type="button"
              onClick={() => void saveRule()}
              disabled={saving}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-green-600 px-4 py-3 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-60"
            >
              <Save className="h-4 w-4" />
              {saving ? 'Salvando...' : 'Salvar regra'}
            </button>
          </div>
        </section>

        <section className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Buscar regra..."
                className="h-11 w-full rounded-xl border border-slate-200 pl-10 pr-3 text-sm outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-5 py-4">
              <h2 className="text-lg font-black text-slate-900">Regras cadastradas</h2>
            </div>

            <div className="divide-y divide-slate-100">
              {loading ? (
                <div className="px-5 py-12 text-center text-sm text-slate-500">Carregando...</div>
              ) : filteredRules.length === 0 ? (
                <div className="px-5 py-12 text-center text-sm text-slate-500">Nenhuma regra encontrada.</div>
              ) : (
                filteredRules.map((rule) => (
                  <div key={rule.id} className="flex flex-col gap-4 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-black text-slate-900">{rule.name}</p>
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                            rule.action === 'block' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                          }`}
                        >
                          {actionLabels[rule.action]}
                        </span>
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">
                          {rule.is_active ? 'Ativa' : 'Inativa'}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-slate-500">{rule.description || 'Sem descricao.'}</p>
                      <p className="mt-2 text-xs text-slate-400">
                        {ruleKindLabels[rule.rule_kind]} | {targetLabels[rule.target]}
                      </p>
                      {renderRulePatternPreview(rule)}
                    </div>

                    <div className="flex items-center gap-2">
                      {rule.action === 'block' ? <AlertTriangle className="h-4 w-4 text-red-500" /> : null}
                      <button
                        type="button"
                        onClick={() => editRule(rule)}
                        className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => void toggleRule(rule)}
                        className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"
                        title={rule.is_active ? 'Desativar' : 'Ativar'}
                      >
                        {rule.is_active ? <ToggleRight className="h-5 w-5 text-green-600" /> : <ToggleLeft className="h-5 w-5" />}
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

export default PublicationRulesManagement;
