-- =====================================================================
-- SECURITY HYGIENE — DEDUP DE POLICIES REDUNDANTES
-- Data: 2026-06-07
-- =====================================================================
-- Limpeza secundária (NÃO é correção de brecha — policies duplicadas são
-- permissivas idênticas e produzem o mesmo resultado). Remove as duplicatas
-- de "leitura própria" em users e user_subscriptions, mantendo UMA policy
-- canônica por ação. Antes de remover a duplicata, GARANTE que a canônica
-- existe — assim nunca se deixa a tabela sem o acesso necessário.
--
-- Idempotente e transacional. Você executa no Supabase SQL Editor.
-- Pré-requisito: já aplicado sql/SECURITY_FIX_RLS_PRIVS_2026-06-07.sql.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. DESCOBERTA (rode ANTES, separadamente, para conferir o estado real)
-- ---------------------------------------------------------------------
-- select tablename, policyname, cmd, roles, qual, with_check
-- from pg_policies
-- where schemaname='public' and tablename in ('users','user_subscriptions')
-- order by tablename, cmd, policyname;
--
-- Esperado de duplicatas redundantes (USING idêntico = auth.uid() = id/user_id):
--   users:              "users_select_own"  ==  "Users can view their own data"
--   user_subscriptions: "Users can view their own subscriptions" == "Users can view own subscriptions"
-- ---------------------------------------------------------------------

begin;

-- ===== users: SELECT-own =====
-- Garante a canônica "Users can view their own data" (authenticated, auth.uid()=id)
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='users'
      and policyname='Users can view their own data'
  ) then
    execute $p$
      create policy "Users can view their own data"
        on public.users for select to authenticated
        using (auth.uid() = id)
    $p$;
  end if;
end $$;

-- Remove a duplicata criada no Bloco 1
drop policy if exists "users_select_own" on public.users;

-- ===== user_subscriptions: SELECT-own =====
-- Garante a canônica "Users can view own subscriptions" (authenticated, auth.uid()=user_id)
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='user_subscriptions'
      and policyname='Users can view own subscriptions'
  ) then
    execute $p$
      create policy "Users can view own subscriptions"
        on public.user_subscriptions for select to authenticated
        using (auth.uid() = user_id)
    $p$;
  end if;
end $$;

-- Remove a duplicata redundante
drop policy if exists "Users can view their own subscriptions" on public.user_subscriptions;

commit;

-- ---------------------------------------------------------------------
-- VERIFICAÇÃO (rode após o COMMIT) — deve sobrar UMA SELECT-own por tabela
-- ---------------------------------------------------------------------
-- select tablename, policyname, cmd, roles, qual
-- from pg_policies
-- where schemaname='public' and tablename in ('users','user_subscriptions') and cmd='SELECT'
-- order by tablename, policyname;
--
-- users: deve conter "Users can view their own data" (own) + "Admins can view all users" (aal2)
-- user_subscriptions: deve conter "Users can view own subscriptions" (own) + "Admin can view all subscriptions" (aal2)
-- ---------------------------------------------------------------------
