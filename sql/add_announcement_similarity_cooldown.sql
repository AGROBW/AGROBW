create or replace function public.normalize_announcement_similarity_text(p_value text)
returns text
language sql
immutable
as $$
  select regexp_replace(
    lower(
      translate(
        coalesce(p_value, ''),
        'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
        'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC'
      )
    ),
    '[^a-z0-9]+',
    '',
    'g'
  );
$$;

create table if not exists public.announcement_similarity_cooldowns (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  announcement_id uuid,
  title_normalized text not null,
  category_id uuid null,
  city text null,
  state text null,
  price numeric(12,2) null,
  source_status text not null,
  cooldown_until timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_announcement_similarity_cooldowns_user_active
  on public.announcement_similarity_cooldowns (user_id, cooldown_until desc);

create index if not exists idx_announcement_similarity_cooldowns_signature
  on public.announcement_similarity_cooldowns (
    user_id,
    title_normalized,
    category_id,
    city,
    state,
    price
  );

create or replace function public.register_announcement_similarity_cooldown()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  should_register boolean := false;
  reference_row public.announcements%rowtype;
begin
  if tg_op = 'DELETE' then
    reference_row := old;
    should_register := coalesce(old.status, '') in ('ACTIVE', 'active', 'PAUSED', 'paused', 'EXPIRED', 'expired');
  elsif tg_op = 'UPDATE' then
    reference_row := old;
    should_register :=
      coalesce(old.status, '') in ('ACTIVE', 'active')
      and coalesce(new.status, '') not in ('ACTIVE', 'active');
  end if;

  if not should_register then
    return coalesce(new, old);
  end if;

  insert into public.announcement_similarity_cooldowns (
    user_id,
    announcement_id,
    title_normalized,
    category_id,
    city,
    state,
    price,
    source_status,
    cooldown_until
  )
  values (
    reference_row.user_id,
    reference_row.id,
    public.normalize_announcement_similarity_text(reference_row.title),
    reference_row.category_id,
    lower(coalesce(reference_row.city, '')),
    upper(coalesce(reference_row.state, '')),
    round(coalesce(reference_row.price, 0)::numeric, 2),
    coalesce(reference_row.status, 'unknown'),
    now() + interval '72 hours'
  );

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_register_announcement_similarity_cooldown_on_update on public.announcements;
create trigger trg_register_announcement_similarity_cooldown_on_update
before update of status
on public.announcements
for each row
execute function public.register_announcement_similarity_cooldown();

drop trigger if exists trg_register_announcement_similarity_cooldown_on_delete on public.announcements;
create trigger trg_register_announcement_similarity_cooldown_on_delete
before delete
on public.announcements
for each row
execute function public.register_announcement_similarity_cooldown();

create or replace function public.get_announcement_similarity_cooldown(
  p_user_id uuid,
  p_title text,
  p_category_id uuid,
  p_city text,
  p_state text,
  p_price numeric,
  p_ignore_announcement_id uuid default null
)
returns table (
  matched_announcement_id uuid,
  matched_title text,
  source_status text,
  cooldown_until timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    c.announcement_id,
    a.title,
    c.source_status,
    c.cooldown_until
  from public.announcement_similarity_cooldowns c
  left join public.announcements a on a.id = c.announcement_id
  where c.user_id = p_user_id
    and c.cooldown_until > now()
    and (p_ignore_announcement_id is null or c.announcement_id is distinct from p_ignore_announcement_id)
    and c.title_normalized = public.normalize_announcement_similarity_text(p_title)
    and c.category_id is not distinct from p_category_id
    and c.city = lower(coalesce(p_city, ''))
    and c.state = upper(coalesce(p_state, ''))
    and c.price is not distinct from round(coalesce(p_price, 0)::numeric, 2)
  order by c.cooldown_until desc
  limit 1;
$$;

grant execute on function public.get_announcement_similarity_cooldown(uuid, text, uuid, text, text, numeric, uuid) to authenticated;
