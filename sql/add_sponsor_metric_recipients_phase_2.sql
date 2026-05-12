alter table public.site_sponsors
  add column if not exists metric_recipient_emails text[] not null default '{}';

create index if not exists idx_site_sponsors_metric_recipient_emails
  on public.site_sponsors using gin (metric_recipient_emails);

comment on column public.site_sponsors.metric_recipient_emails is
'Lista de e-mails salvos pelo admin para receber relatórios de métricas da Vitrine Premium.';
