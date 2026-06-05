import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { KeyRound, QrCode, RefreshCcw, ShieldCheck } from 'lucide-react'
import { supabase } from '../src/lib/supabaseClient'
import { useAuth } from '../src/contexts/AuthContext'
import { toQrImageSrc } from '../src/lib/adminMfa'

const AdminMfaView: React.FC = () => {
  const navigate = useNavigate()
  const { user, isAdmin, isLoading, adminMfaState, refreshAdminMfaState, signOut, recordCompletedLogin } = useAuth()

  const [pendingFactorId, setPendingFactorId] = useState('')
  const [challengeFactorId, setChallengeFactorId] = useState('')
  const [qrCodeSrc, setQrCodeSrc] = useState('')
  const [verificationCode, setVerificationCode] = useState('')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [isBusy, setIsBusy] = useState(false)
  const [forceChallengeMode, setForceChallengeMode] = useState(false)
  const enrollmentRequestedRef = useRef(false)

  const primaryVerifiedFactor = useMemo(
    () => adminMfaState.verifiedTotpFactors[0]?.id || '',
    [adminMfaState.verifiedTotpFactors]
  )
  const activeChallengeFactorId = primaryVerifiedFactor || challengeFactorId

  const isDuplicateFriendlyNameError = (err: any) =>
    String(err?.message || '')
      .toLowerCase()
      .includes('friendly name "painel admin"')

  const listTotpFactors = async () => {
    const { data: factorsData, error: listError } = await supabase.auth.mfa.listFactors()
    if (listError) {
      throw listError
    }

    return Array.isArray(factorsData?.totp) ? factorsData.totp : []
  }

  const clearEnrollmentArtifacts = () => {
    setPendingFactorId('')
    setQrCodeSrc('')
  }

  const finalizeCompletedAdminLogin = async () => {
    const normalizedEmail = String(user?.email || '').trim().toLowerCase()

    await Promise.allSettled([
      recordCompletedLogin(),
      normalizedEmail
        ? supabase.rpc('register_admin_login_attempt', {
            p_email: normalizedEmail,
            p_success: true,
            p_reason: 'Login administrativo concluido com MFA valido.',
            p_user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null
          })
        : Promise.resolve(null)
    ])
  }

  const toSafeMfaErrorMessage = (
    err: any,
    fallback: string,
    options?: {
      invalidCodeMessage?: string
      expiredChallengeMessage?: string
    }
  ) => {
    const rawMessage = String(err?.message || '').trim().toLowerCase()

    if (!rawMessage) {
      return fallback
    }

    if (
      rawMessage.includes('code') &&
      (rawMessage.includes('invalid') || rawMessage.includes('expired') || rawMessage.includes('mismatch'))
    ) {
      return options?.invalidCodeMessage || 'Nao foi possivel validar o codigo. Confira o app autenticador e tente novamente.'
    }

    if (
      rawMessage.includes('challenge') &&
      (rawMessage.includes('expired') || rawMessage.includes('not found') || rawMessage.includes('not exist'))
    ) {
      return options?.expiredChallengeMessage || 'Sua verificacao expirou. Tente novamente para gerar um novo codigo.'
    }

    if (
      rawMessage.includes('session') ||
      rawMessage.includes('jwt') ||
      rawMessage.includes('token') ||
      rawMessage.includes('aal')
    ) {
      return 'Sua sessao precisa ser confirmada novamente. Volte ao login e tente outra vez.'
    }

    if (
      rawMessage.includes('network') ||
      rawMessage.includes('fetch') ||
      rawMessage.includes('timeout') ||
      rawMessage.includes('connection')
    ) {
      return 'Nao foi possivel concluir a verificacao agora. Confira sua conexao e tente novamente.'
    }

    return fallback
  }

  useEffect(() => {
    if (isLoading) {
      return
    }

    if (!user) {
      navigate('/admin/login', { replace: true })
      return
    }

    if (!isAdmin) {
      navigate('/minha-conta', { replace: true })
      return
    }

    if (adminMfaState.isLoaded && adminMfaState.currentLevel === 'aal2') {
      navigate('/admin', { replace: true })
    }
  }, [adminMfaState.currentLevel, adminMfaState.isLoaded, isAdmin, isLoading, navigate, user])

  useEffect(() => {
    if (
      isLoading ||
      !user ||
      !isAdmin ||
      !adminMfaState.isLoaded ||
      adminMfaState.currentLevel === 'aal2' ||
      !adminMfaState.requiresEnrollment ||
      pendingFactorId ||
      enrollmentRequestedRef.current
    ) {
      return
    }

    enrollmentRequestedRef.current = true
    void beginEnrollment()
  }, [
    adminMfaState.currentLevel,
    adminMfaState.isLoaded,
    adminMfaState.requiresEnrollment,
    forceChallengeMode,
    isAdmin,
    isLoading,
    pendingFactorId,
    user
  ])

  const resetEnrollmentState = () => {
    clearEnrollmentArtifacts()
    setVerificationCode('')
  }

  const activateExistingAuthenticatorFlow = async (factorId: string) => {
    clearEnrollmentArtifacts()
    setChallengeFactorId(factorId)
    setForceChallengeMode(true)
    setError('')
    setInfo('Digite o codigo atual do seu app autenticador para continuar.')
    await refreshAdminMfaState()
  }

  const recoverDuplicateFriendlyName = async () => {
    const totpFactors = await listTotpFactors()
    const sameNameFactors = totpFactors.filter((factor: any) => {
      const friendlyName = String(factor?.friendly_name || factor?.friendlyName || '').trim().toLowerCase()
      return friendlyName === 'painel admin'
    })

    const verifiedFactor = sameNameFactors.find((factor: any) => factor?.status === 'verified')

    if (verifiedFactor?.id) {
      await activateExistingAuthenticatorFlow(String(verifiedFactor.id))
      return { resolved: true, shouldRetryEnrollment: false }
    }

    const unverifiedFactors = sameNameFactors.filter((factor: any) => factor?.id && factor?.status !== 'verified')

    if (unverifiedFactors.length > 0) {
      for (const factor of unverifiedFactors) {
        await supabase.auth.mfa.unenroll({ factorId: String(factor.id) }).catch(() => null)
      }
      return { resolved: false, shouldRetryEnrollment: true }
    }

    setError('Ja existe uma configuracao em andamento para esta conta. Use o codigo atual do app autenticador para continuar.')
    setForceChallengeMode(true)
    return { resolved: true, shouldRetryEnrollment: false }
  }

  const beginEnrollment = async (allowRetryAfterDuplicate = true) => {
    setIsBusy(true)
    setError('')
    setInfo('')
    setForceChallengeMode(false)
    setChallengeFactorId('')

    try {
      const totpFactors = await listTotpFactors()
      const unverifiedFactors = totpFactors.filter((factor: any) => factor?.status !== 'verified')

      for (const factor of unverifiedFactors) {
        if (factor?.id) {
          await supabase.auth.mfa.unenroll({ factorId: String(factor.id) }).catch(() => null)
        }
      }

      const { data: enrollData, error: enrollError } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        issuer: 'AGRO BW',
        friendlyName: 'Painel Admin'
      })

      if (enrollError) {
        if (isDuplicateFriendlyNameError(enrollError)) {
          const duplicateResolution = await recoverDuplicateFriendlyName()
          if (duplicateResolution.shouldRetryEnrollment && allowRetryAfterDuplicate) {
            await beginEnrollment(false)
          }
          return
        }

        throw enrollError
      }

      setPendingFactorId(String(enrollData?.id || ''))
      setQrCodeSrc(toQrImageSrc(enrollData?.totp?.qr_code || ''))
      setChallengeFactorId('')
      setInfo('Escaneie o QR Code e confirme com o codigo de 6 digitos.')
      await refreshAdminMfaState()
    } catch (err: any) {
      enrollmentRequestedRef.current = false
      resetEnrollmentState()
      setError(toSafeMfaErrorMessage(err, 'Nao foi possivel iniciar a verificacao. Tente novamente.'))
    } finally {
      setIsBusy(false)
    }
  }

  const verifyEnrollment = async () => {
    if (!pendingFactorId || verificationCode.trim().length < 6) {
      setError('Informe o codigo de 6 digitos do app autenticador.')
      return
    }

    setIsBusy(true)
    setError('')

    try {
      const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({
        factorId: pendingFactorId
      })

      if (challengeError) {
        throw challengeError
      }

      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId: pendingFactorId,
        challengeId: String(challengeData?.id || ''),
        code: verificationCode.trim()
      })

      if (verifyError) {
        throw verifyError
      }

      await supabase.auth.refreshSession()
      await refreshAdminMfaState()
      await finalizeCompletedAdminLogin()
      navigate('/admin', { replace: true })
    } catch (err: any) {
      setError(
        toSafeMfaErrorMessage(err, 'Nao foi possivel concluir a verificacao. Tente novamente.', {
          invalidCodeMessage: 'Nao foi possivel validar o codigo. Confira o app autenticador e tente novamente.',
          expiredChallengeMessage: 'A verificacao expirou. Gere um novo QR Code e tente outra vez.'
        })
      )
    } finally {
      setIsBusy(false)
    }
  }

  const verifyChallenge = async () => {
    if (!activeChallengeFactorId) {
      setError('Nao foi possivel localizar a verificacao desta conta. Tente entrar novamente.')
      return
    }

    if (verificationCode.trim().length < 6) {
      setError('Informe o codigo de 6 digitos do app autenticador.')
      return
    }

    setIsBusy(true)
    setError('')

    try {
      const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({
        factorId: activeChallengeFactorId
      })

      if (challengeError) {
        throw challengeError
      }

      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId: activeChallengeFactorId,
        challengeId: String(challengeData?.id || ''),
        code: verificationCode.trim()
      })

      if (verifyError) {
        throw verifyError
      }

      await supabase.auth.refreshSession()
      await refreshAdminMfaState()
      await finalizeCompletedAdminLogin()
      navigate('/admin', { replace: true })
    } catch (err: any) {
      setError(
        toSafeMfaErrorMessage(err, 'Nao foi possivel validar o codigo. Tente novamente.', {
          invalidCodeMessage: 'Nao foi possivel validar o codigo. Confira o app autenticador e tente novamente.',
          expiredChallengeMessage: 'Sua verificacao expirou. Tente novamente para continuar.'
        })
      )
    } finally {
      setIsBusy(false)
    }
  }

  if (isLoading || !user || !isAdmin || !adminMfaState.isLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white">
        <div className="text-center">
          <div className="w-12 h-12 border-2 border-white/20 border-t-white rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-sm font-semibold">Preparando a seguranca do painel...</p>
        </div>
      </div>
    )
  }

  const isEnrollmentMode = adminMfaState.requiresEnrollment && !forceChallengeMode

  return (
    <div className="min-h-screen bg-slate-950 flex items-start md:items-center justify-center px-3 sm:px-4 py-3 sm:py-6 md:py-10 overflow-y-auto">
      <div className="w-full max-w-lg rounded-[1.75rem] bg-white shadow-2xl p-5 sm:p-7 md:p-8 max-h-[calc(100vh-1.5rem)] sm:max-h-[calc(100vh-3rem)] overflow-y-auto">
        <div className="flex flex-col sm:flex-row sm:items-start gap-4 mb-6 sm:mb-7">
          <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
            <ShieldCheck className="w-6 h-6 sm:w-7 sm:h-7" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-slate-900">Confirmacao em duas etapas</h1>
            <p className="text-sm leading-6 text-slate-500 mt-1">
              Confirme seu acesso para continuar.
            </p>
          </div>
        </div>

        {error && (
          <div className="mb-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
            {error}
          </div>
        )}

        {info && (
          <div className="mb-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
            {info}
          </div>
        )}

        {isEnrollmentMode ? (
          <div className="space-y-6">
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4 sm:p-5">
              <div className="flex items-center gap-2 text-slate-900 font-bold mb-3">
                <QrCode className="w-5 h-5" />
                <span>Configurar app autenticador</span>
              </div>
              <div className="space-y-4">
                <p className="text-sm leading-6 text-slate-500">
                  Escaneie o QR Code no seu app autenticador. Se precisar, gere um novo QR Code.
                </p>

                <div className="flex justify-center">
                  {qrCodeSrc ? (
                    <img
                      src={qrCodeSrc}
                      alt="QR Code do Google Authenticator"
                      className="w-40 h-40 sm:w-44 sm:h-44 rounded-2xl border border-slate-200 bg-white p-3 shrink-0"
                    />
                  ) : (
                    <div className="w-40 h-40 sm:w-44 sm:h-44 rounded-2xl border border-dashed border-slate-300 bg-white flex items-center justify-center text-sm text-slate-400 text-center px-4 shrink-0">
                      Gerando QR Code...
                    </div>
                  )}
                </div>

              </div>
            </div>

            <div>
              <label className="block text-[11px] font-black uppercase tracking-[0.18em] text-slate-500 mb-2">
                Codigo de 6 digitos
              </label>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={verificationCode}
                onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className="w-full rounded-2xl border border-slate-200 px-4 sm:px-5 py-3.5 sm:py-4 text-base sm:text-lg font-bold tracking-[0.28em] sm:tracking-[0.35em] text-center outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                placeholder="000000"
              />
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={verifyEnrollment}
                disabled={isBusy || !pendingFactorId}
                className="flex-1 rounded-2xl bg-slate-900 text-white py-3.5 sm:py-4 font-black hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isBusy ? 'Validando...' : 'Ativar autenticador'}
              </button>
              <button
                type="button"
                onClick={() => {
                  enrollmentRequestedRef.current = true
                  void beginEnrollment()
                }}
                disabled={isBusy}
                className="rounded-2xl border border-slate-200 py-3.5 sm:py-4 px-4 sm:px-5 font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
              >
                <RefreshCcw className="w-4 h-4" />
                Gerar novo QR Code
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4 sm:p-5">
              <div className="flex items-center gap-2 text-slate-900 font-bold mb-3">
                <KeyRound className="w-5 h-5" />
                <span>Digite o codigo do app autenticador</span>
              </div>
              <p className="text-sm leading-6 text-slate-500">
                Use o codigo atual para continuar.
              </p>
            </div>

            <div>
              <label className="block text-[11px] font-black uppercase tracking-[0.18em] text-slate-500 mb-2">
                Codigo de 6 digitos
              </label>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={verificationCode}
                onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className="w-full rounded-2xl border border-slate-200 px-4 sm:px-5 py-3.5 sm:py-4 text-base sm:text-lg font-bold tracking-[0.28em] sm:tracking-[0.35em] text-center outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                placeholder="000000"
              />
            </div>

            <button
              type="button"
              onClick={verifyChallenge}
              disabled={isBusy || !activeChallengeFactorId}
              className="w-full rounded-2xl bg-slate-900 text-white py-3.5 sm:py-4 font-black hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isBusy ? 'Validando...' : 'Liberar painel'}
            </button>
          </div>
        )}

        <div className="mt-6 sm:mt-8 pt-4 sm:pt-6 border-t border-slate-100 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div />
          <button
            type="button"
            onClick={() => void signOut().then(() => navigate('/admin/login', { replace: true }))}
            className="text-sm font-bold text-slate-700 hover:text-slate-900 text-left sm:text-right"
          >
            Sair e voltar ao login
          </button>
        </div>
      </div>
    </div>
  )
}

export default AdminMfaView
