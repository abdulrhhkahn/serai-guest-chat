-- ============================================================================
-- Serai — weekly report recipients
-- Run AFTER 20260811240000_guest_csat.sql.
-- ----------------------------------------------------------------------------
-- Where the weekly analytics digest is sent. Comma-separated emails; when null
-- or empty, the property is skipped by /api/admin/weekly-digest.
-- ============================================================================

ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS report_email text;
