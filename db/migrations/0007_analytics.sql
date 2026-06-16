-- ---------------------------------------------------------------------------
-- 0007_analytics.sql
-- Analytics: page view events + link click events with 30-day raw retention,
-- daily rollup tables kept indefinitely, future monthly compression planned.
-- ---------------------------------------------------------------------------

CREATE TABLE public.page_view_events (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id   uuid        NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  occurred_at  timestamptz NOT NULL DEFAULT now(),
  country      text,
  city         text,
  browser      text,
  os           text,
  device_type  text        CHECK (device_type IN ('desktop', 'mobile', 'tablet')),
  referrer     text,
  visit_kind   text        CHECK (visit_kind IN ('direct', 'social', 'search', 'referral')),
  duration_ms  integer     CHECK (duration_ms IS NULL OR duration_ms >= 0)
);

CREATE INDEX page_view_events_profile_time_idx ON public.page_view_events (profile_id, occurred_at DESC);
CREATE INDEX page_view_events_occurred_at_idx  ON public.page_view_events (occurred_at ASC);

-- ---------------------------------------------------------------------------
-- Daily rollups (permanent). One row per profile per calendar day.
-- ---------------------------------------------------------------------------
CREATE TABLE public.page_view_daily (
  id              uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id      uuid    NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  day             date    NOT NULL,
  total_views     integer NOT NULL DEFAULT 0,
  by_country      jsonb   NOT NULL DEFAULT '{}',
  by_city         jsonb   NOT NULL DEFAULT '{}',
  by_browser      jsonb   NOT NULL DEFAULT '{}',
  by_os           jsonb   NOT NULL DEFAULT '{}',
  by_device       jsonb   NOT NULL DEFAULT '{}',
  by_referrer     jsonb   NOT NULL DEFAULT '{}',
  by_visit_kind   jsonb   NOT NULL DEFAULT '{}',
  avg_duration_ms integer,

  CONSTRAINT page_view_daily_profile_day_unique UNIQUE (profile_id, day)
);

CREATE UNIQUE INDEX page_view_daily_profile_day_idx ON public.page_view_daily (profile_id, day);
CREATE INDEX        page_view_daily_day_idx          ON public.page_view_daily (day ASC);

-- ---------------------------------------------------------------------------
-- Link click raw events (30-day TTL). profile_id is denormalized to avoid
-- joins in the nightly cron and per-profile analytics queries.
-- ---------------------------------------------------------------------------
CREATE TABLE public.link_click_events (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  link_id     uuid        NOT NULL REFERENCES public.links(id) ON DELETE CASCADE,
  profile_id  uuid        NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  country     text,
  referrer    text,
  visit_kind  text        CHECK (visit_kind IN ('direct', 'social', 'search', 'referral'))
);

CREATE INDEX link_click_events_link_time_idx    ON public.link_click_events (link_id, occurred_at DESC);
CREATE INDEX link_click_events_profile_time_idx ON public.link_click_events (profile_id, occurred_at DESC);
CREATE INDEX link_click_events_occurred_at_idx  ON public.link_click_events (occurred_at ASC);

-- ---------------------------------------------------------------------------
-- Link click daily rollups (permanent).
-- ---------------------------------------------------------------------------
CREATE TABLE public.link_click_daily (
  id           uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  link_id      uuid    NOT NULL REFERENCES public.links(id) ON DELETE CASCADE,
  profile_id   uuid    NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  day          date    NOT NULL,
  total_clicks integer NOT NULL DEFAULT 0,
  by_country   jsonb   NOT NULL DEFAULT '{}',

  CONSTRAINT link_click_daily_link_day_unique UNIQUE (link_id, day)
);

CREATE UNIQUE INDEX link_click_daily_link_day_idx  ON public.link_click_daily (link_id, day);
CREATE INDEX        link_click_daily_profile_day_idx ON public.link_click_daily (profile_id, day DESC);
