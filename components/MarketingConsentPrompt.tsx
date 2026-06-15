import React, { useEffect, useMemo, useState } from 'react';
import { Megaphone, X } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '../src/contexts/AuthContext';
import { useMarketingConsent, MarketingConsentType } from '../src/hooks/useMarketingConsent';

// Trava de frequência: ao fechar no X (sem decidir), não pergunta de novo por N dias.
const SNOOZE_DAYS = 7;
const snoozeKey = (userId: string) => `bw_mktg_prompt_snoozed_until:${userId}`;

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

const isSnoozed = (userId?: string) => {
  if (!userId) return false;
  try {
    const raw = localStorage.getItem(snoozeKey(userId));
    return raw ? Date.now() < Number(raw) : false;
  } catch {
    return false;
  }
};

const snooze = (userId?: string) => {
  if (!userId) return;
  try {
    localStorage.setItem(snoozeKey(userId), String(Date.now() + SNOOZE_DAYS * 24 * 60 * 60 * 1000));
  } catch {
    /* ignore */
  }
};

const MarketingConsentPrompt: React.FC = () => {
  const { user } = useAuth();
  const location = useLocation();
  const { state, isLoading, recordDecision } = useMarketingConsent();
  const [dismissed, setDismissed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [checked, setChecked] = useState<Record<MarketingConsentType, boolean>>({
    marketing_opt_in: false,
    marketing_thirdparty_opt_in: false,
  });

  const undecided = useMemo(
    () => (state ? CHANNELS.filter((c) => !state[c.type].decided) : []),
    [state]
  );

  const shouldShow =
    !!user &&
    !location.pathname.startsWith('/admin') &&
    !isLoading &&
    !dismissed &&
    undecided.length > 0 &&
    !isSnoozed(user?.id);

  useEffect(() => {
    // Reseta marcações ao (re)abrir
    if (shouldShow) {
      setChecked({ marketing_opt_in: false, marketing_thirdparty_opt_in: false });
    }
  }, [shouldShow]);

  if (!shouldShow) return null;

  const handleClose = () => {
    snooze(user?.id);
    setDismissed(true);
  };

  const persist = async (decisions: Array<{ type: MarketingConsentType; accepted: boolean }>) => {
    setSaving(true);
    try {
      for (const d of decisions) {
        const result = await recordDecision(d.type, d.accepted, 'marketing_prompt');
        if (result?.error) {
          // Não fecha o modal: o estado fica consistente e o usuário pode tentar de novo.
          toast.error('Não foi possível salvar suas preferências agora. Tente novamente.');
          return;
        }
      }
      setDismissed(true);
      toast.success('Preferências de comunicação salvas.');
    } finally {
      setSaving(false);
    }
  };

  const handleSavePreferences = () =>
    persist(undecided.map((c) => ({ type: c.type, accepted: checked[c.type] })));

  const handleDeclineAll = () =>
    persist(undecided.map((c) => ({ type: c.type, accepted: false })));

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 p-4 backdrop-blur-sm sm:items-center">
      <div className="w-full max-w-lg overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-green-100 text-green-700">
              <Megaphone className="h-5 w-5" strokeWidth={1.8} />
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-900">Preferências de comunicação</h2>
              <p className="text-xs text-slate-500">Você escolhe o que deseja receber. Pode mudar quando quiser.</p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="rounded-full p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
            aria-label="Fechar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-3 p-5">
          {undecided.map((channel) => (
            <label
              key={channel.type}
              className="flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 p-4 transition-colors hover:bg-slate-50"
            >
              <input
                type="checkbox"
                checked={checked[channel.type]}
                onChange={(e) => setChecked((prev) => ({ ...prev, [channel.type]: e.target.checked }))}
                className="mt-0.5 h-5 w-5 rounded border-slate-300 accent-green-600"
              />
              <span>
                <span className="block text-sm font-semibold text-slate-800">{channel.label}</span>
                <span className="block text-xs text-slate-500">{channel.description}</span>
              </span>
            </label>
          ))}

          <p className="text-xs text-slate-400">
            Você pode cancelar o recebimento a qualquer momento em Minha Conta &gt; Perfil &gt; Segurança, ou pelo link de
            descadastro nos e-mails.
          </p>
        </div>

        <div className="flex flex-col gap-2 border-t border-slate-100 p-5 sm:flex-row sm:justify-end">
          <button
            onClick={handleDeclineAll}
            disabled={saving}
            className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-50"
          >
            Agora não
          </button>
          <button
            onClick={handleSavePreferences}
            disabled={saving}
            className="rounded-xl bg-green-600 px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-green-700 disabled:opacity-50"
          >
            Salvar preferências
          </button>
        </div>
      </div>
    </div>
  );
};

export default MarketingConsentPrompt;
