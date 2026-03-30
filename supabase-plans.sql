-- ======================================================
-- BWAGRO - Tabela plans (assinaturas)
-- ======================================================
-- Execute no SQL Editor do Supabase Dashboard

create table if not exists public.plans (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  monthly_price numeric(10,2) not null default 0,
  yearly_price numeric(10,2) not null default 0,
  features jsonb not null default '[]'::jsonb,
  display_features jsonb not null default '[]'::jsonb,
  is_popular boolean not null default false,
  button_text text not null default 'Escolher Plano',
  comparison jsonb not null default '{}'::jsonb,
  max_ads int,
  ad_duration_days int,
  lead_contact_limit_days int,
  lead_contact_limit_days_monthly int,
  lead_contact_limit_days_yearly int,
  plan_validity_days_monthly int,
  plan_validity_days_yearly int,
  category_highlights_count int default 0,
  category_highlight_days int,
  home_highlight_count int default 0,
  home_highlight_days int,
  has_verification_badge boolean not null default false,
  has_seller_store boolean not null default false,
  has_email_marketing boolean not null default false,
  social_campaigns_per_month int,
  notes text,
  position int not null default 0,
  is_active boolean not null default true,
  show_in_public_pricing boolean not null default true,
  is_default_signup_plan boolean not null default false,
  is_downgrade_plan boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_plans_position on public.plans(position);
create index if not exists idx_plans_active on public.plans(is_active);
create index if not exists idx_plans_public_pricing on public.plans(show_in_public_pricing);
create index if not exists idx_plans_default_signup on public.plans(is_default_signup_plan);
create index if not exists idx_plans_downgrade on public.plans(is_downgrade_plan);

-- Trigger para updated_at
create or replace function public.set_updated_at_plans()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_plans_updated_at on public.plans;
create trigger trg_plans_updated_at
before update on public.plans
for each row execute procedure public.set_updated_at_plans();

-- RLS (opcional): planos públicos para leitura
alter table public.plans enable row level security;

drop policy if exists "Plans public read" on public.plans;
create policy "Plans public read" on public.plans
for select using (is_active = true);

-- Inserções iniciais (atualiza se já existir)
insert into public.plans (
  name,
  description,
  monthly_price,
  yearly_price,
  display_features,
  is_popular,
  button_text,
  max_ads,
  ad_duration_days,
  lead_contact_limit_days,
  lead_contact_limit_days_monthly,
  lead_contact_limit_days_yearly,
  plan_validity_days_monthly,
  plan_validity_days_yearly,
  category_highlights_count,
  category_highlight_days,
  home_highlight_count,
  home_highlight_days,
  has_verification_badge,
  has_seller_store,
  has_email_marketing,
  social_campaigns_per_month,
  notes,
  position
)
values
(
  'Start Agro',
  'Plano gratuito para iniciar na plataforma',
  0,
  0,
  '["Relatório de visualizações","Suporte via chat (assistente virtual)","Testar a plataforma"]'::jsonb,
  false,
  'Começar grátis',
  2,
  30,
  14,
  14,
  14,
  30,
  365,
  0,
  null,
  0,
  null,
  false,
  false,
  false,
  0,
  'Créditos não acumulam. Exclusão de anúncio não reverte consumo de crédito. Selo de verificação após rigorosa análise.',
  1
),
(
  'Essencial',
  'Plano para produtor iniciante',
  59,
  0,
  '["Publicação permanente","3 créditos de publicação","Contato direto por 30 dias","1 destaque por categoria (7 dias)","Relatório de visualizações, cliques e região de contatos","Suporte via chat (assistente virtual)"]'::jsonb,
  false,
  'Assinar Essencial',
  3,
  9999,
  30,
  30,
  30,
  30,
  365,
  1,
  7,
  0,
  null,
  false,
  false,
  false,
  0,
  'Créditos não acumulam. Exclusão de anúncio não reverte consumo de crédito. Selo de verificação após rigorosa análise.',
  2
),
(
  'Destaque',
  'Plano para produtores ativos',
  119,
  0,
  '["Publicação permanente","5 créditos de publicação (não cumulativo)","Contato direto por 60 dias","3 destaques por categoria (30 dias)","1 destaque na Home (7 dias)","Relatório de visualizações, cliques e região de contatos","Suporte via chat (assistente virtual)"]'::jsonb,
  true,
  'Assinar Destaque',
  5,
  9999,
  60,
  60,
  90,
  30,
  365,
  3,
  30,
  1,
  7,
  false,
  false,
  false,
  0,
  'Créditos não acumulam. Exclusão de anúncio não reverte consumo de crédito. Selo de verificação após rigorosa análise.',
  3
),
(
  'Premium',
  'Plano para grandes produtores e lojistas',
  199,
  0,
  '["Publicação permanente","10 créditos de publicação","Contato direto por 60 dias","5 destaques por categoria (30 dias)","1 destaque na Home (30 dias)","Relatório de visualizações, cliques e região de contatos","Selo de verificação","E-mail marketing (alcance direto aos leads)","5 campanhas nas redes sociais a cada 30 dias","Suporte via chat (assistente virtual) + WhatsApp + Gerente de Conta"]'::jsonb,
  false,
  'Assinar Premium',
  10,
  9999,
  60,
  60,
  120,
  30,
  365,
  5,
  30,
  1,
  30,
  true,
  false,
  true,
  5,
  'Créditos não acumulam. Exclusão de anúncio não reverte consumo de crédito. Selo de verificação após rigorosa análise.',
  4
),
(
  'Corporativo',
  'Plano corporativo sob consulta',
  599,
  0,
  '["Publicação permanente","Máximo de anúncios sob consulta","Loja interna (perfil do vendedor)","Selo de verificação","5 campanhas nas redes sociais por mês","Suporte dedicado"]'::jsonb,
  false,
  'Falar com consultor',
  null,
  9999,
  null,
  null,
  null,
  30,
  365,
  0,
  null,
  0,
  null,
  true,
  true,
  true,
  5,
  'Créditos não acumulam. Exclusão de anúncio não reverte consumo de crédito. Selo de verificação após rigorosa análise.',
  5
)
on conflict (name) do update set
  description = excluded.description,
  monthly_price = excluded.monthly_price,
  yearly_price = excluded.yearly_price,
  display_features = excluded.display_features,
  is_popular = excluded.is_popular,
  button_text = excluded.button_text,
  max_ads = excluded.max_ads,
  ad_duration_days = excluded.ad_duration_days,
  lead_contact_limit_days = excluded.lead_contact_limit_days,
  lead_contact_limit_days_monthly = excluded.lead_contact_limit_days_monthly,
  lead_contact_limit_days_yearly = excluded.lead_contact_limit_days_yearly,
  plan_validity_days_monthly = excluded.plan_validity_days_monthly,
  plan_validity_days_yearly = excluded.plan_validity_days_yearly,
  category_highlights_count = excluded.category_highlights_count,
  category_highlight_days = excluded.category_highlight_days,
  home_highlight_count = excluded.home_highlight_count,
  home_highlight_days = excluded.home_highlight_days,
  has_verification_badge = excluded.has_verification_badge,
  has_seller_store = excluded.has_seller_store,
  has_email_marketing = excluded.has_email_marketing,
  social_campaigns_per_month = excluded.social_campaigns_per_month,
  notes = excluded.notes,
  position = excluded.position,
  is_active = true,
  show_in_public_pricing = coalesce(public.plans.show_in_public_pricing, true),
  is_default_signup_plan = coalesce(public.plans.is_default_signup_plan, false),
  is_downgrade_plan = coalesce(public.plans.is_downgrade_plan, false),
  updated_at = now();
