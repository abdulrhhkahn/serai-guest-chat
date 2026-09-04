create table public.menus (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  name text not null,
  display_order integer not null default 0,
  created_at timestamptz not null default now()
);
alter table public.menus enable row level security;

create policy "Anyone can view menus"
  on public.menus for select
  using (true);

create policy "Staff manage their property's menus"
  on public.menus for all to authenticated
  using (property_id = public.current_staff_property_id() or public.is_org_admin_for_property(property_id) or public.has_role(auth.uid(), 'admin'))
  with check (property_id = public.current_staff_property_id() or public.is_org_admin_for_property(property_id) or public.has_role(auth.uid(), 'admin'));

alter table public.menu_items add column menu_id uuid references public.menus(id) on delete cascade;
alter table public.menu_items add column image_url text;

insert into public.menus (property_id, name, display_order)
select distinct property_id, 'Menu', 0 from public.menu_items where menu_id is null;

update public.menu_items mi
set menu_id = m.id
from public.menus m
where mi.menu_id is null and m.property_id = mi.property_id;

alter table public.menu_items alter column menu_id set not null;

create index menu_items_menu_idx on public.menu_items (menu_id, category, display_order);
create index menus_property_idx on public.menus (property_id, display_order);

insert into storage.buckets (id, name, public) values ('menu-images', 'menu-images', true)
on conflict (id) do nothing;

create policy "Anyone can view menu images"
  on storage.objects for select
  using (bucket_id = 'menu-images');

create policy "Staff upload menu images"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'menu-images');

create policy "Staff delete their menu images"
  on storage.objects for delete to authenticated
  using (bucket_id = 'menu-images');
