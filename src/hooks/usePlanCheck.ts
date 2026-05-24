import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import { useUserAds } from './useAds'
import { toast } from 'sonner'
import { getEffectiveLeadContactLimitDays, getSubscriptionUsageWindow } from '../utils/subscriptionUsageWindow'

type SubscriptionRow = {
  id: string
  status: 'active' | 'trialing' | 'past_due' | 'canceled' | 'cancelled' | 'expired'
  current_period_start: string
  current_period_end: string
  cancel_at_period_end: boolean
  trial_end_date: string | null
  source?: string | null
  promotion_code_id?: string | null
  plans: Record<string, any> | null
}

type HandleActionOptions = {
  adCreatedAt?: string
  onUpgrade?: () => void
}

export const usePlanCheck = () => {
  const { user } = useAuth()
  const { ads, isLoading: adsLoading } = useUserAds()
  const [subscription, setSubscription] = useState<SubscriptionRow | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const fallbackPlan = useMemo(() => ({
    name: 'Start Agro',
    max_ads: 2,
    lead_contact_limit_days: 14,
    lead_contact_limit_days_monthly: 14,
    lead_contact_limit_days_yearly: 14,
    has_verification_badge: false,
    has_seller_store: false,
    has_email_marketing: false,
    has_commercial_intelligence: false,
    commercial_intelligence_requests_per_month: 0,
  }), [])

  useEffect(() => {
    const fetchSubscription = async () => {
      if (!user?.id) {
        setSubscription(null)
        setIsLoading(false)
        return
      }

      setIsLoading(true)
      try {
        await supabase.rpc('ensure_user_current_subscription', {
          p_user_id: user.id
        })

        const { data, error } = await supabase
          .from('user_subscriptions')
          .select('id,status,current_period_start,current_period_end,cancel_at_period_end,trial_end_date,source,promotion_code_id, plans (id,name,max_ads,lead_contact_limit_days,lead_contact_limit_days_monthly,lead_contact_limit_days_yearly,has_verification_badge,has_seller_store,has_email_marketing,has_commercial_intelligence,commercial_intelligence_requests_per_month)')
          .eq('user_id', user.id)
          .eq('status', 'active')
          .gte('current_period_end', new Date().toISOString())
          .order('current_period_end', { ascending: false })
          .limit(1)
          .maybeSingle()
        if (error || !data) {
          setSubscription(null)
        } else {
          setSubscription((data as SubscriptionRow) || null)
        }
      } catch {
        setSubscription(null)
      } finally {
        setIsLoading(false)
      }
    }

    fetchSubscription()
  }, [user?.id])

  const plan = (subscription?.plans || fallbackPlan) as Record<string, any>
  const planName = plan?.name || 'Start Agro'
  const usageWindow = useMemo(() => {
    if (!subscription) return null
    return getSubscriptionUsageWindow(subscription.current_period_start, subscription.current_period_end)
  }, [subscription?.current_period_start, subscription?.current_period_end])

  const canAddAd = useMemo(() => {
    const maxAds = plan?.max_ads
    if (maxAds === null || maxAds === undefined) return true
    const activeAdsCount = (ads || []).filter((ad) => ['ACTIVE', 'active'].includes(String(ad?.status || ''))).length
    return activeAdsCount < maxAds
  }, [ads, plan?.max_ads])

  const hasFeature = (featureName: string) => {
    if (!plan) return false
    return plan?.[featureName] === true
  }

  const canViewLead = (adCreatedAt: string) => {
    const limit = getEffectiveLeadContactLimitDays(plan, !!usageWindow?.isAnnualContract, {
      isPromotion: subscription?.source === 'promotion' || Boolean(subscription?.promotion_code_id),
      periodStartIso: subscription?.current_period_start,
      periodEndIso: subscription?.current_period_end,
    })
    if (!limit) return true
    const created = new Date(adCreatedAt)
    const now = new Date()
    const diffDays = Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24))
    return diffDays <= limit
  }

  const handleAction = (feature: string, callback: () => void, options?: HandleActionOptions) => {
    let allowed = false

    if (feature === 'can_add_ad') {
      allowed = canAddAd
      if (!allowed) {
        const maxAds = plan?.max_ads ?? 0
        toast.error(`Seu plano ${planName} permite apenas ${maxAds} anuncios ativos.`, {
          description: 'Desative um anuncio ativo ou faca upgrade para liberar mais vagas.'
        })
      }
    } else if (feature === 'view_lead') {
      allowed = !!options?.adCreatedAt && canViewLead(options.adCreatedAt)
      if (!allowed) {
        toast.error('Acesso ao lead expirado.', {
          description: 'Faca upgrade para ampliar o prazo de contato.'
        })
      }
    } else {
      allowed = hasFeature(feature)
      if (!allowed) {
        toast.error(`Recurso indisponivel no plano ${planName}.`, {
          description: 'Faca upgrade para desbloquear.'
        })
      }
    }

    if (allowed) {
      callback()
      return
    }

    if (options?.onUpgrade) {
      options.onUpgrade()
    }
  }

  return {
    subscription,
    plan,
    planName,
    isLoading: isLoading || adsLoading,
    canAddAd,
    hasFeature,
    canViewLead,
    handleAction
  }
}
