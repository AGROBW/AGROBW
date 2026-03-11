import React, { useState, useEffect } from 'react';
import { X, Bell, MessageSquare, Briefcase, AlertCircle, CheckCheck, ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useNotifications } from '../src/hooks/useNotifications';
import { useSubscription } from '../src/hooks/useSubscription';
import { useAuth } from '../src/contexts/AuthContext';
import { supabase } from '../src/lib/supabaseClient';
import { Notification } from '../types';
import { motion, AnimatePresence } from 'framer-motion';

// Custom scrollbar styles para a lista de notificações
const scrollbarStyles = `
.notifications-scroll::-webkit-scrollbar {
  width: 8px;
}
.notifications-scroll::-webkit-scrollbar-track {
  background: #f1f5f9;
  border-radius: 10px;
}
.notifications-scroll::-webkit-scrollbar-thumb {
  background: #cbd5e1;
  border-radius: 10px;
}
.notifications-scroll::-webkit-scrollbar-thumb:hover {
  background: #94a3b8;
}
`;

// Injetar estilos no head (apenas uma vez)
if (typeof document !== 'undefined') {
  const styleId = 'notifications-scrollbar-styles';
  if (!document.getElementById(styleId)) {
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = scrollbarStyles;
    document.head.appendChild(style);
  }
}

interface NotificationsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type NotificationTab = 'all' | 'business' | 'messages' | 'system';

