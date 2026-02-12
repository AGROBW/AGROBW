import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../src/contexts/AuthContext';

const AdminLoginView: React.FC = () => {
  const navigate = useNavigate();
  const { signIn, signOut, user, isAdmin } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user && isAdmin) {
      setTimeout(() => navigate('/admin'), 300);
      return;
    }
    if (user && !isAdmin) {
      setError('Usuário não possui permissão de administrador.');
      signOut();
    }
  }, [user, isAdmin, navigate, signOut]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const { error } = await signIn(email, password);
    if (error) {
      setError(error.message || 'Credenciais inválidas.');
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

        {error && (
          <div className="bg-red-50 text-red-600 p-4 rounded-xl text-xs font-bold mb-6 text-center border border-red-100 animate-shake">
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-6">
          <div>
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">E-mail Administrativo</label>
            <input 
              type="email" 
              required
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-slate-50 border-none rounded-2xl px-6 py-4 focus:ring-2 focus:ring-slate-900 outline-none transition-all font-medium"
              placeholder="Digite seu e-mail"
            />
          </div>
          <div>
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Senha Mestra</label>
            <input 
              type="password" 
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-slate-50 border-none rounded-2xl px-6 py-4 focus:ring-2 focus:ring-slate-900 outline-none transition-all font-medium"
              placeholder="••••••••"
            />
          </div>
          
          <button 
            type="submit"
            disabled={loading}
            className="w-full bg-slate-900 text-white py-5 rounded-2xl font-black text-lg shadow-xl shadow-slate-200 hover:bg-slate-800 transition-all active:scale-95 disabled:opacity-70 flex items-center justify-center gap-3"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
            ) : 'Entrar no Painel'}
          </button>
        </form>

        <div className="mt-10 text-center">
          <button onClick={() => navigate('/')} className="text-slate-400 text-xs font-bold hover:text-slate-900 transition-colors uppercase tracking-widest">
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
        .animate-shake { animation: shake 0.2s ease-in-out 0s 2; }
      `}</style>
    </div>
  );
};

export default AdminLoginView;