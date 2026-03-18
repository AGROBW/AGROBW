import React from 'react';
import {
  BadgeCheck,
  Building2,
  Calendar,
  Clock,
  Gem,
  Home,
  Leaf,
  MapPin,
  PawPrint,
  Sprout,
  Target,
  Telescope,
  Truck,
  Wrench,
  Cog
} from 'lucide-react';
import { Category, Ad, AdStatus, Banner, NewsItem, PricingPlan, PricingFeatureDetail, Message, Notification, Invoice, AdMetrics } from './types';

// Icons for technical details
const Icons = {
  Brand: <Building2 className="w-5 h-5" strokeWidth={1.5} />,
  Calendar: <Calendar className="w-5 h-5" strokeWidth={1.5} />,
  Clock: <Clock className="w-5 h-5" strokeWidth={1.5} />,
  Condition: <BadgeCheck className="w-5 h-5" strokeWidth={1.5} />,
  Shipping: <Truck className="w-5 h-5" strokeWidth={1.5} />,
  Location: <MapPin className="w-5 h-5" strokeWidth={1.5} />,
};

export const CONTACT_CONFIG = {
  whatsapp: '5511999999999',
  whatsappDisplay: '(11) 99999-9999',
  email: 'suporte@bwagro.com.br',
  address: 'Av. Paulista, 1000 - Bela Vista, São Paulo - SP',
  workingHours: 'Segunda a Sexta, das 08h às 18h',
  mapEmbedUrl: 'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3657.197503049187!2d-46.65643442377501!3d-23.56134917879684!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x94ce59c8da0aa315%3A0xd59f94f441977d0a!2sAv.%20Paulista%2C%201000%20-%20Bela%20Vista%2C%20S%C3%A3o%20Paulo%20-%20SP%2C%2001310-100!5e0!3m2!1spt-BR!2sbr!4v1700000000000!5m2!1spt-BR!2sbr'
};

export const ABOUT_DATA = {
  hero: {
    title: "BWAGRO: Conectando quem produz ao futuro do agronegócio",
    subtitle: "A plataforma líder que transforma o mercado rural com transparência e tecnologia.",
    image: "https://images.unsplash.com/photo-1500382017468-9049fed747ef?q=80&w=1600&auto=format&fit=crop"
  },
  history: {
    title: "Nossa História",
    text: "Nascida da necessidade real do produtor rural brasileiro, a BWAGRO surgiu em 2020 para eliminar barreiras e burocracias no mercado de compra e venda no campo. O que começou como um projeto regional de classificados de máquinas tornou-se a maior rede de conexões do agronegócio nacional. Entendemos que o tempo no campo é precioso e que a confiança é o adubo de qualquer bom negócio.",
    image: "https://images.unsplash.com/photo-1464226184884-fa280b87c399?q=80&w=800&auto=format&fit=crop"
  },
  pillars: [
    {
      label: "Missão",
      text: "Prover as melhores ferramentas tecnológicas para que o produtor rural comercialize seus ativos com segurança e eficiência máxima.",
      icon: <Target className="w-8 h-8" strokeWidth={1.5} />
    },
    {
      label: "Visão",
      text: "Ser o ecossistema digital indispensável para o agronegócio, sendo a primeira escolha para compra, venda e parcerias rurais.",
      icon: <Telescope className="w-8 h-8" strokeWidth={1.5} />
    },
    {
      label: "Valores",
      text: "Integridade nas relações, inovação constante centrada no usuário, e compromisso absoluto com o desenvolvimento sustentável do campo.",
      icon: <Gem className="w-8 h-8" strokeWidth={1.5} />
    }
  ],
  stats: [
    { label: "Usuários Ativos", value: 10, suffix: "k+" },
    { label: "Anúncios Criados", value: 50, suffix: "k+" },
    { label: "Negócios Gerados", value: 850, suffix: " Mi" }
  ],
  differences: [
    { title: "Tecnologia de Ponta", text: "Filtros inteligentes e interface otimizada para quem está no campo." },
    { title: "Facilidade de Uso", text: "Anuncie seus produtos em menos de 2 minutos pelo celular." },
    { title: "Suporte Especializado", text: "Time que entende a realidade rural pronto para auxiliar." }
  ]
};

