import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { PricingPlan } from '../../types'

export const usePlans = () => {
  const [plans, setPlans] = useState<PricingPlan[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchPlans = async () => {
      setIsLoading(true)
      const { data, error } = await supabase
        .from('plans')
        .select('*')
        .order('position', { ascending: true })

      if (error) {
        setError(error.message)
        setPlans([])
      } else {
        const mapped: PricingPlan[] = (data || []).map((plan: any) => ({
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

    fetchPlans()
  }, [])

  return { plans, isLoading, error }
}