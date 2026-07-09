
-- guest-ids: anon insert, staff read own property (folder prefix = property_id)
CREATE POLICY "Anon can upload guest ids" ON storage.objects FOR INSERT TO anon
  WITH CHECK (bucket_id = 'guest-ids');
CREATE POLICY "Staff read own property guest ids" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'guest-ids' AND (storage.foldername(name))[1] = public.current_staff_property_id()::text);

CREATE POLICY "Anon can upload signatures" ON storage.objects FOR INSERT TO anon
  WITH CHECK (bucket_id = 'guest-signatures');
CREATE POLICY "Staff read own property signatures" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'guest-signatures' AND (storage.foldername(name))[1] = public.current_staff_property_id()::text);

CREATE POLICY "Staff manage own property logos" ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'property-logos' AND (storage.foldername(name))[1] = public.current_staff_property_id()::text)
  WITH CHECK (bucket_id = 'property-logos' AND (storage.foldername(name))[1] = public.current_staff_property_id()::text);
CREATE POLICY "Anyone can read property logos" ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id = 'property-logos');
