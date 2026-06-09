-- =====================================================================
-- FIX — Bloquear EDIÇÃO (edit-request) enquanto o anúncio está EM ANÁLISE
-- Data: 2026-06-08
-- =====================================================================
-- BUG de fluxo: o usuário pode editar um anúncio que está PENDING/UNDER_REVIEW
-- (em análise de publicação). Isso cria um announcement_edit_requests pendente
-- concorrente com a moderação do anúncio -> estado preso (ex.: 04d0b294).
--
-- CORREÇÃO (defesa no backend, complementa o bloqueio de UX no frontend):
-- recusar a CRIAÇÃO/manutenção de um edit-request "pending" quando o anúncio
-- original estiver em PENDING ou UNDER_REVIEW. NÃO afeta a APROVAÇÃO/REJEIÇÃO do
-- edit-request (essas mudam status<>'pending' e já caem no early-return).
--
-- ⚠️ VALIDAR ANTES contra a definição VIVA:
--    select pg_get_functiondef('public.enforce_announcement_edit_request_publication_rules()'::regprocedure);
--    Se divergir, aplicar APENAS o bloco novo (marcado com -- NOVO).
--
-- NÃO aplicar automaticamente. Idempotente (CREATE OR REPLACE).
-- =====================================================================

create or replace function public.enforce_announcement_edit_request_publication_rules()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_result jsonb;
  v_original_status text;
  v_announcement_reanalysis_available_at timestamptz;
  v_edit_reanalysis_available_at timestamptz;
  v_images jsonb := case
    when jsonb_typeof(coalesce(new.payload->'images', '[]'::jsonb)) = 'array' then coalesce(new.payload->'images', '[]'::jsonb)
    else '[]'::jsonb
  end;
begin
  select
    upper(coalesce(status, '')),
    reanalysis_available_at
    into v_original_status, v_announcement_reanalysis_available_at
  from public.announcements
  where id = new.announcement_id;

  if coalesce(nullif(trim(coalesce(new.payload->>'__original_announcement_status', '')), ''), '') = '' and coalesce(v_original_status, '') <> '' then
    new.payload := jsonb_set(
      coalesce(new.payload, '{}'::jsonb),
      '{__original_announcement_status}',
      to_jsonb(v_original_status),
      true
    );
  end if;

  -- Só aplica regras de criação/manutenção a edit-requests PENDENTES.
  -- (aprovar/rejeitar muda status<>'pending' e segue sem bloqueio)
  if new.status <> 'pending' then
    return new;
  end if;

  -- NOVO: bloquear edição enquanto o anúncio está em análise de publicação.
  if v_original_status in ('PENDING', 'UNDER_REVIEW') then
    raise exception 'Este anúncio está em análise pela moderação. Aguarde a aprovação ou rejeição para editá-lo.';
  end if;

  if v_original_status = 'REJECTED'
    and v_announcement_reanalysis_available_at is not null
    and v_announcement_reanalysis_available_at > now() then
    raise exception 'Este anúncio foi reprovado e só poderá ser reenviado para análise após %.',
      to_char(v_announcement_reanalysis_available_at at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI');
  end if;

  select aer.reanalysis_available_at
    into v_edit_reanalysis_available_at
  from public.announcement_edit_requests aer
  where aer.announcement_id = new.announcement_id
    and aer.status = 'rejected'
    and aer.reanalysis_available_at is not null
    and aer.reanalysis_available_at > now()
    and (tg_op <> 'UPDATE' or aer.id <> new.id)
  order by aer.reanalysis_available_at desc
  limit 1;

  if v_edit_reanalysis_available_at is not null and v_edit_reanalysis_available_at > now() then
    raise exception 'A última alteração deste anúncio foi rejeitada e só poderá ser reenviada para análise após %.',
      to_char(v_edit_reanalysis_available_at at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI');
  end if;

  v_result := public.evaluate_announcement_publication_rules(
    coalesce(new.payload->>'title', ''),
    coalesce(new.payload->>'description', ''),
    coalesce(new.payload->>'category_slug', ''),
    v_images
  );

  if coalesce((v_result->>'blocked')::boolean, false)
    or coalesce((v_result->>'review_required')::boolean, false) then
    new.payload := jsonb_set(coalesce(new.payload, '{}'::jsonb), '{__publication_review_reasons}', coalesce(v_result->'reasons', '[]'::jsonb), true);
    new.payload := jsonb_set(coalesce(new.payload, '{}'::jsonb), '{__review_required}', 'true'::jsonb, true);
  end if;

  return new;
end;
$$;

-- =====================================================================
-- VERIFICAÇÃO / TESTE
-- =====================================================================
-- 1) tentar criar edit-request para um anúncio PENDING -> deve falhar com a msg
--    "Este anúncio está em análise pela moderação...".
-- 2) anúncio ACTIVE -> edição continua permitida (cria edit-request normalmente).
-- 3) aprovar/rejeitar um edit-request existente -> NÃO é bloqueado (status<>'pending').
--
-- ROLLBACK: re-aplicar a versão ANTERIOR da função (sem o bloco "NOVO").
-- Capture antes: select pg_get_functiondef('public.enforce_announcement_edit_request_publication_rules()'::regprocedure);
-- =====================================================================
