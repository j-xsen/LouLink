// ---------------------------------------------------------------------------
// Nightly analytics cron — aggregates raw events into daily rollups, purges
// events older than 30 days. Runs at 06:00 UTC (1–2 AM Louisville time).
// ---------------------------------------------------------------------------

import { createDb } from "./db";

export async function handleScheduled(_event: ScheduledEvent, env: Env): Promise<void> {
  const sql = createDb(env.DATABASE_URL);

  // Aggregate "yesterday" in UTC — the cron fires at 06:00 UTC which is after
  // midnight in Louisville (EST/EDT), so yesterday is fully complete.
  const yesterday = new Date();
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const day = yesterday.toISOString().slice(0, 10); // 'YYYY-MM-DD'

  // ---------------------------------------------------------------------------
  // Aggregate page views into page_view_daily
  // One query using CTEs to build all JSONB breakdown columns per profile.
  // ---------------------------------------------------------------------------
  await sql`
    WITH src AS (
      SELECT profile_id, country, city, browser, os, device_type, referrer, visit_kind, duration_ms
      FROM public.page_view_events
      WHERE occurred_at >= ${day}::date
        AND occurred_at <  ${day}::date + interval '1 day'
    ),
    totals AS (
      SELECT profile_id,
             COUNT(*)::int                   AS total_views,
             ROUND(AVG(duration_ms))::int    AS avg_duration_ms
      FROM src GROUP BY profile_id
    ),
    by_country AS (
      SELECT profile_id, jsonb_object_agg(k, c) AS v FROM (
        SELECT profile_id, COALESCE(country, 'Unknown') AS k, COUNT(*)::int AS c
        FROM src GROUP BY profile_id, k
      ) x GROUP BY profile_id
    ),
    by_city AS (
      SELECT profile_id, jsonb_object_agg(k, c) AS v FROM (
        SELECT profile_id, COALESCE(city, 'Unknown') AS k, COUNT(*)::int AS c
        FROM src GROUP BY profile_id, k
      ) x GROUP BY profile_id
    ),
    by_browser AS (
      SELECT profile_id, jsonb_object_agg(k, c) AS v FROM (
        SELECT profile_id, COALESCE(browser, 'Other') AS k, COUNT(*)::int AS c
        FROM src GROUP BY profile_id, k
      ) x GROUP BY profile_id
    ),
    by_os AS (
      SELECT profile_id, jsonb_object_agg(k, c) AS v FROM (
        SELECT profile_id, COALESCE(os, 'Other') AS k, COUNT(*)::int AS c
        FROM src GROUP BY profile_id, k
      ) x GROUP BY profile_id
    ),
    by_device AS (
      SELECT profile_id, jsonb_object_agg(k, c) AS v FROM (
        SELECT profile_id, COALESCE(device_type, 'desktop') AS k, COUNT(*)::int AS c
        FROM src GROUP BY profile_id, k
      ) x GROUP BY profile_id
    ),
    by_referrer AS (
      SELECT profile_id, jsonb_object_agg(k, c) AS v FROM (
        SELECT profile_id, COALESCE(referrer, 'direct') AS k, COUNT(*)::int AS c
        FROM src WHERE referrer IS NOT NULL GROUP BY profile_id, k
      ) x GROUP BY profile_id
    ),
    by_visit_kind AS (
      SELECT profile_id, jsonb_object_agg(k, c) AS v FROM (
        SELECT profile_id, COALESCE(visit_kind, 'direct') AS k, COUNT(*)::int AS c
        FROM src GROUP BY profile_id, k
      ) x GROUP BY profile_id
    )
    INSERT INTO public.page_view_daily
      (profile_id, day, total_views, by_country, by_city, by_browser, by_os, by_device, by_referrer, by_visit_kind, avg_duration_ms)
    SELECT
      t.profile_id,
      ${day}::date,
      t.total_views,
      COALESCE(bc.v,  '{}'),
      COALESCE(bct.v, '{}'),
      COALESCE(bb.v,  '{}'),
      COALESCE(bos.v, '{}'),
      COALESCE(bd.v,  '{}'),
      COALESCE(br.v,  '{}'),
      COALESCE(bvk.v, '{}'),
      t.avg_duration_ms
    FROM totals t
    LEFT JOIN by_country   bc  ON bc.profile_id  = t.profile_id
    LEFT JOIN by_city      bct ON bct.profile_id = t.profile_id
    LEFT JOIN by_browser   bb  ON bb.profile_id  = t.profile_id
    LEFT JOIN by_os        bos ON bos.profile_id = t.profile_id
    LEFT JOIN by_device    bd  ON bd.profile_id  = t.profile_id
    LEFT JOIN by_referrer  br  ON br.profile_id  = t.profile_id
    LEFT JOIN by_visit_kind bvk ON bvk.profile_id = t.profile_id
    ON CONFLICT (profile_id, day) DO NOTHING
  `;

  // ---------------------------------------------------------------------------
  // Aggregate link clicks into link_click_daily
  // ---------------------------------------------------------------------------
  await sql`
    WITH src AS (
      SELECT link_id, profile_id, country
      FROM public.link_click_events
      WHERE occurred_at >= ${day}::date
        AND occurred_at <  ${day}::date + interval '1 day'
    ),
    totals AS (
      SELECT link_id, profile_id, COUNT(*)::int AS total_clicks
      FROM src GROUP BY link_id, profile_id
    ),
    by_country AS (
      SELECT link_id, jsonb_object_agg(k, c) AS v FROM (
        SELECT link_id, COALESCE(country, 'Unknown') AS k, COUNT(*)::int AS c
        FROM src GROUP BY link_id, k
      ) x GROUP BY link_id
    )
    INSERT INTO public.link_click_daily
      (link_id, profile_id, day, total_clicks, by_country)
    SELECT
      t.link_id, t.profile_id, ${day}::date, t.total_clicks,
      COALESCE(bc.v, '{}')
    FROM totals t
    LEFT JOIN by_country bc ON bc.link_id = t.link_id
    ON CONFLICT (link_id, day) DO NOTHING
  `;

  // ---------------------------------------------------------------------------
  // Purge raw events older than 30 days
  // ---------------------------------------------------------------------------
  await sql`DELETE FROM public.page_view_events  WHERE occurred_at < now() - interval '30 days'`;
  await sql`DELETE FROM public.link_click_events WHERE occurred_at < now() - interval '30 days'`;

  console.log(`[cron] analytics aggregated for ${day}`);
}
