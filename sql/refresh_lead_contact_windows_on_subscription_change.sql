create or replace function public.refresh_seller_lead_contact_windows(
  p_seller_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rows_updated integer := 0;
begin
  update public.leads l
  set contact_expires_at = public.calculate_lead_contact_expires_at(l.seller_id, l.announcement_id)
  where l.seller_id = p_seller_id;

  get diagnostics v_rows_updated = row_count;
  return v_rows_updated;
end;
$$;

create or replace function public.sync_lead_windows_after_subscription_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.user_id is not null then
    perform public.refresh_seller_lead_contact_windows(new.user_id);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_refresh_lead_windows_after_subscription_change on public.user_subscriptions;

create trigger trg_refresh_lead_windows_after_subscription_change
after insert or update of plan_id, status, current_period_start, current_period_end
on public.user_subscriptions
for each row
execute function public.sync_lead_windows_after_subscription_change();

update public.leads l
set contact_expires_at = public.calculate_lead_contact_expires_at(l.seller_id, l.announcement_id);

grant execute on function public.refresh_seller_lead_contact_windows(uuid) to authenticated, service_role;
