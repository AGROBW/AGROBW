import { supabase } from './supabaseClient';
import type { ContextualUpsellContext } from './contextualUpsell';

const STORAGE_KEY = 'bwagro:contextual-upsell-checkout-intent';
const INTENT_TTL_MS = 30 * 60 * 1000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface ContextualUpsellCheckoutIntent {
  context: ContextualUpsellContext;
  targetPlanId: string;
  createdAt: number;
}

export const saveContextualUpsellCheckoutIntent = (
  context: ContextualUpsellContext,
  targetPlanId: string,
) => {
  try {
    const intent: ContextualUpsellCheckoutIntent = { context, targetPlanId, createdAt: Date.now() };
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(intent));
  } catch {
    // A recomendacao continua funcional mesmo com armazenamento indisponivel.
  }
};

export const clearContextualUpsellCheckoutIntent = () => {
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Sem acao necessaria.
  }
};

export const readContextualUpsellCheckoutIntent = (): ContextualUpsellCheckoutIntent | null => {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ContextualUpsellCheckoutIntent>;
    const validContext = parsed.context === 'ad_limit' || parsed.context === 'lead_locked';
    const validPlanId = typeof parsed.targetPlanId === 'string' && UUID_PATTERN.test(parsed.targetPlanId);
    const fresh = typeof parsed.createdAt === 'number' && Date.now() - parsed.createdAt <= INTENT_TTL_MS;
    if (!validContext || !validPlanId || !fresh) {
      clearContextualUpsellCheckoutIntent();
      return null;
    }
    return parsed as ContextualUpsellCheckoutIntent;
  } catch {
    clearContextualUpsellCheckoutIntent();
    return null;
  }
};

export const recordContextualUpsellCheckoutStarted = async (
  intent: ContextualUpsellCheckoutIntent,
) => {
  const { data, error } = await supabase.rpc('record_my_contextual_upsell_event', {
    p_context: intent.context,
    p_event_type: 'checkout_started',
    p_offer_kind: 'plan',
    p_target_plan_id: intent.targetPlanId,
    p_resource_type: null,
    p_resource_id: null,
    p_source_path: window.location.pathname.slice(0, 200),
  });
  if (error) return false;
  const row = Array.isArray(data) ? data[0] : data;
  if (row?.accepted) clearContextualUpsellCheckoutIntent();
  return Boolean(row?.accepted);
};
