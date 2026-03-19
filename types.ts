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
  highlightCategory?: boolean;
  highlightCategoryUntil?: string;
  highlightHome?: boolean;
  highlightHomeUntil?: string;
  seller?: {
    name: string;
    avatar?: string;
    document_verified?: boolean;
    cidade?: string;
    estado?: string;
  };
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
  document_path?: string; // Caminho do documento de verificação
  document_verified?: boolean; // Status de validação OCR do documento
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
  credits?: number;
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

// Importar tipos de status das constantes centralizadas
import type { ChatStatus, LeadStatus } from './constants/status';

export type { ChatStatus, LeadStatus };

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
  status: ChatStatus;
  createdAt: string;
}

export interface Lead {
  chatId: string;
  adId: string;
  sellerId: string;
  buyerId: string;
  status: LeadStatus;
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
  type: 'new_lead' | 'radar_match' | 'new_message' | 'system' | 'plan_alert' | 'SYSTEM' | 'SECURITY' | 'PROMO' | 'AD_STATUS' | 'NEW_MESSAGE';
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

export type PaymentStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'cancelled'
  | 'refunded'
  | 'in_process'
  | 'charged_back';

export type FiscalDocumentStatus =
  | 'pending'
  | 'available'
  | 'failed'
  | 'not_applicable';

export type FiscalAutomationStatus =
  | 'not_requested'
  | 'queued'
  | 'processing'
  | 'issued'
  | 'failed'
  | 'manual';

export interface PaymentRecord {
  id: string;
  userId: string;
  subscriptionId?: string | null;
  planId?: string | null;
  provider: string;
  providerPaymentId: string;
  providerPreferenceId?: string | null;
  externalReference?: string | null;
  billingCycle?: 'monthly' | 'yearly' | null;
  description?: string | null;
  amount: number;
  currency: string;
  status: PaymentStatus;
  statusDetail?: string | null;
  paymentMethod?: string | null;
  receiptUrl?: string | null;
  invoiceNumber?: string | null;
  invoicePdfUrl?: string | null;
  invoiceStoragePath?: string | null;
  invoiceXmlUrl?: string | null;
  invoiceXmlStoragePath?: string | null;
  invoiceStatus: FiscalDocumentStatus;
  invoiceIssuedAt?: string | null;
  invoiceNotes?: string | null;
  fiscalProvider?: string | null;
  fiscalExternalId?: string | null;
  fiscalStatus: FiscalAutomationStatus;
  fiscalLastAttemptAt?: string | null;
  fiscalErrorMessage?: string | null;
  paidAt?: string | null;
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
  planName?: string | null;
}

export interface FiscalSettings {
  id: string;
  provider: 'FOCUSNFE';
  environment: 'sandbox' | 'production';
  autoIssueEnabled: boolean;
  legalName: string;
  tradeName?: string | null;
  cnpj: string;
  municipalRegistration?: string | null;
  taxRegime?: string | null;
  serviceCode?: string | null;
  serviceDescription?: string | null;
  serviceCityCode?: string | null;
  cnaeCode?: string | null;
  issuerEmail?: string | null;
  providerApiBaseUrl: string;
  providerCompanyId?: string | null;
  providerInvoiceEndpointPath: string;
  providerWebhookSecret?: string | null;
  invoiceSeries?: string | null;
  nextRpsNumber?: number | null;
  focusReferencePrefix: string;
  focusNaturezaOperacao: string;
  focusSpecialTaxRegime?: string | null;
  focusSimpleNational: boolean;
  focusServiceListItem?: string | null;
  focusMunicipalTaxCode?: string | null;
  focusIssWithheld: boolean;
  focusIssTaxationType?: string | null;
  focusIssRate?: number | null;
  additionalInformation?: string | null;
  lastUpdatedBy?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FiscalDocumentJob {
  id: string;
  paymentId: string;
  provider: string;
  status: 'pending' | 'processing' | 'awaiting_webhook' | 'completed' | 'failed' | 'cancelled';
  attempts: number;
  providerRequestId?: string | null;
  providerDocumentId?: string | null;
  requestPayload: Record<string, unknown>;
  responsePayload: Record<string, unknown>;
  lastError?: string | null;
  requestedAt: string;
  lastAttemptAt?: string | null;
  completedAt?: string | null;
  createdAt: string;
  updatedAt: string;
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
