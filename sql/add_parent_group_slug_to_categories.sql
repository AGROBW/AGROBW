alter table public.categories
  add column if not exists parent_group_slug text;

create index if not exists idx_categories_parent_group_slug
  on public.categories(parent_group_slug, sort_order, name);

update public.categories
set parent_group_slug = case
  when slug in ('animais') then 'animais'
  when slug in ('maquinas-equipamentos', 'tratores-agricolas', 'colheitadeiras-colhedoras', 'implementos', 'pecas', 'maquinas-pesadas') then 'maquinas'
  when slug in ('fertilizantes-agricolas', 'alimentos-para-nutricao-animal') then 'insumos'
  when slug in ('imoveis-rurais', 'fazendas') then 'imoveis'
  when slug in ('armazenagem-de-produtos') then 'servicos'
  when slug in ('arvores-adultas-mudas') then 'sementes'
  else parent_group_slug
end
where parent_group_slug is null;

