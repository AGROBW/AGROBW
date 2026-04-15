do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'plan_alert_email_jobs_alert_kind_check'
      and conrelid = 'public.plan_alert_email_jobs'::regclass
  ) then
    alter table public.plan_alert_email_jobs
      drop constraint plan_alert_email_jobs_alert_kind_check;
  end if;
end $$;

alter table public.plan_alert_email_jobs
  add constraint plan_alert_email_jobs_alert_kind_check
  check (alert_kind in ('conversion', 'renewal', 'edit_rejected'));
