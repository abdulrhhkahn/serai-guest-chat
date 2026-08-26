alter table public.support_conversations add column needs_staff boolean not null default false;

create or replace function public.touch_support_conversation()
returns trigger language plpgsql security definer set search_path = public
as $$
BEGIN
  UPDATE public.support_conversations
  SET last_message_at = NEW.created_at,
      needs_admin = (NEW.sender = 'staff'),
      needs_staff = (NEW.sender = 'admin')
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END; $$;

create policy "Staff mark their own thread read"
  on public.support_conversations for update to authenticated
  using (property_id = public.current_staff_property_id())
  with check (property_id = public.current_staff_property_id());
