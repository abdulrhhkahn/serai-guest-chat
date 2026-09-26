create table public.guest_requests (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete set null,
  checkin_id uuid references public.checkins(id) on delete set null,
  title text not null,
  description text,
  status text not null default 'new' check (status in ('new', 'assigned', 'in_progress', 'completed')),
  assigned_to uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.guest_requests enable row level security;

create index guest_requests_property_status_idx on public.guest_requests (property_id, status, created_at desc);
create index guest_requests_conversation_idx on public.guest_requests (conversation_id);

create policy "Staff manage their property's requests"
  on public.guest_requests for all to authenticated
  using (property_id = public.current_staff_property_id() or public.is_org_admin_for_property(property_id) or public.has_role(auth.uid(), 'admin'))
  with check (property_id = public.current_staff_property_id() or public.is_org_admin_for_property(property_id) or public.has_role(auth.uid(), 'admin'));

create table public.guest_notes (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  checkin_id uuid not null references public.checkins(id) on delete cascade,
  staff_id uuid references auth.users(id),
  note text not null,
  created_at timestamptz not null default now()
);
alter table public.guest_notes enable row level security;

create index guest_notes_checkin_idx on public.guest_notes (checkin_id, created_at desc);

create policy "Staff manage their property's guest notes"
  on public.guest_notes for all to authenticated
  using (property_id = public.current_staff_property_id() or public.is_org_admin_for_property(property_id) or public.has_role(auth.uid(), 'admin'))
  with check (property_id = public.current_staff_property_id() or public.is_org_admin_for_property(property_id) or public.has_role(auth.uid(), 'admin'));

alter table public.checkins add column preferences text;
