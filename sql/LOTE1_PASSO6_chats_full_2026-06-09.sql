-- =====================================================================
-- LOTE 1 — PASSO 6 (ordem) — chats_full
-- security_invoker + revogar anon  (fecha IDOR de leitura de chats)
-- Data: 2026-06-09
-- =====================================================================
-- View consolidada de chats, lida por src/hooks/useMessages.ts (authenticated).
-- Hoje é owner-rights e a proteção era só o WHERE buyer_id/seller_id no client
-- -> qualquer authenticated poderia ler TODOS os chats. Base chats/messages já
-- tem RLS por participante -> ligar security_invoker faz a RLS-base valer.
-- authenticated mantém grant; anon revogado.
-- ALTER VIEW SET security_invoker NÃO reescreve a projeção (mínimo, sem risco).
-- =====================================================================

alter view public.chats_full set (security_invoker = true);
revoke all on table public.chats_full from anon;

-- VALIDAÇÃO:
--   usuário A logado: vê SÓ os próprios chats no app
--   A executa: select * from public.chats_full;  (sem filtro) -> retorna SÓ os de A
--   anon: NEGADO
--   regressão: lista de mensagens, contadores de não-lidas e janela de lead OK (useMessages)
--   reloptions confirma security_invoker=true:
--     select c.reloptions from pg_class c join pg_namespace n on n.oid=c.relnamespace
--     where n.nspname='public' and c.relname='chats_full';
--
-- ROLLBACK:
--   alter view public.chats_full set (security_invoker = false);
--   grant select on public.chats_full to anon;  -- se necessário
-- =====================================================================
