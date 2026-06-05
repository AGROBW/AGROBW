import { AuthenticatorAssuranceLevel, extractAalFromJwt } from './adminMfa'
import { forceAdminMemoryAuthStorage, supabase } from './supabaseClient'

type AdminSessionPayload = {
  accessToken: string
  refreshToken: string
  expiresAt?: number | null
  expiresIn?: number | null
  tokenType?: string | null
}

type AdminCookieResponse = {
  success?: boolean
  session?: AdminSessionPayload
  admin?: {
    userId?: string
    currentLevel?: AuthenticatorAssuranceLevel | string | null
    requiresMfa?: boolean
  }
  pendingMfaTicket?: {
    token?: string
    expiresAt?: string | null
  } | null
  error?: string
  errorCode?: string
}

const ADMIN_AUTH_BASE_PATH = '/api/admin-auth'

const parseJsonSafely = async <T>(response: Response): Promise<T | null> => {
  try {
    return (await response.clone().json()) as T
  } catch {
    return null
  }
}

const normalizeSession = (session?: AdminSessionPayload | null) => {
  const accessToken = String(session?.accessToken || '').trim()
  const refreshToken = String(session?.refreshToken || '').trim()

  if (!accessToken || !refreshToken) {
    return null
  }

  return {
    access_token: accessToken,
    refresh_token: refreshToken
  }
}

export const applyAdminBrowserSession = async (session?: AdminSessionPayload | null) => {
  const normalizedSession = normalizeSession(session)
  if (!normalizedSession) {
    return { success: false, error: 'missing_session' as const }
  }

  await forceAdminMemoryAuthStorage()
  const { error } = await supabase.auth.setSession(normalizedSession)

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true as const }
}

export const requestAdminServerLogin = async (payload: Record<string, unknown>) => {
  const response = await fetch(`${ADMIN_AUTH_BASE_PATH}/login`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      Accept: 'application/json',
    },
    body: JSON.stringify(payload),
  })

  const data = await parseJsonSafely<AdminCookieResponse>(response)
  return { response, data }
}

export const restoreAdminSessionFromCookie = async () => {
  const response = await fetch(`${ADMIN_AUTH_BASE_PATH}/session`, {
    method: 'GET',
    credentials: 'same-origin',
    headers: {
      'Cache-Control': 'no-store',
      Accept: 'application/json',
    },
  })

  const data = await parseJsonSafely<AdminCookieResponse>(response)
  if (!response.ok || !data?.success || !data.session) {
    return { restored: false, data, status: response.status }
  }

  const applied = await applyAdminBrowserSession(data.session)
  if (!applied.success) {
    return { restored: false, data, status: response.status }
  }

  return { restored: true, data, status: response.status }
}

export const syncAdminSessionToCookie = async (session?: {
  access_token?: string | null
  refresh_token?: string | null
} | null) => {
  const accessToken = String(session?.access_token || '').trim()
  const refreshToken = String(session?.refresh_token || '').trim()

  if (!accessToken || !refreshToken) {
    return { success: false, skipped: true as const }
  }

  const response = await fetch(`${ADMIN_AUTH_BASE_PATH}/sync-session`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      accessToken,
      refreshToken,
      currentLevel: extractAalFromJwt(accessToken),
    }),
  })

  return {
    success: response.ok,
    status: response.status,
    data: await parseJsonSafely<AdminCookieResponse>(response),
  }
}

export const clearAdminSessionCookie = async () => {
  const response = await fetch(`${ADMIN_AUTH_BASE_PATH}/logout`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      Accept: 'application/json',
    },
  })

  return {
    success: response.ok,
    status: response.status,
  }
}