export const TERMS_DATA = {
  lastUpdate: '20 de Maio de 2024',
  sections: [
    {
      id: 'aceitacao',
      title: '1. Aceitação dos Termos',
      content: '<p>Ao acessar e utilizar a plataforma BWAGRO, você concorda expressamente com estes Termos de Uso. Se você não concordar com qualquer parte destes termos, não deverá utilizar nossos serviços. A BWAGRO atua como uma plataforma de classificados, conectando compradores e vendedores do agronegócio.</p>'
    },
    {
      id: 'cadastro',
      title: '2. Cadastro e Segurança da Conta',
      content: '<p>Para publicar anúncios, o usuário deve realizar um cadastro fornecendo dados verídicos e atualizados. Você é o único responsável por manter a confidencialidade de sua senha e por todas as atividades que ocorrem em sua conta.</p><ul><li>O cadastro é pessoal e intransferível.</li><li>A BWAGRO reserva-se o direito de suspender contas com dados suspeitos.</li></ul>'
    },
    {
      id: 'regras-anuncios',
      title: '3. Regras para Publicação de Anúncios',
      content: '<p>Todos os anúncios devem ser verídicos e refletir o estado real do produto. É proibida a publicação de:</p><ul><li>Produtos ilegais ou de origem duvidosa.</li><li>Conteúdo ofensivo, discriminatório ou fraudulento.</li><li>Anúncios duplicados na mesma categoria.</li></ul><p>O anunciante é civil e criminalmente responsável pelo conteúdo de suas publicações.</p>'
    },
    {
      id: 'planos-reembolso',
      title: '4. Planos de Assinatura e Reembolso',
      content: '<p>A BWAGRO oferece planos gratuitos e premium. O pagamento dos planos premium garante maior visibilidade conforme descrito na página de Planos. Reembolsos podem ser solicitados em até 7 dias após a contratação, desde que os benefícios de destaque ainda não tenham sido integralmente utilizados.</p>'
    },
    {
      id: 'propriedade-intelectual',
      title: '5. Propriedade Intelectual',
      content: '<p>A marca BWAGRO, logotipos, layouts e o código-fonte da plataforma são propriedade exclusiva de nossa empresa. O uso indevido de nossa marca ou o "scraping" de dados de nossos usuários para fins comerciais externos é terminantemente proibido e passível de medidas legais.</p>'
    },
    {
      id: 'responsabilidade',
      title: '6. Limitação de Responsabilidade',
      content: '<p>A BWAGRO não participa das negociações financeiras entre usuários. Não garantimos a qualidade dos produtos anunciados nem a idoneidade financeira dos compradores. Recomendamos sempre verificar o produto pessoalmente e realizar transações seguras.</p>'
    }
  ]
};

