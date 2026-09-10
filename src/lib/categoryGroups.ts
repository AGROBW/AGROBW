import { CATEGORY_HIERARCHY } from './categoryHierarchy';

export interface CategoryGroupRow {
  id?: unknown;
  name?: unknown;
  slug?: unknown;
  sort_order?: unknown;
  icon_name?: unknown;
  is_active?: unknown;
}

export interface CategoryGroup {
  id: string | null;
  name: string;
  slug: string;
  sortOrder: number;
  iconName: string | null;
  isActive: boolean;
}

export interface CategoryGroupCatalogCategoryRow {
  name?: unknown;
  slug?: unknown;
  parent_group_slug?: unknown;
  is_active?: unknown;
}

export interface CategoryGroupCatalogChild {
  name: string;
  slug: string;
}

export interface CategoryGroupCatalogGroup extends CategoryGroup {
  categorySlugs: string[];
  children: CategoryGroupCatalogChild[];
}

export interface CategoryGroupCatalog {
  groups: CategoryGroupCatalogGroup[];
  findGroupBySlug: (slug?: string | null) => CategoryGroupCatalogGroup | undefined;
  findGroupForCategorySlug: (slug?: string | null) => CategoryGroupCatalogGroup | undefined;
  getGroupCategorySlugs: (slug?: string | null) => string[];
  getCategoryGroupKey: (slug?: string | null) => string;
}

interface ResolveCategoryGroupsOptions {
  includeInactive?: boolean;
}

interface BuildCategoryGroupCatalogOptions {
  includeInactive?: boolean;
}

export const CATEGORY_GROUP_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const normalizeText = (value: unknown) => typeof value === 'string' ? value.trim() : '';

export const normalizeCategoryGroupSlug = (value: unknown) =>
  normalizeText(value).toLowerCase();

export const isValidCategoryGroupSlug = (value: string) =>
  value.length <= 80 && CATEGORY_GROUP_SLUG_PATTERN.test(value);

const normalizeSortOrder = (value: unknown) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
};

export const getFallbackCategoryGroups = (): CategoryGroup[] =>
  CATEGORY_HIERARCHY.map((group, index) => ({
    id: null,
    name: group.name,
    slug: group.slug,
    sortOrder: index + 1,
    iconName: null,
    isActive: true,
  }));

export const normalizeCategoryGroupRows = (
  rows: CategoryGroupRow[],
  options: ResolveCategoryGroupsOptions = {}
): CategoryGroup[] => {
  const includeInactive = options.includeInactive ?? false;
  const groupsBySlug = new Map<string, CategoryGroup>();

  rows.forEach((row) => {
    const name = normalizeText(row.name);
    const slug = normalizeCategoryGroupSlug(row.slug);
    const isActive = row.is_active !== false;

    if (
      !name
      || name.length > 80
      || !isValidCategoryGroupSlug(slug)
      || (!includeInactive && !isActive)
      || groupsBySlug.has(slug)
    ) {
      return;
    }

    groupsBySlug.set(slug, {
      id: normalizeText(row.id) || null,
      name,
      slug,
      sortOrder: normalizeSortOrder(row.sort_order),
      iconName: normalizeText(row.icon_name) || null,
      isActive,
    });
  });

  return Array.from(groupsBySlug.values()).sort((left, right) =>
    left.sortOrder - right.sortOrder || left.name.localeCompare(right.name, 'pt-BR')
  );
};

export const resolveCategoryGroups = (
  rows: CategoryGroupRow[] | null,
  options: ResolveCategoryGroupsOptions = {}
): { groups: CategoryGroup[]; isFallback: boolean } => {
  if (rows === null) {
    return {
      groups: getFallbackCategoryGroups(),
      isFallback: true,
    };
  }

  return {
    groups: normalizeCategoryGroupRows(rows, options),
    isFallback: false,
  };
};

export const buildCategoryGroupCatalog = (
  groups: CategoryGroup[],
  categoryRows: CategoryGroupCatalogCategoryRow[] | null,
  options: BuildCategoryGroupCatalogOptions = {}
): CategoryGroupCatalog => {
  const groupsBySlug = new Map(
    groups.map((group) => [group.slug, { ...group, categorySlugs: [], children: [] }])
  );
  const groupsByCategorySlug = new Map<string, CategoryGroupCatalogGroup>();

  if (categoryRows === null) {
    CATEGORY_HIERARCHY.forEach((legacyGroup) => {
      const group = groupsBySlug.get(legacyGroup.slug);
      if (!group) return;

      legacyGroup.categorySlugs.forEach((categorySlug) => {
        if (!group.categorySlugs.includes(categorySlug)) {
          group.categorySlugs.push(categorySlug);
        }
        groupsByCategorySlug.set(categorySlug, group);
      });

      group.children = legacyGroup.children.map(({ name, slug }) => ({ name, slug }));

      legacyGroup.aliases.forEach((alias) => groupsByCategorySlug.set(alias, group));
    });
  } else {
    categoryRows.forEach((row) => {
      if (!options.includeInactive && row.is_active === false) return;

      const categoryName = normalizeText(row.name);
      const categorySlug = normalizeCategoryGroupSlug(row.slug);
      const parentGroupSlug = normalizeCategoryGroupSlug(row.parent_group_slug);
      const group = groupsBySlug.get(parentGroupSlug) || groupsBySlug.get(categorySlug);

      if (!categorySlug || !group) return;

      if (!group.categorySlugs.includes(categorySlug)) {
        group.categorySlugs.push(categorySlug);
      }
      if (categoryName && !group.children.some((child) => child.slug === categorySlug)) {
        group.children.push({ name: categoryName, slug: categorySlug });
      }
      groupsByCategorySlug.set(categorySlug, group);
    });
  }

  const catalogGroups = Array.from(groupsBySlug.values());
  const findDirectGroup = (slug?: string | null) =>
    groupsBySlug.get(normalizeCategoryGroupSlug(slug));
  const findGroupForCategorySlug = (slug?: string | null) =>
    groupsByCategorySlug.get(normalizeCategoryGroupSlug(slug));
  const findGroupBySlug = (slug?: string | null) =>
    findDirectGroup(slug) || findGroupForCategorySlug(slug);

  return {
    groups: catalogGroups,
    findGroupBySlug,
    findGroupForCategorySlug,
    getGroupCategorySlugs: (slug?: string | null) =>
      findGroupBySlug(slug)?.categorySlugs || [],
    getCategoryGroupKey: (slug?: string | null) =>
      findGroupBySlug(slug)?.slug || normalizeCategoryGroupSlug(slug),
  };
};
