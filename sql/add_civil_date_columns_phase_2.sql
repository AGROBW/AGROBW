-- Fase 2: adicionar colunas date para campos civis e manter convivencia com os campos timestamptz antigos.
-- Nao remove nem renomeia colunas antigas nesta etapa.

alter table public.payments
  add column if not exists invoice_issued_on date;

update public.payments
set invoice_issued_on = (invoice_issued_at at time zone 'America/Sao_Paulo')::date
where invoice_issued_at is not null
  and invoice_issued_on is null;

create or replace function public.sync_payments_invoice_issued_on()
returns trigger
language plpgsql
as $$
begin
  if new.invoice_issued_at is not null then
    new.invoice_issued_on := (new.invoice_issued_at at time zone 'America/Sao_Paulo')::date;
  elsif new.invoice_issued_on is null then
    new.invoice_issued_on := null;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_sync_payments_invoice_issued_on on public.payments;
create trigger trg_sync_payments_invoice_issued_on
before insert or update of invoice_issued_at, invoice_issued_on
on public.payments
for each row
execute function public.sync_payments_invoice_issued_on();

alter table public.site_sponsors
  add column if not exists starts_on date,
  add column if not exists ends_on date;

update public.site_sponsors
set
  starts_on = (starts_at at time zone 'America/Sao_Paulo')::date,
  ends_on = case
    when ends_at is null then null
    else (ends_at at time zone 'America/Sao_Paulo')::date
  end
where starts_at is not null
  and (starts_on is null or (ends_at is not null and ends_on is null));

create or replace function public.touch_site_sponsors_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  new.starts_on = (new.starts_at at time zone 'America/Sao_Paulo')::date;
  new.ends_on = case
    when new.ends_at is null then null
    else (new.ends_at at time zone 'America/Sao_Paulo')::date
  end;
  return new;
end;
$$;

drop trigger if exists trg_touch_site_sponsors_updated_at on public.site_sponsors;
create trigger trg_touch_site_sponsors_updated_at
before insert or update on public.site_sponsors
for each row
execute function public.touch_site_sponsors_updated_at();

alter table public.promotion_plan_codes
  add column if not exists starts_on date,
  add column if not exists expires_on date;

update public.promotion_plan_codes
set
  starts_on = case
    when starts_at is null then null
    else (starts_at at time zone 'America/Sao_Paulo')::date
  end,
  expires_on = case
    when expires_at is null then null
    else (expires_at at time zone 'America/Sao_Paulo')::date
  end
where (starts_at is not null and starts_on is null)
   or (expires_at is not null and expires_on is null);

create or replace function public.touch_promotion_plan_codes_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  new.code = upper(trim(new.code));
  new.starts_on = case
    when new.starts_at is null then null
    else (new.starts_at at time zone 'America/Sao_Paulo')::date
  end;
  new.expires_on = case
    when new.expires_at is null then null
    else (new.expires_at at time zone 'America/Sao_Paulo')::date
  end;
  return new;
end;
$$;

drop trigger if exists trg_touch_promotion_plan_codes_updated_at on public.promotion_plan_codes;
create trigger trg_touch_promotion_plan_codes_updated_at
before insert or update on public.promotion_plan_codes
for each row
execute function public.touch_promotion_plan_codes_updated_at();
