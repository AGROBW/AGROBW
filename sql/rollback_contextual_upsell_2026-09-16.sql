begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

drop trigger if exists trg_attribute_contextual_upsell_conversion on public.user_subscriptions;
drop function if exists public.attribute_contextual_upsell_conversion();
drop function if exists public.attribute_contextual_upsell_conversion(uuid, uuid);
drop function if exists public.attribute_contextual_upsell_conversion(uuid, uuid, text);
drop function if exists public.purge_contextual_upsell_data();
drop function if exists public.update_contextual_upsell_admin(boolean, boolean, smallint, smallint, text[], uuid[]);
drop function if exists public.get_contextual_upsell_admin();
drop function if exists public.record_my_contextual_upsell_event(text, text, text, uuid, text, uuid, text);
drop function if exists public.get_my_contextual_upsell_runtime();
drop table if exists public.contextual_upsell_recovery_queue;
drop table if exists public.contextual_upsell_events;
drop table if exists public.contextual_upsell_settings;

commit;
