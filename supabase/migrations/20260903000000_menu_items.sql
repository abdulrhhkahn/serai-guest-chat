create table public.menu_items (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  category text not null,
  name text not null,
  description text,
  price_text text,
  display_order integer not null default 0,
  created_at timestamptz not null default now()
);
alter table public.menu_items enable row level security;

create index menu_items_property_idx on public.menu_items (property_id, category, display_order);

create policy "Anyone can view menu items"
  on public.menu_items for select
  using (true);

create policy "Staff manage their property's menu"
  on public.menu_items for all to authenticated
  using (property_id = public.current_staff_property_id() or public.is_org_admin_for_property(property_id) or public.has_role(auth.uid(), 'admin'))
  with check (property_id = public.current_staff_property_id() or public.is_org_admin_for_property(property_id) or public.has_role(auth.uid(), 'admin'));
