import React, { useState } from 'react';
import {
  Image as ImageIcon,
  Plus,
  Edit2,
  Trash2,
  Eye,
  EyeOff,
  Upload,
  X,
  Check,
  AlertCircle,
  GripVertical,
  Loader2
} from 'lucide-react';
import { useBanners, HomeBanner } from '../../src/hooks/useBanners';
import { uploadBannerImage } from '../../src/services/bannerService';
import { toast } from 'sonner';

const BannersManagement: React.FC = () => {
  const { banners, isLoading, createBanner, updateBanner, deleteBanner, toggleActive } = useBanners();
  const [showForm, setShowForm] = useState(false);
  const [editingBanner, setEditingBanner] = useState<HomeBanner | null>(null);
  const [uploading, setUploading] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    badge_text: 'Destaque BWAGRO',
    title: '',
    subtitle: '',
    button_text: 'Ver Mais',
    button_link: '#/',
    image_url: '',
    sort_order: banners.length + 1,
    is_active: true
  });

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);

    try {
      const result = await uploadBannerImage(file);

      if (result.error) {
        toast.error(result.error);
        return;
      }

      setFormData({ ...formData, image_url: result.url || '' });
      setImagePreview(result.url);
      toast.success('Imagem otimizada e carregada com sucesso!');
    } catch (err: any) {
      toast.error('Erro ao fazer upload da imagem');
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.title || !formData.image_url) {
      toast.error('Preencha título e imagem');
      return;
    }

    try {
      if (editingBanner) {
        const { error } = await updateBanner(editingBanner.id, formData);
        if (error) throw new Error(error);
        toast.success('Banner atualizado com sucesso!');
      } else {
        const { error } = await createBanner(formData);
        if (error) throw new Error(error);
        toast.success('Banner criado com sucesso!');
      }

      handleCloseForm();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao salvar banner');
    }
  };

  const handleEdit = (banner: HomeBanner) => {
    setEditingBanner(banner);
    setFormData({
      badge_text: banner.badge_text,
      title: banner.title,
      subtitle: banner.subtitle || '',
      button_text: banner.button_text,
      button_link: banner.button_link,
      image_url: banner.image_url,
      sort_order: banner.sort_order,
      is_active: banner.is_active
    });
    setImagePreview(banner.image_url);
    setShowForm(true);
  };

  const handleDelete = async (banner: HomeBanner) => {
    if (!confirm(`Deletar "${banner.title}"?`)) return;

    try {
      const { error } = await deleteBanner(banner.id, banner.image_url);
      if (error) throw new Error(error);
      toast.success('Banner deletado com sucesso!');
    } catch (err: any) {
      toast.error(err.message || 'Erro ao deletar banner');
    }
  };

  const handleToggleActive = async (banner: HomeBanner) => {
    try {
      const { error } = await toggleActive(banner.id, banner.is_active);
      if (error) throw new Error(error);
      toast.success(banner.is_active ? 'Banner desativado' : 'Banner ativado');
    } catch (err: any) {
      toast.error(err.message || 'Erro ao atualizar status');
    }
  };

  const handleCloseForm = () => {
    setShowForm(false);
    setEditingBanner(null);
    setImagePreview(null);
    setFormData({
      badge_text: 'Destaque BWAGRO',
      title: '',
      subtitle: '',
      button_text: 'Ver Mais',
      button_link: '#/',
      image_url: '',
      sort_order: banners.length + 1,
      is_active: true
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
          <h2 className="text-xl font-bold text-slate-900">Banners da Home</h2>
          <p className="text-sm text-slate-600 mt-1">
            Gerencie os banners exibidos no slider principal
          </p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 transition-all shadow-md hover:shadow-lg"
        >
          <Plus className="w-4 h-4" />
          Novo Banner
        </button>
      </div>

      {/* Lista de Banners */}
      <div className="grid grid-cols-1 gap-4">
        {banners.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
            <ImageIcon className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-600">Nenhum banner cadastrado</p>
          </div>
        ) : (
          banners.map((banner) => (
            <div
              key={banner.id}
              className="bg-white rounded-xl border border-slate-200 overflow-hidden hover:shadow-md transition-all"
            >
              <div className="flex gap-4 p-4">
                {/* Drag Handle */}
                <div className="flex items-center text-slate-300 cursor-grab">
                  <GripVertical className="w-5 h-5" />
                </div>

                {/* Miniatura */}
                <div className="w-40 h-24 rounded-lg overflow-hidden bg-slate-100 flex-shrink-0">
                  <img
                    src={banner.image_url}
                    alt={banner.title}
                    className="w-full h-full object-cover"
                  />
                </div>

                {/* Informações */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-4 mb-2">
                    <div className="flex-1">
                      <h3 className="text-base font-bold text-slate-900 truncate">
                        {banner.title}
                      </h3>
                      <p className="text-sm text-slate-600 truncate">
                        {banner.subtitle}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-slate-500">
                        Ordem: {banner.sort_order}
                      </span>
                      {banner.is_active ? (
                        <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs font-semibold rounded">
                          Ativo
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 bg-slate-100 text-slate-600 text-xs font-semibold rounded">
                          Inativo
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <span className="px-2 py-1 bg-slate-50 rounded">
                      {banner.badge_text}
                    </span>
                    <span>•</span>
                    <span>{banner.button_text}</span>
                  </div>
                </div>

                {/* Ações */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleToggleActive(banner)}
                    className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                    title={banner.is_active ? 'Desativar' : 'Ativar'}
                  >
                    {banner.is_active ? (
                      <Eye className="w-4 h-4 text-green-600" />
                    ) : (
                      <EyeOff className="w-4 h-4 text-slate-400" />
                    )}
                  </button>

                  <button
                    onClick={() => handleEdit(banner)}
                    className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                    title="Editar"
                  >
                    <Edit2 className="w-4 h-4 text-slate-600" />
                  </button>

                  <button
                    onClick={() => handleDelete(banner)}
                    className="p-2 hover:bg-red-50 rounded-lg transition-colors"
                    title="Deletar"
                  >
                    <Trash2 className="w-4 h-4 text-red-600" />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Modal de Formulário */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-slate-200 p-6 flex items-center justify-between">
              <h3 className="text-xl font-bold text-slate-900">
                {editingBanner ? 'Editar Banner' : 'Novo Banner'}
              </h3>
              <button
                onClick={handleCloseForm}
                className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-6">
              {/* Upload de Imagem */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Imagem do Banner
                </label>
                
                {imagePreview ? (
                  <div className="relative">
                    <img
                      src={imagePreview}
                      alt="Preview"
                      className="w-full h-48 object-cover rounded-lg"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setImagePreview(null);
                        setFormData({ ...formData, image_url: '' });
                      }}
                      className="absolute top-2 right-2 p-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <label className="flex flex-col items-center justify-center w-full h-48 border-2 border-dashed border-slate-300 rounded-lg cursor-pointer hover:border-green-500 transition-colors bg-slate-50">
                    <div className="flex flex-col items-center justify-center pt-5 pb-6">
                      {uploading ? (
                        <Loader2 className="w-10 h-10 text-green-600 animate-spin mb-2" />
                      ) : (
                        <Upload className="w-10 h-10 text-slate-400 mb-2" />
                      )}
                      <p className="text-sm text-slate-600 font-medium">
                        {uploading ? 'Otimizando...' : 'Clique para fazer upload'}
                      </p>
                      <p className="text-xs text-slate-500 mt-1">
                        JPG, PNG ou WebP (máx 10MB)
                      </p>
                    </div>
                    <input
                      type="file"
                      className="hidden"
                      accept="image/jpeg,image/jpg,image/png,image/webp"
                      onChange={handleImageUpload}
                      disabled={uploading}
                    />
                  </label>
                )}
              </div>

              {/* Campos do Formulário */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Título Principal
                  </label>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    placeholder="Ex: O Campo em Movimento"
                    className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                    required
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Subtítulo/Descrição
                  </label>
                  <textarea
                    value={formData.subtitle}
                    onChange={(e) => setFormData({ ...formData, subtitle: e.target.value })}
                    placeholder="Ex: A maior vitrine do agronegócio brasileiro"
                    rows={2}
                    className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Texto do Badge
                  </label>
                  <input
                    type="text"
                    value={formData.badge_text}
                    onChange={(e) => setFormData({ ...formData, badge_text: e.target.value })}
                    placeholder="Ex: Destaque BWAGRO"
                    className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Ordem de Exibição
                  </label>
                  <input
                    type="number"
                    value={formData.sort_order}
                    onChange={(e) => setFormData({ ...formData, sort_order: parseInt(e.target.value) })}
                    min="1"
                    className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Texto do Botão
                  </label>
                  <input
                    type="text"
                    value={formData.button_text}
                    onChange={(e) => setFormData({ ...formData, button_text: e.target.value })}
                    placeholder="Ex: Explorar Agora"
                    className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Link do Botão
                  </label>
                  <input
                    type="text"
                    value={formData.button_link}
                    onChange={(e) => setFormData({ ...formData, button_link: e.target.value })}
                    placeholder="Ex: #/anuncios ou https://..."
                    className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                    required
                  />
                </div>
              </div>

              {/* Toggle Ativo */}
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="is_active"
                  checked={formData.is_active}
                  onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                  className="w-5 h-5 text-green-600 rounded focus:ring-2 focus:ring-green-500"
                />
                <label htmlFor="is_active" className="text-sm font-medium text-slate-700">
                  Banner ativo (visível no site)
                </label>
              </div>

              {/* Preview em Tempo Real */}
              {imagePreview && formData.title && (
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Preview do Banner
                  </label>
                  <div className="relative w-full h-48 rounded-lg overflow-hidden">
                    <div
                      className="absolute inset-0 bg-cover bg-center"
                      style={{ backgroundImage: `url(${imagePreview})` }}
                    >
                      <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/30 to-transparent"></div>
                    </div>
                    <div className="relative h-full px-6 flex flex-col justify-center items-start text-white">
                      <span className="inline-block px-3 py-1 bg-green-600 text-xs font-semibold tracking-widest uppercase rounded mb-2">
                        {formData.badge_text}
                      </span>
                      <h2 className="text-lg font-semibold mb-2 leading-tight max-w-2xl">
                        {formData.title}
                      </h2>
                      {formData.subtitle && (
                        <p className="text-sm text-gray-200 mb-3 max-w-xl">
                          {formData.subtitle}
                        </p>
                      )}
                      <button className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-semibold">
                        {formData.button_text}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Botões de Ação */}
              <div className="flex items-center gap-3 pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={handleCloseForm}
                  className="flex-1 px-4 py-2.5 border border-slate-300 text-slate-700 rounded-lg font-semibold hover:bg-slate-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={uploading || !formData.image_url}
                  className="flex-1 px-4 py-2.5 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  <Check className="w-4 h-4" />
                  {editingBanner ? 'Atualizar Banner' : 'Criar Banner'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default BannersManagement;
