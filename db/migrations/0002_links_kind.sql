-- Add kind column to support section headers alongside regular links.
-- url becomes nullable because headers have no url.

ALTER TABLE public.links
  ADD COLUMN kind text NOT NULL DEFAULT 'link',
  ADD CONSTRAINT kind_valid CHECK (kind IN ('link', 'header'));

ALTER TABLE public.links
  ALTER COLUMN url DROP NOT NULL,
  DROP CONSTRAINT url_not_empty,
  DROP CONSTRAINT url_format;

ALTER TABLE public.links
  ADD CONSTRAINT url_required_for_link
    CHECK (kind = 'header' OR (url IS NOT NULL AND char_length(trim(url)) > 0)),
  ADD CONSTRAINT url_format
    CHECK (url IS NULL OR url ~ '^https?://');
