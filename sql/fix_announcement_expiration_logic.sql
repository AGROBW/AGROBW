create or replace function public.calculate_announcement_expires_at(
  p_user_id uuid,
  p_reference timestamptz default now()
)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ad_duration_days integer;
begin
  select p.ad_duration_days
    into v_ad_duration_days
  from public.user_subscriptions us
  join public.plans p on p.id = us.plan_id
  where us.user_id = p_user_id
    and us.status = 'active'
  order by us.current_period_end desc nulls last
  limit 1;

  if v_ad_duration_days is null or v_ad_duration_days <= 0 then
    return null;
  end if;

  return p_reference + make_interval(days => v_ad_duration_days);
end;
$$;

comment on function public.calculate_announcement_expires_at(uuid, timestamptz)
is 'Calcula expires_at do anúncio com base no plano ativo do usuário.';

create or replace function public.sync_announcement_expires_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if upper(coalesce(new.status, '')) = 'ACTIVE' then
    if tg_op = 'INSERT'
       or upper(coalesce(old.status, '')) <> 'ACTIVE'
       or new.expires_at is null then
      new.expires_at := public.calculate_announcement_expires_at(
        new.user_id,
        coalesce(new.created_at, now())
      );
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_sync_announcement_expires_at on public.announcements;

create trigger trg_sync_announcement_expires_at
before insert or update of status, user_id, expires_at
on public.announcements
for each row
execute function public.sync_announcement_expires_at();

update public.announcements a
set expires_at = public.calculate_announcement_expires_at(a.user_id, a.created_at)
where upper(coalesce(a.status, '')) = 'ACTIVE'
  and a.expires_at is null;

create or replace function public.expire_elapsed_announcements()
returns table(expired_count integer)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with expired as (
    update public.announcements
       set status = 'EXPIRED',
           highlight_category = false,
           highlight_category_until = null,
           highlight_home = false,
           highlight_home_until = null,
           updated_at = now()
     where upper(coalesce(status, '')) = 'ACTIVE'
       and expires_at is not null
       and expires_at <= now()
    returning 1
  )
  select count(*)::integer
  from expired;
end;
$$;

grant execute on function public.calculate_announcement_expires_at(uuid, timestamptz) to authenticated, service_role;
grant execute on function public.expire_elapsed_announcements() to authenticated, service_role;
