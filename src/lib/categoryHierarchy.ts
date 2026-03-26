export interface CategoryHierarchyChild {
  slug: string;
  name: string;
  categorySlugs?: string[];
  subcategorySlugs?: string[];
  subcategoryLabels?: string[];
  keywords?: string[];
}

export interface CategoryHierarchyGroup {
  slug: string;
  aliases: string[];
  name: string;
  categorySlugs: string[];
  children: CategoryHierarchyChild[];
}

export const CATEGORY_HIERARCHY: CategoryHierarchyGroup[] = [
  {
    slug: 'animais',
    aliases: ['animais'],
    name: 'Animais',
    categorySlugs: ['animais'],
    children: [
      {
        slug: 'bovinos',
        name: 'Bovinos',
        subcategorySlugs: ['gado-de-corte', 'gado-de-leite', 'bufalo'],
      },
      {
        slug: 'equinos',
        name: 'Equinos',
        subcategorySlugs: ['cavalos'],
      },
      {
        slug: 'ovinos-caprinos',
        name: 'Ovinos/Caprinos',
        subcategorySlugs: ['caprinos'],
      },
      {
        slug: 'aves',
        name: 'Aves',
        subcategorySlugs: ['aves'],
      },
      {
        slug: 'peixes',
        name: 'Peixes',
        subcategorySlugs: ['peixes'],
      },
      {
        slug: 'pet-cia',
        name: 'Pet & Cia',
        subcategorySlugs: ['caes', 'coelhos', 'outros'],
      },
    ],
  },
  {
    slug: 'maquinas',
    aliases: ['maquinas', 'maquinas-equipamentos'],
    name: 'Maquinas',
    categorySlugs: [
      'maquinas-equipamentos',
      'tratores-agricolas',
      'colheitadeiras-colhedoras',
      'implementos',
      'pecas',
      'maquinas-pesadas',
    ],
    children: [
      {
        slug: 'tratores',
        name: 'Tratores',
        categorySlugs: ['tratores-agricolas'],
      },
      {
        slug: 'colheitadeiras',
        name: 'Colheitadeiras',
        categorySlugs: ['colheitadeiras-colhedoras'],
      },
      {
        slug: 'implementos',
        name: 'Implementos',
        categorySlugs: ['implementos'],
      },
      {
        slug: 'pulverizadores',
        name: 'Pulverizadores',
        categorySlugs: ['maquinas-equipamentos'],
        keywords: ['pulverizador', 'pulverizadores'],
      },
      {
        slug: 'pecas',
        name: 'Pecas',
        categorySlugs: ['pecas'],
      },
    ],
  },
  {
    slug: 'insumos',
    aliases: ['insumos', 'fertilizantes-agricolas'],
    name: 'Insumos',
    categorySlugs: [
      'fertilizantes-agricolas',
      'alimentos-para-nutricao-animal',
      'alimentos-em-geral',
    ],
    children: [
      {
        slug: 'sementes',
        name: 'Sementes',
        keywords: ['semente', 'sementes'],
      },
      {
        slug: 'fertilizantes',
        name: 'Fertilizantes',
        categorySlugs: ['fertilizantes-agricolas'],
      },
      {
        slug: 'defensivos',
        name: 'Defensivos',
        keywords: ['defensivo', 'defensivos', 'herbicida', 'fungicida', 'inseticida'],
      },
      {
        slug: 'nutricao-animal',
        name: 'Nutricao Animal',
        categorySlugs: ['alimentos-para-nutricao-animal'],
      },
    ],
  },
  {
    slug: 'imoveis',
    aliases: ['imoveis', 'imoveis-rurais'],
    name: 'Imoveis Rurais',
    categorySlugs: ['imoveis-rurais', 'fazendas'],
    children: [
      {
        slug: 'fazendas',
        name: 'Fazendas',
        categorySlugs: ['fazendas'],
        subcategorySlugs: ['fazendas'],
      },
      {
        slug: 'sitios',
        name: 'Sitios',
        categorySlugs: ['fazendas'],
        subcategorySlugs: ['sitios'],
      },
      {
        slug: 'chacaras',
        name: 'Chacaras',
        categorySlugs: ['fazendas'],
        subcategorySlugs: ['chacaras'],
      },
      {
        slug: 'haras',
        name: 'Haras',
        keywords: ['haras'],
      },
      {
        slug: 'terrenos',
        name: 'Terrenos',
        keywords: ['terreno', 'terrenos'],
      },
    ],
  },
  {
    slug: 'servicos',
    aliases: ['servicos'],
    name: 'Servicos',
    categorySlugs: ['armazenagem-de-produtos'],
    children: [
      {
        slug: 'fretes',
        name: 'Fretes',
        subcategorySlugs: ['fretes'],
      },
      {
        slug: 'mao-de-obra',
        name: 'Mao de Obra',
        subcategorySlugs: ['terceirizacao-de-mao-de-obra', 'profissionais-tecnicos-terceirizados'],
      },
      {
        slug: 'consultoria',
        name: 'Consultoria',
        subcategorySlugs: ['consultoria-rural'],
      },
      {
        slug: 'topografia',
        name: 'Topografia',
        subcategorySlugs: ['georreferenciamento-topografia'],
      },
    ],
  },
  {
    slug: 'sementes',
    aliases: ['sementes'],
    name: 'Sementes',
    categorySlugs: ['arvores-adultas-mudas', 'alimentos-em-geral'],
    children: [
      {
        slug: 'graos',
        name: 'Graos',
        subcategorySlugs: ['milho', 'soja', 'trigo', 'arroz', 'feijao'],
      },
      {
        slug: 'pastagem',
        name: 'Pastagem',
        subcategorySlugs: ['alfafa', 'silagem', 'feno', 'pre-secado', 'aveia', 'milheto', 'sorgo'],
      },
      {
        slug: 'hortalicas',
        name: 'Hortalicas',
        subcategorySlugs: ['hortalicas'],
      },
      {
        slug: 'frutas',
        name: 'Frutas',
        subcategorySlugs: ['frutas', 'mudas'],
      },
    ],
  },
];

