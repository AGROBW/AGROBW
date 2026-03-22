create extension if not exists unaccent;

alter table public.users
  add column if not exists business_description text;

comment on column public.users.business_description is
'Descrição institucional curta do vendedor para exibição no perfil e na página do anúncio. Não pode conter telefone, e-mail, links ou redes sociais.';

create or replace function public.business_description_has_contact_reference(input_text text)
returns boolean
language plpgsql
immutable
as $$
declare
  normalized text;
  compacted text;
begin
  if input_text is null or btrim(input_text) = '' then
    return false;
  end if;

  normalized := lower(unaccent(input_text));
  compacted := regexp_replace(normalized, '[^a-z0-9]+', '', 'g');

  return
    length(btrim(input_text)) > 500
    or input_text ~* '[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}'
    or input_text ~* 'https?://'
    or input_text ~* 'www\.'
    or input_text ~* '\m[a-z0-9\-]+\.(com|com\.br|net|org|br|gov\.br|edu\.br|app|io|co|xyz|online|site|store|shop|blog)\M'
    or input_text ~* '@[a-z0-9._-]+'
    or input_text ~* '\+?55\s*\(?\d{2,3}\)?\s*\d{4,5}[-\s]?\d{4}'
    or input_text ~* '\(?\d{2,3}\)?\s*\d{4,5}[-\s]?\d{4}'
    or input_text ~* '\m\d{10,13}\M'
    or normalized ~* '\m(whatsapp|whats|zap|telegram|instagram|insta|facebook|linkedin|twitter|tiktok|discord|gmail|hotmail|outlook|yahoo|email|e-mail|arroba|telefone|celular|fone|contato|ligue|chama|direct|dm|site|link)\M'
    or compacted ~ '(whatsapp|whats|zap|telegram|instagram|insta|facebook|linkedin|twitter|tiktok|discord|gmail|hotmail|outlook|yahoo|email|arroba|telefone|celular|fone|contato|ligue|chama|direct|site|link|wame)';
end;
$$;

create or replace function public.validate_user_business_description()
returns trigger
language plpgsql
as $$
begin
  if new.business_description is not null then
    new.business_description := btrim(new.business_description);

    if public.business_description_has_contact_reference(new.business_description) then
      raise exception using
        errcode = '22023',
        message = 'A descrição do negócio não pode conter telefone, e-mail, links, redes sociais ou qualquer outra forma de contato.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists users_validate_business_description on public.users;

create trigger users_validate_business_description
before insert or update of business_description
on public.users
for each row
execute function public.validate_user_business_description();

drop view if exists public.vendedores_publicos;

create view public.vendedores_publicos as
select
  u.id,
  u.name,
  u.avatar,
  u.document_verified,
  u.business_description,
  u.cidade,
  u.estado
from public.users u
;

grant select on public.vendedores_publicos to anon, authenticated;
