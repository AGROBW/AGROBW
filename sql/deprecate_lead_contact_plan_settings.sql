-- ============================================================================
-- AGRO BW - Descontinuidade de "Contato Lead" como configuracao principal
-- - Mantem as colunas legadas por compatibilidade
-- - Sincroniza seus valores com a validade do plano
-- - A partir daqui, a vigencia do plano passa a ser a referencia operacional
-- ============================================================================

update public.plans
set
  lead_contact_limit_days = coalesce(plan_validity_days_monthly, lead_contact_limit_days),
  lead_contact_limit_days_monthly = coalesce(plan_validity_days_monthly, lead_contact_limit_days_monthly, lead_contact_limit_days),
  lead_contact_limit_days_yearly = coalesce(plan_validity_days_yearly, lead_contact_limit_days_yearly, lead_contact_limit_days)
where
  coalesce(lead_contact_limit_days, -1) <> coalesce(plan_validity_days_monthly, lead_contact_limit_days, -1)
  or coalesce(lead_contact_limit_days_monthly, -1) <> coalesce(plan_validity_days_monthly, lead_contact_limit_days_monthly, -1)
  or coalesce(lead_contact_limit_days_yearly, -1) <> coalesce(plan_validity_days_yearly, lead_contact_limit_days_yearly, -1);

comment on column public.plans.lead_contact_limit_days is
  'LEGADO: mantido apenas por compatibilidade. A vigencia do plano e a referencia operacional para novos contatos.';

comment on column public.plans.lead_contact_limit_days_monthly is
  'LEGADO: sincronizado com plan_validity_days_monthly para compatibilidade.';

comment on column public.plans.lead_contact_limit_days_yearly is
  'LEGADO: sincronizado com plan_validity_days_yearly para compatibilidade.';
