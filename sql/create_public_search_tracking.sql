create table if not exists public.search_events (
  id uuid primary key default gen_random_uuid(),
  term text not null,
  normalized_term text not null,
  source text not null default 'hero_search',
  created_at timestamptz not null default now()
);

create index if not exists idx_search_events_created_at
  on public.search_events (created_at desc);

create index if not exists idx_search_events_normalized_term
  on public.search_events (normalized_term);

alter table public.search_events enable row level security;

drop policy if exists "Admins can manage search events" on public.search_events;
create policy "Admins can manage search events"
on public.search_events
for all
to authenticated
using (
  exists (
    select 1
    from public.users
    where users.id = auth.uid()
      and users.is_admin = true
  )
)
with check (
  exists (
    select 1
    from public.users
    where users.id = auth.uid()
      and users.is_admin = true
  )
);

create or replace function public.log_public_search(
  p_term text,
  p_source text default 'hero_search'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_term text;
  v_normalized_term text;
begin
  v_term := trim(coalesce(p_term, ''));

  if length(v_term) < 2 then
    return;
  end if;

  if length(v_term) > 80 then
    v_term := left(v_term, 80);
  end if;

  v_normalized_term := lower(
    regexp_replace(
      translate(v_term,
        'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇç',
        'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCc'
      ),
      '[^a-zA-Z0-9]+',
      ' ',
      'g'
    )
  );

  v_normalized_term := trim(regexp_replace(v_normalized_term, '\s+', ' ', 'g'));

  if v_normalized_term = '' then
    return;
  end if;

  insert into public.search_events (term, normalized_term, source)
  values (v_term, v_normalized_term, coalesce(nullif(trim(p_source), ''), 'hero_search'));
end;
$$;

create or replace function public.get_top_public_searches(
  p_limit integer default 5,
  p_days integer default 30
)
returns table (
  term text,
  search_count bigint
)
language sql
security definer
set search_path = public
as $$
  with ranked as (
    select
      min(se.term) as term,
      se.normalized_term,
      count(*) as search_count
    from public.search_events se
    where se.created_at >= now() - make_interval(days => greatest(coalesce(p_days, 30), 1))
    group by se.normalized_term
  )
  select
    ranked.term,
    ranked.search_count
  from ranked
  where ranked.term is not null
  order by ranked.search_count desc, ranked.term asc
  limit greatest(coalesce(p_limit, 5), 1);
$$;

revoke all on public.search_events from anon, authenticated;
grant execute on function public.log_public_search(text, text) to anon, authenticated;
grant execute on function public.get_top_public_searches(integer, integer) to anon, authenticated;
