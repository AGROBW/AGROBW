import React, { useState, useRef } from 'react';
import {
  FileText,
  Plus,
  Edit2,
  Trash2,
  Eye,
  EyeOff,
  Save,
  X,
  Globe,
  Hash,
  Type,
  AlignLeft,
  Bold,
  Italic,
  List,
  Link as LinkIcon,
  Heading1,
  Heading2,
  Code,
  Loader2,
  AlertCircle,
  Check
} from 'lucide-react';
import { usePages, InstitutionalPage, CreatePageData } from '../../src/hooks/usePages';
import { useAdminAudit, ADMIN_ACTIONS, RESOURCE_TYPES } from '../../src/hooks/useAdminAudit';
import { useAuth } from '../../src/contexts/AuthContext';
import { toast } from 'sonner';
import { formatDistance } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const PagesManagement: React.FC = () => {
  const { pages, isLoading, createPage, updatePage, deletePage, togglePublished, validateSlug, generateSlug } = usePages();
  const { logAction } = useAdminAudit();
  const { user } = useAuth();
  
  const [showEditor, setShowEditor] = useState(false);
  const [editingPage, setEditingPage] = useState<InstitutionalPage | null>(null);
  const [formData, setFormData] = useState<CreatePageData>({
    title: '',
    slug: '',
    content: '',
    meta_title: '',
    meta_description: '',
    is_published: false
  });
  const [showPreview, setShowPreview] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  // Funções do Editor Rich Text
  const execCommand = (command: string, value?: string) => {
    document.execCommand(command, false, value);
    if (contentRef.current) {
      setFormData({ ...formData, content: contentRef.current.innerHTML });
    }
  };

  const insertLink = () => {
    const url = prompt('Digite a URL:');
    if (url) {
      execCommand('createLink', url);
    }
  };

  const handleTitleChange = (title: string) => {
    setFormData({
      ...formData,
      title,
      slug: editingPage ? formData.slug : generateSlug(title)
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user) {
      toast.error('Usuário não autenticado');
      return;
    }

    // Validações
    if (!formData.title || !formData.slug || !formData.content) {
      toast.error('Preencha todos os campos obrigatórios');
      return;
    }

    const slugValidation = validateSlug(formData.slug);
    if (!slugValidation.valid) {
      toast.error(slugValidation.error || 'Slug inválido');
      return;
    }

    try {
      if (editingPage) {
        const { error } = await updatePage(editingPage.id, formData, user.id);
        if (error) throw new Error(error);

        await logAction({
          action: ADMIN_ACTIONS.UPDATE_PAGE_CONTENT,
          resourceType: RESOURCE_TYPES.PAGE,
          resourceId: editingPage.id,
          newValue: { title: formData.title, slug: formData.slug },
          reason: 'Página atualizada via painel admin'
        });

        toast.success('Página atualizada com sucesso!');
      } else {
        const { data, error } = await createPage(formData, user.id);
        if (error) throw new Error(error);

        await logAction({
          action: ADMIN_ACTIONS.CREATE_PAGE,
          resourceType: RESOURCE_TYPES.PAGE,
          resourceId: data?.id || '',
          newValue: { title: formData.title, slug: formData.slug },
          reason: 'Nova página criada via painel admin'
        });

        toast.success('Página criada com sucesso!');
      }

      handleCloseEditor();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao salvar página');
    }
  };

  const handleEdit = (page: InstitutionalPage) => {
    setEditingPage(page);
    setFormData({
      title: page.title,
      slug: page.slug,
      content: page.content,
      meta_title: page.meta_title || '',
      meta_description: page.meta_description || '',
      is_published: page.is_published
    });
    setShowEditor(true);
  };

  const handleDelete = async (page: InstitutionalPage) => {
    if (!confirm(`Deletar página "${page.title}"? Esta ação não pode ser desfeita.`)) return;

    if (!user) return;

    try {
      const { error } = await deletePage(page.id);
      if (error) throw new Error(error);

      await logAction({
        action: ADMIN_ACTIONS.DELETE_PAGE,
        resourceType: RESOURCE_TYPES.PAGE,
        resourceId: page.id,
        oldValue: { title: page.title, slug: page.slug },
        reason: 'Página deletada via painel admin'
      });

      toast.success('Página deletada com sucesso!');
    } catch (err: any) {
      toast.error(err.message || 'Erro ao deletar página');
    }
  };

  const handleTogglePublished = async (page: InstitutionalPage) => {
    if (!user) return;

    try {
      const { error } = await togglePublished(page.id, page.is_published, user.id);
      if (error) throw new Error(error);

      await logAction({
        action: page.is_published ? ADMIN_ACTIONS.UNPUBLISH_PAGE : ADMIN_ACTIONS.PUBLISH_PAGE,
        resourceType: RESOURCE_TYPES.PAGE,
        resourceId: page.id,
        oldValue: { is_published: page.is_published },
        newValue: { is_published: !page.is_published },
        reason: page.is_published ? 'Página despublicada' : 'Página publicada'
      });

      toast.success(page.is_published ? 'Página despublicada' : 'Página publicada');
    } catch (err: any) {
      toast.error(err.message || 'Erro ao atualizar status');
    }
  };

  const handleCloseEditor = () => {
    setShowEditor(false);
    setEditingPage(null);
    setShowPreview(false);
    setFormData({
      title: '',
      slug: '',
      content: '',
      meta_title: '',
      meta_description: '',
      is_published: false
    });
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
          <h2 className="text-xl font-bold text-slate-900">Páginas Institucionais</h2>
          <p className="text-sm text-slate-600 mt-1">
            Gerencie páginas como Termos de Uso, Privacidade, etc.
          </p>
        </div>
        <button
          onClick={() => setShowEditor(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 transition-all shadow-md hover:shadow-lg"
        >
          <Plus className="w-4 h-4" />
          Nova Página
        </button>
      </div>

      {/* Lista de Páginas */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="text-left px-6 py-3 text-xs font-bold text-slate-600 uppercase tracking-wider">
                Título
              </th>
              <th className="text-left px-6 py-3 text-xs font-bold text-slate-600 uppercase tracking-wider">
                Slug
              </th>
              <th className="text-left px-6 py-3 text-xs font-bold text-slate-600 uppercase tracking-wider">
                Atualizado
              </th>
              <th className="text-left px-6 py-3 text-xs font-bold text-slate-600 uppercase tracking-wider">
                Status
              </th>
              <th className="text-right px-6 py-3 text-xs font-bold text-slate-600 uppercase tracking-wider">
                Ações
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {pages.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center">
                  <FileText className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                  <p className="text-slate-600">Nenhuma página cadastrada</p>
                </td>
              </tr>
            ) : (
              pages.map((page) => (
                <tr key={page.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-slate-400" />
                      <span className="font-semibold text-slate-900">{page.title}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <code className="px-2 py-1 bg-slate-100 text-slate-700 rounded text-xs font-mono">
                      /p/{page.slug}
                    </code>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-600">
                    {formatDistance(new Date(page.updated_at), new Date(), {
                      addSuffix: true,
                      locale: ptBR
                    })}
                  </td>
                  <td className="px-6 py-4">
                    {page.is_published ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-green-100 text-green-700 text-xs font-semibold rounded-full">
                        <Globe className="w-3 h-3" />
                        Publicado
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 text-slate-600 text-xs font-semibold rounded-full">
                        <FileText className="w-3 h-3" />
                        Rascunho
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => handleTogglePublished(page)}
                        className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                        title={page.is_published ? 'Despublicar' : 'Publicar'}
                      >
                        {page.is_published ? (
                          <EyeOff className="w-4 h-4 text-slate-600" />
                        ) : (
                          <Eye className="w-4 h-4 text-green-600" />
                        )}
                      </button>

                      <button
                        onClick={() => handleEdit(page)}
                        className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                        title="Editar"
                      >
                        <Edit2 className="w-4 h-4 text-slate-600" />
                      </button>

                      <button
                        onClick={() => handleDelete(page)}
                        className="p-2 hover:bg-red-50 rounded-lg transition-colors"
                        title="Deletar"
                      >
                        <Trash2 className="w-4 h-4 text-red-600" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Editor Modal */}
      {showEditor && (
        <div className="fixed inset-0 bg-black/50 flex items-start justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-6xl w-full my-8">
            {/* Header */}
            <div className="sticky top-0 bg-white border-b border-slate-200 p-6 flex items-center justify-between rounded-t-2xl">
              <h3 className="text-xl font-bold text-slate-900">
                {editingPage ? 'Editar Página' : 'Nova Página'}
              </h3>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowPreview(!showPreview)}
                  className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg font-semibold hover:bg-slate-50 transition-colors flex items-center gap-2"
                >
                  <Eye className="w-4 h-4" />
                  {showPreview ? 'Editor' : 'Preview'}
                </button>
                <button
                  onClick={handleCloseEditor}
                  className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-6">
              {/* Informações Básicas */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2">
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Título da Página *
                  </label>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={(e) => handleTitleChange(e.target.value)}
                    placeholder="Ex: Termos de Uso"
                    className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Slug (URL) *
                  </label>
                  <input
                    type="text"
                    value={formData.slug}
                    onChange={(e) => setFormData({ ...formData, slug: e.target.value.toLowerCase() })}
                    placeholder="termos-de-uso"
                    className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 font-mono text-sm"
                    required
                  />
                  <p className="text-xs text-slate-500 mt-1">
                    URL: /p/{formData.slug || '...'}
                  </p>
                </div>
              </div>

              {/* Editor de Conteúdo */}
              {!showPreview ? (
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Conteúdo *
                  </label>

                  {/* Toolbar */}
                  <div className="flex flex-wrap items-center gap-1 p-2 bg-slate-50 border border-slate-300 rounded-t-lg">
                    <button type="button" onClick={() => execCommand('formatBlock', '<h1>')} className="p-2 hover:bg-slate-200 rounded" title="Título 1">
                      <Heading1 className="w-4 h-4" />
                    </button>
                    <button type="button" onClick={() => execCommand('formatBlock', '<h2>')} className="p-2 hover:bg-slate-200 rounded" title="Título 2">
                      <Heading2 className="w-4 h-4" />
                    </button>
                    <div className="w-px h-6 bg-slate-300 mx-1"></div>
                    <button type="button" onClick={() => execCommand('bold')} className="p-2 hover:bg-slate-200 rounded" title="Negrito">
                      <Bold className="w-4 h-4" />
                    </button>
                    <button type="button" onClick={() => execCommand('italic')} className="p-2 hover:bg-slate-200 rounded" title="Itálico">
                      <Italic className="w-4 h-4" />
                    </button>
                    <div className="w-px h-6 bg-slate-300 mx-1"></div>
                    <button type="button" onClick={() => execCommand('insertUnorderedList')} className="p-2 hover:bg-slate-200 rounded" title="Lista">
                      <List className="w-4 h-4" />
                    </button>
                    <button type="button" onClick={insertLink} className="p-2 hover:bg-slate-200 rounded" title="Link">
                      <LinkIcon className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Content Editable */}
                  <div
                    ref={contentRef}
                    contentEditable
                    onInput={(e) => setFormData({ ...formData, content: e.currentTarget.innerHTML })}
                    dangerouslySetInnerHTML={{ __html: formData.content }}
                    className="w-full min-h-[400px] px-4 py-3 border border-t-0 border-slate-300 rounded-b-lg focus:outline-none focus:ring-2 focus:ring-green-500 prose prose-slate max-w-none"
                    style={{ whiteSpace: 'pre-wrap' }}
                  />
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Preview do Conteúdo
                  </label>
                  <div
                    className="w-full min-h-[400px] px-6 py-4 border border-slate-300 rounded-lg bg-white prose prose-slate max-w-none"
                    dangerouslySetInnerHTML={{ __html: formData.content }}
                  />
                </div>
              )}

              {/* SEO Sidepanel */}
              <div className="border border-slate-200 rounded-lg p-4 bg-blue-50">
                <h4 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
                  <Globe className="w-4 h-4 text-blue-600" />
                  SEO & Metadados
                </h4>

                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Meta Title
                    </label>
                    <input
                      type="text"
                      value={formData.meta_title}
                      onChange={(e) => setFormData({ ...formData, meta_title: e.target.value })}
                      placeholder={formData.title || "Título SEO"}
                      maxLength={60}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <p className="text-xs text-slate-500 mt-1">
                      {formData.meta_title.length}/60 caracteres
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Meta Description
                    </label>
                    <textarea
                      value={formData.meta_description}
                      onChange={(e) => setFormData({ ...formData, meta_description: e.target.value })}
                      placeholder="Descrição breve para motores de busca"
                      maxLength={160}
                      rows={3}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                    />
                    <p className="text-xs text-slate-500 mt-1">
                      {formData.meta_description.length}/160 caracteres
                    </p>
                  </div>
                </div>
              </div>

              {/* Toggle Publicado */}
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="is_published"
                  checked={formData.is_published}
                  onChange={(e) => setFormData({ ...formData, is_published: e.target.checked })}
                  className="w-5 h-5 text-green-600 rounded focus:ring-2 focus:ring-green-500"
                />
                <label htmlFor="is_published" className="text-sm font-medium text-slate-700">
                  Publicar página (visível no site)
                </label>
              </div>

              {/* Botões de Ação */}
              <div className="flex items-center gap-3 pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={handleCloseEditor}
                  className="flex-1 px-4 py-2.5 border border-slate-300 text-slate-700 rounded-lg font-semibold hover:bg-slate-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2.5 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 transition-colors flex items-center justify-center gap-2"
                >
                  <Save className="w-4 h-4" />
                  {editingPage ? 'Atualizar Página' : 'Criar Página'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default PagesManagement;
