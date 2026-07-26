-- Message audit fields
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS source text,
  ADD COLUMN IF NOT EXISTS sender_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS original_draft text;

-- Response templates
CREATE TABLE IF NOT EXISTS public.response_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text NOT NULL,
  category text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.response_templates TO authenticated;
GRANT ALL ON public.response_templates TO service_role;

ALTER TABLE public.response_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff manage own property templates"
  ON public.response_templates FOR ALL
  TO authenticated
  USING (property_id = public.current_staff_property_id())
  WITH CHECK (property_id = public.current_staff_property_id());

-- Seed a few starter templates for demo property
INSERT INTO public.response_templates (property_id, title, body, category)
SELECT id, 'Wifi info', 'Our wifi is on the "' || COALESCE(wifi_ssid,'Guest') || '" network — password is ' || COALESCE(wifi_password,'at reception') || '. Let me know if you have any trouble connecting!', 'wifi'
FROM public.properties WHERE slug = 'demo'
ON CONFLICT DO NOTHING;

INSERT INTO public.response_templates (property_id, title, body, category)
SELECT id, 'Late check-out', 'Happy to arrange a late check-out for you. Would 1pm work? There''s no extra charge.', 'checkout'
FROM public.properties WHERE slug = 'demo'
ON CONFLICT DO NOTHING;

INSERT INTO public.response_templates (property_id, title, body, category)
SELECT id, 'Breakfast', 'Breakfast is served in the lounge from 7 to 10am — just come down whenever suits you.', 'dining'
FROM public.properties WHERE slug = 'demo'
ON CONFLICT DO NOTHING;