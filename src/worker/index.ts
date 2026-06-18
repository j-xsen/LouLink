import { Hono } from "hono";
import { secureHeaders } from "hono/secure-headers";
import { requireAuth, optionalAuth, requireAdmin } from "./auth";
import { createDb } from "./db";
import { isBot, parseUserAgent, classifyReferrer, mergeJsonbCounts } from "./analytics";
import { handleScheduled } from "./cron";

const USERNAME_RE = /^[a-z0-9][a-z0-9_-]{1,28}[a-z0-9]$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_DISPLAY_NAME = 100;
const RESERVED_USERNAMES = new Set([
  "api", "avatars", "signin", "signup", "create", "settings", "analytics", "admin",
]);
const MAX_LINKS = 50;
const MAX_LINK_TITLE = 100;
const MAX_LINK_URL = 2048;
const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
const OG_BODY_LIMIT = 512 * 1024; // 512 KB — caps external page reads in /api/og
const OG_IMG_LIMIT = 2 * 1024 * 1024; // 2 MB — caps image proxy responses
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"]);
const UNAVATAR_DAILY_CAP = 40; // hard stop below the 50/day plan limit

function mimeToExt(mime: string): string {
  return ({ "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "image/avif": "avif" } as Record<string, string>)[mime] ?? "bin";
}

function avatarUrl(assetId: string | null, origin: string): string | null {
  if (!assetId) return null;
  return `${origin}/avatars/${assetId}`;
}

async function bustProfileCache(origin: string, username: string): Promise<void> {
  await Promise.allSettled([
    caches.default.delete(`${origin}/api/profile/${username}`),
    caches.default.delete(`${origin}/api/directory`),
  ]);
}

const app = new Hono<{ Bindings: Env; Variables: { userId: string } }>();

app.use("/api/*", secureHeaders());

// Never leak internal error details (DB messages, stack traces) to clients.
app.onError((err, c) => {
  console.error(err);
  return c.json({ error: "Internal server error" }, 500);
});

async function readJson<T>(c: { req: { json: () => Promise<T> } }): Promise<T | null> {
  try {
    return await c.req.json();
  } catch {
    return null;
  }
}

// Only http(s) URLs are accepted — parsing with new URL() blocks javascript:,
// data:, and other schemes that a prefix regex alone can miss.
function sanitizeUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_LINK_URL) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return trimmed;
  } catch {
    return null;
  }
}

type SanitizedItem =
  | { kind: "link"; title: string; url: string; icon?: string }
  | { kind: "header"; title: string };

function sanitizeItems(raw: unknown): SanitizedItem[] | null {
  if (raw == null) return [];
  if (!Array.isArray(raw)) return null;
  if (raw.length > MAX_LINKS) return null;
  const items: SanitizedItem[] = [];
  for (const l of raw) {
    if (typeof l !== "object" || l === null) return null;
    const kind = l.kind === "header" ? "header" : "link";
    const title = typeof l.title === "string" ? l.title.trim() : "";
    if (!title || title.length > MAX_LINK_TITLE) continue;
    if (kind === "header") {
      items.push({ kind: "header", title });
    } else {
      const url = sanitizeUrl(l.url);
      if (!url) continue;
      const icon = typeof l.icon === "string" && l.icon ? l.icon : undefined;
      items.push({ kind: "link", title, url, ...(icon ? { icon } : {}) });
    }
  }
  return items;
}

app.get("/api/", (c) => c.json({ name: "LouLink" }));

app.get("/api/me", requireAuth, async (c) => {
  const userId = c.get("userId");
  const sql = createDb(c.env.DATABASE_URL);
  const [profile] = await sql`
    SELECT username, display_name, bio, categories, verified, hide_from_directory, avatar_asset_id, social_links, accent_color
    FROM public.profiles WHERE user_id = ${userId}
  `;
  if (!profile) return c.json({ profile: null });
  const origin = new URL(c.req.url).origin;
  return c.json({ profile: { ...profile, avatarUrl: avatarUrl(profile.avatar_asset_id as string | null, origin) } });
});

app.post("/api/onboarding", requireAuth, async (c) => {
  const userId = c.get("userId");
  const body = await readJson<{
    username?: unknown;
    display_name?: unknown;
    links?: unknown;
  }>(c);
  if (!body || typeof body !== "object") {
    return c.json({ error: "Invalid request body" }, 400);
  }

  const username =
    typeof body.username === "string" ? body.username.toLowerCase().trim() : "";
  const display_name =
    typeof body.display_name === "string" ? body.display_name.trim() : "";

  if (!USERNAME_RE.test(username)) {
    return c.json({ error: "Invalid username" }, 400);
  }
  if (RESERVED_USERNAMES.has(username)) {
    return c.json({ error: "Username is reserved" }, 400);
  }
  if (!display_name || display_name.length > MAX_DISPLAY_NAME) {
    return c.json({ error: "Display name is required (max 100 characters)" }, 400);
  }
  const items = sanitizeItems(body.links);
  if (items === null) {
    return c.json({ error: "Invalid links" }, 400);
  }

  const sql = createDb(c.env.DATABASE_URL);

  const linkQueries = items.map((item, i) =>
    item.kind === "header"
      ? sql`INSERT INTO public.links (user_id, kind, title, url, sort_order)
            VALUES (${userId}, 'header', ${item.title}, NULL, ${i})`
      : sql`INSERT INTO public.links (user_id, kind, title, url, icon, sort_order)
            VALUES (${userId}, 'link', ${item.title}, ${item.url}, ${item.icon ?? null}, ${i})`
  );

  try {
    const [profileRows] = await sql.transaction([
      sql`INSERT INTO public.profiles (user_id, username, display_name)
          VALUES (${userId}, ${username}, ${display_name})
          RETURNING username, display_name`,
      ...linkQueries,
    ]);
    const profile = profileRows[0] as { username: string; display_name: string };
    return c.json({ profile });
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === "23505") {
      // unique_violation: could be user_id PK (profile exists) or username unique index
      const detail = (e as { detail?: string }).detail ?? "";
      return c.json(
        { error: detail.includes("username") ? "Username taken" : "Profile already exists" },
        409,
      );
    }
    throw e;
  }
});

