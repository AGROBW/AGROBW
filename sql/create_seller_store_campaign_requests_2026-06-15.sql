-- =====================================================================
-- CAMPANHA DE LOJA PARCEIRA — FASE 1 (solicitação)
-- Data: 2026-06-15
-- Camada de SOLICITAÇÃO (o envio reaproveita a engine de newsletter em fases
-- seguintes). Esta fase: tabela + RLS + RPC de criação com validações server-side.
-- Idempotente.
-- =====================================================================

create table if not exists public.seller_store_campaign_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  announcement_id uuid references public.announcements(id) on delete set null,
  store_id uuid references public.seller_stores(id) on delete set null,
  announcement_snapshot jsonb not null,
  requested_subject text,
  requested_message text,
  status text not null default 'pending_review'
    check (status in (
      'pending_review', 'approved', 'rejected',
      'preparing', 'queued', 'sending', 'completed', 'failed', 'cancelled'
    )),
  rejection_reason text,
  admin_notes text,
  campaign_id uuid references public.newsletter_campaigns(id) on delete set null,
  reviewed_by uuid references public.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.seller_store_campaign_requests is
  'Solicitações de campanha de e-mail marketing de Loja Parceira, vinculadas a um anúncio. Aprovação/disparo são do admin.';

create index if not exists idx_sscr_user_created
  on public.seller_store_campaign_requests (user_id, created_at desc);
create index if not exists idx_sscr_status_created
  on public.seller_store_campaign_requests (status, created_at desc);

-- Anti-duplicata: no máximo 1 solicitação EM ABERTO por (usuário, anúncio).
-- Protege contra corrida/concurrency (a checagem no RPC cobre o caso comum).
create unique index if not exists idx_sscr_open_unique_per_ad
  on public.seller_store_campaign_requests (user_id, announcement_id)
  where status in ('pending_review', 'approved', 'preparing', 'queued', 'sending');

-- touch updated_at (reusa a função existente; recriada por idempotência)
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_touch_sscr_updated_at on public.seller_store_campaign_requests;
create trigger trg_touch_sscr_updated_at
before update on public.seller_store_campaign_requests
for each row execute function public.touch_updated_at();

-- ── RLS ─────────────────────────────────────────────────────────────
alter table public.seller_store_campaign_requests enable row level security;

-- Dono: apenas LEITURA das próprias solicitações. Inserção é só via RPC
-- (SECURITY DEFINER), para não permitir burlar o limite/validações.
drop policy if exists "Owner reads own campaign requests" on public.seller_store_campaign_requests;
create policy "Owner reads own campaign requests"
on public.seller_store_campaign_requests
for select to authenticated
using (auth.uid() = user_id or public.is_admin() = true);

-- Admin: gestão total (revisão/aprovação nas próximas fases).
drop policy if exists "Admins manage campaign requests" on public.seller_store_campaign_requests;
create policy "Admins manage campaign requests"
on public.seller_store_campaign_requests
for all to authenticated
using (public.is_admin() = true)
with check (public.is_admin() = true);

