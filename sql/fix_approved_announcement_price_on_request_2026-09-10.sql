begin;

create temporary table _admin_apply_edit_request_before
on commit drop
as
select
  p.proowner,
  p.proacl,
  p.proconfig,
  p.prosecdef
from pg_proc p
where p.oid = to_regprocedure('public.admin_apply_announcement_edit_request(uuid)');

do $migration$
declare
  v_definition text;
  v_anchor text := '    has_warranty = case';
  v_price_negotiable_block text := $patch$    price_negotiable = case
      when v_request.payload ? 'price_negotiable' and nullif(v_request.payload->>'price_negotiable', '') is not null
        then (v_request.payload->>'price_negotiable')::boolean
      else a.price_negotiable
    end,
$patch$;
begin
  if not exists (select 1 from _admin_apply_edit_request_before) then
    raise exception 'PRE-CONDICAO: admin_apply_announcement_edit_request(uuid) nao existe.';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'announcements'
      and column_name = 'price_negotiable'
      and data_type = 'boolean'
  ) then
    raise exception 'PRE-CONDICAO: announcements.price_negotiable boolean nao existe.';
  end if;

  select pg_get_functiondef('public.admin_apply_announcement_edit_request(uuid)'::regprocedure)
    into v_definition;

  if position('if not public.is_admin()' in v_definition) = 0 then
    raise exception 'PRE-CONDICAO: guarda MFA/admin esperada nao encontrada.';
  end if;

  if position('accepts_trade = case' in v_definition) = 0 then
    raise exception 'PRE-CONDICAO: bloco accepts_trade esperado nao encontrado.';
  end if;

  if position(v_price_negotiable_block in v_definition) > 0 then
    raise exception 'PRE-CONDICAO: correcao de price_negotiable ja esta aplicada.';
  end if;

  if (
    length(v_definition) - length(replace(v_definition, v_anchor, ''))
  ) <> length(v_anchor) then
    raise exception 'PRE-CONDICAO: bloco has_warranty esperado uma unica vez; funcao divergente.';
  end if;

  execute replace(v_definition, v_anchor, v_price_negotiable_block || v_anchor);
end;
$migration$;

do $postcondition$
declare
  v_definition text;
begin
  select pg_get_functiondef('public.admin_apply_announcement_edit_request(uuid)'::regprocedure)
    into v_definition;

  if position('price_negotiable = case' in v_definition) = 0
    or position($needle$payload->>'price_negotiable'$needle$ in v_definition) = 0
    or position('else a.price_negotiable' in v_definition) = 0 then
    raise exception 'POS-CONDICAO: price_negotiable nao foi incluido corretamente.';
  end if;

  if exists (
    select 1
    from _admin_apply_edit_request_before b
    cross join pg_proc p
    where p.oid = 'public.admin_apply_announcement_edit_request(uuid)'::regprocedure
      and (
        p.proowner is distinct from b.proowner
        or p.proacl is distinct from b.proacl
        or p.proconfig is distinct from b.proconfig
        or p.prosecdef is distinct from b.prosecdef
      )
  ) then
    raise exception 'POS-CONDICAO: owner, ACL, configuracao ou SECURITY DEFINER foram alterados.';
  end if;
end;
$postcondition$;

commit;

select
  position(
    'price_negotiable = case'
    in pg_get_functiondef('public.admin_apply_announcement_edit_request(uuid)'::regprocedure)
  ) > 0 as correcao_ativa,
  p.prosecdef as security_definer,
  pg_get_userbyid(p.proowner) as dono,
  p.proconfig as configuracao,
  p.proacl as acl
from pg_proc p
where p.oid = 'public.admin_apply_announcement_edit_request(uuid)'::regprocedure;
