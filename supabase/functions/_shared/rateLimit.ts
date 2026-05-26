/**
 * Utilitário de rate limiting para Supabase Edge Functions.
 *
 * VULN-007 fix: Implementa rate limiting básico via tabela de contadores no Supabase.
 * Cada ação tem uma janela de tempo e um número máximo de requisições por usuário.
 *
 * Para uma solução mais robusta em produção, usar Redis via Upstash.
 * Esta implementação funciona sem dependências externas adicionais.
 */

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.48.1';

type RateLimitConfig = {
  /** Número máximo de requisições permitidas na janela de tempo */
  maxRequests: number;
  /** Janela de tempo em segundos */
  windowSeconds: number;
};

/** Configurações de rate limit por ação */
export const RATE_LIMITS: Record<string, RateLimitConfig> = {
  'validate-document': { maxRequests: 10, windowSeconds: 3600 },   // 10/hora
  'generate-news-article': { maxRequests: 30, windowSeconds: 86400 }, // 30/dia
  'capture-news-url': { maxRequests: 50, windowSeconds: 3600 },    // 50/hora
  'send-test-email': { maxRequests: 5, windowSeconds: 60 },         // 5/min
  'issue-nfse': { maxRequests: 20, windowSeconds: 3600 },           // 20/hora
};

type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  resetAt: string;
};

/**
 * Verifica se um usuário está dentro do rate limit para uma ação.
 *
 * Usa a função RPC `check_rate_limit` do banco de dados para atomicidade.
 * Se a função não existir, falha aberta (permite a requisição) para não
 * bloquear funcionalidades por falta de migração.
 */
export const checkRateLimit = async (
  supabaseAdmin: SupabaseClient,
  userId: string,
  action: string,
): Promise<RateLimitResult> => {
  const config = RATE_LIMITS[action];
  if (!config) {
    // Sem configuração de rate limit para esta ação — permitir
    return { allowed: true, remaining: 999, resetAt: new Date().toISOString() };
  }

  try {
    const { data, error } = await supabaseAdmin.rpc('check_rate_limit', {
      p_user_id: userId,
      p_action: action,
      p_max_requests: config.maxRequests,
      p_window_seconds: config.windowSeconds,
    });

    if (error) {
      // Se a função não existe no banco, falhar aberto (não bloquear)
      if (error.code === 'PGRST202' || error.message?.includes('does not exist')) {
        console.warn(`[rate-limit] RPC check_rate_limit não encontrada — permitindo ${action}`);
        return { allowed: true, remaining: config.maxRequests, resetAt: new Date().toISOString() };
      }
      console.error('[rate-limit] Erro ao verificar rate limit:', error);
      return { allowed: true, remaining: config.maxRequests, resetAt: new Date().toISOString() };
    }

    return {
      allowed: Boolean(data?.allowed ?? true),
      remaining: Number(data?.remaining ?? 0),
      resetAt: String(data?.reset_at ?? new Date().toISOString()),
    };
  } catch (err) {
    console.error('[rate-limit] Exceção ao verificar rate limit:', err);
    // Falhar aberto para não bloquear usuários por erros de infraestrutura
    return { allowed: true, remaining: 0, resetAt: new Date().toISOString() };
  }
};

/**
 * Cria um Response 429 Too Many Requests com os headers corretos.
 * Incluir no response sempre que checkRateLimit retornar allowed: false.
 */
export const rateLimitResponse = (
  corsHeaders: Record<string, string>,
  resetAt: string,
): Response =>
  new Response(
    JSON.stringify({
      success: false,
      error: 'Muitas requisições. Tente novamente mais tarde.',
      retryAfter: resetAt,
    }),
    {
      status: 429,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
        'Retry-After': new Date(resetAt).toUTCString(),
        'X-RateLimit-Reset': resetAt,
      },
    },
  );
