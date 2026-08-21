-- Org admins on Pro can add a property to their own org. Existing
-- "Admins can insert properties" policy (site-wide role) stays untouched —
-- Postgres RLS policies are OR'd, so both paths work independently.
create or replace function public.can_org_admin_add_property(_organization_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select
    exists (select 1 from public.org_admins oa where oa.org_id = _organization_id and oa.user_id = auth.uid())
    and public.org_has_plan_at_least(_organization_id, 'pro')
$$;

create policy "Org admins on Pro can add properties"
  on public.properties for insert to authenticated
  with check (organization_id is not null and public.can_org_admin_add_property(organization_id));

-- Fix: "Users update own profile" previously let ANY staff member set
-- their own property_id to ANY property with no ownership check at all —
-- since current_staff_property_id() drives almost every other RLS policy
-- in the app, this meant any staff account could self-reassign onto a
-- different hotel and read its guest conversations, checkins and IDs.
-- New rule: you can only switch onto a property that's either unassigned
-- to any org, or in the same org as your CURRENT property (matches the
-- "org admins manage properties within their org" model already used
-- elsewhere). Site-wide admins are unrestricted, matching their existing
-- "Admins can update any property" equivalent elsewhere.
create or replace function public.can_switch_to_property(_new_property_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select
    public.has_role(auth.uid(), 'admin')
    or (
      select
        case
          when p_new.organization_id is null then true
          when p_current.organization_id is not null and p_new.organization_id = p_current.organization_id then true
          else false
        end
      from public.properties p_new
      left join public.staff_profiles sp on sp.id = auth.uid()
      left join public.properties p_current on p_current.id = sp.property_id
      where p_new.id = _new_property_id
    )
$$;

drop policy if exists "Users update own profile" on public.staff_profiles;
create policy "Users update own profile"
  on public.staff_profiles for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid() and (property_id is null or public.can_switch_to_property(property_id)));
