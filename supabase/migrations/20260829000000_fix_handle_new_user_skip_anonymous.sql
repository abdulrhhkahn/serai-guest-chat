-- The old version unconditionally created a staff_profiles row + agent
-- role for every new auth.users insert, with no check for whether the
-- user is anonymous. Since anonymous sign-in also inserts a real
-- auth.users row, every guest who checks in would silently become a
-- staff-level account on the Demo property the moment anonymous
-- sign-ins actually start working — a real access-control bug, not a
-- cosmetic one. Guests get no staff_profiles row and no role at all now.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE
  target_property_id uuid;
  invited_property_id uuid;
BEGIN
  IF NEW.is_anonymous THEN
    RETURN NEW;
  END IF;

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
END; $function$;
