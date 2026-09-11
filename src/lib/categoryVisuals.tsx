import React from 'react';
import {
  Apple,
  Beef,
  Bird,
  BriefcaseBusiness,
  Building2,
  Car,
  Citrus,
  CloudRain,
  Cog,
  Dog,
  Drill,
  Droplets,
  Egg,
  Factory,
  Fish,
  FlaskConical,
  Flower2,
  Fuel,
  Grape,
  Hammer,
  Home,
  LandPlot,
  Leaf,
  Map as MapIcon,
  MapPin,
  Milk,
  Mountain,
  Package,
  PawPrint,
  PlaneTakeoff,
  Rabbit,
  Recycle,
  Ship,
  ShoppingBasket,
  Shovel,
  Sprout,
  Sun,
  Tractor,
  Trees,
  Truck,
  Warehouse,
  Wheat,
  Wind,
  Wrench,
  Zap,
} from 'lucide-react';

export type CategoryIconComponent = React.ComponentType<{
  className?: string;
  strokeWidth?: number;
}>;

export interface CategoryIconOption {
  value: string;
  label: string;
  keywords: string[];
  Icon: CategoryIconComponent;
}

export const CATEGORY_ICON_OPTIONS: CategoryIconOption[] = [
  { value: 'PlaneTakeoff', label: 'Aeronave', keywords: ['aviao', 'aviacao', 'aereo'], Icon: PlaneTakeoff },
  { value: 'PawPrint', label: 'Animais', keywords: ['pata', 'pecuaria'], Icon: PawPrint },
  { value: 'Tractor', label: 'Trator', keywords: ['maquina', 'agricola'], Icon: Tractor },
  { value: 'Cog', label: 'Maquinas', keywords: ['engrenagem', 'equipamento'], Icon: Cog },
  { value: 'Wrench', label: 'Servicos', keywords: ['manutencao', 'ferramenta'], Icon: Wrench },
  { value: 'Package', label: 'Produtos', keywords: ['caixa', 'mercadoria'], Icon: Package },
  { value: 'Leaf', label: 'Insumos', keywords: ['folha', 'agricultura'], Icon: Leaf },
  { value: 'Sprout', label: 'Sementes', keywords: ['broto', 'plantio'], Icon: Sprout },
  { value: 'Wheat', label: 'Graos', keywords: ['trigo', 'colheita'], Icon: Wheat },
  { value: 'Trees', label: 'Natureza', keywords: ['arvore', 'floresta'], Icon: Trees },
  { value: 'Flower2', label: 'Flores', keywords: ['floricultura', 'planta'], Icon: Flower2 },
  { value: 'LandPlot', label: 'Terreno', keywords: ['terra', 'area'], Icon: LandPlot },
  { value: 'Home', label: 'Imoveis', keywords: ['casa', 'propriedade'], Icon: Home },
  { value: 'Building2', label: 'Estruturas', keywords: ['predio', 'construcao'], Icon: Building2 },
  { value: 'Warehouse', label: 'Armazem', keywords: ['galpao', 'deposito'], Icon: Warehouse },
  { value: 'Factory', label: 'Industria', keywords: ['fabrica', 'producao'], Icon: Factory },
  { value: 'Truck', label: 'Caminhao', keywords: ['transporte', 'carga'], Icon: Truck },
  { value: 'Car', label: 'Veiculo', keywords: ['carro', 'automovel'], Icon: Car },
  { value: 'Ship', label: 'Embarcacao', keywords: ['barco', 'navio'], Icon: Ship },
  { value: 'Fuel', label: 'Combustivel', keywords: ['posto', 'diesel'], Icon: Fuel },
  { value: 'Beef', label: 'Bovinos', keywords: ['gado', 'carne'], Icon: Beef },
  { value: 'Milk', label: 'Leite', keywords: ['laticinio', 'pecuaria'], Icon: Milk },
  { value: 'Egg', label: 'Ovos', keywords: ['avicultura', 'alimento'], Icon: Egg },
  { value: 'Bird', label: 'Aves', keywords: ['passaro', 'avicultura'], Icon: Bird },
  { value: 'Fish', label: 'Peixes', keywords: ['piscicultura', 'aquatico'], Icon: Fish },
  { value: 'Rabbit', label: 'Coelhos', keywords: ['animal', 'criacao'], Icon: Rabbit },
  { value: 'Dog', label: 'Pets', keywords: ['cachorro', 'animal'], Icon: Dog },
  { value: 'Apple', label: 'Frutas', keywords: ['alimento', 'pomar'], Icon: Apple },
  { value: 'Citrus', label: 'Citricos', keywords: ['laranja', 'fruta'], Icon: Citrus },
  { value: 'Grape', label: 'Uvas', keywords: ['vinicultura', 'fruta'], Icon: Grape },
  { value: 'ShoppingBasket', label: 'Comercio', keywords: ['cesta', 'mercado'], Icon: ShoppingBasket },
  { value: 'BriefcaseBusiness', label: 'Negocios', keywords: ['empresa', 'profissional'], Icon: BriefcaseBusiness },
  { value: 'Hammer', label: 'Construcao', keywords: ['obra', 'ferramenta'], Icon: Hammer },
  { value: 'Drill', label: 'Equipamentos', keywords: ['furadeira', 'ferramenta'], Icon: Drill },
  { value: 'Shovel', label: 'Escavacao', keywords: ['pa', 'solo'], Icon: Shovel },
  { value: 'Map', label: 'Regiao', keywords: ['mapa', 'localizacao'], Icon: MapIcon },
  { value: 'MapPin', label: 'Localizacao', keywords: ['endereco', 'ponto'], Icon: MapPin },
  { value: 'Mountain', label: 'Relevo', keywords: ['montanha', 'serra'], Icon: Mountain },
  { value: 'Droplets', label: 'Irrigacao', keywords: ['agua', 'gotas'], Icon: Droplets },
  { value: 'Sun', label: 'Energia solar', keywords: ['sol', 'clima'], Icon: Sun },
  { value: 'CloudRain', label: 'Chuva', keywords: ['clima', 'tempo'], Icon: CloudRain },
  { value: 'Wind', label: 'Vento', keywords: ['eolico', 'clima'], Icon: Wind },
  { value: 'Zap', label: 'Energia', keywords: ['eletricidade', 'raio'], Icon: Zap },
  { value: 'Recycle', label: 'Sustentabilidade', keywords: ['reciclagem', 'ambiental'], Icon: Recycle },
  { value: 'FlaskConical', label: 'Tecnologia', keywords: ['laboratorio', 'pesquisa'], Icon: FlaskConical },
];

