-- ============================================================================
-- AGRO BW - Regras de publicacao e moderacao preventiva
-- - Regras configuraveis pelo admin.
-- - Trigger server-side para impedir bypass pelo frontend/API.
-- - Anuncios suspeitos saem como PENDING e aparecem na fila de moderacao.
-- ============================================================================

create table if not exists public.publication_moderation_rules (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  rule_kind text not null check (rule_kind in (
    'keyword',
    'regex',
    'category',
    'min_description_length',
    'contact_info',
    'external_link',
    'require_image'
  )),
  action text not null default 'review' check (action in ('review', 'block')),
  target text not null default 'both' check (target in ('title', 'description', 'both', 'category', 'images')),
  pattern text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_publication_moderation_rules_name_unique
  on public.publication_moderation_rules (lower(name));

alter table public.publication_moderation_rules enable row level security;

drop policy if exists "publication_moderation_rules_admin_all" on public.publication_moderation_rules;
create policy "publication_moderation_rules_admin_all"
on public.publication_moderation_rules
for all
to authenticated
using (public.is_admin() = true)
with check (public.is_admin() = true);

alter table public.announcements
  add column if not exists publication_review_reasons jsonb not null default '[]'::jsonb,
  add column if not exists publication_review_severity text,
  add column if not exists publication_review_checked_at timestamptz;

create or replace function public.touch_publication_moderation_rules_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_touch_publication_moderation_rules_updated_at on public.publication_moderation_rules;
create trigger trg_touch_publication_moderation_rules_updated_at
before update on public.publication_moderation_rules
for each row
execute function public.touch_publication_moderation_rules_updated_at();

create or replace function public.evaluate_announcement_publication_rules(
  p_title text,
  p_description text,
  p_category_slug text,
  p_images jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  v_rule record;
  v_text_title text := lower(coalesce(p_title, ''));
  v_text_description text := lower(coalesce(p_description, ''));
  v_category text := lower(coalesce(p_category_slug, ''));
  v_reasons jsonb := '[]'::jsonb;
  v_blocked boolean := false;
  v_matched boolean;
  v_min_length integer;
  v_description_length integer := length(trim(coalesce(p_description, '')));
  v_images_count integer := 0;
begin
  if jsonb_typeof(coalesce(p_images, '[]'::jsonb)) = 'array' then
    v_images_count := jsonb_array_length(coalesce(p_images, '[]'::jsonb));
  end if;

  for v_rule in
    select *
    from public.publication_moderation_rules
    where is_active = true
    order by created_at asc
  loop
    v_matched := false;

    if v_rule.rule_kind = 'keyword' and coalesce(trim(v_rule.pattern), '') <> '' then
      v_matched := (
        (v_rule.target in ('title', 'both') and v_text_title like '%' || lower(v_rule.pattern) || '%')
        or
        (v_rule.target in ('description', 'both') and v_text_description like '%' || lower(v_rule.pattern) || '%')
      );
    elsif v_rule.rule_kind = 'regex' and coalesce(trim(v_rule.pattern), '') <> '' then
      begin
        v_matched := (
          (v_rule.target in ('title', 'both') and coalesce(p_title, '') ~* v_rule.pattern)
          or
          (v_rule.target in ('description', 'both') and coalesce(p_description, '') ~* v_rule.pattern)
        );
      exception when invalid_regular_expression then
        v_matched := false;
      end;
    elsif v_rule.rule_kind = 'category' and coalesce(trim(v_rule.pattern), '') <> '' then
      v_matched := v_category = lower(v_rule.pattern);
    elsif v_rule.rule_kind = 'min_description_length' then
      v_min_length := greatest(0, coalesce(nullif(regexp_replace(coalesce(v_rule.pattern, ''), '\D', '', 'g'), '')::integer, 0));
      v_matched := v_min_length > 0 and v_description_length < v_min_length;
    elsif v_rule.rule_kind = 'contact_info' then
      v_matched := (
        coalesce(p_title, '') ~* '(\+?\d[\d\s().-]{7,}\d|[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})'
        or coalesce(p_description, '') ~* '(\+?\d[\d\s().-]{7,}\d|[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})'
      );
    elsif v_rule.rule_kind = 'external_link' then
      v_matched := (
        coalesce(p_title, '') ~* '(https?://|www\.|\.com\b|\.com\.br\b|\.net\b|\.br\b)'
        or coalesce(p_description, '') ~* '(https?://|www\.|\.com\b|\.com\.br\b|\.net\b|\.br\b)'
      );
    elsif v_rule.rule_kind = 'require_image' then
      v_matched := v_images_count = 0;
    end if;

    if v_matched then
      if v_rule.action = 'block' then
        v_blocked := true;
      end if;

      v_reasons := v_reasons || jsonb_build_array(jsonb_build_object(
        'rule_id', v_rule.id,
        'rule_name', v_rule.name,
        'rule_kind', v_rule.rule_kind,
        'action', v_rule.action,
        'message', coalesce(v_rule.description, v_rule.name)
      ));
    end if;
  end loop;

  return jsonb_build_object(
    'blocked', v_blocked,
    'review_required', jsonb_array_length(v_reasons) > 0,
    'reasons', v_reasons
  );
end;
$$;

create or replace function public.enforce_announcement_publication_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
  v_reason_text text;
begin
  if upper(coalesce(new.status, '')) not in ('ACTIVE') then
    return new;
  end if;

  v_result := public.evaluate_announcement_publication_rules(
    new.title,
    new.description,
    new.category_slug,
    to_jsonb(coalesce(new.images, array[]::text[]))
  );

  new.publication_review_checked_at := now();
  new.publication_review_reasons := coalesce(v_result->'reasons', '[]'::jsonb);

  if coalesce((v_result->>'blocked')::boolean, false) then
    select string_agg(value->>'message', '; ')
      into v_reason_text
    from jsonb_array_elements(coalesce(v_result->'reasons', '[]'::jsonb)) as value;

    raise exception 'Anuncio bloqueado pelas regras de publicacao: %', coalesce(v_reason_text, 'revise os dados do anuncio');
  end if;

  if coalesce((v_result->>'review_required')::boolean, false) then
    new.status := 'PENDING';
    new.publication_review_severity := 'review';
  else
    new.publication_review_severity := null;
    new.publication_review_reasons := '[]'::jsonb;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_announcement_publication_rules on public.announcements;
create trigger trg_enforce_announcement_publication_rules
before insert or update of title, description, category_slug, images, status
on public.announcements
for each row
execute function public.enforce_announcement_publication_rules();

insert into public.publication_moderation_rules (name, description, rule_kind, action, target, pattern, is_active)
values
  ('Contato no anuncio', 'Telefone ou e-mail encontrado no titulo ou descricao.', 'contact_info', 'review', 'both', null, true),
  ('Link externo', 'Link externo encontrado no titulo ou descricao.', 'external_link', 'review', 'both', null, true),
  ('Descricao muito curta', 'Descricao abaixo do minimo recomendado para publicacao.', 'min_description_length', 'review', 'description', '30', true),
  ('Sem imagem', 'Anuncio publicado sem imagem; revisar qualidade da publicacao.', 'require_image', 'review', 'images', null, false),
  ('Conteudo adulto', 'Termo sensivel relacionado a conteudo adulto.', 'keyword', 'review', 'both', 'sexo', true),
  ('Armas', 'Termo sensivel relacionado a arma ou item proibido.', 'keyword', 'review', 'both', 'arma', true),
  ('Drogas', 'Termo sensivel relacionado a droga ou substancia proibida.', 'keyword', 'review', 'both', 'droga', true),
  ('Golpe ou antecipacao', 'Termo sensivel relacionado a antecipacao de pagamento ou golpe.', 'keyword', 'review', 'both', 'pix antecipado', true)
on conflict do nothing;

grant execute on function public.evaluate_announcement_publication_rules(text, text, text, jsonb) to authenticated, service_role;
