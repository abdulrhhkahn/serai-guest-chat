-- ============================================================================
-- Serai — autonomy config-change audit
-- Run AFTER 20260811220000_delivery_status.sql.
-- ----------------------------------------------------------------------------
-- Records every change to a property's AI autonomy configuration as a dated
-- event, so "graduated to auto" shows as discrete events, not just an inferred
-- trend. Captured by triggers so any change path is logged, with the acting user.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.autonomy_audit (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  category    text,                 -- null = the property-wide default
  old_level   text,                 -- null on first set; 'default' when an override is removed
  new_level   text NOT NULL,
  changed_by  uuid,                 -- auth.uid() of the staff member (null for service role)
  created_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.autonomy_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff read own autonomy audit"
  ON public.autonomy_audit FOR SELECT TO authenticated
  USING (property_id = public.current_staff_property_id());

CREATE INDEX IF NOT EXISTS autonomy_audit_prop_time_idx
  ON public.autonomy_audit (property_id, created_at DESC);

-- Per-category overrides: insert / level change / removal ------------------------
CREATE OR REPLACE FUNCTION public.log_category_autonomy_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.autonomy_audit (property_id, category, old_level, new_level, changed_by)
      VALUES (NEW.property_id, NEW.category, NULL, NEW.level, auth.uid());
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.level IS DISTINCT FROM OLD.level THEN
      INSERT INTO public.autonomy_audit (property_id, category, old_level, new_level, changed_by)
        VALUES (NEW.property_id, NEW.category, OLD.level, NEW.level, auth.uid());
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.autonomy_audit (property_id, category, old_level, new_level, changed_by)
      VALUES (OLD.property_id, OLD.category, OLD.level, 'default', auth.uid());
    RETURN OLD;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS category_autonomy_audit ON public.category_autonomy;
CREATE TRIGGER category_autonomy_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.category_autonomy
  FOR EACH ROW EXECUTE FUNCTION public.log_category_autonomy_change();

-- Property-wide default change ---------------------------------------------------
CREATE OR REPLACE FUNCTION public.log_default_autonomy_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.default_autonomy IS DISTINCT FROM OLD.default_autonomy THEN
    INSERT INTO public.autonomy_audit (property_id, category, old_level, new_level, changed_by)
      VALUES (NEW.id, NULL, OLD.default_autonomy, NEW.default_autonomy, auth.uid());
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS properties_autonomy_audit ON public.properties;
CREATE TRIGGER properties_autonomy_audit
  AFTER UPDATE ON public.properties
  FOR EACH ROW EXECUTE FUNCTION public.log_default_autonomy_change();
