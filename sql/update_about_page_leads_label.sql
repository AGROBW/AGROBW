update public.about_page_content
set
  stat_revenue_label = 'LEADS GERADOS',
  updated_at = now()
where stat_revenue_label is distinct from 'LEADS GERADOS';
