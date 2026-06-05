export type AuthenticatorAssuranceLevel = 'aal1' | 'aal2' | null

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
