
import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { ChevronDown, Menu, X, MessageCircle, Bell } from 'lucide-react';
import AdsSideDrawer from './AdsSideDrawer';
import { useAuth } from '../src/contexts/AuthContext';
import { useNotificationsCount } from '../src/hooks/useNotificationsCount';

const Header: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [isAdsDrawerOpen, setIsAdsDrawerOpen] = useState(false);
  const { user, signOut } = useAuth();
  const { messagesCount, notificationsCount, isLoading } = useNotificationsCount();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await signOut();
    navigate('/');
  };

  return (
    <header className="sticky top-0 z-50 bg-white border-b border-slate-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo */}
          <div className="flex-shrink-0 flex items-center">
            <Link to="/" className="flex items-center gap-2">
              <div className="w-9 h-9 bg-green-700 rounded-lg flex items-center justify-center">
                <span className="text-white text-xl font-semibold">T</span>
              </div>
              <span className="text-xl font-semibold tracking-tight text-slate-800">BW<span className="text-green-700">AGRO</span></span>
            </Link>
          </div>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center space-x-8">
            <Link to="/" className="text-sm font-medium text-slate-600 hover:text-green-700 transition-colors">Início</Link>
            <button 
              onClick={() => setIsAdsDrawerOpen(true)}
              className="text-sm font-medium text-slate-600 hover:text-green-700 transition-colors flex items-center gap-1"
            >
              Anúncios
              <ChevronDown className="w-4 h-4" strokeWidth={1.5} />
            </button>
            <Link to="/categorias" className="text-sm font-medium text-slate-600 hover:text-green-700 transition-colors">Categorias</Link>
            <Link to="/planos" className="text-sm font-medium text-slate-600 hover:text-green-700 transition-colors">Planos</Link>
          </nav>

          {/* Auth & CTA */}
          <div className="hidden md:flex items-center space-x-6">
            {user ? (
              <div className="flex items-center gap-4">
                {/* Mensagens */}
                <Link 
                  to="/minha-conta/mensagens" 
                  className="relative p-2 text-slate-600 hover:text-green-700 hover:bg-slate-50 rounded-lg transition-colors"
                >
                  <MessageCircle className="w-5 h-5" strokeWidth={1.5} />
                  {messagesCount > 0 && (
                    <span className="absolute -top-1 -right-1 bg-green-700 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                      {messagesCount > 9 ? '9+' : messagesCount}
                    </span>
                  )}
                </Link>
                
                {/* Notificações */}
                <Link 
                  to="/minha-conta/notificacoes" 
                  className="relative p-2 text-slate-600 hover:text-green-700 hover:bg-slate-50 rounded-lg transition-colors"
                >
                  <Bell className="w-5 h-5" strokeWidth={1.5} />
                  {notificationsCount > 0 && (
                    <span className="absolute -top-1 -right-1 bg-green-700 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                      {notificationsCount > 9 ? '9+' : notificationsCount}
                    </span>
                  )}
                </Link>
                
                {/* Perfil */}
                <Link to="/minha-conta" className="flex items-center gap-3 border-r border-slate-100 pr-6 hover:bg-slate-50 transition-all p-1.5 rounded-lg">
                  <div className="w-9 h-9 rounded-full border border-green-100 bg-green-700 flex items-center justify-center text-white font-bold">
                    {user.name?.charAt(0).toUpperCase() || 'U'}
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs font-semibold text-slate-800 leading-tight truncate max-w-[80px]">{user.name?.split(' ')[0] || 'Usuário'}</span>
                    <span className="text-[9px] font-semibold text-green-600 uppercase tracking-widest">Painel</span>
                  </div>
                </Link>
                <button onClick={handleLogout} className="text-[10px] font-semibold text-slate-400 hover:text-red-500 text-left uppercase tracking-widest">Sair</button>
              </div>
            ) : (
              <Link to="/login" className="text-sm font-semibold text-slate-600 hover:text-green-700 px-4 py-2 uppercase tracking-widest">Entrar</Link>
            )}
            <Link 
              to="/anunciar" 
              className="bg-green-700 text-white px-5 h-9 rounded-lg text-sm font-semibold hover:bg-green-800 transition-all flex items-center justify-center"
            >
              Anunciar Agora
            </Link>
          </div>

          {/* Mobile menu button */}
          <div className="md:hidden flex items-center">
            <button 
              onClick={() => setIsOpen(!isOpen)}
              className="p-2 rounded-md text-slate-600 hover:text-green-700 hover:bg-gray-100 focus:outline-none"
            >
              {isOpen ? (
                <X className="h-6 w-6" strokeWidth={1.5} />
              ) : (
                <Menu className="h-6 w-6" strokeWidth={1.5} />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu */}
      {isOpen && (
        <div className="md:hidden bg-white border-t border-slate-100 py-4 px-4 space-y-1">
          <Link 
            to="/" 
            onClick={() => setIsOpen(false)}
            className="block px-3 py-2 rounded-md text-base font-medium text-slate-700 hover:bg-green-50 hover:text-green-700"
          >
            Início
          </Link>
          <button 
            onClick={() => {
              setIsOpen(false);
              setIsAdsDrawerOpen(true);
            }}
            className="w-full text-left px-3 py-2 rounded-md text-base font-medium text-slate-700 hover:bg-green-50 hover:text-green-700"
          >
            Anúncios
          </button>
          <Link 
            to="/categorias" 
            onClick={() => setIsOpen(false)}
            className="block px-3 py-2 rounded-md text-base font-medium text-slate-700 hover:bg-green-50 hover:text-green-700"
          >
            Categorias
          </Link>
          <Link 
            to="/planos" 
            onClick={() => setIsOpen(false)}
            className="block px-3 py-2 rounded-md text-base font-medium text-slate-700 hover:bg-green-50 hover:text-green-700"
          >
            Planos
          </Link>
          <div className="pt-4 flex flex-col gap-2">
            {user ? (
              <div className="space-y-2">
                {/* Mensagens */}
                <Link 
                  to="/minha-conta/mensagens" 
                  onClick={() => setIsOpen(false)}
                  className="flex items-center justify-between p-3 bg-slate-50 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <MessageCircle className="w-5 h-5 text-slate-600" strokeWidth={1.5} />
                    <span className="font-medium text-slate-800">Mensagens</span>
                  </div>
                  {messagesCount > 0 && (
                    <span className="bg-green-700 text-white text-xs font-bold rounded-full px-2 py-0.5">
                      {messagesCount}
                    </span>
                  )}
                </Link>
                
                {/* Painel */}
                <div className="p-3 bg-slate-50 rounded-lg flex items-center justify-between">
                  <Link to="/minha-conta" onClick={() => setIsOpen(false)} className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-green-700 flex items-center justify-center text-white font-bold">
                      {user.name?.charAt(0).toUpperCase() || 'U'}
                    </div>
                    <span className="font-semibold text-slate-800">Meu Painel</span>
                  </Link>
                  <button onClick={handleLogout} className="text-red-500 font-semibold text-xs">Sair</button>
                </div>
              </div>
            ) : (
              <Link to="/login" onClick={() => setIsOpen(false)} className="w-full text-center py-3 text-slate-700 font-medium">Entrar</Link>
            )}
            <Link to="/anunciar" onClick={() => setIsOpen(false)} className="w-full bg-green-700 text-white h-10 rounded-lg font-semibold flex items-center justify-center">Anunciar Agora</Link>
          </div>
        </div>
      )}

      {/* Side Drawer for Ads */}
      <AdsSideDrawer 
        isOpen={isAdsDrawerOpen} 
        onClose={() => setIsAdsDrawerOpen(false)} 
      />
    </header>
  );
};

export default Header;
