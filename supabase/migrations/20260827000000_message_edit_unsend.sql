alter table public.messages add column edited_at timestamptz;
alter table public.messages add column deleted_at timestamptz;

create policy "Guest edits own sent messages"
  on public.messages for update to authenticated
  using (sender = 'guest' and conversation_owner(conversation_id) = auth.uid())
  with check (sender = 'guest' and conversation_owner(conversation_id) = auth.uid());
