-- Fix: Starter is free/unbilled, so no subscription row is ever created for
-- it. The original function required an active row for EVERY tier check,
-- meaning Starter orgs (the common case) failed even the Starter check.
-- No subscription (or no matching one) now correctly means "Starter".
create or replace function public.org_has_plan_at_least(org_id uuid, min_tier plan_tier)
returns boolean language sql stable security definer set search_path = public
as $$
  select case min_tier
    when 'starter' then true
    else exists (
      select 1 from public.subscriptions s
      where s.organization_id = org_id
        and s.status in ('active', 'past_due')
        and (
          case min_tier
            when 'growth' then s.plan_tier in ('growth', 'pro')
            when 'pro' then s.plan_tier = 'pro'
            else false
          end
        )
    )
  end
$$;

-- Same check, but starting from a property_id (what most app code actually
-- has on hand). A property with no organization_id (never assigned to an
-- org) also falls back to Starter rather than failing closed entirely.
create or replace function public.property_has_plan_at_least(_property_id uuid, min_tier plan_tier)
returns boolean language sql stable security definer set search_path = public
as $$
  select case min_tier
    when 'starter' then true
    else exists (
      select 1 from public.properties p
      join public.subscriptions s on s.organization_id = p.organization_id
      where p.id = _property_id
        and s.status in ('active', 'past_due')
        and (
          case min_tier
            when 'growth' then s.plan_tier in ('growth', 'pro')
            when 'pro' then s.plan_tier = 'pro'
            else false
          end
        )
    )
  end
$$;

-- Autonomy levels map to tiers: suggest = all tiers, approve = growth+,
-- auto = pro only. Matches PLAN_FEATURES.aiAutonomy in src/lib/billing.ts.
create or replace function public.autonomy_level_allowed(_property_id uuid, _level text)
returns boolean language sql stable security definer set search_path = public
as $$
  select case _level
    when 'suggest' then true
    when 'approve' then public.property_has_plan_at_least(_property_id, 'growth')
    when 'auto' then public.property_has_plan_at_least(_property_id, 'pro')
    else false
  end
$$;

-- Enforce on properties.default_autonomy
create or replace function public.enforce_default_autonomy_plan()
returns trigger language plpgsql security definer set search_path = public
as $$
BEGIN
  IF NEW.default_autonomy IS DISTINCT FROM OLD.default_autonomy
     AND NOT public.autonomy_level_allowed(NEW.id, NEW.default_autonomy) THEN
    RAISE EXCEPTION 'Your current plan does not include % autonomy. Upgrade to enable it.', NEW.default_autonomy
      USING errcode = 'P0001';
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS properties_autonomy_plan_gate ON public.properties;
CREATE TRIGGER properties_autonomy_plan_gate
  BEFORE UPDATE ON public.properties
  FOR EACH ROW EXECUTE FUNCTION public.enforce_default_autonomy_plan();

-- Enforce on category_autonomy (per-topic overrides)
create or replace function public.enforce_category_autonomy_plan()
returns trigger language plpgsql security definer set search_path = public
as $$
BEGIN
  IF NOT public.autonomy_level_allowed(NEW.property_id, NEW.level) THEN
    RAISE EXCEPTION 'Your current plan does not include % autonomy. Upgrade to enable it.', NEW.level
      USING errcode = 'P0001';
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS category_autonomy_plan_gate ON public.category_autonomy;
CREATE TRIGGER category_autonomy_plan_gate
  BEFORE INSERT OR UPDATE ON public.category_autonomy
  FOR EACH ROW EXECUTE FUNCTION public.enforce_category_autonomy_plan();

-- Enforce on messaging_numbers: SMS/WhatsApp require Growth or above.
-- Matches PLAN_FEATURES.channels in src/lib/billing.ts.
create or replace function public.enforce_messaging_number_plan()
returns trigger language plpgsql security definer set search_path = public
as $$
BEGIN
  IF NOT public.property_has_plan_at_least(NEW.property_id, 'growth') THEN
    RAISE EXCEPTION 'SMS/WhatsApp numbers require the Growth plan or above. Upgrade to enable this.'
      USING errcode = 'P0001';
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS messaging_numbers_plan_gate ON public.messaging_numbers;
CREATE TRIGGER messaging_numbers_plan_gate
  BEFORE INSERT ON public.messaging_numbers
  FOR EACH ROW EXECUTE FUNCTION public.enforce_messaging_number_plan();
