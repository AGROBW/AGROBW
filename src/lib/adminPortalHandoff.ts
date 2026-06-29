const ADMIN_PORTAL_HANDOFF_KEY = 'agrobw-admin-portal-handoff'
const ADMIN_PORTAL_HANDOFF_TTL_MS = 15_000

const canUseSessionStorage = () => typeof window !== 'undefined' && typeof window.sessionStorage !== 'undefined'

export const setAdminPortalHandoffPending = () => {
  if (!canUseSessionStorage()) return
  window.sessionStorage.setItem(ADMIN_PORTAL_HANDOFF_KEY, String(Date.now()))
}

export const hasAdminPortalHandoffPending = () => {
  if (!canUseSessionStorage()) return false
  const rawValue = window.sessionStorage.getItem(ADMIN_PORTAL_HANDOFF_KEY)
  const createdAt = Number(rawValue)

  if (!Number.isFinite(createdAt) || createdAt <= 0) {
    clearAdminPortalHandoffPending()
    return false
  }

  const isFresh = Date.now() - createdAt < ADMIN_PORTAL_HANDOFF_TTL_MS
  if (!isFresh) {
    clearAdminPortalHandoffPending()
  }

  return isFresh
}

export const clearAdminPortalHandoffPending = () => {
  if (!canUseSessionStorage()) return
  window.sessionStorage.removeItem(ADMIN_PORTAL_HANDOFF_KEY)
}
