import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, CheckCircle2, ShieldAlert } from 'lucide-react'
import { CaptchaWidget } from '../components/CaptchaWidget'
import { useAuth } from '../src/contexts/AuthContext'
import { formatTimeRemaining } from '../src/hooks/useRateLimit'
import { supabase } from '../src/lib/supabaseClient'
import { debugLog } from '../src/utils/debugLog'

interface AdminLoginRateLimitStatus {
  attempts_used: number
  remaining_attempts: number
  is_blocked: boolean
  blocked_until: string | null
  time_until_unblock_seconds: number
  should_show_captcha: boolean
  server_now: string
}

interface AdminLoginFunctionSuccessPayload {
  success: true
  session: {
    accessToken: string
    refreshToken: string
    expiresAt?: number | null
    expiresIn?: number | null
    tokenType?: string | null
  }
  admin: {
    currentLevel: string | null
    requiresMfa: boolean
  }
  rateLimitStatus?: AdminLoginRateLimitStatus
}

interface AdminLoginFunctionErrorPayload {
  success?: false
  errorCode?: string
  error?: string
  rateLimitStatus?: AdminLoginRateLimitStatus
}

const defaultRateLimitStatus: AdminLoginRateLimitStatus = {
  attempts_used: 0,
  remaining_attempts: 5,
  is_blocked: false,
  blocked_until: null,
  time_until_unblock_seconds: 0,
  should_show_captcha: false,
  server_now: new Date().toISOString()
}

const resolveCaptchaProvider = (): 'turnstile' | 'hcaptcha' | 'mock' => {
  if (import.meta.env.VITE_TURNSTILE_SITE_KEY) {
    return 'turnstile'
  }

  if (import.meta.env.VITE_HCAPTCHA_SITE_KEY) {
    return 'hcaptcha'
  }

  return 'mock'
}

const readAdminLoginErrorPayload = async (response?: Response): Promise<AdminLoginFunctionErrorPayload | null> => {
  if (!response) {
    return null
  }

  try {
    const contentType = response.headers.get('content-type') || ''
    if (!contentType.includes('application/json')) {
      return null
    }

    return (await response.clone().json()) as AdminLoginFunctionErrorPayload
  } catch {
    return null
  }
}

const toSafeAdminLoginErrorMessage = (
  errorCode?: string | null,
  message?: string | null,
  rateLimitStatus?: AdminLoginRateLimitStatus | null
) => {
  const normalizedCode = String(errorCode || '').trim().toUpperCase()
  const rawMessage = String(message || '').trim().toLowerCase()

  if (normalizedCode === 'RATE_LIMITED' && rateLimitStatus?.time_until_unblock_seconds) {
    return `Bloqueado por seguranca. Tente novamente em ${formatTimeRemaining(rateLimitStatus.time_until_unblock_seconds)}`
  }

  if (normalizedCode === 'CAPTCHA_REQUIRED') {
    return 'Complete a verificacao de seguranca (captcha).'
  }

  if (normalizedCode === 'CAPTCHA_INVALID' || normalizedCode === 'CAPTCHA_UNAVAILABLE') {
    return 'Nao foi possivel concluir a verificacao de seguranca. Tente novamente.'
  }

  if (!rawMessage && !normalizedCode) {
    return 'Nao foi possivel concluir o acesso. Tente novamente.'
  }

  if (
    normalizedCode === 'INVALID_CREDENTIALS' ||
    normalizedCode === 'INVALID_INPUT' ||
    rawMessage.includes('invalid') ||
    rawMessage.includes('credentials') ||
    rawMessage.includes('email not confirmed') ||
    rawMessage.includes('user_suspended') ||
    rawMessage.includes('permission') ||
    rawMessage.includes('admin')
  ) {
    return 'Nao foi possivel validar o acesso. Confira seus dados e tente novamente.'
  }

  if (
    rawMessage.includes('network') ||
    rawMessage.includes('fetch') ||
    rawMessage.includes('timeout') ||
    rawMessage.includes('connection')
  ) {
    return 'Nao foi possivel concluir o acesso agora. Tente novamente em instantes.'
  }

  return 'Nao foi possivel concluir o acesso. Tente novamente.'
}