export const PRIVACY_DATA = {
  lastUpdate: '15 de Janeiro de 2025',
  intro: 'Na BWAGRO, levamos a sério a proteção dos seus dados. Esta política detalha como coletamos, usamos e protegemos suas informações em conformidade com a LGPD.',
  sections: [
    {
      id: 'dados-coletados',
      title: '1. Dados que Coletamos',
      summary: 'Coletamos apenas o essencial para que você realize negócios com segurança: dados cadastrais, informações dos anúncios e cookies técnicos.',
      content: '<p>Coletamos informações que você nos fornece diretamente, como nome, e-mail, telefone e localização quando você cria uma conta ou publica um anúncio. Também coletamos dados técnicos automaticamente, como endereço IP, tipo de navegador e páginas visitadas para garantir a estabilidade da plataforma.</p>'
    },
    {
      id: 'uso-dados',
      title: '2. Como Usamos Seus Dados',
      summary: 'Seus dados servem para viabilizar as vendas, melhorar sua experiência e garantir a segurança contra fraudes.',
      content: '<p>Utilizamos seus dados para: </p><ul><li>Viabilizar o contato entre comprador e vendedor.</li><li>Personalizar sugestões de anúncios de acordo com seu interesse.</li><li>Enviar notificações importantes sobre sua conta ou anúncios.</li><li>Prevenir atividades fraudulentas e garantir a integridade do marketplace.</li></ul>'
    },
    {
      id: 'compartilhamento',
      title: '3. Compartilhamento com Terceiros',
      summary: 'Nunca vendemos seus dados. Compartilhamos apenas com parceiros essenciais (como processadores de pagamento) ou por ordem judicial.',
      content: '<p>Seus dados podem ser compartilhados com fornecedores de serviços que nos auxiliam na operação (hospedagem, análise de dados e meios de pagamento). Todos os nossos parceiros são obrigados por contrato a manter o mesmo nível de proteção de dados que a BWAGRO.</p>'
    },
    {
      id: 'seus-direitos',
      title: '4. Seus Direitos (LGPD)',
      summary: 'Você é o dono dos seus dados. Pode solicitar acesso, correção ou exclusão a qualquer momento.',
      content: '<p>Conforme a LGPD, você tem direito a: </p><ul><li>Confirmar a existência de tratamento de seus dados.</li><li>Acessar e corrigir dados incompletos ou desatualizados.</li><li>Solicitar a exclusão definitiva de seus dados de nossa base (salvo obrigações legais de retenção).</li><li>Revogar seu consentimento para comunicações de marketing.</li></ul>'
    },
    {
      id: 'retencao',
      title: '5. Retenção e Segurança',
      summary: 'Mantemos seus dados pelo tempo necessário para cumprir as finalidades descritas ou obrigações legais.',
      content: '<p>Armazenamos seus dados em servidores seguros com criptografia de ponta. Os dados de anúncios permanecem ativos enquanto o anúncio existir, e os dados de conta permanecem até que você solicite a exclusão ou a conta fique inativa por mais de 5 anos.</p>'
    },
    {
      id: 'contato-dpo',
      title: '6. Encarregado de Dados (DPO)',
      summary: 'Dúvidas jurídicas sobre privacidade? Nosso Encarregado de Dados está pronto para ajudar.',
      content: '<p>Para qualquer questão relativa à sua privacidade ou para exercer seus direitos, entre em contato com nosso DPO pelo e-mail: <strong>dpo@bwagro.com.br</strong>. Responderemos sua solicitação em até 15 dias úteis.</p>'
    }
  ]
};

export const CATEGORIES: Category[] = [
  { 
    id: '1', 
    name: 'Animais', 
    slug: 'animais', 
    icon: <PawPrint className="w-6 h-6" strokeWidth={1.5} />, 
    count: 1240,
    subcategories: ['Bovinos', 'Equinos', 'Ovinos/Caprinos', 'Aves', 'Peixes', 'Pet & Cia']
  },
  { 
    id: '2', 
    name: 'Máquinas', 
    slug: 'maquinas', 
    icon: <Cog className="w-6 h-6" strokeWidth={1.5} />, 
    count: 850,
    subcategories: ['Tratores', 'Colheitadeiras', 'Implementos', 'Pulverizadores', 'Peças']
  },
  { 
    id: '3', 
    name: 'Insumos', 
    slug: 'insumos', 
    icon: <Leaf className="w-6 h-6" strokeWidth={1.5} />, 
    count: 420,
    subcategories: ['Sementes', 'Fertilizantes', 'Defensivos', 'Nutrição Animal']
  },
  { 
    id: '4', 
    name: 'Imóveis Rurais', 
    slug: 'imoveis', 
    icon: <Home className="w-6 h-6" strokeWidth={1.5} />, 
    count: 310,
    subcategories: ['Fazendas', 'Sítios', 'Chácaras', 'Haras', 'Terrenos']
  },
  { 
    id: '5', 
    name: 'Serviços', 
    slug: 'servicos', 
    icon: <Wrench className="w-6 h-6" strokeWidth={1.5} />, 
    count: 180,
    subcategories: ['Fretes', 'Mão de Obra', 'Consultoria', 'Topografia']
  },
  { 
    id: '6', 
    name: 'Sementes', 
    slug: 'sementes', 
    icon: <Sprout className="w-6 h-6" strokeWidth={1.5} />, 
    count: 250,
    subcategories: ['Grãos', 'Pastagem', 'Hortaliças', 'Frutas']
  },
];

