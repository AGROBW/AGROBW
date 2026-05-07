import { supabase } from './supabaseClient'

let trustedOffsetMs = 0
let lastSyncedAtMs = 0
let syncPromise: Promise<number> | null = null

const TRUSTED_TIME_TTL_MS = 60 * 1000

const parseServerNow = (value: unknown): number | null => {
  if (!value) return null

  if (typeof value === 'string') {
    const timestamp = new Date(value).getTime()
    return Number.isNaN(timestamp) ? null : timestamp
  }

  if (Array.isArray(value)) {
    return parseServerNow(value[0])
  }

  if (typeof value === 'object') {
    const maybeServerNow = (value as { server_now?: unknown }).server_now
    return parseServerNow(maybeServerNow)
  }

  return null
}

export const getTrustedNowMs = () => Date.now() + trustedOffsetMs

export const isTimestampExpired = (value?: string | null) => {
  if (!value) return false
  const timestamp = new Date(value).getTime()
  if (Number.isNaN(timestamp)) return false
  return timestamp <= getTrustedNowMs()
}

export const isTimestampActive = (value?: string | null) => {
  if (!value) return true
  const timestamp = new Date(value).getTime()
  if (Number.isNaN(timestamp)) return false
  return timestamp > getTrustedNowMs()
}

export const getTrustedHoursAgo = (value?: string | null) => {
  if (!value) return Number.POSITIVE_INFINITY
  const timestamp = new Date(value).getTime()
  if (Number.isNaN(timestamp)) return Number.POSITIVE_INFINITY
  return (getTrustedNowMs() - timestamp) / (1000 * 60 * 60)
}

export const syncTrustedTime = async (force = false) => {
  const now = Date.now()

  if (!force && lastSyncedAtMs && now - lastSyncedAtMs < TRUSTED_TIME_TTL_MS) {
    return trustedOffsetMs
  }

  if (syncPromise) {
    return syncPromise
  }

  syncPromise = (async () => {
    try {
      const { data, error } = await supabase.rpc('get_server_now')

      if (error) {
        throw error
      }

      const serverNowMs = parseServerNow(data)
      if (!serverNowMs) {
        throw new Error('Resposta invalida de get_server_now')
      }

      trustedOffsetMs = serverNowMs - Date.now()
      lastSyncedAtMs = Date.now()
      return trustedOffsetMs
    } finally {
      syncPromise = null
    }
  })()

  return syncPromise
}
