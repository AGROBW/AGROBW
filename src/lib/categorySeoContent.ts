type CategorySeoContent = {
  title: string;
  description: string;
  introTitle: string;
  introBody: string;
};

export const CATEGORY_SEO_CONTENT: Record<string, CategorySeoContent> = {
  animais: {
    title: 'Animais para compra e venda no agronegócio',
    description:
      'Encontre anúncios de bovinos, equinos, ovinos, aves e outras oportunidades na categoria de animais da AGRO BW.',
    introTitle: 'Negócios com animais no agro',
    introBody:
      'Esta vitrine reúne anúncios de animais voltados ao agronegócio, com espaço para compra, venda e negociação entre produtores, criadores e lojas parceiras.',
  },
  maquinas: {
    title: 'Máquinas agrícolas, tratores e implementos',
    description:
      'Explore anúncios de tratores, colheitadeiras, implementos e peças para o agronegócio na categoria de máquinas da AGRO BW.',
    introTitle: 'Máquinas e equipamentos para o campo',
    introBody:
      'Aqui você encontra oportunidades em tratores, colheitadeiras, pulverizadores, implementos e peças para operações agrícolas de diferentes portes.',
  },
  insumos: {
    title: 'Insumos agrícolas e nutrição animal',
    description:
      'Veja anúncios de fertilizantes, defensivos, sementes e produtos para nutrição animal no marketplace rural da AGRO BW.',
    introTitle: 'Insumos para produção rural',
    introBody:
      'A vitrine de insumos concentra oportunidades para abastecer a operação rural com fertilizantes, defensivos, sementes e soluções para nutrição animal.',
  },
  imoveis: {
    title: 'Imóveis rurais, fazendas, sítios e chácaras',
    description:
      'Descubra anúncios de fazendas, sítios, chácaras e outros imóveis rurais disponíveis na AGRO BW.',
    introTitle: 'Imóveis rurais para investimento e produção',
    introBody:
      'Esta categoria reúne anúncios de fazendas, sítios, chácaras, haras e terrenos voltados ao agronegócio e à expansão patrimonial no campo.',
  },
  servicos: {
    title: 'Serviços rurais, fretes e consultoria',
    description:
      'Encontre fretes, mão de obra, consultoria e serviços especializados para o agronegócio na AGRO BW.',
    introTitle: 'Serviços especializados para o agro',
    introBody:
      'A categoria de serviços conecta produtores e empresas a soluções de frete, consultoria, mão de obra e apoio técnico para o dia a dia no campo.',
  },
  sementes: {
    title: 'Sementes, grãos, pastagem e mudas',
    description:
      'Explore anúncios de sementes, grãos, pastagens, mudas e soluções para plantio no marketplace rural da AGRO BW.',
    introTitle: 'Sementes e soluções para plantio',
    introBody:
      'Nesta vitrine você encontra oportunidades em sementes, grãos, pastagens e mudas para diferentes perfis de produção rural.',
  },
};

export const getCategorySeoContent = (slug?: string | null) =>
  (slug ? CATEGORY_SEO_CONTENT[slug] : null) || null;
