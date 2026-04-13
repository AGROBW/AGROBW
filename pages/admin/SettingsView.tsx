import React, { useState } from 'react';
import {
  BellRing,
  CreditCard,
  FileText,
  Globe,
  Image,
  Mail,
  MessageCircle,
  Plug,
  Scale,
  Settings,
  Shield,
  TrendingUp,
} from 'lucide-react';
import { SMTPConfigPanel } from '../../components/SMTPConfigPanel';
import AboutPageManagement from './AboutPageManagement';
import BannersManagement from './BannersManagement';
import ContactPageManagement from './ContactPageManagement';
import FiscalSettingsManagement from './FiscalSettingsManagement';
import GrowthConversionSettingsManagement from './GrowthConversionSettingsManagement';
import IntegrationsManagement from './IntegrationsManagement';
import MarketQuotesManagement from './MarketQuotesManagement';
import PagesManagement from './PagesManagement';
import ContactNotificationEmailManagement from './ContactNotificationEmailManagement';
import PlanAlertEmailManagement from './PlanAlertEmailManagement';
import PlansManagement from './PlansManagement';
import PrivacyPageManagement from './PrivacyPageManagement';
import RadarMatchEmailManagement from './RadarMatchEmailManagement';
import RenewalNotificationSettingsManagement from './RenewalNotificationSettingsManagement';
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
  | 'email'
  | 'contactEmail'
  | 'radarEmail'
  | 'planAlertEmail'
  | 'conversion'
  | 'renewal';

const SettingsView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<SettingsTab>('banners');

  const tabs = [
    { id: 'banners' as SettingsTab, label: 'Banners Home', icon: Image },
    { id: 'pages' as SettingsTab, label: 'Paginas', icon: FileText },
    { id: 'about' as SettingsTab, label: 'Quem Somos', icon: Globe },
    { id: 'terms' as SettingsTab, label: 'Termos de Uso', icon: Scale },
    { id: 'privacy' as SettingsTab, label: 'Privacidade', icon: Shield },
    { id: 'contact' as SettingsTab, label: 'Fale Conosco', icon: MessageCircle },
    { id: 'integrations' as SettingsTab, label: 'Integracoes', icon: Plug },
    { id: 'plans' as SettingsTab, label: 'Planos', icon: CreditCard },
    { id: 'market' as SettingsTab, label: 'Cotacoes', icon: TrendingUp },
    { id: 'fiscal' as SettingsTab, label: 'Fiscal NFS-e', icon: FileText },
    { id: 'email' as SettingsTab, label: 'Config. E-mail', icon: Mail },
    { id: 'contactEmail' as SettingsTab, label: 'Mensagens por E-mail', icon: MessageCircle },
    { id: 'radarEmail' as SettingsTab, label: 'Radar por E-mail', icon: Mail },
    { id: 'planAlertEmail' as SettingsTab, label: 'Alertas por E-mail', icon: Mail },
    { id: 'conversion' as SettingsTab, label: 'Conversao', icon: BellRing },
    { id: 'renewal' as SettingsTab, label: 'Renovacao', icon: CreditCard },
  ];

  return (
    <div className="space-y-6">
      <div className="mb-2 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-green-500 to-green-600 shadow-lg shadow-green-500/30">
          <Settings className="h-5 w-5 text-white" strokeWidth={2.5} />
        </div>
        <div>
          <h1 className="text-2xl font-black text-slate-900">Configuracoes do Sistema</h1>
          <p className="text-sm text-slate-500">Gerencie todas as configuracoes da plataforma</p>
        </div>
      </div>

      <div className="flex gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-white p-1.5">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;

          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 whitespace-nowrap rounded-lg px-4 py-2.5 text-sm font-semibold transition-all ${
                isActive
                  ? 'bg-green-500 text-white shadow-md'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <Icon className="h-4 w-4" strokeWidth={2} />
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
        {activeTab === 'contactEmail' && <ContactNotificationEmailManagement />}
        {activeTab === 'radarEmail' && <RadarMatchEmailManagement />}
        {activeTab === 'planAlertEmail' && <PlanAlertEmailManagement />}
        {activeTab === 'conversion' && <GrowthConversionSettingsManagement />}
        {activeTab === 'renewal' && <RenewalNotificationSettingsManagement />}
      </div>
    </div>
  );
};

export default SettingsView;
