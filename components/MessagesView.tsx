import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Send, Search, Check, CheckCheck, Circle, Loader2, ArrowLeft, AlertCircle, Lock } from 'lucide-react';
import { useAuth } from '../src/contexts/AuthContext';
import { useChats, useMessages } from '../src/hooks/useMessages';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import LogisticsSidebar from './LogisticsSidebar';

interface MessagesViewProps {
  initialChatId?: string;
}

const MessagesView: React.FC<MessagesViewProps> = ({ initialChatId }) => {
  const { user } = useAuth();
  const { chats, isLoading: chatsLoading } = useChats();
  const [selectedChatId, setSelectedChatId] = useState<string | null>(initialChatId || null);
  const [searchQuery, setSearchQuery] = useState('');
  const [messageText, setMessageText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  const { messages, isLoading: messagesLoading, sendMessage } = useMessages(selectedChatId);
  
  const selectedChat = chats.find(c => c.id === selectedChatId);
  const isSelectedChatFrozen = !!selectedChat?.isFrozen;
  
  // Debug: Log dos dados do chat selecionado
  useEffect(() => {
    if (selectedChat) {
      console.log('[Chat Debug] Dados do chat selecionado:', selectedChat);
      console.log('[Chat Debug] Preço:', selectedChat.adPrice);
      console.log('[Chat Debug] Título:', selectedChat.adTitle);
    }
  }, [selectedChat]);
  
  // Auto-scroll para última mensagem
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);
  
  // Filtrar chats por busca
  const filteredChats = chats.filter(chat => {
    const query = searchQuery.toLowerCase();
    return (
      chat.adTitle.toLowerCase().includes(query) ||
      chat.buyerName.toLowerCase().includes(query) ||
      chat.sellerName.toLowerCase().includes(query) ||
      chat.lastMessage.toLowerCase().includes(query)
    );
  });
  
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
    return user?.id === chat.buyerId ? chat.sellerName : chat.buyerName;
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
                {!searchQuery && 'Entre em contato com vendedores para iniciar conversas'}
              </p>
            </div>
          ) : (
            filteredChats.map((chat) => (
              <button
                key={chat.id}
                onClick={() => setSelectedChatId(chat.id)}
                className={`w-full p-4 border-b border-slate-100 hover:bg-slate-50 transition-colors text-left ${
                  selectedChatId === chat.id ? 'bg-green-50 border-l-4 border-l-green-600' : ''
                }`}
              >
                <div className="flex gap-3">
                  {/* Avatar do anúncio */}
                  <div className="w-12 h-12 rounded-lg overflow-hidden flex-shrink-0 bg-slate-100">
                    {chat.adImage ? (
                      <img src={chat.adImage} alt={chat.adTitle} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-slate-400">
                        <Circle className="w-6 h-6" />
                      </div>
                    )}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between mb-1">
                      <h3 className="font-bold text-sm text-slate-900 truncate">
                        {chat.isFrozen ? 'Interacao congelada' : getOtherUserName(chat)}
                      </h3>
                      <span className="text-xs text-slate-400 flex-shrink-0 ml-2">
                        {formatTime(chat.lastMessageTime)}
                      </span>
                    </div>
                    
                    <p className="text-xs text-slate-500 font-medium truncate mb-1">
                      {chat.adTitle}
                    </p>
                    
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-slate-400 truncate flex-1">
                        {chat.lastMessage || 'Sem mensagens'}
                      </p>
                      
                      {chat.unreadCount > 0 && (
                        <span className="ml-2 flex-shrink-0 w-5 h-5 bg-green-600 text-white text-xs font-bold rounded-full flex items-center justify-center">
                          {chat.unreadCount}
                        </span>
                      )}
                    </div>
                    {chat.isFrozen && (
                      <span className="inline-flex items-center gap-1 mt-2 text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
                        <Lock className="w-3 h-3" />
                        Anuncio expirado
                      </span>
                    )}
                  </div>
                </div>
              </button>
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
                <img src={selectedChat.adImage} alt={selectedChat.adTitle} className="w-full h-full object-cover" />
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
                {selectedChat.adTitle}
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
            <div className="mx-4 mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-amber-700 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-amber-800">Anuncio expirado</p>
                <p className="text-xs text-amber-700 mt-1">
                  Esta conversa foi congelada porque o anuncio venceu. Nenhuma nova mensagem pode ser enviada e os dados da negociacao ficaram bloqueados.
                </p>
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
                <div className="text-center max-w-md">
                  <Lock className="w-12 h-12 text-amber-400 mx-auto mb-3" />
                  <p className="text-slate-700 text-sm font-semibold">Conversa bloqueada</p>
                  <p className="text-slate-500 text-xs mt-2">
                    O historico deste anuncio expirado foi congelado. Republicar o anuncio exige um novo credito e nao reabre esta conversa automaticamente.
                  </p>
                </div>
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
                            <img src={message.senderAvatar} alt={message.senderName} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-slate-500 text-xs font-bold">
                              {message.senderName[0].toUpperCase()}
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
                            {formatTime(message.timestamp)}
                          </span>
                          
                          {isOwn && (
                            message.isRead ? (
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
                placeholder={isSelectedChatFrozen ? 'Anuncio expirado. Conversa bloqueada.' : 'Digite sua mensagem...'}
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
        {!isSelectedChatFrozen && (
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
            <p className="text-slate-400 text-sm mt-1">Escolha um chat para visualizar as mensagens</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default MessagesView;
