alter table public.layout_settings
  add column if not exists commercial_intelligence_enabled boolean not null default false;

update public.layout_settings
set commercial_intelligence_enabled = false
where commercial_intelligence_enabled is distinct from false;
