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

const makeEmptyForm = (position: number): UpdatePlanData => ({
  name: '',
  description: '',
  card_eyebrow: 'Plano BWAGRO',
  price_caption: '',
  footer_caption: '',
  monthly_price: 0,
  yearly_price: 0,
  button_text: 'Escolher Plano',
  position,
  is_active: true,
  is_popular: false,
  max_ads: null,
  ad_duration_days: 30,
  lead_contact_limit_days: 30,
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
  monthly_price: plan.monthly_price,
  yearly_price: plan.yearly_price,
  button_text: plan.button_text,
  position: plan.position,
  is_active: plan.is_active,
  is_popular: plan.is_popular,
  max_ads: plan.max_ads,
  ad_duration_days: plan.ad_duration_days,
  lead_contact_limit_days: plan.lead_contact_limit_days,
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

    setSaving(true);

    try {
      if (isCreating) {
        const { data, error } = await createPlan(formData);
        if (error) {
          toast.error(error);
          return;
        }
        await logAction({
          action: ADMIN_ACTIONS.CREATE_PAGE,
          resourceType: RESOURCE_TYPES.PLAN,
          resourceId: data?.id || '',
          newValue: formData,
          reason: `Plano "${formData.name}" criado`,
        });
        toast.success('Plano criado com sucesso.');
        handleCancel();
        return;
      }

      if (editingPlan) {
        const { error } = await updatePlan(editingPlan.id, formData);
        if (error) {
          toast.error(error);
          return;
        }
        await logAction({
          action: ADMIN_ACTIONS.UPDATE_PLAN,
          resourceType: RESOURCE_TYPES.PLAN,
          resourceId: editingPlan.id,
          oldValue: mapPlanToForm(editingPlan),
          newValue: formData,
          reason: `Plano "${formData.name}" atualizado`,
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
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h3 className="mb-4 flex items-center gap-2 text-lg font-bold text-gray-900">
              <Package className="h-5 w-5 text-green-600" />
              Conteudo do Card
            </h3>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <input value={formData.name || ''} onChange={(e) => handleChange('name', e.target.value)} placeholder="Nome do plano" className="rounded-lg border border-gray-300 px-4 py-2 md:col-span-2" />
              <input value={formData.card_eyebrow || ''} onChange={(e) => handleChange('card_eyebrow', e.target.value)} placeholder="Texto superior do card" className="rounded-lg border border-gray-300 px-4 py-2 md:col-span-2" />
              <textarea value={formData.description || ''} onChange={(e) => handleChange('description', e.target.value)} placeholder="Descricao curta" rows={2} className="rounded-lg border border-gray-300 px-4 py-2 md:col-span-2" />
              <input value={formData.price_caption || ''} onChange={(e) => handleChange('price_caption', e.target.value)} placeholder="Frase da caixa de preco" className="rounded-lg border border-gray-300 px-4 py-2 md:col-span-2" />
              <input value={formData.footer_caption || ''} onChange={(e) => handleChange('footer_caption', e.target.value)} placeholder="Frase de rodape do card" className="rounded-lg border border-gray-300 px-4 py-2 md:col-span-2" />
              <input type="number" value={formData.monthly_price ?? 0} onChange={(e) => handleChange('monthly_price', parseFloat(e.target.value) || 0)} placeholder="Preco mensal" className="rounded-lg border border-gray-300 px-4 py-2" />
              <input type="number" value={formData.yearly_price ?? 0} onChange={(e) => handleChange('yearly_price', parseFloat(e.target.value) || 0)} placeholder="Preco anual" className="rounded-lg border border-gray-300 px-4 py-2" />
              <input value={formData.button_text || ''} onChange={(e) => handleChange('button_text', e.target.value)} placeholder="Texto do botao" className="rounded-lg border border-gray-300 px-4 py-2" />
              <input type="number" value={formData.position ?? 0} onChange={(e) => handleChange('position', parseInt(e.target.value, 10) || 0)} placeholder="Posicao" className="rounded-lg border border-gray-300 px-4 py-2" />
              <label className="inline-flex items-center gap-2 text-sm font-medium text-gray-700"><input type="checkbox" checked={formData.is_active ?? true} onChange={(e) => handleChange('is_active', e.target.checked)} />Plano ativo</label>
              <label className="inline-flex items-center gap-2 text-sm font-medium text-gray-700"><input type="checkbox" checked={formData.is_popular ?? false} onChange={(e) => handleChange('is_popular', e.target.checked)} />Plano popular</label>
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
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-5">
              <input type="number" value={formData.max_ads ?? ''} onChange={(e) => handleChange('max_ads', e.target.value ? parseInt(e.target.value, 10) : null)} placeholder="Max. anuncios" className="rounded-lg border border-gray-300 px-4 py-2" />
              <input type="number" value={formData.ad_duration_days ?? ''} onChange={(e) => handleChange('ad_duration_days', e.target.value ? parseInt(e.target.value, 10) : null)} placeholder="Duracao do anuncio" className="rounded-lg border border-gray-300 px-4 py-2" />
              <input type="number" value={formData.lead_contact_limit_days ?? ''} onChange={(e) => handleChange('lead_contact_limit_days', e.target.value ? parseInt(e.target.value, 10) : null)} placeholder="Dias de contato" className="rounded-lg border border-gray-300 px-4 py-2" />
              <input type="number" value={formData.category_highlights_count ?? 0} onChange={(e) => handleChange('category_highlights_count', parseInt(e.target.value, 10) || 0)} placeholder="Destaques categoria" className="rounded-lg border border-gray-300 px-4 py-2" />
              <input type="number" value={formData.home_highlight_count ?? 0} onChange={(e) => handleChange('home_highlight_count', parseInt(e.target.value, 10) || 0)} placeholder="Destaques home" className="rounded-lg border border-gray-300 px-4 py-2" />
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
                <input type="number" value={formData.category_highlights_count ?? 0} onChange={(e) => handleChange('category_highlights_count', parseInt(e.target.value, 10) || 0)} placeholder="Quantidade de destaques" className="w-full rounded-lg border border-gray-300 px-4 py-2" />
                <input type="number" value={formData.category_highlight_days ?? ''} onChange={(e) => handleChange('category_highlight_days', e.target.value ? parseInt(e.target.value, 10) : null)} placeholder="Duracao em dias" className="w-full rounded-lg border border-gray-300 px-4 py-2" />
              </div>
              <div className="space-y-3 rounded-lg bg-purple-50 p-4">
                <h4 className="font-semibold text-purple-900">Destaque na Home</h4>
                <input type="number" value={formData.home_highlight_count ?? 0} onChange={(e) => handleChange('home_highlight_count', parseInt(e.target.value, 10) || 0)} placeholder="Quantidade de destaques" className="w-full rounded-lg border border-gray-300 px-4 py-2" />
                <input type="number" value={formData.home_highlight_days ?? ''} onChange={(e) => handleChange('home_highlight_days', e.target.value ? parseInt(e.target.value, 10) : null)} placeholder="Duracao em dias" className="w-full rounded-lg border border-gray-300 px-4 py-2" />
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
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h3 className="mb-4 flex items-center gap-2 text-lg font-bold text-gray-900">
              <Bell className="h-5 w-5 text-orange-600" />
              Radar de Oportunidades
            </h3>
            <div className="space-y-4">
              <input type="number" value={formData.radar_max_alerts ?? 0} onChange={(e) => handleChange('radar_max_alerts', parseInt(e.target.value, 10) || 0)} placeholder="Maximo de alertas" className="w-full rounded-lg border border-gray-300 px-4 py-2" />
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

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {plansRaw.map((plan) => (
          <div key={plan.id} className={`rounded-xl border-2 bg-white p-6 shadow-sm ${plan.is_popular ? 'border-green-500' : 'border-gray-200'} ${!plan.is_active ? 'opacity-60' : ''}`}>
            <div className="mb-4 flex items-start justify-between">
              <div className="flex-1">
                <p className="mb-2 text-[11px] font-black uppercase tracking-[0.25em] text-slate-400">{plan.card_eyebrow || 'Plano BWAGRO'}</p>
                <div className="mb-1 flex items-center gap-2">
                  <h3 className="text-xl font-bold text-gray-900">{plan.name}</h3>
                  {plan.is_popular && <Star className="h-5 w-5 fill-yellow-500 text-yellow-500" />}
                </div>
                <p className="text-sm text-gray-600">{plan.description}</p>
              </div>
              {!plan.is_active && <div className="flex items-center gap-1 rounded bg-red-100 px-2 py-1 text-xs font-semibold text-red-700"><EyeOff className="h-3 w-3" />Inativo</div>}
            </div>

            <div className="mb-4 rounded-2xl bg-slate-950 p-4 text-white">
              <div className="text-2xl font-bold text-green-400">R$ {plan.monthly_price.toFixed(2)}/mes</div>
              <div className="mt-2 text-sm text-slate-300">{plan.price_caption || 'Sem frase de preco'}</div>
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

            <div className="mb-4 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-600">{plan.footer_caption || 'Sem rodape definido'}</div>

            <div className="mb-4 text-sm text-gray-600">
              <p>Max. anuncios: <strong className="text-gray-900">{plan.max_ads ?? 'Ilimitado'}</strong></p>
              <p>Contato lead: <strong className="text-gray-900">{plan.lead_contact_limit_days ?? 'Sob consulta'} dias</strong></p>
              <p>Radar: <strong className="text-gray-900">{plan.radar_max_alerts}</strong></p>
            </div>

            <div className="flex gap-2">
              <button onClick={() => setEditingPlan(plan)} className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-green-600 px-3 py-2 text-sm font-semibold text-white hover:bg-green-700">
                <Edit2 className="h-4 w-4" />
                Editar
              </button>
              <button onClick={() => handleDelete(plan)} className="rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700" title="Deletar plano">
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
