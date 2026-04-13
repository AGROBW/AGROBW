import React, { useEffect, useRef, useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import {
  Activity,
  BarChart3,
  Bell,
  ChevronDown,
  FileCheck,
  FolderTree,
  LayoutDashboard,
  MonitorSmartphone,
  LogOut,
  Menu,
  Newspaper,
  LifeBuoy,
  Mail,
  Receipt,
  Search,
  Settings,
  Shield,
  Users,
  X,
} from 'lucide-react';
import { useAuth } from '../../src/contexts/AuthContext';
import AdminNotificationsModal from '../../components/admin/AdminNotificationsModal';
import { fetchAdminNotificationItems, subscribeToAdminNotificationEvents } from '../../src/lib/adminNotificationCenter';

interface AdminLayoutProps {
  children?: React.ReactNode;
}

const AdminLayout: React.FC<AdminLayoutProps> = ({ children }) => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [moderationBadgeCount, setModerationBadgeCount] = useState(0);
  const [adminNotificationCount, setAdminNotificationCount] = useState(0);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const navScrollRef = useRef<HTMLDivElement | null>(null);
  const [showSidebarScrollHint, setShowSidebarScrollHint] = useState(false);

  const menuItems = [
    {
      label: 'Dashboard',
      path: '/admin',
      icon: LayoutDashboard,
      exact: true,
    },
    {
      label: 'Fila de Moderacao',
      path: '/admin/moderation',
      icon: FileCheck,
      badge: moderationBadgeCount > 0 ? moderationBadgeCount : undefined,
    },
    {
      label: 'Gestao de Usuarios',
      path: '/admin/users',
      icon: Users,
    },
    {
      label: 'Categorias',
      path: '/admin/categories',
      icon: FolderTree,
    },
    {
      label: 'Monitoramento',
      path: '/admin/monitoring',
      icon: BarChart3,
    },
    {
      label: 'Estatisticas',
      path: '/admin/statistics',
      icon: Activity,
    },
    {
      label: 'Financeiro',
      path: '/admin/payments',
      icon: Receipt,
    },
    {
      label: 'Noticias',
      path: '/admin/news',
      icon: Newspaper,
    },
    {
      label: 'Newsletter',
      path: '/admin/newsletter',
      icon: Mail,
    },
    {
      label: 'Layout',
      path: '/admin/layout',
      icon: MonitorSmartphone,
    },
    {
      label: 'Suporte',
      path: '/admin/support',
      icon: LifeBuoy,
    },
    {
      label: 'Auditoria & Seguranca',
      path: '/admin/audit',
      icon: Shield,
    },
    {
      label: 'Configuracoes',
      path: '/admin/settings',
      icon: Settings,
    },
  ];

  const handleLogout = async () => {
    await signOut();
    navigate('/admin/login');
  };

  const handleGlobalSearch = (event: React.FormEvent) => {
    event.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/admin/search?q=${encodeURIComponent(searchQuery)}`);
    }
  };

  useEffect(() => {
    const element = navScrollRef.current;
    if (!element || !sidebarOpen) {
      setShowSidebarScrollHint(false);
      return;
    }

    const updateHint = () => {
      const canScroll = element.scrollHeight > element.clientHeight + 8;
      const nearBottom = element.scrollTop + element.clientHeight >= element.scrollHeight - 12;
      setShowSidebarScrollHint(canScroll && !nearBottom);
    };

    updateHint();
    element.addEventListener('scroll', updateHint);
    window.addEventListener('resize', updateHint);

    return () => {
      element.removeEventListener('scroll', updateHint);
      window.removeEventListener('resize', updateHint);
    };
  }, [sidebarOpen]);

  useEffect(() => {
    let isMounted = true;

    const loadAdminNotificationCounts = async () => {
      try {
        const items = await fetchAdminNotificationItems();

        if (isMounted) {
          setModerationBadgeCount(
            items
              .filter((item) => item.category === 'moderation')
              .reduce((sum, item) => sum + item.count, 0),
          );
          setAdminNotificationCount(items.reduce((sum, item) => sum + item.count, 0));
        }
      } catch (error) {
        console.error('[AdminLayout] Erro ao carregar badge da moderacao:', error);
        if (isMounted) {
          setModerationBadgeCount(0);
          setAdminNotificationCount(0);
        }
      }
    };

    void loadAdminNotificationCounts();

    const refreshOnFocus = () => {
      void loadAdminNotificationCounts();
    };

    const unsubscribe = subscribeToAdminNotificationEvents(() => {
      void loadAdminNotificationCounts();
    });

    const intervalId = window.setInterval(() => {
      void loadAdminNotificationCounts();
    }, 30000);

    window.addEventListener('focus', refreshOnFocus);

    return () => {
      isMounted = false;
      unsubscribe();
      window.clearInterval(intervalId);
      window.removeEventListener('focus', refreshOnFocus);
    };
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 flex">
      <aside
        className={`fixed left-0 top-0 z-40 flex h-full flex-col border-r border-slate-800/80 bg-[#0f172a] text-white shadow-[30px_0_60px_-45px_rgba(15,23,42,0.82)] transition-all duration-300 ${
          sidebarOpen ? 'w-64' : 'w-20'
        }`}
      >
        <div className="flex h-20 items-center justify-between border-b border-white/10 px-4">
          {sidebarOpen ? (
            <>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-2xl bg-[linear-gradient(135deg,#16a34a_0%,#15803d_100%)] text-white shadow-[0_18px_35px_-18px_rgba(22,163,74,0.8)]">
                  {user?.avatar ? (
                    <img src={user.avatar} alt={user?.name || 'Admin'} className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-base font-black">{user?.name?.charAt(0).toUpperCase() || 'A'}</span>
                  )}
                </div>
                <div>
                  <span className="block text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-300/90">
                    Painel Admin
                  </span>
                </div>
              </div>
              <button
                onClick={() => setSidebarOpen(false)}
                className="rounded-xl p-2 text-slate-300 transition-colors hover:bg-white/5 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </>
          ) : (
            <button
              onClick={() => setSidebarOpen(true)}
              className="mx-auto rounded-xl p-2 text-slate-300 transition-colors hover:bg-white/5 hover:text-white"
            >
              <Menu className="w-5 h-5" />
            </button>
          )}
        </div>

        <div className="relative min-h-0 flex-1 px-4 pb-4 pt-4">
          <nav
            ref={navScrollRef}
            className="h-full space-y-1.5 overflow-y-auto pr-1 [scrollbar-color:rgba(148,163,184,0.4)_transparent] [scrollbar-width:thin]"
          >
            {menuItems.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.exact}
                className={({ isActive }) => `
                group flex items-center gap-3 rounded-2xl border px-3.5 py-3 text-sm transition-all
                ${isActive ? 'border-emerald-400/30 bg-[linear-gradient(135deg,rgba(22,163,74,0.22)_0%,rgba(15,23,42,0.08)_100%)] text-white shadow-[0_18px_35px_-24px_rgba(22,163,74,0.65)] font-semibold' : 'border-transparent text-slate-300/88 hover:border-white/10 hover:bg-white/5 hover:text-white'}
                ${!sidebarOpen && 'justify-center'}
              `}
              >
                <span
                  className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl transition-all ${
                    sidebarOpen
                      ? 'bg-white/5 text-slate-300 group-hover:bg-white/10 group-hover:text-emerald-200'
                      : 'bg-white/5 text-slate-300'
                  }`}
                >
                  <item.icon className="w-5 h-5 flex-shrink-0" />
                </span>
                {sidebarOpen && (
                  <>
                    <span className="flex-1 text-sm">{item.label}</span>
                    {item.badge && (
                      <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[#f59e0b] px-2 text-xs font-bold text-slate-950 shadow-[0_10px_20px_-12px_rgba(245,158,11,0.9)]">
                        {item.badge}
                      </span>
                    )}
                  </>
                )}
              </NavLink>
            ))}
          </nav>

          {sidebarOpen && showSidebarScrollHint ? (
            <div className="pointer-events-none absolute inset-x-4 bottom-4 rounded-b-[22px] bg-gradient-to-t from-[#0f172a] via-[#0f172a]/95 to-transparent px-3 pb-1 pt-12">
              <div className="mx-auto w-fit rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.24em] text-slate-300">
                Role para ver mais
              </div>
            </div>
          ) : null}
        </div>

        <div className="border-t border-white/10 p-4">
          {sidebarOpen ? (
            <div className="flex items-center gap-3 rounded-[22px] border border-white/10 bg-white/5 p-3 backdrop-blur">
              <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-slate-700 text-sm font-bold ring-2 ring-white/10">
                {user?.avatar ? (
                  <img src={user.avatar} alt={user?.name || 'Admin'} className="h-full w-full object-cover" />
                ) : (
                  user?.name?.charAt(0).toUpperCase() || 'A'
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="truncate text-sm font-semibold text-white">{user?.name || 'Admin'}</p>
                <p className="truncate text-xs text-slate-400">{user?.email}</p>
              </div>
              <button
                onClick={handleLogout}
                className="rounded-xl p-2 text-slate-300 transition-colors hover:bg-white/5 hover:text-white"
                title="Sair"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button
              onClick={handleLogout}
              className="w-full rounded-xl p-2 text-slate-300 transition-colors hover:bg-white/5 hover:text-white"
              title="Sair"
            >
              <LogOut className="w-5 h-5 mx-auto" />
            </button>
          )}
        </div>
      </aside>

      <div className={`flex-1 transition-all duration-300 ${sidebarOpen ? 'ml-64' : 'ml-20'}`}>
        <header
          className="h-16 bg-white border-b border-slate-200 fixed top-0 right-0 left-0 z-30 transition-all duration-300"
          style={{ marginLeft: sidebarOpen ? '16rem' : '5rem' }}
        >
          <div className="h-full px-6 flex items-center justify-between">
            <form onSubmit={handleGlobalSearch} className="flex-1 max-w-xl">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Buscar anuncios, usuarios, CPF/CNPJ..."
                  className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all"
                />
              </div>
            </form>

            <div className="flex items-center gap-4 ml-6">
              <button
                onClick={() => setNotificationsOpen(true)}
                className="relative p-2 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <Bell className="w-5 h-5 text-slate-600" />
                {adminNotificationCount > 0 ? (
                  <span className="absolute -right-1 -top-1 inline-flex min-h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white shadow-[0_10px_18px_-10px_rgba(239,68,68,0.95)]">
                    {adminNotificationCount > 99 ? '99+' : adminNotificationCount}
                  </span>
                ) : null}
              </button>

              <div className="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer">
                <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center text-white text-sm font-bold">
                  {user?.name?.charAt(0).toUpperCase() || 'A'}
                </div>
                <ChevronDown className="w-4 h-4 text-slate-600" />
              </div>
            </div>
          </div>
        </header>

        <main className="pt-16 min-h-screen">
          <div className="p-6">
            {children || <Outlet />}
          </div>
        </main>
      </div>

      <AdminNotificationsModal
        isOpen={notificationsOpen}
        onClose={() => setNotificationsOpen(false)}
      />
    </div>
  );
};

export default AdminLayout;
