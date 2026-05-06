create or replace function public.delete_announcement_with_relations(
  p_announcement_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  announcement_owner_id uuid;
  requester_role text;
  chat_ids uuid[];
begin
  if current_user_id is null then
    return jsonb_build_object('success', false, 'error', 'Usuario nao autenticado');
  end if;

  select a.user_id
    into announcement_owner_id
  from public.announcements a
  where a.id = p_announcement_id
  limit 1;

  if announcement_owner_id is null then
    return jsonb_build_object('success', false, 'error', 'Anuncio nao encontrado');
  end if;

  select lower(coalesce(u.role, ''))
    into requester_role
  from public.users u
  where u.id = current_user_id
  limit 1;

  if requester_role <> 'admin' and announcement_owner_id <> current_user_id then
    return jsonb_build_object('success', false, 'error', 'Sem permissao para excluir este anuncio');
  end if;

  update public.announcement_highlights_history
  set announcement_id = null
  where announcement_id = p_announcement_id;

  select array_agg(c.id)
    into chat_ids
  from public.chats c
  where c.announcement_id = p_announcement_id;

  delete from public.announcement_clicks_by_state
  where announcement_id = p_announcement_id;

  delete from public.announcement_technical_details
  where announcement_id = p_announcement_id;

  delete from public.favorites
  where announcement_id = p_announcement_id;

  delete from public.leads
  where announcement_id = p_announcement_id;

  delete from public.announcement_metrics
  where announcement_id = p_announcement_id;

  delete from public.lead_conversions
  where announcement_id = p_announcement_id;

  delete from public.opportunities
  where announcement_id = p_announcement_id;

  delete from public.opportunity_matches
  where announcement_id = p_announcement_id;

  delete from public.price_drop_notifications
  where announcement_id = p_announcement_id;

  delete from public.announcement_reports
  where announcement_id = p_announcement_id;

  delete from public.announcement_edit_requests
  where announcement_id = p_announcement_id;

  if chat_ids is not null and array_length(chat_ids, 1) > 0 then
    delete from public.messages
    where chat_id = any(chat_ids);

    delete from public.leads
    where chat_id = any(chat_ids);

    delete from public.chats
    where id = any(chat_ids);
  end if;

  delete from public.announcements
  where id = p_announcement_id;

  return jsonb_build_object(
    'success', true,
    'announcementId', p_announcement_id
  );
end;
$$;

grant execute on function public.delete_announcement_with_relations(uuid) to authenticated;
