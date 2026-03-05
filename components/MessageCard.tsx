import React from 'react';
import { Chat } from '../types';
import { Clock, ShoppingBag, Tag } from 'lucide-react';

interface MessageCardProps {
  chat: Chat;
  isActive: boolean;
  currentUserId: string;
  onClick: () => void;
}

export const MessageCard: React.FC<MessageCardProps> = ({ chat, isActive, currentUserId, onClick }) => {
  const isSeller = currentUserId === chat.sellerId;
  const otherPartyName = isSeller ? chat.buyerName : chat.sellerName;
  
  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) return 'Agora';
    if (diffMins < 60) return `${diffMins}min`;
    if (diffHours < 24) return `${diffHours}h`;
    if (diffDays === 1) return 'Ontem';
    if (diffDays < 7) return `${diffDays}d`;
    return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  };
  
  return (
    <button
      onClick={onClick}
      className={`w-full p-3 flex items-start gap-3 text-left transition-colors border-l-2 ${
        isActive 
          ? 'bg-green-50 border-green-700' 
          : 'bg-white hover:bg-slate-50 border-transparent'
      }`}
    >
      {/* Thumbnail do anúncio */}
      <div className="flex-shrink-0">
        <img 
          src={chat.adImage} 
          alt={chat.adTitle}
          className="w-12 h-12 rounded object-cover"
        />
      </div>
      
      {/* Conteúdo */}
      <div className="flex-1 min-w-0">
        {/* Nome e hora */}
        <div className="flex items-start justify-between gap-2 mb-1">
          <span className="font-medium text-slate-900 text-sm truncate">
            {otherPartyName}
          </span>
          <span className="text-xs text-slate-500 flex-shrink-0">
            {formatTime(chat.lastMessageTime)}
          </span>
        </div>
        
        {/* Título do anúncio */}
        <div className="flex items-center gap-1.5 mb-1">
          <Tag className="w-3 h-3 text-slate-400" strokeWidth={1.5} />
          <span className="text-xs text-slate-600 truncate">
            {chat.adTitle}
          </span>
        </div>
        
        {/* Última mensagem */}
        <p className="text-sm text-slate-600 truncate mb-1">
          {chat.lastMessage || 'Sem mensagens'}
        </p>
        
        {/* Rodapé: Status e Badge */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {/* Badge de papel (vendedor/comprador) */}
            <span className={`text-xs px-1.5 py-0.5 rounded ${
              isSeller 
                ? 'bg-blue-100 text-blue-700' 
                : 'bg-purple-100 text-purple-700'
            }`}>
              {isSeller ? 'Vendendo' : 'Comprando'}
            </span>
            
            {/* Badge de lead pendente (novo) */}
            {chat.status === 'novo' && isSeller && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 flex items-center gap-1">
                <ShoppingBag className="w-3 h-3" strokeWidth={1.5} />
                Lead Novo
              </span>
            )}
          </div>
          
          {/* Contador de não lidas */}
          {chat.unreadCount > 0 && (
            <span className="bg-green-700 text-white text-xs font-medium px-1.5 py-0.5 rounded-full min-w-[20px] text-center">
              {chat.unreadCount > 9 ? '9+' : chat.unreadCount}
            </span>
          )}
        </div>
      </div>
    </button>
  );
};
