import React, { useEffect, useId, useRef, useState } from 'react';
import { ArrowRight, Sparkles, X } from 'lucide-react';
import { useAuth } from '../../src/contexts/AuthContext';
import { useContextualUpsell } from '../../src/hooks/useContextualUpsell';
import type { ContextualUpsellContext } from '../../src/lib/contextualUpsell';
import {
  readContextualUpsellCheckoutIntent,
  recordContextualUpsellCheckoutStarted,
  saveContextualUpsellCheckoutIntent,
} from '../../src/lib/contextualUpsellIntent';
import RecommendedUpgradeModal from './RecommendedUpgradeModal';

interface ContextualUpsellCardProps {
  context: ContextualUpsellContext;
  adsLimit?: number | null;
  resourceType?: 'announcement' | 'lead' | 'radar';
  resourceId?: string;
  usagePercent?: number;
  className?: string;
}

const ContextualUpsellCard: React.FC<ContextualUpsellCardProps> = (props) => {
  const { user } = useAuth();
  const { recommendation, currentPlan, runtime, track } = useContextualUpsell(props);
  const [dismissed, setDismissed] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const impressionTracked = useRef<string | null>(null);
  const titleId = useId();

  useEffect(() => {
    if (!recommendation || (props.usagePercent !== undefined && props.usagePercent < runtime.usage_threshold_percent)) return;
    const key = `${recommendation.context}:${recommendation.targetPlan?.id || recommendation.offerKind}`;
    if (impressionTracked.current === key) return;
    impressionTracked.current = key;
    void track('impression');
  }, [props.usagePercent, recommendation, runtime.usage_threshold_percent, track]);

  if (
    !recommendation ||
    dismissed ||
    (props.usagePercent !== undefined && props.usagePercent < runtime.usage_threshold_percent)
  ) return null;

  const handleAction = () => {
    void track('click');
    if (recommendation.targetPlan) {
      saveContextualUpsellCheckoutIntent(recommendation.context, recommendation.targetPlan.id);
    }
    setModalOpen(true);
  };

  return (
    <>
      <section aria-labelledby={titleId} className={`relative overflow-hidden rounded-3xl border border-emerald-200 bg-[linear-gradient(135deg,#ecfdf5_0%,#ffffff_58%,#f0fdfa_100%)] p-5 shadow-sm ${props.className || ''}`}>
        <button
          type="button"
          onClick={() => { setDismissed(true); void track('dismiss'); }}
          className="absolute right-4 top-4 rounded-full p-1.5 text-slate-400 transition hover:bg-white hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2"
          aria-label="Dispensar recomendacao"
        >
          <X className="h-4 w-4" />
        </button>
        <div className="flex flex-col gap-4 pr-8 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-lg shadow-emerald-200">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-700">{recommendation.eyebrow}</p>
              <h3 id={titleId} className="mt-1 text-base font-black text-slate-950">{recommendation.title}</h3>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">{recommendation.description}</p>
            </div>
          </div>
          <button type="button" onClick={handleAction} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white transition hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2">
            {recommendation.actionLabel}<ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </section>

      <RecommendedUpgradeModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        currentPlan={currentPlan}
        nextPlan={recommendation.targetPlan}
        userId={user?.id}
        onCheckoutStarted={async () => {
          const intent = readContextualUpsellCheckoutIntent();
          if (intent) await recordContextualUpsellCheckoutStarted(intent);
        }}
      />
    </>
  );
};

export default ContextualUpsellCard;
