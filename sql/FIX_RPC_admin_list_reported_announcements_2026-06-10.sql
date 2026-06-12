-- =====================================================================
-- FIX — admin_list_reported_announcements: 42702 "column reference id is ambiguous"
-- Data: 2026-06-10
-- =====================================================================
-- CAUSA: a função é RETURNS TABLE(id uuid, ...), então 'id' existe como variável
-- OUT do PL/pgSQL. Na guarda admin, `where id = v_actor_id` fica ambíguo entre a
-- coluna users.id e a variável de saída id -> erro 42702 -> PostgREST devolve 400.
-- FIX MÍNIMO: qualificar a coluna -> `where users.id = v_actor_id`.
-- Nada mais muda. CREATE OR REPLACE preserva grants existentes.
--
-- ⚠️ Corpo capturado do dump (2026-06-07). Conferir vs vivo antes de aplicar:
--   select pg_get_functiondef('public.admin_list_reported_announcements()'::regprocedure);
--   Se divergir, aplicar APENAS a troca: where id = v_actor_id  ->  where users.id = v_actor_id
-- =====================================================================

create or replace function public.admin_list_reported_announcements()
returns table(
  id uuid, title text, description text, category_slug text, price numeric,
  status text, created_at timestamptz, user_id uuid, owner_name text, owner_email text,
  images text[], community_reports_count integer, community_report_reasons jsonb,
  community_reported_to_review_at timestamptz
)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_actor_id uuid := auth.uid();
  v_is_admin boolean := false;
begin
  select exists (
    select 1
    from public.users
    where users.id = v_actor_id          -- FIX 42702: qualificar coluna (era: where id = v_actor_id)
      and (
        is_admin = true
        or upper(coalesce(role, '')) = 'ADMIN'
      )
  ) into v_is_admin;

  if not v_is_admin then
    raise exception 'Acesso negado. Apenas administradores podem listar denuncias de anuncios.';
  end if;

  return query
  select
    a.id,
    a.title,
    a.description,
    a.category_slug,
    a.price,
    a.status,
    a.created_at,
    a.user_id,
    coalesce(nullif(trim(u.name), ''), 'Anunciante') as owner_name,
    nullif(trim(u.email), '') as owner_email,
    coalesce(a.images, array[]::text[]) as images,
    coalesce(a.community_reports_count, 0) as community_reports_count,
    coalesce(a.community_report_reasons, '[]'::jsonb) as community_report_reasons,
    a.community_reported_to_review_at
  from public.announcements a
  join public.users u
    on u.id = a.user_id
  where a.community_reported_to_review_at is not null
  order by a.community_reported_to_review_at desc, a.created_at desc;
end;
$$;

-- =====================================================================
-- VALIDAÇÃO:
--   admin: painel AnnouncementReportsManagement carrega a lista (sem 400).
--   não-admin/anon: chamada -> 'Acesso negado' (guarda intacta).
--   select * from public.admin_list_reported_announcements();  (logado admin) -> retorna linhas.
-- ROLLBACK: re-aplicar a versão anterior (com `where id = v_actor_id`) — reintroduz o bug.
-- =====================================================================