export const MOCK_PLANS: PricingPlan[] = [
  {
    id: 'plan_seed',
    name: 'Semente',
    description: 'Para quem está começando e quer testar a plataforma.',
    monthlyPrice: 0,
    yearlyPrice: 0,
    isPopular: false,
    buttonText: 'Começar Grátis',
    features: ['Até 5 fotos', 'Válido por 30 dias', 'Suporte por E-mail'],
    comparison: {
      photos: '5 Fotos',
      validity: '30 dias',
      highlight: false,
      reports: false,
      whatsapp: false,
      priority: false
    }
  },
  {
    id: 'plan_boost',
    name: 'Impulso',
    description: 'O equilíbrio perfeito entre visibilidade e investimento.',
    monthlyPrice: 89.90,
    yearlyPrice: 863.04, // ~20% off
    isPopular: true,
    buttonText: 'Assinar Impulso',
    features: ['Até 12 fotos', 'Selo de Destaque', 'Válido por 90 dias', 'Suporte via WhatsApp'],
    comparison: {
      photos: '12 Fotos',
      validity: '90 dias',
      highlight: true,
      reports: 'Básico',
      whatsapp: true,
      priority: false
    }
  },
  {
    id: 'plan_harvest',
    name: 'Colheita',
    description: 'Máximo desempenho para grandes vendedores e imobiliárias.',
    monthlyPrice: 199.90,
    yearlyPrice: 1919.04, // ~20% off
    isPopular: false,
    buttonText: 'Plano Profissional',
    features: ['Fotos ilimitadas', 'Destaque Prata', 'Válido por 365 dias', 'Relatórios Avançados'],
    comparison: {
      photos: 'Ilimitado',
      validity: '365 dias',
      highlight: 'Prata (Top)',
      reports: 'Avançado',
      whatsapp: true,
      priority: true
    }
  }
];

export const PRICING_FEATURES: PricingFeatureDetail[] = [
  { id: 'photos', label: 'Quantidade de fotos' },
  { id: 'validity', label: 'Validade do anúncio' },
  { id: 'highlight', label: 'Selo de destaque' },
  { id: 'reports', label: 'Relatórios de cliques' },
  { id: 'whatsapp', label: 'Botão WhatsApp Direto' },
  { id: 'priority', label: 'Prioridade na Busca' }
];

export const PRICING_FAQ = [
  {
    question: 'Como funcionam os pagamentos?',
    answer: 'Aceitamos cartões de crédito, boleto bancário e PIX. No plano anual, você garante um desconto exclusivo de 20%.'
  },
  {
    question: 'Posso cancelar minha assinatura a qualquer momento?',
    answer: 'Sim! Você pode cancelar a renovação automática pelo seu painel a qualquer momento, sem taxas de cancelamento.'
  },
  {
    question: 'O que acontece quando meu anúncio expira?',
    answer: 'Seu anúncio ficará pausado. Você poderá renová-lo manualmente ou fazer um upgrade de plano para reativá-lo.'
  },
  {
    question: 'Existe limite de anúncios por conta?',
    answer: 'No plano gratuito sim, mas nossos planos pagos permitem múltiplos anúncios ativos simultaneamente conforme a categoria.'
  }
];

