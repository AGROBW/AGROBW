import React, { useState } from 'react';
import { Chat } from '../types';
import { MapPin, DollarSign, Eye, Phone, Mail, Lock, Unlock } from 'lucide-react';
import { getContactInfo, getLeadStatus, unlockLead, getUserCredits } from '../services/messageService';
import { useLayout } from '../src/contexts/LayoutContext';

interface AdContextCardProps {
  chat: Chat;
  currentUserId: string;
  onLeadUnlocked?: () => void;
}

export const AdContextCard: React.FC<AdContextCardProps> = ({ chat, currentUserId, onLeadUnlocked }) => {
  const { settings } = useLayout();
  const [leadStatus, setLeadStatus] = useState<'pending' | 'unlocked'>(getLeadStatus(chat.id));
  
  const isSeller = currentUserId === chat.sellerId;
  const contactUserId = isSeller ? chat.buyerId : chat.sellerId;
  const contactName = isSeller ? chat.buyerName : chat.sellerName;
  
  const contactInfo = getContactInfo(contactUserId, chat.id, currentUserId);
  const isContactVisible = leadStatus === 'unlocked' || !isSeller;
  
  const handleUnlock = () => {
    const result = unlockLead(chat.id, currentUserId);
    
    if (result.success) {
      setLeadStatus('unlocked');
      onLeadUnlocked?.();
      alert(result.message);
    } else {
      alert(result.message);
    }
  };
  
  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(price);
  };
  
  return (
    <div className="bg-white border rounded-lg overflow-hidden">
      {/* Imagem do anúncio */}
      <div className="relative">
        <img 
          src={chat.adImage} 
          alt={chat.adTitle}
          className="w-full h-48 object-cover"
        />
        <div className="absolute top-3 right-3 text-white px-3 py-1 rounded-full text-sm font-semibold" style={{ backgroundColor: settings.primaryColor }}>
          {formatPrice(chat.adPrice)}
        </div>
      </div>
      
      {/* Conteúdo */}
      <div className="p-4 space-y-4">
        {/* Título */}
        <div>
          <h3 className="font-semibold text-slate-900 mb-1">
            {chat.adTitle}
          </h3>
          <p className="text-sm text-slate-600 flex items-center gap-1">
            <MapPin className="w-3.5 h-3.5" strokeWidth={1.5} />
            Localização do anúncio
          </p>
        </div>
        
        {/* Divider */}
        <div className="border-t" />
        
        {/* Informações de contato */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-medium text-slate-900 text-sm">
              Contato: {contactName}
            </h4>
            
            {!isContactVisible && isSeller && (
              <button
                onClick={handleUnlock}
                className="flex items-center gap-1 text-xs"
                style={{ color: settings.primaryColor }}
              >
                <Lock className="w-3.5 h-3.5" strokeWidth={1.5} />
                Bloqueado
              </button>
            )}
            
            {isContactVisible && (
              <span className="flex items-center gap-1 text-xs" style={{ color: settings.primaryColor }}>
                <Unlock className="w-3.5 h-3.5" strokeWidth={1.5} />
                Desbloqueado
              </span>
            )}
          </div>
          
          <div className="space-y-2">
            {/* E-mail */}
            <div className="flex items-center gap-2 text-sm">
              <Mail className="w-4 h-4 text-slate-400" strokeWidth={1.5} />
              <span className={isContactVisible ? 'text-slate-900' : 'text-slate-400'}>
                {contactInfo?.email || '••••••@••••.com'}
              </span>
            </div>
            
            {/* Telefone */}
            <div className="flex items-center gap-2 text-sm">
              <Phone className="w-4 h-4 text-slate-400" strokeWidth={1.5} />
              <span className={isContactVisible ? 'text-slate-900' : 'text-slate-400'}>
                {contactInfo?.phone || '(••) •••••-••••'}
              </span>
            </div>
          </div>
          
          {/* Botão de desbloqueio */}
          {!isContactVisible && isSeller && (
            <button
              onClick={handleUnlock}
              className="w-full mt-3 px-4 py-2 text-white text-sm font-medium rounded transition-colors flex items-center justify-center gap-2"
              style={{ backgroundColor: settings.primaryColor }}
            >
              <Unlock className="w-4 h-4" strokeWidth={1.5} />
              Desbloquear Lead (5 créditos)
            </button>
          )}
        </div>
        
        {/* Divider */}
        <div className="border-t" />
        
        {/* CTA para ver anúncio completo */}
        <a
          href={`/anuncio/${chat.adId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="block w-full px-4 py-2 border border-slate-300 text-slate-700 text-sm font-medium rounded hover:bg-slate-50 transition-colors text-center"
        >
          Ver Anúncio Completo
        </a>
        
        {/* Créditos disponíveis (se vendedor) */}
        {isSeller && (
          <div className="pt-3 border-t">
            <div className="flex items-center justify-between text-xs text-slate-600">
              <span>Seus créditos:</span>
              <span className="font-semibold" style={{ color: settings.primaryColor }}>
                {getUserCredits(currentUserId)} disponíveis
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
