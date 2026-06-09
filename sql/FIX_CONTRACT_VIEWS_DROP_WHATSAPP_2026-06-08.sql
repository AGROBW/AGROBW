-- =====================================================================
-- R3 — Pré-CONTRACT: recriar views dependentes SEM whatsapp + LEAST-PRIVILEGE
-- Data: 2026-06-08
-- =====================================================================
-- O CONTRACT (drop de announcements.whatsapp) falha SEM CASCADE porque
-- public.ads_full e public.announcements_with_active_highlights dependem da
-- coluna. Recriamos as duas SEM `whatsapp` e, em vez de preservar os grants
-- amplos legados, aplicamos LEAST-PRIVILEGE.
--
-- BASE DA DECISÃO (verificado):
--  - Passo 0(a): 0 dependências adicionais nessas views.
--  - grep no repo (pages/components/src/services/api/supabase/functions):
--    NENHUM uso dessas views pelo app/frontend/Edge Functions — só em sql/docs.
--  - ads_full EXPÕE user_phone (e roda com privilégios do owner -> dribla RLS).
--
-- JUSTIFICATIVA DE GRANTS (item 4):
--  - anon          -> NÃO. App não consulta estas views; e ads_full vazaria
--                     user_phone de todos os usuários driblando RLS.
--  - authenticated -> NÃO. App lê announcements pela tabela (RLS), nunca por
--                     estas views; ads_full vazaria user_phone a qualquer logado.
--  - service_role  -> SELECT apenas (uso backend/admin eventual; é server-only e
--                     já bypassa RLS). Sem DML.
--  - public        -> NÃO.
-- Resultado: nenhuma exposição client-side; sem DML em view; sem grant amplo.
--
-- ⚠️ Ao recriar a view, o ALTER DEFAULT PRIVILEGES legado (tabelas/views) volta a
--    conceder anon/authenticated automaticamente -> por isso REVOGAMOS logo após
--    o CREATE.
--
-- NÃO aplicar automaticamente. Transacional. NÃO usar CASCADE.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. ads_full — sem whatsapp
-- ---------------------------------------------------------------------
drop view if exists public.ads_full;
create view public.ads_full as
 select
    a.id, a.title, a.description, a.price, a.city, a.state, a.cep, a.category_id,
    a.images, a.user_id, a.status, a.views, a.is_premium,
    a.health_score, a.created_at, a.updated_at, a.expires_at, a.sold_at,
    c.name as category_name,
    c.slug as category_slug,
    u.name as user_name,
    u.avatar as user_avatar,
    u.phone as user_phone,
    ( select count(*) as count
        from favorites
       where favorites.announcement_id = a.id) as favorites_count,
    ( select json_agg(json_build_object('label', announcement_technical_details.label, 'value', announcement_technical_details.value, 'icon_name', announcement_technical_details.icon_name)) as json_agg
        from announcement_technical_details
       where announcement_technical_details.announcement_id = a.id) as technical_details
   from announcements a
     left join categories c on a.category_id = c.id
     left join users u on a.user_id = u.id;

-- least-privilege: derruba qualquer grant herdado e concede só service_role SELECT
revoke all on public.ads_full from public, anon, authenticated;
grant select on public.ads_full to service_role;

-- ---------------------------------------------------------------------
-- 2. announcements_with_active_highlights — sem whatsapp
-- ---------------------------------------------------------------------
drop view if exists public.announcements_with_active_highlights;
create view public.announcements_with_active_highlights as
 select
    id, title, description, price, city, state, cep, category_id, images, user_id,
    status, views, is_premium, health_score, created_at, updated_at, expires_at, sold_at,
    category_slug, sub_category_id, quantity, unit, unit_price, currency, sub_category_label,
    highlight_category, highlight_category_until, highlight_home, highlight_home_until,
    case
      when highlight_home = true and (highlight_home_until is null or highlight_home_until > now()) then true
      else false
    end as is_home_highlight_active,
    case
      when highlight_category = true and (highlight_category_until is null or highlight_category_until > now()) then true
      else false
    end as is_category_highlight_active
   from announcements;

revoke all on public.announcements_with_active_highlights from public, anon, authenticated;
grant select on public.announcements_with_active_highlights to service_role;

commit;

-- =====================================================================
-- VERIFICAÇÃO
-- =====================================================================
-- a) views sem whatsapp (0 linhas cada):
-- select 1 from information_schema.columns
-- where table_schema='public' and table_name='ads_full' and column_name='whatsapp';
-- select 1 from information_schema.columns
-- where table_schema='public' and table_name='announcements_with_active_highlights' and column_name='whatsapp';
--
-- b) GRANTS least-privilege (esperado: SÓ service_role com SELECT; nada de anon/
--    authenticated/public; nenhum INSERT/UPDATE/DELETE):
-- select table_name, grantee, privilege_type
-- from information_schema.role_table_grants
-- where table_schema='public'
--   and table_name in ('ads_full','announcements_with_active_highlights')
-- order by 1,2,3;
--
-- c) nenhuma função/objeto referencia mais a.whatsapp (0):
-- select proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
-- where n.nspname='public' and p.prosrc ~* '\ma\.whatsapp\M';
--
-- d) anon NÃO lê as views (REST) — esperado permission denied:
--   curl ".../rest/v1/ads_full?select=user_phone&limit=1" -H "apikey:<ANON>"  -> denied
--
-- DEPOIS disto -> rodar o CONTRACT (drop das colunas).
-- =====================================================================
