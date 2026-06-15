import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import { appError } from '../utils/appLogger';

export type MarketingConsentType = 'marketing_opt_in' | 'marketing_thirdparty_opt_in';

export interface MarketingConsentState {
  decided: boolean;
  active: boolean;
}

export type MarketingConsentMap = Record<MarketingConsentType, MarketingConsentState>;

const EMPTY_STATE: MarketingConsentMap = {
  marketing_opt_in: { decided: false, active: false },
  marketing_thirdparty_opt_in: { decided: false, active: false },
};

const getUserAgent = () => (typeof navigator !== 'undefined' ? navigator.userAgent : null);

export const useMarketingConsent = () => {
  const { user } = useAuth();
  const [state, setState] = useState<MarketingConsentMap | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user?.id) {
      setState(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const { data, error } = await supabase.rpc('get_my_marketing_consent_state');

    if (error) {
      appError('[MarketingConsent] Erro ao carregar estado', error);
      setState(null);
      setIsLoading(false);
      return;
    }

    const next: MarketingConsentMap = { ...EMPTY_STATE };
    (data as Array<{ consent_type: MarketingConsentType; decided: boolean; active: boolean }> | null)?.forEach(
      (row) => {
        if (row.consent_type in next) {
          next[row.consent_type] = { decided: !!row.decided, active: !!row.active };
        }
      }
    );

    setState(next);
    setIsLoading(false);
  }, [user?.id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const recordDecision = useCallback(
    async (
      consentType: MarketingConsentType,
      accepted: boolean,
      source: 'marketing_prompt' | 'profile' = 'marketing_prompt'
    ) => {
      const { error } = await supabase.rpc('record_my_marketing_decision', {
        p_consent_type: consentType,
        p_accepted: accepted,
        p_source: source,
        p_user_agent: getUserAgent(),
        p_metadata: {},
      });
      if (error) {
        appError('[MarketingConsent] Erro ao registrar decisão', error, { consentType, accepted });
        return { error: error.message };
      }
      await refresh();
      return { error: null };
    },
    [refresh]
  );

  const revoke = useCallback(
    async (consentType: MarketingConsentType) => {
      const { error } = await supabase.rpc('revoke_my_marketing_consent', { p_consent_type: consentType });
      if (error) {
        appError('[MarketingConsent] Erro ao revogar', error, { consentType });
        return { error: error.message };
      }
      await refresh();
      return { error: null };
    },
    [refresh]
  );

  return { state, isLoading, refresh, recordDecision, revoke };
};
