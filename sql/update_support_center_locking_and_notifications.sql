-- ============================================================================
-- CENTRAL DE AJUDA
-- - Bloqueia novas mensagens em tickets resolvidos ou fechados
-- - Mantem fluxo de fechamento efetivo no painel do usuario
-- ============================================================================

drop policy if exists "Users can create own support messages" on public.support_ticket_messages;

create policy "Users can create own support messages"
on public.support_ticket_messages
for insert
to authenticated
with check (
  exists (
    select 1
    from public.support_tickets t
    where t.id = support_ticket_messages.ticket_id
      and t.status not in ('resolved', 'closed')
      and (
        (
          t.user_id = auth.uid()
          and sender_type = 'user'
          and sender_user_id = auth.uid()
        )
        or (
          exists (
            select 1
            from public.users u
            where u.id = auth.uid()
              and coalesce(u.is_admin, false) = true
          )
          and sender_type = 'admin'
          and sender_admin_id = auth.uid()
        )
      )
  )
);
