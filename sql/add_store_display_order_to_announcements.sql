alter table public.announcements
  add column if not exists store_display_order integer;

create index if not exists idx_announcements_user_store_display_order
  on public.announcements(user_id, store_display_order);

with ranked_announcements as (
  select
    a.id,
    row_number() over (
      partition by a.user_id
      order by
        coalesce(a.highlight_home, false) desc,
        coalesce(a.highlight_category, false) desc,
        a.created_at desc
    ) as desired_order
  from public.announcements a
  where a.status = 'ACTIVE'
    and a.store_display_order is null
)
update public.announcements a
set store_display_order = ranked_announcements.desired_order
from ranked_announcements
where ranked_announcements.id = a.id;
