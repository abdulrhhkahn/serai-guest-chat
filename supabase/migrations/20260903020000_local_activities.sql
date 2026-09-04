create table public.local_activities (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  category text not null,
  name text not null,
  description text,
  price_text text,
  provider_name text,
  provider_contact text,
  image_url text,
  display_order integer not null default 0,
  created_at timestamptz not null default now()
);
alter table public.local_activities enable row level security;

create index local_activities_property_idx on public.local_activities (property_id, category, display_order);

create policy "Anyone can view local activities"
  on public.local_activities for select
  using (true);

create policy "Staff manage their property's activities"
  on public.local_activities for all to authenticated
  using (property_id = public.current_staff_property_id() or public.is_org_admin_for_property(property_id) or public.has_role(auth.uid(), 'admin'))
  with check (property_id = public.current_staff_property_id() or public.is_org_admin_for_property(property_id) or public.has_role(auth.uid(), 'admin'));

insert into storage.buckets (id, name, public) values ('activity-images', 'activity-images', true)
on conflict (id) do nothing;

create policy "Anyone can view activity images"
  on storage.objects for select
  using (bucket_id = 'activity-images');

create policy "Staff upload activity images"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'activity-images');

create policy "Staff delete their activity images"
  on storage.objects for delete to authenticated
  using (bucket_id = 'activity-images');
