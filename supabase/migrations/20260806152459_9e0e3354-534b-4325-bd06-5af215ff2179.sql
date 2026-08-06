ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS client_msg_id text;
CREATE UNIQUE INDEX IF NOT EXISTS messages_client_msg_id_key ON public.messages (client_msg_id) WHERE client_msg_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS messages_conversation_created_idx ON public.messages (conversation_id, created_at);