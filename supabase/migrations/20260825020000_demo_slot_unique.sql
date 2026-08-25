-- Guarantees no two demo bookings can ever land on the identical slot,
-- even under a race (two people submitting at the same instant) — an
-- application-level check alone can't guarantee that, only a real
-- database constraint can. Partial index since most rows (non-demo leads,
-- if any ever exist) have scheduled_at null and shouldn't collide.
create unique index plan_interest_leads_scheduled_at_unique
  on public.plan_interest_leads (scheduled_at)
  where scheduled_at is not null;
