import React, { useState, useEffect } from 'react';
import { AlertCircle, FileText, Loader2, Plus, RotateCcw, Save, Trash2 } from 'lucide-react';
import { TermsSection, useTermsPage, UpdateTermsPageData } from '../../src/hooks/useTermsPage';
import { useAuth } from '../../src/contexts/AuthContext';
import { useAdminAudit, ADMIN_ACTIONS, RESOURCE_TYPES } from '../../src/hooks/useAdminAudit';
import toast from 'react-hot-toast';
import { appError } from '../../src/utils/appLogger';

const createSectionId = () =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `section-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const normalizeSectionForForm = (section: TermsSection, index: number): TermsSection => ({
  id: section.id || createSectionId(),
  label: section.label || section.title.replace(/^\s*\d+\.\s*/, '').trim() || `Secao ${index + 1}`,
  title: section.title || '',
  content: section.content || '',
});

const TermsPageManagement: React.FC = () => {
  const { content, isLoading, updateContent } = useTermsPage();
  const { user } = useAuth();
  const { logAction } = useAdminAudit();

  const [formData, setFormData] = useState<UpdateTermsPageData>({ sections: [] });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (content) {
      setFormData({
        last_updated_date: content.last_updated_date,
        sections: content.sections.map(normalizeSectionForForm),
      });
    }
  }, [content]);

  const handleChange = (field: keyof UpdateTermsPageData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSectionChange = (sectionId: string, field: keyof TermsSection, value: string) => {
    setFormData((prev) => ({
      ...prev,
      sections: (prev.sections || []).map((section) =>
        section.id === sectionId ? { ...section, [field]: value } : section,
      ),
    }));
  };

  const handleAddSection = () => {
    setFormData((prev) => ({
      ...prev,
      sections: [
        ...(prev.sections || []),
        {
          id: createSectionId(),
          label: `Secao ${(prev.sections || []).length + 1}`,
          title: '',
          content: '',
        },
      ],
    }));
  };

  const handleRemoveSection = (sectionId: string) => {
    setFormData((prev) => {
      const sections = prev.sections || [];
      if (sections.length <= 1) {
        toast.error('Os Termos precisam ter ao menos uma secao.');
        return prev;
      }

      return {
        ...prev,
        sections: sections.filter((section) => section.id !== sectionId),
      };
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user?.id) {
      toast.error('Voce precisa estar logado');
      return;
    }

    const normalizedSections = (formData.sections || []).map((section, index) => {
      const title = section.title.trim();
      return {
        id: section.id || createSectionId(),
        label: section.label.trim() || title.replace(/^\s*\d+\.\s*/, '').trim() || `Secao ${index + 1}`,
        title,
        content: section.content.trim(),
      };
    });

    if (!normalizedSections.length) {
      toast.error('Adicione pelo menos uma secao aos Termos de Uso.');
      return;
    }

    const invalidSection = normalizedSections.find(
      (section) => !section.label || !section.title || !section.content,
    );

    if (invalidSection) {
      toast.error('Preencha rotulo, titulo e conteudo em todas as secoes antes de salvar.');
      return;
    }

    setSaving(true);

    try {
      const { error } = await updateContent(
        {
          last_updated_date: formData.last_updated_date,
          sections: normalizedSections,
        },
        user.id,
      );

      if (error) {
        toast.error(`Erro ao salvar: ${error}`);
        return;
      }

      await logAction({
        action: ADMIN_ACTIONS.UPDATE_PAGE_CONTENT,
        resourceType: RESOURCE_TYPES.PAGE,
        resourceId: content?.id || '',
        newValue: {
          page: 'Termos de Uso',
          last_updated_date: formData.last_updated_date,
          sections: normalizedSections,
        },
        reason: 'Conteudo da pagina Termos de Uso atualizado',
      });

      toast.success('Pagina "Termos de Uso" atualizada com sucesso!');
    } catch (err) {
      appError('[TermsPageManagement] Erro ao salvar termos de uso', err);
      toast.error('Erro inesperado ao salvar');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    if (!content) return;

    setFormData({
      last_updated_date: content.last_updated_date,
      sections: content.sections.map(normalizeSectionForForm),
    });
    toast.success('Alteracoes descartadas');
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
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <FileText className="w-6 h-6 text-green-600" />
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Pagina "Termos de Uso"</h2>
            <p className="text-sm text-gray-500">
              Edite o conteudo das secoes da pagina de Termos de Uso
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
            Descartar Alteracoes
          </button>

          <button
            type="submit"
            form="terms-page-form"
            disabled={saving}
            className="flex items-center gap-2 px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? 'Salvando...' : 'Salvar Alteracoes'}
          </button>
        </div>
      </div>

      <form id="terms-page-form" onSubmit={handleSubmit} className="space-y-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-bold text-gray-900 mb-4">Ultima Atualizacao</h3>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Data de Atualizacao</label>
            <input
              type="text"
              value={formData.last_updated_date || ''}
              onChange={(e) => handleChange('last_updated_date', e.target.value)}
              placeholder="Ex: 20 de Maio de 2024"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
            />
            <p className="text-xs text-gray-500 mt-1">Formato sugerido: "DD de Mes de AAAA"</p>
          </div>
        </div>

        {(formData.sections || []).map((section, index) => (
          <div key={section.id} className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between gap-4 mb-4">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 bg-green-100 text-green-700 rounded-lg flex items-center justify-center font-bold flex-shrink-0">
                  {index + 1}
                </div>
                <h3 className="text-lg font-bold text-gray-900 truncate">
                  {section.label || `Secao ${index + 1}`}
                </h3>
              </div>

              <button
                type="button"
                onClick={() => handleRemoveSection(section.id)}
                className="flex items-center gap-2 px-3 py-2 text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition"
              >
                <Trash2 className="w-4 h-4" />
                Remover
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Rotulo curto da secao
                </label>
                <input
                  type="text"
                  value={section.label}
                  onChange={(e) => handleSectionChange(section.id, 'label', e.target.value)}
                  placeholder="Ex: Limitacao de Responsabilidade"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Titulo da Secao</label>
                <input
                  type="text"
                  value={section.title}
                  onChange={(e) => handleSectionChange(section.id, 'title', e.target.value)}
                  placeholder={`Ex: ${index + 1}. Nova secao`}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Conteudo</label>
                <textarea
                  value={section.content}
                  onChange={(e) => handleSectionChange(section.id, 'content', e.target.value)}
                  rows={5}
                  placeholder="Descreva o conteudo desta secao..."
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent resize-none"
                />
              </div>
            </div>
          </div>
        ))}

        <button
          type="button"
          onClick={handleAddSection}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 border border-dashed border-green-300 text-green-700 rounded-xl bg-green-50 hover:bg-green-100 transition font-semibold"
        >
          <Plus className="w-4 h-4" />
          Adicionar secao
        </button>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex gap-3">
          <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-blue-900">
            <p className="font-semibold mb-1">Dicas de edicao:</p>
            <ul className="list-disc list-inside space-y-1">
              <li>Agora os Termos aceitam quantas secoes voce precisar.</li>
              <li>O rotulo curto aparece no resumo lateral e no topo do card no admin.</li>
              <li>O titulo da secao e o conteudo aparecem na pagina publica.</li>
              <li>Mantenha uma linguagem clara, objetiva e juridicamente consistente.</li>
            </ul>
          </div>
        </div>
      </form>
    </div>
  );
};

export default TermsPageManagement;
