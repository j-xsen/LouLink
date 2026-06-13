-- Replace single profile_category enum with a text[] array so users can
-- belong to multiple categories (e.g. musician AND visual artist).

ALTER TABLE public.profiles ADD COLUMN categories text[] NOT NULL DEFAULT '{}';

-- Carry forward any existing single-category values
UPDATE public.profiles SET categories = ARRAY[category::text] WHERE category IS NOT NULL;

ALTER TABLE public.profiles DROP COLUMN category;

DROP TYPE IF EXISTS profile_category;

-- Replace the partial index with a GIN index for array membership queries
DROP INDEX IF EXISTS profiles_verified_category_idx;
CREATE INDEX profiles_verified_categories_idx ON public.profiles USING gin(categories) WHERE verified = true;
