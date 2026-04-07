import React, { Suspense, lazy } from 'react';
import { MessageCircle } from 'lucide-react';
import { HashRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Toaster } from 'sonner';
import { AuthProvider, useAuth } from './src/contexts/AuthContext';
import { LayoutProvider } from './src/contexts/LayoutContext';
import { useAppSyncStatus } from './src/lib/appSyncStatus';
import { ProtectedAdminRoute } from './components/ProtectedAdminRoute';
import Header from './components/Header';
import Footer from './components/Footer';
import Home from './pages/Home';

// Lazy loading pages
const AdDetailView = lazy(() => import('./pages/AdDetailView'));
const AdsListingView = lazy(() => import('./pages/AdsListingView'));
const CategoriesView = lazy(() => import('./pages/CategoriesView'));
const PricingView = lazy(() => import('./pages/PricingView'));
const PartnerStoresView = lazy(() => import('./pages/PartnerStoresView'));
const StorefrontView = lazy(() => import('./pages/StorefrontView'));
const AdCreationView = lazy(() => import('./pages/AdCreationView'));
const LoginView = lazy(() => import('./pages/LoginView'));
const RegisterView = lazy(() => import('./pages/RegisterView'));
const ResetPasswordView = lazy(() => import('./pages/ResetPasswordView'));
const ContactView = lazy(() => import('./pages/ContactView'));
const AboutView = lazy(() => import('./pages/AboutView'));
const TermsView = lazy(() => import('./pages/TermsView'));
const PrivacyView = lazy(() => import('./pages/PrivacyView'));
const NewsListingView = lazy(() => import('./pages/NewsListingView'));
const NewsArticleView = lazy(() => import('./pages/NewsArticleView'));
const UserDashboardView = lazy(() => import('./pages/UserDashboardView'));
const MessagesView = lazy(() => import('./pages/MessagesView'));
const FavoritesView = lazy(() => import('./pages/FavoritesView'));
const InstitutionalPage = lazy(() => import('./pages/InstitutionalPage'));

// Admin Pages
const AdminLoginView = lazy(() => import('./pages/AdminLoginView'));
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'));
const AdminLayout = lazy(() => import('./pages/admin/AdminLayout'));
const AdminDashboardOverview = lazy(() => import('./pages/admin/AdminDashboardOverview'));
const ModerationQueue = lazy(() => import('./pages/admin/ModerationQueue'));
const UserManagement = lazy(() => import('./pages/admin/UserManagement'));
const CategoriesManagement = lazy(() => import('./pages/admin/CategoriesManagement'));
const AnnouncementsMonitoring = lazy(() => import('./pages/admin/AnnouncementsMonitoring'));
const PaymentsManagement = lazy(() => import('./pages/admin/PaymentsManagement'));
const NewsManagement = lazy(() => import('./pages/admin/NewsManagement'));
const NewsletterSubscriptionsManagement = lazy(() => import('./pages/admin/NewsletterSubscriptionsManagement'));
const LayoutManagement = lazy(() => import('./pages/admin/LayoutManagement'));
const SupportTicketsManagement = lazy(() => import('./pages/admin/SupportTicketsManagement'));
const AuditLogs = lazy(() => import('./pages/admin/AuditLogs'));
const SettingsView = lazy(() => import('./pages/admin/SettingsView'));

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

const PageLoader = () => (
  <div className="flex items-center justify-center min-h-[60vh]">
    <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-green-700"></div>
  </div>
);

class RouteErrorBoundary extends React.Component<{ children: React.ReactNode; resetKey?: string }, { hasError: boolean }> {
  constructor(props: { children: React.ReactNode; resetKey?: string }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    const importErrorMessage = error?.message || '';
    const isLazyChunkLoadError =
      importErrorMessage.includes('Failed to fetch dynamically imported module') ||
      importErrorMessage.includes('Importing a module script failed');

    if (isLazyChunkLoadError && typeof window !== 'undefined') {
      const reloadKey = 'bwagro:lazy-import-reload-attempted';
      const hasReloadedAlready = window.sessionStorage.getItem(reloadKey) === 'true';

      if (!hasReloadedAlready) {
        window.sessionStorage.setItem(reloadKey, 'true');
        window.location.reload();
        return;
      }
    }

    console.error('[RouteErrorBoundary] Erro ao carregar rota:', error);
  }