export const MOCK_ADS: Ad[] = [
  {
    id: 'ad1',
    title: 'Trator John Deere 6125J - 2021',
    description: 'Trator em excelente estado de conservação, apenas 1200 horas. Equipado com GPS original John Deere, cabine climatizada e pneus em ótimo estado. Ideal para operações de preparo de solo e plantio de precisão.',
    price: 450000,
    location: { city: 'Ribeirão Preto', state: 'SP' },
    categoryId: '2',
    images: ['https://images.unsplash.com/photo-1593113598332-cd288d649433?q=80&w=800&auto=format&fit=crop'],
    userId: 'u1',
    status: AdStatus.ACTIVE,
    views: 1250,
    isPremium: true,
    createdAt: '2023-10-25',
    whatsapp: '11999999999',
    healthScore: 85,
    technicalDetails: [
      { label: 'Marca', value: 'John Deere', icon: Icons.Brand },
      { label: 'Modelo', value: '6125J', icon: Icons.Brand },
      { label: 'Ano', value: '2021', icon: Icons.Calendar },
      { label: 'Horas', value: '1.200 h', icon: Icons.Clock },
      { label: 'Condição', value: 'Usado', icon: Icons.Condition },
      { label: 'Tipo', value: 'Trator Agrícola', icon: Icons.Brand }
    ]
  },
  {
    id: 'ad2',
    title: 'Lote de Novilhas Nelore PO',
    description: '30 novilhas nelore puras de origem, ótimas para cria. Animais com registro genealógico, excelente carcaça e precocidade. Criadas a pasto com suplementação mineral de alta qualidade.',
    price: 120000,
    location: { city: 'Uberlândia', state: 'MG' },
    categoryId: '1',
    images: ['https://images.unsplash.com/photo-1547496502-affa22d38842?q=80&w=800&auto=format&fit=crop'],
    userId: 'u1',
    status: AdStatus.PENDING,
    views: 840,
    isPremium: true,
    createdAt: '2023-10-26',
    whatsapp: '11999999999',
    healthScore: 60,
    technicalDetails: [
      { label: 'Raça', value: 'Nelore PO', icon: Icons.Brand },
      { label: 'Quantidade', value: '30 Unidades', icon: Icons.Condition },
      { label: 'Idade', value: '24 Meses', icon: Icons.Calendar },
      { label: 'Localização', value: 'Triângulo Mineiro', icon: Icons.Location },
      { label: 'Envio', value: 'Por conta do comprador', icon: Icons.Shipping },
      { label: 'Condição', value: 'Excelente', icon: Icons.Condition }
    ]
  },
  {
    id: 'ad3',
    title: 'Fazenda 500 Alqueires em Mato Grosso',
    description: 'Terra de cultura, dupla aptidão, rica em água. Localização privilegiada com fácil acesso para escoamento de safras. Possui sede completa, curral moderno e solo com alto teor de argila.',
    price: 15000000,
    location: { city: 'Sorriso', state: 'MT' },
    categoryId: '4',
    images: ['https://images.unsplash.com/photo-1500382017468-9049fed747ef?q=80&w=800&auto=format&fit=crop'],
    userId: 'u3',
    status: AdStatus.ACTIVE,
    views: 2500,
    isPremium: false,
    createdAt: '2023-10-24',
    whatsapp: '11999999999',
    healthScore: 95,
    technicalDetails: [
      { label: 'Área Total', value: '500 Alqueires', icon: Icons.Location },
      { label: 'Uso Solo', value: 'Agrícola/Pecuária', icon: Icons.Brand },
      { label: 'Infraestrutura', value: 'Completa', icon: Icons.Condition },
      { label: 'Logística', value: 'Beira de Asfalto', icon: Icons.Shipping },
      { label: 'Argila', value: 'Acima de 35%', icon: Icons.Condition },
      { label: 'Documentação', value: 'GEO/CAR OK', icon: Icons.Condition }
    ]
  }
];

export const MOCK_METRICS: AdMetrics[] = [
  {
    adId: 'ad1',
    marketAvgPrice: 480000,
    pricePosition: 'LOW',
    clicksByState: [
      { state: 'MT', count: 450 },
      { state: 'SP', count: 320 },
      { state: 'MG', count: 180 },
      { state: 'MS', count: 120 },
      { state: 'GO', count: 100 }
    ]
  },
  {
    adId: 'ad2',
    marketAvgPrice: 115000,
    pricePosition: 'MED',
    clicksByState: [
      { state: 'MG', count: 300 },
      { state: 'SP', count: 250 },
      { state: 'GO', count: 150 }
    ]
  }
];

