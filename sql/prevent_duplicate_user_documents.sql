-- Impede cadastro e atualizacao com CPF/CNPJ duplicado.
-- A coluna normalizada guarda somente numeros para comparar CPF/CNPJ com ou sem mascara.

alter table public.users
  add column if not exists document_normalized text;

create or replace function public.normalize_user_document(p_document text)
returns text
language sql
immutable
set search_path = public
as $$
  select nullif(regexp_replace(coalesce(p_document, ''), '\D', '', 'g'), '');
$$;

create or replace function public.sync_user_document_normalized()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.document_normalized := public.normalize_user_document(new.document);
  return new;
end;
$$;

update public.users
set document_normalized = public.normalize_user_document(document)
where document is not null
  and document_normalized is distinct from public.normalize_user_document(document);

create unique index if not exists users_document_normalized_unique_idx
  on public.users (document_normalized)
  where document_normalized is not null;

drop trigger if exists trg_sync_user_document_normalized on public.users;
create trigger trg_sync_user_document_normalized
before insert or update of document on public.users
for each row
execute function public.sync_user_document_normalized();

create or replace function public.is_document_available(
  p_document text,
  p_ignore_user_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (
    select 1
    from public.users u
    where u.document_normalized = public.normalize_user_document(p_document)
      and public.normalize_user_document(p_document) is not null
      and (p_ignore_user_id is null or u.id <> p_ignore_user_id)
  );
$$;

grant execute on function public.is_document_available(text, uuid) to anon, authenticated;
