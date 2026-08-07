ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS resolved_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS resolved_by uuid REFERENCES auth.users(id);