const NotificationsModal: React.FC<NotificationsModalProps> = ({ isOpen, onClose }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { notifications, isLoading, markAsRead, markAllAsRead, refreshNotifications } = useNotifications();
  const { subscription } = useSubscription();
  const [activeTab, setActiveTab] = useState<NotificationTab>('all');

  // Verificar se o usuário pode visualizar notificações de radar
  // Radar de Oportunidades está disponível apenas para planos Start Agro+
  const canSeeRadarMatches = subscription?.plans?.name !== 'Seed';

  // Real-time subscription
  useEffect(() => {
    if (!user || !isOpen) return;

    const channel = supabase
      .channel('notifications_realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`
        },
        (payload) => {
          console.log('[NotificationsModal] Nova notificação:', payload);
          refreshNotifications();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, isOpen, refreshNotifications]);

  // Filtrar notificações por aba
  const filteredNotifications = notifications.filter((notif) => {
    // Remover notificações de radar_match se plano não permite
    if (notif.type === 'radar_match' && !canSeeRadarMatches) {
      return false;
    }

    // Filtrar por aba
    if (activeTab === 'all') return true;
    if (activeTab === 'business') {
      return notif.type === 'new_lead' || notif.type === 'radar_match';
    }
    if (activeTab === 'messages') {
      return notif.type === 'new_message' || notif.type === 'NEW_MESSAGE';
    }
    if (activeTab === 'system') {
      return notif.type === 'system' || notif.type === 'plan_alert' || notif.type === 'SYSTEM' || notif.type === 'SECURITY';
    }
    return true;
  });

  const handleNotificationClick = async (notification: Notification) => {
    // Marcar como lida
    if (!notification.isRead) {
      await markAsRead(notification.id);
    }

    // Navegar se tiver link
    if (notification.link) {
      onClose();
      navigate(notification.link);
    }
  };

  const handleMarkAllAsRead = async () => {
    await markAllAsRead();
  };

  // Ícone baseado no tipo
  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'new_lead':
        return <Briefcase className="w-5 h-5 text-blue-600" />;
      case 'radar_match':
        return <Bell className="w-5 h-5 text-green-600" />;
      case 'new_message':
      case 'NEW_MESSAGE':
        return <MessageSquare className="w-5 h-5 text-purple-600" />;
      case 'system':
      case 'plan_alert':
      case 'SYSTEM':
      case 'SECURITY':
        return <AlertCircle className="w-5 h-5 text-orange-600" />;
      default:
        return <Bell className="w-5 h-5 text-slate-600" />;
    }
  };

  // Calcular tempo decorrido
  const getTimeAgo = (timestamp: string) => {
    const now = new Date();
    const notifDate = new Date(timestamp);
    const diffMs = now.getTime() - notifDate.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Agora mesmo';
    if (diffMins < 60) return `${diffMins}m atrás`;
    if (diffHours < 24) return `${diffHours}h atrás`;
    if (diffDays < 7) return `${diffDays}d atrás`;
    return notifDate.toLocaleDateString('pt-BR');
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-50"
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -20 }}
            transition={{ duration: 0.2 }}
            className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-2xl max-h-[85vh] bg-white rounded-2xl shadow-2xl z-50 flex flex-col overflow-hidden"
          >
            {/* Header - Fixo */}
            <div className="flex items-center justify-between p-6 border-b border-slate-200 bg-white sticky top-0 z-10">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-100 rounded-lg">
                  <Bell className="w-5 h-5 text-green-700" strokeWidth={2} />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-slate-900">Notificações</h2>
                  {notifications.filter(n => !n.isRead).length > 0 && (
                    <p className="text-xs text-slate-500 mt-0.5">
                      {notifications.filter(n => !n.isRead).length} não lida(s)
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                {notifications.some(n => !n.isRead) && (
                  <button
                    onClick={handleMarkAllAsRead}
                    className="flex items-center gap-2 px-3 py-2 text-xs font-semibold text-green-700 hover:bg-green-50 rounded-lg transition-colors"
                  >
                    <CheckCheck className="w-4 h-4" />
                    Marcar todas como lidas
                  </button>
                )}
                <button
                  onClick={onClose}
                  className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Tabs - Fixas */}
            <div className="flex gap-2 px-6 pt-4 pb-3 border-b border-slate-200 bg-white sticky top-[89px] z-10">
              {[
                { id: 'all', label: 'Todas', count: notifications.length },
                { id: 'business', label: 'Negócios', count: notifications.filter(n => n.type === 'new_lead' || n.type === 'radar_match').length },
                { id: 'messages', label: 'Mensagens', count: notifications.filter(n => n.type === 'new_message' || n.type === 'NEW_MESSAGE').length },
                { id: 'system', label: 'Sistema', count: notifications.filter(n => n.type === 'system' || n.type === 'plan_alert' || n.type === 'SYSTEM').length }
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as NotificationTab)}
                  className={`px-4 py-2 text-sm font-semibold rounded-t-lg transition-all ${
                    activeTab === tab.id
                      ? 'text-green-700 bg-green-50 border-b-2 border-green-700'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                  }`}
                >
                  {tab.label}
                  {tab.count > 0 && (
                    <span className={`ml-2 px-2 py-0.5 text-xs font-bold rounded-full ${
                      activeTab === tab.id ? 'bg-green-700 text-white' : 'bg-slate-200 text-slate-600'
                    }`}>
                      {tab.count}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Notifications List - Scrollável */}
            {/* TODO: Quando usuário tiver 100+ notificações, implementar Infinite Scroll:
                - useInfiniteScroll hook com IntersectionObserver
                - fetchMoreNotifications() com offset/pagination
                - Loading indicator no final da lista
                - Prevenir múltiplas requisições simultâneas
            */}
            <div className="notifications-scroll flex-1 overflow-y-auto p-6 space-y-2 max-h-[calc(85vh-180px)]">
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div>
                </div>
              ) : filteredNotifications.length === 0 ? (
                <div className="text-center py-12">
                  <Bell className="w-12 h-12 text-slate-300 mx-auto mb-3" strokeWidth={1.5} />
                  <p className="text-slate-500 font-medium">Nenhuma notificação</p>
                  <p className="text-sm text-slate-400 mt-1">Você está em dia!</p>
                </div>
              ) : (
                filteredNotifications.map((notification) => (
                  <motion.button
                    key={notification.id}
                    onClick={() => handleNotificationClick(notification)}
                    className={`w-full p-4 rounded-xl border transition-all text-left ${
                      notification.isRead
                        ? 'bg-white border-slate-200 hover:border-slate-300'
                        : 'bg-green-50/50 border-green-200 hover:border-green-300'
                    }`}
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.99 }}
                  >
                    <div className="flex items-start gap-3">
                      {/* Icon */}
                      <div className={`flex-shrink-0 p-2 rounded-lg ${
                        notification.isRead ? 'bg-slate-100' : 'bg-white'
                      }`}>
                        {getNotificationIcon(notification.type)}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <h3 className={`font-semibold text-sm ${
                            notification.isRead ? 'text-slate-700' : 'text-slate-900'
                          }`}>
                            {notification.title}
                          </h3>
                          {notification.link && (
                            <ExternalLink className="w-4 h-4 text-slate-400 flex-shrink-0" />
                          )}
                        </div>
                        <p className={`text-sm mb-2 line-clamp-2 ${
                          notification.isRead ? 'text-slate-500' : 'text-slate-600'
                        }`}>
                          {notification.content}
                        </p>
                        <span className="text-xs text-slate-400 font-medium">
                          {getTimeAgo(notification.timestamp)}
                        </span>
                      </div>

                      {/* Unread indicator */}
                      {!notification.isRead && (
                        <div className="w-2 h-2 bg-green-600 rounded-full flex-shrink-0 mt-2"></div>
                      )}
                    </div>
                  </motion.button>
                ))
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default NotificationsModal;
