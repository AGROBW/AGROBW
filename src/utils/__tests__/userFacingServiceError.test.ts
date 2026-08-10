import { describe, expect, it } from 'vitest'
import { classifyUserFacingServiceError } from '../userFacingServiceError'

describe('classifyUserFacingServiceError', () => {
  it('classifica falha de DNS/fetch como conexao', () => {
    expect(classifyUserFacingServiceError({ message: 'TypeError: Failed to fetch' }, true)).toEqual({
      kind: 'network',
      title: 'Sem conexão com o servidor',
      description: 'Verifique sua internet e tente novamente.',
    })
  })

  it('classifica navegador offline como conexao mesmo sem mensagem tecnica', () => {
    expect(classifyUserFacingServiceError({}, false).kind).toBe('network')
  })

  it('classifica sessao invalida antes das demais categorias', () => {
    expect(classifyUserFacingServiceError({ status: 401, message: 'Invalid JWT' }, true).kind).toBe('session')
  })

  it('classifica falta de permissao', () => {
    expect(classifyUserFacingServiceError({ code: '42501', message: 'permission denied' }, true).kind).toBe('permission')
  })

  it('classifica indisponibilidade temporaria', () => {
    expect(classifyUserFacingServiceError({ status: 503 }, true).kind).toBe('unavailable')
  })

  it('usa mensagem generica sem expor o provedor', () => {
    const result = classifyUserFacingServiceError({ message: 'Unexpected database error' }, true)

    expect(result.kind).toBe('unknown')
    expect(`${result.title} ${result.description}`.toLowerCase()).not.toContain('supabase')
  })
})
