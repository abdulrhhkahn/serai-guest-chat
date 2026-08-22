-- Staff seat cap per PLAN_FEATURES.maxStaff in src/lib/billing.ts:
-- starter=2, growth=5, pro=unlimited. Counts existing staff_profiles plus
-- still-pending invites for that property (an invite reserves a seat
-- before it's accepted, so you can't invite past the limit and then have
-- them all land at once).
create or replace function public.staff_seat_limit_ok(_property_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select
    public.property_has_plan_at_least(_property_id, 'pro')
    or (
      (select count(*) from public.staff_profiles sp where sp.property_id = _property_id)
      + (select count(*) from public.staff_invites si where si.property_id = _property_id and si.status = 'pending')
    ) < (
      case when public.property_has_plan_at_least(_property_id, 'growth') then 5 else 2 end
    )
$$;
