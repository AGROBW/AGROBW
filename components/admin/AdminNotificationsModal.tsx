import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertCircle, Bell, CheckCircle2, ExternalLink, Filter, LifeBuoy, ShieldAlert, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  AdminNotificationCategory,
  AdminNotificationItem,
  fetchAdminNotificationItems,
  subscribeToAdminNotificationEvents,
} from '../../src/lib/adminNotificationCenter';

interface AdminNotificationsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type AdminNotificationTab = 'all' | AdminNotificationCategory;

const getTimeAgo = (timestamp: string) => {
  const now = new Date();
  const createdAt = new Date(timestamp);
  const diffMs = now.getTime() - createdAt.getTime();
  const diffMinutes = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMinutes < 1) return 'Agora mesmo';
  if (diffMinutes < 60) return `${diffMinutes}m atras`;
  if (diffHours < 24) return `${diffHours}h atras`;
  if (diffDays < 7) return `${diffDays}d atras`;
  return createdAt.toLocaleDateString('pt-BR');
};

const getNotificationIcon = (category: AdminNotificationCategory, priority: AdminNotificationItem['priority']) => {
  if (category === 'moderation') {
    return <ShieldAlert className={`h-5 w-5 ${priority === 'high' ? 'text-amber-600' : 'text-emerald-600'}`} />;
  }
  if (category === 'support') {
    return <LifeBuoy className={`h-5 w-5 ${priority === 'high' ? 'text-red-600' : 'text-blue-600'}`} />;
  }
  return <AlertCircle className="h-5 w-5 text-slate-600" />;
};

const AdminNotificationsModal: React.FC<AdminNotificationsModalProps> = ({ isOpen, onClose }) => {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<AdminNotificationItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<AdminNotificationTab>('all');

  const loadNotifications = async () => {
    setIsLoading(true);
    const data = await fetchAdminNotificationItems();
    setNotifications(data);
    setIsLoading(false);
  };

  useEffect(() => {
    if (!isOpen) return;
    void loadNotifications();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const unsubscribe = subscribeToAdminNotificationEvents(() => {
      void loadNotifications();
    });

    const intervalId = window.setInterval(() => {
      void loadNotifications();
    }, 30000);

    return () => {
      unsubscribe();
      window.clearInterval(intervalId);
    };
  }, [isOpen]);

  const filteredNotifications = useMemo(() => {
    if (activeTab === 'all') return notifications;
    return notifications.filter((item) => item.category === activeTab);
  }, [activeTab, notifications]);

  const totals = useMemo(
    () => ({
      all: notifications.reduce((sum, item) => sum + item.count, 0),
      moderation: notifications
        .filter((item) => item.category === 'moderation')
        .reduce((sum, item) => sum + item.count, 0),
      support: notifications.filter((item) => item.category === 'support').reduce((sum, item) => sum + item.count, 0),
      system: notifications.filter((item) => item.category === 'system').reduce((sum, item) => sum + item.count, 0),
    }),
    [notifications],
  );

  const handleNotificationClick = (notification: AdminNotificationItem) => {
    onClose();
    navigate(notification.link);
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      {isOpen ? (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-slate-950/55 backdrop-blur-[2px]"
            onClick={onClose}
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: -18 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -18 }}
            transition={{ duration: 0.2 }}
            className="fixed left-1/2 top-1/2 z-[60] flex max-h-[85vh] w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-[28px] bg-white shadow-2xl"
          >
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-6 py-5">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-emerald-100 p-2.5">
                  <Bell className="h-5 w-5 text-emerald-700" strokeWidth={2} />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-slate-950">Notificacoes do Admin</h2>
                  <p className="text-xs text-slate-500">
                    {totals.all > 0 ? `${totals.all} alerta(s) ativo(s)` : 'Sem alertas operacionais no momento'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void loadNotifications()}
                  className="rounded-xl px-3 py-2 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-50"
                >
                  Atualizar
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-xl p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="sticky top-[81px] z-10 flex gap-2 border-b border-slate-200 bg-white px-6 pb-3 pt-4">
              {[
                { id: 'all', label: 'Todas', count: totals.all },
                { id: 'moderation', label: 'Moderacao', count: totals.moderation },
                { id: 'support', label: 'Suporte', count: totals.support },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id as AdminNotificationTab)}
                  className={`rounded-t-lg px-4 py-2 text-sm font-semibold transition-all ${
                    activeTab === tab.id
                      ? 'border-b-2 border-emerald-700 bg-emerald-50 text-emerald-700'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                  }`}
                >
                  {tab.label}
                  {tab.count > 0 ? (
                    <span
                      className={`ml-2 rounded-full px-2 py-0.5 text-xs font-bold ${
                        activeTab === tab.id ? 'bg-emerald-700 text-white' : 'bg-slate-200 text-slate-600'
                      }`}
                    >
                      {tab.count}
                    </span>
                  ) : null}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {isLoading ? (
                <div className="flex items-center justify-center py-16">
                  <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-emerald-600" />
                </div>
              ) : filteredNotifications.length === 0 ? (
                <div className="py-16 text-center">
                  <CheckCircle2 className="mx-auto mb-3 h-12 w-12 text-slate-300" strokeWidth={1.5} />
                  <p className="font-medium text-slate-500">Nenhum alerta do painel de admin</p>
                  <p className="mt-1 text-sm text-slate-400">A central vai mostrar apenas eventos operacionais da administracao.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredNotifications.map((notification) => (
                    <motion.button
                      key={notification.id}
                      type="button"
                      onClick={() => handleNotificationClick(notification)}
                      whileHover={{ scale: 1.01 }}
                      whileTap={{ scale: 0.99 }}
                      className={`w-full rounded-xl border p-4 text-left transition-all ${
                        notification.priority === 'high'
                          ? 'border-amber-200 bg-amber-50/45 hover:border-amber-300'
                          : 'border-slate-200 bg-white hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div className={`rounded-lg p-2 ${notification.priority === 'high' ? 'bg-white' : 'bg-slate-50'}`}>
                          {getNotificationIcon(notification.category, notification.priority)}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="mb-1 flex items-start justify-between gap-2">
                            <h3 className="text-sm font-semibold text-slate-900">{notification.title}</h3>
                            <div className="flex items-center gap-2">
                              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">
                                {notification.count}
                              </span>
                              <ExternalLink className="h-4 w-4 flex-shrink-0 text-slate-400" />
                            </div>
                          </div>
                          <p className="mb-2 text-sm text-slate-600">{notification.content}</p>
                          <span className="text-xs font-medium text-slate-400">{getTimeAgo(notification.timestamp)}</span>
                        </div>
                      </div>
                    </motion.button>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>
  );
};

export default AdminNotificationsModal;
