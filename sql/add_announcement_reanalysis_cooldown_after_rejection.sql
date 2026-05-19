alter table public.announcements
  add column if not exists rejection_reason text,
  add column if not exists rejected_at timestamptz,
  add column if not exists reanalysis_available_at timestamptz;

create index if not exists idx_announcements_reanalysis_available_at
  on public.announcements (reanalysis_available_at)
  where reanalysis_available_at is not null;

alter table public.announcement_edit_requests
  add column if not exists reanalysis_available_at timestamptz;

create index if not exists announcement_edit_requests_reanalysis_idx
  on public.announcement_edit_requests (announcement_id, reanalysis_available_at desc)
  where status = 'rejected' and reanalysis_available_at is not null;

update public.announcements
set reanalysis_available_at = rejected_at + interval '24 hours'
where status = 'REJECTED'
  and rejected_at is not null
  and reanalysis_available_at is null;

update public.announcement_edit_requests
set reanalysis_available_at = coalesce(reviewed_at, updated_at, created_at) + interval '24 hours'
where status = 'rejected'
  and reanalysis_available_at is null;

create or replace function public.enforce_announcement_edit_request_publication_rules()
returns trigger
language plpgsql
security definer
set search_path = public
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

  if new.status <> 'pending' then
    return new;
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
    update public.announcements
    set
      status = case when upper(coalesce(status, '')) = 'ACTIVE' then 'PENDING' else status end,
      publication_review_severity = 'review',
      publication_review_checked_at = now(),
      publication_review_reasons = coalesce(v_result->'reasons', '[]'::jsonb),
      publication_review_admin_override = false
    where id = new.announcement_id;
  end if;

  return new;
end;
$$;

drop trigger if exists announcement_edit_requests_enforce_publication_rules on public.announcement_edit_requests;
create trigger announcement_edit_requests_enforce_publication_rules
before insert or update of payload, status on public.announcement_edit_requests
for each row
execute function public.enforce_announcement_edit_request_publication_rules();
