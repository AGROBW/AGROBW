/**
 * Módulo de segurança de sessão do usuário.
 *
 * VULN-013 fix: Implementa idle timeout automático — sessões são encerradas
 * após 30 minutos de inatividade do usuário para minimizar o risco de
 * sessões comprometidas de longa duração.
 *
 * Tokens de sessão são armazenados no localStorage e acessíveis a qualquer
 * JavaScript na página (incluindo XSS). O timeout de inatividade limita a
 * janela de exploração em caso de comprometimento do token.
 */

import { supabase } from './supabaseClient';

/** Tempo máximo de inatividade antes do logout automático: 30 minutos */
const IDLE_TIMEOUT_MS = 30 * 60 * 1000;

/** Eventos de usuário que indicam atividade */
const ACTIVITY_EVENTS: ReadonlyArray<keyof WindowEventMap> = [
  'mousedown',
  'mousemove',
  'keydown',
  'scroll',
  'touchstart',
  'click',
  'focus',
];

let idleTimer: ReturnType<typeof setTimeout> | null = null;
let listenerAttached = false;

/** Reinicia o timer de inatividade */
const resetIdleTimer = () => {
  if (idleTimer !== null) {
    clearTimeout(idleTimer);
  }

  idleTimer = setTimeout(async () => {
    console.warn('[session] Sessão encerrada por inatividade.');
    await supabase.auth.signOut();
    // Redirecionar para login com aviso de inatividade
    window.location.href = '/login?reason=inactivity';
  }, IDLE_TIMEOUT_MS);
};

/**
 * Inicializa o monitoramento de inatividade.
 * Deve ser chamado uma única vez após autenticação bem-sucedida.
 * Retorna uma função de cleanup para remover os event listeners.
 */
export const startIdleSessionMonitor = (): (() => void) => {
  if (listenerAttached) {
    return stopIdleSessionMonitor;
  }

  listenerAttached = true;
  resetIdleTimer();

  const handler = () => resetIdleTimer();

  ACTIVITY_EVENTS.forEach((event) => {
    window.addEventListener(event, handler, { passive: true });
  });

  return () => {
    ACTIVITY_EVENTS.forEach((event) => {
      window.removeEventListener(event, handler);
    });
    listenerAttached = false;
    stopIdleSessionMonitor();
  };
};

/** Para o monitoramento e limpa o timer */
export const stopIdleSessionMonitor = (): void => {
  if (idleTimer !== null) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }
};

// ─── Lógica de refresh de sessão (mantida do arquivo original) ─────────────

let refreshSessionPromise: Promise<boolean> | null = null;

export const isSupabaseUnauthorizedError = (error: unknown): boolean => {
  if (!error) return false;

  const err = error as Record<string, unknown>;
  const status = Number(err.status || err.statusCode || err.code);
  const message = String(
    err.message || err.error_description || err.details || '',
  ).toLowerCase();

  return (
    status === 401 ||
    err.code === 'PGRST301' ||
    message.includes('jwt') ||
    message.includes('token') ||
    message.includes('unauthorized') ||
    message.includes('invalid claim')
  );
};

export const refreshSupabaseSession = async (): Promise<boolean> => {
  if (refreshSessionPromise) return refreshSessionPromise;

  refreshSessionPromise = (async () => {
    const { data: currentSession } = await supabase.auth.getSession();

    if (!currentSession.session) {
      return false;
    }

    const { data, error } = await supabase.auth.refreshSession();
    return !error && !!data.session;
  })();

  try {
    return await refreshSessionPromise;
  } finally {
    refreshSessionPromise = null;
  }
};
