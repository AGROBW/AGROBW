begin;

create temporary table _admin_apply_edit_request_before_rollback
on commit drop
as
select
  p.proowner,
  p.proacl,
  p.proconfig,
  p.prosecdef
from pg_proc p
where p.oid = to_regprocedure('public.admin_apply_announcement_edit_request(uuid)');

do $rollback$
declare
  v_definition text;
  v_price_negotiable_block text := $patch$    price_negotiable = case
      when v_request.payload ? 'price_negotiable' and nullif(v_request.payload->>'price_negotiable', '') is not null
        then (v_request.payload->>'price_negotiable')::boolean
      else a.price_negotiable
    end,
$patch$;
begin
  if not exists (select 1 from _admin_apply_edit_request_before_rollback) then
    raise exception 'ROLLBACK ABORTADO: admin_apply_announcement_edit_request(uuid) nao existe.';
  end if;

  select pg_get_functiondef('public.admin_apply_announcement_edit_request(uuid)'::regprocedure)
    into v_definition;

  if position('if not public.is_admin()' in v_definition) = 0 then
    raise exception 'ROLLBACK ABORTADO: guarda MFA/admin esperada nao encontrada.';
  end if;

  if (
    length(v_definition) - length(replace(v_definition, v_price_negotiable_block, ''))
  ) <> length(v_price_negotiable_block) then
    raise exception 'ROLLBACK ABORTADO: bloco desta correcao esperado uma unica vez.';
  end if;

  execute replace(v_definition, v_price_negotiable_block, '');
end;
$rollback$;

do $postcondition$
declare
  v_definition text;
begin
  select pg_get_functiondef('public.admin_apply_announcement_edit_request(uuid)'::regprocedure)
    into v_definition;

  if position('price_negotiable = case' in v_definition) > 0 then
    raise exception 'ROLLBACK ABORTADO: price_negotiable permaneceu na funcao.';
  end if;

  if exists (
    select 1
    from _admin_apply_edit_request_before_rollback b
    cross join pg_proc p
    where p.oid = 'public.admin_apply_announcement_edit_request(uuid)'::regprocedure
      and (
        p.proowner is distinct from b.proowner
        or p.proacl is distinct from b.proacl
        or p.proconfig is distinct from b.proconfig
        or p.prosecdef is distinct from b.prosecdef
      )
  ) then
    raise exception 'ROLLBACK ABORTADO: owner, ACL, configuracao ou SECURITY DEFINER foram alterados.';
  end if;
end;
$postcondition$;

commit;

select
  position(
    'price_negotiable = case'
    in pg_get_functiondef('public.admin_apply_announcement_edit_request(uuid)'::regprocedure)
  ) = 0 as rollback_confirmado,
  p.prosecdef as security_definer,
  pg_get_userbyid(p.proowner) as dono,
  p.proconfig as configuracao,
  p.proacl as acl
from pg_proc p
where p.oid = 'public.admin_apply_announcement_edit_request(uuid)'::regprocedure;
