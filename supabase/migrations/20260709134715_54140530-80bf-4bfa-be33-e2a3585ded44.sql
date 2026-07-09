
-- Roles enum + user_roles table (roles NEVER on profile tables)
CREATE TYPE public.app_role AS ENUM ('admin', 'agent');

CREATE TABLE public.properties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  logo_url text,
  brand_color text NOT NULL DEFAULT '#0b6b75',
  address text,
  wifi_ssid text,
  wifi_password text,
  checkin_time text DEFAULT '3:00 PM',
  checkout_time text DEFAULT '11:00 AM',
  welcome_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.properties TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.properties TO authenticated;
GRANT ALL ON public.properties TO service_role;
ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.staff_profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  property_id uuid REFERENCES public.properties(id) ON DELETE SET NULL,
  full_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_profiles TO authenticated;
GRANT ALL ON public.staff_profiles TO service_role;
ALTER TABLE public.staff_profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.checkins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  guest_name text NOT NULL,
  guest_email text,
  guest_phone text,
  booking_reference text,
  arrival_date date,
  departure_date date,
  num_guests int DEFAULT 1,
  id_document_url text,
  signature_url text,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT INSERT ON public.checkins TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.checkins TO authenticated;
GRANT ALL ON public.checkins TO service_role;
ALTER TABLE public.checkins ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  guest_name text,
  guest_contact text,
  channel text NOT NULL DEFAULT 'web',
  status text NOT NULL DEFAULT 'open',
  last_message_at timestamptz DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.conversations TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversations TO authenticated;
GRANT ALL ON public.conversations TO service_role;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender text NOT NULL,
  body text NOT NULL,
  is_ai_suggestion boolean NOT NULL DEFAULT false,
  approved boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.messages TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.messages TO authenticated;
GRANT ALL ON public.messages TO service_role;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.faqs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  question text NOT NULL,
  answer text NOT NULL,
  category text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.faqs TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.faqs TO authenticated;
GRANT ALL ON public.faqs TO service_role;
ALTER TABLE public.faqs ENABLE ROW LEVEL SECURITY;

-- Security-definer helpers
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role) $$;

CREATE OR REPLACE FUNCTION public.current_staff_property_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT property_id FROM public.staff_profiles WHERE id = auth.uid() $$;

CREATE OR REPLACE FUNCTION public.property_id_for_conversation(_conv_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT property_id FROM public.conversations WHERE id = _conv_id $$;

-- Policies: properties
CREATE POLICY "Anyone can view properties" ON public.properties FOR SELECT USING (true);
CREATE POLICY "Staff can update own property" ON public.properties FOR UPDATE TO authenticated
  USING (id = public.current_staff_property_id()) WITH CHECK (id = public.current_staff_property_id());

-- staff_profiles
CREATE POLICY "Users view own profile" ON public.staff_profiles FOR SELECT TO authenticated
  USING (id = auth.uid());
CREATE POLICY "Users update own profile" ON public.staff_profiles FOR UPDATE TO authenticated
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE POLICY "Users insert own profile" ON public.staff_profiles FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());

-- user_roles
CREATE POLICY "Users view own roles" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- checkins
CREATE POLICY "Anon can create checkins" ON public.checkins FOR INSERT TO anon
  WITH CHECK (property_id IN (SELECT id FROM public.properties));
CREATE POLICY "Staff view own property checkins" ON public.checkins FOR SELECT TO authenticated
  USING (property_id = public.current_staff_property_id());
CREATE POLICY "Staff update own property checkins" ON public.checkins FOR UPDATE TO authenticated
  USING (property_id = public.current_staff_property_id())
  WITH CHECK (property_id = public.current_staff_property_id());

-- conversations
CREATE POLICY "Anon can create conversations" ON public.conversations FOR INSERT TO anon
  WITH CHECK (property_id IN (SELECT id FROM public.properties));
CREATE POLICY "Anon can view own conversation by id" ON public.conversations FOR SELECT TO anon USING (true);
CREATE POLICY "Anon can update conversation last_message_at" ON public.conversations FOR UPDATE TO anon
  USING (true) WITH CHECK (true);
CREATE POLICY "Staff view own property conversations" ON public.conversations FOR SELECT TO authenticated
  USING (property_id = public.current_staff_property_id());
CREATE POLICY "Staff update own property conversations" ON public.conversations FOR UPDATE TO authenticated
  USING (property_id = public.current_staff_property_id())
  WITH CHECK (property_id = public.current_staff_property_id());

-- messages
CREATE POLICY "Anon can create messages" ON public.messages FOR INSERT TO anon
  WITH CHECK (public.property_id_for_conversation(conversation_id) IS NOT NULL);
CREATE POLICY "Anon can view messages" ON public.messages FOR SELECT TO anon USING (true);
CREATE POLICY "Staff view messages for own property" ON public.messages FOR SELECT TO authenticated
  USING (public.property_id_for_conversation(conversation_id) = public.current_staff_property_id());
CREATE POLICY "Staff insert messages for own property" ON public.messages FOR INSERT TO authenticated
  WITH CHECK (public.property_id_for_conversation(conversation_id) = public.current_staff_property_id());
CREATE POLICY "Staff update messages for own property" ON public.messages FOR UPDATE TO authenticated
  USING (public.property_id_for_conversation(conversation_id) = public.current_staff_property_id())
  WITH CHECK (public.property_id_for_conversation(conversation_id) = public.current_staff_property_id());

-- faqs
CREATE POLICY "Anyone can view faqs" ON public.faqs FOR SELECT USING (true);
CREATE POLICY "Staff manage own property faqs" ON public.faqs FOR ALL TO authenticated
  USING (property_id = public.current_staff_property_id())
  WITH CHECK (property_id = public.current_staff_property_id());

-- Realtime
ALTER TABLE public.messages REPLICA IDENTITY FULL;
ALTER TABLE public.conversations REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;

-- Seed demo property
INSERT INTO public.properties (name, slug, brand_color, address, wifi_ssid, wifi_password, checkin_time, checkout_time, welcome_message)
VALUES ('Serai Demo Hotel', 'demo', '#0b6b75', '12 Harbour Lane, Lisbon, Portugal',
        'Serai-Guest', 'welcome2024', '3:00 PM', '11:00 AM',
        'Welcome to Serai. Your room is ready — we hope you enjoy a restful stay.');

INSERT INTO public.faqs (property_id, question, answer, category)
SELECT id, q, a, c FROM public.properties, (VALUES
  ('What is the wifi password?', 'The network is "Serai-Guest" and the password is "welcome2024". It works throughout the building.', 'Wifi'),
  ('What time is breakfast?', 'Breakfast is served in the courtyard cafe from 7:30 AM to 10:30 AM daily. It is included in your stay.', 'Dining'),
  ('When is check-in and check-out?', 'Check-in is from 3:00 PM and check-out is by 11:00 AM. Early check-in and late check-out are available on request.', 'Stay'),
  ('Is parking available?', 'Yes — we have complimentary underground parking. The entrance is on Rua do Norte, just behind the hotel.', 'Amenities')
) AS f(q,a,c) WHERE slug='demo';

-- Auto-create staff_profile on signup, attach to demo property
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE demo_id uuid;
BEGIN
  SELECT id INTO demo_id FROM public.properties WHERE slug = 'demo' LIMIT 1;
  INSERT INTO public.staff_profiles (id, property_id, full_name)
  VALUES (NEW.id, demo_id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email));
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'agent') ON CONFLICT DO NOTHING;
  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
