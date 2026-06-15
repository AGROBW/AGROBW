import React, { useState } from 'react';
import { Megaphone, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useMarketingConsent, MarketingConsentType } from '../src/hooks/useMarketingConsent';

const CHANNELS: Array<{ type: MarketingConsentType; label: string; description: string }> = [
  {
    type: 'marketing_opt_in',
    label: 'Comunicações promocionais da BWAGRO',
    description: 'Novidades e campanhas comerciais da própria plataforma.',
  },
  {
    type: 'marketing_thirdparty_opt_in',
    label: 'Divulgações de anúncios e campanhas da plataforma',
    description: 'Divulgação de anúncios e campanhas comerciais selecionados.',
  },
];

const MarketingPreferencesCard: React.FC = () => {
  const { state, isLoading, recordDecision, revoke } = useMarketingConsent();
  const [savingType, setSavingType] = useState<MarketingConsentType | null>(null);

  const handleToggle = async (type: MarketingConsentType, nextActive: boolean) => {
    setSavingType(type);
    try {
      const result = nextActive
        ? await recordDecision(type, true, 'profile')
        : await revoke(type);
      if (result?.error) {
        toast.error('Não foi possível atualizar a preferência.');
        return;
      }
      toast.success(nextActive ? 'Preferência ativada.' : 'Preferência desativada.');
    } finally {
      setSavingType(null);
    }
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-green-100 text-green-700">
          <Megaphone className="h-5 w-5" strokeWidth={1.8} />
        </div>
        <div>
          <h4 className="text-base font-bold text-slate-900">Preferências de comunicação</h4>
          <p className="text-xs text-slate-500">
            Controle o que você recebe. Desligar revoga o consentimento; você pode reativar quando quiser.
          </p>
        </div>
      </div>

      <div className="space-y-3">
        {CHANNELS.map((channel) => {
          const active = state?.[channel.type]?.active ?? false;
          const busy = isLoading || savingType === channel.type;
          return (
            <div
              key={channel.type}
              className="flex items-center justify-between gap-4 rounded-xl border border-slate-100 bg-slate-50/70 p-4"
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-800">{channel.label}</p>
                <p className="text-xs text-slate-500">{channel.description}</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={active}
                disabled={busy}
                onClick={() => handleToggle(channel.type, !active)}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors disabled:opacity-60 ${
                  active ? 'bg-green-600' : 'bg-slate-300'
                }`}
              >
                {savingType === channel.type ? (
                  <Loader2 className="mx-auto h-3.5 w-3.5 animate-spin text-white" />
                ) : (
                  <span
                    className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                      active ? 'translate-x-5' : 'translate-x-0.5'
                    }`}
                  />
                )}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default MarketingPreferencesCard;
