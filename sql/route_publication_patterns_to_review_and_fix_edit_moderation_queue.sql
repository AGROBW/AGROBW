create or replace function public.enforce_announcement_publication_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
  v_content_changed boolean := false;
begin
  if tg_op = 'UPDATE' then
    v_content_changed :=
      coalesce(new.title, '') is distinct from coalesce(old.title, '')
      or coalesce(new.description, '') is distinct from coalesce(old.description, '')
      or coalesce(new.category_slug, '') is distinct from coalesce(old.category_slug, '')
      or coalesce(new.images, array[]::text[]) is distinct from coalesce(old.images, array[]::text[]);
  end if;

  if tg_op = 'UPDATE'
    and upper(coalesce(new.status, '')) = 'ACTIVE'
    and coalesce(new.publication_review_admin_override, false) = true
    and not v_content_changed then
    new.publication_review_checked_at := now();
    new.publication_review_severity := null;
    new.publication_review_reasons := '[]'::jsonb;
    return new;
  end if;

  if v_content_changed then
    new.publication_review_admin_override := false;
  end if;

  if upper(coalesce(new.status, '')) not in ('ACTIVE') then
    return new;
  end if;

  v_result := public.evaluate_announcement_publication_rules(
    new.title,
    new.description,
    new.category_slug,
    to_jsonb(coalesce(new.images, array[]::text[]))
  );

  new.publication_review_checked_at := now();
  new.publication_review_reasons := coalesce(v_result->'reasons', '[]'::jsonb);

  if coalesce((v_result->>'blocked')::boolean, false)
    or coalesce((v_result->>'review_required')::boolean, false) then
    new.status := 'PENDING';
    new.publication_review_severity := 'review';
    new.publication_review_admin_override := false;
  else
    new.publication_review_severity := null;
    new.publication_review_reasons := '[]'::jsonb;
  end if;

  return new;
end;
$$;

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
    and not exists (
      select 1
      from public.announcement_edit_requests aer
      where aer.announcement_id = a.id
        and aer.status = 'pending'
    )
  order by a.created_at desc;
end;
$$;

grant execute on function public.admin_list_moderation_queue_announcements() to authenticated;

create or replace function public.enforce_announcement_edit_request_publication_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
  v_original_status text;
  v_images jsonb := case
    when jsonb_typeof(coalesce(new.payload->'images', '[]'::jsonb)) = 'array' then coalesce(new.payload->'images', '[]'::jsonb)
    else '[]'::jsonb
  end;
begin
  select upper(coalesce(status, ''))
    into v_original_status
  from public.announcements
  where id = new.announcement_id;

  if coalesce(nullif(trim(coalesce(new.payload->>'__original_announcement_status', '')), ''), '') = '' and coalesce(v_original_status, '') <> '' then
    new.payload := jsonb_set(
      coalesce(new.payload, '{}'::jsonb),
      '{__original_announcement_status}',
      to_jsonb(v_original_status),
      true
    );
  end if;

  if new.status <> 'pending' then
    return new;
  end if;

  v_result := public.evaluate_announcement_publication_rules(
    coalesce(new.payload->>'title', ''),
    coalesce(new.payload->>'description', ''),
    coalesce(new.payload->>'category_slug', ''),
    v_images
  );

  if coalesce((v_result->>'blocked')::boolean, false)
    or coalesce((v_result->>'review_required')::boolean, false) then
    update public.announcements
    set
      status = case when upper(coalesce(status, '')) = 'ACTIVE' then 'PENDING' else status end,
      publication_review_severity = 'review',
      publication_review_checked_at = now(),
      publication_review_reasons = coalesce(v_result->'reasons', '[]'::jsonb),
      publication_review_admin_override = false
    where id = new.announcement_id;
  end if;

  return new;
end;
$$;

drop trigger if exists announcement_edit_requests_enforce_publication_rules on public.announcement_edit_requests;
create trigger announcement_edit_requests_enforce_publication_rules
before insert or update of payload, status on public.announcement_edit_requests
for each row
execute function public.enforce_announcement_edit_request_publication_rules();
