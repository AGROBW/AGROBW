import React from 'react';
import {
  Building2,
  Cog,
  Home,
  Leaf,
  Package,
  PawPrint,
  Sprout,
  Trees,
  Wrench,
} from 'lucide-react';

const normalize = (value?: string | null) =>
  String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const iconMap = {
  pawprint: PawPrint,
  paw_print: PawPrint,
  'paw-print': PawPrint,
  cog: Cog,
  leaf: Leaf,
  home: Home,
  wrench: Wrench,
  sprout: Sprout,
  package: Package,
  building2: Building2,
  building: Building2,
  trees: Trees,
} as const;

const slugFallbackMap: Record<string, React.ComponentType<{ className?: string; strokeWidth?: number }>> = {
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
  if (normalizedIconName && normalizedIconName in iconMap) {
    return iconMap[normalizedIconName as keyof typeof iconMap];
  }

  const normalizedSlug = normalize(slug);
  return slugFallbackMap[normalizedSlug] || Package;
};
