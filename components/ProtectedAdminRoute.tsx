import React, { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../src/contexts/AuthContext';
import { useSecurityLog } from '../src/hooks/useSecurityLog';
import { ShieldAlert, Loader, Home } from 'lucide-react';
import { appError, appWarn } from '../src/utils/appLogger';

/**
 * Componente de Proteção de Rotas com RBAC e Auditoria de Segurança
 * 
 * Protege rotas administrativas verificando:
 * - Se usuário está autenticado
 * - Se usuário possui role adequado (admin ou editor)
 * - Aguarda inicialização completa do AuthContext (elimina race conditions)
 * - Registra automaticamente tentativas de acesso não autorizado
 * 
 * Uso:
 * ```tsx
 * <Route path="/admin/*" element={
 *   <ProtectedAdminRoute requiredRole="admin">
 *     <AdminDashboard />
 *   </ProtectedAdminRoute>
 * } />
 * ```
 */

interface ProtectedAdminRouteProps {
  children: React.ReactNode;
  requiredRole?: 'admin' | 'editor' | 'moderator'; // 'moderator' = admin OU editor
  redirectTo?: string;
}

export const ProtectedAdminRoute: React.FC<ProtectedAdminRouteProps> = ({
  children,
  requiredRole = 'admin',
  redirectTo = '/admin/login'
}) => {
  const { user, isAdmin, isLoading } = useAuth();
  const { logUnauthorizedAccess } = useSecurityLog();
  const location = useLocation();
  const navigate = useNavigate();
  const [accessDenied, setAccessDenied] = useState(false);

  // Loading state - Aguarda inicialização do AuthContext
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <Loader className="w-8 h-8 text-green-600 animate-spin mx-auto mb-3" />
          <p className="text-sm text-slate-600 font-medium">Verificando permissões...</p>
        </div>
      </div>
    );
  }

  // Não autenticado - Redirecionar para login
  if (!user) {
    appWarn('[ProtectedRoute] Acesso negado: Usuário não autenticado', {
      route: location.pathname,
      requiredRole,
    });
    return <Navigate to={redirectTo} state={{ from: location }} replace />;
  }

  // Verificar role
  const hasAccess = checkRoleAccess(user, requiredRole, isAdmin);

  if (!hasAccess) {
    appWarn('[ProtectedRoute] Acesso negado: Role insuficiente', {
      userId: user.id,
      userRole: user.role,
      requiredRole,
      isAdmin,
      route: location.pathname,
    });

    // Registrar evento de segurança automaticamente
    if (!accessDenied) {
      setAccessDenied(true);
      
      // Log assíncrono (não bloqueia renderização)
      logUnauthorizedAccess({
        attemptedRoute: location.pathname,
        reason: `Role insuficiente: ${user.role || 'user'} (requerido: ${requiredRole})`
      }).catch(error => {
        appError('[ProtectedRoute] Erro ao registrar tentativa de acesso', error, {
          userId: user.id,
          userRole: user.role,
          requiredRole,
          route: location.pathname,
        });
      });
    }

    // Tela de acesso negado (UI LIMPA - sem detalhes de debug)
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-2xl p-8 text-center border border-slate-200">
          {/* Ícone de Escudo */}
          <div className="w-20 h-20 bg-gradient-to-br from-red-500 to-red-600 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg">
            <ShieldAlert className="w-10 h-10 text-white" strokeWidth={2.5} />
          </div>
          
          {/* Título */}
          <h2 className="text-3xl font-black text-slate-900 mb-3">
            Acesso Negado
          </h2>
          
          {/* Mensagem Amigável */}
          <p className="text-slate-600 mb-8 leading-relaxed">
            Você não possui as permissões necessárias para acessar esta área do sistema. 
            Se você acredita que deveria ter acesso, entre em contato com o administrador.
          </p>
          
          {/* Botões de Ação */}
          <div className="flex flex-col gap-3">
            <button
              onClick={() => navigate('/')}
              className="w-full bg-slate-900 text-white py-3 px-4 rounded-xl font-semibold hover:bg-slate-800 transition-all flex items-center justify-center gap-2 shadow-lg hover:shadow-xl"
            >
              <Home className="w-5 h-5" />
              Voltar para Home
            </button>
            
            {user && (
              <button
                onClick={() => navigate('/minha-conta')}
                className="w-full bg-white text-slate-700 py-3 px-4 rounded-xl font-semibold hover:bg-slate-50 transition-all border-2 border-slate-200"
              >
                Ir para Meu Painel
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Acesso permitido
  return <>{children}</>;
};

/**
 * Função auxiliar para verificar acesso baseado em role
 */
const checkRoleAccess = (
  user: any,
  requiredRole: string,
  isAdmin: boolean
): boolean => {
  // Admin tem acesso a tudo
  if (isAdmin || user.role === 'admin') {
    return true;
  }

  // Se requer admin especificamente, apenas admin pode acessar
  if (requiredRole === 'admin') {
    return false;
  }

  // Se requer moderator (admin OU editor)
  if (requiredRole === 'moderator') {
    return user.role === 'admin' || user.role === 'editor';
  }

  // Se requer editor
  if (requiredRole === 'editor') {
    return user.role === 'editor' || user.role === 'admin';
  }

  return false;
};

/**
 * HOC (Higher-Order Component) para proteção de componentes
 * 
 * Uso:
 * ```tsx
 * const ProtectedComponent = withAdminProtection(MyComponent, { requiredRole: 'admin' });
 * ```
 */
export const withAdminProtection = <P extends object>(
  Component: React.ComponentType<P>,
  options: { requiredRole?: 'admin' | 'editor' | 'moderator'; redirectTo?: string } = {}
) => {
  return (props: P) => (
    <ProtectedAdminRoute {...options}>
      <Component {...props} />
    </ProtectedAdminRoute>
  );
};
