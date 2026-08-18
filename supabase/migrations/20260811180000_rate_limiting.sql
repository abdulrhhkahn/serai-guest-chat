-- ============================================================================
-- Serai — durable abuse protection (Postgres-backed rate limiting)
-- ----------------------------------------------------------------------------
-- Replaces the in-memory limiter in /api/ai/concierge (which only protected a
-- single instance) with a shared Postgres limiter that works on any deploy
-- target — Cloudflare Workers, Node, serverless — with no extra infra.
--
-- Also ties check-in to the guest's anonymous identity so check-in spam can be
-- throttled per-guest, and adjusts the storage upload policies for the role
-- change that comes with it (anonymous guests are role `authenticated`).
--
-- Run AFTER 20260811170000_link_conversation_checkin.sql.
-- ============================================================================

-- 1. Rate-limit store + atomic fixed-window counter -----------------------------
CREATE TABLE IF NOT EXISTS public.rate_limits (
  bucket       text        NOT NULL,
  identity     text        NOT NULL,
  window_start timestamptz NOT NULL,
  count        int         NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket, identity, window_start)
);
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;
-- No policies on purpose: only the SECURITY DEFINER functions below (and the
-- service role) ever touch this table. Clients cannot read or write it.

-- Returns true if the caller is still under the limit for this window.
CREATE OR REPLACE FUNCTION public.check_rate_limit(
  _bucket text, _identity text, _max int, _window_secs int
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _win   timestamptz := date_bin(make_interval(secs => _window_secs), now(), timestamptz 'epoch');
  _count int;
BEGIN
  INSERT INTO public.rate_limits (bucket, identity, window_start, count)
  VALUES (_bucket, _identity, _win, 1)
  ON CONFLICT (bucket, identity, window_start)
  DO UPDATE SET count = public.rate_limits.count + 1
  RETURNING count INTO _count;
  RETURN _count <= _max;
END; $$;

GRANT EXECUTE ON FUNCTION public.check_rate_limit(text, text, int, int) TO service_role;

-- 2. Trigger to throttle direct inserts by anonymous guests ----------------------
-- Only anonymous guests (is_anonymous JWT claim) are limited — staff (real
-- authenticated users) and the service role (AI writes) are never throttled.
CREATE OR REPLACE FUNCTION public.enforce_insert_rate_limit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _is_anon boolean := coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false);
BEGIN
  IF _is_anon AND NOT public.check_rate_limit(
       TG_ARGV[2], auth.uid()::text, TG_ARGV[0]::int, TG_ARGV[1]::int) THEN
    RAISE EXCEPTION 'Too many requests, please slow down' USING errcode = 'P0001';
  END IF;
  RETURN NEW;
END; $$;

-- conversations: max 10 new chats / hour / guest
DROP TRIGGER IF EXISTS conversations_rate_limit ON public.conversations;
CREATE TRIGGER conversations_rate_limit
  BEFORE INSERT ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION public.enforce_insert_rate_limit('10', '3600', 'conv_create');

-- messages: max 30 guest messages / minute / guest
DROP TRIGGER IF EXISTS messages_rate_limit ON public.messages;
CREATE TRIGGER messages_rate_limit
  BEFORE INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.enforce_insert_rate_limit('30', '60', 'msg_send');

-- 3. Tie check-in to the anonymous identity + throttle it -----------------------
ALTER TABLE public.checkins
  ADD COLUMN IF NOT EXISTS guest_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- Guests now submit check-in with an anonymous session (role `authenticated`),
-- so move the insert grant/policy off `anon`.
DROP POLICY IF EXISTS "Anon can create checkins" ON public.checkins;
REVOKE INSERT ON public.checkins FROM anon;

CREATE POLICY "Guests create checkins"
  ON public.checkins FOR INSERT TO authenticated
  WITH CHECK (property_id IN (SELECT id FROM public.properties));

-- optional: let a guest read back their own check-in (e.g. show it in the hub)
CREATE POLICY "Guest views own checkins"
  ON public.checkins FOR SELECT TO authenticated
  USING (guest_user_id = auth.uid());

DROP TRIGGER IF EXISTS checkins_rate_limit ON public.checkins;
CREATE TRIGGER checkins_rate_limit
  BEFORE INSERT ON public.checkins
  FOR EACH ROW EXECUTE FUNCTION public.enforce_insert_rate_limit('5', '3600', 'checkin_create');

-- 4. Storage: anonymous guests are `authenticated`, so update upload policies ----
DROP POLICY IF EXISTS "Anon can upload guest ids" ON storage.objects;
CREATE POLICY "Guests upload ids"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'guest-ids');

DROP POLICY IF EXISTS "Anon can upload signatures" ON storage.objects;
CREATE POLICY "Guests upload signatures"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'guest-signatures');

-- ----------------------------------------------------------------------------
-- Optional housekeeping: prune old rate-limit rows. Schedule with pg_cron if
-- available, or run occasionally:
--   DELETE FROM public.rate_limits WHERE window_start < now() - interval '1 day';
-- ----------------------------------------------------------------------------
