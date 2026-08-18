-- ============================================================================
-- Serai — multichannel (Twilio SMS + WhatsApp)
-- Run AFTER 20260811190000_retention_and_autonomy.sql.
-- ============================================================================

-- 1. Which phone number belongs to which property + channel ---------------------
CREATE TABLE IF NOT EXISTS public.messaging_numbers (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id  uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  channel      text NOT NULL CHECK (channel IN ('sms', 'whatsapp')),
  phone_number text NOT NULL,             -- bare E.164, e.g. +14155551234
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (channel, phone_number)          -- one number maps to one property/channel
);
ALTER TABLE public.messaging_numbers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff manage own messaging numbers"
  ON public.messaging_numbers FOR ALL TO authenticated
  USING (property_id = public.current_staff_property_id())
  WITH CHECK (property_id = public.current_staff_property_id());
-- The webhook/dispatch use the service role, which bypasses RLS.

-- 2. Track the Twilio message id (idempotency + outbound audit) ------------------
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS external_id text;

CREATE UNIQUE INDEX IF NOT EXISTS messages_external_id_key
  ON public.messages (external_id) WHERE external_id IS NOT NULL;

-- 3. One thread per (property, channel, guest number) ---------------------------
CREATE UNIQUE INDEX IF NOT EXISTS conversations_channel_contact_key
  ON public.conversations (property_id, channel, guest_contact)
  WHERE guest_contact IS NOT NULL;

CREATE INDEX IF NOT EXISTS conversations_contact_idx
  ON public.conversations (guest_contact);
