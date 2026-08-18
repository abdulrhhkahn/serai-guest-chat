-- ============================================================================
-- Serai — ID retention + per-topic AI autonomy ("trust ladder")
-- ----------------------------------------------------------------------------
-- Run AFTER 20260811180000_rate_limiting.sql.
-- ============================================================================

-- 1. ID-document retention ------------------------------------------------------
-- The purge job (/api/admin/purge-documents) deletes the ID/signature files and
-- nulls the URLs; this column records when that happened (audit + idempotency).
ALTER TABLE public.checkins
  ADD COLUMN IF NOT EXISTS documents_purged_at timestamptz;

-- 2. AI autonomy: property default ---------------------------------------------
-- Levels:  suggest  = AI drafts, staff must write/approve everything
--          approve  = AI drafts, staff approves before the guest sees it
--          auto     = AI answers the guest directly (current behaviour)
-- Default 'auto' preserves today's behaviour until a hotel dials it down.
ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS default_autonomy text NOT NULL DEFAULT 'auto'
  CHECK (default_autonomy IN ('suggest', 'approve', 'auto'));

-- 3. AI autonomy: per-category overrides ---------------------------------------
-- Categories are the free-text FAQ categories the hotel already uses. A hotel
-- can let the AI auto-answer "Wifi" while forcing "Billing" through approval.
CREATE TABLE IF NOT EXISTS public.category_autonomy (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  category    text NOT NULL,
  level       text NOT NULL CHECK (level IN ('suggest', 'approve', 'auto')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (property_id, category)
);
ALTER TABLE public.category_autonomy ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff manage own category autonomy"
  ON public.category_autonomy FOR ALL TO authenticated
  USING (property_id = public.current_staff_property_id())
  WITH CHECK (property_id = public.current_staff_property_id());

-- 4. Pending AI drafts (for non-auto categories) -------------------------------
-- When a category isn't 'auto', the concierge stores its draft here (staff-only)
-- and escalates the conversation instead of replying to the guest. The staff
-- inbox surfaces the draft in the existing approve/edit/dismiss panel.
CREATE TABLE IF NOT EXISTS public.ai_drafts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  property_id     uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  category        text,
  draft           text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ai_drafts ENABLE ROW LEVEL SECURITY;

-- Staff read/clear their own property's drafts; the service role (concierge)
-- inserts them and bypasses RLS. Guests have no access.
CREATE POLICY "Staff read own ai drafts"
  ON public.ai_drafts FOR SELECT TO authenticated
  USING (property_id = public.current_staff_property_id());

CREATE POLICY "Staff delete own ai drafts"
  ON public.ai_drafts FOR DELETE TO authenticated
  USING (property_id = public.current_staff_property_id());

CREATE INDEX IF NOT EXISTS ai_drafts_conv_idx
  ON public.ai_drafts (conversation_id, created_at DESC);
