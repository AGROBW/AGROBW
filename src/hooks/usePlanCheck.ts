import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import { useUserAds } from './useAds'
import { toast } from 'sonner'

type SubscriptionRow = {
  id: string
  status: 'active' | 'trialing' | 'past_due' | 'canceled' | 'expired'
  current_period_start: string
  current_period_end: string
  cancel_at_period_end: boolean
  trial_end_date: string | null
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
    has_verification_badge: false,
    has_seller_store: false,
    has_email_marketing: false
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
        const { data, error } = await supabase
          .from('user_subscriptions')
          .select('id,status,current_period_start,current_period_end,cancel_at_period_end,trial_end_date, plans (id,name,max_ads,lead_contact_limit_days,has_verification_badge,has_seller_store,has_email_marketing)')
          .eq('user_id', user.id)
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

  const canAddAd = useMemo(() => {
    const maxAds = plan?.max_ads
    if (maxAds === null || maxAds === undefined) return true
    return (ads?.length || 0) < maxAds
  }, [ads?.length, plan?.max_ads])

  const hasFeature = (featureName: string) => {
    if (!plan) return false
    return plan?.[featureName] === true
  }

  const canViewLead = (adCreatedAt: string) => {
    const limit = plan?.lead_contact_limit_days
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
        toast.error(`Seu plano ${planName} permite apenas ${maxAds} anúncios.`, {
          description: 'Faça upgrade para postar mais!'
        })
      }
    } else if (feature === 'view_lead') {
      allowed = !!options?.adCreatedAt && canViewLead(options.adCreatedAt)
      if (!allowed) {
        toast.error('Acesso ao lead expirado.', {
          description: 'Faça upgrade para ampliar o prazo de contato.'
        })
      }
    } else {
      allowed = hasFeature(feature)
      if (!allowed) {
        toast.error(`Recurso indisponível no plano ${planName}.`, {
          description: 'Faça upgrade para desbloquear.'
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