app.put("/api/me/links", requireAuth, async (c) => {
  const userId = c.get("userId");
  const body = await readJson<{ links?: unknown }>(c);
  const items = sanitizeItems(body?.links);
  if (items === null) return c.json({ error: "Invalid links" }, 400);

  const sql = createDb(c.env.DATABASE_URL);
  await sql`DELETE FROM public.links WHERE user_id = ${userId}`;
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.kind === "header") {
      await sql`
        INSERT INTO public.links (user_id, kind, title, url, sort_order)
        VALUES (${userId}, 'header', ${item.title}, NULL, ${i})
      `;
    } else {
      await sql`
        INSERT INTO public.links (user_id, kind, title, url, icon, sort_order)
        VALUES (${userId}, 'link', ${item.title}, ${item.url}, ${item.icon ?? null}, ${i})
      `;
    }
  }
  const [linkRow] = await sql`SELECT username FROM public.profiles WHERE user_id = ${userId}`;
  if (linkRow) await bustProfileCache(new URL(c.req.url).origin, linkRow.username as string);
  return c.json({ ok: true });
});

app.put("/api/me/categories", requireAuth, async (c) => {
  const userId = c.get("userId");
  const body = await readJson<{ categories?: unknown }>(c);
  const VALID_CATEGORIES = new Set([
    "musician", "composer", "painter", "sculptor", "photographer", "illustrator", "filmmaker", "dancer", "writer",
    "retail", "thrift", "restaurant", "coffee-shop", "bar", "services",
    "journalist", "reporter", "news-outlet", "podcast", "blogger",
    "music-venue", "gallery", "event-space",
    "nonprofit", "organization", "collective",
  ]);
  const raw = body?.categories;
  if (!Array.isArray(raw)) return c.json({ error: "categories must be an array" }, 400);
  const categories = raw.filter((v): v is string => typeof v === "string" && VALID_CATEGORIES.has(v));

  const sql = createDb(c.env.DATABASE_URL);
  const [profile] = await sql`
    UPDATE public.profiles SET categories = ${categories}, updated_at = now()
    WHERE user_id = ${userId}
    RETURNING username, display_name, categories
  `;
  if (!profile) return c.json({ error: "Profile not found" }, 404);
  await bustProfileCache(new URL(c.req.url).origin, profile.username as string);
  return c.json({ profile });
});

app.put("/api/me/bio", requireAuth, async (c) => {
  const userId = c.get("userId");
  const body = await readJson<{ bio?: unknown }>(c);
  const bio = typeof body?.bio === "string" ? body.bio.trim().slice(0, 300) : "";
  const sql = createDb(c.env.DATABASE_URL);
  const [profile] = await sql`
    UPDATE public.profiles SET bio = ${bio || null}, updated_at = now()
    WHERE user_id = ${userId}
    RETURNING username, display_name, bio
  `;
  if (!profile) return c.json({ error: "Profile not found" }, 404);
  await bustProfileCache(new URL(c.req.url).origin, profile.username as string);
  return c.json({ profile });
});

app.put("/api/me/display-name", requireAuth, async (c) => {
  const userId = c.get("userId");
  const body = await readJson<{ display_name?: unknown }>(c);
  const display_name = typeof body?.display_name === "string" ? body.display_name.trim() : "";
  if (!display_name || display_name.length > MAX_DISPLAY_NAME)
    return c.json({ error: `Display name is required (max ${MAX_DISPLAY_NAME} characters)` }, 400);
  const sql = createDb(c.env.DATABASE_URL);
  const [profile] = await sql`
    UPDATE public.profiles SET display_name = ${display_name}, updated_at = now()
    WHERE user_id = ${userId}
    RETURNING username
  `;
  if (!profile) return c.json({ error: "Profile not found" }, 404);
  await bustProfileCache(new URL(c.req.url).origin, profile.username as string);
  return c.json({ ok: true });
});

app.put("/api/me/accent", requireAuth, async (c) => {
  const userId = c.get("userId");
  const body = await readJson<{ accent_color?: unknown; header_color?: unknown; mono_social?: unknown; avatar_shape?: unknown; card_color?: unknown; card_text_color?: unknown }>(c);
  const HEX_RE = /^#[0-9a-fA-F]{6}$/;
  const VALID_THEMES = new Set(["bluegrass", "river", "bourbon", "midnight", "ink", "terminal"]);
  const VALID_SHAPES = new Set(["circle", "1", "5", "6", "7"]);
  const rawTheme = typeof body?.accent_color === "string" ? body.accent_color.trim() : null;
  const rawHeader = typeof body?.header_color === "string" ? body.header_color.trim() : null;
  const rawShape = typeof body?.avatar_shape === "string" ? body.avatar_shape.trim() : "circle";
  const rawCardColor = typeof body?.card_color === "string" ? body.card_color.trim() : null;
  const rawCardTextColor = typeof body?.card_text_color === "string" ? body.card_text_color.trim() : null;
  const monoSocial = body?.mono_social === true;
  const themeKey = rawTheme && (HEX_RE.test(rawTheme) || VALID_THEMES.has(rawTheme)) ? rawTheme : null;
  const headerColor = rawHeader && HEX_RE.test(rawHeader) ? rawHeader : null;
  const avatarShape = VALID_SHAPES.has(rawShape) ? rawShape : "circle";
  const cardColor = rawCardColor && HEX_RE.test(rawCardColor) ? rawCardColor : null;
  const cardTextColor = rawCardTextColor && HEX_RE.test(rawCardTextColor) ? rawCardTextColor : null;
  const monoPart = monoSocial ? "mono" : "";
  const shapePart = avatarShape !== "circle" ? avatarShape : "";
  const stored = !themeKey && !headerColor && !monoPart && !shapePart && !cardColor && !cardTextColor ? null
    : cardColor || cardTextColor ? `${themeKey ?? ""}|${headerColor ?? ""}|${monoPart}|${shapePart}|${cardColor ?? ""}|${cardTextColor ?? ""}`
    : shapePart ? `${themeKey ?? ""}|${headerColor ?? ""}|${monoPart}|${shapePart}`
    : monoPart ? `${themeKey ?? ""}|${headerColor ?? ""}|${monoPart}`
    : headerColor ? `${themeKey ?? ""}|${headerColor}`
    : themeKey;
  const sql = createDb(c.env.DATABASE_URL);
  const [profile] = await sql`
    UPDATE public.profiles SET accent_color = ${stored}, updated_at = now()
    WHERE user_id = ${userId}
    RETURNING username, accent_color
  `;
  if (!profile) return c.json({ error: "Profile not found" }, 404);
  await bustProfileCache(new URL(c.req.url).origin, profile.username as string);
  return c.json({ profile });
});

