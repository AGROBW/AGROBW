import { Message, Chat, Lead, ContactInfo, User } from '../types';
import { CHAT_STATUS, LEAD_STATUS, LeadStatus } from '../constants/status';

type MockLeadStatus = 'pending' | 'unlocked';
type StoredLead = Omit<Lead, 'status'> & { status: LeadStatus | MockLeadStatus };

// ========================================
// FILTRO DE SEGURANÇA (GATEKEEPER)
// ========================================

const CONTACT_PATTERNS = [
  /\b\d{10,11}\b/g, // Telefones brasileiros
  /\(\d{2}\)\s*\d{4,5}-?\d{4}/g, // (XX) XXXXX-XXXX
  /whats?app/gi,
  /zap/gi,
  /tel(?:efone)?/gi,
  /email/gi,
  /[@]\w+/g, // Emails parciais
  /\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/gi, // Emails completos
  /(?:https?:\/\/)?(?:www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b/gi // URLs
];

export const filterMessageContent = (content: string, isLeadUnlocked: boolean): { filtered: string; isFiltered: boolean } => {
  if (isLeadUnlocked) {
    return { filtered: content, isFiltered: false };
  }

  let filtered = content;
  let isFiltered = false;

  CONTACT_PATTERNS.forEach(pattern => {
    if (pattern.test(filtered)) {
      isFiltered = true;
      filtered = filtered.replace(pattern, '[CONTATO BLOQUEADO]');
    }
  });

  return { filtered, isFiltered };
};

// ========================================
// GERENCIAMENTO DE LEADS
// ========================================

const LEAD_UNLOCK_COST = 5; // Créditos necessários para desbloquear

export const getLeads = (): StoredLead[] => {
  const stored = localStorage.getItem('bwagro_leads');
  return stored ? JSON.parse(stored) : [];
};

export const saveLead = (lead: StoredLead): void => {
  const leads = getLeads();
  const index = leads.findIndex(l => l.chatId === lead.chatId);
  
  if (index >= 0) {
    leads[index] = lead;
  } else {
    leads.push(lead);
  }
  
  localStorage.setItem('bwagro_leads', JSON.stringify(leads));
};

export const getLeadStatus = (chatId: string): 'pending' | 'unlocked' => {
  const leads = getLeads();
  const lead = leads.find(l => l.chatId === chatId);
  if (!lead) return 'pending';
  return lead.status === 'unlocked' ? 'unlocked' : 'pending';
};

export const unlockLead = (chatId: string, userId: string): { success: boolean; message: string } => {
  const user = getCurrentUser();
  
  if (!user) {
    return { success: false, message: 'Usuário não autenticado' };
  }

  // Verificar se usuário tem créditos ou plano adequado
  const userCredits = getUserCredits(userId);
  const userPlan = user.plan;

  // Plano Harvest tem leads ilimitados
  if (userPlan === 'harvest') {
    const lead = getLeads().find(l => l.chatId === chatId);
    if (lead) {
      lead.status = 'unlocked';
      lead.unlockedAt = new Date().toISOString();
      saveLead(lead);
      return { success: true, message: 'Lead desbloqueado com sucesso (Plano Harvest)' };
    }
  }

  // Verificar créditos disponíveis
  if (userCredits < LEAD_UNLOCK_COST) {
    return { success: false, message: `Créditos insuficientes. Necessário: ${LEAD_UNLOCK_COST}. Disponível: ${userCredits}` };
  }

  // Desbloquear e deduzir créditos
  const lead = getLeads().find(l => l.chatId === chatId);
  if (lead) {
    lead.status = 'unlocked';
    lead.unlockedAt = new Date().toISOString();
    lead.costInCredits = LEAD_UNLOCK_COST;
    saveLead(lead);
    
    deductCredits(userId, LEAD_UNLOCK_COST);
    
    return { success: true, message: 'Lead desbloqueado com sucesso!' };
  }

  return { success: false, message: 'Lead não encontrado' };
};

// ========================================
// GERENCIAMENTO DE CRÉDITOS
// ========================================

export const getUserCredits = (userId: string): number => {
  const stored = localStorage.getItem(`bwagro_credits_${userId}`);
  return stored ? parseInt(stored, 10) : 0;
};

export const deductCredits = (userId: string, amount: number): void => {
  const current = getUserCredits(userId);
  const newAmount = Math.max(0, current - amount);
  localStorage.setItem(`bwagro_credits_${userId}`, newAmount.toString());
};

export const addCredits = (userId: string, amount: number): void => {
  const current = getUserCredits(userId);
  localStorage.setItem(`bwagro_credits_${userId}`, (current + amount).toString());
};

// ========================================
// GERENCIAMENTO DE CHATS
// ========================================

export const getChats = (userId: string): Chat[] => {
  const stored = localStorage.getItem('bwagro_chats');
  const allChats: Chat[] = stored ? JSON.parse(stored) : [];
  
  // Retornar apenas chats onde o usuário é participante
  return allChats.filter(chat => 
    chat.sellerId === userId || chat.buyerId === userId
  );
};

export const getChatById = (chatId: string): Chat | null => {
  const stored = localStorage.getItem('bwagro_chats');
  const allChats: Chat[] = stored ? JSON.parse(stored) : [];
  return allChats.find(chat => chat.id === chatId) || null;
};

export const saveChat = (chat: Chat): void => {
  const stored = localStorage.getItem('bwagro_chats');
  const allChats: Chat[] = stored ? JSON.parse(stored) : [];
  
  const index = allChats.findIndex(c => c.id === chat.id);
  if (index >= 0) {
    allChats[index] = chat;
  } else {
    allChats.push(chat);
  }
  
  localStorage.setItem('bwagro_chats', JSON.stringify(allChats));
};

export const createOrGetChat = (adId: string, adTitle: string, adPrice: number, adImage: string, sellerId: string, sellerName: string, buyerId: string, buyerName: string): Chat => {
  // Gerar chatId único baseado em ad + seller + buyer
  const chatId = `chat_${adId}_${sellerId}_${buyerId}`;
  
  // Verificar se já existe
  const existing = getChatById(chatId);
  if (existing) return existing;
  
  // Criar novo chat
  const newChat: Chat = {
    id: chatId,
    adId,
    adTitle,
    adPrice,
    adImage,
    sellerId,
    sellerName,
    buyerId,
    buyerName,
    lastMessage: '',
    lastMessageTime: new Date().toISOString(),
    unreadCount: 0,
    status: CHAT_STATUS.NOVO,
    createdAt: new Date().toISOString()
  };
  
  saveChat(newChat);
  
  // Criar lead
  const lead: Lead = {
    chatId,
    adId,
    sellerId,
    buyerId,
    status: LEAD_STATUS.NEW
  };
  saveLead(lead);
  
  return newChat;
};

// ========================================
// GERENCIAMENTO DE MENSAGENS
// ========================================

export const getMessages = (chatId: string): Message[] => {
  const stored = localStorage.getItem(`bwagro_messages_${chatId}`);
  return stored ? JSON.parse(stored) : [];
};

export const sendMessage = (chatId: string, senderId: string, senderName: string, content: string): Message => {
  const chat = getChatById(chatId);
  if (!chat) throw new Error('Chat não encontrado');
  
  // Verificar se é o vendedor enviando e lead está pendente
  const isSellerSending = senderId === chat.sellerId;
  const leadStatus = getLeadStatus(chatId);
  const isUnlocked = leadStatus === 'unlocked';
  
  // Aplicar filtro de segurança
  const { filtered, isFiltered } = filterMessageContent(content, isUnlocked || !isSellerSending);
  
  const message: Message = {
    id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    chatId,
    senderId,
    senderName,
    content: filtered,
    timestamp: new Date().toISOString(),
    isRead: false,
    isFiltered
  };
  
  // Salvar mensagem
  const messages = getMessages(chatId);
  messages.push(message);
  localStorage.setItem(`bwagro_messages_${chatId}`, JSON.stringify(messages));
  
  // Atualizar chat
  chat.lastMessage = filtered;
  chat.lastMessageTime = message.timestamp;
  
  // Incrementar contador de não lidas para o destinatário
  const receiverId = senderId === chat.sellerId ? chat.buyerId : chat.sellerId;
  if (receiverId) {
    chat.unreadCount = (chat.unreadCount || 0) + 1;
  }
  
  saveChat(chat);
  
  // Criar notificação para destinatário
  createMessageNotification(receiverId, senderName, chat.adTitle, chatId);
  
  return message;
};

export const markChatAsRead = (chatId: string, userId: string): void => {
  const chat = getChatById(chatId);
  if (!chat) return;
  
  // Resetar contador
  chat.unreadCount = 0;
  saveChat(chat);
  
  // Marcar mensagens como lidas
  const messages = getMessages(chatId);
  const updated = messages.map(msg => {
    if (msg.senderId !== userId) {
      return { ...msg, isRead: true };
    }
    return msg;
  });
  
  localStorage.setItem(`bwagro_messages_${chatId}`, JSON.stringify(updated));
};

// ========================================
// MASCARAMENTO DE CONTATO
// ========================================

export const getContactInfo = (userId: string, chatId: string, requestingUserId: string): ContactInfo | null => {
  const chat = getChatById(chatId);
  if (!chat) return null;
  
  // Se o solicitante é o comprador, sempre pode ver
  const isRequesterBuyer = requestingUserId === chat.buyerId;
  if (isRequesterBuyer) {
    return getMockContactInfo(userId);
  }
  
  // Se o solicitante é o vendedor, precisa ter desbloqueado
  const leadStatus = getLeadStatus(chatId);
  if (leadStatus === 'unlocked') {
    return getMockContactInfo(userId);
  }
  
  // Mascarar
  return {
    email: '••••••@••••.com',
    phone: '(••) •••••-••••',
    whatsapp: 'BLOQUEADO'
  };
};

// Mock de dados de contato (substituir por API real)
const getMockContactInfo = (userId: string): ContactInfo => {
  return {
    email: 'contato@example.com',
    phone: '(16) 99999-9999',
    whatsapp: '(16) 99999-9999'
  };
};

// ========================================
// NOTIFICAÇÕES
// ========================================

const createMessageNotification = (userId: string, senderName: string, adTitle: string, chatId: string): void => {
  const notifications = JSON.parse(localStorage.getItem('bwagro_notifications') || '[]');
  
  notifications.unshift({
    id: `notif_${Date.now()}`,
    type: 'NEW_MESSAGE',
    title: 'Nova mensagem',
    content: `${senderName} enviou uma mensagem sobre "${adTitle}"`,
    timestamp: new Date().toISOString(),
    isRead: false,
    link: `/mensagens?chat=${chatId}`
  });
  
  // Manter apenas as 50 mais recentes
  localStorage.setItem('bwagro_notifications', JSON.stringify(notifications.slice(0, 50)));
};

// ========================================
// UTILITÁRIOS
// ========================================

const getCurrentUser = (): User | null => {
  const stored = localStorage.getItem('bwagro_user');
  return stored ? JSON.parse(stored) : null;
};

export const getUnreadCount = (userId: string): number => {
  const chats = getChats(userId);
  return chats.reduce((total, chat) => total + (chat.unreadCount || 0), 0);
};

// ========================================
// DADOS MOCK PARA DESENVOLVIMENTO
// ========================================

export const initializeMockData = (): void => {
  const user = getCurrentUser();
  if (!user) return;
  
  // Criar alguns chats de exemplo se não existirem
  const existingChats = getChats(user.id);
  
  if (existingChats.length === 0) {
    // Chat 1: Usuário é vendedor
    const chat1 = createOrGetChat(
      'ad_001',
      'Trator John Deere 6110J',
      185000,
      'https://images.unsplash.com/photo-1625246333195-78d9c38ad449?w=300',
      user.id,
      user.name,
      'buyer_001',
      'João Silva'
    );
    
    sendMessage(chat1.id, 'buyer_001', 'João Silva', 'Olá! Tenho interesse no trator. Está disponível para visita?');
    
    // Chat 2: Usuário é comprador
    const chat2 = createOrGetChat(
      'ad_002',
      'Gado Nelore - Lote com 50 cabeças',
      120000,
      'https://images.unsplash.com/photo-1560493676-04071c5f467b?w=300',
      'seller_002',
      'Maria Santos',
      user.id,
      user.name
    );
    
    sendMessage(chat2.id, user.id, user.name, 'Boa tarde! Qual a idade média do lote?');
    sendMessage(chat2.id, 'seller_002', 'Maria Santos', 'Boa tarde! A idade média é de 24 meses.');
    
    // Adicionar créditos iniciais para teste
    addCredits(user.id, 50);
  }
};
