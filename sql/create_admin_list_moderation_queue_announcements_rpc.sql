drop function if exists public.admin_list_moderation_queue_announcements();

create or replace function public.admin_list_moderation_queue_announcements()
returns table (
  id uuid,
  title text,
  description text,
  category text,
  category_id uuid,
  category_slug text,
  sub_category_id text,
  sub_category_label text,
  price numeric,
  unit_price numeric,
  quantity numeric,
  unit text,
  currency text,
  status text,
  created_at timestamptz,
  user_id uuid,
  city text,
  state text,
  cep text,
  product_condition text,
  availability text,
  accepts_trade boolean,
  has_warranty boolean,
  warranty_details text,
  has_invoice boolean,
  video_url text,
  video_storage_path text,
  video_duration_seconds integer,
  video_size_bytes bigint,
  is_premium boolean,
  whatsapp text,
  publication_review_reasons jsonb,
  publication_review_severity text,
  community_reports_count integer,
  community_report_reasons jsonb,
  community_reported_to_review_at timestamptz,
  images text[]
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
    select 1
    from public.users
    where users.id = v_actor_id
      and (
        users.is_admin = true
        or upper(coalesce(users.role, '')) = 'ADMIN'
      )
  ) into v_is_admin;

  if not v_is_admin then
    raise exception 'Acesso negado. Apenas administradores podem listar a fila de moderacao.';
  end if;

  return query
  select
    a.id,
    a.title,
    a.description,
    null::text as category,
    a.category_id,
    a.category_slug,
    a.sub_category_id,
    a.sub_category_label,
    a.price,
    a.unit_price,
    a.quantity,
    a.unit,
    a.currency,
    a.status,
    a.created_at,
    a.user_id,
    a.city,
    a.state,
    a.cep,
    a.product_condition,
    a.availability,
    coalesce(a.accepts_trade, false) as accepts_trade,
    coalesce(a.has_warranty, false) as has_warranty,
    a.warranty_details,
    coalesce(a.has_invoice, false) as has_invoice,
    a.video_url,
    a.video_storage_path,
    a.video_duration_seconds,
    a.video_size_bytes,
    coalesce(a.is_premium, false) as is_premium,
    a.whatsapp,
    coalesce(a.publication_review_reasons, '[]'::jsonb) as publication_review_reasons,
    a.publication_review_severity,
    coalesce(a.community_reports_count, 0) as community_reports_count,
    coalesce(a.community_report_reasons, '[]'::jsonb) as community_report_reasons,
    a.community_reported_to_review_at,
    coalesce(a.images, array[]::text[]) as images
  from public.announcements a
  where a.status in ('PENDING', 'UNDER_REVIEW')
  order by a.created_at desc;
end;
$$;

grant execute on function public.admin_list_moderation_queue_announcements() to authenticated;
