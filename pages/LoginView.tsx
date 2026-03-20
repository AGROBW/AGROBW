
import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../src/contexts/AuthContext';
import { getRememberDevicePreference } from '../src/lib/supabaseClient';
import { toast } from 'sonner';

const LoginView: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { signIn, sendPasswordResetEmail } = useAuth();
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
  
  const from = (location.state as any)?.from?.pathname || "/minha-conta";

  // Validação em tempo real
  useEffect(() => {
    const validate = () => {
      let newErrors = { email: '', password: '' };
      if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
        newErrors.email = 'Formato de e-mail inválido';
      }
      
      // Detecta se é o email do admin para dar um aviso
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
      // Verificar se o erro é de conta suspensa
      if (error.message === 'USER_SUSPENDED') {
        setLoading(false);
        setSuspendedModal({
          show: true,
          userName: error.user_name || 'Usuário',
          reason: error.suspension_reason || 'Sua conta foi suspensa por violar nossos termos de uso.'
        });
        return;
      }
      
      toast.error(
        error.message === 'Invalid login credentials' 
          ? 'E-mail ou senha incorretos' 
          : 'Erro ao fazer login. Tente novamente.'
      );
      setLoading(false);
    } else {
      toast.success('Login realizado!', { description: 'Bem-vindo de volta.' });
      navigate('/minha-conta', { replace: true });
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
      description: 'Se o e-mail existir em nossa base, um link foi enviado. Verifique também sua caixa de spam.'
    });
    setRecoveryLoading(false);
  };

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-white overflow-hidden">
      {/* Lado Esquerdo: Imagem Dinâmica (60%) */}
      <div className="hidden md:flex md:w-[60%] relative h-screen">
        <img 
          src="https://images.unsplash.com/photo-1523348837708-15d4a09cfac2?q=80&w=1600&auto=format&fit=crop" 
          alt="Agronegócio de Alta Performance" 
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-br from-green-900/80 via-green-800/40 to-transparent"></div>
        <div className="relative z-10 p-20 flex flex-col justify-end h-full text-white">
          <div className="max-w-xl">
            <span className="bg-white/20 backdrop-blur-md px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-widest mb-6 inline-block border border-white/20">
              Conexão Rural
            </span>
            <h2 className="text-5xl font-black mb-6 font-display leading-tight">
              O futuro do agronegócio acontece aqui.
            </h2>
            <p className="text-xl text-green-50/80 font-medium leading-relaxed">
              Junte-se à maior rede de produtores rurais do Brasil e transforme sua produtividade em resultados reais.
            </p>
          </div>
        </div>
      </div>

      {/* Lado Direito: Formulário (40%) */}
      <div className="flex-1 flex items-center justify-center p-8 md:p-16 lg:p-24 bg-slate-50 md:bg-white overflow-y-auto">
        <div className="max-w-md w-full animate-in fade-in slide-in-from-right duration-700">
          <div className="mb-12">
            <Link to="/" className="inline-flex items-center gap-2 mb-10 group">
              <div className="w-12 h-12 bg-green-700 rounded-2xl flex items-center justify-center shadow-lg shadow-green-200 transition-transform group-hover:scale-110">
                <span className="text-white text-3xl font-black">T</span>
              </div>
              <span className="text-2xl font-black tracking-tight text-slate-800">Terra<span className="text-green-700">Link</span></span>
            </Link>
            <h1 className="text-3xl font-black text-slate-900 font-display">Acesse sua conta</h1>
            <p className="text-slate-500 mt-3 font-medium">Insira suas credenciais para gerenciar seus negócios.</p>
          </div>

          <form onSubmit={recoveryMode ? handlePasswordRecovery : handleLogin} className="space-y-6">
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Endereço de E-mail</label>
              <div className="relative">
                <input 
                  type="email" 
                  required
                  autoComplete="email"
                  value={formData.email}
                  onChange={(e) => setFormData({...formData, email: e.target.value})}
                  className={`w-full bg-slate-50 border-2 rounded-2xl px-6 py-4 outline-none transition-all font-medium ${errors.email ? 'border-red-200 focus:border-red-500 bg-red-50/30' : 'border-transparent focus:border-green-600 focus:bg-white'}`}
                  placeholder="exemplo@agro.com.br"
                />
                {errors.email && <p className="text-[10px] text-red-500 font-bold mt-1.5 ml-1 uppercase">{errors.email}</p>}
                {adminHint && (
                  <div className="mt-2 p-3 bg-blue-50 border border-blue-100 rounded-xl">
                    <p className="text-[10px] text-blue-700 font-bold leading-tight">
                      Este e-mail pertence à administração. Por favor, use o <Link to="/admin/login" className="underline font-black">Portal Admin</Link>.
                    </p>
                  </div>
                )}
              </div>
            </div>

            {!recoveryMode && (
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Senha Segura</label>
                  <button
                    type="button"
                    onClick={() => {
                      setRecoveryMode(true);
                    }}
                    className="text-[10px] font-black text-green-700 uppercase tracking-widest hover:underline"
                  >
                    Esqueci minha senha
                  </button>
                </div>
                <div className="relative">
                  <input 
                    type={showPassword ? "text" : "password"} 
                    required
                    autoComplete="current-password"
                    value={formData.password}
                    onChange={(e) => setFormData({...formData, password: e.target.value})}
                    className={`w-full bg-slate-50 border-2 rounded-2xl px-6 py-4 outline-none transition-all font-medium pr-14 ${errors.password ? 'border-red-200 focus:border-red-500 bg-red-50/30' : 'border-transparent focus:border-green-600 focus:bg-white'}`}
                    placeholder="••••••••"
                  />
                  <button 
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
                  >
                    {showPassword ? '🙈' : '👁️'}
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
                  className="w-5 h-5 rounded border-slate-200 text-green-600 focus:ring-green-500 transition-all cursor-pointer"
                />
                <label htmlFor="remember" className="text-sm font-bold text-slate-600 cursor-pointer">Lembrar-me neste dispositivo</label>
              </div>
            )}

            
            <div className="space-y-4">
              <button 
                type="submit"
                disabled={recoveryMode ? recoveryLoading : loading}
                className="w-full bg-green-700 text-white py-5 rounded-2xl font-black text-lg shadow-xl shadow-green-200 hover:bg-green-800 transition-all active:scale-95 disabled:opacity-70 flex items-center justify-center gap-3"
              >
                {recoveryMode ? (
                  recoveryLoading ? (
                    <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                  ) : 'Enviar Link de Recuperação'
                ) : (
                  loading ? (
                    <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                  ) : 'Entrar no BWAGRO'
                )}
              </button>
              {recoveryMode && (
                <button
                  type="button"
                  onClick={() => {
                    setRecoveryMode(false);
                  }}
                  className="w-full text-green-700 py-3 rounded-2xl font-black text-sm hover:underline"
                >
                  Voltar para o login
                </button>
              )}
            </div>
          </form>

          <div className="my-10 flex items-center gap-4">
            <div className="h-px bg-slate-200 flex-grow"></div>
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">Ou entre com</span>
            <div className="h-px bg-slate-200 flex-grow"></div>
          </div>

          <div className="grid grid-cols-1 gap-4">
            <button className="flex items-center justify-center gap-3 py-4 border-2 border-slate-100 rounded-2xl hover:bg-slate-50 transition-all active:scale-95 group">
              <img src="https://www.svgrepo.com/show/475656/google-color.svg" className="w-5 h-5" alt="Google" />
              <span className="text-sm font-bold text-slate-700">Google</span>
            </button>
          </div>

          <div className="mt-12 text-center">
            <p className="text-slate-500 font-medium">
              Não tem uma conta?{' '}
              <Link to="/cadastro" className="text-green-700 font-black hover:underline underline-offset-4 decoration-2">Cadastre-se grátis</Link>
            </p>
          </div>
        </div>
      </div>

      {/* Modal de Conta Suspensa */}
      {suspendedModal.show && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-8 shadow-2xl animate-in fade-in zoom-in duration-300">
            {/* Ícone de Alerta */}
            <div className="flex justify-center mb-6">
              <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center">
                <svg className="w-10 h-10 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
            </div>

            {/* Título */}
            <h2 className="text-2xl font-black text-center text-slate-900 mb-4">
              Conta Suspensa
            </h2>

            {/* Nome do Usuário */}
            <p className="text-center text-slate-600 mb-4">
              Olá, <strong className="text-slate-900">{suspendedModal.userName}</strong>
            </p>

            {/* Mensagem de Suspensão */}
            <div className="bg-red-50 border-2 border-red-200 rounded-2xl p-4 mb-6">
              <p className="text-sm font-semibold text-red-900 mb-2">
                Motivo da suspensão:
              </p>
              <p className="text-sm text-red-800 leading-relaxed">
                {suspendedModal.reason}
              </p>
            </div>

            {/* Informação adicional */}
            <p className="text-sm text-slate-600 text-center mb-6 leading-relaxed">
              Sua conta foi temporariamente suspensa. Se você acredita que isso foi um erro ou deseja esclarecer a situação, entre em contato com nosso suporte.
            </p>

            {/* Botões */}
            <div className="flex flex-col gap-3">
              <a
                href="https://wa.me/5511999999999?text=Olá,%20minha%20conta%20foi%20suspensa%20e%20gostaria%20de%20esclarecimentos."
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full bg-green-600 text-white py-4 rounded-2xl font-bold hover:bg-green-700 transition-all active:scale-95 shadow-lg"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
                </svg>
                Falar com Suporte
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
