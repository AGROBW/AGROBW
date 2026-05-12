alter table public.site_sponsors
  add column if not exists metric_auto_send_enabled boolean not null default false,
  add column if not exists metric_auto_send_frequency text not null default 'weekly'
    check (metric_auto_send_frequency in ('weekly', 'monthly')),
  add column if not exists metric_auto_send_day integer not null default 1,
  add column if not exists metric_auto_last_queued_at timestamptz null;

alter table public.site_sponsors
  drop constraint if exists site_sponsors_metric_auto_send_day_check;

alter table public.site_sponsors
  add constraint site_sponsors_metric_auto_send_day_check
  check (metric_auto_send_day between 1 and 28);

create unique index if not exists idx_sponsor_metric_email_jobs_unique_period_recipient
  on public.sponsor_metric_email_jobs (sponsor_id, recipient_email, period_start, period_end);

comment on column public.site_sponsors.metric_auto_send_enabled is
'Define se o patrocinador participa da automação de envio de relatórios de métricas.';

comment on column public.site_sponsors.metric_auto_send_frequency is
'Frequência da automação dos relatórios: semanal ou mensal.';

comment on column public.site_sponsors.metric_auto_send_day is
'Dia da automação. Para semanal usa 1-7 (segunda-domingo). Para mensal usa 1-28.';

comment on column public.site_sponsors.metric_auto_last_queued_at is
'Última vez em que a automação enfileirou relatórios para este patrocinador.';
