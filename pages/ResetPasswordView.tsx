import React, { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '../src/lib/supabaseClient';
import { toast } from 'sonner';

const ResetPasswordView: React.FC = () => {
  const navigate = useNavigate();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [redirecting, setRedirecting] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const redirectDenied = () => {
      if (!isMounted) return;
      toast.error('Acesso negado ou link expirado');
      navigate('/login', { replace: true });
    };

    const checkSession = async () => {
      const { data } = await supabase.auth.getSession();
      if (!data?.session) {
        redirectDenied();
      }
    };

    checkSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event !== 'PASSWORD_RECOVERY') {
        redirectDenied();
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [navigate]);

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPassword || newPassword.length < 6) {
      setError('A senha deve ter no mínimo 6 caracteres.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('As senhas não coincidem.');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');

    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
    if (updateError) {
      setError('Não foi possível redefinir a senha. Tente novamente.');
      setLoading(false);
      return;
    }

    setSuccess('Senha redefinida com sucesso. Você será redirecionado para o login.');
    setLoading(false);
    setRedirecting(true);
    setTimeout(() => {
      navigate('/login', { replace: true });
    }, 3000);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-8">
      <div className="w-full max-w-md bg-white border border-slate-100 rounded-2xl p-8 shadow-xl shadow-green-100">
        <div className="mb-8 text-center">
          <Link to="/" className="inline-flex items-center gap-2 mb-6 group">
            <div className="w-10 h-10 bg-green-700 rounded-xl flex items-center justify-center shadow-md">
              <span className="text-white text-2xl font-black">T</span>
            </div>
            <span className="text-xl font-black text-slate-800">BWAGRO</span>
          </Link>
          <h1 className="text-2xl font-black text-slate-900 font-display">Redefinir Senha</h1>
          <p className="text-slate-500 mt-2 font-medium">Crie uma nova senha para acessar sua conta.</p>
        </div>

        <form onSubmit={handleReset} className="space-y-5">
          <div>
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Nova Senha</label>
            <input
              type="password"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              className="w-full bg-slate-50 border-2 border-transparent focus:border-green-600 focus:bg-white rounded-2xl px-5 py-4 outline-none transition-all font-medium"
              placeholder="••••••••"
            />
          </div>

          <div>
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Confirmar Nova Senha</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              className="w-full bg-slate-50 border-2 border-transparent focus:border-green-600 focus:bg-white rounded-2xl px-5 py-4 outline-none transition-all font-medium"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-xl">
              <p className="text-sm text-red-700 font-bold">{error}</p>
            </div>
          )}

          {success && (
            <div className="p-4 bg-green-50 border border-green-200 rounded-xl">
              <p className="text-sm text-green-700 font-bold">{success}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={loading || redirecting}
            className="w-full bg-green-700 text-white py-5 rounded-2xl font-black text-lg shadow-xl shadow-green-200 hover:bg-green-800 transition-all active:scale-95 disabled:opacity-70 flex items-center justify-center gap-3"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
            ) : 'Salvar nova senha'}
          </button>
          {redirecting && (
            <div className="mt-4 flex items-center justify-center gap-2 text-sm font-bold text-green-700">
              <div className="w-4 h-4 border-2 border-green-700/20 border-t-green-700 rounded-full animate-spin"></div>
              Redirecionando para o login...
            </div>
          )}
        </form>
      </div>
    </div>
  );
};

export default ResetPasswordView;
