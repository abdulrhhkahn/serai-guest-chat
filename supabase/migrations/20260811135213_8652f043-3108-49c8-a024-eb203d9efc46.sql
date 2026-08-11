CREATE TABLE public.conversation_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  detail text,
  actor_user_id uuid REFERENCES auth.users(id),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX conversation_events_conv_idx ON public.conversation_events (conversation_id, created_at);

GRANT SELECT, INSERT ON public.conversation_events TO authenticated;
GRANT ALL ON public.conversation_events TO service_role;

ALTER TABLE public.conversation_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff view events for own property"
ON public.conversation_events FOR SELECT TO authenticated
USING (public.property_id_for_conversation(conversation_id) = public.current_staff_property_id());

CREATE POLICY "Staff insert events for own property"
ON public.conversation_events FOR INSERT TO authenticated
WITH CHECK (public.property_id_for_conversation(conversation_id) = public.current_staff_property_id());