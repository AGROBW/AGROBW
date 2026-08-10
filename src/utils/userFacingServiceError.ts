export type UserFacingServiceErrorKind =
  | 'network'
  | 'session'
  | 'permission'
  | 'unavailable'
  | 'unknown'

export interface UserFacingServiceError {
  kind: UserFacingServiceErrorKind
  title: string
  description: string
}

const ERROR_TEXT_FIELDS = [
  'message',
  'details',
  'hint',
  'error_description',
  'statusText',
] as const

const collectErrorText = (error: unknown, depth = 0): string => {
  if (!error || depth > 2) return ''
  if (typeof error === 'string') return error
  if (error instanceof Error) return `${error.name} ${error.message}`
  if (typeof error !== 'object') return String(error)

  const record = error as Record<string, unknown>
  const directText = ERROR_TEXT_FIELDS
    .map((field) => record[field])
    .filter((value): value is string => typeof value === 'string')

  return [
    ...directText,
    collectErrorText(record.error, depth + 1),
    collectErrorText(record.context, depth + 1),
  ].filter(Boolean).join(' ')
}

const getErrorStatus = (error: unknown): number => {
  if (!error || typeof error !== 'object') return 0
  const record = error as Record<string, unknown>
  const context = record.context && typeof record.context === 'object'
    ? record.context as Record<string, unknown>
    : null
  const nested = record.error && typeof record.error === 'object'
    ? record.error as Record<string, unknown>
    : null

  return Number(
    record.status ||
    record.statusCode ||
    context?.status ||
    context?.statusCode ||
    nested?.status ||
    nested?.statusCode ||
    0
  )
}

export const classifyUserFacingServiceError = (
  error: unknown,
  isOnline = typeof navigator === 'undefined' ? true : navigator.onLine
): UserFacingServiceError => {
  const text = collectErrorText(error).toLowerCase()
  const status = getErrorStatus(error)
  const code = error && typeof error === 'object'
    ? String((error as Record<string, unknown>).code || '').toUpperCase()
    : ''

  if (
    status === 401 ||
    code === 'PGRST301' ||
    text.includes('jwt') ||
    text.includes('unauthorized') ||
    text.includes('invalid claim')
  ) {
    return {
      kind: 'session',
      title: 'Sua sessão precisa ser renovada',
      description: 'Entre novamente para continuar usando sua conta.',
    }
  }

  if (
    !isOnline ||
    text.includes('failed to fetch') ||
    text.includes('fetch failed') ||
    text.includes('networkerror') ||
    text.includes('network request failed') ||
    text.includes('name_not_resolved') ||
    text.includes('load failed')
  ) {
    return {
      kind: 'network',
      title: 'Sem conexão com o servidor',
      description: 'Verifique sua internet e tente novamente.',
    }
  }

  if (status === 403 || code === '42501' || text.includes('permission denied')) {
    return {
      kind: 'permission',
      title: 'Acesso não permitido',
      description: 'Você não tem permissão para realizar esta ação.',
    }
  }

  if (
    status >= 500 ||
    status === 408 ||
    status === 504 ||
    text.includes('timeout') ||
    text.includes('timed out')
  ) {
    return {
      kind: 'unavailable',
      title: 'Serviço temporariamente indisponível',
      description: 'Tente novamente em alguns instantes.',
    }
  }

  return {
    kind: 'unknown',
    title: 'Não foi possível atualizar seus dados',
    description: 'Tente novamente em alguns instantes.',
  }
}
