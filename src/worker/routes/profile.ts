import type { Hono } from "hono";
import { createDb } from "../db";
import { USERNAME_RE } from "../lib/constants";
import { avatarUrl } from "../lib/utils";

type App = Hono<{ Bindings: Env; Variables: { userId: string } }>;

export function registerProfileRoutes(app: App): void {
  app.get("/api/username/:username/available", async (c) => {
    const ip = c.req.header("CF-Connecting-IP") ?? "unknown";
    const { success } = ip === "unknown" ? { success: true } : await c.env.UNAUTHED_RATE_LIMITER.limit({ key: ip });
    if (!success) return c.json({ error: "Too many requests" }, 429);
    const username = c.req.param("username").toLowerCase();
    if (!USERNAME_RE.test(username)) return c.json({ available: false, reason: "invalid" });
    const RESERVED_USERNAMES = new Set([
      "api", "avatars", "signin", "signup", "create", "settings", "analytics", "admin",
    ]);
    if (RESERVED_USERNAMES.has(username)) return c.json({ available: false, reason: "reserved" });
    const sql = createDb(c.env.DATABASE_URL);
    const [row] = await sql`SELECT 1 FROM public.profiles WHERE username = ${username} LIMIT 1`;
    return c.json({ available: !row });
  });

  app.get("/api/profile/:username", async (c) => {
    const ip = c.req.header("CF-Connecting-IP") ?? "unknown";
    const { success } = ip === "unknown" ? { success: true } : await c.env.UNAUTHED_RATE_LIMITER.limit({ key: ip });
    if (!success) return c.json({ error: "Too many requests" }, 429);
    const username = c.req.param("username").toLowerCase();
    if (!USERNAME_RE.test(username)) return c.json({ error: "Not found" }, 404);

    const cacheKey = new URL(c.req.url).origin + `/api/profile/${username}`;
    const cached = await caches.default.match(cacheKey);
    if (cached) return new Response(cached.body, { status: cached.status, statusText: cached.statusText, headers: new Headers(cached.headers) });

    const sql = createDb(c.env.DATABASE_URL);
    const [profile] = await sql`
      SELECT p.username, p.display_name, p.bio, p.categories, p.verified, p.avatar_asset_id, p.social_links, p.accent_color
      FROM public.profiles p
      WHERE p.username = ${username}
    `;
    if (!profile) return c.json({ error: "Not found" }, 404);

    const links = await sql`
      SELECT id, kind, title, url, icon
      FROM public.links
      WHERE user_id = (SELECT user_id FROM public.profiles WHERE username = ${username})
        AND visible = true
      ORDER BY sort_order ASC
    `;

    const origin = new URL(c.req.url).origin;
    const body = JSON.stringify({
      profile: { ...profile, avatarUrl: avatarUrl(profile.avatar_asset_id as string | null, origin) },
      links,
    });
    const res = new Response(body, {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, s-maxage=86400, max-age=0",
        "CDN-Cache-Control": "no-store",
      },
    });
    await caches.default.put(cacheKey, res.clone());
    return res;
  });

  app.get("/avatars/*", async (c) => {
    const key = c.req.path.slice("/avatars/".length);
    if (!key) return c.json({ error: "Not found" }, 404);
    const obj = await c.env.AVATAR_BUCKET.get(key);
    if (!obj) return c.json({ error: "Not found" }, 404);
    const contentType = obj.httpMetadata?.contentType ?? "application/octet-stream";
    return new Response(obj.body as ReadableStream, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  });

  app.get("/api/directory", async (c) => {
    const ip = c.req.header("CF-Connecting-IP") ?? "unknown";
    const { success } = ip === "unknown" ? { success: true } : await c.env.UNAUTHED_RATE_LIMITER.limit({ key: ip });
    if (!success) return c.json({ error: "Too many requests" }, 429);
    const cacheKey = new URL(c.req.url).origin + "/api/directory";
    const cached = await caches.default.match(cacheKey);
    if (cached) return new Response(cached.body, { status: cached.status, statusText: cached.statusText, headers: new Headers(cached.headers) });

    const sql = createDb(c.env.DATABASE_URL);
    const rows = await sql`
      SELECT username, display_name, bio, categories, avatar_asset_id
      FROM public.profiles
      WHERE verified = true AND hide_from_directory IS NOT TRUE
      ORDER BY display_name
    `;
    const origin = new URL(c.req.url).origin;
    const members = rows.map((p) => ({
      ...p,
      avatarUrl: avatarUrl(p.avatar_asset_id as string | null, origin),
    }));
    const res = new Response(JSON.stringify(members), {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, s-maxage=86400, max-age=300, stale-while-revalidate=3600",
        "CDN-Cache-Control": "no-store",
      },
    });
    await caches.default.put(cacheKey, res.clone());
    return res;
  });

}
