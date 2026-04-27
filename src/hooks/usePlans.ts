import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { PricingPlan } from '../../types'

// Interface completa do plano (database)
export interface Plan {
  id: string;
  name: string;
  description: string | null;
  card_eyebrow: string | null;
  price_caption: string | null;
  footer_caption: string | null;
  show_footer_card: boolean;
  monthly_price: number;
  yearly_price: number;
  features: string[];
  display_features: string[];
  is_popular: boolean;
  button_text: string;
  comparison: Record<string, string | boolean>;
  max_ads: number | null;
  ad_duration_days: number | null;
  expired_deletion_days: number | null;
  lead_contact_limit_days: number | null;
  lead_contact_limit_days_monthly: number | null;
  lead_contact_limit_days_yearly: number | null;
  plan_validity_days_monthly: number | null;
  plan_validity_days_yearly: number | null;
  category_highlights_count: number;
  category_highlight_days: number | null;
  home_highlight_count: number;
  home_highlight_days: number | null;
  has_verification_badge: boolean;
  has_seller_store: boolean;
  has_email_marketing: boolean;
  social_campaigns_per_month: number | null;
  radar_max_alerts: number;
  radar_has_radius: boolean;
  radar_has_keywords: boolean;
  radar_has_price_filter: boolean;
  notes: string | null;
  position: number;
  is_active: boolean;
  show_in_public_pricing: boolean;
  is_default_signup_plan: boolean;
  is_downgrade_plan: boolean;
  created_at: string;
  updated_at: string;
}

export interface UpdatePlanData {
  name?: string;
  description?: string;
  card_eyebrow?: string;
  price_caption?: string;
  footer_caption?: string;
  show_footer_card?: boolean;
  monthly_price?: number;
  yearly_price?: number;
  features?: string[];
  display_features?: string[];
  is_popular?: boolean;
  button_text?: string;
  comparison?: Record<string, string | boolean>;
  max_ads?: number | null;
  ad_duration_days?: number | null;
  expired_deletion_days?: number | null;
  lead_contact_limit_days?: number | null;
  lead_contact_limit_days_monthly?: number | null;
  lead_contact_limit_days_yearly?: number | null;
  plan_validity_days_monthly?: number | null;
  plan_validity_days_yearly?: number | null;
  category_highlights_count?: number;
  category_highlight_days?: number | null;
  home_highlight_count?: number;
  home_highlight_days?: number | null;
  has_verification_badge?: boolean;
  has_seller_store?: boolean;
  has_email_marketing?: boolean;
  social_campaigns_per_month?: number | null;
  radar_max_alerts?: number;
  radar_has_radius?: boolean;
  radar_has_keywords?: boolean;
  radar_has_price_filter?: boolean;
  notes?: string;
  position?: number;
  is_active?: boolean;
  show_in_public_pricing?: boolean;
  is_default_signup_plan?: boolean;
  is_downgrade_plan?: boolean;
}

