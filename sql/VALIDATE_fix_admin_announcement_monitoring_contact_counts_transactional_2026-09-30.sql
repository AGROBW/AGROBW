begin;

do $$
declare
  v_admin_id uuid;
  v_mismatches bigint := 0;
begin
  select users.id
  into v_admin_id
  from public.users
  where users.is_admin = true
     or upper(coalesce(users.role, '')) = 'ADMIN'
  order by users.created_at
  limit 1;

  if v_admin_id is null then
    raise exception 'VALIDATION_ADMIN_NOT_FOUND';
  end if;

  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_admin_id::text, 'role', 'authenticated')::text,
    true
  );

  with actual as (
    select * from public.admin_list_announcements_monitoring()
  ),
  expected as (
    select
      announcements.id,
      (select count(*) from public.leads leads where leads.announcement_id = announcements.id)
        + (select count(*) from public.guest_announcement_contacts contacts where contacts.announcement_id = announcements.id) as leads_count,
      (select count(*) from public.chats chats where chats.announcement_id = announcements.id)
        + (select count(*) from public.guest_announcement_contacts contacts where contacts.announcement_id = announcements.id) as messages_count
    from public.announcements announcements
  )
  select count(*)
  into v_mismatches
  from expected
  left join actual on actual.id = expected.id
  where actual.id is null
     or actual.leads_count is distinct from expected.leads_count
     or actual.messages_count is distinct from expected.messages_count;

  if v_mismatches <> 0 then
    raise exception 'ADMIN_MONITORING_CONTACT_COUNTS_MISMATCH: %', v_mismatches;
  end if;
end;
$$;

rollback;
