export interface AnnouncementEditCategory {
  id: string;
  slug: string;
  parent_group_slug?: string | null;
}

export interface AnnouncementEditSubcategory {
  id: string;
  name: string;
  slug: string;
}

interface CategoryGroupReference {
  slug: string;
}

interface ResolveAnnouncementEditTaxonomyOptions {
  categoryId?: unknown;
  categorySlug?: unknown;
  categories: AnnouncementEditCategory[];
  findGroupBySlug: (slug?: string | null) => CategoryGroupReference | undefined;
  findGroupForCategorySlug: (slug?: string | null) => CategoryGroupReference | undefined;
}

const normalizeValue = (value: unknown) =>
  typeof value === 'string' ? value.trim() : '';

const normalizeSlug = (value: unknown) => normalizeValue(value)
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '');

export const resolveAnnouncementEditTaxonomy = ({
  categoryId,
  categorySlug,
  categories,
  findGroupBySlug,
  findGroupForCategorySlug,
}: ResolveAnnouncementEditTaxonomyOptions) => {
  const storedCategoryId = normalizeValue(categoryId);
  const storedCategorySlug = normalizeValue(categorySlug);
  const matchedCategory =
    categories.find((category) => category.id === storedCategoryId)
    || categories.find((category) => category.slug === storedCategorySlug);
  const resolvedCategoryId = matchedCategory?.id || storedCategoryId;
  const resolvedCategorySlug = matchedCategory?.slug || storedCategorySlug;
  const parentGroupSlug = normalizeValue(matchedCategory?.parent_group_slug);
  const matchedGroup =
    findGroupBySlug(parentGroupSlug)
    || findGroupForCategorySlug(resolvedCategorySlug)
    || findGroupBySlug(resolvedCategorySlug);

  return {
    categoryGroupSlug: matchedGroup?.slug || parentGroupSlug || resolvedCategorySlug,
    categoryId: resolvedCategoryId,
    categorySlug: resolvedCategorySlug,
  };
};

export const resolveAnnouncementEditSubcategory = (
  subcategoryId: unknown,
  subcategoryLabel: unknown,
  subcategories: AnnouncementEditSubcategory[]
) => {
  const storedId = normalizeValue(subcategoryId);
  const storedLabel = normalizeValue(subcategoryLabel);
  const normalizedId = normalizeSlug(storedId);
  const normalizedLabel = normalizeSlug(storedLabel);
  const matchedSubcategory = subcategories.find((subcategory) =>
    subcategory.id === storedId
    || normalizeSlug(subcategory.slug) === normalizedId
    || normalizeSlug(subcategory.name) === normalizedLabel
    || normalizeSlug(subcategory.name) === normalizedId
  );

  return matchedSubcategory
    ? { id: matchedSubcategory.id, label: matchedSubcategory.name }
    : { id: storedId || normalizedLabel, label: storedLabel };
};
