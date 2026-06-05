import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
const AUTH_STORAGE_MODE_KEY = 'bwagro-auth-storage-mode'
const volatileAuthStorage = new Map<string, string>()

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables. Please check your .env file.')
}

type AuthStorageMode = 'local' | 'session' | 'memory'

const hasWindow = () => typeof window !== 'undefined'

const getAuthStorageMode = (): AuthStorageMode => {
  if (!hasWindow()) return 'local'

  const sessionMode = window.sessionStorage.getItem(AUTH_STORAGE_MODE_KEY)
  if (sessionMode === 'session' || sessionMode === 'memory') {
    return sessionMode
  }

  if (window.localStorage.getItem(AUTH_STORAGE_MODE_KEY) === 'local') {
    return 'local'
  }

  return 'local'
}

export const setAuthStorageMode = (mode: AuthStorageMode) => {
  if (!hasWindow()) return

  if (mode === 'local') {
    window.localStorage.setItem(AUTH_STORAGE_MODE_KEY, 'local')
    window.sessionStorage.removeItem(AUTH_STORAGE_MODE_KEY)
    return
  }

  window.localStorage.removeItem(AUTH_STORAGE_MODE_KEY)
  window.sessionStorage.setItem(AUTH_STORAGE_MODE_KEY, mode)
}

export const setRememberDevicePreference = (remember: boolean) => {
  if (!hasWindow()) return

  setAuthStorageMode(remember ? 'local' : 'session')
}

export const getRememberDevicePreference = () => getAuthStorageMode() === 'local'

export const clearForcedAdminAuthStorageMode = () => {
  if (!hasWindow()) return

  volatileAuthStorage.clear()
  if (window.sessionStorage.getItem(AUTH_STORAGE_MODE_KEY) === 'memory') {
    window.sessionStorage.removeItem(AUTH_STORAGE_MODE_KEY)
  }
}

export const forceAdminMemoryAuthStorage = async () => {
  if (!hasWindow()) return

  const previousMode = getAuthStorageMode()
  const {
    data: { session }
  } = await supabase.auth.getSession()

  if (previousMode !== 'memory') {
    setAuthStorageMode('memory')
  }

  if (previousMode === 'memory') {
    return
  }

  if (!session?.access_token || !session.refresh_token) {
    return
  }

  await supabase.auth.setSession({
    access_token: session.access_token,
    refresh_token: session.refresh_token
  })
}

export const forceSessionOnlyAuthStorage = async () => {
  if (!hasWindow()) return

  const previousMode = getAuthStorageMode()
  const {
    data: { session }
  } = await supabase.auth.getSession()

  if (previousMode !== 'session') {
    setRememberDevicePreference(false)
  }

  if (previousMode !== 'local') {
    return
  }

  if (!session?.access_token || !session.refresh_token) {
    return
  }

  await supabase.auth.setSession({
    access_token: session.access_token,
    refresh_token: session.refresh_token
  })
}

const authStorage = {
  getItem: (key: string) => {
    if (!hasWindow()) return null
    if (getAuthStorageMode() === 'memory') {
      return volatileAuthStorage.get(key) ?? null
    }
    return window.localStorage.getItem(key) ?? window.sessionStorage.getItem(key)
  },
  setItem: (key: string, value: string) => {
    if (!hasWindow()) return

    const mode = getAuthStorageMode()
    if (mode === 'memory') {
      volatileAuthStorage.set(key, value)
      window.localStorage.removeItem(key)
      window.sessionStorage.removeItem(key)
      return
    }

    const targetStorage = mode === 'local' ? window.localStorage : window.sessionStorage
    const otherStorage = mode === 'local' ? window.sessionStorage : window.localStorage

    targetStorage.setItem(key, value)
    otherStorage.removeItem(key)
  },
  removeItem: (key: string) => {
    if (!hasWindow()) return
    volatileAuthStorage.delete(key)
    window.localStorage.removeItem(key)
    window.sessionStorage.removeItem(key)
  }
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: authStorage
  },
  realtime: {
    params: {
      eventsPerSecond: 10
    }
  }
})

// Helper para formatar erros do Supabase
export const formatSupabaseError = (error: any): string => {
  if (!error) return 'Erro desconhecido'
  if (error.message) return error.message
  if (typeof error === 'string') return error
  return 'Erro ao processar requisição'
}
