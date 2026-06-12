import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../src/contexts/AuthContext';
import { useLayout } from '../src/contexts/LayoutContext';
import { getRememberDevicePreference } from '../src/lib/supabaseClient';
import { toast } from 'sonner';
import SeoHead from '../components/SeoHead';

const LoginView: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { signIn, sendPasswordResetEmail } = useAuth();
  const { settings } = useLayout();
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [formData, setFormData] = useState({ email: '', password: '' });
  const [rememberDevice, setRememberDevice] = useState(() => getRememberDevicePreference());
  const [errors, setErrors] = useState({ email: '', password: '' });
  const [adminHint, setAdminHint] = useState(false);
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [recoveryLoading, setRecoveryLoading] = useState(false);
  const [suspendedModal, setSuspendedModal] = useState<{
    show: boolean;
    userName: string;
    reason: string;
  }>({ show: false, userName: '', reason: '' });

  const from = (location.state as any)?.from?.pathname || '/minha-conta';
  const loginBrandName = settings.loginBrandText || settings.siteName;
  const searchParams = new URLSearchParams(location.search);
  const redirectTarget = searchParams.get('redirect') || from;
  const contactSellerIntent = searchParams.get('intent') === 'contact-seller';
  const registerLink = `/cadastro${location.search}`;
  const loginHeroImage =
    settings.loginHeroImageUrl ||
    'https://images.unsplash.com/photo-1523348837708-15d4a09cfac2?q=80&w=1600&auto=format&fit=crop';

  const buildPostAuthRedirect = () => {
    if (!contactSellerIntent) {
      return redirectTarget;
    }

    const separator = redirectTarget.includes('?') ? '&' : '?';
    return `${redirectTarget}${separator}openContactSeller=1`;
  };

  useEffect(() => {
    const validate = () => {
      const newErrors = { email: '', password: '' };

      if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
        newErrors.email = 'Formato de e-mail inválido';
      }

      if (formData.email === 'admin@bwagro.com' || formData.email === 'admin@bwagro.com.br') {
        setAdminHint(true);
      } else {
        setAdminHint(false);
      }

      if (!recoveryMode && formData.password && formData.password.length < 6) {
        newErrors.password = 'A senha deve ter no mínimo 6 caracteres';
      }

      setErrors(newErrors);
    };

    validate();
  }, [formData, recoveryMode]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (errors.email || errors.password || !formData.email || !formData.password) return;

    if (formData.email === 'admin@bwagro.com' || formData.email === 'admin@bwagro.com.br') {
      navigate('/admin/login');
      return;
    }

    setLoading(true);
    const { error } = await signIn(formData.email, formData.password, rememberDevice);

    if (error) {
      if (error.message === 'ADMIN_PORTAL_REQUIRED') {
        toast.error('Use o portal administrativo para continuar.', {
          description: 'Contas administrativas precisam concluir a verificacao em duas etapas no login do painel.'
        });
        setLoading(false);
        navigate('/admin/login', { replace: true });
        return;
      }

      if (error.message === 'USER_SUSPENDED') {
        setLoading(false);
        setSuspendedModal({
          show: true,
          userName: error.user_name || 'Usuário',
          reason: error.suspension_reason || 'Sua conta foi suspensa por violar nossos termos de uso.',
        });
        return;
      }

      toast.error(
        error.message === 'Invalid login credentials'
          ? 'E-mail ou senha incorretos'
          : 'Erro ao fazer login. Tente novamente.',
      );
      setLoading(false);
    } else {
      toast.success('Login realizado!', { description: 'Bem-vindo de volta.' });
      navigate(buildPostAuthRedirect(), { replace: true });
      setLoading(false);
    }
  };

  const handlePasswordRecovery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.email || errors.email) return;

    setRecoveryLoading(true);
    const { error } = await sendPasswordResetEmail(formData.email);

    if (error) {
      toast.error('Não foi possível enviar o link. Tente novamente.');
      setRecoveryLoading(false);
      return;
    }

    toast.success('Link de recuperação enviado!', {
      description: 'Se o e-mail existir em nossa base, um link foi enviado. Verifique também sua caixa de spam.',
    });
    setRecoveryLoading(false);
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] flex flex-col md:flex-row bg-white overflow-hidden">
      <SeoHead
        title="Entrar"
        description="Acesse sua conta na AGRO BW."
        canonicalPath="/login"
        noIndex
      />
      <div className="hidden md:flex md:w-[60%] relative bg-[#0a1628]">
        <img
          src={loginHeroImage}
          alt="Agronegócio de alta performance"
          className="absolute inset-0 w-full h-full object-cover object-center"
        />
        <div
          className="absolute inset-0"
          style={{
            background: `linear-gradient(135deg, ${settings.secondaryColor}CC, ${settings.primaryColor}66, transparent)`,
          }}
        ></div>
        <div className="relative z-10 p-20 flex flex-col justify-end h-full text-white">
          <div className="max-w-xl">
            <span className="bg-white/20 backdrop-blur-md px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-widest mb-6 inline-block border border-white/20">
              Conexão Rural
            </span>
            <h2 className="text-5xl font-black mb-6 font-display leading-tight">
              O futuro do agronegócio acontece aqui.
            </h2>
            <p className="text-xl font-medium leading-relaxed" style={{ color: 'rgba(255,255,255,0.82)' }}>
              Junte-se à maior rede de produtores rurais do Brasil e transforme sua produtividade em resultados reais.
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-8 md:p-16 lg:p-24 bg-slate-50 md:bg-white overflow-y-auto">
        <div className="max-w-md w-full animate-in fade-in slide-in-from-right duration-700">
          <div className="mb-12">
            <Link to="/" className="inline-flex items-center gap-2 mb-10 group">
              {settings.logoUrl ? (
                <img src={settings.logoUrl} alt={loginBrandName} className="h-12 w-auto max-w-[220px] object-contain" />
              ) : (
                <>
                  <div
                    className="w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg transition-transform group-hover:scale-110"
                    style={{ backgroundColor: settings.primaryColor, boxShadow: `0 10px 28px ${settings.primaryColor}33` }}
                  >
                    <span className="text-white text-3xl font-black">
                      {(settings.siteShortName || settings.siteName || 'B').charAt(0)}
                    </span>
                  </div>
                  <span className="text-2xl font-black tracking-tight" style={{ color: settings.textColor }}>
                    {loginBrandName}
                  </span>
                </>
              )}
            </Link>
            <h1 className="text-3xl font-black text-slate-900 font-display">Acesse sua conta</h1>
            <p className="text-slate-500 mt-3 font-medium">Insira suas credenciais para gerenciar seus negócios.</p>
          </div>

          <form onSubmit={recoveryMode ? handlePasswordRecovery : handleLogin} className="space-y-6">
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">
                Endereço de e-mail
              </label>
              <div className="relative">
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className={`w-full bg-slate-50 border-2 rounded-2xl px-6 py-4 outline-none transition-all font-medium ${
                    errors.email ? 'border-red-200 focus:border-red-500 bg-red-50/30' : 'border-transparent focus:ring-2 focus:bg-white'
                  }`}
                  style={!errors.email ? { ['--tw-ring-color' as any]: `${settings.primaryColor}33` } : undefined}
                  placeholder="exemplo@agro.com.br"
                />
                {errors.email && <p className="text-[10px] text-red-500 font-bold mt-1.5 ml-1 uppercase">{errors.email}</p>}
                {adminHint && (
                  <div
                    className="mt-2 p-3 rounded-xl"
                    style={{
                      backgroundColor: `color-mix(in srgb, ${settings.primaryColor} 8%, white)`,
                      border: `1px solid color-mix(in srgb, ${settings.primaryColor} 18%, white)`,
                    }}
                  >
                    <p className="text-[10px] font-bold leading-tight" style={{ color: settings.primaryColor }}>
                      Este e-mail pertence à administração. Por favor, use o{' '}
                      <Link to="/admin/login" className="underline font-black">
                        Portal Admin
                      </Link>
                      .
                    </p>
                  </div>
                )}
              </div>
            </div>

            {!recoveryMode && (
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">
                    Senha segura
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setRecoveryMode(true);
                    }}
                    className="text-[10px] font-black uppercase tracking-widest hover:underline"
                    style={{ color: settings.primaryColor }}
                  >
                    Esqueci minha senha
                  </button>
                </div>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    autoComplete="current-password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className={`w-full bg-slate-50 border-2 rounded-2xl px-6 py-4 outline-none transition-all font-medium pr-14 ${
                      errors.password ? 'border-red-200 focus:border-red-500 bg-red-50/30' : 'border-transparent focus:ring-2 focus:bg-white'
                    }`}
                    style={!errors.password ? { ['--tw-ring-color' as any]: `${settings.primaryColor}33` } : undefined}
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
                    aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                  >
                    {showPassword ? 'Ocultar' : 'Mostrar'}
                  </button>
                  {errors.password && <p className="text-[10px] text-red-500 font-bold mt-1.5 ml-1 uppercase">{errors.password}</p>}
                </div>
              </div>
            )}

            {recoveryMode && (
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl">
                <p className="text-xs text-slate-600 font-medium">
                  Informe seu e-mail para receber o link de recuperação.
                </p>
              </div>
            )}

            {!recoveryMode && (
              <div className="flex items-center gap-2 py-2">
                <input
                  type="checkbox"
                  id="remember"
                  checked={rememberDevice}
                  onChange={(e) => setRememberDevice(e.target.checked)}
                  className="w-5 h-5 rounded border-slate-200 transition-all cursor-pointer"
                  style={{ accentColor: settings.primaryColor }}
                />
                <label htmlFor="remember" className="text-sm font-bold text-slate-600 cursor-pointer">
                  Lembrar-me neste dispositivo
                </label>
              </div>
            )}

            <div className="space-y-4">
              <button
                type="submit"
                disabled={recoveryMode ? recoveryLoading : loading}
                className="w-full text-white py-5 rounded-2xl font-black text-lg shadow-xl transition-all active:scale-95 disabled:opacity-70 flex items-center justify-center gap-3"
                style={{ backgroundColor: settings.primaryColor, boxShadow: `0 12px 30px ${settings.primaryColor}33` }}
              >
                {recoveryMode ? (
                  recoveryLoading ? (
                    <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                  ) : (
                    'Enviar link de recuperação'
                  )
                ) : loading ? (
                  <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                ) : (
                  'Entrar no BWAGRO'
                )}
              </button>
              {recoveryMode && (
                <button
                  type="button"
                  onClick={() => {
                    setRecoveryMode(false);
                  }}
                  className="w-full py-3 rounded-2xl font-black text-sm hover:underline"
                  style={{ color: settings.primaryColor }}
                >
                  Voltar para o login
                </button>
              )}
            </div>
          </form>

          <div className="mt-12 text-center">
            <p className="text-slate-500 font-medium">
              Não tem uma conta?{' '}
              <Link
                to={registerLink}
                className="font-black hover:underline underline-offset-4 decoration-2"
                style={{ color: settings.primaryColor }}
              >
                Cadastre-se grátis
              </Link>
            </p>
          </div>
        </div>
      </div>

      {suspendedModal.show && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-8 shadow-2xl animate-in fade-in zoom-in duration-300">
            <div className="flex justify-center mb-6">
              <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center">
                <svg className="w-10 h-10 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
              </div>
            </div>

            <h2 className="text-2xl font-black text-center text-slate-900 mb-4">Conta suspensa</h2>

            <p className="text-center text-slate-600 mb-4">
              Olá, <strong className="text-slate-900">{suspendedModal.userName}</strong>
            </p>

            <div className="bg-red-50 border-2 border-red-200 rounded-2xl p-4 mb-6">
              <p className="text-sm font-semibold text-red-900 mb-2">Motivo da suspensão:</p>
              <p className="text-sm text-red-800 leading-relaxed">{suspendedModal.reason}</p>
            </div>

            <p className="text-sm text-slate-600 text-center mb-6 leading-relaxed">
              Sua conta foi temporariamente suspensa. Se você acredita que isso foi um erro ou deseja esclarecer a situação,
              entre em contato com nosso suporte.
            </p>

            <div className="flex flex-col gap-3">
              <a
                href="https://wa.me/5511999999999?text=Olá,%20minha%20conta%20foi%20suspensa%20e%20gostaria%20de%20esclarecimentos."
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full text-white py-4 rounded-2xl font-bold transition-all active:scale-95 shadow-lg"
                style={{ backgroundColor: settings.primaryColor }}
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
                </svg>
                Falar com suporte
              </a>
              <button
                onClick={() => setSuspendedModal({ show: false, userName: '', reason: '' })}
                className="w-full border-2 border-slate-200 text-slate-700 py-4 rounded-2xl font-bold hover:bg-slate-50 transition-all"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LoginView;
