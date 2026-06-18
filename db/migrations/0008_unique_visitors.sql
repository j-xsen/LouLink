ALTER TABLE public.page_view_events
  ADD COLUMN IF NOT EXISTS visitor_hash text;

ALTER TABLE public.page_view_daily
  ADD COLUMN IF NOT EXISTS unique_visitors integer NOT NULL DEFAULT 0;
