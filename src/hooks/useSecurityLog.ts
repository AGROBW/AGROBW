/**
 * Hook: useSecurityLog
 * 
 * Facilita o registro de eventos de segurança (tentativas de acesso não autorizado)
 * usando a função SECURITY DEFINER do Supabase.
 * 
 * Features:
 * - Detecção automática de IP e User Agent
 * - Função simplificada para logging
 * - Tipos TypeScript completos
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

// Tipos
export interface SecurityEventData {
  userId?: string;
  email?: string;
  attemptedRoute: string;
  attemptedAction?: string;
  ipAddress?: string;
  userAgent?: string;
  severity?: 'info' | 'warning' | 'critical' | 'blocked';
  reason?: string;
  metadata?: Record<string, any>;
}

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
  
  logSecurityEvent: (data: SecurityEventData) => Promise<SecurityLogResult>;
}

/**
 * Hook para logging de eventos de segurança
 */
export const useSecurityLog = (): UseSecurityLogReturn => {
  /**
   * Função completa para logar qualquer evento de segurança
   * com todos os parâmetros disponíveis
   */
  const logSecurityEvent = useCallback(async (data: SecurityEventData): Promise<SecurityLogResult> => {
    try {
      // Detectar informações de rede (se não fornecidas)
      const userAgent = data.userAgent || navigator.userAgent;
      
      // Chamar função RPC completa do Supabase
      const { data: result, error } = await supabase.rpc('log_security_event', {
        p_user_id: data.userId || null,
        p_email: data.email || null,
        p_attempted_route: data.attemptedRoute,
        p_attempted_action: data.attemptedAction || null,
        p_ip_address: data.ipAddress || null, // IP será detectado no servidor se possível
        p_user_agent: userAgent,
        p_severity: data.severity || 'warning',
        p_reason: data.reason || null,
        p_metadata: data.metadata ? JSON.stringify(data.metadata) : '{}'
      });

      if (error) {
        console.error('[useSecurityLog] Erro ao registrar evento completo:', error);
        return {
          success: false,
          error: error.message
        };
      }

      console.log('[useSecurityLog] Evento de segurança completo registrado:', result);
      
      return {
        success: true,
        eventId: result as string
      };
    } catch (error) {
      console.error('[useSecurityLog] Erro inesperado no evento completo:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Erro desconhecido'
      };
    }
  }, []);

  /**
   * Função simplificada para logar acesso não autorizado
   * Detecta automaticamente o usuário logado, IP e informações de rede
   */
  const logUnauthorizedAccess = useCallback(async ({
    attemptedRoute,
    reason = 'Acesso não autorizado'
  }: {
    attemptedRoute: string;
    reason?: string;
  }): Promise<SecurityLogResult> => {
    try {
      // Buscar usuário atual do Supabase
      const { data: { user } } = await supabase.auth.getUser();
      
      // Detectar IP do cliente (async, não bloqueia)
      let ipAddress: string | null = null;
      try {
        // Timeout manual para não travar o log
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000); // 3s timeout
        
        const ipData = await fetch('https://api.ipify.org?format=json', {
          signal: controller.signal
        });
        clearTimeout(timeoutId);
        
        const { ip } = await ipData.json();
        ipAddress = ip;
      } catch (ipError) {
        console.warn('[useSecurityLog] Não foi possível detectar IP:', ipError);
        // Continua sem IP
      }

      // Detectar user agent
      const userAgent = navigator.userAgent;

      // Usar função completa internamente
      return await logSecurityEvent({
        userId: user?.id,
        email: user?.email,
        attemptedRoute,
        attemptedAction: 'unauthorized_access',
        ipAddress: ipAddress || undefined,
        userAgent,
        severity: 'blocked',
        reason
      });
    } catch (error) {
      console.error('[useSecurityLog] Erro inesperado:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Erro desconhecido'
      };
    }
  }, [logSecurityEvent]);

  return {
    logUnauthorizedAccess,
    logSecurityEvent
  };
};

/**
 * Função utilitária para obter o IP do cliente (se disponível)
 * Nota: Em produção, o IP é melhor detectado no servidor (Edge Function ou API)
 * Esta função tenta detectar via headers ou APIs públicas (não recomendado para produção)
 */
export const getClientIP = async (): Promise<string | null> => {
  try {
    // Tentativa 1: Usar API pública (não recomendado em produção por latência)
    const response = await fetch('https://api.ipify.org?format=json');
    const data = await response.json();
    return data.ip || null;
  } catch (error) {
    console.warn('[getClientIP] Não foi possível detectar IP:', error);
    return null;
  }
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
