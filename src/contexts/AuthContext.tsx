import React, { createContext, useContext, useEffect, useState, ReactNode, useRef } from 'react'
import { User as SupabaseUser } from '@supabase/supabase-js'
import { setRememberDevicePreference, supabase } from '../lib/supabaseClient'
import { User, UserRole } from '../../types'
import { toast } from 'sonner'

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

  // Buscar dados do usuário
  const fetchUserStatus = async (userId: string, canSetState?: () => boolean) => {
    try {
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single()

      if (userError) {
        console.groupCollapsed('[Auth] Erro ao buscar usuário')
        console.error('userId:', userId)
        console.error('erro:', userError)
        console.groupEnd()
        toast.error('Falha ao carregar usuário', { description: 'Erro de conexão com o Supabase.' })
        console.debug('[Auth] fetchUserStatus completou com erro')
        return null
      }

      const user: User = {
        id: userData.id,
        email: userData.email,
        name: userData.name || 'Usuário',
        phone: userData.phone,
        document: userData.document,
        document_path: userData.document_path,
        whatsapp: userData.whatsapp,
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
        credits: userData.credits ?? 0
      }

      if (!canSetState || canSetState()) {
        setUser(user)
      }
      console.debug('[Auth] fetchUserStatus completou com sucesso')
      return userData
    } catch (err: any) {
      console.groupCollapsed('[Auth] Erro inesperado ao buscar usuário')
      console.error('userId:', userId)
      console.error('erro:', err?.message || err)
      console.groupEnd()
      toast.error('Falha ao carregar usuário', { description: 'Erro de conexão com o Supabase.' })
      console.debug('[Auth] fetchUserStatus completou com erro')
      return null
    }
  }

  // Buscar estatísticas via função get_user_stats
  const fetchStats = async (userId: string, canSetState?: () => boolean) => {
    try {
      const { data, error } = await supabase.rpc('get_user_stats', {
        user_uuid: userId
      })

      if (error) {
        console.groupCollapsed('[Auth] Erro ao buscar estatísticas')
        console.error('userId:', userId)
        console.error('erro:', error)
        console.groupEnd()
        toast.error('Falha ao carregar estatísticas', { description: 'Erro de conexão com o Supabase.' })
        console.debug('[Auth] fetchStats completou com erro (retornando defaults)')
        if (!canSetState || canSetState()) {
          setStats(defaultStats)
        }
        return
      }

      if (!canSetState || canSetState()) {
        setStats(data as UserStats)
      }
      console.debug('[Auth] fetchStats completou com sucesso')
    } catch (err: any) {
      console.groupCollapsed('[Auth] Erro inesperado ao buscar estatísticas')
      console.error('userId:', userId)
      console.error('erro:', err?.message || err)
      console.groupEnd()
      toast.error('Falha ao carregar estatísticas', { description: 'Erro de conexão com o Supabase.' })
      console.debug('[Auth] fetchStats completou com erro (retornando defaults)')
      if (!canSetState || canSetState()) {
        setStats(defaultStats)
      }
    }
  }

  const refreshStats = async () => {
    if (supabaseUser && !fetchingRef.current) {
      fetchingRef.current = true
      try {
        await Promise.all([
          fetchUserStatus(supabaseUser.id),
          fetchStats(supabaseUser.id)
        ])
      } catch (err: any) {
        console.error('Erro ao atualizar dados:', err)
      } finally {
        fetchingRef.current = false
      }
    }
  }

  // Configurar listener de autenticação
  useEffect(() => {
    let isMounted = true;

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.debug('[Auth] onAuthStateChange', {
        event,
        hasSession: !!session,
        userId: session?.user?.id,
        isMounted
      })
      
      if (isMounted) {
        setSupabaseUser(session?.user ?? null)
        if (session?.user) {
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

      if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && session?.user) {
        // Evita fetches duplicados - se já está buscando, ignora
        if (fetchingRef.current) {
          if (event === 'INITIAL_SESSION') {
            console.debug('[Auth] Ignorando INITIAL_SESSION pois SIGNED_IN já está em andamento')
            return
          }
          console.debug('[Auth] Ignorando evento pois fetches já estão em andamento')
          return
        }
        
        // Só faz fetch se NÃO temos user carregado ainda
        if (!user && isMounted) {
          fetchingRef.current = true
          console.debug('[Auth] Iniciando fetches', { userId: session.user.id })
          
          try {
            fetchUserStatus(session.user.id, () => isMounted)
            fetchStats(session.user.id, () => isMounted)
            console.debug('[Auth] Fetches completadas com sucesso')
          } catch (err) {
            console.error('[Auth] Erro durante fetches:', err)
          } finally {
            fetchingRef.current = false
            if (isMounted) {
              console.debug('[Auth] Finalizando fetches', { userId: session.user.id })
            }
          }
        } else if (isMounted) {
          console.debug('[Auth] Pulando fetches pois user já está carregado', {user: !!user})
          setIsLoading(false)
        }
      } else if (event === 'SIGNED_OUT') {
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
      subscription.unsubscribe()
    }
  }, [])

  // Função de login
  const signIn = async (email: string, password: string, rememberDevice = true) => {
    setRememberDevicePreference(rememberDevice)

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    })
    
    if (error) {
      return { error }
    }
    
    // Verificar se o usuário está suspenso
    if (data?.user?.id) {
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('is_suspended, suspension_reason, name')
        .eq('id', data.user.id)
        .single()
      
      if (!userError && userData?.is_suspended) {
        // Fazer logout imediatamente
        await supabase.auth.signOut()
        
        // Retornar erro customizado com informações de suspensão
        return { 
          error: { 
            message: 'USER_SUSPENDED',
            suspension_reason: userData.suspension_reason || 'Sua conta foi suspensa.',
            user_name: userData.name
          }
        }
      }

      // ✅ Atualizar last_login após login bem-sucedido
      await supabase
        .from('users')
        .update({ last_login: new Date().toISOString() })
        .eq('id', data.user.id)
    }
    
    return { error }
  }

  const sendPasswordResetEmail = async (email: string) => {
    const baseUrl = (import.meta as any).env?.VITE_SITE_URL || window.location.origin
    const redirectTo = `${String(baseUrl).replace(/\/$/, '')}/#/redefinir-senha`
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo })
    return { error }
  }

  // Função de cadastro
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
    }
  ) => {
    const onlyDigits = (value?: string) => (value ?? '').replace(/\D/g, '')
    const cleanPhone = onlyDigits(phone)
    const cleanDocument = onlyDigits(additionalData?.document)
    // Criar conta no Supabase Auth
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
          estado: additionalData?.estado
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

    return { error: null }
  }

  // Função de logout
  const signOut = async () => {
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
