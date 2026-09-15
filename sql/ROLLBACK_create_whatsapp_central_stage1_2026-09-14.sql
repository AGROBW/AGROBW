begin;

set local lock_timeout = '5s';

do $$
begin
  if to_regclass('public.whatsapp_gateway_jobs') is not null
    or to_regclass('public.whatsapp_gateway_templates') is not null then
    raise exception 'Rollback recusado: remova primeiro as etapas 4 e 3 da Central WhatsApp';
  end if;
end;
$$;

revoke all on function public.update_whatsapp_gateway_settings_admin_safe(text, text, text, text, text, text, boolean)
  from public, anon, authenticated;
revoke all on function public.get_whatsapp_gateway_settings_admin_safe()
  from public, anon, authenticated;

drop function if exists public.update_whatsapp_gateway_settings_admin_safe(text, text, text, text, text, text, boolean);
drop function if exists public.get_whatsapp_gateway_settings_admin_safe();

drop trigger if exists trigger_touch_whatsapp_gateway_settings_updated_at
  on public.whatsapp_gateway_settings;
drop table if exists public.whatsapp_gateway_settings;

drop function if exists public.touch_whatsapp_gateway_settings_updated_at();
drop function if exists public.is_safe_whatsapp_gateway_base_url(text);

commit;
