create table public.support_conversations (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  status text not null default 'open' check (status in ('open', 'resolved')),
  needs_admin boolean not null default true,
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now()
);
alter table public.support_conversations enable row level security;

create table public.support_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.support_conversations(id) on delete cascade,
  sender text not null check (sender in ('staff', 'admin')),
  sender_id uuid references auth.users(id),
  body text not null,
  created_at timestamptz not null default now()
);
alter table public.support_messages enable row level security;

create index support_messages_conversation_idx on public.support_messages (conversation_id, created_at);
create index support_conversations_property_idx on public.support_conversations (property_id);

create policy "Staff read own property support thread"
  on public.support_conversations for select to authenticated
  using (property_id = public.current_staff_property_id() or public.has_role(auth.uid(), 'admin'));

create policy "Staff create their property's support thread"
  on public.support_conversations for insert to authenticated
  with check (property_id = public.current_staff_property_id());

create policy "Admins update support thread status"
  on public.support_conversations for update to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

create policy "Staff read own property support messages"
  on public.support_messages for select to authenticated
  using (
    exists (
      select 1 from public.support_conversations c
      where c.id = support_messages.conversation_id
        and (c.property_id = public.current_staff_property_id() or public.has_role(auth.uid(), 'admin'))
    )
  );

create policy "Staff send messages on their property's thread"
  on public.support_messages for insert to authenticated
  with check (
    sender = 'staff'
    and sender_id = auth.uid()
    and exists (
      select 1 from public.support_conversations c
      where c.id = support_messages.conversation_id
        and c.property_id = public.current_staff_property_id()
    )
  );

create policy "Admins send messages on any thread"
  on public.support_messages for insert to authenticated
  with check (sender = 'admin' and sender_id = auth.uid() and public.has_role(auth.uid(), 'admin'));

create or replace function public.touch_support_conversation()
returns trigger language plpgsql security definer set search_path = public
as $$
BEGIN
  UPDATE public.support_conversations
  SET last_message_at = NEW.created_at,
      needs_admin = (NEW.sender = 'staff')
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END; $$;

CREATE TRIGGER support_messages_touch_conversation
  AFTER INSERT ON public.support_messages
  FOR EACH ROW EXECUTE FUNCTION public.touch_support_conversation();