export const usePlans = () => {
  const [plans, setPlans] = useState<PricingPlan[]>([])
  const [plansRaw, setPlansRaw] = useState<Plan[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchPlans = async () => {
    setIsLoading(true)
    const { data, error: fetchError } = await supabase
      .from('plans')
      .select('*')
      .order('position', { ascending: true })

    if (fetchError) {
      setError(fetchError.message)
      setPlans([])
      setPlansRaw([])
    } else {
      // Raw data (para admin)
      setPlansRaw(data || [])
      
      // Mapped data (para frontend público)
      const mapped: PricingPlan[] = (data || [])
        .filter((plan: any) => plan.is_active && plan.show_in_public_pricing !== false)
        .map((plan: any) => ({
          id: plan.id,
          name: plan.name,
          description: plan.description,
          monthlyPrice: parseFloat(plan.monthly_price ?? 0),
          yearlyPrice: parseFloat(plan.yearly_price ?? 0),
          features: plan.features || [],
          isPopular: !!plan.is_popular,
          buttonText: plan.button_text || 'Escolher Plano',
          comparison: plan.comparison || {}
        }))
      setPlans(mapped)
    }
    setIsLoading(false)
  }

  const createPlan = async (planData: UpdatePlanData): Promise<{ error: string | null; data: Plan | null }> => {
    try {
      // Encontrar maior position atual
      const maxPosition = plansRaw.length > 0 ? Math.max(...plansRaw.map(p => p.position)) : 0;
      const hasDefaultSignupPlan = plansRaw.some((plan) => plan.is_default_signup_plan);

      if (!planData.is_default_signup_plan && !hasDefaultSignupPlan) {
        return {
          error: 'Defina um plano padrao no cadastro antes de salvar.',
          data: null,
        };
      }

      if (planData.is_default_signup_plan) {
        const { error: resetDefaultError } = await supabase
          .from('plans')
          .update({ is_default_signup_plan: false })
          .eq('is_default_signup_plan', true);

        if (resetDefaultError) {
          console.error('Erro ao limpar plano padrão anterior:', resetDefaultError);
          return { error: resetDefaultError.message, data: null };
        }
      }

      if (planData.is_downgrade_plan) {
        const { error: resetDowngradeError } = await supabase
          .from('plans')
          .update({ is_downgrade_plan: false })
          .eq('is_downgrade_plan', true);

        if (resetDowngradeError) {
          console.error('Erro ao limpar plano de downgrade anterior:', resetDowngradeError);
          return { error: resetDowngradeError.message, data: null };
        }
      }

      const { data, error: createError } = await supabase
        .from('plans')
        .insert({
          ...planData,
          show_in_public_pricing:
            planData.is_downgrade_plan ? false : planData.show_in_public_pricing ?? true,
          position: planData.position ?? maxPosition + 1,
        })
        .select()
        .single();

      if (createError) {
        console.error('Erro ao criar plano:', createError);
        return { error: createError.message, data: null };
      }

      // Atualizar lista
      await fetchPlans();

      return { error: null, data };
    } catch (err) {
      console.error('Erro inesperado ao criar plano:', err);
      return { error: 'Erro ao criar plano', data: null };
    }
  };

  const updatePlan = async (id: string, updates: UpdatePlanData): Promise<{ error: string | null; data: Plan | null }> => {
    try {
      const currentPlan = plansRaw.find((plan) => plan.id === id);
      const otherDefaultSignupPlans = plansRaw.filter((plan) => plan.id !== id && plan.is_default_signup_plan);

      if (
        currentPlan?.is_default_signup_plan &&
        updates.is_default_signup_plan === false &&
        otherDefaultSignupPlans.length === 0
      ) {
        return {
          error: 'Precisa existir ao menos um plano padrao no cadastro.',
          data: null,
        };
      }

      if (updates.is_default_signup_plan) {
        const { error: resetDefaultError } = await supabase
          .from('plans')
          .update({ is_default_signup_plan: false })
          .neq('id', id)
          .eq('is_default_signup_plan', true);

        if (resetDefaultError) {
          console.error('Erro ao limpar plano padrão anterior:', resetDefaultError);
          return { error: resetDefaultError.message, data: null };
        }
      }

      if (updates.is_downgrade_plan) {
        const { error: resetDowngradeError } = await supabase
          .from('plans')
          .update({ is_downgrade_plan: false })
          .neq('id', id)
          .eq('is_downgrade_plan', true);

        if (resetDowngradeError) {
          console.error('Erro ao limpar plano de downgrade anterior:', resetDowngradeError);
          return { error: resetDowngradeError.message, data: null };
        }
      }

      const { data, error: updateError } = await supabase
        .from('plans')
        .update({
          ...updates,
          show_in_public_pricing:
            updates.is_downgrade_plan ? false : updates.show_in_public_pricing,
        })
        .eq('id', id)
        .select()
        .single();

      if (updateError) {
        console.error('Erro ao atualizar plano:', updateError);
        return { error: updateError.message, data: null };
      }

      // Atualizar lista
      await fetchPlans();

      return { error: null, data };
    } catch (err) {
      console.error('Erro inesperado ao atualizar plano:', err);
      return { error: 'Erro ao atualizar plano', data: null };
    }
  };

  const deletePlan = async (id: string): Promise<{ error: string | null }> => {
    try {
      const currentPlan = plansRaw.find((plan) => plan.id === id);
      const otherDefaultSignupPlans = plansRaw.filter((plan) => plan.id !== id && plan.is_default_signup_plan);

      if (currentPlan?.is_default_signup_plan && otherDefaultSignupPlans.length === 0) {
        return { error: 'Nao e possivel excluir o unico plano padrao do cadastro.' };
      }

      const { error: deleteError } = await supabase
        .from('plans')
        .delete()
        .eq('id', id);

      if (deleteError) {
        console.error('Erro ao deletar plano:', deleteError);
        return { error: deleteError.message };
      }

      // Atualizar lista
      await fetchPlans();

      return { error: null };
    } catch (err) {
      console.error('Erro inesperado ao deletar plano:', err);
      return { error: 'Erro ao deletar plano' };
    }
  };

  useEffect(() => {
    fetchPlans()
  }, [])

  return { 
    plans, 
    plansRaw,
    isLoading, 
    error,
    fetchPlans,
    createPlan,
    updatePlan,
    deletePlan
  }
}
