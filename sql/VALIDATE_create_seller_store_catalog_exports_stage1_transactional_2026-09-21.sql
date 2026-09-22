begin;

do $$
declare
  v_user_id uuid;
  v_store_id uuid;
  v_announcement_id uuid;
  v_export_id uuid;
  v_duplicate_id uuid;
  v_export public.seller_store_catalog_exports%rowtype;
begin
  select stores.user_id, stores.id, announcements.id
  into v_user_id, v_store_id, v_announcement_id
  from public.seller_stores stores
  join public.announcements announcements
    on announcements.user_id = stores.user_id
   and announcements.status = 'ACTIVE'
  where stores.is_active = true
    and stores.is_store_feature_enabled = true
    and coalesce(stores.is_paused_due_to_plan, false) = false
    and exists (
      select 1
      from public.user_subscriptions subscriptions
      join public.plans plans on plans.id = subscriptions.plan_id
      where subscriptions.user_id = stores.user_id
        and subscriptions.status = 'active'
        and subscriptions.current_period_end > now()
        and coalesce(plans.has_seller_store, false) = true
    )
  order by stores.created_at
  limit 1;

  if v_user_id is null then
    raise exception 'VALIDATION_REQUIRES_ELIGIBLE_STORE_WITH_ACTIVE_ANNOUNCEMENT';
  end if;

  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_user_id::text, 'role', 'authenticated')::text,
    true
  );

  if to_regclass('public.seller_store_catalog_runtime_settings') is not null then
    update public.seller_store_catalog_runtime_settings
    set processing_enabled = true, paused_reason = null
    where singleton = true;
  end if;

  v_export_id := public.request_seller_store_catalog_export(
    array[v_announcement_id],
    'Catalogo de validacao',
    'Gerado somente dentro de uma transacao com rollback',
    'consult'
  );

  select * into strict v_export
  from public.seller_store_catalog_exports
  where id = v_export_id;

  if v_export.user_id <> v_user_id or v_export.store_id <> v_store_id then
    raise exception 'Exportacao vinculada ao proprietario incorreto';
  end if;
  if v_export.status <> 'queued' or v_export.price_mode <> 'consult' then
    raise exception 'Contrato inicial da fila invalido';
  end if;
  if jsonb_array_length(v_export.announcement_snapshot) <> 1 then
    raise exception 'Snapshot de anuncio invalido';
  end if;
  if v_export.store_snapshot ? 'email' or v_export.store_snapshot ? 'whatsapp' then
    raise exception 'Snapshot da loja contem contato privado';
  end if;
  if v_export.store_snapshot->>'public_url' not like 'https://agrobw.com.br/loja/%' then
    raise exception 'Dominio canonico ausente';
  end if;

  v_duplicate_id := public.request_seller_store_catalog_export(
    array[v_announcement_id],
    'Catalogo de validacao',
    'Gerado somente dentro de uma transacao com rollback',
    'consult'
  );
  if v_duplicate_id <> v_export_id then
    raise exception 'Solicitacao equivalente nao foi deduplicada';
  end if;

  insert into public.seller_store_catalog_exports (
    user_id, store_id, status, catalog_title, price_mode, announcement_ids,
    store_snapshot, announcement_snapshot, snapshot_hash
  )
  select
    v_export.user_id,
    v_export.store_id,
    'cancelled',
    'Historico de limite ' || generated.number,
    v_export.price_mode,
    v_export.announcement_ids,
    v_export.store_snapshot,
    v_export.announcement_snapshot,
    md5('historico-limite-' || generated.number::text)
  from generate_series(1, 19) generated(number);

  v_duplicate_id := public.request_seller_store_catalog_export(
    array[v_announcement_id],
    'Catalogo de validacao',
    'Gerado somente dentro de uma transacao com rollback',
    'consult'
  );
  if v_duplicate_id <> v_export_id then
    raise exception 'Solicitacao equivalente no limite diario nao foi deduplicada';
  end if;

  if not public.cancel_seller_store_catalog_export(v_export_id) then
    raise exception 'Cancelamento do job enfileirado falhou';
  end if;
  if (select status from public.seller_store_catalog_exports where id = v_export_id) <> 'cancelled' then
    raise exception 'Status cancelado nao persistido';
  end if;
end;
$$;

-- Regression guard: catalog policies must not make unrelated buckets fail for
-- authenticated clients after direct table privileges are revoked.
set local role authenticated;
select count(*) as objetos_ads_visiveis
from storage.objects
where bucket_id = 'ads-images';
reset role;

rollback;
