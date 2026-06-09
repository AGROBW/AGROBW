-- =====================================================================
-- R3 — Ajuste das RPCs ADMIN que dependem de announcements.whatsapp
-- Data: 2026-06-08
-- =====================================================================
-- Aplicar JUNTO da FASE CONTRACT (antes do drop da coluna). Duas funções
-- referenciam announcements.whatsapp e quebrariam ao dropar a coluna:
--   1) admin_list_moderation_queue_announcements()  -> lista de moderação
--   2) admin_apply_announcement_edit_request(uuid)   -> aplica edição
--
-- (1) é redefinida abaixo passando a obter o whatsapp de announcement_contacts.
-- (2) recebe instrução cirúrgica (remover a cláusula whatsapp morta), para não
--     sobrescrever um corpo grande com versão possivelmente desatualizada do dump.
--
-- Descoberta (confirmar que não surgiram outras no estado VIVO):
--   select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--   where n.nspname='public' and p.prosrc ~* '\ma\.whatsapp\M'
--   order by 1;   -- esperado: as 2 funções acima
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1) admin_list_moderation_queue_announcements — whatsapp via privado
--    (mesma assinatura/lógica; só a fonte do whatsapp muda; guarda admin mantida)
-- ---------------------------------------------------------------------
create or replace function public.admin_list_moderation_queue_announcements()
returns table(
  "id" uuid, "title" text, "description" text, "category" text, "category_id" uuid,
  "category_slug" text, "sub_category_id" text, "sub_category_label" text, "price" numeric,
  "unit_price" numeric, "quantity" numeric, "unit" text, "currency" text, "status" text,
  "created_at" timestamptz, "user_id" uuid, "city" text, "state" text, "cep" text,
  "product_condition" text, "availability" text, "accepts_trade" boolean, "has_warranty" boolean,
  "warranty_details" text, "has_invoice" boolean, "video_url" text, "video_storage_path" text,
  "video_thumbnail_url" text, "video_thumbnail_storage_path" text, "video_duration_seconds" integer,
  "video_size_bytes" bigint, "is_premium" boolean, "whatsapp" text,
  "publication_review_reasons" jsonb, "publication_review_severity" text,
  "community_reports_count" integer, "community_report_reasons" jsonb,
  "community_reported_to_review_at" timestamptz, "images" text[]
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_is_admin boolean := false;
begin
  select exists (
    select 1 from public.users
    where users.id = v_actor_id
      and (users.is_admin = true or upper(coalesce(users.role, '')) = 'ADMIN')
  ) into v_is_admin;

  if not v_is_admin then
    raise exception 'Acesso negado. Apenas administradores podem listar a fila de moderacao.';
  end if;

  return query
  select
    a.id, a.title, a.description, null::text as category, a.category_id, a.category_slug,
    a.sub_category_id, a.sub_category_label, a.price, a.unit_price, a.quantity, a.unit, a.currency,
    a.status, a.created_at, a.user_id, a.city, a.state, a.cep, a.product_condition, a.availability,
    coalesce(a.accepts_trade, false), coalesce(a.has_warranty, false), a.warranty_details,
    coalesce(a.has_invoice, false), a.video_url, a.video_storage_path, a.video_thumbnail_url,
    a.video_thumbnail_storage_path, a.video_duration_seconds, a.video_size_bytes,
    coalesce(a.is_premium, false),
    -- R3: whatsapp agora vem da tabela privada (definer lê sem barreira de RLS)
    (select c.whatsapp from public.announcement_contacts c where c.announcement_id = a.id) as whatsapp,
    coalesce(a.publication_review_reasons, '[]'::jsonb), a.publication_review_severity,
    coalesce(a.community_reports_count, 0), coalesce(a.community_report_reasons, '[]'::jsonb),
    a.community_reported_to_review_at, coalesce(a.images, array[]::text[])
  from public.announcements a
  where a.status in ('PENDING', 'UNDER_REVIEW')
    and a.community_reported_to_review_at is null
    and not exists (
      select 1 from public.announcement_edit_requests aer
      where aer.announcement_id = a.id and aer.status = 'pending'
    )
  order by a.created_at desc;
end;
$$;

commit;

-- ---------------------------------------------------------------------
-- 2) admin_apply_announcement_edit_request(uuid) — REMOVER cláusula whatsapp
-- ---------------------------------------------------------------------
-- Edição de anúncio NÃO carrega mais whatsapp no payload (o contato é gravado
-- direto em announcement_contacts pelo app). A cláusula abaixo, no UPDATE da
-- função VIVA, ficou morta e referencia a coluna-base -> remova-a inteira:
--
--     whatsapp = case
--       when v_request.payload ? 'whatsapp' then nullif(trim(v_request.payload->>'whatsapp'), '')
--       else a.whatsapp
--     end,
--
-- (não substituo o corpo inteiro aqui para não arriscar regredir lógica recente
--  da função; é uma remoção de 4 linhas na definição atual.)

-- =====================================================================
-- VERIFICAÇÃO (antes do CONTRACT)
-- =====================================================================
-- -- a) lista de moderação traz whatsapp (admin aal2), agora do privado:
-- select id, whatsapp from public.admin_list_moderation_queue_announcements() limit 5;
-- -- b) nenhuma função referencia mais a.whatsapp:
-- select proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
-- where n.nspname='public' and p.prosrc ~* '\ma\.whatsapp\M';   -- esperado: 0
-- -- Só então rodar o CONTRACT (drop das colunas-base).
-- =====================================================================
