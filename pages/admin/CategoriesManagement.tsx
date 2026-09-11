import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
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
import { isValidCategoryGroupSlug, normalizeCategoryGroupSlug } from '../../src/lib/categoryGroups';
import type { CategoryGroup } from '../../src/lib/categoryGroups';
import {
  CATEGORY_ICON_OPTIONS,
  getCategoryIconComponent,
  getCategoryIconOption,
} from '../../src/lib/categoryVisuals';
import { supabase } from '../../src/lib/supabaseClient';
import { ADMIN_ACTIONS, RESOURCE_TYPES, useAdminAudit } from '../../src/hooks/useAdminAudit';
import { useCategoryGroupCatalog } from '../../src/hooks/useCategoryGroupCatalog';
import { appError } from '../../src/utils/appLogger';

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

const emptyGroupForm = {
  name: '',
  slug: '',
  icon_name: 'Package',
  sort_order: 0,
  is_active: true,
};

const CategoriesManagement: React.FC = () => {
  const { logAction } = useAdminAudit();
  const {
    groups: categoryGroups,
    isLoading: loadingGroups,
    isFallback: groupsAreFallback,
    reload: reloadGroups,
    findGroupForCategorySlug,
  } = useCategoryGroupCatalog({ includeInactive: true });
  const [loading, setLoading] = useState(true);
  const [savingGroup, setSavingGroup] = useState(false);
  const [savingCategory, setSavingCategory] = useState(false);
  const [savingSubcategory, setSavingSubcategory] = useState(false);
  const [categories, setCategories] = useState<CategoryRecord[]>([]);
  const [subcategories, setSubcategories] = useState<CategorySubcategoryRecord[]>([]);
  const [selectedGroupSlug, setSelectedGroupSlug] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editingSubcategoryId, setEditingSubcategoryId] = useState<string | null>(null);
  const [categoryForm, setCategoryForm] = useState(emptyCategoryForm);
  const [subcategoryForm, setSubcategoryForm] = useState(emptySubcategoryForm);
  const [groupForm, setGroupForm] = useState(emptyGroupForm);
  const [showGroupForm, setShowGroupForm] = useState(false);
  const [showIconPicker, setShowIconPicker] = useState(false);
  const [iconSearchTerm, setIconSearchTerm] = useState('');
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [groupImages, setGroupImages] = useState<Record<string, string>>({});
  const [uploadingGroupSlug, setUploadingGroupSlug] = useState<string | null>(null);
  const uploadInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const groupedCategories = useMemo(
    () =>
      categoryGroups.map((group) => ({
        ...group,
        categories: categories.filter((category) =>
          (category.parent_group_slug || findGroupForCategorySlug(category.slug)?.slug || '') === group.slug
        ),
      })),
    [categories, categoryGroups, findGroupForCategorySlug]
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
      appError('[CategoriesManagement] Erro ao carregar subcategorias', error);
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
      appError('[CategoriesManagement] Erro ao carregar categorias', error);
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
      appError('[CategoriesManagement] Erro ao enviar imagem do grupo', err);
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
    if (categoryGroups.length === 0) {
      setSelectedGroupSlug('');
      return;
    }

    if (!categoryGroups.some((group) => group.slug === selectedGroupSlug)) {
      setSelectedGroupSlug(categoryGroups[0].slug);
    }
  }, [categoryGroups, selectedGroupSlug]);

  useEffect(() => {
    if (!showGroupForm) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !savingGroup) {
        setShowGroupForm(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [savingGroup, showGroupForm]);

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

  const openGroupForm = () => {
    const nextSortOrder = categoryGroups.reduce(
      (highest, group) => Math.max(highest, group.sortOrder),
      0
    ) + 1;

    setGroupForm({ ...emptyGroupForm, sort_order: nextSortOrder });
    setEditingGroupId(null);
    setShowIconPicker(false);
    setIconSearchTerm('');
    setShowGroupForm(true);
  };

  const openGroupEditForm = (group: CategoryGroup) => {
    if (!group.id || groupsAreFallback) return;

    setGroupForm({
      name: group.name,
      slug: group.slug,
      icon_name: group.iconName || 'Package',
      sort_order: group.sortOrder,
      is_active: group.isActive,
    });
    setEditingGroupId(group.id);
    setShowIconPicker(false);
    setIconSearchTerm('');
    setShowGroupForm(true);
  };

  const closeGroupForm = () => {
    if (savingGroup) return;
    setShowGroupForm(false);
    setEditingGroupId(null);
    setGroupForm(emptyGroupForm);
    setShowIconPicker(false);
    setIconSearchTerm('');
  };

  const handleSaveGroup = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (groupsAreFallback) {
      toast.error('A base dinamica de grupos ainda nao esta disponivel. Aplique a migracao da etapa 1.');
      return;
    }

    const payload = {
      name: groupForm.name.trim(),
      slug: normalizeCategoryGroupSlug(groupForm.slug || groupForm.name),
      icon_name: groupForm.icon_name || null,
      sort_order: Math.max(0, Math.trunc(Number(groupForm.sort_order) || 0)),
      is_active: groupForm.is_active,
    };

    if (!payload.name || payload.name.length > 80) {
      toast.error('Informe um nome de ate 80 caracteres.');
      return;
    }

    if (!isValidCategoryGroupSlug(payload.slug)) {
      toast.error('O slug deve conter apenas letras minusculas, numeros e hifens.');
      return;
    }

    if (categoryGroups.some((group) => group.slug === payload.slug && group.id !== editingGroupId)) {
      toast.error('Ja existe um grupo principal com esse slug.');
      return;
    }

    try {
      setSavingGroup(true);
      const existingGroup = editingGroupId
        ? categoryGroups.find((group) => group.id === editingGroupId) || null
        : null;
      const query = editingGroupId
        ? supabase.from('category_groups').update({
            name: payload.name,
            icon_name: payload.icon_name,
            sort_order: payload.sort_order,
            is_active: payload.is_active,
          }).eq('id', editingGroupId)
        : supabase.from('category_groups').insert(payload);
      const { data, error } = await query
        .select('id, name, slug, sort_order, icon_name, is_active')
        .single();

      if (error) throw error;

      await logAction({
        action: editingGroupId
          ? ADMIN_ACTIONS.UPDATE_CATEGORY_GROUP
          : ADMIN_ACTIONS.CREATE_CATEGORY_GROUP,
        resourceType: RESOURCE_TYPES.CATEGORY_GROUP,
        resourceId: data.id,
        oldValue: existingGroup ? {
          name: existingGroup.name,
          slug: existingGroup.slug,
          icon_name: existingGroup.iconName,
          sort_order: existingGroup.sortOrder,
          is_active: existingGroup.isActive,
        } : null,
        newValue: payload,
        reason: editingGroupId
          ? `Grupo principal ${payload.name} atualizado`
          : `Grupo principal ${payload.name} criado`,
      });

      setSelectedGroupSlug(data.slug);
      setShowGroupForm(false);
      setEditingGroupId(null);
      setGroupForm(emptyGroupForm);
      reloadGroups();
      toast.success(
        editingGroupId
          ? 'Grupo principal atualizado com sucesso.'
          : 'Grupo principal criado com sucesso.'
      );
    } catch (error) {
      appError('[CategoriesManagement] Erro ao criar grupo principal', error);
      const errorCode = typeof error === 'object' && error !== null && 'code' in error
        ? String(error.code)
        : '';
      toast.error(
        errorCode === '23505'
          ? 'Ja existe um grupo principal com esse slug.'
          : 'Nao foi possivel criar o grupo principal.'
      );
    } finally {
      setSavingGroup(false);
    }
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
        oldValue: category,
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
      appError('[CategoriesManagement] Erro ao excluir categoria secundaria', error);
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
        oldValue: subcategory,
        reason: `Subcategoria ${subcategory.name} excluida de ${selectedCategory?.name || 'categoria desconhecida'}`,
      });

      if (editingSubcategoryId === subcategory.id) {
        resetSubcategoryForm();
      }

      toast.success('Subcategoria excluída com sucesso.');
      await loadSubcategories(selectedCategoryId);
    } catch (error) {
      appError('[CategoriesManagement] Erro ao excluir subcategoria', error);
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
      appError('[CategoriesManagement] Erro ao salvar categoria secundaria', error);
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
      appError('[CategoriesManagement] Erro ao salvar subcategoria', error);
      toast.error('Nao foi possivel salvar a subcategoria.');
    } finally {
      setSavingSubcategory(false);
    }
  };

  const GroupFormIcon = getCategoryIconComponent(groupForm.icon_name, groupForm.slug);
  const selectedGroupIcon = getCategoryIconOption(groupForm.icon_name);
  const normalizedIconSearch = slugify(iconSearchTerm);
  const filteredGroupIconOptions = CATEGORY_ICON_OPTIONS.filter((option) => {
    if (!normalizedIconSearch) return true;

    return slugify([option.label, option.value, ...option.keywords].join(' '))
      .includes(normalizedIconSearch);
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-black text-slate-900">Categorias</h1>
          <p className="mt-1 text-slate-500">
            Gerencie os grupos principais, as categorias secundarias e suas subcategorias.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            void loadCategories();
            void loadGroupImages();
            reloadGroups();
          }}
          className="inline-flex items-center gap-2 rounded-lg bg-green-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-green-600"
        >
          <RefreshCw className="h-4 w-4" />
          Atualizar
        </button>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-black text-slate-900">Grupos principais</h2>
            <p className="text-sm text-slate-500">
              {categoryGroups.length} grupo{categoryGroups.length !== 1 ? 's' : ''} cadastrado{categoryGroups.length !== 1 ? 's' : ''} para a primeira etapa do anuncio.
            </p>
          </div>

          <button
            type="button"
            onClick={openGroupForm}
            disabled={loadingGroups || groupsAreFallback}
            title={groupsAreFallback ? 'Aplique a migracao da etapa 1 para liberar novos grupos.' : undefined}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            Novo grupo principal
          </button>
        </div>

        {groupsAreFallback && (
          <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Exibindo os grupos legados. A criacao sera liberada apos aplicar a migracao da etapa 1.
          </div>
        )}

        {loadingGroups ? (
          <div className="flex min-h-48 items-center justify-center">
            <Loader2 className="h-7 w-7 animate-spin text-green-600" />
          </div>
        ) : groupedCategories.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 px-4 py-12 text-center text-sm text-slate-500">
            Nenhum grupo principal cadastrado.
          </div>
        ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {groupedCategories.map((group) => {
            const Icon = getCategoryIconComponent(group.iconName, group.slug);
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
                    <div className="flex flex-col items-end gap-2">
                      {!group.isActive && (
                        <span className="rounded-full bg-amber-100 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-amber-800">
                          Inativo
                        </span>
                      )}
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-slate-600">
                        {group.categories.length} categoria{group.categories.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                  </div>
                  <h3 className="mt-4 text-lg font-black text-slate-900">{group.name}</h3>
                  <p className="mt-1 text-sm text-slate-500">
                    Selecione para editar as categorias internas e subcategorias.
                  </p>
                </button>

                {/* Imagem de capa do card público */}
                <div className="px-5 pb-5 pt-3 border-t border-slate-100">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Imagem do card</p>
                    <button
                      type="button"
                      onClick={() => openGroupEditForm(group)}
                      disabled={!group.id || groupsAreFallback}
                      className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      Editar grupo
                    </button>
                  </div>
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
        )}
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

      {showGroupForm && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/60 p-4 backdrop-blur-sm sm:items-center"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) closeGroupForm();
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-category-group-title"
            className="w-full max-w-xl overflow-hidden rounded-3xl border border-white/20 bg-white shadow-2xl"
          >
            <div className="relative overflow-hidden bg-slate-950 px-6 py-6 text-white sm:px-8">
              <div className="absolute -right-12 -top-16 h-40 w-40 rounded-full bg-green-400/20 blur-2xl" />
              <div className="relative flex items-start justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-green-400 text-slate-950">
                    <FolderTree className="h-6 w-6" strokeWidth={2} />
                  </div>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.2em] text-green-300">Estrutura do catalogo</p>
                    <h2 id="new-category-group-title" className="mt-1 text-xl font-black">
                      {editingGroupId ? 'Editar grupo principal' : 'Novo grupo principal'}
                    </h2>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={closeGroupForm}
                  disabled={savingGroup}
                  aria-label="Fechar"
                  className="rounded-xl p-2 text-slate-300 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-50"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <form onSubmit={handleSaveGroup} className="space-y-5 p-6 sm:p-8">
              <div className="rounded-2xl border border-green-100 bg-green-50 p-4 text-sm text-green-900">
                {editingGroupId
                  ? 'Atualize a apresentacao e a disponibilidade do grupo sem alterar seus vinculos.'
                  : 'O grupo sera criado vazio. Depois, selecione o novo card para adicionar suas categorias secundarias.'}
              </div>

              <label className="block" htmlFor="category-group-name">
                <span className="mb-2 block text-sm font-bold text-slate-700">Nome do grupo</span>
                <input
                  id="category-group-name"
                  type="text"
                  autoFocus
                  required
                  maxLength={80}
                  value={groupForm.name}
                  onChange={(event) => {
                    const nextName = event.target.value;
                    setGroupForm((current) => ({
                      ...current,
                      name: nextName,
                      slug: editingGroupId
                        ? current.slug
                        : current.slug === slugify(current.name)
                          ? slugify(nextName)
                          : current.slug,
                    }));
                  }}
                  placeholder="Ex: Tecnologia Rural"
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 text-slate-900 outline-none transition focus:border-green-500 focus:ring-4 focus:ring-green-100"
                />
              </label>

              <label className="block" htmlFor="category-group-slug">
                <span className="mb-2 block text-sm font-bold text-slate-700">Slug</span>
                <input
                  id="category-group-slug"
                  type="text"
                  required
                  maxLength={80}
                  disabled={Boolean(editingGroupId)}
                  value={groupForm.slug}
                  onChange={(event) =>
                    setGroupForm((current) => ({ ...current, slug: slugify(event.target.value) }))
                  }
                  placeholder="tecnologia-rural"
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 font-mono text-sm text-slate-900 outline-none transition focus:border-green-500 focus:ring-4 focus:ring-green-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
                />
                <span className="mt-1.5 block text-xs text-slate-500">
                  {editingGroupId
                    ? 'O slug e permanente para proteger URLs e vinculos existentes.'
                    : 'Identificador permanente usado nas URLs e integracoes.'}
                </span>
              </label>

              <div className="grid gap-4 sm:grid-cols-[1fr_140px]">
                <div className="block">
                  <span className="mb-2 block text-sm font-bold text-slate-700">Icone</span>
                  <button
                    type="button"
                    onClick={() => setShowIconPicker((current) => !current)}
                    aria-expanded={showIconPicker}
                    aria-controls="category-group-icon-picker"
                    className="flex w-full items-center gap-3 rounded-xl border border-slate-200 px-3 py-2 text-left outline-none transition hover:border-slate-300 focus:border-green-500 focus:ring-4 focus:ring-green-100"
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
                      <GroupFormIcon className="h-5 w-5" strokeWidth={1.8} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold text-slate-800">
                        {selectedGroupIcon?.label || groupForm.icon_name || 'Produtos'}
                      </span>
                      <span className="block text-xs text-slate-500">
                        {showIconPicker ? 'Ocultar icones' : 'Ver todos os icones'}
                      </span>
                    </span>
                  </button>
                </div>

                <label className="block" htmlFor="category-group-order">
                  <span className="mb-2 block text-sm font-bold text-slate-700">Ordem</span>
                  <input
                    id="category-group-order"
                    type="number"
                    min="0"
                    step="1"
                    required
                    value={groupForm.sort_order}
                    onChange={(event) =>
                      setGroupForm((current) => ({
                        ...current,
                        sort_order: Math.max(0, Math.trunc(Number(event.target.value) || 0)),
                      }))
                    }
                    className="w-full rounded-xl border border-slate-200 px-4 py-3 text-slate-900 outline-none transition focus:border-green-500 focus:ring-4 focus:ring-green-100"
                  />
                </label>
              </div>

              {showIconPicker && (
                <section
                  id="category-group-icon-picker"
                  aria-label="Escolher icone do grupo"
                  className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50"
                >
                  <div className="flex flex-col gap-3 border-b border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h3 className="text-sm font-black text-slate-900">Biblioteca de icones</h3>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {filteredGroupIconOptions.length} de {CATEGORY_ICON_OPTIONS.length} opcoes
                      </p>
                    </div>
                    <label className="relative block sm:w-64" htmlFor="category-group-icon-search">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <input
                        id="category-group-icon-search"
                        type="search"
                        value={iconSearchTerm}
                        onChange={(event) => setIconSearchTerm(event.target.value)}
                        placeholder="Buscar icone..."
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-sm text-slate-900 outline-none transition focus:border-green-500 focus:ring-4 focus:ring-green-100"
                      />
                    </label>
                  </div>

                  {filteredGroupIconOptions.length > 0 ? (
                    <div
                      role="listbox"
                      aria-label="Icones disponiveis"
                      className="grid max-h-72 grid-cols-2 gap-2 overflow-y-auto p-3 sm:grid-cols-3"
                    >
                      {filteredGroupIconOptions.map((option) => {
                        const isSelected = option.value === groupForm.icon_name;
                        const Icon = option.Icon;

                        return (
                          <button
                            key={option.value}
                            type="button"
                            role="option"
                            aria-selected={isSelected}
                            onClick={() => {
                              setGroupForm((current) => ({ ...current, icon_name: option.value }));
                              setShowIconPicker(false);
                              setIconSearchTerm('');
                            }}
                            className={`group/icon relative flex min-h-24 flex-col items-center justify-center gap-2 rounded-xl border p-3 text-center transition ${
                              isSelected
                                ? 'border-green-500 bg-green-50 text-green-800 shadow-sm'
                                : 'border-transparent bg-white text-slate-600 hover:border-slate-200 hover:text-slate-900'
                            }`}
                          >
                            {isSelected && (
                              <span className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-green-500 text-white">
                                <Check className="h-3 w-3" strokeWidth={3} />
                              </span>
                            )}
                            <Icon className="h-6 w-6" strokeWidth={1.7} />
                            <span className="line-clamp-2 text-xs font-bold">{option.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="px-4 py-10 text-center text-sm text-slate-500">
                      Nenhum icone encontrado para "{iconSearchTerm}".
                    </div>
                  )}
                </section>
              )}

              <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <input
                  type="checkbox"
                  checked={groupForm.is_active}
                  onChange={(event) =>
                    setGroupForm((current) => ({ ...current, is_active: event.target.checked }))
                  }
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-green-600 focus:ring-green-500"
                />
                <span>
                  <span className="block text-sm font-bold text-slate-800">Grupo ativo</span>
                  <span className="mt-0.5 block text-xs text-slate-500">
                    Grupos inativos ficam visiveis apenas para administradores.
                  </span>
                </span>
              </label>

              <div className="flex flex-col-reverse gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={closeGroupForm}
                  disabled={savingGroup}
                  className="rounded-xl border border-slate-200 px-5 py-3 text-sm font-bold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingGroup || !groupForm.name.trim() || !groupForm.slug}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-green-500 px-5 py-3 text-sm font-black text-white transition-colors hover:bg-green-600 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {savingGroup
                    ? <Loader2 className="h-4 w-4 animate-spin" />
                    : editingGroupId
                      ? <Pencil className="h-4 w-4" />
                      : <Plus className="h-4 w-4" />}
                  {savingGroup
                    ? 'Salvando grupo...'
                    : editingGroupId
                      ? 'Salvar alteracoes'
                      : 'Criar grupo principal'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default CategoriesManagement;
