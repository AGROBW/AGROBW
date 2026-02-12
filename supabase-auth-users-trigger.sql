-- ======================================================
-- BWAGRO - Trigger para copiar auth.users -> public.users
-- ======================================================
-- Execute no SQL Editor do Supabase Dashboard

-- 1) Função para inserir usuário na tabela public.users
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (
    id,
    email,
    name,
    phone,
    document,
    birth_date,
    website,
    cep,
    logradouro,
    numero,
    complemento,
    bairro,
    cidade,
    estado,
    role,
    is_admin,
    credits
  )
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'name', 'Usuário'),
    new.raw_user_meta_data->>'phone',
    new.raw_user_meta_data->>'document',
    nullif(new.raw_user_meta_data->>'birth_date','')::date,
    new.raw_user_meta_data->>'website',
    new.raw_user_meta_data->>'cep',
    new.raw_user_meta_data->>'logradouro',
    new.raw_user_meta_data->>'numero',
    new.raw_user_meta_data->>'complemento',
    new.raw_user_meta_data->>'bairro',
    new.raw_user_meta_data->>'cidade',
    new.raw_user_meta_data->>'estado',
    'USER',
    false,
    0
  )
  on conflict (id) do update set
    email = excluded.email,
    name = excluded.name,
    phone = excluded.phone,
    document = excluded.document,
    birth_date = excluded.birth_date,
    website = excluded.website,
    cep = excluded.cep,
    logradouro = excluded.logradouro,
    numero = excluded.numero,
    complemento = excluded.complemento,
    bairro = excluded.bairro,
    cidade = excluded.cidade,
    estado = excluded.estado;

  return new;
end;
$$;

-- 2) Trigger no schema auth

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_auth_user();
