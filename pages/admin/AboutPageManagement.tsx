import React, { useState, useEffect } from 'react';
import { 
  Globe, 
  Save, 
  RotateCcw, 
  Loader2, 
  TrendingUp,
  History,
  Target,
  Telescope,
  Gem,
  Lightbulb,
  Upload,
  Image as ImageIcon
} from 'lucide-react';
import { useAboutPage, UpdateAboutPageData } from '../../src/hooks/useAboutPage';
import { useAdminAudit, ADMIN_ACTIONS, RESOURCE_TYPES } from '../../src/hooks/useAdminAudit';
import { useAuth } from '../../src/contexts/AuthContext';
import { toast } from 'sonner';

const AboutPageManagement: React.FC = () => {
  const { content, isLoading, fetchContent, updateContent } = useAboutPage();
  const { logAction } = useAdminAudit();
  const { user } = useAuth();

  const [formData, setFormData] = useState<UpdateAboutPageData>({});
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);

  useEffect(() => {
    if (content) {
      setFormData({
        stat_users_value: content.stat_users_value,
        stat_users_label: content.stat_users_label,
        stat_ads_value: content.stat_ads_value,
        stat_ads_label: content.stat_ads_label,
        stat_revenue_value: content.stat_revenue_value,
        stat_revenue_label: content.stat_revenue_label,
        history_title: content.history_title,
        history_text: content.history_text,
        history_image_url: content.history_image_url,
        mission_title: content.mission_title,
        mission_text: content.mission_text,
        vision_title: content.vision_title,
        vision_text: content.vision_text,
        values_title: content.values_title,
        values_text: content.values_text,
        diff1_title: content.diff1_title,
        diff1_text: content.diff1_text,
        diff2_title: content.diff2_title,
        diff2_text: content.diff2_text,
        diff3_title: content.diff3_title,
        diff3_text: content.diff3_text
      });
    }
  }, [content]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user) {
      toast.error('Usuário não autenticado');
      return;
    }

    setSaving(true);

    try {
      const { error } = await updateContent(formData, user.id);
      if (error) throw new Error(error);

      await logAction({
        action: ADMIN_ACTIONS.UPDATE_PAGE_CONTENT,
        resourceType: RESOURCE_TYPES.PAGE,
        resourceId: content?.id || '',
        newValue: { page: 'Quem Somos' },
        reason: 'Conteúdo da página Quem Somos atualizado'
      });

      toast.success('Página "Quem Somos" atualizada com sucesso!');
    } catch (err: any) {
      toast.error(err.message || 'Erro ao salvar alterações');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    if (content) {
      setFormData({
        stat_users_value: content.stat_users_value,
        stat_users_label: content.stat_users_label,
        stat_ads_value: content.stat_ads_value,
        stat_ads_label: content.stat_ads_label,
        stat_revenue_value: content.stat_revenue_value,
        stat_revenue_label: content.stat_revenue_label,
        history_title: content.history_title,
        history_text: content.history_text,
        history_image_url: content.history_image_url,
        mission_title: content.mission_title,
        mission_text: content.mission_text,
        vision_title: content.vision_title,
        vision_text: content.vision_text,
        values_title: content.values_title,
        values_text: content.values_text,
        diff1_title: content.diff1_title,
        diff1_text: content.diff1_text,
        diff2_title: content.diff2_title,
        diff2_text: content.diff2_text,
        diff3_title: content.diff3_title,
        diff3_text: content.diff3_text
      });
      toast.info('Alterações descartadas');
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
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Página "Quem Somos"</h2>
          <p className="text-sm text-slate-600 mt-1">
            Edite cada seção individualmente - design fixo, conteúdo editável
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleReset}
            className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg font-semibold hover:bg-slate-50 transition-colors flex items-center gap-2"
          >
            <RotateCcw className="w-4 h-4" />
            Descartar
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="px-4 py-2.5 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            {saving ? 'Salvando...' : 'Salvar Alterações'}
          </button>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Estatísticas Hero */}
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-5 h-5 text-green-600" />
            <h3 className="text-lg font-bold text-slate-900">Estatísticas (Hero)</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Stat 1: Usuários */}
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Usuários Ativos
              </label>
              <input
                type="text"
                value={formData.stat_users_value || ''}
                onChange={(e) => setFormData({ ...formData, stat_users_value: e.target.value })}
                placeholder="10k+"
                className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 mb-2"
              />
              <input
                type="text"
                value={formData.stat_users_label || ''}
                onChange={(e) => setFormData({ ...formData, stat_users_label: e.target.value })}
                placeholder="USUÁRIOS ATIVOS"
                className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 text-xs uppercase"
              />
            </div>

            {/* Stat 2: Anúncios */}
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Anúncios Criados
              </label>
              <input
                type="text"
                value={formData.stat_ads_value || ''}
                onChange={(e) => setFormData({ ...formData, stat_ads_value: e.target.value })}
                placeholder="50k+"
                className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 mb-2"
              />
              <input
                type="text"
                value={formData.stat_ads_label || ''}
                onChange={(e) => setFormData({ ...formData, stat_ads_label: e.target.value })}
                placeholder="ANÚNCIOS CRIADOS"
                className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 text-xs uppercase"
              />
            </div>

            {/* Stat 3: Receita */}
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Negócios Gerados
              </label>
              <input
                type="text"
                value={formData.stat_revenue_value || ''}
                onChange={(e) => setFormData({ ...formData, stat_revenue_value: e.target.value })}
                placeholder="850 Mi"
                className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 mb-2"
              />
              <input
                type="text"
                value={formData.stat_revenue_label || ''}
                onChange={(e) => setFormData({ ...formData, stat_revenue_label: e.target.value })}
                placeholder="NEGÓCIOS GERADOS"
                className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 text-xs uppercase"
              />
            </div>
          </div>
        </div>

        {/* Seção História */}
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <History className="w-5 h-5 text-green-600" />
            <h3 className="text-lg font-bold text-slate-900">História</h3>
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Título da Seção
              </label>
              <input
                type="text"
                value={formData.history_title || ''}
                onChange={(e) => setFormData({ ...formData, history_title: e.target.value })}
                placeholder="Nossa História"
                className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Texto da História
              </label>
              <textarea
                value={formData.history_text || ''}
                onChange={(e) => setFormData({ ...formData, history_text: e.target.value })}
                placeholder="Nascida da necessidade real do produtor rural..."
                rows={5}
                className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                URL da Imagem Lateral
              </label>
              <div className="flex gap-2">
                <input
                  type="url"
                  value={formData.history_image_url || ''}
                  onChange={(e) => setFormData({ ...formData, history_image_url: e.target.value })}
                  placeholder="https://images.unsplash.com/..."
                  className="flex-1 px-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                />
                <button
                  type="button"
                  className="px-4 py-2.5 border border-slate-300 text-slate-700 rounded-lg font-semibold hover:bg-slate-50 transition-colors flex items-center gap-2"
                >
                  <ImageIcon className="w-4 h-4" />
                  Escolher
                </button>
              </div>
              {formData.history_image_url && (
                <img 
                  src={formData.history_image_url} 
                  alt="Preview" 
                  className="mt-3 w-full max-w-md h-48 object-cover rounded-lg border border-slate-200"
                />
              )}
            </div>
          </div>
        </div>

        {/* Pilares (Missão/Visão/Valores) */}
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Target className="w-5 h-5 text-green-600" />
            <h3 className="text-lg font-bold text-slate-900">Nossos Pilares</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Missão */}
            <div className="border border-slate-200 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-3">
                <Target className="w-4 h-4 text-green-600" />
                <span className="font-bold text-slate-900">Missão</span>
              </div>
              <input
                type="text"
                value={formData.mission_title || ''}
                onChange={(e) => setFormData({ ...formData, mission_title: e.target.value })}
                placeholder="Missão"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 mb-2 text-sm font-semibold"
              />
              <textarea
                value={formData.mission_text || ''}
                onChange={(e) => setFormData({ ...formData, mission_text: e.target.value })}
                placeholder="Prover as melhores ferramentas..."
                rows={4}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 resize-none text-sm"
              />
            </div>

            {/* Visão */}
            <div className="border border-slate-200 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-3">
                <Telescope className="w-4 h-4 text-green-600" />
                <span className="font-bold text-slate-900">Visão</span>
              </div>
              <input
                type="text"
                value={formData.vision_title || ''}
                onChange={(e) => setFormData({ ...formData, vision_title: e.target.value })}
                placeholder="Visão"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 mb-2 text-sm font-semibold"
              />
              <textarea
                value={formData.vision_text || ''}
                onChange={(e) => setFormData({ ...formData, vision_text: e.target.value })}
                placeholder="Ser o ecossistema digital..."
                rows={4}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 resize-none text-sm"
              />
            </div>

            {/* Valores */}
            <div className="border border-slate-200 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-3">
                <Gem className="w-4 h-4 text-green-600" />
                <span className="font-bold text-slate-900">Valores</span>
              </div>
              <input
                type="text"
                value={formData.values_title || ''}
                onChange={(e) => setFormData({ ...formData, values_title: e.target.value })}
                placeholder="Valores"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 mb-2 text-sm font-semibold"
              />
              <textarea
                value={formData.values_text || ''}
                onChange={(e) => setFormData({ ...formData, values_text: e.target.value })}
                placeholder="Integridade nas relações..."
                rows={4}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 resize-none text-sm"
              />
            </div>
          </div>
        </div>

        {/* Diferenciais */}
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Lightbulb className="w-5 h-5 text-green-600" />
            <h3 className="text-lg font-bold text-slate-900">Por que a BWAGRO é diferente?</h3>
          </div>
          <div className="space-y-4">
            {/* Diferencial 1 */}
            <div className="flex gap-4 items-start">
              <div className="w-12 h-12 bg-green-100 text-green-700 rounded-xl flex items-center justify-center flex-shrink-0 font-black text-lg">
                01
              </div>
              <div className="flex-1 space-y-2">
                <input
                  type="text"
                  value={formData.diff1_title || ''}
                  onChange={(e) => setFormData({ ...formData, diff1_title: e.target.value })}
                  placeholder="Tecnologia de Ponta"
                  className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 font-semibold"
                />
                <textarea
                  value={formData.diff1_text || ''}
                  onChange={(e) => setFormData({ ...formData, diff1_text: e.target.value })}
                  placeholder="Filtros inteligentes e interface..."
                  rows={2}
                  className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
                />
              </div>
            </div>

            {/* Diferencial 2 */}
            <div className="flex gap-4 items-start">
              <div className="w-12 h-12 bg-green-100 text-green-700 rounded-xl flex items-center justify-center flex-shrink-0 font-black text-lg">
                02
              </div>
              <div className="flex-1 space-y-2">
                <input
                  type="text"
                  value={formData.diff2_title || ''}
                  onChange={(e) => setFormData({ ...formData, diff2_title: e.target.value })}
                  placeholder="Facilidade de Uso"
                  className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 font-semibold"
                />
                <textarea
                  value={formData.diff2_text || ''}
                  onChange={(e) => setFormData({ ...formData, diff2_text: e.target.value })}
                  placeholder="Anuncie seus produtos em menos..."
                  rows={2}
                  className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
                />
              </div>
            </div>

            {/* Diferencial 3 */}
            <div className="flex gap-4 items-start">
              <div className="w-12 h-12 bg-green-100 text-green-700 rounded-xl flex items-center justify-center flex-shrink-0 font-black text-lg">
                03
              </div>
              <div className="flex-1 space-y-2">
                <input
                  type="text"
                  value={formData.diff3_title || ''}
                  onChange={(e) => setFormData({ ...formData, diff3_title: e.target.value })}
                  placeholder="Suporte Especializado"
                  className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 font-semibold"
                />
                <textarea
                  value={formData.diff3_text || ''}
                  onChange={(e) => setFormData({ ...formData, diff3_text: e.target.value })}
                  placeholder="Time que entende a realidade..."
                  rows={2}
                  className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Info */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-700">
          <p>
            <strong>💡 Dica:</strong> O layout e as cores da página são fixos no código. 
            Você pode editar apenas o conteúdo textual e as URLs das imagens. 
            Isso garante que o design permaneça consistente.
          </p>
        </div>
      </form>
    </div>
  );
};

export default AboutPageManagement;
