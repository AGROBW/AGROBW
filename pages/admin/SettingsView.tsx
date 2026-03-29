import React, { useState } from 'react';
import { CreditCard, FileText, Globe, Image, Mail, MessageCircle, Plug, Scale, Settings, Shield, TrendingUp } from 'lucide-react';
import { SMTPConfigPanel } from '../../components/SMTPConfigPanel';
import AboutPageManagement from './AboutPageManagement';
import BannersManagement from './BannersManagement';
import ContactPageManagement from './ContactPageManagement';
import FiscalSettingsManagement from './FiscalSettingsManagement';
import IntegrationsManagement from './IntegrationsManagement';
import MarketQuotesManagement from './MarketQuotesManagement';
import PagesManagement from './PagesManagement';
import PlansManagement from './PlansManagement';
import PrivacyPageManagement from './PrivacyPageManagement';
import TermsPageManagement from './TermsPageManagement';

type SettingsTab =
  | 'banners'
  | 'pages'
  | 'about'
  | 'terms'
  | 'privacy'
  | 'contact'
  | 'integrations'
  | 'plans'
  | 'market'
  | 'fiscal'
  | 'email';

const SettingsView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<SettingsTab>('banners');

  const tabs = [
    { id: 'banners' as SettingsTab, label: 'Banners Home', icon: Image },
    { id: 'pages' as SettingsTab, label: 'Páginas', icon: FileText },
    { id: 'about' as SettingsTab, label: 'Quem Somos', icon: Globe },
    { id: 'terms' as SettingsTab, label: 'Termos de Uso', icon: Scale },
    { id: 'privacy' as SettingsTab, label: 'Privacidade', icon: Shield },
    { id: 'contact' as SettingsTab, label: 'Fale Conosco', icon: MessageCircle },
    { id: 'integrations' as SettingsTab, label: 'Integrações', icon: Plug },
    { id: 'plans' as SettingsTab, label: 'Planos', icon: CreditCard },
    { id: 'market' as SettingsTab, label: 'Cotações', icon: TrendingUp },
    { id: 'fiscal' as SettingsTab, label: 'Fiscal NFS-e', icon: FileText },
    { id: 'email' as SettingsTab, label: 'Config. E-mail', icon: Mail },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 bg-gradient-to-br from-green-500 to-green-600 rounded-xl flex items-center justify-center shadow-lg shadow-green-500/30">
          <Settings className="w-5 h-5 text-white" strokeWidth={2.5} />
        </div>
        <div>
          <h1 className="text-2xl font-black text-slate-900">Configurações do Sistema</h1>
          <p className="text-sm text-slate-500">Gerencie todas as configurações da plataforma</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-1.5 flex gap-1 overflow-x-auto">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;

          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all whitespace-nowrap ${
                isActive ? 'bg-green-500 text-white shadow-md' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <Icon className="w-4 h-4" strokeWidth={2} />
              {tab.label}
            </button>
          );
        })}
      </div>

      <div className="min-h-[500px]">
        {activeTab === 'banners' && <BannersManagement />}
        {activeTab === 'pages' && <PagesManagement />}
        {activeTab === 'about' && <AboutPageManagement />}
        {activeTab === 'terms' && <TermsPageManagement />}
        {activeTab === 'privacy' && <PrivacyPageManagement />}
        {activeTab === 'contact' && <ContactPageManagement />}
        {activeTab === 'integrations' && <IntegrationsManagement />}
        {activeTab === 'plans' && <PlansManagement />}
        {activeTab === 'market' && <MarketQuotesManagement />}
        {activeTab === 'fiscal' && <FiscalSettingsManagement />}
        {activeTab === 'email' && <SMTPConfigPanel />}
      </div>
    </div>
  );
};

export default SettingsView;
