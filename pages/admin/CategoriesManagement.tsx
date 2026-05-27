import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  FolderTree,
  ImagePlus,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Tag,
  Trash2,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { CATEGORY_HIERARCHY, getCategoryGroupBySlug, getCategoryGroupForCategorySlug } from '../../src/lib/categoryHierarchy';
import { getCategoryIconComponent } from '../../src/lib/categoryVisuals';
import { supabase } from '../../src/lib/supabaseClient';
import { ADMIN_ACTIONS, useAdminAudit } from '../../src/hooks/useAdminAudit';

interface CategoryRecord {
  id: string;
  name: string;
  slug: string;
  parent_group_slug?: string | null;
  icon_name?: string | null;
  sort_order?: number | null;
  is_active?: boolean | null;
}

interface CategorySubcategoryRecord {
  id: string;
  category_id: string;
  name: string;
  slug: string;
  sort_order?: number | null;
  is_active?: boolean | null;
}

const slugify = (value: string) =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const emptyCategoryForm = {
  name: '',
  slug: '',
  icon_name: '',
  sort_order: 0,
  is_active: true,
};

const emptySubcategoryForm = {
  name: '',
  slug: '',
  sort_order: 0,
  is_active: true,
};

const resolveGroupSlug = (category: CategoryRecord) =>
  category.parent_group_slug ||
  getCategoryGroupForCategorySlug(category.slug)?.slug ||
  getCategoryGroupBySlug(category.slug)?.slug ||
  '';

