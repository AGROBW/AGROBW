-- AGRO BW
-- Override TEMPORARIO para testes: contratos anuais passam a virar benefícios a cada 5 minutos.
-- ATENCAO: afeta globalmente todos os contratos anuais enquanto este override estiver ativo.

create or replace function public.calculate_subscription_usage_window(
  p_period_start timestamptz,
  p_period_end timestamptz,
  p_reference timestamptz default now()
)
returns table (
  usage_period_start timestamptz,
  usage_period_end timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total_days numeric;
  v_test_window interval := interval '5 minutes';
begin
  v_total_days := extract(epoch from (p_period_end - p_period_start)) / 86400;

  if v_total_days <= 45 then
    usage_period_start := p_period_start;
    usage_period_end := p_period_end;
    return next;
    return;
  end if;

  usage_period_start := p_period_start;
  usage_period_end := least(p_period_start + v_test_window, p_period_end);

  while p_reference >= usage_period_end and usage_period_end < p_period_end loop
    usage_period_start := usage_period_end;
    usage_period_end := least(usage_period_end + v_test_window, p_period_end);
  end loop;

  return next;
end;
$$;

grant execute on function public.calculate_subscription_usage_window(timestamptz, timestamptz, timestamptz) to anon, authenticated;
