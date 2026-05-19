create table if not exists public.sponsor_testimonials (
  id uuid primary key default gen_random_uuid(),
  company_name text not null,
  contact_name text not null,
  role_title text null,
  segment text null,
  location_label text null,
  testimonial text not null,
  avatar_url text null,
  highlight_metric text null,
  status text not null default 'draft'
    check (status in ('draft', 'published')),
  display_order integer not null default 0,
  is_featured boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_sponsor_testimonials_status_order
  on public.sponsor_testimonials(status, is_featured desc, display_order asc, created_at desc);

create or replace function public.touch_sponsor_testimonials_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists trg_touch_sponsor_testimonials_updated_at on public.sponsor_testimonials;
create trigger trg_touch_sponsor_testimonials_updated_at
before update on public.sponsor_testimonials
for each row
execute function public.touch_sponsor_testimonials_updated_at();

alter table public.sponsor_testimonials enable row level security;

drop policy if exists "Public can read published sponsor testimonials" on public.sponsor_testimonials;
create policy "Public can read published sponsor testimonials"
on public.sponsor_testimonials
for select
to anon, authenticated
using (status = 'published');

drop policy if exists "Admins can manage sponsor testimonials" on public.sponsor_testimonials;
create policy "Admins can manage sponsor testimonials"
on public.sponsor_testimonials
for all
to authenticated
using (
  exists (
    select 1
    from public.users
    where users.id = auth.uid()
      and (
        coalesce(users.is_admin, false) = true
        or users.role = 'admin'
      )
  )
)
with check (
  exists (
    select 1
    from public.users
    where users.id = auth.uid()
      and (
        coalesce(users.is_admin, false) = true
        or users.role = 'admin'
      )
  )
);

insert into public.sponsor_testimonials (
  company_name,
  contact_name,
  role_title,
  segment,
  location_label,
  testimonial,
  avatar_url,
  highlight_metric,
  status,
  display_order,
  is_featured
)
select *
from (
  values
    (
      'Agro Maquinas Sul',
      'Carlos Mendonca',
      'Diretor Comercial',
      'Maquinas agricolas',
      'Rio Verde/GO',
      'Em 30 dias na Vitrine Premium, recebemos mais de 40 contatos qualificados direto pelo WhatsApp. O ROI superou qualquer outra midia digital que testamos no setor.',
      'https://i.pravatar.cc/80?u=carlos_agro',
      '+40 contatos qualificados em 30 dias',
      'published',
      1,
      true
    ),
    (
      'InsumosPro',
      'Fernanda Oliveira',
      'Gerente de Marketing',
      'Insumos',
      'Uberlandia/MG',
      'A exclusividade por nicho fez toda a diferenca. Nosso banner nao compete com concorrente direto, e isso se reflete no CTR muito acima da midia que tinhamos em outras plataformas.',
      'https://i.pravatar.cc/80?u=fernanda_insumos',
      'CTR acima das campanhas anteriores',
      'published',
      2,
      false
    ),
    (
      'AgroTech Solucoes',
      'Roberto Faria',
      'CEO',
      'Tecnologia para o agro',
      'Cuiaba/MT',
      'Estamos no segundo ciclo da Vitrine Premium. A visibilidade no topo do marketplace trouxe leads que ja se tornaram clientes recorrentes. Vale muito o investimento.',
      'https://i.pravatar.cc/80?u=roberto_agrotech',
      'Leads que viraram clientes recorrentes',
      'published',
      3,
      false
    )
) as seed_data (
  company_name,
  contact_name,
  role_title,
  segment,
  location_label,
  testimonial,
  avatar_url,
  highlight_metric,
  status,
  display_order,
  is_featured
)
where not exists (
  select 1
  from public.sponsor_testimonials
);
