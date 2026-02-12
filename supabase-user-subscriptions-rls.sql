-- Habilitar RLS e política de leitura para user_subscriptions
alter table public.user_subscriptions enable row level security;

drop policy if exists "Users can view own subscriptions" on public.user_subscriptions;
create policy "Users can view own subscriptions"
on public.user_subscriptions
for select
using (auth.uid() = user_id);
