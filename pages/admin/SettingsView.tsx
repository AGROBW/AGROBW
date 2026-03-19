import React, { useState } from 'react';
import { Image, FileText, CreditCard, Mail, Settings, Info, Globe, Scale, Shield, MessageCircle, Plug } from 'lucide-react';
import { SMTPConfigPanel } from '../../components/SMTPConfigPanel';
import BannersManagement from './BannersManagement';
import PagesManagement from './PagesManagement';
import AboutPageManagement from './AboutPageManagement';
import TermsPageManagement from './TermsPageManagement';
import PrivacyPageManagement from './PrivacyPageManagement';
import ContactPageManagement from './ContactPageManagement';
import PlansManagement from './PlansManagement';
import IntegrationsManagement from './IntegrationsManagement';
import FiscalSettingsManagement from './FiscalSettingsManagement';

type SettingsTab = 'banners' | 'pages' | 'about' | 'terms' | 'privacy' | 'contact' | 'integrations' | 'plans' | 'fiscal' | 'email';

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
    { id: 'fiscal' as SettingsTab, label: 'Fiscal NFS-e', icon: FileText },
    { id: 'email' as SettingsTab, label: 'Config. E-mail', icon: Mail }
  ];

  const PlaceholderContent = ({ title, icon: Icon }: { title: string; icon: any }) => (
    <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
      <div className="w-20 h-20 bg-gradient-to-br from-green-50 to-green-100 rounded-2xl flex items-center justify-center mx-auto mb-6">
        <Icon className="w-10 h-10 text-green-600" strokeWidth={1.5} />
      </div>
      <h3 className="text-2xl font-bold text-slate-900 mb-3">{title}</h3>
      <p className="text-slate-600 max-w-md mx-auto leading-relaxed mb-6">
        Módulo de configuração em desenvolvimento. Em breve você poderá gerenciar todas as configurações de {title.toLowerCase()} diretamente por aqui.
      </p>
      <div className="inline-flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-700 rounded-lg text-sm font-medium">
        <Info className="w-4 h-4" />
        Em Desenvolvimento
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 bg-gradient-to-br from-green-500 to-green-600 rounded-xl flex items-center justify-center shadow-lg shadow-green-500/30">
          <Settings className="w-5 h-5 text-white" strokeWidth={2.5} />
        </div>
        <div>
          <h1 className="text-2xl font-black text-slate-900">Configurações do Sistema</h1>
          <p className="text-sm text-slate-500">Gerencie todas as configurações da plataforma</p>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="bg-white rounded-xl border border-slate-200 p-1.5 flex gap-1 overflow-x-auto">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`
                flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all whitespace-nowrap
                ${isActive 
                  ? 'bg-green-500 text-white shadow-md' 
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }
              `}
            >
              <Icon className="w-4 h-4" strokeWidth={2} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div className="min-h-[500px]">
        {activeTab === 'banners' && (
          <BannersManagement />
        )}
        
        {activeTab === 'pages' && (
          <PagesManagement />
        )}
        
        {activeTab === 'about' && (
          <AboutPageManagement />
        )}
        
        {activeTab === 'terms' && (
          <TermsPageManagement />
        )}
        
        {activeTab === 'privacy' && (
          <PrivacyPageManagement />
        )}
        
        {activeTab === 'contact' && (
          <ContactPageManagement />
        )}
        
        {activeTab === 'integrations' && (
          <IntegrationsManagement />
        )}
        
        {activeTab === 'plans' && (
          <PlansManagement />
        )}

        {activeTab === 'fiscal' && (
          <FiscalSettingsManagement />
        )}
        
        {activeTab === 'email' && (
          <SMTPConfigPanel />
        )}
      </div>
    </div>
  );
};

export default SettingsView;
