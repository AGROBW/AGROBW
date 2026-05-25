create or replace function public.admin_apply_announcement_edit_request(
  p_request_id uuid
)
returns table (
  announcement_id uuid,
  title text,
  status text,
  video_url text,
  video_thumbnail_url text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_is_admin boolean := false;
  v_request public.announcement_edit_requests%rowtype;
  v_original_status text;
  v_updated public.announcements%rowtype;
  v_images text[];
begin
  select exists (
    select 1
    from public.users
    where id = v_actor_id
      and (
        is_admin = true
        or upper(coalesce(role, '')) = 'ADMIN'
      )
  ) into v_is_admin;

  if not v_is_admin then
    raise exception 'Acesso negado. Apenas administradores podem aprovar edicoes de anuncios.';
  end if;

  select *
    into v_request
  from public.announcement_edit_requests
  where id = p_request_id
    and status = 'pending'
  limit 1;

  if v_request.id is null then
    raise exception 'Solicitacao de edicao pendente nao encontrada.';
  end if;

  v_original_status := upper(coalesce(nullif(trim(v_request.payload->>'__original_announcement_status'), ''), 'ACTIVE'));

  if jsonb_typeof(coalesce(v_request.payload->'images', 'null'::jsonb)) = 'array' then
    select coalesce(array_agg(value), array[]::text[])
      into v_images
    from jsonb_array_elements_text(v_request.payload->'images') as value;
  else
    v_images := null;
  end if;

  update public.announcements a
  set
    title = case when v_request.payload ? 'title' then coalesce(nullif(trim(v_request.payload->>'title'), ''), a.title) else a.title end,
    description = case when v_request.payload ? 'description' then coalesce(nullif(trim(v_request.payload->>'description'), ''), a.description) else a.description end,
    price = case when v_request.payload ? 'price' and jsonb_typeof(coalesce(v_request.payload->'price', 'null'::jsonb)) <> 'null' then (v_request.payload->>'price')::numeric else a.price end,
    unit_price = case when v_request.payload ? 'unit_price' and jsonb_typeof(coalesce(v_request.payload->'unit_price', 'null'::jsonb)) <> 'null' then (v_request.payload->>'unit_price')::numeric else a.unit_price end,
    quantity = case when v_request.payload ? 'quantity' and jsonb_typeof(coalesce(v_request.payload->'quantity', 'null'::jsonb)) <> 'null' then (v_request.payload->>'quantity')::integer else a.quantity end,
    unit = case when v_request.payload ? 'unit' then nullif(trim(v_request.payload->>'unit'), '') else a.unit end,
    currency = case when v_request.payload ? 'currency' then nullif(trim(v_request.payload->>'currency'), '') else a.currency end,
    category_id = case when v_request.payload ? 'category_id' and jsonb_typeof(coalesce(v_request.payload->'category_id', 'null'::jsonb)) <> 'null' then (v_request.payload->>'category_id')::uuid else a.category_id end,
    category_slug = case when v_request.payload ? 'category_slug' then nullif(trim(v_request.payload->>'category_slug'), '') else a.category_slug end,
    sub_category_id = case when v_request.payload ? 'sub_category_id' and jsonb_typeof(coalesce(v_request.payload->'sub_category_id', 'null'::jsonb)) <> 'null' then (v_request.payload->>'sub_category_id')::uuid else a.sub_category_id end,
    sub_category_label = case when v_request.payload ? 'sub_category_label' then nullif(trim(v_request.payload->>'sub_category_label'), '') else a.sub_category_label end,
    city = case when v_request.payload ? 'city' then nullif(trim(v_request.payload->>'city'), '') else a.city end,
    state = case when v_request.payload ? 'state' then nullif(trim(v_request.payload->>'state'), '') else a.state end,
    cep = case when v_request.payload ? 'cep' then nullif(trim(v_request.payload->>'cep'), '') else a.cep end,
    product_condition = case when v_request.payload ? 'product_condition' then nullif(trim(v_request.payload->>'product_condition'), '') else a.product_condition end,
    availability = case when v_request.payload ? 'availability' then nullif(trim(v_request.payload->>'availability'), '') else a.availability end,
    accepts_trade = case when v_request.payload ? 'accepts_trade' then coalesce((v_request.payload->>'accepts_trade')::boolean, false) else a.accepts_trade end,
    has_warranty = case when v_request.payload ? 'has_warranty' then coalesce((v_request.payload->>'has_warranty')::boolean, false) else a.has_warranty end,
    warranty_details = case when v_request.payload ? 'warranty_details' then nullif(trim(v_request.payload->>'warranty_details'), '') else a.warranty_details end,
    has_invoice = case when v_request.payload ? 'has_invoice' then coalesce((v_request.payload->>'has_invoice')::boolean, false) else a.has_invoice end,
    images = case when v_request.payload ? 'images' and v_images is not null then v_images else a.images end,
    video_url = case when v_request.payload ? 'video_url' then nullif(trim(v_request.payload->>'video_url'), '') else a.video_url end,
    video_storage_path = case when v_request.payload ? 'video_storage_path' then nullif(trim(v_request.payload->>'video_storage_path'), '') else a.video_storage_path end,
    video_thumbnail_url = case when v_request.payload ? 'video_thumbnail_url' then nullif(trim(v_request.payload->>'video_thumbnail_url'), '') else a.video_thumbnail_url end,
    video_thumbnail_storage_path = case when v_request.payload ? 'video_thumbnail_storage_path' then nullif(trim(v_request.payload->>'video_thumbnail_storage_path'), '') else a.video_thumbnail_storage_path end,
    video_duration_seconds = case when v_request.payload ? 'video_duration_seconds' and jsonb_typeof(coalesce(v_request.payload->'video_duration_seconds', 'null'::jsonb)) <> 'null' then (v_request.payload->>'video_duration_seconds')::integer else a.video_duration_seconds end,
    video_size_bytes = case when v_request.payload ? 'video_size_bytes' and jsonb_typeof(coalesce(v_request.payload->'video_size_bytes', 'null'::jsonb)) <> 'null' then (v_request.payload->>'video_size_bytes')::bigint else a.video_size_bytes end,
    is_premium = case when v_request.payload ? 'is_premium' then coalesce((v_request.payload->>'is_premium')::boolean, false) else a.is_premium end,
    whatsapp = case when v_request.payload ? 'whatsapp' then nullif(trim(v_request.payload->>'whatsapp'), '') else a.whatsapp end
  where a.id = v_request.announcement_id
  returning a.* into v_updated;

  if v_updated.id is null then
    raise exception 'Anuncio original nao encontrado ou sem permissao para atualizacao.';
  end if;

  update public.announcements
  set
    status = case when v_original_status = 'REJECTED' then 'ACTIVE' else v_original_status end,
    publication_review_admin_override = case when v_original_status = 'ACTIVE' or v_original_status = 'REJECTED' then true else false end,
    publication_review_severity = null,
    publication_review_reasons = '[]'::jsonb,
    publication_review_checked_at = now(),
    rejection_reason = case when v_original_status = 'REJECTED' then null else rejection_reason end,
    rejected_at = case when v_original_status = 'REJECTED' then null else rejected_at end,
    reanalysis_available_at = case when v_original_status = 'REJECTED' then null else reanalysis_available_at end
  where id = v_request.announcement_id
  returning * into v_updated;

  delete from public.announcement_technical_details
  where announcement_id = v_request.announcement_id;

  if jsonb_typeof(coalesce(v_request.technical_details, '[]'::jsonb)) = 'array'
    and jsonb_array_length(coalesce(v_request.technical_details, '[]'::jsonb)) > 0 then
    insert into public.announcement_technical_details (
      announcement_id,
      label,
      value,
      icon_name
    )
    select
      v_request.announcement_id,
      coalesce(nullif(trim(item->>'label'), ''), 'Detalhe'),
      coalesce(item->>'value', ''),
      coalesce(nullif(trim(item->>'icon_name'), ''), 'Circle')
    from jsonb_array_elements(v_request.technical_details) as item
    where coalesce(nullif(trim(item->>'value'), ''), '') <> '';
  end if;

  update public.announcement_edit_requests
  set
    status = 'approved',
    reviewed_at = now(),
    reviewed_by = v_actor_id,
    rejection_reason = null,
    reanalysis_available_at = null
  where id = v_request.id;

  return query
  select
    v_updated.id,
    v_updated.title,
    v_updated.status,
    v_updated.video_url,
    v_updated.video_thumbnail_url;
end;
$$;

grant execute on function public.admin_apply_announcement_edit_request(uuid) to authenticated;
