-- Allow admins to create and update any property (multi-property management)
CREATE POLICY "Admins can insert properties" ON public.properties
FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update any property" ON public.properties
FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Admins can view all staff profiles (needed to help manage)
CREATE POLICY "Admins view all staff profiles" ON public.staff_profiles
FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));