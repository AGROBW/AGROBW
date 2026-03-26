alter table public.announcement_highlights_history
  alter column announcement_id drop not null;

do $$
declare
  constraint_name text;
begin
  select tc.constraint_name
    into constraint_name
  from information_schema.table_constraints tc
  join information_schema.key_column_usage kcu
    on tc.constraint_name = kcu.constraint_name
   and tc.table_schema = kcu.table_schema
  where tc.table_schema = 'public'
    and tc.table_name = 'announcement_highlights_history'
    and tc.constraint_type = 'FOREIGN KEY'
    and kcu.column_name = 'announcement_id'
  limit 1;

  if constraint_name is not null then
    execute format(
      'alter table public.announcement_highlights_history drop constraint %I',
      constraint_name
    );
  end if;
end $$;

alter table public.announcement_highlights_history
  add constraint announcement_highlights_history_announcement_id_fkey
  foreign key (announcement_id)
  references public.announcements(id)
  on delete set null;
