-- Execute em staging depois da migracao. Todas as alteracoes sao revertidas no final.
begin;

do $$
declare
  v_actor_id uuid;
  v_foreign_contact_id uuid;
  v_own_contact_id uuid;
  v_count integer;
  v_result boolean;
  v_expected_count bigint;
  v_actual_count bigint;
  v_detail record;
  v_signature text;
  v_auth_required boolean := false;
begin
  select first_contact.seller_id, first_contact.id
  into v_actor_id, v_own_contact_id
  from public.guest_announcement_contacts first_contact
  where exists (
    select 1
    from public.guest_announcement_contacts other_contact
    where other_contact.seller_id <> first_contact.seller_id
  )
  order by first_contact.created_at desc
  limit 1;

  if v_actor_id is null then
    raise exception 'VALIDATION_FIXTURES_REQUIRED: crie contatos para dois vendedores diferentes em staging';
  end if;

  select contacts.id
  into v_foreign_contact_id
  from public.guest_announcement_contacts contacts
  where contacts.seller_id <> v_actor_id
  order by contacts.created_at desc
  limit 1;

  perform set_config('request.jwt.claim.sub', v_actor_id::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_actor_id::text, 'role', 'authenticated')::text, true);

  select count(*) into v_count
  from public.guest_announcement_contacts contacts
  where contacts.contact_expires_at is null
    and not contacts.received_with_active_access
    and contacts.unlocked_once_at is null;
  if v_count <> 0 then
    raise exception 'UNINITIALIZED_ACCESS_STATE_DETECTED: % contato(s)', v_count;
  end if;

  select count(*) into v_count
  from public.get_my_guest_announcement_contact(v_own_contact_id);
  if v_count <> 1 then
    raise exception 'OWN_DETAIL_FAILED';
  end if;

  select count(*) into v_count
  from public.get_my_guest_announcement_contact(v_foreign_contact_id);
  if v_count <> 0 then
    raise exception 'IDOR_DETAIL_DETECTED';
  end if;

  select public.mark_my_guest_announcement_contact_read(v_foreign_contact_id) into v_result;
  if v_result then
    raise exception 'IDOR_MARK_READ_DETECTED';
  end if;

  select public.set_my_guest_announcement_contact_archived(v_foreign_contact_id, true) into v_result;
  if v_result then
    raise exception 'IDOR_ARCHIVE_DETECTED';
  end if;

  select count(*) into v_count
  from public.list_my_guest_announcement_contacts(100, 0, true) listed
  join public.guest_announcement_contacts contacts on contacts.id = listed.contact_id
  where contacts.seller_id <> v_actor_id;
  if v_count <> 0 then
    raise exception 'IDOR_LIST_DETECTED';
  end if;

  select count(*) into v_expected_count
  from public.guest_announcement_contacts contacts
  where contacts.seller_id = v_actor_id
    and contacts.read_at is null
    and contacts.archived_at is null;
  select public.count_my_unread_guest_announcement_contacts() into v_actual_count;
  if v_actual_count <> v_expected_count then
    raise exception 'UNREAD_COUNT_ISOLATION_FAILED: esperado %, recebido %', v_expected_count, v_actual_count;
  end if;

  update public.guest_announcement_contacts
  set
    received_with_active_access = false,
    unlocked_once_at = null,
    contact_expires_at = now() - interval '1 second'
  where id = v_own_contact_id;

  select * into v_detail
  from public.get_my_guest_announcement_contact(v_own_contact_id);
  if v_detail.is_locked is not true
    or v_detail.visitor_name <> 'Contato bloqueado'
    or v_detail.visitor_email is not null
    or v_detail.visitor_phone is not null
    or v_detail.message is not null then
    raise exception 'LOCKED_CONTACT_REDACTION_FAILED';
  end if;

  foreach v_signature in array array[
    'public.list_my_guest_announcement_contacts(integer,integer,boolean)',
    'public.get_my_guest_announcement_contact(uuid)',
    'public.mark_my_guest_announcement_contact_read(uuid)',
    'public.set_my_guest_announcement_contact_archived(uuid,boolean)',
    'public.count_my_unread_guest_announcement_contacts()'
  ] loop
    if has_function_privilege('anon', v_signature, 'EXECUTE') then
      raise exception 'ANON_EXECUTE_DETECTED: %', v_signature;
    end if;
  end loop;

  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '{}', true);
  begin
    perform public.count_my_unread_guest_announcement_contacts();
  exception
    when sqlstate '42501' then
      v_auth_required := true;
  end;
  if not v_auth_required then
    raise exception 'AUTH_REQUIRED_NOT_ENFORCED';
  end if;

  raise notice 'VALIDATION_OK: isolamento, anon, autenticacao, contador e redacao confirmados';
end;
$$;

rollback;
