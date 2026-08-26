-- Structured commercial proposals attached to leads and surfaced inside the existing chat.
-- This migration is additive and does not reuse the legacy/inert public.quotations table.

begin;

create table if not exists public.lead_commercial_proposals (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  chat_id uuid not null references public.chats(id) on delete cascade,
  announcement_id uuid not null references public.announcements(id) on delete cascade,
  buyer_id uuid not null references public.users(id) on delete cascade,
  seller_id uuid not null references public.users(id) on delete cascade,
  amount numeric(14,2) not null,
  payment_terms text null,
  delivery_terms text null,
  valid_until date not null,
  notes text null,
  status text not null default 'sent',
  responded_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lead_commercial_proposals_amount_check check (amount > 0),
  constraint lead_commercial_proposals_payment_terms_check check (payment_terms is null or char_length(payment_terms) <= 500),
  constraint lead_commercial_proposals_delivery_terms_check check (delivery_terms is null or char_length(delivery_terms) <= 500),
  constraint lead_commercial_proposals_notes_check check (notes is null or char_length(notes) <= 1000),
  constraint lead_commercial_proposals_status_check check (status in ('sent', 'accepted', 'rejected'))
);

create index if not exists lead_commercial_proposals_lead_created_idx
  on public.lead_commercial_proposals (lead_id, created_at desc);
create index if not exists lead_commercial_proposals_chat_created_idx
  on public.lead_commercial_proposals (chat_id, created_at desc);

alter table public.messages
  add column if not exists proposal_id uuid null references public.lead_commercial_proposals(id) on delete set null;

create unique index if not exists messages_proposal_id_unique_idx
  on public.messages (proposal_id)
  where proposal_id is not null;

create or replace function public.touch_lead_commercial_proposals_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists lead_commercial_proposals_touch_updated_at on public.lead_commercial_proposals;
create trigger lead_commercial_proposals_touch_updated_at
before update on public.lead_commercial_proposals
for each row execute function public.touch_lead_commercial_proposals_updated_at();

alter table public.lead_commercial_proposals enable row level security;

drop policy if exists lead_commercial_proposals_select_participants on public.lead_commercial_proposals;
create policy lead_commercial_proposals_select_participants
on public.lead_commercial_proposals
for select
to authenticated
using (
  auth.uid() = buyer_id
  or (
    auth.uid() = seller_id
    and exists (
      select 1
      from public.leads
      where leads.id = lead_commercial_proposals.lead_id
        and (leads.contact_expires_at is null or leads.contact_expires_at > now())
    )
  )
);

revoke all on table public.lead_commercial_proposals from public, anon, authenticated;
grant select on table public.lead_commercial_proposals to authenticated;
grant all on table public.lead_commercial_proposals to service_role;

create or replace function public.create_lead_commercial_proposal(
  p_lead_id uuid,
  p_amount numeric,
  p_valid_until date,
  p_payment_terms text default null,
  p_delivery_terms text default null,
  p_notes text default null
)
returns public.lead_commercial_proposals
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead public.leads%rowtype;
  v_result public.lead_commercial_proposals;
  v_payment_terms text := nullif(btrim(coalesce(p_payment_terms, '')), '');
  v_delivery_terms text := nullif(btrim(coalesce(p_delivery_terms, '')), '');
  v_notes text := nullif(btrim(coalesce(p_notes, '')), '');
begin
  if auth.uid() is null then raise exception 'Autenticacao obrigatoria'; end if;

  select * into v_lead
  from public.leads
  where id = p_lead_id
    and seller_id = auth.uid()
  for update;

  if v_lead.id is null then raise exception 'Lead nao encontrado para este vendedor'; end if;
  if v_lead.chat_id is null then raise exception 'Conversa do lead nao encontrada'; end if;
  if v_lead.contact_expires_at is not null and v_lead.contact_expires_at <= now() then
    raise exception 'Prazo de contato do lead expirado';
  end if;
  if p_amount is null or p_amount <= 0 or p_amount > 999999999999.99 then
    raise exception 'Valor da proposta invalido';
  end if;
  if p_valid_until is null or p_valid_until < current_date then
    raise exception 'Validade da proposta invalida';
  end if;
  if v_payment_terms is not null and char_length(v_payment_terms) > 500 then
    raise exception 'Condicoes de pagamento excedem 500 caracteres';
  end if;
  if v_delivery_terms is not null and char_length(v_delivery_terms) > 500 then
    raise exception 'Condicoes de entrega excedem 500 caracteres';
  end if;
  if v_notes is not null and char_length(v_notes) > 1000 then
    raise exception 'Observacoes excedem 1000 caracteres';
  end if;

  insert into public.lead_commercial_proposals (
    lead_id, chat_id, announcement_id, buyer_id, seller_id, amount,
    payment_terms, delivery_terms, valid_until, notes
  ) values (
    v_lead.id, v_lead.chat_id, v_lead.announcement_id, v_lead.buyer_id, v_lead.seller_id, p_amount,
    v_payment_terms, v_delivery_terms, p_valid_until, v_notes
  ) returning * into v_result;

  insert into public.messages (chat_id, sender_id, content, is_read, is_filtered, proposal_id)
  values (v_lead.chat_id, auth.uid(), 'Proposta comercial enviada', false, false, v_result.id);

  return v_result;
end;
$$;

create or replace function public.respond_lead_commercial_proposal(
  p_proposal_id uuid,
  p_response text
)
returns public.lead_commercial_proposals
language plpgsql
security definer
set search_path = public
as $$
declare
  v_proposal public.lead_commercial_proposals%rowtype;
  v_response text := lower(btrim(coalesce(p_response, '')));
begin
  if auth.uid() is null then raise exception 'Autenticacao obrigatoria'; end if;
  if v_response not in ('accepted', 'rejected') then raise exception 'Resposta da proposta invalida'; end if;

  select * into v_proposal
  from public.lead_commercial_proposals
  where id = p_proposal_id
    and buyer_id = auth.uid()
  for update;

  if v_proposal.id is null then raise exception 'Proposta nao encontrada para este comprador'; end if;
  if v_proposal.status <> 'sent' then raise exception 'Esta proposta ja foi respondida'; end if;
  if v_proposal.valid_until < current_date then raise exception 'Esta proposta expirou'; end if;

  update public.lead_commercial_proposals
  set status = v_response, responded_at = now()
  where id = v_proposal.id
  returning * into v_proposal;

  insert into public.messages (chat_id, sender_id, content, is_read, is_filtered)
  values (
    v_proposal.chat_id,
    auth.uid(),
    case when v_response = 'accepted' then 'Proposta comercial aceita' else 'Proposta comercial recusada' end,
    false,
    false
  );

  return v_proposal;
end;
$$;

revoke all on function public.touch_lead_commercial_proposals_updated_at() from public, anon, authenticated;
revoke all on function public.create_lead_commercial_proposal(uuid, numeric, date, text, text, text) from public, anon;
revoke all on function public.respond_lead_commercial_proposal(uuid, text) from public, anon;
grant execute on function public.create_lead_commercial_proposal(uuid, numeric, date, text, text, text) to authenticated, service_role;
grant execute on function public.respond_lead_commercial_proposal(uuid, text) to authenticated, service_role;

comment on table public.lead_commercial_proposals is
  'Structured commercial proposals sent by sellers to buyers through an existing lead conversation.';
comment on column public.messages.proposal_id is
  'Optional structured commercial proposal rendered by the chat instead of parsing message text.';

commit;