app.put("/api/me/social-links", requireAuth, async (c) => {
  const userId = c.get("userId");
  const body = await readJson<{ social_links?: unknown }>(c);
  const SOCIAL_PLATFORMS = new Set(["YouTube", "Instagram", "Facebook", "Twitter", "Twitch", "Spotify", "Bandcamp", "SoundCloud"]);
  const raw = body?.social_links;
  const filtered: Record<string, string> = {};
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    for (const [key, val] of Object.entries(raw)) {
      if (SOCIAL_PLATFORMS.has(key) && typeof val === "string") {
        const safe = sanitizeUrl(val);
        if (safe) filtered[key] = safe;
      }
    }
  }
  const sql = createDb(c.env.DATABASE_URL);
  const [profile] = await sql`
    UPDATE public.profiles SET social_links = ${JSON.stringify(filtered)}::jsonb, updated_at = now()
    WHERE user_id = ${userId}
    RETURNING username, display_name, social_links
  `;
  if (!profile) return c.json({ error: "Profile not found" }, 404);
  await bustProfileCache(new URL(c.req.url).origin, profile.username as string);
  return c.json({ profile });
});

app.put("/api/me/username", requireAuth, async (c) => {
  const userId = c.get("userId");
  const body = await readJson<{ username?: unknown }>(c);
  const username =
    body && typeof body.username === "string"
      ? body.username.toLowerCase().trim()
      : "";

  if (!USERNAME_RE.test(username)) {
    return c.json({ error: "Invalid username" }, 400);
  }
  if (RESERVED_USERNAMES.has(username)) {
    return c.json({ error: "Username is reserved" }, 400);
  }

  const sql = createDb(c.env.DATABASE_URL);
  const [oldRow] = await sql`SELECT username FROM public.profiles WHERE user_id = ${userId}`;
  const oldUsername = oldRow?.username as string | undefined;
  try {
    const [profile] = await sql`
      UPDATE public.profiles SET username = ${username}, updated_at = now()
      WHERE user_id = ${userId}
      RETURNING username, display_name
    `;
    if (!profile) return c.json({ error: "Profile not found" }, 404);
    const origin = new URL(c.req.url).origin;
    await Promise.allSettled([
      oldUsername ? caches.default.delete(`${origin}/api/profile/${oldUsername}`) : Promise.resolve(),
      caches.default.delete(`${origin}/api/profile/${username}`),
      caches.default.delete(`${origin}/api/directory`),
    ]);
    return c.json({ profile });
  } catch (e) {
    if ((e as { code?: string }).code === "23505") {
      return c.json({ error: "Username taken" }, 409);
    }
    throw e;
  }
});

app.post("/api/me/avatar", requireAuth, async (c) => {
  const userId = c.get("userId");
  const contentType = c.req.header("content-type") ?? "";
  const mimeType = contentType.split(";")[0].trim().toLowerCase();
  if (!ALLOWED_IMAGE_TYPES.has(mimeType)) {
    return c.json({ error: "Unsupported image type. Use JPEG, PNG, WebP, or GIF." }, 415);
  }
  const body = await c.req.arrayBuffer();
  if (body.byteLength === 0) return c.json({ error: "Empty file" }, 400);
  if (body.byteLength > MAX_AVATAR_BYTES) {
    return c.json({ error: "File exceeds 5 MB limit" }, 413);
  }
  const bytes = new Uint8Array(body, 0, Math.min(12, body.byteLength));
  const validMagic =
    (mimeType === "image/jpeg" && bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) ||
    (mimeType === "image/png"  && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) ||
    (mimeType === "image/gif"  && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) ||
    (mimeType === "image/webp" && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
                                  bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) ||
    // AVIF: ISOBMFF ftyp box with major brand "avif" or "avis"
    (mimeType === "image/avif" && bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70 &&
                                  bytes[8] === 0x61 && bytes[9] === 0x76 && bytes[10] === 0x69 && (bytes[11] === 0x66 || bytes[11] === 0x73));
  if (!validMagic) return c.json({ error: "File content does not match declared image type" }, 415);
  const sql = createDb(c.env.DATABASE_URL);
  const [existing] = await sql`SELECT username, avatar_asset_id FROM public.profiles WHERE user_id = ${userId}`;
  if (!existing) return c.json({ error: "Profile not found" }, 404);
  const oldKey: string | null = (existing.avatar_asset_id as string | null) ?? null;
  const ext = mimeToExt(mimeType);
  const newKey = `avatars/${userId}/${Date.now()}.${ext}`;
  await c.env.AVATAR_BUCKET.put(newKey, body, { httpMetadata: { contentType: mimeType } });
  await sql`UPDATE public.profiles SET avatar_asset_id = ${newKey}, updated_at = now() WHERE user_id = ${userId}`;
  if (oldKey && oldKey !== newKey) {
    await c.env.AVATAR_BUCKET.delete(oldKey);
  }
  const origin = new URL(c.req.url).origin;
  await bustProfileCache(origin, existing.username as string);
  return c.json({ avatarUrl: avatarUrl(newKey, origin) });
});

