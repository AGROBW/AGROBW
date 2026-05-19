import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  BadgeCheck,
  Bell,
  ChevronDown,
  FileCheck,
  FileLock2,
  FolderTree,
  Gift,
  Handshake,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  Mail,
  Megaphone,
  Menu,
  MonitorSmartphone,
  Newspaper,
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

interface AdminMenuItem {
  label: string;
  path: string;
  icon: React.ComponentType<{ className?: string }>;
  exact?: boolean;
  badge?: number;
}

interface AdminMenuSection {
  id: string;
  label: string;
  items: AdminMenuItem[];
}

const AdminLayout: React.FC<AdminLayoutProps> = ({ children }) => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [moderationBadgeCount, setModerationBadgeCount] = useState(0);
  const [adminNotificationCount, setAdminNotificationCount] = useState(0);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const navScrollRef = useRef<HTMLDivElement | null>(null);
  const [showSidebarScrollHint, setShowSidebarScrollHint] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    operacao: true,
    usuarios: true,
    conteudo: false,
    estrutura: false,
  });

  const menuSections = useMemo<AdminMenuSection[]>(
    () => [
      {
        id: 'operacao',
        label: 'Operação',
        items: [
          { label: 'Dashboard', path: '/admin', icon: LayoutDashboard, exact: true },
          {
            label: 'Fila de Moderacao',
            path: '/admin/moderation',
            icon: FileCheck,
            badge: moderationBadgeCount > 0 ? moderationBadgeCount : undefined,
          },
          { label: 'Denuncias de anuncios', path: '/admin/announcement-reports', icon: AlertTriangle },
          { label: 'Monitoramento', path: '/admin/monitoring', icon: BarChart3 },
          { label: 'Estatisticas', path: '/admin/statistics', icon: Activity },
          { label: 'Financeiro', path: '/admin/payments', icon: Receipt },
        ],
      },
      {
        id: 'usuarios',
        label: 'Usuários',
        items: [
          { label: 'Gestao de Usuarios', path: '/admin/users', icon: Users },
          { label: 'Verificacoes', path: '/admin/verifications', icon: BadgeCheck },
          { label: 'Consentimentos legais', path: '/admin/legal-consents', icon: FileLock2 },
        ],
      },
      {
        id: 'conteudo',
        label: 'Conteúdo',
        items: [
          { label: 'Noticias', path: '/admin/news', icon: Newspaper },
          { label: 'Newsletter', path: '/admin/newsletter', icon: Mail },
          { label: 'Campanhas', path: '/admin/campaigns', icon: Megaphone },
          { label: 'Pop-ups do site', path: '/admin/site-popups', icon: Bell },
          { label: 'Patrocinadores', path: '/admin/sponsors', icon: Handshake },
          { label: 'Promocoes', path: '/admin/promotions', icon: Gift },
        ],
      },
      {
        id: 'estrutura',
        label: 'Estrutura',
        items: [
          { label: 'Categorias', path: '/admin/categories', icon: FolderTree },
          { label: 'Regras de Publicacao', path: '/admin/publication-rules', icon: Shield },
          { label: 'Layout', path: '/admin/layout', icon: MonitorSmartphone },
          { label: 'Suporte', path: '/admin/support', icon: LifeBuoy },
          { label: 'Auditoria e Seguranca', path: '/admin/audit', icon: Shield },
          { label: 'Configuracoes', path: '/admin/settings', icon: Settings },
        ],
      },
    ],
    [moderationBadgeCount],
  );

  useEffect(() => {
    const activeSection = menuSections.find((section) =>
      section.items.some((item) =>
        item.exact ? location.pathname === item.path : location.pathname.startsWith(item.path),
      ),
    );

    if (!activeSection) return;

    setExpandedSections((current) => ({
      ...current,
      [activeSection.id]: true,
    }));
  }, [location.pathname, menuSections]);

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

  const toggleSection = (sectionId: string) => {
    setExpandedSections((current) => ({
      ...current,
      [sectionId]: !current[sectionId],
    }));
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
  }, [sidebarOpen, expandedSections]);

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
          sidebarOpen ? 'w-72' : 'w-20'
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

        <div className="relative min-h-0 flex-1 px-3 pb-4 pt-4">
          <nav
            ref={navScrollRef}
            className="h-full space-y-3 overflow-y-auto pr-1 [scrollbar-color:rgba(148,163,184,0.4)_transparent] [scrollbar-width:thin]"
          >
            {menuSections.map((section) => {
              const isExpanded = expandedSections[section.id];
              const hasActiveChild = section.items.some((item) =>
                item.exact ? location.pathname === item.path : location.pathname.startsWith(item.path),
              );

              return (
                <div
                  key={section.id}
                  className={`rounded-2xl border transition-all ${
                    sidebarOpen
                      ? hasActiveChild
                        ? 'border-white/10 bg-white/[0.04]'
                        : 'border-transparent bg-transparent'
                      : 'border-transparent'
                  }`}
                >
                  {sidebarOpen ? (
                    <>
                      <button
                        type="button"
                        onClick={() => toggleSection(section.id)}
                        className={`flex w-full items-center justify-between rounded-2xl px-3 py-2.5 text-left transition-colors ${
                          hasActiveChild ? 'text-white' : 'text-slate-300 hover:bg-white/5 hover:text-white'
                        }`}
                      >
                        <span className="text-[11px] font-black uppercase tracking-[0.22em]">
                          {section.label}
                        </span>
                        <ChevronDown
                          className={`h-4 w-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                        />
                      </button>

                      <div className={`overflow-hidden transition-all duration-200 ${isExpanded ? 'max-h-[520px] pb-2' : 'max-h-0'}`}>
                        <div className="space-y-1 px-2">
                          {section.items.map((item) => (
                            <NavLink
                              key={item.path}
                              to={item.path}
                              end={item.exact}
                              className={({ isActive }) =>
                                `group flex items-center gap-3 rounded-xl border px-3 py-2.5 text-sm transition-all ${
                                  isActive
                                    ? 'border-emerald-400/30 bg-[linear-gradient(135deg,rgba(22,163,74,0.22)_0%,rgba(15,23,42,0.08)_100%)] text-white shadow-[0_18px_35px_-24px_rgba(22,163,74,0.65)] font-semibold'
                                    : 'border-transparent text-slate-300/88 hover:border-white/10 hover:bg-white/5 hover:text-white'
                                }`
                              }
                            >
                              <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-white/5 text-slate-300 transition-all group-hover:bg-white/10 group-hover:text-emerald-200">
                                <item.icon className="h-4.5 w-4.5 flex-shrink-0" />
                              </span>
                              <span className="min-w-0 flex-1 text-[13px] leading-5">{item.label}</span>
                              {item.badge ? (
                                <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[#f59e0b] px-2 text-[10px] font-bold text-slate-950 shadow-[0_10px_20px_-12px_rgba(245,158,11,0.9)]">
                                  {item.badge}
                                </span>
                              ) : null}
                            </NavLink>
                          ))}
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="space-y-1">
                      {section.items.map((item) => (
                        <NavLink
                          key={item.path}
                          to={item.path}
                          end={item.exact}
                          title={item.label}
                          className={({ isActive }) =>
                            `group flex items-center justify-center rounded-xl border px-2 py-2.5 transition-all ${
                              isActive
                                ? 'border-emerald-400/30 bg-[linear-gradient(135deg,rgba(22,163,74,0.22)_0%,rgba(15,23,42,0.08)_100%)] text-white shadow-[0_18px_35px_-24px_rgba(22,163,74,0.65)]'
                                : 'border-transparent text-slate-300/88 hover:border-white/10 hover:bg-white/5 hover:text-white'
                            }`
                          }
                        >
                          <div className="relative flex h-9 w-9 items-center justify-center rounded-lg bg-white/5 text-slate-300">
                            <item.icon className="h-4.5 w-4.5" />
                            {item.badge ? (
                              <span className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#f59e0b] px-1 text-[9px] font-bold text-slate-950">
                                {item.badge}
                              </span>
                            ) : null}
                          </div>
                        </NavLink>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </nav>

          {sidebarOpen && showSidebarScrollHint ? (
            <div className="pointer-events-none absolute inset-x-3 bottom-4 rounded-b-[22px] bg-gradient-to-t from-[#0f172a] via-[#0f172a]/95 to-transparent px-3 pb-1 pt-12">
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
              <div className="min-w-0 flex-1">
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
              <LogOut className="mx-auto h-5 w-5" />
            </button>
          )}
        </div>
      </aside>

      <div className={`flex-1 transition-all duration-300 ${sidebarOpen ? 'ml-72' : 'ml-20'}`}>
        <header
          className="fixed top-0 right-0 left-0 z-30 h-16 border-b border-slate-200 bg-white transition-all duration-300"
          style={{ marginLeft: sidebarOpen ? '18rem' : '5rem' }}
        >
          <div className="flex h-full items-center justify-between px-6">
            <form onSubmit={handleGlobalSearch} className="flex-1 max-w-xl">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Buscar anuncios, usuarios, CPF/CNPJ..."
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-10 pr-4 transition-all focus:border-transparent focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
            </form>

            <div className="ml-6 flex items-center gap-4">
              <button
                onClick={() => setNotificationsOpen(true)}
                className="relative rounded-lg p-2 transition-colors hover:bg-slate-100"
              >
                <Bell className="h-5 w-5 text-slate-600" />
                {adminNotificationCount > 0 ? (
                  <span className="absolute -right-1 -top-1 inline-flex min-h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white shadow-[0_10px_18px_-10px_rgba(239,68,68,0.95)]">
                    {adminNotificationCount > 99 ? '99+' : adminNotificationCount}
                  </span>
                ) : null}
              </button>

              <div className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-1.5 transition-colors hover:bg-slate-100">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-500 text-sm font-bold text-white">
                  {user?.name?.charAt(0).toUpperCase() || 'A'}
                </div>
                <ChevronDown className="h-4 w-4 text-slate-600" />
              </div>
            </div>
          </div>
        </header>

        <main className="min-h-screen pt-16">
          <div className="p-6">{children || <Outlet />}</div>
        </main>
      </div>

      <AdminNotificationsModal isOpen={notificationsOpen} onClose={() => setNotificationsOpen(false)} />
    </div>
  );
};

export default AdminLayout;
