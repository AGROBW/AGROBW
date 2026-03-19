import React, { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import {
  Bell,
  ChevronDown,
  FileCheck,
  LayoutDashboard,
  LogOut,
  Menu,
  Receipt,
  Search,
  Settings,
  Shield,
  Users,
  X,
} from 'lucide-react';
import { useAuth } from '../../src/contexts/AuthContext';
import { useNotificationsCount } from '../../src/hooks/useNotificationsCount';

interface AdminLayoutProps {
  children?: React.ReactNode;
}

const AdminLayout: React.FC<AdminLayoutProps> = ({ children }) => {
  const { user, signOut } = useAuth();
  const { notificationsCount: unreadCount } = useNotificationsCount();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

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
      badge: unreadCount > 0 ? unreadCount : undefined,
    },
    {
      label: 'Gestao de Usuarios',
      path: '/admin/users',
      icon: Users,
    },
    {
      label: 'Financeiro',
      path: '/admin/payments',
      icon: Receipt,
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

  return (
    <div className="min-h-screen bg-slate-50 flex">
      <aside
        className={`fixed left-0 top-0 h-full bg-slate-900 text-white transition-all duration-300 z-40 ${
          sidebarOpen ? 'w-64' : 'w-20'
        }`}
      >
        <div className="h-16 flex items-center justify-between px-4 border-b border-slate-800">
          {sidebarOpen ? (
            <>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-green-500 rounded-lg flex items-center justify-center">
                  <span className="text-white font-black text-lg">T</span>
                </div>
                <span className="font-black text-lg">ADMIN</span>
              </div>
              <button
                onClick={() => setSidebarOpen(false)}
                className="p-1 hover:bg-slate-800 rounded transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </>
          ) : (
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-1 hover:bg-slate-800 rounded transition-colors mx-auto"
            >
              <Menu className="w-5 h-5" />
            </button>
          )}
        </div>

        <nav className="p-4 space-y-1">
          {menuItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.exact}
              className={({ isActive }) => `
                flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all
                ${isActive ? 'bg-green-500 text-white font-semibold' : 'text-slate-300 hover:bg-slate-800 hover:text-white'}
                ${!sidebarOpen && 'justify-center'}
              `}
            >
              <item.icon className="w-5 h-5 flex-shrink-0" />
              {sidebarOpen && (
                <>
                  <span className="flex-1 text-sm">{item.label}</span>
                  {item.badge && (
                    <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                      {item.badge}
                    </span>
                  )}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-slate-800">
          {sidebarOpen ? (
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-slate-700 rounded-full flex items-center justify-center text-sm font-bold">
                {user?.name?.charAt(0).toUpperCase() || 'A'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">{user?.name || 'Admin'}</p>
                <p className="text-xs text-slate-400 truncate">{user?.email}</p>
              </div>
              <button
                onClick={handleLogout}
                className="p-2 hover:bg-slate-800 rounded transition-colors"
                title="Sair"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button
              onClick={handleLogout}
              className="w-full p-2 hover:bg-slate-800 rounded transition-colors"
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
                onClick={() => navigate('/admin/notifications')}
                className="relative p-2 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <Bell className="w-5 h-5 text-slate-600" />
                {unreadCount > 0 && (
                  <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></span>
                )}
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
    </div>
  );
};

export default AdminLayout;
