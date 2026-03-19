alter table public.plans
  add column if not exists card_eyebrow text not null default 'Plano BWAGRO';

alter table public.plans
  add column if not exists price_caption text;

alter table public.plans
  add column if not exists footer_caption text;

comment on column public.plans.card_eyebrow is 'Texto pequeno acima do nome do plano no card da tela de planos';
comment on column public.plans.price_caption is 'Texto exibido dentro da caixa escura de preco do card do plano';
comment on column public.plans.footer_caption is 'Frase de destaque exibida no rodape do card do plano';
