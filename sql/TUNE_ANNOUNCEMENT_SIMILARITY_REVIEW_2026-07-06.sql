-- Ajuste da regra de similaridade de anuncios
-- Objetivo:
-- 1) reduzir falsos positivos;
-- 2) continuar segurando flood recente de anuncios muito parecidos;
-- 3) impedir efeito cascata entre anuncios ja pendentes.
--
-- Mudancas:
-- - status considerados: ACTIVE e PAUSED
-- - janela de comparacao: 30 dias
-- - score minimo para revisao: 8

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
      and a.status in ('ACTIVE', 'active', 'PAUSED', 'paused')
      and a.created_at >= now() - interval '30 days'
  ),
  best_match as (
    select *
    from candidates
    where score >= 8
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

-- Validacao sugerida:
-- select s.*
-- from public.announcements a
-- cross join lateral public.get_announcement_similarity_review_signal(
--   a.user_id,
--   a.title,
--   a.category_id,
--   a.city,
--   a.state,
--   a.price,
--   a.id
-- ) s
-- where a.id in ('bec849e4-2eed-4153-ac5e-30e1e8ea6bcd', '5a335ce8-f8e9-4ca2-b39b-d192e79cf75f');
