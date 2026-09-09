/**
 * Hook: useSecurityLog
 *
 * Registra tentativas de acesso não autorizado via RPC `SECURITY DEFINER`.
 *
 * A identidade NÃO é montada no navegador. `log_unauthorized_access`
 * deriva usuário e e-mail da própria sessão, no servidor. Enviar esses
 * campos do cliente permitia registrar evento em nome de outra conta.
 *
 * O IP **não** é mais detectado nem enviado. A versão anterior chamava
 * `api.ipify.org` do navegador — um IP não confiável, e o IP do usuário
 * indo para um terceiro a cada acesso não autorizado. A RPC grava IP
 * nulo. Para tê-lo com origem confiável, o registro precisaria passar
 * por Edge Function.
 *
 * O que este hook envia: rota e motivo. Só isso.
 *
 * Uso:
 * ```tsx
 * const { logUnauthorizedAccess } = useSecurityLog();
 *
 * await logUnauthorizedAccess({
 *   attemptedRoute: '/admin',
 *   reason: 'Insufficient role: user (required: admin)'
 * });
 * ```
 */

import { useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { debugLog } from '../utils/debugLog';
import { appError } from '../utils/appLogger';

// Tipos
export interface SecurityLogResult {
  success: boolean;
  eventId?: string;
  error?: string;
}

export interface UseSecurityLogReturn {
  logUnauthorizedAccess: (data: {
    attemptedRoute: string;
    reason?: string;
  }) => Promise<SecurityLogResult>;
}

/**
 * Hook para logging de eventos de segurança
 */
export const useSecurityLog = (): UseSecurityLogReturn => {
  /**
   * Registra uma tentativa de acesso não autorizado.
   *
   * Envia SOMENTE a rota e o motivo. Usuário, e-mail e IP são
   * responsabilidade do servidor — ver o cabeçalho deste arquivo.
   */
  const logUnauthorizedAccess = useCallback(async ({
    attemptedRoute,
    reason = 'Acesso não autorizado'
  }: {
    attemptedRoute: string;
    reason?: string;
  }): Promise<SecurityLogResult> => {
    try {
      const { data: result, error } = await supabase.rpc('log_unauthorized_access', {
        p_attempted_route: attemptedRoute,
        p_reason: reason
      });

      if (error) {
        appError('[useSecurityLog] Erro ao registrar acesso não autorizado', error, {
          attemptedRoute,
        });
        return { success: false, error: error.message };
      }

      debugLog('[useSecurityLog] Acesso não autorizado registrado:', result);
      return { success: true, eventId: result as string };
    } catch (error) {
      appError('[useSecurityLog] Erro inesperado ao registrar acesso não autorizado', error, {
        attemptedRoute,
      });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Erro desconhecido'
      };
    }
  }, []);

  return {
    logUnauthorizedAccess
  };
};

/**
 * Constantes úteis para severidade
 */
export const SEVERITY = {
  INFO: 'info' as const,
  WARNING: 'warning' as const,
  CRITICAL: 'critical' as const,
  BLOCKED: 'blocked' as const
};

/**
 * Constantes úteis para ações
 */
export const SECURITY_ACTIONS = {
  UNAUTHORIZED_ACCESS: 'unauthorized_access',
  INVALID_TOKEN: 'invalid_token',
  ROLE_INSUFFICIENT: 'role_insufficient',
  SUSPICIOUS_ACTIVITY: 'suspicious_activity',
  RATE_LIMIT_EXCEEDED: 'rate_limit_exceeded'
} as const;
