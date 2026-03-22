alter table public.news_articles
  add column if not exists editorial_category text;

update public.news_articles
set editorial_category = case
  when coalesce(title, '') ilike any (array['%soja%', '%milho%', '%trigo%', '%safra%', '%colheita%', '%café%', '%arroz%']) then 'Grãos'
  when coalesce(title, '') ilike any (array['%boi%', '%gado%', '%pecuária%', '%frigorífico%', '%leite%', '%suíno%', '%aves%']) then 'Pecuária'
  when coalesce(title, '') ilike any (array['%trator%', '%colheitadeira%', '%pulverizador%', '%máquina%', '%implemento%']) then 'Máquinas'
  when coalesce(title, '') ilike any (array['%fertilizante%', '%adubo%', '%defensivo%', '%semente%', '%insumo%']) then 'Insumos'
  when coalesce(title, '') ilike any (array['%chuva%', '%seca%', '%clima%', '%estiagem%', '%temperatura%']) then 'Clima'
  when coalesce(title, '') ilike any (array['%governo%', '%congresso%', '%plano safra%', '%tributo%', '%reforma%']) then 'Política Agro'
  when coalesce(title, '') ilike any (array['%crédito%', '%financiamento%', '%bndes%', '%juros%', '%seguro rural%']) then 'Crédito Rural'
  when coalesce(title, '') ilike any (array['%tecnologia%', '%agtech%', '%inovação%', '%drone%', '%automação%']) then 'Tecnologia'
  when coalesce(title, '') ilike any (array['%porto%', '%frete%', '%escoamento%', '%ferrovia%', '%rodovia%']) then 'Logística'
  when coalesce(title, '') ilike any (array['%sustentabilidade%', '%carbono%', '%ambiental%', '%regenerativa%']) then 'Sustentabilidade'
  else coalesce(editorial_category, 'Mercado')
end
where editorial_category is null;

alter table public.news_articles
  alter column editorial_category set default 'Mercado';
