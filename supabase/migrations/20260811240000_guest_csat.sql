-- ============================================================================
-- Serai — guest CSAT (post-resolution satisfaction rating)
-- Run AFTER 20260811230000_autonomy_audit.sql.
-- ----------------------------------------------------------------------------
-- A one-tap 1–5 rating the guest can leave once their conversation is resolved.
-- Web guests own their conversation (v1 owner-update policy), so no new policy
-- is needed for them to set it.
-- ============================================================================

ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS csat_rating int CHECK (csat_rating BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS csat_at timestamptz;