app.put("/api/me/directory-visibility", requireAuth, async (c) => {
  const userId = c.get("userId");
  const body = await readJson<{ hide?: unknown }>(c);
  const hide = body?.hide === true;
  const sql = createDb(c.env.DATABASE_URL);
  const [profile] = await sql`
    UPDATE public.profiles
    SET hide_from_directory = ${hide}
    WHERE user_id = ${userId} AND verified = true
    RETURNING username, display_name, bio, categories, verified, hide_from_directory, avatar_asset_id, social_links, accent_color
  `;
  if (!profile) return c.json({ error: "Not allowed" }, 403);
  const origin = new URL(c.req.url).origin;
  await bustProfileCache(origin, profile.username as string);
  return c.json({ profile: { ...profile, avatarUrl: avatarUrl(profile.avatar_asset_id as string | null, origin) } });
});

app.get("/api/username/:username/available", async (c) => {
  const ip = c.req.header("CF-Connecting-IP") ?? "unknown";
  const { success } = ip === "unknown" ? { success: true } : await c.env.UNAUTHED_RATE_LIMITER.limit({ key: ip });
  if (!success) return c.json({ error: "Too many requests" }, 429);
  const username = c.req.param("username").toLowerCase();
  if (!USERNAME_RE.test(username)) return c.json({ available: false, reason: "invalid" });
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
  const body = JSON.stringify({ profile: { ...profile, avatarUrl: avatarUrl(profile.avatar_asset_id as string | null, origin) }, links });
  const res = new Response(body, {
    headers: { "Content-Type": "application/json", "Cache-Control": "public, s-maxage=86400, max-age=0", "CDN-Cache-Control": "no-store" },
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

// OG meta — used by the public profile page to show link preview thumbnails.
// Fetches up to the first ~64 KB of the target page and extracts og:image.
// Domains that block server-side OG scraping from data center IPs (serve generic/brand images instead)
const OG_BLOCKED_HOSTS = new Set([
  "www.instagram.com", "instagram.com",
  "www.facebook.com", "facebook.com", "fb.com",
  "www.tiktok.com", "tiktok.com",
  "twitter.com", "x.com",
]);

// Returns an unavatar.io URL for recognized social profile URLs, or null for non-profile paths.
// The API key is NOT included here — it is injected server-side in /api/og-img.
function getSocialAvatarUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "");
    const parts = parsed.pathname.split("/").filter(Boolean);
    if (!parts.length) return null;
    const slug = parts[0].replace(/^@/, "");

    if (host === "instagram.com") {
      if (["p", "reel", "stories", "explore", "tv", "direct"].includes(slug)) return null;
      return `https://unavatar.io/instagram/${encodeURIComponent(slug)}`;
    }
    if (host === "twitter.com" || host === "x.com") {
      if (["i", "home", "search", "explore", "notifications", "messages"].includes(slug)) return null;
      return `https://unavatar.io/twitter/${encodeURIComponent(slug)}`;
    }
    if (host === "tiktok.com") {
      return `https://unavatar.io/tiktok/${encodeURIComponent(slug)}`;
    }
    return null;
  } catch {
    return null;
  }
}

app.get("/api/og", async (c) => {
  const ip = c.req.header("CF-Connecting-IP") ?? "unknown";
  const { success } = ip === "unknown" ? { success: true } : await c.env.OG_RATE_LIMITER.limit({ key: ip });
  if (!success) return c.json({ error: "Too many requests" }, 429);
  const url = sanitizeUrl(c.req.query("url") ?? "");
  if (!url) return c.json({ ogImage: null }, 400);

  // Social media profiles — use unavatar.io (API key injected server-side in /api/og-img)
  const socialAvatar = getSocialAvatarUrl(url);
  if (socialAvatar) {
    // If og-img already cached a 404 for this avatar (unavatar returned its fallback logo),
    // skip it now so the client never renders a doomed <img> and gets no console error.
    const ogImgCacheKey = new URL(c.req.url).origin + `/api/og-img?url=${encodeURIComponent(socialAvatar)}`;
    const ogImgCached = await caches.default.match(ogImgCacheKey);
    if (ogImgCached && !ogImgCached.ok) {
      c.header("Cache-Control", "public, max-age=3600");
      return c.json({ ogImage: null });
    }
    c.header("Cache-Control", "public, max-age=86400");
    return c.json({ ogImage: socialAvatar });
  }

  // Platforms that block data-center scraping entirely
  try {
    const host = new URL(url).hostname;
    if (OG_BLOCKED_HOSTS.has(host)) {
      c.header("Cache-Control", "public, max-age=300");
      return c.json({ ogImage: null });
    }
  } catch { /* invalid URL already caught by sanitizeUrl */ }

  let ogImage: string | null = null;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "LouLink/1.0 (+https://loul.ink)" },
      redirect: "follow",
    });
    clearTimeout(timer);
    if (res.ok) {
      const finalUrl = res.url || url; // after redirects
      // Limit body reads to OG_BODY_LIMIT to prevent large pages from exhausting Worker memory.
      let ogBytes = 0;
      const limiter = new TransformStream<Uint8Array, Uint8Array>({
        transform(chunk, controller) {
          ogBytes += chunk.byteLength;
          if (ogBytes > OG_BODY_LIMIT) { controller.terminate(); }
          else { controller.enqueue(chunk); }
        },
      });
      const limited = new Response(res.body?.pipeThrough(limiter) ?? null, { headers: new Headers(res.headers) });
      // Use an array so closure mutations aren't confused by TS narrowing
      const found: string[] = [];
      await new HTMLRewriter()
        .on("meta", {
          element(el) {
            if (found.length > 0) return;
            const prop = el.getAttribute("property") ?? el.getAttribute("name");
            if (prop === "og:image" || prop === "twitter:image") {
              const content = el.getAttribute("content");
              if (content) found.push(content);
            }
          },
        })
        .transform(limited)
        .arrayBuffer();
      let raw: string | null = found[0] ?? null;
      // Decode HTML entities that appear in attribute values (e.g. &amp; → &)
      if (raw) raw = raw.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"');
      // Resolve relative URLs against the final page origin
      if (raw && !raw.startsWith("http")) {
        try { raw = new URL(raw, finalUrl).href; } catch { raw = null; }
      }
      ogImage = raw;
    }
  } catch {
    /* timeout or network error */
  }

  c.header("Cache-Control", "public, max-age=300");
  return c.json({ ogImage });
});

