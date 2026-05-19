import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bell, ChevronDown, LogOut, Menu, MessageCircle, Shield, User as UserIcon, X } from 'lucide-react';
import NotificationsModal from './NotificationsModal';
import { useAuth } from '../src/contexts/AuthContext';
import { useLayout } from '../src/contexts/LayoutContext';
import { useNotificationsCount } from '../src/hooks/useNotificationsCount';
import { UserRole } from '../types';

const Header: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [isNotificationsModalOpen, setIsNotificationsModalOpen] = useState(false);
  const [isProfileDropdownOpen, setIsProfileDropdownOpen] = useState(false);
  const { user, signOut } = useAuth();
  const { settings } = useLayout();
  const { messagesCount, notificationsCount } = useNotificationsCount();
  const navigate = useNavigate();
  const profileDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (profileDropdownRef.current && !profileDropdownRef.current.contains(event.target as Node)) {
        setIsProfileDropdownOpen(false);
      }
    };

    if (isProfileDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isProfileDropdownOpen]);

  const isAdmin = user?.isAdmin === true || user?.role === UserRole.ADMIN;

  const handleLogout = async () => {
    await signOut();
    navigate('/');
  };

  const brandName = settings.headerBrandText || settings.siteName;

  return (
    <header className="sticky top-0 z-50 border-b border-slate-100 bg-white">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          <div className="flex flex-shrink-0 items-center">
            <Link to="/" className="flex items-center gap-2">
              {settings.logoUrl ? (
                <img src={settings.logoUrl} alt={brandName} className="h-9 w-auto max-w-[160px] object-contain" />
              ) : (
                <>
                  <div
                    className="flex h-9 w-9 items-center justify-center rounded-lg"
                    style={{ backgroundColor: settings.primaryColor }}
                  >
                    <span className="text-xl font-semibold text-white">
                      {(settings.siteShortName || settings.siteName || 'B').charAt(0)}
                    </span>
                  </div>
                  <span className="text-xl font-semibold tracking-tight" style={{ color: settings.textColor }}>
                    {brandName}
                  </span>
                </>
              )}
            </Link>
          </div>

          <nav className="hidden items-center space-x-8 md:flex">
            <Link to="/" className="text-sm font-medium text-slate-600 transition-colors hover:text-green-700">
              Inicio
            </Link>
            <Link to="/categorias" className="text-sm font-medium text-slate-600 transition-colors hover:text-green-700">
              Categorias
            </Link>
            <Link to="/lojas-parceiras" className="text-sm font-medium text-slate-600 transition-colors hover:text-green-700">
              Lojas Parceiras
            </Link>
            <Link to="/patrocinador" className="text-sm font-medium text-slate-600 transition-colors hover:text-green-700">
              Vitrine Premium
            </Link>
            <Link to="/planos" className="text-sm font-medium text-slate-600 transition-colors hover:text-green-700">
              Planos
            </Link>
          </nav>

          <div className="hidden items-center space-x-6 md:flex">
            {user ? (
              <div className="flex items-center gap-4">
                <Link
                  to="/minha-conta/mensagens"
                  className="relative rounded-lg p-2 text-slate-600 transition-colors hover:bg-slate-50 hover:text-green-700"
                >
                  <MessageCircle className="h-5 w-5" strokeWidth={1.5} />
                  {messagesCount > 0 ? (
                    <span
                      className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold text-white"
                      style={{ backgroundColor: settings.primaryColor }}
                    >
                      {messagesCount > 9 ? '9+' : messagesCount}
                    </span>
                  ) : null}
                </Link>

                <button
                  onClick={() => setIsNotificationsModalOpen(true)}
                  className="relative rounded-lg p-2 text-slate-600 transition-colors hover:bg-slate-50 hover:text-green-700"
                >
                  <Bell className="h-5 w-5" strokeWidth={1.5} />
                  {notificationsCount > 0 ? (
                    <span
                      className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold text-white"
                      style={{ backgroundColor: settings.primaryColor }}
                    >
                      {notificationsCount > 9 ? '9+' : notificationsCount}
                    </span>
                  ) : null}
                </button>

                <div className="relative" ref={profileDropdownRef}>
                  <button
                    onClick={() => setIsProfileDropdownOpen(!isProfileDropdownOpen)}
                    className="flex items-center gap-3 rounded-lg border-r border-slate-100 p-1.5 pr-6 transition-all hover:bg-slate-50"
                  >
                    <div
                      className="relative flex h-9 w-9 items-center justify-center rounded-full text-white font-bold"
                      style={{
                        backgroundColor: settings.primaryColor,
                        border: `1px solid color-mix(in srgb, ${settings.primaryColor} 18%, white)`,
                      }}
                    >
                      {user.name?.charAt(0).toUpperCase() || 'U'}
                      {isAdmin ? (
                        <div className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full border-2 border-white bg-amber-500">
                          <Shield className="h-2.5 w-2.5 text-white" strokeWidth={3} />
                        </div>
                      ) : null}
                    </div>
                    <div className="flex flex-col">
                      <div className="flex items-center gap-1.5">
                        <span className="max-w-[80px] truncate text-xs font-semibold leading-tight text-slate-800">
                          {user.name?.split(' ')[0] || 'Usuario'}
                        </span>
                        {isAdmin ? (
                          <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-black uppercase text-amber-700">
                            Admin
                          </span>
                        ) : null}
                      </div>
                      <span className="text-[9px] font-semibold uppercase tracking-widest" style={{ color: settings.primaryColor }}>
                        Painel
                      </span>
                    </div>
                    <ChevronDown
                      className={`h-4 w-4 text-slate-400 transition-transform ${isProfileDropdownOpen ? 'rotate-180' : ''}`}
                    />
                  </button>

                  {isProfileDropdownOpen ? (
                    <div className="absolute right-0 z-50 mt-2 w-56 rounded-xl border border-slate-200 bg-white py-2 shadow-lg">
                      <Link
                        to="/minha-conta"
                        onClick={() => setIsProfileDropdownOpen(false)}
                        className="flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 transition-colors hover:bg-slate-50"
                      >
                        <UserIcon className="h-4 w-4 text-slate-500" strokeWidth={2} />
                        <span className="font-medium">Painel do Usuario</span>
                      </Link>

                      {isAdmin ? (
                        <>
                          <div className="my-1 border-t border-slate-100" />
                          <Link
                            to="/admin"
                            onClick={() => setIsProfileDropdownOpen(false)}
                            className="group flex items-center gap-3 px-4 py-2.5 text-sm text-amber-700 transition-colors hover:bg-amber-50"
                          >
                            <Shield className="h-4 w-4 text-amber-600 group-hover:text-amber-700" strokeWidth={2} />
                            <span className="font-semibold">Painel Administrativo</span>
                          </Link>
                        </>
                      ) : null}

                      <div className="my-1 border-t border-slate-100" />
                      <button
                        onClick={() => {
                          setIsProfileDropdownOpen(false);
                          void handleLogout();
                        }}
                        className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-red-600 transition-colors hover:bg-red-50"
                      >
                        <LogOut className="h-4 w-4" strokeWidth={2} />
                        <span className="font-medium">Sair</span>
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : (
              <Link to="/login" className="px-4 py-2 text-sm font-semibold uppercase tracking-widest text-slate-600 hover:text-green-700">
                Entrar
              </Link>
            )}

            <Link
              to="/anunciar"
              className="flex h-9 items-center justify-center rounded-lg px-5 text-sm font-semibold text-white transition-all"
              style={{ backgroundColor: settings.primaryColor }}
            >
              Anunciar Agora
            </Link>
          </div>

          <div className="flex items-center md:hidden">
            <button
              onClick={() => setIsOpen(!isOpen)}
              className="rounded-md p-2 text-slate-600 hover:bg-gray-100 hover:text-green-700 focus:outline-none"
            >
              {isOpen ? <X className="h-6 w-6" strokeWidth={1.5} /> : <Menu className="h-6 w-6" strokeWidth={1.5} />}
            </button>
          </div>
        </div>
      </div>

      {isOpen ? (
        <div className="space-y-1 border-t border-slate-100 bg-white px-4 py-4 md:hidden">
          <Link
            to="/"
            onClick={() => setIsOpen(false)}
            className="block rounded-md px-3 py-2 text-base font-medium text-slate-700 hover:bg-green-50 hover:text-green-700"
          >
            Inicio
          </Link>
          <Link
            to="/categorias"
            onClick={() => setIsOpen(false)}
            className="block rounded-md px-3 py-2 text-base font-medium text-slate-700 hover:bg-green-50 hover:text-green-700"
          >
            Categorias
          </Link>
          <Link
            to="/lojas-parceiras"
            onClick={() => setIsOpen(false)}
            className="block rounded-md px-3 py-2 text-base font-medium text-slate-700 hover:bg-green-50 hover:text-green-700"
          >
            Lojas Parceiras
          </Link>
          <Link
            to="/patrocinador"
            onClick={() => setIsOpen(false)}
            className="block rounded-md px-3 py-2 text-base font-medium text-slate-700 hover:bg-green-50 hover:text-green-700"
          >
            Vitrine Premium
          </Link>
          <Link
            to="/planos"
            onClick={() => setIsOpen(false)}
            className="block rounded-md px-3 py-2 text-base font-medium text-slate-700 hover:bg-green-50 hover:text-green-700"
          >
            Planos
          </Link>

          <div className="flex flex-col gap-2 pt-4">
            {user ? (
              <div className="space-y-2">
                <Link
                  to="/minha-conta/mensagens"
                  onClick={() => setIsOpen(false)}
                  className="flex items-center justify-between rounded-lg bg-slate-50 p-3"
                >
                  <div className="flex items-center gap-3">
                    <MessageCircle className="h-5 w-5 text-slate-600" strokeWidth={1.5} />
                    <span className="font-medium text-slate-800">Mensagens</span>
                  </div>
                  {messagesCount > 0 ? (
                    <span className="rounded-full px-2 py-0.5 text-xs font-bold text-white" style={{ backgroundColor: settings.primaryColor }}>
                      {messagesCount}
                    </span>
                  ) : null}
                </Link>

                <div className="rounded-lg bg-slate-50 p-3">
                  <Link to="/minha-conta" onClick={() => setIsOpen(false)} className="mb-2 flex items-center gap-3">
                    <div
                      className="relative flex h-8 w-8 items-center justify-center rounded-full text-white font-bold"
                      style={{ backgroundColor: settings.primaryColor }}
                    >
                      {user.name?.charAt(0).toUpperCase() || 'U'}
                      {isAdmin ? (
                        <div className="absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full border-2 border-white bg-amber-500">
                          <Shield className="h-2 w-2 text-white" strokeWidth={3} />
                        </div>
                      ) : null}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-slate-800">{user.name?.split(' ')[0] || 'Usuario'}</span>
                        {isAdmin ? (
                          <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-black uppercase text-amber-700">
                            Admin
                          </span>
                        ) : null}
                      </div>
                      <span className="text-xs text-slate-500">Meu Painel</span>
                    </div>
                  </Link>

                  {isAdmin ? (
                    <Link
                      to="/admin"
                      onClick={() => setIsOpen(false)}
                      className="mb-2 flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 p-2 transition-colors hover:bg-amber-100"
                    >
                      <Shield className="h-5 w-5 text-amber-600" strokeWidth={2} />
                      <span className="text-sm font-semibold text-amber-700">Painel Administrativo</span>
                    </Link>
                  ) : null}

                  <button
                    onClick={() => {
                      setIsOpen(false);
                      void handleLogout();
                    }}
                    className="flex w-full items-center justify-center gap-2 rounded-lg py-2 text-sm font-semibold text-red-500 transition-colors hover:bg-red-50"
                  >
                    <LogOut className="h-4 w-4" strokeWidth={2} />
                    <span>Sair</span>
                  </button>
                </div>
              </div>
            ) : (
              <Link to="/login" onClick={() => setIsOpen(false)} className="w-full py-3 text-center font-medium text-slate-700">
                Entrar
              </Link>
            )}

            <Link
              to="/anunciar"
              onClick={() => setIsOpen(false)}
              className="flex h-10 w-full items-center justify-center rounded-lg font-semibold text-white"
              style={{ backgroundColor: settings.primaryColor }}
            >
              Anunciar Agora
            </Link>
          </div>
        </div>
      ) : null}

      <NotificationsModal isOpen={isNotificationsModalOpen} onClose={() => setIsNotificationsModalOpen(false)} />
    </header>
  );
};

export default Header;
