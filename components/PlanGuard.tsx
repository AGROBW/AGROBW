import React from 'react'
import { Link } from 'react-router-dom'
import { usePlanCheck } from '../src/hooks/usePlanCheck'

type PlanGuardProps = {
  requiredFeature: string
  adCreatedAt?: string
  children: React.ReactNode
}

const PlanGuard: React.FC<PlanGuardProps> = ({ requiredFeature, adCreatedAt, children }) => {
  const { isLoading, hasFeature, canAddAd, canViewLead, planName } = usePlanCheck()

  if (isLoading) return null

  const allowed = requiredFeature === 'can_add_ad'
    ? canAddAd
    : requiredFeature === 'view_lead'
      ? !!adCreatedAt && canViewLead(adCreatedAt)
      : hasFeature(requiredFeature)

  if (allowed) return <>{children}</>

  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-6 text-center">
      <h3 className="text-sm font-bold text-slate-900">Upgrade Necessário</h3>
      <p className="text-xs text-slate-500 mt-2">
        Seu plano {planName} não inclui este recurso.
      </p>
      <Link
        to="/planos"
        className="inline-flex items-center justify-center mt-4 h-9 px-4 rounded-xl bg-green-700 text-white text-xs font-bold hover:bg-green-800"
      >
        Ver Planos
      </Link>
    </div>
  )
}

export default PlanGuard