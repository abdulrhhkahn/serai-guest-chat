-- ============================================================================
-- Serai — organisation / group model (cross-property analytics for chains)
-- Run AFTER 20260811250000_report_email.sql.
-- ----------------------------------------------------------------------------
-- Purely ADDITIVE. Existing per-property policies are left untouched, so a normal
-- agent's access is unchanged. This adds an org boundary and grants org admins
-- READ access across the properties in *their own* org — nothing more. With no
-- org configured, this migration changes no one's access.
-- ============================================================================

-- 1. Organisations + property membership ----------------------------------------
CREATE TABLE IF NOT EXISTS public.organizations (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL;

-- 2. Org admins: users who may read across an org's properties -------------------
CREATE TABLE IF NOT EXISTS public.org_admins (
  org_id     uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, user_id)
);
ALTER TABLE public.org_admins ENABLE ROW LEVEL SECURITY;

-- 3. Predicate: is the caller an org admin over the org owning this property? ----
CREATE OR REPLACE FUNCTION public.is_org_admin_for_property(_property_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.properties p
    JOIN public.org_admins oa ON oa.org_id = p.organization_id
    WHERE p.id = _property_id AND oa.user_id = auth.uid()
  )
$$;

-- 4. Let org admins see their own membership + orgs ------------------------------
CREATE POLICY "Read own org memberships" ON public.org_admins FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "Read orgs you administer" ON public.organizations FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.org_admins oa WHERE oa.org_id = id AND oa.user_id = auth.uid()));

-- 5. ADDITIVE org-admin read policies on the analytics tables --------------------
-- RLS is OR across policies, so these sit alongside the existing own-property
-- policies. A user with no org_admins row matches none of these → no change.
CREATE POLICY "Org admins read org conversations" ON public.conversations FOR SELECT TO authenticated
  USING (public.is_org_admin_for_property(property_id));

CREATE POLICY "Org admins read org messages" ON public.messages FOR SELECT TO authenticated
  USING (public.is_org_admin_for_property(public.property_id_for_conversation(conversation_id)));

CREATE POLICY "Org admins read org checkins" ON public.checkins FOR SELECT TO authenticated
  USING (public.is_org_admin_for_property(property_id));

CREATE POLICY "Org admins read org ai_decisions" ON public.ai_decisions FOR SELECT TO authenticated
  USING (public.is_org_admin_for_property(property_id));

CREATE POLICY "Org admins read org ai_drafts" ON public.ai_drafts FOR SELECT TO authenticated
  USING (public.is_org_admin_for_property(property_id));

CREATE POLICY "Org admins read org category_autonomy" ON public.category_autonomy FOR SELECT TO authenticated
  USING (public.is_org_admin_for_property(property_id));

CREATE POLICY "Org admins read org autonomy_audit" ON public.autonomy_audit FOR SELECT TO authenticated
  USING (public.is_org_admin_for_property(property_id));

CREATE POLICY "Org admins read org messaging_numbers" ON public.messaging_numbers FOR SELECT TO authenticated
  USING (public.is_org_admin_for_property(property_id));

-- properties + faqs are already world-readable (existing policies), so org admins
-- can already list them. Org admins get READ only; writes stay per-property.

-- ----------------------------------------------------------------------------
-- Seeding (run manually once, as service role / SQL editor):
--   insert into organizations (name) values ('Cedar Hospitality Group') returning id;
--   update properties set organization_id = '<org-id>' where id in ('<propA>','<propB>');
--   insert into org_admins (org_id, user_id) values ('<org-id>', '<user-uuid>');
-- ----------------------------------------------------------------------------
