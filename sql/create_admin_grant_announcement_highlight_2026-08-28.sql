-- Concessão administrativa de destaque sem consumo de créditos do anunciante.
-- O destaque administrativo fica separado de plan/plan_carryover/booster no histórico.

begin;

alter table public.announcement_highlights_history
  drop constraint if exists announcement_highlights_history_credit_source_check;

alter table public.announcement_highlights_history
  add constraint announcement_highlights_history_credit_source_check
  check (credit_source in ('plan', 'plan_carryover', 'booster', 'admin'));

alter table public.announcement_highlights_history
  add column if not exists admin_granted_by uuid null references public.users(id) on delete set null,
  add column if not exists admin_reason text null;

create or replace function public.admin_grant_announcement_highlight(
  p_announcement_id uuid,
  p_highlight_type text,
  p_expires_at timestamptz,
  p_reason text default null
)
returns table (
  announcement_id uuid,
  highlight_home boolean,
  highlight_home_until timestamptz,
  highlight_category boolean,
  highlight_category_until timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_announcement public.announcements%rowtype;
  v_now timestamptz := now();
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  if p_highlight_type not in ('home', 'category') then
    raise exception 'Tipo de destaque inválido. Use "home" ou "category".';
  end if;

  if p_expires_at is null or p_expires_at <= v_now then
    raise exception 'A expiração do destaque precisa estar no futuro.';
  end if;

  if p_expires_at > v_now + interval '90 days' then
    raise exception 'O destaque administrativo pode durar no máximo 90 dias.';
  end if;

  if length(coalesce(v_reason, '')) > 500 then
    raise exception 'O motivo administrativo deve ter no máximo 500 caracteres.';
  end if;

  -- Reutiliza a guarda central do projeto, que valida perfil administrativo e AAL2/MFA.
  if not public.is_admin() then
    raise exception 'Acesso negado. É necessária uma sessão administrativa com MFA.';
  end if;

  select *
  into v_announcement
  from public.announcements
  where id = p_announcement_id
  for update;

  if v_announcement.id is null then
    raise exception 'Anúncio não encontrado.';
  end if;

  if upper(coalesce(v_announcement.status, '')) <> 'ACTIVE' then
    raise exception 'Somente anúncios ativos podem receber destaque.';
  end if;

  if v_announcement.expires_at is not null and v_announcement.expires_at <= v_now then
    raise exception 'O anúncio já expirou e não pode receber destaque.';
  end if;

  if v_announcement.expires_at is not null and p_expires_at > v_announcement.expires_at then
    raise exception 'O destaque não pode terminar depois da expiração do anúncio.';
  end if;

  -- Encerra o registro anterior sem devolver nem consumir créditos do plano.
  update public.announcement_highlights_history
  set expires_at = v_now
  where announcement_id = p_announcement_id
    and highlight_type in ('home', 'category')
    and expires_at > v_now;

  update public.announcements
  set
    highlight_home = p_highlight_type = 'home',
    highlight_home_until = case when p_highlight_type = 'home' then p_expires_at else null end,
    highlight_category = p_highlight_type = 'category',
    highlight_category_until = case when p_highlight_type = 'category' then p_expires_at else null end,
    updated_at = v_now
  where id = p_announcement_id
  returning * into v_announcement;

  insert into public.announcement_highlights_history (
    announcement_id,
    user_id,
    highlight_type,
    applied_at,
    expires_at,
    subscription_period_start,
    subscription_period_end,
    credit_source,
    admin_granted_by,
    admin_reason
  ) values (
    v_announcement.id,
    v_announcement.user_id,
    p_highlight_type,
    v_now,
    p_expires_at,
    v_now,
    p_expires_at,
    'admin',
    v_actor_id,
    v_reason
  );

  return query
  select
    v_announcement.id,
    coalesce(v_announcement.highlight_home, false),
    v_announcement.highlight_home_until,
    coalesce(v_announcement.highlight_category, false),
    v_announcement.highlight_category_until;
end;
$$;

revoke all on function public.admin_grant_announcement_highlight(uuid, text, timestamptz, text) from public, anon;
grant execute on function public.admin_grant_announcement_highlight(uuid, text, timestamptz, text) to authenticated;

comment on function public.admin_grant_announcement_highlight(uuid, text, timestamptz, text) is
  'Concede ou troca destaque administrativo sem consumir créditos de plano ou booster.';

commit;
