import { describe, expect, it } from 'vitest';
import { buildCategoryGroupCatalog, normalizeCategoryGroupRows } from '../categoryGroups';
import {
  resolveAnnouncementEditSubcategory,
  resolveAnnouncementEditTaxonomy,
} from '../announcementEditTaxonomy';

const groups = normalizeCategoryGroupRows([
  { id: 'group-aircraft', name: 'Aeronaves', slug: 'aeronaves', is_active: true },
  { id: 'group-machines', name: 'Maquinas', slug: 'maquinas', is_active: true },
]);

const categories = [
  { id: 'category-airplanes', name: 'Avioes', slug: 'avioes', parent_group_slug: 'aeronaves', is_active: true },
  { id: 'category-tractors', name: 'Tratores', slug: 'tratores', parent_group_slug: 'maquinas', is_active: true },
];

const catalog = buildCategoryGroupCatalog(groups, categories);

const resolve = (categoryId?: unknown, categorySlug?: unknown) =>
  resolveAnnouncementEditTaxonomy({
    categoryId,
    categorySlug,
    categories,
    findGroupBySlug: catalog.findGroupBySlug,
    findGroupForCategorySlug: catalog.findGroupForCategorySlug,
  });

describe('resolveAnnouncementEditTaxonomy', () => {
  it('restaura categoria dinamica e grupo pelo category_id', () => {
    expect(resolve('category-airplanes', null)).toEqual({
      categoryGroupSlug: 'aeronaves',
      categoryId: 'category-airplanes',
      categorySlug: 'avioes',
    });
  });

  it('prioriza o category_id quando o slug salvo esta desatualizado', () => {
    expect(resolve('category-airplanes', 'tratores')).toEqual({
      categoryGroupSlug: 'aeronaves',
      categoryId: 'category-airplanes',
      categorySlug: 'avioes',
    });
  });

  it('mantem compatibilidade com anuncios que possuem apenas o slug', () => {
    expect(resolve(null, 'tratores')).toEqual({
      categoryGroupSlug: 'maquinas',
      categoryId: 'category-tractors',
      categorySlug: 'tratores',
    });
  });
});

describe('resolveAnnouncementEditSubcategory', () => {
  const subcategories = [
    { id: 'subcategory-jets', name: 'Jatos executivos', slug: 'jatos-executivos' },
  ];

  it('restaura uma subcategoria nova pelo id', () => {
    expect(resolveAnnouncementEditSubcategory('subcategory-jets', '', subcategories)).toEqual({
      id: 'subcategory-jets',
      label: 'Jatos executivos',
    });
  });

  it('converte um slug legado para o id atual da subcategoria', () => {
    expect(resolveAnnouncementEditSubcategory('jatos-executivos', '', subcategories)).toEqual({
      id: 'subcategory-jets',
      label: 'Jatos executivos',
    });
  });

  it('preserva uma subcategoria legada fora do catalogo atual', () => {
    expect(resolveAnnouncementEditSubcategory('', 'Aviacao agricola', subcategories)).toEqual({
      id: 'aviacao-agricola',
      label: 'Aviacao agricola',
    });
  });
});
