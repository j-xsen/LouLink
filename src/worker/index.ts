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
    SELECT username, display_name, bio, categories, verified, avatar_asset_id, social_links, accent_color
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
  const VALID_CATEGORIES = new Set(["music", "visual-art", "food", "retail", "community"]);
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
  const body = await readJson<{ accent_color?: unknown; header_color?: unknown; mono_social?: unknown; avatar_shape?: unknown }>(c);
  const HEX_RE = /^#[0-9a-fA-F]{6}$/;
  const VALID_THEMES = new Set(["bluegrass", "river", "bourbon", "midnight", "ink", "terminal"]);
  const VALID_SHAPES = new Set(["circle", "1", "5", "6", "7"]);
  const rawTheme = typeof body?.accent_color === "string" ? body.accent_color.trim() : null;
  const rawHeader = typeof body?.header_color === "string" ? body.header_color.trim() : null;
  const rawShape = typeof body?.avatar_shape === "string" ? body.avatar_shape.trim() : "circle";
  const monoSocial = body?.mono_social === true;
  const themeKey = rawTheme && (HEX_RE.test(rawTheme) || VALID_THEMES.has(rawTheme)) ? rawTheme : null;
  const headerColor = rawHeader && HEX_RE.test(rawHeader) ? rawHeader : null;
  const avatarShape = VALID_SHAPES.has(rawShape) ? rawShape : "circle";
  const monoPart = monoSocial ? "mono" : "";
  const shapePart = avatarShape !== "circle" ? avatarShape : "";
  const stored = !themeKey && !headerColor && !monoPart && !shapePart ? null
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
        const trimmed = val.trim().slice(0, 500);
        if (trimmed) filtered[key] = trimmed;
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

app.get("/api/username/:username/available", async (c) => {
  const username = c.req.param("username").toLowerCase();
  if (!USERNAME_RE.test(username)) return c.json({ available: false, reason: "invalid" });

  const sql = createDb(c.env.DATABASE_URL);
  const [row] = await sql`SELECT 1 FROM public.profiles WHERE username = ${username} LIMIT 1`;
  return c.json({ available: !row });
});

app.get("/api/profile/:username", async (c) => {
  const username = c.req.param("username").toLowerCase();
  if (!USERNAME_RE.test(username)) return c.json({ error: "Not found" }, 404);

  const cacheKey = new URL(c.req.url).origin + `/api/profile/${username}`;
  const cached = await caches.default.match(cacheKey);
  if (cached) return cached;

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
    },
  });
});

// OG meta — used by the public profile page to show link preview thumbnails.
// Fetches up to the first ~64 KB of the target page and extracts og:image.
app.get("/api/og", async (c) => {
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
        .transform(res)
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
  const cacheKey = new URL(c.req.url).origin + "/api/directory";
  const cached = await caches.default.match(cacheKey);
  if (cached) return cached;

  const sql = createDb(c.env.DATABASE_URL);
  const rows = await sql`
    SELECT username, display_name, bio, categories, avatar_asset_id
    FROM public.profiles
    WHERE verified = true
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

app.get("/:username", async (c) => {
  const username = c.req.param("username").toLowerCase();
  const assetResp = await c.env.ASSETS.fetch(c.req.raw);
  if (!USERNAME_RE.test(username)) return assetResp;

  const sql = createDb(c.env.DATABASE_URL);
  const [profile] = await sql`
    SELECT display_name, bio FROM public.profiles WHERE username = ${username}
  `;
  if (!profile) return assetResp;

  const displayName = profile.display_name as string;
  const rawBio = (profile.bio as string | null) ?? `Explore ${displayName}'s links on LouLink`;
  const bio = rawBio.length > 125 ? rawBio.slice(0, 122) + "…" : rawBio;
  const title = `${displayName} | LouLink`;
  const url = `https://loul.ink/${username}`;

  const injected = [
    `<title>${escHtml(title)}</title>`,
    `<meta name="description" content="${escHtml(bio)}">`,
    `<meta property="og:site_name" content="LouLink">`,
    `<meta property="og:title" content="${escHtml(title)}">`,
    `<meta property="og:description" content="${escHtml(bio)}">`,
    `<meta property="og:url" content="${url}">`,
    `<meta property="og:type" content="profile">`,
    `<meta property="og:image" content="https://loul.ink/og-image.jpg">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${escHtml(title)}">`,
    `<meta name="twitter:description" content="${escHtml(bio)}">`,
    `<meta name="twitter:image" content="https://loul.ink/og-image.jpg">`,
    `<link rel="canonical" href="${url}">`,
  ].join("\n\t\t");

  return new HTMLRewriter()
    .on("title", { element(el) { el.remove(); } })
    .on("head", { element(el) { el.prepend(injected, { html: true }); } })
    .transform(assetResp);
});

// Catch-all: serve static assets (JS, CSS, fonts, etc.) with SPA fallback.
app.get("*", async (c) => c.env.ASSETS.fetch(c.req.raw));

export default app;
