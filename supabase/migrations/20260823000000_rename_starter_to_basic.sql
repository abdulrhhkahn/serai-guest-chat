-- Rename the enum value itself. Existing rows referencing it (there are
-- none in practice, since Basic/Starter never gets a subscriptions row)
-- are unaffected in meaning — just relabeled.
ALTER TYPE public.plan_tier RENAME VALUE 'starter' TO 'basic';

create or replace function public.org_has_plan_at_least(org_id uuid, min_tier plan_tier)
returns boolean language sql stable security definer set search_path = public
as $$
  select case min_tier
    when 'basic' then true
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

create or replace function public.property_has_plan_at_least(_property_id uuid, min_tier plan_tier)
returns boolean language sql stable security definer set search_path = public
as $$
  select case min_tier
    when 'basic' then true
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

-- Conversation cap: Basic=25/month, Growth=50/month, Pro=unlimited
-- (previously: Basic/Starter=50, Growth/Pro=unlimited).
create or replace function public.conversation_limit_ok(_property_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select
    public.property_has_plan_at_least(_property_id, 'pro')
    or (
      select count(*) from public.conversations c
      where c.property_id = _property_id
        and c.created_at >= date_trunc('month', now())
    ) < (
      case when public.property_has_plan_at_least(_property_id, 'growth') then 50 else 25 end
    )
$$;

create or replace function public.enforce_conversation_cap()
returns trigger language plpgsql security definer set search_path = public
as $$
BEGIN
  IF NOT public.conversation_limit_ok(NEW.property_id) THEN
    RAISE EXCEPTION 'This property has reached its monthly conversation limit for its current plan. Upgrade for more.'
      USING errcode = 'P0001';
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS conversations_starter_cap ON public.conversations;
CREATE TRIGGER conversations_plan_cap
  BEFORE INSERT ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION public.enforce_conversation_cap();

DROP FUNCTION IF EXISTS public.starter_conversation_limit_ok(uuid);
DROP FUNCTION IF EXISTS public.enforce_starter_conversation_cap();
