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

create or replace function public.normalize_announcement_similarity_words(p_value text)
returns text[]
language sql
immutable
as $$
  select coalesce(
    array(
      select distinct token
      from unnest(
        regexp_split_to_array(
          regexp_replace(
            lower(
              translate(
                coalesce(p_value, ''),
                'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
                'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC'
              )
            ),
            '[^a-z0-9]+',
            ' ',
            'g'
          ),
          '\s+'
        )
      ) as token
      where token <> ''
        and char_length(token) >= 4
    ),
    '{}'::text[]
  );
$$;

create or replace function public.count_shared_announcement_title_tokens(p_first text, p_second text)
returns integer
language sql
immutable
as $$
  select count(*)
  from (
    select distinct token
    from unnest(public.normalize_announcement_similarity_words(p_first)) as token
    intersect
    select distinct token
    from unnest(public.normalize_announcement_similarity_words(p_second)) as token
  ) shared_tokens;
$$;

create or replace function public.is_announcement_price_close(p_first numeric, p_second numeric)
returns boolean
language sql
immutable
as $$
  select
    case
      when coalesce(p_first, 0) = 0 and coalesce(p_second, 0) = 0 then true
      else abs(coalesce(p_first, 0) - coalesce(p_second, 0))
        <= greatest(abs(greatest(coalesce(p_first, 0), coalesce(p_second, 0))) * 0.15, 100)
    end;
$$;

create or replace function public.get_announcement_similarity_review_signal(
  p_user_id uuid,
  p_title text,
  p_category_id uuid,
  p_city text,
  p_state text,
  p_price numeric,
  p_ignore_announcement_id uuid default null
)
returns table (
  suspicious boolean,
  similarity_score integer,
  matched_announcement_id uuid,
  matched_title text,
  review_reason text
)
language sql
security definer
set search_path = public
as $$
  with candidates as (
    select
      a.id,
      a.title,
      (
        case
          when public.normalize_announcement_similarity_text(a.title) = public.normalize_announcement_similarity_text(p_title)
            then 5
          when public.normalize_announcement_similarity_text(a.title) like '%' || public.normalize_announcement_similarity_text(p_title) || '%'
            and char_length(public.normalize_announcement_similarity_text(p_title)) >= 10
            then 4
          when public.normalize_announcement_similarity_text(p_title) like '%' || public.normalize_announcement_similarity_text(a.title) || '%'
            and char_length(public.normalize_announcement_similarity_text(a.title)) >= 10
            then 4
          else 0
        end
        + case
          when public.count_shared_announcement_title_tokens(a.title, p_title) >= 2 then 3
          when public.count_shared_announcement_title_tokens(a.title, p_title) = 1 then 1
          else 0
        end
        + case when a.category_id is not distinct from p_category_id then 2 else 0 end
        + case when lower(coalesce(a.city, '')) = lower(coalesce(p_city, '')) then 1 else 0 end
        + case when upper(coalesce(a.state, '')) = upper(coalesce(p_state, '')) then 1 else 0 end
        + case when public.is_announcement_price_close(a.price, p_price) then 1 else 0 end
      )::integer as score
    from public.announcements a
    where a.user_id = p_user_id
      and (p_ignore_announcement_id is null or a.id <> p_ignore_announcement_id)
      and a.status in ('ACTIVE', 'active', 'PAUSED', 'paused', 'EXPIRED', 'expired', 'PENDING', 'pending')
      and a.created_at >= now() - interval '90 days'
  ),
  best_match as (
    select *
    from candidates
    where score >= 5
    order by score desc, id desc
    limit 1
  )
  select
    true as suspicious,
    score as similarity_score,
    id as matched_announcement_id,
    title as matched_title,
    format(
      'Este anuncio esta muito parecido com "%s" e foi enviado automaticamente para analise antes da publicacao.',
      coalesce(title, 'outro anuncio da sua conta')
    ) as review_reason
  from best_match
  union all
  select
    false as suspicious,
    0 as similarity_score,
    null::uuid as matched_announcement_id,
    null::text as matched_title,
    null::text as review_reason
  where not exists (select 1 from best_match);
$$;

grant execute on function public.get_announcement_similarity_review_signal(uuid, text, uuid, text, text, numeric, uuid) to authenticated;

create or replace function public.enforce_announcement_similarity_review()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  review_signal record;
begin
  if coalesce(new.status, '') not in ('ACTIVE', 'active') then
    return new;
  end if;

  if new.user_id is null then
    return new;
  end if;

  select *
    into review_signal
  from public.get_announcement_similarity_review_signal(
    new.user_id,
    new.title,
    new.category_id,
    new.city,
    new.state,
    new.price,
    case when tg_op = 'UPDATE' then new.id else null end
  )
  limit 1;

  if coalesce(review_signal.suspicious, false) then
    new.status := 'PENDING';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_zzz_enforce_announcement_similarity_review on public.announcements;

create trigger trg_zzz_enforce_announcement_similarity_review
before insert or update of status, title, category_id, city, state, price
on public.announcements
for each row
execute function public.enforce_announcement_similarity_review();
