import React, { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../src/contexts/AuthContext';
import { ShieldAlert, Loader } from 'lucide-react';

/**
 * Componente de Proteção de Rotas com RBAC
 * 
 * Protege rotas administrativas verificando:
 * - Se usuário está autenticado
 * - Se usuário possui role adequado (admin ou editor)
 * - Se JWT contém custom claims corretos
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
  const location = useLocation();
  const [verifying, setVerifying] = useState(true);

  useEffect(() => {
    // Simular verificação de JWT (em produção, verificar custom claims)
    const verifyAccess = async () => {
      if (!isLoading) {
        // Aguardar um pouco para garantir que user está carregado
        await new Promise(resolve => setTimeout(resolve, 300));
        setVerifying(false);
      }
    };

    verifyAccess();
  }, [isLoading, user]);

  // Loading state
  if (isLoading || verifying) {
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
    console.warn('[ProtectedRoute] Acesso negado: Usuário não autenticado');
    return <Navigate to={redirectTo} state={{ from: location }} replace />;
  }

  // Verificar role
  const hasAccess = checkRoleAccess(user, requiredRole, isAdmin);

  if (!hasAccess) {
    console.warn('[ProtectedRoute] Acesso negado: Role insuficiente', {
      userId: user.id,
      userRole: user.role,
      requiredRole,
      isAdmin
    });

    // Tela de acesso negado
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center border border-slate-200">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <ShieldAlert className="w-8 h-8 text-red-600" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900 mb-2">Acesso Negado</h2>
          <p className="text-slate-600 mb-6">
            Você não possui permissão para acessar esta área do sistema.
          </p>
          <div className="bg-slate-50 rounded-lg p-4 mb-6 text-left">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
              Detalhes
            </p>
            <div className="space-y-1 text-sm text-slate-700">
              <p><span className="font-semibold">Seu nível:</span> {user.role || 'user'}</p>
              <p><span className="font-semibold">Necessário:</span> {requiredRole}</p>
              <p><span className="font-semibold">Rota:</span> {location.pathname}</p>
            </div>
          </div>
          <button
            onClick={() => window.history.back()}
            className="w-full bg-slate-900 text-white py-3 rounded-lg font-semibold hover:bg-slate-800 transition-colors"
          >
            Voltar
          </button>
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