const CategoriesManagement: React.FC = () => {
  const { logAction } = useAdminAudit();
  const [loading, setLoading] = useState(true);
  const [savingCategory, setSavingCategory] = useState(false);
  const [savingSubcategory, setSavingSubcategory] = useState(false);
  const [categories, setCategories] = useState<CategoryRecord[]>([]);
  const [subcategories, setSubcategories] = useState<CategorySubcategoryRecord[]>([]);
  const [selectedGroupSlug, setSelectedGroupSlug] = useState(CATEGORY_HIERARCHY[0]?.slug || '');
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editingSubcategoryId, setEditingSubcategoryId] = useState<string | null>(null);
  const [categoryForm, setCategoryForm] = useState(emptyCategoryForm);
  const [subcategoryForm, setSubcategoryForm] = useState(emptySubcategoryForm);
  const [groupImages, setGroupImages] = useState<Record<string, string>>({});
  const [uploadingGroupSlug, setUploadingGroupSlug] = useState<string | null>(null);
  const uploadInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const groupedCategories = useMemo(
    () =>
      CATEGORY_HIERARCHY.map((group) => ({
        ...group,
        categories: categories.filter((category) => resolveGroupSlug(category) === group.slug),
      })),
    [categories]
  );

  const selectedGroup = useMemo(
    () => groupedCategories.find((group) => group.slug === selectedGroupSlug) || groupedCategories[0] || null,
    [groupedCategories, selectedGroupSlug]
  );

  const filteredSecondaryCategories = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    const rows = selectedGroup?.categories || [];

    if (!term) {
      return rows;
    }

    return rows.filter((category) => {
      return category.name.toLowerCase().includes(term) || category.slug.toLowerCase().includes(term);
    });
  }, [selectedGroup, searchTerm]);

  const selectedCategory = useMemo(
    () => categories.find((category) => category.id === selectedCategoryId) || null,
    [categories, selectedCategoryId]
  );

  const loadSubcategories = async (categoryId: string) => {
    if (!categoryId) {
      setSubcategories([]);
      return;
    }

    const { data, error } = await supabase
      .from('category_subcategories')
      .select('*')
      .eq('category_id', categoryId)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true });

    if (error) {
      console.error('[CategoriesManagement] Erro ao carregar subcategorias:', error);
      toast.error('Nao foi possivel carregar as subcategorias.');
      setSubcategories([]);
      return;
    }

    setSubcategories((data || []) as CategorySubcategoryRecord[]);
  };

  const loadCategories = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('categories')
        .select('id, name, slug, parent_group_slug, icon_name, sort_order, is_active')
        .order('parent_group_slug', { ascending: true })
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true });

      if (error) throw error;

      const rows = (data || []) as CategoryRecord[];
      setCategories(rows);
    } catch (error) {
      console.error('[CategoriesManagement] Erro ao carregar categorias:', error);
      toast.error('Nao foi possivel carregar as categorias.');
    } finally {
      setLoading(false);
    }
  };

  const loadGroupImages = async () => {
    const { data } = await supabase.from('category_group_images').select('slug, image_url');
    if (data) {
      const map: Record<string, string> = {};
      data.forEach((row) => { if (row.image_url) map[row.slug] = row.image_url; });
      setGroupImages(map);
    }
  };

  const handleGroupImageUpload = async (slug: string, file: File) => {
    setUploadingGroupSlug(slug);
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
      const path = `category-covers/${slug}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('layout_assets')
        .upload(path, file, { upsert: true });
      if (upErr) throw upErr;
      const { data: { publicUrl } } = supabase.storage.from('layout_assets').getPublicUrl(path);
      await supabase.from('category_group_images').upsert({ slug, image_url: publicUrl });
      setGroupImages((prev) => ({ ...prev, [slug]: publicUrl }));
      toast.success(`Imagem de ${slug} atualizada.`);
    } catch (err) {
      console.error('[CategoriesManagement] Erro ao enviar imagem do grupo:', err);
      toast.error('Nao foi possivel enviar a imagem.');
    } finally {
      setUploadingGroupSlug(null);
      if (uploadInputRefs.current[slug]) uploadInputRefs.current[slug]!.value = '';
    }
  };

  const handleRemoveGroupImage = async (slug: string) => {
    await supabase.from('category_group_images').upsert({ slug, image_url: '' });
    setGroupImages((prev) => { const next = { ...prev }; delete next[slug]; return next; });
    toast.success('Imagem removida.');
  };

  useEffect(() => {
    void loadCategories();
    void loadGroupImages();
  }, []);

  useEffect(() => {
    if (!selectedGroup) {
      setSelectedCategoryId('');
      setSubcategories([]);
      return;
    }

    const nextSelectedCategory =
      selectedCategoryId && selectedGroup.categories.some((category) => category.id === selectedCategoryId)
        ? selectedCategoryId
        : selectedGroup.categories[0]?.id || '';

    setSelectedCategoryId(nextSelectedCategory);
  }, [selectedGroup, selectedCategoryId]);

  useEffect(() => {
    if (selectedCategoryId) {
      void loadSubcategories(selectedCategoryId);
    } else {
      setSubcategories([]);
    }
  }, [selectedCategoryId]);

  const resetCategoryForm = () => {
    setEditingCategoryId(null);
    setCategoryForm(emptyCategoryForm);
  };

  const resetSubcategoryForm = () => {
    setEditingSubcategoryId(null);
    setSubcategoryForm(emptySubcategoryForm);
  };

  const handleEditCategory = (category: CategoryRecord) => {
    setEditingCategoryId(category.id);
    setCategoryForm({
      name: category.name,
      slug: category.slug,
      icon_name: category.icon_name || '',
      sort_order: Number(category.sort_order || 0),
      is_active: category.is_active ?? true,
    });
  };

  const handleEditSubcategory = (subcategory: CategorySubcategoryRecord) => {
    setEditingSubcategoryId(subcategory.id);
    setSubcategoryForm({
      name: subcategory.name,
      slug: subcategory.slug,
      sort_order: Number(subcategory.sort_order || 0),
      is_active: subcategory.is_active ?? true,
    });
  };

  const handleDeleteCategory = async (category: CategoryRecord) => {
    const confirmed = window.confirm(`Deseja excluir a categoria secundária "${category.name}"?`);
    if (!confirmed) return;

    try {
      const { count: subcategoryCount, error: subcategoryCountError } = await supabase
        .from('category_subcategories')
        .select('id', { count: 'exact', head: true })
        .eq('category_id', category.id);

      if (subcategoryCountError) throw subcategoryCountError;

      if ((subcategoryCount || 0) > 0) {
        toast.error('Exclua as subcategorias vinculadas antes de remover esta categoria.');
        return;
      }

      const { count: adsCount, error: adsCountError } = await supabase
        .from('announcements')
        .select('id', { count: 'exact', head: true })
        .eq('category_id', category.id);

      if (adsCountError) throw adsCountError;

      if ((adsCount || 0) > 0) {
        toast.error('Não é possível excluir uma categoria com anúncios vinculados.');
        return;
      }

      const { error } = await supabase.from('categories').delete().eq('id', category.id);
      if (error) throw error;

      await logAction({
        action: ADMIN_ACTIONS.DELETE_PAGE,
        resourceType: 'category',
        resourceId: category.id,
        previousValue: category,
        reason: `Categoria secundaria ${category.name} excluida de ${selectedGroup?.name || 'grupo desconhecido'}`,
      });

      if (selectedCategoryId === category.id) {
        setSelectedCategoryId('');
        setSubcategories([]);
      }

      if (editingCategoryId === category.id) {
        resetCategoryForm();
      }

      toast.success('Categoria secundaria excluída com sucesso.');
      await loadCategories();
    } catch (error) {
      console.error('[CategoriesManagement] Erro ao excluir categoria secundaria:', error);
      toast.error('Não foi possível excluir a categoria secundaria.');
    }
  };

  const handleDeleteSubcategory = async (subcategory: CategorySubcategoryRecord) => {
    const confirmed = window.confirm(`Deseja excluir a subcategoria "${subcategory.name}"?`);
    if (!confirmed) return;

    try {
      const { count: adsCount, error: adsCountError } = await supabase
        .from('announcements')
        .select('id', { count: 'exact', head: true })
        .eq('sub_category_id', subcategory.id);

      if (adsCountError) throw adsCountError;

      if ((adsCount || 0) > 0) {
        toast.error('Não é possível excluir uma subcategoria já utilizada em anúncios.');
        return;
      }

      const { error } = await supabase.from('category_subcategories').delete().eq('id', subcategory.id);
      if (error) throw error;

      await logAction({
        action: ADMIN_ACTIONS.DELETE_PAGE,
        resourceType: 'category_subcategory',
        resourceId: subcategory.id,
        previousValue: subcategory,
        reason: `Subcategoria ${subcategory.name} excluida de ${selectedCategory?.name || 'categoria desconhecida'}`,
      });

      if (editingSubcategoryId === subcategory.id) {
        resetSubcategoryForm();
      }

      toast.success('Subcategoria excluída com sucesso.');
      await loadSubcategories(selectedCategoryId);
    } catch (error) {
      console.error('[CategoriesManagement] Erro ao excluir subcategoria:', error);
      toast.error('Não foi possível excluir a subcategoria.');
    }
  };

  const handleSaveCategory = async () => {
    if (!selectedGroup) {
      toast.error('Selecione um grupo principal para continuar.');
      return;
    }

    const payload = {
      name: categoryForm.name.trim(),
      slug: slugify(categoryForm.slug || categoryForm.name),
      parent_group_slug: selectedGroup.slug,
      icon_name: categoryForm.icon_name.trim() || null,
      sort_order: Number(categoryForm.sort_order) || 0,
      is_active: categoryForm.is_active,
    };

    if (!payload.name || !payload.slug) {
      toast.error('Preencha nome e slug da categoria secundaria.');
      return;
    }

    try {
      setSavingCategory(true);

      if (editingCategoryId) {
        const { error } = await supabase.from('categories').update(payload).eq('id', editingCategoryId);
        if (error) throw error;

        await logAction({
          action: ADMIN_ACTIONS.UPDATE_PAGE_CONTENT,
          resourceType: 'category',
          resourceId: editingCategoryId,
          newValue: payload,
          reason: `Categoria secundaria ${payload.name} atualizada em ${selectedGroup.name}`,
        });

        toast.success('Categoria secundaria atualizada com sucesso.');
      } else {
        const { data, error } = await supabase.from('categories').insert(payload).select('id').single();
        if (error) throw error;

        await logAction({
          action: ADMIN_ACTIONS.CREATE_PAGE,
          resourceType: 'category',
          resourceId: data.id,
          newValue: payload,
          reason: `Categoria secundaria ${payload.name} criada em ${selectedGroup.name}`,
        });

        toast.success('Categoria secundaria criada com sucesso.');
      }

      resetCategoryForm();
      await loadCategories();
    } catch (error) {
      console.error('[CategoriesManagement] Erro ao salvar categoria secundaria:', error);
      toast.error('Nao foi possivel salvar a categoria secundaria.');
    } finally {
      setSavingCategory(false);
    }
  };

  const handleSaveSubcategory = async () => {
    if (!selectedCategoryId) {
      toast.error('Selecione uma categoria secundaria para gerenciar as subcategorias.');
      return;
    }

    const payload = {
      category_id: selectedCategoryId,
      name: subcategoryForm.name.trim(),
      slug: slugify(subcategoryForm.slug || subcategoryForm.name),
      sort_order: Number(subcategoryForm.sort_order) || 0,
      is_active: subcategoryForm.is_active,
    };

    if (!payload.name || !payload.slug) {
      toast.error('Preencha nome e slug da subcategoria.');
      return;
    }

    try {
      setSavingSubcategory(true);

      if (editingSubcategoryId) {
        const { error } = await supabase.from('category_subcategories').update(payload).eq('id', editingSubcategoryId);
        if (error) throw error;
        toast.success('Subcategoria atualizada com sucesso.');
      } else {
        const { error } = await supabase.from('category_subcategories').insert(payload);
        if (error) throw error;
        toast.success('Subcategoria criada com sucesso.');
      }

      resetSubcategoryForm();
      await loadSubcategories(selectedCategoryId);
    } catch (error) {
      console.error('[CategoriesManagement] Erro ao salvar subcategoria:', error);
      toast.error('Nao foi possivel salvar a subcategoria.');
    } finally {
      setSavingSubcategory(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-black text-slate-900">Categorias</h1>
          <p className="mt-1 text-slate-500">
            Gerencie os 6 grupos principais, as categorias secundarias e suas subcategorias.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            void loadCategories();
          }}
          className="inline-flex items-center gap-2 rounded-lg bg-green-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-green-600"
        >
          <RefreshCw className="h-4 w-4" />
          Atualizar
        </button>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="mb-4">
          <h2 className="text-lg font-black text-slate-900">Grupos principais</h2>
          <p className="text-sm text-slate-500">
            Esses 6 grupos seguem a mesma logica da primeira etapa de anuncio.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {groupedCategories.map((group) => {
            const Icon = getCategoryIconComponent(undefined, group.slug);
            const isSelected = group.slug === selectedGroup?.slug;
            const coverUrl = groupImages[group.slug];
            const isUploading = uploadingGroupSlug === group.slug;

            return (
              <div
                key={group.slug}
                className={`rounded-2xl border text-left transition-all overflow-hidden ${
                  isSelected
                    ? 'border-green-500 bg-green-50 shadow-sm'
                    : 'border-slate-200 bg-white hover:border-green-200'
                }`}
              >
                {/* Área clicável para selecionar o grupo */}
                <button
                  type="button"
                  onClick={() => {
                    setSelectedGroupSlug(group.slug);
                    resetCategoryForm();
                    resetSubcategoryForm();
                  }}
                  className="w-full px-5 pt-5 pb-3 text-left"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${isSelected ? 'bg-white text-green-700' : 'bg-slate-50 text-slate-600'}`}>
                      <Icon className="h-6 w-6" strokeWidth={1.8} />
                    </div>
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-slate-600">
                      {group.categories.length} categoria{group.categories.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <h3 className="mt-4 text-lg font-black text-slate-900">{group.name}</h3>
                  <p className="mt-1 text-sm text-slate-500">
                    Selecione para editar as categorias internas e subcategorias.
                  </p>
                </button>

                {/* Imagem de capa do card público */}
                <div className="px-5 pb-5 pt-3 border-t border-slate-100">
                  <p className="mb-2 text-[11px] font-bold uppercase tracking-widest text-slate-400">Imagem do card</p>
                  {coverUrl ? (
                    <div className="relative h-28 w-full overflow-hidden rounded-xl">
                      <img src={coverUrl} alt={group.name} className="h-full w-full object-cover" />
                      {/* overlay hover para trocar */}
                      <label className="absolute inset-0 flex cursor-pointer flex-col items-center justify-center gap-1 bg-black/50 opacity-0 transition-opacity hover:opacity-100">
                        <ImagePlus className="h-5 w-5 text-white" />
                        <span className="text-xs font-semibold text-white">Trocar</span>
                        <input
                          type="file"
                          accept="image/*"
                          className="sr-only"
                          ref={(el) => { uploadInputRefs.current[group.slug] = el; }}
                          onChange={(e) => { if (e.target.files?.[0]) void handleGroupImageUpload(group.slug, e.target.files[0]); }}
                          disabled={isUploading}
                        />
                      </label>
                      {/* botão remover */}
                      <button
                        type="button"
                        onClick={() => void handleRemoveGroupImage(group.slug)}
                        className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white transition-colors hover:bg-red-600"
                        title="Remover imagem"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                      {/* overlay de upload */}
                      {isUploading && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                          <Loader2 className="h-6 w-6 animate-spin text-white" />
                        </div>
                      )}
                    </div>
                  ) : (
                    <label className={`flex h-20 w-full cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed transition-colors ${
                      isUploading ? 'border-green-400 text-green-600' : 'border-slate-300 text-slate-400 hover:border-green-400 hover:text-green-600'
                    }`}>
                      {isUploading ? (
                        <><Loader2 className="h-4 w-4 animate-spin" /><span className="text-sm font-medium">Enviando...</span></>
                      ) : (
                        <><ImagePlus className="h-4 w-4" /><span className="text-sm font-medium">Adicionar imagem</span></>
                      )}
                      <input
                        type="file"
                        accept="image/*"
                        className="sr-only"
                        ref={(el) => { uploadInputRefs.current[group.slug] = el; }}
                        onChange={(e) => { if (e.target.files?.[0]) void handleGroupImageUpload(group.slug, e.target.files[0]); }}
                        disabled={isUploading}
                      />
                    </label>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <section className="space-y-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="mb-4 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-lg font-black text-slate-900">
                  {selectedGroup ? `Categorias de ${selectedGroup.name}` : 'Categorias secundarias'}
                </h2>
                <p className="text-sm text-slate-500">
                  Essas categorias aparecem na segunda etapa do anuncio.
                </p>
              </div>

              <div className="relative flex-1 lg:max-w-sm">
                <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Buscar categoria secundaria..."
                  className="w-full rounded-xl border border-slate-200 py-2.5 pl-10 pr-4 focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
            </div>

            <div className="space-y-3">
              {loading ? (
                <div className="py-12 text-center">
                  <div className="mx-auto h-8 w-8 animate-spin rounded-full border-b-2 border-green-600" />
                </div>
              ) : filteredSecondaryCategories.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500">
                  Nenhuma categoria secundaria encontrada neste grupo.
                </div>
              ) : (
                filteredSecondaryCategories.map((category) => {
                  const isSelected = category.id === selectedCategoryId;
                  const Icon = getCategoryIconComponent(category.icon_name, category.slug);

                  return (
                    <div
                      key={category.id}
                      className={`flex items-center justify-between rounded-2xl border px-4 py-3 transition-colors ${
                        isSelected ? 'border-green-400 bg-green-50' : 'border-slate-200 bg-white'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedCategoryId(category.id);
                          resetSubcategoryForm();
                        }}
                        className="flex flex-1 items-center gap-3 text-left"
                      >
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
                          <Icon className="h-5 w-5" strokeWidth={1.7} />
                        </div>
                        <div>
                          <p className="font-semibold text-slate-900">{category.name}</p>
                          <p className="text-xs text-slate-400">
                            {category.slug} · ordem {Number(category.sort_order || 0)}
                          </p>
                        </div>
                      </button>

                      <div className="flex items-center gap-3">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                            category.is_active ?? true ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {(category.is_active ?? true) ? 'Ativa' : 'Inativa'}
                        </span>
                        <button
                          type="button"
                          onClick={() => void handleDeleteCategory(category)}
                          className="inline-flex items-center gap-2 rounded-lg border border-red-200 px-3 py-2 text-sm font-semibold text-red-700 transition-colors hover:bg-red-50"
                        >
                          <Trash2 className="h-4 w-4" />
                          Excluir
                        </button>
                        <button
                          type="button"
                          onClick={() => handleEditCategory(category)}
                          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
                        >
                          <Pencil className="h-4 w-4" />
                          Editar
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-black text-slate-900">Subcategorias</h2>
                <p className="text-sm text-slate-500">
                  {selectedCategory
                    ? `Itens internos de ${selectedCategory.name}.`
                    : 'Selecione uma categoria secundaria para ver as subcategorias.'}
                </p>
              </div>
              <button
                type="button"
                onClick={resetSubcategoryForm}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
              >
                <Plus className="h-4 w-4" />
                Nova
              </button>
            </div>

            <div className="space-y-3">
              {subcategories.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500">
                  Nenhuma subcategoria cadastrada para esta categoria secundaria.
                </div>
              ) : (
                subcategories.map((subcategory) => (
                  <div
                    key={subcategory.id}
                    className="flex items-center justify-between rounded-2xl border border-slate-200 px-4 py-3"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
                        <Tag className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="font-semibold text-slate-900">{subcategory.name}</p>
                        <p className="text-xs text-slate-400">
                          {subcategory.slug} · ordem {Number(subcategory.sort_order || 0)}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                          subcategory.is_active ?? true
                            ? 'bg-green-100 text-green-800'
                            : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {(subcategory.is_active ?? true) ? 'Ativa' : 'Inativa'}
                      </span>
                      <button
                        type="button"
                        onClick={() => void handleDeleteSubcategory(subcategory)}
                        className="inline-flex items-center gap-2 rounded-lg border border-red-200 px-3 py-2 text-sm font-semibold text-red-700 transition-colors hover:bg-red-50"
                      >
                        <Trash2 className="h-4 w-4" />
                        Excluir
                      </button>
                      <button
                        type="button"
                        onClick={() => handleEditSubcategory(subcategory)}
                        className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
                      >
                        <Pencil className="h-4 w-4" />
                        Editar
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>

        <section className="space-y-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-black text-slate-900">
                  {editingCategoryId ? 'Editar categoria secundaria' : 'Nova categoria secundaria'}
                </h2>
                <p className="text-sm text-slate-500">
                  {selectedGroup ? `Essa categoria sera vinculada a ${selectedGroup.name}.` : 'Selecione um grupo principal.'}
                </p>
              </div>
              <button
                type="button"
                onClick={resetCategoryForm}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
              >
                <Plus className="h-4 w-4" />
                Nova
              </button>
            </div>

            <div className="space-y-4">
              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-slate-700">Grupo principal</span>
                <input
                  type="text"
                  disabled
                  value={selectedGroup?.name || ''}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-500"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-slate-700">Nome</span>
                <input
                  type="text"
                  value={categoryForm.name}
                  onChange={(event) => {
                    const nextName = event.target.value;
                    setCategoryForm((current) => ({
                      ...current,
                      name: nextName,
                      slug: editingCategoryId ? current.slug : slugify(nextName),
                    }));
                  }}
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-slate-700">Slug</span>
                <input
                  type="text"
                  value={categoryForm.slug}
                  onChange={(event) =>
                    setCategoryForm((current) => ({ ...current, slug: slugify(event.target.value) }))
                  }
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </label>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="block">
                  <span className="mb-2 block text-sm font-semibold text-slate-700">Icone</span>
                  <input
                    type="text"
                    value={categoryForm.icon_name}
                    onChange={(event) =>
                      setCategoryForm((current) => ({ ...current, icon_name: event.target.value }))
                    }
                    placeholder="ex: Cog"
                    className="w-full rounded-xl border border-slate-200 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-semibold text-slate-700">Ordem</span>
                  <input
                    type="number"
                    min="0"
                    value={categoryForm.sort_order}
                    onChange={(event) =>
                      setCategoryForm((current) => ({
                        ...current,
                        sort_order: Number(event.target.value) || 0,
                      }))
                    }
                    className="w-full rounded-xl border border-slate-200 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                </label>
              </div>

              <label className="flex items-center gap-3 rounded-xl border border-slate-200 px-4 py-3">
                <input
                  type="checkbox"
                  checked={categoryForm.is_active}
                  onChange={(event) =>
                    setCategoryForm((current) => ({ ...current, is_active: event.target.checked }))
                  }
                  className="h-4 w-4 rounded border-slate-300 text-green-600 focus:ring-green-500"
                />
                <span className="text-sm font-semibold text-slate-700">Categoria secundaria ativa</span>
              </label>

              <button
                type="button"
                onClick={() => {
                  void handleSaveCategory();
                }}
                disabled={savingCategory}
                className="w-full rounded-xl bg-green-500 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-green-600 disabled:opacity-50"
              >
                {savingCategory
                  ? 'Salvando...'
                  : editingCategoryId
                    ? 'Atualizar categoria secundaria'
                    : 'Criar categoria secundaria'}
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-black text-slate-900">
                  {editingSubcategoryId ? 'Editar subcategoria' : 'Nova subcategoria'}
                </h2>
                <p className="text-sm text-slate-500">
                  {selectedCategory ? `Vinculada a ${selectedCategory.name}.` : 'Selecione uma categoria secundaria.'}
                </p>
              </div>
              <button
                type="button"
                onClick={resetSubcategoryForm}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
              >
                <Plus className="h-4 w-4" />
                Nova
              </button>
            </div>

            <div className="space-y-4">
              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-slate-700">Categoria secundaria</span>
                <input
                  type="text"
                  disabled
                  value={selectedCategory?.name || ''}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-500"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-slate-700">Nome</span>
                <input
                  type="text"
                  value={subcategoryForm.name}
                  onChange={(event) => {
                    const nextName = event.target.value;
                    setSubcategoryForm((current) => ({
                      ...current,
                      name: nextName,
                      slug: editingSubcategoryId ? current.slug : slugify(nextName),
                    }));
                  }}
                  disabled={!selectedCategoryId}
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-green-500 disabled:bg-slate-50"
                />
              </label>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="block">
                  <span className="mb-2 block text-sm font-semibold text-slate-700">Slug</span>
                  <input
                    type="text"
                    value={subcategoryForm.slug}
                    onChange={(event) =>
                      setSubcategoryForm((current) => ({ ...current, slug: slugify(event.target.value) }))
                    }
                    disabled={!selectedCategoryId}
                    className="w-full rounded-xl border border-slate-200 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-green-500 disabled:bg-slate-50"
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-semibold text-slate-700">Ordem</span>
                  <input
                    type="number"
                    min="0"
                    value={subcategoryForm.sort_order}
                    onChange={(event) =>
                      setSubcategoryForm((current) => ({
                        ...current,
                        sort_order: Number(event.target.value) || 0,
                      }))
                    }
                    disabled={!selectedCategoryId}
                    className="w-full rounded-xl border border-slate-200 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-green-500 disabled:bg-slate-50"
                  />
                </label>
              </div>

              <label className="flex items-center gap-3 rounded-xl border border-slate-200 px-4 py-3">
                <input
                  type="checkbox"
                  checked={subcategoryForm.is_active}
                  onChange={(event) =>
                    setSubcategoryForm((current) => ({ ...current, is_active: event.target.checked }))
                  }
                  disabled={!selectedCategoryId}
                  className="h-4 w-4 rounded border-slate-300 text-green-600 focus:ring-green-500"
                />
                <span className="text-sm font-semibold text-slate-700">Subcategoria ativa</span>
              </label>

              <button
                type="button"
                onClick={() => {
                  void handleSaveSubcategory();
                }}
                disabled={!selectedCategoryId || savingSubcategory}
                className="w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:opacity-50"
              >
                {savingSubcategory
                  ? 'Salvando...'
                  : editingSubcategoryId
                    ? 'Atualizar subcategoria'
                    : 'Criar subcategoria'}
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

export default CategoriesManagement;
