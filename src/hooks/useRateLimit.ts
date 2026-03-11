import { useState, useEffect } from 'react';

/**
 * Hook para Rate Limiting (proteção contra brute force)
 * 
 * Controla tentativas de login/ações baseado em:
 * - Número de tentativas
 * - Janela de tempo
 * - Bloqueio temporário
 * 
 * @param key - Identificador único (ex: 'admin-login', 'password-reset')
 * @param maxAttempts - Máximo de tentativas permitidas (padrão: 5)
 * @param windowMs - Janela de tempo em ms (padrão: 15 min)
 * @param blockDurationMs - Duração do bloqueio em ms (padrão: 30 min)
 */

interface RateLimitState {
  attempts: number;
  blockedUntil: number | null;
  lastAttemptAt: number;
}

interface UseRateLimitReturn {
  canAttempt: boolean;
  remainingAttempts: number;
  isBlocked: boolean;
  blockedUntil: Date | null;
  recordAttempt: () => void;
  reset: () => void;
  timeUntilUnblock: number; // segundos
}

export const useRateLimit = (
  key: string,
  maxAttempts: number = 5,
  windowMs: number = 15 * 60 * 1000, // 15 minutos
  blockDurationMs: number = 30 * 60 * 1000 // 30 minutos
): UseRateLimitReturn => {
  const storageKey = `ratelimit_${key}`;
  
  const getState = (): RateLimitState => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const state: RateLimitState = JSON.parse(stored);
        
        // Verificar se janela de tempo expirou
        const now = Date.now();
        if (now - state.lastAttemptAt > windowMs) {
          // Reset automático após janela de tempo
          return { attempts: 0, blockedUntil: null, lastAttemptAt: now };
        }
        
        return state;
      }
    } catch (error) {
      console.error('[RateLimit] Erro ao ler estado:', error);
    }
    
    return { attempts: 0, blockedUntil: null, lastAttemptAt: Date.now() };
  };

  const [state, setState] = useState<RateLimitState>(getState);
  const [timeUntilUnblock, setTimeUntilUnblock] = useState(0);

  // Atualizar contador de tempo até desbloqueio
  useEffect(() => {
    if (!state.blockedUntil) {
      setTimeUntilUnblock(0);
      return;
    }

    const updateTimer = () => {
      const now = Date.now();
      const remaining = Math.ceil((state.blockedUntil! - now) / 1000);
      
      if (remaining <= 0) {
        // Desbloqueio automático
        setState({ attempts: 0, blockedUntil: null, lastAttemptAt: now });
        setTimeUntilUnblock(0);
      } else {
        setTimeUntilUnblock(remaining);
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);

    return () => clearInterval(interval);
  }, [state.blockedUntil]);

  // Salvar estado no localStorage sempre que mudar
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(state));
    } catch (error) {
      console.error('[RateLimit] Erro ao salvar estado:', error);
    }
  }, [state, storageKey]);

  const canAttempt = (): boolean => {
    const now = Date.now();
    
    // Verificar se está bloqueado
    if (state.blockedUntil && now < state.blockedUntil) {
      return false;
    }
    
    // Verificar se atingiu limite de tentativas
    if (state.attempts >= maxAttempts) {
      return false;
    }
    
    return true;
  };

  const recordAttempt = () => {
    const now = Date.now();
    const newAttempts = state.attempts + 1;
    
    // Se atingiu limite, bloquear
    if (newAttempts >= maxAttempts) {
      const blockedUntil = now + blockDurationMs;
      setState({
        attempts: newAttempts,
        blockedUntil,
        lastAttemptAt: now
      });
      
      console.warn(
        `[RateLimit] Bloqueado por excesso de tentativas. Desbloqueio em ${blockDurationMs / 60000} minutos.`
      );
    } else {
      setState({
        attempts: newAttempts,
        blockedUntil: null,
        lastAttemptAt: now
      });
    }
  };

  const reset = () => {
    setState({
      attempts: 0,
      blockedUntil: null,
      lastAttemptAt: Date.now()
    });
    
    try {
      localStorage.removeItem(storageKey);
    } catch (error) {
      console.error('[RateLimit] Erro ao limpar estado:', error);
    }
  };

  const remainingAttempts = Math.max(0, maxAttempts - state.attempts);
  const isBlocked = state.blockedUntil ? Date.now() < state.blockedUntil : false;
  const blockedUntilDate = state.blockedUntil ? new Date(state.blockedUntil) : null;

  return {
    canAttempt: canAttempt(),
    remainingAttempts,
    isBlocked,
    blockedUntil: blockedUntilDate,
    recordAttempt,
    reset,
    timeUntilUnblock
  };
};

/**
 * Formatar tempo restante para exibição
 * @param seconds - Segundos restantes
 * @returns String formatada (ex: "5m 30s", "1h 20m")
 */
export const formatTimeRemaining = (seconds: number): string => {
  if (seconds <= 0) return '0s';
  
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  } else {
    return `${secs}s`;
  }
};