// Proxy for OG images — fetches the image server-side so hotlink-protected CDNs
// (e.g. Instagram's scontent CDN) are served from our domain instead of the browser
// hitting them directly and receiving 403.
app.get("/api/og-img", async (c) => {
  const ip = c.req.header("CF-Connecting-IP") ?? "unknown";
  const { success } = await c.env.OG_RATE_LIMITER.limit({ key: ip });
  if (!success) return new Response("Too many requests", { status: 429 });
  const url = sanitizeUrl(c.req.query("url") ?? "");
  if (!url) return new Response("Bad request", { status: 400 });

  const cacheKey = new URL(c.req.url).origin + `/api/og-img?url=${encodeURIComponent(url)}`;
  const cached = await caches.default.match(cacheKey);
  if (cached) return new Response(cached.body, { status: cached.status, headers: new Headers(cached.headers) });

  const isUnavatar = new URL(url).hostname === "unavatar.io";
  if (isUnavatar) {
    const dayKey = new Date().toISOString().slice(0, 10);
    const [isMiss, countStr] = await Promise.all([
      c.env.UNAVATAR_CACHE.get(`miss:${url}`),
      c.env.UNAVATAR_CACHE.get(`count:${dayKey}`),
    ]);
    if (isMiss !== null) return new Response("Not found", { status: 404 });
    if (parseInt(countStr ?? "0", 10) >= UNAVATAR_DAILY_CAP) return new Response("Not found", { status: 429 });
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; LouLink/1.0; +https://loul.ink)",
        "Referer": "https://loul.ink/",
        "Origin": "https://loul.ink",
        ...(isUnavatar && c.env.UNAVATAR_API_KEY ? { "x-api-key": c.env.UNAVATAR_API_KEY } : {}),
      },
      redirect: "follow",
    });
    clearTimeout(timer);
    if (!res.ok) return new Response("Not found", { status: 404 });

    const contentType = res.headers.get("content-type") ?? "";
    const mimeBase = contentType.split(";")[0].trim();
    if (!ALLOWED_IMAGE_TYPES.has(mimeBase)) return new Response("Not an image", { status: 415 });
    // Unavatar's fallback logo is a PNG; real social CDN profile pictures are always JPEG.
    if (isUnavatar && mimeBase !== "image/jpeg") {
      const miss = new Response("Not found", { status: 404, headers: { "Cache-Control": "public, max-age=3600" } });
      caches.default.put(cacheKey, miss.clone()).catch(() => {});
      c.executionCtx.waitUntil(c.env.UNAVATAR_CACHE.put(`miss:${url}`, "1", { expirationTtl: 604800 }));
      return miss;
    }

    let imgBytes = 0;
    const limiter = new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, ctrl) {
        imgBytes += chunk.byteLength;
        if (imgBytes > OG_IMG_LIMIT) { ctrl.terminate(); }
        else { ctrl.enqueue(chunk); }
      },
    });
    const imageBuffer = await new Response(res.body?.pipeThrough(limiter) ?? null).arrayBuffer();
    const maxAge = isUnavatar ? 259200 : 3600;
    const imageRes = new Response(imageBuffer, {
      headers: {
        "Content-Type": mimeBase,
        "Cache-Control": `public, max-age=${maxAge}`,
        "X-Content-Type-Options": "nosniff",
      },
    });
    caches.default.put(cacheKey, imageRes.clone()).catch(() => {});
    if (isUnavatar) {
      c.executionCtx.waitUntil((async () => {
        const dayKey = new Date().toISOString().slice(0, 10);
        const prev = await c.env.UNAVATAR_CACHE.get(`count:${dayKey}`);
        const next = parseInt(prev ?? "0", 10) + 1;
        await c.env.UNAVATAR_CACHE.put(`count:${dayKey}`, String(next), { expirationTtl: 172800 });
      })());
    }
    return imageRes;
  } catch {
    return new Response("Failed to fetch image", { status: 502 });
  }
});

// ---------------------------------------------------------------------------
// Admin API — requires ADMIN_KEY secret in Authorization: Bearer header
// ---------------------------------------------------------------------------

const VALID_CATEGORIES = new Set(["music", "visual-art", "food", "retail", "community"]);

app.get("/api/admin/users", requireAdmin, async (c) => {
  const sql = createDb(c.env.DATABASE_URL);
  const rows = await sql`
    SELECT
      user_id AS id,
      username,
      display_name,
      verified,
      categories,
      hide_from_directory,
      created_at
    FROM public.profiles
    ORDER BY created_at DESC
  `;
  return c.json({ users: rows });
});

