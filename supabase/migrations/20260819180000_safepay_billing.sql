-- Safepay billing — matches the org_admins(org_id, user_id) shape from
-- 20260811260000_organizations.sql. Run after that migration.

create type plan_tier as enum ('starter', 'growth', 'pro');
create type subscription_status as enum ('active', 'past_due', 'canceled', 'incomplete');

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  safepay_subscription_reference text unique not null, -- set to organization_id at checkout time so webhooks map back with no lookup table
  safepay_plan_id text not null,
  plan_tier plan_tier not null,
  status subscription_status not null default 'incomplete',
  property_count int not null default 1,
  amount_pkr int not null,
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.subscriptions enable row level security;

create index subscriptions_org_idx on public.subscriptions (organization_id);
create index subscriptions_status_idx on public.subscriptions (status);

create table public.billing_events (
  id uuid primary key default gen_random_uuid(),
  safepay_event_token text unique not null,
  event_type text not null,
  payload jsonb not null,
  processed_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.billing_events enable row level security;
-- No select policy on billing_events — service role (webhook) only.

create policy "Org admins read own subscription" on public.subscriptions for select to authenticated
  using (exists (
    select 1 from public.org_admins oa
    where oa.org_id = subscriptions.organization_id and oa.user_id = auth.uid()
  ));

create or replace function public.org_has_plan_at_least(org_id uuid, min_tier plan_tier)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.subscriptions s
    where s.organization_id = org_id
      and s.status in ('active', 'past_due')
      and (
        case min_tier
          when 'starter' then s.plan_tier in ('starter', 'growth', 'pro')
          when 'growth' then s.plan_tier in ('growth', 'pro')
          when 'pro' then s.plan_tier = 'pro'
        end
      )
  );
$$;
