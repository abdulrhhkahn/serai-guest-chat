-- General-purpose staff activity log. Not every possible action is
-- instrumented yet — this is a real, extensible log, wired into the
-- highest-value staff actions first (guest replies, resolving
-- conversations, settings changes), not a claim of universal coverage.
create table public.staff_activity_log (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references auth.users(id),
  property_id uuid not null references public.properties(id) on delete cascade,
  action_type text not null,
  detail text,
  created_at timestamptz not null default now()
);
alter table public.staff_activity_log enable row level security;

create index staff_activity_log_property_created_idx on public.staff_activity_log (property_id, created_at desc);

create policy "Staff log their own activity"
  on public.staff_activity_log for insert to authenticated
  with check (staff_id = auth.uid() and property_id = public.current_staff_property_id());

create policy "Staff and admins read property activity"
  on public.staff_activity_log for select to authenticated
  using (
    property_id = public.current_staff_property_id()
    or public.is_org_admin_for_property(property_id)
    or public.has_role(auth.uid(), 'admin')
  );
