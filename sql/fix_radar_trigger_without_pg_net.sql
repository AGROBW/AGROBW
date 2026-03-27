create or replace function public.trigger_radar_matcher()
returns trigger
language plpgsql
as $$
declare
  function_url text;
  payload jsonb;
  has_pg_net boolean := to_regnamespace('net') is not null;
  has_sql_matcher boolean := to_regprocedure('public.match_announcements_to_alerts(uuid)') is not null;
begin
  if new.status = 'ACTIVE' then
    function_url := current_setting('app.settings.edge_function_url', true) || '/radar-matcher';
    payload := jsonb_build_object('announcement_id', new.id);

    if has_pg_net and function_url is not null and function_url <> '' then
      perform net.http_post(
        url := function_url,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
        ),
        body := payload
      );
    elsif has_sql_matcher then
      perform public.match_announcements_to_alerts(new.id);
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.trigger_radar_matcher_price_drop()
returns trigger
language plpgsql
as $$
declare
  price_reduction_pct decimal;
  function_url text;
  payload jsonb;
  has_pg_net boolean := to_regnamespace('net') is not null;
  has_sql_matcher boolean := to_regprocedure('public.match_announcements_to_alerts(uuid)') is not null;
begin
  if old.price > 0 and new.price > 0 then
    price_reduction_pct := ((old.price - new.price) / old.price) * 100;

    if price_reduction_pct >= 20 then
      function_url := current_setting('app.settings.edge_function_url', true) || '/radar-matcher';
      payload := jsonb_build_object('announcement_id', new.id, 'event', 'price_drop');

      if has_pg_net and function_url is not null and function_url <> '' then
        perform net.http_post(
          url := function_url,
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
          ),
          body := payload
        );
      elsif has_sql_matcher then
        perform public.match_announcements_to_alerts(new.id);
      end if;
    end if;
  end if;

  return new;
end;
$$;
