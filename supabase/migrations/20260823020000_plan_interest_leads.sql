-- Lead-capture submissions from the pricing page's Subscribe forms, before
-- proceeding to actual checkout. Insert-only for signed-in staff (no
-- update/delete from the client); read is admin-only for now.
create table public.plan_interest_leads (
  id uuid primary key default gen_random_uuid(),
  submitted_by uuid references auth.users(id),
  plan_tier text not null,
  first_name text not null,
  last_name text not null,
  work_email text not null,
  property_type text not null,
  property_count integer not null,
  phone text not null,
  heard_about text,
  created_at timestamptz not null default now()
);
alter table public.plan_interest_leads enable row level security;

create policy "Signed-in staff can submit a lead"
  on public.plan_interest_leads for insert to authenticated
  with check (submitted_by = auth.uid());

create policy "Site admins read leads"
  on public.plan_interest_leads for select to authenticated
  using (public.has_role(auth.uid(), 'admin'));
