-- Revert to: Basic=50/month, Growth+ = unlimited (undoing the previous
-- Basic=25/Growth=50 change).
create or replace function public.conversation_limit_ok(_property_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select
    public.property_has_plan_at_least(_property_id, 'growth')
    or (
      select count(*) from public.conversations c
      where c.property_id = _property_id
        and c.created_at >= date_trunc('month', now())
    ) < 50
$$;

create or replace function public.enforce_conversation_cap()
returns trigger language plpgsql security definer set search_path = public
as $$
BEGIN
  IF NOT public.conversation_limit_ok(NEW.property_id) THEN
    RAISE EXCEPTION 'This property has reached its 50 conversation/month limit on the Basic plan. Upgrade to Growth for unlimited conversations.'
      USING errcode = 'P0001';
  END IF;
  RETURN NEW;
END; $$;
