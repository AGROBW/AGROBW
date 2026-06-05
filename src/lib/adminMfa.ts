export type AuthenticatorAssuranceLevel = 'aal1' | 'aal2' | null

const PENDING_ADMIN_MFA_KEY = 'bwagro-admin-mfa-pending'
const PENDING_ADMIN_MFA_MAX_AGE_MS = 15 * 60 * 1000

export type AdminMfaFactorSummary = {
  id: string
  friendlyName: string | null
  status: string | null
}

export type AdminMfaState = {
  isLoaded: boolean
  currentLevel: AuthenticatorAssuranceLevel
  nextLevel: AuthenticatorAssuranceLevel
  verifiedTotpFactors: AdminMfaFactorSummary[]
  unverifiedTotpFactors: AdminMfaFactorSummary[]
  requiresEnrollment: boolean
  requiresChallenge: boolean
}

type PendingAdminMfaState = {
  ticket: string
  userId: string
  issuedAt: number
}

const normalizeLevel = (value: unknown): AuthenticatorAssuranceLevel => {
  if (value === 'aal1' || value === 'aal2') {
    return value
  }

  return null
}

const normalizeFactor = (factor: any): AdminMfaFactorSummary => ({
  id: String(factor?.id || ''),
  friendlyName: factor?.friendly_name || factor?.friendlyName || null,
  status: typeof factor?.status === 'string' ? factor.status : null
})

export const createEmptyAdminMfaState = (isLoaded = false): AdminMfaState => ({
  isLoaded,
  currentLevel: null,
  nextLevel: null,
  verifiedTotpFactors: [],
  unverifiedTotpFactors: [],
  requiresEnrollment: false,
  requiresChallenge: false
})

export const buildAdminMfaState = (aalData: any, factorsData: any): AdminMfaState => {
  const totpFactors = Array.isArray(factorsData?.totp) ? factorsData.totp.map(normalizeFactor) : []
  const verifiedTotpFactors = totpFactors.filter((factor) => factor.status === 'verified')
  const unverifiedTotpFactors = totpFactors.filter((factor) => factor.status !== 'verified')
  const currentLevel = normalizeLevel(aalData?.currentLevel)
  const nextLevel = normalizeLevel(aalData?.nextLevel)
  const requiresEnrollment = verifiedTotpFactors.length === 0
  const requiresChallenge = verifiedTotpFactors.length > 0 && currentLevel !== 'aal2'

  return {
    isLoaded: true,
    currentLevel,
    nextLevel,
    verifiedTotpFactors,
    unverifiedTotpFactors,
    requiresEnrollment,
    requiresChallenge
  }
}

export const toQrImageSrc = (value?: string | null) => {
  if (!value) return ''
  const trimmed = value.trim()

  if (trimmed.startsWith('data:')) {
    return trimmed
  }

  if (trimmed.startsWith('<svg')) {
    return `data:image/svg+xml;utf8,${encodeURIComponent(trimmed)}`
  }

  return trimmed
}

const hasWindow = () => typeof window !== 'undefined'

const readPendingAdminMfaState = (): PendingAdminMfaState | null => {
  if (!hasWindow()) return null

  try {
    const raw = window.sessionStorage.getItem(PENDING_ADMIN_MFA_KEY)
    if (!raw) return null

    const parsed = JSON.parse(raw) as Partial<PendingAdminMfaState>
    const ticket = String(parsed?.ticket || '').trim()
    const userId = String(parsed?.userId || '').trim()
    const issuedAt = Number(parsed?.issuedAt || 0)

    if (!ticket || !userId || !Number.isFinite(issuedAt) || issuedAt <= 0) {
      window.sessionStorage.removeItem(PENDING_ADMIN_MFA_KEY)
      return null
    }

    if (Date.now() - issuedAt > PENDING_ADMIN_MFA_MAX_AGE_MS) {
      window.sessionStorage.removeItem(PENDING_ADMIN_MFA_KEY)
      return null
    }

    return { ticket, userId, issuedAt }
  } catch {
    window.sessionStorage.removeItem(PENDING_ADMIN_MFA_KEY)
    return null
  }
}

export const storePendingAdminMfaSession = (userId?: string | null, ticket?: string | null) => {
  if (!hasWindow()) return

  const normalizedUserId = String(userId || '').trim()
  const normalizedTicket = String(ticket || '').trim()

  if (!normalizedUserId || !normalizedTicket) {
    window.sessionStorage.removeItem(PENDING_ADMIN_MFA_KEY)
    return
  }

  window.sessionStorage.setItem(
    PENDING_ADMIN_MFA_KEY,
    JSON.stringify({
      ticket: normalizedTicket,
      userId: normalizedUserId,
      issuedAt: Date.now()
    } satisfies PendingAdminMfaState)
  )
}

export const clearPendingAdminMfaSession = () => {
  if (!hasWindow()) return
  window.sessionStorage.removeItem(PENDING_ADMIN_MFA_KEY)
}

export const hasPendingAdminMfaSession = (userId?: string | null) => {
  const pending = readPendingAdminMfaState()
  if (!pending) return false

  const normalizedUserId = String(userId || '').trim()
  if (!normalizedUserId) return true

  return pending.userId === normalizedUserId
}

export const getPendingAdminMfaTicket = (userId?: string | null) => {
  const pending = readPendingAdminMfaState()
  if (!pending) return null

  const normalizedUserId = String(userId || '').trim()
  if (!normalizedUserId || pending.userId === normalizedUserId) {
    return pending.ticket
  }

  return null
}

const decodeBase64Url = (value: string) => {
  try {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
    const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4))
    const decoded = atob(`${normalized}${padding}`)
    return decodeURIComponent(
      decoded
        .split('')
        .map((char) => `%${char.charCodeAt(0).toString(16).padStart(2, '0')}`)
        .join('')
    )
  } catch {
    return null
  }
}

export const extractAalFromJwt = (token?: string | null): AuthenticatorAssuranceLevel => {
  const rawToken = String(token || '').trim()
  if (!rawToken) return null

  const parts = rawToken.split('.')
  if (parts.length < 2) return null

  const payload = decodeBase64Url(parts[1])
  if (!payload) return null

  try {
    const parsed = JSON.parse(payload) as { aal?: unknown }
    return normalizeLevel(parsed?.aal)
  } catch {
    return null
  }
}
