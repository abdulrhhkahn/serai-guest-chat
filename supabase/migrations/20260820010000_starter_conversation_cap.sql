-- Starter's 50-conversations/month cap (PLAN_FEATURES.maxConversationsPerMonth
-- in src/lib/billing.ts). Growth/Pro are unlimited so this only ever counts
-- for Starter (or org-less) properties. Month boundary is calendar month in
-- UTC, not tied to the billing cycle date — simple and matches the plan
-- copy ("50 conversations/month"), not worth the complexity of aligning to
-- subscriptions.current_period_end for a free tier.
create or replace function public.starter_conversation_limit_ok(_property_id uuid)
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

create or replace function public.enforce_starter_conversation_cap()
returns trigger language plpgsql security definer set search_path = public
as $$
BEGIN
  IF NOT public.starter_conversation_limit_ok(NEW.property_id) THEN
    RAISE EXCEPTION 'This property has reached its 50 conversation/month limit on the Starter plan. Upgrade to Growth for unlimited conversations.'
      USING errcode = 'P0001';
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS conversations_starter_cap ON public.conversations;
CREATE TRIGGER conversations_starter_cap
  BEFORE INSERT ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION public.enforce_starter_conversation_cap();
