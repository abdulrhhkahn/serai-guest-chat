-- The old policy queried org_admins from within its own RLS check on
-- org_admins, causing Postgres to recurse into itself indefinitely
-- (error 42P17). A SECURITY DEFINER function's internal query isn't
-- subject to the calling policy, which is exactly what breaks the cycle
-- — same pattern already used successfully for is_org_admin_for_property.
create or replace function public.is_admin_of_org(_org_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.org_admins m
    where m.org_id = _org_id and m.user_id = auth.uid()
  )
$$;

drop policy if exists "Org admins read their org's admins" on public.org_admins;

create policy "Org admins read their org's admins"
  on public.org_admins for select to authenticated
  using (public.is_admin_of_org(org_id));
