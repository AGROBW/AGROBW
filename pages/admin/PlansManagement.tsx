import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Bell,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  CreditCard,
  Edit2,
  Eye,
  EyeOff,
  Loader2,
  Mail,
  MapPin,
  Package,
  Plus,
  RotateCcw,
  Save,
  Search,
  Share2,
  Shield,
  Star,
  Store,
  Trash2,
  X,
} from 'lucide-react';
import { usePlans, Plan, UpdatePlanData } from '../../src/hooks/usePlans';
import { useAuth } from '../../src/contexts/AuthContext';
import { useAdminAudit, ADMIN_ACTIONS, RESOURCE_TYPES } from '../../src/hooks/useAdminAudit';
import toast from 'react-hot-toast';

const FieldShell: React.FC<{
  label: string;
  hint?: string;
  children: React.ReactNode;
}> = ({ label, hint, children }) => (
  <label className="block space-y-2">
    <span className="text-sm font-semibold text-gray-700">{label}</span>
    {children}
    {hint ? <span className="block text-xs text-gray-400">{hint}</span> : null}
  </label>
);

const ToggleSwitch: React.FC<{
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  hint?: string;
}> = ({ checked, onChange, label, hint }) => (
  <div className="flex items-center justify-between rounded-lg border border-gray-200 px-4 py-3">
    <div className="pr-4">
      <p className="text-sm font-medium text-gray-700">{label}</p>
      {hint ? <p className="mt-1 text-xs text-gray-400">{hint}</p> : null}
    </div>
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
        checked ? 'bg-green-600' : 'bg-slate-300'
      }`}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
          checked ? 'translate-x-5' : 'translate-x-0.5'
        }`}
      />
    </button>
  </div>
);

const makeEmptyForm = (position: number): UpdatePlanData => ({
  name: '',
  description: '',
  card_eyebrow: 'Plano BWAGRO',
  price_caption: '',
  footer_caption: '',
  show_footer_card: true,
  monthly_price: 0,
  yearly_price: 0,
  button_text: 'Escolher Plano',
  position,
  is_active: true,
  show_in_public_pricing: true,
  is_default_signup_plan: false,
  is_downgrade_plan: false,
  is_popular: false,
  max_ads: null,
  ad_duration_days: 30,
  expired_deletion_days: 90,
  lead_contact_limit_days: 30,
  lead_contact_limit_days_monthly: 30,
  lead_contact_limit_days_yearly: 30,
  plan_validity_days_monthly: 30,
  plan_validity_days_yearly: 365,
  category_highlights_count: 0,
  category_highlight_days: null,
  home_highlight_count: 0,
  home_highlight_days: null,
  has_verification_badge: false,
  has_seller_store: false,
  has_email_marketing: false,
  social_campaigns_per_month: null,
  radar_max_alerts: 0,
  radar_has_radius: false,
  radar_has_keywords: false,
  radar_has_price_filter: false,
  display_features: [],
  notes: '',
});

const mapPlanToForm = (plan: Plan): UpdatePlanData => ({
  name: plan.name,
  description: plan.description || '',
  card_eyebrow: plan.card_eyebrow || 'Plano BWAGRO',
  price_caption: plan.price_caption || '',
  footer_caption: plan.footer_caption || '',
  show_footer_card: plan.show_footer_card ?? true,
  monthly_price: plan.monthly_price,
  yearly_price: plan.yearly_price,
  button_text: plan.button_text,
  position: plan.position,
  is_active: plan.is_active,
  show_in_public_pricing: plan.show_in_public_pricing ?? true,
  is_default_signup_plan: plan.is_default_signup_plan ?? false,
  is_downgrade_plan: plan.is_downgrade_plan ?? false,
  is_popular: plan.is_popular,
  max_ads: plan.max_ads,
  ad_duration_days: plan.ad_duration_days,
  expired_deletion_days: plan.expired_deletion_days,
  lead_contact_limit_days: plan.lead_contact_limit_days,
  lead_contact_limit_days_monthly: plan.lead_contact_limit_days_monthly ?? plan.lead_contact_limit_days,
  lead_contact_limit_days_yearly: plan.lead_contact_limit_days_yearly ?? plan.lead_contact_limit_days,
  plan_validity_days_monthly: plan.plan_validity_days_monthly ?? 30,
  plan_validity_days_yearly: plan.plan_validity_days_yearly ?? 365,
  category_highlights_count: plan.category_highlights_count,
  category_highlight_days: plan.category_highlight_days,
  home_highlight_count: plan.home_highlight_count,
  home_highlight_days: plan.home_highlight_days,
  has_verification_badge: plan.has_verification_badge,
  has_seller_store: plan.has_seller_store,
  has_email_marketing: plan.has_email_marketing,
  social_campaigns_per_month: plan.social_campaigns_per_month,
  radar_max_alerts: plan.radar_max_alerts,
  radar_has_radius: plan.radar_has_radius,
  radar_has_keywords: plan.radar_has_keywords,
  radar_has_price_filter: plan.radar_has_price_filter,
  display_features: plan.display_features || [],
  notes: plan.notes || '',
});

