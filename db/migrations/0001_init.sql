-- =============================================================================
-- LouLink — Initial Schema Migration
--
-- Neon Auth (Better Auth) is the identity provider. User records live in the
-- read-only `neon_auth.user` table managed by Neon Auth. Do not modify it
-- directly. `public.profiles` extends it via FK.
-- =============================================================================

-- Shared trigger function — reused by every table with an updated_at column
CREATE OR REPLACE FUNCTION set_updated_at()
  RETURNS TRIGGER
  LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- Category enum
-- ---------------------------------------------------------------------------
CREATE TYPE profile_category AS ENUM (
  'music',
  'visual-art',
  'food',
  'retail',
  'community'
);

-- ---------------------------------------------------------------------------
-- public.profiles
-- One row per authenticated user. user_id matches neon_auth.user.id (uuid).
-- No FK constraint — the neon_auth schema is managed by Neon and does not
-- allow cross-schema FK references. Integrity is enforced by the auth
-- middleware, which requires a valid session before any profile write.
-- ---------------------------------------------------------------------------
CREATE TABLE public.profiles (
  user_id         uuid            PRIMARY KEY,
  username        text            NOT NULL UNIQUE,
  display_name    text            NOT NULL,
  bio             text,
  avatar_asset_id text,           -- Contentful asset ID — resolved to URL at render time
  category        profile_category,
  verified        boolean         NOT NULL DEFAULT false,
  created_at      timestamptz     NOT NULL DEFAULT now(),
  updated_at      timestamptz     NOT NULL DEFAULT now(),

  CONSTRAINT username_slug_format CHECK (username ~ '^[a-z0-9][a-z0-9_-]{1,28}[a-z0-9]$'),
  CONSTRAINT username_length      CHECK (char_length(username) BETWEEN 3 AND 30),
  CONSTRAINT bio_length           CHECK (bio IS NULL OR char_length(bio) <= 300)
);

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Fast slug lookup — the primary profile page query
CREATE UNIQUE INDEX profiles_username_idx ON public.profiles (username);

-- Home page directory query: all verified profiles, optionally filtered by category
CREATE INDEX profiles_verified_category_idx
  ON public.profiles (category)
  WHERE verified = true;

-- ---------------------------------------------------------------------------
-- public.links
-- Each profile can have many links, ordered by sort_order ASC.
-- ---------------------------------------------------------------------------
CREATE TABLE public.links (
  id          uuid            PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid            NOT NULL
              REFERENCES public.profiles(user_id)
              ON DELETE CASCADE,
  title       text            NOT NULL,
  url         text            NOT NULL,
  icon        text,           -- Lucide React icon name, e.g. "Instagram", "Globe", "Music"
  sort_order  integer         NOT NULL DEFAULT 0,
  visible     boolean         NOT NULL DEFAULT true,
  created_at  timestamptz     NOT NULL DEFAULT now(),
  updated_at  timestamptz     NOT NULL DEFAULT now(),

  CONSTRAINT title_not_empty CHECK (char_length(trim(title)) > 0),
  CONSTRAINT url_not_empty   CHECK (char_length(trim(url))   > 0),
  CONSTRAINT url_format      CHECK (url ~ '^https?://')
);

CREATE TRIGGER links_updated_at
  BEFORE UPDATE ON public.links
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Fetch all links for a profile in display order — the most common query
CREATE INDEX links_user_sort_idx ON public.links (user_id, sort_order ASC);
