import { Hono } from "hono";
import { secureHeaders } from "hono/secure-headers";
import { requireAuth } from "./auth";
import { createDb } from "./db";

const USERNAME_RE = /^[a-z0-9][a-z0-9_-]{1,28}[a-z0-9]$/;
const MAX_DISPLAY_NAME = 100;
const MAX_LINKS = 50;
const MAX_LINK_TITLE = 100;
const MAX_LINK_URL = 2048;
const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
const OG_BODY_LIMIT = 512 * 1024; // 512 KB — caps external page reads in /api/og
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

function mimeToExt(mime: string): string {
  return ({ "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" } as Record<string, string>)[mime] ?? "bin";
}

function avatarUrl(assetId: string | null): string | null {
  if (!assetId) return null;
  return `https://loul.ink/avatars/${assetId}`;
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
  return c.json({ profile: { ...profile, avatarUrl: avatarUrl(profile.avatar_asset_id as string | null) } });
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
  if (!display_name || display_name.length > MAX_DISPLAY_NAME) {
    return c.json({ error: "Display name is required (max 100 characters)" }, 400);
  }
  const items = sanitizeItems(body.links);
  if (items === null) {
    return c.json({ error: "Invalid links" }, 400);
  }

  const sql = createDb(c.env.DATABASE_URL);
  const [existing] = await sql`SELECT user_id FROM public.profiles WHERE user_id = ${userId}`;
  if (existing) return c.json({ error: "Profile already exists" }, 409);

  try {
    const [profile] = await sql`
      INSERT INTO public.profiles (user_id, username, display_name)
      VALUES (${userId}, ${username}, ${display_name})
      RETURNING username, display_name
    `;

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

    return c.json({ profile });
  } catch (e) {
    if ((e as { code?: string }).code === "23505") {
      return c.json({ error: "Username taken" }, 409);
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
                                  bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50);
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
  await bustProfileCache(new URL(c.req.url).origin, existing.username as string);
  return c.json({ avatarUrl: avatarUrl(newKey) });
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
  return c.json({ profile: { ...profile, avatarUrl: avatarUrl(profile.avatar_asset_id as string | null) } });
});

app.get("/api/username/:username/available", async (c) => {
  const ip = c.req.header("CF-Connecting-IP") ?? "unknown";
  const { success } = await c.env.UNAUTHED_RATE_LIMITER.limit({ key: ip });
  if (!success) return c.json({ error: "Too many requests" }, 429);
  const username = c.req.param("username").toLowerCase();
  if (!USERNAME_RE.test(username)) return c.json({ available: false, reason: "invalid" });

  const sql = createDb(c.env.DATABASE_URL);
  const [row] = await sql`SELECT 1 FROM public.profiles WHERE username = ${username} LIMIT 1`;
  return c.json({ available: !row });
});

app.get("/api/profile/:username", async (c) => {
  const ip = c.req.header("CF-Connecting-IP") ?? "unknown";
  const { success } = await c.env.UNAUTHED_RATE_LIMITER.limit({ key: ip });
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
    SELECT kind, title, url, icon
    FROM public.links
    WHERE user_id = (SELECT user_id FROM public.profiles WHERE username = ${username})
      AND visible = true
    ORDER BY sort_order ASC
  `;

  const body = JSON.stringify({ profile: { ...profile, avatarUrl: avatarUrl(profile.avatar_asset_id as string | null) }, links });
  const res = new Response(body, {
    headers: { "Content-Type": "application/json", "Cache-Control": "public, s-maxage=86400, max-age=0" },
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
      "Cache-Control": "public, max-age=300, s-maxage=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
});

// OG meta — used by the public profile page to show link preview thumbnails.
// Fetches up to the first ~64 KB of the target page and extracts og:image.
app.get("/api/og", async (c) => {
  const ip = c.req.header("CF-Connecting-IP") ?? "unknown";
  const { success } = await c.env.OG_RATE_LIMITER.limit({ key: ip });
  if (!success) return c.json({ error: "Too many requests" }, 429);
  const url = sanitizeUrl(c.req.query("url") ?? "");
  if (!url) return c.json({ ogImage: null }, 400);

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
      // Resolve relative URLs against the final page origin
      if (raw && !raw.startsWith("http")) {
        try { raw = new URL(raw, finalUrl).href; } catch { raw = null; }
      }
      ogImage = raw;
    }
  } catch {
    /* timeout or network error */
  }

  c.header("Cache-Control", "public, max-age=3600");
  return c.json({ ogImage });
});

app.get("/api/directory", async (c) => {
  const ip = c.req.header("CF-Connecting-IP") ?? "unknown";
  const { success } = await c.env.UNAUTHED_RATE_LIMITER.limit({ key: ip });
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
  const members = rows.map((p) => ({
    ...p,
    avatarUrl: avatarUrl(p.avatar_asset_id as string | null),
  }));
  const res = new Response(JSON.stringify(members), {
    headers: { "Content-Type": "application/json", "Cache-Control": "public, s-maxage=86400, max-age=0" },
  });
  await caches.default.put(cacheKey, res.clone());
  return res;
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

app.get("/:username", async (c) => {
  const username = c.req.param("username").toLowerCase();
  const assetResp = await c.env.ASSETS.fetch(c.req.raw);
  const mutableAsset = () => new Response(assetResp.body, { status: assetResp.status, statusText: assetResp.statusText, headers: new Headers(assetResp.headers) });
  if (!USERNAME_RE.test(username)) return mutableAsset();

  const sql = createDb(c.env.DATABASE_URL);
  const [profile] = await sql`
    SELECT display_name, bio, categories FROM public.profiles WHERE username = ${username}
  `;
  if (!profile) return mutableAsset();

  const displayName = profile.display_name as string;
  const rawCategories = (profile.categories as string[] | null) ?? [];
  const categoryLabels = rawCategories
    .map((c) => WORKER_CATEGORY_LABELS[c])
    .filter((l): l is string => Boolean(l));
  const title = `${displayName} | LouLink`;
  const url = `https://loul.ink/${username}`;

  // Build category-first description for SEO: "Musician & Photographer in Louisville — Name. Bio…"
  let description: string;
  if (categoryLabels.length > 0) {
    const cats = categoryLabels.slice(0, 2).join(" & ");
    const bioText = (profile.bio as string | null)?.trim() ?? "";
    description = bioText
      ? `${cats} in Louisville — ${displayName}. ${bioText}`
      : `${cats} in Louisville — ${displayName}. Discover their links on LouLink.`;
  } else {
    description = (profile.bio as string | null)?.trim() || `Explore ${displayName}'s links on LouLink`;
  }
  if (description.length > 155) description = description.slice(0, 152) + "…";

  const injected = [
    `<title>${escHtml(title)}</title>`,
    `<meta name="description" content="${escHtml(description)}">`,
    `<meta property="og:site_name" content="LouLink">`,
    `<meta property="og:title" content="${escHtml(title)}">`,
    `<meta property="og:description" content="${escHtml(description)}">`,
    `<meta property="og:url" content="${escHtml(url)}">`,
    `<meta property="og:type" content="profile">`,
    `<meta property="og:image" content="https://loul.ink/og-image.jpg">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${escHtml(title)}">`,
    `<meta name="twitter:description" content="${escHtml(description)}">`,
    `<meta name="twitter:image" content="https://loul.ink/og-image.jpg">`,
    `<link rel="canonical" href="${escHtml(url)}">`,
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

export default app;