app.patch("/api/admin/profiles/:username", requireAdmin, async (c) => {
  const username = c.req.param("username").toLowerCase().trim();
  const body = await readJson<{ verified?: unknown; categories?: unknown }>(c);
  if (!body) return c.json({ error: "Invalid request body" }, 400);

  const updates: Record<string, unknown> = {};

  if ("verified" in body) {
    if (typeof body.verified !== "boolean") return c.json({ error: "verified must be a boolean" }, 400);
    updates.verified = body.verified;
  }

  if ("categories" in body) {
    if (!Array.isArray(body.categories)) return c.json({ error: "categories must be an array" }, 400);
    const cats = body.categories as unknown[];
    if (!cats.every((c) => typeof c === "string" && VALID_CATEGORIES.has(c))) {
      return c.json({ error: `Invalid category. Allowed: ${[...VALID_CATEGORIES].join(", ")}` }, 400);
    }
    updates.categories = cats;
  }

  if (Object.keys(updates).length === 0) return c.json({ error: "No fields to update" }, 400);

  const sql = createDb(c.env.DATABASE_URL);

  let profile: Record<string, unknown> | undefined;
  if ("verified" in updates && "categories" in updates) {
    const [row] = await sql`
      UPDATE public.profiles
      SET verified = ${updates.verified as boolean}, categories = ${updates.categories as string[]}, updated_at = now()
      WHERE username = ${username}
      RETURNING username, display_name, verified, categories
    `;
    profile = row as Record<string, unknown> | undefined;
  } else if ("verified" in updates) {
    const [row] = await sql`
      UPDATE public.profiles
      SET verified = ${updates.verified as boolean}, updated_at = now()
      WHERE username = ${username}
      RETURNING username, display_name, verified, categories
    `;
    profile = row as Record<string, unknown> | undefined;
  } else {
    const [row] = await sql`
      UPDATE public.profiles
      SET categories = ${updates.categories as string[]}, updated_at = now()
      WHERE username = ${username}
      RETURNING username, display_name, verified, categories
    `;
    profile = row as Record<string, unknown> | undefined;
  }

  if (!profile) return c.json({ error: "Profile not found" }, 404);
  await bustProfileCache(new URL(c.req.url).origin, username);
  return c.json({ profile });
});

app.delete("/api/admin/profiles/:username", requireAdmin, async (c) => {
  const username = c.req.param("username").toLowerCase().trim();
  const sql = createDb(c.env.DATABASE_URL);
  const [deleted] = await sql`
    DELETE FROM public.profiles WHERE username = ${username} RETURNING username, user_id
  `;
  if (!deleted) return c.json({ error: "Profile not found" }, 404);
  await bustProfileCache(new URL(c.req.url).origin, username);
  return c.json({ deleted: { username: deleted.username, user_id: deleted.user_id } });
});

// ---------------------------------------------------------------------------

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
    headers: { "Content-Type": "application/json", "Cache-Control": "public, s-maxage=86400, max-age=0", "CDN-Cache-Control": "no-store" },
  });
  await caches.default.put(cacheKey, res.clone());
  return res;
});

// ---------------------------------------------------------------------------
// Analytics tracking — POST /api/track/view
// Records a profile page view. Skips bots and self-views (auth optional).
// ---------------------------------------------------------------------------
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

  const [event] = await sql`
    INSERT INTO public.page_view_events
      (profile_id, country, city, browser, os, device_type, referrer, visit_kind)
    VALUES (
      ${profileRow.user_id as string},
      ${(cf?.country as string | undefined) ?? null},
      ${(cf?.city as string | undefined) ?? null},
      ${browser}, ${os}, ${device_type}, ${referrer}, ${visit_kind}
    )
    RETURNING id
  `;
  return c.json({ ok: true, eventId: event.id as string });
});

// ---------------------------------------------------------------------------
// Analytics tracking — POST /api/track/duration
// Updates duration_ms on an existing view event (via navigator.sendBeacon).
// ---------------------------------------------------------------------------
app.post("/api/track/duration", async (c) => {
  const ip = c.req.header("CF-Connecting-IP") ?? "unknown";
  const { success } = await c.env.UNAUTHED_RATE_LIMITER.limit({ key: ip });
  if (!success) return new Response(null, { status: 429 });

  const body = await readJson<{ eventId?: unknown; durationMs?: unknown }>(c);
  const eventId = typeof body?.eventId === "string" ? body.eventId : null;
  const rawMs = typeof body?.durationMs === "number" ? body.durationMs : null;

  if (!eventId || !UUID_RE.test(eventId) || rawMs === null || rawMs < 0) {
    return new Response(null, { status: 204 });
  }
  const durationMs = Math.min(Math.round(rawMs), 14_400_000); // cap at 4 hours

  const sql = createDb(c.env.DATABASE_URL);
  await sql`
    UPDATE public.page_view_events
    SET duration_ms = ${durationMs}
    WHERE id = ${eventId} AND duration_ms IS NULL
  `;
  return new Response(null, { status: 204 });
});

