-- ============================================================================
-- Serai — org management policies (for the /organization admin UI)
-- Run AFTER 20260811260000_organizations.sql.
-- ----------------------------------------------------------------------------
-- Adds the minimum needed for org admins to manage their OWN org from the UI:
--   • list the other admins of their org (read)
--   • rename their org
-- Adding/removing admins and assigning properties go through the guarded
-- /api/admin/org route (service role + explicit caller checks), so no
-- broad write policies are added here.
-- ============================================================================

-- List co-admins of an org you administer (v17 only allowed reading your own row).
CREATE POLICY "Org admins read their org's admins" ON public.org_admins FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.org_admins m
    WHERE m.org_id = org_admins.org_id AND m.user_id = auth.uid()
  ));

-- Rename an org you administer.
CREATE POLICY "Org admins rename their org" ON public.organizations FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.org_admins oa WHERE oa.org_id = id AND oa.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.org_admins oa WHERE oa.org_id = id AND oa.user_id = auth.uid()));
