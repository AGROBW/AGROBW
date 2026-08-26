-- Lead qualification is optional and stored separately from the commercial lead.
-- This preserves the seller-only UPDATE policy on public.leads.

begin;

create table if not exists public.lead_qualifications (
  lead_id uuid primary key references public.leads(id) on delete cascade,
  buyer_id uuid not null references public.users(id) on delete cascade,
  seller_id uuid not null references public.users(id) on delete cascade,
  purchase_timeline text null,
  payment_preference text null,
  has_trade_in boolean null,
  purchase_need text null,
  qualification_score smallint generated always as (
    (
      case when purchase_timeline is null then 0 else 1 end +
      case when payment_preference is null then 0 else 1 end +
      case when has_trade_in is null then 0 else 1 end +
      case when purchase_need is null or btrim(purchase_need) = '' then 0 else 1 end
    )::smallint
  ) stored,
  qualification_level text generated always as (
    case
      when (
        case when purchase_timeline is null then 0 else 1 end +
        case when payment_preference is null then 0 else 1 end +
        case when has_trade_in is null then 0 else 1 end +
        case when purchase_need is null or btrim(purchase_need) = '' then 0 else 1 end
      ) >= 3 then 'qualified'
      when (
        case when purchase_timeline is null then 0 else 1 end +
        case when payment_preference is null then 0 else 1 end +
        case when has_trade_in is null then 0 else 1 end +
        case when purchase_need is null or btrim(purchase_need) = '' then 0 else 1 end
      ) >= 1 then 'partial'
      else 'unqualified'
    end
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lead_qualifications_purchase_timeline_check
    check (purchase_timeline is null or purchase_timeline in ('immediate', '30_days', '90_days', 'researching')),
  constraint lead_qualifications_payment_preference_check
    check (payment_preference is null or payment_preference in ('cash', 'financing', 'consortium', 'undecided')),
  constraint lead_qualifications_purchase_need_check
    check (purchase_need is null or char_length(purchase_need) <= 500),
  constraint lead_qualifications_level_check
    check (qualification_level in ('qualified', 'partial', 'unqualified')),
  constraint lead_qualifications_score_check
    check (qualification_score between 0 and 4)
);

create index if not exists lead_qualifications_seller_level_created_idx
  on public.lead_qualifications (seller_id, qualification_level, created_at desc);

create or replace function public.touch_lead_qualifications_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists lead_qualifications_touch_updated_at on public.lead_qualifications;
create trigger lead_qualifications_touch_updated_at
before update on public.lead_qualifications
for each row execute function public.touch_lead_qualifications_updated_at();

alter table public.lead_qualifications enable row level security;

drop policy if exists lead_qualifications_select_participants on public.lead_qualifications;
create policy lead_qualifications_select_participants
on public.lead_qualifications
for select
to authenticated
using (
  auth.uid() = buyer_id
  or (
    auth.uid() = seller_id
    and exists (
      select 1
      from public.leads
      where leads.id = lead_qualifications.lead_id
        and (leads.contact_expires_at is null or leads.contact_expires_at > now())
    )
  )
);

revoke all on table public.lead_qualifications from public, anon, authenticated;
grant select on table public.lead_qualifications to authenticated;
grant all on table public.lead_qualifications to service_role;

create or replace function public.upsert_lead_qualification(
  p_lead_id uuid,
  p_purchase_timeline text default null,
  p_payment_preference text default null,
  p_has_trade_in boolean default null,
  p_purchase_need text default null
)
returns public.lead_qualifications
language plpgsql
security definer
set search_path = public
as $$
declare
  v_buyer_id uuid;
  v_seller_id uuid;
  v_purchase_timeline text := nullif(btrim(coalesce(p_purchase_timeline, '')), '');
  v_payment_preference text := nullif(btrim(coalesce(p_payment_preference, '')), '');
  v_purchase_need text := nullif(btrim(coalesce(p_purchase_need, '')), '');
  v_result public.lead_qualifications;
begin
  if auth.uid() is null then
    raise exception 'Autenticacao obrigatoria';
  end if;

  select leads.buyer_id, leads.seller_id
    into v_buyer_id, v_seller_id
  from public.leads
  where leads.id = p_lead_id
    and leads.buyer_id = auth.uid();

  if v_buyer_id is null then
    raise exception 'Lead nao encontrado para este comprador';
  end if;

  if v_purchase_timeline is not null
     and v_purchase_timeline not in ('immediate', '30_days', '90_days', 'researching') then
    raise exception 'Prazo de compra invalido';
  end if;

  if v_payment_preference is not null
     and v_payment_preference not in ('cash', 'financing', 'consortium', 'undecided') then
    raise exception 'Forma de pagamento invalida';
  end if;

  if v_purchase_need is not null and char_length(v_purchase_need) > 500 then
    raise exception 'Necessidade de compra excede 500 caracteres';
  end if;

  if v_purchase_timeline is null
     and v_payment_preference is null
     and p_has_trade_in is null
     and v_purchase_need is null then
    raise exception 'Informe pelo menos uma resposta de qualificacao';
  end if;

  insert into public.lead_qualifications (
    lead_id,
    buyer_id,
    seller_id,
    purchase_timeline,
    payment_preference,
    has_trade_in,
    purchase_need
  ) values (
    p_lead_id,
    v_buyer_id,
    v_seller_id,
    v_purchase_timeline,
    v_payment_preference,
    p_has_trade_in,
    v_purchase_need
  )
  on conflict (lead_id) do update set
    purchase_timeline = excluded.purchase_timeline,
    payment_preference = excluded.payment_preference,
    has_trade_in = excluded.has_trade_in,
    purchase_need = excluded.purchase_need,
    seller_id = excluded.seller_id
  where lead_qualifications.buyer_id = auth.uid()
  returning * into v_result;

  if v_result.lead_id is null then
    raise exception 'A qualificacao pertence a outro comprador';
  end if;

  return v_result;
end;
$$;

revoke all on function public.touch_lead_qualifications_updated_at() from public, anon, authenticated;
revoke all on function public.upsert_lead_qualification(uuid, text, text, boolean, text) from public, anon;
grant execute on function public.upsert_lead_qualification(uuid, text, text, boolean, text) to authenticated;
grant execute on function public.upsert_lead_qualification(uuid, text, text, boolean, text) to service_role;

comment on table public.lead_qualifications is
  'Optional buyer answers used to prioritize commercial leads without changing the lead workflow.';
comment on function public.upsert_lead_qualification(uuid, text, text, boolean, text) is
  'Allows the authenticated buyer to create or update only the qualification attached to their own lead.';

commit;
