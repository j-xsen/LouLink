import type { Hono } from "hono";
import { requireAuth } from "../auth";
import { createDb } from "../db";
import {
  USERNAME_RE, RESERVED_USERNAMES, MAX_DISPLAY_NAME,
  MAX_AVATAR_BYTES, ALLOWED_IMAGE_TYPES,
} from "../lib/constants";
import {
  mimeToExt, avatarUrl, bustProfileCache, sanitizeUrl, sanitizeItems, readJson,
} from "../lib/utils";

type App = Hono<{ Bindings: Env; Variables: { userId: string } }>;

export function registerMeRoutes(app: App): void {
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
    const body = await readJson<{ username?: unknown; display_name?: unknown; links?: unknown }>(c);
    if (!body || typeof body !== "object") return c.json({ error: "Invalid request body" }, 400);

    const username = typeof body.username === "string" ? body.username.toLowerCase().trim() : "";
    const display_name = typeof body.display_name === "string" ? body.display_name.trim() : "";

    if (!USERNAME_RE.test(username)) return c.json({ error: "Invalid username" }, 400);
    if (RESERVED_USERNAMES.has(username)) return c.json({ error: "Username is reserved" }, 400);
    if (!display_name || display_name.length > MAX_DISPLAY_NAME)
      return c.json({ error: "Display name is required (max 100 characters)" }, 400);

    const items = sanitizeItems(body.links);
    if (items === null) return c.json({ error: "Invalid links" }, 400);

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
        await sql`INSERT INTO public.links (user_id, kind, title, url, sort_order)
                  VALUES (${userId}, 'header', ${item.title}, NULL, ${i})`;
      } else {
        await sql`INSERT INTO public.links (user_id, kind, title, url, icon, sort_order)
                  VALUES (${userId}, 'link', ${item.title}, ${item.url}, ${item.icon ?? null}, ${i})`;
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
    const body = await readJson<{
      accent_color?: unknown; header_color?: unknown; mono_social?: unknown;
      avatar_shape?: unknown; card_color?: unknown; card_text_color?: unknown;
    }>(c);
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
    const username = body && typeof body.username === "string" ? body.username.toLowerCase().trim() : "";
    if (!USERNAME_RE.test(username)) return c.json({ error: "Invalid username" }, 400);
    if (RESERVED_USERNAMES.has(username)) return c.json({ error: "Username is reserved" }, 400);

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
      if ((e as { code?: string }).code === "23505") return c.json({ error: "Username taken" }, 409);
      throw e;
    }
  });

  app.post("/api/me/avatar", requireAuth, async (c) => {
    const userId = c.get("userId");
    const contentType = c.req.header("content-type") ?? "";
    const mimeType = contentType.split(";")[0].trim().toLowerCase();
    if (!ALLOWED_IMAGE_TYPES.has(mimeType))
      return c.json({ error: "Unsupported image type. Use JPEG, PNG, WebP, or GIF." }, 415);

    const body = await c.req.arrayBuffer();
    if (body.byteLength === 0) return c.json({ error: "Empty file" }, 400);
    if (body.byteLength > MAX_AVATAR_BYTES) return c.json({ error: "File exceeds 5 MB limit" }, 413);

    const bytes = new Uint8Array(body, 0, Math.min(12, body.byteLength));
    const validMagic =
      (mimeType === "image/jpeg" && bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) ||
      (mimeType === "image/png"  && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) ||
      (mimeType === "image/gif"  && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) ||
      (mimeType === "image/webp" && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
                                    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) ||
      (mimeType === "image/avif" && bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70 &&
                                    bytes[8] === 0x61 && bytes[9] === 0x76 && bytes[10] === 0x69 && (bytes[11] === 0x66 || bytes[11] === 0x73));
    if (!validMagic) return c.json({ error: "File content does not match declared image type" }, 415);

    const sql = createDb(c.env.DATABASE_URL);
    const [existing] = await sql`SELECT username, avatar_asset_id FROM public.profiles WHERE user_id = ${userId}`;
    if (!existing) return c.json({ error: "Profile not found" }, 404);

    const oldKey: string | null = (existing.avatar_asset_id as string | null) ?? null;
    const ext = mimeToExt(mimeType);
    const newKey = `${userId}/${Date.now()}.${ext}`;
    await c.env.AVATAR_BUCKET.put(newKey, body, { httpMetadata: { contentType: mimeType } });
    await sql`UPDATE public.profiles SET avatar_asset_id = ${newKey}, updated_at = now() WHERE user_id = ${userId}`;
    if (oldKey && oldKey !== newKey) await c.env.AVATAR_BUCKET.delete(oldKey);

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
}
