-- ============================================================================
-- Serai — AI decision log (powers containment / per-topic analytics)
-- Run AFTER 20260811200000_multichannel.sql.
-- ----------------------------------------------------------------------------
-- One row per concierge decision, across web + SMS + WhatsApp. This is the
-- durable record analytics reads — unlike ai_drafts, which are consumed when
-- staff act on them.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.ai_decisions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id     uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  conversation_id uuid REFERENCES public.conversations(id) ON DELETE SET NULL,
  channel         text NOT NULL DEFAULT 'web',
  category        text,
  level           text NOT NULL,                       -- suggest | approve | auto
  outcome         text NOT NULL,                        -- auto | escalated
  created_at      timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ai_decisions ENABLE ROW LEVEL SECURITY;

-- Staff read their own property's decisions; the service role (concierge +
-- webhook) inserts them and bypasses RLS.
CREATE POLICY "Staff read own ai decisions"
  ON public.ai_decisions FOR SELECT TO authenticated
  USING (property_id = public.current_staff_property_id());

CREATE INDEX IF NOT EXISTS ai_decisions_prop_time_idx
  ON public.ai_decisions (property_id, created_at DESC);
