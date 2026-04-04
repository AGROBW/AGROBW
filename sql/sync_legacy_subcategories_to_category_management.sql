do $$
begin
  if to_regclass('public.subcategories') is null then
    raise notice 'Tabela public.subcategories nao encontrada. Nenhuma sincronizacao executada.';
    return;
  end if;

  insert into public.category_subcategories (
    category_id,
    name,
    slug,
    sort_order,
    is_active
  )
  select
    s.category_id,
    s.name,
    s.slug,
    row_number() over (partition by s.category_id order by s.name),
    true
  from public.subcategories s
  where not exists (
    select 1
    from public.category_subcategories cs
    where cs.category_id = s.category_id
      and cs.slug = s.slug
  );
end $$;

