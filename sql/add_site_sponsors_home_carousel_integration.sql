alter table public.site_sponsors
  add column if not exists show_on_home_carousel boolean not null default false,
  add column if not exists home_badge_text text,
  add column if not exists home_title text,
  add column if not exists home_subtitle text,
  add column if not exists home_button_text text,
  add column if not exists home_carousel_sort_order integer;

create index if not exists idx_site_sponsors_home_carousel
  on public.site_sponsors (show_on_home_carousel, home_carousel_sort_order)
  where show_on_home_carousel = true;

create or replace function public.get_public_home_carousel_sponsors()
returns table (
  id uuid,
  company_name text,
  segment text,
  banner_url text,
  target_type text,
  target_url text,
  home_badge_text text,
  home_title text,
  home_subtitle text,
  home_button_text text,
  home_carousel_sort_order integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    s.id,
    s.company_name,
    s.segment,
    s.banner_url,
    s.target_type,
    s.target_url,
    coalesce(nullif(trim(s.home_badge_text), ''), 'Patrocinador AGRO BW') as home_badge_text,
    coalesce(nullif(trim(s.home_title), ''), s.company_name) as home_title,
    coalesce(
      nullif(trim(s.home_subtitle), ''),
      format('%s em destaque na home da AGRO BW.', s.segment)
    ) as home_subtitle,
    coalesce(nullif(trim(s.home_button_text), ''), 'Conhecer patrocinador') as home_button_text,
    coalesce(s.home_carousel_sort_order, 999) as home_carousel_sort_order
  from public.site_sponsors s
  where s.show_on_home_carousel = true
    and s.banner_url is not null
    and nullif(trim(s.banner_url), '') is not null
    and s.target_url is not null
    and nullif(trim(s.target_url), '') is not null
    and s.status = 'active'
    and s.starts_on <= ((now() at time zone 'America/Sao_Paulo')::date)
    and (s.ends_on is null or s.ends_on >= ((now() at time zone 'America/Sao_Paulo')::date))
  order by coalesce(s.home_carousel_sort_order, 999) asc, s.created_at desc;
$$;

grant execute on function public.get_public_home_carousel_sponsors() to anon, authenticated;
