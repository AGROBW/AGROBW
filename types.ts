import React from 'react';

export enum UserRole {
  VISITOR = 'VISITOR',
  ADVERTISER = 'ADVERTISER',
  BUYER = 'BUYER',
  ADMIN = 'ADMIN'
}

export enum AdStatus {
  ACTIVE = 'ACTIVE',
  PAUSED = 'PAUSED',
  EXPIRED = 'EXPIRED',
  BLOCKED = 'BLOCKED',
  PENDING = 'PENDING',
  SOLD = 'SOLD'
}

export type CategorySlug = 'animais' | 'maquinas' | 'insumos' | 'imoveis' | 'servicos' | 'seeds';

export interface Category {
  id: string;
  name: string;
  slug: string;
  icon: React.ReactNode;
  count: number;
  subcategories?: string[];
}

export interface TechnicalDetail {
  label: string;
  value: string;
  icon: React.ReactNode;
}

export interface Ad {
  id: string;
  title: string;
  description: string;
  price: number;
  location: {
    city: string;
    state: string;
    cep?: string;
  };
  categoryId: string;
  categorySlug?: string;
  images: string[];
  userId: string;
  status: AdStatus;
  views: number;
  isPremium: boolean;
  createdAt: string;
  whatsapp: string;
  technicalDetails?: TechnicalDetail[];
  healthScore?: number; // 0-100
}

export interface AdMetrics {
  adId: string;
  clicksByState: { state: string; count: number }[];
  marketAvgPrice: number;
  pricePosition: 'LOW' | 'MED' | 'HIGH';
}

export interface UserPlanQuota {
  used: number;
  total: number;
}

export interface PricingPlan {
  id: string;
  name: string;
  description: string;
  monthlyPrice: number;
  yearlyPrice: number;
  features: string[];
  isPopular: boolean;
  buttonText: string;
  comparison: {
    [key: string]: string | boolean;
  };
}

export interface PricingFeatureDetail {
  id: string;
  label: string;
  tooltip?: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  phone: string;
  document?: string;
  whatsapp?: string;
  cep?: string;
  logradouro?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  cidade?: string;
  estado?: string;
  location?: string;
  avatar?: string;
  plan?: 'seed' | 'boost' | 'harvest';
  twoFactorEnabled?: boolean;
  isAdmin?: boolean;
}

export interface Banner {
  id: string;
  image: string;
  title: string;
  subtitle: string;
  buttonText: string;
  buttonLink: string;
  order: number;
  isActive: boolean;
}

export interface Quotation {
  id: string;
  name: string;
  value: string;
  unit: string;
  change: number;
  trend: 'up' | 'down' | 'stable';
  lastUpdate: string;
}

export interface NewsItem {
  id: string;
  category: string;
  date: string;
  title: string;
  summary: string;
  imageUrl: string;
  link: string;
}

export interface Message {
  id: string;
  chatId: string;
  senderId: string;
  senderName: string;
  content: string;
  timestamp: string;
  isRead: boolean;
  senderAvatar?: string;
  isFiltered?: boolean; // Mensagem filtrada por conter contato não autorizado
}

export interface Chat {
  id: string; // chatId único
  adId: string;
  adTitle: string;
  adPrice: number;
  adImage: string;
  sellerId: string;
  sellerName: string;
  buyerId: string;
  buyerName: string;
  lastMessage: string;
  lastMessageTime: string;
  unreadCount: number;
  status: 'pending' | 'unlocked'; // pending = lead não desbloqueado
  createdAt: string;
}

export interface Lead {
  chatId: string;
  adId: string;
  sellerId: string;
  buyerId: string;
  status: 'pending' | 'unlocked';
  unlockedAt?: string;
  costInCredits?: number;
}

export interface ContactInfo {
  email: string;
  phone: string;
  whatsapp?: string;
}

export interface Notification {
  id: string;
  type: 'SYSTEM' | 'SECURITY' | 'PROMO' | 'AD_STATUS' | 'NEW_MESSAGE';
  title: string;
  content: string;
  timestamp: string;
  isRead: boolean;
  link?: string;
}

export interface Invoice {
  id: string;
  date: string;
  amount: number;
  status: 'PAID' | 'PENDING' | 'OVERDUE';
  planName: string;
  pdfUrl: string;
}

export interface Favorite {
  id: string;
  userId: string;
  adId: string;
  ad: Ad; // An�ncio favoritado
  priceAtFavorite: number; // Pre�o no momento do favorito
  favoritedAt: string;
}


export interface SMTPConfig {
  id: string;
  host: string;
  port: number;
  user: string;
  password: string; // Criptografada
  encryption: 'SSL' | 'TLS' | 'NONE';
  fromEmail: string;
  fromName: string;
  isActive: boolean;
  updatedAt: string;
}

export interface PriceDropNotification {
  id: string;
  userId: string;
  adId: string;
  adTitle: string;
  oldPrice: number;
  newPrice: number;
  percentDrop: number;
  notifiedAt: string;
  channels: ('email' | 'push')[]; // Canais utilizados
  emailSent: boolean;
  pushSent: boolean;
}
