import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Send, Search, Check, CheckCheck, Circle, Loader2, ArrowLeft, AlertCircle, Lock } from 'lucide-react';
import { useAuth } from '../src/contexts/AuthContext';
import { useChats, useMessages } from '../src/hooks/useMessages';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useLocation, useNavigate } from 'react-router-dom';
import LogisticsSidebar from './LogisticsSidebar';
import { debugLog } from '../src/utils/debugLog';

interface MessagesViewProps {
  initialChatId?: string;
}

type MessageTab = 'sent' | 'received';

const normalizeSearchValue = (value?: string | null) => (value || '').toLowerCase();
const fallbackChatTitle = 'Anuncio indisponivel';
const fallbackUserName = 'Usuario indisponivel';

const MessagesView: React.FC<MessagesViewProps> = ({ initialChatId }) => {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const { chats, isLoading: chatsLoading } = useChats();
  const [selectedChatId, setSelectedChatId] = useState<string | null>(initialChatId || null);
  const [highlightedChatId, setHighlightedChatId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<MessageTab>('sent');
  const [searchQuery, setSearchQuery] = useState('');
  const [messageText, setMessageText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const selectedChat = chats.find(c => c.id === selectedChatId);
  const selectedChatOtherUserName = selectedChat
    ? (user?.id === selectedChat.buyerId ? selectedChat.sellerName : selectedChat.buyerName)
    : undefined;
  
  const { messages, isLoading: messagesLoading, sendMessage } = useMessages(selectedChatId, selectedChatOtherUserName);
  const isSellerInSelectedChat = selectedChat?.sellerId === user?.id;
  const isLeadContactExpired = selectedChat?.freezeReason === 'lead_contact_expired';
  const isReceivedTab = activeTab === 'received';
  const shouldApplyLeadContactLock = isLeadContactExpired && isReceivedTab && isSellerInSelectedChat;
  const isSelectedChatFrozen = !!selectedChat?.isFrozen && (
    selectedChat?.freezeReason !== 'lead_contact_expired' || shouldApplyLeadContactLock
  );
  const frozenBadgeText = isLeadContactExpired ? 'Novo contato bloqueado' : 'Anuncio expirado';
  const frozenTitle = isLeadContactExpired ? 'Novo contato bloqueado' : 'Anuncio expirado';
  const frozenDescription = isLeadContactExpired
    ? 'O periodo de acesso a este interessado terminou. Faça upgrade para voltar a visualizar os dados do lead e responder a conversa.'
    : 'Esta conversa foi congelada porque o anuncio venceu. Nenhuma nova mensagem pode ser enviada e os dados da negociacao ficaram bloqueados.';
  
  const effectiveFrozenDescription = isLeadContactExpired
    ? 'Este contato entrou quando sua conta ja nao estava em um plano elegivel para novos contatos. Renove ou faca upgrade para visualizar os dados do interessado e responder a conversa.'
    : frozenDescription;

  // Debug: Log dos dados do chat selecionado
  useEffect(() => {
    if (selectedChat) {
      debugLog('[MessagesView] Dados do chat selecionado:', selectedChat);
      debugLog('[MessagesView] Preço:', selectedChat.adPrice);
      debugLog('[MessagesView] Título:', selectedChat.adTitle);
    }
  }, [selectedChat]);
  
  // Auto-scroll para última mensagem
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);
  
  const chatsByTab = chats.filter(chat => (chat.direction || 'received') === activeTab);

  // Filtrar chats por busca
  const filteredChats = chatsByTab.filter(chat => {
    const query = normalizeSearchValue(searchQuery);
    return (
      normalizeSearchValue(chat.adTitle).includes(query) ||
      normalizeSearchValue(chat.buyerName).includes(query) ||
      normalizeSearchValue(chat.sellerName).includes(query) ||
      normalizeSearchValue(chat.lastMessage).includes(query)
    );
  });

  const sentChatsCount = chats.filter(chat => (chat.direction || 'received') === 'sent').length;
  const receivedChatsCount = chats.filter(chat => (chat.direction || 'received') === 'received').length;
  const sentUnreadChatsCount = chats.filter(
    chat => (chat.direction || 'received') === 'sent' && chat.unreadCount > 0
  ).length;
  const receivedUnreadChatsCount = chats.filter(
    chat => (chat.direction || 'received') === 'received' && chat.unreadCount > 0
  ).length;

  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const chatIdFromState =
      location.state && typeof location.state === 'object' && 'chatId' in location.state
        ? String((location.state as { chatId?: string }).chatId || '')
        : '';
    const highlightChatIdFromState =
      location.state && typeof location.state === 'object' && 'highlightChatId' in location.state
        ? String((location.state as { highlightChatId?: string }).highlightChatId || '')
        : '';
    const chatIdFromSearch = searchParams.get('chat') || '';
    const incomingChatId = chatIdFromState;
    const incomingHighlightChatId = highlightChatIdFromState || chatIdFromSearch;

    if (!incomingChatId && !incomingHighlightChatId) {
      return;
    }

    const targetChat = chats.find((chat) => chat.id === (incomingChatId || incomingHighlightChatId));
    if (targetChat) {
      const targetTab = (targetChat.direction || 'received') as MessageTab;
      if (activeTab !== targetTab) {
        setActiveTab(targetTab);
      }
    }

    if (incomingChatId && incomingChatId !== selectedChatId) {
      setSelectedChatId(incomingChatId);
      setHighlightedChatId(null);
    }

    if (incomingHighlightChatId) {
      setHighlightedChatId(incomingHighlightChatId);
    }

    if (targetChat && (chatIdFromSearch || incomingChatId || incomingHighlightChatId)) {
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [location.pathname, location.search, location.state, chats, activeTab, navigate, selectedChatId]);

  useEffect(() => {
    if (!selectedChatId) return;

    const selected = chats.find(chat => chat.id === selectedChatId);
    if (!selected) {
      setSelectedChatId(null);
      return;
    }

    if ((selected.direction || 'received') !== activeTab) {
      const replacementChat = chats.find(chat => (chat.direction || 'received') === activeTab);
      setSelectedChatId(replacementChat?.id || null);
    }
  }, [activeTab, chats, selectedChatId]);

  useEffect(() => {
    if (!highlightedChatId) return;

    const targetChat = chats.find(chat => chat.id === highlightedChatId);
    if (!targetChat) return;

    if ((targetChat.direction || 'received') !== activeTab) {
      setActiveTab((targetChat.direction || 'received') as MessageTab);
    }
  }, [activeTab, chats, highlightedChatId]);
  
  const handleSendMessage = async () => {
    if (!messageText.trim() || !selectedChatId || isSelectedChatFrozen) return;
    
    const success = await sendMessage(messageText);
    if (success) {
      setMessageText('');
    }
  };
  
  const formatTime = (dateString: string) => {
    return formatDistanceToNow(new Date(dateString), {
      addSuffix: true,
      locale: ptBR
    });
  };
  
  const getOtherUserName = (chat: typeof chats[0]) => {
    const otherUserName = user?.id === chat.buyerId ? chat.sellerName : chat.buyerName;
    return otherUserName || fallbackUserName;
  };
  
  const getOtherUserId = (chat: typeof chats[0]) => {
    return user?.id === chat.buyerId ? chat.sellerId : chat.buyerId;
  };
  
  if (chatsLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 text-green-600 animate-spin" />
      </div>
    );
  }
  
  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden h-[calc(100vh-200px)] flex">
      {/* Lista de Chats */}
      <div className={`${selectedChatId ? 'hidden md:flex' : 'flex'} w-full md:w-96 flex-col border-r border-slate-200`}>
        {/* Header da Lista */}
        <div className="p-4 border-b border-slate-200">
          <h2 className="text-lg font-bold text-slate-900 mb-3">Mensagens</h2>
          <div className="mb-3 inline-flex w-full rounded-xl bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => setActiveTab('sent')}
              className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
                activeTab === 'sent'
                  ? 'bg-green-600 text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <span className="inline-flex items-center gap-2">
                Enviadas {sentChatsCount > 0 ? `(${sentChatsCount})` : ''}
                {sentUnreadChatsCount > 0 ? (
                  <span
                    className={`inline-flex min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-bold ${
                      activeTab === 'sent' ? 'bg-white/90 text-green-700' : 'bg-green-600 text-white'
                    }`}
                  >
                    {sentUnreadChatsCount}
                  </span>
                ) : activeTab === 'sent' ? <span className="h-2 w-2 rounded-full bg-white/90" /> : null}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('received')}
              className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
                activeTab === 'received'
                  ? 'bg-green-600 text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <span className="inline-flex items-center gap-2">
                Recebidas {receivedChatsCount > 0 ? `(${receivedChatsCount})` : ''}
                {receivedUnreadChatsCount > 0 ? (
                  <span
                    className={`inline-flex min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-bold ${
                      activeTab === 'received' ? 'bg-white/90 text-green-700' : 'bg-green-600 text-white'
                    }`}
                  >
                    {receivedUnreadChatsCount}
                  </span>
                ) : activeTab === 'received' ? <span className="h-2 w-2 rounded-full bg-white/90" /> : null}
              </span>
            </button>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar conversas..."
              className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>
        </div>
        
        {/* Lista de Conversas */}
        <div className="flex-1 overflow-y-auto">
          {filteredChats.length === 0 ? (
            <div className="p-8 text-center">
              <Circle className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500 text-sm font-medium">
                {searchQuery ? 'Nenhuma conversa encontrada' : 'Nenhuma conversa ainda'}
              </p>
              <p className="text-slate-400 text-xs mt-1">
                {!searchQuery &&
                  (activeTab === 'sent'
                    ? 'Entre em contato com vendedores para iniciar conversas'
                    : 'As mensagens recebidas dos seus anuncios aparecerao aqui')}
              </p>
            </div>
          ) : (
            filteredChats.map((chat) => (
              (() => {
                const shouldShowFrozen =
                  !!chat.isFrozen &&
                  (chat.freezeReason !== 'lead_contact_expired' || activeTab === 'received');
                const isUnreadConversation = chat.unreadCount > 0;
                const previewMessage = shouldShowFrozen
                  ? chat.freezeReason === 'lead_contact_expired'
                    ? 'Conteúdo protegido. Faça upgrade para visualizar a mensagem.'
                    : 'Conteúdo indisponível para esta conversa.'
                  : chat.lastMessage || 'Sem mensagens';

                const effectivePreviewMessage =
                  shouldShowFrozen && chat.freezeReason === 'lead_contact_expired'
                    ? 'Conteudo protegido. Renove ou faca upgrade para liberar este novo contato.'
                    : previewMessage;

                return (
              <button
                key={chat.id}
                onClick={() => {
                  setSelectedChatId(chat.id);
                  if (highlightedChatId === chat.id) {
                    setHighlightedChatId(null);
                  }
                }}
                className={`w-full p-4 border-b border-slate-100 hover:bg-slate-50 transition-colors text-left ${
                  selectedChatId === chat.id
                    ? 'bg-green-50 border-l-4 border-l-green-600'
                    : highlightedChatId === chat.id
                      ? 'bg-emerald-50/70 border-l-4 border-l-emerald-400'
                    : isUnreadConversation
                      ? 'bg-emerald-50/60 border-l-4 border-l-emerald-500'
                      : ''
                }`}
              >
                <div className="flex gap-3">
                  {/* Avatar do anúncio */}
                  <div className="w-12 h-12 rounded-lg overflow-hidden flex-shrink-0 bg-slate-100">
                    {chat.adImage ? (
                      <img src={chat.adImage} alt={chat.adTitle || fallbackChatTitle} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-slate-400">
                        <Circle className="w-6 h-6" />
                      </div>
                    )}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between mb-1">
                      <h3 className={`text-sm truncate ${isUnreadConversation ? 'font-extrabold text-slate-950' : 'font-bold text-slate-900'}`}>
                        {shouldShowFrozen ? 'Interacao congelada' : getOtherUserName(chat)}
                      </h3>
                      <span className={`text-xs flex-shrink-0 ml-2 ${isUnreadConversation ? 'font-semibold text-emerald-700' : 'text-slate-400'}`}>
                        {formatTime(chat.lastMessageTime)}
                      </span>
                    </div>
                    
                    <p className="text-xs text-slate-500 font-medium truncate mb-1">
                      {chat.adTitle || fallbackChatTitle}
                    </p>
                    
                    <div className="flex items-center justify-between">
                      <p className={`text-xs truncate flex-1 ${isUnreadConversation ? 'font-semibold text-slate-700' : 'text-slate-400'}`}>
                        {effectivePreviewMessage}
                      </p>
                      
                      {chat.unreadCount > 0 && (
                        <span className="ml-2 flex-shrink-0 min-w-5 h-5 px-1.5 bg-green-600 text-white text-xs font-bold rounded-full inline-flex items-center justify-center shadow-sm">
                          {chat.unreadCount}
                        </span>
                      )}
                    </div>
                    {shouldShowFrozen && (
                      <span className="inline-flex items-center gap-1 mt-2 text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
                        <Lock className="w-3 h-3" />
                        {chat.freezeReason === 'lead_contact_expired' ? 'Novo contato bloqueado' : 'Anuncio expirado'}
                      </span>
                    )}
                  </div>
                </div>
              </button>
                );
              })()
            ))
          )}
        </div>
      </div>
      
      {/* Área de Mensagens */}
      {selectedChatId && selectedChat ? (
        <>
        <div className="flex-1 flex flex-col min-w-0">
          {/* Header do Chat */}
          <div className="p-4 border-b border-slate-200 flex items-center gap-3">
            <button
              onClick={() => setSelectedChatId(null)}
              className="md:hidden p-2 hover:bg-slate-100 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            
            <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 bg-slate-100">
              {selectedChat.adImage ? (
                <img src={selectedChat.adImage} alt={selectedChat.adTitle || fallbackChatTitle} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-slate-400">
                  <Circle className="w-5 h-5" />
                </div>
              )}
            </div>
            
            <div className="flex-1 min-w-0">
              <h3 className="font-bold text-sm text-slate-900 truncate">
                {isSelectedChatFrozen ? 'Interacao congelada' : getOtherUserName(selectedChat)}
              </h3>
              <p className="text-xs text-slate-500 truncate">
                {selectedChat.adTitle || fallbackChatTitle}
              </p>
            </div>
            
            {!isSelectedChatFrozen && (
              <div className="text-right">
                <p className="text-sm font-bold text-green-700">
                  {new Intl.NumberFormat('pt-BR', {
                    style: 'currency',
                    currency: 'BRL'
                  }).format(selectedChat.adPrice)}
                </p>
              </div>
            )}
          </div>

          {isSelectedChatFrozen && (
            <div className="mx-4 mt-4 overflow-hidden rounded-3xl border border-amber-200 bg-gradient-to-r from-amber-50 via-white to-emerald-50 shadow-sm">
              <div className="flex items-start gap-4 px-5 py-4">
                <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
                  {isLeadContactExpired && isReceivedTab ? (
                    <Lock className="h-5 w-5" />
                  ) : (
                    <AlertCircle className="h-5 w-5" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  {isLeadContactExpired && isReceivedTab ? (
                    <>
                      <span className="inline-flex rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-700">
                        Acesso premium
                      </span>
                      <p className="mt-3 text-base font-semibold text-slate-900">
                        Libere este novo contato para continuar a negociacao
                      </p>
                      <p className="mt-1 text-sm text-slate-600">
                        Este interessado entrou quando sua conta ja nao estava em um plano elegivel para novos contatos. Assine novamente ou faca upgrade para voltar a acessar novos contatos recebidos.
                      </p>
                      <p className="mt-2 text-xs text-emerald-700">
                        Este novo contato foi recebido fora da janela elegivel de novos contatos e sera liberado quando voce renovar ou fizer upgrade.
                      </p>
                      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                        <span className="rounded-full border border-slate-200 bg-white px-3 py-1">
                          Visualize os dados do contato
                        </span>
                        <span className="rounded-full border border-slate-200 bg-white px-3 py-1">
                          Libere novos contatos recebidos
                        </span>
                      </div>
                      <div className="mt-4 flex flex-wrap items-center gap-3">
                        <button
                          type="button"
                          onClick={() => {
                            window.location.href = '/planos';
                          }}
                          className="inline-flex items-center rounded-xl bg-green-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-green-700"
                        >
                          Ver planos e liberar contato
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <p className="text-sm font-semibold text-amber-900">{frozenTitle}</p>
                      <p className="mt-1 text-xs text-amber-800">
                        {effectiveFrozenDescription}
                      </p>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
          
          {/* Mensagens */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50">
            {messagesLoading ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="w-6 h-6 text-green-600 animate-spin" />
              </div>
            ) : isSelectedChatFrozen ? (
              <div className="flex items-center justify-center h-full">
                {isLeadContactExpired && isReceivedTab ? null : (
                  <div className="max-w-lg rounded-[28px] border border-amber-200 bg-white px-6 py-7 text-center shadow-sm">
                    <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-100 to-emerald-100 text-amber-700">
                      <Lock className="h-7 w-7" />
                    </div>
                    <p className="text-slate-700 text-sm font-semibold">{frozenTitle}</p>
                    <p className="mt-2 text-xs text-slate-500">
                      O historico deste anuncio expirado foi congelado. Reativar o anuncio depende de vaga disponivel no plano atual e nao reabre esta conversa automaticamente.
                    </p>
                  </div>
                )}
              </div>
            ) : messages.length === 0 ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <Circle className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                  <p className="text-slate-500 text-sm font-medium">Nenhuma mensagem ainda</p>
                  <p className="text-slate-400 text-xs mt-1">Envie a primeira mensagem</p>
                </div>
              </div>
            ) : (
              <>
                {messages.map((message, index) => {
                  const isOwn = message.senderId === user?.id;
                  const showAvatar = index === 0 || messages[index - 1].senderId !== message.senderId;
                  
                  return (
                    <motion.div
                      key={message.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`flex gap-2 ${isOwn ? 'flex-row-reverse' : 'flex-row'}`}
                    >
                      {showAvatar && !isOwn && (
                        <div className="w-8 h-8 rounded-full bg-slate-200 flex-shrink-0 overflow-hidden">
                          {message.senderAvatar ? (
                            <img src={message.senderAvatar} alt={message.senderName || fallbackUserName} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-slate-500 text-xs font-bold">
                              {(message.senderName || fallbackUserName)[0].toUpperCase()}
                            </div>
                          )}
                        </div>
                      )}
                      
                      {!showAvatar && !isOwn && <div className="w-8" />}
                      
                      <div className={`max-w-[70%] ${isOwn ? 'items-end' : 'items-start'} flex flex-col`}>
                        <div
                          className={`px-4 py-2 rounded-2xl ${
                            isOwn
                              ? 'bg-green-600 text-white rounded-br-none'
                              : 'bg-white border border-slate-200 text-slate-900 rounded-bl-none'
                          }`}
                        >
                          <p className="text-sm whitespace-pre-wrap break-words">{message.content}</p>
                        </div>
                        
                        <div className={`flex items-center gap-1 mt-1 px-1 ${isOwn ? 'flex-row-reverse' : 'flex-row'}`}>
                          <span className="text-xs text-slate-400">
                            {message.isPending ? 'Enviando...' : formatTime(message.timestamp)}
                          </span>
                          
                          {isOwn && (
                            message.isPending ? (
                              <Loader2 className="w-3 h-3 text-slate-400 animate-spin" />
                            ) : message.isRead ? (
                              <CheckCheck className="w-3 h-3 text-green-600" />
                            ) : (
                              <Check className="w-3 h-3 text-slate-400" />
                            )
                          )}
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
                <div ref={messagesEndRef} />
              </>
            )}
          </div>
          
          {/* Input de Mensagem */}
          <div className="p-4 border-t border-slate-200 bg-white">
            <div className="flex gap-2">
              <input
                type="text"
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && !e.shiftKey && handleSendMessage()}
                placeholder={isSelectedChatFrozen ? `${frozenBadgeText}. Conversa bloqueada.` : 'Digite sua mensagem...'}
                disabled={isSelectedChatFrozen}
                className="flex-1 px-4 py-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed"
              />
              <button
                onClick={handleSendMessage}
                disabled={!messageText.trim() || isSelectedChatFrozen}
                className="px-6 py-3 bg-green-600 text-white rounded-xl hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 font-bold"
              >
                <Send className="w-4 h-4" />
                <span className="hidden sm:inline">Enviar</span>
              </button>
            </div>
          </div>
        </div>
        
        {/* Sidebar de Inteligência Logística */}
        {!isSelectedChatFrozen && isReceivedTab && isSellerInSelectedChat && (
          <LogisticsSidebar 
            chatId={selectedChatId}
            adPrice={selectedChat.adPrice}
            adTitle={selectedChat.adTitle}
          />
        )}
        </>
      ) : (
        <div className="hidden md:flex flex-1 items-center justify-center bg-slate-50">
          <div className="text-center">
            <Circle className="w-16 h-16 text-slate-300 mx-auto mb-4" />
            <p className="text-slate-500 font-medium">Selecione uma conversa</p>
            <p className="text-slate-400 text-sm mt-1">
              {activeTab === 'sent'
                ? 'Escolha uma conversa enviada para visualizar as mensagens'
                : 'Escolha uma conversa recebida para visualizar as mensagens'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default MessagesView;
