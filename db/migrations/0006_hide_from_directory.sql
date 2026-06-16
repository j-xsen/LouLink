ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS hide_from_directory boolean DEFAULT false;