  componentDidUpdate(prevProps: { children: React.ReactNode; resetKey?: string }) {
    if (this.props.resetKey && this.props.resetKey !== prevProps.resetKey && this.state.hasError) {
      this.setState({ hasError: false });
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-[60vh] flex items-center justify-center p-8">
          <div className="max-w-md w-full bg-white rounded-2xl border border-slate-100 p-6 text-center">
            <h2 className="text-xl font-black text-slate-900 mb-2">Ops, algo deu errado</h2>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-4 inline-flex items-center justify-center rounded-xl bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700"
            >
              Recarregar pagina
            </button>
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
  const { isSyncing } = useAppSyncStatus();
  const isAdminPath = location.pathname.startsWith('/admin');
  const isUserAreaPath = location.pathname.startsWith('/minha-conta');

  return (
    <div className="min-h-screen flex flex-col font-sans antialiased text-slate-900">
      {isSyncing ? (
        <div className="fixed inset-x-0 top-4 z-[70] flex justify-center px-4 pointer-events-none">
          <div className="pointer-events-auto inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-800 shadow-lg backdrop-blur-sm">
            <span className="h-2 w-2 animate-pulse rounded-full bg-amber-500" />
            Atualizando...
          </div>
        </div>
      ) : null}

      {!isAdminPath && <Header />}
      
      <main className="flex-grow">
        <RouteErrorBoundary resetKey={location.pathname}>
          <Suspense fallback={<PageLoader />}>
            <Routes>
            {/* Public Routes */}
            <Route path="/" element={<Home />} />
            <Route path="/anuncios" element={<AdsListingView />} />
            <Route path="/categorias" element={<CategoriesView />} />
            <Route path="/planos" element={<PricingView />} />
            <Route path="/lojas-parceiras" element={<PartnerStoresView />} />
            <Route path="/loja/:slug" element={<StorefrontView />} />
            <Route path="/contato" element={<ContactView />} />
            <Route path="/noticias" element={<NewsListingView />} />
            <Route path="/noticias/:slug" element={<NewsArticleView />} />
            
            {/* Páginas institucionais com layout próprio */}
            <Route path="/quem-somos" element={<AboutView />} />
            <Route path="/termos-de-uso" element={<TermsView />} />
            <Route path="/privacidade" element={<PrivacyView />} />
            
            <Route path="/login" element={<LoginView />} />
            <Route path="/cadastro" element={<RegisterView />} />
            <Route path="/redefinir-senha" element={<ResetPasswordView />} />
            
            {/* Institutional Pages - Dynamic */}
            <Route path="/p/:slug" element={<InstitutionalPage />} />
            
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
                  <Navigate to="/minha-conta/favoritos" replace />
                </RequireAuth>
              } 
            />

            {/* Customer Area Protected Routes */}
            <Route 
              path="/minha-conta/*" 
              element={
                <RequireAuth>
                  <UserDashboardView />
                </RequireAuth>
              } 
            />
            
            {/* Admin Protected Routes com RBAC */}
            <Route 
              path="/admin" 
              element={
                <ProtectedAdminRoute requiredRole="admin" redirectTo="/admin/login">
                  <AdminLayout />
                </ProtectedAdminRoute>
              } 
            >
              <Route index element={<AdminDashboardOverview />} />
              <Route path="moderation" element={<ModerationQueue />} />
              <Route path="users" element={<UserManagement />} />
              <Route path="categories" element={<CategoriesManagement />} />
              <Route path="monitoring" element={<AnnouncementsMonitoring />} />
              <Route path="payments" element={<PaymentsManagement />} />
              <Route path="news" element={<NewsManagement />} />
              <Route path="newsletter" element={<NewsletterSubscriptionsManagement />} />
              <Route path="layout" element={<LayoutManagement />} />
              <Route path="support" element={<SupportTicketsManagement />} />
              <Route path="audit" element={<AuditLogs />} />
              <Route path="settings" element={<SettingsView />} />
            </Route>
            
            <Route path="/categoria/:slug" element={<AdsListingView />} />
            <Route path="/anuncio/:id" element={<AdDetailView />} />
            <Route path="*" element={<div className="p-20 text-center">404 - Página não encontrada</div>} />
            </Routes>
          </Suspense>
        </RouteErrorBoundary>
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
      <LayoutProvider>
        <AppContent />
      </LayoutProvider>
    </AuthProvider>
  </Router>
);

export default App;
