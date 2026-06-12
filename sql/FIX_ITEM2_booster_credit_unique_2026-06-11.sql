-- =====================================================================
-- ITEM 2 (hardening) — dedup ATÔMICA do crédito de booster (anti-corrida)
-- Data: 2026-06-11
-- =====================================================================
-- Fecha o resíduo teórico de corrida: a dedup por provider_payment_id era
-- select-then-insert (não atômica). Adiciona UNIQUE parcial + ON CONFLICT na RPC,
-- tornando o double-credit impossível mesmo sob entrega concorrente.
-- Camadas já existentes (mantidas): Achado 1 (registry event_id) + dedup no
-- webhook-asaas + confirmação via API (Achado 2).
-- =====================================================================

-- (1) PRÉ-CHECK (read-only): não deve haver provider_payment_id duplicado.
--     Se retornar linhas, resolver os duplicados ANTES de criar o índice.
--   select provider_payment_id, count(*)
--   from public.user_highlight_booster_purchases
--   where provider_payment_id is not null
--   group by provider_payment_id having count(*) > 1;

-- (2) Índice único parcial (ignora nulos). Tabela de baixo volume -> create simples.
--     (Alternativa sem lock: rodar FORA de transação com CREATE UNIQUE INDEX CONCURRENTLY.)
create unique index if not exists uq_booster_purchase_provider_payment_id
  on public.user_highlight_booster_purchases (provider_payment_id)
  where provider_payment_id is not null;

-- (3) RPC: insert idempotente (ON CONFLICT DO NOTHING) + retorno idempotente no conflito.
create or replace function public.register_highlight_booster_purchase(
  p_user_id uuid,
  p_booster_id uuid,
  p_payment_id uuid default null,
  p_provider_payment_id text default null,
  p_amount numeric default 0
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_recent_purchases_count integer := 0;
  v_booster record;
  v_purchase_id uuid;
begin
  select *
  into v_booster
  from public.highlight_boosters
  where id = p_booster_id
    and is_active = true
  limit 1;

  if v_booster is null then
    return jsonb_build_object(
      'success', false,
      'error', 'Booster nao encontrado ou inativo'
    );
  end if;

  -- Dedup atômica: se este provider_payment_id já foi creditado, retornar idempotente
  -- ANTES do limite de 30 dias (um replay/corrida não pode falhar por limite).
  if p_provider_payment_id is not null then
    select id into v_purchase_id
    from public.user_highlight_booster_purchases
    where provider_payment_id = p_provider_payment_id
    limit 1;

    if v_purchase_id is not null then
      return jsonb_build_object(
        'success', true,
        'already_credited', true,
        'purchase_id', v_purchase_id,
        'booster_name', v_booster.name,
        'category_credits', coalesce(v_booster.category_credits, 0),
        'home_credits', coalesce(v_booster.home_credits, 0)
      );
    end if;
  end if;

  select count(*)
  into v_recent_purchases_count
  from public.user_highlight_booster_purchases
  where user_id = p_user_id
    and booster_id = p_booster_id
    and status = 'credited'
    and created_at >= (now() - interval '30 days');

  if v_recent_purchases_count >= coalesce(v_booster.max_purchases_per_30_days, 2) then
    return jsonb_build_object(
      'success', false,
      'error', format('Limite de %s booster(s) a cada 30 dias atingido.', coalesce(v_booster.max_purchases_per_30_days, 2))
    );
  end if;

  insert into public.user_highlight_booster_purchases (
    user_id,
    booster_id,
    payment_id,
    provider_payment_id,
    status,
    booster_name,
    amount,
    category_credits_total,
    category_credits_remaining,
    home_credits_total,
    home_credits_remaining
  ) values (
    p_user_id,
    p_booster_id,
    p_payment_id,
    p_provider_payment_id,
    'credited',
    v_booster.name,
    coalesce(p_amount, v_booster.monthly_price, 0),
    coalesce(v_booster.category_credits, 0),
    coalesce(v_booster.category_credits, 0),
    coalesce(v_booster.home_credits, 0),
    coalesce(v_booster.home_credits, 0)
  )
  on conflict (provider_payment_id) where provider_payment_id is not null
  do nothing
  returning id into v_purchase_id;

  -- Conflito (corrida): outra entrega creditou primeiro -> retorno idempotente.
  if v_purchase_id is null and p_provider_payment_id is not null then
    select id into v_purchase_id
    from public.user_highlight_booster_purchases
    where provider_payment_id = p_provider_payment_id
    limit 1;

    return jsonb_build_object(
      'success', true,
      'already_credited', true,
      'purchase_id', v_purchase_id,
      'booster_name', v_booster.name,
      'category_credits', coalesce(v_booster.category_credits, 0),
      'home_credits', coalesce(v_booster.home_credits, 0)
    );
  end if;

  return jsonb_build_object(
    'success', true,
    'purchase_id', v_purchase_id,
    'booster_name', v_booster.name,
    'category_credits', coalesce(v_booster.category_credits, 0),
    'home_credits', coalesce(v_booster.home_credits, 0)
  );
end;
$$;

-- =====================================================================
-- VALIDAÇÃO:
--   compra de booster real -> credita 1x; user_highlight_booster_purchases ganha 1 linha.
--   replay/2º evento do MESMO pagamento (mesmo provider_payment_id) -> NÃO duplica;
--     RPC retorna already_credited=true; nenhuma linha nova.
--   2 chamadas concorrentes mesmo provider_payment_id -> só 1 linha (unique index).
--   provider_payment_id null (caso sem id) -> insere normalmente (índice ignora nulos).
--   limite 30 dias -> inalterado para compras NOVAS distintas.
-- ROLLBACK:
--   drop index if exists public.uq_booster_purchase_provider_payment_id;
--   re-aplicar a versão anterior da RPC (sem on conflict / sem retorno idempotente).
-- =====================================================================
