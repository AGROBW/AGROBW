// =====================================================
// RADAR DE OPORTUNIDADES - COMPONENTE PRINCIPAL
// =====================================================
// Interface completa para gerenciar alertas e visualizar matches
// =====================================================

import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { 
  Radar, 
  Plus, 
  Edit3, 
  Trash2, 
  PauseCircle, 
  PlayCircle,
  Bell,
  Eye,
  X,
  MapPin,
  DollarSign,
  Tag,
  Filter,
  TrendingUp,
  AlertCircle,
  Sparkles,
  Crown
} from 'lucide-react';
import { useRadar, OpportunityAlert, OpportunityMatch } from '../src/hooks/useRadar';
import { useAuth } from '../src/contexts/AuthContext';
import { useSubscription } from '../src/hooks/useSubscription';
import { usePlans } from '../src/hooks/usePlans';
import RecommendedUpgradeModal from './finance/RecommendedUpgradeModal';
import toast from 'react-hot-toast';

const RadarView: React.FC = () => {
  const { user } = useAuth();
  const { subscription } = useSubscription();
  const { plansRaw } = usePlans();
  const {
    alerts,
    matches,
    stats,
    planLimits,
    locationStatus,
    isLoading,
    createAlert,
    updateAlert,
    deleteAlert,
    toggleAlertStatus,
    markMatchAsViewed,
    dismissMatch
  } = useRadar();

  const [activeTab, setActiveTab] = useState<'config' | 'opportunities'>('opportunities');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [selectedAlert, setSelectedAlert] = useState<OpportunityAlert | null>(null);
  const [categories, setCategories] = useState<any[]>([]);
  const [badgeAnimation, setBadgeAnimation] = useState(false);
  const [prevUnviewedCount, setPrevUnviewedCount] = useState(0);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  const activePlans = useMemo(
    () => (plansRaw || []).filter((plan) => plan.is_active).sort((a, b) => a.position - b.position),
    [plansRaw]
  );
  const currentPlanRecord = useMemo(() => {
    if (!subscription?.plan_id) return null;
    return activePlans.find((plan) => plan.id === subscription.plan_id) || null;
  }, [activePlans, subscription?.plan_id]);
  const nextRecommendedPlan = useMemo(() => {
    if (!currentPlanRecord) return null;
    return activePlans.find((plan) => plan.position > currentPlanRecord.position) || null;
  }, [activePlans, currentPlanRecord]);
  const userPlan = currentPlanRecord?.name || subscription?.plans?.name || user?.plan || 'Plano';
  const radiusAlertsCount = useMemo(
    () => alerts.filter((alert) => alert.status === 'ativo' && Number(alert.radius_km) > 0).length,
    [alerts]
  );

  // Detectar novos matches e animar badge
  useEffect(() => {
    if (stats && stats.unviewed_matches > prevUnviewedCount && prevUnviewedCount > 0) {
      // Novo match detectado!
      setBadgeAnimation(true);
      toast.success('Nova oportunidade encontrada! 🎯', {
        duration: 4000,
        icon: '✨'
      });
      
      // Remover animação após 2 segundos
      setTimeout(() => setBadgeAnimation(false), 2000);
    }
    
    if (stats) {
      setPrevUnviewedCount(stats.unviewed_matches);
    }
  }, [stats?.unviewed_matches]);

  // Carregar categorias
  useEffect(() => {
    const fetchCategories = async () => {
      const { supabase } = await import('../src/lib/supabaseClient');
      const { data } = await supabase
        .from('categories')
        .select('id, name, slug')
        .order('name');
      
      if (data) setCategories(data);
    };
    
    fetchCategories();
  }, []);

  // Form state para criar/editar alerta
  const [formData, setFormData] = useState({
    name: '',
    category_id: '',
    state: '',
    radius_km: 0,
    min_price: '',
    max_price: '',
    keywords: ''
  });

  const resetForm = () => {
    setFormData({
      name: '',
      category_id: '',
      state: '',
      radius_km: 0,
      min_price: '',
      max_price: '',
      keywords: ''
    });
  };

  const handleCreateAlert = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      const alertData: any = {
        name: formData.name,
        category_id: formData.category_id || null,
        state: formData.state || null,
        radius_km: parseInt(String(formData.radius_km)) || 0,
        min_price: formData.min_price ? parseFloat(formData.min_price) : null,
        max_price: formData.max_price ? parseFloat(formData.max_price) : null,
        keywords: formData.keywords ? formData.keywords.split(',').map(k => k.trim()).filter(Boolean) : []
      };

      await createAlert(alertData);
      toast.success('Alerta criado com sucesso!');
      setShowCreateModal(false);
      resetForm();
    } catch (error: any) {
      toast.error(error.message || 'Erro ao criar alerta');
    }
  };

  const handleEditAlert = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAlert) return;

    try {
      const updates: any = {
        name: formData.name,
        category_id: formData.category_id || null,
        state: formData.state || null,
        radius_km: parseInt(String(formData.radius_km)) || 0,
        min_price: formData.min_price ? parseFloat(formData.min_price) : null,
        max_price: formData.max_price ? parseFloat(formData.max_price) : null,
        keywords: formData.keywords ? formData.keywords.split(',').map(k => k.trim()).filter(Boolean) : []
      };

      await updateAlert(selectedAlert.id, updates);
      toast.success('Alerta atualizado!');
      setShowEditModal(false);
      setSelectedAlert(null);
      resetForm();
    } catch (error: any) {
      toast.error(error.message || 'Erro ao atualizar alerta');
    }
  };

  const handleDeleteAlert = async () => {
    if (!selectedAlert) return;

    try {
      await deleteAlert(selectedAlert.id);
      toast.success('Alerta excluído!');
      setShowDeleteConfirm(false);
      setSelectedAlert(null);
    } catch (error: any) {
      toast.error(error.message || 'Erro ao excluir alerta');
    }
  };

  const handleToggleStatus = async (alert: OpportunityAlert) => {
    try {
      await toggleAlertStatus(alert.id);
      toast.success(alert.status === 'ativo' ? 'Alerta pausado' : 'Alerta ativado');
    } catch (error: any) {
      toast.error(error.message || 'Erro ao alterar status');
    }
  };

  const openEditModal = (alert: OpportunityAlert) => {
    setSelectedAlert(alert);
    setFormData({
      name: alert.name,
      category_id: alert.category_id || '',
      state: alert.state || '',
      radius_km: alert.radius_km,
      min_price: alert.min_price?.toString() || '',
      max_price: alert.max_price?.toString() || '',
      keywords: alert.keywords?.join(', ') || ''
    });
    setShowEditModal(true);
  };

  const openDeleteConfirm = (alert: OpportunityAlert) => {
    setSelectedAlert(alert);
    setShowDeleteConfirm(true);
  };

  const handleViewMatch = async (match: OpportunityMatch) => {
    if (!match.is_viewed) {
      await markMatchAsViewed(match.id);
    }
  };

  const handleDismissMatch = async (matchId: string) => {
    try {
      await dismissMatch(matchId);
      toast.success('Oportunidade descartada');
    } catch (error: any) {
      toast.error('Erro ao descartar oportunidade');
    }
  };

  // Estados brasileiros
  const brazilianStates = [
    'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA',
    'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN',
    'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'
  ];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-700"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-green-700 to-green-600 rounded-2xl p-6 text-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-white/20 rounded-xl backdrop-blur">
              <Radar className="w-8 h-8" strokeWidth={2} />
            </div>
            <div>
              <h1 className="text-2xl font-black">Radar de Oportunidades</h1>
              <p className="text-green-50 text-sm">
                Encontre as melhores ofertas automaticamente
              </p>
            </div>
          </div>
          
          {/* Plan Badge */}
          <div className="flex items-center gap-2 bg-white/20 backdrop-blur px-4 py-2 rounded-xl">
            <Crown className="w-4 h-4" />
            <span className="text-sm font-bold uppercase">{userPlan}</span>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-4 mt-6">
          <div className="bg-white/10 backdrop-blur rounded-xl p-4">
            <p className="text-xs text-green-100">Alertas Ativos</p>
            <p className="text-2xl font-black">{stats?.active_alerts || 0}</p>
          </div>
          <div className="bg-white/10 backdrop-blur rounded-xl p-4">
            <p className="text-xs text-green-100">Total de Alertas</p>
            <p className="text-2xl font-black">{stats?.total_alerts || 0}</p>
          </div>
          <div className="bg-white/10 backdrop-blur rounded-xl p-4">
            <p className="text-xs text-green-100">Oportunidades</p>
            <p className="text-2xl font-black">{stats?.total_matches || 0}</p>
          </div>
          <div className="bg-white/10 backdrop-blur rounded-xl p-4">
            <p className="text-xs text-green-100">Não Visualizadas</p>
            <p className="text-2xl font-black">{stats?.unviewed_matches || 0}</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-200">
        <div className="flex gap-6">
          <button
            onClick={() => setActiveTab('opportunities')}
            className={`pb-3 px-1 font-semibold text-sm transition-colors relative ${
              activeTab === 'opportunities'
                ? 'text-green-700'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4" />
              <span>Oportunidades</span>
              {stats && stats.unviewed_matches > 0 && (
                <span 
                  className={`bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full transition-all ${
                    badgeAnimation ? 'animate-bounce scale-110' : ''
                  }`}
                >
                  {stats.unviewed_matches}
                </span>
              )}
            </div>
            {activeTab === 'opportunities' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-green-700"></div>
            )}
          </button>

          <button
            onClick={() => setActiveTab('config')}
            className={`pb-3 px-1 font-semibold text-sm transition-colors relative ${
              activeTab === 'config'
                ? 'text-green-700'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4" />
              <span>Configurações</span>
            </div>
            {activeTab === 'config' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-green-700"></div>
            )}
          </button>
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === 'opportunities' && (
        <div>
          {/* Oportunidades Grid */}
          {matches.length === 0 ? (
            <div className="bg-white border-2 border-dashed border-slate-200 rounded-2xl p-12 text-center">
              <Bell className="w-16 h-16 text-slate-300 mx-auto mb-4" strokeWidth={1.5} />
              <h3 className="text-xl font-bold text-slate-700 mb-2">Nenhuma oportunidade encontrada</h3>
              <p className="text-slate-500 mb-6">
                Configure alertas para receber notificações de anúncios que correspondam aos seus critérios.
              </p>
              {radiusAlertsCount > 0 && !locationStatus.hasCoordinates && (
                <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                  Seus alertas com raio podem nao encontrar resultados enquanto a localizacao do seu perfil nao estiver disponivel.
                </div>
              )}
              <button
                onClick={() => setActiveTab('config')}
                className="inline-flex items-center gap-2 px-6 py-3 bg-green-700 text-white font-semibold rounded-xl hover:bg-green-800 transition-colors"
              >
                <Plus className="w-5 h-5" />
                Criar Primeiro Alerta
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {matches.map((match) => (
                <div
                  key={match.id}
                  className={`bg-white border rounded-xl overflow-hidden hover:shadow-lg transition-shadow ${
                    !match.is_viewed ? 'border-green-500 border-2' : 'border-slate-200'
                  }`}
                >
                  {/* Image */}
                  <div className="relative h-48 bg-slate-100">
                    <img
                      src={match.announcement?.images[0] || '/placeholder.jpg'}
                      alt={match.announcement?.title}
                      className="w-full h-full object-cover"
                    />
                    {!match.is_viewed && (
                      <div className="absolute top-3 right-3 bg-green-500 text-white text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1">
                        <Sparkles className="w-3 h-3" />
                        NOVO
                      </div>
                    )}
                    <div className="absolute top-3 left-3 bg-black/60 backdrop-blur text-white text-xs font-semibold px-3 py-1 rounded-full">
                      Score: {match.match_score}%
                    </div>
                  </div>

                  {/* Content */}
                  <div className="p-4">
                    <h3 className="font-bold text-slate-900 mb-2 line-clamp-2">
                      {match.announcement?.title}
                    </h3>
                    
                    <div className="flex items-center gap-2 text-sm text-slate-600 mb-3">
                      <MapPin className="w-4 h-4" />
                      <span>{match.announcement?.city}, {match.announcement?.state}</span>
                    </div>

                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <p className="text-xs text-slate-500">Preço</p>
                        <p className="text-xl font-black text-green-700">
                          {new Intl.NumberFormat('pt-BR', {
                            style: 'currency',
                            currency: 'BRL'
                          }).format(match.announcement?.price || 0)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-slate-500">Publicado</p>
                        <p className="text-sm font-semibold text-slate-700">
                          {match.announcement?.created_at
                            ? new Date(match.announcement.created_at).toLocaleDateString('pt-BR')
                            : 'N/A'}
                        </p>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2">
                      <Link
                        to={`/anuncio/${match.announcement_id}`}
                        onClick={() => handleViewMatch(match)}
                        className="flex-1 py-2 bg-green-700 text-white text-sm font-semibold rounded-lg hover:bg-green-800 transition-colors text-center"
                      >
                        Ver Detalhes
                      </Link>
                      <button
                        onClick={() => handleDismissMatch(match.id)}
                        className="px-3 py-2 bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200 transition-colors"
                        title="Descartar"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'config' && (
        <div>
          {/* Plan Limits Info */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-blue-900 mb-1">Recursos do seu plano ({userPlan})</p>
                <ul className="text-sm text-blue-800 space-y-1">
                  <li>• Alertas: {planLimits.alerts === 999 ? 'Ilimitados' : planLimits.alerts}</li>
                  <li>• Filtro por raio: {planLimits.radius ? '✓ Disponível' : '✗ Não disponível'}</li>
                  <li>• Palavras-chave: {planLimits.keywords ? '✓ Disponível' : '✗ Não disponível'}</li>
                  <li>• Filtro de preço: {planLimits.price_filter ? '✓ Disponível' : '✗ Não disponível'}</li>
                </ul>
                {planLimits.radius && (
                  <div className="mt-3 rounded-lg border border-blue-200 bg-white/70 px-3 py-2 text-xs text-blue-900">
                    {locationStatus.hasCoordinates ? (
                      <span>Busca por raio pronta para uso com a localizacao atual do seu perfil.</span>
                    ) : locationStatus.hasCep ? (
                      <span>Seu perfil tem CEP, mas ainda nao possui coordenadas ativas. Ao salvar um alerta com raio, o sistema tentara atualizar sua localizacao automaticamente.</span>
                    ) : (
                      <span>Para usar o filtro por raio, cadastre um CEP valido no seu perfil.</span>
                    )}
                  </div>
                )}
                {nextRecommendedPlan && (
                  <button
                    type="button"
                    onClick={() => setShowUpgradeModal(true)}
                    className="inline-flex items-center gap-1 mt-2 text-sm font-semibold text-blue-700 hover:text-blue-800"
                  >
                    <Crown className="w-4 h-4" />
                    Fazer upgrade
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Create Alert Button */}
          <div className="flex justify-end mb-4">
            <button
              onClick={() => {
                if (alerts.length >= planLimits.alerts) {
                  toast.error(`Limite de ${planLimits.alerts} alerta(s) atingido. Faça upgrade!`);
                  return;
                }
                setShowCreateModal(true);
              }}
              className="inline-flex items-center gap-2 px-6 py-3 bg-green-700 text-white font-semibold rounded-xl hover:bg-green-800 transition-colors"
            >
              <Plus className="w-5 h-5" />
              Novo Alerta
            </button>
          </div>

          {/* Alerts List */}
          {alerts.length === 0 ? (
            <div className="bg-white border-2 border-dashed border-slate-200 rounded-2xl p-12 text-center">
              <Filter className="w-16 h-16 text-slate-300 mx-auto mb-4" strokeWidth={1.5} />
              <h3 className="text-xl font-bold text-slate-700 mb-2">Nenhum alerta configurado</h3>
              <p className="text-slate-500 mb-6">
                Crie alertas personalizados para ser notificado sobre oportunidades relevantes.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {alerts.map((alert) => (
                <div
                  key={alert.id}
                  className={`bg-white border rounded-xl p-5 ${
                    alert.status === 'ativo' ? 'border-slate-200' : 'border-slate-200 opacity-60'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className="font-bold text-slate-900">{alert.name}</h3>
                        <span
                          className={`text-xs font-semibold px-2 py-1 rounded ${
                            alert.status === 'ativo'
                              ? 'bg-green-100 text-green-700'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {alert.status === 'ativo' ? 'Ativo' : 'Pausado'}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm text-slate-600">
                        {alert.category_id && (
                          <div className="flex items-center gap-2">
                            <Tag className="w-4 h-4" />
                            <span>Categoria específica</span>
                          </div>
                        )}
                        {alert.state && (
                          <div className="flex items-center gap-2">
                            <MapPin className="w-4 h-4" />
                            <span>Estado: {alert.state}</span>
                          </div>
                        )}
                        {alert.radius_km > 0 && (
                          <div className="flex items-center gap-2">
                            <Radar className="w-4 h-4" />
                            <span>Raio: {alert.radius_km} km</span>
                          </div>
                        )}
                        {(alert.min_price || alert.max_price) && (
                          <div className="flex items-center gap-2">
                            <DollarSign className="w-4 h-4" />
                            <span>
                              {alert.min_price && alert.max_price
                                ? `R$ ${alert.min_price.toLocaleString()} - R$ ${alert.max_price.toLocaleString()}`
                                : alert.min_price
                                ? `A partir de R$ ${alert.min_price.toLocaleString()}`
                                : `Até R$ ${alert.max_price?.toLocaleString()}`}
                            </span>
                          </div>
                        )}
                        {alert.keywords && alert.keywords.length > 0 && (
                          <div className="col-span-2">
                            <p className="text-xs text-slate-500 mb-1">Palavras-chave:</p>
                            <div className="flex flex-wrap gap-1">
                              {alert.keywords.map((keyword, idx) => (
                                <span
                                  key={idx}
                                  className="text-xs bg-slate-100 text-slate-700 px-2 py-1 rounded"
                                >
                                  {keyword}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="mt-3 text-xs text-slate-500">
                        Criado em: {new Date(alert.created_at).toLocaleDateString('pt-BR')}
                        {alert.last_match_at && (
                          <span className="ml-4">
                            Último match: {new Date(alert.last_match_at).toLocaleDateString('pt-BR')}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 ml-4">
                      <button
                        onClick={() => handleToggleStatus(alert)}
                        className={`p-2 rounded-lg transition-colors ${
                          alert.status === 'ativo'
                            ? 'hover:bg-yellow-50 text-yellow-600'
                            : 'hover:bg-green-50 text-green-600'
                        }`}
                        title={alert.status === 'ativo' ? 'Pausar' : 'Ativar'}
                      >
                        {alert.status === 'ativo' ? (
                          <PauseCircle className="w-5 h-5" />
                        ) : (
                          <PlayCircle className="w-5 h-5" />
                        )}
                      </button>
                      <button
                        onClick={() => openEditModal(alert)}
                        className="p-2 rounded-lg hover:bg-blue-50 text-blue-600 transition-colors"
                        title="Editar"
                      >
                        <Edit3 className="w-5 h-5" />
                      </button>
                      <button
                        onClick={() => openDeleteConfirm(alert)}
                        className="p-2 rounded-lg hover:bg-red-50 text-red-600 transition-colors"
                        title="Excluir"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Modal: Create Alert */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-200">
              <h2 className="text-2xl font-bold text-slate-900">Criar Novo Alerta</h2>
              <p className="text-sm text-slate-500 mt-1">
                Configure os critérios para receber notificações de novas oportunidades
              </p>
            </div>

            <form onSubmit={handleCreateAlert} className="p-6 space-y-6">
              {/* Nome do Alerta */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Nome do Alerta*
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Ex: Tratores John Deere em SP"
                  className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
              </div>

              {/* Categoria */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Categoria (opcional)
                </label>
                <select
                  value={formData.category_id}
                  onChange={(e) => setFormData({ ...formData, category_id: e.target.value })}
                  className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent"
                >
                  <option value="">Todas as categorias</option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Estado */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Estado (opcional)
                </label>
                <select
                  value={formData.state}
                  onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                  className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent"
                >
                  <option value="">Todos os estados</option>
                  {brazilianStates.map((state) => (
                    <option key={state} value={state}>
                      {state}
                    </option>
                  ))}
                </select>
              </div>

              {/* Raio (apenas plano Destaque) */}
              {planLimits.radius ? (
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Raio de Busca (km)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={formData.radius_km}
                    onChange={(e) => setFormData({ ...formData, radius_km: parseInt(e.target.value) || 0 })}
                    placeholder="Ex: 100"
                    className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  />
                  <p className="text-xs text-slate-500 mt-1">
                    0 = sem limite de distância, apenas por estado
                  </p>
                  {!locationStatus.hasCep && (
                    <p className="text-xs text-amber-700 mt-2">
                      Cadastre um CEP no seu perfil para ativar esse filtro com seguranca.
                    </p>
                  )}
                </div>
              ) : (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                  <div className="flex items-start gap-3">
                    <Crown className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-amber-900 text-sm mb-1">
                        Filtro por Raio Geográfico
                      </p>
                      <p className="text-xs text-amber-800 mb-2">
                        Busque anúncios dentro de um raio específico (km) a partir da sua localização. 
                        Disponível apenas no plano <strong>Destaque</strong>.
                      </p>
                      {nextRecommendedPlan && (
                        <button
                          type="button"
                          onClick={() => setShowUpgradeModal(true)}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 hover:text-amber-800"
                        >
                          <TrendingUp className="w-3 h-3" />
                          Fazer upgrade agora
                        </button>
                      )}
                    </div>
                  </div>
                  {formData.min_price && formData.max_price && Number(formData.min_price) > Number(formData.max_price) && (
                    <div className="col-span-2 text-xs text-red-600">
                      O preco minimo nao pode ser maior que o preco maximo.
                    </div>
                  )}
                </div>
              )}

              {/* Faixa de Preço (planos Essencial e Destaque) */}
              {planLimits.price_filter && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">
                      Preço Mínimo
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={formData.min_price}
                      onChange={(e) => setFormData({ ...formData, min_price: e.target.value })}
                      placeholder="R$ 0,00"
                      className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">
                      Preço Máximo
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={formData.max_price}
                      onChange={(e) => setFormData({ ...formData, max_price: e.target.value })}
                      placeholder="R$ 0,00"
                      className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    />
                  </div>
                </div>
              )}

              {/* Palavras-chave (planos Essencial e Destaque) */}
              {planLimits.keywords && (
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Palavras-chave (separadas por vírgula)
                  </label>
                  <input
                    type="text"
                    value={formData.keywords}
                    onChange={(e) => setFormData({ ...formData, keywords: e.target.value })}
                    placeholder="Ex: trator, john deere, 4x4"
                    className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  />
                  <p className="text-xs text-slate-500 mt-1">
                    O sistema buscará anúncios que contenham essas palavras no título ou descrição
                  </p>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateModal(false);
                    resetForm();
                  }}
                  className="flex-1 px-6 py-3 bg-slate-100 text-slate-700 font-semibold rounded-xl hover:bg-slate-200 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 px-6 py-3 bg-green-700 text-white font-semibold rounded-xl hover:bg-green-800 transition-colors"
                >
                  Criar Alerta
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Edit Alert (similar ao Create) */}
      {showEditModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-200">
              <h2 className="text-2xl font-bold text-slate-900">Editar Alerta</h2>
            </div>

            <form onSubmit={handleEditAlert} className="p-6 space-y-6">
              {/* (Campos idênticos ao modal de criar) */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Nome do Alerta*
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Categoria</label>
                <select
                  value={formData.category_id}
                  onChange={(e) => setFormData({ ...formData, category_id: e.target.value })}
                  className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent"
                >
                  <option value="">Todas</option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Estado</label>
                <select
                  value={formData.state}
                  onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                  className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent"
                >
                  <option value="">Todos</option>
                  {brazilianStates.map((state) => (
                    <option key={state} value={state}>{state}</option>
                  ))}
                </select>
              </div>

              {planLimits.radius ? (
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Raio (km)</label>
                  <input
                    type="number"
                    min="0"
                    value={formData.radius_km}
                    onChange={(e) => setFormData({ ...formData, radius_km: parseInt(e.target.value) || 0 })}
                    className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  />
                  {!locationStatus.hasCep && (
                    <p className="text-xs text-amber-700 mt-2">
                      Cadastre um CEP no seu perfil para ativar esse filtro com seguranca.
                    </p>
                  )}
                </div>
              ) : (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                  <div className="flex items-start gap-3">
                    <Crown className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-amber-900 text-sm mb-1">
                        Filtro por Raio Geográfico
                      </p>
                      <p className="text-xs text-amber-800 mb-2">
                        Disponível apenas no plano <strong>Destaque</strong>.
                      </p>
                      {nextRecommendedPlan && (
                        <button
                          type="button"
                          onClick={() => setShowUpgradeModal(true)}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 hover:text-amber-800"
                        >
                          <TrendingUp className="w-3 h-3" />
                          Fazer upgrade
                        </button>
                      )}
                    </div>
                  </div>
                  {formData.min_price && formData.max_price && Number(formData.min_price) > Number(formData.max_price) && (
                    <div className="col-span-2 text-xs text-red-600">
                      O preco minimo nao pode ser maior que o preco maximo.
                    </div>
                  )}
                </div>
              )}

              {planLimits.price_filter && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">Preço Mín.</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={formData.min_price}
                      onChange={(e) => setFormData({ ...formData, min_price: e.target.value })}
                      className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">Preço Máx.</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={formData.max_price}
                      onChange={(e) => setFormData({ ...formData, max_price: e.target.value })}
                      className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    />
                  </div>
                </div>
              )}

              {planLimits.keywords && (
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Palavras-chave</label>
                  <input
                    type="text"
                    value={formData.keywords}
                    onChange={(e) => setFormData({ ...formData, keywords: e.target.value })}
                    className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  />
                </div>
              )}

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowEditModal(false);
                    setSelectedAlert(null);
                    resetForm();
                  }}
                  className="flex-1 px-6 py-3 bg-slate-100 text-slate-700 font-semibold rounded-xl hover:bg-slate-200 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 px-6 py-3 bg-green-700 text-white font-semibold rounded-xl hover:bg-green-800 transition-colors"
                >
                  Salvar Alterações
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Delete Confirm */}
      {showDeleteConfirm && selectedAlert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
            <h3 className="text-xl font-bold text-slate-900 mb-3">Confirmar Exclusão</h3>
            <p className="text-sm text-slate-600 mb-2">
              Tem certeza que deseja excluir este alerta?
            </p>
            <p className="text-sm font-semibold text-slate-800 mb-6 bg-slate-50 p-3 rounded-lg">
              {selectedAlert.name}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowDeleteConfirm(false);
                  setSelectedAlert(null);
                }}
                className="flex-1 px-6 py-3 bg-slate-100 text-slate-700 font-semibold rounded-xl hover:bg-slate-200 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleDeleteAlert}
                className="flex-1 px-6 py-3 bg-red-600 text-white font-semibold rounded-xl hover:bg-red-700 transition-colors"
              >
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}

      <RecommendedUpgradeModal
        isOpen={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
        currentPlan={currentPlanRecord}
        nextPlan={nextRecommendedPlan}
        userId={user?.id}
      />
    </div>
  );
};

export default RadarView;
