-- Fix: every new signup was hard-attached to the "demo" property regardless
-- of context. Now honors an `invited_property_id` in the new user's
-- metadata (set by supabaseAdmin.auth.admin.inviteUserByEmail) when
-- present, falling back to demo only for direct/open self-signup.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
DECLARE
  target_property_id uuid;
  invited_property_id uuid;
BEGIN
  invited_property_id := (NEW.raw_user_meta_data->>'invited_property_id')::uuid;

  IF invited_property_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.properties WHERE id = invited_property_id) THEN
    target_property_id := invited_property_id;
  ELSE
    SELECT id INTO target_property_id FROM public.properties WHERE slug = 'demo' LIMIT 1;
  END IF;

  INSERT INTO public.staff_profiles (id, property_id, full_name)
  VALUES (NEW.id, target_property_id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email));
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'agent') ON CONFLICT DO NOTHING;
  RETURN NEW;
END; $$;

-- Record of who invited whom, for the Settings "Staff" list — the actual
-- account creation + email happens via Supabase's own inviteUserByEmail,
-- this table is just an audit trail, not the enforcement mechanism.
create table public.staff_invites (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  email text not null,
  invited_by uuid not null references auth.users(id),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked')),
  created_at timestamptz not null default now()
);
alter table public.staff_invites enable row level security;

create index staff_invites_property_idx on public.staff_invites (property_id);

create policy "Staff or org admins read property invites"
  on public.staff_invites for select to authenticated
  using (
    property_id = public.current_staff_property_id()
    or public.is_org_admin_for_property(property_id)
  );

create or replace function public.mark_staff_invite_accepted(_property_id uuid, _email text)
returns void language sql security definer set search_path = public
as $$
  update public.staff_invites
  set status = 'accepted'
  where property_id = _property_id and email = _email and status = 'pending'
$$;
