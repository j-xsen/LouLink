import type { Hono } from "hono";
import { requireAuth, optionalAuth } from "../auth";
import { createDb } from "../db";
import { isBot, parseUserAgent, classifyReferrer, mergeJsonbCounts, computeVisitorHash } from "../analytics";
import { UUID_RE, USERNAME_RE } from "../lib/constants";
import { readJson } from "../lib/utils";

type App = Hono<{ Bindings: Env; Variables: { userId: string } }>;

export function registerAnalyticsRoutes(app: App): void {
  app.post("/api/track/view", optionalAuth, async (c) => {
    const ip = c.req.header("CF-Connecting-IP") ?? "unknown";
    const { success } = ip === "unknown" ? { success: true } : await c.env.UNAUTHED_RATE_LIMITER.limit({ key: ip });
    if (!success) return c.json({ error: "Too many requests" }, 429);

    const ua = c.req.header("User-Agent");
    if (isBot(ua)) return c.json({ ok: true, skipped: true });

    const body = await readJson<{ username?: unknown; referrer?: unknown }>(c);
    const username = typeof body?.username === "string" ? body.username.toLowerCase().trim() : "";
    if (!USERNAME_RE.test(username)) return c.json({ error: "Invalid username" }, 400);

    const sql = createDb(c.env.DATABASE_URL);
    const [profileRow] = await sql`SELECT user_id FROM public.profiles WHERE username = ${username}`;
    if (!profileRow) return c.json({ error: "Not found" }, 404);

    const viewerId = c.get("userId");
    if (viewerId && viewerId === profileRow.user_id) return c.json({ ok: true, skipped: true });

    const referrer = typeof body?.referrer === "string" && body.referrer ? body.referrer.slice(0, 2048) : null;
    const cf = c.req.raw.cf as Record<string, unknown> | undefined;
    const { browser, os, device_type } = parseUserAgent(ua ?? "");
    const visit_kind = classifyReferrer(referrer);
    const visitorHash = await computeVisitorHash(ip, ua ?? "");

    const [event] = await sql`
      INSERT INTO public.page_view_events
        (profile_id, country, city, browser, os, device_type, referrer, visit_kind, visitor_hash)
      VALUES (
        ${profileRow.user_id as string},
        ${(cf?.country as string | undefined) ?? null},
        ${(cf?.city as string | undefined) ?? null},
        ${browser}, ${os}, ${device_type}, ${referrer}, ${visit_kind}, ${visitorHash}
      )
      RETURNING id
    `;
    return c.json({ ok: true, eventId: event.id as string });
  });

  app.post("/api/track/duration", async (c) => {
    const ip = c.req.header("CF-Connecting-IP") ?? "unknown";
    const { success } = await c.env.UNAUTHED_RATE_LIMITER.limit({ key: ip });
    if (!success) return new Response(null, { status: 429 });

    const body = await readJson<{ eventId?: unknown; durationMs?: unknown }>(c);
    const eventId = typeof body?.eventId === "string" ? body.eventId : null;
    const rawMs = typeof body?.durationMs === "number" ? body.durationMs : null;
    if (!eventId || !UUID_RE.test(eventId) || rawMs === null || rawMs < 0)
      return new Response(null, { status: 204 });

    const durationMs = Math.min(Math.round(rawMs), 14_400_000);
    const sql = createDb(c.env.DATABASE_URL);
    await sql`
      UPDATE public.page_view_events
      SET duration_ms = ${durationMs}
      WHERE id = ${eventId} AND duration_ms IS NULL
    `;
    return new Response(null, { status: 204 });
  });

  app.post("/api/track/click", optionalAuth, async (c) => {
    const ip = c.req.header("CF-Connecting-IP") ?? "unknown";
    const { success } = ip === "unknown" ? { success: true } : await c.env.UNAUTHED_RATE_LIMITER.limit({ key: ip });
    if (!success) return c.json({ error: "Too many requests" }, 429);

    const ua = c.req.header("User-Agent");
    if (isBot(ua)) return c.json({ ok: true, skipped: true });

    const body = await readJson<{ linkId?: unknown; referrer?: unknown }>(c);
    const linkId = typeof body?.linkId === "string" ? body.linkId.trim() : null;
    if (!linkId || !UUID_RE.test(linkId)) return c.json({ error: "Invalid linkId" }, 400);

    const sql = createDb(c.env.DATABASE_URL);
    const [link] = await sql`SELECT id, user_id, kind FROM public.links WHERE id = ${linkId}`;
    if (!link || link.kind !== "link") return c.json({ error: "Not found" }, 404);

    const viewerId = c.get("userId");
    if (viewerId && viewerId === link.user_id) return c.json({ ok: true, skipped: true });

    const referrer = typeof body?.referrer === "string" && body.referrer ? body.referrer.slice(0, 2048) : null;
    const cf = c.req.raw.cf as Record<string, unknown> | undefined;
    const visit_kind = classifyReferrer(referrer);

    await sql`
      INSERT INTO public.link_click_events (link_id, profile_id, country, referrer, visit_kind)
      VALUES (
        ${linkId},
        ${link.user_id as string},
        ${(cf?.country as string | undefined) ?? null},
        ${referrer}, ${visit_kind}
      )
    `;
    return c.json({ ok: true });
  });

  // Analytics dashboard — GET /api/me/analytics?period=7d|30d|90d|all
  app.get("/api/me/analytics", requireAuth, async (c) => {
    const userId = c.get("userId");
    const period = c.req.query("period") ?? "30d";
    const sql = createDb(c.env.DATABASE_URL);

    const useRaw = period === "7d" || period === "30d";
    const cutoffDays = period === "7d" ? 7 : period === "30d" ? 30 : period === "90d" ? 90 : null;

    if (useRaw) {
      const cutoff = new Date();
      cutoff.setUTCDate(cutoff.getUTCDate() - (cutoffDays ?? 30));
      const cutoffIso = cutoff.toISOString();

      const [totals] = await sql`
        SELECT COUNT(*)::int AS total_views,
               COUNT(DISTINCT visitor_hash)::int AS unique_visitors,
               ROUND(AVG(duration_ms))::int AS avg_duration_ms
        FROM public.page_view_events
        WHERE profile_id = ${userId} AND occurred_at >= ${cutoffIso}::timestamptz
      `;
      const viewsOverTime = await sql`
        SELECT to_char(occurred_at::date, 'YYYY-MM-DD') AS day, COUNT(*)::int AS views
        FROM public.page_view_events
        WHERE profile_id = ${userId} AND occurred_at >= ${cutoffIso}::timestamptz
        GROUP BY occurred_at::date ORDER BY occurred_at::date ASC
      `;
      const countryRows = await sql`SELECT COALESCE(country,'Unknown') AS k, COUNT(*)::int AS v FROM public.page_view_events WHERE profile_id = ${userId} AND occurred_at >= ${cutoffIso}::timestamptz GROUP BY k ORDER BY v DESC LIMIT 20`;
      const cityRows    = await sql`SELECT COALESCE(city,'Unknown') AS k, COUNT(*)::int AS v FROM public.page_view_events WHERE profile_id = ${userId} AND occurred_at >= ${cutoffIso}::timestamptz GROUP BY k ORDER BY v DESC LIMIT 20`;
      const browserRows = await sql`SELECT COALESCE(browser,'Other') AS k, COUNT(*)::int AS v FROM public.page_view_events WHERE profile_id = ${userId} AND occurred_at >= ${cutoffIso}::timestamptz GROUP BY k ORDER BY v DESC`;
      const osRows      = await sql`SELECT COALESCE(os,'Other') AS k, COUNT(*)::int AS v FROM public.page_view_events WHERE profile_id = ${userId} AND occurred_at >= ${cutoffIso}::timestamptz GROUP BY k ORDER BY v DESC`;
      const deviceRows  = await sql`SELECT COALESCE(device_type,'desktop') AS k, COUNT(*)::int AS v FROM public.page_view_events WHERE profile_id = ${userId} AND occurred_at >= ${cutoffIso}::timestamptz GROUP BY k ORDER BY v DESC`;
      const visitKindRows = await sql`SELECT COALESCE(visit_kind,'direct') AS k, COUNT(*)::int AS v FROM public.page_view_events WHERE profile_id = ${userId} AND occurred_at >= ${cutoffIso}::timestamptz GROUP BY k ORDER BY v DESC`;
      const referrerRows  = await sql`SELECT referrer AS k, COUNT(*)::int AS v FROM public.page_view_events WHERE profile_id = ${userId} AND occurred_at >= ${cutoffIso}::timestamptz AND referrer IS NOT NULL GROUP BY k ORDER BY v DESC LIMIT 20`;

      const toMap = (rows: { k: string; v: number }[]) =>
        Object.fromEntries(rows.map((r) => [r.k as string, r.v as number]));

      const [totalClicks] = await sql`SELECT COUNT(*)::int AS total_clicks FROM public.link_click_events WHERE profile_id = ${userId} AND occurred_at >= ${cutoffIso}::timestamptz`;
      const clicksOverTime = await sql`SELECT to_char(occurred_at::date, 'YYYY-MM-DD') AS day, COUNT(*)::int AS clicks FROM public.link_click_events WHERE profile_id = ${userId} AND occurred_at >= ${cutoffIso}::timestamptz GROUP BY occurred_at::date ORDER BY occurred_at::date ASC`;
      const linkRows = await sql`
        SELECT l.id, l.title, l.url, COUNT(e.id)::int AS total_clicks
        FROM public.links l
        LEFT JOIN public.link_click_events e ON e.link_id = l.id AND e.occurred_at >= ${cutoffIso}::timestamptz
        WHERE l.user_id = ${userId} AND l.kind = 'link'
        GROUP BY l.id, l.title, l.url, l.sort_order
        ORDER BY l.sort_order ASC
      `;

      return c.json({
        summary: {
          total_views: (totals?.total_views as number) ?? 0,
          unique_visitors: (totals?.unique_visitors as number) ?? 0,
          total_clicks: (totalClicks?.total_clicks as number) ?? 0,
          avg_duration_ms: (totals?.avg_duration_ms as number | null) ?? null,
          top_country: (countryRows[0] as { k: string } | undefined)?.k ?? null,
          top_visit_kind: (visitKindRows[0] as { k: string } | undefined)?.k ?? null,
        },
        views_over_time: viewsOverTime.map((r) => ({ day: r.day as string, views: r.views as number })),
        clicks_over_time: clicksOverTime.map((r) => ({ day: r.day as string, clicks: r.clicks as number })),
        by_country:    toMap(countryRows as { k: string; v: number }[]),
        by_city:       toMap(cityRows as { k: string; v: number }[]),
        by_browser:    toMap(browserRows as { k: string; v: number }[]),
        by_os:         toMap(osRows as { k: string; v: number }[]),
        by_device:     toMap(deviceRows as { k: string; v: number }[]),
        by_visit_kind: toMap(visitKindRows as { k: string; v: number }[]),
        by_referrer:   toMap(referrerRows as { k: string; v: number }[]),
        links: (linkRows as { id: string; title: string; url: string; total_clicks: number }[]).map((r) => ({
          id: r.id, title: r.title, url: r.url, total_clicks: r.total_clicks,
        })),
      });
    }

    // 90d / all — aggregate from daily rollup tables
    const cutoffIso = cutoffDays
      ? (() => { const d = new Date(); d.setUTCDate(d.getUTCDate() - cutoffDays); return d.toISOString().slice(0, 10); })()
      : null;

    const dailyRows = cutoffIso
      ? await sql`SELECT * FROM public.page_view_daily WHERE profile_id = ${userId} AND day >= ${cutoffIso}::date ORDER BY day ASC`
      : await sql`SELECT * FROM public.page_view_daily WHERE profile_id = ${userId} ORDER BY day ASC`;

    const totalViews     = (dailyRows as { total_views: number }[]).reduce((s, r) => s + r.total_views, 0);
    const uniqueVisitors = (dailyRows as { unique_visitors: number }[]).reduce((s, r) => s + r.unique_visitors, 0);
    const durRows = (dailyRows as { avg_duration_ms: number | null; total_views: number }[]).filter((r) => r.avg_duration_ms != null);
    const avgDur = durRows.length
      ? Math.round(durRows.reduce((s, r) => s + r.avg_duration_ms! * r.total_views, 0) / durRows.reduce((s, r) => s + r.total_views, 0))
      : null;

    const viewsOverTime = (dailyRows as { day: string; total_views: number }[]).map((r) => ({
      day: typeof r.day === "string" ? r.day : (r.day as Date).toISOString().slice(0, 10),
      views: r.total_views,
    }));

    const by_country    = mergeJsonbCounts(dailyRows as Record<string, unknown>[], "by_country");
    const by_city       = mergeJsonbCounts(dailyRows as Record<string, unknown>[], "by_city");
    const by_browser    = mergeJsonbCounts(dailyRows as Record<string, unknown>[], "by_browser");
    const by_os         = mergeJsonbCounts(dailyRows as Record<string, unknown>[], "by_os");
    const by_device     = mergeJsonbCounts(dailyRows as Record<string, unknown>[], "by_device");
    const by_referrer   = mergeJsonbCounts(dailyRows as Record<string, unknown>[], "by_referrer");
    const by_visit_kind = mergeJsonbCounts(dailyRows as Record<string, unknown>[], "by_visit_kind");

    const clickDailyRows = cutoffIso
      ? await sql`SELECT link_id, SUM(total_clicks)::int AS total_clicks FROM public.link_click_daily WHERE profile_id = ${userId} AND day >= ${cutoffIso}::date GROUP BY link_id`
      : await sql`SELECT link_id, SUM(total_clicks)::int AS total_clicks FROM public.link_click_daily WHERE profile_id = ${userId} GROUP BY link_id`;

    const clickMap: Record<string, number> = {};
    for (const r of clickDailyRows as { link_id: string; total_clicks: number }[]) {
      clickMap[r.link_id] = r.total_clicks;
    }
    const totalClicks = Object.values(clickMap).reduce((s, v) => s + v, 0);

    const clicksOverTime = cutoffIso
      ? await sql`SELECT to_char(day, 'YYYY-MM-DD') AS day, SUM(total_clicks)::int AS clicks FROM public.link_click_daily WHERE profile_id = ${userId} AND day >= ${cutoffIso}::date GROUP BY day ORDER BY day ASC`
      : await sql`SELECT to_char(day, 'YYYY-MM-DD') AS day, SUM(total_clicks)::int AS clicks FROM public.link_click_daily WHERE profile_id = ${userId} GROUP BY day ORDER BY day ASC`;

    const myLinks = await sql`
      SELECT id, title, url FROM public.links WHERE user_id = ${userId} AND kind = 'link' ORDER BY sort_order ASC
    `;

    const topCountry   = Object.entries(by_country).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    const topVisitKind = Object.entries(by_visit_kind).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

    return c.json({
      summary: { total_views: totalViews, unique_visitors: uniqueVisitors, total_clicks: totalClicks, avg_duration_ms: avgDur, top_country: topCountry, top_visit_kind: topVisitKind },
      views_over_time: viewsOverTime,
      clicks_over_time: clicksOverTime.map((r) => ({ day: r.day as string, clicks: r.clicks as number })),
      by_country, by_city, by_browser, by_os, by_device, by_visit_kind, by_referrer,
      links: (myLinks as { id: string; title: string; url: string }[]).map((l) => ({
        id: l.id, title: l.title, url: l.url, total_clicks: clickMap[l.id] ?? 0,
      })),
    });
  });
}
