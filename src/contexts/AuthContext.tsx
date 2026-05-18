import React, { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react'
import { User as SupabaseUser } from '@supabase/supabase-js'
import { setRememberDevicePreference, supabase } from '../lib/supabaseClient'
import { endAppSync, startAppSync } from '../lib/appSyncStatus'
import { isSupabaseUnauthorizedError, refreshSupabaseSession } from '../lib/supabaseAuthGuard'
import { User, UserRole } from '../../types'
import { toast } from 'sonner'
import { appError } from '../utils/appLogger'

interface UserStats {
  total_ads: number
  active_ads: number
  total_views: number
  unread_messages: number
  favorites_count: number
  opportunities_count: number
  is_seller: boolean
  first_ad_at: string | null
}

interface AuthContextType {
  user: User | null
  supabaseUser: SupabaseUser | null
  stats: UserStats | null
  isLoading: boolean
  isSeller: boolean
  isAdmin: boolean
  signIn: (email: string, password: string, rememberDevice?: boolean) => Promise<{ error: any }>
  sendPasswordResetEmail: (email: string) => Promise<{ error: any }>
  signUp: (
    email: string,
    password: string,
    name: string,
    phone?: string,
    additionalData?: {
      document?: string;
      birthDate?: string;
      website?: string;
      cep?: string;
      logradouro?: string;
      numero?: string;
      complemento?: string;
      bairro?: string;
      cidade?: string;
      estado?: string;
      legalConsents?: {
        acceptedTermsOfUse?: boolean;
        acceptedPrivacyPolicy?: boolean;
        userAgent?: string;
      };
    }
  ) => Promise<{ error: any }>
  signOut: () => Promise<void>
  refreshStats: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

const defaultStats: UserStats = {
  total_ads: 0,
  active_ads: 0,
  total_views: 0,
  unread_messages: 0,
  favorites_count: 0,
  opportunities_count: 0,
  is_seller: false,
  first_ad_at: null
}

const normalizeUserRole = (role?: string | null): UserRole => {
  switch ((role || '').toUpperCase()) {
    case UserRole.ADMIN:
      return UserRole.ADMIN
    case UserRole.BUYER:
      return UserRole.BUYER
    case UserRole.ADVERTISER:
      return UserRole.ADVERTISER
    case UserRole.VISITOR:
      return UserRole.VISITOR
    default:
      return UserRole.VISITOR
  }
}

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null)
  const [supabaseUser, setSupabaseUser] = useState<SupabaseUser | null>(null)
  const [stats, setStats] = useState<UserStats | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const fetchingRef = useRef(false)
  const retryTimeoutRef = useRef<number | null>(null)
  const sessionExpiredToastShownRef = useRef(false)

  const clearRetryTimeout = () => {
    if (retryTimeoutRef.current !== null && typeof window !== 'undefined') {
      window.clearTimeout(retryTimeoutRef.current)
      retryTimeoutRef.current = null
    }
  }

  const handleExpiredSession = async (canSetState?: () => boolean) => {
    clearRetryTimeout()
    await supabase.auth.signOut()

    if (!sessionExpiredToastShownRef.current) {
      sessionExpiredToastShownRef.current = true
      toast.error('Sessão expirada', {
        description: 'Entre novamente para continuar usando sua conta.'
      })
    }

    if (!canSetState || canSetState()) {
      setUser(null)
      setSupabaseUser(null)
      setStats(null)
      setIsLoading(false)
    }
  }

  const fetchUserStatus = async (
    userId: string,
    canSetState?: () => boolean,
    options?: { silent?: boolean; allowSessionRefresh?: boolean }
  ) => {
    try {
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single()

      if (userError) {
        if (options?.allowSessionRefresh !== false && isSupabaseUnauthorizedError(userError)) {
          const refreshed = await refreshSupabaseSession()

          if (refreshed) {
            return fetchUserStatus(userId, canSetState, { ...options, allowSessionRefresh: false })
          }

          await handleExpiredSession(canSetState)
          return null
        }
          appError('[Auth] Erro ao buscar usuário', userError, { userId })
        if (!options?.silent) {
          toast.error('Falha ao carregar usuário', { description: 'Erro de conexão com o Supabase.' })
        }
        console.debug('[Auth] fetchUserStatus completou com erro')
        return null
      }

      const mappedUser: User = {
        id: userData.id,
        email: userData.email,
        name: userData.name || 'Usuário',
        phone: userData.phone,
        document: userData.document,
        document_path: userData.document_path,
        document_verified: userData.document_verified ?? false,
        document_review_status: userData.document_review_status ?? (userData.document_path ? (userData.document_verified ? 'approved' : 'pending') : 'not_submitted'),
        document_review_notes: userData.document_review_notes ?? null,
        document_reviewed_at: userData.document_reviewed_at ?? null,
        document_reviewed_by: userData.document_reviewed_by ?? null,
        document_last_attempt_at: userData.document_last_attempt_at ?? null,
        document_retry_available_at: userData.document_retry_available_at ?? null,
        document_last_failure_reason: userData.document_last_failure_reason ?? null,
        whatsapp: userData.whatsapp,
        business_description: userData.business_description,
        cep: userData.cep,
        logradouro: userData.logradouro,
        numero: userData.numero,
        complemento: userData.complemento,
        bairro: userData.bairro,
        cidade: userData.cidade,
        estado: userData.estado,
        role: normalizeUserRole(userData.role),
        location: userData.location || (userData.cidade && userData.estado ? `${userData.cidade}, ${userData.estado}` : userData.cidade),
        avatar: userData.avatar,
        plan: userData.plan,
        isAdmin: userData.is_admin ?? false,
        credits: userData.credits ?? 0,
        startPlanConsumedAt: userData.start_plan_consumed_at ?? null
      }

      if (!canSetState || canSetState()) {
        setUser(mappedUser)
      }

      console.debug('[Auth] fetchUserStatus completou com sucesso')
      return userData
    } catch (err: any) {
      if (options?.allowSessionRefresh !== false && isSupabaseUnauthorizedError(err)) {
        const refreshed = await refreshSupabaseSession()

        if (refreshed) {
          return fetchUserStatus(userId, canSetState, { ...options, allowSessionRefresh: false })
        }

        await handleExpiredSession(canSetState)
        return null
      }
        appError('[Auth] Erro inesperado ao buscar usuário', err, { userId })
      if (!options?.silent) {
        toast.error('Falha ao carregar usuário', { description: 'Erro de conexão com o Supabase.' })
      }
      console.debug('[Auth] fetchUserStatus completou com erro')
      return null
    }
  }

  const fetchStats = async (
    userId: string,
    canSetState?: () => boolean,
    options?: { silent?: boolean; allowSessionRefresh?: boolean }
  ) => {
    try {
      const { data, error } = await supabase.rpc('get_user_stats', {
        user_uuid: userId
      })

      if (error) {
        if (options?.allowSessionRefresh !== false && isSupabaseUnauthorizedError(error)) {
          const refreshed = await refreshSupabaseSession()

          if (refreshed) {
            return fetchStats(userId, canSetState, { ...options, allowSessionRefresh: false })
          }

          await handleExpiredSession(canSetState)
          return false
        }
          appError('[Auth] Erro ao buscar estatísticas', error, { userId })
        if (!options?.silent) {
          toast.error('Falha ao carregar estatísticas', { description: 'Erro de conexão com o Supabase.' })
        }
        console.debug('[Auth] fetchStats completou com erro (retornando defaults)')
        if (!canSetState || canSetState()) {
          setStats(defaultStats)
        }
        return false
      }

      if (!canSetState || canSetState()) {
        setStats(data as UserStats)
      }

      console.debug('[Auth] fetchStats completou com sucesso')
      return true
    } catch (err: any) {
      if (options?.allowSessionRefresh !== false && isSupabaseUnauthorizedError(err)) {
        const refreshed = await refreshSupabaseSession()

        if (refreshed) {
          return fetchStats(userId, canSetState, { ...options, allowSessionRefresh: false })
        }

        await handleExpiredSession(canSetState)
        return false
      }
        appError('[Auth] Erro inesperado ao buscar estatísticas', err, { userId })
      if (!options?.silent) {
        toast.error('Falha ao carregar estatísticas', { description: 'Erro de conexão com o Supabase.' })
      }
      console.debug('[Auth] fetchStats completou com erro (retornando defaults)')
      if (!canSetState || canSetState()) {
        setStats(defaultStats)
      }
      return false
    }
  }

  const scheduleRetry = (userId: string, canSetState?: () => boolean) => {
    if (typeof window === 'undefined' || retryTimeoutRef.current !== null) return

    retryTimeoutRef.current = window.setTimeout(() => {
      retryTimeoutRef.current = null
      void loadAuthenticatedState(userId, { silent: true, canSetState })
    }, 5000)
  }

  const loadAuthenticatedState = async (
    userId: string,
    options?: { silent?: boolean; canSetState?: () => boolean }
  ) => {
    if (fetchingRef.current) return

    fetchingRef.current = true
    clearRetryTimeout()
    if (options?.silent) {
      startAppSync()
    }

    try {
      const [userData, statsLoaded] = await Promise.all([
        fetchUserStatus(userId, options?.canSetState, { silent: options?.silent }),
        fetchStats(userId, options?.canSetState, { silent: options?.silent })
      ])

      if (!userData || !statsLoaded) {
        const { data: currentSession } = await supabase.auth.getSession()
        if (!currentSession.session) return

        scheduleRetry(userId, options?.canSetState)
      }
    } catch (err: any) {
        appError('[Auth] Erro ao sincronizar sessão autenticada', err, { userId })
      scheduleRetry(userId, options?.canSetState)
    } finally {
      if (options?.silent) {
        endAppSync()
      }
      fetchingRef.current = false
      if (!options?.canSetState || options.canSetState()) {
        setIsLoading(false)
      }
    }
  }

  const refreshStats = async () => {
    if (supabaseUser?.id && !fetchingRef.current) {
      await loadAuthenticatedState(supabaseUser.id)
    }
  }

  useEffect(() => {
    let isMounted = true

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.debug('[Auth] onAuthStateChange', {
        event,
        hasSession: !!session,
        userId: session?.user?.id,
        isMounted
      })

      if (isMounted) {
        setSupabaseUser(session?.user ?? null)
        if (session?.user) {
          sessionExpiredToastShownRef.current = false
          setUser(prev => prev ?? {
            id: session.user.id,
            email: session.user.email || '',
            name: session.user.email || 'Usuário',
            phone: '',
            role: UserRole.VISITOR,
            location: '',
            avatar: '',
            plan: undefined,
            isAdmin: false
          })
          setIsLoading(false)
        }
      }

      if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') && session?.user) {
        if (isMounted) {
          console.debug('[Auth] Iniciando sincronização autenticada', { userId: session.user.id, event })
          void loadAuthenticatedState(session.user.id, {
            silent: event !== 'SIGNED_IN',
            canSetState: () => isMounted
          })
        }
      } else if (event === 'SIGNED_OUT') {
        clearRetryTimeout()
        if (isMounted) {
          setUser(null)
          setStats(null)
          setIsLoading(false)
        }
      } else if (!session?.user && isMounted) {
        setIsLoading(false)
      }
    })

    return () => {
      isMounted = false
      clearRetryTimeout()
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return

    const handleOnline = () => {
      if (supabaseUser?.id) {
        void loadAuthenticatedState(supabaseUser.id, { silent: true })
      }
    }

    window.addEventListener('online', handleOnline)
    return () => window.removeEventListener('online', handleOnline)
  }, [supabaseUser?.id])

  const signIn = async (email: string, password: string, rememberDevice = true) => {
    setRememberDevicePreference(rememberDevice)

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    })

    if (error) {
      return { error }
    }

    if (data?.user?.id) {
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('is_suspended, suspension_reason, name')
        .eq('id', data.user.id)
        .single()

      if (!userError && userData?.is_suspended) {
        await supabase.auth.signOut()

        return {
          error: {
            message: 'USER_SUSPENDED',
            suspension_reason: userData.suspension_reason || 'Sua conta foi suspensa.',
            user_name: userData.name
          }
        }
      }

      await supabase
        .from('users')
        .update({ last_login: new Date().toISOString() })
        .eq('id', data.user.id)
    }

    return { error }
  }

  const sendPasswordResetEmail = async (email: string) => {
    const baseUrl = (import.meta as any).env?.VITE_SITE_URL || window.location.origin
    const redirectTo = `${String(baseUrl).replace(/\/$/, '')}/redefinir-senha`
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo })
    return { error }
  }

  const signUp = async (
    email: string,
    password: string,
    name: string,
    phone?: string,
    additionalData?: {
      document?: string;
      birthDate?: string;
      website?: string;
      cep?: string;
      logradouro?: string;
      numero?: string;
      complemento?: string;
      bairro?: string;
      cidade?: string;
      estado?: string;
      legalConsents?: {
        acceptedTermsOfUse?: boolean;
        acceptedPrivacyPolicy?: boolean;
        userAgent?: string;
      };
    }
  ) => {
    const onlyDigits = (value?: string) => (value ?? '').replace(/\D/g, '')
    const cleanPhone = onlyDigits(phone)
    const cleanDocument = onlyDigits(additionalData?.document)

    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          name,
          phone: cleanPhone || undefined,
          document: cleanDocument || undefined,
          birth_date: additionalData?.birthDate,
          website: additionalData?.website,
          cep: additionalData?.cep,
          logradouro: additionalData?.logradouro,
          numero: additionalData?.numero,
          complemento: additionalData?.complemento,
          bairro: additionalData?.bairro,
          cidade: additionalData?.cidade,
          estado: additionalData?.estado,
          accepted_terms_of_use: additionalData?.legalConsents?.acceptedTermsOfUse === true,
          accepted_privacy_policy: additionalData?.legalConsents?.acceptedPrivacyPolicy === true,
          legal_consent_source: 'register',
          legal_consent_user_agent: additionalData?.legalConsents?.userAgent || undefined
        }
      }
    })

    if (authError) {
      if ((authError as any)?.status === 429) {
        toast.error('Muitas tentativas', {
          description: 'Aguarde um momento antes de tentar cadastrar novamente.'
        })
      }
      return { error: authError }
    }

    return { error: null, data: authData }
  }

  const signOut = async () => {
    clearRetryTimeout()
    await supabase.auth.signOut()
    setUser(null)
    setStats(null)
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        supabaseUser,
        stats,
        isLoading,
        isSeller: stats?.is_seller ?? false,
        isAdmin: (user?.isAdmin ?? (user?.role === UserRole.ADMIN)) || false,
        signIn,
        sendPasswordResetEmail,
        signUp,
        signOut,
        refreshStats
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}
