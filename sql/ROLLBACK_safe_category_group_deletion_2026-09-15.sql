begin;

drop function if exists public.delete_category_group_admin_safe(uuid, text);
drop function if exists public.get_category_group_deletion_impact_admin(uuid);

commit;
