
import React from 'react';
import { useNavigate, Routes, Route, Link, useLocation } from 'react-router-dom';
import { CreditCard, FileText, Image, LayoutGrid, LogOut, Mail, ShieldCheck, Users } from 'lucide-react';
import { useAuth } from '../src/contexts/AuthContext';
import { SMTPConfigPanel } from '../components/SMTPConfigPanel';
import { useAllAds } from '../src/hooks/useAds';

const Icons = {
  Dashboard: () => <LayoutGrid className="w-[18px] h-[18px]" strokeWidth={1.5} />,
  Banners: () => <Image className="w-[18px] h-[18px]" strokeWidth={1.5} />,
  Pages: () => <FileText className="w-[18px] h-[18px]" strokeWidth={1.5} />,
  Plans: () => <CreditCard className="w-[18px] h-[18px]" strokeWidth={1.5} />,
  Moderation: () => <ShieldCheck className="w-[18px] h-[18px]" strokeWidth={1.5} />,
  Users: () => <Users className="w-[18px] h-[18px]" strokeWidth={1.5} />,
  Email: () => <Mail className="w-[18px] h-[18px]" strokeWidth={1.5} />,
  Logout: () => <LogOut className="w-[18px] h-[18px]" strokeWidth={1.5} />,
};

const AdminDashboard: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, signOut } = useAuth();
  const { ads: allAds, isLoading: adsLoading } = useAllAds();
  const adminName = user?.name?.trim() || 'Admin';
  const adminInitials = adminName.slice(0, 2).toUpperCase();

  const handleLogout = async () => {
    await signOut();
    navigate('/admin/login');
  };

  const menuItems = [
    { label: 'Dashboard', path: '/admin', icon: <Icons.Dashboard /> },
    { label: 'Banners Home', path: '/admin/banners', icon: <Icons.Banners /> },
    { label: 'Páginas', path: '/admin/pages', icon: <Icons.Pages /> },
    { label: 'Planos', path: '/admin/plans', icon: <Icons.Plans /> },
    { label: 'Moderação', path: '/admin/ads', icon: <Icons.Moderation /> },
    { label: 'Usuários', path: '/admin/users', icon: <Icons.Users /> },
    { label: 'Config. E-mail', path: '/admin/email', icon: <Icons.Email /> },
  ];

  const StatTile = ({ label, value, trend, icon }: any) => (
    <div className="bg-white p-5 rounded-xl border border-slate-100 flex items-center gap-4">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center bg-green-700/10 text-green-700`}>
        {icon}
      </div>
      <div>
        <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest leading-none mb-1.5">{label}</p>
        <div className="flex items-baseline gap-2">
          <h3 className="text-2xl font-bold text-gray-900 leading-none">{value}</h3>
          <span className={`text-[10px] font-bold ${trend.startsWith('+') ? 'text-green-600' : 'text-red-500'}`}>{trend}</span>
        </div>
      </div>
    </div>
  );

  const StatsView = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatTile label="Usuários" value="1.240" trend="+12%" icon={<Icons.Users />} />
        <StatTile label="Anúncios Ativos" value="342" trend="+5%" icon={<Icons.Moderation />} />
        <StatTile label="Pendentes" value="12" trend="-2" icon={<Icons.Moderation />} />
        <StatTile label="Cliques/Dia" value="8.4k" trend="+24%" icon={<Icons.Dashboard />} />
      </div>
      
      <div className="bg-white rounded-xl p-6 border border-slate-100">
        <h3 className="text-sm font-bold text-gray-900 mb-6">Atividade Recente do Sistema</h3>
        <div className="space-y-4">
          {[1,2,3].map(i => (
            <div key={i} className="flex items-center justify-between py-3 border-b border-slate-50 last:border-0">
              <div className="flex items-center gap-4">
                <div className="w-8 h-8 bg-slate-50 rounded-lg flex items-center justify-center text-xs">A</div>
                <div>
                  <p className="text-xs font-bold text-gray-900">Novo anúncio aguardando revisão</p>
                  <p className="text-[10px] text-gray-400">Há {i * 5} minutos • Ref: #AD{340 + i}</p>
                </div>
              </div>
              <button className="text-[10px] font-bold text-green-700 uppercase tracking-wider">Analisar</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const PlaceholderView = ({ title }: { title: string }) => (
    <div className="bg-white rounded-xl p-12 border border-slate-100 text-center">
      <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center mx-auto mb-4 text-slate-300">
        <Icons.Dashboard />
      </div>
      <h3 className="text-lg font-bold text-gray-900 mb-2">{title}</h3>
      <p className="text-sm text-gray-500 max-w-xs mx-auto">Módulo administrativo em desenvolvimento. Aqui você poderá gerenciar as configurações de {title.toLowerCase()}.</p>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-[#f8fafc] font-sans">
      {/* Admin Sidebar SaaS Style */}
      <aside className="w-64 bg-slate-900 text-slate-400 sticky top-0 h-screen flex flex-col p-6">
        <div className="flex items-center gap-3 mb-10 text-white">
          <div className="w-8 h-8 bg-green-500 rounded flex items-center justify-center font-bold text-slate-900">T</div>
          <span className="font-bold tracking-tight">TerraAdmin</span>
        </div>

        <nav className="flex-grow space-y-1">
          {menuItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center gap-3 px-4 py-2 rounded-lg text-sm transition-all ${
                location.pathname === item.path ? 'bg-white/10 text-white font-semibold' : 'hover:text-white hover:bg-white/5'
              }`}
            >
              {item.icon}
              {item.label}
            </Link>
          ))}
        </nav>

        <button 
          onClick={handleLogout}
          className="mt-auto flex items-center gap-3 px-4 py-2.5 text-slate-500 font-semibold text-xs hover:text-red-400 hover:bg-red-400/5 rounded-lg transition-all"
        >
          <Icons.Logout /> Sair
        </button>
      </aside>

      <main className="flex-grow p-8 lg:p-10 max-w-7xl mx-auto w-full">
        <header className="flex justify-between items-center mb-10">
          <div>
            <h2 className="text-xl font-bold text-gray-900 leading-tight">Console de Administração</h2>
            <p className="text-xs text-gray-500">Logado como: <span className="font-bold text-slate-700">{adminName}</span></p>
          </div>
          <div className="flex items-center gap-4">
            <div className="w-8 h-8 bg-slate-200 rounded-lg flex items-center justify-center text-xs font-bold text-slate-500">
              {adminInitials}
            </div>
          </div>
        </header>

        <Routes>
          <Route path="/" element={<StatsView />} />
          <Route path="/banners" element={<PlaceholderView title="Banners Home" />} />
          <Route path="/pages" element={<PlaceholderView title="Páginas" />} />
          <Route path="/plans" element={<PlaceholderView title="Planos de Assinatura" />} />
          <Route path="/users" element={<PlaceholderView title="Gestão de Usuários" />} />
          <Route path="/ads" element={
            <div className="bg-white rounded-xl border border-slate-100 overflow-hidden">
               <div className="p-6 border-b border-slate-100">
                  <h3 className="text-sm font-bold text-gray-900">Moderação de Anúncios</h3>
               </div>
               <table className="w-full text-left">
                 <thead className="bg-slate-50/50 border-b border-slate-100">
                    <tr>
                      <th className="py-4 px-6 text-[10px] font-bold text-gray-400 uppercase">Item</th>
                      <th className="py-4 px-6 text-[10px] font-bold text-gray-400 uppercase">Status</th>
                      <th className="py-4 px-6 text-[10px] font-bold text-gray-400 uppercase text-right">Ação</th>
                    </tr>
                 </thead>
                 <tbody className="divide-y divide-slate-50">
                    {adsLoading ? (
                      <tr>
                        <td colSpan={3} className="py-8 px-6 text-center text-sm text-slate-500">Carregando anúncios...</td>
                      </tr>
                    ) : allAds.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="py-8 px-6 text-center text-sm text-slate-500">Nenhum anúncio encontrado.</td>
                      </tr>
                    ) : (
                      allAds.map(ad => (
                        <tr key={ad.id} className="hover:bg-slate-50/30">
                          <td className="py-4 px-6">
                             <p className="text-xs font-bold text-gray-900">{ad.title}</p>
                          </td>
                          <td className="py-4 px-6">
                             <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-green-50 text-green-700 uppercase">{ad.status}</span>
                          </td>
                          <td className="py-4 px-6 text-right">
                             <button className="text-[10px] font-bold text-slate-400 hover:text-gray-900 transition-colors">GERENCIAR</button>
                          </td>
                        </tr>
                      ))
                    )}
                 </tbody>
               </table>
            </div>
          } />
          <Route path="/email" element={<SMTPConfigPanel />} />
          <Route path="*" element={<StatsView />} />
        </Routes>
      </main>
    </div>
  );
};

export default AdminDashboard;
