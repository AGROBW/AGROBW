import React, { useState, useEffect } from 'react';
import { 
  CreditCard, Save, RotateCcw, AlertCircle, Loader2, Plus, X, Edit2, Trash2, 
  Eye, EyeOff, ChevronUp, ChevronDown, DollarSign, TrendingUp, Star, Package,
  Bell, MapPin, Search, Filter, CheckCircle, Shield, Store, Mail, Share2
} from 'lucide-react';
import { usePlans, Plan, UpdatePlanData } from '../../src/hooks/usePlans';
import { useAuth } from '../../src/contexts/AuthContext';
import { useAdminAudit, ADMIN_ACTIONS, RESOURCE_TYPES } from '../../src/hooks/useAdminAudit';
import toast from 'react-hot-toast';

const PlansManagement: React.FC = () => {
  const { plansRaw, isLoading, createPlan, updatePlan, deletePlan } = usePlans();
  const { user } = useAuth();
  const { logAction } = useAdminAudit();

  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState<UpdatePlanData>({});
  const [newFeature, setNewFeature] = useState('');

  // Reset form quando muda o plano editado
  useEffect(() => {
    if (editingPlan) {
      setFormData({
        name: editingPlan.name,
        description: editingPlan.description || '',
        monthly_price: editingPlan.monthly_price,
        yearly_price: editingPlan.yearly_price,
        button_text: editingPlan.button_text,
        position: editingPlan.position,
        is_active: editingPlan.is_active,
        max_ads: editingPlan.max_ads,
        ad_duration_days: editingPlan.ad_duration_days,
        lead_contact_limit_days: editingPlan.lead_contact_limit_days,
        category_highlights_count: editingPlan.category_highlights_count,
        category_highlight_days: editingPlan.category_highlight_days,
        home_highlight_count: editingPlan.home_highlight_count,
        home_highlight_days: editingPlan.home_highlight_days,
        has_verification_badge: editingPlan.has_verification_badge,
        has_seller_store: editingPlan.has_seller_store,
        has_email_marketing: editingPlan.has_email_marketing,
        social_campaigns_per_month: editingPlan.social_campaigns_per_month,
        radar_max_alerts: editingPlan.radar_max_alerts,
        radar_has_radius: editingPlan.radar_has_radius,
        radar_has_keywords: editingPlan.radar_has_keywords,
        radar_has_price_filter: editingPlan.radar_has_price_filter,
        display_features: editingPlan.display_features || [],
        notes: editingPlan.notes || '',
        is_popular: editingPlan.is_popular,
      });
    } else if (isCreating) {
      // Valores padrão para novo plano
      setFormData({
        name: '',
        description: '',
        monthly_price: 0,
        yearly_price: 0,
        button_text: 'Escolher Plano',
        position: plansRaw.length + 1,
        is_active: true,
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
        is_popular: false,
      });
    }
  }, [editingPlan, isCreating, plansRaw.length]);

  const handleChange = (field: keyof UpdatePlanData, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user?.id) {
      toast.error('Você precisa estar logado');
      return;
    }

    // Validações
    if (!formData.name || formData.name.trim() === '') {
      toast.error('Nome do plano é obrigatório');
      return;
    }

    if (formData.monthly_price === undefined || formData.monthly_price < 0) {
      toast.error('Preço mensal inválido');
      return;
    }

    setSaving(true);

    try {
      if (isCreating) {
        // Criar novo plano
        const { error, data } = await createPlan(formData);

        if (error) {
          toast.error(`Erro ao criar plano: ${error}`);
          return;
        }

        // Log de auditoria
        await logAction({
          action: ADMIN_ACTIONS.CREATE_PAGE,
          resourceType: RESOURCE_TYPES.PLAN,
          resourceId: data?.id || '',
          newValue: formData,
          reason: `Plano "${formData.name}" criado`,
        });

        toast.success(`Plano "${formData.name}" criado com sucesso!`);
        setIsCreating(false);
      } else if (editingPlan) {
        // Atualizar plano existente
        const oldData = {
          monthly_price: editingPlan.monthly_price,
          yearly_price: editingPlan.yearly_price,
          max_ads: editingPlan.max_ads,
          is_active: editingPlan.is_active,
        };

        const { error } = await updatePlan(editingPlan.id, formData);

        if (error) {
          toast.error(`Erro ao salvar: ${error}`);
          return;
        }

        // Log de auditoria
        await logAction({
          action: ADMIN_ACTIONS.UPDATE_PLAN,
          resourceType: RESOURCE_TYPES.PLAN,
          resourceId: editingPlan.id,
          oldValue: oldData,
          newValue: {
            monthly_price: formData.monthly_price,
            yearly_price: formData.yearly_price,
            max_ads: formData.max_ads,
            is_active: formData.is_active,
          },
          reason: `Plano "${formData.name}" atualizado`,
        });

        toast.success(`Plano "${formData.name}" atualizado com sucesso!`);
        setEditingPlan(null);
      }
    } catch (err) {
      console.error('Erro ao salvar plano:', err);
      toast.error('Erro inesperado ao salvar');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (plan: Plan) => {
    if (!confirm(`Tem certeza que deseja deletar o plano "${plan.name}"?\n\nEsta ação não pode ser desfeita!`)) {
      return;
    }

    try {
      const { error } = await deletePlan(plan.id);

      if (error) {
        toast.error(`Erro ao deletar plano: ${error}`);
        return;
      }

      // Log de auditoria
      await logAction({
        action: ADMIN_ACTIONS.DELETE_PAGE,
        resourceType: RESOURCE_TYPES.PLAN,
        resourceId: plan.id,
        oldValue: { name: plan.name },
        reason: `Plano "${plan.name}" deletado`,
      });

      toast.success(`Plano "${plan.name}" deletado com sucesso!`);
      
      if (editingPlan?.id === plan.id) {
        setEditingPlan(null);
      }
    } catch (err) {
      console.error('Erro ao deletar plano:', err);
      toast.error('Erro inesperado ao deletar');
    }
  };

  const handleCancel = () => {
    setEditingPlan(null);
    setIsCreating(false);
    setFormData({});
  };

  // Funções para gerenciar display_features
  const getDisplayFeatures = (): string[] => {
    return formData.display_features || [];
  };

  const addDisplayFeature = () => {
    if (!newFeature.trim()) {
      toast.error('Digite um recurso válido');
      return;
    }

    const currentFeatures = getDisplayFeatures();
    if (currentFeatures.includes(newFeature.trim())) {
      toast.error('Este recurso já existe');
      return;
    }

    handleChange('display_features', [...currentFeatures, newFeature.trim()]);
    setNewFeature('');
    toast.success('Recurso adicionado');
  };

  const removeDisplayFeature = (index: number) => {
    const currentFeatures = getDisplayFeatures();
    handleChange('display_features', currentFeatures.filter((_, i) => i !== index));
    toast.success('Recurso removido');
  };

  const moveFeature = (index: number, direction: 'up' | 'down') => {
    const currentFeatures = [...getDisplayFeatures()];
    const newIndex = direction === 'up' ? index - 1 : index + 1;

    if (newIndex < 0 || newIndex >= currentFeatures.length) return;

    [currentFeatures[index], currentFeatures[newIndex]] = [currentFeatures[newIndex], currentFeatures[index]];
    handleChange('display_features', currentFeatures);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-green-600 animate-spin" />
      </div>
    );
  }

  // Modo de edição/criação
  if (editingPlan || isCreating) {
    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CreditCard className="w-6 h-6 text-green-600" />
            <h2 className="text-2xl font-bold text-gray-900">
              {isCreating ? 'Novo Plano' : `Editar: ${editingPlan?.name}`}
            </h2>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleCancel}
              className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors font-semibold flex items-center gap-2"
            >
              <RotateCcw className="w-4 h-4" />
              Cancelar
            </button>
            <button
              onClick={handleSubmit}
              disabled={saving}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-semibold flex items-center gap-2 disabled:opacity-50"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Salvando...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Salvar Plano
                </>
              )}
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Seção: Informações Básicas */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
              <Package className="w-5 h-5 text-green-600" />
              Informações Básicas
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Nome do Plano *
                </label>
                <input
                  type="text"
                  value={formData.name || ''}
                  onChange={(e) => handleChange('name', e.target.value)}
                  placeholder="Ex: Premium"
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Descrição
                </label>
                <textarea
                  value={formData.description || ''}
                  onChange={(e) => handleChange('description', e.target.value)}
                  rows={2}
                  placeholder="Descrição curta do plano"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent resize-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Preço Mensal (R$) *
                </label>
                <input
                  type="number"
                  value={formData.monthly_price ?? 0}
                  onChange={(e) => handleChange('monthly_price', parseFloat(e.target.value) || 0)}
                  min="0"
                  step="0.01"
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Preço Anual (R$)
                </label>
                <input
                  type="number"
                  value={formData.yearly_price ?? 0}
                  onChange={(e) => handleChange('yearly_price', parseFloat(e.target.value) || 0)}
                  min="0"
                  step="0.01"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Texto do Botão
                </label>
                <input
                  type="text"
                  value={formData.button_text || ''}
                  onChange={(e) => handleChange('button_text', e.target.value)}
                  placeholder="Escolher Plano"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Posição (ordem)
                </label>
                <input
                  type="number"
                  value={formData.position ?? 0}
                  onChange={(e) => handleChange('position', parseInt(e.target.value) || 0)}
                  min="0"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
              </div>

              <div className="flex items-center gap-4">
                <label className="inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.is_active ?? true}
                    onChange={(e) => handleChange('is_active', e.target.checked)}
                    className="w-4 h-4 text-green-600 rounded focus:ring-green-500"
                  />
                  <span className="ml-2 text-sm font-medium text-gray-700">Plano Ativo</span>
                </label>

                <label className="inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.is_popular ?? false}
                    onChange={(e) => handleChange('is_popular', e.target.checked)}
                    className="w-4 h-4 text-green-600 rounded focus:ring-green-500"
                  />
                  <span className="ml-2 text-sm font-medium text-gray-700 flex items-center gap-1">
                    <Star className="w-4 h-4 text-yellow-500" />
                    Marcar como Popular
                  </span>
                </label>
              </div>
            </div>
          </div>

          {/* Seção: Limites de Anúncios */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-green-600" />
              Limites de Anúncios
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Máximo de Anúncios
                </label>
                <input
                  type="number"
                  value={formData.max_ads ?? ''}
                  onChange={(e) => handleChange('max_ads', e.target.value ? parseInt(e.target.value) : null)}
                  min="0"
                  placeholder="Ilimitado"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
                <p className="text-xs text-gray-500 mt-1">Deixe vazio para ilimitado</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Duração do Anúncio (dias)
                </label>
                <input
                  type="number"
                  value={formData.ad_duration_days ?? ''}
                  onChange={(e) => handleChange('ad_duration_days', e.target.value ? parseInt(e.target.value) : null)}
                  min="1"
                  placeholder="30"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Limite Contato Lead (dias)
                </label>
                <input
                  type="number"
                  value={formData.lead_contact_limit_days ?? ''}
                  onChange={(e) => handleChange('lead_contact_limit_days', e.target.value ? parseInt(e.target.value) : null)}
                  min="1"
                  placeholder="30"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
              </div>
            </div>
          </div>

          {/* Seção: Destaques */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
              <Star className="w-5 h-5 text-yellow-500" />
              Destaques (Categoria e Home)
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Categoria */}
              <div className="space-y-3 p-4 bg-blue-50 rounded-lg">
                <h4 className="font-semibold text-sm text-blue-900">Destaque por Categoria</h4>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Quantidade de Destaques
                  </label>
                  <input
                    type="number"
                    value={formData.category_highlights_count ?? 0}
                    onChange={(e) => handleChange('category_highlights_count', parseInt(e.target.value) || 0)}
                    min="0"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Duração (dias)
                  </label>
                  <input
                    type="number"
                    value={formData.category_highlight_days ?? ''}
                    onChange={(e) => handleChange('category_highlight_days', e.target.value ? parseInt(e.target.value) : null)}
                    min="1"
                    placeholder="7"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  />
                </div>
              </div>

              {/* Home */}
              <div className="space-y-3 p-4 bg-purple-50 rounded-lg">
                <h4 className="font-semibold text-sm text-purple-900">Destaque na Home</h4>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Quantidade de Destaques
                  </label>
                  <input
                    type="number"
                    value={formData.home_highlight_count ?? 0}
                    onChange={(e) => handleChange('home_highlight_count', parseInt(e.target.value) || 0)}
                    min="0"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Duração (dias)
                  </label>
                  <input
                    type="number"
                    value={formData.home_highlight_days ?? ''}
                    onChange={(e) => handleChange('home_highlight_days', e.target.value ? parseInt(e.target.value) : null)}
                    min="1"
                    placeholder="7"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Seção: Recursos Adicionais */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-600" />
              Recursos Adicionais
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.has_verification_badge ?? false}
                  onChange={(e) => handleChange('has_verification_badge', e.target.checked)}
                  className="w-5 h-5 text-green-600 rounded focus:ring-green-500"
                />
                <div className="flex items-center gap-2 flex-1">
                  <Shield className="w-5 h-5 text-blue-600" />
                  <span className="font-medium text-sm">Selo de Verificação</span>
                </div>
              </label>

              <label className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.has_seller_store ?? false}
                  onChange={(e) => handleChange('has_seller_store', e.target.checked)}
                  className="w-5 h-5 text-green-600 rounded focus:ring-green-500"
                />
                <div className="flex items-center gap-2 flex-1">
                  <Store className="w-5 h-5 text-purple-600" />
                  <span className="font-medium text-sm">Loja do Vendedor</span>
                </div>
              </label>

              <label className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.has_email_marketing ?? false}
                  onChange={(e) => handleChange('has_email_marketing', e.target.checked)}
                  className="w-5 h-5 text-green-600 rounded focus:ring-green-500"
                />
                <div className="flex items-center gap-2 flex-1">
                  <Mail className="w-5 h-5 text-red-600" />
                  <span className="font-medium text-sm">E-mail Marketing</span>
                </div>
              </label>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                  <Share2 className="w-4 h-4 text-orange-600" />
                  Campanhas Sociais/Mês
                </label>
                <input
                  type="number"
                  value={formData.social_campaigns_per_month ?? ''}
                  onChange={(e) => handleChange('social_campaigns_per_month', e.target.value ? parseInt(e.target.value) : null)}
                  min="0"
                  placeholder="0"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
              </div>
            </div>
          </div>

          {/* Seção: Radar de Oportunidades */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
              <Bell className="w-5 h-5 text-orange-600" />
              Radar de Oportunidades
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Máximo de Alertas
                </label>
                <input
                  type="number"
                  value={formData.radar_max_alerts ?? 0}
                  onChange={(e) => handleChange('radar_max_alerts', parseInt(e.target.value) || 0)}
                  min="0"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
              </div>

              <div className="md:col-span-2 space-y-2">
                <label className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.radar_has_radius ?? false}
                    onChange={(e) => handleChange('radar_has_radius', e.target.checked)}
                    className="w-5 h-5 text-green-600 rounded focus:ring-green-500"
                  />
                  <div className="flex items-center gap-2">
                    <MapPin className="w-5 h-5 text-red-600" />
                    <span className="font-medium text-sm">Permite Raio de Distância</span>
                  </div>
                </label>

                <label className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.radar_has_keywords ?? false}
                    onChange={(e) => handleChange('radar_has_keywords', e.target.checked)}
                    className="w-5 h-5 text-green-600 rounded focus:ring-green-500"
                  />
                  <div className="flex items-center gap-2">
                    <Search className="w-5 h-5 text-blue-600" />
                    <span className="font-medium text-sm">Permite Palavras-chave</span>
                  </div>
                </label>

                <label className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.radar_has_price_filter ?? false}
                    onChange={(e) => handleChange('radar_has_price_filter', e.target.checked)}
                    className="w-5 h-5 text-green-600 rounded focus:ring-green-500"
                  />
                  <div className="flex items-center gap-2">
                    <Filter className="w-5 h-5 text-purple-600" />
                    <span className="font-medium text-sm">Permite Filtro de Preço</span>
                  </div>
                </label>
              </div>
            </div>
          </div>

          {/* Seção: Recursos para Exibição (display_features) */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
              <Eye className="w-5 h-5 text-green-600" />
              Recursos para Exibição (Frontend)
            </h3>

            <div className="space-y-4">
              {/* Lista de features */}
              {getDisplayFeatures().length === 0 ? (
                <p className="text-sm text-gray-400 italic py-3">Nenhum recurso cadastrado</p>
              ) : (
                <div className="space-y-2">
                  {getDisplayFeatures().map((feature, index) => (
                    <div
                      key={index}
                      className="flex items-center gap-2 bg-slate-50 px-3 py-2 rounded-lg border border-slate-200 group"
                    >
                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={() => moveFeature(index, 'up')}
                          disabled={index === 0}
                          className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30"
                          title="Mover para cima"
                        >
                          <ChevronUp className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => moveFeature(index, 'down')}
                          disabled={index === getDisplayFeatures().length - 1}
                          className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30"
                          title="Mover para baixo"
                        >
                          <ChevronDown className="w-4 h-4" />
                        </button>
                      </div>
                      <span className="flex-1 text-sm text-gray-700">{feature}</span>
                      <button
                        type="button"
                        onClick={() => removeDisplayFeature(index)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity text-red-500 hover:text-red-700 p-1"
                        title="Remover"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Input para adicionar */}
              <div className="pt-3 border-t border-gray-200">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Adicionar Novo Recurso
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newFeature}
                    onChange={(e) => setNewFeature(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addDisplayFeature())}
                    placeholder="Ex: Publicação permanente"
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  />
                  <button
                    type="button"
                    onClick={addDisplayFeature}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2"
                  >
                    <Plus className="w-4 h-4" />
                    Adicionar
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Seção: Observações */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4">
              📝 Observações Internas
            </h3>

            <textarea
              value={formData.notes || ''}
              onChange={(e) => handleChange('notes', e.target.value)}
              rows={3}
              placeholder="Observações internas sobre o plano (não visível para usuários)"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent resize-none"
            />
          </div>
        </form>
      </div>
    );
  }

  // Modo de listagem
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <CreditCard className="w-6 h-6 text-green-600" />
          <h2 className="text-2xl font-bold text-gray-900">Gestão de Planos</h2>
        </div>
        <button
          onClick={() => setIsCreating(true)}
          className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-semibold flex items-center gap-2"
        >
          <Plus className="w-5 h-5" />
          Novo Plano
        </button>
      </div>

      {/* Info */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-blue-900">
            <p className="font-semibold mb-1">Gestão de Planos e Limites</p>
            <p>Os limites definidos aqui (max_ads, radar_max_alerts, etc) são aplicados automaticamente no sistema. Alterações em preços e limites são registradas no log de auditoria.</p>
          </div>
        </div>
      </div>

      {/* Lista de Planos */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {plansRaw.map((plan) => (
          <div
            key={plan.id}
            className={`bg-white rounded-xl shadow-sm border-2 p-6 transition-all hover:shadow-md ${
              plan.is_popular ? 'border-green-500' : 'border-gray-200'
            } ${!plan.is_active ? 'opacity-60' : ''}`}
          >
            {/* Header do Card */}
            <div className="flex items-start justify-between mb-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="text-xl font-bold text-gray-900">{plan.name}</h3>
                  {plan.is_popular && (
                    <Star className="w-5 h-5 text-yellow-500 fill-yellow-500" />
                  )}
                </div>
                <p className="text-sm text-gray-600">{plan.description}</p>
              </div>
              
              {!plan.is_active && (
                <div className="flex items-center gap-1 px-2 py-1 bg-red-100 text-red-700 rounded text-xs font-semibold">
                  <EyeOff className="w-3 h-3" />
                  Inativo
                </div>
              )}
            </div>

            {/* Preço */}
            <div className="mb-4 py-3 border-y border-gray-200">
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold text-green-600">
                  R$ {plan.monthly_price.toFixed(2)}
                </span>
                <span className="text-sm text-gray-600">/mês</span>
              </div>
              {plan.yearly_price > 0 && (
                <div className="text-sm text-gray-600 mt-1">
                  ou R$ {plan.yearly_price.toFixed(2)}/ano
                </div>
              )}
            </div>

            {/* Limites principais */}
            <div className="space-y-2 mb-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">Máx. Anúncios:</span>
                <span className="font-semibold text-gray-900">
                  {plan.max_ads ?? 'Ilimitado'}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">Duração:</span>
                <span className="font-semibold text-gray-900">
                  {plan.ad_duration_days ?? '∞'} dias
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">Alertas Radar:</span>
                <span className="font-semibold text-gray-900">
                  {plan.radar_max_alerts}
                </span>
              </div>
            </div>

            {/* Badges de recursos */}
            <div className="flex flex-wrap gap-2 mb-4">
              {plan.has_verification_badge && (
                <div className="flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-700 rounded-full text-xs">
                  <Shield className="w-3 h-3" />
                  Selo
                </div>
              )}
              {plan.has_seller_store && (
                <div className="flex items-center gap-1 px-2 py-1 bg-purple-100 text-purple-700 rounded-full text-xs">
                  <Store className="w-3 h-3" />
                  Loja
                </div>
              )}
              {plan.has_email_marketing && (
                <div className="flex items-center gap-1 px-2 py-1 bg-red-100 text-red-700 rounded-full text-xs">
                  <Mail className="w-3 h-3" />
                  Email
                </div>
              )}
            </div>

            {/* Ações */}
            <div className="flex gap-2">
              <button
                onClick={() => setEditingPlan(plan)}
                className="flex-1 px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-semibold flex items-center justify-center gap-2"
              >
                <Edit2 className="w-4 h-4" />
                Editar
              </button>
              <button
                onClick={() => handleDelete(plan)}
                className="px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-semibold"
                title="Deletar plano"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>

            {/* Posição */}
            <div className="mt-3 pt-3 border-t border-gray-200 text-xs text-gray-500 text-center">
              Posição: {plan.position}
            </div>
          </div>
        ))}
      </div>

      {plansRaw.length === 0 && (
        <div className="text-center py-12 bg-gray-50 rounded-xl border-2 border-dashed border-gray-300">
          <Package className="w-12 h-12 text-gray-400 mx-auto mb-3" />
          <p className="text-gray-600 font-medium">Nenhum plano cadastrado</p>
          <p className="text-sm text-gray-500 mt-1">Clique em "Novo Plano" para começar</p>
        </div>
      )}
    </div>
  );
};

export default PlansManagement;
