-- Etapa 7.1 - boosters no fluxo Stripe
-- Objetivo:
-- - permitir mapear cada booster a um Price ID da Stripe
-- - manter Mercado Pago convivendo em paralelo enquanto o rollout nao termina

begin;

alter table public.highlight_boosters
  add column if not exists stripe_price_id text null;

comment on column public.highlight_boosters.stripe_price_id is
  'Price ID da Stripe usado para checkout do booster no rollout da migracao.';

commit;
