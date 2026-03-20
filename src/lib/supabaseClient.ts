import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
const AUTH_STORAGE_MODE_KEY = 'bwagro-auth-storage-mode'

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables. Please check your .env file.')
}

type AuthStorageMode = 'local' | 'session'

const hasWindow = () => typeof window !== 'undefined'

const getAuthStorageMode = (): AuthStorageMode => {
  if (!hasWindow()) return 'local'

  if (window.localStorage.getItem(AUTH_STORAGE_MODE_KEY) === 'local') {
    return 'local'
  }

  if (window.sessionStorage.getItem(AUTH_STORAGE_MODE_KEY) === 'session') {
    return 'session'
  }

  return 'local'
}

export const setRememberDevicePreference = (remember: boolean) => {
  if (!hasWindow()) return

  if (remember) {
    window.localStorage.setItem(AUTH_STORAGE_MODE_KEY, 'local')
    window.sessionStorage.removeItem(AUTH_STORAGE_MODE_KEY)
    return
  }

  window.sessionStorage.setItem(AUTH_STORAGE_MODE_KEY, 'session')
  window.localStorage.removeItem(AUTH_STORAGE_MODE_KEY)
}

export const getRememberDevicePreference = () => getAuthStorageMode() === 'local'

const authStorage = {
  getItem: (key: string) => {
    if (!hasWindow()) return null
    return window.localStorage.getItem(key) ?? window.sessionStorage.getItem(key)
  },
  setItem: (key: string, value: string) => {
    if (!hasWindow()) return

    const mode = getAuthStorageMode()
    const targetStorage = mode === 'local' ? window.localStorage : window.sessionStorage
    const otherStorage = mode === 'local' ? window.sessionStorage : window.localStorage

    targetStorage.setItem(key, value)
    otherStorage.removeItem(key)
  },
  removeItem: (key: string) => {
    if (!hasWindow()) return
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
