-- ============================================================================
-- Serai — link conversations to check-ins (room / stay context in the inbox)
-- ----------------------------------------------------------------------------
-- Closes the functional gap from the review: the staff inbox mockup shows
-- "Room 204 · arriving today", but conversations had no link to a check-in and
-- there was no room field. This adds both, plus a guard so a guest can't attach
-- a check-in from a different property.
--
-- Run AFTER 20260811160000_guest_security_hardening.sql.
-- ============================================================================

-- 1. Room number on the check-in (staff-assigned) -------------------------------
ALTER TABLE public.checkins
  ADD COLUMN IF NOT EXISTS room text;

-- 2. Link a conversation to the guest's check-in --------------------------------
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS checkin_id uuid REFERENCES public.checkins(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS conversations_checkin_idx
  ON public.conversations (checkin_id);

-- 3. Guard: ignore a checkin_id that isn't from the same property ----------------
-- The guest supplies checkin_id from localStorage; validate it server-side so a
-- crafted value from another property can't attach bogus context. (Same-property
-- checkins are visible to that property's staff anyway, so this is sufficient.)
CREATE OR REPLACE FUNCTION public.validate_conversation_checkin()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.checkin_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.checkins
      WHERE id = NEW.checkin_id AND property_id = NEW.property_id
    ) THEN
      NEW.checkin_id := NULL;
    END IF;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS conversations_validate_checkin ON public.conversations;
CREATE TRIGGER conversations_validate_checkin
  BEFORE INSERT ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION public.validate_conversation_checkin();

-- Staff already have SELECT + UPDATE on their property's checkins (existing
-- policies), so no new grants are needed to read the link or set the room.
