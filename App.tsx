import React, { Suspense, lazy } from 'react';
import { MessageCircle } from 'lucide-react';
import { HashRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Toaster } from 'sonner';
import { AuthProvider, useAuth } from './src/contexts/AuthContext';
import Header from './components/Header';
import Footer from './components/Footer';
import Home from './pages/Home';

// Lazy loading pages
const AdDetailView = lazy(() => import('./pages/AdDetailView'));
const AdsListingView = lazy(() => import('./pages/AdsListingView'));
const CategoriesView = lazy(() => import('./pages/CategoriesView'));
const PricingView = lazy(() => import('./pages/PricingView'));
const AdCreationView = lazy(() => import('./pages/AdCreationView'));
const LoginView = lazy(() => import('./pages/LoginView'));
const RegisterView = lazy(() => import('./pages/RegisterView'));
const ResetPasswordView = lazy(() => import('./pages/ResetPasswordView'));
const ContactView = lazy(() => import('./pages/ContactView'));
const AboutView = lazy(() => import('./pages/AboutView'));
const TermsView = lazy(() => import('./pages/TermsView'));
const PrivacyView = lazy(() => import('./pages/PrivacyView'));
const UserDashboardView = lazy(() => import('./pages/UserDashboardView'));
const MessagesView = lazy(() => import('./pages/MessagesView'));
const FavoritesView = lazy(() => import('./pages/FavoritesView'));

// Admin Pages
const AdminLoginView = lazy(() => import('./pages/AdminLoginView'));
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'));

// Auth Guard Component usando Supabase
const RequireAuth = ({ children }: { children?: React.ReactNode }) => {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#2D5016]"></div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
};

// Admin Guard Component usando Supabase
const RequireAdmin = ({ children }: { children?: React.ReactNode }) => {
  const { user, isAdmin, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#2D5016]"></div>
      </div>
    );
  }

  if (!user || !isAdmin) {
    return <Navigate to="/admin/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
};

const PageLoader = () => (
  <div className="flex items-center justify-center min-h-[60vh]">
    <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-green-700"></div>
  </div>
);

class RouteErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-[60vh] flex items-center justify-center p-8">
          <div className="max-w-md w-full bg-white rounded-2xl border border-slate-100 p-6 text-center">
            <h2 className="text-xl font-black text-slate-900 mb-2">Ops, algo deu errado</h2>
            <p className="text-sm text-slate-500">Tente recarregar a página ou volte mais tarde.</p>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const AppContent: React.FC = () => {
  const location = useLocation();
  const isAdminPath = location.pathname.startsWith('/admin');
  const isUserAreaPath = location.pathname.startsWith('/minha-conta');

  return (
    <div className="min-h-screen flex flex-col font-sans antialiased text-slate-900">
      {!isAdminPath && <Header />}
      
      <main className="flex-grow">
        <Suspense fallback={<PageLoader />}>
          <Routes>
            {/* Public Routes */}
            <Route path="/" element={<Home />} />
            <Route path="/anuncios" element={<AdsListingView />} />
            <Route path="/categorias" element={<CategoriesView />} />
            <Route path="/planos" element={<PricingView />} />
            <Route path="/contato" element={<ContactView />} />
            <Route path="/quem-somos" element={<AboutView />} />
            <Route path="/termos-de-uso" element={<TermsView />} />
            <Route path="/privacidade" element={<PrivacyView />} />
            <Route path="/login" element={<LoginView />} />
            <Route path="/cadastro" element={<RegisterView />} />
            <Route path="/redefinir-senha" element={<ResetPasswordView />} />
            
            {/* Admin Login */}
            <Route path="/admin/login" element={<AdminLoginView />} />

            {/* User Protected Routes */}
            <Route 
              path="/anunciar" 
              element={
                <RequireAuth>
                  <AdCreationView />
                </RequireAuth>
              } 
            />
            
            <Route 
              path="/mensagens" 
              element={
                <RequireAuth>
                  <MessagesView />
                </RequireAuth>
              } 
            />
            
            <Route 
              path="/favoritos" 
              element={
                <RequireAuth>
                  <FavoritesView />
                </RequireAuth>
              } 
            />

            {/* Customer Area Protected Routes */}
            <Route 
              path="/minha-conta/*" 
              element={
                <RequireAuth>
                  <RouteErrorBoundary>
                    <UserDashboardView />
                  </RouteErrorBoundary>
                </RequireAuth>
              } 
            />
            
            {/* Admin Protected Routes */}
            <Route 
              path="/admin/*" 
              element={
                <RequireAdmin>
                  <AdminDashboard />
                </RequireAdmin>
              } 
            />
            
            <Route path="/categoria/:slug" element={<AdsListingView />} />
            <Route path="/anuncio/:id" element={<AdDetailView />} />
            <Route path="*" element={<div className="p-20 text-center">404 - Página não encontrada</div>} />
          </Routes>
        </Suspense>
      </main>

      {!isAdminPath && !isUserAreaPath && <Footer />}

      {/* Floating WhatsApp Action */}
      {!isAdminPath && !isUserAreaPath && (
        <div className="md:hidden fixed bottom-6 right-6 z-50">
          <a 
            href="https://wa.me/5500000000000" 
            target="_blank" 
            rel="noopener noreferrer"
            className="w-10 h-10 bg-green-500 rounded-lg flex items-center justify-center text-white"
          >
            <MessageCircle className="w-5 h-5" strokeWidth={1.5} />
          </a>
        </div>
      )}

      <Toaster
        position="top-right"
        expand={false}
        toastOptions={{
          classNames: {
            toast: 'rounded-2xl shadow-lg font-sans border border-slate-100',
            title: 'text-slate-900 font-bold',
            description: 'text-slate-600',
            success: 'bg-green-50 text-green-700 border-green-100',
            error: 'bg-red-50 text-red-700 border-red-100',
            info: 'bg-slate-50 text-slate-900 border-slate-200'
          }
        }}
      />
    </div>
  );
};

const App = () => (
  <Router>
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  </Router>
);

export default App;