// ---------------------------------------------------------------------------
// Analytics tracking — POST /api/track/click
// Records a link click. Skips bots and self-clicks (auth optional).
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// GET /api/me/analytics — analytics dashboard data for authenticated user
// ?period=7d|30d|90d|all (default 30d)
// ---------------------------------------------------------------------------
app.get("/api/me/analytics", requireAuth, async (c) => {
  const userId = c.get("userId");
  const period = c.req.query("period") ?? "30d";
  const sql = createDb(c.env.DATABASE_URL);

  // For ≤30d: query raw events (still within 30-day retention window)
  // For 90d / all: aggregate from daily rollup tables
  const useRaw = period === "7d" || period === "30d";
  const cutoffDays = period === "7d" ? 7 : period === "30d" ? 30 : period === "90d" ? 90 : null;

  if (useRaw) {
    const cutoff = new Date();
    cutoff.setUTCDate(cutoff.getUTCDate() - (cutoffDays ?? 30));
    const cutoffIso = cutoff.toISOString();

    const [totals] = await sql`
      SELECT COUNT(*)::int AS total_views, ROUND(AVG(duration_ms))::int AS avg_duration_ms
      FROM public.page_view_events
      WHERE profile_id = ${userId} AND occurred_at >= ${cutoffIso}::timestamptz
    `;

    const viewsOverTime = await sql`
      SELECT to_char(occurred_at::date, 'YYYY-MM-DD') AS day, COUNT(*)::int AS views
      FROM public.page_view_events
      WHERE profile_id = ${userId} AND occurred_at >= ${cutoffIso}::timestamptz
      GROUP BY occurred_at::date ORDER BY occurred_at::date ASC
    `;

    const countryRows = await sql`
      SELECT COALESCE(country,'Unknown') AS k, COUNT(*)::int AS v
      FROM public.page_view_events WHERE profile_id = ${userId} AND occurred_at >= ${cutoffIso}::timestamptz
      GROUP BY k ORDER BY v DESC LIMIT 20
    `;
    const cityRows = await sql`
      SELECT COALESCE(city,'Unknown') AS k, COUNT(*)::int AS v
      FROM public.page_view_events WHERE profile_id = ${userId} AND occurred_at >= ${cutoffIso}::timestamptz
      GROUP BY k ORDER BY v DESC LIMIT 20
    `;
    const browserRows = await sql`
      SELECT COALESCE(browser,'Other') AS k, COUNT(*)::int AS v
      FROM public.page_view_events WHERE profile_id = ${userId} AND occurred_at >= ${cutoffIso}::timestamptz
      GROUP BY k ORDER BY v DESC
    `;
    const osRows = await sql`
      SELECT COALESCE(os,'Other') AS k, COUNT(*)::int AS v
      FROM public.page_view_events WHERE profile_id = ${userId} AND occurred_at >= ${cutoffIso}::timestamptz
      GROUP BY k ORDER BY v DESC
    `;
    const deviceRows = await sql`
      SELECT COALESCE(device_type,'desktop') AS k, COUNT(*)::int AS v
      FROM public.page_view_events WHERE profile_id = ${userId} AND occurred_at >= ${cutoffIso}::timestamptz
      GROUP BY k ORDER BY v DESC
    `;
    const visitKindRows = await sql`
      SELECT COALESCE(visit_kind,'direct') AS k, COUNT(*)::int AS v
      FROM public.page_view_events WHERE profile_id = ${userId} AND occurred_at >= ${cutoffIso}::timestamptz
      GROUP BY k ORDER BY v DESC
    `;
    const referrerRows = await sql`
      SELECT referrer AS k, COUNT(*)::int AS v
      FROM public.page_view_events
      WHERE profile_id = ${userId} AND occurred_at >= ${cutoffIso}::timestamptz AND referrer IS NOT NULL
      GROUP BY k ORDER BY v DESC LIMIT 20
    `;

    const toMap = (rows: { k: string; v: number }[]) =>
      Object.fromEntries(rows.map((r) => [r.k as string, r.v as number]));

    const [totalClicks] = await sql`
      SELECT COUNT(*)::int AS total_clicks
      FROM public.link_click_events
      WHERE profile_id = ${userId} AND occurred_at >= ${cutoffIso}::timestamptz
    `;

    const clicksOverTime = await sql`
      SELECT to_char(occurred_at::date, 'YYYY-MM-DD') AS day, COUNT(*)::int AS clicks
      FROM public.link_click_events
      WHERE profile_id = ${userId} AND occurred_at >= ${cutoffIso}::timestamptz
      GROUP BY occurred_at::date ORDER BY occurred_at::date ASC
    `;

    const linkRows = await sql`
      SELECT l.id, l.title, l.url,
        COUNT(e.id)::int AS total_clicks
      FROM public.links l
      LEFT JOIN public.link_click_events e
        ON e.link_id = l.id AND e.occurred_at >= ${cutoffIso}::timestamptz
      WHERE l.user_id = ${userId} AND l.kind = 'link'
      GROUP BY l.id, l.title, l.url, l.sort_order
      ORDER BY l.sort_order ASC
    `;

    return c.json({
      summary: {
        total_views: (totals?.total_views as number) ?? 0,
        total_clicks: (totalClicks?.total_clicks as number) ?? 0,
        avg_duration_ms: (totals?.avg_duration_ms as number | null) ?? null,
        top_country: countryRows[0]?.k ?? null,
        top_visit_kind: visitKindRows[0]?.k ?? null,
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
      links: linkRows.map((r) => ({
        id: r.id as string,
        title: r.title as string,
        url: r.url as string,
        total_clicks: r.total_clicks as number,
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

  const totalViews = (dailyRows as { total_views: number }[]).reduce((s, r) => s + r.total_views, 0);
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

  const topCountry = Object.entries(by_country).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const topVisitKind = Object.entries(by_visit_kind).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  return c.json({
    summary: {
      total_views: totalViews,
      total_clicks: totalClicks,
      avg_duration_ms: avgDur,
      top_country: topCountry,
      top_visit_kind: topVisitKind,
    },
    views_over_time: viewsOverTime,
    clicks_over_time: clicksOverTime.map((r) => ({ day: r.day as string, clicks: r.clicks as number })),
    by_country, by_city, by_browser, by_os, by_device, by_visit_kind, by_referrer,
    links: (myLinks as { id: string; title: string; url: string }[]).map((l) => ({
      id: l.id,
      title: l.title,
      url: l.url,
      total_clicks: clickMap[l.id] ?? 0,
    })),
  });
});

// Unknown /api/* routes — return 404 instead of falling through to ASSETS,
// which would crash secureHeaders() with "Can't modify immutable headers."
app.all("/api/*", (c) => c.json({ error: "Not found" }, 404));

// Server-side meta injection for public profile pages.
// Social sharing bots (Twitter, Discord, Slack) don't execute JS, so OG tags
// must be present in the initial HTML. We intercept /:username GET requests,
// fetch the profile, and use HTMLRewriter to inject meta tags before serving
// index.html. Unknown usernames still get the SPA (React handles the 404 UI).
function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Inlined here because the worker can't import from the React app tsconfig target.
const WORKER_CATEGORY_LABELS: Record<string, string> = {
  musician: "Musician", composer: "Composer", painter: "Painter", sculptor: "Sculptor",
  photographer: "Photographer", illustrator: "Illustrator", filmmaker: "Filmmaker",
  dancer: "Dancer", writer: "Writer / Poet",
  retail: "Retail", thrift: "Thrift", restaurant: "Restaurant",
  "coffee-shop": "Coffee Shop", bar: "Bar / Nightlife", services: "Services",
  journalist: "Journalist", reporter: "Reporter", "news-outlet": "News Outlet",
  podcast: "Podcast", blogger: "Blogger",
  "music-venue": "Music Venue", gallery: "Art Gallery", "event-space": "Event Space",
  nonprofit: "Nonprofit", organization: "Organization", collective: "Collective",
};

const BUSINESS_CATEGORIES = new Set([
  "retail", "thrift", "restaurant", "coffee-shop", "bar", "services",
  "news-outlet", "podcast", "music-venue", "gallery", "event-space",
  "nonprofit", "organization", "collective",
]);

app.get("/:username", async (c) => {
  const username = c.req.param("username").toLowerCase();
  const assetResp = await c.env.ASSETS.fetch(c.req.raw);
  const mutableAsset = () => new Response(assetResp.body, { status: assetResp.status, statusText: assetResp.statusText, headers: new Headers(assetResp.headers) });
  if (!USERNAME_RE.test(username)) return mutableAsset();

  const sql = createDb(c.env.DATABASE_URL);
  const [profile] = await sql`
    SELECT display_name, bio, categories, avatar_asset_id FROM public.profiles WHERE username = ${username}
  `;
  if (!profile) return mutableAsset();

  const displayName = profile.display_name as string;
  const rawCategories = (profile.categories as string[] | null) ?? [];
  const categoryLabels = rawCategories
    .map((c) => WORKER_CATEGORY_LABELS[c])
    .filter((l): l is string => Boolean(l));
  const url = `https://loul.ink/${username}`;

  // User-first title — LouLink branding comes from og:site_name, not the title
  const cats = categoryLabels.slice(0, 2).join(" & ");
  const title = cats
    ? `${displayName} — Louisville ${cats}`
    : `${displayName} — Louisville`;

  // Description: category + city context first, then bio
  let description: string;
  if (categoryLabels.length > 0) {
    const bioText = (profile.bio as string | null)?.trim() ?? "";
    description = bioText
      ? `${cats} in Louisville — ${displayName}. ${bioText}`
      : `${cats} in Louisville — ${displayName}. Find all their links in one place.`;
  } else {
    description = (profile.bio as string | null)?.trim() || `Explore ${displayName}'s links — a Louisville creator on LouLink.`;
  }
  if (description.length > 155) description = description.slice(0, 152) + "…";

  // Use avatar when available; fall back to branded OG image
  const assetId = profile.avatar_asset_id as string | null;
  const ogImage = assetId ? `https://loul.ink/avatars/${assetId}` : "https://loul.ink/og-image.jpg";
  const twitterCard = assetId ? "summary" : "summary_large_image";

  // JSON-LD structured data — Person or LocalBusiness based on categories
  const isBusiness = rawCategories.some((cat) => BUSINESS_CATEGORIES.has(cat));
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": isBusiness ? "LocalBusiness" : "Person",
    "name": displayName,
    "url": url,
    "description": description,
    ...(assetId ? { "image": ogImage } : {}),
    ...(categoryLabels.length > 0 ? { "keywords": categoryLabels.join(", ") } : {}),
    "address": {
      "@type": "PostalAddress",
      "addressLocality": "Louisville",
      "addressRegion": "KY",
      "addressCountry": "US",
    },
    "sameAs": url,
  };

  const injected = [
    `<title>${escHtml(title)}</title>`,
    `<meta name="description" content="${escHtml(description)}">`,
    `<meta property="og:site_name" content="LouLink">`,
    `<meta property="og:title" content="${escHtml(title)}">`,
    `<meta property="og:description" content="${escHtml(description)}">`,
    `<meta property="og:url" content="${escHtml(url)}">`,
    `<meta property="og:type" content="profile">`,
    `<meta property="profile:username" content="${escHtml(username)}">`,
    `<meta property="og:image" content="${escHtml(ogImage)}">`,
    `<meta name="twitter:card" content="${twitterCard}">`,
    `<meta name="twitter:title" content="${escHtml(title)}">`,
    `<meta name="twitter:description" content="${escHtml(description)}">`,
    `<meta name="twitter:image" content="${escHtml(ogImage)}">`,
    `<link rel="canonical" href="${escHtml(url)}">`,
    `<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>`,
  ].join("\n\t\t");

  return new HTMLRewriter()
    .on("title", { element(el) { el.remove(); } })
    .on("head", { element(el) { el.prepend(injected, { html: true }); } })
    .transform(assetResp);
});

// Catch-all: serve static assets (JS, CSS, fonts, etc.) with SPA fallback.
// Wrap in new Response so secureHeaders() can mutate headers if an /api/* path
// somehow falls through to here (immutable ASSETS headers would throw otherwise).
app.get("*", async (c) => {
  const resp = await c.env.ASSETS.fetch(c.req.raw);
  return new Response(resp.body, { status: resp.status, statusText: resp.statusText, headers: new Headers(resp.headers) });
});

export default { fetch: app.fetch, scheduled: handleScheduled };