const AdminLoginView: React.FC = () => {
  const navigate = useNavigate()
  const { user, isAdmin, isLoading: isAuthLoading, adminMfaState } = useAuth()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const [captchaRenderKey, setCaptchaRenderKey] = useState(0)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showCaptcha, setShowCaptcha] = useState(false)
  const [rateLimitStatus, setRateLimitStatus] = useState<AdminLoginRateLimitStatus>(defaultRateLimitStatus)
  const [timeUntilUnblock, setTimeUntilUnblock] = useState(0)

  const isBlocked = rateLimitStatus.is_blocked && timeUntilUnblock > 0
  const remainingAttempts = rateLimitStatus.remaining_attempts
  const canAttempt = !isBlocked && remainingAttempts > 0

  const applyRateLimitStatus = (nextStatus?: AdminLoginRateLimitStatus | null) => {
    const resolvedStatus = nextStatus || defaultRateLimitStatus
    setRateLimitStatus(resolvedStatus)
    setTimeUntilUnblock(resolvedStatus.time_until_unblock_seconds || 0)
    setShowCaptcha(Boolean(resolvedStatus.should_show_captcha))
  }

  useEffect(() => {
    if (isAuthLoading) {
      return
    }

    if (user && isAdmin) {
      if (!adminMfaState.isLoaded) {
        return
      }

      const destination = adminMfaState.currentLevel === 'aal2' ? '/admin' : '/admin/mfa'
      setTimeout(() => navigate(destination), 300)
      return
    }

    if (user && !isAdmin) {
      setError('Nao foi possivel validar o acesso por esta rota.')
      setTimeout(() => navigate('/minha-conta'), 300)
    }
  }, [adminMfaState.currentLevel, adminMfaState.isLoaded, isAdmin, isAuthLoading, navigate, user])

  useEffect(() => {
    if (remainingAttempts <= 3 && remainingAttempts > 0) {
      setShowCaptcha(true)
    }
  }, [remainingAttempts])

  useEffect(() => {
    if (timeUntilUnblock <= 0) return

    const intervalId = window.setInterval(() => {
      setTimeUntilUnblock((current) => {
        if (current <= 1) {
          window.clearInterval(intervalId)
          setRateLimitStatus((previous) => ({
            ...previous,
            is_blocked: false,
            blocked_until: null,
            time_until_unblock_seconds: 0
          }))
          return 0
        }

        return current - 1
      })
    }, 1000)

    return () => window.clearInterval(intervalId)
  }, [timeUntilUnblock])

  useEffect(() => {
    if (!email.trim()) {
      applyRateLimitStatus(defaultRateLimitStatus)
      setCaptchaToken(null)
      setCaptchaRenderKey(0)
    }
  }, [email])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()

    const normalizedEmail = email.trim().toLowerCase()
    if (showCaptcha && !captchaToken) {
      setError('Complete a verificacao de seguranca (captcha).')
      return
    }

    setLoading(true)
    setError('')

    try {
      const { data, error: invokeError, response } = await supabase.functions.invoke('admin-login', {
        method: 'POST',
        body: {
          email: normalizedEmail,
          password,
          captchaToken: captchaToken || null,
          captchaProvider: resolveCaptchaProvider(),
        },
      })

      if (invokeError) {
        const payload = await readAdminLoginErrorPayload(response)
        applyRateLimitStatus(payload?.rateLimitStatus || defaultRateLimitStatus)
        setError(
          toSafeAdminLoginErrorMessage(
            payload?.errorCode || invokeError.name,
            payload?.error || invokeError.message,
            payload?.rateLimitStatus || null,
          )
        )

        if (showCaptcha || payload?.rateLimitStatus?.should_show_captcha) {
          setCaptchaToken(null)
          setCaptchaRenderKey((current) => current + 1)
        }

        setLoading(false)
        return
      }

      const payload = data as AdminLoginFunctionSuccessPayload | null
      if (!payload?.success || !payload.session?.accessToken || !payload.session?.refreshToken) {
        setError('Nao foi possivel concluir o acesso. Tente novamente.')
        setLoading(false)
        return
      }

      applyRateLimitStatus(payload.rateLimitStatus || defaultRateLimitStatus)

      const { error: sessionApplyError } = await supabase.auth.setSession({
        access_token: payload.session.accessToken,
        refresh_token: payload.session.refreshToken,
      })

      if (sessionApplyError) {
        console.error('[AdminLogin] Falha ao aplicar sessao administrativa:', sessionApplyError)
        setError('Nao foi possivel concluir o acesso agora. Tente novamente em instantes.')
        setLoading(false)
        return
      }

      debugLog(
        payload.admin.requiresMfa
          ? '[AdminLogin] Primeira etapa validada no servidor; aguardando MFA'
          : '[AdminLogin] Login administrativo concluido com MFA valido'
      )

      navigate(payload.admin.requiresMfa ? '/admin/mfa' : '/admin', { replace: true })
    } catch (err) {
      console.error('[AdminLogin] Erro inesperado:', err)
      setError('Erro de conexao. Tente novamente.')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900 px-4">
      <div className="max-w-md w-full bg-white rounded-[2.5rem] shadow-2xl p-10">
        <div className="text-center mb-10">
          <div className="w-16 h-16 bg-slate-900 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-xl">
            <span className="text-green-500 text-3xl font-black">T</span>
          </div>
          <h1 className="text-2xl font-black text-slate-900 font-display uppercase tracking-tight">Painel Admin</h1>
          <p className="text-slate-400 mt-2 text-sm font-bold uppercase tracking-widest">Acesso Restrito</p>
        </div>

        {isBlocked && (
          <div className="bg-red-500 text-white p-4 rounded-xl mb-6 text-center border-2 border-red-600 animate-shake">
            <div className="flex items-center justify-center gap-2 mb-2">
              <ShieldAlert className="w-5 h-5" />
              <p className="text-sm font-black uppercase tracking-wider">Bloqueado por Seguranca</p>
            </div>
            <p className="text-xs font-semibold">
              Muitas tentativas falhadas. Aguarde {formatTimeRemaining(timeUntilUnblock)}
            </p>
          </div>
        )}

        {!isBlocked && remainingAttempts < 5 && (
          <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 p-3 rounded-xl mb-6 text-center">
            <div className="flex items-center justify-center gap-2 mb-1">
              <AlertTriangle className="w-4 h-4" />
              <p className="text-xs font-bold uppercase tracking-wider">Atencao</p>
            </div>
            <p className="text-xs font-semibold">
              {remainingAttempts} tentativa{remainingAttempts !== 1 ? 's' : ''} restante{remainingAttempts !== 1 ? 's' : ''}
            </p>
          </div>
        )}

        {error && (
          <div className="bg-red-50 text-red-600 p-4 rounded-xl text-xs font-bold mb-6 text-center border border-red-100 animate-shake">
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-6">
          <div>
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">
              E-mail
            </label>
            <input
              type="email"
              required
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isBlocked}
              className="w-full bg-slate-50 border-none rounded-2xl px-6 py-4 focus:ring-2 focus:ring-slate-900 outline-none transition-all font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              placeholder="Digite seu e-mail"
            />
          </div>

          <div>
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">
              Senha
            </label>
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isBlocked}
              className="w-full bg-slate-50 border-none rounded-2xl px-6 py-4 focus:ring-2 focus:ring-slate-900 outline-none transition-all font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              placeholder="********"
            />
          </div>

          {showCaptcha && !isBlocked && (
            <div className="border-2 border-slate-200 rounded-xl p-4 bg-slate-50">
              <div className="flex items-center gap-2 mb-3">
                <CheckCircle2 className="w-4 h-4 text-slate-600" />
                <p className="text-xs font-black text-slate-600 uppercase tracking-wider">
                  Verificacao de Seguranca
                </p>
              </div>
              <CaptchaWidget
                key={captchaRenderKey}
                onVerify={(token) => {
                  setCaptchaToken(token)
                  setError('')
                }}
                onError={() => {
                  setCaptchaToken(null)
                  setError('Nao foi possivel concluir a verificacao de seguranca. Tente novamente.')
                }}
                onExpire={() => {
                  setCaptchaToken(null)
                  setError('A verificacao de seguranca expirou. Tente novamente.')
                }}
                theme="light"
                size="normal"
              />
            </div>
          )}

          <button
            type="submit"
            disabled={loading || isBlocked || (showCaptcha && !captchaToken) || !canAttempt}
            className="w-full bg-slate-900 text-white py-5 rounded-2xl font-black text-lg shadow-xl shadow-slate-200 hover:bg-slate-800 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3"
          >
            {loading ? (
              <>
                <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                <span>Verificando...</span>
              </>
            ) : isBlocked ? (
              <>
                <ShieldAlert className="w-5 h-5" />
                <span>Bloqueado</span>
              </>
            ) : (
              'Entrar no Painel'
            )}
          </button>
        </form>

        <div className="mt-10 text-center">
          <button
            onClick={() => navigate('/')}
            className="text-slate-400 text-xs font-bold hover:text-slate-900 transition-colors uppercase tracking-widest"
          >
            Voltar para o site
          </button>
        </div>
      </div>

      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-5px); }
          75% { transform: translateX(5px); }
        }
        .animate-shake {
          animation: shake 0.2s ease-in-out 0s 2;
        }
      `}</style>
    </div>
  )
}

export default AdminLoginView
