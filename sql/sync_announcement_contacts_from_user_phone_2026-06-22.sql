-- =====================================================================
-- SINCRONIZAR CONTATO DO ANÚNCIO COM O TELEFONE DO PERFIL
-- Data: 2026-06-22
-- Regra de produto: users.phone é a FONTE ÚNICA do WhatsApp de contato.
-- Ao mudar o telefone no perfil, todos os announcement_contacts do usuário
-- passam a refletir o novo número (sem UI de "número por anúncio").
-- Idempotente.
-- =====================================================================

-- 1) Trigger: ao alterar users.phone, propaga para os contatos dos anúncios do usuário.
create or replace function public.sync_announcement_contacts_from_user_phone()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.phone is distinct from old.phone then
    insert into public.announcement_contacts (announcement_id, whatsapp)
    select a.id, nullif(trim(new.phone), '')
    from public.announcements a
    where a.user_id = new.id
    on conflict (announcement_id) do update
      set whatsapp = excluded.whatsapp;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sync_announcement_contacts_from_user_phone on public.users;
create trigger trg_sync_announcement_contacts_from_user_phone
after update of phone on public.users
for each row
execute function public.sync_announcement_contacts_from_user_phone();

comment on function public.sync_announcement_contacts_from_user_phone() is
  'Mantém announcement_contacts.whatsapp em sincronia com users.phone (perfil = fonte única).';

-- 2) Backfill ÚNICO: alinha todos os anúncios existentes ao telefone atual do dono.
--    Corrige o caso relatado e qualquer divergência histórica. Cria a linha de
--    contato para anúncios que ainda não têm. (Aplica a regra retroativamente.)
insert into public.announcement_contacts (announcement_id, whatsapp)
select a.id, nullif(trim(u.phone), '')
from public.announcements a
join public.users u on u.id = a.user_id
on conflict (announcement_id) do update
  set whatsapp = excluded.whatsapp
where public.announcement_contacts.whatsapp is distinct from excluded.whatsapp;

-- =====================================================================
-- VERIFICAÇÃO
-- =====================================================================
-- Deve retornar 0 linhas (nenhum contato divergente do telefone do dono):
-- select a.id, c.whatsapp, u.phone
-- from public.announcements a
-- join public.users u on u.id = a.user_id
-- left join public.announcement_contacts c on c.announcement_id = a.id
-- where coalesce(c.whatsapp,'') is distinct from coalesce(nullif(trim(u.phone),''),'');
--
-- Caso relatado:
-- select c.whatsapp from public.announcement_contacts c
-- where c.announcement_id = '468e0364-8b86-4fa1-8ddb-3d7dafac777c';  -- deve refletir o telefone novo