const normalize = (value?: string | null) =>
  String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

export const getCategoryGroupBySlug = (slug?: string | null) => {
  const normalizedSlug = normalize(slug);
  return CATEGORY_HIERARCHY.find((group) =>
    group.aliases.some((alias) => normalize(alias) === normalizedSlug)
  );
};

export const getCategoryGroupForCategorySlug = (categorySlug?: string | null) => {
  const normalizedSlug = normalize(categorySlug);
  return CATEGORY_HIERARCHY.find((group) =>
    group.categorySlugs.some((slug) => normalize(slug) === normalizedSlug)
  );
};

export const getGroupCategorySlugs = (slug?: string | null) =>
  getCategoryGroupBySlug(slug)?.categorySlugs || [];

export const getCategoryHierarchyChildren = (slug?: string | null) =>
  getCategoryGroupBySlug(slug)?.children || [];

export const matchesHierarchyChild = (
  child: CategoryHierarchyChild,
  announcement: {
    title?: string | null;
    description?: string | null;
    categorySlug?: string | null;
    subCategoryLabel?: string | null;
  }
) => {
  const normalizedCategorySlug = normalize(announcement.categorySlug);
  const normalizedSubcategory = normalize(announcement.subCategoryLabel);
  const normalizedTitle = normalize(announcement.title);
  const normalizedDescription = normalize(announcement.description);

  const categoryMatch =
    !child.categorySlugs || child.categorySlugs.length === 0
      ? false
      : child.categorySlugs.some((slug) => normalize(slug) === normalizedCategorySlug);

  const subcategoryMatch =
    !child.subcategorySlugs || child.subcategorySlugs.length === 0
      ? false
      : child.subcategorySlugs.some((slug) => normalize(slug) === normalizedSubcategory);

  const labelMatch =
    !child.subcategoryLabels || child.subcategoryLabels.length === 0
      ? false
      : child.subcategoryLabels.some((label) => normalize(label) === normalizedSubcategory);

  const keywordMatch =
    !child.keywords || child.keywords.length === 0
      ? false
      : child.keywords.some((keyword) => {
          const normalizedKeyword = normalize(keyword);
          return (
            normalizedTitle.includes(normalizedKeyword) ||
            normalizedDescription.includes(normalizedKeyword)
          );
        });

  return categoryMatch || subcategoryMatch || labelMatch || keywordMatch;
};
