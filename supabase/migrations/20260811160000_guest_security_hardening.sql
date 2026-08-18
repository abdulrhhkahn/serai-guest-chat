-- ============================================================================
-- Serai — guest security hardening
-- ----------------------------------------------------------------------------
-- Fixes:
--   HIGH  Any anon could read ALL conversations + messages (global USING(true))
--   HIGH  Any anon could UPDATE any conversation, spoof/inject messages
--   HIGH  Any authenticated agent could reassign their own property_id (tenant hop)
--
-- Approach: guests get a real (anonymous) identity via Supabase Anonymous Sign-in.
-- Anonymous users authenticate as the `authenticated` role with is_anonymous=true,
-- so we scope guest rows by auth.uid() and REVOKE the old blanket `anon` grants.
--
-- PREREQUISITE (do this in the dashboard BEFORE running):
--   Authentication → Sign In / Providers → enable "Anonymous sign-ins".
-- ============================================================================

-- 1. Give conversations an owner -------------------------------------------------
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS guest_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS conversations_guest_user_idx
  ON public.conversations (guest_user_id);

-- helper: owner of a conversation (SECURITY DEFINER so message policies can use it)
CREATE OR REPLACE FUNCTION public.conversation_owner(_conv_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT guest_user_id FROM public.conversations WHERE id = _conv_id $$;

-- 2. Remove the permissive anon policies ----------------------------------------
DROP POLICY IF EXISTS "Anon can create conversations"            ON public.conversations;
DROP POLICY IF EXISTS "Anon can view own conversation by id"     ON public.conversations;
DROP POLICY IF EXISTS "Anon can update conversation last_message_at" ON public.conversations;
DROP POLICY IF EXISTS "Anon can view messages"                   ON public.messages;
DROP POLICY IF EXISTS "Anon can create messages"                 ON public.messages;

-- The guest client now always holds an (anonymous) JWT → role `authenticated`.
-- A no-JWT caller (role `anon`) should not touch these tables at all.
REVOKE SELECT, INSERT, UPDATE ON public.conversations FROM anon;
REVOKE SELECT, INSERT         ON public.messages      FROM anon;

-- 3. Owner-scoped guest policies (role: authenticated + is_anonymous) ------------
-- Staff policies already exist and are scoped by current_staff_property_id();
-- a guest has no staff_profile, so those never match for them. RLS is OR across
-- policies, so guests and staff each see only their own rows.

CREATE POLICY "Guest creates own conversation"
  ON public.conversations FOR INSERT TO authenticated
  WITH CHECK (
    guest_user_id = auth.uid()
    AND property_id IN (SELECT id FROM public.properties)
  );

CREATE POLICY "Guest views own conversation"
  ON public.conversations FOR SELECT TO authenticated
  USING (guest_user_id = auth.uid());

CREATE POLICY "Guest updates own conversation"
  ON public.conversations FOR UPDATE TO authenticated
  USING (guest_user_id = auth.uid())
  WITH CHECK (guest_user_id = auth.uid());

CREATE POLICY "Guest views own conversation messages"
  ON public.messages FOR SELECT TO authenticated
  USING (public.conversation_owner(conversation_id) = auth.uid());

-- Guests may only post as themselves: sender must be 'guest', never pre-approved.
CREATE POLICY "Guest inserts own conversation messages"
  ON public.messages FOR INSERT TO authenticated
  WITH CHECK (
    public.conversation_owner(conversation_id) = auth.uid()
    AND sender = 'guest'
    AND approved = false
  );

-- 4. Close the tenant-hop hole --------------------------------------------------
-- "Users update own profile" lets a staff member edit their own row, INCLUDING
-- property_id — which grants them another hotel's data via current_staff_property_id().
-- Block property_id self-reassignment unless the caller is an admin (the intended
-- multi-property switch path stays open for admins).
CREATE OR REPLACE FUNCTION public.prevent_property_self_reassign()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.property_id IS DISTINCT FROM OLD.property_id
     AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can change property assignment';
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS staff_profiles_no_self_reassign ON public.staff_profiles;
CREATE TRIGGER staff_profiles_no_self_reassign
  BEFORE UPDATE ON public.staff_profiles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_property_self_reassign();

-- ----------------------------------------------------------------------------
-- Note: existing demo conversations created before this migration have
-- guest_user_id = NULL. They remain visible to staff but not to new guest
-- sessions (expected). New guest chats start fresh under the owner model.
-- ----------------------------------------------------------------------------
