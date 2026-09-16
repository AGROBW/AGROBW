-- Contingencia imediata caso a atribuicao interfira no webhook de assinaturas.
begin;
set local lock_timeout = '5s';
drop trigger if exists trg_attribute_contextual_upsell_conversion on public.user_subscriptions;
drop function if exists public.attribute_contextual_upsell_conversion();
drop function if exists public.attribute_contextual_upsell_conversion(uuid, uuid);
drop function if exists public.attribute_contextual_upsell_conversion(uuid, uuid, text);
do $$
begin
  if to_regclass('public.contextual_upsell_settings') is not null then
    update public.contextual_upsell_settings
    set is_enabled = false,
        recovery_enabled = false,
        enabled_contexts = '{}'::text[],
        canary_user_ids = '{}'::uuid[],
        updated_at = now()
    where id = '00000000-0000-0000-0000-000000000041'::uuid;
  end if;
end;
$$;
commit;