const PlansManagement: React.FC = () => {
  const { plansRaw, isLoading, createPlan, updatePlan, deletePlan } = usePlans();
  const { user } = useAuth();
  const { logAction } = useAdminAudit();

  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState<UpdatePlanData>({});
  const [newFeature, setNewFeature] = useState('');

  useEffect(() => {
    if (editingPlan) {
      setFormData(mapPlanToForm(editingPlan));
    } else if (isCreating) {
      setFormData(makeEmptyForm(plansRaw.length + 1));
    } else {
      setFormData({});
    }
  }, [editingPlan, isCreating, plansRaw.length]);

  const displayFeatures = useMemo(() => formData.display_features || [], [formData.display_features]);
  const defaultSignupPlanCount = useMemo(
    () => plansRaw.filter((plan) => plan.is_default_signup_plan).length,
    [plansRaw]
  );
  const isEditingDefaultSignupPlan = Boolean(editingPlan?.is_default_signup_plan || formData.is_default_signup_plan);
  const isDefaultSignupPlanNameChanging = Boolean(
    editingPlan?.is_default_signup_plan &&
    typeof formData.name === 'string' &&
    formData.name.trim() !== '' &&
    formData.name.trim() !== editingPlan.name
  );

  const handleChange = (field: keyof UpdatePlanData, value: unknown) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleCancel = () => {
    setEditingPlan(null);
    setIsCreating(false);
    setSaving(false);
    setNewFeature('');
    setFormData({});
  };

  const addFeature = () => {
    const value = newFeature.trim();
    if (!value) return;
    if (displayFeatures.includes(value)) {
      toast.error('Essa descricao ja existe.');
      return;
    }
    handleChange('display_features', [...displayFeatures, value]);
    setNewFeature('');
  };

  const moveFeature = (index: number, direction: 'up' | 'down') => {
    const next = direction === 'up' ? index - 1 : index + 1;
    if (next < 0 || next >= displayFeatures.length) return;
    const updated = [...displayFeatures];
    [updated[index], updated[next]] = [updated[next], updated[index]];
    handleChange('display_features', updated);
  };

  const removeFeature = (index: number) => {
    handleChange(
      'display_features',
      displayFeatures.filter((_, featureIndex) => featureIndex !== index)
    );
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!user?.id) {
      toast.error('Voce precisa estar logado.');
      return;
    }

    if (!formData.name?.trim()) {
      toast.error('Informe o nome do plano.');
      return;
    }

    if (formData.is_default_signup_plan && formData.is_downgrade_plan) {
      toast.error('O mesmo plano nao pode ser o plano inicial e o plano de downgrade.');
      return;
    }

    const normalizedLeadLimit =
      formData.lead_contact_limit_days_monthly ?? formData.lead_contact_limit_days ?? null;

    const payload: UpdatePlanData = {
      ...formData,
      lead_contact_limit_days: normalizedLeadLimit,
    };

    setSaving(true);

    try {
      if (isCreating) {
        const { data, error } = await createPlan(payload);
        if (error) {
          toast.error(error);
          return;
        }
        await logAction({
          action: ADMIN_ACTIONS.CREATE_PAGE,
          resourceType: RESOURCE_TYPES.PLAN,
          resourceId: data?.id || '',
          newValue: payload,
          reason: `Plano "${payload.name}" criado`,
        });
        toast.success('Plano criado com sucesso.');
        handleCancel();
        return;
      }

      if (editingPlan) {
        const { error } = await updatePlan(editingPlan.id, payload);
        if (error) {
          toast.error(error);
          return;
        }
        await logAction({
          action: ADMIN_ACTIONS.UPDATE_PLAN,
          resourceType: RESOURCE_TYPES.PLAN,
          resourceId: editingPlan.id,
          oldValue: mapPlanToForm(editingPlan),
          newValue: payload,
          reason: `Plano "${payload.name}" atualizado`,
        });
        toast.success('Plano atualizado com sucesso.');
        handleCancel();
      }
    } catch (error) {
      console.error(error);
      toast.error('Erro inesperado ao salvar.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (plan: Plan) => {
    if (!window.confirm(`Deseja deletar o plano "${plan.name}"?`)) return;
    const { error } = await deletePlan(plan.id);
    if (error) {
      toast.error(error);
      return;
    }
    await logAction({
      action: ADMIN_ACTIONS.DELETE_PAGE,
      resourceType: RESOURCE_TYPES.PLAN,
      resourceId: plan.id,
      oldValue: mapPlanToForm(plan),
      reason: `Plano "${plan.name}" deletado`,
    });
    toast.success('Plano deletado com sucesso.');
  };

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-green-600" />
      </div>
    );
  }

  if (editingPlan || isCreating) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CreditCard className="h-6 w-6 text-green-600" />
            <h2 className="text-2xl font-bold text-gray-900">
              {isCreating ? 'Novo Plano' : `Editar: ${editingPlan?.name}`}
            </h2>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={handleCancel} className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 font-semibold text-gray-700 hover:bg-gray-50">
              <RotateCcw className="h-4 w-4" />
              Cancelar
            </button>
            <button type="button" onClick={handleSubmit} disabled={saving} className="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 font-semibold text-white hover:bg-green-700 disabled:opacity-50">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {saving ? 'Salvando...' : 'Salvar Plano'}
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {isEditingDefaultSignupPlan ? (
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
              <div className="flex items-start gap-3">
                <Shield className="mt-0.5 h-5 w-5 text-blue-600" />
                <div className="space-y-1 text-sm text-blue-900">
                  <p className="font-semibold">Plano padrao do cadastro</p>
                  <p>
                    Este plano e usado no primeiro acesso do usuario e participa da regra que impede reutilizacao apos downgrade.
                  </p>
                  {isDefaultSignupPlanNameChanging ? (
                    <p className="font-medium text-blue-800">
                      Voce esta alterando o nome do plano inicial. A regra principal usa a flag de cadastro, mas renomeacoes merecem revisao antes de salvar.
                    </p>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}

          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h3 className="mb-4 flex items-center gap-2 text-lg font-bold text-gray-900">
              <Package className="h-5 w-5 text-green-600" />
              Conteudo do Card
            </h3>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <FieldShell label="Nome do Plano">
                <input value={formData.name || ''} onChange={(e) => handleChange('name', e.target.value)} placeholder="Ex.: Essencial" className="w-full rounded-lg border border-gray-300 px-4 py-2 md:col-span-2" />
              </FieldShell>
              <FieldShell label="Texto Superior do Card" hint="Pequeno texto acima do nome, como 'Plano BWAGRO'.">
                <input value={formData.card_eyebrow || ''} onChange={(e) => handleChange('card_eyebrow', e.target.value)} placeholder="Texto superior do card" className="w-full rounded-lg border border-gray-300 px-4 py-2 md:col-span-2" />
              </FieldShell>
              <FieldShell label="Descricao Curta" hint="Texto logo abaixo do nome do plano.">
                <textarea value={formData.description || ''} onChange={(e) => handleChange('description', e.target.value)} placeholder="Descricao curta" rows={2} className="w-full rounded-lg border border-gray-300 px-4 py-2 md:col-span-2" />
              </FieldShell>
              <FieldShell label="Frase da Caixa de Preco" hint="Texto exibido dentro da faixa escura abaixo do valor.">
                <input value={formData.price_caption || ''} onChange={(e) => handleChange('price_caption', e.target.value)} placeholder="Frase da caixa de preco" className="w-full rounded-lg border border-gray-300 px-4 py-2 md:col-span-2" />
              </FieldShell>
              <FieldShell label="Frase de Rodape do Card" hint="Mensagem de apoio exibida perto do botao do card.">
                <input value={formData.footer_caption || ''} onChange={(e) => handleChange('footer_caption', e.target.value)} placeholder="Frase de rodape do card" className="w-full rounded-lg border border-gray-300 px-4 py-2 md:col-span-2" />
              </FieldShell>
              <div className="md:col-span-2">
                <ToggleSwitch
                  checked={formData.show_footer_card ?? true}
                  onChange={(checked) => handleChange('show_footer_card', checked)}
                  label="Exibir card informativo inferior"
                  hint="Ativa ou oculta o bloco de apoio exibido acima do botao do plano."
                />
              </div>
              <FieldShell label="Preco Mensal (R$)">
                <input type="number" value={formData.monthly_price ?? 0} onChange={(e) => handleChange('monthly_price', parseFloat(e.target.value) || 0)} placeholder="0,00" className="w-full rounded-lg border border-gray-300 px-4 py-2" />
              </FieldShell>
              <FieldShell label="Preco Anual (R$)">
                <input type="number" value={formData.yearly_price ?? 0} onChange={(e) => handleChange('yearly_price', parseFloat(e.target.value) || 0)} placeholder="0,00" className="w-full rounded-lg border border-gray-300 px-4 py-2" />
              </FieldShell>
              <FieldShell label="Texto do Botao">
                <input value={formData.button_text || ''} onChange={(e) => handleChange('button_text', e.target.value)} placeholder="Ex.: Assinar agora" className="w-full rounded-lg border border-gray-300 px-4 py-2" />
              </FieldShell>
              <FieldShell label="Posicao" hint="Define a ordem de exibicao na tela publica.">
                <input type="number" value={formData.position ?? 0} onChange={(e) => handleChange('position', parseInt(e.target.value, 10) || 0)} placeholder="1" className="w-full rounded-lg border border-gray-300 px-4 py-2" />
              </FieldShell>
              <div className="md:col-span-2 grid grid-cols-1 gap-3 lg:grid-cols-2">
                <ToggleSwitch
                  checked={formData.is_active ?? true}
                  onChange={(checked) => handleChange('is_active', checked)}
                  label="Plano ativo"
                  hint="Desative para retirar o plano de uso e contratação."
                />
                <ToggleSwitch
                  checked={formData.is_popular ?? false}
                  onChange={(checked) => handleChange('is_popular', checked)}
                  label="Plano popular"
                  hint="Adiciona o destaque visual de recomendação."
                />
                <ToggleSwitch
                  checked={formData.show_in_public_pricing ?? true}
                  onChange={(checked) => handleChange('show_in_public_pricing', checked)}
                  label="Exibir na página de planos"
                  hint="Desative para esconder o plano da vitrine pública e manter apenas no uso interno."
                />
                <ToggleSwitch
                  checked={formData.is_default_signup_plan ?? false}
                  onChange={(checked) => handleChange('is_default_signup_plan', checked)}
                  label="Plano padrão no cadastro"
                  hint="Todo usuário novo recebe este plano automaticamente."
                />
                <div className="lg:col-span-2">
                  <ToggleSwitch
                    checked={formData.is_downgrade_plan ?? false}
                    onChange={(checked) => {
                      handleChange('is_downgrade_plan', checked);
                      if (checked) {
                        handleChange('show_in_public_pricing', false);
                      }
                    }}
                    label="Plano de downgrade"
                    hint="Usado automaticamente quando o Start ou uma assinatura expira sem renovação."
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h3 className="mb-4 flex items-center gap-2 text-lg font-bold text-gray-900">
              <Eye className="h-5 w-5 text-green-600" />
              Descricoes do Card
            </h3>
            <div className="space-y-3">
              {displayFeatures.length === 0 ? <p className="text-sm italic text-gray-400">Nenhuma descricao cadastrada.</p> : displayFeatures.map((feature, index) => (
                <div key={`${feature}-${index}`} className="group flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  <div className="flex gap-1">
                    <button type="button" onClick={() => moveFeature(index, 'up')} disabled={index === 0} className="p-1 text-gray-400 disabled:opacity-30"><ChevronUp className="h-4 w-4" /></button>
                    <button type="button" onClick={() => moveFeature(index, 'down')} disabled={index === displayFeatures.length - 1} className="p-1 text-gray-400 disabled:opacity-30"><ChevronDown className="h-4 w-4" /></button>
                  </div>
                  <span className="flex-1 text-sm text-gray-700">{feature}</span>
                  <button type="button" onClick={() => removeFeature(index)} className="p-1 text-red-500 opacity-0 group-hover:opacity-100"><X className="h-4 w-4" /></button>
                </div>
              ))}
              <div className="flex gap-2 border-t border-gray-200 pt-3">
                <input value={newFeature} onChange={(e) => setNewFeature(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addFeature(); } }} placeholder="Ex: Ate 2 anuncios ativos" className="flex-1 rounded-lg border border-gray-300 px-4 py-2" />
                <button type="button" onClick={addFeature} className="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-white hover:bg-green-700">
                  <Plus className="h-4 w-4" />
                  Adicionar
                </button>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h3 className="mb-4 flex items-center gap-2 text-lg font-bold text-gray-900">
              <CheckCircle className="h-5 w-5 text-green-600" />
              Limites de Anuncios
            </h3>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
              <FieldShell label="Maximo de Anuncios" hint="Deixe vazio para ilimitado.">
                <input type="number" value={formData.max_ads ?? ''} onChange={(e) => handleChange('max_ads', e.target.value ? parseInt(e.target.value, 10) : null)} placeholder="Ex.: 2" className="w-full rounded-lg border border-gray-300 px-4 py-2" />
              </FieldShell>
              <FieldShell label="Duracao do Anuncio (dias)" hint="Tempo que cada anuncio fica ativo.">
                <input type="number" value={formData.ad_duration_days ?? ''} onChange={(e) => handleChange('ad_duration_days', e.target.value ? parseInt(e.target.value, 10) : null)} placeholder="Ex.: 60" className="w-full rounded-lg border border-gray-300 px-4 py-2" />
              </FieldShell>
              <FieldShell label="Exclusao apos vencimento (dias)" hint="Quantos dias o anuncio vencido fica disponivel para republicacao antes da exclusao automatica.">
                <input type="number" value={formData.expired_deletion_days ?? ''} onChange={(e) => handleChange('expired_deletion_days', e.target.value ? parseInt(e.target.value, 10) : null)} placeholder="Ex.: 90" className="w-full rounded-lg border border-gray-300 px-4 py-2" />
              </FieldShell>
              <FieldShell label="Validade do Plano - Mensal (dias)" hint="Quantidade de dias da assinatura quando o plano for comprado no ciclo mensal.">
                <input type="number" value={formData.plan_validity_days_monthly ?? ''} onChange={(e) => handleChange('plan_validity_days_monthly', e.target.value ? parseInt(e.target.value, 10) : null)} placeholder="Ex.: 30" className="w-full rounded-lg border border-gray-300 px-4 py-2" />
              </FieldShell>
              <FieldShell label="Validade do Plano - Anual (dias)" hint="Quantidade de dias da assinatura quando o plano for comprado no ciclo anual.">
                <input type="number" value={formData.plan_validity_days_yearly ?? ''} onChange={(e) => handleChange('plan_validity_days_yearly', e.target.value ? parseInt(e.target.value, 10) : null)} placeholder="Ex.: 365" className="w-full rounded-lg border border-gray-300 px-4 py-2" />
              </FieldShell>
              <FieldShell label="Contato Lead - Mensal (dias)" hint="Janela de acesso aos contatos para assinaturas mensais.">
                <input type="number" value={formData.lead_contact_limit_days_monthly ?? formData.lead_contact_limit_days ?? ''} onChange={(e) => handleChange('lead_contact_limit_days_monthly', e.target.value ? parseInt(e.target.value, 10) : null)} placeholder="Ex.: 30" className="w-full rounded-lg border border-gray-300 px-4 py-2" />
              </FieldShell>
              <FieldShell label="Contato Lead - Anual (dias)" hint="Janela de acesso aos contatos para assinaturas anuais.">
                <input type="number" value={formData.lead_contact_limit_days_yearly ?? formData.lead_contact_limit_days ?? ''} onChange={(e) => handleChange('lead_contact_limit_days_yearly', e.target.value ? parseInt(e.target.value, 10) : null)} placeholder="Ex.: 60 ou 365" className="w-full rounded-lg border border-gray-300 px-4 py-2" />
              </FieldShell>
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h3 className="mb-4 flex items-center gap-2 text-lg font-bold text-gray-900">
              <Star className="h-5 w-5 text-yellow-500" />
              Destaques
            </h3>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <div className="space-y-3 rounded-lg bg-blue-50 p-4">
                <h4 className="font-semibold text-blue-900">Destaque por Categoria</h4>
                <FieldShell label="Quantidade de Destaques">
                  <input type="number" value={formData.category_highlights_count ?? 0} onChange={(e) => handleChange('category_highlights_count', parseInt(e.target.value, 10) || 0)} placeholder="Quantidade de destaques" className="w-full rounded-lg border border-gray-300 px-4 py-2" />
                </FieldShell>
                <FieldShell label="Duracao (dias)">
                  <input type="number" value={formData.category_highlight_days ?? ''} onChange={(e) => handleChange('category_highlight_days', e.target.value ? parseInt(e.target.value, 10) : null)} placeholder="Duracao em dias" className="w-full rounded-lg border border-gray-300 px-4 py-2" />
                </FieldShell>
              </div>
              <div className="space-y-3 rounded-lg bg-purple-50 p-4">
                <h4 className="font-semibold text-purple-900">Destaque na Home</h4>
                <FieldShell label="Quantidade de Destaques">
                  <input type="number" value={formData.home_highlight_count ?? 0} onChange={(e) => handleChange('home_highlight_count', parseInt(e.target.value, 10) || 0)} placeholder="Quantidade de destaques" className="w-full rounded-lg border border-gray-300 px-4 py-2" />
                </FieldShell>
                <FieldShell label="Duracao (dias)">
                  <input type="number" value={formData.home_highlight_days ?? ''} onChange={(e) => handleChange('home_highlight_days', e.target.value ? parseInt(e.target.value, 10) : null)} placeholder="Duracao em dias" className="w-full rounded-lg border border-gray-300 px-4 py-2" />
                </FieldShell>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h3 className="mb-4 flex items-center gap-2 text-lg font-bold text-gray-900">
              <Shield className="h-5 w-5 text-green-600" />
              Recursos Adicionais
            </h3>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <label className="flex items-center gap-3 rounded-lg border border-gray-200 p-3 hover:bg-gray-50">
                <input type="checkbox" checked={formData.has_verification_badge ?? false} onChange={(e) => handleChange('has_verification_badge', e.target.checked)} />
                <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
                  <Shield className="h-4 w-4 text-blue-600" />
                  Selo de Verificacao
                </div>
              </label>
              <label className="flex items-center gap-3 rounded-lg border border-gray-200 p-3 hover:bg-gray-50">
                <input type="checkbox" checked={formData.has_seller_store ?? false} onChange={(e) => handleChange('has_seller_store', e.target.checked)} />
                <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
                  <Store className="h-4 w-4 text-purple-600" />
                  Loja do Vendedor
                </div>
              </label>
              <label className="flex items-center gap-3 rounded-lg border border-gray-200 p-3 hover:bg-gray-50">
                <input type="checkbox" checked={formData.has_email_marketing ?? false} onChange={(e) => handleChange('has_email_marketing', e.target.checked)} />
                <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
                  <Mail className="h-4 w-4 text-red-600" />
                  E-mail Marketing
                </div>
              </label>
              <div className="rounded-lg border border-gray-200 p-3">
                <label className="mb-2 flex items-center gap-2 text-sm font-medium text-gray-700">
                  <Share2 className="h-4 w-4 text-orange-600" />
                  Campanhas Sociais / Mes
                </label>
                <input type="number" value={formData.social_campaigns_per_month ?? ''} onChange={(e) => handleChange('social_campaigns_per_month', e.target.value ? parseInt(e.target.value, 10) : null)} placeholder="Quantidade mensal" className="w-full rounded-lg border border-gray-300 px-4 py-2" />
                <p className="mt-2 text-xs text-gray-400">Informe quantas campanhas sociais mensais o plano inclui.</p>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h3 className="mb-4 flex items-center gap-2 text-lg font-bold text-gray-900">
              <Bell className="h-5 w-5 text-orange-600" />
              Radar de Oportunidades
            </h3>
            <div className="space-y-4">
              <FieldShell label="Maximo de Alertas" hint="Quantidade de alertas de radar disponivel para o plano.">
                <input type="number" value={formData.radar_max_alerts ?? 0} onChange={(e) => handleChange('radar_max_alerts', parseInt(e.target.value, 10) || 0)} placeholder="Maximo de alertas" className="w-full rounded-lg border border-gray-300 px-4 py-2" />
              </FieldShell>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <label className="flex items-center gap-2 rounded-lg border border-gray-200 p-3 hover:bg-gray-50">
                  <input type="checkbox" checked={formData.radar_has_radius ?? false} onChange={(e) => handleChange('radar_has_radius', e.target.checked)} />
                  <MapPin className="h-4 w-4 text-red-600" />
                  <span className="text-sm font-medium text-gray-700">Permite Raio de Distancia</span>
                </label>
                <label className="flex items-center gap-2 rounded-lg border border-gray-200 p-3 hover:bg-gray-50">
                  <input type="checkbox" checked={formData.radar_has_keywords ?? false} onChange={(e) => handleChange('radar_has_keywords', e.target.checked)} />
                  <Search className="h-4 w-4 text-blue-600" />
                  <span className="text-sm font-medium text-gray-700">Permite Palavras-chave</span>
                </label>
                <label className="flex items-center gap-2 rounded-lg border border-gray-200 p-3 hover:bg-gray-50">
                  <input type="checkbox" checked={formData.radar_has_price_filter ?? false} onChange={(e) => handleChange('radar_has_price_filter', e.target.checked)} />
                  <AlertCircle className="h-4 w-4 text-purple-600" />
                  <span className="text-sm font-medium text-gray-700">Permite Filtro de Preco</span>
                </label>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h3 className="mb-4 text-lg font-bold text-gray-900">Observacoes Internas</h3>
            <textarea value={formData.notes || ''} onChange={(e) => handleChange('notes', e.target.value)} rows={3} placeholder="Anotacoes internas do plano" className="w-full rounded-lg border border-gray-300 px-4 py-2" />
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <CreditCard className="h-6 w-6 text-green-600" />
          <h2 className="text-2xl font-bold text-gray-900">Gestao de Planos</h2>
        </div>
        <button onClick={() => setIsCreating(true)} className="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 font-semibold text-white hover:bg-green-700">
          <Plus className="h-5 w-5" />
          Novo Plano
        </button>
      </div>

      <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="mt-0.5 h-5 w-5 text-blue-600" />
          <div className="text-sm text-blue-900">
            <p className="font-semibold">Cards da tela publica</p>
            <p>Os textos do topo, descricao, frase da caixa de preco, bullets e rodape sao editados aqui. As metricas e chips foram removidos do card.</p>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
        <div className="flex items-start gap-3">
          <Shield className="mt-0.5 h-5 w-5 text-emerald-600" />
          <div className="text-sm text-emerald-900">
            <p className="font-semibold">Seguranca do plano inicial</p>
            <p>
              Deve existir exatamente um plano marcado como <strong>Plano padrao no cadastro</strong>. Hoje o painel encontrou <strong>{defaultSignupPlanCount}</strong>.
            </p>
            <p className="mt-1">
              Renomear o plano e permitido, mas a flag de cadastro e a referencia oficial da regra de reutilizacao apos downgrade.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {plansRaw.map((plan) => (
          <div key={plan.id} className={`rounded-xl border-2 bg-white p-6 shadow-sm ${plan.is_default_signup_plan ? 'border-blue-500 shadow-blue-100' : plan.is_popular ? 'border-green-500' : 'border-gray-200'} ${!plan.is_active ? 'opacity-60' : ''}`}>
            <div className="mb-4 flex items-start justify-between">
              <div className="flex-1">
                <p className="mb-2 text-[11px] font-black uppercase tracking-[0.25em] text-slate-400">{plan.card_eyebrow || 'Plano BWAGRO'}</p>
                <div className="mb-1 flex items-center gap-2">
                  <h3 className="text-xl font-bold text-gray-900">{plan.name}</h3>
                  {plan.is_popular && <Star className="h-5 w-5 fill-yellow-500 text-yellow-500" />}
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${plan.show_footer_card !== false ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                    Card {plan.show_footer_card !== false ? 'ativo' : 'oculto'}
                  </span>
                  {plan.is_default_signup_plan && (
                    <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-800">
                      Plano inicial do cadastro
                    </span>
                  )}
                  {plan.is_downgrade_plan && (
                    <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                      Downgrade
                    </span>
                  )}
                  {plan.show_in_public_pricing === false && (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                      Oculto na vitrine
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-600">{plan.description}</p>
              </div>
              {!plan.is_active && <div className="flex items-center gap-1 rounded bg-red-100 px-2 py-1 text-xs font-semibold text-red-700"><EyeOff className="h-3 w-3" />Inativo</div>}
            </div>

            <div className="mb-4 rounded-2xl bg-slate-950 p-4 text-white">
              <div className="text-2xl font-bold text-green-400">R$ {plan.monthly_price.toFixed(2)}/mes</div>
              {plan.price_caption ? <div className="mt-2 text-sm text-slate-300">{plan.price_caption}</div> : null}
            </div>

            <div className="mb-4 space-y-2">
              {(plan.display_features || []).slice(0, 4).map((feature) => (
                <div key={feature} className="flex items-start gap-2 text-sm text-gray-700">
                  <CheckCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-green-600" />
                  <span>{feature}</span>
                </div>
              ))}
              {(plan.display_features || []).length === 0 && <p className="text-sm italic text-gray-400">Nenhuma descricao cadastrada.</p>}
            </div>

            {plan.show_footer_card && plan.footer_caption ? (
              <div className="mb-4 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-600">{plan.footer_caption}</div>
            ) : null}

            <div className="mb-4 text-sm text-gray-600">
              <p>Max. anuncios: <strong className="text-gray-900">{plan.max_ads ?? 'Ilimitado'}</strong></p>
              <p>Exclusao apos vencimento: <strong className="text-gray-900">{plan.expired_deletion_days ?? 90} dias</strong></p>
              <p>Validade mensal: <strong className="text-gray-900">{plan.plan_validity_days_monthly ?? 30} dias</strong></p>
              <p>Validade anual: <strong className="text-gray-900">{plan.plan_validity_days_yearly ?? 365} dias</strong></p>
              <p>Contato lead mensal: <strong className="text-gray-900">{plan.lead_contact_limit_days_monthly ?? plan.lead_contact_limit_days ?? 'Sob consulta'} dias</strong></p>
              <p>Contato lead anual: <strong className="text-gray-900">{plan.lead_contact_limit_days_yearly ?? plan.lead_contact_limit_days ?? 'Sob consulta'} dias</strong></p>
              <p>Radar: <strong className="text-gray-900">{plan.radar_max_alerts}</strong></p>
            </div>

            <div className="flex gap-2">
              <button onClick={() => setEditingPlan(plan)} className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-green-600 px-3 py-2 text-sm font-semibold text-white hover:bg-green-700">
                <Edit2 className="h-4 w-4" />
                Editar
              </button>
              <button
                onClick={() => handleDelete(plan)}
                disabled={plan.is_default_signup_plan && defaultSignupPlanCount <= 1}
                className="rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-red-300"
                title={plan.is_default_signup_plan && defaultSignupPlanCount <= 1 ? 'Nao e possivel excluir o unico plano padrao do cadastro' : 'Deletar plano'}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default PlansManagement;
