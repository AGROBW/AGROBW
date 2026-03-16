import React, { useState, useEffect } from 'react';
import { FileText, Save, RotateCcw, AlertCircle, Loader2 } from 'lucide-react';
import { useTermsPage, UpdateTermsPageData } from '../../src/hooks/useTermsPage';
import { useAuth } from '../../src/contexts/AuthContext';
import { useAdminAudit, ADMIN_ACTIONS, RESOURCE_TYPES } from '../../src/hooks/useAdminAudit';
import toast from 'react-hot-toast';

const TermsPageManagement: React.FC = () => {
  const { content, isLoading, updateContent } = useTermsPage();
  const { user } = useAuth();
  const { logAction } = useAdminAudit();

  const [formData, setFormData] = useState<UpdateTermsPageData>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (content) {
      setFormData({
        last_updated_date: content.last_updated_date,
        section1_title: content.section1_title,
        section1_content: content.section1_content,
        section2_title: content.section2_title,
        section2_content: content.section2_content,
        section3_title: content.section3_title,
        section3_content: content.section3_content,
        section4_title: content.section4_title,
        section4_content: content.section4_content,
        section5_title: content.section5_title,
        section5_content: content.section5_content,
        section6_title: content.section6_title,
        section6_content: content.section6_content,
      });
    }
  }, [content]);

  const handleChange = (field: keyof UpdateTermsPageData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user?.id) {
      toast.error('Você precisa estar logado');
      return;
    }

    setSaving(true);

    try {
      const { error } = await updateContent(formData, user.id);

      if (error) {
        toast.error(`Erro ao salvar: ${error}`);
        return;
      }

      // Log de auditoria
      await logAction({
        action: ADMIN_ACTIONS.UPDATE_PAGE_CONTENT,
        resourceType: RESOURCE_TYPES.PAGE,
        resourceId: content?.id || '',
        newValue: { page: 'Termos de Uso', ...formData },
        reason: 'Conteúdo da página Termos de Uso atualizado',
      });

      toast.success('Página "Termos de Uso" atualizada com sucesso!');
    } catch (err) {
      console.error('Erro ao salvar:', err);
      toast.error('Erro inesperado ao salvar');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    if (content) {
      setFormData({
        last_updated_date: content.last_updated_date,
        section1_title: content.section1_title,
        section1_content: content.section1_content,
        section2_title: content.section2_title,
        section2_content: content.section2_content,
        section3_title: content.section3_title,
        section3_content: content.section3_content,
        section4_title: content.section4_title,
        section4_content: content.section4_content,
        section5_title: content.section5_title,
        section5_content: content.section5_content,
        section6_title: content.section6_title,
        section6_content: content.section6_content,
      });
      toast.success('Alterações descartadas');
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-green-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <FileText className="w-6 h-6 text-green-600" />
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Página "Termos de Uso"</h2>
            <p className="text-sm text-gray-500">
              Edite o conteúdo das seções da página de Termos de Uso
            </p>
          </div>
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={handleReset}
            className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition"
          >
            <RotateCcw className="w-4 h-4" />
            Descartar Alterações
          </button>

          <button
            onClick={handleSubmit}
            disabled={saving}
            className="flex items-center gap-2 px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition disabled:opacity-50"
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

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Meta: Data de Atualização */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-bold text-gray-900 mb-4">📅 Última Atualização</h3>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Data de Atualização
            </label>
            <input
              type="text"
              value={formData.last_updated_date || ''}
              onChange={(e) => handleChange('last_updated_date', e.target.value)}
              placeholder="Ex: 20 de Maio de 2024"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
            />
            <p className="text-xs text-gray-500 mt-1">
              Formato sugerido: "DD de Mês de AAAA"
            </p>
          </div>
        </div>

        {/* Seção 1: Aceitação dos Termos */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 bg-green-100 text-green-700 rounded-lg flex items-center justify-center font-bold">
              1
            </div>
            <h3 className="text-lg font-bold text-gray-900">Aceitação dos Termos</h3>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Título da Seção
              </label>
              <input
                type="text"
                value={formData.section1_title || ''}
                onChange={(e) => handleChange('section1_title', e.target.value)}
                placeholder="1. Aceitação dos Termos"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Conteúdo
              </label>
              <textarea
                value={formData.section1_content || ''}
                onChange={(e) => handleChange('section1_content', e.target.value)}
                rows={4}
                placeholder="Ao acessar e utilizar a plataforma BWAGRO..."
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent resize-none"
              />
            </div>
          </div>
        </div>

        {/* Seção 2: Cadastro e Segurança da Conta */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 bg-green-100 text-green-700 rounded-lg flex items-center justify-center font-bold">
              2
            </div>
            <h3 className="text-lg font-bold text-gray-900">Cadastro e Segurança da Conta</h3>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Título da Seção
              </label>
              <input
                type="text"
                value={formData.section2_title || ''}
                onChange={(e) => handleChange('section2_title', e.target.value)}
                placeholder="2. Cadastro e Segurança da Conta"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Conteúdo
              </label>
              <textarea
                value={formData.section2_content || ''}
                onChange={(e) => handleChange('section2_content', e.target.value)}
                rows={5}
                placeholder="Para publicar anúncios, o usuário deve..."
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent resize-none"
              />
              <p className="text-xs text-gray-500 mt-1">
                Dica: Use • para criar listas com bullets
              </p>
            </div>
          </div>
        </div>

        {/* Seção 3: Regras para Publicação de Anúncios */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 bg-green-100 text-green-700 rounded-lg flex items-center justify-center font-bold">
              3
            </div>
            <h3 className="text-lg font-bold text-gray-900">Regras para Publicação de Anúncios</h3>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Título da Seção
              </label>
              <input
                type="text"
                value={formData.section3_title || ''}
                onChange={(e) => handleChange('section3_title', e.target.value)}
                placeholder="3. Regras para Publicação de Anúncios"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Conteúdo
              </label>
              <textarea
                value={formData.section3_content || ''}
                onChange={(e) => handleChange('section3_content', e.target.value)}
                rows={6}
                placeholder="Todos os anúncios devem ser verídicos..."
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent resize-none"
              />
            </div>
          </div>
        </div>

        {/* Seção 4: Planos de Assinatura e Reembolso */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 bg-green-100 text-green-700 rounded-lg flex items-center justify-center font-bold">
              4
            </div>
            <h3 className="text-lg font-bold text-gray-900">Planos de Assinatura e Reembolso</h3>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Título da Seção
              </label>
              <input
                type="text"
                value={formData.section4_title || ''}
                onChange={(e) => handleChange('section4_title', e.target.value)}
                placeholder="4. Planos de Assinatura e Reembolso"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Conteúdo
              </label>
              <textarea
                value={formData.section4_content || ''}
                onChange={(e) => handleChange('section4_content', e.target.value)}
                rows={4}
                placeholder="A BWAGRO oferece planos gratuitos e premium..."
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent resize-none"
              />
            </div>
          </div>
        </div>

        {/* Seção 5: Propriedade Intelectual */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 bg-green-100 text-green-700 rounded-lg flex items-center justify-center font-bold">
              5
            </div>
            <h3 className="text-lg font-bold text-gray-900">Propriedade Intelectual</h3>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Título da Seção
              </label>
              <input
                type="text"
                value={formData.section5_title || ''}
                onChange={(e) => handleChange('section5_title', e.target.value)}
                placeholder="5. Propriedade Intelectual"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Conteúdo
              </label>
              <textarea
                value={formData.section5_content || ''}
                onChange={(e) => handleChange('section5_content', e.target.value)}
                rows={4}
                placeholder="A marca BWAGRO, logotipos, layouts..."
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent resize-none"
              />
            </div>
          </div>
        </div>

        {/* Seção 6: Limitação de Responsabilidade */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 bg-green-100 text-green-700 rounded-lg flex items-center justify-center font-bold">
              6
            </div>
            <h3 className="text-lg font-bold text-gray-900">Limitação de Responsabilidade</h3>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Título da Seção
              </label>
              <input
                type="text"
                value={formData.section6_title || ''}
                onChange={(e) => handleChange('section6_title', e.target.value)}
                placeholder="6. Limitação de Responsabilidade"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Conteúdo
              </label>
              <textarea
                value={formData.section6_content || ''}
                onChange={(e) => handleChange('section6_content', e.target.value)}
                rows={4}
                placeholder="A BWAGRO não participa das negociações financeiras..."
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent resize-none"
              />
            </div>
          </div>
        </div>

        {/* Info */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex gap-3">
          <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-blue-900">
            <p className="font-semibold mb-1">💡 Dicas de Edição:</p>
            <ul className="list-disc list-inside space-y-1">
              <li>O layout da página é fixo. Você edita apenas o conteúdo textual.</li>
              <li>Use quebras de linha para separar parágrafos.</li>
              <li>Para listas, use o caractere • seguido de espaço.</li>
              <li>Mantenha uma linguagem clara e objetiva.</li>
            </ul>
          </div>
        </div>
      </form>
    </div>
  );
};

export default TermsPageManagement;