const normalize = (value?: string | null) =>
  String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const iconMap = new Map<string, CategoryIconComponent>(
  CATEGORY_ICON_OPTIONS.map((option) => [normalize(option.value).replace(/-/g, ''), option.Icon])
);

iconMap.set('building', Building2);

const slugFallbackMap: Record<string, CategoryIconComponent> = {
  aeronaves: PlaneTakeoff,
  aviacao: PlaneTakeoff,
  'aeronaves-e-drones': PlaneTakeoff,
  animais: PawPrint,
  maquinas: Cog,
  'maquinas-equipamentos': Cog,
  insumos: Leaf,
  'fertilizantes-agricolas': Leaf,
  imoveis: Home,
  'imoveis-rurais': Home,
  servicos: Wrench,
  sementes: Sprout,
  pecas: Package,
  implementos: Package,
  fazendas: Building2,
  'arvores-adultas-mudas': Trees,
};

export const getCategoryIconComponent = (iconName?: string | null, slug?: string | null) => {
  const normalizedIconName = normalize(iconName).replace(/-/g, '');
  if (normalizedIconName && iconMap.has(normalizedIconName)) {
    return iconMap.get(normalizedIconName) || Package;
  }

  const normalizedSlug = normalize(slug);
  return slugFallbackMap[normalizedSlug] || Package;
};

export const getCategoryIconOption = (iconName?: string | null) => {
  const normalizedIconName = normalize(iconName).replace(/-/g, '');
  return CATEGORY_ICON_OPTIONS.find(
    (option) => normalize(option.value).replace(/-/g, '') === normalizedIconName
  );
};