export const MOCK_MESSAGES: Message[] = [
  {
    id: 'm1',
    chatId: 'chat_ad1_u1_buyer123',
    senderId: 'buyer123',
    senderName: 'Ricardo Almeida',
    content: 'Olá, aceita troca por caminhonete no negócio?',
    timestamp: '2024-05-20T10:30:00Z',
    isRead: false,
    senderAvatar: 'https://i.pravatar.cc/150?u=ricardo'
  },
  {
    id: 'm2',
    chatId: 'chat_ad1_u1_buyer123',
    senderId: 'u1',
    senderName: 'João do Campo',
    content: 'Olá Ricardo, podemos conversar sobre. Qual o modelo da sua caminhonete?',
    timestamp: '2024-05-20T11:00:00Z',
    isRead: true,
  }
];

export const MOCK_NOTIFICATIONS: Notification[] = [
  {
    id: 'n1',
    type: 'AD_STATUS',
    title: 'Anúncio Aprovado!',
    content: 'Seu anúncio "Trator John Deere" foi revisado e já está online.',
    timestamp: '2024-05-19T14:20:00Z',
    isRead: true
  },
  {
    id: 'n2',
    type: 'SECURITY',
    title: 'Novo Acesso Detectado',
    content: 'Um novo login foi realizado em sua conta a partir de um dispositivo Chrome em SP.',
    timestamp: '2024-05-20T08:15:00Z',
    isRead: false
  }
];

export const MOCK_INVOICES: Invoice[] = [
  {
    id: 'inv_001',
    date: '2024-05-01',
    amount: 89.90,
    status: 'PAID',
    planName: 'Impulso Mensal',
    pdfUrl: '#'
  },
  {
    id: 'inv_002',
    date: '2024-06-01',
    amount: 89.90,
    status: 'PENDING',
    planName: 'Impulso Mensal',
    pdfUrl: '#'
  }
];

export const HOME_BANNERS: Banner[] = [
  {
    id: 'b1',
    image: 'https://images.unsplash.com/photo-1500382017468-9049fed747ef?q=80&w=1600&auto=format&fit=crop',
    title: 'O Campo em Movimento',
    subtitle: 'A maior vitrine do agronegócio brasileiro está aqui.',
    buttonText: 'Explorar Agora',
    buttonLink: '#/anuncios',
    order: 1,
    isActive: true
  },
  {
    id: 'b2',
    image: 'https://images.unsplash.com/photo-1464226184884-fa280b87c399?q=80&w=1600&auto=format&fit=crop',
    title: 'Insumos de Alta Performance',
    subtitle: 'Maximize sua produtividade com os melhores parceiros.',
    buttonText: 'Ver Insumos',
    buttonLink: '#/insumos',
    order: 2,
    isActive: true
  }
];

export const MOCK_NEWS: NewsItem[] = [
  {
    id: 'n1',
    category: 'MERCADO',
    date: '25 Jan 2026',
    title: 'Exportações de Soja batem recorde no primeiro trimestre',
    summary: 'Aumento na demanda asiática impulsiona os preços nos portos brasileiros, atingindo patamares históricos.',
    imageUrl: 'https://images.unsplash.com/photo-1530507629858-e4977d30e9e0?q=80&w=800&auto=format&fit=crop',
    link: '#/noticias/soja-recorde'
  },
  {
    id: 'n2',
    category: 'CLIMA',
    date: '24 Jan 2026',
    title: 'Previsão de chuvas favorece safrinha no Centro-Oeste',
    summary: 'Meteorologistas indicam regularização do regime hídrico nas principais regiões produtoras de milho.',
    imageUrl: 'https://images.unsplash.com/photo-1516466723877-e4ec1d736c8a?q=80&w=800&auto=format&fit=crop',
    link: '#/noticias/clima-safrinha'
  },
  {
    id: 'n3',
    category: 'TECNOLOGIA',
    date: '23 Jan 2026',
    title: 'Novos drones de pulverização reduzem custos em até 30%',
    summary: 'Tecnologia de precisão permite aplicação localizada de defensivos, otimizando recursos e tempo do produtor.',
    imageUrl: 'https://images.unsplash.com/photo-1508614589041-895b83967e45?q=80&w=800&auto=format&fit=crop',
    link: '#/noticias/drones-agro'
  }
];
