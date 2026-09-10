import { describe, expect, it } from 'vitest';
import {
  buildCategoryGroupCatalog,
  getFallbackCategoryGroups,
  normalizeCategoryGroupRows,
  resolveCategoryGroups,
} from '../categoryGroups';

describe('categoryGroups', () => {
  it('normaliza, filtra inativos e ordena os grupos vindos do banco', () => {
    expect(normalizeCategoryGroupRows([
      { id: '2', name: ' Servicos ', slug: 'servicos', sort_order: 20, icon_name: 'Wrench', is_active: true },
      { id: '1', name: 'Animais', slug: 'ANIMAIS', sort_order: 10, icon_name: null, is_active: true },
      { id: '3', name: 'Oculto', slug: 'oculto', sort_order: 0, is_active: false },
    ])).toEqual([
      { id: '1', name: 'Animais', slug: 'animais', sortOrder: 10, iconName: null, isActive: true },
      { id: '2', name: 'Servicos', slug: 'servicos', sortOrder: 20, iconName: 'Wrench', isActive: true },
    ]);
  });

  it('inclui grupos inativos quando solicitado pelo painel administrativo', () => {
    expect(normalizeCategoryGroupRows([
      { id: '3', name: 'Oculto', slug: 'oculto', sort_order: 1, is_active: false },
    ], { includeInactive: true })).toEqual([
      { id: '3', name: 'Oculto', slug: 'oculto', sortOrder: 1, iconName: null, isActive: false },
    ]);
  });

  it('usa os seis grupos legados somente quando a consulta fica indisponível', () => {
    const unavailable = resolveCategoryGroups(null);
    const intentionallyEmpty = resolveCategoryGroups([]);

    expect(unavailable.isFallback).toBe(true);
    expect(unavailable.groups).toEqual(getFallbackCategoryGroups());
    expect(unavailable.groups).toHaveLength(6);
    expect(intentionallyEmpty).toEqual({ groups: [], isFallback: false });
  });

  it('descarta linhas inválidas e slugs duplicados', () => {
    expect(normalizeCategoryGroupRows([
      { id: '1', name: '', slug: 'sem-nome', is_active: true },
      { id: '2', name: 'Sem slug', slug: '', is_active: true },
      { id: '3', name: 'Primeiro', slug: 'duplicado', sort_order: 1, is_active: true },
      { id: '4', name: 'Segundo', slug: 'duplicado', sort_order: 2, is_active: true },
      { id: '5', name: 'Slug invalido', slug: 'slug invalido', sort_order: 3, is_active: true },
    ])).toEqual([
      { id: '3', name: 'Primeiro', slug: 'duplicado', sortOrder: 1, iconName: null, isActive: true },
    ]);
  });

  it('monta o catalogo dinamico usando os vinculos das categorias', () => {
    const groups = normalizeCategoryGroupRows([
      { id: '1', name: 'Animais', slug: 'animais', sort_order: 1, is_active: true },
      { id: '2', name: 'Tecnologia', slug: 'tecnologia', sort_order: 2, is_active: true },
    ]);
    const catalog = buildCategoryGroupCatalog(groups, [
      { name: 'Bovinos', slug: 'bovinos', parent_group_slug: 'animais', is_active: true },
      { name: 'Drones', slug: 'drones', parent_group_slug: 'tecnologia', is_active: true },
      { name: 'Categoria inativa', slug: 'categoria-inativa', parent_group_slug: 'tecnologia', is_active: false },
    ]);

    expect(catalog.findGroupBySlug('tecnologia')?.name).toBe('Tecnologia');
    expect(catalog.findGroupForCategorySlug('drones')?.slug).toBe('tecnologia');
    expect(catalog.getGroupCategorySlugs('tecnologia')).toEqual(['drones']);
    expect(catalog.findGroupBySlug('tecnologia')?.children).toEqual([
      { name: 'Drones', slug: 'drones' },
    ]);
    expect(catalog.getCategoryGroupKey('bovinos')).toBe('animais');
  });

  it('inclui categorias inativas no catalogo administrativo quando solicitado', () => {
    const groups = normalizeCategoryGroupRows([
      { id: '1', name: 'Tecnologia', slug: 'tecnologia', sort_order: 1, is_active: true },
    ]);
    const catalog = buildCategoryGroupCatalog(groups, [
      { name: 'Drones', slug: 'drones', parent_group_slug: 'tecnologia', is_active: false },
    ], { includeInactive: true });

    expect(catalog.getGroupCategorySlugs('tecnologia')).toEqual(['drones']);
    expect(catalog.groups[0].children).toEqual([{ name: 'Drones', slug: 'drones' }]);
  });

  it('usa os vinculos legados apenas quando as categorias ficam indisponiveis', () => {
    const groups = getFallbackCategoryGroups();
    const fallbackCatalog = buildCategoryGroupCatalog(groups, null);
    const emptyCatalog = buildCategoryGroupCatalog(groups, []);

    expect(fallbackCatalog.findGroupForCategorySlug('tratores-agricolas')?.slug).toBe('maquinas');
    expect(fallbackCatalog.findGroupBySlug('maquinas')?.children[0]).toEqual({
      name: 'Tratores',
      slug: 'tratores',
    });
    expect(emptyCatalog.findGroupForCategorySlug('tratores-agricolas')).toBeUndefined();
    expect(emptyCatalog.findGroupBySlug('maquinas')?.children).toEqual([]);
  });
});
