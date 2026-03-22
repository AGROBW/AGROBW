export const NEWS_EDITORIAL_CATEGORIES = [
  'Mercado',
  'Grãos',
  'Pecuária',
  'Máquinas',
  'Insumos',
  'Clima',
  'Política Agro',
  'Crédito Rural',
  'Tecnologia',
  'Logística',
  'Sustentabilidade',
] as const;

export type NewsEditorialCategory = (typeof NEWS_EDITORIAL_CATEGORIES)[number];

export const getNewsEditorialCategoryStyle = (category?: string | null) => {
  const normalized = normalizeEditorialCategory(category) || 'Mercado';

  const styles: Record<NewsEditorialCategory, { background: string; color: string }> = {
    Mercado: { background: 'linear-gradient(90deg, #0f172a, #1e3a8a)', color: '#ffffff' },
    Grãos: { background: 'linear-gradient(90deg, #92400e, #d97706)', color: '#ffffff' },
    Pecuária: { background: 'linear-gradient(90deg, #365314, #65a30d)', color: '#ffffff' },
    Máquinas: { background: 'linear-gradient(90deg, #475569, #0f172a)', color: '#ffffff' },
    Insumos: { background: 'linear-gradient(90deg, #065f46, #10b981)', color: '#ffffff' },
    Clima: { background: 'linear-gradient(90deg, #0369a1, #38bdf8)', color: '#ffffff' },
    'Política Agro': { background: 'linear-gradient(90deg, #4c1d95, #7c3aed)', color: '#ffffff' },
    'Crédito Rural': { background: 'linear-gradient(90deg, #166534, #22c55e)', color: '#ffffff' },
    Tecnologia: { background: 'linear-gradient(90deg, #1d4ed8, #06b6d4)', color: '#ffffff' },
    Logística: { background: 'linear-gradient(90deg, #7c2d12, #ea580c)', color: '#ffffff' },
    Sustentabilidade: { background: 'linear-gradient(90deg, #166534, #15803d)', color: '#ffffff' },
  };

  return styles[normalized];
};

const KEYWORD_GROUPS: Array<{
  category: NewsEditorialCategory;
  keywords: string[];
}> = [
  {
    category: 'Grãos',
    keywords: ['soja', 'milho', 'safra', 'colheita', 'trigo', 'farelo', 'oleaginosa', 'arroz', 'feijão', 'café'],
  },
  {
    category: 'Pecuária',
    keywords: ['boi', 'boiada', 'arroba', 'pecuária', 'gado', 'frigorífico', 'bezerro', 'suíno', 'suinocultura', 'aves', 'avicultura', 'leite'],
  },
  {
    category: 'Máquinas',
    keywords: ['trator', 'colheitadeira', 'pulverizador', 'implemento', 'máquina', 'mecanização', 'plantadeira'],
  },
  {
    category: 'Insumos',
    keywords: ['fertilizante', 'adubo', 'defensivo', 'semente', 'insumo', 'nutrição', 'herbicida', 'fungicida'],
  },
  {
    category: 'Clima',
    keywords: ['chuva', 'seca', 'clima', 'climático', 'temperatura', 'estiagem', 'frente fria', 'la niña', 'el niño'],
  },
  {
    category: 'Política Agro',
    keywords: ['governo', 'ministério', 'congresso', 'tributo', 'reforma', 'legislação', 'plano safra', 'regulação', 'subsídio'],
  },
  {
    category: 'Crédito Rural',
    keywords: ['crédito rural', 'financiamento', 'bndes', 'juros', 'custeio', 'seguro rural', 'renegociação', 'banco'],
  },
  {
    category: 'Tecnologia',
    keywords: ['tecnologia', 'agtech', 'inovação', 'inteligência artificial', 'monitoramento', 'drone', 'automação', 'software'],
  },
  {
    category: 'Logística',
    keywords: ['frete', 'porto', 'rodovia', 'ferrovia', 'escoamento', 'armazenagem', 'logística', 'transporte'],
  },
  {
    category: 'Sustentabilidade',
    keywords: ['carbono', 'sustentabilidade', 'ambiental', 'regenerativa', 'desmatamento', 'emissões', 'bioinsumo'],
  },
];

const normalize = (value?: string | null) =>
  (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

export const normalizeEditorialCategory = (value?: string | null): NewsEditorialCategory | null => {
  if (!value) return null;
  const normalizedValue = normalize(value);
  return NEWS_EDITORIAL_CATEGORIES.find((category) => normalize(category) === normalizedValue) || null;
};

export const classifyNewsEditorialCategory = (input: {
  title?: string | null;
  subtitle?: string | null;
  summary?: string | null;
  content?: string | null;
  portalName?: string | null;
}): NewsEditorialCategory => {
  const text = normalize([input.title, input.subtitle, input.summary, input.content, input.portalName].filter(Boolean).join(' '));

  for (const group of KEYWORD_GROUPS) {
    if (group.keywords.some((keyword) => text.includes(normalize(keyword)))) {
      return group.category;
    }
  }

  return 'Mercado';
};
