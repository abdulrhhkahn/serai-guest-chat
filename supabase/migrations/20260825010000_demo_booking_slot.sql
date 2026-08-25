-- The "book a demo" form now includes picking a meeting slot as step one.
-- Nullable since older rows (if any) predate this and the column isn't
-- otherwise required for the row to make sense.
alter table public.plan_interest_leads add column scheduled_at timestamptz;