-- ── RPC: criar solicitação (validações server-side) ─────────────────
create or replace function public.request_store_campaign(
  p_announcement_id uuid,
  p_subject text default null,
  p_message text default null
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_ad record;
  v_store_id uuid;
  v_recent_count integer;
  v_snapshot jsonb;
  v_new_id uuid;
begin
  if v_user_id is null then
    raise exception 'Usuario autenticado obrigatorio.';
  end if;

  -- 1) Anúncio: existe, é do usuário e está ATIVO
  select a.id, a.title, a.price, a.unit_price, a.city, a.state, a.category_id, a.images, a.user_id, a.status
    into v_ad
  from public.announcements a
  where a.id = p_announcement_id;

  if v_ad.id is null then
    raise exception 'Anuncio nao encontrado.';
  end if;
  if v_ad.user_id <> v_user_id then
    raise exception 'Voce so pode solicitar campanha para um anuncio seu.';
  end if;
  if v_ad.status <> 'ACTIVE' then
    raise exception 'O anuncio precisa estar ativo para solicitar campanha.';
  end if;

  -- 2) Loja Parceira ATIVA (página pública habilitada e não pausada)
  select s.id into v_store_id
  from public.seller_stores s
  where s.user_id = v_user_id
    and s.is_active = true
    and coalesce(s.is_store_feature_enabled, false) = true
    and coalesce(s.is_paused_due_to_plan, false) = false
  limit 1;

  if v_store_id is null then
    raise exception 'Recurso disponivel apenas para contas com Loja Parceira ativa.';
  end if;

  -- 2.1) Entitlement do plano vigente: precisa incluir e-mail marketing
  if not exists (
    select 1
    from public.user_subscriptions sub
    join public.plans p on p.id = sub.plan_id
    where sub.user_id = v_user_id
      and sub.status in ('active', 'trialing', 'past_due')
      and sub.current_period_end >= now()
      and coalesce(p.has_email_marketing, false) = true
  ) then
    raise exception 'Seu plano atual nao inclui e-mail marketing.';
  end if;

  -- 2.2) Anti-duplicata: já existe solicitação EM ABERTO para este anúncio?
  if exists (
    select 1 from public.seller_store_campaign_requests r
    where r.user_id = v_user_id
      and r.announcement_id = p_announcement_id
      and r.status in ('pending_review', 'approved', 'preparing', 'queued', 'sending')
  ) then
    raise exception 'Ja existe uma solicitacao de campanha em andamento para este anuncio.';
  end if;

  -- 3) Limite: 2 solicitações a cada 30 dias (rejeitada CONSOME; cancelada não)
  select count(*) into v_recent_count
  from public.seller_store_campaign_requests r
  where r.user_id = v_user_id
    and r.created_at >= now() - interval '30 days'
    and r.status <> 'cancelled';

  if v_recent_count >= 2 then
    raise exception 'Limite de 2 solicitacoes de campanha a cada 30 dias atingido.';
  end if;

  -- 4) Snapshot do anúncio (preço efetivo, 1ª imagem)
  v_snapshot := jsonb_build_object(
    'announcement_id', v_ad.id,
    'title', v_ad.title,
    'price', coalesce(nullif(v_ad.unit_price, 0), v_ad.price),
    'city', v_ad.city,
    'state', v_ad.state,
    'category_id', v_ad.category_id,
    'image_url', case when array_length(v_ad.images, 1) >= 1 then v_ad.images[1] else null end,
    'detail_path', '/anuncio/' || v_ad.id::text,
    'captured_at', now()
  );

  -- 5) Inserir solicitação (trata corrida via índice único parcial)
  begin
    insert into public.seller_store_campaign_requests (
      user_id, announcement_id, store_id, announcement_snapshot,
      requested_subject, requested_message, status
    ) values (
      v_user_id,
      v_ad.id,
      v_store_id,
      v_snapshot,
      nullif(left(trim(coalesce(p_subject, '')), 200), ''),
      nullif(left(trim(coalesce(p_message, '')), 2000), ''),
      'pending_review'
    )
    returning id into v_new_id;
  exception
    when unique_violation then
      raise exception 'Ja existe uma solicitacao de campanha em andamento para este anuncio.';
  end;

  return v_new_id;
end;
$$;

revoke all on function public.request_store_campaign(uuid, text, text) from public;
grant execute on function public.request_store_campaign(uuid, text, text) to authenticated;

-- ── Grants explícitos da tabela ─────────────────────────────────────
-- Estratégia: DML direto FECHADO para authenticated. Toda mutação passa por
-- RPC SECURITY DEFINER (criação agora; revisão/aprovação do admin na Fase 3).
-- authenticated só lê (filtrado por RLS: dono vê o próprio, admin vê tudo).
revoke all on public.seller_store_campaign_requests from anon;
revoke all on public.seller_store_campaign_requests from authenticated;
grant select on public.seller_store_campaign_requests to authenticated;

-- Verificação:
-- select id, status, announcement_snapshot->>'title' from public.seller_store_campaign_requests order by created_at desc limit 5;
