create or replace function public.parse_publication_rule_patterns(p_value text)
returns text[]
language sql
immutable
as $$
  select coalesce(
    array_agg(distinct lower(trim(token))) filter (where trim(token) <> ''),
    array[]::text[]
  )
  from regexp_split_to_table(coalesce(p_value, ''), E'[\\n,;]+') as token;
$$;

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
  v_patterns text[] := array[]::text[];
  i integer;
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
    v_patterns := public.parse_publication_rule_patterns(v_rule.pattern);

    if v_rule.rule_kind = 'keyword' and coalesce(trim(v_rule.pattern), '') <> '' then
      v_matched := (
        (v_rule.target in ('title', 'both') and exists (
          select 1
          from unnest(v_patterns) as pattern
          where v_text_title like '%' || pattern || '%'
        ))
        or
        (v_rule.target in ('description', 'both') and exists (
          select 1
          from unnest(v_patterns) as pattern
          where v_text_description like '%' || pattern || '%'
        ))
      );
    elsif v_rule.rule_kind = 'regex' and coalesce(trim(v_rule.pattern), '') <> '' then
      for i in 1 .. coalesce(array_length(v_patterns, 1), 0) loop
        begin
          if (
            (v_rule.target in ('title', 'both') and coalesce(p_title, '') ~* v_patterns[i])
            or
            (v_rule.target in ('description', 'both') and coalesce(p_description, '') ~* v_patterns[i])
          ) then
            v_matched := true;
            exit;
          end if;
        exception when invalid_regular_expression then
          continue;
        end;
      end loop;
    elsif v_rule.rule_kind = 'category' and coalesce(trim(v_rule.pattern), '') <> '' then
      v_matched := v_category = any(v_patterns);
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

grant execute on function public.parse_publication_rule_patterns(text) to authenticated, service_role;
grant execute on function public.evaluate_announcement_publication_rules(text, text, text, jsonb) to authenticated, service_role;
