-- 1. Confira se o usuário que está no painel realmente é admin no banco
select
  id,
  email,
  role,
  is_admin
from public.users
where email = 'wallacejoaosilva@gmail.com';

-- 2. Se necessário, promova o usuário para admin
-- update public.users
-- set role = 'admin',
--     is_admin = true
-- where email = 'SEU_EMAIL_ADMIN_AQUI';

-- 3. Confira as policies ativas nas tabelas envolvidas
select
  schemaname,
  tablename,
  policyname,
  cmd,
  roles,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('announcements', 'notifications')
order by tablename, policyname;

-- 4. Confira o status atual do anúncio que você está tentando pausar
select
  id,
  title,
  status,
  user_id,
  updated_at
from public.announcements
where id = '4a416c4b-4d29-4f54-8406-3a80c9d63b43';
