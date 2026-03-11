import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../src/contexts/AuthContext';
import { useRateLimit, formatTimeRemaining } from '../src/hooks/useRateLimit';
import { useAdminAudit, ADMIN_ACTIONS, RESOURCE_TYPES } from '../src/hooks/useAdminAudit';
import { CaptchaWidget } from '../components/CaptchaWidget';
import { ShieldAlert, AlertTriangle, CheckCircle2 } from 'lucide-react';

const AdminLoginView: React.FC = () => {
  const navigate = useNavigate();
  const { signIn, signOut, user, isAdmin } = useAuth();
  const { logAction } = useAdminAudit();
  
  // Rate Limiting (5 tentativas a cada 15 min, bloqueio de 30 min)
  const {
    canAttempt,
    remainingAttempts,
    isBlocked,
    timeUntilUnblock,
    recordAttempt,
    reset
  } = useRateLimit('admin-login', 5, 15 * 60 * 1000, 30 * 60 * 1000);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showCaptcha, setShowCaptcha] = useState(false);

  useEffect(() => {
    if (user && isAdmin) {
      // Login bem-sucedido, resetar rate limit
      reset();
      setTimeout(() => navigate('/admin'), 300);
      return;
    }
    if (user && !isAdmin) {
      setError('Usuário não possui permissão de administrador.');
      signOut();
    }
  }, [user, isAdmin, navigate, signOut, reset]);

  // Mostrar captcha após 2 tentativas falhadas
  useEffect(() => {
    if (remainingAttempts <= 3 && remainingAttempts > 0) {
      setShowCaptcha(true);
    }
  }, [remainingAttempts]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Verificar se está bloqueado
    if (isBlocked || !canAttempt) {
      setError(`🔒 Bloqueado por segurança. Tente novamente em ${formatTimeRemaining(timeUntilUnblock)}`);
      return;
    }

    // Verificar captcha (se necessário)
    if (showCaptcha && !captchaToken) {
      setError('⚠️ Complete a verificação de segurança (captcha)');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const { error: signInError } = await signIn(email, password);
      
      if (signInError) {
        // Registrar tentativa falhada
        recordAttempt();
        
        // Tentar registrar em auditoria (se usuário foi encontrado)
        try {
          await logAction({
            action: ADMIN_ACTIONS.FORCE_LOGOUT,
            resourceType: RESOURCE_TYPES.SYSTEM,
            reason: `Login falhou: ${signInError.message}`,
            oldValue: { email, timestamp: new Date().toISOString() }
          });
        } catch (auditError) {
          // Falha silenciosa na auditoria
          console.warn('[AdminLogin] Falha ao registrar tentativa em auditoria:', auditError);
        }

        // Mensagens específicas de erro
        if (signInError.message.includes('Invalid')) {
          setError('❌ Credenciais inválidas. Verifique e-mail e senha.');
        } else if (signInError.message.includes('Email not confirmed')) {
          setError('⚠️ E-mail não verificado. Verifique sua caixa de entrada.');
        } else {
          setError(`❌ ${signInError.message}`);
        }

        // Resetar captcha
        setCaptchaToken(null);
        
        setLoading(false);
      } else {
        // Login bem-sucedido - auditoria será registrada ao carregar dashboard
        console.log('[AdminLogin] Login bem-sucedido');
      }
    } catch (err) {
      console.error('[AdminLogin] Erro inesperado:', err);
      setError('❌ Erro de conexão. Tente novamente.');
      recordAttempt();
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900 px-4">
      <div className="max-w-md w-full bg-white rounded-[2.5rem] shadow-2xl p-10">
        <div className="text-center mb-10">
          <div className="w-16 h-16 bg-slate-900 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-xl">
            <span className="text-green-500 text-3xl font-black">T</span>
          </div>
          <h1 className="text-2xl font-black text-slate-900 font-display uppercase tracking-tight">Painel Admin</h1>
          <p className="text-slate-400 mt-2 text-sm font-bold uppercase tracking-widest">Acesso Restrito</p>
        </div>

        {/* Status de Segurança */}
        {isBlocked && (
          <div className="bg-red-500 text-white p-4 rounded-xl mb-6 text-center border-2 border-red-600 animate-shake">
            <div className="flex items-center justify-center gap-2 mb-2">
              <ShieldAlert className="w-5 h-5" />
              <p className="text-sm font-black uppercase tracking-wider">Bloqueado por Segurança</p>
            </div>
            <p className="text-xs font-semibold">
              Muitas tentativas falhadas. Aguarde {formatTimeRemaining(timeUntilUnblock)}
            </p>
          </div>
        )}

        {!isBlocked && remainingAttempts < 5 && (
          <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 p-3 rounded-xl mb-6 text-center">
            <div className="flex items-center justify-center gap-2 mb-1">
              <AlertTriangle className="w-4 h-4" />
              <p className="text-xs font-bold uppercase tracking-wider">Atenção</p>
            </div>
            <p className="text-xs font-semibold">
              {remainingAttempts} tentativa{remainingAttempts !== 1 ? 's' : ''} restante{remainingAttempts !== 1 ? 's' : ''}
            </p>
          </div>
        )}

        {error && (
          <div className="bg-red-50 text-red-600 p-4 rounded-xl text-xs font-bold mb-6 text-center border border-red-100 animate-shake">
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-6">
          <div>
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">
              E-mail Administrativo
            </label>
            <input 
              type="email" 
              required
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isBlocked}
              className="w-full bg-slate-50 border-none rounded-2xl px-6 py-4 focus:ring-2 focus:ring-slate-900 outline-none transition-all font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              placeholder="Digite seu e-mail"
            />
          </div>

          <div>
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">
              Senha Mestra
            </label>
            <input 
              type="password" 
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isBlocked}
              className="w-full bg-slate-50 border-none rounded-2xl px-6 py-4 focus:ring-2 focus:ring-slate-900 outline-none transition-all font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              placeholder="••••••••"
            />
          </div>

          {/* Captcha (aparece após algumas tentativas) */}
          {showCaptcha && !isBlocked && (
            <div className="border-2 border-slate-200 rounded-xl p-4 bg-slate-50">
              <div className="flex items-center gap-2 mb-3">
                <CheckCircle2 className="w-4 h-4 text-slate-600" />
                <p className="text-xs font-black text-slate-600 uppercase tracking-wider">
                  Verificação de Segurança
                </p>
              </div>
              <CaptchaWidget
                onVerify={(token) => {
                  setCaptchaToken(token);
                  setError('');
                }}
                onError={() => {
                  setCaptchaToken(null);
                  setError('⚠️ Erro na verificação. Tente novamente.');
                }}
                onExpire={() => {
                  setCaptchaToken(null);
                  setError('⚠️ Verificação expirada. Complete novamente.');
                }}
                theme="light"
                size="normal"
              />
            </div>
          )}
          
          <button 
            type="submit"
            disabled={loading || isBlocked || (showCaptcha && !captchaToken)}
            className="w-full bg-slate-900 text-white py-5 rounded-2xl font-black text-lg shadow-xl shadow-slate-200 hover:bg-slate-800 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3"
          >
            {loading ? (
              <>
                <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                <span>Verificando...</span>
              </>
            ) : isBlocked ? (
              <>
                <ShieldAlert className="w-5 h-5" />
                <span>Bloqueado</span>
              </>
            ) : (
              'Entrar no Painel'
            )}
          </button>
        </form>

        <div className="mt-10 text-center">
          <button 
            onClick={() => navigate('/')} 
            className="text-slate-400 text-xs font-bold hover:text-slate-900 transition-colors uppercase tracking-widest"
          >
            Voltar para o site
          </button>
        </div>
      </div>

      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-5px); }
          75% { transform: translateX(5px); }
        }
        .animate-shake { 
          animation: shake 0.2s ease-in-out 0s 2; 
        }
      `}</style>
    </div>
  );
};

export default AdminLoginView;