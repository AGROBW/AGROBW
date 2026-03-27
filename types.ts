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
  subCategoryId?: string;
  subCategoryLabel?: string;
  images: string[];
  userId: string;
  status: AdStatus;
  views: number;
  isPremium: boolean;
  createdAt: string;
  expiresAt?: string;
  expiredAt?: string;
  deletionScheduledAt?: string;
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
    business_description?: string;
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
  business_description?: string;
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

export type NewsSourceCaptureType = 'manual_url' | 'scraping' | 'api' | 'rss';
export type NewsArticleStatus = 'draft' | 'in_review' | 'published' | 'archived';
export type NewsCaptureStatus = 'pending' | 'captured' | 'failed';
export type NewsGenerationStatus = 'queued' | 'processing' | 'completed' | 'failed';
export type NewsSocialPlatform = 'instagram' | 'linkedin';
export type NewsSocialPublicationStatus = 'queued' | 'processing' | 'published' | 'failed' | 'disabled';
export type NewsSocialConnectionStatus = 'disconnected' | 'connected' | 'expiring_soon' | 'expired' | 'error';

export interface NewsSourceRecord {
  id: string;
  name: string;
  domain: string;
  notes?: string | null;
  isActive: boolean;
  captureType: NewsSourceCaptureType;
  usageCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface NewsIngestionRecord {
  id: string;
  sourceId?: string | null;
  sourceUrl: string;
  originalTitle?: string | null;
  originalPortalName?: string | null;
  originalPublishedAt?: string | null;
  originalAuthor?: string | null;
  featuredImageUrl?: string | null;
  extractedText?: string | null;
  extractedMetadata?: Record<string, unknown> | null;
  captureStatus: NewsCaptureStatus;
  captureError?: string | null;
  createdBy?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NewsArticleRecord {
  id: string;
  ingestionId?: string | null;
  legacyNewsId?: string | null;
  editorialCategory?: string | null;
  title: string;
  subtitle?: string | null;
  summary?: string | null;
  content?: string | null;
  agroImpact?: string | null;
  referencesBlock?: string | null;
  slug: string;
  status: NewsArticleStatus;
  featuredImageUrl?: string | null;
  featuredImagePath?: string | null;
  publishedAt?: string | null;
  createdBy?: string | null;
  updatedBy?: string | null;
  createdAt: string;
  updatedAt: string;
  sourceUrl?: string | null;
  originalPortalName?: string | null;
  originalTitle?: string | null;
  originalPublishedAt?: string | null;
  sourceName?: string | null;
}

export interface NewsGenerationJobRecord {
  id: string;
  articleId?: string | null;
  ingestionId?: string | null;
  status: NewsGenerationStatus;
  promptSnapshot?: string | null;
  model?: string | null;
  responsePayload?: Record<string, unknown> | null;
  errorMessage?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NewsSettingsRecord {
  id: string;
  defaultPrompt: string;
  maxExtractedCharacters: number;
  summaryRule: string;
  showAgroImpact: boolean;
  referencesTemplate: string;
  defaultGeneratedStatus: NewsArticleStatus;
  openaiModel?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NewsSocialSettingsRecord {
  id: string;
  instagramEnabled: boolean;
  instagramUsername?: string | null;
  instagramBusinessAccountId?: string | null;
  instagramAccessToken?: string | null;
  metaUserAccessToken?: string | null;
  facebookPageId?: string | null;
  facebookPageName?: string | null;
  facebookPageAccessToken?: string | null;
  instagramConnectionStatus?: NewsSocialConnectionStatus | null;
  instagramConnectedAt?: string | null;
  instagramTokenExpiresAt?: string | null;
  instagramTokenLastValidatedAt?: string | null;
  defaultInstagramStoryImageUrl?: string | null;
  defaultInstagramStoryImagePath?: string | null;
  linkedinEnabled: boolean;
  linkedinProfileType: 'member' | 'organization';
  linkedinProfileLabel?: string | null;
  linkedinAuthorUrn?: string | null;
  linkedinAccessToken?: string | null;
  defaultLinkedinImageUrl?: string | null;
  defaultLinkedinImagePath?: string | null;
  autoPublishInstagramStory: boolean;
  autoPublishLinkedinPost: boolean;
  instagramStoryTemplate?: string | null;
  linkedinPostTemplate?: string | null;
  articleUrlBase?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NewsSocialPublicationRecord {
  id: string;
  articleId: string;
  platform: NewsSocialPlatform;
  publicationType: 'story' | 'post';
  status: NewsSocialPublicationStatus;
  targetLabel?: string | null;
  articleTitle?: string | null;
  articleSlug?: string | null;
  externalPublicationId?: string | null;
  externalPublicationUrl?: string | null;
  caption?: string | null;
  requestPayload?: Record<string, unknown> | null;
  responsePayload?: Record<string, unknown> | null;
  errorMessage?: string | null;
  publishedAt?: string | null;
  createdAt: string;
  updatedAt: string;
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
  adStatus?: AdStatus;
  adExpiresAt?: string;
  adExpiredAt?: string;
  adDeletionScheduledAt?: string;
  leadContactExpiresAt?: string | null;
  isLeadContactExpired?: boolean;
  freezeReason?: 'announcement_expired' | 'lead_contact_expired' | null;
  isFrozen?: boolean;
  direction?: 'sent' | 'received';
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
  boosterId?: string | null;
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
  itemType?: 'plan' | 'booster' | null;
  itemName?: string | null;
}

export interface HighlightBoosterRecord {
  id: string;
  name: string;
  description?: string | null;
  monthlyPrice: number;
  categoryCredits: number;
  homeCredits: number;
  maxPurchasesPer30Days: number;
  buttonText: string;
  isActive: boolean;
  position: number;
}

export interface HighlightBoosterPurchaseRecord {
  id: string;
  boosterId: string;
  boosterName: string;
  amount: number;
  status: 'credited' | 'cancelled' | 'refunded';
  categoryCreditsTotal: number;
  categoryCreditsRemaining: number;
  homeCreditsTotal: number;
  homeCreditsRemaining: number;
  creditedAt: string;
  createdAt: string;
  paymentId?: string | null;
  providerPaymentId?: string | null;
}

export interface HighlightBoosterSummary {
  categoryRemaining: number;
  homeRemaining: number;
  purchasesLast30Days: number;
  canPurchase: boolean;
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

export interface LayoutSettings {
  id: string;
  siteName: string;
  siteShortName?: string | null;
  siteTagline?: string | null;
  headerBrandText?: string | null;
  footerBrandText?: string | null;
  loginBrandText?: string | null;
  seoTitle?: string | null;
  seoDescription?: string | null;
  logoUrl?: string | null;
  logoLightUrl?: string | null;
  logoDarkUrl?: string | null;
  faviconUrl?: string | null;
  facebookUrl?: string | null;
  instagramUrl?: string | null;
  youtubeUrl?: string | null;
  linkedinUrl?: string | null;
  whatsappUrl?: string | null;
  tiktokUrl?: string | null;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  backgroundColor: string;
  surfaceColor: string;
  textColor: string;
  mutedTextColor: string;
  successColor: string;
  warningColor: string;
  errorColor: string;
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

export type SupportTicketStatus = 'open' | 'in_progress' | 'waiting_user' | 'resolved' | 'closed';
export type SupportTicketPriority = 'low' | 'medium' | 'high' | 'urgent';
export type SupportTicketCategory = 'announcements' | 'billing' | 'plans' | 'messages' | 'technical' | 'other';
export type SupportTicketSenderType = 'user' | 'admin';

export interface SupportTicket {
  id: string;
  userId: string;
  subject: string;
  category: SupportTicketCategory;
  priority: SupportTicketPriority;
  status: SupportTicketStatus;
  description?: string | null;
  assignedAdminId?: string | null;
  lastMessageAt: string;
  createdAt: string;
  updatedAt: string;
  requesterName?: string | null;
  requesterEmail?: string | null;
}

export interface SupportTicketMessage {
  id: string;
  ticketId: string;
  senderType: SupportTicketSenderType;
  senderUserId?: string | null;
  senderAdminId?: string | null;
  senderName: string;
  message: string;
  createdAt: string;
}
