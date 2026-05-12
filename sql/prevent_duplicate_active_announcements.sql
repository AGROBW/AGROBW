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

create or replace function public.enforce_no_duplicate_active_announcements()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  conflicting_announcement record;
  new_title_normalized text;
  old_title_normalized text;
begin
  if coalesce(new.status, '') not in ('ACTIVE', 'active') then
    return new;
  end if;

  if new.user_id is null then
    return new;
  end if;

  new_title_normalized := public.normalize_announcement_similarity_text(new.title);
  old_title_normalized := public.normalize_announcement_similarity_text(old.title);

  if tg_op = 'UPDATE'
    and coalesce(old.status, '') in ('ACTIVE', 'active')
    and new_title_normalized = old_title_normalized
    and new.category_id is not distinct from old.category_id
    and lower(coalesce(new.city, '')) = lower(coalesce(old.city, ''))
    and upper(coalesce(new.state, '')) = upper(coalesce(old.state, ''))
    and coalesce(new.price, 0) = coalesce(old.price, 0)
  then
    return new;
  end if;

  select a.id, a.title
    into conflicting_announcement
  from public.announcements a
  where a.user_id = new.user_id
    and a.status in ('ACTIVE', 'active')
    and (a.expires_at is null or a.expires_at > now())
    and (tg_op <> 'UPDATE' or a.id <> new.id)
    and public.normalize_announcement_similarity_text(a.title) = new_title_normalized
    and a.category_id is not distinct from new.category_id
    and lower(coalesce(a.city, '')) = lower(coalesce(new.city, ''))
    and upper(coalesce(a.state, '')) = upper(coalesce(new.state, ''))
    and coalesce(a.price, 0) = coalesce(new.price, 0)
  limit 1;

  if found then
    raise exception '%',
      format(
        'Ja existe um anuncio ativo muito parecido com este em sua conta (%s). Edite o anuncio existente ou desative-o antes de publicar outro igual.',
        coalesce(conflicting_announcement.title, 'anuncio existente')
      );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_no_duplicate_active_announcements on public.announcements;

create trigger trg_enforce_no_duplicate_active_announcements
before insert or update of status, title, category_id, city, state, price
on public.announcements
for each row
execute function public.enforce_no_duplicate_active_announcements();
